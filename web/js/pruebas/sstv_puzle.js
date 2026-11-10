/*
 * Prueba IMAGEN SSTV DESORDENADA (app). Llegan 4 imágenes «por SSTV» con las piezas desordenadas y giradas: cuatro
 * puzles independientes de 3 × 3, cada uno con su ilustración (SVG propio: cohete, astronauta, Saturno y CubeSat).
 * Encima de cada puzle, la imagen terminada en pequeño (la tapa de la caja). La mezcla es la misma para todos.
 *
 * Controles: tocar una pieza la gira 90°; arrastrarla sobre otra las cambia de sitio (pointer events: dedo, ratón o
 * lápiz; las piezas tienen touch-action: none para que no haga scroll mientras se arrastra). Con teclado: Intro gira y
 * las flechas la cambian con la de al lado. Cada puzle se puede abrir a pantalla completa. Al entrar, una animación
 * corta (una sola vez y sin ella si se pide menos movimiento) enseña los dos gestos con una pieza; después se queda
 * quieta como leyenda hasta salir (quitarla movería la página mientras alguien arrastra).
 *
 * Cada puzle resuelto enseña «Imagen recibida» con las barras SSTV y su sello (ctx.parte) da UNA LETRA; las 4, en
 * orden, son la clave (se escribe en cualquier móvil: con varios móviles, cada uno puede hacer un puzle).
 * prueba.puzles[q] = { src, inicio: [[pieza, giro] × 9], sello }. Resuelto = cada pieza en su hueco y sin girar.
 * EXCEPCIÓN (como el Wordle): el móvil necesita saber la solución para darla por buena; un experto podría sacarla.
 */
