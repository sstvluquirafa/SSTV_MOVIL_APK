/*
 * Prueba GEOGUESSR DESDE SATÉLITE (app). Varias imágenes de satélite seguidas (3 por defecto), cada una con 4
 * opciones. Al final, «Comprobar». Se supera acertándolas todas; si fallan NO se dice cuál está mal y el botón se
 * bloquea 15 s. Configuración en torneo.json → prueba.imagenes = [{ src, credito, opciones: [4 textos] }].
 * La clave (privado/secretos.json) son las letras de las correctas en orden, por ejemplo «cab».
 * Las imágenes van en web/assets/img/pruebas/ (y en ARCHIVOS de sw.js).
 */
(function () {
  'use strict';
  const GK = window.GK;
  const LETRAS = 'abcdefgh';

  GK.pruebas.registrar('geoguessr', {
    titulo: 'GeoGuessr desde satélite',
    montar(contenedor, ctx) {
      const imagenes = ctx.estacion.prueba.imagenes || [];
      const elegidas = Array(imagenes.length).fill(null);
      contenedor.innerHTML = `
        <div class="ventana">
          <div class="ventana-barra"><span class="puntos"><i></i><i></i><i></i></span><span>RX_SATELITE · EST_${GK.html(ctx.estacion.letra)}</span></div>
          <div class="ventana-cuerpo">
            <p class="terminal">&gt; Nuestro satélite ha hecho ${imagenes.length} fotos desde el espacio.<br>
              &gt; ¿Dónde está cada una? Elegid una opción en cada foto y pulsad <b>Comprobar</b>.</p>
            ${imagenes.map((im, i) => `
              <figure class="geo-foto">
                <div class="geo-cab"><span class="chip chip-ambar">FOTO ${i + 1} DE ${imagenes.length}</span></div>
                <img src="${GK.html(im.src)}" alt="Foto ${i + 1} tomada desde un satélite" loading="lazy">
                ${im.credito ? `<figcaption class="credito">${GK.html(im.credito)}</figcaption>` : ''}
                <div class="opciones" role="radiogroup" aria-label="¿Dónde está la foto ${i + 1}?">
                  ${(im.opciones || []).map((o, j) => `<button type="button" role="radio" aria-checked="false" class="opcion" data-i="${i}" data-j="${j}"><span class="opcion-letra">${LETRAS[j].toUpperCase()}</span>${GK.html(o)}</button>`).join('')}
                </div>
              </figure>`).join('')}
            <p class="texto-2 geo-falta" id="geo-falta"></p>
            <button class="boton boton-ancho" type="button" id="geo-comprobar" disabled>Comprobar</button>
          </div>
        </div>`;
      const boton = contenedor.querySelector('#geo-comprobar');
      const falta = contenedor.querySelector('#geo-falta');
      let esperando = false;
      const actualizar = () => {
        const n = elegidas.filter((x) => x != null).length;
        boton.disabled = esperando || n < imagenes.length;
        falta.textContent = n < imagenes.length ? `Elegidas ${n} de ${imagenes.length}` : '';
      };
      contenedor.querySelectorAll('.opcion').forEach((b) => b.addEventListener('click', () => {
        const i = Number(b.dataset.i);
        elegidas[i] = Number(b.dataset.j);
        contenedor.querySelectorAll(`.opcion[data-i="${i}"]`).forEach((x) => {
          const sel = x === b;
          x.classList.toggle('elegida', sel);
          x.setAttribute('aria-checked', String(sel));
        });
        ctx.ayuda('');
        actualizar();
      }));
      boton.addEventListener('click', async () => {
        const respuesta = elegidas.map((j) => LETRAS[j]).join('');
        boton.disabled = true;
        if (await ctx.intentar(respuesta)) return;
        esperando = true;
        falta.innerHTML = '<span class="error-suave">Alguna no es correcta.</span>';
        await ctx.esperar(15, boton);
        esperando = false;
        falta.textContent = '';
        actualizar();
      });
      actualizar();
    },
  });
})();
