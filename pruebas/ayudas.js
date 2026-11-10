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
/** Secretos de la estación PARA UN EQUIPO: las pruebas de contenido tienen clave y partes distintas por equipo. */
const secretoEquipo = (id, equipo = 1) => {
  const s = SEC.estaciones[String(id)];
  return (s.equipos && s.equipos[String(equipo)]) || s;
};
const clave = (id, equipo = 1) => String(secretoEquipo(id, equipo).clave);
/** Respuestas de una prueba por partes (Morse…) para un equipo: la variante n de cada parte (0 = la principal). */
const respuestasPartes = (id, equipo = 1, n = 0) => secretoEquipo(id, equipo).partes.map((p) => p.respuestas[Math.min(n, p.respuestas.length - 1)]);
const idDeTipo = (tipo) => C.estaciones.find((x) => x.prueba.tipo === tipo).id;
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
/** Pelis espaciales: los títulos del equipo 1 (la variante n de cada película: 0 = el principal). */
const titulosPelis = (n = 0) => respuestasPartes(idDeTipo('pelis'), 1, n);
/** Avanza el reloj de la página (si las pruebas lo han instalado) o espera de verdad. */
async function avanzar(page, ms) {
  try { await page.clock.runFor(ms); } catch (e) { await page.waitForTimeout(ms); }
}
/** Respuestas del equipo 1 de una prueba por partes cuando r es su clave (o la lista tal cual). */
const comoLista = (tipo, r) => (Array.isArray(r) ? r : r === clave(idDeTipo(tipo)) ? respuestasPartes(idDeTipo(tipo)) : [r]);
/** Una respuesta incorrecta pero con la forma correcta (mismo largo / mismo número de opciones). */
function respuestaMala(tipo, buena) {
  if (tipo === 'geoguessr' || tipo === 'real_o_ia') {
    const ult = buena.slice(-1);
    return buena.slice(0, -1) + (ult === 'a' ? 'b' : 'a');
  }
  // Bulo: falla la 1.ª noticia (la 1.ª ronda no se supera)
  if (tipo === 'bulo_verdad') return (buena[0] === 'b' ? 'v' : 'b') + buena.slice(1);
  // Escotilla: la 1.ª escotilla con todas las cifras cambiadas
  if (tipo === 'caja_fuerte') return [respuestasPartes(idDeTipo(tipo))[0].split('').map((d) => String((Number(d) + 1) % 10)).join('')];
  if (tipo === 'binario' || tipo === 'qr_escondido') return respuestasPartes(idDeTipo(tipo)).map((r, i) => (i === 1 ? 'malo' : r));
  // Morse: la 1.ª y la 3.ª bien y la 2.ª mal (las buenas salen de privado/secretos.json, equipo 1)
  if (tipo === 'morse') return respuestasPartes(idDeTipo('morse')).map((r, i) => (i === 1 ? 'respuestamala' : r));
  // Pelis: la 1.ª y la 3.ª bien y la 2.ª con un título equivocado (los buenos salen de privado/secretos.json)
  if (tipo === 'pelis') return titulosPelis().map((t, i) => (i === 1 ? 'Titanic' : t));
  // Wordle: la 1.ª palabra al revés (de 5 letras)
  if (tipo === 'wordle') { const w = respuestasPartes(idDeTipo(tipo))[0]; return [w.split('').reverse().join('') === w ? 'zzzzz' : w.split('').reverse().join('')]; }
  return 'respuestamala';
}

