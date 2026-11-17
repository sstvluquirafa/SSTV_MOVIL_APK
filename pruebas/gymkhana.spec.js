// Pruebas de la gymkhana: cada prueba, pista, espera tras fallo, letras, palabra final, meta, ranking y vistas.
const { test, expect } = require('@playwright/test');
const A = require('./ayudas');
const { C, SEC } = A;

const OPCIONES = ['geoguessr', 'bulo_verdad'];
const nombreEquipo = (id) => C.equipos.find((e) => e.id === id).nombre;

/* ---------- Progreso de las pruebas guardado en el móvil ---------- */
/** Claves de progreso de pruebas que hay en el móvil (las nuevas «gk:p:…» y las antiguas sin versión). */
const clavesProgreso = (page) => page.evaluate(() => Object.keys(localStorage).filter((k) =>
  k.startsWith('gk:p:') || /^gk:(ahorcado|binario|bulo|escotilla|dif|morse|pelis|pelis-pistas|qr|qr-palabras|quien|sstv|pz|pz-demo|wordle):\d+:\d+$/.test(k)));

test('Escotilla: un código viejo guardado en el móvil se descarta y se vuelve a la escotilla 1', async ({ page }) => {
  const e = C.estaciones.find((x) => x.prueba.tipo === 'caja_fuerte');
  test.skip(!e, 'Sin escotilla');
  const codigos = A.respuestasPartes(e.id);
  test.skip(codigos.length < 2, 'Una sola escotilla');
  await A.empezar(page);
  await A.ponerRuta(page, A.rutaQueEmpiezaPor(e.id));
  // 1) Progreso de una versión anterior de la app (clave sin versión), con un código de otro acertijo
  await page.evaluate((id) => localStorage.setItem(`gk:escotilla:1:${id}`, JSON.stringify(['147'])), e.id);
  await A.abrirEstacion(page, e.id);
  await expect(page.locator('.escotilla-paso')).toContainText('Escotilla 1');
  expect(await page.evaluate((id) => localStorage.getItem(`gk:escotilla:1:${id}`), e.id)).toBeNull();
  // 2) Abren la 1.ª de verdad, y se cambia a mano el código guardado (de la versión actual) por uno que no vale
  await A.responder(page, 'caja_fuerte', [codigos[0]]);
  await expect(page.locator('.escotilla-paso')).toContainText('Escotilla 2', { timeout: 8000 });
  const [clave] = await clavesProgreso(page);
  expect(clave).toMatch(new RegExp(`^gk:p:escotilla:1:${e.id}:`));
  await page.evaluate((k) => localStorage.setItem(k, JSON.stringify(['147'])), clave);
  await page.reload();
  // La app comprueba el código guardado con la huella de la escotilla 1, lo descarta y vuelve a empezar
  await expect(page.locator('.escotilla-paso')).toContainText('Escotilla 1');
  expect(await page.evaluate((k) => localStorage.getItem(k), clave)).toBeNull();
  // Y con los códigos buenos (528 + 3609) se supera
  await A.responder(page, 'caja_fuerte', codigos);
  await expect(page).toHaveURL(new RegExp(`#/superada/${e.id}$`), { timeout: 8000 });
});

test('Escotilla: un progreso guardado bueno se conserva (se sigue en la escotilla 2)', async ({ page }) => {
  const e = C.estaciones.find((x) => x.prueba.tipo === 'caja_fuerte');
  test.skip(!e, 'Sin escotilla');
  const codigos = A.respuestasPartes(e.id);
  test.skip(codigos.length < 2, 'Una sola escotilla');
  await A.empezar(page);
  await A.ponerRuta(page, A.rutaQueEmpiezaPor(e.id));
  await A.abrirEstacion(page, e.id);
  await A.responder(page, 'caja_fuerte', [codigos[0]]);
  await expect(page.locator('.escotilla-paso')).toContainText('Escotilla 2', { timeout: 8000 });
  await page.reload();
  await expect(page.locator('.escotilla-paso')).toContainText('Escotilla 2');
  for (const c of codigos.slice(1)) await A.responder(page, 'caja_fuerte', [c]);
  await expect(page).toHaveURL(new RegExp(`#/superada/${e.id}$`), { timeout: 8000 });
});

test('Reiniciar todo: el móvil se desvincula y no queda progreso de ninguna prueba', async ({ page }) => {
  const q = C.estaciones.find((x) => x.prueba.tipo === 'quien_soy');
  const h = C.estaciones.find((x) => x.prueba.tipo === 'caja_fuerte');
  test.skip(!q || !h, 'Faltan pruebas');
  await A.empezar(page);
  // Progreso en ¿Quién soy? (un acierto) y en la escotilla (la 1.ª abierta), más uno antiguo sin versión
  await A.ponerRuta(page, A.rutaQueEmpiezaPor(q.id));
  await A.abrirEstacion(page, q.id);
  await page.fill('#qs-0', A.respuestasPartes(q.id)[0]);
  await page.locator('.qs[data-i="0"] .qs-form button').click();
  await expect(page.locator('.qs[data-i="0"]')).toHaveClass(/acierto/);
  await A.ponerRuta(page, A.rutaQueEmpiezaPor(h.id));
  await A.abrirEstacion(page, h.id);
  await A.responder(page, 'caja_fuerte', [A.respuestasPartes(h.id)[0]]);
  await expect(page.locator('.escotilla-paso')).toContainText('Escotilla 2', { timeout: 8000 });
  await page.evaluate(() => localStorage.setItem('gk:ahorcado:1:3', JSON.stringify({ r: 1 })));
  expect((await clavesProgreso(page)).length).toBeGreaterThanOrEqual(3);
  // La organización reinicia: el móvil vuelve a «Unirse» y el progreso de las pruebas desaparece
  await page.evaluate(() => GK.datos.organizacion.reiniciar());
  await expect(page).toHaveURL(/#\/unirse/, { timeout: 15000 });
  expect(await clavesProgreso(page)).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('gk:pistas'))).toBeNull();
});

/* ---------- Cada prueba: falla con otra respuesta, se supera con la suya y muestra la pista a los 60 s ---------- */
for (const e of C.estaciones) {
  const tipo = e.prueba.tipo;
  test(`Estación ${e.letra} (${tipo}): falla, pista a los 60 s y se supera`, async ({ page }) => {
    await page.clock.install();
    await A.empezar(page);
    await A.ponerRuta(page, A.rutaQueEmpiezaPor(e.id));
    await A.abrirEstacion(page, e.id);
    await A.sinScrollHorizontal(page);

    // Pista: contador al principio, botón a los 60 s, y el texto al pulsarlo
    if (e.prueba.pista) {
      await expect(page.locator('#pista')).toContainText('Pista disponible en');
      await page.clock.fastForward(61000);
      await page.locator('.boton-pista').click();
      await expect(page.locator('#pista .pista')).toContainText(e.prueba.pista);
    }

    // Respuesta incorrecta: sigue en la estación y avisa
    await A.responder(page, tipo, A.respuestaMala(tipo, A.clave(e.id)));
    await page.waitForTimeout(400);
    await expect(page).toHaveURL(new RegExp(`#/e/${e.id}/`));
    if (tipo === 'hackeo') await expect(page.locator('#hack-log')).toContainText('ACCESO DENEGADO');
    else if (tipo === 'wordle') await expect(page.locator('.w-fila-t').first().locator('.w-casilla.ok, .w-casilla.casi, .w-casilla.no')).toHaveCount(5);
    else if (OPCIONES.includes(tipo)) await expect(page.locator('#ayuda-prueba')).toContainText('Pensadlo un poco');
    else await expect(page.locator('#ayuda-prueba .aviso')).toBeVisible();

    // Las de opciones esperan 15 s: se adelanta el reloj
    if (OPCIONES.includes(tipo)) await page.clock.runFor(16000);

    // Respuesta correcta
    if (tipo === 'caja_fuerte' || tipo === 'wordle') await page.clock.runFor(100);
    await A.responder(page, tipo, A.clave(e.id));
    if (tipo === 'caja_fuerte' || tipo === 'wordle') await page.clock.fastForward(3000);
    await A.continuarSiHaceFalta(page, tipo, e.id);
    await expect(page.locator('.letra-grande')).toHaveText(e.letraPalabra);
  });
}

