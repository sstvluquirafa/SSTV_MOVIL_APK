/*
 * Prueba PELIS ESPACIALES (app). Tres películas contadas con emojis (torneo.json → prueba.peliculas[].emojis); el
 * equipo escribe el título de cada una y un único botón las comprueba. Sin imágenes de las películas (derechos de
 * autor): solo emojis.
 *
 * Los títulos NO están en la app. El generador publica, por cada película, las huellas (PBKDF2 con la sal de la
 * estación) de los títulos que valen (prueba.peliculas[].huellas), para marcar ✓ o ✗ en cada una. La estación se
 * supera con la unión de los tres títulos, que se comprueba como el resto contra la clave de Firebase (todas las
 * combinaciones válidas van en «alternativas»). Los títulos se escriben en privado/secretos.json → «peliculas».
 *
 * Sin espera tras fallar: un título escrito no se acierta al azar.
 */
(function () {
  'use strict';
  const GK = window.GK;

  /**
   * Igual que normalizar_titulo() en generar_torneo.py: como GK.normalizar, pero quitando antes un artículo al
   * principio («el», «la», «los», «las», «the»). «The Ejemplo», «the ejemplo» y «Ejemplo» quedan igual.
   */
  function tituloLimpio(texto) {
    const t = String(texto ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/^[^a-z0-9]+/, '')
      .replace(/^(el|la|los|las|the)\s+/, '');
    return GK.normalizar(t);
  }

  GK.pruebas.registrar('pelis', {
    titulo: 'Pelis espaciales',
    objetivo: 'Adivinad las tres películas contadas con emojis.',
    pasos: ['Mirad los emojis', 'Escribid cada título', 'Comprobad las tres'],
    montar(contenedor, ctx) {
      const P = ctx.estacion.prueba;
      const pelis = P.peliculas || [];
      if (!pelis.length) {
        contenedor.innerHTML = '<div class="aviso aviso-error">Falta configurar las películas de esta prueba. Avisad a la organización.</div>';
        return;
      }
      // Lo escrito se guarda en el móvil: si salen de la pantalla, no lo pierden.
      const claveGuardado = `pelis:${ctx.equipo.id}:${ctx.estacion.id}`;
      const escrito = GK.leer(claveGuardado, []);

      contenedor.innerHTML = `
        <div class="reto">
          <div class="reto-cuerpo">
            <form class="pelis" autocomplete="off" novalidate>
              ${pelis.map((p, i) => `
                <section class="peli" data-i="${i}">
                  <div class="peli-cab">
                    <label class="peli-titulo" for="peli-${i}">Película ${i + 1}</label>
                    <span class="peli-marca" aria-live="polite"></span>
                  </div>
                  <p class="peli-emojis" role="img" aria-label="Emojis de la película ${i + 1}">${(p.emojis || []).map((e) => `<span>${GK.html(e)}</span>`).join('')}</p>
                  <input id="peli-${i}" class="campo" spellcheck="false" autocapitalize="sentences" maxlength="60" placeholder="Título de la película" value="${GK.html(escrito[i] || '')}">
                </section>`).join('')}
              <button class="boton boton-ancho" type="submit" id="pelis-comprobar">Comprobar</button>
            </form>
          </div>
        </div>`;

      const form = contenedor.querySelector('form');
      const boton = contenedor.querySelector('#pelis-comprobar');
      const campos = [...contenedor.querySelectorAll('.peli .campo')];
      const tarjetas = [...contenedor.querySelectorAll('.peli')];

      /** Marca una película: 'ok' (✓), 'no' (✗) o null (sin comprobar). */
      const marcar = (i, estado) => {
        const t = tarjetas[i];
        t.classList.toggle('acierto', estado === 'ok');
        t.classList.toggle('fallo', estado === 'no');
        t.querySelector('.peli-marca').innerHTML = estado === 'ok' ? '<span aria-hidden="true">✓</span> Acertada'
          : estado === 'no' ? '<span aria-hidden="true">✗</span> Todavía no' : '';
        campos[i].setAttribute('aria-invalid', String(estado === 'no'));
      };
      campos.forEach((c, i) => c.addEventListener('input', () => {
        escrito[i] = c.value;
        GK.guardar(claveGuardado, escrito);
        if (!tarjetas[i].classList.contains('acierto')) marcar(i, null);
        ctx.ayuda('');
      }));

      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const titulos = campos.map((c) => tituloLimpio(c.value));
        const vacias = titulos.filter((t) => !t).length;
        if (vacias === titulos.length) {
          ctx.ayuda('Escribid al menos un título antes de comprobar.', 'info');
          return;
        }
        boton.disabled = true;
        boton.textContent = 'Comprobando…';
        const aciertos = await Promise.all(titulos.map(async (t, i) => {
          if (!t) return null;
          const h = await GK.huella(t, ctx.estacion.sal);
          return (pelis[i].huellas || []).includes(h);
        }));
        aciertos.forEach((a, i) => marcar(i, a === null ? null : a ? 'ok' : 'no'));
        const bien = aciertos.filter((a) => a === true).length;
        if (bien === pelis.length) {
          // La comprobación de verdad: la unión de los tres títulos contra la clave de la estación
          if (await ctx.intentar(titulos.join(''))) { GK.borrar(claveGuardado); return; }
          ctx.ayuda('Las tres están bien, pero no se ha podido guardar. Avisad a la organización.');
        } else if (vacias) {
          ctx.ayuda(`Lleváis ${bien} de ${pelis.length}. Os falta escribir ${vacias === 1 ? 'una película' : `${vacias} películas`}.`, 'info');
        } else {
          const n = pelis.length - bien;
          ctx.ayuda(`Lleváis ${bien} de ${pelis.length}. Revisad ${n === 1 ? 'la marcada' : 'las marcadas'} con ✗: mirad los emojis uno a uno.`);
        }
        boton.disabled = false;
        boton.textContent = 'Comprobar';
      });
    },
  });
})();
