#!/usr/bin/env python3
"""Genera todo lo que sale de herramientas/torneo.json.

Uso:
    python herramientas/generar_torneo.py            # conserva los códigos que ya existan
    python herramientas/generar_torneo.py --rotar    # crea códigos, tokens y tema de avisos nuevos

Crea o actualiza:
    web/js/config.js                   configuración PÚBLICA (solo huellas, nunca códigos en claro)
    web/assets/img/mapa.jpg            el mapa del Parque, ligero, para la app (necesita Pillow)
    generado/mapa_con_estaciones.png   el mapa original con las estaciones dibujadas (para los fragmentos SSTV)
    generado/rutas.txt                 resumen de las rutas calculadas
    privado/secretos.json              códigos de equipo, de organización, tokens y claves de estación
    privado/firebase_importar.json     datos para importar en Firebase la primera vez (raíz de la base)
    privado/firebase_secretos.json     solo el nodo /secretos (para reimportar tras rotar códigos)
    privado/imprimir.html              carteles, etiquetas de código, tarjetas de equipo y hoja de organización

La carpeta privado/ NO se sube a GitHub (.gitignore). Solo necesita la biblioteca estándar de Python;
con Pillow instalado (pip install pillow) genera además las imágenes del mapa.
"""
import base64
import hashlib
import itertools
import json
import math
import random
import re
import secrets
import sys
import unicodedata
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
WEB = RAIZ / "web"
PRIVADO = RAIZ / "privado"
GENERADO = RAIZ / "generado"
ITERACIONES = 100_000
# Sin letras ni cifras que se confundan al leerlas en voz alta o en papel (0/O, 1/I/L, 5/S, 8/B, 2/Z)
ALFABETO = "ACEFHJKMNPRTUVWXY34679"


def normalizar(texto: str) -> str:
    """Igual que GK.normalizar en web/js/util.js: minúsculas, sin tildes, solo letras y cifras."""
    t = unicodedata.normalize("NFD", str(texto).lower())
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    return "".join(c for c in t if c.isascii() and c.isalnum())


ARTICULOS = re.compile(r"^(el|la|los|las|the)\s+")


def normalizar_titulo(texto: str) -> str:
    """Igual que tituloLimpio en web/js/pruebas/pelis.js: como normalizar() pero quitando antes un artículo al
    principio («el», «la», «los», «las», «the»). Así «The Martian» y «Martian» valen igual."""
    t = unicodedata.normalize("NFD", str(texto).lower())
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    t = re.sub(r"^[^a-z0-9]+", "", t)
    return normalizar(ARTICULOS.sub("", t))


def combinaciones_pelis(peliculas) -> list:
    """«Pelis espaciales»: la respuesta es la unión de los tres títulos (en orden). Vale cualquier combinación de
    títulos aceptados; la primera (los títulos principales) es la «clave» y el resto van a «alternativas»."""
    listas = [list(dict.fromkeys(normalizar_titulo(x) for x in p if normalizar_titulo(x))) for p in peliculas]
    return ["".join(c) for c in itertools.product(*listas)]


def codigo(n=6) -> str:
    return "".join(secrets.choice(ALFABETO) for _ in range(n))


def huella(texto: str, sal: str) -> str:
    """PBKDF2-SHA256, 100 000 iteraciones, 32 bytes. Coincide con GK.huella en util.js."""
    return hashlib.pbkdf2_hmac("sha256", normalizar(texto).encode(), bytes.fromhex(sal), ITERACIONES, 32).hex()


def sha256(texto: str) -> str:
    return hashlib.sha256(texto.encode()).hexdigest()


# La palabra final y la meta se registran como dos «estaciones» más al final de cada ruta (claves «final» y «meta»).
# El token de la palabra es fijo (no hay QR: lo que protege es la palabra) y la clave de la meta también (lo que
# protege es el token de su QR).
TOKEN_FINAL = "palabra"
CLAVE_META = "llegada"


def ofuscar(texto: str, sal_hex: str) -> str:
    """XOR con la sal (repetida) y base64. Igual que GK.desofuscar en web/js/util.js."""
    k = bytes.fromhex(sal_hex)
    b = texto.encode("utf-8")
    return base64.b64encode(bytes(x ^ k[i % len(k)] for i, x in enumerate(b))).decode()


