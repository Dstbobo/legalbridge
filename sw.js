/*
 * LegalBridge Service Worker (v6 — safe mode).
 *
 * After v4/v5 caused chat-stream POST failures in the field, this version
 * removes ALL chat-stream interception. The SW now only does the original
 * v3 static-asset caching and never touches any cross-origin or non-GET
 * request. If you typed anything into chat and saw "failed to fetch",
 * upgrading to this version will fix it on the next page load.
 *
 * Background document streaming on mobile is parked — we'll re-introduce
 * it once we can reproduce the failure in a controlled environment.
 */

const SW_VERSION = '6.1.0';
const CACHE = 'legalbridge-v6-1';
const ASSETS = [
  '/index.html',
  '/login.html',
  '/supabase.js',
  '/manifest.json',
];

// ── Lifecycle ──────────────────────────────────────────────────────────
// addAll is wrapped so a single missing asset can't keep the SW stuck in
// "installing" forever — which would let a previous broken SW keep
// controlling the page.
self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    try {
      const c = await caches.open(CACHE);
      for (const url of ASSETS) {
        try { await c.add(url); } catch (_) { /* skip missing */ }
      }
    } catch (_) { /* installation must never fail */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    } catch (_) {}
    await self.clients.claim();
    // Force any tab still showing the broken v4/v5-cached HTML to reload
    // from network with this fresh SW in control. Without this, the user
    // could sit on a stale page for hours.
    try {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const w of wins) {
        try { await w.navigate(w.url); } catch (_) {
          try { w.postMessage({ type: 'sw-please-reload', version: SW_VERSION }); } catch (_) {}
        }
      }
    } catch (_) {}
  })());
});

// ── Message channel (ping/pong only — no document-stream API in v6) ────
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'ping' && event.source) {
    event.source.postMessage({ type: 'pong', version: SW_VERSION });
  }
});

// ── Fetch interception ─────────────────────────────────────────────────
// HARD RULE: only same-origin GETs are touched. Everything else passes
// through with the SW completely out of the way. This includes:
//   - all POST/PUT/PATCH/DELETE (chat-stream, supabase REST, anthropic)
//   - all cross-origin GETs (supabase, googleapis, anthropic)
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = req.url;
  let sameOrigin = false;
  try { sameOrigin = new URL(url).origin === self.location.origin; } catch (_) {}
  if (!sameOrigin) return;

  // HTML / navigation — network first, cache fallback.
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

  // Static assets — cache first.
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
