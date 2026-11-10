/*
 * Prueba BUSCA LAS DIFERENCIAS (app). Dos escenas espaciales en SVG, una encima de otra: «Señal original» y «Señal
 * recibida», generadas para cada equipo (generar_torneo.py → contenido_diferencias). La escena tiene 4 zonas y cada
 * zona 3 diferencias en la recibida (un objeto que falta, uno de más, otro tamaño, girado, otro color o movido).
 *
 * Se toca la diferencia en la «recibida» y se marca con un círculo; tocar donde no hay nada bloquea 3 s. Cuando se
 * encuentran las 3 de una zona, sus identificadores abren el sello de la zona (ctx.parte) y sale UNA LETRA. Las 4
 * letras, en orden de zona, son la clave del equipo, que se escribe en cualquier móvil. Con varios móviles, cada uno
 * puede buscar en una zona (los móviles no se sincronizan: el equipo junta las letras hablando).
 *
 * EXCEPCIÓN (como el Wordle): para saber si un toque acierta, el móvil necesita saber dónde están las diferencias, así
 * que alguien muy experto podría sacar las letras de config.js. La escena las enseña igualmente: la prueba es mirar.
 */
(function () {
  'use strict';
  const GK = window.GK;
  const ZONAS = [[0, 0], [200, 0], [0, 150], [200, 150]];
  const BLOQUEO = 3;

  /** Cada objeto se dibuja en una caja de 32 × 32 centrada en 0,0 y luego se escala a su tamaño. */
  const FORMAS = {
    planeta: (c, o) => `<circle r="13" fill="${c}"/><path d="M4,-12.4 A13 13 0 0 1 4,12.4 A10 13 0 0 0 4,-12.4Z" fill="#000" opacity=".28"/>${o.a ? '<ellipse rx="21" ry="5" fill="none" stroke="#eef1fa" stroke-width="2.2" transform="rotate(-20)"/>' : ''}`,
    luna: (c) => `<path d="M3,-14 A14 14 0 1 0 3,14 A10 13 0 1 1 3,-14Z" fill="${c}"/>`,
    estrella: (c) => `<polygon points="0,-15 4.2,-5 15,-4.6 6.6,2.6 9.3,13.4 0,7.4 -9.3,13.4 -6.6,2.6 -15,-4.6 -4.2,-5" fill="${c}"/>`,
    cohete: (c) => `<path d="M-3,10 L0,17 L3,10Z" fill="#ffb627"/><path d="M-5,4 L-11,13 L-5,10Z M5,4 L11,13 L5,10Z" fill="${c}"/><path d="M0,-16 C7,-9 7,4 5,10 L-5,10 C-7,4 -7,-9 0,-16Z" fill="#eef1fa"/><path d="M0,-16 C3.5,-12.5 5,-9.5 5.6,-7 L-5.6,-7 C-5,-9.5 -3.5,-12.5 0,-16Z" fill="${c}"/><circle cy="-1" r="3.2" fill="#0b1230" stroke="${c}" stroke-width="1.5"/>`,
    cubesat: (c) => `<path d="M0,-7 L0,-15" stroke="#eef1fa" stroke-width="1.6"/><circle cy="-15.5" r="2" fill="#eef1fa"/><rect x="-17" y="-4" width="9" height="8" fill="#1d4fbf" stroke="#6fa8ff" stroke-width="1"/><rect x="8" y="-4" width="9" height="8" fill="#1d4fbf" stroke="#6fa8ff" stroke-width="1"/><rect x="-7" y="-7" width="14" height="14" rx="2" fill="${c}" stroke="#0b1230" stroke-width="1.4"/><path d="M-7,0 H7 M0,-7 V7" stroke="#0b1230" stroke-width="1"/>`,
    astronauta: (c) => `<path d="M6,1 L13,-7" stroke="#eef1fa" stroke-width="4" stroke-linecap="round"/><path d="M-6,1 L-11,8" stroke="#eef1fa" stroke-width="4" stroke-linecap="round"/><rect x="-9" y="-3" width="4" height="10" rx="1.5" fill="#9aa6c8"/><rect x="-6" y="-3" width="12" height="12" rx="3" fill="#eef1fa"/><path d="M-3,9 V15 M3,9 V15" stroke="#eef1fa" stroke-width="4" stroke-linecap="round"/><circle cy="-9" r="6.5" fill="#eef1fa"/><ellipse cx="1.5" cy="-9" rx="4.2" ry="3.2" fill="${c}"/>`,
    cometa: (c) => `<path d="M8,-5 L-16,-1.5 L-15,2.5 L8,5Z" fill="${c}" opacity=".45"/><path d="M8,-3 L-9,0 L8,3Z" fill="${c}" opacity=".7"/><circle cx="8" r="5" fill="${c}"/>`,
    antena: (c) => `<path d="M0,5 L-5,15 M0,5 L5,15 M-7,15 H7" stroke="#9aa6c8" stroke-width="2"/><path d="M-12,-11 Q-11,8 9,9" stroke="${c}" stroke-width="3.2" fill="none"/><path d="M-1.5,-1 L7,-9" stroke="#eef1fa" stroke-width="1.4"/><circle cx="7.5" cy="-9.5" r="2" fill="#eef1fa"/>`,
  };
  const dibujar = (o) => `<g transform="translate(${o.x} ${o.y}) rotate(${o.r || 0}) scale(${(o.s || 32) / 32})">${(FORMAS[o.t] || FORMAS.estrella)(o.c, o)}</g>`;
  const escena = (estrellas, objetos) => `<rect width="400" height="300" fill="#050a1c"/>${(estrellas || []).map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#dfe6ff" opacity="${r > 1 ? 0.9 : 0.55}"/>`).join('')}${(objetos || []).map(dibujar).join('')}
    <path d="M200,0 V300 M0,150 H400" stroke="#6fa8ff" stroke-opacity=".45" stroke-width="1" stroke-dasharray="4 4"/>
    ${ZONAS.map(([x, y], z) => `<text class="dif-num" x="${x + 6}" y="${y + 15}">${z + 1}</text>`).join('')}`;

  GK.pruebas.registrar('diferencias', {
    titulo: 'Busca las diferencias',
    objetivo: (P) => `Encontrad las ${(P.diferencias || []).length || 12} diferencias de la señal recibida.`,
    pasos: ['Repartíos las 4 zonas', 'Tocad cada diferencia', 'Juntad las 4 letras'],
    montar(contenedor, ctx) {
      const P = ctx.estacion.prueba;
      const difs = P.diferencias || [];
      if (!difs.length) {
        contenedor.innerHTML = '<div class="aviso aviso-error">Falta configurar las escenas de esta prueba. Avisad a la organización.</div>';
        return;
      }
      const claveGuardado = `dif:${ctx.equipo.id}:${ctx.estacion.id}`;
      const estado = GK.leer(claveGuardado, null) || { encontradas: [], letras: {} };
      const guardar = () => GK.guardar(claveGuardado, estado);
      const zonaDe = (d) => Number(String(d.id)[0]) - 1;
      const porZona = ZONAS.map((_, z) => difs.filter((d) => zonaDe(d) === z));
      let zona = null; // null = escena entera
      let bloqueado = false;
      let temporizador = null;

      contenedor.innerHTML = `
        <div class="reto">
          <div class="reto-cuerpo">
            <div class="dif-zonas" role="group" aria-label="Zonas">
              <button type="button" class="dif-zona elegida" data-z="">Todo</button>
              ${ZONAS.map((_, z) => `<button type="button" class="dif-zona" data-z="${z}"><span>Zona ${z + 1}</span><b class="mono" id="dif-z${z}"></b></button>`).join('')}
            </div>
            <figure class="dif-escena">
              <figcaption class="dif-pie">Señal original</figcaption>
              <svg class="dif-svg" id="dif-original" viewBox="0 0 400 300" role="img" aria-label="Escena original">${escena(P.estrellas, P.original)}</svg>
            </figure>
            <figure class="dif-escena">
              <figcaption class="dif-pie">Señal recibida <span class="texto-2">· tocad aquí las diferencias</span></figcaption>
              <div class="dif-marco">
                <svg class="dif-svg dif-tocable" id="dif-recibida" viewBox="0 0 400 300" role="img" aria-label="Escena recibida: tocad donde veáis una diferencia">${escena(P.estrellas, P.recibida)}<g id="dif-marcas"></g></svg>
                <div class="dif-bloqueo oculto" id="dif-bloqueo" aria-live="polite"></div>
              </div>
            </figure>
            <form class="dif-clave-form" autocomplete="off" novalidate>
              <label class="etiqueta" for="dif-clave">Las 4 letras, de la zona 1 a la 4</label>
              <input id="dif-clave" class="campo campo-codigo" autocapitalize="characters" spellcheck="false" maxlength="8" placeholder="····">
              <button class="boton boton-ancho" type="submit">Comprobar</button>
            </form>
          </div>
        </div>`;
      const svgO = contenedor.querySelector('#dif-original');
      const svgR = contenedor.querySelector('#dif-recibida');
      const marcas = contenedor.querySelector('#dif-marcas');
      const aviso = contenedor.querySelector('#dif-bloqueo');
      const campo = contenedor.querySelector('#dif-clave');

      function pintar() {
        marcas.innerHTML = difs.filter((d) => estado.encontradas.includes(d.id))
          .map((d) => `<circle class="dif-marca" cx="${d.x}" cy="${d.y}" r="${d.r || 26}"/>`).join('');
        ZONAS.forEach((_, z) => {
          const n = porZona[z].filter((d) => estado.encontradas.includes(d.id)).length;
          const b = contenedor.querySelector(`#dif-z${z}`);
          b.textContent = estado.letras[z] ? estado.letras[z] : `${n}/${porZona[z].length}`;
          b.parentElement.classList.toggle('hecha', !!estado.letras[z]);
        });
        const todas = ZONAS.map((_, z) => estado.letras[z] || '').join('');
        if (todas.length === ZONAS.length && !campo.value) campo.value = todas;
      }
      function verZona(z) {
        zona = z;
        const vb = z == null ? '0 0 400 300' : `${ZONAS[z][0]} ${ZONAS[z][1]} 200 150`;
        svgO.setAttribute('viewBox', vb);
        svgR.setAttribute('viewBox', vb);
        contenedor.querySelectorAll('.dif-zona').forEach((b) => b.classList.toggle('elegida', String(b.dataset.z) === (z == null ? '' : String(z))));
      }
      contenedor.querySelectorAll('.dif-zona').forEach((b) => b.addEventListener('click', () => verZona(b.dataset.z === '' ? null : Number(b.dataset.z))));
      // Tocar una zona en la escena entera la amplía (más fácil de tocar con el dedo)
      svgO.addEventListener('click', (ev) => {
        if (zona != null) return;
        const p = punto(svgO, ev);
        verZona((p.y >= 150 ? 2 : 0) + (p.x >= 200 ? 1 : 0));
      });

      function punto(svg, ev) {
        const pt = svg.createSVGPoint();
        pt.x = ev.clientX; pt.y = ev.clientY;
        return pt.matrixTransform(svg.getScreenCTM().inverse());
      }
      async function zonaCompleta(z) {
        const ids = porZona[z].map((d) => d.id).sort().join('');
        const letra = await ctx.parte(`zona${z + 1}${ids}`, [(P.sellosZona || [])[z]]);
        if (letra) {
          estado.letras[z] = letra.toUpperCase();
          guardar();
          pintar();
          ctx.ayuda(`¡Zona ${z + 1} completa! Su letra es «${estado.letras[z]}».`, 'ok');
        }
      }
      svgR.addEventListener('click', async (ev) => {
        if (bloqueado) return;
        const p = punto(svgR, ev);
        // La diferencia más cercana al toque (primero las que faltan por encontrar: dos pueden estar muy juntas)
        const dist = (x) => Math.min(Math.hypot(x.x - p.x, x.y - p.y), x.x2 != null ? Math.hypot(x.x2 - p.x, x.y2 - p.y) : Infinity);
        const tocadas = difs.filter((x) => dist(x) <= (x.r || 26)).sort((a, b) => dist(a) - dist(b));
        const d = tocadas.find((x) => !estado.encontradas.includes(x.id)) || tocadas[0];
        if (d) {
          if (estado.encontradas.includes(d.id)) return;
          estado.encontradas.push(d.id);
          guardar();
          pintar();
          GK.vibrar(30);
          const z = zonaDe(d);
          if (porZona[z].every((x) => estado.encontradas.includes(x.id)) && !estado.letras[z]) await zonaCompleta(z);
          else ctx.ayuda('');
          return;
        }
        // Toque donde no hay nada: 3 s sin poder tocar, para no ir al azar
        bloqueado = true;
        aviso.classList.remove('oculto');
        let quedan = BLOQUEO;
        const contar = () => {
          aviso.textContent = `Ahí no hay ninguna diferencia · ${quedan} s`;
          if (quedan-- <= 0) { bloqueado = false; aviso.classList.add('oculto'); return; }
          temporizador = setTimeout(contar, 1000);
        };
        contar();
      });

      const form = contenedor.querySelector('form');
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const b = form.querySelector('button');
        if (GK.normalizar(campo.value).length < ZONAS.length) return ctx.ayuda(`La clave tiene ${ZONAS.length} letras: una por zona.`, 'info');
        b.disabled = true;
        b.textContent = 'Comprobando…';
        if (await ctx.intentar(campo.value)) { GK.borrar(claveGuardado); return; }
        b.disabled = false;
        b.textContent = 'Comprobar';
        ctx.ayuda('Esas letras no son. Revisad el orden: zona 1, 2, 3 y 4.');
      });
      // Si ya estaban las 3 de una zona pero no se abrió su letra (por ejemplo, sin cripto un momento), se reintenta
      ZONAS.forEach((_, z) => { if (!estado.letras[z] && porZona[z].every((x) => estado.encontradas.includes(x.id))) zonaCompleta(z); });
      pintar();
      return () => clearTimeout(temporizador);
    },
  });
})();