test('Pelis espaciales: valen las variantes (otro idioma, artículo, mayúsculas, sin tildes)', async ({ page }) => {
  const e = C.estaciones.find((x) => x.prueba.tipo === 'pelis');
  test.skip(!e, 'Sin Pelis espaciales');
  await A.empezar(page);
  await A.ponerRuta(page, A.rutaQueEmpiezaPor(e.id));
  await A.abrirEstacion(page, e.id);
  // 1.ª: «El …» + mayúsculas · 2.ª: sin tildes ni mayúsculas · 3.ª: con signos alrededor · resto: su 2.ª variante
  const principales = A.titulosPelis(0);
  const variantes = A.titulosPelis(1);
  const quitarTildes = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const respuestas = variantes.map((v, i) => (i === 0 ? 'El ' + principales[0].toUpperCase()
    : i === 1 ? quitarTildes(v).toLowerCase() : i === 2 ? '  ' + v + '!' : v));
  await A.responder(page, 'pelis', respuestas);
  await expect(page).toHaveURL(new RegExp(`#/superada/${e.id}$`));
});

test('Pelis espaciales: todos los equipos tienen las mismas 6 películas y la misma clave', () => {
  const e = C.estaciones.find((x) => x.prueba.tipo === 'pelis');
  test.skip(!e || !e.equipos, 'Sin Pelis espaciales');
  const ids = Object.keys(e.equipos);
  const emojis = (k) => e.equipos[k].prueba.peliculas.map((p) => p.emojis.join(' ')).join(' | ');
  expect(e.equipos[ids[0]].prueba.peliculas).toHaveLength(6);
  for (const k of ids) {
    expect(emojis(k)).toBe(emojis(ids[0]));
    expect(e.equipos[k].huella).toBe(e.equipos[ids[0]].huella);
    expect(A.clave(e.id, k)).toBe(A.clave(e.id, ids[0]));
  }
  // El orden fijado: la 1.ª es Star Wars y la 6.ª Proyecto Salvación (comparando en el secreto, no en la web)
  const titulos = A.respuestasPartes(e.id);
  expect(titulos[0]).toBe('Star Wars');
  expect(titulos[5]).toBe('Proyecto Salvación');
});

test('Pelis espaciales: un título equivocado se marca y no supera la estación', async ({ page }) => {
  const e = C.estaciones.find((x) => x.prueba.tipo === 'pelis');
  test.skip(!e, 'Sin Pelis espaciales');
  await A.empezar(page);
  await A.ponerRuta(page, A.rutaQueEmpiezaPor(e.id));
  await A.abrirEstacion(page, e.id);
  await A.responder(page, 'pelis', A.respuestaMala('pelis'));
  const n = A.titulosPelis().length;
  await expect(page.locator('.parte[data-i="1"]')).toHaveClass(/fallo/);
  await expect(page.locator('.parte[data-i="0"]')).toHaveClass(/acierto/);
  await expect(page.locator('.parte.acierto')).toHaveCount(n - 1);
  await expect(page.locator('#ayuda-prueba')).toContainText(`Lleváis ${n - 1} de ${n}`);
  await expect(page).toHaveURL(new RegExp(`#/e/${e.id}/`));
  // Corrigen solo la que falla y la estación se supera
  await page.fill('#peli-1', A.titulosPelis(0)[1]);
  await page.locator('#pelis-comprobar').click();
  await expect(page).toHaveURL(new RegExp(`#/superada/${e.id}$`));
});

/** ¿Vale el texto para la parte i de la estación (equipo 1)? Con la regla común de la app (GK.nombreParecido). */
async function valeNombre(page, idEst, lista, i, texto) {
  return page.evaluate(({ idEst, lista, i, texto }) => {
    const p = window.GK_CONFIG.estaciones.find((x) => x.id === idEst).equipos['1'].prueba[lista][i];
    const r = window.GK.respuestasOfuscadas(p.respuestas, p.salRespuestas);
    return window.GK.nombreParecido(texto, r.v, r.no);
  }, { idEst, lista, i, texto });
}

test('Pelis espaciales: valen títulos mal escritos y palabras clave; «wally» y «Galaxia» no', async ({ page }) => {
  const e = C.estaciones.find((x) => x.prueba.tipo === 'pelis');
  test.skip(!e, 'Sin Pelis espaciales');
  // Los títulos no van en claro en la configuración pública (van ofuscados)
  expect(JSON.stringify(e).toLowerCase()).not.toMatch(/interstellar|guardianes|salvaci|star ?wars|wall-?e/);
  const titulos = A.respuestasPartes(e.id);
  const i = (t) => titulos.indexOf(t);
  await A.empezar(page);
  await A.ponerRuta(page, A.rutaQueEmpiezaPor(e.id));
  await A.abrirEstacion(page, e.id);
  const escritos = {
    'Star Wars': 'Starwars', 'Wall-E': 'wally', 'E.T. el extraterrestre': 'ET', Interstellar: 'Interestellar',
    'Guardianes de la Galaxia': 'Galaxia', 'Proyecto Salvación': 'Proyecto salbacion',
  };
  for (const [t, x] of Object.entries(escritos)) await page.fill(`#peli-${i(t)}`, x);
  await page.locator('#pelis-comprobar').click();
  for (const t of ['Star Wars', 'E.T. el extraterrestre', 'Interstellar', 'Proyecto Salvación']) {
    await expect(page.locator(`.parte[data-i="${i(t)}"]`)).toHaveClass(/acierto/);
  }
  await expect(page.locator(`.parte[data-i="${i('Wall-E')}"]`)).toHaveClass(/fallo/);
  await expect(page.locator(`.parte[data-i="${i('Guardianes de la Galaxia')}"]`)).toHaveClass(/fallo/);
  await expect(page).toHaveURL(new RegExp(`#/e/${e.id}/`));
  // «Galaxia» sola no vale para ninguna (es ambigua entre Star Wars y Guardianes)
  for (let k = 0; k < titulos.length; k++) expect(await valeNombre(page, e.id, 'peliculas', k, 'Galaxia')).toBe(false);
  // Ninguna palabra clave sirve para dos películas
  const partes = A.secretoEquipo(e.id).partes;
  for (let a = 0; a < partes.length; a++) {
    for (const v of partes[a].respuestas) {
      for (let b = 0; b < partes.length; b++) expect(await valeNombre(page, e.id, 'peliculas', b, v), `«${v}» en la película ${b + 1}`).toBe(a === b);
    }
  }
  // Corrigen las dos que fallan (con palabra clave y bien escrita) y la estación se supera
  await page.fill(`#peli-${i('Wall-E')}`, 'Wall-e');
  await page.fill(`#peli-${i('Guardianes de la Galaxia')}`, 'Guardianes');
  await page.locator('#pelis-comprobar').click();
  await expect(page).toHaveURL(new RegExp(`#/superada/${e.id}$`));
});

