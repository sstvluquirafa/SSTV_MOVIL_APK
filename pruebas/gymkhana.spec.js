// Pruebas de la gymkhana: cada prueba, pista, espera tras fallo, letras, palabra final, meta, ranking y vistas.
const { test, expect } = require('@playwright/test');
const A = require('./ayudas');
const { C, SEC } = A;

const OPCIONES = ['geoguessr', 'bulo_verdad'];

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

test('Imagen SSTV: resolver un cuadrante tocando piezas da su letra', async ({ page }) => {
  const e = C.estaciones.find((x) => x.prueba.tipo === 'sstv_puzle');
  test.skip(!e, 'Sin Imagen SSTV');
  const Q = e.equipos['1'].prueba.cuadrantes[0];
  const letras = A.respuestasPartes(e.id);
  await A.empezar(page);
  await A.ponerRuta(page, A.rutaQueEmpiezaPor(e.id));
  await A.abrirEstacion(page, e.id);
  await A.sinScrollHorizontal(page);
  await expect(page.locator('#sstv-letra-0')).toHaveText('');
  // Como lo haría un equipo: para cada hueco, traer su pieza (dos toques) y girarla (tocar la elegida)
  const piezas = Q.inicio.map((x) => [...x]);
  const tocar = (h) => page.locator(`.sstv-pieza[data-q="0"][data-h="${h}"]`).click();
  for (let h = 0; h < 9; h++) {
    const donde = piezas.findIndex((x) => x[0] === h);
    if (donde !== h) {
      await tocar(donde); await tocar(h);
      [piezas[h], piezas[donde]] = [piezas[donde], piezas[h]];
    }
    if (piezas[h][1] !== 0 && !(await page.locator('#sstv-letra-0').innerText())) {
      await tocar(h);
      while (piezas[h][1] !== 0) { await tocar(h); piezas[h][1] = (piezas[h][1] + 1) % 4; if (await page.locator('#sstv-letra-0').innerText()) break; }
      // deseleccionar (elegir otra pieza de otro cuadrante no cambia nada)
      if (!(await page.locator('#sstv-letra-0').innerText())) await page.locator('.sstv-pieza[data-q="1"][data-h="0"]').click();
    }
  }
  await expect(page.locator('#sstv-letra-0')).toHaveText(letras[0].toUpperCase());
  await A.responder(page, 'sstv_puzle', A.clave(e.id));
  await expect(page).toHaveURL(new RegExp(`#/superada/${e.id}$`));
});

test('Escotilla: acertijos fijos iguales para todos, cifras para tachar y las dos escotillas', async ({ page }) => {
  const e = C.estaciones.find((x) => x.prueba.tipo === 'caja_fuerte');
  test.skip(!e || !e.equipos, 'Sin escotilla');
  // El mismo acertijo y la misma clave para todos los equipos
  const ids = Object.keys(e.equipos);
  const pistas = (k) => JSON.stringify(e.equipos[k].prueba.escotillas);
  for (const k of ids) {
    expect(pistas(k)).toBe(pistas(ids[0]));
    expect(A.clave(e.id, k)).toBe(A.clave(e.id, ids[0]));
  }
  expect(e.equipos[ids[0]].prueba.escotillas.map((x) => x.pistas.length)).toEqual([5, 5]);
  await page.clock.install();
  await A.empezar(page);
  await A.ponerRuta(page, A.rutaQueEmpiezaPor(e.id));
  await A.abrirEstacion(page, e.id);
  await A.sinScrollHorizontal(page);
  await expect(page.locator('#prueba .nota-prueba')).toContainText('ninguna se repite');
  // Tachar y destachar una cifra (solo visual)
  const siete = page.locator('.tachar-cifra[data-d="7"]');
  await siete.click();
  await expect(siete).toHaveClass(/tachada/);
  await expect(siete).toHaveAttribute('aria-pressed', 'true');
  await siete.click();
  await expect(siete).not.toHaveClass(/tachada/);
  // Las dos escotillas, una tras otra
  await A.responder(page, 'caja_fuerte', A.clave(e.id));
  await page.clock.fastForward(3000);
  await expect(page).toHaveURL(new RegExp(`#/superada/${e.id}$`));
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
