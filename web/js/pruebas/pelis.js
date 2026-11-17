/*
 * Prueba PELIS ESPACIALES (app). Cada equipo recibe 6 películas contadas con emojis (privado/bancos.json → pelis; ahora
 * las mismas para todos, con «lista_fija»). El equipo escribe el título de cada una y un único botón las comprueba,
 * con ✓ o ✗ en cada película. Sin imágenes de las películas (derechos de autor): solo emojis.
 *
 * Cada película tiene SU PISTA (prueba.peliculas[i].pista) en un botón «Pista» dentro de su tarjeta, que se activa
 * 45 s después de entrar en la prueba (con cuenta atrás). Sin penalización. No hay pista general de la estación.
 *
 * Títulos mal escritos: valen si se parecen mucho (GK.nombreParecido, la misma regla que «¿Quién soy?»). Para poder
 * comparar por parecido, el móvil necesita los títulos: van OFUSCADOS, como las palabras del Wordle
 * (prueba.peliculas[i].respuestas + salRespuestas → { v: [canónico, …otros que valen], no: [parecidos que no valen] }).
 * Un título que se parece se cambia por el canónico, que abre el sello de su trozo de clave; la clave del equipo es la
 * unión de los trozos (la misma que antes en Firebase). Sin espera tras fallar: un título no se acierta al azar.
 */
(function () {
  'use strict';
  const GK = window.GK;
  const NUMEROS = ['', 'una', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho'];
  const ESPERA_PISTA = 45; // segundos desde que se entra en la prueba

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
      const respuestas = pelis.map((p) => (p.respuestas ? GK.respuestasOfuscadas(p.respuestas, p.salRespuestas) : { v: [], no: [] }));
      contenedor.innerHTML = `
        <div class="reto">
          <div class="reto-cuerpo">
            <form class="partes partes-entradas" autocomplete="off" novalidate>
              ${pelis.map((p, i) => `
                <section class="parte entrada" data-i="${i}">
                  <div class="entrada-talon" aria-hidden="true"><b>${i + 1}</b></div>
                  <div class="parte-cab">
                    <label class="parte-titulo" for="peli-${i}">Película ${i + 1}</label>
                    <span class="parte-marca" aria-live="polite"></span>
                  </div>
                  <p class="peli-emojis" role="img" aria-label="Emojis de la película ${i + 1}">${(p.emojis || []).map((e) => `<span>${GK.html(e)}</span>`).join('')}</p>
                  <input id="peli-${i}" class="campo" spellcheck="false" autocapitalize="sentences" maxlength="60" placeholder="Título de la película">
                  ${p.pista ? `<div class="peli-pista" data-i="${i}" aria-live="polite"></div>` : ''}
                </section>`).join('')}
              <button class="boton boton-ancho" type="submit" id="pelis-comprobar">Comprobar</button>
            </form>
          </div>
        </div>`;
      GK.formularioPartes({
        ctx, contenedor, guardado: `pelis:${ctx.equipo.id}:${ctx.estacion.id}`, sellos: pelis.map((p) => p.sellos),
        // Si se parece mucho a un título que vale, se comprueba el canónico (abre el sello); si no, tal cual (fallará)
        limpiar: (texto, i) => (GK.nombreParecido(texto, respuestas[i].v, respuestas[i].no) ? respuestas[i].v[0] : texto),
        nombre: 'película', consejo: 'decid en voz alta lo que cuenta cada emoji.',
      });

      // ---------- Una pista por película, a los 45 s de entrar (se recuerda en el móvil) ----------
      const clavePistas = `pelis-pistas:${ctx.equipo.id}:${ctx.estacion.id}`;
      const estado = GK.leer(clavePistas, null) || {};
      if (!estado.inicio) estado.inicio = Date.now();
      if (!Array.isArray(estado.vistas)) estado.vistas = [];
      GK.guardar(clavePistas, estado);
      const cajas = [...contenedor.querySelectorAll('.peli-pista')];
      let id = null;
      const pintar = () => {
        const falta = Math.ceil((estado.inicio + ESPERA_PISTA * 1000 - Date.now()) / 1000);
        cajas.forEach((caja) => {
          const i = Number(caja.dataset.i);
          if (estado.vistas.includes(i)) {
            if (!caja.querySelector('.peli-pista-texto')) {
              caja.innerHTML = `<p class="peli-pista-texto"><span class="antetitulo">${GK.icono('bombilla')} Pista</span> ${GK.html(pelis[i].pista)}</p>`;
            }
            return;
          }
          let b = caja.querySelector('button');
          if (!b) {
            caja.innerHTML = `<button type="button" class="boton-sec boton-ancho boton-pista peli-pista-b">${GK.icono('bombilla')} <span></span></button>`;
            b = caja.querySelector('button');
            b.addEventListener('click', () => {
              if (!estado.vistas.includes(i)) estado.vistas.push(i);
              GK.guardar(clavePistas, estado);
              pintar();
            });
          }
          b.disabled = falta > 0;
          b.querySelector('span').textContent = falta > 0 ? `Pista en 0:${String(falta).padStart(2, '0')}` : 'Pista';
          b.setAttribute('aria-label', falta > 0 ? `Pista de la película ${i + 1} disponible en ${falta} segundos` : `Ver la pista de la película ${i + 1}`);
        });
        if (falta <= 0 && id) { clearInterval(id); id = null; }
      };
      pintar();
      if (Date.now() < estado.inicio + ESPERA_PISTA * 1000) id = setInterval(pintar, 1000);
      return () => { if (id) clearInterval(id); };
    },
  });
})();