test('Pelis espaciales: cada película tiene su propia pista, que se activa a los 45 s', async ({ page }) => {
  const e = C.estaciones.find((x) => x.prueba.tipo === 'pelis');
  test.skip(!e, 'Sin Pelis espaciales');
  const pistas = e.equipos['1'].prueba.peliculas.map((p) => p.pista);
  expect(pistas.every(Boolean)).toBe(true);
  expect(new Set(pistas).size).toBe(pistas.length);
  await page.clock.install();
  await A.empezar(page);
  await A.ponerRuta(page, A.rutaQueEmpiezaPor(e.id));
  await A.abrirEstacion(page, e.id);
  await expect(page.locator('#pista')).toBeEmpty(); // sin pista general de la estación
  const botones = page.locator('.peli-pista-b');
  await expect(botones).toHaveCount(pistas.length);
  await expect(botones.first()).toBeDisabled();
  await expect(botones.first()).toContainText('Pista en 0:4');
  await page.clock.fastForward(46000);
  await expect(botones.nth(2)).toBeEnabled();
  await expect(botones.nth(2)).toHaveText(/^\s*Pista\s*$/);
  await botones.nth(2).click();
  await expect(page.locator('.parte[data-i="2"] .peli-pista-texto')).toContainText(pistas[2]);
  await expect(page.locator('.peli-pista-texto')).toHaveCount(1);
  await A.sinScrollHorizontal(page);
});

test('Morse: la tabla sale abierta y el botón la pliega y la despliega', async ({ page }) => {
  const e = C.estaciones.find((x) => x.prueba.tipo === 'morse');
  test.skip(!e, 'Sin Morse');
  await A.empezar(page);
  await A.ponerRuta(page, A.rutaQueEmpiezaPor(e.id));
  await A.abrirEstacion(page, e.id);
  const tabla = page.locator('details.radio-plegable');
  const boton = page.locator('.radio-boton');
  await expect(tabla).toHaveAttribute('open', '');
  await expect(page.locator('.rb-abierta')).toBeVisible();
  await expect(page.locator('.rb-cerrada')).toBeHidden();
  await expect(page.locator('.tecla-morse').first()).toBeVisible();
  const caja = await boton.boundingBox();
  expect(caja.height).toBeGreaterThanOrEqual(48);
  expect(caja.width).toBeGreaterThan(250); // ancho completo
  await boton.click();
  await expect(tabla).not.toHaveAttribute('open', '');
  await expect(page.locator('.rb-cerrada')).toBeVisible();
  await expect(page.locator('.tecla-morse').first()).toBeHidden();
  await boton.click();
  await expect(tabla).toHaveAttribute('open', '');
});

test('Wordle: solo palabras del banco nuevo (sin ORION, SONDA, URANO, ASTRO, CRATER, BOLIDO ni ESTELA)', () => {
  const e = C.estaciones.find((x) => x.prueba.tipo === 'wordle');
  test.skip(!e, 'Sin Wordle');
  const banco = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '../privado/bancos.json'), 'utf8')).wordle;
  const quitadas = ['ORION', 'SONDA', 'URANO', 'ASTRO', 'CRATER', 'BOLIDO', 'ESTELA'];
  for (const w of quitadas) expect([...banco.cinco, ...banco.seis]).not.toContain(w);
  for (const k of Object.keys(e.equipos)) {
    const [cinco, seis] = A.respuestasPartes(e.id, k).map((w) => w.toUpperCase());
    expect(banco.cinco).toContain(cinco);
    expect(banco.seis).toContain(seis);
    expect(e.equipos[k].prueba.palabras).toHaveLength(2);
  }
});

test('¿Quién soy?: pistas cada 20 s, nombres mal escritos valen y el progreso se guarda', async ({ page }) => {
  const e = C.estaciones.find((x) => x.prueba.tipo === 'quien_soy');
  test.skip(!e, 'Sin ¿Quién soy?');
  expect(e.letraPalabra).toBe('R');
  expect(e.prueba.pista).toBeFalsy(); // sin pista general
  // Los nombres no van en claro en la configuración pública (van ofuscados)
  expect(JSON.stringify(e).toLowerCase()).not.toMatch(/einstein|newton|armstrong|galile|musk/);
  const P = e.equipos['1'].prueba;
  await page.clock.install();
  await A.empezar(page);
  await A.ponerRuta(page, A.rutaQueEmpiezaPor(e.id));
  await A.abrirEstacion(page, e.id);
  await A.sinScrollHorizontal(page);
  await expect(page.locator('.qs')).toHaveCount(5);
  await expect(page.locator('#pista')).toBeEmpty();
  // La 1.ª pista se ve al entrar; «Otra pista» espera 20 s (con cuenta atrás)
  const t0 = page.locator('.qs[data-i="0"]');
  await expect(t0.locator('.qs-pistas li')).toHaveCount(1);
  await expect(t0.locator('.qs-pistas li')).toHaveText(P.personajes[0].pistas[0]);
  await expect(t0.locator('.qs-otra')).toBeDisabled();
  await expect(t0.locator('.qs-otra')).toContainText('Otra pista en 0:');
  await page.clock.fastForward(21000);
  await expect(t0.locator('.qs-otra')).toBeEnabled();
  await t0.locator('.qs-otra').click();
  await expect(t0.locator('.qs-pistas li')).toHaveCount(2);
  await expect(t0.locator('.qs-pistas li').nth(1)).toHaveText(P.personajes[0].pistas[1]);
  await expect(t0.locator('.progreso-puntos i.hecho')).toHaveCount(2);
  await expect(t0.locator('.progreso-puntos i')).toHaveCount(4);
  await expect(t0.locator('.qs-otra')).toBeDisabled(); // otros 20 s para la siguiente
  // Nombres mal escritos que valen
  const escritos = ['Einstien', 'Nuton', 'Neil Amstrong', 'Galileo Galiley'];
  for (let i = 0; i < escritos.length; i++) {
    await page.fill(`#qs-${i}`, escritos[i]);
    await page.locator(`.qs[data-i="${i}"] .qs-form button`).click();
    await expect(page.locator(`.qs[data-i="${i}"]`)).toHaveClass(/acierto/);
  }
  // Uno equivocado: se marca y la estación sigue abierta
  await page.fill('#qs-4', 'Marie Curie');
  await page.locator('.qs[data-i="4"] .qs-form button').click();
  await expect(page.locator('.qs[data-i="4"]')).toHaveClass(/fallo/);
  await expect(page.locator('#ayuda-prueba')).toContainText('no es ese');
  await expect(page).toHaveURL(new RegExp(`#/e/${e.id}/`));
  // Ninguna variante sirve para dos personajes
  const partes = A.secretoEquipo(e.id).partes;
  for (let a = 0; a < partes.length; a++) {
    for (const v of partes[a].respuestas) {
      for (let b = 0; b < partes.length; b++) expect(await valeNombre(page, e.id, 'personajes', b, v), `«${v}» en el personaje ${b + 1}`).toBe(a === b);
    }
  }
  // Si se cierra y se vuelve a abrir, se conservan las pistas y los aciertos
  await page.reload();
  await expect(page.locator('.qs.acierto')).toHaveCount(4);
  await expect(t0.locator('.qs-pistas li')).toHaveCount(2);
  await page.fill('#qs-4', 'elon musk');
  await page.locator('.qs[data-i="4"] .qs-form button').click();
  await expect(page).toHaveURL(new RegExp(`#/superada/${e.id}$`));
  await expect(page.locator('.letra-grande')).toHaveText('R');
});

