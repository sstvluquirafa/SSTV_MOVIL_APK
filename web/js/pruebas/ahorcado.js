/*
 * Prueba AHORCADO ESPACIAL (app). El ahorcado de siempre, pero en vez del muñeco hay un astronauta con una botella de
 * oxígeno de 6 tramos: cada letra fallada vacía un tramo y el astronauta se pone cada vez más nervioso. Teclado en
 * pantalla A–Z con Ñ; las tildes no cuentan («A» descubre también «Á») y los espacios no se adivinan.
 *
 * Tres rondas seguidas (una palabra, dos palabras, una frase), cada una con 3 palabras posibles. Si se acaba el
 * oxígeno, se enseña la palabra y sale la SIGUIENTE de esa ronda (tras la 3.ª, otra vez la 1.ª). Al resolver la 3.ª
 * ronda, la estación se completa sola (como «¿Más o menos?»). El progreso (ronda, palabra y letras) se guarda en el móvil.
 *
 * Igual para todos (privado/bancos.json → ahorcado). EXCEPCIÓN DE SEGURIDAD (como el Wordle): para descubrir las letras,
 * el móvil necesita las palabras; van OFUSCADAS en prueba.rondas[r].palabras = [{ palabra, salPalabra }] (XOR + base64).
 * La clave de la estación también va ofuscada (prueba.clave + prueba.salClave) y la app la envía al terminar.
 */
