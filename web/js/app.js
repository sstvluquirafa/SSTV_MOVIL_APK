/* App del móvil: una sola página con rutas #/… */
(function () {
  'use strict';
  const GK = window.GK;
  const C = window.GK_CONFIG;
  const $ = (sel, raiz = document) => raiz.querySelector(sel);
  const vista = $('#vista');
  const MOTIVOS = ['No encontramos la estación', 'No sabemos resolver la prueba', 'El QR o la app no funcionan', 'Otro problema'];

  let estadoTorneo = null;
  let ronda = 0;
  let progresoServidor = {};
  let mensajeOrg = null;
  let cancelar = [];
  let limpiarVista = null;
  let relojId = null;

  /* ---------- Equipo y progreso ---------- */
  const miEquipo = () => GK.leer('equipo', null);
  const progresoLocal = (id) => GK.leer('progreso:' + id, {});
  function progreso(id) {
    // Unión de lo hecho en este móvil y lo que ya consta en el servidor (otros móviles del equipo).
    return { ...progresoServidor, ...progresoLocal(id) };
  }
  const situacion = () => { const eq = miEquipo(); return eq ? GK.situacion(eq.id, progreso(eq.id)) : null; };

  function suscribirEquipo() {
    cancelar.forEach((f) => f());
    cancelar = [];
    const eq = miEquipo();
    if (!eq) return;
    cancelar.push(GK.datos.escuchar('progreso/' + eq.id, (v) => {
      progresoServidor = v || {};
      // Si la organización ha borrado progreso (corrección), el servidor manda.
      const local = progresoLocal(eq.id);
      const pendientes = new Set(GK.datos.pendientes().filter((o) => o.tipo === 'completar').map((o) => String(o.estacion)));
      let cambio = false;
      for (const s of Object.keys(local)) {
        if (!progresoServidor[s] && !pendientes.has(String(s))) { delete local[s]; cambio = true; }
      }
      if (cambio) GK.guardar('progreso:' + eq.id, local);
      refrescar();
    }));
    cancelar.push(GK.datos.escuchar('asignacion/equipos/' + eq.id, (r) => {
      // Sin ruta todavía: se pide (la primera libre, por orden de llegada).
      if (r == null && !GK.datos.pendientes().some((o) => o.tipo === 'asignar')) {
        GK.datos.encolar({ tipo: 'asignar', equipo: eq.id });
      }
      refrescar();
    }));
    cancelar.push(GK.datos.escuchar('mensajes/' + eq.id, (m) => {
      const antes = mensajeOrg;
      mensajeOrg = m;
      if (m && (!antes || antes.t !== m.t) && GK.leer('mensajeVisto', 0) !== m.t) GK.vibrar([120, 80, 120]);
      pintarMensaje();
    }));
  }

  /** Si la organización reinicia (ronda nueva), este móvil se desvincula y hay que volver a unirse. */
  function comprobarRonda() {
    const eq = miEquipo();
    if (!eq || (eq.ronda || 0) >= ronda) return;
    GK.borrar('equipo');
    GK.borrar('progreso:' + eq.id);
    GK.borrar('avisosAtasco');
    GK.datos.vaciarCola();
    cancelar.forEach((f) => f());
    cancelar = [];
    progresoServidor = {};
    mensajeOrg = null;
    GK.guardar('avisoReinicio', true);
    ir('#/unirse');
  }

  /* ---------- Cabecera y mensajes ---------- */
  function pintarCabecera() {
    const eq = miEquipo();
    const chipEq = $('#chip-equipo');
    const chipProg = $('#chip-progreso');
    if (!eq) { chipEq.classList.add('oculto'); chipProg.classList.add('oculto'); return; }
    const sit = situacion();
    chipEq.classList.remove('oculto');
    chipProg.classList.remove('oculto');
    chipEq.textContent = GK.equipo(eq.id).nombre.toUpperCase();
    chipProg.textContent = `${sit.hechas}/${sit.total}`;
  }
  GK.datos.onEstado((e) => {
    const chip = $('#chip-red');
    const pend = e.pendientes;
    chip.className = 'chip ' + (pend ? (e.rechazadas ? 'chip-rojo' : 'chip-ambar') : e.enLinea ? 'chip-verde' : 'chip-ambar');
    chip.innerHTML = `<span class="led"></span>${pend ? `${pend} PEND.` : e.enLinea ? 'EN LÍNEA' : 'SIN RED'}`;
    chip.title = e.ultimoError || (pend ? 'Hay avances guardados en el móvil que se enviarán al recuperar la cobertura' : 'Conectado');
    const aviso = $('#aviso-cola');
    if (aviso) aviso.classList.toggle('oculto', !e.rechazadas);
  });

  function pintarMensaje() {
    const caja = $('#mensaje-org');
    if (!caja) return;
    const m = mensajeOrg;
    if (!m || GK.leer('mensajeVisto', 0) === m.t) { caja.innerHTML = ''; return; }
    caja.innerHTML = `
      <div class="mensaje-org" role="alert">
        <div class="mensaje-org-icono">${GK.icono('mensaje')}</div>
        <div><p class="antetitulo">Mensaje de la organización</p><p>${GK.html(m.texto)}</p></div>
        <button class="boton-sec mini" type="button">Entendido</button>
      </div>`;
    caja.querySelector('button').onclick = () => { GK.guardar('mensajeVisto', m.t); pintarMensaje(); };
  }

  /* ---------- Ayuda y avisos a la organización ---------- */
  function enviarAviso(motivo, automatico) {
    const eq = miEquipo();
    const sit = situacion();
    const est = sit && sit.siguiente != null ? GK.estacion(sit.siguiente) : null;
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const nombre = GK.equipo(eq.id).nombre;
    const donde = est ? `estación ${est.letra} (paso ${sit.hechas + 1}/${sit.total})` : 'sin estación asignada';
    GK.datos.encolar({ tipo: 'ayuda', id: 'ayuda:' + id, idAyuda: id, equipo: eq.id, motivo, estacion: est ? est.id : 0, paso: sit ? sit.hechas + 1 : 0 });
    GK.datos.encolar({
      tipo: 'ntfy', id: 'ntfy:' + id,
      titulo: automatico ? `${nombre} lleva un rato atascado` : `${nombre} pide ayuda`,
      texto: `${automatico ? `Más de ${C.avisos.atascoMin} min sin completar la ` : ''}${donde}${automatico ? '' : ` · ${motivo}`}`,
      prioridad: automatico ? 4 : 5,
      etiquetas: automatico ? 'hourglass_flowing_sand' : 'sos',
    });
  }

  async function pedirAyuda() {
    const ultima = GK.leer('ultimaAyuda', 0);
    if (Date.now() - ultima < 120000) {
      return GK.modal('<p>Ya habéis avisado hace un momento. <b>La organización está en camino</b> o os escribirá aquí.</p>', [['Vale', true, 'boton']]);
    }
    const motivo = await GK.modal(
      '<h2 class="titulo">¿Qué os pasa?</h2><p class="texto-2">Avisaremos a la organización en su móvil.</p>',
      [...MOTIVOS.map((m) => [m, m, 'boton-sec boton-motivo']), ['Cancelar', null, 'boton-sec']]);
    if (!motivo) return;
    GK.guardar('ultimaAyuda', Date.now());
    enviarAviso(motivo, false);
    GK.modal('<p><b>Aviso enviado.</b> La organización ya lo sabe: esperad en la estación, vendrán u os escribirán aquí.</p>', [['Vale', true, 'boton']]);
  }

  /** Aviso automático si un equipo lleva demasiado tiempo sin completar su siguiente estación. */
  function vigilarAtasco() {
    const eq = miEquipo();
    const sit = situacion();
    if (!eq || !sit || !sit.ruta || sit.terminado || !estadoTorneo || !estadoTorneo.iniciada || !estadoTorneo.inicio) return;
    const desde = Math.max(estadoTorneo.inicio, sit.ultima || 0);
    // Tiempo de juego sin avanzar (sin contar las pausas)
    if (GK.tiempoJuego(estadoTorneo, Date.now()) - GK.tiempoJuego(estadoTorneo, desde) < C.avisos.atascoMin * 60000) return;
    const avisados = GK.leer('avisosAtasco', {});
    if (avisados[sit.siguiente]) return;
    avisados[sit.siguiente] = Date.now();
    GK.guardar('avisosAtasco', avisados);
    enviarAviso('Atasco (aviso automático)', true);
    refrescar();
  }
  setInterval(vigilarAtasco, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) vigilarAtasco(); });

  /* ---------- Enrutado ---------- */
  function ruta() {
    const partes = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
    return { nombre: partes[0] || '', args: partes.slice(1) };
  }
  function ir(hash) { if (location.hash === hash) refrescar(true); else location.hash = hash; }

  function refrescar(forzar) {
    pintarCabecera();
    const r = ruta();
    // Pantallas con interacción en curso: solo se redibujan si cambia la ruta.
    if (!forzar && vista.dataset.ruta === location.hash) {
      if (r.nombre === 'e' && estacionEnCurso) { actualizarEstacionEnCurso(); return; }
      if (r.nombre === 'escanear' || r.nombre === 'unirse') return;
      if (document.querySelector('.modal')) return;
    }
    vista.dataset.ruta = location.hash;
    if (limpiarVista) { try { limpiarVista(); } catch (e) { /* */ } limpiarVista = null; }
    clearInterval(relojId);
    const mapaPrevio = forzar ? null : GK.estadoMapa();
    const y = window.scrollY;
    const eq = miEquipo();
    switch (r.nombre) {
      case 'unirse': pantallaUnirse(r.args[0], r.args[1]); break;
      case 'e': pantallaEstacion(Number(r.args[0]), r.args[1]); break;
      case 'escanear': pantallaEscanear(); break;
      case 'superada': pantallaSuperada(Number(r.args[0])); break;
      default: if (eq) pantallaRuta(); else pantallaUnirse();
    }
    // Si solo se ha actualizado la misma pantalla, se conserva el scroll y el zoom del mapa.
    if (!forzar) {
      window.scrollTo(0, y);
      if (mapaPrevio && $('.mapa-marco')) GK.activarMapa(vista, mapaPrevio);
    } else window.scrollTo(0, 0);
    pintarMensaje();
  }
  window.addEventListener('hashchange', () => refrescar(true));

  /* ---------- Componentes ---------- */
  function cabeceraPantalla(ante, titulo, destacado) {
    return `<p class="antetitulo">${GK.html(ante)}</p><h1 class="titulo">${GK.tituloHTML(titulo, destacado)}</h1>`;
  }
  const insignia = (idEst, clase = 'siguiente-num') => `<div class="${clase}" aria-hidden="true">${GK.html(GK.letra(idEst))}</div>`;

  /* ---------- Pantalla: unirse a un equipo ---------- */
  function pantallaUnirse(idEq, codigo) {
    const eq = miEquipo();
    if (eq && idEq && Number(idEq) === eq.id) return ir('#/');
    const reinicio = GK.leer('avisoReinicio', false);
    vista.innerHTML = `
      <section class="pantalla">
        ${cabeceraPantalla(C.lugar || 'Gymkhana', C.titulo, C.tituloDestacado)}
        ${reinicio ? '<div class="aviso aviso-info">La organización ha reiniciado la gymkhana: volved a uniros con vuestra tarjeta.</div>' : ''}
        <p class="texto-2 entradilla">Escanead el QR de vuestra <b>tarjeta de equipo</b> o elegid vuestro número y escribid el código.
          <b>Cuanto antes os unáis, más corta será vuestra ruta.</b></p>
        ${eq ? `<div class="aviso aviso-info">Este móvil ya está en el <b>${GK.html(GK.equipo(eq.id).nombre)}</b>. Si os unís a otro equipo, dejará de estar en ese.</div>` : ''}
        <a class="boton boton-ancho" href="#/escanear">${GK.icono('qr')} Escanear tarjeta de equipo</a>
        <div class="separador"><span>o a mano</span></div>
        <form class="tarjeta" id="form-unirse" autocomplete="off">
          <span class="etiqueta" id="et-equipo">Equipo</span>
          <div class="rejilla-equipos" role="radiogroup" aria-labelledby="et-equipo">
            ${C.equipos.map((e) => `<button type="button" role="radio" aria-checked="${Number(idEq) === e.id}" data-eq="${e.id}" class="eq-boton${Number(idEq) === e.id ? ' activo' : ''}">${e.id}</button>`).join('')}
          </div>
          <label class="etiqueta" for="codigo-equipo">Código del equipo</label>
          <input id="codigo-equipo" class="campo campo-codigo" autocapitalize="characters" spellcheck="false" maxlength="16" placeholder="······" value="${GK.html(codigo || '')}">
          <button class="boton boton-ancho" type="submit">Unirse</button>
          <div id="msg-unirse"></div>
        </form>
      </section>`;
    let elegido = Number(idEq) || null;
    vista.querySelectorAll('.eq-boton').forEach((b) => b.addEventListener('click', () => {
      elegido = Number(b.dataset.eq);
      vista.querySelectorAll('.eq-boton').forEach((x) => { x.classList.toggle('activo', x === b); x.setAttribute('aria-checked', String(x === b)); });
      $('#codigo-equipo').focus();
    }));
    const form = $('#form-unirse');
    const msg = $('#msg-unirse');
    const intentar = async () => {
      const cod = $('#codigo-equipo').value;
      if (!elegido) { msg.innerHTML = '<div class="aviso aviso-error">Elegid primero vuestro número de equipo.</div>'; return; }
      if (!GK.normalizar(cod)) { msg.innerHTML = '<div class="aviso aviso-error">Escribid el código de vuestra tarjeta.</div>'; return; }
      const boton = form.querySelector('button[type=submit]');
      boton.disabled = true; boton.textContent = 'Comprobando…';
      const e = GK.equipo(elegido);
      const ok = (await GK.huella(cod, e.sal)) === e.huella;
      boton.disabled = false; boton.textContent = 'Unirse';
      if (!ok) { msg.innerHTML = '<div class="aviso aviso-error">Ese código no corresponde a ese equipo. Revisad la tarjeta.</div>'; return; }
      const anterior = miEquipo();
      if (anterior && anterior.id !== elegido) GK.datos.vaciarCola();
      GK.borrar('avisoReinicio');
      GK.guardar('equipo', { id: elegido, codigo: GK.normalizar(cod), ronda });
      GK.datos.encolar({ tipo: 'unirse', equipo: elegido, codigo: GK.normalizar(cod) });
      if (!GK.asignacion.equipos[elegido]) GK.datos.encolar({ tipo: 'asignar', equipo: elegido });
      suscribirEquipo();
      const pendiente = GK.leer('estacionPendiente', null);
      GK.borrar('estacionPendiente');
      ir(pendiente || '#/');
    };
    form.addEventListener('submit', (ev) => { ev.preventDefault(); intentar(); });
    if (idEq && codigo) intentar();
  }

  /* ---------- Pantalla: mi ruta ---------- */
  function pantallaRuta() {
    const eq = miEquipo();
    const e = GK.equipo(eq.id);
    const sit = situacion();
    const iniciada = !!(estadoTorneo && estadoTorneo.iniciada);
    const sig = sit.siguiente != null ? GK.estacion(sit.siguiente) : null;
    const atascado = sit.ruta && sig && GK.leer('avisosAtasco', {})[sig.id];

    let tarjeta;
    if (!sit.ruta) {
      tarjeta = `
        <div class="tarjeta tarjeta-espera">
          <div class="radar" aria-hidden="true"></div>
          <div><p class="antetitulo">Recibiendo vuestra ruta…</p>
          <p>Se reparte por orden de llegada. Necesitáis conexión un momento.</p></div>
        </div>`;
    } else if (sit.terminado) {
      tarjeta = `
        <div class="tarjeta tarjeta-final">
          <p class="antetitulo">Transmisión recibida</p>
          <p>Habéis completado las <b>${sit.total}</b> estaciones. <b>Id a la meta</b> y avisad a la organización.</p>
        </div>`;
    } else if (!iniciada) {
      tarjeta = `
        <div class="tarjeta tarjeta-espera">
          <div class="radar" aria-hidden="true"></div>
          <div><p class="antetitulo">${GK.enPausa(estadoTorneo) ? 'Gymkhana en pausa' : 'Esperando la salida'}</p>
          <p>Vuestra primera estación es la <b>${GK.html(GK.letra(sit.orden[0]))}</b>. ${GK.enPausa(estadoTorneo) ? 'La organización ha parado el juego un momento.' : 'Mirad dónde está en el mapa: cuando la organización dé la salida, id hacia ella.'}</p></div>
        </div>`;
    } else {
      tarjeta = `
        <div class="tarjeta siguiente">
          ${insignia(sig.id)}
          <div class="siguiente-texto">
            <p class="antetitulo">Paso ${sit.hechas + 1} de ${sit.total}</p>
            <p class="siguiente-nombre">${GK.html(sig.nombre)}</p>
            <p class="texto-2">Buscadla en el mapa y, al llegar, escanead su QR.</p>
          </div>
        </div>
        <a class="boton boton-ancho boton-grande" href="#/escanear">${GK.icono('qr')} Escanear QR de la estación</a>`;
    }

    vista.innerHTML = `
      <section class="pantalla">
        <div id="mensaje-org"></div>
        ${cabeceraPantalla(e.nombre, sit.terminado ? 'Misión completada' : 'Vuestra ruta', sit.terminado ? 'completada' : 'ruta')}
        ${sit.ruta ? `<p class="ruta-info"><span class="chip chip-ambar">RUTA ${sit.ruta.id} DE ${C.rutas.length}</span> <span class="mono">≈ ${GK.metros(sit.ruta.metros)}</span>${sit.ruta.id === 1 ? ' <span class="chip chip-verde">LA MÁS CORTA</span>' : ''}</p>` : ''}
        ${GK.mapaRuta({ orden: sit.orden, hechas: sit.hechas })}
        <div class="marcadores">
          <div><b>${sit.hechas}</b><span>hechas</span></div>
          <div><b>${sit.total - sit.hechas}</b><span>faltan</span></div>
          <div><b class="mono" id="reloj">--:--</b><span>tiempo</span></div>
        </div>
        <div id="aviso-cola" class="aviso aviso-error oculto">Hay un avance guardado que el servidor aún no ha aceptado. Pulsad «Pedir ayuda» si no se arregla solo.</div>
        ${atascado ? '<div class="aviso aviso-info">Lleváis un rato en esta estación: <b>ya hemos avisado a la organización</b>. Si necesitáis algo más, pulsad «Pedir ayuda».</div>' : ''}
        ${tarjeta}
        ${sit.ruta ? `<ol class="ruta-lista" aria-label="Orden de vuestra ruta">
          ${sit.orden.map((s, i) => `<li class="${i < sit.hechas ? 'hecha' : i === sit.hechas ? 'actual' : ''}" title="${GK.html(GK.estacion(s).nombre)}">${GK.html(GK.letra(s))}</li>`).join('')}
        </ol>` : ''}
        <div class="pie-acciones">
          <button class="boton-sec boton-ayuda" id="ayuda">${GK.icono('ayuda')} Pedir ayuda</button>
          <a class="boton-sec" href="ranking.html">${GK.icono('podio')} Ver ranking</a>
          <button class="boton-sec" id="salir">Cambiar de equipo</button>
        </div>
      </section>`;
    GK.activarMapa(vista);
    $('#ayuda').onclick = pedirAyuda;
    $('#salir').onclick = async () => {
      const ok = await GK.modal('<p>¿Seguro que queréis cambiar de equipo en este móvil?</p><p class="texto-2">El progreso de vuestro equipo no se pierde.</p>',
        [['Cancelar', false], ['Cambiar', true, 'boton']]);
      if (ok) ir('#/unirse');
    };
    GK.datos.onEstado(() => {}); // actualiza el aviso de la cola recién pintado
    const tic = () => {
      const r = $('#reloj');
      if (!r) return;
      r.textContent = GK.formatoTiempo(GK.tiempoJuego(estadoTorneo, sit.terminado ? sit.ultima : Date.now()));
    };
    tic();
    relojId = setInterval(tic, 1000);
  }

  /* ---------- Pantalla: escanear ---------- */
  function pantallaEscanear() {
    vista.innerHTML = `
      <section class="pantalla">
        ${cabeceraPantalla('Escáner', 'Apuntad al QR', 'QR')}
        <div id="escaner"></div>
        <div id="msg-escaner"></div>
        <p class="texto-2 nota">Si la cámara no funciona aquí, abrid el QR con la app de cámara del móvil: os traerá a esta misma app.</p>
        <a class="boton-sec boton-ancho" href="#/">Cancelar</a>
      </section>`;
    let parar = null;
    GK.escanear($('#escaner'), (texto) => {
      const i = texto.indexOf('#/');
      if (i < 0) {
        $('#msg-escaner').innerHTML = '<div class="aviso aviso-error">Ese QR no es de la gymkhana.</div>';
        setTimeout(() => refrescar(true), 1600);
        return;
      }
      ir(texto.slice(i));
    }, (error) => {
      $('#msg-escaner').innerHTML = `<div class="aviso aviso-error">${GK.html(error)}</div>`;
    }).then((f) => { parar = f; });
    limpiarVista = () => parar && parar();
  }

  /* ---------- Pantalla: estación ---------- */
  let estacionEnCurso = null;
  async function pantallaEstacion(idEst, token) {
    estacionEnCurso = null;
    const est = GK.estacion(idEst);
    vista.innerHTML = '<section class="pantalla"><p class="texto-2">Comprobando el QR…</p></section>';
    if (!est || !token || (await GK.sha256(token)) !== est.token) {
      return mensaje('QR no válido', 'Este QR no es de ninguna estación de la gymkhana.', 'error');
    }
    const eq = miEquipo();
    if (!eq) {
      GK.guardar('estacionPendiente', location.hash);
      return mensaje(`Estación ${est.letra}`, 'Antes de nada, uníos a vuestro equipo con la tarjeta.', 'info', ['Unirse a un equipo', '#/unirse']);
    }
    const sit = situacion();
    if (!sit.ruta) return mensaje(`Estación ${est.letra}`, 'Todavía no tenéis ruta. Necesitáis conexión un momento para recibirla.', 'info');
    if (!estadoTorneo || !estadoTorneo.iniciada) {
      return mensaje(`Estación ${est.letra}`, 'La gymkhana todavía no está en marcha. Esperad la señal de la organización.', 'info');
    }
    if (sit.terminado) return ir('#/');
    const pos = sit.orden.indexOf(est.id);
    const toca = GK.letra(sit.siguiente);
    if (pos > -1 && pos < sit.hechas) {
      return mensaje(`Estación ${est.letra}`, `Esta estación ya la habéis superado. Ahora os toca la <b>estación ${toca}</b>.`, 'ok');
    }
    if (est.id !== sit.siguiente) {
      return mensaje('No es vuestra estación', `Seguid vuestra ruta: ahora os toca la <b>estación ${toca}</b>. No se puede saltar ninguna.`, 'error');
    }

    const tipo = (est.prueba && est.prueba.tipo) || 'codigo_estacion';
    const prueba = GK.pruebas.obtener(tipo) || GK.pruebas.obtener('codigo_estacion');
    vista.innerHTML = `
      <section class="pantalla">
        <div id="mensaje-org"></div>
        <div class="estacion-cabecera">
          ${insignia(est.id, 'estacion-num')}
          <div>${cabeceraPantalla(`Paso ${sit.hechas + 1} de ${sit.total}`, est.nombre, '')}</div>
        </div>
        <div id="prueba"></div>
        <div id="ayuda-prueba" aria-live="polite"></div>
        <button class="boton-sec boton-ancho boton-ayuda" id="ayuda">${GK.icono('ayuda')} Pedir ayuda a la organización</button>
        <a class="boton-sec boton-ancho" href="#/">Volver a la ruta</a>
      </section>`;
    $('#ayuda').onclick = pedirAyuda;
    pintarMensaje();
    estacionEnCurso = { id: est.id, equipo: eq.id };
    const ctx = {
      estacion: { id: est.id, letra: est.letra, nombre: est.nombre, prueba: est.prueba || {} },
      equipo: { id: eq.id, nombre: GK.equipo(eq.id).nombre },
      ayuda(texto) { $('#ayuda-prueba').innerHTML = texto ? `<div class="aviso aviso-error">${GK.html(texto)}</div>` : ''; },
      async intentar(respuesta) {
        if (!GK.normalizar(respuesta)) return false;
        const ok = (await GK.huella(respuesta, est.sal)) === est.huella;
        if (!ok) return false;
        completar(eq.id, est.id, token, GK.normalizar(respuesta));
        return true;
      },
    };
    const limpiar = prueba.montar($('#prueba'), ctx);
    limpiarVista = () => { estacionEnCurso = null; if (typeof limpiar === 'function') limpiar(); };
  }
  function actualizarEstacionEnCurso() {
    // Si mientras están en la prueba otro móvil del equipo la completa (o la organización la marca), se avanza solo.
    if (!estacionEnCurso) return;
    const sit = situacion();
    const pos = sit.orden.indexOf(estacionEnCurso.id);
    if (pos > -1 && pos < sit.hechas) ir('#/superada/' + estacionEnCurso.id);
  }

  function completar(idEq, idEst, token, clave) {
    const local = progresoLocal(idEq);
    local[idEst] = { t: Date.now() };
    GK.guardar('progreso:' + idEq, local);
    GK.datos.encolar({ tipo: 'completar', equipo: idEq, estacion: idEst, token, clave });
    estacionEnCurso = null;
    ir('#/superada/' + idEst);
  }

  function mensaje(titulo, html, tipo, accion) {
    vista.innerHTML = `
      <section class="pantalla">
        <div class="tarjeta mensaje mensaje-${tipo}">
          <div class="mensaje-icono">${GK.icono(tipo === 'error' ? 'alto' : tipo === 'ok' ? 'ok' : 'candado')}</div>
          <h1 class="titulo">${GK.html(titulo)}</h1>
          <p>${html}</p>
        </div>
        ${accion ? `<a class="boton boton-ancho" href="${accion[1]}">${GK.html(accion[0])}</a>` : ''}
        <a class="boton-sec boton-ancho" href="#/">Ver mi ruta</a>
      </section>`;
  }

  /* ---------- Pantalla: estación superada ---------- */
  function pantallaSuperada(idEst) {
    const eq = miEquipo();
    if (!eq) return ir('#/');
    const sit = situacion();
    if (!sit.ruta) return ir('#/');
    vista.innerHTML = `
      <section class="pantalla superada">
        <div class="destello" aria-hidden="true"></div>
        <p class="antetitulo">Estación ${GK.html(GK.letra(idEst))} · señal recibida</p>
        <h1 class="titulo">${sit.terminado ? GK.tituloHTML('¡Misión completada!', 'completada!') : GK.tituloHTML('¡Estación superada!', 'superada!')}</h1>
        ${GK.mapaRuta({ orden: sit.orden, hechas: sit.hechas })}
        ${sit.terminado
          ? `<div class="tarjeta tarjeta-final"><p>Habéis completado las <b>${sit.total}</b> estaciones. <b>Id a la meta</b> y avisad a la organización.</p></div>`
          : `<div class="tarjeta siguiente">${insignia(sit.siguiente)}<div class="siguiente-texto"><p class="antetitulo">Ahora id a</p><p class="siguiente-nombre">${GK.html(GK.estacion(sit.siguiente).nombre)}</p><p class="texto-2">Lleváis ${sit.hechas} de ${sit.total}. Buscadla en el mapa.</p></div></div>`}
        <a class="boton boton-ancho" href="#/">Ver mi ruta</a>
      </section>`;
    GK.activarMapa(vista);
    GK.vibrar([80, 60, 120]);
  }

  /* ---------- Arranque ---------- */
  GK.datos.escuchar('estado', (v) => {
    const antes = JSON.stringify(estadoTorneo);
    estadoTorneo = v;
    if (antes !== JSON.stringify(v)) { refrescar(); vigilarAtasco(); }
  });
  GK.datos.escuchar('ronda', (v) => {
    ronda = Number(v) || 0;
    comprobarRonda();
  });
  suscribirEquipo();
  refrescar(true);
})();
