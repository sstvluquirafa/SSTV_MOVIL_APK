/*
 * Prueba ¿REAL O HECHA CON IA? (app). 4 fotos espaciales en cuadrícula: tocan la que creen FALSA y «Comprobar».
 * Fallo → el botón se bloquea 15 s. Al acertar se explica en una línea cómo se nota.
 * Configuración en torneo.json → prueba.imagenes = [{ src }] (4, con nombres neutros) y prueba.nota (texto bajo las
 * fotos). La clave (privado/secretos.json) es la letra de la falsa (a–d). En secretos → «explicaciones» van
 * [ explicación, [crédito de cada foto] ], publicadas cifradas con la respuesta: solo se leen después de acertar.
 * Así ni el nombre del archivo ni el crédito delatan cuál es la falsa.
 * Si una imagen todavía no existe (la falsa la genera la organización), se ve «Foto en revelado» en su lugar.
 */
(function () {
  'use strict';
  const GK = window.GK;
  const LETRAS = 'abcdefgh';
  const PENDIENTE = 'assets/img/pruebas/ia-pendiente.svg';

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
                  <span class="diapo-ventana">
                    <img src="${GK.html(im.src)}" alt="Foto ${LETRAS[i].toUpperCase()}" loading="lazy" data-pendiente="${PENDIENTE}">
                    <span class="sello" aria-hidden="true">Revisada</span>
                  </span>
                  <span class="diapo-rotulo"><span class="ia-letra">${LETRAS[i].toUpperCase()}</span><span class="mono">Archivo</span></span>
                  <span class="credito">${im.credito ? GK.html(im.credito) : ''}</span>
                </button>`).join('')}
            </div>
            ${P.nota ? `<p class="credito ia-nota">${GK.html(P.nota)}</p>` : ''}
            <div id="ia-resultado"></div>
            <button class="boton boton-ancho" type="button" id="ia-comprobar" disabled>Comprobar</button>
          </div>
        </div>`;
      // Imagen que aún no existe → tarjeta «Foto en revelado» (nunca un hueco roto)
      contenedor.querySelectorAll('.ia-foto img').forEach((img) => {
        const sustituir = () => { if (!img.src.endsWith(PENDIENTE)) img.src = img.dataset.pendiente; };
        img.addEventListener('error', sustituir);
        if (img.complete && img.naturalWidth === 0) sustituir();
      });
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
          let creditos = [];
          if (P.explicacionesCifradas) {
            try {
              const datos = JSON.parse(await GK.descifrar(P.explicacionesCifradas, respuesta, ctx.estacion.sal)) || [];
              explicacion = typeof datos[0] === 'string' ? datos[0] : '';
              creditos = Array.isArray(datos[1]) ? datos[1] : [];
            } catch (e) { /* sin explicación */ }
          }
          contenedor.querySelectorAll('.ia-foto').forEach((f, i) => {
            if (creditos[i]) f.querySelector('.credito').textContent = creditos[i];
          });
          const nota = contenedor.querySelector('.ia-nota');
          if (nota && creditos.length) nota.remove();
          const acertada = contenedor.querySelector(`.ia-foto[data-i="${elegida}"]`);
          acertada.classList.add('acierto');
          acertada.querySelector('.sello').textContent = 'Hecha con IA';
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
