/*
 * Service worker: guarda la app en el móvil para que funcione sin cobertura.
 * Estrategia: responde desde la caché y, a la vez, busca la versión nueva en la red para la próxima vez.
 * Si añades archivos (por ejemplo una prueba nueva), ponlos en ARCHIVOS y sube VERSION.
 */
const VERSION = 'gk-v12';
const ARCHIVOS = [
  './',
  'index.html',
  'ranking.html',
  'manifest.webmanifest',
  'css/base.css',
  'css/app.css',
  'css/ranking.css',
  'js/config.js',
  'js/iconos.js',
  'js/util.js',
  'js/fondo.js',
  'js/datos.js',
  'js/constelacion.js',
  'js/escaner.js',
  'js/app.js',
  'js/ranking.js',
  'js/inicio.js',
  'js/pruebas/registro.js',
  'js/pruebas/codigo_estacion.js',
  'js/pruebas/morse.js',
  'js/pruebas/sstv_mano.js',
  'js/pruebas/binario.js',
  'js/pruebas/qr_escondido.js',
  'js/pruebas/wordle.js',
  'js/pruebas/geoguessr.js',
  'js/pruebas/real_o_ia.js',
  'js/pruebas/caja_fuerte.js',
  'js/pruebas/hackeo.js',
  'js/pruebas/bulo_verdad.js',
  'assets/img/pruebas/geo1.svg',
  'assets/img/pruebas/geo2.svg',
  'assets/img/pruebas/geo3.svg',
  'assets/img/pruebas/ia1.svg',
  'assets/img/pruebas/ia2.svg',
  'assets/img/pruebas/ia3.svg',
  'assets/img/pruebas/ia4.svg',
  'js/mapa.js',
  'js/instalar.js',
  'assets/img/icono-maskable-512.png',
  'assets/img/icono-apple-180.png',
  'assets/img/mapa.jpg',
  'vendor/jsQR.js',
  'assets/fonts/inter-latin-400-normal.woff2',
  'assets/fonts/inter-latin-600-normal.woff2',
  'assets/fonts/inter-latin-700-normal.woff2',
  'assets/fonts/merriweather-latin-900-normal.woff2',
  'assets/fonts/jetbrains-mono-latin-400-normal.woff2',
  'assets/fonts/jetbrains-mono-latin-700-normal.woff2',
  'assets/img/logo.svg',
  'assets/img/logo.jpg',
  'assets/img/logo.png',
  'assets/img/icono.svg',
  'assets/img/icono-192.png',
  'assets/img/icono-512.png',
];

self.addEventListener('install', (ev) => {
  ev.waitUntil(
    caches.open(VERSION).then((c) =>
      // Uno a uno: si falta algún archivo opcional (logo.jpg, logo.png) no se rompe la instalación.
      Promise.all(ARCHIVOS.map((a) => c.add(new Request(a, { cache: 'reload' })).catch(() => null)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (ev) => {
  const url = new URL(ev.request.url);
  // Firebase y cualquier otro dominio: siempre a la red, nunca a la caché.
  if (ev.request.method !== 'GET' || url.origin !== self.location.origin) return;
  ev.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const guardada = await cache.match(ev.request, { ignoreSearch: true });
      const red = fetch(ev.request)
        .then((r) => { if (r && r.ok) cache.put(ev.request, r.clone()); return r; })
        .catch(() => null);
      if (guardada) { ev.waitUntil(red); return guardada; }
      const r = await red;
      if (r) return r;
      if (ev.request.mode === 'navigate') return (await cache.match('index.html')) || Response.error();
      return Response.error();
    })
  );
});
