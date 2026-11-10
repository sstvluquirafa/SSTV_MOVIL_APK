/*
 * Prueba BINARIO (papel + app). En el cartel hay filas de 5 bombillas (encendida = 1, apagada = 0): cada fila es
 * un número en binario y cada número una letra (A=1 … Z=26). Las filas van en torneo.json → prueba.cartel.
 * En la app, solo la ayuda (valores 16-8-4-2-1 y el alfabeto numerado) y el campo para la palabra.
 * La palabra es la «clave» de la estación en privado/secretos.json.
 */
(function () {
  'use strict';
  const GK = window.GK;
  const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  GK.pruebas.registrar('binario', {
    titulo: 'Binario',
    objetivo: 'Convertid las bombillas en una palabra.',
    pasos: ['Cada fila es un número', 'Cada número es una letra', 'Escribid la palabra'],
    montar(contenedor, ctx) {
      contenedor.innerHTML = `
        <div class="reto">
          <div class="reto-cuerpo">
            <p class="nota-prueba">Bombilla encendida = 1 · apagada = 0. Cada una vale lo que pone encima.</p>
            <div class="placa" role="img" aria-label="Ejemplo: encendidos los LED que valen 8, 2 y 1: 8 más 2 más 1 son 11, la letra K">
              <p class="placa-rotulo mono" aria-hidden="true">GranaSAT · LED de estado</p>
              <div class="bin-fila" aria-hidden="true">${[16, 8, 4, 2, 1].map((v, i) => `<div class="bin-col"><span class="mono bin-valor">${v}</span><span class="led${[8, 2, 1].includes(v) ? ' on' : ''}"></span><span class="mono led-nombre">D${i + 1}</span></div>`).join('')}</div>
              <p class="placa-texto" aria-hidden="true"><b>Ejemplo:</b> encendidos 8, 2 y 1 → 8 + 2 + 1 = <b>11</b> → <b class="ambar">K</b></p>
            </div>
            <p class="nota-prueba">Cada número es una letra: A=1, B=2 … Z=26.</p>
            <div class="abc-numerado" aria-label="Alfabeto numerado">
              ${ABC.split('').map((l, i) => `<span><b>${l}</b><i class="mono">${i + 1}</i></span>`).join('')}
            </div>
            <form autocomplete="off">
              <label class="etiqueta" for="resp-bin">La palabra</label>
              <input id="resp-bin" class="campo campo-codigo" autocapitalize="characters" spellcheck="false" maxlength="20" placeholder="····" required>
              <button class="boton boton-ancho" type="submit">Comprobar</button>
            </form>
          </div>
        </div>`;
      const form = contenedor.querySelector('form');
      const campo = contenedor.querySelector('input');
      const filas = (ctx.estacion.prueba.cartel || []).length;
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const boton = form.querySelector('button');
        boton.disabled = true;
        boton.textContent = 'Comprobando…';
        if (await ctx.intentar(campo.value)) return;
        boton.disabled = false;
        boton.textContent = 'Comprobar';
        campo.select();
        const n = GK.normalizar(campo.value).length;
        ctx.ayuda(filas && n !== filas
          ? `Todavía no. Fijaos: el cartel tiene ${filas} filas, así que la palabra tiene ${filas} letras.`
          : 'Todavía no. Repasad cada fila: sumad solo los valores de las bombillas encendidas.');
      });
    },
  });
})();