test('QR escondido: leer un QR da la palabra de ESE equipo y la apunta en su casilla', async ({ page }) => {
  const e = C.estaciones.find((x) => x.prueba.tipo === 'qr_escondido');
  test.skip(!e || !e.equipos, 'Sin QR por equipo');
  const qrs = SEC.estaciones[String(e.id)].qrs;
  const palabras = A.respuestasPartes(e.id);
  await A.empezar(page);
  await A.ponerRuta(page, A.rutaQueEmpiezaPor(e.id));
  await A.abrirEstacion(page, e.id);
  await page.locator('.plegable-simple summary').click();
  // Un texto cualquiera no es un QR escondido
  await page.fill('#texto-qr', 'GK-QR-FALSO-1');
  await page.locator('#qr-manual button').click();
  await expect(page.locator('#ayuda-prueba')).toContainText('no es uno de los QR');
  // El QR D2 da la 2.ª palabra del equipo 1 y la escribe en su casilla
  await page.fill('#texto-qr', qrs[1]);
  await page.locator('#qr-manual button').click();
  await expect(page.locator('#ayuda-prueba')).toContainText('QR D2');
  await expect(page.locator('#resp-qr-1')).toHaveValue(new RegExp(palabras[1], 'i'));
  await expect(page.locator('#qr-cuenta')).toContainText('1 de 3');
  // Con las 3 palabras se supera
  await A.responder(page, 'qr_escondido', palabras);
  await expect(page).toHaveURL(new RegExp(`#/superada/${e.id}$`));
});

/** Toca un punto (x, y) de un SVG en sus coordenadas internas (viewBox). */
async function tocarSvg(page, selector, x, y) {
  const p = await page.evaluate(({ selector, x, y }) => {
    const svg = document.querySelector(selector);
    svg.scrollIntoView({ block: 'center' });
    const pt = svg.createSVGPoint(); pt.x = x; pt.y = y;
    const s = pt.matrixTransform(svg.getScreenCTM());
    return { x: s.x, y: s.y };
  }, { selector, x, y });
  await page.mouse.click(p.x, p.y);
}

test('Busca las diferencias: tocar las 3 de una zona da su letra; tocar donde no hay nada bloquea 3 s', async ({ page }) => {
  const e = C.estaciones.find((x) => x.prueba.tipo === 'diferencias');
  test.skip(!e, 'Sin Busca las diferencias');
  const P = e.equipos['1'].prueba;
  const letras = A.respuestasPartes(e.id);
  await A.empezar(page);
  await A.ponerRuta(page, A.rutaQueEmpiezaPor(e.id));
  await A.abrirEstacion(page, e.id);
  await A.sinScrollHorizontal(page);
  await page.locator('.dif-zona[data-z="0"]').click();
  // Un toque en un sitio sin diferencias (lejos de todas): bloqueo con cuenta atrás
  let vacio = null;
  for (let x = 8; x < 200 && !vacio; x += 6) for (let y = 8; y < 150 && !vacio; y += 6) {
    if (P.diferencias.every((d) => Math.hypot(d.x - x, d.y - y) > 40 && (d.x2 == null || Math.hypot(d.x2 - x, d.y2 - y) > 40))) vacio = [x, y];
  }
  await tocarSvg(page, '#dif-recibida', ...vacio);
  await expect(page.locator('#dif-bloqueo')).toContainText('Ahí no hay ninguna diferencia');
  await expect(page.locator('#dif-bloqueo')).toBeHidden({ timeout: 6000 });
  // Las 3 diferencias de la zona 1
  for (const d of P.diferencias.filter((x) => x.id[0] === '1')) await tocarSvg(page, '#dif-recibida', d.x, d.y);
  await expect(page.locator('.dif-marca')).toHaveCount(3);
  await expect(page.locator('#dif-z0')).toHaveText(letras[0].toUpperCase());
  // Con la clave del equipo se supera
  await A.responder(page, 'diferencias', A.clave(e.id));
  await expect(page).toHaveURL(new RegExp(`#/superada/${e.id}$`));
});

/** Arrastra la pieza «de» sobre la pieza «a» con el puntero (pointer events, como el dedo). */
async function arrastrar(page, de, a) {
  const o = await de.boundingBox();
  const d = await a.boundingBox();
  await page.mouse.move(o.x + o.width / 2, o.y + o.height / 2);
  await page.mouse.down();
  await page.mouse.move(d.x + d.width / 2, d.y + d.height / 2, { steps: 8 });
  await page.mouse.up();
}

/** Resuelve el puzle q como un equipo: trae a cada hueco su pieza (arrastrar) y la gira (tocar). Devuelve los gestos. */
async function resolverPuzle(page, inicio, q) {
  const piezas = inicio.map((x) => [...x]);
  const hueco = (h) => page.locator(`.pz-pieza[data-q="${q}"][data-h="${h}"]`);
  let gestos = 0;
  for (let h = 0; h < 9; h++) {
    const donde = piezas.findIndex((x) => x[0] === h);
    if (donde !== h) {
      // La rejilla entera a la vista: si no, el destino podría quedar fuera de la pantalla
      await page.locator(`#pz-${q}`).evaluate((el) => el.scrollIntoView({ block: 'center' }));
      await arrastrar(page, hueco(donde), hueco(h));
      [piezas[h], piezas[donde]] = [piezas[donde], piezas[h]];
      gestos++;
    }
    while (piezas[h][1] !== 0) {
      await hueco(h).click();
      piezas[h][1] = (piezas[h][1] + 1) % 4;
      gestos++;
    }
  }
  return gestos;
}

test('Imagen SSTV: 4 puzles; tocar gira, arrastrar cambia y cada puzle resuelto da su letra', async ({ page }) => {
  const e = C.estaciones.find((x) => x.prueba.tipo === 'sstv_puzle');
  test.skip(!e, 'Sin Imagen SSTV');
  const puzles = e.equipos['1'].prueba.puzles;
  const letras = A.respuestasPartes(e.id);
  expect(puzles).toHaveLength(4);
  // La misma mezcla y la misma clave para todos los equipos
  for (const k of Object.keys(e.equipos)) {
    expect(JSON.stringify(e.equipos[k].prueba)).toBe(JSON.stringify(e.equipos['1'].prueba));
    expect(A.clave(e.id, k)).toBe(A.clave(e.id, 1));
  }
  // Ninguna pieza empieza en su sitio y orientación correctos
  for (const pz of puzles) expect(pz.inicio.some(([p, g], h) => p === h && g === 0)).toBe(false);
  await A.empezar(page);
  await A.ponerRuta(page, A.rutaQueEmpiezaPor(e.id));
  await A.abrirEstacion(page, e.id);
  await A.sinScrollHorizontal(page);
  await expect(page.locator('.pz')).toHaveCount(4);
  await expect(page.locator('.pz-mini')).toHaveCount(4);
  // Tocar una pieza la gira 90° (y no cambia de sitio)
  const giro = () => page.locator('.pz-pieza[data-q="0"][data-h="0"]').getAttribute('aria-label');
  const antes = puzles[0].inicio[0][1];
  await page.locator('.pz-pieza[data-q="0"][data-h="0"]').click();
  const ahora = (antes + 1) % 4;
  expect(await giro()).toContain(ahora ? `girada ${ahora * 90} grados` : 'hueco 1.');
  await page.locator('.pz-pieza[data-q="0"][data-h="0"]').click();
  await page.locator('.pz-pieza[data-q="0"][data-h="0"]').click();
  await page.locator('.pz-pieza[data-q="0"][data-h="0"]').click();
  // Resolver los puzles 1 y 2 (arrastrando y tocando): cada uno da su letra
  for (const q of [0, 1]) {
    await resolverPuzle(page, puzles[q].inicio, q);
    await expect(page.locator(`#pz-letra-${q}`)).toHaveText(letras[q].toUpperCase());
    await expect(page.locator(`#pz-estado-${q}`)).toContainText('Imagen recibida');
  }
  // Una palabra equivocada no vale; la buena supera la estación
  await A.responder(page, 'sstv_puzle', 'luna');
  await expect(page.locator('#ayuda-prueba')).toContainText('Esa palabra no es');
  await A.responder(page, 'sstv_puzle', A.clave(e.id));
  await expect(page).toHaveURL(new RegExp(`#/superada/${e.id}$`));
});

