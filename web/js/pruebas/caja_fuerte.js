/*
 * Prueba ABRE LA ESCOTILLA (app; tipo «caja_fuerte»). Dos escotillas seguidas: primero una de 3 cifras y, al abrirla,
 * otra de 4. Ahora son dos acertijos FIJOS, iguales para todos (privado/bancos.json → caja_fuerte → escotillas_fijas),
 * pensados para resolverse por descarte leyendo las pistas en orden; las cifras no se repiten y el generador comprueba
 * por fuerza bruta que cada uno tiene una única solución. Bajo las pistas, una fila 0–9 para tachar cifras (visual).
 *
 * Contenido de este equipo: prueba.escotillas = [{ cifras, pistas: [{ codigo, texto }], huella? }]. Las escotillas
 * intermedias se comprueban con su huella (ctx.coincide); la última supera la estación con la unión de los códigos.
 * Sin espera tras fallo: probar todos los códigos no compensa.
 */
(function () {
  'use strict';
  const GK = window.GK;
  const NUMEROS = ['', 'la', 'las dos', 'las tres'];

  GK.pruebas.registrar('caja_fuerte', {
    titulo: 'Abre la escotilla',
    objetivo: (P) => ((P.escotillas || []).length > 1 ? `Abrid ${NUMEROS[(P.escotillas || []).length] || 'las'} escotillas de la nave.` : 'Abrid la escotilla de la nave.'),
    pasos: ['Leed las pistas', 'Descartad cifras', 'Girad las ruedas'],
    montar(contenedor, ctx) {
      const escotillas = ctx.estacion.prueba.escotillas || [];
      if (!escotillas.length) {
        contenedor.innerHTML = '<div class="aviso aviso-error">Falta configurar las escotillas de esta prueba. Avisad a la organización.</div>';
        return;
      }
      // Los códigos de las escotillas ya abiertas se guardan en el móvil: si salen de la pantalla, no las pierden
      const claveGuardado = `escotilla:${ctx.equipo.id}:${ctx.estacion.id}`;
      const abiertas = GK.leer(claveGuardado, []);
      let temporizador = null;

      function montarEscotilla(k) {
        const E = escotillas[k];
        const n = Number(E.cifras) || String((E.pistas[0] || {}).codigo || '000').length;
        const ruedas = Array(n).fill(0);
        const ultima = k === escotillas.length - 1;
        contenedor.innerHTML = `
          <div class="reto">
            <div class="reto-cuerpo">
              ${escotillas.length > 1 ? `<p class="escotilla-paso mono">Escotilla ${k + 1} de ${escotillas.length} · ${n} cifras</p>` : ''}
              <p class="nota-prueba">El código tiene ${n} cifras distintas: ninguna se repite.</p>
              <ul class="caja-pistas">
                ${(E.pistas || []).map((p) => `<li><span class="caja-cod mono" aria-label="Código ${GK.html(String(p.codigo).split('').join(' '))}">${String(p.codigo).split('').map((d) => `<i>${GK.html(d)}</i>`).join('')}</span><span>${GK.html(p.texto)}</span></li>`).join('')}
              </ul>
              <div class="tachar" role="group" aria-label="Cifras para tachar: tocad una para tacharla o destacharla">
                <p class="tachar-titulo">Tachad las cifras que descartéis</p>
                <div class="tachar-cifras">${[...'0123456789'].map((d) => `<button type="button" class="tachar-cifra" data-d="${d}" aria-pressed="false">${d}</button>`).join('')}</div>
              </div>
              <div class="caja caja-${n}" id="caja">
                ${Array.from({ length: 8 }, (_, j) => `<i class="perno" style="--a:${j * 45 + 22.5}deg" aria-hidden="true"></i>`).join('')}
                <div class="caja-puerta">
                  <div class="caja-ruedas">
                    ${ruedas.map((_, i) => `
                      <div class="rueda">
                        <button type="button" class="rueda-b" data-r="${i}" data-d="1" aria-label="Subir la cifra ${i + 1}">▲</button>
                        <output class="rueda-n mono" id="rueda-${i}" aria-label="Cifra ${i + 1}">0</output>
                        <button type="button" class="rueda-b" data-r="${i}" data-d="-1" aria-label="Bajar la cifra ${i + 1}">▼</button>
                      </div>`).join('')}
                  </div>
                  <div class="caja-pomo" aria-hidden="true"></div>
                </div>
                <div class="caja-interior" aria-hidden="true">${GK.icono('satelite')}</div>
              </div>
              <button class="boton boton-ancho" type="button" id="caja-abrir">Abrir la escotilla</button>
            </div>
          </div>`;
        const caja = contenedor.querySelector('#caja');
        const boton = contenedor.querySelector('#caja-abrir');
        // Cifras tachadas: solo una ayuda visual para descartar (no cuenta para la respuesta); cada escotilla la suya
        contenedor.querySelectorAll('.tachar-cifra').forEach((b) => b.addEventListener('click', () => {
          const tachada = b.classList.toggle('tachada');
          b.setAttribute('aria-pressed', String(tachada));
          b.setAttribute('aria-label', `${b.dataset.d}${tachada ? ', tachada' : ''}`);
        }));
        const mover = (i, d) => {
          ruedas[i] = (ruedas[i] + d + 10) % 10;
          contenedor.querySelector(`#rueda-${i}`).textContent = ruedas[i];
          ctx.ayuda('');
        };
        contenedor.querySelectorAll('.rueda-b').forEach((b) => b.addEventListener('click', () => mover(Number(b.dataset.r), Number(b.dataset.d))));
        // También con la rueda del ratón o deslizando el dedo arriba/abajo sobre la cifra
        contenedor.querySelectorAll('.rueda-n').forEach((o, i) => {
          let y0 = null;
          o.addEventListener('wheel', (ev) => { ev.preventDefault(); mover(i, ev.deltaY < 0 ? 1 : -1); }, { passive: false });
          o.addEventListener('pointerdown', (ev) => { y0 = ev.clientY; o.setPointerCapture(ev.pointerId); });
          o.addEventListener('pointermove', (ev) => {
            if (y0 == null) return;
            if (Math.abs(ev.clientY - y0) > 22) { mover(i, ev.clientY < y0 ? 1 : -1); y0 = ev.clientY; }
          });
          o.addEventListener('pointerup', () => { y0 = null; });
        });
        boton.addEventListener('click', async () => {
          boton.disabled = true;
          const codigo = ruedas.join('');
          const ok = ultima
            ? await ctx.intentar([...abiertas.slice(0, k), codigo].join(''), { quedarse: true })
            : !!E.huella && (await ctx.coincide(codigo, E.huella));
          if (ok) {
            caja.classList.add('abierta');
            boton.textContent = '¡Abierta!';
            const espera = GK.menosMovimiento() ? 600 : 2000;
            if (ultima) {
              GK.borrar(claveGuardado);
              ctx.ayuda('¡Clic! La compuerta se desliza…', 'ok');
              temporizador = setTimeout(() => ctx.continuar(), espera);
            } else {
              abiertas[k] = codigo;
              GK.guardar(claveGuardado, abiertas);
              ctx.ayuda('¡Clic! Detrás hay otra escotilla…', 'ok');
              temporizador = setTimeout(() => { ctx.ayuda(''); montarEscotilla(k + 1); window.scrollTo({ top: 0, behavior: GK.menosMovimiento() ? 'auto' : 'smooth' }); }, espera);
            }
            return;
          }
          boton.disabled = false;
          caja.classList.remove('temblor'); void caja.offsetWidth; caja.classList.add('temblor');
          ctx.ayuda(`La escotilla no se abre con ${codigo}. Repasad las pistas una a una.`);
        });
      }

      // Se empieza por la primera escotilla que falte por abrir
      let k = 0;
      while (k < escotillas.length - 1 && abiertas[k]) k++;
      montarEscotilla(k);
      return () => clearTimeout(temporizador);
    },
  });
})();
