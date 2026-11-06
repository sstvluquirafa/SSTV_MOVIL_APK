/*
 * Registro de pruebas.
 *
 * Cada prueba es un archivo en js/pruebas/ que llama a GK.pruebas.registrar(tipo, definicion).
 * En herramientas/torneo.json, cada estación dice qué tipo de prueba usa:
 *     { "id": 3, "nombre": "...", "prueba": { "tipo": "mi_prueba", ...opciones } }
 *
 * Definición de una prueba:
 *   {
 *     titulo: 'Texto corto para la cabecera',
 *     montar(contenedor, ctx) {
 *       // Dibuja la prueba dentro de `contenedor` (un <div>).
 *       // ctx.estacion   → { id, letra, nombre, prueba, sal }  (prueba = las opciones de torneo.json)
 *       // ctx.equipo     → { id, nombre }
 *       // ctx.intentar(respuesta) → Promise<boolean>. Comprueba la respuesta (se normaliza: sin tildes,
 *       //                    mayúsculas ni espacios) contra la clave de la estación. Si es correcta,
 *       //                    la estación queda superada y la app pasa sola a la pantalla de «superada».
 *       //                    También valen los sinónimos de privado/secretos.json → «alternativas».
 *       //                    ctx.intentar(respuesta, { quedarse: true }) supera la estación pero no cambia de
 *       //                    pantalla: la prueba enseña algo más y después llama a ctx.continuar().
 *       // ctx.ayuda(texto, tipo?) → muestra un aviso amable bajo la prueba (tipo: 'error', 'info' u 'ok').
 *       // ctx.esperar(segundos, boton) → Promise. Tras un fallo en pruebas de opciones (donde se podría acertar
 *       //                    probando al azar): bloquea el botón con cuenta atrás y un mensaje amable.
 *       // ctx.coincide(texto, huella) → Promise<boolean>. Compara con otra huella de la prueba (misma sal que la
 *       //                    estación), por ejemplo para avisar «eso es la pregunta, no la respuesta».
 *       // La PISTA no la pinta la prueba: la app muestra el botón «Pista» a los 60 s con el texto de
 *       // torneo.json → prueba.pista.
 *       // Devuelve opcionalmente una función de limpieza (se llama al salir de la pantalla).
 *     }
 *   }
 *
 * La clave de cada estación está en privado/secretos.json («clave»). Por defecto es un código aleatorio
 * impreso en una etiqueta que se esconde en la estación; si tu prueba tiene una respuesta concreta, pon esa
 * respuesta como clave y vuelve a ejecutar herramientas/generar_torneo.py. Nunca escribas la respuesta en el código de la prueba.
 *
 * No olvides añadir el <script> de la prueba en index.html y su ruta en sw.js (lista ARCHIVOS).
 */
(function () {
  'use strict';
  const GK = window.GK;
  const tipos = {};
  GK.pruebas = {
    registrar(tipo, def) {
      if (tipos[tipo]) console.warn('Prueba registrada dos veces:', tipo);
      tipos[tipo] = def;
    },
    obtener(tipo) { return tipos[tipo] || null; },
    tipos() { return Object.keys(tipos); },
  };
})();
