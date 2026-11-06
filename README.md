# Gymkhana SSTV · App móvil (GranaSAT)

App web para el móvil (PWA) de la gymkhana del Hackathon SSTV en el Parque de las Ciencias: equipos, mapa con las
estaciones, rutas, QR, **10 pruebas** (4 en papel y 6 en la app), **palabra final**, **meta**, ranking en
directo, avisos de ayuda y panel de organización. Cada prueba es un módulo que se cambia editando `torneo.json`.

- **`index.html`**: la app de los equipos (en el móvil).
- **`ranking.html`**: el ranking en directo para proyectar en la meta (tecla **F** = pantalla completa).
- **`organizacion.html`**: el panel de organización (salida, pausa, ayudas, mensajes, rutas, correcciones).

---

## Cómo funciona

1. **Del hackathon a la gymkhana.** En los portátiles, cada grupo hace los 4 retos y monta el mapa del Parque
   (los 4 fragmentos SSTV). Cuando os enseñan el mapa montado, les dais su **tarjeta de equipo**.
2. **Rutas por orden de llegada.** El equipo escanea su tarjeta y se une en la app.
   - El **primero en unirse recibe la ruta 1 (la más corta)**, el segundo la 2, y así hasta el último. La ventaja
     de terminar antes el mapa es andar menos.
   - Si dos equipos se unen a la vez, el servidor decide y nunca dan la misma ruta a dos.
   - Desde el panel podéis cambiar o intercambiar rutas.
3. **Todos salen a la vez** cuando dais la salida en el panel. Hasta entonces, la app enseña su ruta en el mapa
   pero no deja jugar.
4. **Las rutas.** Todos los equipos pasan por **todas** las estaciones, cada uno en un orden distinto, calculado
   a partir de dónde están en el mapa.
   - **En ningún paso coinciden dos equipos en la misma estación**: si van a un ritmo parecido, no hay colas.
   - **No se puede saltar ninguna estación**: la app no abre una estación que no toca, y las reglas de Firebase
     rechazan cualquier escritura fuera de orden aunque alguien intente saltarse la app.
5. **El mapa en el móvil.** La app enseña el mapa del Parque con la ruta del equipo dibujada encima:
   - lo hecho en ámbar y el tramo siguiente en naranja;
   - las estaciones con **letras A–J** y estrellas, para no confundirlas con los números 1–7 de los pabellones;
   - el botón **Ampliar**, que acerca el mapa a la siguiente estación.
6. **Sin monitores.** Al llegar escanean el QR de la estación y hacen su prueba (ver «Las pruebas», más abajo).
   - A los **60 s** aparece el botón **«Pista»** (sin penalización, una por prueba).
   - En las pruebas de opciones (GeoGuessr, ¿Real o IA?, ¿Bulo o verdad?), cada fallo bloquea el botón **15 s**.
   - Cada estación superada da **una letra**. Al acabar las 10, en la pantalla **«Última transmisión»** las ordenan
     para formar la palabra secreta.
   - Al acertar la palabra **aparece la meta en el mapa**. Escanear su QR **termina la partida** del equipo.
7. **Si se atascan, os llega al móvil** (ntfy), y además aparece en el panel con un pitido:
   - cuando un equipo pulsa **«Pedir ayuda»**, con el motivo (no encuentran la estación, no saben resolverla…);
   - **automáticamente**, si un equipo lleva más de *X* minutos sin completar su estación (10 por defecto).

   Desde el panel podéis **mandarles un mensaje** (les sale en la app, por ejemplo con una pista),
   **marcarles la estación** o dar la ayuda por resuelta.
8. **Sin cobertura no se pierde nada.** El avance y las peticiones de ayuda se guardan en el móvil y se envían
   solos cuando vuelve la red. Arriba se ve «N PEND.» mientras haya algo por enviar.
