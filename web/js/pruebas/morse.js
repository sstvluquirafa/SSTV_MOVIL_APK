/*
 * Prueba MORSE (papel + app). En el cartel de la estación hay una PREGUNTA en Morse (torneo.json → prueba.cartel).
 * En la app, la tabla Morse siempre visible y un campo para la RESPUESTA. La app no traduce Morse: solo ayuda.
 * Si escriben la pregunta descifrada en vez de la respuesta, se les avisa (prueba.huellaPregunta, generada por el
 * script). La respuesta es la «clave» de la estación en privado/secretos.json.
 */
(function () {
  'use strict';
  const GK = window.GK;

  // Código Morse internacional (no es contenido de la prueba: es la tabla de ayuda)
  const TABLA = [
    ['A', '.-'], ['B', '-...'], ['C', '-.-.'], ['D', '-..'], ['E', '.'], ['F', '..-.'], ['G', '--.'], ['H', '....'],
    ['I', '..'], ['J', '.---'], ['K', '-.-'], ['L', '.-..'], ['M', '--'], ['N', '-.'], ['O', '---'], ['P', '.--.'],
    ['Q', '--.-'], ['R', '.-.'], ['S', '...'], ['T', '-'], ['U', '..-'], ['V', '...-'], ['W', '.--'], ['X', '-..-'],
    ['Y', '-.--'], ['Z', '--..'], ['0', '-----'], ['1', '.----'], ['2', '..---'], ['3', '...--'], ['4', '....-'],
    ['5', '.....'], ['6', '-....'], ['7', '--...'], ['8', '---..'], ['9', '----.'],
  ];
  // Cada símbolo, dibujado como un pulso de radio: punto = pulso corto, raya = pulso largo
  const pulsos = (c) => c.split('').map((s) => `<i class="${s === '.' ? 'p-punto' : 'p-raya'}"></i>`).join('');
  const leer = (c) => c.replace(/\./g, 'punto ').replace(/-/g, 'raya ').trim();
  // Al tocar una tecla, el móvil vibra como sonaría: corto = 70 ms, largo = 220 ms (si el móvil lo permite)
  const UNIDAD = 70;
  const patron = (c) => c.split('').flatMap((s, i) => [...(i ? [UNIDAD] : []), s === '.' ? UNIDAD : UNIDAD * 3]);

  GK.pruebas.registrar('morse', {
    titulo: 'Código Morse',
    objetivo: 'Descifrad la pregunta en Morse y respondedla.',
    pasos: ['Leed el código del cartel', 'Traducidlo con la tabla', 'Escribid la respuesta'],
    montar(contenedor, ctx) {
      const P = ctx.estacion.prueba;
      contenedor.innerHTML = `
        <div class="reto">
          <div class="reto-cuerpo">
            <section class="radio-panel" aria-label="Tabla Morse">
              <div class="radio-cab">
                <span class="radio-titulo">Tabla Morse</span>
                <span class="radio-leyenda" aria-hidden="true"><i class="p-punto"></i> corto <i class="p-raya"></i> largo</span>
              </div>
              <div class="tabla-morse">
                ${TABLA.map(([l, c]) => `<button type="button" class="tecla-morse" data-c="${c}" aria-label="${l}: ${leer(c)}"><b>${l}</b><span class="pulsos" aria-hidden="true">${pulsos(c)}</span></button>`).join('')}
              </div>
              <p class="radio-nota">En el cartel, las letras van separadas por espacios y las palabras por «/». Tocad una letra para sentir su ritmo.</p>
            </section>
            <form autocomplete="off">
              <label class="etiqueta" for="resp-morse">Respuesta a la pregunta</label>
              <input id="resp-morse" class="campo" autocapitalize="characters" spellcheck="false" maxlength="40" placeholder="Vuestra respuesta" required>
              <button class="boton boton-ancho" type="submit">Comprobar</button>
            </form>
          </div>
        </div>`;
      contenedor.querySelectorAll('.tecla-morse').forEach((b) => b.addEventListener('click', () => {
        try { if (navigator.vibrate) navigator.vibrate(patron(b.dataset.c)); } catch (e) { /* sin vibración */ }
        b.classList.remove('emitiendo'); void b.offsetWidth; b.classList.add('emitiendo');
      }));
      const form = contenedor.querySelector('form');
      const campo = contenedor.querySelector('input');
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const boton = form.querySelector('button');
        boton.disabled = true;
        boton.textContent = 'Comprobando…';
        const texto = campo.value;
        if (await ctx.intentar(texto)) return;
        boton.disabled = false;
        boton.textContent = 'Comprobar';
        campo.select();
        if (P.huellaPregunta && (await ctx.coincide(texto, P.huellaPregunta))) {
          ctx.ayuda('¡Bien descifrado! Pero eso es la pregunta: ¿cuál es la respuesta?', 'info');
        } else {
          ctx.ayuda('Todavía no. Revisad el cartel letra a letra con la tabla y probad otra vez.');
        }
      });
    },
  });
})();
