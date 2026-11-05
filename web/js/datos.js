/*
 * Capa de datos compartidos.
 *
 * - Modo FIREBASE: Realtime Database por su API REST (sin SDK: menos peso y sin dependencias).
 *   Autenticación anónima por la API REST de Identity Toolkit. Tiempo real con EventSource (SSE).
 * - Modo DEMO (si no hay databaseURL en la configuración): todo se guarda en este navegador y se
 *   comparte entre pestañas. Sirve para probar la app y el ranking sin crear nada en Firebase.
 *
 * Las escrituras de los equipos pasan por una COLA PERSISTENTE: si no hay cobertura, el avance queda
 * guardado en el móvil y se envía cuando vuelve la conexión, en orden.
 */
(function () {
  'use strict';
  const GK = window.GK;
  const C = window.GK_CONFIG;
  const FB = C.firebase || {};
  const MODO = FB.databaseURL && FB.apiKey ? 'firebase' : 'demo';
  const URL_BD = (FB.databaseURL || '').replace(/\/+$/, '');

  const oyentesEstado = new Set();
  const estadoConexion = { enLinea: navigator.onLine, pendientes: 0, rechazadas: 0, ultimoError: null };
  function avisarEstado(cambios) {
    Object.assign(estadoConexion, cambios || {});
    oyentesEstado.forEach((f) => { try { f({ ...estadoConexion }); } catch (e) { console.error(e); } });
  }

  /* ======================================================================
   * Autenticación anónima (solo modo Firebase)
   * ====================================================================== */
  let promesaToken = null;
  async function token(forzar) {
    if (promesaToken) return promesaToken;
    promesaToken = (async () => {
      let s = GK.leer('sesion', null);
      const ahora = Date.now();
      if (s && !forzar && s.expira - 60000 > ahora) return s;
      let r;
      if (s && s.refreshToken) {
        r = await fetch(`https://securetoken.googleapis.com/v1/token?key=${FB.apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(s.refreshToken)}`,
        });
        if (r.ok) {
          const j = await r.json();
          s = { uid: j.user_id, idToken: j.id_token, refreshToken: j.refresh_token, expira: ahora + Number(j.expires_in) * 1000 };
          GK.guardar('sesion', s);
          return s;
        }
      }
      r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FB.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnSecureToken: true }),
      });
      if (!r.ok) throw errorHttp(r.status, 'No se pudo iniciar la sesión anónima. ¿Está activada en Firebase?');
      const j = await r.json();
      s = { uid: j.localId, idToken: j.idToken, refreshToken: j.refreshToken, expira: ahora + Number(j.expiresIn) * 1000 };
      GK.guardar('sesion', s);
      return s;
    })();
    try { return await promesaToken; } finally { promesaToken = null; }
  }

  function errorHttp(estado, mensaje) {
    const e = new Error(mensaje || `Error ${estado}`);
    e.estado = estado;
    return e;
  }

  /** Petición REST a la base de datos con reintento si el token ha caducado. */
  async function rest(metodo, ruta, cuerpo, conAuth = true) {
    for (let intento = 0; intento < 2; intento++) {
      let url = `${URL_BD}/${ruta}.json`;
      if (conAuth) url += `?auth=${(await token(intento > 0)).idToken}`;
      const r = await fetch(url, {
        method: metodo,
        headers: cuerpo !== undefined ? { 'Content-Type': 'application/json' } : undefined,
        body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
      });
      if (r.status === 401 && intento === 0) continue;
      if (!r.ok) throw errorHttp(r.status, r.status === 401 || r.status === 403 ? 'Permiso denegado' : `Error ${r.status}`);
      return r.json();
    }
  }
  const SELLO = { '.sv': 'timestamp' };

  /* ======================================================================
   * Modo DEMO: «base de datos» en localStorage compartida entre pestañas
   * ====================================================================== */
  const demo = {
    leer() {
      const bd = GK.leer('demo:bd', null) || {};
      bd.vivo = bd.vivo || {};
      bd.vivo.estado = bd.vivo.estado || { iniciada: false };
      bd.vivo.progreso = bd.vivo.progreso || {};
      bd.miembros = bd.miembros || {};
      return bd;
    },
    escribir(bd) {
      GK.guardar('demo:bd', bd);
      oyentesDemo.forEach((f) => f());
    },
  };
  const oyentesDemo = new Set();
  window.addEventListener('storage', (ev) => { if (ev.key === 'gk:demo:bd') oyentesDemo.forEach((f) => f()); });
  const obtener = (obj, ruta) => ruta.split('/').filter(Boolean).reduce((o, k) => (o == null ? undefined : o[k]), obj);

  /* ======================================================================
   * Suscripciones en tiempo real (lectura pública)
   * ====================================================================== */
  function aplicar(arbol, ruta, valor, fusionar) {
    const partes = ruta.split('/').filter(Boolean);
    if (!partes.length) {
      if (fusionar) return Object.assign(arbol && typeof arbol === 'object' ? { ...arbol } : {}, valor);
      return valor;
    }
    const raiz = arbol && typeof arbol === 'object' ? { ...arbol } : {};
    let nodo = raiz;
    for (let i = 0; i < partes.length - 1; i++) {
      nodo[partes[i]] = nodo[partes[i]] && typeof nodo[partes[i]] === 'object' ? { ...nodo[partes[i]] } : {};
      nodo = nodo[partes[i]];
    }
    const ult = partes[partes.length - 1];
    if (fusionar) nodo[ult] = Object.assign(nodo[ult] && typeof nodo[ult] === 'object' ? { ...nodo[ult] } : {}, valor);
    else if (valor === null) delete nodo[ult];
    else nodo[ult] = valor;
    return raiz;
  }
  /**
   * Quita nulos y convierte arrays en objetos: Firebase devuelve como array los nodos cuyas claves son
   * números seguidos (por ejemplo progreso/1 con las estaciones 1, 2, 3).
   */
  function limpiarNulos(v) {
    if (!v || typeof v !== 'object') return v;
    if (Array.isArray(v)) v = Object.assign({}, v);
    for (const k of Object.keys(v)) {
      if (v[k] === null || v[k] === undefined) delete v[k];
      else v[k] = limpiarNulos(v[k]);
    }
    return v;
  }

  /*
   * Todo lo que se lee en directo cuelga de un único nodo público, /vivo (estado de la partida y progreso).
   * Cada dispositivo abre UNA sola conexión de tiempo real, aunque varias partes de la página escuchen:
   * el plan gratuito de Firebase admite 100 conexiones simultáneas.
   */
  const oyentesVivo = new Set();
  let vivo = GK.leer('cache:vivo', null);
  let fuente = null;
  let reintento = null;

  function repartir() {
    GK.guardar('cache:vivo', vivo);
    const a = (vivo && vivo.asignacion) || {};
    GK.asignacion = { equipos: a.equipos || {}, rutas: a.rutas || {} };
    for (const o of oyentesVivo) {
      const v = obtener(vivo || {}, o.ruta) ?? null;
      const j = JSON.stringify(v);
      if (j === o.ultimo) continue;
      o.ultimo = j;
      try { o.cb(v); } catch (e) { console.error(e); }
    }
  }

  function abrirVivo() {
    clearTimeout(reintento);
    fuente = new EventSource(`${URL_BD}/vivo.json`);
    const alRecibir = (fusionar) => (ev) => {
      const d = JSON.parse(ev.data);
      if (!d) return;
      vivo = limpiarNulos(aplicar(vivo, d.path, d.data, fusionar)) || null;
      repartir();
    };
    fuente.addEventListener('put', alRecibir(false));
    fuente.addEventListener('patch', alRecibir(true));
    fuente.addEventListener('open', () => avisarEstado({ enLinea: true }));
    fuente.addEventListener('cancel', () => console.warn('Lectura de /vivo cancelada por las reglas'));
    fuente.onerror = () => {
      avisarEstado({ enLinea: false });
      if (fuente.readyState === EventSource.CLOSED) reintento = setTimeout(abrirVivo, 5000);
    };
  }

  if (MODO === 'demo') {
    oyentesDemo.add(() => { vivo = demo.leer().vivo || null; repartir(); });
    vivo = demo.leer().vivo || null;
  }
  { const a = (vivo && vivo.asignacion) || {}; GK.asignacion = { equipos: a.equipos || {}, rutas: a.rutas || {} }; }

  /**
   * Escucha una parte de /vivo: 'estado', 'progreso' o 'progreso/3'.
   * Llama a cb(valor) enseguida (con lo último guardado, para funcionar sin red) y en cada cambio.
   */
  function escuchar(ruta, cb) {
    const o = { ruta, cb, ultimo: undefined };
    oyentesVivo.add(o);
    setTimeout(() => {
      if (!oyentesVivo.has(o) || o.ultimo !== undefined) return;
      const v = obtener(vivo || {}, ruta) ?? null;
      o.ultimo = JSON.stringify(v);
      try { cb(v); } catch (e) { console.error(e); }
    }, 0);
    if (MODO === 'firebase' && !fuente) abrirVivo();
    return () => oyentesVivo.delete(o);
  }

  /** Lectura puntual (sin tiempo real) de un nodo público, por ejemplo los nombres de los equipos. */
  async function leerUnaVez(ruta) {
    if (MODO === 'demo') return null;
    return limpiarNulos(await rest('GET', ruta, undefined, false));
  }

  /* ======================================================================
   * Cola persistente de escrituras del equipo
   * ====================================================================== */
  const cola = () => GK.leer('cola', []);
  const guardarCola = (c) => { GK.guardar('cola', c); avisarEstado({ pendientes: c.length, rechazadas: c.filter((o) => o.rechazada).length }); };
  let procesando = false;
  let temporizador = null;

  function encolar(op) {
    const c = cola();
    const id = op.id || op.tipo + ':' + op.equipo + ':' + (op.estacion ?? '');
    if (!c.some((o) => o.id === id)) c.push({ ...op, id, creada: Date.now() });
    guardarCola(c);
    procesar();
  }

  /** Primera ruta libre en orden (la 1 es la más corta). */
  function rutaLibre(asig) {
    const r = C.rutas.find((x) => !(asig.rutas || {})[x.id]);
    return r ? r.id : null;
  }

  async function avisoNtfy(op) {
    const A = C.avisos || {};
    if (!A.tema) return;
    // Título, prioridad y etiquetas van en la URL (no en cabeceras): así es una petición «simple», sin
    // comprobación previa de CORS, y admite tildes en el título.
    const q = new URLSearchParams({ title: op.titulo, priority: String(op.prioridad || 4), tags: op.etiquetas || 'satellite' });
    let r;
    try {
      r = await fetch(`${A.ntfy}/${A.tema}?${q}`, { method: 'POST', body: op.texto });
    } catch (e) {
      throw errorHttp(0, 'Sin conexión');
    }
    // 429 (demasiados avisos) u otros errores del servicio: no bloquean la cola
    if (!r.ok) console.warn('ntfy respondió', r.status);
  }

  async function ejecutar(op) {
    if (op.tipo === 'ntfy') return avisoNtfy(op);
    if (MODO === 'demo') {
      if (op.tipo === 'asignar') {
        const bd = demo.leer();
        const asig = (bd.vivo.asignacion = bd.vivo.asignacion || { equipos: {}, rutas: {} });
        asig.equipos = asig.equipos || {}; asig.rutas = asig.rutas || {};
        if (!asig.equipos[op.equipo]) {
          const r = rutaLibre(asig);
          if (r == null) throw errorHttp(403, 'No quedan rutas libres');
          asig.equipos[op.equipo] = String(r);
          asig.rutas[r] = String(op.equipo);
          demo.escribir(bd);
        }
        return;
      }
      if (op.tipo === 'ayuda') {
        const bd = demo.leer();
        bd.vivo.ayudas = bd.vivo.ayudas || {};
        bd.vivo.ayudas[op.equipo] = bd.vivo.ayudas[op.equipo] || {};
        bd.vivo.ayudas[op.equipo][op.idAyuda] = { t: Date.now(), motivo: op.motivo, estacion: op.estacion, paso: op.paso };
        demo.escribir(bd);
        return;
      }
      const bd = demo.leer();
      if (op.tipo === 'unirse') {
        bd.miembros[op.equipo] = (bd.miembros[op.equipo] || 0) + 1;
      } else if (op.tipo === 'completar') {
        const p = (bd.vivo.progreso[op.equipo] = bd.vivo.progreso[op.equipo] || {});
        if (p[op.estacion]) return; // ya estaba (otro móvil del equipo)
        if (!bd.vivo.estado.iniciada) throw errorHttp(403, 'La gymkhana no ha empezado');
        const ruta = GK.equipo(op.equipo).ruta;
        const i = ruta.indexOf(Number(op.estacion));
        if (i < 0 || (i > 0 && !p[ruta[i - 1]])) throw errorHttp(403, 'Fuera de orden');
        p[op.estacion] = { t: Date.now() };
      }
      demo.escribir(bd);
      return;
    }
    const s = await token();
    if (op.tipo === 'asignar') {
      // Se intenta la primera ruta libre; si otro equipo la coge a la vez, el servidor rechaza y se prueba la siguiente.
      for (let intento = 0; intento <= C.rutas.length; intento++) {
        const asig = limpiarNulos(await rest('GET', 'vivo/asignacion', undefined, false)) || {};
        if ((asig.equipos || {})[op.equipo]) return;
        const r = rutaLibre(asig);
        if (r == null) throw errorHttp(403, 'No quedan rutas libres');
        try {
          await rest('PATCH', '', {
            [`vivo/asignacion/equipos/${op.equipo}`]: String(r),
            [`vivo/asignacion/rutas/${r}`]: String(op.equipo),
          });
          return;
        } catch (e) {
          if (e.estado !== 401 && e.estado !== 403) throw e;
        }
      }
      throw errorHttp(403, 'No se ha podido asignar la ruta');
    }
    if (op.tipo === 'ayuda') {
      await rest('PATCH', '', {
        [`vivo/ayudas/${op.equipo}/${op.idAyuda}`]: { t: SELLO, motivo: op.motivo, estacion: op.estacion, paso: op.paso },
      });
      return;
    }
    if (op.tipo === 'unirse') {
      await rest('PUT', `miembros/${op.equipo}/${s.uid}`, op.codigo);
    } else if (op.tipo === 'completar') {
      const ya = await rest('GET', `vivo/progreso/${op.equipo}/${op.estacion}`, undefined, false);
      if (ya) return; // ya la registró otro móvil del equipo
      await rest('PATCH', '', {
        [`pruebas/${op.equipo}/${op.estacion}`]: { token: op.token, clave: op.clave },
        [`vivo/progreso/${op.equipo}/${op.estacion}`]: { t: SELLO },
      });
    }
  }

  async function procesar() {
    if (procesando) return;
    procesando = true;
    clearTimeout(temporizador);
    try {
      let c = cola();
      while (c.length) {
        const op = c[0];
        try {
          await ejecutar(op);
          c = cola().filter((o) => o.id !== op.id);
          guardarCola(c);
          avisarEstado({ enLinea: true, ultimoError: null });
        } catch (e) {
          if ((e.estado === 403 || e.estado === 401) && op.tipo === 'completar' && !op.reunido) {
            // Puede que el servidor ya no tenga este móvil como miembro (por ejemplo, tras un reinicio):
            // se vuelve a unir con el código guardado y se reintenta una vez.
            const eq = GK.leer('equipo', null);
            c = cola().map((o) => (o.id === op.id ? { ...o, reunido: true } : o));
            if (eq && eq.codigo && eq.id === op.equipo) c.unshift({ tipo: 'unirse', equipo: eq.id, codigo: eq.codigo, id: 'unirse:' + eq.id + ':' + Date.now(), creada: Date.now() });
            guardarCola(c);
            continue;
          }
          if (e.estado === 403 || e.estado === 401) {
            // El servidor la rechaza (partida sin empezar, fuera de orden, código mal...). Se reintenta más tarde
            // por si la organización arranca la partida o corrige el progreso; la app lo muestra como aviso.
            c = cola().map((o) => (o.id === op.id ? { ...o, rechazada: true, intentos: (o.intentos || 0) + 1 } : o));
            guardarCola(c);
            avisarEstado({ ultimoError: e.message });
          } else {
            avisarEstado({ enLinea: false, ultimoError: 'Sin conexión: se enviará al recuperar la cobertura' });
          }
          break;
        }
      }
    } finally {
      procesando = false;
      if (cola().length) temporizador = setTimeout(procesar, MODO === 'demo' ? 3000 : 15000);
    }
  }
  window.addEventListener('online', () => { avisarEstado({ enLinea: true }); procesar(); });
  window.addEventListener('offline', () => avisarEstado({ enLinea: false }));

  /* ======================================================================
   * Organización
   * ====================================================================== */
  async function entrarOrganizacion(codigo) {
    if (MODO === 'firebase') {
      const s = await token();
      await rest('PUT', `admins/${s.uid}`, GK.normalizar(codigo));
    }
    GK.guardar('organizacion', true);
  }
  async function escribirAdmin(cambios) {
    if (MODO === 'demo') {
      let bd = demo.leer();
      for (const [ruta, valor] of Object.entries(cambios)) {
        const v = JSON.parse(JSON.stringify(valor), (k, x) => (x && x['.sv'] === 'timestamp' ? Date.now() : x));
        bd = aplicar(bd, ruta, v, false);
      }
      demo.escribir(limpiarNulos(bd));
      return;
    }
    await rest('PATCH', '', cambios);
  }
  const organizacion = {
    entrar: entrarOrganizacion,
    iniciar: () => escribirAdmin({ 'vivo/estado': { iniciada: true, inicio: SELLO } }),
    reanudar: (inicio) => escribirAdmin({ 'vivo/estado/iniciada': true, 'vivo/estado/fin': null, 'vivo/estado/inicio': inicio ?? SELLO }),
    parar: () => escribirAdmin({ 'vivo/estado/iniciada': false, 'vivo/estado/fin': SELLO }),
    /** Da la ruta `ruta` al equipo; si la tenía otro equipo, intercambian. */
    asignarRuta(equipo, ruta) {
      const A = GK.asignacion;
      const e = String(equipo), r = String(ruta);
      const rutaAnt = A.equipos[e] != null ? String(A.equipos[e]) : null;
      const otro = A.rutas[r] != null ? String(A.rutas[r]) : null;
      if (otro === e) return Promise.resolve();
      const c = { [`vivo/asignacion/equipos/${e}`]: r, [`vivo/asignacion/rutas/${r}`]: e };
      if (otro) {
        c[`vivo/asignacion/equipos/${otro}`] = rutaAnt;
        if (rutaAnt) c[`vivo/asignacion/rutas/${rutaAnt}`] = otro;
      } else if (rutaAnt) {
        c[`vivo/asignacion/rutas/${rutaAnt}`] = null;
      }
      return escribirAdmin(c);
    },
    resolverAyuda: (equipo, id) => escribirAdmin({ [`vivo/ayudas/${equipo}/${id}/resuelta`]: true }),
    mensaje: (equipo, texto) => escribirAdmin({ [`vivo/mensajes/${equipo}`]: texto ? { texto, t: SELLO } : null }),
    marcar: (equipo, estacion) => escribirAdmin({ [`vivo/progreso/${equipo}/${estacion}`]: { t: SELLO, manual: true } }),
    desmarcar: (equipo, estacion) => escribirAdmin({ [`vivo/progreso/${equipo}/${estacion}`]: null, [`pruebas/${equipo}/${estacion}`]: null }),
    // Reiniciar empieza una «ronda» nueva: los móviles se desvinculan y los equipos vuelven a unirse con su
    // tarjeta, así el orden de llegada (y el reparto de rutas) vuelve a empezar.
    reiniciar: () => escribirAdmin({
      vivo: { estado: { iniciada: false }, ronda: (Number(vivo && vivo.ronda) || 0) + 1 },
      pruebas: null,
      miembros: null,
    }),
  };

  GK.datos = {
    modo: MODO,
    escuchar,
    leerUnaVez,
    encolar,
    procesar,
    organizacion,
    onEstado(f) { oyentesEstado.add(f); f({ ...estadoConexion, pendientes: cola().length, rechazadas: cola().filter((o) => o.rechazada).length }); return () => oyentesEstado.delete(f); },
    pendientes: () => cola(),
    vaciarCola: () => guardarCola([]),
  };

  setTimeout(procesar, 500);
})();
