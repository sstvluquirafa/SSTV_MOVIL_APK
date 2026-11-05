/*
 * Dibuja la ruta de un equipo como una constelación: cada estación es una estrella que se enciende al
 * completarla, unida con una línea a la siguiente de su ruta.
 * Todas las estaciones ocupan siempre el mismo sitio del «cielo», así los equipos ven la misma figura.
 */
(function () {
  'use strict';
  const GK = window.GK;
  const C = window.GK_CONFIG;

  /** Posiciones de las estaciones según el mapa real, encajadas en un lienzo de 400×300. */
  function posiciones() {
    const xs = C.estaciones.map((e) => e.x), ys = C.estaciones.map((e) => e.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const esc = Math.min(340 / Math.max(1, x1 - x0), 230 / Math.max(1, y1 - y0));
    const dx = (400 - (x1 - x0) * esc) / 2, dy = (300 - (y1 - y0) * esc) / 2;
    const pos = {};
    for (const e of C.estaciones) pos[e.id] = { x: dx + (e.x - x0) * esc, y: dy + (e.y - y0) * esc };
    return pos;
  }
  const POS = posiciones();

  const destello = (x, y, r) =>
    `M${x},${y - r} Q${x + r * 0.18},${y - r * 0.18} ${x + r},${y} Q${x + r * 0.18},${y + r * 0.18} ${x},${y + r} ` +
    `Q${x - r * 0.18},${y + r * 0.18} ${x - r},${y} Q${x - r * 0.18},${y - r * 0.18} ${x},${y - r}Z`;

  /**
   * @param {object} o  { ruta:number[], hechas:number, compacto?:boolean, etiquetas?:boolean }
   * @returns {string} SVG
   */
  GK.constelacion = function (o) {
    const ruta = o.ruta;
    const hechas = o.hechas;
    const etiquetas = o.etiquetas !== false;
    const uid = 'c' + Math.random().toString(36).slice(2, 8);
    let lineas = '';
    for (let j = 0; j < ruta.length - 1; j++) {
      const a = POS[ruta[j]], b = POS[ruta[j + 1]];
      const clase = j + 1 < hechas ? 'l-hecha' : j + 1 === hechas && j < hechas ? 'l-activa' : 'l-pendiente';
      lineas += `<line class="${clase}" x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}"/>`;
    }
    let estrellas = '';
    ruta.forEach((s, i) => {
      const p = POS[s];
      const x = p.x.toFixed(1), y = p.y.toFixed(1);
      const estado = i < hechas ? 'hecha' : i === hechas ? 'siguiente' : 'pendiente';
      let figura;
      if (estado === 'hecha') {
        figura = `<circle class="halo" cx="${x}" cy="${y}" r="14" fill="url(#${uid}h)"/>` +
          `<path class="estrella" d="${destello(p.x, p.y, 11)}"/><circle cx="${x}" cy="${y}" r="3.2" fill="#fff"/>`;
      } else if (estado === 'siguiente') {
        figura = `<circle class="pulso" cx="${x}" cy="${y}" r="9"/><circle class="anillo" cx="${x}" cy="${y}" r="9"/>` +
          `<circle cx="${x}" cy="${y}" r="4" fill="#fdba74"/>`;
      } else {
        figura = `<circle cx="${x}" cy="${y}" r="3.4" class="apagada"/>`;
      }
      const dy = p.y < 150 ? -17 : 25;
      const texto = etiquetas ? `<text x="${x}" y="${(p.y + dy).toFixed(1)}" class="et-${estado}">${GK.html(GK.letra(s))}</text>` : '';
      const salida = i === 0 && etiquetas && !o.compacto
        ? `<text x="${x}" y="${(p.y + (dy < 0 ? dy - 13 : dy + 13)).toFixed(1)}" class="et-salida">SALIDA</text>` : '';
      estrellas += `<g class="est est-${estado}" data-estacion="${s}">${figura}${texto}${salida}</g>`;
    });
    return `<svg class="constelacion${o.compacto ? ' compacta' : ''}" viewBox="0 0 400 300" role="img"
      aria-label="Ruta: ${hechas} de ${ruta.length} estaciones completadas">
      <defs><radialGradient id="${uid}h"><stop offset="0" stop-color="#fbbf24" stop-opacity=".75"/><stop offset="1" stop-color="#fbbf24" stop-opacity="0"/></radialGradient></defs>
      <g class="lineas">${lineas}</g>${estrellas}</svg>`;
  };
})();
