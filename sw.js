/* Tallrik — service worker: offline-skal + livsmedelsdatabas. */
const VERSION = 'tallrik-202609141620';
const SHELL = [
  './', './index.html', './css/app.css', './manifest.webmanifest',
  './js/app.js', './js/store.js', './js/ui/users.js', './js/nutrition.js', './js/foods.js', './js/ai.js', './js/camera.js',
  './js/recipes.js', './js/components.js', './js/icons.js', './js/backup.js',
  './js/ui/onboarding.js', './js/ui/home.js', './js/ui/log.js', './js/ui/suggest.js', './js/ui/progress.js', './js/ui/profile.js',
  './data/foods.json', './data/recipe-videos.json', './data/video-catalog.json', './vendor/zxing.min.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './icons/favicon-32.png', './icons/favicon-64.png',
  './icons/icon-192-malin.png', './icons/icon-512-malin.png', './icons/apple-touch-icon-malin.png',
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    // Lägg till fil för fil så att en enstaka miss inte stoppar installationen
    await Promise.all(SHELL.map(u => c.add(new Request(u, { cache: 'no-cache' })).catch(() => {})));   // förbi HTTP-cachen (GitHub Pages: 10 min)
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('tallrik-') && k !== VERSION).map(k => caches.delete(k))))   // rör bara Tallriks egna cachar (Fokus/Tradezella delar origin)
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;          // Open Food Facts m.fl. rörs inte
  if (url.pathname.includes('/api/')) return;            // bryggan cachas aldrig
  // Nätverk först så en ny version aldrig fastnar; cachen är reserven offline.
  e.respondWith((async () => {
    try {
      const res = await fetch(req.mode === 'navigate' ? new Request(req, { cache: 'no-cache' }) : req);
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)).catch(() => {}); }
      return res;
    } catch {
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') return caches.match('./index.html');
      return Response.error();
    }
  })());
});
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });
