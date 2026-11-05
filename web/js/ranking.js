/* Ranking en directo: podio con los 3 primeros en grande y el resto en pequeño. */
(function () {
  'use strict';
  const GK = window.GK;
  const C = window.GK_CONFIG;
  const $ = (s) => document.querySelector(s);
  const podio = $('#podio');
  const lista = $('#lista');

  let progreso = {};
  let estado = null;
  let nombres = {};
  let previo = null; // situaciones anteriores, para detectar cambios
  const nodos = new Map();

  $('#lugar').textContent = C.lugar || '';

  const nombre = (eq) => (nombres[eq.id] && nombres[eq.id].nombre) || eq.nombre;

  function estrellas(sit, grande) {
    // Una marca por estación, en el orden de la ruta del equipo: encendidas las hechas.
    if (!sit.ruta) return '<div class="estrellas sin-ruta">SIN RUTA TODAVÍA</div>';
    return `<div class="estrellas${grande ? ' grandes' : ''}" aria-hidden="true">${sit.orden
      .map((s, i) => `<span class="${i < sit.hechas ? 'on' : i === sit.hechas && !sit.terminado ? 'sig' : ''}">${GK.html(GK.letra(s))}</span>`)
      .join('')}</div>`;
  }
  /** Tiempo total de un equipo que ha terminado (desde la salida hasta su última estación). */
  const tiempo = (sit) => (sit.terminado && estado && estado.inicio ? GK.formatoTiempo(sit.ultima - estado.inicio) : null);
  function faltan(sit) {
    if (!sit.ruta) return 'Esperando a que llegue con el mapa';
    if (sit.terminado) return `<span class="completo">MISIÓN COMPLETA · ${tiempo(sit) || ''}</span>`;
    return `Faltan <b>${sit.total - sit.hechas}</b>: ${sit.faltan.map(GK.letra).join(' · ')}`;
  }
  const infoRuta = (sit) => (sit.ruta ? `Ruta ${sit.ruta.id} · ≈${GK.metros(sit.ruta.metros)}` : '');

  function contenidoPodio(sit, puesto) {
    return `
      <div class="medalla m${puesto}">${puesto}</div>
      <div class="podio-nombre">${GK.html(nombre(sit.equipo))}</div>
      <div class="podio-cuenta"><b>${sit.hechas}</b><span>/${sit.total}</span></div>
      ${tiempo(sit) ? `<div class="podio-tiempo mono">⏱ ${tiempo(sit)}</div>` : `<div class="podio-ruta mono">${infoRuta(sit)}</div>`}
      <div class="podio-cielo">${sit.ruta ? GK.constelacion({ ruta: sit.orden, hechas: sit.hechas, compacto: true, etiquetas: false }) : ''}</div>
      <div class="podio-faltan">${faltan(sit)}</div>
      <div class="peana"><span>${puesto}º</span></div>`;
  }
  function contenidoFila(sit, puesto) {
    return `
      <span class="fila-puesto">${puesto}</span>
      <span class="fila-nombre">${GK.html(nombre(sit.equipo))} <small class="mono">${infoRuta(sit)}</small></span>
      ${estrellas(sit, false)}
      <span class="fila-cuenta"><b>${sit.hechas}</b>/${sit.total}</span>
      <span class="fila-faltan">${faltan(sit)}</span>`;
  }

  function pintar() {
    const clasif = GK.clasificar(progreso);
    // FLIP: guardamos dónde estaba cada equipo para animar el cambio de puesto.
    const antes = new Map();
    nodos.forEach((n, id) => antes.set(id, n.getBoundingClientRect()));

    const huecos = [null, null, null];
    lista.innerHTML = '';
    clasif.forEach((sit, i) => {
      const id = sit.equipo.id;
      let n = nodos.get(id);
      const enPodio = i < 3;
      if (!n || (n.tagName === 'LI') === enPodio) {
        n = document.createElement(enPodio ? 'article' : 'li');
        n.dataset.eq = id;
        nodos.set(id, n);
      }
      n.className = enPodio ? `podio-equipo p${i + 1}${sit.terminado ? ' terminado' : ''}` : `fila${sit.terminado ? ' terminado' : ''}`;
      n.innerHTML = enPodio ? contenidoPodio(sit, i + 1) : contenidoFila(sit, i + 1);
      n.setAttribute('aria-label', `Puesto ${i + 1}: ${nombre(sit.equipo)}, ${sit.hechas} de ${sit.total} estaciones`);
      if (enPodio) huecos[i] = n; else lista.appendChild(n);
    });
    // Orden visual del podio: 2º, 1º, 3º
    podio.replaceChildren(...[huecos[1], huecos[0], huecos[2]].filter(Boolean));

    if (!GK.menosMovimiento()) {
      nodos.forEach((n, id) => {
        const a = antes.get(id);
        if (!a || !n.isConnected) return;
        const b = n.getBoundingClientRect();
        const dx = a.left - b.left, dy = a.top - b.top;
        if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
        n.animate([{ transform: `translate(${dx}px, ${dy}px)`, opacity: .6 }, { transform: 'none', opacity: 1 }],
          { duration: 700, easing: 'cubic-bezier(.2,.8,.2,1)' });
      });
    }

    // Avisos de cambios: estación completada, adelantamientos y equipos que terminan.
    const ahora = new Map(clasif.map((s, i) => [s.equipo.id, { ...s, puesto: i + 1 }]));
    if (previo) {
      ahora.forEach((s, id) => {
        const p = previo.get(id);
        if (!p || s.hechas <= p.hechas) return;
        const n = nodos.get(id);
        n.classList.remove('destello'); void n.offsetWidth; n.classList.add('destello');
        if (s.terminado) {
          aviso(`🏁 ${nombre(s.equipo)} completa la misión en ${tiempo(s) || '—'}`, 'final');
          celebrar(n);
        } else {
          aviso(`${nombre(s.equipo)} supera la estación ${GK.letra(s.orden[s.hechas - 1])}${s.puesto < p.puesto ? ` y sube al ${s.puesto}º puesto` : ''}`);
        }
      });
    }
    previo = ahora;
  }

  function aviso(texto, tipo) {
    const a = document.createElement('div');
    a.className = 'aviso-ranking' + (tipo ? ' ' + tipo : '');
    a.textContent = texto;
    $('#avisos').prepend(a);
    setTimeout(() => a.classList.add('fuera'), 5200);
    setTimeout(() => a.remove(), 6000);
    while ($('#avisos').children.length > 4) $('#avisos').lastChild.remove();
  }

  function celebrar(nodo) {
    if (GK.menosMovimiento()) return;
    const r = nodo.getBoundingClientRect();
    for (let i = 0; i < 36; i++) {
      const p = document.createElement('span');
      p.className = 'chispa';
      const ang = Math.random() * Math.PI * 2;
      const dist = 120 + Math.random() * 260;
      p.style.left = r.left + r.width / 2 + 'px';
      p.style.top = r.top + r.height / 3 + 'px';
      p.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
      p.style.setProperty('--dy', Math.sin(ang) * dist - 80 + 'px');
      p.style.animationDelay = Math.random() * 0.25 + 's';
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 2200);
    }
  }

  function pintarEstado() {
    const chip = $('#chip-estado');
    if (estado && estado.iniciada) { chip.className = 'chip chip-verde'; chip.innerHTML = '<span class="led"></span>EN DIRECTO'; }
    else if (estado && estado.fin) { chip.className = 'chip chip-ambar'; chip.innerHTML = '<span class="led"></span>EN PAUSA'; }
    else { chip.className = 'chip'; chip.innerHTML = '<span class="led"></span>ESPERANDO LA SALIDA'; }
  }
  setInterval(() => {
    const r = $('#reloj');
    if (!estado || !estado.inicio) { r.textContent = '--:--'; return; }
    r.textContent = GK.formatoTiempo((estado.iniciada || !estado.fin ? Date.now() : estado.fin) - estado.inicio);
  }, 500);

  GK.datos.escuchar('progreso', (v) => { progreso = v || {}; pintar(); });
  GK.datos.escuchar('estado', (v) => { estado = v; pintarEstado(); pintar(); });
  GK.datos.escuchar('asignacion', () => pintar());
  GK.datos.leerUnaVez('equipos').then((v) => { if (v) { nombres = v; pintar(); } }).catch(() => {});
  pintar();
  pintarEstado();

  const completa = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
  };
  $('#pantalla-completa').addEventListener('click', completa);
  document.addEventListener('keydown', (e) => { if (e.key === 'f' || e.key === 'F') completa(); });
})();
