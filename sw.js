/*
 * LegalBridge Service Worker (v5).
 *
 * Two responsibilities:
 *   1. Static-asset caching (preserved from v3).
 *   2. Background streaming for *document* generation only.
 *
 * Critical change vs v4: the SW now intercepts a chat-stream POST ONLY
 * when the page explicitly opts in by setting the request header
 *     X-LB-SW-Stream: 1
 *
 * Why this matters:
 *   - chat-stream serves several modes (status pings, regular chat,
 *     image analysis, document generation). v4 grabbed all of them and
 *     wrapped their bodies in a synthetic ReadableStream, which broke
 *     non-document modes that don't follow the SSE convention.
 *   - With the opt-in header, regular chat / status calls / everything
 *     else flow through to the network completely untouched. The SW
 *     only acts on requests the page deliberately marks as documents.
 *
 * CORS note: the custom header would trigger a preflight against the
 * Edge Function (which only whitelists authorization, apikey, content-
 * type, x-client-info). We never let that preflight happen — the SW
 * intercepts the page-side fetch event BEFORE any network call, strips
 * the X-LB-SW-Stream header from the request, and then makes its own
 * upstream fetch without it. The upstream request looks identical to
 * a normal page fetch from CORS's point of view.
 */

const SW_VERSION = '5.1.0';
const CACHE = 'legalbridge-v5-1';
const ASSETS = [
  '/index.html',
  '/login.html',
  '/supabase.js',
  '/manifest.json',
];

const CHAT_STREAM_FRAGMENT = '/functions/v1/chat-stream';
const OPT_IN_HEADER = 'x-lb-sw-stream';

// In-memory record of in-flight document streams. Keyed by an opaque id
// so a re-attaching client can ask "where is stream X now?".
//   { id, accumulated, done, error, startedAt }
const STREAMS = new Map();

// ── Lifecycle ──────────────────────────────────────────────────────────
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ── Page → SW message channel ──────────────────────────────────────────
self.addEventListener('message', (event) => {
  const data = event.data || {};
  switch (data.type) {
    case 'reattach': {
      const s = STREAMS.get(data.id);
      if (s && event.source) {
        event.source.postMessage({
          type: 'stream-state',
          id: data.id,
          accumulated: s.accumulated,
          done: s.done,
          error: s.error,
        });
      }
      break;
    }
    case 'list-streams': {
      if (event.source) {
        const ids = [];
        STREAMS.forEach((_, id) => ids.push(id));
        event.source.postMessage({ type: 'streams', ids });
      }
      break;
    }
    case 'ping':
      if (event.source) event.source.postMessage({ type: 'pong', version: SW_VERSION });
      break;
  }
});

// ── Fetch interception ─────────────────────────────────────────────────
self.addEventListener('fetch', (e) => {
  const req = e.request;

  // 1. DOCUMENT STREAM (opt-in only) — must be POST + chat-stream URL +
  //    explicit opt-in header. EVERYTHING else falls through to the
  //    network unchanged. This is the critical guard that prevents
  //    the SW from accidentally wrapping non-SSE responses.
  if (
    req.method === 'POST' &&
    req.url.includes(CHAT_STREAM_FRAGMENT) &&
    req.headers.get(OPT_IN_HEADER) === '1'
  ) {
    e.respondWith(handleDocStream(e));
    return;
  }

  // 2. Static-asset caching (v3 behaviour, preserved verbatim) — only
  //    applies to same-origin GETs. Cross-origin POSTs (Supabase REST,
  //    chat-stream non-document calls, anthropic, etc.) flow through
  //    the browser's normal fetch path with ZERO SW involvement.
  const url = req.url;
  if (req.method !== 'GET') return; // ← do not touch any non-GET we didn't already opt in to

  // HTML pages — network first.
  if (req.mode === 'navigate' || url.endsWith('.html') || url.endsWith('/')) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(req, clone)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Same-origin static assets — cache first.
  let sameOrigin = false;
  try {
    sameOrigin = new URL(url).origin === self.location.origin;
  } catch (_) {}
  if (!sameOrigin) return; // never touch cross-origin GETs either

  e.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          if (res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(req, clone)).catch(() => {});
          }
          return res;
        })
    )
  );
});

