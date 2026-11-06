/*
 * Prueba SSTV A MANO (papel + app). En el cartel están las coordenadas de una imagen, fila por fila (qué casillas
 * se pintan): torneo.json → prueba.cartel (lista de filas), prueba.columnas y prueba.filas. En la app, una
 * cuadrícula que se pinta tocando casillas (o arrastrando el dedo). La app NO comprueba el dibujo: solo la palabra
 * de lo que aparece (clave en privado/secretos.json; los sinónimos van en «alternativas»).
 */
(function () {
  'use strict';
  const GK = window.GK;

  GK.pruebas.registrar('sstv_mano', {
    titulo: 'SSTV a mano',
    montar(contenedor, ctx) {
      const P = ctx.estacion.prueba;
      const cols = Math.max(1, Math.min(30, Number(P.columnas) || 11));
      const filas = Math.max(1, Math.min(30, Number(P.filas) || 14));
      const claveGuardado = `sstv:${ctx.equipo.id}:${ctx.estacion.id}`;
      // El dibujo se guarda en el móvil: si salen de la pantalla, no lo pierden.
      let pintadas = new Set(GK.leer(claveGuardado, []));
      const guardar = () => GK.guardar(claveGuardado, [...pintadas]);

      let celdas = '<span class="sstv-esquina" aria-hidden="true"></span>';
      for (let c = 1; c <= cols; c++) celdas += `<span class="sstv-num" aria-hidden="true">${c}</span>`;
      for (let f = 1; f <= filas; f++) {
        celdas += `<span class="sstv-num" aria-hidden="true">${f}</span>`;
        for (let c = 1; c <= cols; c++) {
          const id = `${f}-${c}`;
          celdas += `<button type="button" class="sstv-celda${pintadas.has(id) ? ' on' : ''}" data-c="${id}" aria-pressed="${pintadas.has(id)}" aria-label="Fila ${f}, casilla ${c}"></button>`;
        }
      }
      contenedor.innerHTML = `
        <div class="ventana">
          <div class="ventana-barra"><span class="puntos"><i></i><i></i><i></i></span><span>RX_SSTV · EST_${GK.html(ctx.estacion.letra)}</span></div>
          <div class="ventana-cuerpo">
            <p class="terminal">&gt; Así viaja una imagen SSTV: <b>línea a línea, de arriba abajo</b>.<br>
              &gt; El cartel dice qué casillas se pintan en cada fila.<br>
              &gt; Pintadlas tocando (otra vez = borrar) y decid <b>qué es</b> el dibujo.</p>
            <div class="sstv-rejilla" style="--cols:${cols}">${celdas}</div>
            <div class="sstv-acciones">
              <span class="texto-2 mono" id="sstv-cuenta"></span>
              <button type="button" class="boton-sec mini" id="sstv-borrar">Borrar todo</button>
            </div>
            <form autocomplete="off">
              <label class="etiqueta" for="resp-sstv">¿Qué es el dibujo?</label>
              <input id="resp-sstv" class="campo" spellcheck="false" maxlength="40" placeholder="Es un…" required>
              <button class="boton boton-ancho" type="submit">Comprobar</button>
            </form>
          </div>
        </div>`;
      const rejilla = contenedor.querySelector('.sstv-rejilla');
      const cuenta = contenedor.querySelector('#sstv-cuenta');
      const contar = () => { cuenta.textContent = `${pintadas.size} casillas pintadas`; };
      const poner = (b, on) => {
        const id = b.dataset.c;
        if (on) pintadas.add(id); else pintadas.delete(id);
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', String(on));
      };
      contar();

      // Tocar cambia la casilla; arrastrar pinta (o borra, si se empezó en una pintada) las casillas por las que pasa.
      let modo = null;
      rejilla.addEventListener('pointerdown', (ev) => {
        const b = ev.target.closest('.sstv-celda');
        if (!b) return;
        ev.preventDefault();
        modo = !pintadas.has(b.dataset.c);
        poner(b, modo);
      });
      rejilla.addEventListener('pointermove', (ev) => {
        if (modo === null) return;
        const b = document.elementFromPoint(ev.clientX, ev.clientY);
        if (b && b.classList && b.classList.contains('sstv-celda') && pintadas.has(b.dataset.c) !== modo) poner(b, modo);
      });
      const soltar = () => { if (modo !== null) { modo = null; guardar(); contar(); } };
      window.addEventListener('pointerup', soltar);
      window.addEventListener('pointercancel', soltar);
      // Teclado (Enter/Espacio sobre la casilla)
      rejilla.addEventListener('click', (ev) => {
        const b = ev.target.closest('.sstv-celda');
        if (!b || ev.detail !== 0) return; // los clics del ratón/dedo ya se han tratado en pointerdown
        poner(b, !pintadas.has(b.dataset.c));
        guardar(); contar();
      });

      contenedor.querySelector('#sstv-borrar').onclick = async () => {
        if (!pintadas.size) return;
        const ok = await GK.modal('<p>¿Borrar todo el dibujo?</p>', [['Cancelar', false], ['Borrar', true, 'boton-sec boton-peligro']]);
        if (!ok) return;
        rejilla.querySelectorAll('.sstv-celda.on').forEach((b) => poner(b, false));
        pintadas = new Set();
        guardar(); contar();
      };

      const form = contenedor.querySelector('form');
      const campo = contenedor.querySelector('input');
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const boton = form.querySelector('button');
        boton.disabled = true;
        boton.textContent = 'Comprobando…';
        if (await ctx.intentar(campo.value)) return;
        boton.disabled = false;
        boton.textContent = 'Comprobar';
        campo.select();
        ctx.ayuda(pintadas.size < 10
          ? 'Todavía no. Pintad primero las casillas del cartel: el dibujo os dará la respuesta.'
          : 'Todavía no. Mirad el dibujo de lejos: ¿qué os parece? Revisad también las filas del cartel.');
      });

      return () => {
        window.removeEventListener('pointerup', soltar);
        window.removeEventListener('pointercancel', soltar);
      };
    },
  });
})();
