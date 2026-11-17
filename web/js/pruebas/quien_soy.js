/*
 * Prueba ¿QUIÉN SOY? (app). Cinco personajes, uno debajo de otro, cada uno en su tarjeta con una silueta misteriosa
 * (dibujo propio). Cada personaje tiene 4 pistas, de más difícil a más fácil: la primera se ve al entrar y el botón
 * «Otra pista» se activa 20 s después de la anterior (con cuenta atrás). Sin penalización. Un campo y un botón
 * «Comprobar» por personaje, con su ✓ o fallo. Cuando están los cinco, la estación se completa sola.
 *
 * Igual para todos (privado/bancos.json → quien_soy). Los nombres se aceptan mal escritos con la MISMA regla que las
 * Pelis espaciales (GK.nombreParecido), así que el móvil necesita las respuestas: van OFUSCADAS, como las palabras del
 * Wordle (prueba.personajes[i].respuestas + salRespuestas → { v: [canónico, …otros que valen], no: […] }). La clave de
 * la estación es la unión de los nombres canónicos y la app la envía al acertar el quinto.
 *
 * El progreso (pistas desbloqueadas, aciertos y lo escrito) se guarda en el móvil por si se cierra la app.
 */
(function () {
  'use strict';
  const GK = window.GK;

  /** Silueta misteriosa (dibujo propio): busto con una interrogación en la cabeza. */
  const SILUETA = `<svg class="qs-silueta" viewBox="0 0 48 48" aria-hidden="true">
    <circle class="qs-fondo" cx="24" cy="24" r="23"/>
    <path class="qs-busto" d="M9.5,40.5 C10,31 16,28.5 24,28.5 C32,28.5 38,31 38.5,40.5 C34.5,44.5 29.5,46.5 24,46.5 C18.5,46.5 13.5,44.5 9.5,40.5 Z"/>
    <circle class="qs-busto" cx="24" cy="17.5" r="9"/>
    <text class="qs-interrogacion" x="24" y="22" text-anchor="middle">?</text>
  </svg>`;

  GK.pruebas.registrar('quien_soy', {
    titulo: '¿Quién soy?',
    objetivo: 'Adivinad quiénes son los cinco personajes.',
    pasos: ['Leed la pista', 'Pedid otra si no sale', 'Escribid el nombre'],
    montar(contenedor, ctx) {
      const P = ctx.estacion.prueba;
      const personajes = P.personajes || [];
      const respuestas = personajes.map((p) => GK.respuestasOfuscadas(p.respuestas, p.salRespuestas));
      if (!personajes.length || respuestas.some((r) => !r.v.length)) {
        contenedor.innerHTML = '<div class="aviso aviso-error">Falta configurar los personajes de esta prueba. Avisad a la organización.</div>';
        return;
      }
      const ESPERA = (Number(P.espera) || 20) * 1000;
      const claveGuardado = `quien:${ctx.equipo.id}:${ctx.estacion.id}`;
      const ahora = Date.now();
      const estado = GK.leer(claveGuardado, null) || {};
      if (!Array.isArray(estado.p) || estado.p.length !== personajes.length) {
        estado.p = personajes.map(() => ({ n: 1, t: ahora, ok: false, texto: '' }));
      }
      const guardar = () => GK.guardar(claveGuardado, estado);
      guardar();
      let terminado = false;

      contenedor.innerHTML = `
        <div class="reto">
          <div class="reto-cuerpo">
            <div class="partes qs-lista">
              ${personajes.map((p, i) => `
                <section class="parte qs" data-i="${i}" aria-labelledby="qs-t-${i}">
                  <div class="qs-cab">
                    ${SILUETA}
                    <div class="qs-titulo">
                      <h2 class="parte-titulo" id="qs-t-${i}">Personaje ${i + 1}</h2>
                      <span class="qs-progreso"></span>
                    </div>
                    <span class="parte-marca" aria-live="polite"></span>
                  </div>
                  <ol class="qs-pistas" aria-label="Pistas del personaje ${i + 1}"></ol>
                  <button type="button" class="boton-sec boton-ancho qs-otra">${GK.icono('bombilla')} <span></span></button>
                  <form class="qs-form" autocomplete="off" novalidate>
                    <label class="solo-lector" for="qs-${i}">Nombre del personaje ${i + 1}</label>
                    <input id="qs-${i}" class="campo" spellcheck="false" autocapitalize="words" maxlength="40" placeholder="¿Quién es?">
                    <button class="boton" type="submit">Comprobar</button>
                  </form>
                </section>`).join('')}
            </div>
          </div>
        </div>`;
      const tarjetas = [...contenedor.querySelectorAll('.qs')];

      /** Pinta una tarjeta: pistas desbloqueadas, puntos, botón «Otra pista» y estado (acertado / fallo). */
      function pintar(i, fallo) {
        const t = tarjetas[i];
        const e = estado.p[i];
        const pistas = personajes[i].pistas || [];
        const total = pistas.length;
        e.n = Math.max(1, Math.min(e.n, total));
        const lista = t.querySelector('.qs-pistas');
        if (lista.children.length !== e.n) {
          lista.innerHTML = pistas.slice(0, e.n).map((x, k) => `<li class="${k === e.n - 1 ? 'nueva' : ''}">${GK.html(x)}</li>`).join('');
        }
        const puntos = Array.from({ length: total }, (_, k) => `<i class="${k < e.n ? 'hecho' : ''}"></i>`).join('');
        t.querySelector('.qs-progreso').innerHTML = `<span class="progreso-puntos" aria-hidden="true">${puntos}</span>`
          + `<span class="solo-lector">Pista ${e.n} de ${total}</span>`;
        t.classList.toggle('acierto', e.ok);
        t.querySelector('.qs-interrogacion').textContent = e.ok ? '✓' : '?';
        t.classList.toggle('fallo', !e.ok && !!fallo);
        t.querySelector('.parte-marca').innerHTML = e.ok ? '<span aria-hidden="true">✓</span> Acertado'
          : fallo ? '<span aria-hidden="true">✗</span> Todavía no' : '';
        const campo = t.querySelector('.campo');
        campo.readOnly = e.ok;
        campo.setAttribute('aria-invalid', String(!e.ok && !!fallo));
        t.querySelector('.qs-form button').classList.toggle('oculto', e.ok);
        reloj(i);
      }

      /** Botón «Otra pista»: cuenta atrás de 20 s desde la pista anterior; se oculta con todas vistas o acertado. */
      function reloj(i) {
        const t = tarjetas[i];
        const e = estado.p[i];
        const b = t.querySelector('.qs-otra');
        const total = (personajes[i].pistas || []).length;
        if (e.ok || e.n >= total) { b.classList.add('oculto'); return; }
        b.classList.remove('oculto');
        const falta = Math.ceil((e.t + ESPERA - Date.now()) / 1000);
        b.disabled = falta > 0;
        b.querySelector('span').textContent = falta > 0 ? `Otra pista en 0:${String(falta).padStart(2, '0')}` : 'Otra pista';
      }

      tarjetas.forEach((t, i) => {
        const campo = t.querySelector('.campo');
        if (estado.p[i].texto) campo.value = estado.p[i].texto;
        campo.addEventListener('input', () => {
          estado.p[i].texto = campo.value;
          guardar();
          if (!estado.p[i].ok) pintar(i, false);
          ctx.ayuda('');
        });
        t.querySelector('.qs-otra').addEventListener('click', () => {
          const e = estado.p[i];
          // El botón solo se activa al acabar la cuenta atrás (reloj); aquí no se vuelve a mirar la hora
          if (e.ok || e.n >= (personajes[i].pistas || []).length) return;
          e.n++;
          e.t = Date.now();
          guardar();
          pintar(i, t.classList.contains('fallo'));
          const nueva = t.querySelector('.qs-pistas li:last-child');
          if (nueva && !GK.menosMovimiento()) nueva.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        });
        t.querySelector('.qs-form').addEventListener('submit', (ev) => {
          ev.preventDefault();
          const e = estado.p[i];
          if (e.ok || terminado) return;
          if (!GK.normalizar(campo.value)) {
            ctx.ayuda(`Escribid el nombre del personaje ${i + 1} antes de comprobar.`, 'info');
            return;
          }
          if (GK.nombreParecido(campo.value, respuestas[i].v, respuestas[i].no)) {
            e.ok = true;
            guardar();
            pintar(i);
            const quedan = estado.p.filter((x) => !x.ok).length;
            ctx.ayuda(quedan ? `¡Bien! ${quedan === 1 ? 'Os queda uno' : `Os quedan ${quedan}`}.` : '', 'ok');
            if (!quedan) terminar();
          } else {
            pintar(i, true);
            const total = (personajes[i].pistas || []).length;
            ctx.ayuda(e.n < total ? `El personaje ${i + 1} no es ese. Pedid otra pista si no sale.`
              : `El personaje ${i + 1} no es ese. Leed otra vez sus pistas y revisad cómo se escribe.`);
          }
        });
        pintar(i);
      });

      /** Los cinco acertados: se envía la clave (la unión de los nombres canónicos) y la estación queda superada. */
      async function terminar() {
        if (terminado) return;
        terminado = true;
        const ok = await ctx.intentar(respuestas.map((r) => r.v[0]).join(''));
        if (ok) GK.borrar(claveGuardado);
        else {
          terminado = false;
          ctx.ayuda('Están todos bien, pero no se ha podido guardar. Avisad a la organización.');
        }
      }

      const id = setInterval(() => tarjetas.forEach((_, i) => reloj(i)), 1000);
      if (estado.p.every((x) => x.ok)) terminar();
      return () => clearInterval(id);
    },
  });
})();
