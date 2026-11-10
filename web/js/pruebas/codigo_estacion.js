/*
 * Prueba de RELLENO: en cada estación hay escondida una etiqueta con un código (privado/imprimir.html →
 * «Etiquetas de código»). Al encontrarla, el equipo escribe el código. Sirve mientras diseñamos las pruebas
 * reales y como plan B para cualquier estación: no hace falta nadie de la organización allí.
 */
(function () {
  'use strict';
  const GK = window.GK;

  GK.pruebas.registrar('codigo_estacion', {
    titulo: 'Código de la estación',
    objetivo: 'Encontrad el código escondido en esta estación.',
    pasos: ['Buscad la etiqueta cerca', 'Escribid su código'],
    montar(contenedor, ctx) {
      contenedor.innerHTML = `
        <div class="reto">
          <div class="reto-cuerpo">
            <form class="form-codigo" autocomplete="off">
              <label class="etiqueta" for="codigo-estacion">Código de la estación</label>
              <input id="codigo-estacion" class="campo campo-codigo" inputmode="text" autocapitalize="characters"
                     spellcheck="false" maxlength="24" placeholder="······" required>
              <button class="boton boton-ancho" type="submit">Validar código</button>
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
        const ok = await ctx.intentar(campo.value);
        if (!ok) {
          boton.disabled = false;
          boton.textContent = 'Validar código';
          campo.select();
          ctx.ayuda('Ese código no es correcto. Revisad la etiqueta y probad otra vez.');
        }
      });
      setTimeout(() => campo.focus(), 50);
    },
  });
})();
