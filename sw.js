const CACHE_NAME = 'ditherlab-v6-20250105';
const urlsToCache = [
  './',
  './index.html',
  './css/styles.css',
  './js/constants.js',
  './js/algorithms.js',
  './js/metrics.js',
  './js/export.js',
  './js/ui.js',
  './js/app.js',
  './js/pwa.js',
  './manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.9.0/p5.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.js',
  'https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) return response;
        return fetch(event.request);
      })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});
