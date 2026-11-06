/*
 * Prueba ¿BULO O VERDAD? (app). Varias afirmaciones (5 por defecto), cada una con BULO / VERDAD. «Comprobar»
 * cuando estén todas marcadas. Se supera acertándolas todas; si fallan, NO se dice cuántas ni cuáles y el botón se
 * bloquea 15 s. Al acertar se enseña una explicación breve de cada una.
 * Configuración en torneo.json → prueba.afirmaciones = [ "texto", … ] y prueba.leccion (frase final, opcional). La clave (privado/secretos.json) es el
 * patrón de b/v (por ejemplo «vbbvb») y las explicaciones van en secretos → «explicaciones»: [ "…", … ], que se
 * publican cifradas con la respuesta (solo se pueden leer después de acertar).
 */
(function () {
  'use strict';
  const GK = window.GK;

  GK.pruebas.registrar('bulo_verdad', {
    titulo: '¿Bulo o verdad?',
    montar(contenedor, ctx) {
      const P = ctx.estacion.prueba;
      const afirmaciones = (P.afirmaciones || []).map((a) => (typeof a === 'string' ? a : a.texto));
      const marcas = Array(afirmaciones.length).fill(null);
      contenedor.innerHTML = `
        <div class="reto">
          <div class="reto-cuerpo">
            <p class="reto-intro">Nos llegan estas noticias del espacio.<br>¿Cuáles son <b>bulos</b> y cuáles son <b>verdad</b>?</p>
            <ol class="bulos">
              ${afirmaciones.map((a, i) => `
                <li class="bulo" data-i="${i}">
                  <p>${GK.html(a)}</p>
                  <p class="parte-cab" aria-hidden="true">${GK.icono('satelite')} Parte ${i + 1} de ${afirmaciones.length} · noticias de la misión</p>
                  <div class="bulo-botones" role="radiogroup" aria-label="Afirmación ${i + 1}">
                    <button type="button" role="radio" aria-checked="false" class="bulo-b b-bulo" data-v="b">Bulo</button>
                    <button type="button" role="radio" aria-checked="false" class="bulo-b b-verdad" data-v="v">Verdad</button>
                  </div>
                  <p class="bulo-expl oculto"></p>
                </li>`).join('')}
            </ol>
            <p class="texto-2 geo-falta" id="bulo-falta"></p>
            <button class="boton boton-ancho" type="button" id="bulo-comprobar" disabled>Comprobar</button>
          </div>
        </div>`;
      const boton = contenedor.querySelector('#bulo-comprobar');
      const falta = contenedor.querySelector('#bulo-falta');
      let esperando = false;
      let hecho = false;
      const actualizar = () => {
        const n = marcas.filter((x) => x).length;
        boton.disabled = esperando || n < afirmaciones.length;
        falta.textContent = n < afirmaciones.length ? `Marcadas ${n} de ${afirmaciones.length}` : '';
      };
      contenedor.querySelectorAll('.bulo').forEach((li) => li.querySelectorAll('.bulo-b').forEach((b) => b.addEventListener('click', () => {
        if (hecho) return;
        marcas[Number(li.dataset.i)] = b.dataset.v;
        li.dataset.marca = b.dataset.v; // mueve el interruptor
        li.querySelectorAll('.bulo-b').forEach((x) => {
          x.classList.toggle('elegida', x === b);
          x.setAttribute('aria-checked', String(x === b));
        });
        ctx.ayuda('');
        actualizar();
      })));
      boton.addEventListener('click', async () => {
        if (hecho) return ctx.continuar();
        const respuesta = marcas.join('');
        boton.disabled = true;
        if (await ctx.intentar(respuesta, { quedarse: true })) {
          hecho = true;
          let expl = [];
          if (P.explicacionesCifradas) {
            try { expl = JSON.parse(await GK.descifrar(P.explicacionesCifradas, respuesta, ctx.estacion.sal)) || []; } catch (e) { expl = []; }
          }
          contenedor.querySelectorAll('.bulo').forEach((li, i) => {
            li.classList.add(marcas[i] === 'b' ? 'es-bulo' : 'es-verdad');
            const p = li.querySelector('.bulo-expl');
            if (expl[i]) { p.textContent = expl[i]; p.classList.remove('oculto'); }
          });
          falta.innerHTML = `<span class="ok-suave">¡Todas correctas!${P.leccion ? ' ' + GK.html(P.leccion) : ''}</span>`;
          boton.textContent = 'Continuar';
          boton.disabled = false;
          return;
        }
        esperando = true;
        falta.innerHTML = '<span class="error-suave">Alguna no es correcta.</span>';
        await ctx.esperar(15, boton);
        esperando = false;
        actualizar();
      });
      actualizar();
    },
  });
})();