// ── Document streaming handler ─────────────────────────────────────────
async function handleDocStream(event) {
  const original = event.request;
  const startedAt = Date.now();
  const id = 'sw-' + startedAt.toString(36) + '-' + Math.random().toString(36).slice(2, 8);

  // Build an upstream Request that DROPS the opt-in header so the Edge
  // Function's CORS allowlist doesn't reject it. We use the well-known
  // "clone-with-overrides" pattern — pass the original Request as the
  // first argument and override only what we need. This inherits the
  // body, mode, credentials, cache, etc. from the original automatically
  // and avoids the fragile manual reconstruction that v5.0.0 attempted.
  let upstreamReq;
  try {
    const cleanHeaders = new Headers(original.headers);
    cleanHeaders.delete(OPT_IN_HEADER);
    upstreamReq = new Request(original, { headers: cleanHeaders });
  } catch (err) {
    // If we somehow can't even rebuild the request, hand the original
    // straight to the network. The user loses backgrounding survival
    // for this one call, but the request still goes through cleanly —
    // no "Failed to fetch" from a busted SW path.
    console.warn('[lb-sw] reconstruct failed, passing through:', err);
    try { return await fetch(original); } catch (e) { throw e; }
  }

  let upstream;
  try {
    upstream = await fetch(upstreamReq);
  } catch (err) {
    // Network really did fail (offline, DNS, TLS handshake, etc.). Try
    // ONE more time with the original request as a last-ditch path
    // before synthesising an SSE error — covers the case where there's
    // something subtly wrong with our reconstructed request that the
    // browser dislikes (rare, but better safe than sorry).
    console.warn('[lb-sw] upstream fetch failed, retrying with original:', err);
    try {
      upstream = await fetch(original);
    } catch (err2) {
      const body =
        'data: ' +
        JSON.stringify({ text: 'Network error reaching the document service. Please try again.' }) +
        '\n\ndata: [DONE]\n\n';
      return new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream', 'X-SW-Stream-Id': id },
      });
    }
  }

  // Non-OK or empty-body — return as-is so the page sees the real error.
  if (!upstream.ok || !upstream.body) {
    return upstream;
  }

  const entry = { id, accumulated: '', done: false, error: null, startedAt };
  STREAMS.set(id, entry);

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let sseBuffer = '';

  const responseStream = new ReadableStream({
    start(controller) {
      broadcast({ type: 'stream-start', id });

      (async function pump() {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            // Forward raw bytes to the page reader so the existing SSE
            // parser keeps working byte-for-byte.
            try {
              controller.enqueue(value);
            } catch (_) {
              // Page reader cancelled — keep going so background
              // completion still works.
            }

            // Parse SSE so we can mirror text deltas to all clients via
            // postMessage and update our accumulated buffer.
            sseBuffer += decoder.decode(value, { stream: true });
            const lines = sseBuffer.split('\n');
            sseBuffer = lines.pop() || '';
            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              const payload = line.slice(6).trim();
              if (!payload || payload === '[DONE]') continue;
              try {
                const j = JSON.parse(payload);
                if (typeof j.text === 'string' && j.text) {
                  entry.accumulated += j.text;
                  broadcast({ type: 'stream-delta', id, text: j.text });
                }
              } catch (_) {
                /* malformed SSE — skip */
              }
            }
          }
          entry.done = true;
          try { controller.close(); } catch (_) {}
          broadcast({ type: 'stream-end', id, accumulated: entry.accumulated });
          await maybeNotify(entry);
        } catch (err) {
          entry.done = true;
          entry.error = (err && err.message) || String(err);
          try { controller.error(err); } catch (_) {}
          broadcast({ type: 'stream-error', id, error: entry.error });
        } finally {
          // Keep the entry around for 5 minutes for re-attach.
          setTimeout(() => STREAMS.delete(id), 5 * 60 * 1000);
        }
      })();
    },
    cancel() {
      // Intentionally do NOT abort the upstream — that defeats the
      // entire point. The SW keeps reading so a re-attaching client
      // can pick up the result.
    },
  });

  // Mirror upstream headers so the page still sees X-Stream / X-Intent /
  // X-Source / Content-Type unchanged.
  const outHeaders = new Headers();
  upstream.headers.forEach((value, key) => outHeaders.set(key, value));
  outHeaders.set('X-SW-Stream-Id', id);

  return new Response(responseStream, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: outHeaders,
  });
}

// ── Broadcast helper ───────────────────────────────────────────────────
async function broadcast(message) {
  const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const c of all) {
    try { c.postMessage(message); } catch (_) {}
  }
}

// ── "Document ready" notification when finishing while hidden ──────────
async function maybeNotify(entry) {
  if (!entry.accumulated || entry.accumulated.length < 200) return;
  try {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const anyVisible = all.some((c) => c.visibilityState === 'visible');
    if (anyVisible) return;
    if (typeof self.registration?.showNotification !== 'function') return;
    if (self.Notification && self.Notification.permission !== 'granted') return;
    await self.registration.showNotification('Your document is ready', {
      body: 'Tap to return to LegalBridge.',
      icon: '/favicon.ico',
      tag: 'lb-doc-ready',
      renotify: false,
    });
  } catch (_) {
    /* notifications are best-effort */
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of all) {
        if ('focus' in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('/chat.html');
    })()
  );
});
