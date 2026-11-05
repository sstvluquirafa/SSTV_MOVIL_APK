# Prompt: base de la app móvil de la gymkhana SSTV (GranaSAT)

Crea en esta carpeta (`Movil_apk`) la **base** de una web app para móvil (PWA) para la gymkhana del
Hackathon SSTV de GranaSAT (Universidad de Granada) en el Parque de las Ciencias de Granada.
Es un **lienzo en blanco**: monta todo el torneo (equipos, recorrido, QR, ranking, despliegue en
GitHub), pero **no crees ninguna prueba**. Las pruebas las diseñaremos nosotros más adelante y se
tienen que poder enchufar fácilmente.

Todo en **español**: interfaz, comentarios, README y mensajes de commit.

## Contexto

- 10 equipos de 4 alumnos de unos 14 años. Usan **sus propios móviles** (iPhone y Android mezclados,
  algunos viejos, con cobertura irregular dentro del Parque).
- 10 estaciones repartidas por el Parque. Cada estación tiene un **QR impreso** pegado.
- Lo normal es que cada grupo use **un solo móvil, el del capitán**, aunque los demás puedan unirse
  al mismo equipo y ver lo mismo.
- No se recoge ningún dato personal: solo «Equipo 1…10». Sin nombres, sin cuentas con email, sin fotos.

## Recorrido: matriz de desplazamiento

- El equipo *k* empieza en la estación *k* y recorre las estaciones en orden circular:
  k, k+1, …, 10, 1, …, k−1. Ejemplo: el equipo 4 hace 4 → 5 → … → 10 → 1 → 2 → 3.
- **No se puede saltar ninguna estación.** El que está en la 2 no puede pasar a la 4 sin hacer la 3.
  Si un equipo escanea el QR de una estación que no le toca, la app no la abre y le dice con un
  mensaje amable cuál le toca ahora.
- Haz configurables el número de equipos y de estaciones (por defecto 10 y 10) y la posibilidad
  de definir rutas a mano, en un único archivo de configuración.
- Una estación se completa cuando se supera su prueba. Como aún no hay pruebas, crea una
  **prueba de relleno** genérica: el monitor de la estación dice un código de validación y el
  equipo lo introduce. Diseña una **interfaz de prueba clara** (un módulo por prueba con su
  configuración, su pantalla y una función que indica que se ha superado) y documéntala. Así
  después solo tendremos que añadir archivos, sin tocar el núcleo.
- Haz el control **a prueba de trampas razonables**:
  - El QR lleva el número de estación y un token secreto. Teclear la URL de otra estación no sirve.
  - Los códigos de validación no aparecen en claro en el código. Puedes usar hashes o el cifrado
    de la web del aula: PBKDF2 + AES-GCM con WebCrypto.
  - Las reglas del servidor también impiden avanzar más de una estación de golpe o saltarse el
    orden. No te fíes solo del cliente.

## Ranking en directo

- Una página `ranking` pensada para **proyectarla en una pantalla grande** en la meta. Se actualiza
  sola en tiempo real.
- Para cada equipo muestra **cuántas pruebas lleva hechas y cuáles le faltan**, por ejemplo con 10
  marcas o estrellas que se encienden.
- Orden: va primero el equipo con más pruebas hechas. En caso de empate, va delante el que llegó
  antes a ese número.
- **Podio**: los 3 primeros se ven **en grande** (1.º en el centro y más alto) y el resto **en
  pequeño** debajo.
- Que sea vistosa: animación cuando un equipo sube de puesto o completa una estación, y una
  celebración cuando un equipo termina las 10. Que se lea bien desde lejos.
- Respeta `prefers-reduced-motion`.

## Panel de organización

Una página protegida para los organizadores (un PIN o una cuenta de organizador) que permita:

- Ver en qué estación está cada equipo.
- Iniciar y parar la gymkhana: los equipos no pueden avanzar antes de la salida.
- Corregir a mano el progreso de un equipo, por ejemplo si se le muere el móvil y sigue en papel.
- Reiniciarlo todo, con doble confirmación.

## Arquitectura

- **Web estática sin paso de compilación** (HTML, CSS y JS sin framework, igual que la web del
  aula), alojada en **GitHub Pages** con HTTPS. Prepara lo necesario: estructura lista para Pages,
  `.gitignore`, y si lo ves útil un workflow de GitHub Actions para desplegar.
- **PWA instalable y que funcione sin conexión** tras abrirla una vez: manifest, service worker y
  caché de todos los recursos. Que pese poco (1–2 MB como mucho).
