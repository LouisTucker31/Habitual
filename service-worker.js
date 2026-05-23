const CACHE_NAME = 'habitual-v5';

// Derive base path from where the SW is installed — works on GitHub Pages subdirs
const BASE = self.location.pathname.replace(/\/service-worker\.js$/, '');

const PRECACHE_PATHS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/base.css',
  '/css/layout.css',
  '/css/components.css',
  '/css/animations.css',
  '/js/app.js',
  '/js/utils.js',
  '/js/db.js',
  '/js/habits.js',
  '/js/logging.js',
  '/js/streaks.js',
  '/js/notifications.js',
  '/js/onboarding.js',
  '/js/celebrations.js',
  '/js/views/today.js',
  '/js/views/week.js',
  '/js/views/calendar.js',
  '/js/views/insights.js',
  '/js/views/settings.js',
  '/js/modals/habitModal.js',
  '/js/modals/dayModal.js',
  '/data/suggestions.js',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
  '/assets/textures/noise.svg',
];

const PRECACHE_URLS = PRECACHE_PATHS.map(p => BASE + p);

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      });
    })
  );
});
