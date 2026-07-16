// Trosmos OS Service Worker - Basic offline support for demo
const CACHE_NAME = 'trosmos-os-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
  // Add more if assets exist; for single-file demo this enables basic offline
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((resp) => {
        // Optionally cache new requests dynamically for images etc, but keep simple
        return resp;
      }).catch(() => cached);
    })
  );
});
