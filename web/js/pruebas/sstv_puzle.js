/*
 * Prueba IMAGEN SSTV DESORDENADA (app). Llega una foto de la NASA «por SSTV» con las piezas desordenadas y giradas.
 * La foto se divide en 4 cuadrantes y cada cuadrante es un puzle de 3 × 3 piezas (generar_torneo.py → contenido_sstv:
 * la foto y el desorden cambian por equipo; nunca empieza ninguna pieza ya bien puesta).
 *
 * Tocar una pieza la elige; tocarla otra vez la gira 90°; tocar otra del mismo cuadrante las cambia de sitio. Cada
 * cuadrante se puede ampliar a pantalla completa. Al completarlo se ve «recibido» con las barras SSTV y su sello
 * (ctx.parte) da UNA LETRA; las 4 letras, en orden, son la clave del equipo, que se escribe en cualquier móvil.
 *
 * prueba.cuadrantes[q] = { inicio: [[pieza, giro] × 9], validas: [[[pieza, giro], …] × 9], sello }. «validas» dice qué
 * piezas valen en cada hueco: además de la buena, las que se ven igual (cielo negro), para no atascarse con ellas.
 * EXCEPCIÓN (como el Wordle): el móvil necesita saber la solución para darla por buena; un experto podría sacarla.
 */
