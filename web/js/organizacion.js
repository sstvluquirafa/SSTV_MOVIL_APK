/* Panel de organización: salida, pausa, correcciones a mano y reinicio. */
(function () {
  'use strict';
  const GK = window.GK;
  const C = window.GK_CONFIG;
  const $ = (s, r = document) => r.querySelector(s);
  const vista = $('#vista');
  const org = GK.datos.organizacion;

  let estado = null;
  let progreso = {};
  let ayudas = {};
  let mensajes = {};
  let ayudasVistas = null; // ids ya conocidos, para sonar solo con los nuevos
  const ATASCO = (C.avisos && C.avisos.atascoMin) || 10;
  const URL_NTFY = C.avisos && C.avisos.tema ? `${C.avisos.ntfy}/${C.avisos.tema}` : '';

  /** Pitido corto (Web Audio, sin archivos) para avisar de una petición de ayuda nueva. */
  function pitido() {
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.22].forEach((t0) => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.frequency.value = 880; o.connect(g); g.connect(ac.destination);
        g.gain.setValueAtTime(0.0001, ac.currentTime + t0);
        g.gain.exponentialRampToValueAtTime(0.3, ac.currentTime + t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + t0 + 0.18);
        o.start(ac.currentTime + t0); o.stop(ac.currentTime + t0 + 0.2);
      });
    } catch (e) { /* sin audio */ }
    GK.vibrar([200, 100, 200]);
  }

  function entrada(error) {
    $('#salir').classList.add('oculto');
    vista.innerHTML = `
      <section class="org-entrada">
        <p class="antetitulo">Acceso restringido</p>
        <h1 class="titulo">Panel de <span class="ambar">organización</span></h1>
        <form class="tarjeta" id="form-org" autocomplete="off">
          <label class="etiqueta" for="codigo-org">Código de organización</label>
          <input id="codigo-org" class="campo campo-codigo" type="password" autocapitalize="characters" spellcheck="false" required>
          <button class="boton boton-ancho" type="submit">Entrar</button>
          ${error ? `<div class="aviso aviso-error">${GK.html(error)}</div>` : ''}
          <p class="texto-2 nota">El código está en <span class="mono">privado/secretos.json</span> y en la hoja de monitores.</p>
        </form>
      </section>`;
    $('#codigo-org').focus();
    $('#form-org').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const cod = $('#codigo-org').value;
      const b = ev.target.querySelector('button');
      b.disabled = true; b.textContent = 'Comprobando…';
      if ((await GK.huella(cod, C.organizacion.sal)) !== C.organizacion.huella) return entrada('Código incorrecto.');
      try {
        await org.entrar(cod);
        panel();
      } catch (e) {
        entrada(e.estado === 0
          ? 'El código es correcto, pero ahora mismo no hay conexión con Firebase. Comprueba internet y prueba otra vez en unos segundos.'
          : 'El código es correcto, pero el servidor no lo acepta (' + e.message + '). ¿Has importado firebase_importar.json en Firebase?');
      }
    });
  }

  async function accion(fn, okTexto) {
    try {
      await fn();
      if (okTexto) nota(okTexto, 'ok');
    } catch (e) {
      nota(e.estado === 0 ? 'No hay conexión con Firebase ahora mismo: prueba otra vez en unos segundos.'
        : 'No se ha podido: ' + e.message + (e.estado === 403 || e.estado === 401 ? ' (permiso denegado: pulsa SALIR y vuelve a entrar con el código)' : ''), 'error');
    }
  }
  function nota(texto, tipo) {
    const n = $('#nota');
    if (!n) return;
    n.innerHTML = `<div class="aviso aviso-${tipo}">${GK.html(texto)}</div>`;
    clearTimeout(nota.t);
    nota.t = setTimeout(() => { n.innerHTML = ''; }, 5000);
  }

  /** Contenido que todavía falta por poner (lo que depende del sitio real o de la organización). */
  function avisarPendientes() {
    const caja = $('#pendientes');
    if (!caja) return;
    const faltan = [];
    const pintar = () => {
      caja.innerHTML = faltan.map((t) => `<div class="aviso aviso-info">${GK.icono('campana')} ${GK.html(t)}</div>`).join('');
    };
    for (const e of C.estaciones) {
      const p = e.prueba || {};
      if (p.tipo === 'qr_escondido' && [p.escondite, p.pista].some((t) => !t || /^\s*ESCRIBE AQU/i.test(t))) {
        faltan.push(`Falta el escondite de la estación ${e.letra}: escribidlo en torneo.json (escondite y pista).`);
      }
      if (p.tipo === 'real_o_ia') {
        // Las imágenes que no cargan (la falsa la genera la organización): ver ia-falsa-AQUI.txt
        (p.imagenes || []).forEach((im) => {
          const img = new Image();
          img.onerror = () => {
            const t = `Falta una imagen de la estación ${e.letra} (¿Real o IA?): leed web/assets/img/pruebas/ia-falsa-AQUI.txt.`;
            if (!faltan.includes(t)) faltan.push(t);
            pintar();
          };
          img.src = im.src;
        });
      }
    }
    pintar();
  }

  function panel() {
    $('#salir').classList.remove('oculto');
    vista.innerHTML = `
      <section class="org-cabecera">
        <div>
          <p class="antetitulo">${GK.html(C.lugar || '')}</p>
          <h1 class="titulo">Control de <span class="ambar">misión</span></h1>
        </div>
        <div class="org-estado tarjeta">
          <div><span class="etiqueta">Estado</span><div id="estado-texto" class="estado-texto">—</div></div>
          <div><span class="etiqueta">Tiempo</span><div id="reloj" class="mono estado-reloj">--:--</div></div>
          <div class="org-botones" id="botones-estado"></div>
        </div>
      </section>
      <div id="nota" aria-live="polite"></div>
      <div id="pendientes"></div>
      <section id="ayudas" class="ayudas" aria-live="polite"></section>
      <section class="ventana">
        <div class="ventana-barra"><span class="puntos"><i></i><i></i><i></i></span><span>RX_MONITOR · EQUIPOS</span></div>
        <div class="tabla-envoltura">
          <table class="tabla-org">
            <thead><tr><th>Equipo</th><th>Ruta</th><th>Recorrido</th><th>Hechas</th><th>Siguiente</th><th>Final</th><th>Sin avanzar</th><th>Acciones</th></tr></thead>
            <tbody id="filas"></tbody>
          </table>
        </div>
      </section>
      <section class="tarjeta org-ntfy">
        <div>
          <p class="antetitulo">Avisos en vuestro móvil (ntfy)</p>
          ${URL_NTFY ? `<p class="texto-2">Instalad la app <b>ntfy</b> (Android o iPhone) y suscribíos al tema <b class="mono">${GK.html(C.avisos.tema)}</b>
            (o abrid <a href="${GK.html(URL_NTFY)}" target="_blank" rel="noopener">${GK.html(URL_NTFY)}</a>). Os llegará un aviso cuando un equipo pida ayuda
            o lleve más de ${ATASCO} min sin completar una estación.</p>` : '<p class="texto-2">No hay tema de ntfy configurado.</p>'}
        </div>
        ${URL_NTFY ? `<button class="boton-sec" id="probar-ntfy">${GK.icono('campana')} Enviar aviso de prueba</button>` : ''}
      </section>
      <section class="tarjeta zona-peligro">
        <div>
          <p class="antetitulo">Zona peligrosa</p>
          <p class="texto-2">Borra el progreso, las rutas repartidas y las ayudas, y deja la gymkhana sin empezar.
            Los móviles se desvinculan: los equipos vuelven a unirse con su tarjeta y las rutas se reparten de nuevo por orden de llegada.</p>
        </div>
        <button class="boton-sec boton-peligro" id="reiniciar">${GK.icono('reinicio')} Reiniciar todo</button>
      </section>`;

    avisarPendientes();
    $('#reiniciar').onclick = async () => {
      const ok = await GK.modal(
        '<h2 class="titulo">¿Reiniciar todo?</h2><p>Se borrará el progreso de los equipos. No se puede deshacer.</p>' +
        '<label class="etiqueta" for="conf">Escribe REINICIAR para confirmar</label><input id="conf" class="campo" autocomplete="off">',
        [['Cancelar', null], ['Reiniciar', (capa) => $('#conf', capa).value.trim().toUpperCase() === 'REINICIAR', 'boton-sec boton-peligro']]);
      if (ok) accion(org.reiniciar, 'Gymkhana reiniciada.');
      else if (ok === false) nota('No se ha reiniciado (confirmación no escrita).', 'info');
    };
    const probar = $('#probar-ntfy');
    if (probar) probar.onclick = async () => {
      try {
        const r = await fetch(`${URL_NTFY}?title=${encodeURIComponent('Prueba de avisos')}&tags=satellite`, { method: 'POST', body: 'Si ves esto, los avisos de la gymkhana te llegarán al móvil.' });
        nota(r.ok ? 'Aviso de prueba enviado: mira la app ntfy.' : `ntfy respondió con un error (${r.status}).`, r.ok ? 'ok' : 'error');
      } catch (e) { nota('No se ha podido enviar: ¿hay conexión?', 'error'); }
    };
    pintar();
  }

  function pintarAyudas() {
    const caja = $('#ayudas');
    if (!caja) return;
    const lista = [];
    for (const [eq, porId] of Object.entries(ayudas || {})) {
      for (const [id, a] of Object.entries(porId || {})) if (!a.resuelta) lista.push({ eq: Number(eq), id, ...a });
    }
    lista.sort((a, b) => a.t - b.t);
    // Sonido solo con las nuevas (no al abrir el panel)
    const ids = new Set(lista.map((a) => a.eq + ':' + a.id));
    if (ayudasVistas && [...ids].some((i) => !ayudasVistas.has(i))) pitido();
    ayudasVistas = ids;
    document.title = (lista.length ? `(${lista.length}) ` : '') + 'Organización · Gymkhana SSTV';
    if (!lista.length) { caja.innerHTML = ''; return; }
    caja.innerHTML = `<div class="ventana ventana-alerta">
      <div class="ventana-barra"><span class="puntos"><i></i><i></i><i></i></span><span>RX_MONITOR · PETICIONES DE AYUDA (${lista.length})</span></div>
      <ul class="lista-ayudas">${lista.map((a) => {
        const sit = GK.situacion(a.eq, progreso[a.eq]);
        return `<li>
          <div><b>${GK.html(GK.equipo(a.eq).nombre)}</b> · ${a.estacion ? `estación <b>${GK.html(GK.letra(a.estacion))}</b> (paso ${a.paso}/${sit.total})` : a.paso === sit.total + 1 ? '<b>palabra final</b>' : a.paso === sit.total + 2 ? '<b>camino de la meta</b>' : 'sin estación'}
            <div class="texto-2">${GK.html(a.motivo)} · hace ${Math.max(0, Math.round((Date.now() - a.t) / 60000))} min</div></div>
          <div class="acciones">
            <button class="boton-sec mini" data-msj="${a.eq}">${GK.icono('mensaje')} Mensaje</button>
            ${a.estacion && sit.siguiente === a.estacion ? `<button class="boton-sec mini" data-marcar="${a.eq}">Marcar ${GK.html(GK.letra(a.estacion))}</button>` : ''}
            <button class="boton mini" data-resolver="${a.eq}:${a.id}">Resuelta</button>
          </div></li>`;
      }).join('')}</ul></div>`;
    caja.querySelectorAll('[data-resolver]').forEach((b) => b.onclick = () => {
      const [eq, id] = b.dataset.resolver.split(':');
      accion(() => org.resolverAyuda(eq, id));
    });
    caja.querySelectorAll('[data-msj]').forEach((b) => b.onclick = () => escribirMensaje(Number(b.dataset.msj)));
    caja.querySelectorAll('[data-marcar]').forEach((b) => b.onclick = () => marcarSiguiente(Number(b.dataset.marcar)));
  }

  async function escribirMensaje(id) {
    const actual = mensajes[id] && mensajes[id].texto;
    const texto = await GK.modal(
      `<h2 class="titulo">Mensaje al ${GK.html(GK.equipo(id).nombre)}</h2><p class="texto-2">Les aparece en la app, encima de su ruta. Por ejemplo, una pista.</p>
       <label class="etiqueta" for="txt-msj">Mensaje</label><input id="txt-msj" class="campo" maxlength="160" autocomplete="off" value="${GK.html(actual || '')}">`,
      [['Cancelar', null], ...(actual ? [['Borrar mensaje', '', 'boton-sec boton-peligro']] : []), ['Enviar', (capa) => $('#txt-msj', capa).value.trim() || null, 'boton']]);
    if (texto === null) return;
    accion(() => org.mensaje(id, texto), texto ? `Mensaje enviado al ${GK.equipo(id).nombre}.` : 'Mensaje borrado.');
  }

  /** Nombre de un paso: estación (letra), palabra final o meta. */
  const nombrePaso = (paso) => (paso === 'final' ? 'la palabra final' : paso === 'meta' ? 'la llegada a la meta' : `la estación ${GK.letra(paso)}`);

  async function marcarSiguiente(id) {
    const sit = GK.situacion(id, progreso[id]);
    if (!sit.ruta || sit.paso == null) return;
    const que = nombrePaso(sit.paso);
    if (await GK.modal(`<p>¿Marcar <b>${que}</b> como superada para el <b>${GK.html(GK.equipo(id).nombre)}</b>?</p><p class="texto-2">Úsalo si no consiguen hacerla, se han quedado sin batería o hay algún problema.</p>`, [['Cancelar', false], ['Marcar', true, 'boton']]))
      accion(() => org.marcar(id, sit.paso), `Marcada ${que} para el ${GK.equipo(id).nombre}.`);
  }

  /** Meta a mano (por ejemplo, llegan sin batería): marca la palabra final si falta y la llegada, con la hora de ahora. */
  async function marcarMeta(id) {
    const sit = GK.situacion(id, progreso[id]);
    if (!sit.completas || sit.enMeta) return;
    if (await GK.modal(`<p>¿Marcar que el <b>${GK.html(GK.equipo(id).nombre)}</b> ha <b>llegado a la meta</b> ahora?</p>${sit.palabraHecha ? '' : '<p class="texto-2">Todavía no han acertado la palabra final: también se marcará.</p>'}<p class="texto-2">Su tiempo será el de este momento.</p>`, [['Cancelar', false], ['Marcar meta', true, 'boton']]))
      accion(() => org.marcarMeta(id, !sit.palabraHecha), `${GK.equipo(id).nombre} en meta.`);
  }

  async function cambiarRuta(id) {
    const actual = GK.asignacion.equipos[id];
    const opciones = C.rutas.map((r) => {
      const de = GK.asignacion.rutas[r.id];
      return `<option value="${r.id}" ${String(actual) === String(r.id) ? 'selected' : ''}>Ruta ${r.id} · ≈${GK.metros(r.metros)}${de && String(de) !== String(id) ? ` (la tiene el ${GK.html(GK.equipo(de).nombre)}: se intercambian)` : ''}</option>`;
    }).join('');
    const sit = GK.situacion(id, progreso[id]);
    const r = await GK.modal(
      `<h2 class="titulo">Ruta del ${GK.html(GK.equipo(id).nombre)}</h2>
       ${sit.hechas ? '<p class="aviso aviso-error">Este equipo ya ha empezado: si le cambias la ruta, su progreso dejará de contar en el orden nuevo.</p>' : ''}
       <label class="etiqueta" for="sel-ruta">Ruta</label><select id="sel-ruta" class="campo">${opciones}</select>`,
      [['Cancelar', null], ['Asignar', (capa) => $('#sel-ruta', capa).value, 'boton']]);
    if (r) accion(() => org.asignarRuta(id, r), `Ruta ${r} asignada al ${GK.equipo(id).nombre}.`);
  }

  function pintarEstado() {
    const t = $('#estado-texto');
    if (!t) return;
    const b = $('#botones-estado');
    if (estado && estado.iniciada) {
      t.innerHTML = '<span class="chip chip-verde"><span class="led"></span>EN MARCHA</span>';
      b.innerHTML = `<button class="boton-sec" id="b-parar">${GK.icono('pausa')} Pausar</button>`;
      $('#b-parar').onclick = async () => {
        if (await GK.modal('<p>¿Pausar la gymkhana? Los equipos no podrán completar estaciones hasta reanudarla.</p>', [['Cancelar', false], ['Pausar', true, 'boton']]))
          accion(org.parar, 'Gymkhana en pausa.');
      };
    } else if (estado && estado.inicio) {
      t.innerHTML = '<span class="chip chip-ambar"><span class="led"></span>EN PAUSA</span>';
      b.innerHTML = `<button class="boton" id="b-reanudar">${GK.icono('play')} Reanudar</button>`;
      $('#b-reanudar').onclick = () => accion(() => org.reanudar(estado), 'Gymkhana reanudada.');
    } else {
      t.innerHTML = '<span class="chip"><span class="led"></span>SIN EMPEZAR</span>';
      b.innerHTML = `<button class="boton" id="b-salida">${GK.icono('play')} Dar la salida</button>`;
      $('#b-salida').onclick = async () => {
        if (await GK.modal('<h2 class="titulo">¿Dar la salida?</h2><p>Empieza a contar el tiempo y los equipos ya pueden completar estaciones.</p>', [['Cancelar', false], ['¡Salida!', true, 'boton']]))
          accion(org.iniciar, '¡Salida dada!');
      };
    }
  }

  function pintar() {
    pintarEstado();
    pintarAyudas();
    const filas = $('#filas');
    if (!filas) return;
    const inicio = estado && estado.inicio;
    filas.innerHTML = C.equipos.map((e) => {
      const sit = GK.situacion(e.id, progreso[e.id]);
      const p = progreso[e.id] || {};
      const desde = sit.ruta && inicio && estado.iniciada && !sit.terminado ? Math.max(inicio, sit.ultima || 0) : null;
      const quieto = desde ? GK.tiempoJuego(estado, Date.now()) - GK.tiempoJuego(estado, desde) : null;
      const tarde = quieto != null && quieto > ATASCO * 60000;
      const tiempoFinal = sit.terminado && inicio ? GK.formatoTiempo(GK.tiempoJuego(estado, sit.ultima)) : null;
      const msj = mensajes[e.id];
      return `<tr class="${sit.terminado ? 'terminado' : ''}${tarde ? ' atascado' : ''}">
        <td><b>${GK.html(e.nombre)}</b>${msj ? ` <span title="Tiene un mensaje: ${GK.html(msj.texto)}">${GK.icono('mensaje')}</span>` : ''}</td>
        <td class="mono">${sit.ruta ? `<button class="enlace" data-ruta="${e.id}">${sit.ruta.id} · ≈${GK.metros(sit.ruta.metros)}</button>` : `<button class="enlace" data-ruta="${e.id}">— asignar</button>`}</td>
        <td>${sit.ruta ? `<div class="estrellas">${sit.orden.map((s, i) => `<span class="${i < sit.hechas ? 'on' : i === sit.hechas ? 'sig' : ''}${p[s] && p[s].manual ? ' manual' : ''}" title="${p[s] && p[s].manual ? 'Marcada a mano' : GK.html(GK.estacion(s).nombre)}">${GK.html(GK.letra(s))}</span>`).join('')}</div>` : '<span class="texto-2">Sin unirse o sin ruta</span>'}</td>
        <td class="mono"><b>${sit.hechas}</b>/${sit.total}</td>
        <td class="mono">${sit.terminado ? `<span class="completo">FIN ${tiempoFinal || ''}</span>` : sit.paso === 'final' ? 'Palabra' : sit.paso === 'meta' ? 'Meta' : sit.siguiente != null ? GK.html(GK.letra(sit.siguiente)) : '—'}</td>
        <td class="final-estado">${sit.enMeta ? `<span class="chip chip-verde" title="Ha llegado a la meta${p.meta && p.meta.manual ? ' (marcado a mano)' : ''}">⚑ EN META${p.meta && p.meta.manual ? ' *' : ''}</span>` : sit.palabraHecha ? `<span class="chip chip-ambar" title="Palabra final acertada${p.final && p.final.manual ? ' (marcada a mano)' : ''}">★ PALABRA</span>` : sit.completas ? '<span class="texto-2">descifrando</span>' : '<span class="texto-2">—</span>'}</td>
        <td class="mono">${quieto != null ? `${tarde ? '⚠ ' : ''}${GK.formatoTiempo(quieto)}` : '—'}</td>
        <td class="acciones">
          <button class="boton-sec mini" data-msj="${e.id}" title="Enviar un mensaje al equipo">${GK.icono('mensaje')}</button>
          <button class="boton-sec mini" data-mas="${e.id}" ${!sit.ruta || sit.paso == null ? 'disabled' : ''} title="Marcar el siguiente paso como hecho">${GK.icono('mas')}</button>
          <button class="boton-sec mini" data-menos="${e.id}" ${sit.pasos ? '' : 'disabled'} title="Deshacer el último paso">${GK.icono('menos')}</button>
          <button class="boton-sec mini" data-meta="${e.id}" ${sit.completas && !sit.enMeta ? '' : 'disabled'} title="Marcar la llegada a la meta a mano">${GK.icono('bandera')}</button>
        </td></tr>`;
    }).join('');
    filas.querySelectorAll('[data-mas]').forEach((b) => b.onclick = () => marcarSiguiente(Number(b.dataset.mas)));
    filas.querySelectorAll('[data-meta]').forEach((b) => b.onclick = () => marcarMeta(Number(b.dataset.meta)));
    filas.querySelectorAll('[data-msj]').forEach((b) => b.onclick = () => escribirMensaje(Number(b.dataset.msj)));
    filas.querySelectorAll('[data-ruta]').forEach((b) => b.onclick = () => cambiarRuta(Number(b.dataset.ruta)));
    filas.querySelectorAll('[data-menos]').forEach((b) => b.onclick = async () => {
      const id = Number(b.dataset.menos);
      const sit = GK.situacion(id, progreso[id]);
      const ult = sit.enMeta ? 'meta' : sit.palabraHecha ? 'final' : sit.orden[sit.hechas - 1];
      const que = nombrePaso(ult);
      if (await GK.modal(`<p>¿Deshacer <b>${que}</b> del <b>${GK.html(GK.equipo(id).nombre)}</b>?</p>`, [['Cancelar', false], ['Deshacer', true, 'boton-sec boton-peligro']]))
        accion(() => org.desmarcar(id, ult), `Deshecha ${que}.`);
    });
  }

  setInterval(() => {
    const r = $('#reloj');
    if (!r) return;
    r.textContent = GK.formatoTiempo(GK.tiempoJuego(estado, Date.now()));
  }, 500);

  $('#salir').onclick = () => { org.salir(); entrada(); };
  GK.datos.escuchar('estado', (v) => { estado = v; pintarEstado(); });
  GK.datos.escuchar('progreso', (v) => { progreso = v || {}; pintar(); });
  GK.datos.escuchar('asignacion', () => pintar());
  GK.datos.escuchar('ayudas', (v) => { ayudas = v || {}; pintarAyudas(); });
  GK.datos.escuchar('mensajes', (v) => { mensajes = v || {}; pintar(); });
  setInterval(() => { if (!document.querySelector('.modal')) pintar(); }, 30000); // «sin avanzar» y «hace X min»
  if (org.activa()) panel(); else entrada();
})();
