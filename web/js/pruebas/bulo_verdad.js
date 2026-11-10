/*
 * Prueba ¿BULO O VERDAD? (app). Cada equipo recibe 10 noticias (5 bulos y 5 verdades, del banco de 20 de
 * privado/bancos.json → bulo_verdad) en 2 rondas de 5. Cada noticia con BULO / VERDAD; «Comprobar» cuando estén todas
 * marcadas. Hay que acertar las 5 de una ronda para pasar a la siguiente; si fallan, NO se dice cuántas ni cuáles y
 * el botón se bloquea 15 s. Al acertar cada ronda se enseña una explicación breve de cada noticia.
 *
 * Contenido de este equipo: prueba.rondas = [{ afirmaciones, explicacionesCifradas, huella? }]. Las rondas
 * intermedias se comprueban con su huella (el patrón b/v acumulado: «vbbvv», «vbbvvbbvbv»…); las explicaciones de cada
 * ronda van cifradas con ese patrón, así que solo se leen tras acertar. La clave es el patrón de las dos rondas.
 */
(function () {
  'use strict';
  const GK = window.GK;

  GK.pruebas.registrar('bulo_verdad', {
    titulo: '¿Bulo o verdad?',
    objetivo: 'Separad los bulos de las verdades.',
    pasos: (P) => [`${(P.rondas || []).length === 2 ? 'Dos' : (P.rondas || []).length} rondas de ${((P.rondas || [])[0] || { afirmaciones: [] }).afirmaciones.length} noticias`, 'Marcad bulo o verdad', 'Acertad todas'],
    montar(contenedor, ctx) {
      const P = ctx.estacion.prueba;
      const rondas = P.rondas || [];
      if (!rondas.length) {
        contenedor.innerHTML = '<div class="aviso aviso-error">Falta configurar las noticias de esta prueba. Avisad a la organización.</div>';
        return;
      }
      // El patrón de las rondas ya acertadas se guarda en el móvil: si salen de la pantalla, no lo pierden
      const claveGuardado = `bulo:${ctx.equipo.id}:${ctx.estacion.id}`;
      const acertadas = GK.leer(claveGuardado, []);

      function montarRonda(r) {
        const R = rondas[r];
        const afirmaciones = R.afirmaciones || [];
        const ultima = r === rondas.length - 1;
        const marcas = Array(afirmaciones.length).fill(null);
        contenedor.innerHTML = `
          <div class="reto">
            <div class="reto-cuerpo">
              ${rondas.length > 1 ? `<p class="escotilla-paso mono">Ronda ${r + 1} de ${rondas.length}</p>` : ''}
              <ol class="bulos">
                ${afirmaciones.map((a, i) => `
                  <li class="bulo" data-i="${i}">
                    <p>${GK.html(a)}</p>
                    <p class="parte-cab" aria-hidden="true">${GK.icono('satelite')} Parte ${r * afirmaciones.length + i + 1} de ${rondas.reduce((s, x) => s + (x.afirmaciones || []).length, 0)} · noticias de la misión</p>
                    <div class="bulo-botones" role="radiogroup" aria-label="Noticia ${i + 1}">
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
          if (hecho) {
            if (ultima) return ctx.continuar();
            montarRonda(r + 1);
            window.scrollTo({ top: 0, behavior: GK.menosMovimiento() ? 'auto' : 'smooth' });
            return;
          }
          const acumulado = acertadas.slice(0, r).join('') + marcas.join('');
          boton.disabled = true;
          const ok = ultima
            ? await ctx.intentar(acumulado, { quedarse: true })
            : !!R.huella && (await ctx.coincide(acumulado, R.huella));
          if (ok) {
            hecho = true;
            if (ultima) GK.borrar(claveGuardado);
            else { acertadas[r] = marcas.join(''); GK.guardar(claveGuardado, acertadas); }
            let expl = [];
            if (R.explicacionesCifradas) {
              try { expl = JSON.parse(await GK.descifrar(R.explicacionesCifradas, acumulado, ctx.estacion.sal)) || []; } catch (e) { expl = []; }
            }
            contenedor.querySelectorAll('.bulo').forEach((li, i) => {
              li.classList.add(marcas[i] === 'b' ? 'es-bulo' : 'es-verdad');
              const p = li.querySelector('.bulo-expl');
              if (expl[i]) { p.textContent = expl[i]; p.classList.remove('oculto'); }
            });
            falta.innerHTML = ultima
              ? `<span class="ok-suave">¡Todas correctas!${P.leccion ? ' ' + GK.html(P.leccion) : ''}</span>`
              : '<span class="ok-suave">¡Ronda superada! Leed las explicaciones y seguid.</span>';
            boton.textContent = ultima ? 'Continuar' : 'Siguiente ronda';
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
      }

      // Se empieza por la primera ronda que falte por acertar
      let r = 0;
      while (r < rondas.length - 1 && acertadas[r]) r++;
      montarRonda(r);
    },
  });
})();
