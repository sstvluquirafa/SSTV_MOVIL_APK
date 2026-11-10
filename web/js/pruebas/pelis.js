/*
 * Prueba PELIS ESPACIALES (app). Cada equipo recibe 6 películas contadas con emojis (3 fáciles, 2 medias y 1 difícil,
 * del banco de privado/bancos.json → pelis). El equipo escribe el título de cada una y un único botón las comprueba,
 * con ✓ o ✗ en cada película. Sin imágenes de las películas (derechos de autor): solo emojis.
 *
 * Contenido de este equipo: prueba.peliculas = [{ emojis, sellos }]. Cada título válido (sin artículo al principio)
 * abre un sello con un trozo de la clave; la clave del equipo es la unión de los trozos. Ningún título va en claro.
 * Sin espera tras fallar: un título escrito no se acierta al azar.
 */
(function () {
  'use strict';
  const GK = window.GK;
  const NUMEROS = ['', 'una', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho'];

  /**
   * Igual que normalizar_titulo() en generar_torneo.py: como GK.normalizar, pero quitando antes un artículo al
   * principio («el», «la», «los», «las», «the»). «The Martian», «the martian» y «Martian» quedan igual.
   */
  function tituloLimpio(texto) {
    const t = String(texto ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/^[^a-z0-9]+/, '')
      .replace(/^(el|la|los|las|the)\s+/, '');
    return GK.normalizar(t);
  }

  GK.pruebas.registrar('pelis', {
    titulo: 'Pelis espaciales',
    objetivo: (P) => `Adivinad las ${NUMEROS[(P.peliculas || []).length] || (P.peliculas || []).length} películas contadas con emojis.`,
    pasos: ['Mirad los emojis', 'Escribid cada título', 'Comprobad'],
    montar(contenedor, ctx) {
      const pelis = ctx.estacion.prueba.peliculas || [];
      if (!pelis.length) {
        contenedor.innerHTML = '<div class="aviso aviso-error">Falta configurar las películas de esta prueba. Avisad a la organización.</div>';
        return;
      }
      contenedor.innerHTML = `
        <div class="reto">
          <div class="reto-cuerpo">
            <form class="partes" autocomplete="off" novalidate>
              ${pelis.map((p, i) => `
                <section class="parte" data-i="${i}">
                  <div class="parte-cab">
                    <label class="parte-titulo" for="peli-${i}">Película ${i + 1}</label>
                    <span class="parte-marca" aria-live="polite"></span>
                  </div>
                  <p class="peli-emojis" role="img" aria-label="Emojis de la película ${i + 1}">${(p.emojis || []).map((e) => `<span>${GK.html(e)}</span>`).join('')}</p>
                  <input id="peli-${i}" class="campo" spellcheck="false" autocapitalize="sentences" maxlength="60" placeholder="Título de la película">
                </section>`).join('')}
              <button class="boton boton-ancho" type="submit" id="pelis-comprobar">Comprobar</button>
            </form>
          </div>
        </div>`;
      GK.formularioPartes({
        ctx, contenedor, guardado: `pelis:${ctx.equipo.id}:${ctx.estacion.id}`, sellos: pelis.map((p) => p.sellos),
        limpiar: tituloLimpio, nombre: 'película', consejo: 'decid en voz alta lo que cuenta cada emoji.',
      });
    },
  });
})();