def cifrar(texto: str, clave: str, sal_hex: str) -> str:
    """Cifra con una clave derivada de la respuesta (SHA-256 en modo contador). Igual que GK.descifrar en util.js:
    k = SHA-256(«gk-explicacion:» + respuesta normalizada + «:» + sal); bloque i = SHA-256(k + i en 4 bytes)."""
    k = hashlib.sha256(f"gk-explicacion:{normalizar(clave)}:{sal_hex}".encode()).digest()
    b = texto.encode("utf-8")
    flujo = b"".join(hashlib.sha256(k + i.to_bytes(4, "big")).digest() for i in range(len(b) // 32 + 1))
    return base64.b64encode(bytes(x ^ flujo[i] for i, x in enumerate(b))).decode()


def es_codigo_azar(clave) -> bool:
    """¿Parece un código generado al azar (6 caracteres del alfabeto de códigos) y no una respuesta escrita a mano?"""
    return isinstance(clave, str) and len(clave) == 6 and all(c in ALFABETO for c in clave)


MORSE = {
    ".-": "A", "-...": "B", "-.-.": "C", "-..": "D", ".": "E", "..-.": "F", "--.": "G", "....": "H", "..": "I",
    ".---": "J", "-.-": "K", ".-..": "L", "--": "M", "-.": "N", "---": "O", ".--.": "P", "--.-": "Q", ".-.": "R",
    "...": "S", "-": "T", "..-": "U", "...-": "V", ".--": "W", "-..-": "X", "-.--": "Y", "--..": "Z",
    "-----": "0", ".----": "1", "..---": "2", "...--": "3", "....-": "4", ".....": "5", "-....": "6",
    "--...": "7", "---..": "8", "----.": "9", "--.--": "Ñ",
}


def descifrar_morse(texto: str) -> str:
    """«-. --- / -.. .» → «NO DE». Letras separadas por espacios y palabras por « / »."""
    palabras = []
    for p in str(texto).split("/"):
        letras = [MORSE.get(c.strip(), "?") for c in p.split() if c.strip()]
        palabras.append("".join(letras))
    return " ".join(w for w in palabras if w)


def prueba_publica(e, s):
    """Opciones públicas de la prueba de una estación (torneo.json → prueba) más lo que se calcula a partir de los
    secretos sin revelarlos: huellas de las respuestas alternativas (sinónimos que también valen) y, en el Morse, la
    huella de la pregunta (para avisar si escriben la pregunta en vez de la respuesta)."""
    p = dict(e.get("prueba") or {"tipo": "codigo_estacion"})
    alternativas = [normalizar(a) for a in s.get("alternativas", []) if normalizar(a)]
    if alternativas:
        p["huellasAlternativas"] = [huella(a, s["sal"]) for a in alternativas]
    if p.get("tipo") == "wordle":
        # EXCEPCIÓN DOCUMENTADA: para colorear las letras, el móvil necesita la palabra. Va ofuscada (XOR con una sal
        # pública + base64): no se lee a simple vista, pero alguien muy experto podría sacarla.
        sal_w = hashlib.sha256(("wordle:" + s["sal"]).encode()).hexdigest()[:16]
        p["salPalabra"] = sal_w
        p["palabra"] = ofuscar(str(s["clave"]).upper(), sal_w)
    # Explicaciones que se enseñan al acertar (¿Bulo o verdad?, ¿Real o IA?): viven en privado/secretos.json y se
    # publican cifradas con la respuesta, así que solo se pueden leer después de acertar.
    if s.get("explicaciones") is not None:
        p["explicacionesCifradas"] = cifrar(json.dumps(s["explicaciones"], ensure_ascii=False), s["clave"], s["sal"])
    # Dato real que sale en «¡Estación superada!» (secretos → «dato», máx. 160 caracteres). Va cifrado porque alguno
    # delataría la respuesta. Uno por cada respuesta que vale (clave y sinónimos); «gk:» delante para saber en el móvil
    # cuál se ha descifrado bien.
    if s.get("dato"):
        if len(s["dato"]) > 160:
            print(f"  · OJO: el dato de la estación {e['letra']} pasa de 160 caracteres ({len(s['dato'])}).")
        p["datoCifrado"] = [cifrar("gk:" + s["dato"], k, s["sal"]) for k in [s["clave"], *s.get("alternativas", [])]]
    if p.get("tipo") == "pelis" and s.get("peliculas"):
        # Una huella por cada título aceptado de cada película (con la sal de la estación), para marcar en el móvil
        # cuál han acertado sin publicar los títulos. La comprobación de verdad es la clave conjunta de Firebase.
        publicas = p.get("peliculas") or []
        if len(publicas) != len(s["peliculas"]):
            print(f"  · OJO: la estación {e['letra']} tiene {len(publicas)} películas en torneo.json y "
                  f"{len(s['peliculas'])} en privado/secretos.json.")
        p["peliculas"] = [
            {**(publicas[i] if i < len(publicas) else {}),
             "huellas": sorted({huella(normalizar_titulo(x), s["sal"]) for x in titulos if normalizar_titulo(x)})}
            for i, titulos in enumerate(s["peliculas"])
        ]
    if p.get("tipo") == "morse" and p.get("cartel"):
        pregunta = descifrar_morse(p["cartel"])
        if "?" in pregunta:
            print(f"  · OJO: el Morse de la estación {e['letra']} tiene símbolos que no conozco: «{pregunta}»")
        p["huellaPregunta"] = huella(pregunta, s["sal"])
    return p


# ---------------------------------------------------------------------------------------------
# Rutas
# ---------------------------------------------------------------------------------------------
def longitud(ruta, d):
    return sum(d[ruta[i]][ruta[i + 1]] for i in range(len(ruta) - 1))


def cuadrado_latino(ids, d, azar):
    """Un cuadrado latino aleatorio (cada fila = una ruta; cada columna = un paso): en ningún paso coinciden
    dos rutas en la misma estación. Se construye fila a fila prefiriendo saltos cortos."""
    n = len(ids)
    filas = []
    usadas_col = [set() for _ in range(n)]

    def fila(j, actual, en_fila, pasos):
        if j == n:
            return True
        cand = [s for s in ids if s not in en_fila and s not in usadas_col[j]]
        if actual is None:
            azar.shuffle(cand)
        else:
            cand.sort(key=lambda s: d[actual][s] * (0.6 + azar.random()))
        for s in cand:
            pasos.append(s)
            en_fila.add(s)
            if fila(j + 1, s, en_fila, pasos):
                return True
            pasos.pop()
            en_fila.discard(s)
        return False

    for _ in range(n):
        pasos = []
        if not fila(0, None, set(), pasos):
            return None
        for j, s in enumerate(pasos):
            usadas_col[j].add(s)
        filas.append(pasos)
    return filas


def calcular_rutas(ids, d, semilla, equipos, equilibrio=2.0):
    """Busca un conjunto de rutas sin coincidencias que ande poco en total sin castigar demasiado al último
    (coste = total + equilibrio × la ruta más larga). Mejora cada candidato intercambiando pasos (columnas), que mantiene
    la propiedad de no coincidir."""
    azar = random.Random(semilla)
    mejor, mejor_total = None, math.inf

    def coste(cl):
        ls = [longitud(f, d) for f in cl]
        return sum(ls) + equilibrio * max(ls)

    for _ in range(80):
        cl = cuadrado_latino(ids, d, azar)
        if not cl:
            continue
        total = coste(cl)
        mejora = True
        while mejora:
            mejora = False
            for a in range(len(ids)):
                for b in range(a + 1, len(ids)):
                    # Intercambiar dos pasos (columnas) o dos estaciones (símbolos): ambos conservan el cuadrado latino
                    sa, sb = ids[a], ids[b]
                    for nuevo in ([f[:a] + [f[b]] + f[a + 1:b] + [f[a]] + f[b + 1:] for f in cl],
                                  [[sb if s == sa else sa if s == sb else s for s in f] for f in cl]):
                        t = coste(nuevo)
                        if t < total - 1e-9:
                            cl, total, mejora = nuevo, t, True
        if total < mejor_total:
            mejor, mejor_total = cl, total
    rutas = sorted(mejor, key=lambda f: longitud(f, d))
    # Si hay más equipos que estaciones, las rutas se repiten (dos equipos podrían coincidir).
    return [rutas[i % len(rutas)] for i in range(max(equipos, len(rutas)))][: max(equipos, 1)]


# ---------------------------------------------------------------------------------------------
# Mapa
# ---------------------------------------------------------------------------------------------
def fuente(tam):
    from PIL import ImageFont
    for f in ["arialbd.ttf", "C:/Windows/Fonts/arialbd.ttf", "DejaVuSans-Bold.ttf",
              "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/Library/Fonts/Arial Bold.ttf"]:
        try:
            return ImageFont.truetype(f, tam)
        except OSError:
            continue
    try:
        return ImageFont.load_default(size=tam)
    except TypeError:
        return ImageFont.load_default()


def dibujar_marca(dib, x, y, letra, r):
    """Estrella ámbar con borde oscuro y la letra: distinta de los círculos negros de los pabellones 1–7."""
    pts = []
    for i in range(10):
        ang = -math.pi / 2 + i * math.pi / 5
        rr = r if i % 2 == 0 else r * 0.55
        pts.append((x + math.cos(ang) * rr, y + math.sin(ang) * rr))
    dib.ellipse([x - r * 0.98, y - r * 0.98, x + r * 0.98, y + r * 0.98], fill=(15, 23, 42), outline=(255, 255, 255), width=max(3, r // 9))
    dib.polygon([(px, py) for px, py in pts], fill=(251, 191, 36))
    f = fuente(int(r * 0.85))
    dib.text((x, y + r * 0.05), letra, fill=(15, 23, 42), font=f, anchor="mm")


def generar_mapas(torneo):
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        print("  · Pillow no está instalado: no se generan las imágenes del mapa (pip install pillow).")
        return False
    origen = (RAIZ / torneo["mapa"]["origen"]).resolve()
    if not origen.exists():
        print(f"  · No encuentro el mapa en {origen}: no se generan las imágenes del mapa.")
        return False
    im = Image.open(origen).convert("RGB")
    # Versión ligera para la app (sin marcas: la app dibuja las estaciones y la ruta encima)
    ligero = im.copy()
    ligero.thumbnail((2200, 2200))
    (WEB / "assets" / "img").mkdir(parents=True, exist_ok=True)
    ligero.save(WEB / "assets" / "img" / "mapa.jpg", quality=78, optimize=True, progressive=True)
    # Versión completa con las estaciones, para los fragmentos SSTV del hackathon
    sx, sy = im.width / torneo["mapa"]["ancho"], im.height / torneo["mapa"]["alto"]
    dib = ImageDraw.Draw(im)
    r = int(min(im.width, im.height) * 0.034)
    for e in torneo["estaciones"]:
        dibujar_marca(dib, e["x"] * sx, e["y"] * sy, e["letra"], r)
    GENERADO.mkdir(exist_ok=True)
    im.save(GENERADO / "mapa_con_estaciones.png", optimize=True)
    return True


# ---------------------------------------------------------------------------------------------
def colocar_imagen_falsa(est, sec):
    """«¿Real o IA?»: la organización deja la foto hecha con IA como web/assets/img/pruebas/ia-falsa.jpg (no se sube a
    GitHub) y aquí se copia con el nombre neutro de su posición (el «src» de la imagen cuya letra es la clave), para
    que el nombre del archivo no delate cuál es la falsa. Instrucciones en ia-falsa-AQUI.txt, en esa misma carpeta."""
    origen = WEB / "assets" / "img" / "pruebas" / "ia-falsa.jpg"
    for e in est:
        p = e.get("prueba") or {}
        if p.get("tipo") != "real_o_ia":
            continue
        clave = normalizar(sec["estaciones"][str(e["id"])]["clave"])
        imgs = p.get("imagenes") or []
        i = "abcdefgh".find(clave) if len(clave) == 1 else -1
        if not 0 <= i < len(imgs):
            print(f"  · OJO: la clave de «¿Real o IA?» (estación {e['letra']}) no es la letra de una de sus imágenes.")
            continue
        destino = WEB / imgs[i]["src"]
        if origen.exists():
            if origen.stat().st_size > 200_000:
                print(f"  · OJO: ia-falsa.jpg pesa {origen.stat().st_size // 1000} KB (máximo 200 KB).")
            if not destino.exists() or destino.read_bytes() != origen.read_bytes():
                destino.write_bytes(origen.read_bytes())
                print(f"  · Imagen falsa de la estación {e['letra']} copiada como {imgs[i]['src']} "
                      "(sube VERSION en web/sw.js).")
        elif not destino.exists():
            print(f"  · FALTA la imagen falsa de la estación {e['letra']}: lee "
                  "web/assets/img/pruebas/ia-falsa-AQUI.txt. Mientras, la app enseña «Foto en revelado».")


# ---------------------------------------------------------------------------------------------
def main():
    try:  # la consola de Windows no siempre entiende «≈» o «·»
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass
    rotar = "--rotar" in sys.argv
    torneo = json.loads((RAIZ / "herramientas" / "torneo.json").read_text(encoding="utf-8"))
    est = torneo["estaciones"]
    ids = [e["id"] for e in est]
    if len(set(ids)) != len(ids):
        sys.exit("ERROR: hay ids de estación repetidos en torneo.json")
    if len({e["letra"] for e in est}) != len(est):
        sys.exit("ERROR: hay letras de estación repetidas en torneo.json")
    n_eq = torneo["equipos"]

    PRIVADO.mkdir(exist_ok=True)
    ruta_sec = PRIVADO / "secretos.json"
    todo_previo = json.loads(ruta_sec.read_text(encoding="utf-8")) if ruta_sec.exists() else {}
    # Con --rotar se renuevan códigos, tokens, sales y tema de avisos, pero NO las respuestas de las pruebas
    # (las claves de las pruebas y la palabra final): esas las escribís vosotros y se conservan siempre.
    previo = {} if rotar else todo_previo

    sec = {
        "organizacion": previo.get("organizacion") or {"codigo": codigo(8), "sal": secrets.token_hex(16)},
        "ntfy_tema": previo.get("ntfy_tema") or ("gymkhana-sstv-" + secrets.token_hex(8)),
        "equipos": {},
        "estaciones": {},
    }
    for k in range(1, n_eq + 1):
        sec["equipos"][str(k)] = previo.get("equipos", {}).get(str(k)) or {"codigo": codigo(), "sal": secrets.token_hex(16)}
    claves_azar = []
    for e in est:
        tipo = (e.get("prueba") or {}).get("tipo", "codigo_estacion")
        siempre = todo_previo.get("estaciones", {}).get(str(e["id"])) or {}  # respuestas y sinónimos
        p = previo.get("estaciones", {}).get(str(e["id"])) or {}
        s = {
            **siempre,  # se conservan los campos extra (por ejemplo «alternativas»)
            "token": p.get("token") or secrets.token_urlsafe(12),
            "sal": p.get("sal") or secrets.token_hex(16),
        }
        if tipo == "codigo_estacion":
            # El código de la etiqueta escondida en la estación (prueba de relleno)
            s["clave"] = p.get("clave") or codigo()
        elif tipo == "pelis" and siempre.get("peliculas"):
            # Clave y sinónimos salen de la lista de títulos de cada película (privado/secretos.json → «peliculas»)
            combos = combinaciones_pelis(siempre["peliculas"])
            s["clave"], s["alternativas"] = combos[0], combos[1:]
        elif tipo == "qr_escondido":
            # El QR escondido lleva este texto; la clave es el propio texto
            s["qr"] = p.get("qr") or ("GK-QR-" + codigo())
            s["clave"] = s["qr"]
        else:
            # Respuesta de la prueba: la escribís vosotros en privado/secretos.json («clave»)
            s["clave"] = siempre.get("clave") or codigo()
            if siempre.get("clave") is None or es_codigo_azar(s["clave"]):
                claves_azar.append(f"{e['letra']} ({tipo})")
        sec["estaciones"][str(e["id"])] = s

    # ---------- palabra final y meta ----------
    pf = torneo.get("palabra_final") or {}
    palabra = pf.get("palabra") or ""
    if not normalizar(palabra):
        sys.exit("ERROR: falta palabra_final.palabra en torneo.json")
    ids_por_id = sorted(ids)
    letras_cfg = {str(k): v for k, v in (pf.get("letras") or {}).items()}
    # Letra de cada estación: la de torneo.json o, si falta, la de la palabra en orden de id.
    letras_palabra = {}
    for i, sid in enumerate(ids_por_id):
        letras_palabra[str(sid)] = str(letras_cfg.get(str(sid)) or (palabra[i] if i < len(palabra) else "?")).upper()
    if sorted(normalizar("".join(letras_palabra.values()))) != sorted(normalizar(palabra)):
        print(f"  · OJO: las letras de las estaciones ({''.join(letras_palabra.values())}) no forman la palabra «{palabra}».")
    pf_prev = previo.get("final") or {}
    sec["final"] = {
        # La respuesta de la «Última transmisión». Si cambias la palabra en torneo.json, cámbiala también aquí.
        "clave": (todo_previo.get("final") or {}).get("clave") or normalizar(palabra),
        "sal": pf_prev.get("sal") or secrets.token_hex(16),
    }
    if normalizar(sec["final"]["clave"]) != normalizar(palabra):
        print(f"  · OJO: la clave final de privado/secretos.json («{sec['final']['clave']}») no coincide con "
              f"palabra_final.palabra de torneo.json («{palabra}»). Vale la de secretos.json.")
    meta_cfg = torneo.get("meta") or {}
    meta_cfg = {"nombre": meta_cfg.get("nombre", "Meta"),
                "x": meta_cfg.get("x", torneo["mapa"]["ancho"] / 2), "y": meta_cfg.get("y", torneo["mapa"]["alto"] / 2)}
    sec["meta"] = {"token": (previo.get("meta") or {}).get("token") or secrets.token_urlsafe(12)}
    ruta_sec.write_text(json.dumps(sec, ensure_ascii=False, indent=2), encoding="utf-8")
    if claves_azar:
        print("  · OJO: estas estaciones tienen una prueba con respuesta pero su «clave» en privado/secretos.json sigue "
              "siendo un código al azar: " + ", ".join(claves_azar) + ". Escribid la respuesta y volved a ejecutar el script.")

    colocar_imagen_falsa(est, sec)

    # ---------- rutas ----------
    mpp =float(torneo["mapa"].get("metros_por_pixel", 0.12))
    pos = {e["id"]: (e["x"], e["y"]) for e in est}
    d = {a: {b: math.dist(pos[a], pos[b]) * mpp for b in ids} for a in ids}
    if torneo.get("rutas_manuales"):
        rutas = [list(r) for r in torneo["rutas_manuales"]]
        for r in rutas:
            if sorted(r) != sorted(ids):
                sys.exit(f"ERROR: cada ruta manual debe contener cada estación una sola vez: {r}")
        if len(rutas) < n_eq:
            sys.exit(f"ERROR: hay {n_eq} equipos y solo {len(rutas)} rutas manuales")
    else:
        semilla = json.dumps([pos[i] for i in ids])
        rutas = calcular_rutas(ids, d, semilla, n_eq, float(torneo.get("rutas_equilibrio", 2)))
    rutas = rutas[:n_eq]
    metros = [round(longitud(r, d)) for r in rutas]
    letra = {e["id"]: e["letra"] for e in est}
    coincidencias = sum(len(rutas) - len({r[j] for r in rutas}) for j in range(len(ids)))

    nombres = {str(k): torneo.get("nombres_equipos", {}).get(str(k), f"Equipo {k}") for k in range(1, n_eq + 1)}

    # ---------- configuración pública ----------
    publica = {
        "titulo": torneo["titulo"],
        "tituloDestacado": torneo.get("titulo_destacado", ""),
        "lugar": torneo.get("lugar", ""),
        "logo": torneo.get("logo", "assets/img/logo.svg"),
        "iteraciones": ITERACIONES,
        "firebase": torneo.get("firebase", {}),
        "mapa": {"imagen": "assets/img/mapa.jpg", "ancho": torneo["mapa"]["ancho"], "alto": torneo["mapa"]["alto"]},
        "avisos": {"ntfy": torneo.get("ntfy_servidor", "https://ntfy.sh").rstrip("/"), "tema": sec["ntfy_tema"],
                   "atascoMin": torneo.get("aviso_atasco_min", 10)},
        "organizacion": {"sal": sec["organizacion"]["sal"], "huella": huella(sec["organizacion"]["codigo"], sec["organizacion"]["sal"])},
        "equipos": [
            {"id": k, "nombre": nombres[str(k)],
             "sal": sec["equipos"][str(k)]["sal"], "huella": huella(sec["equipos"][str(k)]["codigo"], sec["equipos"][str(k)]["sal"])}
            for k in range(1, n_eq + 1)
        ],
        "rutas": [{"id": i + 1, "orden": r, "metros": metros[i]} for i, r in enumerate(rutas)],
        "estaciones": [
            {"id": e["id"], "letra": e["letra"], "nombre": e.get("nombre", f"Estación {e['letra']}"), "x": e["x"], "y": e["y"],
             "prueba": prueba_publica(e, sec["estaciones"][str(e["id"])]),
             "letraPalabra": letras_palabra[str(e["id"])],
             "token": sha256(sec["estaciones"][str(e["id"])]["token"]),
             "sal": sec["estaciones"][str(e["id"])]["sal"],
             "huella": huella(sec["estaciones"][str(e["id"])]["clave"], sec["estaciones"][str(e["id"])]["sal"])}
            for e in est
        ],
        # Palabra final: solo su huella (las letras sí son públicas: se ven en la app al superar cada estación).
        "final": {"longitud": len(normalizar(sec["final"]["clave"])), "pista": pf.get("pista", ""),
                  "sal": sec["final"]["sal"], "huella": huella(sec["final"]["clave"], sec["final"]["sal"]),
                  "token": TOKEN_FINAL},
        # Meta: posición y huella del token de su QR.
        "meta": {**meta_cfg, "token": sha256(sec["meta"]["token"])},
    }
    (WEB / "js" / "config.js").write_text(
        "// GENERADO por herramientas/generar_torneo.py a partir de herramientas/torneo.json. No lo edites a mano.\n"
        "// Solo contiene huellas (hashes): los códigos en claro están en privado/secretos.json, que no se sube.\n"
        "window.GK_CONFIG = " + json.dumps(publica, ensure_ascii=False, indent=2) + ";\n",
        encoding="utf-8",
    )

    # ---------- datos para Firebase ----------
    secretos_fb = {
        "organizacion": normalizar(sec["organizacion"]["codigo"]),
        "equipos": {k: normalizar(v["codigo"]) for k, v in sec["equipos"].items()},
        "estaciones": {k: {"token": v["token"], "clave": normalizar(v["clave"]),
                           # Sinónimos que también se aceptan (las reglas los miran en «alternativas»)
                           **({"alternativas": {normalizar(a): True for a in v["alternativas"] if normalizar(a)}}
                              if v.get("alternativas") else {})}
                       for k, v in sec["estaciones"].items()},
    }
    secretos_fb["estaciones"]["final"] = {"token": TOKEN_FINAL, "clave": normalizar(sec["final"]["clave"])}
    secretos_fb["estaciones"]["meta"] = {"token": sec["meta"]["token"], "clave": CLAVE_META}
    rutas_fb = {}
    for i, r in enumerate(rutas):
        rutas_fb[str(i + 1)] = {str(s): {"anterior": "inicio" if j == 0 else str(r[j - 1]), "paso": j + 1} for j, s in enumerate(r)}
        # Dos pasos más al final de cada ruta: la palabra final (tras la última estación) y la meta (tras la palabra)
        rutas_fb[str(i + 1)]["final"] = {"anterior": str(r[-1]), "paso": len(r) + 1}
        rutas_fb[str(i + 1)]["meta"] = {"anterior": "final", "paso": len(r) + 2}
    importar = {
        "vivo": {"estado": {"iniciada": False}},
        "equipos": {k: {"nombre": v} for k, v in nombres.items()},
        "rutas": rutas_fb,
        # Las rutas se reparten en orden: la 1 (la más corta) al primero que llega, después la 2…
        "orden_rutas": {str(i + 1): ("inicio" if i == 0 else str(i)) for i in range(len(rutas))},
        "secretos": secretos_fb,
    }
    (PRIVADO / "firebase_importar.json").write_text(json.dumps(importar, ensure_ascii=False, indent=2), encoding="utf-8")
    (PRIVADO / "firebase_secretos.json").write_text(json.dumps(secretos_fb, ensure_ascii=False, indent=2), encoding="utf-8")

    # ---------- mapas ----------
    hay_mapas = generar_mapas(torneo)

    # ---------- resumen de rutas ----------
    GENERADO.mkdir(exist_ok=True)
    lineas = ["Rutas (de la más corta a la más larga). La 1 es para el primer equipo que llega con el mapa montado.", ""]
    for i, r in enumerate(rutas):
        lineas.append(f"Ruta {i + 1:2d}  ≈{metros[i]:5d} m   " + " → ".join(letra[s] for s in r))
    lineas += ["", f"Coincidencias (dos equipos en la misma estación en el mismo paso): {coincidencias}",
               "Distancias en línea recta sobre el mapa: orientativas."]
    (GENERADO / "rutas.txt").write_text("\n".join(lineas) + "\n", encoding="utf-8")

    # ---------- imprimibles ----------
    base = torneo["url_publica"].rstrip("/") + "/"
    datos = {
        "titulo": torneo["titulo"], "tituloDestacado": torneo.get("titulo_destacado", ""), "lugar": torneo.get("lugar", ""),
        "base": base,
        "organizacion": sec["organizacion"]["codigo"],
        "ntfy": f"{publica['avisos']['ntfy']}/{sec['ntfy_tema']}",
        "ntfyTema": sec["ntfy_tema"],
        "estaciones": [{"id": e["id"], "letra": e["letra"], "nombre": e.get("nombre", f"Estación {e['letra']}"),
                        "tipo": e.get("prueba", {}).get("tipo", "codigo_estacion"),
                        "url": f"{base}#/e/{e['id']}/{sec['estaciones'][str(e['id'])]['token']}",
                        "clave": sec["estaciones"][str(e["id"])]["clave"],
                        "alternativas": sec["estaciones"][str(e["id"])].get("alternativas", []),
                        "peliculas": sec["estaciones"][str(e["id"])].get("peliculas", []),
                        "prueba": e.get("prueba") or {},
                        "pregunta": descifrar_morse(e["prueba"]["cartel"]) if (e.get("prueba") or {}).get("tipo") == "morse" and e["prueba"].get("cartel") else "",
                        "qr": sec["estaciones"][str(e["id"])].get("qr", ""),
                        "letraPalabra": letras_palabra[str(e["id"])]} for e in est],
        "final": {"palabra": palabra, "clave": sec["final"]["clave"], "pista": pf.get("pista", "")},
        "meta": {"nombre": meta_cfg["nombre"], "url": f"{base}#/meta/{sec['meta']['token']}", "token": sec["meta"]["token"]},
        "equipos": [{"id": k, "nombre": nombres[str(k)], "codigo": sec["equipos"][str(k)]["codigo"],
                     "url": f"{base}#/unirse/{k}/{sec['equipos'][str(k)]['codigo']}"} for k in range(1, n_eq + 1)],
        "rutas": [{"id": i + 1, "metros": metros[i], "letras": [letra[s] for s in r]} for i, r in enumerate(rutas)],
    }
    plantilla = (RAIZ / "herramientas" / "plantilla_imprimir.html").read_text(encoding="utf-8")
    (PRIVADO / "imprimir.html").write_text(
        plantilla.replace("/*__DATOS__*/null", json.dumps(datos, ensure_ascii=False)), encoding="utf-8")

    print("Hecho.")
    print(f"  · {n_eq} equipos, {len(ids)} estaciones y {len(rutas)} rutas (de ≈{min(metros)} m a ≈{max(metros)} m)")
    if coincidencias:
        print(f"  · OJO: las rutas tienen {coincidencias} coincidencias de dos equipos en la misma estación a la vez")
    print("  · web/js/config.js actualizado (público) · generado/rutas.txt")
    if hay_mapas:
        print("  · web/assets/img/mapa.jpg y generado/mapa_con_estaciones.png")
    print("  · privado/: secretos.json, firebase_importar.json, firebase_secretos.json, imprimir.html")
    if "USUARIO" in base or "REPOSITORIO" in base:
        print("  ¡OJO! url_publica sigue siendo la de ejemplo: los QR no funcionarán hasta que pongas la de GitHub Pages.")
    if not torneo.get("firebase", {}).get("databaseURL"):
        print("  · Sin Firebase configurado: la app funcionará en MODO DEMO (solo en este navegador).")
    if rotar:
        print("  · Códigos rotados: vuelve a importar privado/firebase_secretos.json en el nodo /secretos de Firebase.")


if __name__ == "__main__":
    main()
