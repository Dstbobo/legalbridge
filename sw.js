const CACHE = 'legalbridge-v3';
const ASSETS = [
  '/index.html',
  '/login.html',
  '/supabase.js',
  '/manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Notification click — bring the tab back to front ──────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      // If a LegalBridge tab already exists, focus it and let it know
      for (const c of clients) {
        if (c.url && c.url.includes('legalbridge') && 'focus' in c) {
          c.postMessage({ type: 'notification-focus' });
          return c.focus();
        }
      }
      // No tab open — open a new one
      if (self.clients.openWindow) return self.clients.openWindow('/chat.html');
    })
  );
});

self.addEventListener('fetch', e => {
  const url = e.request.url;

  // API calls — always network
  if (url.includes('supabase.co') || url.includes('googleapis') || url.includes('anthropic')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }

  // HTML pages — ALWAYS network first (so updates show immediately)
  if (e.request.mode === 'navigate' || url.endsWith('.html') || url.endsWith('/')) {
    e.respondWith(
      fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // Images, icons, JS — cache first (safe to cache)
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      if (res.status === 200) {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return res;
    }))
  );
});
