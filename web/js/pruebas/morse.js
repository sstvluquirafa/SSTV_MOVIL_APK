/*
 * Prueba MORSE (cartel + app). Cada equipo recibe 3 PREGUNTAS distintas en Morse, en la pantalla (las elige el
 * generador del banco de privado/bancos.json → morse). El cartel de la estación lleva la tabla Morse en grande; la
 * app la tiene también, plegada. Una respuesta por pregunta, con su ✓, y un único botón «Comprobar».
 *
 * Contenido de este equipo: prueba.preguntas = [{ morse, sellos, huellaPregunta }]. Cada respuesta válida abre un
 * «sello» con un trozo de la clave (ctx.parte); la clave del equipo es la unión de los 3 trozos. Si escriben la
 * pregunta descifrada en vez de la respuesta, se les avisa (huellaPregunta). Ninguna respuesta va en claro.
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
  /** «-. --- / -.. .» → un grupo por letra, con • y – grandes, y una «/» entre palabras (como en el cartel). */
  const dibujar = (morse) => String(morse).split('/').map((w) => w.trim().split(/\s+/)
    .map((l) => `<span class="mx-letra">${l.replace(/\./g, '•').replace(/-/g, '–')}</span>`).join(''))
    .join('<span class="mx-sep" aria-hidden="true">/</span>');
  const leerMorse = (morse) => String(morse).split('/').map((w) => w.trim().split(/\s+/).map(leer).join(', ')).join('. Palabra siguiente: ');
  const NUMEROS = ['', 'una', 'dos', 'tres', 'cuatro', 'cinco'];

  GK.pruebas.registrar('morse', {
    titulo: 'Código Morse',
    objetivo: (P) => `Descifrad las ${NUMEROS[(P.preguntas || []).length] || (P.preguntas || []).length} preguntas en Morse y respondedlas.`,
    pasos: (P) => ['Traducid con la tabla del cartel', 'Responded cada pregunta', `Comprobad las ${NUMEROS[(P.preguntas || []).length] || ''}`.trim()],
    montar(contenedor, ctx) {
      const P = ctx.estacion.prueba;
      const preguntas = P.preguntas || [];
      if (!preguntas.length) {
        contenedor.innerHTML = '<div class="aviso aviso-error">Falta configurar las preguntas de esta prueba. Avisad a la organización.</div>';
        return;
      }
      // Lo escrito se guarda en el móvil: si salen de la pantalla, no lo pierden.
      const claveGuardado = `morse:${ctx.equipo.id}:${ctx.estacion.id}`;
      contenedor.innerHTML = `
        <div class="reto">
          <div class="reto-cuerpo">
            <details class="radio-panel radio-plegable">
              <summary class="radio-cab">
                <span class="radio-titulo">Tabla Morse</span>
                <span class="radio-leyenda" aria-hidden="true"><i class="p-punto"></i> corto <i class="p-raya"></i> largo</span>
              </summary>
              <div class="tabla-morse">
                ${TABLA.map(([l, c]) => `<button type="button" class="tecla-morse" data-c="${c}" aria-label="${l}: ${leer(c)}"><b>${l}</b><span class="pulsos" aria-hidden="true">${pulsos(c)}</span></button>`).join('')}
              </div>
              <p class="radio-nota">La misma que en el cartel. Tocad una letra para sentir su ritmo.</p>
            </details>
            <form class="partes" autocomplete="off" novalidate>
              ${preguntas.map((q, i) => `
                <section class="parte" data-i="${i}">
                  <div class="parte-cab">
                    <label class="parte-titulo" for="resp-morse-${i}">Pregunta ${i + 1}</label>
                    <span class="parte-marca" aria-live="polite"></span>
                  </div>
                  <p class="mx" role="img" aria-label="Pregunta ${i + 1} en Morse: ${GK.html(leerMorse(q.morse))}">${dibujar(q.morse)}</p>
                  <input id="resp-morse-${i}" class="campo" autocapitalize="characters" spellcheck="false" maxlength="40" placeholder="Respuesta">
                </section>`).join('')}
              <button class="boton boton-ancho" type="submit" id="morse-comprobar">Comprobar</button>
            </form>
          </div>
        </div>`;
      contenedor.querySelectorAll('.tecla-morse').forEach((b) => b.addEventListener('click', () => {
        try { if (navigator.vibrate) navigator.vibrate(patron(b.dataset.c)); } catch (e) { /* sin vibración */ }
        b.classList.remove('emitiendo'); void b.offsetWidth; b.classList.add('emitiendo');
      }));

      GK.formularioPartes({
        ctx, contenedor, guardado: claveGuardado, sellos: preguntas.map((q) => q.sellos), nombre: 'respuesta',
        consejo: 'repasadlas letra a letra con la tabla.',
        // ¿Han escrito la pregunta descifrada en vez de la respuesta?
        async extra(textos, trozos) {
          for (let i = 0; i < textos.length; i++) {
            if (!trozos[i] && preguntas[i].huellaPregunta && (await ctx.coincide(textos[i], preguntas[i].huellaPregunta))) {
              return `¡Bien descifrada la pregunta ${i + 1}! Pero eso es la pregunta: ¿cuál es la respuesta?`;
            }
          }
          return null;
        },
      });
    },
  });
})();
