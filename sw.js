const CACHE_NAME = 'golf-26-cache-v4';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/icon-maskable.svg',
  'https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@400;500&family=Outfit:wght@300;400;500;600&display=swap'
];

// Instalar Service Worker y guardar recursos estáticos en caché
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activar y borrar cachés antiguas
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Interceptar peticiones
self.addEventListener('fetch', (e) => {
  // Estrategia Network-First para todos los recursos (estáticos locales, hojas de Google Sheets, APIs).
  // Esto asegura que si el usuario tiene conexión a internet, siempre cargará la versión más reciente
  // (solucionando problemas donde se sigue viendo el código viejo por caché local de PWA),
  // y si no tiene internet (por ejemplo en el medio de la cancha de golf), se sirve desde el caché offline.
  e.respondWith(
    fetch(e.request)
      .then((response) => {
        // Guardar copia fresca en el caché para soporte offline si es una respuesta exitosa
        if (response.status === 200 || response.type === 'opaque') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, clone);
          });
        }
        return response;
      })
      .catch(() => {
        // En caso de falla de red (offline), buscar en la caché
        return caches.match(e.request);
      })
  );
});