9. **Ranking.** Primero va quien lleva más pasos (estaciones, palabra final y meta); si empatan, el que llegó antes
   a ese número. **Un equipo termina al escanear la meta.** Los 3 primeros salen en grande en el podio y el resto en
   pequeño, cada uno con:
   - las estaciones hechas y las que faltan, y dos marcas más: ★ palabra y ⚑ meta;
   - su ruta;
   - **el tiempo total** (de la salida a la meta) cuando terminan.

### Seguridad, en corto

- La web es pública (GitHub Pages), pero **no contiene ninguna respuesta en claro**: solo huellas PBKDF2.
  Única excepción: la palabra del Wordle va **ofuscada** (el móvil la necesita para colorear las letras).
- Las explicaciones que se enseñan al acertar (¿Bulo o verdad?, ¿Real o IA?) van **cifradas con la respuesta**.
- Los códigos están en `privado/`, que **no se sube** a GitHub (`.gitignore`). En Firebase están en `/secretos`,
  que nadie puede leer.
- Cada QR de estación lleva un token secreto: teclear la dirección de otra estación no sirve.
- No se guarda ningún dato personal: solo «Equipo 1…10» y un identificador anónimo por móvil.

---

## Estructura

```
web/                       ← lo que se publica en GitHub Pages
  index.html               app de los equipos
  ranking.html             ranking para proyectar
  organizacion.html        panel de organización
  sw.js                    funcionamiento sin conexión (lista de archivos en caché)
  manifest.webmanifest     para «añadir a pantalla de inicio»
  css/                     base.css (estilo común), app.css, ranking.css, organizacion.css
  js/
    config.js              GENERADO: configuración pública (estaciones, rutas, huellas, Firebase, avisos)
    util.js                normalización, huellas, rutas asignadas, clasificación
    datos.js               Firebase (API REST + tiempo real), modo demo, cola sin conexión, reparto de rutas, ntfy
    app.js                 pantallas del móvil
    mapa.js                el mapa del Parque con la ruta dibujada
    constelacion.js        la ruta como constelación (podio del ranking)
    escaner.js             escáner de QR con la cámara
    ranking.js, organizacion.js, fondo.js, iconos.js, inicio.js
    pruebas/
      registro.js          interfaz de pruebas (léelo antes de crear una)
      _plantilla.js        plantilla para pruebas nuevas
      codigo_estacion.js   prueba de relleno: código escondido en la estación
      morse.js, sstv_mano.js, binario.js, qr_escondido.js         pruebas de papel
      wordle.js, geoguessr.js, real_o_ia.js, caja_fuerte.js,
      hackeo.js, bulo_verdad.js                                    pruebas de la app
  assets/img/pruebas/      imágenes de GeoGuessr y ¿Real o IA? (ahora, provisionales)
  vendor/                  jsQR (leer QR) y qrcode-generator (crear QR); licencias en LICENCIAS.txt
  assets/img/mapa.jpg      GENERADO: el mapa del Parque, ligero (≈190 KB)
herramientas/
  torneo.json              ← LA CONFIGURACIÓN: equipos, estaciones (letra y posición), avisos, Firebase
  editor_estaciones.html   colocar las estaciones pinchando sobre el mapa (doble clic para abrirlo)
  generar_torneo.py        calcula las rutas y genera config, mapas, secretos, datos de Firebase e imprimibles
  plantilla_imprimir.html  plantilla de los imprimibles
  github-pages.yml         publica web/ en GitHub Pages (muévelo a .github/workflows/pages.yml)
generado/
  mapa_con_estaciones.png  el mapa original con las estaciones dibujadas, para los fragmentos SSTV
  rutas.txt                resumen de las rutas (orden de letras y distancia)
firebase/
  reglas.json              reglas de seguridad de la base de datos
pruebas/                   pruebas automáticas (Playwright) y comprobación de las reglas
privado/                   (NO se sube) secretos.json, firebase_importar.json, imprimir.html
```

---

## Puesta en marcha

Necesitáis **Python 3**. Para generar las imágenes del mapa, también **Pillow** (`pip install pillow`; con
Anaconda ya viene). El generador lee el mapa del hackathon en
`../Web_Hackathon/recursos/imagenes/mapa.png` (solo lo lee). Si lo tenéis en otro sitio, cambiad
`mapa.origen` en `torneo.json`.

