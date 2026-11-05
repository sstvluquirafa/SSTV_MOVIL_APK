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
import hashlib
import json
import math
import random
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


def codigo(n=6) -> str:
    return "".join(secrets.choice(ALFABETO) for _ in range(n))


def huella(texto: str, sal: str) -> str:
    """PBKDF2-SHA256, 100 000 iteraciones, 32 bytes. Coincide con GK.huella en util.js."""
    return hashlib.pbkdf2_hmac("sha256", normalizar(texto).encode(), bytes.fromhex(sal), ITERACIONES, 32).hex()


def sha256(texto: str) -> str:
    return hashlib.sha256(texto.encode()).hexdigest()


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
def main():
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
    previo = {} if rotar or not ruta_sec.exists() else json.loads(ruta_sec.read_text(encoding="utf-8"))

    sec = {
        "organizacion": previo.get("organizacion") or {"codigo": codigo(8), "sal": secrets.token_hex(16)},
        "ntfy_tema": previo.get("ntfy_tema") or ("gymkhana-sstv-" + secrets.token_hex(8)),
        "equipos": {},
        "estaciones": {},
    }
    for k in range(1, n_eq + 1):
        sec["equipos"][str(k)] = previo.get("equipos", {}).get(str(k)) or {"codigo": codigo(), "sal": secrets.token_hex(16)}
    for e in est:
        p = previo.get("estaciones", {}).get(str(e["id"])) or {}
        sec["estaciones"][str(e["id"])] = {
            "token": p.get("token") or secrets.token_urlsafe(12),
            # Clave que da la prueba al superarla. Para «codigo_estacion» es el código escondido en la estación.
            # Si una prueba necesita otra respuesta, cámbiala aquí y vuelve a ejecutar el script.
            "clave": p.get("clave") or codigo(),
            "sal": p.get("sal") or secrets.token_hex(16),
        }
    ruta_sec.write_text(json.dumps(sec, ensure_ascii=False, indent=2), encoding="utf-8")

    # ---------- rutas ----------
    mpp = float(torneo["mapa"].get("metros_por_pixel", 0.12))
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
             "prueba": e.get("prueba", {"tipo": "codigo_estacion"}),
             "token": sha256(sec["estaciones"][str(e["id"])]["token"]),
             "sal": sec["estaciones"][str(e["id"])]["sal"],
             "huella": huella(sec["estaciones"][str(e["id"])]["clave"], sec["estaciones"][str(e["id"])]["sal"])}
            for e in est
        ],
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
        "estaciones": {k: {"token": v["token"], "clave": normalizar(v["clave"])} for k, v in sec["estaciones"].items()},
    }
    rutas_fb = {}
    for i, r in enumerate(rutas):
        rutas_fb[str(i + 1)] = {str(s): {"anterior": "inicio" if j == 0 else str(r[j - 1]), "paso": j + 1} for j, s in enumerate(r)}
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
                        "clave": sec["estaciones"][str(e["id"])]["clave"]} for e in est],
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
