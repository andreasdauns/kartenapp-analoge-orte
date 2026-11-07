// Service Worker: App offline startfähig, Daten immer zuerst frisch aus dem Netz.
const VERSION = 'v63';
const SHELL = [
  './', 'index.html', 'info.html', 'styles.css', 'manifest.webmanifest', // info.html: Impressum/Datenschutz auch offline
  'src/app.js', 'src/categories.js', 'src/hours.js', 'src/reports.js', 'src/config.js', 'src/round.js', 'src/wohin.js',
  'vendor/maplibre-gl.js', 'vendor/maplibre-gl.css', 'icons/icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Netz zuerst, bei Funkloch aus dem Speicher
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        // Nur fertige, vollständige Antworten speichern; waitUntil hält den Worker bis zum Schreiben wach
        if (res.ok && res.status === 200) { const copy = res.clone(); e.waitUntil(caches.open(VERSION).then((c) => c.put(e.request, copy)).catch(() => {})); }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: e.request.mode === 'navigate' })) // z. B. Start der Android-App mit ?src=twa
  );
});