(function () {
  'use strict';
  const GK = window.GK;

  GK.pruebas.registrar('sstv_puzle', {
    titulo: 'Imagen SSTV desordenada',
    objetivo: 'Recomponed la imagen recibida por SSTV.',
    pasos: ['Repartíos los 4 cuadrantes', 'Tocad dos piezas para cambiarlas', 'Juntad las 4 letras'],
    montar(contenedor, ctx) {
      const P = ctx.estacion.prueba;
      const cuadrantes = P.cuadrantes || [];
      if (!P.src || cuadrantes.length !== 4) {
        contenedor.innerHTML = '<div class="aviso aviso-error">Falta configurar la imagen de esta prueba. Avisad a la organización.</div>';
        return;
      }
      const claveGuardado = `sstvpuzle:${ctx.equipo.id}:${ctx.estacion.id}`;
      const guardado = GK.leer(claveGuardado, null);
      const estado = guardado && guardado.src === P.src ? guardado
        : { src: P.src, piezas: cuadrantes.map((c) => c.inicio.map((x) => [...x])), letras: {} };
      const guardar = () => GK.guardar(claveGuardado, estado);
      let elegida = null; // [cuadrante, hueco]
      let temporizador = null;

      // (la URL va en cada pieza: dentro de una variable CSS se resolvería desde css/ y no desde la página)
      const fondo = encodeURI(P.src).replace(/'/g, '%27');
      /** Estilo de una pieza: su trozo de la foto (6 × 6 trozos en total) y su giro. */
      const estilo = (q, p, g) => {
        const col = (q % 2) * 3 + (p % 3);
        const fila = Math.floor(q / 2) * 3 + Math.floor(p / 3);
        return `background-image:url('${fondo}');background-position:${col * 20}% ${fila * 20}%;transform:rotate(${g * 90}deg)`;
      };
      const resuelto = (q) => estado.piezas[q].every((x, h) => (cuadrantes[q].validas[h] || [[h, 0]]).some(([p, g]) => p === x[0] && g === x[1]));

      contenedor.innerHTML = `
        <div class="reto">
          <div class="reto-cuerpo">
            <p class="nota-prueba">Tocad una pieza para elegirla y otra vez para girarla. Tocad otra del mismo cuadrante para cambiarlas de sitio.</p>
            <div class="sstv-rx">
              ${cuadrantes.map((_, q) => `
                <section class="sstv-q" data-q="${q}" aria-label="Cuadrante ${q + 1}">
                  <div class="sstv-q-cab">
                    <span>Cuadrante ${q + 1}</span>
                    <b class="mono sstv-letra" id="sstv-letra-${q}"></b>
                    <button type="button" class="sstv-ampliar" data-q="${q}" aria-label="Ampliar el cuadrante ${q + 1}">⤢</button>
                  </div>
                  <div class="sstv-piezas" id="sstv-q-${q}"></div>
                  <div class="sstv-recibido" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
                </section>`).join('')}
            </div>
            <p class="credito oculto" id="sstv-credito">${GK.html(P.credito || '')}</p>
            <form class="dif-clave-form" autocomplete="off" novalidate>
              <label class="etiqueta" for="sstv-clave">Las 4 letras, del cuadrante 1 al 4</label>
              <input id="sstv-clave" class="campo campo-codigo" autocapitalize="characters" spellcheck="false" maxlength="8" placeholder="····">
              <button class="boton boton-ancho" type="submit">Comprobar</button>
            </form>
          </div>
        </div>`;
      const campo = contenedor.querySelector('#sstv-clave');

      function pintar(q) {
        const caja = contenedor.querySelector(`#sstv-q-${q}`);
        const hecho = !!estado.letras[q];
        caja.innerHTML = estado.piezas[q].map(([p, g], h) => `<button type="button" class="sstv-pieza${elegida && elegida[0] === q && elegida[1] === h ? ' elegida' : ''}" data-q="${q}" data-h="${h}" aria-label="Pieza ${h + 1}${g ? `, girada ${g * 90} grados` : ''}"${hecho ? ' disabled' : ''}><i style="${estilo(q, p, g)}"></i></button>`).join('');
        const sec = caja.closest('.sstv-q');
        sec.classList.toggle('hecho', hecho);
        contenedor.querySelector(`#sstv-letra-${q}`).textContent = hecho ? estado.letras[q] : '';
      }
      function pintarTodo() {
        cuadrantes.forEach((_, q) => pintar(q));
        const todas = cuadrantes.map((_, q) => estado.letras[q] || '').join('');
        if (todas.length === cuadrantes.length) {
          contenedor.querySelector('#sstv-credito').classList.remove('oculto');
          if (!campo.value) campo.value = todas;
        }
      }

      async function completar(q) {
        const letra = await ctx.parte(`cuadrante${q + 1}resuelto`, [cuadrantes[q].sello]);
        if (!letra) return;
        estado.letras[q] = letra.toUpperCase();
        guardar();
        elegida = null;
        const sec = contenedor.querySelector(`.sstv-q[data-q="${q}"]`);
        sec.classList.add('recibiendo');
        temporizador = setTimeout(() => sec.classList.remove('recibiendo'), GK.menosMovimiento() ? 0 : 1600);
        pintarTodo();
        ctx.ayuda(`¡Cuadrante ${q + 1} recibido! Su letra es «${estado.letras[q]}».`, 'ok');
      }

      contenedor.querySelector('.sstv-rx').addEventListener('click', async (ev) => {
        const amp = ev.target.closest('.sstv-ampliar');
        if (amp) {
          const sec = amp.closest('.sstv-q');
          const abierto = sec.classList.toggle('ampliado');
          amp.textContent = abierto ? '✕' : '⤢';
          amp.setAttribute('aria-label', `${abierto ? 'Cerrar' : 'Ampliar'} el cuadrante ${Number(sec.dataset.q) + 1}`);
          document.body.classList.toggle('sin-scroll', abierto);
          return;
        }
        const b = ev.target.closest('.sstv-pieza');
        if (!b || b.disabled) return;
        const q = Number(b.dataset.q);
        const h = Number(b.dataset.h);
        const anterior = elegida;
        if (!elegida || elegida[0] !== q) {
          elegida = [q, h]; // elegir
          if (anterior && anterior[0] !== q) pintar(anterior[0]);
        } else if (elegida[1] === h) {
          estado.piezas[q][h][1] = (estado.piezas[q][h][1] + 1) % 4; // girar
        } else {
          const t = estado.piezas[q][h]; // cambiar de sitio
          estado.piezas[q][h] = estado.piezas[q][elegida[1]];
          estado.piezas[q][elegida[1]] = t;
          elegida = null;
        }
        guardar();
        ctx.ayuda('');
        pintar(q);
        if (!estado.letras[q] && resuelto(q)) await completar(q);
      });

      const form = contenedor.querySelector('form');
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const b = form.querySelector('button');
        if (GK.normalizar(campo.value).length < cuadrantes.length) return ctx.ayuda(`La clave tiene ${cuadrantes.length} letras: una por cuadrante.`, 'info');
        b.disabled = true;
        b.textContent = 'Comprobando…';
        if (await ctx.intentar(campo.value)) { GK.borrar(claveGuardado); return; }
        b.disabled = false;
        b.textContent = 'Comprobar';
        ctx.ayuda('Esas letras no son. Revisad el orden: cuadrante 1, 2, 3 y 4.');
      });
      pintarTodo();
      cuadrantes.forEach((_, q) => { if (!estado.letras[q] && resuelto(q)) completar(q); });
      return () => { clearTimeout(temporizador); document.body.classList.remove('sin-scroll'); };
    },
  });
})();
