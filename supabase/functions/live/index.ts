// ───────────────────────────────────────────────────────────────────────────
// LegalBridge — Gemini Live WebSocket proxy (Supabase Edge Function, Deno)
//
// Sits between the mobile app and Google's Gemini Live API
// (BidiGenerateContent). The phone connects here over WebSocket; this function
// opens a second WebSocket to Gemini and pipes data both ways. The phone never
// holds the Gemini key — it lives only in Supabase secrets (GEMINI_API_KEY).
//
//   phone  -> proxy -> Gemini   (setup, mic PCM16, camera JPEG frames)
//   Gemini -> proxy -> phone    (audio replies + transcripts)
//
// Gemini sends its JSON frames as BINARY; React Native cannot read Blob
// payloads, so every upstream frame is forwarded to the phone as TEXT.
// ───────────────────────────────────────────────────────────────────────────

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const GEMINI_HOST =
  'wss://generativelanguage.googleapis.com/ws/' +
  'google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent';

function log(...args: unknown[]) {
  console.log('[live]', ...args);
}

Deno.serve((req) => {
  const upgrade = (req.headers.get('upgrade') || '').toLowerCase();
  if (upgrade !== 'websocket') {
    // Health check / non-WS hit.
    return new Response(
      JSON.stringify({ status: 'ok', service: 'legalbridge-live', configured: !!GEMINI_API_KEY }),
      { headers: { 'content-type': 'application/json' } },
    );
  }

  if (!GEMINI_API_KEY) {
    return new Response('GEMINI_API_KEY not configured', { status: 500 });
  }

  const { socket: phone, response } = Deno.upgradeWebSocket(req);

  let gemini: WebSocket | null = null;
  const pending: (string | ArrayBufferLike)[] = [];
  let closed = false;

  function closeAll() {
    closed = true;
    try { gemini?.close(); } catch (_) { /* noop */ }
    try { phone.close(); } catch (_) { /* noop */ }
  }

  phone.onopen = () => {
    log('phone connected — opening Gemini upstream');
    const upstream = new WebSocket(`${GEMINI_HOST}?key=${GEMINI_API_KEY}`);
    upstream.binaryType = 'arraybuffer';

    upstream.onopen = () => {
      log('Gemini upstream open');
      try { phone.send(JSON.stringify({ type: 'proxy_status', status: 'connected' })); } catch (_) { /* noop */ }
      while (pending.length) {
        const m = pending.shift()!;
        try { upstream.send(m as string); } catch (_) { /* noop */ }
      }
    };

    // Gemini -> phone, always as TEXT (RN can't read binary Blobs).
    upstream.onmessage = (e: MessageEvent) => {
      if (phone.readyState !== WebSocket.OPEN) return;
      let text: string;
      if (typeof e.data === 'string') {
        text = e.data;
      } else {
        try { text = new TextDecoder().decode(new Uint8Array(e.data as ArrayBuffer)); }
        catch { return; }
      }
      try { phone.send(text); } catch (_) { /* noop */ }
    };

    upstream.onclose = (e: CloseEvent) => {
      log('Gemini upstream closed', e.code, String(e.reason || '').slice(0, 120));
      if (!closed) closeAll();
    };
    upstream.onerror = () => {
      log('Gemini upstream error');
      try { phone.send(JSON.stringify({ type: 'proxy_status', status: 'error' })); } catch (_) { /* noop */ }
    };

    gemini = upstream;
  };

  // Phone -> Gemini. Forward setup / realtimeInput frames verbatim.
  phone.onmessage = (e: MessageEvent) => {
    const data = e.data;
    if (gemini && gemini.readyState === WebSocket.OPEN) {
      try { gemini.send(data); } catch (_) { /* noop */ }
    } else {
      pending.push(data);
    }
  };

  phone.onclose = () => { log('phone disconnected'); if (!closed) closeAll(); };
  phone.onerror = () => { if (!closed) closeAll(); };

  return response;
});
