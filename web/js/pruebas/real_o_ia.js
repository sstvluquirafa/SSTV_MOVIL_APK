/*
 * Prueba ¿REAL O HECHA CON IA? (app). 4 fotos espaciales en cuadrícula: tocan la que creen FALSA y «Comprobar».
 * Fallo → el botón se bloquea 15 s. Al acertar se explica en una línea cómo se nota.
 * Configuración en torneo.json → prueba.imagenes = [{ src, credito }] (4). La clave (privado/secretos.json) es la
 * letra de la falsa (a–d) y la explicación va en secretos → «explicaciones»: [ "…" ] (se publica cifrada con la
 * respuesta: solo se puede leer después de acertar).
 */
(function () {
  'use strict';
  const GK = window.GK;
  const LETRAS = 'abcdefgh';

  GK.pruebas.registrar('real_o_ia', {
    titulo: '¿Real o IA?',
    montar(contenedor, ctx) {
      const P = ctx.estacion.prueba;
      const imagenes = P.imagenes || [];
      let elegida = null;
      contenedor.innerHTML = `
        <div class="reto">
          <div class="reto-cuerpo">
            <p class="reto-intro">Hemos recibido ${imagenes.length} fotos del espacio.<br>
              ${imagenes.length - 1} son <b>reales</b> y una está <b>hecha con IA</b>.<br>
              Tocad la falsa y pulsad Comprobar.</p>
            <div class="ia-rejilla" role="radiogroup" aria-label="¿Cuál está hecha con IA?">
              ${imagenes.map((im, i) => `
                <button type="button" class="ia-foto" role="radio" aria-checked="false" data-i="${i}">
                  <img src="${GK.html(im.src)}" alt="Foto ${LETRAS[i].toUpperCase()}" loading="lazy">
                  <span class="ia-letra">${LETRAS[i].toUpperCase()}</span>
                  ${im.credito ? `<span class="credito">${GK.html(im.credito)}</span>` : ''}
                </button>`).join('')}
            </div>
            <div id="ia-resultado"></div>
            <button class="boton boton-ancho" type="button" id="ia-comprobar" disabled>Comprobar</button>
          </div>
        </div>`;
      const boton = contenedor.querySelector('#ia-comprobar');
      const resultado = contenedor.querySelector('#ia-resultado');
      let esperando = false;
      let hecho = false;
      contenedor.querySelectorAll('.ia-foto').forEach((b) => b.addEventListener('click', () => {
        if (hecho) return;
        elegida = Number(b.dataset.i);
        contenedor.querySelectorAll('.ia-foto').forEach((x) => {
          x.classList.toggle('elegida', x === b);
          x.setAttribute('aria-checked', String(x === b));
        });
        boton.disabled = esperando;
        ctx.ayuda('');
      }));
      boton.addEventListener('click', async () => {
        if (hecho) return ctx.continuar();
        if (elegida == null) return;
        const respuesta = LETRAS[elegida];
        boton.disabled = true;
        if (await ctx.intentar(respuesta, { quedarse: true })) {
          hecho = true;
          let explicacion = '';
          if (P.explicacionesCifradas) {
            try { explicacion = (JSON.parse(await GK.descifrar(P.explicacionesCifradas, respuesta, ctx.estacion.sal)) || [])[0] || ''; } catch (e) { /* sin explicación */ }
          }
          contenedor.querySelector(`.ia-foto[data-i="${elegida}"]`).classList.add('acierto');
          resultado.innerHTML = `<div class="aviso aviso-ok"><b>¡Bien visto! La ${respuesta.toUpperCase()} está hecha con IA.</b>${explicacion ? `<br>${GK.html(explicacion)}` : ''}</div>`;
          boton.textContent = 'Continuar';
          boton.disabled = false;
          boton.focus();
          return;
        }
        esperando = true;
        await ctx.esperar(15, boton);
        esperando = false;
        boton.disabled = elegida == null;
      });
    },
  });
})();
