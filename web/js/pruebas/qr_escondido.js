/*
 * Prueba QR ESCONDIDO (papel + app). El cartel de la estación da una pista de texto de dónde está escondido un QR
 * pequeño (torneo.json → prueba.escondite). Ese QR solo lleva un texto (por ejemplo GK-QR-7HF2K9), generado por el
 * script y guardado como «clave» de la estación en privado/secretos.json. Se escanea desde aquí.
 */
(function () {
  'use strict';
  const GK = window.GK;

  GK.pruebas.registrar('qr_escondido', {
    titulo: 'QR escondido',
    montar(contenedor, ctx) {
      contenedor.innerHTML = `
        <div class="reto">
          <div class="reto-cuerpo">
            <p class="reto-intro">Cerca de esta estación hay un <b>QR escondido</b>.<br>
              El cartel os dice dónde buscar.<br>
              Encontradlo y escaneadlo <b>desde aquí</b>.</p>
            <div id="qr-visor"></div>
            <button class="boton boton-ancho boton-grande" type="button" id="qr-escanear">${GK.icono('qr')} Escanear QR escondido</button>
            <button class="boton-sec boton-ancho oculto" type="button" id="qr-parar">Cancelar</button>
            <details class="plegable-simple">
              <summary>¿No funciona la cámara?</summary>
              <p class="texto-2">Abrid el QR con la app de cámara del móvil: os mostrará un texto. Escribidlo aquí.</p>
              <form autocomplete="off">
                <label class="etiqueta" for="resp-qr">Texto del QR</label>
                <input id="resp-qr" class="campo campo-codigo" autocapitalize="characters" spellcheck="false" maxlength="30" placeholder="GK-QR-······" required>
                <button class="boton-sec boton-ancho" type="submit">Comprobar</button>
              </form>
            </details>
          </div>
        </div>`;
      const visor = contenedor.querySelector('#qr-visor');
      const bEscanear = contenedor.querySelector('#qr-escanear');
      const bParar = contenedor.querySelector('#qr-parar');
      let parar = null;
      let activo = false;
      const cerrar = () => {
        activo = false;
        if (parar) { parar(); parar = null; }
        visor.innerHTML = '';
        bEscanear.classList.remove('oculto');
        bParar.classList.add('oculto');
      };
      const comprobar = async (texto) => {
        // Un QR de otra estación o de la meta (lleva «#/») tampoco es este
        if (String(texto).includes('#/') || !(await ctx.intentar(texto))) {
          ctx.ayuda('Ese no es el QR escondido. Seguid buscando cerca de la estación.');
          return false;
        }
        return true;
      };
      bEscanear.onclick = async () => {
        ctx.ayuda('');
        bEscanear.classList.add('oculto');
        bParar.classList.remove('oculto');
        activo = true;
        const f = await GK.escanear(visor, async (texto) => {
          cerrar();
          await comprobar(texto);
        }, (error) => {
          cerrar();
          ctx.ayuda(error);
        });
        // Si han cancelado (o salido) mientras se abría la cámara, se apaga
        if (activo) parar = f; else f();
      };
      bParar.onclick = cerrar;

      const form = contenedor.querySelector('form');
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const b = form.querySelector('button');
        b.disabled = true;
        const ok = await comprobar(form.querySelector('input').value);
        if (!ok) b.disabled = false;
      });
      return cerrar;
    },
  });
})();
