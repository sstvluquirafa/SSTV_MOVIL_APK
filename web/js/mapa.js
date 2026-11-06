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
   * @param {object} o { orden: number[] (ruta, puede ir vacía), hechas: number,
   *                     meta?: null | 'siguiente' | 'hecha'  (la meta solo se dibuja si se indica) }
   * @returns {string} HTML del mapa (usar después GK.activarMapa(contenedor) para moverlo y acercarlo)
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
    const meta = o.meta && C.meta ? C.meta : null;
    if (meta && orden.length) {
      const u = GK.estacion(orden[orden.length - 1]);
      lineas += `<line class="${o.meta === 'hecha' ? 'l-meta-hecha' : 'l-meta'}" x1="${u.x}" y1="${u.y}" x2="${meta.x}" y2="${meta.y}"/>`;
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
      marcas += `<g class="m m-${estado}" data-x="${e.x}" data-y="${e.y}" style="transform-origin:${e.x}px ${e.y}px">
        ${estado === 'siguiente' ? `<circle class="m-pulso" cx="${e.x}" cy="${e.y}" r="${r}"/>` : ''}
        <circle class="m-fondo" cx="${e.x}" cy="${e.y}" r="${r}"/>
        <path class="m-estrella" d="${estrella(e.x, e.y, r * 0.92)}"/>
        <text x="${e.x}" y="${e.y}" dy=".36em" style="font-size:${Math.round(r * 0.95)}px">${GK.html(e.letra)}</text>
        ${i >= 0 && !o.sinPasos ? `<text class="m-paso" x="${e.x + r * 0.95}" y="${e.y - r * 0.8}" style="font-size:${Math.round(r * 0.62)}px">${i + 1}</text>` : ''}
      </g>`;
    }
    if (meta) {
      // La meta: estrella verde con «M», encima de todo
      const sig = o.meta === 'siguiente';
      const r = sig ? R * 1.3 : R * 1.1;
      marcas += `<g class="m m-meta${sig ? ' m-siguiente' : ' m-hecha'}" data-x="${meta.x}" data-y="${meta.y}" style="transform-origin:${meta.x}px ${meta.y}px">
        ${sig ? `<circle class="m-pulso" cx="${meta.x}" cy="${meta.y}" r="${r}"/>` : ''}
        <circle class="m-fondo" cx="${meta.x}" cy="${meta.y}" r="${r}"/>
        <path class="m-estrella" d="${estrella(meta.x, meta.y, r * 0.92)}"/>
        <text x="${meta.x}" y="${meta.y}" dy=".36em" style="font-size:${Math.round(r * 0.95)}px">M</text>
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

  /** Zoom y desplazamiento actuales del mapa interactivo (para conservarlos al repintar la pantalla). */
  GK.estadoMapa = function () {
    const c = document.querySelector('.mapa-caja.mapa-activo');
    if (!c || !c._visor) return null;
    const v = c._visor;
    return { s: v.s, tx: v.tx, ty: v.ty };
  };

  /**
   * Visor del mapa: un marco de tamaño fijo en el que el mapa se mueve arrastrando y se acerca pellizcando, con la
   * rueda del ratón, con doble toque o con los botones + y −. Al abrirse, se centra en la siguiente estación.
   * Antes el zoom ensanchaba la imagen y el marco crecía con ella (la página entera se desplazaba y el botón se
   * perdía); ahora el marco nunca cambia de tamaño y solo se transforma el lienzo.
   * Las marcas se mantienen de un tamaño legible sea cual sea el zoom (variable CSS --m).
   */
  GK.activarMapa = function (raiz, previo) {
    const caja = raiz.querySelector('.mapa-caja');
    if (!caja || caja.closest('.mapa-previa')) return; // la miniatura de «Ruta» es un enlace: no se toca
    let v = caja._visor;
    if (!v) v = caja._visor = crearVisor(caja);
    if (previo && previo.s) { v.s = previo.s; v.tx = previo.tx; v.ty = previo.ty; v.aplicar(); }
  };

  const RADIO_MARCA = 15; // radio de las marcas en pantalla (px)

  function crearVisor(caja) {
    caja.classList.add('mapa-activo');
    const marco = caja.querySelector('.mapa-marco');
    const lienzo = caja.querySelector('.mapa-lienzo');
    lienzo.style.width = M.ancho + 'px'; // tamaño original: el zoom lo hace transform
    const viejo = caja.querySelector('.mapa-zoom');
    if (viejo) viejo.remove();
    caja.insertAdjacentHTML('beforeend', `<div class="mapa-controles">
        <button type="button" class="mapa-boton" data-accion="mas" aria-label="Acercar el mapa">${GK.icono('mas')}</button>
        <button type="button" class="mapa-boton" data-accion="menos" aria-label="Alejar el mapa">${GK.icono('menos')}</button>
        <button type="button" class="mapa-boton" data-accion="centrar" aria-label="Centrar en la siguiente estación">${GK.icono('centrar')}</button>
      </div>`);
    const R = Math.round(M.ancho * 0.032);
    const v = { s: 1, tx: 0, ty: 0 };
    const medida = () => ({ w: marco.clientWidth || 1, h: marco.clientHeight || 1 });
    const limites = () => {
      const { w, h } = medida();
      const entero = Math.min(w / M.ancho, h / M.alto); // se ve el Parque entero
      const lleno = Math.max(w / M.ancho, h / M.alto); //  el mapa llena el marco
      return { entero, lleno, max: Math.max(lleno * 5, entero * 12) };
    };
    v.aplicar = () => {
      const { w, h } = medida();
      const L = limites();
      v.s = Math.min(L.max, Math.max(L.entero, v.s));
      const mw = M.ancho * v.s, mh = M.alto * v.s;
      v.tx = mw <= w ? (w - mw) / 2 : Math.min(0, Math.max(w - mw, v.tx));
      v.ty = mh <= h ? (h - mh) / 2 : Math.min(0, Math.max(h - mh, v.ty));
      lienzo.style.transform = `translate(${v.tx}px, ${v.ty}px) scale(${v.s})`;
      caja.style.setProperty('--m', Math.min(1, RADIO_MARCA / (R * v.s)).toFixed(4));
      caja.dataset.zoom = v.s > L.entero * 1.01 ? '3' : '1';
      caja.querySelector('[data-accion="mas"]').disabled = v.s >= L.max * 0.999;
      caja.querySelector('[data-accion="menos"]').disabled = v.s <= L.entero * 1.001;
    };
    /** Acerca o aleja manteniendo quieto el punto (x, y) del marco. */
    const zoomEn = (x, y, factor) => {
      const L = limites();
      const s = Math.min(L.max, Math.max(L.entero, v.s * factor));
      v.tx = x - ((x - v.tx) / v.s) * s;
      v.ty = y - ((y - v.ty) / v.s) * s;
      v.s = s;
      v.aplicar();
    };
    const centrar = () => {
      const m = caja.querySelector('.m-siguiente') || [...caja.querySelectorAll('.m-hecha')].pop();
      const { w, h } = medida();
      v.s = Math.max(v.s, limites().lleno);
      const x = m ? Number(m.dataset.x) : M.ancho / 2;
      const y = m ? Number(m.dataset.y) : M.alto / 2;
      v.tx = w / 2 - x * v.s;
      v.ty = h / 2 - y * v.s;
      v.aplicar();
    };
    v.s = 0; // centrar() lo sube a «lleno»
    centrar();

    caja.querySelector('.mapa-controles').addEventListener('click', (ev) => {
      const b = ev.target.closest('.mapa-boton');
      if (!b) return;
      const { w, h } = medida();
      if (b.dataset.accion === 'mas') zoomEn(w / 2, h / 2, 1.6);
      else if (b.dataset.accion === 'menos') zoomEn(w / 2, h / 2, 1 / 1.6);
      else centrar();
    });

    // Arrastrar con un dedo (o el ratón) y pellizcar con dos
    const punteros = new Map();
    const punto = (ev) => {
      const r = marco.getBoundingClientRect();
      return { x: ev.clientX - r.left, y: ev.clientY - r.top };
    };
    const centroYDistancia = () => {
      const [a, b] = [...punteros.values()];
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
    };
    marco.addEventListener('pointerdown', (ev) => {
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      punteros.set(ev.pointerId, punto(ev));
      try { marco.setPointerCapture(ev.pointerId); } catch (e) { /* */ }
      caja.classList.add('tocado', 'moviendo');
    });
    marco.addEventListener('pointermove', (ev) => {
      if (!punteros.has(ev.pointerId)) return;
      const antes = punteros.size === 2 ? centroYDistancia() : null;
      const anterior = punteros.get(ev.pointerId);
      const ahora = punto(ev);
      punteros.set(ev.pointerId, ahora);
      if (antes) {
        const despues = centroYDistancia();
        v.tx += despues.x - antes.x;
        v.ty += despues.y - antes.y;
        zoomEn(despues.x, despues.y, despues.d / antes.d);
      } else if (punteros.size === 1) {
        v.tx += ahora.x - anterior.x;
        v.ty += ahora.y - anterior.y;
        v.aplicar();
      }
    });
    const soltar = (ev) => {
      punteros.delete(ev.pointerId);
      if (!punteros.size) caja.classList.remove('moviendo');
    };
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((t) => marco.addEventListener(t, soltar));
    marco.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      const p = punto(ev);
      zoomEn(p.x, p.y, Math.exp(-ev.deltaY * (ev.deltaMode ? 0.05 : 0.0015)));
    }, { passive: false });
    marco.addEventListener('dblclick', (ev) => { const p = punto(ev); zoomEn(p.x, p.y, 2); });

    // Si cambia el tamaño (girar el móvil, la barra del navegador…), se recoloca sin salirse
    if (window.ResizeObserver) new ResizeObserver(() => v.aplicar()).observe(marco);
    return v;
  }
})();