### 1. Colocar las estaciones en el mapa

1. Abre `herramientas/editor_estaciones.html` con doble clic.
2. Elige una estación de la lista y **haz clic en el mapa** para colocarla, o arrástrala. Puedes cambiarles el
   nombre, añadir o quitar estaciones.
3. Pulsa **Copiar** y sustituye la lista `"estaciones": [ … ]` de `herramientas/torneo.json` por lo copiado.
4. Ejecuta el generador:
   ```bash
   python herramientas/generar_torneo.py
   ```
   Recalcula las rutas y te las resume en `generado/rutas.txt`.

Las posiciones que trae ahora son **provisionales**.

> **Diferencia entre rutas.** `rutas_equilibrio` en `torneo.json` decide cuánto se parecen las rutas.
> - Con `2` (por defecto) la más corta y la más larga se llevan unos 130 m con las posiciones provisionales.
> - Con `0` se busca andar poco en total y la ventaja del primero es mayor.
> - Con `5` las rutas son casi iguales.
>
> Las distancias son en línea recta sobre el mapa: orientativas.

### 2. Actualizar el mapa de los fragmentos SSTV (repositorio `Web_Hackathon`)

El generador deja en `generado/mapa_con_estaciones.png` el mapa original con las estaciones dibujadas: estrellas
ámbar con su letra, grandes para que se lean tras la decodificación SSTV. Para que los alumnos lo reciban así en
el hackathon:

1. Copiadlo **encima** de `Web_Hackathon/recursos/imagenes/mapa.png`. Guardad antes el original, por si acaso.
2. En `Web_Hackathon`, ejecutad `python herramientas/generar_fragmentos_mapa.py` y después
   `python herramientas/construir_web.py`.

El generador **no toca** `Web_Hackathon`: este paso lo hacéis vosotros cuando las posiciones sean definitivas.

### 3. Probarlo ya, sin configurar nada (modo demo)

```bash
cd web
python -m http.server 8000
```

- Abre <http://localhost:8000> (la app), <http://localhost:8000/ranking.html> y
  <http://localhost:8000/organizacion.html> en pestañas del **mismo navegador**.
- Sin Firebase configurado, la app funciona en **modo demo**: los datos solo viven en ese navegador. Una
  franja naranja lo indica.
- **Con Firebase ya configurado**, abrid <http://localhost:8000/?demo=1> para forzar el modo demo en local
  (`?demo=0` lo quita).
- Los códigos para probar están en `privado/imprimir.html` (ábrelo con doble clic).
- Para abrir una estación sin escanear: copia la dirección del QR que aparece en `privado/imprimir.html`
  (`…#/e/1/…`) y cambia el principio por `http://localhost:8000/`.

### 4. GitHub y GitHub Pages

1. Crea un repositorio en GitHub. Tiene que ser **público** para usar Pages gratis.
2. Mueve `herramientas/github-pages.yml` a `.github/workflows/pages.yml` (la carpeta ya existe, vacía).
3. Sube la carpeta:
   ```bash
   git init
   git add .
   git commit -m "Base de la app de la gymkhana"
   git branch -M main
   git remote add origin https://github.com/USUARIO/REPOSITORIO.git
   git push -u origin main
   ```
4. En GitHub: **Settings → Pages → Build and deployment → Source: «GitHub Actions»**. Cada `push` a `main`
   publica `web/` en `https://USUARIO.github.io/REPOSITORIO/`.
5. Pon esa dirección en `herramientas/torneo.json` → `"url_publica"`, ejecuta el generador, y haz commit y push.

### 5. Firebase (rutas, ranking y ayudas en directo)

Se usa **Firebase Realtime Database**, plan gratuito *Spark*. Cada dispositivo abre **una sola conexión**: el
plan gratuito admite 100 a la vez, así que caben los 40 alumnos con margen.