test('¿Más o menos?: acertar sube la racha, fallar la pone a cero, y con 8 seguidas se supera', async ({ page }) => {
  const e = C.estaciones.find((x) => x.prueba.tipo === 'mas_menos');
  test.skip(!e, 'Sin ¿Más o menos?');
  const P = e.equipos['1'].prueba;
  expect(P.parejas.length).toBeGreaterThanOrEqual(24);
  for (const k of Object.keys(e.equipos)) expect(A.clave(e.id, k)).toBe(A.clave(e.id, 1));
  const partes = A.secretoEquipo(e.id).partes;
  const buena = (a, b) => partes.find((p) => p.opciones.includes(a) && p.opciones.includes(b)).respuestas[0];
  await A.empezar(page);
  await A.ponerRuta(page, A.rutaQueEmpiezaPor(e.id));
  await A.abrirEstacion(page, e.id);
  await A.sinScrollHorizontal(page);
  await expect(page.locator('#mm-racha-texto')).toHaveText('Racha: 0 de 8');
  const tocar = async (acertar) => {
    const nombres = await page.locator('.mm-nombre').allInnerTexts();
    const ok = nombres.indexOf(buena(nombres[0], nombres[1]));
    await page.locator(`.mm-carta[data-i="${acertar ? ok : 1 - ok}"]`).click();
    return ok;
  };
  // Dos aciertos: la racha sube y se ve el dato
  for (let n = 1; n <= 2; n++) {
    await tocar(true);
    await expect(page.locator('#mm-racha-texto')).toHaveText(`Racha: ${n} de 8`);
    await expect(page.locator('.mm-puntos i.on')).toHaveCount(n);
    await expect(page.locator('#mm-dato')).toContainText('¡Sí!');
    await page.locator('#mm-seguir').click();
  }
  // Un fallo: se marca la correcta, su dato, y la racha a cero
  const ok = await tocar(false);
  await expect(page.locator(`.mm-carta[data-i="${ok}"]`)).toHaveClass(/correcta/);
  await expect(page.locator('#mm-dato')).toContainText('Era ');
  await expect(page.locator('#mm-racha-texto')).toHaveText('Racha: 0 de 8');
  await expect(page.locator('#mm-seguir')).toHaveText('Otra racha');
  // Ocho seguidas: la estación se completa sola
  await A.responder(page, 'mas_menos', A.clave(e.id));
  await expect(page.locator('#mm-racha-texto')).toHaveText('Racha: 8 de 8');
  await A.continuarSiHaceFalta(page, 'mas_menos', e.id);
});

test('Ahorcado espacial: tildes, huecos, sin oxígeno sale la siguiente palabra, progreso guardado y se completa sola', async ({ page }) => {
  const e = C.estaciones.find((x) => x.prueba.tipo === 'ahorcado');
  test.skip(!e, 'Sin Ahorcado espacial');
  const P = e.equipos['1'].prueba;
  expect(P.rondas).toHaveLength(3);
  expect(P.fallos).toBe(6);
  for (const k of Object.keys(e.equipos)) expect(A.clave(e.id, k)).toBe(A.clave(e.id, 1));
  // Ninguna palabra en claro en la configuración pública
  const publico = JSON.stringify(e);
  for (const parte of A.secretoEquipo(e.id).partes) for (const w of parte.respuestas) expect(publico).not.toContain(w);
  await A.empezar(page);
  await A.ponerRuta(page, A.rutaQueEmpiezaPor(e.id));
  await A.abrirEstacion(page, e.id);
  await A.sinScrollHorizontal(page);
  const juego = page.locator('#ah-juego');
  await expect(page.locator('#ah-ronda')).toHaveText('Ronda 1 de 3');
  await expect(page.locator('#ah-categoria')).toHaveText(P.rondas[0].categoria);
  // El juego entero (astronauta, palabra y teclado) cabe en la pantalla
  const alto = await juego.evaluate((n) => n.getBoundingClientRect().height);
  expect(alto, 'el juego debe caber sin scroll').toBeLessThanOrEqual(page.viewportSize().height - 70);

  // Ronda 1, palabra 1: la «E» descubre también la «É» (SATÉLITE); un fallo gasta un tramo y se marca en gris
  let w = await A.palabraAhorcado(page);
  expect(w.palabra).toBe(0);
  const { estan, noEstan } = A.letrasAhorcado(w.texto);
  const conTilde = [...w.texto].find((c) => /[ÁÉÍÓÚ]/.test(c));
  if (conTilde) {
    const b = conTilde.normalize('NFD')[0];
    await A.tocarLetra(page, b);
    await expect(page.locator('.ah-letra.acertada').filter({ hasText: conTilde })).not.toHaveCount(0);
  }
  await A.tocarLetra(page, estan.find((k) => !conTilde || k !== conTilde.normalize('NFD')[0]));
  await expect(page.locator('.ah-teclado .w-tecla.ok')).toHaveCount(conTilde ? 2 : 1);
  await A.tocarLetra(page, noEstan[0]);
  await expect(page.locator(`.ah-teclado [data-k="${noEstan[0]}"]`)).toHaveClass(/\bno\b/);
  await expect(page.locator('.ah-escena')).toHaveAttribute('aria-label', 'Oxígeno: quedan 5 de 6');

  // El progreso sigue ahí al volver a abrir la app
  await page.reload();
  await A.abrirEstacion(page, e.id);
  await expect(page.locator('.ah-escena')).toHaveAttribute('aria-label', 'Oxígeno: quedan 5 de 6');
  await expect(page.locator('.ah-teclado .w-tecla.ok')).toHaveCount(conTilde ? 2 : 1);

  // Sin oxígeno: se enseña la palabra, aviso, y sale la SIGUIENTE de la ronda; tras la última vuelve la 1.ª
  const enRonda1 = A.secretoEquipo(e.id).partes[0].respuestas.length;
  for (const siguiente of [...Array.from({ length: enRonda1 - 1 }, (_, i) => i + 1), 0]) {
    await A.responder(page, 'ahorcado', 'sin-oxigeno');
    await expect(page.locator('#ah-msg')).toHaveText('Sin oxígeno: probad otra.');
    await expect(page.locator('.ah-letra:not(.fija):not(.acertada):not(.revelada)')).toHaveCount(0);
    await page.locator('#ah-seguir').click();
    await expect(juego).toHaveAttribute('data-palabra', String(siguiente));
    await expect(juego).toHaveAttribute('data-ronda', '0');
    await expect(page.locator('.ah-escena')).toHaveAttribute('aria-label', 'Oxígeno: quedan 6 de 6');
  }

  // Ronda 2 (dos palabras): el espacio es un hueco, no hay que adivinarlo
  await A.tocarLetra(page, 'A'); // (aunque falle: que haya algo en la palabra)
  w = await A.palabraAhorcado(page);
  for (const k of A.letrasAhorcado(w.texto).estan) if (await page.locator(`.ah-teclado [data-k="${k}"]`).isEnabled()) await A.tocarLetra(page, k);
  await page.locator('#ah-seguir').click();
  await expect(juego).toHaveAttribute('data-ronda', '1');
  await expect(page.locator('#ah-ronda')).toHaveText('Ronda 2 de 3');
  await expect(page.locator('.ah-grupo')).toHaveCount((await A.palabraAhorcado(page)).texto.split(' ').length);

  // Ronda 3 (la frase): también cabe entera, sin scroll horizontal
  w = await A.palabraAhorcado(page);
  for (const k of A.letrasAhorcado(w.texto).estan) if (await page.locator(`.ah-teclado [data-k="${k}"]`).isEnabled()) await A.tocarLetra(page, k);
  await page.locator('#ah-seguir').click();
  await expect(page.locator('#ah-ronda')).toHaveText('Ronda 3 de 3');
  await A.sinScrollHorizontal(page);
  const alto3 = await juego.evaluate((n) => n.getBoundingClientRect().height);
  expect(alto3, 'la ronda 3 debe caber sin scroll').toBeLessThanOrEqual(page.viewportSize().height - 70);

  // Al resolver la 3.ª ronda, la estación se completa sola
  await A.responder(page, 'ahorcado', A.clave(e.id));
  await A.continuarSiHaceFalta(page, 'ahorcado', e.id);
  await expect(page.locator('.letra-grande')).toHaveText(e.letraPalabra);
});

