/*
 * LegalBridge Service Worker (v4).
 *
 * Two responsibilities:
 *   1. Static-asset caching (pre-existing behaviour from v3 — preserved).
 *   2. Background streaming for chat-stream — the SW process owns the
 *      upstream SSE fetch so that when a mobile user minimises the browser,
 *      the document keeps streaming and completes. The page reads chunks
 *      from a synthetic stream we hand back; additionally we broadcast
 *      each text delta via postMessage so a returning client (or a tab
 *      whose reader was throttled away) can re-attach to the running
 *      stream. When the upstream finishes while no client is visible we
 *      fire a "document ready" notification (best-effort).
 *
 * Scope of fetch interception: only chat-stream requests get the
 * streaming-keeper treatment. Every other request keeps the v3 caching
 * behaviour, byte-for-byte.
 */

const SW_VERSION = '4.0.0';
const CACHE = 'legalbridge-v4';
const ASSETS = [
  '/index.html',
  '/login.html',
  '/supabase.js',
  '/manifest.json',
];

const CHAT_STREAM_FRAGMENT = '/functions/v1/chat-stream';

// In-memory book of currently-streaming chat-stream requests.
// Keyed by an opaque id; entry shape:
//   { id, accumulated, done, error, startedAt }
const STREAMS = new Map();

// Which client IDs reported themselves as "visible" via postMessage.
// We use this to decide whether to show a notification on completion.
const VISIBLE_CLIENTS = new Set();

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
  const clientId = event.source && event.source.id;
  switch (data.type) {
    case 'visibility':
      if (clientId) {
        if (data.visible) VISIBLE_CLIENTS.add(clientId);
        else VISIBLE_CLIENTS.delete(clientId);
      }
      break;
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
    case 'ping':
      event.source && event.source.postMessage({ type: 'pong', version: SW_VERSION });
      break;
  }
});

// ── Fetch interception ─────────────────────────────────────────────────
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = req.url;

  // 1. Chat-stream gets the streaming-keeper treatment. Must come FIRST
  //    so the v3 supabase.co catch-all doesn't grab it. We only intercept
  //    POST — GET requests to the same path are not document streams.
  if (req.method === 'POST' && url.includes(CHAT_STREAM_FRAGMENT)) {
    e.respondWith(handleChatStreamFetch(e));
    return;
  }

  // 2. Other API calls — always network, fall back to cache on offline.
  if (url.includes('supabase.co') || url.includes('googleapis') || url.includes('anthropic') || url.includes('legalbridge.ng/v1/')) {
    e.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }

  // 3. HTML pages — network first.
  if (req.mode === 'navigate' || url.endsWith('.html') || url.endsWith('/')) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(req, clone));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // 4. Static assets — cache first.
  e.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          if (res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(req, clone));
          }
          return res;
        })
    )
  );
});

// ── chat-stream SSE keeper ─────────────────────────────────────────────
async function handleChatStreamFetch(event) {
  const req = event.request;
  const startedAt = Date.now();
  const id = 'sw-' + startedAt.toString(36) + '-' + Math.random().toString(36).slice(2, 8);

  // Kick off the upstream fetch from the SW process so it survives the
  // page being backgrounded.
  let upstream;
  try {
    upstream = await fetch(req);
  } catch (_err) {
    // Hard network failure — synthesise an SSE error the existing page
    // parser will render gracefully.
    const body =
      'data: ' +
      JSON.stringify({ text: 'Network error reaching the document service. Please try again.' }) +
      '\n\ndata: [DONE]\n\n';
    return new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream', 'X-SW-Stream-Id': id },
    });
  }

  // Non-OK / no-body upstream — just forward as-is.
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

            // Forward raw bytes to the page — existing reader stays happy.
            try {
              controller.enqueue(value);
            } catch (_) {
              // Page reader was cancelled. We still keep reading upstream
              // because a re-attaching client may want the result.
            }

            // Parse SSE so we can update accumulated + broadcast deltas.
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
          try {
            controller.close();
          } catch (_) {}
          broadcast({ type: 'stream-end', id, accumulated: entry.accumulated });
          await maybeNotify(entry);
        } catch (err) {
          entry.done = true;
          entry.error = (err && err.message) || String(err);
          try {
            controller.error(err);
          } catch (_) {}
          broadcast({ type: 'stream-error', id, error: entry.error });
        } finally {
          // Keep the entry alive for 5 minutes so a late re-attach still works.
          setTimeout(() => STREAMS.delete(id), 5 * 60 * 1000);
        }
      })();
    },
    cancel() {
      // Page reader cancelled — intentionally do NOT abort upstream;
      // we want background completion.
    },
  });

  // Mirror upstream headers so the page still sees X-Stream, X-Intent, X-Source.
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
    try {
      c.postMessage(message);
    } catch (_) {}
  }
}

// ── "Document ready" notification when finishing in background ─────────
async function maybeNotify(entry) {
  // Only fire for non-trivial documents and only when no client is visible.
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