(function () {
  'use strict';
  const GK = window.GK;
  const LADO = 3;

  GK.pruebas.registrar('sstv_puzle', {
    titulo: 'Imagen SSTV desordenada',
    objetivo: (P) => `Recomponed las ${(P.puzles || []).length || 4} imágenes recibidas por SSTV.`,
    pasos: (P) => ['Tocad una pieza para girarla', 'Arrastradla sobre otra para cambiarlas de sitio',
      `Cada imagen terminada da una letra: juntadlas en orden del 1 al ${(P.puzles || []).length || 4}`],
    montar(contenedor, ctx) {
      const puzles = ctx.estacion.prueba.puzles || [];
      if (!puzles.length) {
        contenedor.innerHTML = '<div class="aviso aviso-error">Falta configurar las imágenes de esta prueba. Avisad a la organización.</div>';
        return;
      }
      const claveGuardado = `pz:${ctx.equipo.id}:${ctx.estacion.id}`;
      const claveDemo = `pz-demo:${ctx.equipo.id}:${ctx.estacion.id}`;
      const firma = puzles.map((p) => p.src + JSON.stringify(p.inicio)).join('|');
      let estado = GK.leer(claveGuardado, null);
      if (!estado || estado.firma !== firma) estado = { firma, piezas: puzles.map((p) => p.inicio.map((x) => [...x])), letras: {} };
      const guardar = () => GK.guardar(claveGuardado, estado);
      // Vueltas «visuales» de cada pieza (sin el % 4), para que el giro de 270° a 0° se anime hacia delante
      const vueltas = estado.piezas.map((q) => q.map(([, g]) => g));
      const temporizadores = [];

      const url = (src) => encodeURI(src).replace(/'/g, '%27');
      /** Estilo de una pieza: su trozo de la ilustración (3 × 3) y su giro. La URL va en cada pieza: dentro de una
       *  variable CSS se resolvería desde css/ y no desde la página. */
      const estilo = (src, p, v) => `background-image:url('${url(src)}');background-position:${(p % LADO) * 50}% ${Math.floor(p / LADO) * 50}%;transform:rotate(${v * 90}deg)`;
      const resuelto = (q) => estado.piezas[q].every(([p, g], h) => p === h && g === 0);
      const conDemo = !GK.menosMovimiento() && !GK.leer(claveDemo, false) && !Object.keys(estado.letras).length;

      contenedor.innerHTML = `
        <div class="reto">
          <div class="reto-cuerpo">
            ${conDemo ? `
            <div class="pz-demo" id="pz-demo" aria-hidden="true">
              <div class="pz-demo-piezas">
                <span class="pz-demo-a"><i style="${estilo(puzles[0].src, 0, 0)}"></i></span>
                <span class="pz-demo-b"><i style="${estilo(puzles[0].src, 1, 0)}"></i></span>
                <b class="pz-demo-dedo"></b>
              </div>
              <p class="pz-demo-texto"><span class="pz-demo-t1">Tocar = girar</span><span class="pz-demo-t2">Arrastrar = cambiar</span></p>
            </div>` : ''}
            ${puzles.map((pz, q) => `
              <section class="pz" data-q="${q}" aria-label="Imagen ${q + 1}">
                <div class="pz-cab">
                  <img class="pz-mini" src="${GK.html(pz.src)}" alt="Así queda la imagen ${q + 1}" width="56" height="56">
                  <div class="pz-titulo"><b>Imagen ${q + 1}</b><span id="pz-estado-${q}">Por recomponer</span></div>
                  <b class="pz-letra mono" id="pz-letra-${q}"></b>
                  <button type="button" class="pz-ampliar" data-q="${q}" aria-label="Ampliar la imagen ${q + 1}">⤢</button>
                </div>
                <div class="pz-rejilla" id="pz-${q}"></div>
                <div class="sstv-recibido" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
              </section>`).join('')}
            <form class="dif-clave-form" autocomplete="off" novalidate>
              <label class="etiqueta" for="sstv-clave">La palabra: las letras de la imagen 1 a la ${puzles.length}</label>
              <input id="sstv-clave" class="campo campo-codigo" autocapitalize="characters" spellcheck="false" maxlength="8" placeholder="${'·'.repeat(puzles.length)}">
              <button class="boton boton-ancho" type="submit">Comprobar</button>
            </form>
          </div>
        </div>`;
      const campo = contenedor.querySelector('#sstv-clave');
      const pieza = (q, h) => contenedor.querySelector(`.pz-pieza[data-q="${q}"][data-h="${h}"]`);

      function pintar(q) {
        const hecho = !!estado.letras[q];
        contenedor.querySelector(`#pz-${q}`).innerHTML = estado.piezas[q].map(([p], h) => `<button type="button" class="pz-pieza" data-q="${q}" data-h="${h}"${hecho ? ' disabled' : ''}><i style="${estilo(puzles[q].src, p, vueltas[q][h])}"></i></button>`).join('');
        estado.piezas[q].forEach((_, h) => etiquetar(q, h));
        contenedor.querySelector(`.pz[data-q="${q}"]`).classList.toggle('hecho', hecho);
        contenedor.querySelector(`#pz-letra-${q}`).textContent = hecho ? estado.letras[q] : '';
        contenedor.querySelector(`#pz-estado-${q}`).textContent = hecho ? `Imagen recibida · letra ${estado.letras[q]}` : 'Por recomponer';
      }
      function etiquetar(q, h) {
        const g = estado.piezas[q][h][1];
        pieza(q, h).setAttribute('aria-label', `Imagen ${q + 1}, hueco ${h + 1}${g ? `, girada ${g * 90} grados` : ''}. Intro: girar. Flechas: cambiar con la de al lado`);
      }
      /** Repinta una sola pieza (sin rehacer el puzle: así el giro se anima). */
      function actualizar(q, h) {
        const [p] = estado.piezas[q][h];
        pieza(q, h).firstElementChild.setAttribute('style', estilo(puzles[q].src, p, vueltas[q][h]));
        etiquetar(q, h);
      }
      /** Con las 4 letras en este móvil, la palabra se escribe sola. */
      function rellenarClave() {
        const todas = puzles.map((_, q) => estado.letras[q] || '').join('');
        if (todas.length === puzles.length && !campo.value) campo.value = todas;
      }
      function pintarTodo() {
        puzles.forEach((_, q) => pintar(q));
        rellenarClave();
      }

      async function comprobar(q) {
        if (estado.letras[q] || !resuelto(q)) return;
        const letra = await ctx.parte(`puzle${q + 1}resuelto`, [puzles[q].sello]);
        if (!letra) return;
        estado.letras[q] = letra.toUpperCase();
        guardar();
        const sec = contenedor.querySelector(`.pz[data-q="${q}"]`);
        sec.classList.add('recibiendo');
        temporizadores.push(setTimeout(() => sec.classList.remove('recibiendo'), GK.menosMovimiento() ? 0 : 1700));
        // Solo este puzle: rehacer los demás cortaría un arrastre que alguien esté haciendo en otro
        pintar(q);
        rellenarClave();
        GK.vibrar([40, 60, 40]);
        ctx.ayuda(`¡Imagen ${q + 1} recibida! Su letra es «${estado.letras[q]}».`, 'ok');
      }
      function girar(q, h) {
        estado.piezas[q][h][1] = (estado.piezas[q][h][1] + 1) % 4;
        vueltas[q][h] += 1;
        guardar();
        actualizar(q, h);
        ctx.ayuda('');
        comprobar(q);
      }
      function cambiar(q, a, b) {
        if (a === b) return;
        [estado.piezas[q][a], estado.piezas[q][b]] = [estado.piezas[q][b], estado.piezas[q][a]];
        [vueltas[q][a], vueltas[q][b]] = [vueltas[q][b], vueltas[q][a]];
        guardar();
        // Sin animar el giro al cambiar de sitio (la pieza «salta» a su nuevo hueco)
        [a, b].forEach((h) => { pieza(q, h).firstElementChild.style.transition = 'none'; actualizar(q, h); });
        requestAnimationFrame(() => [a, b].forEach((h) => { const i = pieza(q, h).firstElementChild; if (i) i.style.transition = ''; }));
        ctx.ayuda('');
        comprobar(q);
      }

      /* ---------- Arrastrar (pointer events) y tocar ---------- */
      let arr = null;
      const destinoEn = (x, y) => document.elementsFromPoint(x, y)
        .map((e) => e.closest && e.closest('.pz-pieza'))
        .find((e) => e && e !== arr.b && Number(e.dataset.q) === arr.q && !e.disabled) || null;
      contenedor.addEventListener('pointerdown', (ev) => {
        const b = ev.target.closest('.pz-pieza');
        if (!b || b.disabled || arr || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
        ev.preventDefault();
        try { b.setPointerCapture(ev.pointerId); } catch (e) { /* sin captura */ }
        arr = { b, q: Number(b.dataset.q), h: Number(b.dataset.h), x0: ev.clientX, y0: ev.clientY, id: ev.pointerId, movido: false, destino: null };
        quitarDemo();
      });
      contenedor.addEventListener('pointermove', (ev) => {
        if (!arr || ev.pointerId !== arr.id) return;
        const dx = ev.clientX - arr.x0;
        const dy = ev.clientY - arr.y0;
        if (!arr.movido && Math.hypot(dx, dy) < 10) return;
        ev.preventDefault();
        if (!arr.movido) { arr.movido = true; arr.b.classList.add('arrastrando'); }
        arr.b.style.transform = `translate(${dx}px, ${dy}px)`;
        const d = destinoEn(ev.clientX, ev.clientY);
        if (d !== arr.destino) {
          if (arr.destino) arr.destino.classList.remove('destino');
          arr.destino = d;
          if (d) d.classList.add('destino');
        }
      });
      const soltar = (ev, cancelar) => {
        if (!arr || ev.pointerId !== arr.id) return;
        const { b, q, h, movido, destino } = arr;
        arr = null;
        b.classList.remove('arrastrando');
        b.style.transform = '';
        if (destino) destino.classList.remove('destino');
        if (cancelar) return;
        if (!movido) girar(q, h);
        else if (destino) cambiar(q, h, Number(destino.dataset.h));
      };
      contenedor.addEventListener('pointerup', (ev) => soltar(ev, false));
      contenedor.addEventListener('pointercancel', (ev) => soltar(ev, true));
      // Teclado: Intro / Espacio giran (el «click» de teclado llega sin puntero); las flechas cambian con la de al lado
      contenedor.addEventListener('click', (ev) => {
        const b = ev.target.closest('.pz-pieza');
        if (b && !b.disabled && ev.detail === 0) girar(Number(b.dataset.q), Number(b.dataset.h));
      });
      contenedor.addEventListener('keydown', (ev) => {
        const b = ev.target.closest && ev.target.closest('.pz-pieza');
        const paso = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[ev.key];
        if (!b || b.disabled || !paso) return;
        const q = Number(b.dataset.q);
        const h = Number(b.dataset.h);
        const c = (h % LADO) + paso[0];
        const f = Math.floor(h / LADO) + paso[1];
        if (c < 0 || c >= LADO || f < 0 || f >= LADO) return;
        ev.preventDefault();
        cambiar(q, h, f * LADO + c);
        pieza(q, f * LADO + c).focus();
      });

      /* ---------- Pantalla completa ---------- */
      contenedor.addEventListener('click', (ev) => {
        const amp = ev.target.closest('.pz-ampliar');
        if (!amp) return;
        const sec = amp.closest('.pz');
        const abierto = sec.classList.toggle('ampliado');
        amp.textContent = abierto ? '✕' : '⤢';
        amp.setAttribute('aria-label', `${abierto ? 'Cerrar' : 'Ampliar'} la imagen ${Number(sec.dataset.q) + 1}`);
        document.body.classList.toggle('sin-scroll', !!contenedor.querySelector('.pz.ampliado'));
      });

      /* ---------- Animación de ayuda (una vez) ---------- */
      // Al acabar (o al tocar una pieza) se queda quieta como leyenda: quitarla movería la página mientras alguien
      // arrastra. La próxima vez que entren ya no sale.
      function quitarDemo() {
        if (conDemo) GK.guardar(claveDemo, true);
      }
      if (conDemo) {
        const demo = contenedor.querySelector('#pz-demo');
        requestAnimationFrame(() => demo.classList.add('reproduciendo'));
        temporizadores.push(setTimeout(quitarDemo, 3000));
      }

      const form = contenedor.querySelector('form');
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const b = form.querySelector('button');
        if (GK.normalizar(campo.value).length < puzles.length) return ctx.ayuda(`La palabra tiene ${puzles.length} letras: una por imagen.`, 'info');
        b.disabled = true;
        b.textContent = 'Comprobando…';
        if (await ctx.intentar(campo.value)) { GK.borrar(claveGuardado); return; }
        b.disabled = false;
        b.textContent = 'Comprobar';
        ctx.ayuda('Esa palabra no es. Revisad el orden: imagen 1, 2, 3 y 4.');
      });
      pintarTodo();
      puzles.forEach((_, q) => comprobar(q));
      return () => { temporizadores.forEach(clearTimeout); document.body.classList.remove('sin-scroll'); };
    },
  });
})();
