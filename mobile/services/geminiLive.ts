import { AudioModule, setAudioModeAsync, createAudioPlayer, type AudioPlayer } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import LiveAudioStream from 'react-native-live-audio-stream';
import { type UserRole } from '@/constants/roles';
import { supabase } from './auth.service';

// The phone talks ONLY to our Supabase Edge Function proxy (functions/v1/live),
// which holds the Gemini key and relays to Google's BidiGenerateContent API.
const BASE = process.env.EXPO_PUBLIC_GEMINI_LIVE_URL ?? '';
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

// Live API model with native-audio dialog (same as the proven reference setup).
const LIVE_MODEL = 'models/gemini-2.5-flash-native-audio-latest';

async function requestLiveTicket(): Promise<string> {
  let { data } = await supabase.auth.getSession();
  if (!data.session?.access_token) {
    ({ data } = await supabase.auth.refreshSession());
  }
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error('You must be signed in to use Live.');

  const ticketUrl = BASE.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
  const response = await fetch(ticketUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: ANON,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  if (!response.ok) throw new Error('Live authorization failed. Please sign in again.');
  const result = await response.json();
  if (!result?.ticket) throw new Error('Live authorization did not return a ticket.');
  return result.ticket as string;
}

export type LiveStatus =
  | 'connecting'
  | 'connected'
  | 'listening'
  | 'speaking'
  | 'reconnecting'
  | 'rate_limited'
  | 'error'
  | 'closed';

export interface LiveCallbacks {
  onStatus?: (s: LiveStatus) => void;
  onTranscript?: (role: 'user' | 'assistant', text: string) => void;
  onLevel?: (level: number) => void; // 0..1 input level for waveform
  onError?: (detail: string) => void; // human-readable failure reason
}

/** Live diagnostic counters surfaced on-screen so we can see what's happening. */
export interface LiveDebug {
  status: LiveStatus;
  socketOpen: boolean;
  setupDone: boolean;
  micActive: boolean;
  micChunksSent: number;
  framesSent: number;
  audioPartsReceived: number;
  lastError: string;
  turnsCompleted: number;
  micGated: boolean;
  secsSinceServer: number; // -1 if no server frame yet
  secsSinceMic: number;    // -1 if no mic chunk yet
  lastServerMsg: string;
  closeInfo: string;
}

export interface LiveSessionOptions {
  userId: string | null;
  role?: UserRole | null;
  /** Specific audience (business_owner, journalist, civil_servant, …). */
  subRole?: string | null;
  roleLabel?: string | null;
  /** Recent chat turns so voice continues the same conversation. */
  history?: { role: 'user' | 'assistant'; content: string }[];
}

/** Role-aware spoken-assistant instruction for the Nigerian legal context. */
function buildLiveSystemInstruction(opts: LiveSessionOptions): string {
  const role = opts.role ?? 'general_user';

  let audience: string;
  let tone: string;
  if (role === 'lawyer') {
    audience = 'a practising Nigerian lawyer';
    tone =
      'Speak peer-to-peer with legal precision. Reference the relevant Nigerian statutes, ' +
      'case law and procedure where useful. Assume legal competence.';
  } else if (role === 'law_student') {
    audience = 'a Nigerian law student';
    tone =
      'Use a clear, encouraging teaching tone. Explain legal concepts from first principles, ' +
      'give Nigerian examples, and check understanding.';
  } else {
    const subMap: Record<string, string> = {
      individual: 'an individual with personal legal questions',
      business_owner: 'a Nigerian business owner dealing with contracts, CAC, tax and compliance',
      real_estate: 'a Nigerian real estate agent dealing with property law, tenancy and land documentation',
      journalist: 'a Nigerian journalist concerned with press freedom, FOI and defamation',
      civil_servant: 'a Nigerian civil servant navigating public service rules and workplace rights',
      student: 'a young Nigerian student',
    };
    audience = subMap[opts.subRole ?? ''] ?? 'a member of the public seeking legal guidance in Nigeria';
    tone =
      'Be clear, plain-spoken and practical. Avoid heavy jargon; explain legal terms simply ' +
      'and always note when a qualified lawyer should be consulted.';
  }

  let history = '';
  const turns = (opts.history ?? []).slice(-8);
  if (turns.length) {
    history =
      ' Conversation so far (continue it — the user switches between typing and voice): ' +
      turns.map((t) => `${t.role === 'user' ? 'User' : 'You'}: ${t.content.slice(0, 300)}`).join(' | ');
  }

  return (
    `You are LegalBridge AI, a voice assistant for ${audience}. ${tone} ` +
    'The user speaks and understands ENGLISH (Nigerian English). Always interpret ' +
    'their speech as English and ALWAYS reply in clear English — never in Arabic, ' +
    'Hausa, or any other language, even if a word sounds ambiguous. ' +
    'Keep spoken answers short and natural — a few sentences unless asked for depth. ' +
    'If you see an image (a document, contract, form or notice), read and explain it for them. ' +
    'Never mention Google, Gemini, Claude, Anthropic or any underlying AI technology.' +
    history
  );
}

const MIC_OPTIONS = {
  sampleRate: 16000,
  channels: 1,
  bitsPerSample: 16,
  audioSource: 6, // VOICE_RECOGNITION (Android) — hardware echo cancellation
  bufferSize: 4096,
};

function log(...args: any[]) {
  console.log('[live]', ...args);
}

/**
 * One realtime Gemini Live session via the Supabase proxy.
 *  - streams mic PCM16 @16k to Gemini
 *  - optionally streams camera frames (image/jpeg)
 *  - plays Gemini's PCM audio replies and reports transcripts
 */
export class LiveSession {
  private ws: WebSocket | null = null;
  private cb: LiveCallbacks;
  private userId: string | null;
  private micActive = false;
  private pcmChunks: string[] = []; // base64 PCM16 @24k from Gemini (current turn)
  private player: AudioPlayer | null = null;
  private closed = false;
  private setupDone = false;
  private chunksSent = 0;
  private micMuted = false;
  // Half-duplex: suppress the mic while AI audio is playing so Gemini doesn't
  // hear its own voice (echo -> self-interruptions).
  private playingBack = false;
  // Belt-and-suspenders: expo-audio's didJustFinish callback is unreliable on
  // SDK 56, so a duration-based timer always re-opens the mic after playback.
  private playbackTimer: ReturnType<typeof setTimeout> | null = null;
  private opts: LiveSessionOptions;
  // Diagnostics surfaced on-screen.
  private framesSent = 0;
  private audioPartsReceived = 0;
  private lastError = '';
  private status: LiveStatus = 'connecting';
  private turnsCompleted = 0;
  private lastServerAt = 0;       // ms timestamp of last frame from Gemini
  private lastMicChunkAt = 0;     // ms timestamp of last mic chunk we sent
  private lastServerMsg = '';     // type of the last server message
  private closeInfo = '';         // socket close code/reason when it ends
  private watchdog: ReturnType<typeof setInterval> | null = null;
  // Auto-reconnect + Gemini session resumption: the Supabase proxy is recycled
  // after ~1-2 min (wall-clock limit), dropping the socket with code 1006. We
  // transparently reconnect and resume the same Gemini session so the
  // conversation continues without the user noticing.
  private resumeHandle: string | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(userIdOrOpts: string | null | LiveSessionOptions, cb: LiveCallbacks) {
    if (userIdOrOpts && typeof userIdOrOpts === 'object') {
      this.opts = userIdOrOpts;
      this.userId = userIdOrOpts.userId;
    } else {
      this.opts = { userId: userIdOrOpts };
      this.userId = userIdOrOpts;
    }
    // Wrap callbacks so we can mirror status/errors into diagnostics.
    const userStatus = cb.onStatus;
    const userError = cb.onError;
    this.cb = {
      ...cb,
      onStatus: (s) => { this.status = s; userStatus?.(s); },
      onError: (d) => { this.lastError = d; userError?.(d); },
    };
  }

  /** Snapshot of live counters for the on-screen diagnostic readout. */
  getDebug(): LiveDebug {
    const now = Date.now();
    return {
      status: this.status,
      socketOpen: this.ws?.readyState === WebSocket.OPEN,
      setupDone: this.setupDone,
      micActive: this.micActive,
      micChunksSent: this.chunksSent,
      framesSent: this.framesSent,
      audioPartsReceived: this.audioPartsReceived,
      lastError: this.lastError,
      turnsCompleted: this.turnsCompleted,
      micGated: this.playingBack || this.micMuted,
      secsSinceServer: this.lastServerAt ? Math.round((now - this.lastServerAt) / 1000) : -1,
      secsSinceMic: this.lastMicChunkAt ? Math.round((now - this.lastMicChunkAt) / 1000) : -1,
      lastServerMsg: this.lastServerMsg,
      closeInfo: this.closeInfo,
    };
  }

  get isConfigured() {
    return !!BASE;
  }

  async connect() {
    if (!this.isConfigured) {
      log('NOT CONFIGURED — EXPO_PUBLIC_GEMINI_LIVE_URL missing');
      this.cb.onStatus?.('error');
      throw new Error('Live URL not configured');
    }

    // Microphone permission is critical.
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      log('mic permission granted =', perm.granted);
      if (!perm.granted) {
        this.cb.onError?.('Microphone permission denied. Enable it in Settings to use voice.');
        this.cb.onStatus?.('error');
        throw new Error('Microphone permission denied');
      }
    } catch (e) {
      this.cb.onError?.(`Mic permission error: ${(e as Error)?.message ?? e}`);
      this.cb.onStatus?.('error');
      throw e;
    }

    // Audio mode is non-critical — never let it block the session.
    try {
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        shouldPlayInBackground: false,
        shouldRouteThroughEarpiece: false, // loudspeaker — with audioSource=6 avoids echo
      });
    } catch (e) {
      log('setAudioMode failed (non-fatal):', (e as Error)?.message);
    }

    await this.openSocket();
  }

  private setupTimer: ReturnType<typeof setTimeout> | null = null;

  private sendSetup() {
    log('sending setup with model', LIVE_MODEL);
    this.send({
      setup: {
        model: LIVE_MODEL,
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { languageCode: 'en-US' },
        },
        systemInstruction: { parts: [{ text: buildLiveSystemInstruction(this.opts) }] },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        // Ask Gemini for resumption handles, and resume the prior session when
        // we're reconnecting after a dropped proxy connection.
        sessionResumption: this.resumeHandle ? { handle: this.resumeHandle } : {},
      },
    });
    this.clearSetupTimer();
    this.setupTimer = setTimeout(() => {
      if (this.setupDone || this.closed) return;
      log('watchdog: no setupComplete after 5s — reconnecting');
      try { this.ws?.close(); } catch {}
    }, 5000);
  }

  private clearSetupTimer() {
    if (this.setupTimer) { clearTimeout(this.setupTimer); this.setupTimer = null; }
  }

  private async openSocket() {
    this.cb.onStatus?.('connecting');
    const ticket = await requestLiveTicket();
    if (this.closed) return;
    const separator = BASE.includes('?') ? '&' : '?';
    const url = `${BASE}${separator}ticket=${encodeURIComponent(ticket)}`;
    log('connecting to proxy');
    const ws = new WebSocket(url);
    (ws as any).binaryType = 'arraybuffer';
    this.ws = ws;

    ws.onopen = () => {
      log('connected');
      this.cb.onStatus?.('connected');
      setTimeout(() => this.sendSetup(), 50);
    };
    ws.onmessage = (ev) => this.onMessage(ev.data);
    ws.onerror = (e: any) => log('proxy WS error:', e?.message ?? 'unknown');
    ws.onclose = (e: any) => {
      const code = e?.code ?? '?';
      const reason = e?.reason ?? '';
      log('proxy WS closed', code, reason);
      this.closeInfo = `code ${code}${reason ? ': ' + reason : ''}`;
      this.clearSetupTimer();
      if (this.closed) return;

      // The proxy gets recycled (~1-2 min) and drops the socket — usually 1006.
      // As long as we'd reached setup at least once and still have attempts left,
      // reconnect transparently and resume the Gemini session.
      const everConnected = this.setupDone || !!this.resumeHandle;
      if (everConnected && this.reconnectAttempts < 6) {
        this.reconnectAttempts += 1;
        this.setupDone = false; // gate mic sends until the new session is ready
        this.cb.onStatus?.('reconnecting');
        const delay = Math.min(2000, 300 * this.reconnectAttempts);
        log(`reconnecting (attempt ${this.reconnectAttempts}) in ${delay}ms, resume=${!!this.resumeHandle}`);
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => {
          if (!this.closed) {
            this.openSocket().catch((error) => {
              this.cb.onError?.((error as Error)?.message ?? 'Live authorization failed.');
              this.cb.onStatus?.('error');
            });
          }
        }, delay);
        return;
      }

      // First-connection failure, or we've exhausted reconnects — surface it.
      this.stopWatchdog();
      this.cb.onError?.(
        everConnected
          ? `Voice session kept dropping (${this.closeInfo}). Tap the pill to try again.`
          : `Could not reach the voice service (${this.closeInfo}).`,
      );
      this.cb.onStatus?.('error');
    };
  }

  private send(obj: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  private async onMessage(raw: any) {
    let text = raw;
    if (typeof raw !== 'string') {
      try {
        if (raw instanceof ArrayBuffer) text = utf8Decode(new Uint8Array(raw));
        else if (raw?.text) text = await (raw as Blob).text();
        else return;
      } catch { return; }
    }
    let msg: any;
    try { msg = JSON.parse(text); } catch { return; }

    this.lastServerAt = Date.now();

    if (msg.type === 'proxy_status') {
      log('proxy_status:', msg.status);
      if (msg.status === 'connected') this.cb.onStatus?.('connected');
      else if (msg.status === 'reconnecting') this.cb.onStatus?.('reconnecting');
      else if (msg.status === 'rate_limited') this.cb.onStatus?.('rate_limited');
      else if (msg.status === 'error') this.cb.onStatus?.('error');
      return;
    }

    if (msg.setupComplete) {
      const resumed = this.reconnectAttempts > 0;
      log(resumed ? 'setupComplete — session resumed' : 'setupComplete — starting mic');
      this.lastServerMsg = 'setupComplete';
      this.clearSetupTimer();
      this.setupDone = true;
      this.reconnectAttempts = 0; // healthy again
      this.cb.onStatus?.('listening');
      this.startMic();
      this.startWatchdog();
      return;
    }

    // Gemini hands out resumption tokens; keep the latest so a reconnect can
    // resume this exact session instead of starting cold.
    const sru = msg.sessionResumptionUpdate;
    if (sru) {
      this.lastServerMsg = 'sessionResumptionUpdate';
      if (sru.resumable && sru.newHandle) this.resumeHandle = sru.newHandle;
      return;
    }

    const sc = msg.serverContent;
    if (!sc) {
      if (msg.goAway) { this.lastServerMsg = 'goAway'; log('goAway received', JSON.stringify(msg.goAway)); }
      return;
    }
    this.lastServerMsg = 'serverContent';

    if (sc.interrupted) {
      this.pcmChunks = [];
      this.stopPlayback();
      this.cb.onStatus?.('listening');
    }

    const inT = sc.inputTranscription?.text;
    if (inT) this.cb.onTranscript?.('user', inT);
    const outT = sc.outputTranscription?.text;
    if (outT) this.cb.onTranscript?.('assistant', outT);

    const parts = sc.modelTurn?.parts ?? [];
    for (const p of parts) {
      const inline = p.inlineData || p.inline_data;
      if (inline?.data && String(inline.mimeType || inline.mime_type).startsWith('audio/')) {
        this.pcmChunks.push(inline.data);
        this.audioPartsReceived++;
        this.cb.onStatus?.('speaking');
      }
    }

    if (sc.turnComplete || sc.generationComplete) {
      this.turnsCompleted++;
      this.lastServerMsg = 'turnComplete';
      await this.flushPlayback();
      this.cb.onStatus?.('listening');
    }
  }

  // ── Microphone streaming ──
  private micListenerBound = false;

  private startMic() {
    if (this.micActive) return;
    if (!LiveAudioStream || typeof LiveAudioStream.init !== 'function') {
      log('ERROR: LiveAudioStream native module unavailable');
      this.cb.onError?.('Microphone streaming module unavailable on this build.');
      this.cb.onStatus?.('error');
      return;
    }
    try {
      LiveAudioStream.init(MIC_OPTIONS as any);
      // Bind the data handler ONCE — re-binding on every resume would stack
      // duplicate listeners and send each chunk multiple times.
      if (!this.micListenerBound) {
        LiveAudioStream.on('data', (chunk: string) => {
          // We always receive data while recording; only forward when the
          // session is ready, the user isn't muted, and the AI isn't speaking.
          this.lastMicChunkAt = Date.now();
          if (!this.setupDone || this.micMuted || this.playingBack) return;
          this.chunksSent++;
          this.send({
            realtimeInput: { mediaChunks: [{ mimeType: 'audio/pcm;rate=16000', data: chunk }] },
          });
          this.cb.onLevel?.(Math.min(1, chunk.length / 6000));
        });
        this.micListenerBound = true;
      }
      LiveAudioStream.start();
      this.micActive = true;
      this.lastMicChunkAt = Date.now();
      log('mic started');
      this.cb.onStatus?.('listening');
    } catch (e) {
      log('startMic failed:', (e as Error)?.message);
      this.cb.onStatus?.('error');
    }
  }

  /**
   * Bounce the native recorder. expo-audio playback can steal the Android audio
   * session and silently stop LiveAudioStream from emitting data; restarting it
   * (and re-asserting recording mode) revives the mic so the next user turn is
   * actually heard.
   */
  private resumeMic() {
    try { LiveAudioStream.stop(); } catch {}
    setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      shouldRouteThroughEarpiece: false,
    }).catch(() => {});
    try { LiveAudioStream.start(); } catch (e) { log('resumeMic failed:', (e as Error)?.message); }
    this.micActive = true;
    this.lastMicChunkAt = Date.now();
  }

  // Watchdog: every 2s, if we should be hearing the user but no mic data has
  // arrived for >3s, the recorder has stalled — revive it.
  private startWatchdog() {
    this.stopWatchdog();
    this.watchdog = setInterval(() => {
      if (this.closed || !this.setupDone) return;
      if (this.micMuted || this.playingBack) return;
      const since = Date.now() - (this.lastMicChunkAt || 0);
      if (this.lastMicChunkAt && since > 3000) {
        log('watchdog: no mic data for', since, 'ms — reviving recorder');
        this.resumeMic();
      }
    }, 2000);
  }

  private stopWatchdog() {
    if (this.watchdog) { clearInterval(this.watchdog); this.watchdog = null; }
  }

  private stopMic() {
    if (!this.micActive) return;
    try { LiveAudioStream.stop(); } catch {}
    this.micActive = false;
  }

  /** Send a single camera frame (base64 JPEG) as realtime video input. */
  sendImageFrame(base64Jpeg: string) {
    if (!this.setupDone) return;
    // Don't feed frames while the AI is speaking — mid-turn realtime input can
    // trigger a self-interruption and derail the conversation.
    if (this.playingBack) return;
    this.framesSent++;
    this.send({
      realtimeInput: { mediaChunks: [{ mimeType: 'image/jpeg', data: base64Jpeg }] },
    });
  }

  get isReady() {
    return this.setupDone;
  }

  setMicMuted(muted: boolean) {
    this.micMuted = muted;
    log('mic muted =', muted);
  }

  interrupt() {
    this.pcmChunks = [];
    this.stopPlayback();
    this.cb.onStatus?.('listening');
  }

  // ── Playback of Gemini PCM (24k mono) as a per-turn WAV clip ──
  private async flushPlayback() {
    if (!this.pcmChunks.length) return;
    const pcmB64 = this.pcmChunks.join('');
    this.pcmChunks = [];
    try {
      const wavB64 = pcm16ToWavBase64(pcmB64, 24000);
      const path = `${FileSystem.cacheDirectory}live_${Date.now()}.wav`;
      await FileSystem.writeAsStringAsync(path, wavB64, { encoding: FileSystem.EncodingType.Base64 });
      await this.stopPlayback();
      this.playingBack = true;
      const player = createAudioPlayer({ uri: path });
      this.player = player;
      const finish = () => {
        this.stopPlayback();
        // Revive the recorder immediately — playback may have stolen the audio
        // session — so the next user turn is heard without waiting on the watchdog.
        this.resumeMic();
        this.cb.onStatus?.('listening');
      };
      player.addListener('playbackStatusUpdate', (st: any) => {
        if (st?.didJustFinish) finish();
      });
      // Fallback: estimate the clip length from the PCM size and force the mic
      // back on even if didJustFinish never fires (the common SDK 56 case that
      // left the session stuck on "listening" after a couple of turns).
      const approxBytes = Math.floor((pcmB64.length * 3) / 4);
      const durationMs = Math.ceil(approxBytes / 48); // 24kHz * 16-bit mono => 48 bytes/ms
      this.clearPlaybackTimer();
      this.playbackTimer = setTimeout(finish, durationMs + 800);
      player.play();
    } catch (e) {
      log('playback failed:', (e as Error)?.message);
      this.playingBack = false;
    }
  }

  private clearPlaybackTimer() {
    if (this.playbackTimer) { clearTimeout(this.playbackTimer); this.playbackTimer = null; }
  }

  private async stopPlayback() {
    this.clearPlaybackTimer();
    const p = this.player;
    this.player = null;
    this.playingBack = false;
    if (p) {
      try { p.remove(); } catch {}
    }
  }

  async close() {
    this.closed = true;
    this.clearSetupTimer();
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this.stopWatchdog();
    this.stopMic();
    await this.stopPlayback();
    try { this.ws?.close(); } catch {}
    this.ws = null;
    this.cb.onStatus?.('closed');
  }
}