async function responder(page, tipo, r) {
  const prueba = page.locator('#prueba');
  switch (tipo) {
    case 'codigo_estacion': await page.fill('#codigo-estacion', r); await prueba.locator('form button').click(); break;
    case 'morse': {
      // r: lista de respuestas, o la clave del equipo 1: entonces se escriben sus respuestas principales
      const rs = Array.isArray(r) ? r : respuestasPartes(idDeTipo('morse'));
      for (let i = 0; i < rs.length; i++) await page.fill(`#resp-morse-${i}`, rs[i]);
      await page.locator('#morse-comprobar').click();
      break;
    }
    case 'sstv_mano': await page.fill('#resp-sstv', r); await prueba.locator('form button').click(); break;
    case 'pelis': {
      // r: lista de títulos, o la clave del equipo 1: entonces se escriben sus títulos principales
      const titulos = comoLista(tipo, r);
      for (let i = 0; i < titulos.length; i++) await page.fill(`#peli-${i}`, titulos[i]);
      await page.locator('#pelis-comprobar').click();
      break;
    }
    case 'diferencias': await page.fill('#dif-clave', r); await page.locator('.dif-clave-form button').click(); break;
    case 'sstv_puzle': await page.fill('#sstv-clave', r); await page.locator('.dif-clave-form button').click(); break;
    case 'mas_menos': {
      // r = la clave: se encadena la racha acertando; cualquier otra cosa: se falla la primera pregunta
      const partes = secretoEquipo(idDeTipo(tipo)).partes;
      const buena = (a, b) => partes.find((p) => p.opciones.includes(a) && p.opciones.includes(b)).respuestas[0];
      const seguir = page.locator('#mm-seguir');
      if (await seguir.isVisible() && /Otra racha/.test(await seguir.innerText())) await seguir.click();
      const meta = est(idDeTipo(tipo)).equipos['1'].prueba.racha;
      for (let n = 0; n < (r === clave(idDeTipo(tipo)) ? meta : 1); n++) {
        if (n) await seguir.click();
        await expect(page.locator('.mm-carta:not([disabled])')).toHaveCount(2);
        const nombres = await page.locator('.mm-nombre').allInnerTexts();
        const ok = buena(nombres[0], nombres[1]);
        const i = r === clave(idDeTipo(tipo)) ? nombres.indexOf(ok) : 1 - nombres.indexOf(ok);
        await page.locator(`.mm-carta[data-i="${i}"]`).click();
        await expect(page.locator('#mm-dato')).not.toHaveText('');
      }
      break;
    }
    case 'binario': {
      const rs = comoLista(tipo, r);
      for (let i = 0; i < rs.length; i++) await page.fill(`#resp-bin-${i}`, rs[i]);
      await page.locator('#bin-comprobar').click();
      break;
    }
    case 'hackeo': await page.fill('#hack-clave', r); await page.locator('#hack-form button').click(); break;
    case 'qr_escondido': {
      // Las palabras de los 3 QR (como si las hubieran juntado hablando)
      const rs = comoLista(tipo, r);
      for (let i = 0; i < rs.length; i++) await page.fill(`#resp-qr-${i}`, rs[i]);
      await page.locator('#qr-comprobar').click();
      break;
    }
    case 'wordle': {
      // Las palabras una tras otra; entre una y otra, la app espera 2,2 s antes de cambiar de tablero
      const ws = comoLista(tipo, r);
      for (let n = 0; n < ws.length; n++) {
        if (n) { await avanzar(page, 2500); await expect(page.locator('#w-ronda')).toContainText(`Palabra ${n + 1}`); }
        for (const k of ws[n].toUpperCase()) await page.locator(`.w-tecla[data-k="${k}"]`).click();
        await page.locator('.w-tecla[data-k="ENTER"]').click();
      }
      break;
    }
    case 'geoguessr':
      for (let i = 0; i < r.length; i++) await page.locator(`.opcion[data-i="${i}"][data-j="${LETRAS.indexOf(r[i])}"]`).click();
      await page.locator('#geo-comprobar').click();
      break;
    case 'real_o_ia':
      await page.locator(`.ia-foto[data-i="${LETRAS.indexOf(r)}"]`).click();
      await page.locator('#ia-comprobar').click();
      break;
    case 'bulo_verdad': {
      // Por rondas de 5: si una ronda sale bien y quedan más, «Siguiente ronda»; si sale mal, se para ahí
      const rondas = r.match(/.{1,5}/g);
      for (let n = 0; n < rondas.length; n++) {
        const ronda = rondas[n];
        for (let i = 0; i < ronda.length; i++) await page.locator(`.bulo[data-i="${i}"] .bulo-b[data-v="${ronda[i]}"]`).click();
        await page.locator('#bulo-comprobar').click();
        if (n === rondas.length - 1) break;
        // Se espera al resultado de la ronda (bien o mal) sin perder tiempo: el reloj de la página sigue corriendo
        await expect(page.locator('#bulo-falta')).toContainText(/Ronda superada|no es correcta/);
        if (!(await page.locator('#bulo-falta').innerText()).includes('Ronda superada')) break;
        await page.locator('#bulo-comprobar').click();
        await expect(page.locator('.escotilla-paso')).toContainText(`Ronda ${n + 2}`);
      }
      break;
    }
    case 'caja_fuerte': {
      // Una escotilla tras otra; al abrir una, la app espera 2 s antes de enseñar la siguiente
      const codigos = comoLista(tipo, r);
      for (let n = 0; n < codigos.length; n++) {
        if (n) { await avanzar(page, 2500); await expect(page.locator('.escotilla-paso')).toContainText(`Escotilla ${n + 1}`); }
        const c = codigos[n];
        for (let i = 0; i < c.length; i++) {
          const actual = Number(await page.locator(`#rueda-${i}`).innerText());
          for (let k = 0; k < (Number(c[i]) - actual + 10) % 10; k++) await page.locator(`.rueda-b[data-r="${i}"][data-d="1"]`).click();
        }
        await page.locator('#caja-abrir').click();
      }
      break;
    }
    default: throw new Error('Tipo de prueba sin respuesta en las pruebas: ' + tipo);
  }
}

/** Tras acertar: las pruebas que se quedan en pantalla (explicación, animación) se continúan. */
async function continuarSiHaceFalta(page, tipo, id) {
  if (tipo === 'real_o_ia') { await expect(page.locator('#ia-comprobar')).toHaveText('Continuar'); await page.locator('#ia-comprobar').click(); }
  if (tipo === 'bulo_verdad') { await expect(page.locator('#bulo-comprobar')).toHaveText('Continuar'); await page.locator('#bulo-comprobar').click(); }
  if (tipo === 'hackeo') await page.locator('#hack-seguir').click();
  if (tipo === 'mas_menos') { await expect(page.locator('#mm-seguir')).toHaveText('Continuar'); await page.locator('#mm-seguir').click(); }
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

module.exports = { C, SEC, titulosPelis, secretoEquipo, respuestasPartes, idDeTipo, avanzar, est, clave, token, rutaQueEmpiezaPor, empezar, ponerRuta, hechas, abrirEstacion, respuestaMala, responder, continuarSiHaceFalta, superar, sinScrollHorizontal };
