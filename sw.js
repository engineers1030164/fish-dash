// Gamer PWA Service Worker
const CACHE = 'gamer-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/js/main.js',
  '/js/fish-dash.js',
  '/js/city-stars.js',
  '/js/restaurant-rush.js',
  '/js/bubble-stack.js',
  '/js/fruit-ninja.js',
  '/js/brick-breaker.js',
  '/js/urban-hunt.js',
  '/manifest.json',
  '/icons/icon.svg',
];

// Install: cache all assets
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate: delete old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: serve from cache, fall back to network
self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
