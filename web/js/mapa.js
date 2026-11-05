/*
 * Mapa del Parque con la ruta de un equipo dibujada encima.
 * Las posiciones de las estaciones son píxeles del mapa original (torneo.json → x, y); el SVG usa esas mismas
 * coordenadas, así que encaja con la imagen sea cual sea el tamaño en pantalla.
 */
(function () {
  'use strict';
  const GK = window.GK;
  const C = window.GK_CONFIG;
  const M = C.mapa;

  function estrella(x, y, r) {
    let d = '';
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.5 : r;
      d += (i ? 'L' : 'M') + (x + Math.cos(a) * rr).toFixed(1) + ',' + (y + Math.sin(a) * rr).toFixed(1);
    }
    return d + 'Z';
  }

  /**
   * @param {object} o { orden: number[] (ruta, puede ir vacía), hechas: number, todas?: boolean }
   * @returns {string} HTML del mapa (usar después GK.activarMapa(contenedor) para el zoom)
   */
  GK.mapaRuta = function (o) {
    const orden = o.orden || [];
    const hechas = o.hechas || 0;
    const R = Math.round(M.ancho * 0.032);
    let lineas = '';
    for (let j = 0; j < orden.length - 1; j++) {
      const a = GK.estacion(orden[j]), b = GK.estacion(orden[j + 1]);
      const clase = j + 1 < hechas ? 'l-hecha' : j + 1 === hechas ? 'l-activa' : 'l-pendiente';
      lineas += `<line class="${clase}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`;
    }
    const enRuta = new Map(orden.map((s, i) => [s, i]));
    let marcas = '';
    // Primero las pendientes y la siguiente al final, para que quede encima
    const lista = [...C.estaciones].sort((a, b) => {
      const ea = enRuta.get(a.id) === hechas ? 1 : 0, eb = enRuta.get(b.id) === hechas ? 1 : 0;
      return ea - eb;
    });
    for (const e of lista) {
      const i = enRuta.has(e.id) ? enRuta.get(e.id) : -1;
      const estado = i < 0 ? 'neutra' : i < hechas ? 'hecha' : i === hechas ? 'siguiente' : 'pendiente';
      const r = estado === 'siguiente' ? R * 1.25 : R;
      marcas += `<g class="m m-${estado}" data-estacion="${e.id}">
        ${estado === 'siguiente' ? `<circle class="m-pulso" cx="${e.x}" cy="${e.y}" r="${r}"/>` : ''}
        <circle class="m-fondo" cx="${e.x}" cy="${e.y}" r="${r}"/>
        <path class="m-estrella" d="${estrella(e.x, e.y, r * 0.92)}"/>
        <text x="${e.x}" y="${e.y}" dy=".36em" style="font-size:${Math.round(r * 0.95)}px">${GK.html(e.letra)}</text>
        ${i >= 0 && !o.sinPasos ? `<text class="m-paso" x="${e.x + r * 0.95}" y="${e.y - r * 0.8}" style="font-size:${Math.round(r * 0.62)}px">${i + 1}</text>` : ''}
      </g>`;
    }
    return `<div class="mapa-caja" data-zoom="1"><div class="mapa-marco">
      <div class="mapa-lienzo">
        <img src="${M.imagen}" alt="Mapa del Parque de las Ciencias con las estaciones" width="${M.ancho}" height="${M.alto}" draggable="false">
        <svg viewBox="0 0 ${M.ancho} ${M.alto}" aria-hidden="true">
          <g class="m-lineas">${lineas}</g>${marcas}
        </svg>
      </div></div>
      <button type="button" class="mapa-zoom" aria-label="Ampliar el mapa">${GK.icono('lupa')}<span>Ampliar</span></button>
    </div>`;
  };

  /** Zoom y desplazamiento actuales (para conservarlos al repintar la pantalla). */
  GK.estadoMapa = function () {
    const c = document.querySelector('.mapa-caja');
    if (!c) return null;
    const m = c.querySelector('.mapa-marco');
    return { zoom: c.dataset.zoom, x: m.scrollLeft, y: m.scrollTop };
  };

  /** Botón de ampliar: al ampliar, centra el mapa en la siguiente estación. */
  GK.activarMapa = function (raiz, previo) {
    const caja = raiz.querySelector('.mapa-caja');
    if (!caja) return;
    const marco = caja.querySelector('.mapa-marco');
    const boton = caja.querySelector('.mapa-zoom');
    const poner = (z) => {
      caja.dataset.zoom = z;
      boton.querySelector('span').textContent = z === '1' ? 'Ampliar' : 'Ver entero';
      boton.setAttribute('aria-label', z === '1' ? 'Ampliar el mapa' : 'Ver el mapa entero');
    };
    const centrar = () => {
      const sig = caja.querySelector('.m-siguiente') || [...caja.querySelectorAll('.m-hecha')].pop();
      if (!sig) return;
      const e = GK.estacion(sig.dataset.estacion);
      const lienzo = marco.querySelector('.mapa-lienzo');
      marco.scrollLeft = (e.x / M.ancho) * lienzo.clientWidth - marco.clientWidth / 2;
      marco.scrollTop = (e.y / M.alto) * lienzo.clientHeight - marco.clientHeight / 2;
    };
    if (!caja.dataset.activo) {
      caja.dataset.activo = '1';
      boton.addEventListener('click', () => {
        const z = caja.dataset.zoom === '1' ? '3' : '1';
        poner(z);
        if (z !== '1') requestAnimationFrame(centrar);
      });
    }
    if (previo && previo.zoom && previo.zoom !== '1') {
      poner(previo.zoom);
      marco.scrollLeft = previo.x;
      marco.scrollTop = previo.y;
    }
  };
})();