(function () {
  'use strict';
  const GK = window.GK;
  const FILAS_TECLADO = ['QWERTYUIOP', 'ASDFGHJKLÑ', 'ZXCVBNM'];

  /** Letra «base» de un carácter: sin tilde ni diéresis, pero la Ñ se queda como Ñ. Lo que no es letra → ''. */
  function base(c) {
    const m = String(c).toUpperCase();
    if (m === 'Ñ') return 'Ñ';
    const b = m.normalize('NFD').replace(/[̀-ͯ]/g, '');
    return /^[A-Z]$/.test(b) ? b : '';
  }

  /* ---------- El astronauta (dibujo propio, viewBox 120 × 120). «animo»: tranquilo, nervioso, agobiado, sin, fiesta ---------- */
  const T = '#0b1230'; // contorno
  function astronauta(animo) {
    const fiesta = animo === 'fiesta';
    const sin = animo === 'sin';
    // Brazos (codo a mano) y manos: arriba al celebrar, a los lados el resto del tiempo
    const [brazos, manos] = fiesta
      ? ['M40,68 L22,44 M80,68 L98,44', [[21, 41], [99, 41]]]
      : ['M40,70 L26,92 M80,70 L94,92', [[25, 95], [95, 95]]];
    // Cara dentro del visor
    let ojos;
    let boca;
    let cejas = '';
    let gotas = '';
    if (fiesta) {
      ojos = '<path d="M47,41 q4,-5 8,0 M65,41 q4,-5 8,0" fill="none" stroke="#1a1030" stroke-width="3" stroke-linecap="round"/>';
      boca = '<path d="M50,49 q10,11 20,0 z" fill="#1a1030"/><path d="M54,53 q6,3 12,0" fill="none" stroke="#ff8a80" stroke-width="2.5" stroke-linecap="round"/>';
    } else if (sin) {
      // Mareado (no desmayado): ojos en espiral
      ojos = '<path d="M51,41 a1.5,1.5 0 1 1 1.5,1.5 a3,3 0 1 1 -3,-3 a4.5,4.5 0 1 1 4.5,4.5 M69,41 a1.5,1.5 0 1 1 1.5,1.5 a3,3 0 1 1 -3,-3 a4.5,4.5 0 1 1 4.5,4.5" fill="none" stroke="#1a1030" stroke-width="2" stroke-linecap="round"/>';
      boca = '<path d="M52,53 q4,-4 8,0 q4,4 8,0" fill="none" stroke="#1a1030" stroke-width="3" stroke-linecap="round"/>';
    } else if (animo === 'agobiado') {
      ojos = '<circle cx="51" cy="41" r="4.5" fill="#fff" stroke="#1a1030" stroke-width="2"/><circle cx="69" cy="41" r="4.5" fill="#fff" stroke="#1a1030" stroke-width="2"/><circle cx="51" cy="42" r="2" fill="#1a1030"/><circle cx="69" cy="42" r="2" fill="#1a1030"/>';
      cejas = '<path d="M45,33 l9,-3 M75,33 l-9,-3" stroke="#1a1030" stroke-width="2.5" stroke-linecap="round"/>';
      boca = '<ellipse cx="60" cy="53" rx="5" ry="6" fill="#1a1030"/>';
      gotas = '<path d="M80,30 q4,6 0,9 q-4,-3 0,-9z M37,36 q3,5 0,7 q-3,-2 0,-7z" fill="#7dd3fc" class="ah-gota"/>';
    } else if (animo === 'nervioso') {
      ojos = '<circle cx="51" cy="41" r="3" fill="#1a1030"/><circle cx="69" cy="41" r="3" fill="#1a1030"/>';
      cejas = '<path d="M46,34 l8,-2 M74,34 l-8,-2" stroke="#1a1030" stroke-width="2.5" stroke-linecap="round"/>';
      boca = '<path d="M52,53 h16" stroke="#1a1030" stroke-width="3" stroke-linecap="round"/>';
      gotas = '<path d="M80,30 q4,6 0,9 q-4,-3 0,-9z" fill="#7dd3fc" class="ah-gota"/>';
    } else {
      ojos = '<circle cx="51" cy="41" r="3" fill="#1a1030"/><circle cx="69" cy="41" r="3" fill="#1a1030"/>';
      boca = '<path d="M52,50 q8,7 16,0" fill="none" stroke="#1a1030" stroke-width="3" stroke-linecap="round"/>';
    }
    const visor = sin ? '#9fb3c8' : '#ffd9b8';
    const estrellas = fiesta
      ? '<g class="ah-chispas" fill="#ffb627"><path d="M12,20 l2,5 5,2 -5,2 -2,5 -2,-5 -5,-2 5,-2z"/><path d="M106,18 l2,5 5,2 -5,2 -2,5 -2,-5 -5,-2 5,-2z"/><path d="M110,70 l1.5,3.5 3.5,1.5 -3.5,1.5 -1.5,3.5 -1.5,-3.5 -3.5,-1.5 3.5,-1.5z"/></g>'
      : '';
    return `<svg class="ah-astro" viewBox="0 0 120 120" aria-hidden="true">
      ${estrellas}
      <rect x="40" y="58" width="40" height="34" rx="9" fill="#cfd8e6" stroke="${T}" stroke-width="3"/>
      <path d="${brazos}" fill="none" stroke="${T}" stroke-width="13" stroke-linecap="round"/>
      <path d="${brazos}" fill="none" stroke="#eef1fa" stroke-width="7" stroke-linecap="round"/>
      ${manos.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="7" fill="#eef1fa" stroke="${T}" stroke-width="3"/>`).join('')}
      <rect x="42" y="62" width="36" height="34" rx="9" fill="#eef1fa"/>
      <rect x="51" y="68" width="18" height="11" rx="2" fill="#26305a"/>
      <circle cx="55" cy="73.5" r="2" fill="${sin ? '#ff6b5b' : '#5ee6d0'}"/><circle cx="62" cy="73.5" r="2" fill="#ffb627"/>
      <path d="M48,96 v14 h10 v-14 M62,96 v14 h10 v-14" fill="#eef1fa" stroke="${T}" stroke-width="3" stroke-linejoin="round"/>
      <circle cx="60" cy="42" r="26" fill="#eef1fa" stroke="${T}" stroke-width="3"/>
      <rect x="40" y="27" width="40" height="30" rx="14" fill="${visor}" stroke="${T}" stroke-width="3"/>
      ${cejas}${ojos}${boca}${gotas}
      ${sin ? '<rect x="40" y="27" width="40" height="30" rx="14" fill="#cbd5e1" opacity=".45"/>' : ''}
      <path d="M45,31 q5,-3 10,-2" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".7"/>
    </svg>`;
  }

  /** La botella de oxígeno: 6 tramos (de abajo arriba), los que quedan encendidos. */
  function botella(quedan, total) {
    const alto = 84 / total;
    let tramos = '';
    for (let i = 0; i < total; i++) {
      const y = 104 - (i + 1) * alto;
      const lleno = i < quedan;
      const color = quedan <= 2 ? '#ff6b5b' : quedan <= 3 ? '#ffb627' : '#5ee6d0';
      tramos += `<rect x="9" y="${(y + 1.5).toFixed(1)}" width="22" height="${(alto - 3).toFixed(1)}" rx="3" fill="${lleno ? color : '#1b2445'}"/>`;
    }
    return `<svg class="ah-botella" viewBox="0 0 40 120" aria-hidden="true">
      <rect x="14" y="2" width="12" height="10" rx="2" fill="#8d97b8" stroke="${T}" stroke-width="2"/>
      <rect x="4" y="12" width="32" height="98" rx="12" fill="#26305a" stroke="#8d97b8" stroke-width="3"/>
      ${tramos}
      <text x="20" y="119" text-anchor="middle" class="ah-o2">O₂</text>
    </svg>`;
  }

  GK.pruebas.registrar('ahorcado', {
    titulo: 'Ahorcado espacial',
    objetivo: 'Adivinad las tres palabras antes de que el astronauta se quede sin oxígeno.',
    pasos: ['Tocad una letra', 'Cada fallo gasta oxígeno', 'Tres rondas, cada una más larga'],
    montar(contenedor, ctx) {
      const P = ctx.estacion.prueba;
      const MAX = Number(P.fallos) || 6;
      const rondas = (P.rondas || []).map((r) => ({
        categoria: r.categoria || '',
        palabras: (r.palabras || []).map((x) => {
          try { return GK.desofuscar(x.palabra, x.salPalabra).toUpperCase(); } catch (e) { return ''; }
        }),
      }));
      if (!rondas.length || rondas.some((r) => !r.palabras.length || r.palabras.some((w) => !w))) {
        contenedor.innerHTML = '<div class="aviso aviso-error">Falta configurar las palabras de esta prueba. Avisad a la organización.</div>';
        return;
      }

      // Progreso en el móvil: ronda (0…), palabra de esa ronda (0…) y letras probadas. ronda = nº de rondas → terminada.
      const claveGuardado = `ahorcado:${ctx.equipo.id}:${ctx.estacion.id}`;
      const estado = GK.leer(claveGuardado, null) || {};
      if (!(estado.ronda >= 0 && estado.ronda <= rondas.length)) estado.ronda = 0;
      if (!(estado.palabra >= 0 && estado.ronda < rondas.length && estado.palabra < rondas[estado.ronda].palabras.length)) estado.palabra = 0;
      if (!Array.isArray(estado.letras)) estado.letras = [];
      const guardar = () => GK.guardar(claveGuardado, estado);

      // Lo que se ve (puede ir un paso por detrás del estado guardado mientras se enseña un final de palabra)
      let vista = null; // { ronda, palabra, letras: Set, fin: null | 'sin' | 'bien' | 'todo' }
      let terminado = false;
      const temporizadores = [];

      contenedor.innerHTML = `
        <div class="reto">
          <div class="reto-cuerpo ah" id="ah-juego">
            <div class="ah-cab">
              <span class="ah-categoria" id="ah-categoria"></span>
              <span class="ah-ronda mono" id="ah-ronda"></span>
            </div>
            <div class="ah-escena" id="ah-escena"></div>
            <div class="ah-palabra" id="ah-palabra" aria-live="polite"></div>
            <p class="ah-msg" id="ah-msg" aria-live="polite"></p>
            <div class="ah-zona-teclado">
              <div class="w-teclado ah-teclado" id="ah-teclado">
                ${FILAS_TECLADO.map((f) => `<div class="w-fila">${[...f].map((k) => `<button type="button" class="w-tecla" data-k="${k}">${k}</button>`).join('')}</div>`).join('')}
              </div>
              <button type="button" class="boton ah-seguir oculto" id="ah-seguir"></button>
            </div>
          </div>
        </div>`;
      const juego = contenedor.querySelector('#ah-juego');
      const elCategoria = contenedor.querySelector('#ah-categoria');
      const elRonda = contenedor.querySelector('#ah-ronda');
      const escena = contenedor.querySelector('#ah-escena');
      const elPalabra = contenedor.querySelector('#ah-palabra');
      const msg = contenedor.querySelector('#ah-msg');
      const teclado = contenedor.querySelector('#ah-teclado');
      const seguir = contenedor.querySelector('#ah-seguir');
      const aviso = (t, clase) => { msg.textContent = t || ''; msg.className = 'ah-msg' + (clase ? ' ' + clase : ''); };

      const palabraDe = (v) => rondas[v.ronda].palabras[v.palabra];
      const letrasDe = (w) => new Set([...w].map(base).filter(Boolean));
      const fallosDe = (v) => [...v.letras].filter((l) => !letrasDe(palabraDe(v)).has(l)).length;
      const resuelta = (v) => [...letrasDe(palabraDe(v))].every((l) => v.letras.has(l));

      function desdeEstado() {
        vista = { ronda: estado.ronda, palabra: estado.palabra, letras: new Set(estado.letras), fin: null };
      }

      /** Tamaño de las casillas: que la palabra más larga de la línea quepa en el ancho disponible. */
      function medir() {
        const w = palabraDe(vista);
        const larga = Math.max(...w.split(' ').map((p) => p.length));
        const ancho = elPalabra.clientWidth || 320;
        const hueco = 4;
        const celda = Math.max(18, Math.min(38, Math.floor((ancho - (larga - 1) * hueco) / larga)));
        elPalabra.style.setProperty('--celda', celda + 'px');
      }

      function pintar() {
        const v = vista;
        const w = palabraDe(v);
        const fallos = Math.min(fallosDe(v), MAX);
        const quedan = MAX - fallos;
        juego.dataset.ronda = String(v.ronda);
        juego.dataset.palabra = String(v.palabra);
        elCategoria.textContent = rondas[v.ronda].categoria;
        elRonda.textContent = `Ronda ${v.ronda + 1} de ${rondas.length}`;
        const animo = v.fin === 'bien' || v.fin === 'todo' ? 'fiesta' : v.fin === 'sin' ? 'sin'
          : quedan <= 2 ? 'agobiado' : quedan <= 4 ? 'nervioso' : 'tranquilo';
        escena.className = `ah-escena animo-${animo}`;
        escena.innerHTML = `${astronauta(animo)}${botella(quedan, MAX)}`;
        escena.setAttribute('role', 'img');
        escena.setAttribute('aria-label', `Oxígeno: quedan ${quedan} de ${MAX}`);
        // La palabra: cada palabra es un grupo que no se parte; los espacios son huecos
        elPalabra.innerHTML = w.split(' ').map((p) => `<span class="ah-grupo">${[...p].map((c) => {
          const b = base(c);
          if (!b) return `<span class="ah-letra fija">${GK.html(c)}</span>`;
          const descubierta = v.letras.has(b);
          const revelada = !descubierta && v.fin === 'sin';
          return `<span class="ah-letra${descubierta ? ' acertada' : ''}${revelada ? ' revelada' : ''}">${descubierta || revelada ? GK.html(c) : ''}</span>`;
        }).join('')}</span>`).join('');
        elPalabra.setAttribute('aria-label', [...w].map((c) => (c === ' ' ? ' ' : !base(c) || v.letras.has(base(c)) || v.fin === 'sin' ? c : '_')).join(''));
        medir();
        teclado.querySelectorAll('[data-k]').forEach((b) => {
          const k = b.dataset.k;
          b.classList.remove('ok', 'no');
          if (v.letras.has(k)) b.classList.add(letrasDe(w).has(k) ? 'ok' : 'no');
          b.disabled = v.letras.has(k) || !!v.fin || terminado;
        });
        teclado.classList.toggle('apagado', !!v.fin);
      }

      function mostrarBoton(texto) {
        seguir.textContent = texto;
        seguir.classList.remove('oculto');
        seguir.focus({ preventScroll: true });
      }

      function pulsar(k) {
        const v = vista;
        if (terminado || v.fin || v.letras.has(k)) return;
        if (!estado.tocado) {
          // Primera letra: que se vea todo el juego (astronauta, palabra y teclado) sin buscarlo
          juego.scrollIntoView({ block: 'nearest', behavior: GK.menosMovimiento() ? 'auto' : 'smooth' });
        }
        v.letras.add(k);
        estado.letras = [...v.letras];
        estado.tocado = true;
        const acierto = letrasDe(palabraDe(v)).has(k);
        GK.vibrar(acierto ? 20 : [40, 60, 40]);
        aviso('');
        if (resuelta(v)) {
          if (v.ronda + 1 >= rondas.length) {
            v.fin = 'todo';
            Object.assign(estado, { ronda: rondas.length, palabra: 0, letras: [] });
            guardar();
            pintar();
            return completar();
          }
          v.fin = 'bien';
          Object.assign(estado, { ronda: v.ronda + 1, palabra: 0, letras: [] });
          guardar();
          aviso('¡Palabra completa! Oxígeno recargado.', 'ok');
          mostrarBoton(`Ronda ${v.ronda + 2} de ${rondas.length}`);
        } else if (fallosDe(v) >= MAX) {
          v.fin = 'sin';
          Object.assign(estado, { palabra: (v.palabra + 1) % rondas[v.ronda].palabras.length, letras: [] });
          guardar();
          aviso('Sin oxígeno: probad otra.', 'no');
          ctx.ayuda('¡Se acabó el oxígeno! Os damos otra palabra de la misma ronda.', 'info');
          mostrarBoton('Otra palabra');
        } else {
          guardar();
          if (!acierto) {
            const q = MAX - fallosDe(v);
            aviso(`No está la ${k}. Queda${q === 1 ? '' : 'n'} ${q} tramo${q === 1 ? '' : 's'} de oxígeno.`);
          }
        }
        pintar();
      }

      seguir.addEventListener('click', () => {
        if (terminado) return ctx.continuar();
        seguir.classList.add('oculto');
        ctx.ayuda('');
        aviso('');
        desdeEstado();
        pintar();
      });
      teclado.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-k]');
        if (b) pulsar(b.dataset.k);
      });
      // Teclado físico (pantalla grande)
      const alTeclear = (ev) => {
        if (ev.ctrlKey || ev.metaKey || ev.altKey || document.querySelector('.modal')) return;
        if (ev.target && /INPUT|TEXTAREA/.test(ev.target.tagName)) return;
        const k = base(ev.key || '');
        if (ev.key && ev.key.length === 1 && k) { ev.preventDefault(); pulsar(k); }
      };
      document.addEventListener('keydown', alTeclear);
      const alCambiarTamano = () => { if (vista) medir(); };
      window.addEventListener('resize', alCambiarTamano);

      async function completar() {
        terminado = true;
        aviso('¡Misión cumplida! El astronauta respira tranquilo.', 'ok');
        let clave = '';
        try { clave = GK.desofuscar(P.clave, P.salClave); } catch (e) { /* configuración rota */ }
        if (clave && (await ctx.intentar(clave, { quedarse: true }))) {
          GK.borrar(claveGuardado);
          ctx.ayuda('¡Tres de tres! Señal recibida.', 'ok');
          pintar();
          mostrarBoton('Continuar');
          temporizadores.push(setTimeout(() => ctx.continuar(), GK.menosMovimiento() ? 1500 : 2600));
        } else {
          terminado = false;
          ctx.ayuda('Lo habéis resuelto, pero no se ha podido guardar. Avisad a la organización.');
        }
      }

      if (estado.ronda >= rondas.length) {
        // Ya la habían resuelto (se cerró la app antes de guardar en el servidor): se vuelve a enviar
        vista = { ronda: rondas.length - 1, palabra: 0, letras: new Set(letrasDe(rondas[rondas.length - 1].palabras[0])), fin: 'todo' };
        pintar();
        completar();
      } else {
        desdeEstado();
        pintar();
      }
      return () => {
        temporizadores.forEach(clearTimeout);
        document.removeEventListener('keydown', alTeclear);
        window.removeEventListener('resize', alCambiarTamano);
      };
    },
  });
})();
