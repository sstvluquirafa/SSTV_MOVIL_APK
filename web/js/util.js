/* Utilidades comunes: normalización, huellas criptográficas, almacenamiento y rutas. */
(function () {
  'use strict';
  const GK = (window.GK = window.GK || {});
  const C = window.GK_CONFIG;

  /** Minúsculas, sin tildes, solo letras y cifras (igual que normalizar() en generar_torneo.py). */
  GK.normalizar = function (texto) {
    return String(texto ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]/g, '');
  };

  const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
  const deHex = (h) => new Uint8Array(h.match(/../g).map((x) => parseInt(x, 16)));

  GK.criptoDisponible = !!(window.crypto && window.crypto.subtle);

  /** PBKDF2-SHA256 (mismas iteraciones que el generador) → hex. */
  GK.huella = async function (texto, salHex) {
    const clave = await crypto.subtle.importKey('raw', new TextEncoder().encode(GK.normalizar(texto)), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: deHex(salHex), iterations: C.iteraciones },
      clave,
      256
    );
    return hex(bits);
  };

  GK.sha256 = async function (texto) {
    return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(texto))));
  };

  const deB64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

  /** Deshace la ofuscación del Wordle (XOR con la sal + base64). Igual que ofuscar() en generar_torneo.py. */
  GK.desofuscar = function (b64, salHex) {
    const k = deHex(salHex);
    const b = deB64(b64).map((x, i) => x ^ k[i % k.length]);
    return new TextDecoder().decode(b);
  };

  /**
   * Descifra un texto cifrado con la respuesta de la prueba (explicaciones que se enseñan al acertar).
   * Igual que cifrar() en generar_torneo.py. Con una respuesta incorrecta sale basura (o null).
   */
  GK.descifrar = async function (b64, respuesta, salHex) {
    const enc = new TextEncoder();
    return descifrarCon(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(`gk-explicacion:${GK.normalizar(respuesta)}:${salHex}`))), b64);
  };

  /**
   * Abre un «sello» de una parte de prueba (igual que sellar() en generar_torneo.py): va cifrado con la huella de una
   * respuesta válida. Devuelve el trozo de clave que guarda, o null si la huella no es la de esa respuesta.
   */
  GK.abrirSello = async function (b64, huellaHex) {
    const t = await descifrarCon(deHex(huellaHex), b64);
    return t && t.startsWith('gk:') ? t.slice(3) : null;
  };

  /** Flujo SHA-256(k + i) en modo contador, XOR con los datos. */
  async function descifrarCon(k, b64) {
    try {
      const datos = deB64(b64);
      const flujo = new Uint8Array(Math.ceil((datos.length + 1) / 32) * 32);
      for (let i = 0; i * 32 < flujo.length; i++) {
        const bloque = new Uint8Array(k.length + 4);
        bloque.set(k);
        new DataView(bloque.buffer).setUint32(k.length, i);
        flujo.set(new Uint8Array(await crypto.subtle.digest('SHA-256', bloque)), i * 32);
      }
      return new TextDecoder('utf-8', { fatal: true }).decode(datos.map((x, i) => x ^ flujo[i]));
    } catch (e) { return null; }
  }

  /** localStorage a prueba de navegadores privados o bloqueados. */
  GK.guardar = function (clave, valor) {
    try { localStorage.setItem('gk:' + clave, JSON.stringify(valor)); } catch (e) { /* sin almacenamiento */ }
  };
  GK.leer = function (clave, porDefecto) {
    try {
      const v = localStorage.getItem('gk:' + clave);
      return v === null ? porDefecto : JSON.parse(v);
    } catch (e) { return porDefecto; }
  };
  GK.borrar = function (clave) {
    try { localStorage.removeItem('gk:' + clave); } catch (e) { /* nada */ }
  };

  /* ---------- Torneo ---------- */
  GK.equipo = (id) => C.equipos.find((e) => e.id === Number(id));
  GK.estacion = (id) => C.estaciones.find((e) => e.id === Number(id));
  GK.letra = (id) => (GK.estacion(id) || {}).letra || String(id);
  GK.ruta = (id) => C.rutas.find((r) => r.id === Number(id)) || null;
  GK.totalEstaciones = () => C.estaciones.length;

  /**
   * Rutas repartidas por orden de llegada: {equipos: {idEquipo: "idRuta"}, rutas: {idRuta: "idEquipo"}}.
   * La mantiene al día datos.js con lo que llega de /vivo/asignacion.
   */
  GK.asignacion = { equipos: {}, rutas: {} };
  GK.rutaDeEquipo = (idEquipo) => {
    const r = GK.asignacion.equipos && GK.asignacion.equipos[idEquipo];
    return r != null ? GK.ruta(r) : null;
  };

  /**
   * Situación de un equipo a partir de su progreso ({idEstacion | 'final' | 'meta': {t}}).
   * Solo cuenta lo hecho en el orden de su ruta, sin huecos: las estaciones, después la palabra final
   * («Última transmisión») y por último la meta.
   *   hechas / total / faltan / siguiente → solo las estaciones (10)
   *   completas    → todas las estaciones hechas
   *   palabraHecha → han acertado la palabra final
   *   enMeta       → han escaneado la meta: han TERMINADO (terminado === enMeta)
   *   paso         → lo que les toca ahora: id de estación, 'final', 'meta' o null
   *   pasos        → estaciones + palabra + meta hechas (para el ranking); totalPasos = total + 2
   *   ultima       → instante del último paso hecho (la llegada a la meta si han terminado)
   */
  GK.situacion = function (idEquipo, progreso) {
    const eq = GK.equipo(idEquipo);
    const ruta = GK.rutaDeEquipo(idEquipo);
    const total = GK.totalEstaciones();
    if (!ruta) {
      return { equipo: eq, ruta: null, orden: [], hechas: 0, total, faltan: [], siguiente: null, terminado: false, ultima: null,
        completas: false, palabraHecha: false, enMeta: false, paso: null, pasos: 0, totalPasos: total + 2 };
    }
    const p = progreso || {};
    let hechas = 0;
    let ultima = null;
    for (const s of ruta.orden) {
      if (!p[s]) break;
      hechas++;
      ultima = Math.max(ultima || 0, Number(p[s].t) || 0);
    }
    const completas = hechas === ruta.orden.length;
    const palabraHecha = completas && !!p.final;
    const enMeta = palabraHecha && !!p.meta;
    if (palabraHecha) ultima = Math.max(ultima || 0, Number(p.final.t) || 0);
    if (enMeta) ultima = Math.max(ultima || 0, Number(p.meta.t) || 0);
    return {
      equipo: eq,
      ruta,
      orden: ruta.orden,
      hechas,
      total: ruta.orden.length,
      faltan: ruta.orden.slice(hechas),
      siguiente: ruta.orden[hechas] ?? null,
      completas,
      palabraHecha,
      enMeta,
      terminado: enMeta,
      paso: !completas ? ruta.orden[hechas] : !palabraHecha ? 'final' : !enMeta ? 'meta' : null,
      pasos: hechas + (palabraHecha ? 1 : 0) + (enMeta ? 1 : 0),
      totalPasos: ruta.orden.length + 2,
      ultima,
    };
  };

  /* ---------- Palabra final ---------- */
  /** Letra de la palabra final que da una estación (torneo.json → palabra_final.letras). */
  GK.letraPalabra = (id) => (GK.estacion(id) || {}).letraPalabra || '';
  /** Letras conseguidas, en el orden en que las consiguieron (el de su ruta). */
  GK.letrasConseguidas = (sit) => sit.orden.slice(0, sit.hechas).map(GK.letraPalabra);

  /**
   * Clasificación: más pasos hechos primero (estaciones, palabra final y meta); en empate, el que llegó antes
   * a ese número. Un equipo termina al llegar a la meta. Los equipos sin ruta todavía van al final.
   */
  GK.clasificar = function (progresoPorEquipo) {
    return C.equipos
      .map((e) => GK.situacion(e.id, progresoPorEquipo[e.id]))
      .sort((a, b) =>
        (b.ruta ? 1 : 0) - (a.ruta ? 1 : 0) ||
        b.pasos - a.pasos ||
        (a.pasos === 0 ? 0 : (a.ultima ?? Infinity) - (b.ultima ?? Infinity)) ||
        (a.ruta && b.ruta ? a.ruta.id - b.ruta.id : 0) ||
        a.equipo.id - b.equipo.id
      );
  };

  GK.metros = (m) => (m >= 1000 ? (m / 1000).toFixed(1).replace('.', ',') + ' km' : m + ' m');

  /**
   * Tiempo de juego transcurrido hasta el instante t (ms), descontando las pausas.
   * Una pausa sin «hasta» sigue en marcha: cuenta hasta t (el reloj queda parado).
   */
  GK.tiempoJuego = function (estado, t) {
    if (!estado || !estado.inicio || t == null) return null;
    let total = t - estado.inicio;
    for (const p of Object.values(estado.pausas || {})) {
      if (!p || p.desde == null) continue;
      const hasta = p.hasta != null ? p.hasta : t;
      total -= Math.max(0, Math.min(hasta, t) - Math.max(p.desde, estado.inicio));
    }
    return Math.max(0, total);
  };
  GK.enPausa = (estado) => !!(estado && estado.inicio && !estado.iniciada);

  GK.formatoTiempo = function (ms) {
    if (ms == null || ms < 0 || !isFinite(ms)) return '--:--';
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = String(s % 60).padStart(2, '0');
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${String(m).padStart(2, '0')}:${ss}`;
  };

  /**
   * Pruebas por partes (Morse, Pelis…): cada parte es un <section class="parte"> con un .campo y un .parte-marca.
   * Devuelve { campos, marcar(i, 'ok' | 'no' | null) }. Al escribir en una parte que no está acertada, se le quita
   * la marca y se llama a alEscribir(i, valor) (para guardar lo escrito en el móvil).
   */
  GK.partes = function (contenedor, alEscribir) {
    const tarjetas = [...contenedor.querySelectorAll('.parte')];
    const campos = tarjetas.map((t) => t.querySelector('.campo'));
    const marcar = (i, estado) => {
      const t = tarjetas[i];
      t.classList.toggle('acierto', estado === 'ok');
      t.classList.toggle('fallo', estado === 'no');
      t.querySelector('.parte-marca').innerHTML = estado === 'ok' ? '<span aria-hidden="true">✓</span> Acertada'
        : estado === 'no' ? '<span aria-hidden="true">✗</span> Todavía no' : '';
      if (campos[i]) campos[i].setAttribute('aria-invalid', String(estado === 'no'));
    };
    campos.forEach((c, i) => c && c.addEventListener('input', () => {
      if (!tarjetas[i].classList.contains('acierto')) marcar(i, null);
      if (alEscribir) alEscribir(i, c.value);
    }));
    return { campos, marcar };
  };

  /**
   * Formulario de una prueba por partes con sellos (Morse, Pelis, Binario, QR): marca ✓ / ✗ en cada parte, guarda lo
   * escrito en el móvil y, cuando están todas bien, supera la estación con la unión de los trozos.
   *   opciones.ctx, opciones.contenedor (con un <form> y <section class="parte"> con su .campo), opciones.sellos (uno
   *   por parte), opciones.guardado (clave de GK.guardar), opciones.limpiar (texto → lo que se comprueba; por defecto
   *   el texto tal cual), opciones.extra(textos, trozos) → Promise<mensaje|null> (aviso especial antes del genérico),
   *   opciones.nombre ('pregunta', 'película'…) y opciones.consejo (qué revisar cuando alguna está mal).
   */
  GK.formularioPartes = function (o) {
    const { ctx, contenedor } = o;
    const escrito = GK.leer(o.guardado, []);
    const partes = GK.partes(contenedor, (i, valor) => { escrito[i] = valor; GK.guardar(o.guardado, escrito); ctx.ayuda(''); });
    partes.campos.forEach((c, i) => { if (escrito[i] && !c.value) c.value = escrito[i]; });
    const form = contenedor.querySelector('form.partes');
    const boton = form.querySelector('button[type="submit"]');
    const limpiar = o.limpiar || ((x) => x);
    const n = o.sellos.length;
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const textos = partes.campos.map((c) => limpiar(c.value));
      if (!textos.some((x) => GK.normalizar(x))) return ctx.ayuda('Escribid al menos una respuesta antes de comprobar.', 'info');
      boton.disabled = true;
      const textoBoton = boton.textContent;
      boton.textContent = 'Comprobando…';
      const trozos = await Promise.all(textos.map((x, i) => ctx.parte(x, o.sellos[i])));
      trozos.forEach((tr, i) => partes.marcar(i, !GK.normalizar(textos[i]) ? null : tr ? 'ok' : 'no'));
      const bien = trozos.filter(Boolean).length;
      const extra = bien < n && o.extra ? await o.extra(textos, trozos) : null;
      if (bien === n) {
        if (await ctx.intentar(trozos.join(''))) { GK.borrar(o.guardado); return; }
        ctx.ayuda('Están todas bien, pero no se ha podido guardar. Avisad a la organización.');
      } else if (extra) {
        ctx.ayuda(extra, 'info');
      } else if (textos.some((x) => !GK.normalizar(x))) {
        ctx.ayuda(`Lleváis ${bien} de ${n}. Os falta alguna ${o.nombre || 'respuesta'}.`, 'info');
      } else {
        ctx.ayuda(`Lleváis ${bien} de ${n}. Revisad las marcadas con ✗${o.consejo ? ': ' + o.consejo : '.'}`);
      }
      boton.disabled = false;
      boton.textContent = textoBoton;
    });
    return partes;
  };

  GK.html = function (cadena) {
    return String(cadena ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  };

  /** Vibración solo si el usuario ya ha tocado la página (si no, Chrome la bloquea y lo anota como error). */
  GK.vibrar = function (patron) {
    try {
      const ua = navigator.userActivation;
      if (navigator.vibrate && (!ua || ua.hasBeenActive)) navigator.vibrate(patron);
    } catch (e) { /* sin vibración */ }
  };

  GK.menosMovimiento = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Ventana de confirmación propia (sin alert/confirm del navegador). botones: [[texto, valor, clase]] */
  GK.modal = function (html, botones) {
    const capa = document.createElement('div');
    capa.className = 'modal';
    capa.innerHTML = `<div class="modal-caja tarjeta" role="dialog" aria-modal="true">${html}<div class="modal-botones"></div></div>`;
    const caja = capa.querySelector('.modal-botones');
    return new Promise((res) => {
      const cerrar = (v) => { capa.remove(); document.removeEventListener('keydown', esc); res(v); };
      const esc = (ev) => { if (ev.key === 'Escape') cerrar(null); };
      botones.forEach(([texto, valor, clase]) => {
        const b = document.createElement('button');
        b.className = clase || 'boton-sec';
        b.textContent = texto;
        b.onclick = () => cerrar(typeof valor === 'function' ? valor(capa) : valor);
        caja.appendChild(b);
      });
      capa.addEventListener('click', (ev) => { if (ev.target === capa) cerrar(null); });
      document.addEventListener('keydown', esc);
      document.body.appendChild(capa);
      (capa.querySelector('input') || caja.firstChild).focus();
    });
  };

  /** Título con una palabra destacada en ámbar (como «Explorador Enigma»). */
  GK.tituloHTML = function (titulo, destacado) {
    const t = GK.html(titulo);
    if (!destacado || !titulo.includes(destacado)) return t;
    return t.replace(GK.html(destacado), `<span class="ambar">${GK.html(destacado)}</span>`);
  };
})();
