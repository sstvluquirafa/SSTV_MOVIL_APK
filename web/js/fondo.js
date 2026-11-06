/*
 * Cielo de fondo: estrellas de distinto brillo en 3 capas de profundidad (lejanas, medias y cercanas) dibujadas en un
 * <canvas>. Al hacer scroll, cada capa se desplaza un poco a su velocidad (paralaje): las cercanas, más.
 * No hay animación propia (nada titila): solo se repinta al hacer scroll o al cambiar el tamaño de la ventana.
 * Con «reducir movimiento» el cielo se queda quieto.
 */
(function () {
  'use strict';
  const lienzo = document.createElement('canvas');
  lienzo.id = 'cielo';
  lienzo.setAttribute('aria-hidden', 'true');
  document.body.prepend(lienzo);
  const ctx = lienzo.getContext('2d');
  const quieto = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Densidad (px² por estrella), radios, brillo y cuánto se mueven con el scroll
  const CAPAS = [
    { densidad: 2600, r: [0.35, 0.7], a: [0.25, 0.5], paralaje: 0.03 },
    { densidad: 9000, r: [0.6, 1.1], a: [0.45, 0.75], paralaje: 0.07 },
    { densidad: 38000, r: [1.1, 1.8], a: [0.75, 1], paralaje: 0.14 },
  ];
  // Casi todas blancas; algunas azuladas o cálidas, como en una foto de verdad
  const color = () => (Math.random() < 0.1 ? '255,226,170' : Math.random() < 0.22 ? '190,214,255' : '255,255,255');
  const entre = ([a, b]) => a + Math.random() * (b - a);

  let capas = [];
  let ancho = 0, alto = 0, dpr = 1, pendiente = false;

  function crear() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    ancho = window.innerWidth; alto = window.innerHeight;
    lienzo.width = ancho * dpr; lienzo.height = alto * dpr;
    capas = CAPAS.map((c) => ({
      ...c,
      estrellas: Array.from({ length: Math.round((ancho * alto) / c.densidad) }, () => ({
        x: Math.random() * ancho, y: Math.random() * alto, r: entre(c.r), a: entre(c.a), c: color(),
      })),
    }));
    dibujar();
  }

  function dibujar() {
    pendiente = false;
    const sy = quieto ? 0 : window.scrollY || 0;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, ancho, alto);
    for (const capa of capas) {
      const dy = (sy * capa.paralaje) % alto;
      for (const e of capa.estrellas) {
        let y = e.y - dy;
        if (y < 0) y += alto;
        ctx.fillStyle = `rgba(${e.c},${e.a.toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(e.x, y, e.r, 0, Math.PI * 2);
        ctx.fill();
        // Las más brillantes, con un halo suave
        if (e.r > 1.4) {
          ctx.fillStyle = `rgba(${e.c},0.12)`;
          ctx.beginPath();
          ctx.arc(e.x, y, e.r * 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }
  const repintar = () => { if (!pendiente) { pendiente = true; requestAnimationFrame(dibujar); } };

  // En el móvil, la barra del navegador cambia el alto al hacer scroll: entonces no se crean estrellas nuevas
  window.addEventListener('resize', () => {
    if (window.innerWidth !== ancho) return crear();
    alto = window.innerHeight;
    lienzo.height = alto * dpr;
    dibujar();
  });
  if (!quieto) window.addEventListener('scroll', repintar, { passive: true });
  crear();
})();
