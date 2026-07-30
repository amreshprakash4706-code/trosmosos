// Trosmos OS Service Worker - Production-grade offline support
const CACHE_NAME = 'trosmos-os-v4';
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
      .catch((err) => console.warn('[Trosmos SW] install cache failed', err))
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

// Allow page to request immediate activation of a waiting worker
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Skip non-same-origin and API / function calls (let network handle)
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
            }).catch(() => {});
          }
          return resp;
        })
        .catch(() => {
          // Network failed — return cache or offline fallback
          if (cached) return cached;
          // For navigation requests, serve the shell
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html').then((shell) => {
              return shell || new Response(
                '<!DOCTYPE html><html><body style="background:#09090B;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><h1>Trosmos OS</h1><p>You are offline. Reconnect to continue.</p></div></body></html>',
                { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
              );
            });
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
