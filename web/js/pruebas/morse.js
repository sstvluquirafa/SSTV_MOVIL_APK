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
  // Puntos y rayas más visibles que «.» y «-»
  const dibujar = (c) => c.replace(/\./g, '•').replace(/-/g, '−');

  GK.pruebas.registrar('morse', {
    titulo: 'Código Morse',
    montar(contenedor, ctx) {
      const P = ctx.estacion.prueba;
      contenedor.innerHTML = `
        <div class="reto">
          <div class="reto-cuerpo">
            <p class="reto-intro">El cartel de la estación trae una <b>pregunta en Morse</b>.<br>
              Letras separadas por espacios; palabras separadas por <b>/</b>.<br>
              Descifradla con la tabla y escribid la <b>respuesta</b> (no la pregunta).</p>
            <details class="plegable tabla-morse-caja" open>
              <summary><span class="antetitulo">Tabla Morse</span></summary>
              <div class="tabla-morse" role="list">
                ${TABLA.map(([l, c]) => `<div role="listitem" aria-label="${l}: ${c.replace(/\./g, 'punto ').replace(/-/g, 'raya ')}"><b>${l}</b><span class="mono">${dibujar(c)}</span></div>`).join('')}
              </div>
              <p class="texto-2 nota">• = punto (corto) · − = raya (largo)</p>
            </details>
            <form autocomplete="off">
              <label class="etiqueta" for="resp-morse">Respuesta a la pregunta</label>
              <input id="resp-morse" class="campo" autocapitalize="characters" spellcheck="false" maxlength="40" placeholder="Vuestra respuesta" required>
              <button class="boton boton-ancho" type="submit">Comprobar</button>
            </form>
          </div>
        </div>`;
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
