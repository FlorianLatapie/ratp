const CACHE_NAME = 'ratp-cache-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/style.css',
  '/style-ratp-lines.css',
  '/script.js',
  '/ratp.js',
  '/mymath.js',
  '/tooling.js',
  '/map.js',
  '/manifest.json',
  '/favicon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.map(key => {
        if (key !== CACHE_NAME) return caches.delete(key);
      })
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cachedResp => {
      if (cachedResp) return cachedResp;
      
      return fetch(event.request).then(networkResp => {
        return caches.open(CACHE_NAME).then(cache => {
          if (networkResp && networkResp.type !== 'opaque' && networkResp.status === 200) {
            cache.put(event.request, networkResp.clone());
          }
          return networkResp;
        });
      }).catch(() => {
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      });
    })
  );
});