// ── helpers ──

function pcm16ToWavBase64(pcmBase64: string, sampleRate: number): string {
  const pcm = base64ToBytes(pcmBase64);
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcm.length;
  const buffer = new Uint8Array(44 + dataSize);
  const view = new DataView(buffer.buffer);

  writeStr(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(view, 8, 'WAVE');
  writeStr(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(view, 36, 'data');
  view.setUint32(40, dataSize, true);
  buffer.set(pcm, 44);

  return bytesToBase64(buffer);
}

function writeStr(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

// Minimal UTF-8 decoder (Hermes has no TextDecoder).
function utf8Decode(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    if (b < 0x80) { out += String.fromCharCode(b); i += 1; }
    else if (b < 0xe0) { out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f)); i += 2; }
    else if (b < 0xf0) {
      out += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f));
      i += 3;
    } else {
      const cp =
        ((b & 0x07) << 18) | ((bytes[i + 1] & 0x3f) << 12) | ((bytes[i + 2] & 0x3f) << 6) | (bytes[i + 3] & 0x3f);
      const adj = cp - 0x10000;
      out += String.fromCharCode(0xd800 + (adj >> 10), 0xdc00 + (adj & 0x3ff));
      i += 4;
    }
  }
  return out;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const len = Math.floor((clean.length * 3) / 4);
  const out = new Uint8Array(len);
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = B64.indexOf(clean[i]);
    const b = B64.indexOf(clean[i + 1]);
    const c = B64.indexOf(clean[i + 2]);
    const d = B64.indexOf(clean[i + 3]);
    out[p++] = (a << 2) | (b >> 4);
    if (clean[i + 2] && clean[i + 2] !== '=') out[p++] = ((b & 15) << 4) | (c >> 2);
    if (clean[i + 3] && clean[i + 3] !== '=') out[p++] = ((c & 3) << 6) | d;
  }
  return out.subarray(0, p);
}

function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += B64[a >> 2];
    out += B64[((a & 3) << 4) | (b !== undefined ? b >> 4 : 0)];
    out += b !== undefined ? B64[((b & 15) << 2) | (c !== undefined ? c >> 6 : 0)] : '=';
    out += c !== undefined ? B64[c & 63] : '=';
  }
  return out;
}
