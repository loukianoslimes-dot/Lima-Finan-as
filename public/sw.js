const CACHE_NAME = 'lima-financas-cache-v5';
const DYNAMIC_ICON_CACHE = 'dynamic-icons';

const urlsToCache = [
  './',
  'index.html',
  'manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME && cacheName !== DYNAMIC_ICON_CACHE) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Intercept icon requests to serve dynamic user profile picture
  if (url.pathname === '/icon-192.png' || url.pathname === '/icon-512.png') {
    event.respondWith(
      caches.open(DYNAMIC_ICON_CACHE).then(cache => {
        return cache.match('user-profile-pic').then(response => {
          if (response) {
            return response;
          }
          // Fallback to a default icon if no profile pic is cached
          return fetch('https://picsum.photos/seed/finance/192/192');
        });
      })
    );
    return;
  }

  // Network First strategy for the main page, manifest, and scripts to ensure updates are seen
  if (event.request.mode === 'navigate' || 
      url.pathname === '/manifest.json' || 
      url.pathname.endsWith('.js') || 
      url.pathname.endsWith('.css')) {
    event.respondWith(
      fetch(event.request)
        .then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache First for other assets
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        if (cachedResponse) return cachedResponse;
        return fetch(event.request).then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        });
      })
  );
});