test('Morse: si escriben la pregunta, se les dice que es la pregunta', async ({ page }) => {
  const e = C.estaciones.find((x) => x.prueba.tipo === 'morse');
  test.skip(!e, 'Sin Morse');
  const partes = A.secretoEquipo(e.id).partes;
  await A.empezar(page);
  await A.ponerRuta(page, A.rutaQueEmpiezaPor(e.id));
  await A.abrirEstacion(page, e.id);
  await A.responder(page, 'morse', [partes[0].pregunta.toLowerCase(), '', '']);
  await expect(page.locator('#ayuda-prueba')).toContainText('eso es la pregunta');
});

test('Morse: cada equipo tiene sus preguntas y su clave; la de otro equipo no vale', async ({ page }) => {
  const e = C.estaciones.find((x) => x.prueba.tipo === 'morse');
  test.skip(!e || !e.equipos, 'Morse sin contenido por equipo');
  // Contenido distinto: no todos los equipos tienen las mismas tres preguntas
  const juegos = new Set(Object.values(e.equipos).map((q) => q.prueba.preguntas.map((p) => p.morse).join('|')));
  expect(juegos.size).toBeGreaterThan(1);
  expect(A.clave(e.id, 1)).not.toBe(A.clave(e.id, 2));
  await A.empezar(page);
  await A.ponerRuta(page, A.rutaQueEmpiezaPor(e.id));
  await A.abrirEstacion(page, e.id);
  // Se marca cada parte; las respuestas del equipo 2 no abren las preguntas del equipo 1 (salvo que coincidan)
  const mias = A.respuestasPartes(e.id, 1);
  const otras = A.respuestasPartes(e.id, 2).map((r, i) => (r === mias[i] ? 'respuestamala' : r));
  await A.responder(page, 'morse', otras);
  await expect(page.locator('.parte.acierto')).toHaveCount(otras.filter((r, i) => r !== 'respuestamala' && r === mias[i]).length);
  await expect(page).toHaveURL(new RegExp(`#/e/${e.id}/`));
  // Con las suyas (y una variante: «7» por «siete», mayúsculas…) se supera
  await A.responder(page, 'morse', A.respuestasPartes(e.id, 1, 1).map((r) => r.toUpperCase()));
  await expect(page).toHaveURL(new RegExp(`#/superada/${e.id}$`));
});

/* ---------- Espera de 15 s en las pruebas de opciones ---------- */
for (const tipo of OPCIONES) {
  test(`${tipo}: tras fallar, el botón se bloquea 15 s con cuenta atrás`, async ({ page }) => {
    const e = C.estaciones.find((x) => x.prueba.tipo === tipo);
    test.skip(!e, 'Sin esta prueba');
    await page.clock.install();
    await A.empezar(page);
    await A.ponerRuta(page, A.rutaQueEmpiezaPor(e.id));
    await A.abrirEstacion(page, e.id);
    await A.responder(page, tipo, A.respuestaMala(tipo, A.clave(e.id)));
    const boton = page.locator('#prueba .boton-ancho').last();
    await expect(page.locator('#ayuda-prueba')).toContainText('Pensadlo un poco', { timeout: 15000 });
    await expect(boton).toBeDisabled();
    await expect(boton).toContainText('Esperad');
    await page.clock.runFor(10000);
    await expect(boton).toBeDisabled();
    await page.clock.runFor(6000);
    await expect(boton).toBeEnabled();
    await expect(page.locator('#ayuda-prueba')).toHaveText('');
  });
}

/* ---------- Letras de la palabra final ---------- */
test('Las letras se acumulan en el orden en que se consiguen', async ({ page }) => {
  await A.empezar(page);
  const ruta = C.rutas[0];
  await A.ponerRuta(page, ruta.id);
  const esperadas = [];
  for (const id of ruta.orden.slice(0, 3)) {
    await A.superar(page, id);
    esperadas.push(A.est(id).letraPalabra);
    await expect(page.locator('.letra-grande')).toHaveText(esperadas[esperadas.length - 1]);
    await expect(page.locator('.letras-fila .letra-ficha:not(.hueco)')).toHaveText(esperadas);
    await expect(page.locator('.letras-fila .letra-ficha.hueco')).toHaveCount(C.estaciones.length - esperadas.length);
  }
  await page.goto('/?demo=1#/');
  await expect(page.locator('.letras-fila .letra-ficha:not(.hueco)')).toHaveText(esperadas);
});

