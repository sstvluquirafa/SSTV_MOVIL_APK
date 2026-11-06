/*
 * El progreso como una órbita: un CubeSat da la vuelta a la Tierra y cada estación es una marca de la órbita.
 * Las superadas se encienden (fósforo) y el satélite está en la del paso actual. Cuando el equipo avanza, el
 * satélite viaja por la órbita hasta su nueva marca (una sola vez; sin movimiento con «reducir movimiento»).
 */
(function () {
  'use strict';
  const GK = window.GK;
  const CX = 160, CY = 66, RX = 142, RY = 40, PLANETA = 33;
  const quieto = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Ángulo de la marca i (empieza a la izquierda y pasa primero por delante de la Tierra). */
  const angulo = (i, total) => Math.PI - (i * 2 * Math.PI) / total;
  const punto = (t) => ({ x: CX + RX * Math.cos(t), y: CY + RY * Math.sin(t) });

  const CUBESAT = `<g class="o-sat">
      <rect class="o-panel" x="-19" y="-3.5" width="11" height="7" rx="1"/>
      <rect class="o-panel" x="8" y="-3.5" width="11" height="7" rx="1"/>
      <rect class="o-cuerpo" x="-6" y="-6" width="12" height="12" rx="2"/>
      <path class="o-antena" d="M0-6v-5"/>
    </g>`;

  /**
   * @param {number} hechas estaciones superadas
   * @param {number} total  estaciones de la ruta
   * @returns {string} SVG de la órbita
   */
  GK.orbita = function (hechas, total) {
    const n = Math.max(1, total);
    const actual = Math.min(hechas, n);
    let atras = '', delante = '';
    for (let i = 0; i < n; i++) {
      const t = angulo(i, n);
      const p = punto(t);
      const estado = i < hechas ? 'hecha' : i === actual ? 'actual' : 'pendiente';
      const marca = `<circle class="o-marca o-${estado}" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${estado === 'hecha' ? 4.6 : 3.6}"/>`;
      if (Math.sin(t) < -0.05) atras += marca; else delante += marca;
    }
    const sat = punto(angulo(actual, n));
    return `<svg class="orbita" viewBox="0 0 320 132" role="img" aria-label="Órbita de la misión: ${hechas} de ${total} estaciones superadas">
      <defs>
        <radialGradient id="o-tierra" cx="38%" cy="32%" r="75%">
          <stop offset="0" stop-color="#2f6fd6"/><stop offset=".55" stop-color="#143a86"/><stop offset="1" stop-color="#081a45"/>
        </radialGradient>
      </defs>
      <path class="o-linea o-linea-atras" d="M${CX - RX} ${CY}A${RX} ${RY} 0 0 1 ${CX + RX} ${CY}"/>
      ${atras}
      <circle class="o-atmosfera" cx="${CX}" cy="${CY}" r="${PLANETA + 3}"/>
      <circle cx="${CX}" cy="${CY}" r="${PLANETA}" fill="url(#o-tierra)"/>
      <path class="o-tierra-luz" d="M${CX - 22} ${CY - 20}q10 -9 24 -8 q-6 7 -3 13 q-9 4 -15 1z M${CX + 6} ${CY + 8}q9 -3 15 3 q-2 9 -11 10 q-6 -5 -4 -13z"/>
      <path class="o-linea" d="M${CX - RX} ${CY}A${RX} ${RY} 0 0 0 ${CX + RX} ${CY}"/>
      ${delante}
      <g class="o-sat-pos" data-paso="${actual}" data-total="${n}" transform="translate(${sat.x.toFixed(1)} ${sat.y.toFixed(1)})"><g transform="scale(1.3)">${CUBESAT}</g></g>
    </svg>`;
  };

  /**
   * Si el equipo ha avanzado desde la última vez que vio la órbita, el satélite viaja por ella desde la marca
   * anterior hasta la actual. `clave` identifica al equipo (se guarda el último paso visto).
   */
  GK.animarOrbita = function (raiz, clave) {
    const g = raiz.querySelector('.o-sat-pos');
    if (!g) return;
    const hasta = Number(g.dataset.paso), n = Number(g.dataset.total);
    const visto = GK.leer('orbita:' + clave, null);
    GK.guardar('orbita:' + clave, hasta);
    if (visto == null || visto >= hasta || quieto()) return;
    const t0 = angulo(visto, n), t1 = angulo(hasta, n);
    const colocar = (t) => { const p = punto(t); g.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`); };
    colocar(t0);
    const dur = 900 + 250 * (hasta - visto);
    let inicio = null;
    const paso = (ahora) => {
      if (!g.isConnected) return;
      if (inicio == null) inicio = ahora;
      const k = Math.min(1, (ahora - inicio) / dur);
      const suave = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      colocar(t0 + (t1 - t0) * suave);
      if (k < 1) requestAnimationFrame(paso);
    };
    setTimeout(() => requestAnimationFrame(paso), 350);
  };
})();
