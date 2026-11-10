// Utilidades comunes de las pruebas: configuración pública, secretos (solo en local) y acciones en la app.
const fs = require('fs');
const path = require('path');
const { expect } = require('@playwright/test');

const RAIZ = path.resolve(__dirname, '..');
const textoConfig = fs.readFileSync(path.join(RAIZ, 'web/js/config.js'), 'utf8');
const C = JSON.parse(textoConfig.slice(textoConfig.indexOf('{'), textoConfig.lastIndexOf('}') + 1));
const rutaSecretos = path.join(RAIZ, 'privado/secretos.json');
if (!fs.existsSync(rutaSecretos)) throw new Error('Faltan privado/secretos.json: ejecutad antes python herramientas/generar_torneo.py');
const SEC = JSON.parse(fs.readFileSync(rutaSecretos, 'utf8'));

const est = (id) => C.estaciones.find((e) => e.id === Number(id));
const clave = (id) => String(SEC.estaciones[String(id)].clave);
const token = (id) => SEC.estaciones[String(id)].token;
/** La ruta que empieza por esa estación (las rutas son un cuadrado latino: hay exactamente una). */
const rutaQueEmpiezaPor = (id) => C.rutas.find((r) => r.orden[0] === Number(id)).id;

/** Abre la app en modo demo con todo limpio, une el móvil al equipo 1 y da la salida. */
async function empezar(page, { equipo = 1, salida = true } = {}) {
  await page.goto('/?demo=1');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('gk:forzarDemo', 'true'); });
  const cod = SEC.equipos[String(equipo)].codigo;
  await page.goto(`/?demo=1#/unirse/${equipo}/${cod}`);
  // La huella del código (PBKDF2) tarda un poco, sobre todo con varias pruebas a la vez
  await expect(page).toHaveURL(/#\/$/, { timeout: 20000 });
  await expect.poll(() => page.evaluate((e) => !!GK.rutaDeEquipo(e), equipo), { timeout: 15000 }).toBe(true);
  if (salida) await page.evaluate(() => GK.datos.organizacion.iniciar());
}

/** Cambia (en la base de datos de demo) la ruta del equipo y su progreso, y recarga la app. */
async function ponerRuta(page, ruta, progreso = {}, equipo = 1) {
  await page.evaluate(({ ruta, progreso, equipo }) => {
    const bd = JSON.parse(localStorage.getItem('gk:demo:bd'));
    const viejo = bd.vivo.asignacion.equipos[equipo];
    if (viejo) delete bd.vivo.asignacion.rutas[viejo];
    const otro = bd.vivo.asignacion.rutas[ruta];
    if (otro) delete bd.vivo.asignacion.equipos[otro];
    bd.vivo.asignacion.equipos[equipo] = String(ruta);
    bd.vivo.asignacion.rutas[ruta] = String(equipo);
    bd.vivo.progreso[equipo] = progreso;
    localStorage.setItem('gk:demo:bd', JSON.stringify(bd));
    localStorage.setItem('gk:progreso:' + equipo, JSON.stringify(progreso));
  }, { ruta, progreso, equipo });
  await page.goto('/?demo=1#/');
  await page.reload();
  await expect.poll(() => page.evaluate((e) => GK.rutaDeEquipo(e) && GK.rutaDeEquipo(e).id, equipo)).toBe(ruta);
}

/** Progreso de demo con las n primeras estaciones de la ruta hechas. */
function hechas(ruta, n, t0 = Date.now() - 600000) {
  const p = {};
  C.rutas.find((r) => r.id === ruta).orden.slice(0, n).forEach((s, i) => { p[s] = { t: t0 + i * 1000 }; });
  return p;
}

async function abrirEstacion(page, id) {
  await page.evaluate((h) => { location.hash = h; }, `#/e/${id}/${token(id)}`);
  await expect(page.locator('#prueba')).toBeVisible();
}

/* ---------- Cómo se responde cada tipo de prueba ---------- */
const LETRAS = 'abcdefgh';
/** Pelis espaciales: los títulos principales (o la variante n de cada película, si la hay). */
function titulosPelis(n = 0) {
  const e = C.estaciones.find((x) => x.prueba.tipo === 'pelis');
  return SEC.estaciones[String(e.id)].peliculas.map((p) => p[Math.min(n, p.length - 1)]);
}
/** Una respuesta incorrecta pero con la forma correcta (mismo largo / mismo número de opciones). */
function respuestaMala(tipo, buena) {
  if (tipo === 'geoguessr' || tipo === 'real_o_ia') {
    const ult = buena.slice(-1);
    return buena.slice(0, -1) + (ult === 'a' ? 'b' : 'a');
  }
  if (tipo === 'bulo_verdad') return buena.slice(0, -1) + (buena.slice(-1) === 'b' ? 'v' : 'b');
  if (tipo === 'caja_fuerte') return buena.split('').map((d) => String((Number(d) + 1) % 10)).join('');
  // Pelis: la 1.ª y la 3.ª bien y la 2.ª con un título equivocado (los buenos salen de privado/secretos.json)
  if (tipo === 'pelis') return titulosPelis().map((t, i) => (i === 1 ? 'Titanic' : t));
  if (tipo === 'wordle') return buena.split('').reverse().join('') === buena ? 'zzzzz' : buena.split('').reverse().join('');
  return 'respuestamala';
}

