/*
 * Instalar la app en la pantalla de inicio (PWA).
 * - Android / Chrome / Edge: botón que abre el diálogo de instalación del navegador (un toque).
 * - iPhone / iPad: Apple no deja instalar desde la web; se enseña cómo: Compartir → «Añadir a pantalla de inicio».
 * No se muestra si la app ya está instalada (abierta en modo app) o si el equipo dijo «Ahora no».
 */
(function () {
  'use strict';
  const GK = window.GK;
  let aviso = null; // evento beforeinstallprompt guardado para lanzarlo al pulsar el botón

  const enModoApp = () =>
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  const ua = navigator.userAgent || '';
  const esIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const esAndroid = /Android/.test(ua);

  window.addEventListener('beforeinstallprompt', (ev) => {
    ev.preventDefault();
    aviso = ev;
    GK.pintarInstalar();
  });
  window.addEventListener('appinstalled', () => {
    aviso = null;
    GK.guardar('instalada', true);
    GK.pintarInstalar();
  });

  const icoCompartir = '<svg class="icono" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>';
  const icoAnadir = '<svg class="icono" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/></svg>';

  /** ¿Hay algo que ofrecer en este dispositivo? */
  GK.puedeInstalar = () => !enModoApp() && !GK.leer('instalada', false) && !GK.leer('instalarDescartado', false) && (!!aviso || esIOS);

  /** Pinta (o quita) la tarjeta de instalar dentro del elemento #instalar de la pantalla actual. */
  GK.pintarInstalar = function () {
    const caja = document.getElementById('instalar');
    if (!caja) return;
    if (!GK.puedeInstalar()) { caja.innerHTML = ''; return; }
    const eq = GK.leer('equipo', null);
    // En iPhone la app instalada no comparte datos con Safari: al abrirla hay que volver a unirse.
    const codigo = eq && eq.codigo ? eq.codigo.toUpperCase() : '';
    if (aviso) {
      caja.innerHTML = `
        <div class="tarjeta instalar">
          <img src="assets/img/icono-192.png" alt="" width="52" height="52">
          <div class="instalar-texto"><p class="antetitulo">Instalad la app</p><p>Tenedla en el móvil con su icono, a pantalla completa.</p></div>
          <div class="instalar-botones">
            <button class="boton" type="button" id="instalar-si">Instalar</button>
            <button class="boton-sec mini" type="button" id="instalar-no">Ahora no</button>
          </div>
        </div>`;
      caja.querySelector('#instalar-si').onclick = async () => {
        const ev = aviso;
        aviso = null;
        ev.prompt();
        try {
          const r = await ev.userChoice;
          if (r && r.outcome === 'accepted') GK.guardar('instalada', true);
        } catch (e) { /* nada */ }
        GK.pintarInstalar();
      };
    } else {
      caja.innerHTML = `
        <div class="tarjeta instalar instalar-ios">
          <div class="instalar-cab">
            <img src="assets/img/icono-192.png" alt="" width="52" height="52">
            <div class="instalar-texto"><p class="antetitulo">Instalad la app en el iPhone</p><p>Son dos toques:</p></div>
          </div>
          <ol class="instalar-pasos">
            <li><span class="paso-ico">${icoCompartir}</span><span>Pulsad <b>Compartir</b> (el cuadrado con una flecha${/CriOS|FxiOS|EdgiOS/.test(ua) ? ', junto a la barra de direcciones' : '; si no lo veis, tocad antes <b>⋯</b>'}).</span></li>
            <li><span class="paso-ico">${icoAnadir}</span><span>Elegid <b>«Añadir a pantalla de inicio»</b> y después <b>Añadir</b>.</span></li>
            <li><span class="paso-ico">${GK.icono('qr')}</span><span>Abrid la app desde su icono${codigo ? ` y uníos otra vez con vuestro código <b class="mono">${GK.html(codigo)}</b>` : ''}. En las estaciones, usad su botón <b>«Escanear QR»</b>.</span></li>
          </ol>
          <button class="boton-sec mini" type="button" id="instalar-no">Ahora no</button>
        </div>`;
    }
    caja.querySelector('#instalar-no').onclick = () => { GK.guardar('instalarDescartado', true); GK.pintarInstalar(); };
  };

  GK.dispositivo = { esIOS, esAndroid, enModoApp };
})();
