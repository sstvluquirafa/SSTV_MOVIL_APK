/*
 * Prueba HACKEA EL SATÉLITE (app). Pantalla de acceso con estética de terminal (usuario fijo y contraseña) y, al
 * lado, el perfil público en redes de la ingeniera: la contraseña sale de lo que publica. Fallo → «ACCESO
 * DENEGADO», sin espera. Al acertar → «ACCESO CONCEDIDO» y una línea de lección.
 * Configuración en torneo.json → prueba: sistema, usuario, ayudaContrasena, perfil { nombre, usuario, bio,
 * publicaciones: [{ fecha, texto }] } y leccion. La contraseña es la «clave» en privado/secretos.json.
 */
(function () {
  'use strict';
  const GK = window.GK;

  GK.pruebas.registrar('hackeo', {
    titulo: 'Hackea el satélite',
    montar(contenedor, ctx) {
      const P = ctx.estacion.prueba;
      const perfil = P.perfil || {};
      const iniciales = String(perfil.nombre || '?').split(/\s+/).map((p) => p[0] || '').join('').slice(0, 2).toUpperCase();
      contenedor.innerHTML = `
        <div class="hack-rejilla">
          <div class="ventana hack-terminal">
            <div class="ventana-barra"><span class="puntos"><i></i><i></i><i></i></span><span>Control de misión · ${GK.html(P.sistema || 'GranaSAT-II')}</span></div>
            <div class="telemetria mono" aria-label="Telemetría del satélite">
              <span>BAT <b>7,9 V</b></span><span>TEMP <b>21 °C</b></span><span>ALT <b>512 km</b></span><span>ENLACE <b class="tlm-bloq">bloqueado</b></span>
            </div>
            <div class="ventana-cuerpo">
              <p class="terminal">&gt; Conectando con ${GK.html(P.sistema || 'el satélite')}…<br>&gt; <b>Identificaos</b> para tomar el control.</p>
              <form autocomplete="off" id="hack-form">
                <label class="etiqueta" for="hack-usuario">Usuario</label>
                <input id="hack-usuario" class="campo mono" value="${GK.html(P.usuario || '')}" readonly>
                <label class="etiqueta" for="hack-clave">Contraseña</label>
                <input id="hack-clave" class="campo mono" type="text" autocapitalize="none" spellcheck="false" maxlength="40" required>
                <p class="hack-ayuda mono">Pista de contraseña: «${GK.html(P.ayudaContrasena || '')}»</p>
                <button class="boton boton-ancho" type="submit">Entrar</button>
              </form>
              <pre class="hack-log mono" id="hack-log" aria-live="polite"></pre>
            </div>
          </div>
          <article class="tarjeta perfil-red" aria-label="Perfil público de ${GK.html(perfil.nombre || '')}">
            <p class="antetitulo">Perfil público en redes</p>
            <header class="perfil-cab">
              <div class="perfil-avatar" aria-hidden="true">${GK.html(iniciales)}</div>
              <div><b>${GK.html(perfil.nombre || '')}</b><span class="texto-2">${GK.html(perfil.usuario || '')}</span></div>
            </header>
            ${perfil.bio ? `<p class="perfil-bio">${GK.html(perfil.bio)}</p>` : ''}
            <ul class="perfil-posts">
              ${(perfil.publicaciones || []).map((p) => `<li><span class="mono texto-2">${GK.html(p.fecha || '')}</span><p>${GK.html(p.texto)}</p></li>`).join('')}
            </ul>
          </article>
        </div>`;
      const form = contenedor.querySelector('#hack-form');
      const campo = contenedor.querySelector('#hack-clave');
      const log = contenedor.querySelector('#hack-log');
      const terminal = contenedor.querySelector('.hack-terminal');
      let intentos = 0;
      let temporizador = null;
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const boton = form.querySelector('button');
        boton.disabled = true;
        const clave = campo.value;
        if (await ctx.intentar(clave, { quedarse: true })) {
          terminal.classList.add('concedido');
          // «ACCESO CONCEDIDO» llena la pantalla un segundo (no tapa los toques: pointer-events none)
          const total = document.createElement('div');
          total.className = 'acceso-total';
          total.setAttribute('role', 'status');
          total.innerHTML = '<p class="mono">ACCESO<br>CONCEDIDO</p>';
          document.body.appendChild(total);
          temporizador = setTimeout(() => total.remove(), 1100);
          const enlace = terminal.querySelector('.tlm-bloq');
          if (enlace) { enlace.textContent = 'abierto'; enlace.classList.add('tlm-ok'); }
          terminal.querySelector('.ventana-cuerpo').innerHTML = `
            <div class="hack-ok">
              <p class="hack-ok-titulo mono">ACCESO CONCEDIDO</p>
              <p class="terminal">&gt; Bienvenida, ${GK.html(P.usuario || '')}. Control del satélite: <b>OK</b></p>
              ${P.leccion ? `<p class="hack-leccion">${GK.html(P.leccion)}</p>` : ''}
              <button class="boton boton-ancho" type="button" id="hack-seguir">Continuar</button>
            </div>`;
          terminal.querySelector('#hack-seguir').onclick = () => ctx.continuar();
          return;
        }
        intentos++;
        boton.disabled = false;
        campo.select();
        log.textContent = `$ login ${P.usuario || ''}\n> ACCESO DENEGADO (intento ${intentos})\n` + log.textContent.split('\n').slice(0, 4).join('\n');
        terminal.classList.remove('denegado'); void terminal.offsetWidth; terminal.classList.add('denegado');
      });
      return () => { clearTimeout(temporizador); document.querySelectorAll('.acceso-total').forEach((x) => x.remove()); };
    },
  });
})();
