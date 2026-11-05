/* Cielo estrellado de fondo (ligero: se dibuja en un <canvas> y titila despacio). */
(function () {
  'use strict';
  const lienzo = document.createElement('canvas');
  lienzo.id = 'cielo';
  lienzo.setAttribute('aria-hidden', 'true');
  document.body.prepend(lienzo);
  const ctx = lienzo.getContext('2d');
  const quieto = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let estrellas = [];
  let ancho = 0, alto = 0, dpr = 1;

  function crear() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    ancho = window.innerWidth; alto = window.innerHeight;
    lienzo.width = ancho * dpr; lienzo.height = alto * dpr;
    const n = Math.round((ancho * alto) / 5200);
    estrellas = Array.from({ length: n }, () => ({
      x: Math.random() * ancho,
      y: Math.random() * alto,
      r: Math.random() < 0.08 ? 1.3 + Math.random() * 0.9 : 0.4 + Math.random() * 0.8,
      f: Math.random() * Math.PI * 2,
      v: 0.4 + Math.random() * 1.2,
      c: Math.random() < 0.12 ? '253,230,138' : Math.random() < 0.2 ? '186,214,255' : '255,255,255',
    }));
    dibujar(0);
  }

  function dibujar(t) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, ancho, alto);
    for (const e of estrellas) {
      const a = quieto ? 0.7 : 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(e.f + (t / 1000) * e.v));
      ctx.fillStyle = `rgba(${e.c},${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  let ultimo = 0;
  function bucle(t) {
    if (t - ultimo > 80) { dibujar(t); ultimo = t; } // ~12 fps: suficiente y gasta poca batería
    requestAnimationFrame(bucle);
  }
  window.addEventListener('resize', crear);
  crear();
  if (!quieto) requestAnimationFrame(bucle);
})();
