// Minimal service worker. The app uses live Supabase data and must never
// cache API responses. Only same-origin navigation/assets are handled here.
// Cross-origin requests (Supabase, analytics, CDNs, etc.) are left entirely
// to the browser so a third-party network failure cannot break app requests.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // Do not intercept cross-origin requests.
  if (requestUrl.origin !== self.location.origin) return;

  // Always revalidate navigations so preview/production builds are current.
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request, { cache: 'no-cache' }));
    return;
  }

  // Same-origin assets use the normal network path; no app data is cached.
  event.respondWith(fetch(event.request));
});
