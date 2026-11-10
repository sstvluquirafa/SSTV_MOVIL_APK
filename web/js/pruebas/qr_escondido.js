/*
 * Prueba QR ESCONDIDO (papel + app). Alrededor del cartel hay 3 QR escondidos (D1, D2, D3), con su pista de
 * escondite en torneo.json → prueba.escondites. Los QR impresos son los mismos para todos los equipos (solo llevan un
 * texto, por ejemplo GK-QR-7HF2K9-1, guardado en privado/secretos.json → qrs), pero cada QR da a CADA EQUIPO una
 * palabra distinta: al escanearlo, su texto abre el sello «escaneo» de ese QR y sale la palabra.
 *
 * Se pueden escanear en cualquier orden y con cualquier móvil del equipo. Los móviles no se sincronizan: cada uno
 * apunta las palabras de los QR que ha escaneado, y el equipo junta las 3 hablando. Las 3 palabras, en orden D1-D2-D3,
 * se escriben en cualquier móvil (con ✓ en cada una) y su unión es la clave.
 */
(function () {
  'use strict';
  const GK = window.GK;

  GK.pruebas.registrar('qr_escondido', {
    titulo: 'QR escondido',
    objetivo: (P) => `Encontrad los ${(P.qrs || []).length === 3 ? 'tres' : (P.qrs || []).length} QR escondidos cerca de aquí.`,
    pasos: ['Leed las pistas', 'Repartíos la búsqueda', `Juntad las tres palabras`],
    montar(contenedor, ctx) {
      const P = ctx.estacion.prueba;
      const qrs = P.qrs || [];
      const escondites = P.escondites || [];
      if (!qrs.length) {
        contenedor.innerHTML = '<div class="aviso aviso-error">Falta configurar los QR de esta prueba. Avisad a la organización.</div>';
        return;
      }
      // Las palabras que ha escaneado ESTE móvil (por QR), para no perderlas al salir de la pantalla
      const claveEscaneos = `qr:${ctx.equipo.id}:${ctx.estacion.id}`;
      const escaneadas = GK.leer(claveEscaneos, {});
      contenedor.innerHTML = `
        <div class="reto">
          <div class="reto-cuerpo">
            <div class="radar-caja" id="qr-radar">
              <div class="radar-baliza" aria-hidden="true"><i class="radar-barrido"></i><i class="radar-eco"></i></div>
              <p class="radar-texto" id="qr-cuenta"></p>
            </div>
            <div id="qr-visor"></div>
            <button class="boton boton-ancho boton-grande" type="button" id="qr-escanear">${GK.icono('qr')} Escanear un QR escondido</button>
            <button class="boton-sec boton-ancho oculto" type="button" id="qr-parar">Cancelar</button>
            <form class="partes" autocomplete="off" novalidate>
              ${qrs.map((q, i) => `
                <section class="parte" data-i="${i}">
                  <div class="parte-cab">
                    <label class="parte-titulo" for="resp-qr-${i}">QR D${i + 1}</label>
                    <span class="parte-marca" aria-live="polite"></span>
                  </div>
                  <p class="qr-escondite">${GK.html(escondites[i] || 'Buscadlo cerca del cartel.')}</p>
                  <p class="qr-escaneado mono${escaneadas[i] ? '' : ' oculto'}" id="qr-visto-${i}">Escaneado en este móvil: <b>${GK.html(escaneadas[i] || '')}</b></p>
                  <input id="resp-qr-${i}" class="campo campo-palabra" autocapitalize="characters" spellcheck="false" maxlength="20" placeholder="Palabra del QR D${i + 1}">
                </section>`).join('')}
              <button class="boton boton-ancho" type="submit" id="qr-comprobar">Comprobar las palabras</button>
            </form>
            <details class="plegable-simple">
              <summary>¿No funciona la cámara?</summary>
              <p class="texto-2">Abrid el QR con la app de cámara del móvil: os mostrará un texto. Escribidlo aquí.</p>
              <form autocomplete="off" id="qr-manual">
                <label class="etiqueta" for="texto-qr">Texto del QR</label>
                <input id="texto-qr" class="campo campo-codigo" autocapitalize="characters" spellcheck="false" maxlength="30" placeholder="GK-QR-······" required>
                <button class="boton-sec boton-ancho" type="submit">Leer el QR</button>
              </form>
            </details>
          </div>
        </div>`;
      const visor = contenedor.querySelector('#qr-visor');
      const bEscanear = contenedor.querySelector('#qr-escanear');
      const bParar = contenedor.querySelector('#qr-parar');
      const radar = contenedor.querySelector('#qr-radar');
      const cuenta = contenedor.querySelector('#qr-cuenta');
      const partes = GK.formularioPartes({
        ctx, contenedor, guardado: `qr-palabras:${ctx.equipo.id}:${ctx.estacion.id}`, sellos: qrs.map((q) => q.sellos),
        nombre: 'palabra', consejo: 'cada palabra va en su QR (D1, D2, D3).',
      });
      const contar = () => {
        const n = Object.keys(escaneadas).length;
        cuenta.textContent = n ? `Este móvil ha encontrado ${n} de ${qrs.length}` : 'Buscando las balizas…';
      };
      contar();

      /** Texto leído de un QR → ¿es uno de los escondidos? Si lo es, enseña la palabra de este equipo y la apunta. */
      const leerQR = async (texto) => {
        if (String(texto).includes('#/')) { ctx.ayuda('Ese es el QR de una estación, no uno de los escondidos.'); return false; }
        for (let i = 0; i < qrs.length; i++) {
          const palabra = await ctx.parte(texto, [qrs[i].escaneo]);
          if (!palabra) continue;
          escaneadas[i] = palabra;
          GK.guardar(claveEscaneos, escaneadas);
          const visto = contenedor.querySelector(`#qr-visto-${i}`);
          visto.querySelector('b').textContent = palabra;
          visto.classList.remove('oculto');
          if (!partes.campos[i].value) {
            partes.campos[i].value = palabra;
            partes.campos[i].dispatchEvent(new Event('input'));
          }
          contar();
          ctx.ayuda(`¡QR D${i + 1} encontrado! Su palabra es «${palabra}».`, 'ok');
          return true;
        }
        ctx.ayuda('Ese no es uno de los QR escondidos de esta estación. Seguid buscando.');
        return false;
      };

      let parar = null;
      let activo = false;
      const cerrar = () => {
        activo = false;
        if (parar) { parar(); parar = null; }
        visor.innerHTML = '';
        bEscanear.classList.remove('oculto');
        bParar.classList.add('oculto');
        radar.classList.remove('oculto');
      };
      bEscanear.onclick = async () => {
        ctx.ayuda('');
        bEscanear.classList.add('oculto');
        bParar.classList.remove('oculto');
        radar.classList.add('oculto'); // el radar deja sitio al escáner
        activo = true;
        const f = await GK.escanear(visor, async (texto) => { cerrar(); await leerQR(texto); }, (error) => { cerrar(); ctx.ayuda(error); });
        // Si han cancelado (o salido) mientras se abría la cámara, se apaga
        if (activo) parar = f; else f();
      };
      bParar.onclick = cerrar;

      const manual = contenedor.querySelector('#qr-manual');
      manual.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const b = manual.querySelector('button');
        b.disabled = true;
        if (await leerQR(manual.querySelector('input').value)) manual.reset();
        b.disabled = false;
      });
      return cerrar;
    },
  });
})();
