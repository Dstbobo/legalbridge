import { AudioModule, setAudioModeAsync, createAudioPlayer, type AudioPlayer } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import LiveAudioStream from 'react-native-live-audio-stream';
import { type UserRole } from '@/constants/roles';

// The phone talks ONLY to our Supabase Edge Function proxy (functions/v1/live),
// which holds the Gemini key and relays to Google's BidiGenerateContent API.
const BASE = process.env.EXPO_PUBLIC_GEMINI_LIVE_URL ?? '';
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

// Live API model with native-audio dialog (same as the proven reference setup).
const LIVE_MODEL = 'models/gemini-2.5-flash-native-audio-latest';

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
}

export interface LiveSessionOptions {
  userId: string | null;
  role?: UserRole | null;
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
    audience = 'a member of the public seeking legal guidance in Nigeria';
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
  private opts: LiveSessionOptions;

  constructor(userIdOrOpts: string | null | LiveSessionOptions, cb: LiveCallbacks) {
    if (userIdOrOpts && typeof userIdOrOpts === 'object') {
      this.opts = userIdOrOpts;
      this.userId = userIdOrOpts.userId;
    } else {
      this.opts = { userId: userIdOrOpts };
      this.userId = userIdOrOpts;
    }
    this.cb = cb;
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

    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      log('mic permission granted =', perm.granted);
      if (!perm.granted) {
        this.cb.onStatus?.('error');
        throw new Error('Microphone permission denied');
      }
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        shouldPlayInBackground: false,
        shouldRouteThroughEarpiece: false, // loudspeaker — with audioSource=6 avoids echo
      });
    } catch (e) {
      log('audio setup failed:', (e as Error)?.message);
      this.cb.onStatus?.('error');
      throw e;
    }

    this.openSocket();
  }

  private setupTimer: ReturnType<typeof setTimeout> | null = null;

  private sendSetup() {
    log('sending setup with model', LIVE_MODEL);
    this.send({
      setup: {
        model: LIVE_MODEL,
        generationConfig: { responseModalities: ['AUDIO'] },
        systemInstruction: { parts: [{ text: buildLiveSystemInstruction(this.opts) }] },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
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

  private openSocket() {
    this.cb.onStatus?.('connecting');
    const url =
      `${BASE}?apikey=${encodeURIComponent(ANON)}&userId=${encodeURIComponent(this.userId ?? '')}`;
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
      log('proxy WS closed', e?.code ?? '', e?.reason ?? '');
      this.clearSetupTimer();
      if (this.closed) return;
      this.cb.onStatus?.(this.setupDone ? 'closed' : 'error');
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

    if (msg.type === 'proxy_status') {
      log('proxy_status:', msg.status);
      if (msg.status === 'connected') this.cb.onStatus?.('connected');
      else if (msg.status === 'reconnecting') this.cb.onStatus?.('reconnecting');
      else if (msg.status === 'rate_limited') this.cb.onStatus?.('rate_limited');
      else if (msg.status === 'error') this.cb.onStatus?.('error');
      return;
    }

    if (msg.setupComplete) {
      log('setupComplete — starting mic');
      this.clearSetupTimer();
      this.setupDone = true;
      this.cb.onStatus?.('listening');
      this.startMic();
      return;
    }

    const sc = msg.serverContent;
    if (!sc) return;

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
        this.cb.onStatus?.('speaking');
      }
    }

    if (sc.turnComplete || sc.generationComplete) {
      await this.flushPlayback();
      this.cb.onStatus?.('listening');
    }
  }

  // ── Microphone streaming ──
  private startMic() {
    if (this.micActive) return;
    if (!LiveAudioStream || typeof LiveAudioStream.init !== 'function') {
      log('ERROR: LiveAudioStream native module unavailable');
      this.cb.onStatus?.('error');
      return;
    }
    try {
      LiveAudioStream.init(MIC_OPTIONS as any);
      LiveAudioStream.on('data', (chunk: string) => {
        if (!this.setupDone || this.micMuted || this.playingBack) return;
        this.chunksSent++;
        this.send({
          realtimeInput: { mediaChunks: [{ mimeType: 'audio/pcm;rate=16000', data: chunk }] },
        });
        this.cb.onLevel?.(Math.min(1, chunk.length / 6000));
      });
      LiveAudioStream.start();
      this.micActive = true;
      log('mic started');
      this.cb.onStatus?.('listening');
    } catch (e) {
      log('startMic failed:', (e as Error)?.message);
      this.cb.onStatus?.('error');
    }
  }

  private stopMic() {
    if (!this.micActive) return;
    try { LiveAudioStream.stop(); } catch {}
    this.micActive = false;
  }

  /** Send a single camera frame (base64 JPEG) as realtime video input. */
  sendImageFrame(base64Jpeg: string) {
    if (!this.setupDone) return;
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
      player.addListener('playbackStatusUpdate', (st: any) => {
        if (st?.didJustFinish) {
          this.stopPlayback();
          this.cb.onStatus?.('listening');
        }
      });
      player.play();
    } catch (e) {
      log('playback failed:', (e as Error)?.message);
      this.playingBack = false;
    }
  }

  private async stopPlayback() {
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
