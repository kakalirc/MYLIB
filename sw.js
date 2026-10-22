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
  // For navigation requests (index.html), always check with the server
  // ("no-cache" = revalidate). If the page hasn't changed, the server answers
  // 304 and the browser reuses its copy, so nothing large is downloaded; after
  // a new build it gets the new page straight away. Never stale.
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request, { cache: 'no-cache' }));
    return;
  }
  // For everything else (icons, manifest, etc.) go to network normally.
  event.respondWith(fetch(event.request));
});
