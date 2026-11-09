// Service worker: la app abre aunque no haya internet en el depósito.
// Archivos de la app: primero la red (siempre la última versión), si no hay
// red, la copia guardada. Los datos los maneja Firebase por su cuenta.
const VERSION = 'cargas-v2';
const APP = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/ui.js', 'js/util.js', 'js/calc.js', 'js/predict.js', 'js/store.js',
  'js/catalogo.js', 'js/importar.js', 'js/demo.js', 'js/firebase-config.js', 'js/hojas.js',
  'js/views/hoy.js', 'js/views/jornada.js', 'js/views/panel.js', 'js/views/historial.js', 'js/views/ajustes.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'
  // las fotos de productos se guardan solas la primera vez que se ven
];
const EXTERNOS = [
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll(APP).then(() => Promise.all(EXTERNOS.map((u) => c.add(u).catch(() => {})))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const propio = url.origin === self.location.origin;
  const sdk = url.href.startsWith('https://www.gstatic.com/firebasejs/');
  const fuente = url.host === 'fonts.googleapis.com' || url.host === 'fonts.gstatic.com';
  const foto = propio && url.pathname.includes('/fotos/');
  if (!propio && !sdk && !fuente && !foto) return; // Firestore y Auth van directo

  if (propio && !foto) {
    // Red primero, copia guardada si no hay señal
    e.respondWith(
      fetch(req).then((r) => {
        if (r.ok) { const copia = r.clone(); caches.open(VERSION).then((c) => c.put(req, copia)); }
        return r;
      }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
    );
    return;
  }
  // SDK, tipografías y fotos de productos: copia guardada primero
  e.respondWith(
    caches.match(req).then((r) => r || fetch(req).then((resp) => {
      if (resp.ok || resp.type === 'opaque') { const copia = resp.clone(); caches.open(VERSION).then((c) => c.put(req, copia)); }
      return resp;
    }))
  );
});
