// Pruebas de la gymkhana: cada prueba, pista, espera tras fallo, letras, palabra final, meta, ranking y vistas.
const { test, expect } = require('@playwright/test');
const A = require('./ayudas');
const { C, SEC } = A;

const OPCIONES = ['geoguessr', 'real_o_ia', 'bulo_verdad'];

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
  // 1.ª: «El …» + mayúsculas · 2.ª: su segunda variante · 3.ª: «The …» delante de la variante sin artículo
  const [t1] = A.titulosPelis(0);
  const [, t2, t3] = A.titulosPelis(1);
  const quitarTildes = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  await A.responder(page, 'pelis', ['El ' + t1.toUpperCase(), quitarTildes(t2).toLowerCase(), '  ' + t3 + '!']);
  await expect(page).toHaveURL(new RegExp(`#/superada/${e.id}$`));
});

test('Pelis espaciales: un título equivocado se marca y no supera la estación', async ({ page }) => {
  const e = C.estaciones.find((x) => x.prueba.tipo === 'pelis');
  test.skip(!e, 'Sin Pelis espaciales');
  await A.empezar(page);
  await A.ponerRuta(page, A.rutaQueEmpiezaPor(e.id));
  await A.abrirEstacion(page, e.id);
  await A.responder(page, 'pelis', A.respuestaMala('pelis'));
  await expect(page.locator('.peli[data-i="1"]')).toHaveClass(/fallo/);
  await expect(page.locator('.peli[data-i="0"]')).toHaveClass(/acierto/);
  await expect(page.locator('.peli[data-i="2"]')).toHaveClass(/acierto/);
  await expect(page.locator('#ayuda-prueba')).toContainText('Lleváis 2 de 3');
  await expect(page).toHaveURL(new RegExp(`#/e/${e.id}/`));
  // Corrigen solo la que falla y la estación se supera
  await page.fill('#peli-1', A.titulosPelis(0)[1]);
  await page.locator('#pelis-comprobar').click();
  await expect(page).toHaveURL(new RegExp(`#/superada/${e.id}$`));
});

test('Morse: si escriben la pregunta, se les dice que es la pregunta', async ({ page }) => {
  const e = C.estaciones.find((x) => x.prueba.tipo === 'morse');
  test.skip(!e, 'Sin Morse');
  const pregunta = require('child_process').execFileSync('python', ['-c',
    `import sys; sys.path.insert(0, '../herramientas'); import generar_torneo as g; print(g.descifrar_morse(sys.argv[1]))`, e.prueba.cartel]).toString().trim();
  await A.empezar(page);
  await A.ponerRuta(page, A.rutaQueEmpiezaPor(e.id));
  await A.abrirEstacion(page, e.id);
  await A.responder(page, 'morse', pregunta);
  await expect(page.locator('#ayuda-prueba')).toContainText('eso es la pregunta');
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
  await expect(page).toHaveURL(/#\/superada\/final$/);
  await expect(page.locator('.m-meta')).toHaveCount(1); // ya aparece en el mapa
  await expect(page.locator('.l-meta')).toHaveCount(1); // con el tramo desde la última estación

  // Meta
  await page.evaluate((h) => { location.hash = h; }, metaURL);
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.locator('h1')).toContainText('Misión completada');
  const p = await page.evaluate(() => JSON.parse(localStorage.getItem('gk:demo:bd')).vivo.progreso[1]);
  expect(p.final && p.meta).toBeTruthy();
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