/* ---------- Palabra final, meta y ranking ---------- */
test('Palabra final y meta: la meta no vale antes de tiempo, aparece al acertar y termina la partida', async ({ page }) => {
  await A.empezar(page);
  const ruta = C.rutas[0];
  await A.ponerRuta(page, ruta.id, A.hechas(ruta.id, 9));
  const metaURL = `#/meta/${SEC.meta.token}`;

  // Meta antes de tiempo
  await page.evaluate((h) => { location.hash = h; }, metaURL);
  await expect(page.locator('#vista')).toContainText('Aún no');
  await expect(page.locator('#vista')).toContainText('os falta la estación');

  // Última estación → «Última transmisión»
  await A.superar(page, ruta.orden[9]);
  await expect(page.locator('a[href="#/final"]')).toBeVisible();
  await page.goto('/?demo=1#/');
  await expect(page.locator('.m-meta')).toHaveCount(0); // la meta sigue oculta
  await page.evaluate((h) => { location.hash = h; }, metaURL);
  await expect(page.locator('#vista')).toContainText('palabra secreta');

  // Palabra: incorrecta (otro largo y mismo largo) y correcta
  await page.evaluate(() => { location.hash = '#/final'; });
  await expect(page.locator('.letras-final .letra-ficha')).toHaveCount(C.estaciones.length);
  await page.fill('#palabra-final', 'abc');
  await page.locator('#form-final button').click();
  await expect(page.locator('#ayuda-prueba')).toContainText('letras');
  const palabra = SEC.final.clave;
  await page.fill('#palabra-final', palabra.split('').reverse().join(''));
  await page.locator('#form-final button').click();
  await expect(page.locator('#ayuda-prueba')).toContainText('Esa no es la palabra');
  await page.fill('#palabra-final', palabra.toUpperCase());
  await page.locator('#form-final button').click();
  // Cinemática «¡Rumbo a la meta!» y, con «Ir a la meta», la pantalla de ir a la meta
  await expect(page).toHaveURL(/#\/rumbo$/);
  await page.locator('.cin-saltar').click();
  await page.locator('.cin-final .boton').click();
  await expect(page).toHaveURL(/#\/superada\/final$/);
  await expect(page.locator('.m-meta')).toHaveCount(1); // ya aparece en el mapa
  await expect(page.locator('.l-meta')).toHaveCount(1); // con el tramo desde la última estación

  // Meta
  await page.evaluate((h) => { location.hash = h; }, metaURL);
  await expect(page).toHaveURL(/#\/llegada$/); // cinemática «Podio»
  await page.locator('.cin-saltar').click();
  await expect(page.locator('.cin-puesto')).toHaveText('1.º puesto');
  await page.evaluate(() => { location.hash = '#/'; });
  await expect(page.locator('h1')).toContainText('Misión completada');
  const p = await page.evaluate(() => JSON.parse(localStorage.getItem('gk:demo:bd')).vivo.progreso[1]);
  expect(p.final && p.meta).toBeTruthy();
});

/* ---------- Cinemáticas: «¡Rumbo a la meta!» (palabra final) y «Podio» (meta) ---------- */
/** Equipo 1 con las 10 estaciones; opcionalmente, otros equipos ya en la meta (antes que él). */
async function antesDeLaPalabra(page, otrosEnMeta = 0) {
  await A.empezar(page);
  const ruta = C.rutas[0];
  await A.ponerRuta(page, ruta.id, A.hechas(ruta.id, 10));
  if (otrosEnMeta) {
    await page.evaluate(({ n, C }) => {
      const bd = JSON.parse(localStorage.getItem('gk:demo:bd'));
      const t0 = Date.now() - 3600000;
      for (let eq = 2; eq < 2 + n; eq++) {
        const p = {};
        C.rutas[eq - 1].orden.forEach((s, i) => { p[s] = { t: t0 + i * 1000 }; });
        p.final = { t: t0 + 20000 + eq };
        p.meta = { t: t0 + 30000 + eq };
        bd.vivo.progreso[eq] = p;
      }
      localStorage.setItem('gk:demo:bd', JSON.stringify(bd));
    }, { n: otrosEnMeta, C });
    await page.reload();
  }
}
async function acertarPalabra(page) {
  await page.evaluate(() => { location.hash = '#/final'; });
  await page.fill('#palabra-final', SEC.final.clave);
  await page.locator('#form-final button').click();
}
const escanearMeta = (page) => page.evaluate((h) => { location.hash = h; }, `#/meta/${SEC.meta.token}`);

test('Cinemática «¡Rumbo a la meta!»: sale al acertar la palabra, una sola vez, y lleva a la pantalla de la meta', async ({ page }) => {
  await antesDeLaPalabra(page);
  await acertarPalabra(page);
  await expect(page).toHaveURL(/#\/rumbo$/);
  const cin = page.locator('.cin-rumbo');
  await expect(cin).toBeVisible();
  await expect(page.locator('.cin-saltar')).toBeVisible(); // «Saltar» desde el principio
  await expect(page.locator('.cin-letra')).toHaveCount(SEC.final.clave.length);
  await expect(page.locator('.cin-palabra')).toHaveAttribute('aria-label', SEC.final.clave.toUpperCase());
  await expect(page.locator('.cin-tramo')).toHaveCount(1); // línea de la última estación a la meta
  await expect(page.locator('.cin-meta')).toHaveCount(1);
  // Se deja terminar sola (6–8 s): queda el texto final y el botón
  await expect(cin).toHaveClass(/cin-fin/, { timeout: 10000 });
  await expect(page.locator('.cin-final')).toContainText('¡Rumbo a la meta!');
  await expect(page.locator('.cin-final')).toContainText('El primer equipo en escanear su QR gana');
  await expect(page.locator('.cin-saltar')).toBeHidden();
  await page.locator('.cin-final .boton').click();
  await expect(page).toHaveURL(/#\/superada\/final$/);
  await expect(page.locator('.cin')).toHaveCount(0);
  await expect(page.locator('a[href="#/escanear"]').first()).toBeVisible();
  // Ya vista: al volver a esta pantalla no sale; con «Ver de nuevo», sí
  await page.reload();
  await expect(page.locator('.cin')).toHaveCount(0);
  await page.locator('#ver-rumbo').click();
  await expect(page).toHaveURL(/#\/rumbo$/);
  await expect(page.locator('.cin-rumbo')).toBeVisible();
  await A.sinScrollHorizontal(page);
});

test('Cinemáticas: «Saltar» va al final enseguida (rumbo y podio)', async ({ page }) => {
  await antesDeLaPalabra(page);
  await acertarPalabra(page);
  await page.locator('.cin-saltar').click();
  await expect(page.locator('.cin-rumbo')).toHaveClass(/cin-fin/, { timeout: 1000 });
  await expect(page.locator('.cin-final .boton')).toBeVisible({ timeout: 1000 });
  await expect(page.locator('.cin-cohete')).toBeHidden();
  await page.locator('.cin-final .boton').click();
  await escanearMeta(page);
  await expect(page).toHaveURL(/#\/llegada$/);
  await page.locator('.cin-saltar').click();
  await expect(page.locator('.cin-podio')).toHaveClass(/cin-fin/, { timeout: 1000 });
  await expect(page.locator('.cin-final .boton')).toBeVisible({ timeout: 1000 });
  await expect(page.locator('.cin-cuenta')).toBeHidden();
});

test('Cinemática «Podio»: el primero en llegar sube al 1.er escalón con su medalla de oro y su tiempo', async ({ page }) => {
  await antesDeLaPalabra(page);
  await acertarPalabra(page);
  await page.locator('.cin-saltar').click();
  await page.locator('.cin-final .boton').click();
  await escanearMeta(page);
  await expect(page).toHaveURL(/#\/llegada$/);
  await expect(page.locator('.cin-cuenta b')).toHaveText(['3', '2', '1']);
  await expect(page.locator('.cin-capsula')).toHaveCount(1);
  await expect(page.locator('.cin-podio')).toHaveClass(/cin-fin/, { timeout: 10000 });
  await expect(page.locator('.cin-puesto')).toHaveText('1.º puesto');
  await expect(page.locator('.cin-peldano')).toHaveCount(3);
  await expect(page.locator('.cin-equipo.p1 .cin-medalla.oro')).toHaveCount(1);
  await expect(page.locator('.cin-peldano.p1')).toHaveClass(/propio/);
  await expect(page.locator('.cin-resultado .cin-titulo')).toHaveText(nombreEquipo(1));
  await expect(page.locator('.cin-tiempo')).toContainText(/\d\d:\d\d/);
  await expect(page.locator('.cin-lluvia .cin-estrella').first()).toBeAttached();
  await page.locator('.cin-final .boton').click();
  await expect(page).toHaveURL(/#\/ranking$/);
  // Una sola vez: en la ruta no vuelve a salir, pero está «Ver de nuevo la llegada»
  await page.evaluate(() => { location.hash = '#/'; });
  await expect(page.locator('.cin')).toHaveCount(0);
  await page.locator('#ver-llegada').click();
  await expect(page.locator('.cin-podio')).toBeVisible();
});

test('Cinemática «Podio»: con tres equipos antes, «Misión completada · puesto 4», sin podio', async ({ page }) => {
  await antesDeLaPalabra(page, 3);
  await acertarPalabra(page);
  await page.locator('.cin-saltar').click();
  await page.locator('.cin-final .boton').click();
  await escanearMeta(page);
  await page.locator('.cin-saltar').click();
  await expect(page.locator('.cin-puesto')).toHaveText('Misión completada · puesto 4');
  await expect(page.locator('.cin-peldanos')).toHaveCount(0);
  await expect(page.locator('.cin-llegada')).toHaveCount(1);
  await expect(page.locator('.cin-podio')).toHaveClass(/cin-sin-podio/);
});

test('Cinemática «Podio»: sin la llegada en el servidor, «Calculando vuestro puesto…», y se actualiza sola', async ({ page }) => {
  await A.empezar(page);
  const ruta = C.rutas[0];
  await A.ponerRuta(page, ruta.id, { ...A.hechas(ruta.id, 10), final: { t: Date.now() - 1000 } });
  // En el móvil ya consta la meta, pero en el servidor todavía no (como sin cobertura)
  await page.evaluate(() => {
    const l = JSON.parse(localStorage.getItem('gk:progreso:1'));
    l.meta = { t: Date.now() };
    localStorage.setItem('gk:progreso:1', JSON.stringify(l));
    location.hash = '#/llegada';
  });
  await page.locator('.cin-saltar').click();
  await expect(page.locator('.cin-calculando')).toContainText('Calculando vuestro puesto');
  // Llega la meta al servidor (vuelve la cobertura): el puesto aparece solo
  await page.evaluate((token) => GK.datos.encolar({ tipo: 'completar', equipo: 1, estacion: 'meta', token, clave: 'llegada' }), SEC.meta.token);
  await expect(page.locator('.cin-puesto')).toHaveText('1.º puesto');
});

test('Cinemáticas con prefers-reduced-motion: versión estática (el final con un fundido)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await antesDeLaPalabra(page);
  await acertarPalabra(page);
  await expect(page.locator('.cin-rumbo')).toHaveClass(/cin-estatica/);
  await expect(page.locator('.cin-rumbo')).toHaveClass(/cin-fin/);
  await expect(page.locator('.cin-final .boton')).toBeVisible({ timeout: 1500 });
  await expect(page.locator('.cin-cohete')).toBeHidden();
  await expect(page.locator('.cin-meta-pulso').first()).toBeHidden();
  await page.locator('.cin-final .boton').click();
  await escanearMeta(page);
  await expect(page.locator('.cin-podio')).toHaveClass(/cin-estatica/);
  await expect(page.locator('.cin-puesto')).toHaveText('1.º puesto', { timeout: 1500 });
  await expect(page.locator('.cin-lluvia')).toBeHidden();
  await expect(page.locator('.cin-cuenta')).toBeHidden();
});

test('Ranking: aviso grande «¡Equipo N llega a la meta! · N.º puesto», uno detrás de otro', async ({ page }) => {
  await A.empezar(page);
  await page.goto('/ranking.html');
  await expect(page.locator('#podio .podio-equipo')).toHaveCount(3);
  // Llegan dos equipos a la vez (se escribe desde otra pestaña: el ranking se entera como con el servidor)
  const otra = await page.context().newPage();
  await otra.goto('/?demo=1');
  await otra.evaluate((C) => {
    const bd = JSON.parse(localStorage.getItem('gk:demo:bd'));
    const t0 = Date.now() - 3600000;
    bd.vivo.estado = { iniciada: true, inicio: t0 };
    const A = (bd.vivo.asignacion = { equipos: {}, rutas: {} });
    for (const [eq, m] of [[4, 2400000], [2, 2600000]]) {
      A.equipos[eq] = String(eq); A.rutas[eq] = String(eq);
      const p = {};
      C.rutas[eq - 1].orden.forEach((s, i) => { p[s] = { t: t0 + (i + 1) * 60000 }; });
      p.final = { t: t0 + m - 100000 };
      p.meta = { t: t0 + m };
      bd.vivo.progreso[eq] = p;
    }
    localStorage.setItem('gk:demo:bd', JSON.stringify(bd));
  }, C);
  const aviso = page.locator('.llegada-grande');
  await expect(aviso).toHaveCount(1, { timeout: 8000 });
  await expect(aviso).toContainText(`¡${nombreEquipo(4)} llega a la meta!`);
  await expect(aviso).toContainText('1.º puesto');
  await expect(aviso).toContainText(nombreEquipo(2), { timeout: 8000 });
  await expect(aviso).toContainText('2.º puesto');
  await expect(aviso).toHaveCount(0, { timeout: 8000 });
});

test('Ranking: un equipo termina al llegar a la meta y va por delante', async ({ page }) => {
  await A.empezar(page);
  const t0 = Date.now() - 3600000;
  await page.evaluate(({ C, t0 }) => {
    const bd = JSON.parse(localStorage.getItem('gk:demo:bd'));
    bd.vivo.estado = { iniciada: true, inicio: t0 };
    const A = (bd.vivo.asignacion = { equipos: {}, rutas: {} });
    const pon = (eq, n, extra) => {
      A.equipos[eq] = String(eq); A.rutas[eq] = String(eq);
      const p = {};
      C.rutas[eq - 1].orden.slice(0, n).forEach((s, i) => { p[s] = { t: t0 + (i + 1) * 60000 }; });
      bd.vivo.progreso[eq] = Object.assign(p, extra || {});
    };
    pon(1, 10);                                                                  // todas las estaciones, sin palabra
    pon(2, 10, { final: { t: t0 + 700000 } });                                   // con palabra
    pon(3, 10, { final: { t: t0 + 800000 }, meta: { t: t0 + 2533000 } });       // en meta (42:13)
    pon(4, 6);
    localStorage.setItem('gk:demo:bd', JSON.stringify(bd));
  }, { C, t0 });
  await page.goto('/ranking.html');
  await expect(page.locator('.podio-equipo.p1')).toContainText('Equipo 3');
  await expect(page.locator('.podio-equipo.p1')).toContainText('42:13');
  await expect(page.locator('.podio-equipo.p2')).toContainText('Equipo 2');
  await expect(page.locator('.podio-equipo.p3')).toContainText('Equipo 1');
  await A.sinScrollHorizontal(page);
});

/* ---------- El «servidor» (modo demo, mismas reglas de orden) rechaza saltarse la palabra o la meta ---------- */
test('No se puede registrar la meta sin la palabra ni la palabra sin las estaciones', async ({ page }) => {
  await A.empezar(page);
  const ruta = C.rutas[0];
  await A.ponerRuta(page, ruta.id, A.hechas(ruta.id, 9));
  const rechazos = await page.evaluate(async () => {
    GK.datos.encolar({ tipo: 'completar', equipo: 1, estacion: 'final', token: 'palabra', clave: 'x' });
    GK.datos.encolar({ tipo: 'completar', equipo: 1, estacion: 'meta', token: 'x', clave: 'llegada' });
    await new Promise((r) => setTimeout(r, 500));
    const bd = JSON.parse(localStorage.getItem('gk:demo:bd'));
    return { final: !!bd.vivo.progreso[1].final, meta: !!bd.vivo.progreso[1].meta, cola: GK.datos.pendientes().map((o) => [o.estacion, !!o.rechazada]) };
  });
  expect(rechazos.final).toBe(false);
  expect(rechazos.meta).toBe(false);
  expect(rechazos.cola[0]).toEqual(['final', true]);
});

/* ---------- Panel de organización ---------- */
test('Panel: columna Final y marcar la meta a mano', async ({ page }) => {
  await A.empezar(page);
  const ruta = C.rutas[0];
  await A.ponerRuta(page, ruta.id, A.hechas(ruta.id, 10));
  await page.goto('/organizacion.html');
  await page.fill('#codigo-org', SEC.organizacion.codigo);
  await page.locator('#form-org button').click();
  await expect(page.locator('.tabla-org')).toBeVisible();
  const fila = page.locator('#filas tr').first();
  await expect(fila.locator('.final-estado')).toContainText('descifrando');
  await fila.locator('[data-meta="1"]').click();
  await page.locator('.modal .boton').click();
  await expect(fila.locator('.final-estado')).toContainText('EN META');
  await A.sinScrollHorizontal(page);
});

/* ---------- Vistas: nada se sale de la pantalla ---------- */
test('Vistas sin desbordamiento: ruta, superada, última transmisión', async ({ page }) => {
  await A.empezar(page);
  const ruta = C.rutas[0];
  await A.ponerRuta(page, ruta.id, A.hechas(ruta.id, 9));
  await A.sinScrollHorizontal(page);
  await A.superar(page, ruta.orden[9]);
  await A.sinScrollHorizontal(page);
  await page.evaluate(() => { location.hash = '#/final'; });
  await expect(page.locator('#palabra-final')).toBeVisible();
  await A.sinScrollHorizontal(page);
});
