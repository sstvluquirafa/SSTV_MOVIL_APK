/* Detalles comunes al arrancar cualquier página: logo, modo demo, aviso de cripto y service worker. */
(function () {
  'use strict';
  const GK = window.GK;
  const C = window.GK_CONFIG;
  const logo = document.getElementById('logo');
  if (logo && C.logo) logo.src = C.logo;
  const sub = document.getElementById('marca-sub');
  if (sub && C.titulo) sub.textContent = C.titulo + (C.lugar ? ' · ' + C.lugar : '');
  if (GK.datos && GK.datos.modo === 'demo') {
    const b = document.getElementById('banda-demo');
    if (b) b.classList.remove('oculto');
  }
  if (!GK.criptoDisponible) {
    const a = document.getElementById('sin-cripto');
    if (a) a.classList.remove('oculto');
  }
  // La app funciona sin conexión gracias al service worker (solo en https o localhost).
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker no registrado:', e));
  }
})();
