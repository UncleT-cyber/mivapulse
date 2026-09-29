/**
 * TimetableFlow service worker — offline shell + installability.
 *
 * Strategy: network first, cache as fallback. Fresh code always wins while
 * online (important while the app is being developed), and everything the
 * browser has already fetched keeps working without a connection.
 *
 * The timetable itself never travels through here: workbooks are read with the
 * File API and calendars are built in the page. No user data is cached.
 */

const CACHE = 'timetableflow-shell-v1';

const SHELL = [
  '/',
  '/public/styles.css',
  '/public/app.js',
  '/public/manifest.webmanifest',
  '/public/icons/icon-192.png',
  '/public/icons/icon-512.png',
  '/public/icons/apple-touch-icon.png',
  '/public/vendor/exceljs.min.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request, { ignoreSearch: true });
        if (cached) return cached;
        if (request.mode === 'navigate') {
          const shell = await caches.match('/');
          if (shell) return shell;
        }
        return Response.error();
      }),
  );
});
