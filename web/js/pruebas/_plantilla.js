/*
 * PLANTILLA para crear una prueba nueva. No se carga en la app: cópiala con otro nombre.
 *
 * Pasos:
 *   1. Copia este archivo como js/pruebas/mi_prueba.js y cambia 'mi_prueba' abajo.
 *   2. En index.html, añade <script src="js/pruebas/mi_prueba.js"></script> junto a codigo_estacion.js.
 *   3. En sw.js, añade 'js/pruebas/mi_prueba.js' a ARCHIVOS y sube VERSION (gk-v2, gk-v3...).
 *   4. En herramientas/torneo.json, pon en la estación: "prueba": { "tipo": "mi_prueba", ...tus opciones }.
 *   5. En privado/secretos.json, pon como "clave" de esa estación la respuesta correcta
 *      (se compara sin tildes, mayúsculas ni espacios).
 *   6. Ejecuta: python herramientas/generar_torneo.py  (y reimporta los secretos en Firebase).
 *
 * La respuesta NUNCA se escribe en este archivo: la app solo guarda su huella.
 */
(function () {
  'use strict';
  const GK = window.GK;

  GK.pruebas.registrar('mi_prueba', {
    titulo: 'Mi prueba',
    montar(contenedor, ctx) {
      // ctx.estacion.prueba trae las opciones que pusiste en torneo.json (por ejemplo, una pregunta)
      const pregunta = ctx.estacion.prueba.pregunta || '¿…?';
      contenedor.innerHTML = `
        <div class="reto">
          <div class="reto-cuerpo">
            <p class="reto-intro">${GK.html(pregunta)}</p>
            <form autocomplete="off">
              <input class="campo" placeholder="Vuestra respuesta" required>
              <button class="boton boton-ancho" type="submit">Comprobar</button>
            </form>
          </div>
        </div>`;
      const form = contenedor.querySelector('form');
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const ok = await ctx.intentar(form.querySelector('input').value);
        if (!ok) ctx.ayuda('Todavía no. ¡Probad otra vez!');
        // Si es correcta, la app pasa sola a la pantalla de «estación superada».
      });
      // Devuelve una función si tu prueba necesita limpiar algo al salir (temporizadores, cámara, audio…)
      return () => {};
    },
  });
})();
