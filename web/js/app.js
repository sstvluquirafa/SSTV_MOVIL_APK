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
    desvincular('avisoReinicio');
  }
  /** Saca este móvil de su equipo (sin tocar nada del servidor) y lleva a la pantalla de unirse con un aviso. */
  function desvincular(motivo) {
    const eq = miEquipo();
    if (!eq) return;
    GK.borrar('equipo');
    GK.borrar('progreso:' + eq.id);
    GK.borrar('avisosAtasco');
    GK.borrar('pistas');
    GK.datos.vaciarCola();
    cancelar.forEach((f) => f());
    cancelar = [];
    progresoServidor = {};
    mensajeOrg = null;
    GK.guardar('avisoReinicio', motivo);
    ir('#/unirse');
  }
  // El servidor no acepta el código de este equipo: hay que volver a unirse con la tarjeta.
  GK.datos.onExpulsion(() => desvincular('avisoExpulsion'));

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
    const donde = est ? `estación ${est.letra} (paso ${sit.hechas + 1}/${sit.total})`
      : sit && sit.paso === 'final' ? 'palabra final (Última transmisión)'
      : sit && sit.paso === 'meta' ? 'camino de la meta' : 'sin estación asignada';
    // paso: total + 1 = palabra final, total + 2 = meta (el panel lo muestra así)
    GK.datos.encolar({ tipo: 'ayuda', id: 'ayuda:' + id, idAyuda: id, equipo: eq.id, motivo, estacion: est ? est.id : 0, paso: sit ? sit.pasos + 1 : 0 });
    GK.datos.encolar({
      tipo: 'ntfy', id: 'ntfy:' + id,
      titulo: automatico ? `${nombre} lleva un rato atascado` : `${nombre} pide ayuda`,
      texto: `${automatico ? `Más de ${C.avisos.atascoMin} min sin avanzar · ` : ''}${donde}${automatico ? '' : ` · ${motivo}`}`,
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
    if (!eq || !sit || !sit.ruta || sit.terminado || sit.paso == null || !estadoTorneo || !estadoTorneo.iniciada || !estadoTorneo.inicio) return;
    const desde = Math.max(estadoTorneo.inicio, sit.ultima || 0);
    // Tiempo de juego sin avanzar (sin contar las pausas)
    if (GK.tiempoJuego(estadoTorneo, Date.now()) - GK.tiempoJuego(estadoTorneo, desde) < C.avisos.atascoMin * 60000) return;
    const avisados = GK.leer('avisosAtasco', {});
    if (avisados[sit.paso]) return;
    avisados[sit.paso] = Date.now();
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
      if ((r.nombre === 'e' || r.nombre === 'final') && estacionEnCurso) { actualizarEstacionEnCurso(); return; }
      if (r.nombre === 'escanear' || r.nombre === 'unirse') return;
      if (document.querySelector('.modal')) return;
    }
    vista.dataset.ruta = location.hash;
    if (limpiarVista) { try { limpiarVista(); } catch (e) { /* */ } limpiarVista = null; }
    clearInterval(relojId);
    estacionEnCurso = null;
    const mapaPrevio = forzar ? null : GK.estadoMapa();
    const y = window.scrollY;
    const eq = miEquipo();
    switch (r.nombre) {
      case 'unirse': pantallaUnirse(r.args[0], r.args[1]); break;
      case 'e': pantallaEstacion(Number(r.args[0]), r.args[1]); break;
      case 'escanear': pantallaEscanear(); break;
      case 'superada': pantallaSuperada(r.args[0] === 'final' ? 'final' : Number(r.args[0])); break;
      case 'final': pantallaFinal(); break;
      case 'meta': pantallaMeta(r.args[0]); break;
      default: if (eq) pantallaRuta(); else pantallaUnirse();
    }
    // Si solo se ha actualizado la misma pantalla, se conserva el scroll y el zoom del mapa.
    if (!forzar) {
      window.scrollTo(0, y);
      if (mapaPrevio && $('.mapa-marco')) GK.activarMapa(vista, mapaPrevio);
    } else window.scrollTo(0, 0);
    pintarMensaje();
    if (GK.pintarInstalar) GK.pintarInstalar();
  }
  window.addEventListener('hashchange', () => refrescar(true));

  /* ---------- Componentes ---------- */
  function cabeceraPantalla(ante, titulo, destacado) {
    return `<p class="antetitulo">${GK.html(ante)}</p><h1 class="titulo">${GK.tituloHTML(titulo, destacado)}</h1>`;
  }
  /** Cómo se dibuja la meta en el mapa: oculta hasta acertar la palabra final. */
  const estadoMeta = (sit) => (sit.enMeta ? 'hecha' : sit.palabraHecha ? 'siguiente' : null);

  /** Fila de letras de la palabra final: las conseguidas (en el orden en que las consiguieron) y huecos. */
  function filaLetras(sit) {
    const conseguidas = GK.letrasConseguidas(sit);
    const huecos = Math.max(0, sit.total - conseguidas.length);
    return `<div class="letras-palabra">
      <p class="antetitulo">Letras de la palabra secreta · ${conseguidas.length}/${sit.total}</p>
      <div class="letras-fila" aria-label="Letras conseguidas: ${GK.html(conseguidas.join(', ') || 'ninguna')}">${conseguidas.map((l) => `<span class="letra-ficha">${GK.html(l)}</span>`).join('')}${'<span class="letra-ficha hueco"></span>'.repeat(huecos)}</div>
    </div>`;
  }

  /**
   * Botón «Pista» común a todas las pruebas: aparece 60 s después de abrir la prueba por primera vez (antes, un
   * contador). Sin penalización, una sola pista. Se recuerda en el móvil (por equipo y estación) si ya la vieron.
   */
  const ESPERA_PISTA = 60000;
  function montarPista(caja, clave, texto) {
    if (!caja) return () => {};
    if (!texto) { caja.innerHTML = ''; return () => {}; }
    const todas = GK.leer('pistas', {});
    if (!todas[clave]) { todas[clave] = { abierta: Date.now() }; GK.guardar('pistas', todas); }
    let id = null;
    const pintar = () => {
      const r = GK.leer('pistas', {})[clave] || { abierta: Date.now() };
      if (r.vista) {
        clearInterval(id);
        caja.innerHTML = `<div class="pista" role="note"><p class="antetitulo">${GK.icono('bombilla')} Pista</p><p>${GK.html(texto)}</p></div>`;
        return;
      }
      const falta = Math.ceil((r.abierta + ESPERA_PISTA - Date.now()) / 1000);
      if (falta > 0) {
        const t = `0:${String(falta).padStart(2, '0')}`;
        const b = caja.querySelector('.pista-espera b');
        if (b) b.textContent = t;
        else caja.innerHTML = `<p class="pista-espera">${GK.icono('bombilla')} Pista disponible en <b class="mono">${t}</b></p>`;
        return;
      }
      clearInterval(id);
      caja.innerHTML = `<button class="boton-sec boton-ancho boton-pista" type="button">${GK.icono('bombilla')} Ver pista</button>`;
      caja.querySelector('button').onclick = () => {
        const t2 = GK.leer('pistas', {});
        t2[clave] = { ...(t2[clave] || {}), vista: true };
        GK.guardar('pistas', t2);
        pintar();
      };
    };
    pintar();
    id = setInterval(pintar, 1000);
    return () => clearInterval(id);
  }

  /**
   * Espera tras un fallo (pruebas de opciones, donde se podría acertar probando al azar): bloquea `boton`
   * `segundos` con cuenta atrás y un mensaje amable. Devuelve una promesa que se cumple al acabar.
   */
  function crearEsperar(cajaAyuda, registrar) {
    return (segundos, boton) => new Promise((res) => {
      const texto = boton ? boton.textContent : '';
      const fin = Date.now() + segundos * 1000;
      if (boton) boton.disabled = true;
      let id = null;
      const tic = () => {
        const falta = Math.ceil((fin - Date.now()) / 1000);
        if (falta <= 0 || !cajaAyuda.isConnected) {
          clearInterval(id);
          if (boton) { boton.disabled = false; boton.textContent = texto; }
          if (cajaAyuda.isConnected) cajaAyuda.innerHTML = '';
          return res();
        }
        if (boton) boton.textContent = `Esperad ${falta} s`;
        const b = cajaAyuda.querySelector('.aviso-espera b');
        if (b) b.textContent = `${falta} s`;
        else cajaAyuda.innerHTML = `<div class="aviso aviso-info aviso-espera">${GK.icono('reloj')} <span>Pensadlo un poco: podéis volver a probar en <b class="mono">${falta} s</b>.</span></div>`;
      };
      tic();
      id = setInterval(tic, 250);
      registrar(() => clearInterval(id));
    });
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
        ${reinicio ? `<div class="aviso aviso-info">${reinicio === 'avisoExpulsion'
          ? 'Vuestro móvil se ha desconectado del equipo. Volved a uniros con vuestra tarjeta: no perdéis nada de lo que llevéis hecho.'
          : 'La organización ha reiniciado la gymkhana: volved a uniros con vuestra tarjeta.'}</div>` : ''}
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
          <p class="antetitulo">Misión completada</p>
          <p>¡Habéis llegado a la meta en <b class="mono">${GK.formatoTiempo(GK.tiempoJuego(estadoTorneo, sit.ultima))}</b>! Mirad el ranking para ver vuestro puesto.</p>
        </div>`;
    } else if (sit.completas && !sit.palabraHecha) {
      tarjeta = `
        <div class="tarjeta siguiente">
          <div class="siguiente-num insignia-final" aria-hidden="true">${GK.icono('satelite')}</div>
          <div class="siguiente-texto">
            <p class="antetitulo">Paso final</p>
            <p class="siguiente-nombre">Última transmisión</p>
            <p class="texto-2">Tenéis las ${sit.total} letras. Ordenadlas para descifrar la palabra secreta.</p>
          </div>
        </div>
        <a class="boton boton-ancho boton-grande" href="#/final">${GK.icono('satelite')} Descifrar la palabra</a>`;
    } else if (sit.palabraHecha) {
      tarjeta = `
        <div class="tarjeta siguiente tarjeta-meta">
          <div class="siguiente-num insignia-meta" aria-hidden="true">${GK.icono('bandera')}</div>
          <div class="siguiente-texto">
            <p class="antetitulo">Siguiente</p>
            <p class="siguiente-nombre">${GK.html(C.meta.nombre)}</p>
            <p class="texto-2">Id a la meta y escanead su QR. ¡Ya aparece en el mapa!</p>
          </div>
        </div>
        <a class="boton boton-ancho boton-grande" href="#/escanear">${GK.icono('qr')} Escanear QR de la meta</a>`;
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
        <div id="instalar"></div>
        ${cabeceraPantalla(e.nombre, sit.terminado ? 'Misión completada' : 'Vuestra ruta', sit.terminado ? 'completada' : 'ruta')}
        ${sit.ruta ? `<p class="ruta-info"><span class="chip chip-ambar">RUTA ${sit.ruta.id} DE ${C.rutas.length}</span> <span class="mono">≈ ${GK.metros(sit.ruta.metros)}</span>${sit.ruta.id === 1 ? ' <span class="chip chip-verde">LA MÁS CORTA</span>' : ''}</p>` : ''}
        ${GK.mapaRuta({ orden: sit.orden, hechas: sit.hechas, meta: estadoMeta(sit) })}
        <div class="marcadores">
          <div><b>${sit.hechas}</b><span>hechas</span></div>
          <div><b>${sit.total - sit.hechas}</b><span>faltan</span></div>
          <div><b class="mono" id="reloj">--:--</b><span>tiempo</span></div>
        </div>
        <div id="aviso-cola" class="aviso aviso-error aviso-reconectar oculto">
          <span>Vuestro móvil no consigue sincronizar con la organización. Ya les hemos avisado.</span>
          <button class="boton-sec mini" type="button" id="reconectar">Reconectar</button>
        </div>
        ${atascado ? '<div class="aviso aviso-info">Lleváis un rato en esta estación: <b>ya hemos avisado a la organización</b>. Si necesitáis algo más, pulsad «Pedir ayuda».</div>' : ''}
        ${tarjeta}
        ${sit.ruta ? `<ol class="ruta-lista" aria-label="Orden de vuestra ruta">
          ${sit.orden.map((s, i) => `<li class="${i < sit.hechas ? 'hecha' : i === sit.hechas ? 'actual' : ''}" title="${GK.html(GK.estacion(s).nombre)}">${GK.html(GK.letra(s))}</li>`).join('')}
        </ol>
        ${filaLetras(sit)}` : ''}
        <div class="pie-acciones">
          <button class="boton-sec boton-ayuda" id="ayuda">${GK.icono('ayuda')} Pedir ayuda</button>
          <a class="boton-sec" href="ranking.html">${GK.icono('podio')} Ver ranking</a>
          ${GK.enModoApp && !GK.enModoApp() && (GK.dispositivo.esIOS || GK.dispositivo.esAndroid) ? '<button class="boton-sec" id="instalar-app">Instalar la app</button>' : ''}
          <button class="boton-sec" id="salir">Cambiar de equipo</button>
        </div>
      </section>`;
    GK.activarMapa(vista);
    $('#ayuda').onclick = pedirAyuda;
    if ($('#instalar-app')) $('#instalar-app').onclick = () => GK.mostrarInstalar();
    $('#reconectar').onclick = () => { GK.datos.reconectar(); $('#aviso-cola').classList.add('oculto'); };
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
    if (sit.completas) {
      return mensaje(`Estación ${est.letra}`, 'Ya habéis superado todas las estaciones. ¡Os falta la <b>última transmisión</b>!', 'ok', ['Ir a la última transmisión', '#/final']);
    }
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
        <div id="pista"></div>
        <button class="boton-sec boton-ancho boton-ayuda" id="ayuda">${GK.icono('ayuda')} Pedir ayuda a la organización</button>
        <a class="boton-sec boton-ancho" href="#/">Volver a la ruta</a>
      </section>`;
    $('#ayuda').onclick = pedirAyuda;
    pintarMensaje();
    estacionEnCurso = { id: est.id, equipo: eq.id };
    const limpiezas = [];
    const datosPrueba = est.prueba || {};
    const ctx = {
      estacion: { id: est.id, letra: est.letra, nombre: est.nombre, prueba: datosPrueba, sal: est.sal },
      equipo: { id: eq.id, nombre: GK.equipo(eq.id).nombre },
      /** ctx.ayuda(texto, tipo?): aviso bajo la prueba. tipo: 'error' (por defecto), 'info' u 'ok'. */
      ayuda(texto, tipo) {
        const t = ['info', 'ok'].includes(tipo) ? tipo : 'error';
        $('#ayuda-prueba').innerHTML = texto ? `<div class="aviso aviso-${t}">${GK.html(texto)}</div>` : '';
      },
      /**
       * Comprueba la respuesta. También valen los sinónimos de privado/secretos.json → «alternativas».
       * Con { quedarse: true } la estación queda superada (y se envía) pero la app no cambia de pantalla: la prueba
       * puede enseñar algo más (una explicación, una animación) y después llamar a ctx.continuar().
       */
      async intentar(respuesta, opciones) {
        if (!GK.normalizar(respuesta)) return false;
        const h = await GK.huella(respuesta, est.sal);
        if (h !== est.huella && !(datosPrueba.huellasAlternativas || []).includes(h)) return false;
        completar(eq.id, est.id, token, GK.normalizar(respuesta), opciones && opciones.quedarse);
        return true;
      },
      /** Tras un intentar(…, { quedarse: true }): pasa a la pantalla de «estación superada». */
      continuar() { ir('#/superada/' + est.id); },
      /** ¿La respuesta coincide con otra huella de la prueba (misma sal que la estación)? Sin superar nada. */
      async coincide(respuesta, huella) {
        return !!GK.normalizar(respuesta) && (await GK.huella(respuesta, est.sal)) === huella;
      },
      /** ctx.esperar(segundos, boton): espera tras fallo, con cuenta atrás. */
      esperar: crearEsperar($('#ayuda-prueba'), (f) => limpiezas.push(f)),
    };
    limpiezas.push(montarPista($('#pista'), `${eq.id}:${est.id}`, datosPrueba.pista));
    const limpiar = prueba.montar($('#prueba'), ctx);
    limpiarVista = () => {
      estacionEnCurso = null;
      limpiezas.forEach((f) => f());
      if (typeof limpiar === 'function') limpiar();
    };
  }
  function actualizarEstacionEnCurso() {
    // Si mientras están en la prueba otro móvil del equipo la completa (o la organización la marca), se avanza solo.
    if (!estacionEnCurso || estacionEnCurso.quedarse) return;
    const sit = situacion();
    if (estacionEnCurso.id === 'final') { if (sit.palabraHecha) ir('#/superada/final'); return; }
    const pos = sit.orden.indexOf(estacionEnCurso.id);
    if (pos > -1 && pos < sit.hechas) ir('#/superada/' + estacionEnCurso.id);
  }

  function completar(idEq, idEst, token, clave, quedarse) {
    const local = progresoLocal(idEq);
    local[idEst] = { t: Date.now() };
    GK.guardar('progreso:' + idEq, local);
    // Se queda en la prueba (sin repintarla) hasta que la prueba llame a ctx.continuar(). Se marca ANTES de encolar:
    // el envío puede avisar enseguida de que la estación está hecha (en modo demo es inmediato).
    if (quedarse && estacionEnCurso) estacionEnCurso.quedarse = true;
    GK.datos.encolar({ tipo: 'completar', equipo: idEq, estacion: idEst, token, clave });
    if (quedarse) { pintarCabecera(); return; }
    estacionEnCurso = null;
    ir(idEst === 'meta' ? '#/' : '#/superada/' + idEst);
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
    if (idEst === 'final') {
      if (!sit.palabraHecha) return ir('#/');
      vista.innerHTML = `
        <section class="pantalla superada">
          <div class="destello" aria-hidden="true"></div>
          <p class="antetitulo">Última transmisión · señal descifrada</p>
          <h1 class="titulo">${GK.tituloHTML('¡Palabra correcta!', 'correcta!')}</h1>
          <p class="texto-2">La meta ya aparece en vuestro mapa.</p>
          ${GK.mapaRuta({ orden: sit.orden, hechas: sit.hechas, meta: estadoMeta(sit) })}
          <div class="tarjeta siguiente tarjeta-meta"><div class="siguiente-num insignia-meta" aria-hidden="true">${GK.icono('bandera')}</div>
            <div class="siguiente-texto"><p class="antetitulo">Ahora id a</p><p class="siguiente-nombre">${GK.html(C.meta.nombre)}</p>
            <p class="texto-2">Escanead su QR para parar vuestro tiempo.</p></div></div>
          <a class="boton boton-ancho boton-grande" href="#/escanear">${GK.icono('qr')} Escanear QR de la meta</a>
          <a class="boton-sec boton-ancho" href="#/">Ver mi ruta</a>
        </section>`;
      GK.activarMapa(vista);
      GK.vibrar([80, 60, 120, 60, 200]);
      return;
    }
    const letra = GK.letraPalabra(idEst);
    vista.innerHTML = `
      <section class="pantalla superada">
        <div class="destello" aria-hidden="true"></div>
        <p class="antetitulo">Estación ${GK.html(GK.letra(idEst))} · señal recibida</p>
        <h1 class="titulo">${GK.tituloHTML('¡Estación superada!', 'superada!')}</h1>
        ${letra ? `<div class="letra-ganada">
          <p>Habéis conseguido la letra</p>
          <div class="letra-grande">${GK.html(letra)}</div>
        </div>
        ${filaLetras(sit)}` : ''}
        ${sit.completas
          ? `<div class="tarjeta siguiente"><div class="siguiente-num insignia-final" aria-hidden="true">${GK.icono('satelite')}</div><div class="siguiente-texto"><p class="antetitulo">¡Todas las estaciones!</p><p class="siguiente-nombre">Última transmisión</p><p class="texto-2">Ordenad las ${sit.total} letras para descifrar la palabra secreta.</p></div></div>
             <a class="boton boton-ancho boton-grande" href="#/final">${GK.icono('satelite')} Descifrar la palabra</a>`
          : `${GK.mapaRuta({ orden: sit.orden, hechas: sit.hechas })}
             <div class="tarjeta siguiente">${insignia(sit.siguiente)}<div class="siguiente-texto"><p class="antetitulo">Ahora id a</p><p class="siguiente-nombre">${GK.html(GK.estacion(sit.siguiente).nombre)}</p><p class="texto-2">Lleváis ${sit.hechas} de ${sit.total}. Buscadla en el mapa.</p></div></div>
             <a class="boton boton-ancho" href="#/">Ver mi ruta</a>`}
      </section>`;
    GK.activarMapa(vista);
    GK.vibrar([80, 60, 120]);
  }

  /* ---------- Pantalla: Última transmisión (palabra final) ---------- */
  /** Barajado determinista (siempre igual para el mismo equipo) que nunca deja la palabra ya ordenada. */
  function barajar(letras, semilla) {
    const a = [...letras];
    let x = (semilla * 7919) % 233280;
    const azar = () => { x = (x * 9301 + 49297) % 233280; return x / 233280; };
    for (let intento = 0; intento < 5; intento++) {
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(azar() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      if (a.join('') !== letras.join('')) break;
    }
    return a;
  }

  function pantallaFinal() {
    const eq = miEquipo();
    if (!eq) return ir('#/unirse');
    const sit = situacion();
    if (!sit.ruta || sit.palabraHecha) return ir('#/');
    if (!sit.completas) {
      return mensaje('Última transmisión', `Todavía os faltan estaciones: <b>${sit.faltan.map(GK.letra).join(' · ')}</b>. Cuando las tengáis todas, aquí descifraréis la palabra secreta.`, 'info');
    }
    if (!estadoTorneo || !estadoTorneo.iniciada) {
      return mensaje('Última transmisión', 'La gymkhana está en pausa. Esperad la señal de la organización.', 'info');
    }
    const F = C.final;
    const letras = barajar(GK.letrasConseguidas(sit), eq.id);
    vista.innerHTML = `
      <section class="pantalla">
        <div id="mensaje-org"></div>
        <div class="estacion-cabecera">
          <div class="estacion-num insignia-final" aria-hidden="true">${GK.icono('satelite')}</div>
          <div>${cabeceraPantalla('Paso final', 'Última transmisión', 'transmisión')}</div>
        </div>
        <div class="ventana">
          <div class="ventana-barra"><span class="puntos"><i></i><i></i><i></i></span><span>RX_MONITOR · TRANSMISIÓN FINAL</span></div>
          <div class="ventana-cuerpo">
            <p class="terminal">&gt; Señal recibida de las ${sit.total} estaciones.<br>&gt; Las letras llegan <b>desordenadas</b>: ordenadlas para descifrar la palabra secreta.</p>
            <div class="letras-fila letras-final" aria-label="Letras: ${GK.html(letras.join(', '))}">${letras.map((l) => `<span class="letra-ficha">${GK.html(l)}</span>`).join('')}</div>
            <form id="form-final" autocomplete="off">
              <label class="etiqueta" for="palabra-final">La palabra secreta (${F.longitud} letras)</label>
              <input id="palabra-final" class="campo campo-codigo" autocapitalize="characters" spellcheck="false" maxlength="24" placeholder="${'·'.repeat(F.longitud)}" required>
              <button class="boton boton-ancho" type="submit">Enviar transmisión</button>
            </form>
          </div>
        </div>
        <div id="ayuda-prueba" aria-live="polite"></div>
        <div id="pista"></div>
        <button class="boton-sec boton-ancho boton-ayuda" id="ayuda">${GK.icono('ayuda')} Pedir ayuda a la organización</button>
        <a class="boton-sec boton-ancho" href="#/">Volver a la ruta</a>
      </section>`;
    $('#ayuda').onclick = pedirAyuda;
    pintarMensaje();
    estacionEnCurso = { id: 'final', equipo: eq.id };
    const parar = montarPista($('#pista'), `${eq.id}:final`, F.pista);
    limpiarVista = () => { estacionEnCurso = null; parar(); };
    const form = $('#form-final');
    const campo = $('#palabra-final');
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const boton = form.querySelector('button');
      const texto = campo.value;
      if (!GK.normalizar(texto)) return;
      boton.disabled = true; boton.textContent = 'Descifrando…';
      const ok = (await GK.huella(texto, F.sal)) === F.huella;
      if (ok) return completar(eq.id, 'final', F.token, GK.normalizar(texto));
      boton.disabled = false; boton.textContent = 'Enviar transmisión';
      campo.select();
      $('#ayuda-prueba').innerHTML = `<div class="aviso aviso-error">${GK.normalizar(texto).length !== F.longitud
        ? `Casi: la palabra tiene <b>${F.longitud}</b> letras. Usadlas todas.`
        : 'Esa no es la palabra. Probad a ordenar las letras de otra forma.'}</div>`;
    });
  }

  /* ---------- Pantalla: meta (QR fijo; escanearlo termina la partida del equipo) ---------- */
  async function pantallaMeta(token) {
    vista.innerHTML = '<section class="pantalla"><p class="texto-2">Comprobando el QR…</p></section>';
    if (!token || (await GK.sha256(token)) !== C.meta.token) {
      return mensaje('QR no válido', 'Este QR no es de ninguna estación de la gymkhana.', 'error');
    }
    const eq = miEquipo();
    if (!eq) {
      GK.guardar('estacionPendiente', location.hash);
      return mensaje(C.meta.nombre, 'Antes de nada, uníos a vuestro equipo con la tarjeta.', 'info', ['Unirse a un equipo', '#/unirse']);
    }
    const sit = situacion();
    if (!sit.ruta) return mensaje(C.meta.nombre, 'Todavía no tenéis ruta. Necesitáis conexión un momento para recibirla.', 'info');
    if (sit.terminado) return ir('#/');
    if (!sit.palabraHecha) {
      const falta = !sit.completas
        ? `os ${sit.faltan.length === 1 ? 'falta la estación' : 'faltan las estaciones'} <b>${sit.faltan.map(GK.letra).join(' · ')}</b> y la última transmisión`
        : 'os falta descifrar la <b>palabra secreta</b> de la última transmisión';
      return mensaje('Aún no', `Esta es la meta, pero todavía no podéis terminar: ${falta}.`, 'info',
        sit.completas ? ['Ir a la última transmisión', '#/final'] : null);
    }
    if (!estadoTorneo || !estadoTorneo.iniciada) {
      return mensaje(C.meta.nombre, 'La gymkhana está en pausa. Esperad la señal de la organización y volved a escanear.', 'info');
    }
    GK.vibrar([120, 60, 120, 60, 300]);
    completar(eq.id, 'meta', token, 'llegada');
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
