/*
 * Prueba WORDLE ESPACIAL (app). Adivinar una palabra de 5 letras en 6 intentos, con teclado en pantalla (con Ñ).
 * No se valida contra diccionario. Si gastan los 6 intentos, el tablero se vacía, el teclado conserva los colores
 * y pueden volver a empezar.
 *
 * EXCEPCIÓN DE SEGURIDAD (documentada en PRUEBAS.md): para colorear las letras, el móvil necesita conocer la
 * palabra. El generador la publica OFUSCADA en prueba.palabra (XOR con prueba.salPalabra + base64): no se ve a
 * simple vista en config.js, pero alguien muy experto podría sacarla. La palabra es la «clave» de la estación en
 * privado/secretos.json; para cambiarla, cambiad la clave y volved a ejecutar el generador.
 */
(function () {
  'use strict';
  const GK = window.GK;
  const INTENTOS = 6;
  const FILAS_TECLADO = ['QWERTYUIOP', 'ASDFGHJKLÑ', '+ZXCVBNM-']; // + = Enviar, - = Borrar

  /** Colores de un intento: 'ok' (verde: letra y sitio), 'casi' (amarillo: está en otro sitio), 'no' (gris). */
  function colorear(intento, palabra) {
    const res = Array(palabra.length).fill('no');
    const quedan = {};
    for (let i = 0; i < palabra.length; i++) {
      if (intento[i] === palabra[i]) res[i] = 'ok';
      else quedan[palabra[i]] = (quedan[palabra[i]] || 0) + 1;
    }
    for (let i = 0; i < palabra.length; i++) {
      if (res[i] === 'ok') continue;
      if (quedan[intento[i]]) { res[i] = 'casi'; quedan[intento[i]]--; }
    }
    return res;
  }
  const PESO = { no: 1, casi: 2, ok: 3 };

  GK.pruebas.registrar('wordle', {
    titulo: 'Wordle espacial',
    montar(contenedor, ctx) {
      const P = ctx.estacion.prueba;
      let palabra = '';
      try { palabra = GK.desofuscar(P.palabra, P.salPalabra).toUpperCase(); } catch (e) { /* configuración rota */ }
      if (!palabra) {
        contenedor.innerHTML = '<div class="aviso aviso-error">Falta configurar la palabra de esta prueba. Avisad a la organización.</div>';
        return;
      }
      const N = [...palabra].length;
      const letras = [...palabra];
      const claveGuardado = `wordle:${ctx.equipo.id}:${ctx.estacion.id}`;
      const estado = GK.leer(claveGuardado, null) || { intentos: [], teclado: {}, ronda: 1 };
      let actual = [];
      let terminado = false;
      const guardar = () => GK.guardar(claveGuardado, estado);

      contenedor.innerHTML = `
        <div class="ventana">
          <div class="ventana-barra"><span class="puntos"><i></i><i></i><i></i></span><span>RX_WORDLE · EST_${GK.html(ctx.estacion.letra)}</span></div>
          <div class="ventana-cuerpo">
            <p class="terminal">&gt; Adivinad la palabra secreta de <b>${N} letras</b> en ${INTENTOS} intentos.<br>
              &gt; <span class="w-ej ok">A</span> letra en su sitio · <span class="w-ej casi">A</span> está, pero en otro sitio · <span class="w-ej no">A</span> no está.</p>
            <p class="texto-2 mono w-ronda" id="w-ronda"></p>
            <div class="w-tablero" id="w-tablero" style="--n:${N}" role="grid" aria-label="Tablero"></div>
            <p class="w-msg" id="w-msg" aria-live="polite"></p>
            <div class="w-teclado" id="w-teclado">
              ${FILAS_TECLADO.map((f) => `<div class="w-fila">${[...f].map((k) =>
                k === '+' ? '<button type="button" class="w-tecla ancha" data-k="ENTER">Enviar</button>'
                : k === '-' ? '<button type="button" class="w-tecla ancha" data-k="BORRAR" aria-label="Borrar">⌫</button>'
                : `<button type="button" class="w-tecla" data-k="${k}">${k}</button>`).join('')}</div>`).join('')}
            </div>
          </div>
        </div>`;
      const tablero = contenedor.querySelector('#w-tablero');
      const msg = contenedor.querySelector('#w-msg');
      const teclado = contenedor.querySelector('#w-teclado');
      const aviso = (t) => { msg.textContent = t || ''; };

      function pintar(animarUltima) {
        let html = '';
        for (let f = 0; f < INTENTOS; f++) {
          const intento = estado.intentos[f];
          const col = intento ? colorear([...intento], letras) : null;
          const fila = intento ? [...intento] : f === estado.intentos.length ? actual : [];
          html += `<div class="w-fila-t${f === estado.intentos.length && !terminado ? ' actual' : ''}" role="row">`;
          for (let i = 0; i < N; i++) {
            const l = fila[i] || '';
            const c = col ? col[i] : l ? 'escrita' : '';
            const anim = animarUltima && f === estado.intentos.length - 1 ? ` style="animation-delay:${i * 0.12}s"` : '';
            html += `<span class="w-casilla ${c}${animarUltima && f === estado.intentos.length - 1 ? ' girar' : ''}"${anim} role="gridcell" aria-label="${l ? `${l}${col ? ', ' + { ok: 'en su sitio', casi: 'en otro sitio', no: 'no está' }[c] : ''}` : 'vacía'}">${GK.html(l)}</span>`;
          }
          html += '</div>';
        }
        tablero.innerHTML = html;
        teclado.querySelectorAll('[data-k]').forEach((b) => {
          b.classList.remove('ok', 'casi', 'no');
          const c = estado.teclado[b.dataset.k];
          if (c) b.classList.add(c);
        });
        contenedor.querySelector('#w-ronda').textContent = `Ronda ${estado.ronda} · intento ${Math.min(estado.intentos.length + 1, INTENTOS)} de ${INTENTOS}`;
      }

      async function enviar() {
        if (terminado) return;
        if (actual.length < N) {
          aviso(`Faltan letras: la palabra tiene ${N}.`);
          const fila = tablero.querySelector('.w-fila-t.actual');
          if (fila) { fila.classList.remove('temblor'); void fila.offsetWidth; fila.classList.add('temblor'); }
          return;
        }
        const intento = actual.join('');
        actual = [];
        estado.intentos.push(intento);
        colorear([...intento], letras).forEach((c, i) => {
          const k = [...intento][i];
          if (!estado.teclado[k] || PESO[c] > PESO[estado.teclado[k]]) estado.teclado[k] = c;
        });
        guardar();
        pintar(true);
        if (intento === palabra) {
          terminado = true;
          aviso('¡Señal recibida! Habéis encontrado la palabra.');
          msg.classList.add('ok');
          const ok = await ctx.intentar(intento, { quedarse: true });
          if (ok) {
            GK.borrar(claveGuardado);
            setTimeout(() => ctx.continuar(), 1800);
          } else {
            terminado = false;
            msg.classList.remove('ok');
            aviso('Algo no ha ido bien al comprobarla. Avisad a la organización.');
          }
          return;
        }
        if (estado.intentos.length >= INTENTOS) {
          aviso('¡Se acabaron los intentos! Empezáis otra ronda: el teclado recuerda los colores.');
          terminado = true;
          setTimeout(() => {
            estado.intentos = [];
            estado.ronda++;
            guardar();
            terminado = false;
            pintar();
          }, 2600);
          return;
        }
        aviso('');
      }

      function pulsar(k) {
        if (terminado) return;
        if (k === 'ENTER') return enviar();
        if (k === 'BORRAR') { actual.pop(); aviso(''); return pintar(); }
        if (actual.length >= N) return;
        actual.push(k);
        pintar();
      }
      teclado.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-k]');
        if (b) pulsar(b.dataset.k);
      });
      // Teclado físico (pantalla grande)
      const alTeclear = (ev) => {
        if (ev.ctrlKey || ev.metaKey || ev.altKey || document.querySelector('.modal')) return;
        if (ev.target && /INPUT|TEXTAREA/.test(ev.target.tagName)) return;
        if (ev.key === 'Enter') { ev.preventDefault(); pulsar('ENTER'); } else if (ev.key === 'Backspace') { ev.preventDefault(); pulsar('BORRAR'); } else if (/^[a-zñ]$/i.test(ev.key)) pulsar(ev.key.toUpperCase());
      };
      document.addEventListener('keydown', alTeclear);
      pintar();
      return () => document.removeEventListener('keydown', alTeclear);
    },
  });
})();
