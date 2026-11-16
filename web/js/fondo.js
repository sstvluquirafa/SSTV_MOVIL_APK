/*
 * Cielo de fondo en un <canvas>, muy ligero:
 *   - estrellas en 3 capas (lejanas, medias y cercanas) de distinto tamaño y brillo; al hacer scroll cada capa se
 *     desplaza a su velocidad (paralaje). Cada capa se dibuja UNA vez en un lienzo aparte y luego solo se copia;
 *   - unas pocas estrellas parpadean suavemente;
 *   - cada 20–40 s un satélite (un punto de luz) cruza el cielo despacio y, muy de vez en cuando, una estrella fugaz.
 * Rendimiento: como mucho 30 fotogramas por segundo; se para cuando la app no está visible (visibilitychange).
 * Con «reducir movimiento» se dibuja una vez y se queda quieto (sin paralaje, parpadeo, satélites ni fugaces).
 * La nebulosa de color de cada estación y el borde de la Tierra de «Ruta» van en CSS (app.css).
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
  const PARPADEAN = 14;          // estrellas que parpadean (se mueven con la capa media)
  const FOTOGRAMA = 1000 / 30;   // 30 fps como mucho
  // Casi todas blancas; algunas azuladas o cálidas, como en una foto de verdad
  const color = () => (Math.random() < 0.1 ? '255,226,170' : Math.random() < 0.22 ? '190,214,255' : '255,255,255');
  const entre = ([a, b]) => a + Math.random() * (b - a);

  let capas = [];
  let parpadeo = [];
  let ancho = 0, alto = 0, dpr = 1;
  let satelite = null, fugaz = null;
  let proxSatelite = 0, proxFugaz = 0;
  let ultimo = 0, bucle = 0;

  function crear() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    ancho = window.innerWidth; alto = window.innerHeight;
    lienzo.width = ancho * dpr; lienzo.height = alto * dpr;
    capas = CAPAS.map((c) => {
      const capa = document.createElement('canvas');
      capa.width = ancho * dpr; capa.height = alto * dpr;
      const k = capa.getContext('2d');
      k.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round((ancho * alto) / c.densidad);
      for (let i = 0; i < n; i++) {
        const x = Math.random() * ancho, y = Math.random() * alto, r = entre(c.r), a = entre(c.a), col = color();
        k.fillStyle = `rgba(${col},${a.toFixed(2)})`;
        k.beginPath(); k.arc(x, y, r, 0, Math.PI * 2); k.fill();
        if (r > 1.4) { // las más brillantes, con un halo suave
          k.fillStyle = `rgba(${col},0.12)`;
          k.beginPath(); k.arc(x, y, r * 3, 0, Math.PI * 2); k.fill();
        }
      }
      return { lienzo: capa, paralaje: c.paralaje };
    });
    parpadeo = Array.from({ length: PARPADEAN }, () => ({
      x: Math.random() * ancho, y: Math.random() * alto, r: entre([0.9, 1.5]),
      fase: Math.random() * Math.PI * 2, vel: entre([0.6, 1.4]), paralaje: 0.07,
    }));
    dibujar(performance.now());
  }

  /** Copia una capa con su desplazamiento (dos trozos para que el cielo «dé la vuelta»). */
  function pegar(capa, sy) {
    const dy = ((sy * capa.paralaje) % alto + alto) % alto;
    ctx.drawImage(capa.lienzo, 0, -dy * dpr);
    if (dy) ctx.drawImage(capa.lienzo, 0, (alto - dy) * dpr);
  }

  function dibujar(t) {
    const sy = quieto ? 0 : window.scrollY || 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, lienzo.width, lienzo.height);
    for (const capa of capas) pegar(capa, sy);
    if (quieto) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Parpadeo suave
    for (const e of parpadeo) {
      const a = 0.25 + 0.65 * (0.5 + 0.5 * Math.sin((t / 1000) * e.vel + e.fase));
      let y = e.y - ((sy * e.paralaje) % alto);
      if (y < 0) y += alto;
      ctx.fillStyle = `rgba(255,255,255,${a.toFixed(2)})`;
      ctx.beginPath(); ctx.arc(e.x, y, e.r, 0, Math.PI * 2); ctx.fill();
    }
    // Satélite: punto de luz que cruza despacio (con algún destello)
    if (satelite) {
      const p = (t - satelite.t0) / satelite.dur;
      if (p >= 1) { satelite = null; proxSatelite = t + entre([20000, 40000]); } // el siguiente, 20–40 s después
      else {
        const x = satelite.x0 + (satelite.x1 - satelite.x0) * p, y = satelite.y0 + (satelite.y1 - satelite.y0) * p;
        const brillo = 0.55 + 0.35 * Math.sin(p * Math.PI) + (Math.sin(t / 260) > 0.97 ? 0.3 : 0);
        ctx.fillStyle = 'rgba(200,220,255,0.18)';
        ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(235,243,255,${Math.min(1, brillo).toFixed(2)})`;
        ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI * 2); ctx.fill();
      }
    }
    // Estrella fugaz: una raya corta que se apaga
    if (fugaz) {
      const p = (t - fugaz.t0) / fugaz.dur;
      if (p >= 1) fugaz = null;
      else {
        const x = fugaz.x + fugaz.dx * p, y = fugaz.y + fugaz.dy * p;
        const g = ctx.createLinearGradient(x, y, x - fugaz.dx * 0.25, y - fugaz.dy * 0.25);
        g.addColorStop(0, `rgba(255,255,255,${(1 - p).toFixed(2)})`);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.strokeStyle = g; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - fugaz.dx * 0.25, y - fugaz.dy * 0.25); ctx.stroke();
      }
    }
  }

  function programar(t) {
    if (!satelite && t >= proxSatelite) {
      if (proxSatelite) {
        const izq = Math.random() < 0.5;
        satelite = { t0: t, dur: entre([22000, 34000]), x0: izq ? -10 : ancho + 10, x1: izq ? ancho + 10 : -10,
          y0: entre([0.08, 0.6]) * alto, y1: entre([0.08, 0.6]) * alto };
        proxSatelite = Infinity; // se programa el siguiente al terminar este
      } else proxSatelite = t + entre([20000, 40000]);
    }
    if (!fugaz && t >= proxFugaz) {
      if (proxFugaz) {
        const dx = entre([140, 240]) * (Math.random() < 0.5 ? 1 : -1);
        fugaz = { t0: t, dur: 900, x: entre([0.2, 0.8]) * ancho, y: entre([0.05, 0.35]) * alto, dx, dy: entre([60, 110]) };
      }
      proxFugaz = t + entre([45000, 110000]); // muy de vez en cuando
    }
  }

  function paso(t) {
    bucle = requestAnimationFrame(paso);
    if (t - ultimo < FOTOGRAMA - 1) return; // (1 ms de margen: a 60 y 120 Hz salen 30 fps justos, no 20)
    ultimo = t;
    programar(t);
    dibujar(t);
  }
  function arrancar() { if (!quieto && !bucle && !document.hidden) { ultimo = 0; bucle = requestAnimationFrame(paso); } }
  function parar() { if (bucle) cancelAnimationFrame(bucle); bucle = 0; }

  // En el móvil, la barra del navegador cambia un poco el alto al hacer scroll: entonces no se crean estrellas nuevas
  window.addEventListener('resize', () => {
    if (window.innerWidth !== ancho || Math.abs(window.innerHeight - alto) > 160) crear();
  });
  document.addEventListener('visibilitychange', () => (document.hidden ? parar() : arrancar()));
  crear();
  arrancar();
})();
