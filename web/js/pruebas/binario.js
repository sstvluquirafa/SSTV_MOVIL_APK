/*
 * Prueba BINARIO (app). Cada equipo recibe 3 palabras (de 4, 5 y 6 letras, del banco de privado/bancos.json →
 * binario), dibujadas en la pantalla como placas de LED: una fila de 5 bombillas por letra (encendida = 1). Cada
 * fila es un número en binario y cada número una letra (A=1 … Z=26). Una respuesta por palabra, con su ✓.
 *
 * Contenido de este equipo: prueba.palabras = [{ filas: ['01100', …], sellos }]. La palabra buena abre un sello con
 * un trozo de la clave; la clave del equipo es la unión de los trozos. Las palabras no van en claro (las filas sí,
 * pero hay que descifrarlas: esa es la prueba).
 */
(function () {
  'use strict';
  const GK = window.GK;
  const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const VALORES = [16, 8, 4, 2, 1];
  const NUMEROS = ['', 'una', 'dos', 'tres', 'cuatro', 'cinco'];

  /** Placa de LED de una palabra: cabecera con los valores y una fila de bombillas por letra. */
  const placa = (filas, n) => `
    <div class="placa placa-palabra" role="img" aria-label="Palabra ${n}: ${filas.length} filas de bombillas. ${filas.map((f, i) => `Fila ${i + 1}: ${[...f].map((b, j) => (b === '1' ? VALORES[j] : null)).filter(Boolean).join(' más ') || 'ninguna'} encendida`).join('. ')}">
      <div class="bin-rejilla" aria-hidden="true">
        ${VALORES.map((v) => `<span class="mono bin-valor">${v}</span>`).join('')}
        ${filas.map((f) => [...f].map((b) => `<span class="led${b === '1' ? ' on' : ''}"></span>`).join('')).join('')}
      </div>
    </div>`;

  GK.pruebas.registrar('binario', {
    titulo: 'Binario',
    objetivo: (P) => `Convertid las bombillas en ${NUMEROS[(P.palabras || []).length] || (P.palabras || []).length} palabras.`,
    pasos: (P) => ['Cada fila es un número', 'Cada número es una letra', `Escribid las ${NUMEROS[(P.palabras || []).length] || ''} palabras`.replace('  ', ' ')],
    montar(contenedor, ctx) {
      const palabras = ctx.estacion.prueba.palabras || [];
      if (!palabras.length) {
        contenedor.innerHTML = '<div class="aviso aviso-error">Falta configurar las palabras de esta prueba. Avisad a la organización.</div>';
        return;
      }
      contenedor.innerHTML = `
        <div class="reto">
          <div class="reto-cuerpo">
            <p class="nota-prueba">Bombilla encendida = 1 · apagada = 0. Sumad lo que vale cada encendida. Ejemplo: 8 + 2 + 1 = 11 → K.</p>
            <form class="partes" autocomplete="off" novalidate>
              ${palabras.map((p, i) => `
                <section class="parte" data-i="${i}">
                  <div class="parte-cab">
                    <label class="parte-titulo" for="resp-bin-${i}">Palabra ${i + 1} · ${p.filas.length} letras</label>
                    <span class="parte-marca" aria-live="polite"></span>
                  </div>
                  ${placa(p.filas, i + 1)}
                  <input id="resp-bin-${i}" class="campo campo-codigo" autocapitalize="characters" spellcheck="false" maxlength="${p.filas.length + 4}" placeholder="${'·'.repeat(p.filas.length)}">
                </section>`).join('')}
              <button class="boton boton-ancho" type="submit" id="bin-comprobar">Comprobar</button>
            </form>
            <p class="nota-prueba">Cada número es una letra: A=1, B=2 … Z=26.</p>
            <div class="abc-numerado" aria-label="Alfabeto numerado">
              ${ABC.split('').map((l, i) => `<span><b>${l}</b><i class="mono">${i + 1}</i></span>`).join('')}
            </div>
          </div>
        </div>`;
      GK.formularioPartes({
        ctx, contenedor, guardado: `binario:${ctx.equipo.id}:${ctx.estacion.id}`, sellos: palabras.map((p) => p.sellos),
        nombre: 'palabra', consejo: 'sumad solo los valores de las bombillas encendidas de cada fila.',
      });
    },
  });
})();
