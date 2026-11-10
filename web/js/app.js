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
  /** Pantallas principales (con barra de pestañas abajo). El resto son «detalle»: flecha atrás y sin pestañas. */
  const PESTANAS = { '': 'ruta', mapa: 'mapa', escanear: 'escanear', ranking: 'ranking', ayuda: 'ayuda' };

  /** Anillo de la cabecera: una órbita con el satélite como punto (hechas / total). */
  function anillo(hechas, total) {
    const r = 15, l = 2 * Math.PI * r, f = total ? hechas / total : 0;
    const a = 2 * Math.PI * f;
    return `<span class="anillo" role="img" aria-label="${hechas} de ${total} estaciones">
      <svg viewBox="0 0 36 36" aria-hidden="true"><circle class="anillo-fondo" cx="18" cy="18" r="${r}"/>
      ${f > 0 ? `<circle class="anillo-valor" cx="18" cy="18" r="${r}" stroke-dasharray="${(l * f).toFixed(1)} ${l.toFixed(1)}"/>` : ''}
      <circle class="anillo-sat" cx="${(18 + r * Math.cos(a)).toFixed(2)}" cy="${(18 + r * Math.sin(a)).toFixed(2)}" r="3.2"/></svg>
      <b>${hechas}<small>/${total}</small></b></span>`;
  }

  function pintarCabecera() {
    const eq = miEquipo();
    const r = ruta();
    const pestana = eq ? PESTANAS[r.nombre] : null;
    const detalle = !!eq && !pestana && r.nombre !== 'unirse';
    document.body.classList.toggle('con-pestanas', !!pestana);
    $('#tabbar').classList.toggle('oculto', !pestana);
    $('#tabbar').querySelectorAll('a').forEach((a) => a.classList.toggle('activa', a.dataset.tab === pestana));
    $('#atras').classList.toggle('oculto', !detalle);
    const avatar = $('#avatar');
    if (!eq) {
      avatar.className = 'avatar';
      if (!avatar.querySelector('img')) avatar.innerHTML = `<img alt="" src="${GK.html(C.logo || 'assets/img/logo.svg')}">`;
      $('#barra-titulo').textContent = C.titulo || 'Gymkhana';
      $('#barra-der').innerHTML = '';
      return;
    }
    const sit = situacion();
    avatar.className = 'avatar avatar-equipo';
    avatar.textContent = eq.id;
    $('#barra-titulo').textContent = GK.equipo(eq.id).nombre;
    $('#barra-der').innerHTML = sit.ruta ? anillo(sit.hechas, sit.total) : '';
  }
  GK.datos.onEstado((e) => {
    const chip = $('#chip-red');
    const pend = e.pendientes;
    chip.className = 'barra-estado ' + (pend ? (e.rechazadas ? 'est-rojo' : 'est-ambar') : e.enLinea ? 'est-verde' : 'est-ambar');
    chip.innerHTML = `<i class="punto"></i><span>${pend ? `${pend} ${pend === 1 ? 'avance' : 'avances'} por enviar` : e.enLinea ? 'En línea' : 'Sin cobertura'}</span>`;
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

  async function pedirAyuda(motivoDado) {
    const ultima = GK.leer('ultimaAyuda', 0);
    if (Date.now() - ultima < 120000) {
      return GK.modal('<p>Ya habéis avisado hace un momento. <b>La organización está en camino</b> o os escribirá aquí.</p>', [['Vale', true, 'boton']]);
    }
    const motivo = typeof motivoDado === 'string'
      ? await GK.modal(`<h2 class="titulo">¿Avisamos a la organización?</h2><p class="texto-2">Motivo: <b>${GK.html(motivoDado)}</b>. Les llegará al móvil al momento.</p>`,
        [['Cancelar', null, 'boton-sec'], ['Avisar', motivoDado, 'boton']])
      : await GK.modal(
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
      if (r.nombre === 'escanear' || r.nombre === 'unirse' || r.nombre === 'ranking') return;
      if (document.querySelector('.modal')) return;
    }
    if (vista.dataset.ruta !== location.hash) {
      // Transición suave al cambiar de pantalla (como en una app nativa)
      vista.classList.remove('entra'); void vista.offsetWidth; vista.classList.add('entra');
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
      case 'mapa': if (eq) pantallaMapa(); else pantallaUnirse(); break;
      case 'ranking': if (eq) pantallaRanking(); else pantallaUnirse(); break;
      case 'ayuda': if (eq) pantallaAyuda(); else pantallaUnirse(); break;
      default: if (eq) pantallaRuta(); else pantallaUnirse();
    }
    pintarCabecera();
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

  /* ---------- Pantalla: mi ruta (inicio) ---------- */
  /** El progreso como una órbita (js/orbita.js): una marca por estación y el CubeSat en el paso actual. */
  const segmentos = (sit) => `<div class="foco-orbita">${GK.orbita(sit.hechas, sit.total)}</div>`;

  function pantallaRuta() {
    const eq = miEquipo();
    const sit = situacion();
    const iniciada = !!(estadoTorneo && estadoTorneo.iniciada);
    const sig = sit.siguiente != null ? GK.estacion(sit.siguiente) : null;
    const atascado = sit.ruta && sig && GK.leer('avisosAtasco', {})[sig.id];
    const reloj = `<span class="foco-reloj">${GK.icono('reloj')}<b class="mono" id="reloj">--:--</b></span>`;
    const icoGrande = (n, clase) => `<div class="foco-insignia ${clase || ''}" aria-hidden="true">${GK.icono(n)}</div>`;

    // Tarjeta principal: lo que el equipo tiene que hacer AHORA.
    let foco;
    if (!sit.ruta) {
      foco = `<article class="foco">
        <div class="foco-cuerpo"><div class="radar" aria-hidden="true"></div>
          <div><p class="foco-ante">Un momento</p><h1 class="foco-titulo">Adquiriendo señal…</h1>
          <p class="foco-texto">Se reparte por orden de llegada. Necesitáis conexión un momento.</p></div></div>
      </article>`;
    } else if (sit.terminado) {
      foco = `<article class="foco foco-verde">
        <div class="foco-cab"><span class="foco-ante">Gymkhana terminada</span>${reloj}</div>
        <div class="foco-cuerpo">${icoGrande('bandera', 'insignia-meta')}
          <div><h1 class="foco-titulo">Misión completada</h1><p class="foco-texto">¡Habéis llegado a la meta! Mirad el ranking para ver vuestro puesto.</p></div></div>
        <a class="boton boton-ancho" href="#/ranking">${GK.icono('podio')} Ver el ranking</a>
      </article>`;
    } else if (sit.completas && !sit.palabraHecha) {
      foco = `<article class="foco">
        <div class="foco-cab"><span class="foco-ante">Paso final</span>${reloj}</div>
        <div class="foco-cuerpo">${icoGrande('satelite', 'insignia-final')}
          <div><h1 class="foco-titulo">Última transmisión</h1><p class="foco-texto">Tenéis las ${sit.total} letras. Ordenadlas para descifrar la palabra secreta.</p></div></div>
        ${segmentos(sit)}
        <a class="boton boton-ancho boton-grande" href="#/final">${GK.icono('satelite')} Descifrar la palabra</a>
      </article>`;
    } else if (sit.palabraHecha) {
      foco = `<article class="foco foco-verde">
        <div class="foco-cab"><span class="foco-ante">Último paso</span>${reloj}</div>
        <div class="foco-cuerpo">${icoGrande('bandera', 'insignia-meta')}
          <div><h1 class="foco-titulo">${GK.html(C.meta.nombre)}</h1><p class="foco-texto">Id a la meta y escanead su QR. ¡Ya aparece en el mapa!</p></div></div>
        <a class="boton boton-ancho boton-grande boton-verde" href="#/escanear">${GK.icono('qr')} Escanear QR de la meta</a>
      </article>`;
    } else if (!iniciada) {
      const pausa = GK.enPausa(estadoTorneo);
      foco = `<article class="foco">
        <div class="foco-cab"><span class="foco-ante">${pausa ? 'Gymkhana en pausa' : 'Esperando la salida'}</span>${pausa ? reloj : ''}</div>
        <div class="foco-cuerpo">${insignia(sit.orden[0], 'foco-letra')}
          <div><h1 class="foco-titulo">Primera: ${GK.html(GK.estacion(sit.orden[0]).nombre)}</h1>
          <p class="foco-texto">${pausa ? 'La organización ha parado el juego un momento. El reloj está parado.' : 'Mirad dónde está en el mapa. Cuando la organización dé la salida, id hacia ella.'}</p></div></div>
        <div class="foco-espera"><div class="radar radar-mini" aria-hidden="true"></div><span>${pausa ? 'Esperando a que se reanude…' : 'La salida aún no se ha dado'}</span></div>
      </article>`;
    } else {
      foco = `<article class="foco">
        <div class="foco-cab"><span class="foco-ante">Paso ${sit.hechas + 1} de ${sit.total}</span>${reloj}</div>
        <div class="foco-cuerpo">${insignia(sig.id, 'foco-letra')}
          <div><h1 class="foco-titulo">${GK.html(sig.nombre)}</h1><p class="foco-texto">Buscadla en el mapa y, al llegar, escanead su QR.</p></div></div>
        ${segmentos(sit)}
        <a class="boton boton-ancho boton-grande" href="#/escanear">${GK.icono('qr')} Escanear el QR</a>
      </article>`;
    }

    vista.innerHTML = `
      <section class="pantalla">
        <div id="mensaje-org"></div>
        <div id="aviso-cola" class="aviso aviso-error aviso-reconectar oculto">
          <span>Vuestro móvil no consigue sincronizar con la organización. Ya les hemos avisado.</span>
          <button class="boton-sec mini" type="button" id="reconectar">Reconectar</button>
        </div>
        ${atascado ? '<div class="aviso aviso-info">Lleváis un rato en esta estación: <b>ya hemos avisado a la organización</b>. Si necesitáis algo más, id a «Ayuda».</div>' : ''}
        ${foco}
        ${sit.ruta ? `
        <div class="seccion">
          <div class="seccion-cab"><h2>Vuestro recorrido</h2><a href="#/mapa">Ver mapa ${GK.icono('flecha')}</a></div>
          <a class="mapa-previa" href="#/mapa" aria-label="Abrir el mapa">${GK.mapaRuta({ orden: sit.orden, hechas: sit.hechas, meta: estadoMeta(sit) })}</a>
          <p class="ruta-info"><span>Ruta ${sit.ruta.id} de ${C.rutas.length}</span><span>≈ ${GK.metros(sit.ruta.metros)}</span>${sit.ruta.id === 1 ? '<span class="ruta-corta">La más corta</span>' : ''}</p>
        </div>
        <div class="seccion">
          <div class="seccion-cab"><h2>Orden de estaciones</h2><span class="seccion-dato">${sit.hechas}/${sit.total}</span></div>
          <ol class="ruta-lista" aria-label="Orden de vuestra ruta">
            ${sit.orden.map((s, i) => `<li class="${i < sit.hechas ? 'hecha' : i === sit.hechas && !sit.completas ? 'actual' : ''}" title="${GK.html(GK.estacion(s).nombre)}"><span>${GK.html(GK.letra(s))}</span></li>`).join('')}
          </ol>
        </div>
        <div class="seccion">${filaLetras(sit)}</div>` : ''}
        <div id="instalar"></div>
        <div class="tierra" aria-hidden="true"></div>
      </section>`;
    vista.querySelector('.pantalla').classList.add('pantalla-ruta');
    if (sit.ruta) GK.animarOrbita(vista, `${eq.id}:${sit.ruta.id}`);
    $('#reconectar').onclick = () => { GK.datos.reconectar(); $('#aviso-cola').classList.add('oculto'); };
    GK.datos.onEstado(() => {}); // actualiza el aviso de la cola recién pintado
    const tic = () => {
      const r = $('#reloj');
      if (!r) return;
      r.textContent = GK.formatoTiempo(GK.tiempoJuego(estadoTorneo, sit.terminado ? sit.ultima : Date.now()));
    };
    tic();
    relojId = setInterval(tic, 1000);
  }

  /* ---------- Pantalla: mapa a pantalla completa ---------- */
  function pantallaMapa() {
    const sit = situacion();
    const sig = sit.siguiente != null ? GK.estacion(sit.siguiente) : null;
    const destino = !sit.ruta ? null
      : sit.terminado ? { ante: 'Misión completada', nombre: '¡En la meta!' }
      : sit.palabraHecha ? { ante: 'Ahora id a', nombre: C.meta.nombre, meta: true }
      : sit.completas ? { ante: 'Paso final', nombre: 'Última transmisión' }
      : sig ? { ante: estadoTorneo && estadoTorneo.iniciada ? `Siguiente · paso ${sit.hechas + 1} de ${sit.total}` : 'Primera estación', nombre: sig.nombre, letra: sig.id } : null;
    vista.innerHTML = `
      <section class="pantalla pantalla-mapa">
        <div class="mapa-completo">${GK.mapaRuta({ orden: sit.orden, hechas: sit.hechas, meta: estadoMeta(sit) })}</div>
        <div class="mapa-leyenda" aria-hidden="true"><span><i class="ley-hecha"></i>Hechas</span><span><i class="ley-sig"></i>Siguiente</span><span><i class="ley-pend"></i>Pendientes</span></div>
        ${destino ? `<div class="mapa-destino">
          ${destino.letra ? insignia(destino.letra, 'destino-letra') : `<div class="destino-letra ${destino.meta ? 'insignia-meta' : 'insignia-final'}">${GK.icono(destino.meta ? 'bandera' : 'satelite')}</div>`}
          <div><p class="foco-ante">${GK.html(destino.ante)}</p><p class="destino-nombre">${GK.html(destino.nombre)}</p></div>
          ${sit.terminado ? '' : `<a class="boton mini-boton" href="${sit.completas && !sit.palabraHecha ? '#/final' : '#/escanear'}" aria-label="Escanear">${GK.icono('qr')}</a>`}
        </div>` : ''}
      </section>`;
    // El visor se centra solo en la siguiente estación (o la última hecha)
    GK.activarMapa(vista);
  }

  /* ---------- Pantalla: ranking dentro de la app ---------- */
  function pantallaRanking() {
    const eq = miEquipo();
    vista.innerHTML = `
      <section class="pantalla">
        <div class="pantalla-cab"><h1 class="titulo">Telemetría</h1><span class="en-directo"><i></i>En directo</span></div>
        <ol class="clasif" id="clasif" aria-label="Clasificación"><li class="clasif-cargando">Cargando…</li></ol>
        <a class="enlace-sec" href="ranking.html">${GK.icono('pantalla')} Abrir el ranking en pantalla grande</a>
      </section>`;
    let todos = {};
    const pintar = () => {
      const ol = $('#clasif');
      if (!ol) return;
      const clasif = GK.clasificar(todos);
      ol.innerHTML = clasif.map((s, i) => {
        const yo = s.equipo.id === eq.id;
        const estado = !s.ruta ? 'Sin ruta todavía'
          : s.terminado ? `En meta · ${estadoTorneo && estadoTorneo.inicio ? GK.formatoTiempo(GK.tiempoJuego(estadoTorneo, s.ultima)) : ''}`
          : s.palabraHecha ? 'Camino de la meta'
          : s.completas ? 'Descifrando la palabra'
          : `${s.hechas} de ${s.total} estaciones`;
        const f = s.ruta ? Math.min(1, s.pasos / (s.total + 2)) : 0;
        return `<li class="clasif-fila${yo ? ' yo' : ''}${s.terminado ? ' terminado' : ''}">
          <span class="clasif-puesto p${i + 1}">${i + 1}</span>
          <span class="clasif-info"><b>${GK.html(s.equipo.nombre)}${yo ? ' <small>· vosotros</small>' : ''}</b>
            <span class="clasif-barra"><i style="width:${(f * 100).toFixed(1)}%"></i></span>
            <span class="clasif-estado">${GK.html(estado)}</span></span>
          <span class="clasif-cuenta">${s.terminado ? GK.icono('bandera') : `${s.hechas}<small>/${s.total}</small>`}</span>
        </li>`;
      }).join('');
    };
    const quitar = [
      GK.datos.escuchar('progreso', (v) => { todos = v || {}; pintar(); }),
      GK.datos.escuchar('asignacion', () => pintar()),
    ];
    limpiarVista = () => quitar.forEach((f) => f());
  }

  /* ---------- Pantalla: ayuda y ajustes del equipo ---------- */
  function pantallaAyuda() {
    const eq = miEquipo();
    const puedeInstalar = GK.enModoApp && !GK.enModoApp() && (GK.dispositivo.esIOS || GK.dispositivo.esAndroid);
    const fila = (id, ico, texto, sub, clase) => `<button type="button" class="fila-ajuste ${clase || ''}" id="${id}">
      <span class="fila-ico">${GK.icono(ico)}</span><span class="fila-texto"><b>${texto}</b>${sub ? `<small>${sub}</small>` : ''}</span>${GK.icono('flecha')}</button>`;
    vista.innerHTML = `
      <section class="pantalla">
        <div id="mensaje-org"></div>
        <div class="pantalla-cab"><h1 class="titulo">Ayuda</h1></div>
        <div class="tarjeta ayuda-sos">
          <div class="ayuda-sos-cab"><span class="fila-ico ico-sos">${GK.icono('campana')}</span>
            <div><b>¿Os habéis atascado?</b><p class="texto-2">Elegid qué pasa y avisamos a la organización en su móvil.</p></div></div>
          <div class="lista-ajustes">
            ${MOTIVOS.map((m, i) => fila('motivo-' + i, ['lupa', 'bombilla', 'qr', 'mensaje'][i] || 'ayuda', GK.html(m), '')).join('')}
          </div>
        </div>
        <div id="instalar"></div>
        <h2 class="seccion-titulo">Vuestro equipo</h2>
        <div class="lista-ajustes tarjeta">
          <div class="fila-ajuste fila-info"><span class="avatar avatar-equipo">${eq.id}</span><span class="fila-texto"><b>${GK.html(GK.equipo(eq.id).nombre)}</b><small>Código <span class="mono">${GK.html((eq.codigo || '').toUpperCase())}</span></small></span></div>
          ${puedeInstalar ? fila('instalar-app', 'mas', 'Instalar la app', 'Con su icono, a pantalla completa') : ''}
          ${fila('ver-ranking', 'pantalla', 'Ranking en pantalla grande', 'Para verlo en un ordenador o proyector')}
          ${fila('salir', 'reinicio', 'Cambiar de equipo', 'El progreso del equipo no se pierde', 'fila-peligro')}
        </div>
        <h2 class="seccion-titulo">Cómo funciona</h2>
        <ol class="como-funciona tarjeta">
          <li><b>Seguid vuestra ruta.</b> El mapa marca la siguiente estación.</li>
          <li><b>Escanead el QR</b> de la estación con el botón central.</li>
          <li><b>Superad la prueba.</b> Al minuto aparece una pista.</li>
          <li><b>Juntad las ${C.estaciones.length} letras</b>, descifrad la palabra y corred a la meta.</li>
        </ol>
      </section>`;
    MOTIVOS.forEach((m, i) => { $('#motivo-' + i).onclick = () => pedirAyuda(m); });
    if ($('#instalar-app')) $('#instalar-app').onclick = () => GK.mostrarInstalar();
    $('#ver-ranking').onclick = () => { location.href = 'ranking.html'; };
    $('#salir').onclick = async () => {
      const ok = await GK.modal('<h2 class="titulo">¿Cambiar de equipo?</h2><p class="texto-2">Este móvil dejará de estar en el equipo. El progreso del equipo no se pierde.</p>',
        [['Cancelar', false], ['Cambiar', true, 'boton']]);
      if (ok) ir('#/unirse');
    };
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
    // Pruebas de contenido: cada equipo tiene su contenido, su sal y su huella (config → estaciones[].equipos)
    const propio = (est.equipos && est.equipos[eq.id]) || null;
    const datosPrueba = propio ? { ...est.prueba, ...propio.prueba, datoCifrado: propio.datoCifrado } : (est.prueba || {});
    const sal = propio ? propio.sal : est.sal;
    const huellaClave = propio ? propio.huella : est.huella;
    vista.innerHTML = `
      <section class="pantalla">
        <div id="mensaje-org"></div>
        <header class="senal" style="--barras:${est.id}">
          <div class="senal-banda" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
          <div class="senal-cuerpo">
            ${insignia(est.id, 'senal-letra')}
            <div>
              <p class="senal-paso">${GK.html(est.nombre)} · paso ${sit.hechas + 1} de ${sit.total}</p>
              <h1 class="senal-titulo">${GK.html(prueba.titulo || est.nombre)}</h1>
            </div>
          </div>
        </header>
        ${htmlObjetivo(prueba, datosPrueba)}
        <div id="prueba"></div>
        <div id="ayuda-prueba" aria-live="polite"></div>
        <div id="pista"></div>
        <div class="reto-pie">
          <button class="enlace-ayuda" type="button" id="ayuda">${GK.icono('ayuda')} ¿Atascados? Avisar a la organización</button>
        </div>
      </section>`;
    $('#ayuda').onclick = pedirAyuda;
    pintarMensaje();
    estacionEnCurso = { id: est.id, equipo: eq.id };
    const limpiezas = [];
    const ctx = {
      estacion: { id: est.id, letra: est.letra, nombre: est.nombre, prueba: datosPrueba, sal },
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
        const h = await GK.huella(respuesta, sal);
        if (h !== huellaClave && !(datosPrueba.huellasAlternativas || []).includes(h)) return false;
        await guardarDato(eq.id, est.id, datosPrueba, respuesta, sal);
        completar(eq.id, est.id, token, GK.normalizar(respuesta), opciones && opciones.quedarse);
        return true;
      },
      /** Tras un intentar(…, { quedarse: true }): pasa a la pantalla de «estación superada». */
      continuar() { ir('#/superada/' + est.id); },
      /** ¿La respuesta coincide con otra huella de la prueba (misma sal que la estación)? Sin superar nada. */
      async coincide(respuesta, huella) {
        return !!GK.normalizar(respuesta) && (await GK.huella(respuesta, sal)) === huella;
      },
      /**
       * ctx.parte(respuesta, sellos) → Promise<string|null>. Comprueba UNA parte de una prueba por partes: si la
       * respuesta es válida, devuelve su trozo de la clave (si no, null). La clave del equipo es la unión de los trozos
       * de todas las partes, en orden: ctx.intentar(trozos.join('')).
       */
      async parte(respuesta, sellos) {
        if (!GK.normalizar(respuesta)) return null;
        const h = await GK.huella(respuesta, sal);
        for (const s of sellos || []) {
          const t = await GK.abrirSello(s, h);
          if (t) return t;
        }
        return null;
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
  /**
   * Qué hay que hacer en la prueba, igual en todas: el objetivo (una frase) y 2 o 3 pasos cortos. Cada prueba lo
   * define como datos en su módulo (objetivo y pasos); aquí se pinta, entre la cabecera de la estación y la prueba.
   */
  function htmlObjetivo(prueba, datos) {
    // objetivo y pasos pueden ser funciones de la configuración de torneo.json (por ejemplo, cuántas fotos hay)
    const valor = (x) => (typeof x === 'function' ? x(datos || {}) : x);
    const objetivo = prueba && valor(prueba.objetivo);
    if (!objetivo) return '';
    const pasos = valor(prueba.pasos) || [];
    return `
      <section class="objetivo" aria-label="Qué hay que hacer">
        <p class="objetivo-texto">${GK.html(objetivo)}</p>
        ${pasos.length ? `<ol class="objetivo-pasos">${pasos.map((p) => `<li>${GK.html(p)}</li>`).join('')}</ol>` : ''}
      </section>`;
  }

  function actualizarEstacionEnCurso() {
    // Si mientras están en la prueba otro móvil del equipo la completa (o la organización la marca), se avanza solo.
    if (!estacionEnCurso || estacionEnCurso.quedarse) return;
    const sit = situacion();
    if (estacionEnCurso.id === 'final') { if (sit.palabraHecha) ir('#/superada/final'); return; }
    const pos = sit.orden.indexOf(estacionEnCurso.id);
    if (pos > -1 && pos < sit.hechas) ir('#/superada/' + estacionEnCurso.id);
  }

  /**
   * Dato real de la estación (privado/secretos.json → «dato»). Se publica cifrado con la respuesta (alguno la
   * delataría), así que se descifra al acertar y se guarda en el móvil para la pantalla de «superada».
   */
  async function guardarDato(idEq, idEst, prueba, respuesta, sal) {
    for (const c of prueba.datoCifrado || []) {
      try {
        const t = await GK.descifrar(c, respuesta, sal);
        if (t && t.startsWith('gk:')) { GK.guardar(`dato:${idEq}:${idEst}`, t.slice(3)); return; }
      } catch (e) { /* sin dato */ }
    }
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
    // La letra llega como una foto SSTV, línea a línea: solo la primera vez que se ve esta pantalla
    // (si la pantalla se repinta a mitad, p. ej. al sincronizar, la animación sigue por donde iba)
    const claveRecibida = `recibida:${eq.id}:${idEst}`;
    let recibidaEn = Number(GK.leer(claveRecibida, 0)) || 0;
    if (!recibidaEn) { recibidaEn = Date.now(); GK.guardar(claveRecibida, recibidaEn); }
    const transcurrido = Date.now() - recibidaEn;
    const recibiendo = transcurrido < 2100;
    const dato = GK.leer(`dato:${eq.id}:${idEst}`, '');
    vista.innerHTML = `
      <section class="pantalla superada">
        <div class="destello" aria-hidden="true"></div>
        <p class="antetitulo">Estación ${GK.html(GK.letra(idEst))} · señal recibida</p>
        <h1 class="titulo">${GK.tituloHTML('¡Estación superada!', 'superada!')}</h1>
        ${letra ? `<div class="letra-ganada">
          <div class="foto-sstv${recibiendo ? ' recibiendo' : ''}" style="--retraso:${250 - transcurrido}ms" role="img" aria-label="Letra recibida: ${GK.html(letra)}">
            <div class="foto-sstv-imagen">
              <div class="foto-sstv-barras" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
              <div class="letra-grande">${GK.html(letra)}</div>
            </div>
            <i class="foto-sstv-linea" aria-hidden="true"></i>
          </div>
          <p>Habéis conseguido la letra <b>${GK.html(letra)}</b></p>
        </div>
        ${filaLetras(sit)}` : ''}
        ${dato ? `<aside class="dato"><p class="dato-titulo">${GK.icono('satelite')} Dato real</p><p class="dato-texto">${GK.html(dato)}</p></aside>` : ''}
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
        <header class="senal senal-final">
          <div class="senal-banda" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
          <div class="senal-cuerpo">
            <div class="senal-letra insignia-final" aria-hidden="true">${GK.icono('satelite')}</div>
            <div>
              <p class="senal-paso">Paso final</p>
              <h1 class="senal-titulo">Última transmisión</h1>
            </div>
          </div>
        </header>
        <div class="reto">
          <div class="reto-cuerpo">
            <p class="reto-intro">Señal recibida de las ${sit.total} estaciones. Las letras llegan <b>desordenadas</b>: ordenadlas para descifrar la palabra secreta.</p>
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
        <div class="reto-pie">
          <button class="enlace-ayuda" type="button" id="ayuda">${GK.icono('ayuda')} ¿Atascados? Avisar a la organización</button>
        </div>
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
