// Minimal service worker. This app shows live financial/attendance data from
// Supabase, so it deliberately does NOT cache API responses or app data —
// that could show someone stale balances or payment records while offline,
// which would be actively misleading for a real institute. Its only job is
// to satisfy the browser's requirement that an installable PWA have a
// registered service worker with a fetch handler.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // For navigation requests (index.html), always bypass the HTTP cache
  // so the browser never serves a stale cached version of the app.
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }
  // For everything else (icons, manifest, etc.) go to network normally.
  event.respondWith(fetch(event.request));
});
