// Trosmos OS Service Worker - Production-grade offline support
const CACHE_NAME = 'trosmos-os-v2';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/sw.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Skip non-same-origin and API calls (let network handle)
  if (url.origin !== self.location.origin || url.pathname.startsWith('/.netlify/')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((resp) => {
          // Cache successful same-origin responses for offline
          if (resp && resp.ok && resp.type === 'basic') {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, clone);
            });
          }
          return resp;
        })
        .catch(() => {
          // Network failed — return cache or offline fallback
          if (cached) return cached;
          // For navigation requests, serve the shell
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
          return new Response('You are offline. Trosmos OS will restore when connection returns.', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        });

      // Prefer network for freshness, fall back to cache
      return fetchPromise.then((resp) => resp || cached);
    })
  );
});