- **Datos compartidos para el ranking**: usa el servicio gratuito que consideres más adecuado
  (por ejemplo Firebase Realtime Database o Firestore, o Supabase) y justifica la elección en el
  README. Requisitos:
  - Cada equipo se une con un **código de equipo** impreso en su tarjeta. Se puede usar
    autenticación anónima para que solo los móviles de ese equipo escriban su progreso.
  - **Reglas de seguridad** que impidan escribir en otro equipo, retroceder o saltar estaciones.
  - **Cola sin conexión**: si no hay cobertura, el avance se guarda en el móvil y se envía al
    recuperarla. El juego no debe bloquearse por falta de red.
  - La configuración del servicio va en un archivo aparte, con instrucciones claras para rellenarlo.
- **Escáner de QR** dentro de la app con la cámara. Ten en cuenta que iOS Safari no tiene
  `BarcodeDetector`: incluye una librería en local, sin CDN. Si el escaneo falla, que se pueda
  abrir el QR también con la cámara del móvil, porque el QR es una URL.
- Librerías y fuentes **incluidas en el proyecto**, sin CDN en tiempo de ejecución.

## Herramientas para imprimir

Crea un script, en Python o Node, que genere a partir de la configuración:

- **Carteles A4 de cada estación**: QR grande, número y nombre de la estación, estilo de la app.
- **Tarjetas de equipo**: número de equipo, código para unirse, QR para abrir la app y su orden
  de ruta.
- **Una hoja para los monitores** con los códigos de validación de cada estación.

La salida debe ser HTML o PDF listo para imprimir. Al regenerar, los tokens se pueden rotar.

## Estilo visual

Debe parecerse a la web de los retos del hackathon (estilo oscuro «Explorador Enigma» de GranaSAT):

- **Fondo**: espacial con estrellas.
- **Tarjetas**: oscuras y translúcidas.
- **Botones**: ámbar.
- **Cabecera**: azul marino con línea naranja inferior y el logo de GranaSAT.
- **Estaciones bloqueadas**: candado y la palabra «ENCRIPTADO».
- **Datos técnicos**: ventanas tipo terminal «RX_MONITOR» con tres puntos de colores.
- **Colores**: azul marino `#0f172a`, naranja `#d97706`, ámbar `#fbbf24`, texto `#f8fafc` /
  `#cbd5e1`, verde de éxito `#10b981`.
- **Tipografía**: Merriweather 900 en títulos, con una palabra destacada en ámbar (como
  «Explorador **Enigma**»); Inter en el texto; JetBrains Mono en datos técnicos.
- **Fuentes, logo y fondo**: si tienes acceso al repositorio `SSTV_Hackathon`, cópialos de
  `web/assets/`. Si no, descarga las fuentes a `assets/fonts/` y deja un hueco claro para el logo.
- **Ruta del equipo**: dibújala como una **constelación** en la que cada estación es una estrella
  que se enciende al completarla, unida con líneas a la siguiente.
- **Diseño mobile-first**: botones grandes y legibles al sol. El ranking, en cambio, va pensado
  para pantalla grande.

## Pantallas mínimas del móvil

1. **Inicio**: unirse a un equipo con el código o con el QR de la tarjeta.
2. **Mi ruta**: la constelación, la estación siguiente, el contador de hechas/faltan y el cronómetro.
3. **Escanear QR**.
4. **Estación**: la prueba de relleno, con el hueco para las pruebas reales.
5. **Final**: al completar las 10.

## Entrega

- **README en español**. Debe explicar:
  - cómo funciona;
  - cómo crear el repositorio y activar GitHub Pages;
  - cómo crear y configurar el servicio de datos y desplegar las reglas;
  - cómo añadir una prueba nueva;
  - cómo generar e imprimir los QR;
  - cómo probarlo en local;
  - una **lista de comprobación para el día de la gymkhana**: abrir la app en la salida antes de
    empezar, móviles cargados, plan B en papel.
- **Pruebas**. Simula los 10 equipos a la vez y comprueba que:
  - el ranking ordena bien, incluidos los empates;
  - no se puede saltar una estación (ni en el cliente ni en las reglas);
  - el modo sin conexión guarda la cola y la sincroniza;
  - todo se ve bien en un móvil de 360 px de ancho y en una pantalla de 1920×1080.
- Al terminar, resume qué está hecho, qué tenemos que configurar nosotros (cuenta del servicio de
  datos, repositorio de GitHub, logo) y qué no has podido probar, como un iPhone real.
