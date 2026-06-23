// Service worker de la PWA de Procedimientos.
// Estrategia:
//   - HTML/navegación: network-first (para recoger despliegues nuevos al instante).
//   - Resto de recursos propios (css/js/iconos): stale-while-revalidate.
//   - Peticiones a otros orígenes (Apps Script, Google Docs): no se interceptan.

const CACHE = 'procedimientos-v2';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/app.js',
  './js/api.js',
  './js/auth.js',
  './js/chat.js',
  './js/config.js',
  './js/logo.js',
  './js/manuales.js',
  './js/ui.js',
  './js/usuarios.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Solo gestionamos GET del mismo origen; lo demás (API, Docs) va directo a la red.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  // Documentos HTML / navegación: primero red, caché como respaldo (offline).
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  // Recursos estáticos: servir de caché y refrescar en segundo plano.
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetched = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetched;
    })
  );
});
