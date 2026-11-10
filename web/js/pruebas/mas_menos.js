/*
 * Prueba ¿MÁS O MENOS? (app; estilo «higher or lower»). Dos tarjetas con un dibujo y un nombre, y encima la pregunta
 * («¿Qué es MÁS GRANDE?»). Se toca una: si acierta, la racha sube y se ve el dato real; si falla, se marca la correcta,
 * se ve su dato y la racha vuelve a 0 (y la siguiente ronda es otra selección). Hay que encadenar 8 aciertos seguidos;
 * al llegar, la estación se completa sola.
 *
 * Igual para todos (privado/bancos.json → mas_menos). Cada intento: 8 parejas al azar, en orden y lado aleatorios.
 * Sin respuestas en claro: prueba.parejas[i] = { pregunta, opciones: [{ nombre, icono }, …], huella, datoCifrado }; la
 * huella es la del nombre correcto (ctx.coincide) y el dato va cifrado con él. La clave de la estación va ofuscada
 * (prueba.clave + prueba.salClave), como las palabras del Wordle: la app la revela al completar la racha.
 */
(function () {
  'use strict';
  const GK = window.GK;

  /* Dibujos propios (viewBox 64 × 64), sencillos y de colores vivos. «emoji:…» se pinta tal cual. */
  const C = '#0b1230'; // contorno
  const DIBUJOS = {
    planeta: (c) => `<circle cx="32" cy="32" r="22" fill="${c}" stroke="${C}" stroke-width="3"/><path d="M40,14 A22 22 0 0 1 40,50 A16 22 0 0 0 40,14Z" fill="#000" opacity=".22"/><circle cx="24" cy="25" r="4" fill="#fff" opacity=".35"/>`,
    'planeta-anillo': (c) => `<ellipse cx="32" cy="32" rx="30" ry="8" fill="none" stroke="${C}" stroke-width="7" transform="rotate(-18 32 32)"/><ellipse cx="32" cy="32" rx="30" ry="8" fill="none" stroke="#ffe0b2" stroke-width="4" transform="rotate(-18 32 32)"/><circle cx="32" cy="32" r="17" fill="${c}" stroke="${C}" stroke-width="3"/><path d="M15,32 A30 8 0 0 0 49,32" transform="rotate(-18 32 32)" fill="none" stroke="#ffe0b2" stroke-width="4"/>`,
    'planeta-bandas': (c) => `<clipPath id="mm-b"><circle cx="32" cy="32" r="23"/></clipPath><circle cx="32" cy="32" r="23" fill="${c}"/><g clip-path="url(#mm-b)"><rect x="5" y="18" width="54" height="5" fill="#a0522d"/><rect x="5" y="30" width="54" height="6" fill="#f3d9b1"/><rect x="5" y="42" width="54" height="4" fill="#a0522d"/><ellipse cx="40" cy="39" rx="5" ry="3" fill="#c62828"/></g><circle cx="32" cy="32" r="23" fill="none" stroke="${C}" stroke-width="3"/>`,
    sol: () => `<g stroke="#ffb300" stroke-width="4" stroke-linecap="round"><path d="M32,3 V11 M32,53 V61 M3,32 H11 M53,32 H61 M11,11 L17,17 M47,47 L53,53 M11,53 L17,47 M47,17 L53,11"/></g><circle cx="32" cy="32" r="17" fill="#ffeb3b" stroke="${C}" stroke-width="3"/>`,
    estrella: (c) => `<circle cx="32" cy="32" r="27" fill="${c}" opacity=".25"/><circle cx="32" cy="32" r="22" fill="${c}" stroke="${C}" stroke-width="3"/><circle cx="25" cy="25" r="6" fill="#ff8a65" opacity=".8"/>`,
    montana: (c) => `<path d="M4,54 L26,16 L36,30 L42,22 L60,54Z" fill="${c}" stroke="${C}" stroke-width="3" stroke-linejoin="round"/><path d="M20,26 L26,16 L32,24 Z" fill="#ffccbc"/><path d="M2,56 H62" stroke="${C}" stroke-width="3"/>`,
    sputnik: () => `<path d="M30,34 L6,58 M34,36 L18,62 M36,34 L48,62 M38,30 L62,48" stroke="#b0bec5" stroke-width="2.5"/><circle cx="34" cy="28" r="15" fill="#cfd8dc" stroke="${C}" stroke-width="3"/><circle cx="29" cy="23" r="4" fill="#fff"/>`,
    iss: () => `<rect x="4" y="10" width="14" height="44" fill="#1565c0" stroke="${C}" stroke-width="2"/><rect x="46" y="10" width="14" height="44" fill="#1565c0" stroke="${C}" stroke-width="2"/><path d="M4,32 H60" stroke="#b0bec5" stroke-width="4"/><rect x="24" y="24" width="16" height="16" rx="3" fill="#eceff1" stroke="${C}" stroke-width="2.5"/><path d="M11,10 V54 M53,10 V54" stroke="#90caf9" stroke-width="1.5"/>`,
    sonda: () => `<path d="M22,12 A20 20 0 0 0 42,40" fill="#eceff1" stroke="${C}" stroke-width="3"/><path d="M32,26 L54,58 M30,30 L8,52" stroke="#b0bec5" stroke-width="3"/><rect x="26" y="34" width="12" height="10" fill="#ffca28" stroke="${C}" stroke-width="2"/>`,
    cubesat: () => `<path d="M32,16 V6" stroke="#eceff1" stroke-width="3"/><circle cx="32" cy="5" r="3" fill="#ef5350"/><rect x="3" y="26" width="13" height="14" fill="#1565c0" stroke="${C}" stroke-width="2"/><rect x="48" y="26" width="13" height="14" fill="#1565c0" stroke="${C}" stroke-width="2"/><rect x="16" y="16" width="32" height="32" rx="4" fill="#ffca28" stroke="${C}" stroke-width="3"/><rect x="21" y="22" width="22" height="10" rx="2" fill="#263238"/><circle cx="25" cy="40" r="3" fill="#29b6f6"/>`,
    hubble: () => `<rect x="18" y="14" width="28" height="40" rx="5" fill="#cfd8dc" stroke="${C}" stroke-width="3"/><path d="M18,22 H46" stroke="${C}" stroke-width="2"/><rect x="2" y="26" width="14" height="18" fill="#1565c0" stroke="${C}" stroke-width="2"/><rect x="48" y="26" width="14" height="18" fill="#1565c0" stroke="${C}" stroke-width="2"/><ellipse cx="32" cy="14" rx="14" ry="4" fill="#455a64" stroke="${C}" stroke-width="2"/>`,
    webb: () => `<path d="M6,52 L32,60 L58,52 L32,44Z" fill="#ce93d8" stroke="${C}" stroke-width="2"/>${[[32, 18], [22, 24], [42, 24], [22, 36], [42, 36], [32, 30], [32, 42]].map(([x, y]) => `<path d="M${x},${y - 6} l5,3 v6 l-5,3 l-5,-3 v-6z" fill="#ffc107" stroke="${C}" stroke-width="1.5"/>`).join('')}`,
    cohete: () => `<path d="M32,4 C40,12 42,30 40,50 H24 C22,30 24,12 32,4Z" fill="#fafafa" stroke="${C}" stroke-width="3"/><path d="M32,4 C36,8 38,12 39,16 H25 C26,12 28,8 32,4Z" fill="#ef5350"/><path d="M24,24 H40 M24,36 H40" stroke="${C}" stroke-width="2"/><path d="M24,42 L16,56 L24,52Z M40,42 L48,56 L40,52Z" fill="#ef5350" stroke="${C}" stroke-width="2"/><path d="M28,52 L32,62 L36,52Z" fill="#ffb300"/>`,
    torre: () => `<rect x="22" y="22" width="20" height="38" fill="#f0c27b" stroke="${C}" stroke-width="3"/><rect x="25" y="12" width="14" height="10" fill="#f6d59b" stroke="${C}" stroke-width="2.5"/><path d="M28,12 L32,4 L36,12" fill="#ffca28" stroke="${C}" stroke-width="2"/><path d="M32,4 V1" stroke="${C}" stroke-width="2"/><path d="M27,30 V38 M37,30 V38 M27,46 V54 M37,46 V54" stroke="#8d6e63" stroke-width="3"/>`,
  };
  function icono(def) {
    const s = String(def || '');
    if (s.startsWith('emoji:')) return `<span class="mm-emoji" aria-hidden="true">${GK.html(s.slice(6))}</span>`;
    const [tipo, color] = s.split(':');
    const f = DIBUJOS[tipo] || DIBUJOS.planeta;
    return `<svg class="mm-dibujo" viewBox="0 0 64 64" aria-hidden="true">${f(color || '#9e9e9e')}</svg>`;
  }
  /** «¿Qué es *más grande*?» → con la parte entre asteriscos resaltada y en mayúsculas. */
  const pregunta = (t) => GK.html(t).replace(/\*([^*]+)\*/g, (_, x) => `<b>${x.toUpperCase()}</b>`);
  const barajar = (lista) => {
    const a = [...lista];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };

  GK.pruebas.registrar('mas_menos', {
    titulo: '¿Más o menos?',
    objetivo: (P) => `Encadenad ${P.racha || 8} aciertos seguidos.`,
    pasos: ['Leed la pregunta', 'Tocad la respuesta', 'Si falláis, la racha vuelve a cero'],
    montar(contenedor, ctx) {
      const P = ctx.estacion.prueba;
      const parejas = P.parejas || [];
      const META = Number(P.racha) || 8;
      const POR_INTENTO = Math.min(Number(P.porIntento) || META, parejas.length);
      if (parejas.length < META) {
        contenedor.innerHTML = '<div class="aviso aviso-error">Faltan parejas en esta prueba. Avisad a la organización.</div>';
        return;
      }
      let ronda = [];   // las parejas de este intento, ya con los lados barajados
      let paso = 0;     // cuántas lleva acertadas seguidas
      let ocupado = false;
      let terminado = false;
      const temporizadores = [];

      contenedor.innerHTML = `
        <div class="reto">
          <div class="reto-cuerpo">
            <div class="mm-racha" aria-live="polite">
              <span class="mm-racha-texto" id="mm-racha-texto"></span>
              <span class="mm-puntos" aria-hidden="true">${Array.from({ length: META }, () => '<i></i>').join('')}</span>
            </div>
            <h2 class="mm-pregunta" id="mm-pregunta"></h2>
            <div class="mm-cartas" id="mm-cartas"></div>
            <p class="mm-dato" id="mm-dato" aria-live="polite"></p>
            <button class="boton boton-ancho oculto" type="button" id="mm-seguir">Siguiente</button>
          </div>
        </div>`;
      const elRacha = contenedor.querySelector('#mm-racha-texto');
      const puntos = [...contenedor.querySelectorAll('.mm-puntos i')];
      const elPregunta = contenedor.querySelector('#mm-pregunta');
      const cartas = contenedor.querySelector('#mm-cartas');
      const dato = contenedor.querySelector('#mm-dato');
      const seguir = contenedor.querySelector('#mm-seguir');

      function pintarRacha() {
        elRacha.textContent = `Racha: ${paso} de ${META}`;
        puntos.forEach((p, i) => p.classList.toggle('on', i < paso));
      }
      function nuevaRonda() {
        ronda = barajar(parejas).slice(0, POR_INTENTO).map((x) => ({ ...x, opciones: barajar(x.opciones) }));
        paso = 0;
        mostrar();
      }
      function mostrar() {
        const x = ronda[paso];
        ocupado = false;
        pintarRacha();
        elPregunta.innerHTML = pregunta(x.pregunta);
        cartas.innerHTML = x.opciones.map((o, i) => `
          <button type="button" class="mm-carta" data-i="${i}">
            <span class="mm-icono">${icono(o.icono)}</span>
            <span class="mm-nombre">${GK.html(o.nombre)}</span>
          </button>`).join('<span class="mm-o" aria-hidden="true">o</span>');
        dato.textContent = '';
        dato.className = 'mm-dato';
        seguir.classList.add('oculto');
      }

      cartas.addEventListener('click', async (ev) => {
        const b = ev.target.closest('.mm-carta');
        if (!b || ocupado || terminado) return;
        ocupado = true;
        const x = ronda[paso];
        const i = Number(b.dataset.i);
        const botones = [...cartas.querySelectorAll('.mm-carta')];
        botones.forEach((c) => { c.disabled = true; });
        b.classList.add('elegida');
        const acierto = await ctx.coincide(x.opciones[i].nombre, x.huella);
        const buena = acierto ? i : 1 - i;
        const texto = await GK.descifrar(x.datoCifrado, x.opciones[buena].nombre, ctx.estacion.sal);
        botones[buena].classList.add('correcta');
        if (acierto) {
          paso++;
          pintarRacha();
          dato.className = 'mm-dato ok';
          dato.textContent = `¡Sí! ${texto || ''}`.trim();
          GK.vibrar(30);
          if (paso >= META) return completar();
          seguir.textContent = 'Siguiente';
        } else {
          b.classList.add('fallo');
          paso = 0;
          pintarRacha();
          dato.className = 'mm-dato no';
          dato.textContent = `Era ${x.opciones[buena].nombre}. ${texto || ''}`.trim();
          ctx.ayuda(`¡Uy! La racha vuelve a cero. Empezáis otra con ${POR_INTENTO} preguntas nuevas.`, 'info');
          seguir.textContent = 'Otra racha';
          seguir.dataset.reiniciar = '1';
        }
        seguir.classList.remove('oculto');
        seguir.focus({ preventScroll: true });
        // Que se vean el dato y el botón sin tener que buscarlos (en móviles bajos quedan por debajo)
        seguir.scrollIntoView({ block: 'nearest', behavior: GK.menosMovimiento() ? 'auto' : 'smooth' });
      });
      seguir.addEventListener('click', () => {
        if (terminado) return ctx.continuar();
        ctx.ayuda('');
        if (seguir.dataset.reiniciar) { delete seguir.dataset.reiniciar; nuevaRonda(); } else mostrar();
      });

      async function completar() {
        terminado = true;
        let clave = '';
        try { clave = GK.desofuscar(P.clave, P.salClave); } catch (e) { /* configuración rota */ }
        if (clave && (await ctx.intentar(clave, { quedarse: true }))) {
          contenedor.querySelector('.mm-racha').classList.add('completa');
          ctx.ayuda(`¡${META} de ${META}! Racha completa: señal recibida.`, 'ok');
          seguir.textContent = 'Continuar';
          seguir.classList.remove('oculto');
          temporizadores.push(setTimeout(() => ctx.continuar(), GK.menosMovimiento() ? 1500 : 2600));
        } else {
          terminado = false;
          ctx.ayuda('Racha completa, pero no se ha podido guardar. Avisad a la organización.');
        }
      }

      nuevaRonda();
      return () => temporizadores.forEach(clearTimeout);
    },
  });
})();
