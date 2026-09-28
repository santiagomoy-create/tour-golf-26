const CACHE_NAME = 'golf-26-cache-v5';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/icon-maskable.svg',
  'https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@400;500&family=Outfit:wght@300;400;500;600&display=swap'
];

// Instalar: cachear los estáticos de a uno, así un archivo faltante no aborta toda la instalación
// (con cache.addAll, un solo 404 dejaba la app sin soporte offline).
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(STATIC_ASSETS.map((url) =>
        cache.add(url).catch((err) => console.warn('SW: no se pudo cachear', url, err))
      ))
    )
  );
  self.skipWaiting();
});

// Activar y borrar cachés antiguas
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

// Solo se cachean la app y sus fuentes. Los datos (Apps Script, CSV de Sheets) no:
// cambian todo el tiempo, la app ya guarda su propia copia, y las URLs con
// "cachebust" hacían crecer el caché sin límite.
function isCacheable(url) {
  if (url.origin === self.location.origin) return true;
  return url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
}

// Network-First: con conexión siempre se ve la última versión; sin conexión
// (en el medio de la cancha) se sirve desde el caché.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (!isCacheable(url)) return;

  e.respondWith(
    fetch(e.request)
      .then((response) => {
        if (response.status === 200 || response.type === 'opaque') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return response;
      })
      .catch(() =>
        caches.match(e.request).then((cached) =>
          cached || (e.request.mode === 'navigate' ? caches.match('/index.html') : undefined)
        )
      )
  );
});
