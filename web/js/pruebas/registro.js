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
 *       // ctx.estacion   → { id, letra, nombre, prueba }  (prueba = las opciones de torneo.json)
 *       // ctx.equipo     → { id, nombre }
 *       // ctx.intentar(respuesta) → Promise<boolean>. Comprueba la respuesta (se normaliza: sin tildes,
 *       //                    mayúsculas ni espacios) contra la clave de la estación. Si es correcta,
 *       //                    la estación queda superada y la app pasa sola a la pantalla de «superada».
 *       // ctx.ayuda(texto) → muestra un aviso amable bajo la prueba.
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
