/*
 * Prueba ABRE LA CAJA FUERTE (app). Una caja con 3 ruedas de dígitos (0–9) y las pistas del acertijo
 * (torneo.json → prueba.pistas = [{ codigo: "632", texto: "Una cifra es correcta…" }]). Con el código correcto
 * (la «clave» en privado/secretos.json) la caja se abre. Sin espera tras fallo: probar los 1000 códigos no compensa.
 */
(function () {
  'use strict';
  const GK = window.GK;

  GK.pruebas.registrar('caja_fuerte', {
    titulo: 'Abre la caja fuerte',
    montar(contenedor, ctx) {
      const P = ctx.estacion.prueba;
      const n = Math.max(1, Math.min(6, Number(P.cifras) || 3));
      const ruedas = Array(n).fill(0);
      contenedor.innerHTML = `
        <div class="ventana">
          <div class="ventana-barra"><span class="puntos"><i></i><i></i><i></i></span><span>RX_CAJA · EST_${GK.html(ctx.estacion.letra)}</span></div>
          <div class="ventana-cuerpo">
            <p class="terminal">&gt; La caja fuerte tiene un código de <b>${n} cifras</b>.<br>&gt; Estas pistas os dirán cuál es:</p>
            <ul class="caja-pistas">
              ${(P.pistas || []).map((p) => `<li><span class="caja-cod mono" aria-label="Código ${GK.html(String(p.codigo).split('').join(' '))}">${String(p.codigo).split('').map((d) => `<i>${GK.html(d)}</i>`).join('')}</span><span>${GK.html(p.texto)}</span></li>`).join('')}
            </ul>
            <div class="caja" id="caja">
              <div class="caja-puerta">
                <div class="caja-ruedas">
                  ${ruedas.map((_, i) => `
                    <div class="rueda">
                      <button type="button" class="rueda-b" data-r="${i}" data-d="1" aria-label="Subir la cifra ${i + 1}">▲</button>
                      <output class="rueda-n mono" id="rueda-${i}" aria-label="Cifra ${i + 1}">0</output>
                      <button type="button" class="rueda-b" data-r="${i}" data-d="-1" aria-label="Bajar la cifra ${i + 1}">▼</button>
                    </div>`).join('')}
                </div>
                <div class="caja-pomo" aria-hidden="true"></div>
              </div>
              <div class="caja-interior" aria-hidden="true">${GK.icono('satelite')}</div>
            </div>
            <button class="boton boton-ancho" type="button" id="caja-abrir">Abrir la caja</button>
          </div>
        </div>`;
      const caja = contenedor.querySelector('#caja');
      const boton = contenedor.querySelector('#caja-abrir');
      contenedor.querySelectorAll('.rueda-b').forEach((b) => b.addEventListener('click', () => {
        const i = Number(b.dataset.r);
        ruedas[i] = (ruedas[i] + Number(b.dataset.d) + 10) % 10;
        contenedor.querySelector(`#rueda-${i}`).textContent = ruedas[i];
        ctx.ayuda('');
      }));
      // También con la rueda del ratón o deslizando el dedo arriba/abajo sobre la cifra
      contenedor.querySelectorAll('.rueda-n').forEach((o, i) => {
        let y0 = null;
        const mover = (d) => { ruedas[i] = (ruedas[i] + d + 10) % 10; o.textContent = ruedas[i]; };
        o.addEventListener('wheel', (ev) => { ev.preventDefault(); mover(ev.deltaY < 0 ? 1 : -1); }, { passive: false });
        o.addEventListener('pointerdown', (ev) => { y0 = ev.clientY; o.setPointerCapture(ev.pointerId); });
        o.addEventListener('pointermove', (ev) => {
          if (y0 == null) return;
          if (Math.abs(ev.clientY - y0) > 22) { mover(ev.clientY < y0 ? 1 : -1); y0 = ev.clientY; }
        });
        o.addEventListener('pointerup', () => { y0 = null; });
      });
      let temporizador = null;
      boton.addEventListener('click', async () => {
        boton.disabled = true;
        const codigo = ruedas.join('');
        if (await ctx.intentar(codigo, { quedarse: true })) {
          caja.classList.add('abierta');
          boton.textContent = '¡Abierta!';
          ctx.ayuda('¡Clic! La caja se abre…', 'ok');
          temporizador = setTimeout(() => ctx.continuar(), GK.menosMovimiento() ? 600 : 2000);
          return;
        }
        boton.disabled = false;
        caja.classList.remove('temblor'); void caja.offsetWidth; caja.classList.add('temblor');
        ctx.ayuda(`La caja no se abre con ${codigo}. Repasad las pistas una a una.`);
      });
      return () => clearTimeout(temporizador);
    },
  });
})();
