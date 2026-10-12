// Rede primeiro, cache como reserva: funciona offline sem prender versões antigas.
const CACHE = 'domino-mexicano-v7';
const ASSETS = ['./', 'index.html', 'style.css', 'app.js', 'detector.js', 'manifest.webmanifest', 'icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(ASSETS.map(a => new Request(a, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // 'no-cache': sempre confere com o servidor se o arquivo mudou (sem isso o
  // navegador pode reaproveitar uma cópia antiga por até 10 minutos).
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