1. Entra en <https://console.firebase.google.com> → **Crear un proyecto** (Google Analytics no hace falta).
2. **Compilación → Realtime Database → Crear base de datos**. Ubicación: *Bélgica (europe-west1)*. Elige el
   **modo bloqueado**.
3. Pestaña **Reglas**: pega el contenido de `firebase/reglas.json` y pulsa **Publicar**.
4. **Compilación → Authentication → Comenzar → Método de acceso → Anónimo → Habilitar**.
5. **⚙ Configuración del proyecto → General → Tus apps → icono web `</>`**: registra la app y copia `apiKey`.
   Copia también la URL de la base de datos (algo como `https://NOMBRE-default-rtdb.europe-west1.firebasedatabase.app`).
6. Pégalos en `herramientas/torneo.json` → `"firebase"` y ejecuta el generador. La `apiKey` de Firebase no es
   secreta: identifica el proyecto, y lo que protege los datos son las reglas.
7. **Realtime Database → Datos → ⋮ → Importar JSON** con `privado/firebase_importar.json`. Se importa en la
   **raíz** y reemplaza todo: hazlo la primera vez, y cada vez que cambies estaciones, rutas o equipos.
8. Commit y push.

### 6. Avisos en vuestros móviles (ntfy)

[ntfy](https://ntfy.sh) es un servicio gratuito de notificaciones: no hace falta cuenta.

1. Instalad la app **ntfy** (Android o iPhone) en los dos móviles.
2. Suscribíos al tema que viene en la hoja de organización (`privado/imprimir.html`), con el QR o escribiéndolo.
   Empieza por `gymkhana-sstv-`.
3. En el panel de organización, pulsad **Enviar aviso de prueba** para comprobar que os llega.

El tema es largo y aleatorio. Está en el código de la web, así que alguien muy curioso podría mandaros avisos:
como mucho os llegaría ruido, no puede tocar nada del juego. Con `--rotar` se cambia.
`aviso_atasco_min` en `torneo.json` fija los minutos del aviso automático.

### 7. El generador

Cada vez que cambies `herramientas/torneo.json` ejecuta:

```bash
python herramientas/generar_torneo.py
```

- **Conserva los códigos que ya existían.** Con `--rotar` crea códigos, tokens (también el de la meta y el del QR
  escondido) y tema de ntfy nuevos, pero **conserva las respuestas** de las pruebas. Hazlo antes del día real;
  después reimporta `privado/firebase_importar.json` y vuelve a imprimir.
- Te avisa si una estación con prueba de respuesta todavía tiene como «clave» un código al azar.
- **Rutas a mano:** en `torneo.json`, `"rutas_manuales": [[1, 3, 2, …], …]`, de la más corta a la más larga. Debe
  haber una por equipo, y cada una con todas las estaciones.
- **Nombres de equipo:** `"nombres_equipos": { "1": "Orión", "2": "Lyra" }`.
- Si cambias algo de `web/`, sube `VERSION` en `web/sw.js` para que los móviles reciban la versión nueva.

### 8. Imprimir

Abre `privado/imprimir.html` con doble clic. Tiene un botón para imprimir cada parte por separado:

- **Carteles A4 de estación**, con la letra y el QR.
- **Carteles de prueba** (A4): Morse (la pregunta), SSTV a mano (las coordenadas), Binario (las bombillas) y QR
  escondido (la pista de dónde está). Van **junto al cartel de la estación**.
- **QR escondidos**: etiquetas pequeñas con el QR y «GranaSAT · Gymkhana». Escondedlas a menos de 10–15 pasos.
- **Cartel de la meta** (A4), con su QR grande.
- **Etiquetas de código**: solo para las estaciones que sigan con la prueba de relleno (`codigo_estacion`).
- **Tarjetas de equipo** (4 por hoja), con el QR para unirse y el código.
- **Hoja de organización** (2 páginas):
  - el código del panel y el tema de ntfy, con su QR;
  - la respuesta y la letra de cada estación, la palabra final y el token de la meta;
  - los códigos de cada equipo;
  - las 10 rutas con su distancia.

Antes de imprimir, comprueba que `url_publica` es la buena: va dentro de los QR.

---

## Las pruebas

Asignación actual (cámbiala en `herramientas/torneo.json` → `estaciones[].prueba`):

| Est. | Prueba | Dónde | Lo público (`torneo.json` → `prueba`) | Lo secreto (`privado/secretos.json`) |
|---|---|---|---|---|
| A | Morse (`morse`) | cartel + app | `cartel`: la pregunta en Morse (letras con espacios, palabras con « / ») | `clave`: la respuesta |
| B | SSTV a mano (`sstv_mano`) | cartel + app | `columnas`, `filas`, `cartel`: lista de filas con las casillas pintadas | `clave` y `alternativas` (sinónimos) |
| C | Binario (`binario`) | cartel + app | `cartel`: filas de 5 bombillas («01100»…) | `clave`: la palabra |
| D | QR escondido (`qr_escondido`) | cartel + QR + app | `escondite`: pista del cartel | `qr` y `clave` (los genera el script) |
| E | Wordle (`wordle`) | app | — | `clave`: palabra de 5 letras |
| F | GeoGuessr (`geoguessr`) | app | `imagenes`: `[{ src, credito, opciones: [4] }]` | `clave`: letras de las correctas (por ejemplo «cab») |
| G | ¿Real o IA? (`real_o_ia`) | app | `imagenes`: `[{ src, credito }]` (4) | `clave`: letra de la falsa; `explicaciones` |
| H | Caja fuerte (`caja_fuerte`) | app | `pistas`: `[{ codigo, texto }]` | `clave`: el código |
| I | Hackea el satélite (`hackeo`) | app | `sistema`, `usuario`, `ayudaContrasena`, `perfil`, `leccion` | `clave`: la contraseña |
| J | ¿Bulo o verdad? (`bulo_verdad`) | app | `afirmaciones` (textos), `leccion` | `clave`: patrón de b/v; `explicaciones` (una por afirmación) |

Todas llevan además `pista` en `torneo.json`: el texto del botón «Pista» de los 60 s.

- **Las respuestas solo van en `privado/secretos.json`.** Se comparan en minúsculas, sin tildes ni espacios.
- **Letras y palabra final:** `torneo.json` → `palabra_final` (`palabra`, `pista` y la letra de cada estación).
  La respuesta que vale es `final.clave` de `secretos.json`. Si cambiáis la palabra, cambiad las dos.
- **Meta:** `torneo.json` → `meta` (`nombre`, `x`, `y`). Colocadla con el editor de estaciones (la M verde).
- **Imágenes** (GeoGuessr y ¿Real o IA?):
  - ponedlas en `web/assets/img/pruebas/` (JPG, máximo unos 150 KB cada una);
  - con licencia libre, o citando la fuente en `credito`;
  - poned su ruta en `src`, añadidla a `ARCHIVOS` de `web/sw.js` y subid `VERSION`.

  Las que hay ahora son provisionales («Imagen pendiente»).
- **Cambiar una prueba por otra:** cambiad el `tipo` y sus opciones en `torneo.json` y la `clave` en
  `secretos.json`, y ejecutad el generador.
- **Después de cualquier cambio:**
  1. ejecutad `python herramientas/generar_torneo.py`;
  2. reimportad `privado/firebase_importar.json` en Firebase;
  3. volved a imprimir lo que haya cambiado.

### Pruebas automáticas

```bash
cd pruebas
npm install
npx playwright test
python comprobar_reglas.py
```

- `npm install` hace falta solo la primera vez.
- Usan el **Chrome instalado** y el modo demo, en un móvil de 360 px y en 1920×1080. Prueban:
  - cada prueba: falla, pista a los 60 s y se supera;
  - la espera de 15 s;
  - las letras, la palabra final y la meta;
  - el ranking y el panel;
  - que nada se salga de la pantalla.
- `comprobar_reglas.py` revisa los datos para Firebase y simula la regla de orden. No sustituye a probar contra
  Firebase de verdad: el emulador de Firebase necesita Java 11 o superior.
- Para probar a mano en local con Firebase configurado, abrid la app con **`?demo=1`**
  (`http://localhost:8000/?demo=1`): fuerza el modo demo en ese navegador. `?demo=0` lo quita. En la web
  publicada no tiene efecto.

---

## Añadir una prueba

Lee `web/js/pruebas/registro.js` y copia `web/js/pruebas/_plantilla.js`:

1. Crea `web/js/pruebas/mi_prueba.js` con `GK.pruebas.registrar('mi_prueba', { montar(contenedor, ctx) {…} })`.
   - `ctx.intentar(respuesta)` devuelve `true` si es correcta y marca la estación.
   - `ctx.ayuda(texto, tipo)` muestra avisos; `ctx.esperar(segundos, boton)` hace la espera tras fallo.
   - `ctx.intentar(respuesta, { quedarse: true })` y después `ctx.continuar()`: para enseñar algo antes de pasar
     de pantalla.
   - `ctx.estacion` trae `{ id, letra, nombre, prueba, sal }`. La pista la pinta la app (`prueba.pista`).
2. Añade su `<script>` en `web/index.html` y su ruta en `ARCHIVOS` de `web/sw.js` (sube `VERSION`).
3. En `herramientas/torneo.json`, asígnala a una estación: `"prueba": { "tipo": "mi_prueba", "pregunta": "…" }`.
4. En `privado/secretos.json`, pon como `clave` de esa estación la respuesta correcta. Se compara en minúsculas,
   sin tildes ni espacios.
5. Ejecuta el generador, reimporta en Firebase, y haz commit y push.

Como no hay nadie en las estaciones, la prueba tiene que poder **resolverse sola**: una respuesta que solo se
encuentra allí (un cartel, un objeto, un código escondido…). La respuesta **nunca** se escribe en el código.

---

## El día de la gymkhana

**Antes (días previos)**
- [ ] Estaciones colocadas con el editor, generador ejecutado y mapa SSTV actualizado en `Web_Hackathon`.
- [ ] `url_publica` y Firebase configurados (la franja de «MODO DEMO» ya no aparece).
- [ ] Imágenes de GeoGuessr y ¿Real o IA? puestas; la foto falsa y su explicación, en `secretos.json`.
- [ ] Sitio del QR escondido elegido: `escondite` y `pista` escritos en `torneo.json`.
- [ ] Meta colocada con el editor.
- [ ] Códigos rotados (`--rotar`), datos reimportados en Firebase y todo impreso.
- [ ] ntfy instalado en vuestros dos móviles y probado desde el panel.
- [ ] Prueba completa con 2–3 móviles reales (**un iPhone y un Android** al menos), con cobertura del Parque.

**Montaje**
- [ ] Un cartel con QR en cada estación y, en las de papel, su cartel de prueba al lado.
- [ ] El QR escondido en su sitio y el cartel de la meta con su QR.
- [ ] Ranking abierto en la pantalla de la meta (`ranking.html`, tecla F).
- [ ] Panel de organización abierto en un móvil (`organizacion.html`).

**Reparto**
- Según os enseñan el mapa montado, dadles la tarjeta. **Que se unan en ese momento**, con cobertura:
  así se reparten las rutas por orden de llegada.
- Recomendad «Añadir a pantalla de inicio» y llevar batería.
- Cuando estén todos: **Dar la salida** en el panel.

**Durante**
- Os llegarán por ntfy las peticiones de ayuda y los atascos. En el panel:
  - **Mensaje**: una pista que les sale en la app.
  - **Marcar** (+): les da por superado el siguiente paso (estación, palabra o meta).
  - **⚑**: marca la llegada a la meta a mano (por ejemplo, si llegan sin batería).
  - **Resuelta**: quita la petición de la lista.
- Si un móvil se queda sin batería, el equipo sigue en papel y vosotros marcáis sus estaciones con **+**.
- **Pausar** detiene el juego (lluvia, incidencias) hasta **Reanudar**.

**Después**
- **Reiniciar todo** (hay que escribir REINICIAR) empieza una ronda nueva: los móviles se desvinculan y las rutas
  se vuelven a repartir por orden de llegada.

---

## Logo

El logo es provisional (`web/assets/img/logo.svg`). Para poner el de GranaSAT:

1. Copia `Web_Hackathon/web/assets/img/logo.jpg` a `web/assets/img/`.
2. En `torneo.json` pon `"logo": "assets/img/logo.jpg"` y ejecuta el generador.

---

## Detalles técnicos

- **Sin compilación ni dependencias:** HTML, CSS y JS sin framework. Firebase se usa por su **API REST**, con
  tiempo real mediante *EventSource* y sesión anónima por la API de Identity Toolkit; no se carga el SDK.
  ntfy se usa con una petición POST normal.
- **Cálculo de rutas.** Las rutas son las filas de un **cuadrado latino**: cada fila es una ruta y cada columna un
  paso, así que en ningún paso coinciden dos equipos.
  - Se generan muchos cuadrados al azar, prefiriendo saltos cortos.
  - Cada uno se mejora intercambiando pasos o estaciones, minimizando lo andado en total más
    `rutas_equilibrio` × la ruta más larga.
  - Al final las rutas se ordenan de la más corta a la más larga.
- **Datos en Firebase:**
  - públicos, en directo: `/vivo/estado`, `/vivo/asignacion` (qué ruta tiene cada equipo), `/vivo/progreso`
    (estaciones y, al final, los pasos `final` y `meta`),
    `/vivo/ayudas`, `/vivo/mensajes` y `/vivo/ronda`;
  - públicos, fijos: `/rutas`, `/orden_rutas` y `/equipos`;
  - con escritura controlada: `/miembros`, `/admins` y `/pruebas`;
  - `/secretos`: nadie puede leerlo.
- **Reglas** (`firebase/reglas.json`):
  - **Reparto de rutas.** Un equipo solo puede coger una ruta libre si la anterior ya está cogida, y nunca dos
    rutas. Si dos lo intentan a la vez, el servidor acepta a uno y el otro coge la siguiente.
  - **Completar una estación** (o la palabra final, o la meta: son dos pasos más al final de cada ruta en
    `/rutas`). Un móvil solo puede escribirla si se cumple todo esto:
    - es miembro del equipo;
    - la gymkhana está en marcha;
    - ya tiene hecha la estación anterior **de su ruta asignada**;
    - envía el token del QR y la clave de la prueba, y ambos coinciden con `/secretos` (o la clave es uno de sus
      sinónimos en `alternativas`).

    La hora la pone el servidor.
- **Probado** con un simulador de Firebase local. Pruebas superadas:
  - Reparto de rutas:
    - 10 equipos uniéndose en un orden concreto, con dos a la vez;
    - un segundo móvil del mismo equipo, que no cambia la ruta;
    - intercambio de rutas desde el panel.
  - Juego:
    - saltos bloqueados en la app y en el servidor;
    - modo sin conexión con sincronización posterior;
    - pausa;
    - reinicio con ronda nueva.
  - Ayudas:
    - petición de ayuda enviada a ntfy y mostrada en el panel;
    - mensaje del panel al equipo;
    - aviso automático de atasco, sin repetirse.
  - Ranking: empates y tiempos.
  - Herramientas:
    - escáner con un QR real ante una cámara simulada;
    - editor de estaciones;
    - imprimibles (16 páginas en PDF).
  - Vistas a 375 px y 1920×1080.
  - Las 10 pruebas, la palabra final y la meta: las pruebas automáticas de `pruebas/` (42 casos en un móvil de 360 px
    y en 1920×1080).

  **No se ha probado:**
  - contra un Firebase real (tampoco las reglas nuevas de la palabra final, la meta y los sinónimos);
  - contra ntfy.sh real;
  - en un iPhone real;
  - escaneando el QR escondido con una cámara de verdad.

  Hacedlo antes del día.