async function responder(page, tipo, r) {
  const prueba = page.locator('#prueba');
  switch (tipo) {
    case 'codigo_estacion': await page.fill('#codigo-estacion', r); await prueba.locator('form button').click(); break;
    case 'morse': await page.fill('#resp-morse', r); await prueba.locator('form button').click(); break;
    case 'sstv_mano': await page.fill('#resp-sstv', r); await prueba.locator('form button').click(); break;
    case 'pelis': {
      // r: lista de títulos, o la clave (la unión de los tres): entonces se escriben los títulos principales
      const titulos = Array.isArray(r) ? r : titulosPelis();
      for (let i = 0; i < titulos.length; i++) await page.fill(`#peli-${i}`, titulos[i]);
      await page.locator('#pelis-comprobar').click();
      break;
    }
    case 'binario': await page.fill('#resp-bin', r); await prueba.locator('form button').click(); break;
    case 'hackeo': await page.fill('#hack-clave', r); await page.locator('#hack-form button').click(); break;
    case 'qr_escondido':
      if (!(await page.locator('.plegable-simple').evaluate((d) => d.open))) await page.locator('.plegable-simple summary').click();
      await page.fill('#resp-qr', r);
      await prueba.locator('form button').click();
      break;
    case 'wordle':
      for (const k of r.toUpperCase()) await page.locator(`.w-tecla[data-k="${k}"]`).click();
      await page.locator('.w-tecla[data-k="ENTER"]').click();
      break;
    case 'geoguessr':
      for (let i = 0; i < r.length; i++) await page.locator(`.opcion[data-i="${i}"][data-j="${LETRAS.indexOf(r[i])}"]`).click();
      await page.locator('#geo-comprobar').click();
      break;
    case 'real_o_ia':
      await page.locator(`.ia-foto[data-i="${LETRAS.indexOf(r)}"]`).click();
      await page.locator('#ia-comprobar').click();
      break;
    case 'bulo_verdad':
      for (let i = 0; i < r.length; i++) await page.locator(`.bulo[data-i="${i}"] .bulo-b[data-v="${r[i]}"]`).click();
      await page.locator('#bulo-comprobar').click();
      break;
    case 'caja_fuerte':
      for (let i = 0; i < r.length; i++) {
        const actual = Number(await page.locator(`#rueda-${i}`).innerText());
        for (let k = 0; k < (Number(r[i]) - actual + 10) % 10; k++) await page.locator(`.rueda-b[data-r="${i}"][data-d="1"]`).click();
      }
      await page.locator('#caja-abrir').click();
      break;
    default: throw new Error('Tipo de prueba sin respuesta en las pruebas: ' + tipo);
  }
}

/** Tras acertar: las pruebas que se quedan en pantalla (explicación, animación) se continúan. */
async function continuarSiHaceFalta(page, tipo, id) {
  if (tipo === 'real_o_ia') { await expect(page.locator('#ia-comprobar')).toHaveText('Continuar'); await page.locator('#ia-comprobar').click(); }
  if (tipo === 'bulo_verdad') { await expect(page.locator('#bulo-comprobar')).toHaveText('Continuar'); await page.locator('#bulo-comprobar').click(); }
  if (tipo === 'hackeo') await page.locator('#hack-seguir').click();
  await expect(page).toHaveURL(new RegExp(`#/superada/${id}$`), { timeout: 8000 });
}

/** Supera la estación que le toca al equipo, con su respuesta buena. */
async function superar(page, id) {
  const tipo = est(id).prueba.tipo;
  await abrirEstacion(page, id);
  await responder(page, tipo, clave(id));
  await continuarSiHaceFalta(page, tipo, id);
}

/** Sin desbordamiento horizontal (nada se sale de la pantalla). */
async function sinScrollHorizontal(page) {
  const [ancho, vista] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(ancho, 'la página no debe tener scroll horizontal').toBeLessThanOrEqual(vista + 1);
}

module.exports = { C, SEC, titulosPelis, est, clave, token, rutaQueEmpiezaPor, empezar, ponerRuta, hechas, abrirEstacion, respuestaMala, responder, continuarSiHaceFalta, superar, sinScrollHorizontal };
