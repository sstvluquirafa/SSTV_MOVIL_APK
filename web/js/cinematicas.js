/*
 * Cinemáticas cortas (6–8 s), hechas solo con HTML, CSS y SVG (sin vídeos): funcionan sin cobertura.
 *   GK.cinematicas.rumbo(o)  → «¡Rumbo a la meta!», al acertar la palabra final.
 *   GK.cinematicas.podio(o)  → «Podio», al escanear el QR de la meta.
 *
 * Cómo están hechas: el estado BASE de cada elemento es el fotograma final; la secuencia son animaciones CSS con
 * «animation-fill-mode: both» y su retraso. Así «Saltar» y la versión con prefers-reduced-motion solo tienen que
 * quitar las animaciones (clase «cin-fin») para quedarse en el final. Las vibraciones van con GK.vibrar (solo si el
 * móvil lo permite y tras un toque).
 *
 * Se ven una sola vez por equipo y momento (app.js lo guarda en el móvil) y la pantalla siguiente tiene «Ver de nuevo».
 */
(function () {
  'use strict';
  const GK = window.GK;
  const C = window.GK_CONFIG;
  const MEDALLAS = ['', 'oro', 'plata', 'bronce'];
  const ORDINAL = (n) => `${n}.º`;

  /** Barajado determinista (el mismo para el mismo equipo) que no deja la palabra ordenada. */
  function barajar(n, semilla) {
    const a = Array.from({ length: n }, (_, i) => i);
    let x = (semilla * 7919 + 17) % 233280;
    const azar = () => { x = (x * 9301 + 49297) % 233280; return x / 233280; };
    for (let intento = 0; intento < 5; intento++) {
      for (let i = n - 1; i > 0; i--) { const j = Math.floor(azar() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      if (a.some((v, i) => v !== i)) break;
    }
    return { orden: a, azar };
  }

  /**
   * Capa a pantalla completa con la banda SSTV y «Saltar». momentos: [[ms, función]] (vibraciones, textos…).
   * Devuelve { capa, cuerpo, fin(), limpiar(), terminada() }.
   */
  function capa(tipo, etiqueta, momentos, duracion) {
    const el = document.createElement('div');
    el.className = `cin cin-${tipo}`;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', etiqueta);
    el.innerHTML = `
      ${GK.banda(null, 'cin-banda')}
      <button type="button" class="cin-saltar">Saltar <span aria-hidden="true">»</span></button>
      <div class="cin-cuerpo"></div>`;
    document.body.appendChild(el);
    document.body.classList.add('con-cinematica');
    const temporizadores = [];
    let acabada = false;
    const alAcabar = [];
    function fin() {
      if (acabada) return;
      acabada = true;
      temporizadores.forEach(clearTimeout);
      el.classList.add('cin-fin');
      alAcabar.forEach((f) => f());
      const b = el.querySelector('.cin-final .boton');
      if (b) { try { b.focus({ preventScroll: true }); } catch (e) { /* */ } }
    }
    const esc = (ev) => { if (ev.key === 'Escape') fin(); };
    document.addEventListener('keydown', esc);
    el.querySelector('.cin-saltar').addEventListener('click', fin);
    function arrancar() {
      if (GK.menosMovimiento()) {
        // Versión estática: el fotograma final con un fundido
        el.classList.add('cin-estatica');
        fin();
        return;
      }
      momentos.forEach(([ms, f]) => temporizadores.push(setTimeout(f, ms)));
      temporizadores.push(setTimeout(fin, duracion));
      try { el.querySelector('.cin-saltar').focus({ preventScroll: true }); } catch (e) { /* */ }
    }
    return {
      capa: el,
      cuerpo: el.querySelector('.cin-cuerpo'),
      arrancar,
      fin,
      alAcabar: (f) => alAcabar.push(f),
      terminada: () => acabada,
      limpiar() {
        temporizadores.forEach(clearTimeout);
        document.removeEventListener('keydown', esc);
        el.remove();
        if (!document.querySelector('.cin')) document.body.classList.remove('con-cinematica');
      },
    };
  }

  /* ---------------------------------------------------------------------------------------------
   * 1) ¡RUMBO A LA META!  o = { palabra, equipo, ultima: {x, y, letra}, meta: {x, y, nombre}, alIr() }
   * ------------------------------------------------------------------------------------------- */
  function mapaMeta(ultima, meta) {
    const M = C.mapa;
    const pad = 260;
    const cx = (ultima.x + meta.x) / 2;
    const cy = (ultima.y + meta.y) / 2;
    let w = Math.max(Math.abs(ultima.x - meta.x) + pad * 2, 900);
    let h = Math.max(Math.abs(ultima.y - meta.y) + pad * 2, w * 0.6);
    w = Math.max(w, h / 0.75);
    const x0 = Math.max(0, Math.min(M.ancho - w, cx - w / 2));
    const y0 = Math.max(0, Math.min(M.alto - h, cy - h / 2));
    const largo = Math.hypot(meta.x - ultima.x, meta.y - ultima.y);
    const r = Math.round(w * 0.035);
    return `<svg class="cin-mapa-svg" viewBox="${x0} ${y0} ${w} ${h}" preserveAspectRatio="xMidYMid slice" role="img"
        aria-label="Mapa: de la estación ${GK.html(ultima.letra)} a la meta">
      <image href="${GK.html(M.imagen)}" x="0" y="0" width="${M.ancho}" height="${M.alto}"/>
      <rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="#050816" opacity=".35"/>
      <line class="cin-tramo" x1="${ultima.x}" y1="${ultima.y}" x2="${meta.x}" y2="${meta.y}" stroke-width="${r * 0.32}"
        style="--largo:${Math.ceil(largo)}" stroke-dasharray="${Math.ceil(largo)}"/>
      <g class="cin-est"><circle cx="${ultima.x}" cy="${ultima.y}" r="${r}"/><text x="${ultima.x}" y="${ultima.y}" dy=".36em" style="font-size:${r}px">${GK.html(ultima.letra)}</text></g>
      <g class="cin-meta" style="transform-origin:${meta.x}px ${meta.y}px">
        <circle class="cin-meta-pulso" cx="${meta.x}" cy="${meta.y}" r="${r * 1.3}" style="transform-origin:${meta.x}px ${meta.y}px"/>
        <circle class="cin-meta-pulso p2" cx="${meta.x}" cy="${meta.y}" r="${r * 1.3}" style="transform-origin:${meta.x}px ${meta.y}px"/>
        <circle class="cin-meta-fondo" cx="${meta.x}" cy="${meta.y}" r="${r * 1.3}"/>
        <text x="${meta.x}" y="${meta.y}" dy=".36em" style="font-size:${Math.round(r * 1.2)}px">M</text>
      </g>
    </svg>`;
  }

  const COHETE = `<svg class="cin-cohete-svg" viewBox="0 0 60 120" aria-hidden="true">
    <path d="M30,4 C44,18 48,40 46,74 L14,74 C12,40 16,18 30,4 Z" fill="#eef1fa" stroke="#0b1230" stroke-width="3"/>
    <circle cx="30" cy="40" r="8" fill="#5ee6d0" stroke="#0b1230" stroke-width="3"/>
    <path d="M14,58 L2,84 L16,78 Z M46,58 L58,84 L44,78 Z" fill="#d97706" stroke="#0b1230" stroke-width="3" stroke-linejoin="round"/>
    <path d="M20,74 L40,74 L36,84 L24,84 Z" fill="#94a3b8" stroke="#0b1230" stroke-width="3" stroke-linejoin="round"/>
    <path class="cin-llama" d="M24,86 Q30,118 36,86 Z" fill="#ffb627"/>
    <path class="cin-llama" d="M27,86 Q30,104 33,86 Z" fill="#fff4c2"/>
  </svg>`;

  function rumbo(o) {
    const letras = [...String(o.palabra || '').toUpperCase()];
    const { orden, azar } = barajar(letras.length, Number(o.equipo) || 1);
    const momentos = [
      [2300, () => GK.vibrar(60)],
      [3500, () => GK.vibrar([40, 40, 90])],
      [3900, () => GK.vibrar(160)],
      [5900, () => GK.vibrar([60, 60, 60])],
    ];
    const c = capa('rumbo', '¡Rumbo a la meta!', momentos, 7800);
    // Cada letra sale de la casilla donde estaba desordenada (y de un poco más arriba o abajo) hacia la suya
    const fichas = letras.map((l, i) => {
      const desde = orden.indexOf(i);
      const dy = Math.round((azar() < 0.5 ? -1 : 1) * (90 + azar() * 120));
      const giro = Math.round((azar() - 0.5) * 120);
      return `<span class="cin-letra" style="--k:${desde - i};--dy:${dy}px;--giro:${giro}deg;--i:${i}">${GK.html(l)}</span>`;
    }).join('');
    c.cuerpo.innerHTML = `
      <div class="cin-escena">
        <div class="cin-palabra-caja">
          <div class="cin-palabra" style="--n:${letras.length}" aria-label="${GK.html(letras.join(''))}">${fichas}
            <i class="cin-ruido" aria-hidden="true"></i>
            <i class="cin-barrido" aria-hidden="true">${GK.banda(null, 'cin-barrido-banda')}</i>
          </div>
          <p class="cin-descifrada">${GK.icono('satelite')} Transmisión descifrada</p>
        </div>
        <div class="cin-mapa">${mapaMeta(o.ultima, o.meta)}</div>
        <div class="cin-final" aria-live="polite">
          <h2 class="cin-titulo">¡Rumbo a la <span class="ambar">meta</span>!</h2>
          <p class="cin-texto">El primer equipo en escanear su QR gana</p>
          <button type="button" class="boton boton-ancho boton-grande">${GK.icono('bandera')} Ir a la meta</button>
        </div>
      </div>
      <div class="cin-cohete" aria-hidden="true"><i class="cin-estela"></i>${COHETE}</div>`;
    c.cuerpo.querySelector('.cin-final .boton').addEventListener('click', () => o.alIr && o.alIr());
    c.arrancar();
    return c;
  }

  /* ---------------------------------------------------------------------------------------------
   * 2) PODIO  o = { equipo: {id, nombre}, alRanking() } → { …capa, puesto(n | null, tiempo) }
   * ------------------------------------------------------------------------------------------- */
  const CAPSULA = `<svg class="cin-capsula-svg" viewBox="0 0 120 170" aria-hidden="true">
    <g class="cin-paracaidas">
      <path d="M8,58 C8,18 112,18 112,58 C100,50 86,50 74,58 C66,50 54,50 46,58 C34,50 20,50 8,58 Z" fill="#d97706" stroke="#0b1230" stroke-width="3" stroke-linejoin="round"/>
      <path d="M46,58 C50,30 70,30 74,58" fill="#ffb627" stroke="#0b1230" stroke-width="2"/>
      <path d="M8,58 L48,118 M46,58 L54,116 M74,58 L66,116 M112,58 L72,118" stroke="#cbd5e1" stroke-width="1.6" fill="none"/>
    </g>
    <path d="M42,116 L78,116 L92,160 L28,160 Z" fill="#eef1fa" stroke="#0b1230" stroke-width="3" stroke-linejoin="round"/>
    <circle cx="60" cy="136" r="9" fill="#5ee6d0" stroke="#0b1230" stroke-width="3"/>
    <rect x="24" y="158" width="72" height="8" rx="3" fill="#94a3b8" stroke="#0b1230" stroke-width="3"/>
  </svg>`;

  function estrellas(n) {
    const cols = (C.estaciones || []).map((e) => e.color).filter(Boolean);
    let html = '';
    for (let i = 0; i < n; i++) {
      const izq = (i * 37 + 11) % 100;
      const col = cols[i % cols.length] || '#ffb627';
      html += `<i class="cin-estrella" style="left:${izq}%;--c:${col};--d:${((i * 53) % 100) / 100 * 1.6}s;--t:${1.4 + ((i * 29) % 10) / 10}s;--s:${0.7 + ((i * 17) % 7) / 10}"></i>`;
    }
    return `<div class="cin-lluvia" aria-hidden="true">${html}</div>`;
  }

  function podio(o) {
    const momentos = [
      [0, () => GK.vibrar(40)], [800, () => GK.vibrar(40)], [1600, () => GK.vibrar(40)],
      [4300, () => GK.vibrar(140)],
    ];
    const c = capa('podio', 'Llegada a la meta', momentos, 7800);
    const inicio = Date.now();
    c.cuerpo.innerHTML = `
      <div class="cin-escena">
        <div class="cin-escenario">
          <div class="cin-cuenta" aria-hidden="true"><b>3</b><b>2</b><b>1</b></div>
          <div class="cin-capsula" aria-hidden="true">${CAPSULA}</div>
          <i class="cin-polvo" aria-hidden="true"></i>
          <div class="cin-resultado-escena"></div>
          <i class="cin-suelo" aria-hidden="true"></i>
        </div>
        <div class="cin-final" aria-live="polite">
          <div class="cin-resultado"><p class="cin-calculando"><i class="cin-girando" aria-hidden="true"></i> Calculando vuestro puesto…</p></div>
          <a class="boton boton-ancho boton-grande" href="#/ranking">${GK.icono('podio')} Ver el ranking</a>
        </div>
      </div>`;
    c.cuerpo.querySelector('.cin-final .boton').addEventListener('click', (ev) => {
      if (o.alRanking) { ev.preventDefault(); o.alRanking(); }
    });
    let ultimo = null;
    /** Pinta el puesto (o «Calculando…» si aún no se sabe). Si llega tarde, se anima desde ese momento. */
    c.puesto = function (n, tiempo) {
      const clave = `${n}|${tiempo}`;
      if (clave === ultimo) return;
      ultimo = clave;
      const res = c.capa.querySelector('.cin-resultado');
      const esc = c.capa.querySelector('.cin-resultado-escena');
      const retraso = Math.max(0, inicio + 4300 - Date.now());
      c.capa.style.setProperty('--r', `${retraso}ms`);
      c.capa.classList.toggle('cin-con-podio', !!n && n <= 3);
      c.capa.classList.toggle('cin-sin-podio', !!n && n > 3);
      if (!n) {
        esc.innerHTML = '';
        res.innerHTML = '<p class="cin-calculando"><i class="cin-girando" aria-hidden="true"></i> Calculando vuestro puesto…</p>';
        return;
      }
      const nombre = GK.html(o.equipo.nombre);
      const reloj = tiempo ? `<p class="cin-tiempo mono">⏱ ${GK.html(tiempo)}</p>` : '';
      if (n <= 3) {
        const peldano = (p) => `<div class="cin-peldano p${p}${p === n ? ' propio' : ''}"><span>${p}</span></div>`;
        esc.innerHTML = `
          ${estrellas(28)}
          <div class="cin-peldanos">
            <div class="cin-equipo p${n}" aria-hidden="true"><span class="cin-avatar">${GK.html(o.equipo.id)}</span><i class="cin-medalla ${MEDALLAS[n]}">${n}</i></div>
            ${peldano(2)}${peldano(1)}${peldano(3)}
          </div>`;
        res.innerHTML = `<p class="cin-puesto">${ORDINAL(n)} puesto</p><h2 class="cin-titulo">${nombre}</h2>${reloj}`;
      } else {
        esc.innerHTML = `
          <div class="cin-llegada" aria-hidden="true">
            <i class="cin-onda"></i><i class="cin-onda o2"></i>
            <svg class="cin-bandera" viewBox="0 0 60 90"><path d="M8,6 L8,88" stroke="#eef1fa" stroke-width="5" stroke-linecap="round"/>
              <path class="cin-tela" d="M10,8 L54,18 L10,30 Z" fill="#10b981" stroke="#0b1230" stroke-width="2.5" stroke-linejoin="round"/></svg>
          </div>`;
        res.innerHTML = `<p class="cin-puesto">Misión completada · puesto ${n}</p><h2 class="cin-titulo">${nombre}</h2>${reloj}`;
      }
      if (c.terminada()) c.capa.style.setProperty('--r', '0ms');
    };
    c.arrancar();
    return c;
  }

  GK.cinematicas = { rumbo, podio };
})();
