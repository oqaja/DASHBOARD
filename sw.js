// Service worker Dashboard Konten.
// - Tampilan (HTML/CSS/JS/ikon) disimpan di cache supaya app bisa di-install dan tetap
//   kebuka walau offline.
// - Strategi NETWORK-FIRST: selalu coba ambil versi terbaru dulu, cache cuma cadangan
//   kalau offline. Jadi update dari GitHub langsung kepakai tanpa hapus cache manual.
// - Request ke Apps Script (beda domain) gak disentuh sama sekali; data konten
//   di-cache sendiri oleh dashboard.js / pages.js di localStorage.
const CACHE = 'dashboard-shell-v1';
const SHELL = ['./', 'index.html', 'app.css', 'dashboard.js', 'pages.js', 'manifest.json', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Apps Script, font, dsb.: biarkan browser

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true })
        .then((hit) => hit || (req.mode === 'navigate' ? caches.match('index.html') : undefined))
        .then((hit) => hit || new Response('Offline', { status: 503, statusText: 'Offline' })))
  );
});
