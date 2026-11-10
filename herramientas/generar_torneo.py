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
    privado/secretos.json              códigos de equipo, de organización, tokens y claves de estación (y de cada equipo)
    privado/firebase_importar.json     datos para importar en Firebase la primera vez (raíz de la base)
    privado/firebase_secretos.json     solo el nodo /secretos (para reimportar tras rotar códigos)
    privado/imprimir.html              carteles, etiquetas de código, tarjetas de equipo y hoja de organización

Lee además privado/bancos.json: los bancos de contenido CON respuestas de las pruebas que cambian por equipo.

La carpeta privado/ NO se sube a GitHub (.gitignore). Solo necesita la biblioteca estándar de Python;
con Pillow instalado (pip install pillow) genera además las imágenes del mapa.
"""
import base64
import hashlib
import hmac
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
    if p.get("tipo") == "wordle" and "clave" in s:  # (el Wordle por equipo lleva sus palabras en «equipos»)
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
    if s.get("dato") and "clave" in s:  # las de contenido lo llevan por equipo
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
# Contenido y claves por equipo
# ---------------------------------------------------------------------------------------------
# Las pruebas de CONTENIDO (abajo) dan a cada equipo un contenido distinto, sacado de privado/bancos.json, y una clave
# distinta. Todo es determinista a partir de la «semilla» secreta de privado/secretos.json: regenerar da lo mismo.
#
# Partes con varias respuestas válidas (por ejemplo «siete» o «7»): cada parte tiene un «trozo» secreto de la clave
# y se publica «sellado» con la huella de cada respuesta válida (sellos). En el móvil, con una respuesta buena se
# abre un sello y sale el trozo; la clave del equipo es la unión de los trozos. Así basta una sola clave en Firebase.
MORSE_DE = {v: k for k, v in MORSE.items()}


def derivar(semilla: str, texto: str) -> bytes:
    return hmac.new(bytes.fromhex(semilla), texto.encode(), hashlib.sha256).digest()


def trozo_clave(semilla: str, texto: str, n=6) -> str:
    """Trozo de clave al azar (determinista): n caracteres del alfabeto de códigos, en minúsculas."""
    return "".join(ALFABETO[b % len(ALFABETO)] for b in derivar(semilla, "trozo:" + texto)[:n]).lower()


def sellar(texto: str, respuesta: str, sal_hex: str) -> str:
    """Cifra «gk:» + texto con la huella (PBKDF2) de la respuesta. Igual que GK.abrirSello en web/js/util.js:
    k = bytes de la huella; bloque i = SHA-256(k + i en 4 bytes); XOR y base64."""
    k = bytes.fromhex(huella(respuesta, sal_hex))
    b = ("gk:" + texto).encode("utf-8")
    flujo = b"".join(hashlib.sha256(k + i.to_bytes(4, "big")).digest() for i in range(len(b) // 32 + 1))
    return base64.b64encode(bytes(x ^ flujo[i] for i, x in enumerate(b))).decode()


def a_morse(texto: str) -> str:
    """«NO DE» → «-. --- / -.. .»"""
    return " / ".join(" ".join(MORSE_DE[c] for c in w if c in MORSE_DE) for w in str(texto).upper().split())


class Equipo:
    """Lo que necesita cada prueba de contenido para un equipo: su azar, su sal y sus trozos de clave."""

    def __init__(self, semilla, est_id, eq, compartido=None, estacion=None):
        self.semilla, self.est, self.eq = semilla, est_id, eq
        self.sal = derivar(semilla, f"sal:{est_id}:{eq}")[:16].hex()
        self.azar = random.Random(derivar(semilla, f"azar:{est_id}:{eq}").hex())
        self.compartido = compartido if compartido is not None else {}  # lo ya elegido para este equipo en otras estaciones
        self.estacion = estacion or {}  # secretos de la estación (por ejemplo los textos de los QR impresos)

    def permutacion(self, lista) -> list:
        """La misma permutación para todos los equipos de esta estación (para repartir sin repetir entre equipos)."""
        copia = list(lista)
        random.Random(derivar(self.semilla, f"reparto:{self.est}").hex()).shuffle(copia)
        return copia

    def trozo(self, i) -> str:
        return trozo_clave(self.semilla, f"{self.est}:{self.eq}:{i}")

    def sellos(self, trozo, respuestas) -> list:
        unicas = list(dict.fromkeys(normalizar(r) for r in respuestas if normalizar(r)))
        return sorted(sellar(trozo, r, self.sal) for r in unicas)  # ordenados: no se sabe cuál es la principal


def contenido_morse(banco, eq: Equipo):
    """A · Morse: N preguntas del banco (3), en Morse en la pantalla. Cada una con sus sellos y la huella de la
    pregunta (para avisar si escriben la pregunta en vez de la respuesta)."""
    # Misma cantidad de trabajo para todos: entre «letras_min» y «letras_max» letras que traducir (si se puede)
    n = int(banco.get("por_equipo", 3))
    lo, hi = int(banco.get("letras_min", 44)), int(banco.get("letras_max", 50))
    for _ in range(500):
        elegidas = eq.azar.sample(banco["preguntas"], n)
        if lo <= sum(len(normalizar(q["pregunta"])) for q in elegidas) <= hi:
            break
    publico, trozos = [], []
    for i, q in enumerate(elegidas):
        morse = a_morse(q["pregunta"])
        if descifrar_morse(morse) != " ".join(q["pregunta"].upper().split()):
            print(f"  · OJO: la pregunta Morse «{q['pregunta']}» tiene símbolos sin código Morse (tildes, eñes…).")
        tr = eq.trozo(i)
        trozos.append(tr)
        publico.append({"morse": morse, "sellos": eq.sellos(tr, q["respuestas"]),
                        "huellaPregunta": huella(q["pregunta"], eq.sal)})
    return {"prueba": {"preguntas": publico}, "clave": "".join(trozos),
            "partes": [{"pregunta": q["pregunta"], "respuestas": q["respuestas"]} for q in elegidas]}


def contenido_pelis(banco, eq: Equipo):
    """B · Pelis: 6 películas con emojis. Con «lista_fija» (títulos, en orden), esas y en ese orden; si no, reparto por
    nivel (3 fáciles, 2 medias, 1 difícil), barajadas."""
    if banco.get("lista_fija"):
        por_titulo = {x["titulo"]: x for x in banco["peliculas"]}
        falta = [x for x in banco["lista_fija"] if x not in por_titulo]
        if falta:
            sys.exit(f"ERROR: en privado/bancos.json → pelis.lista_fija hay títulos que no están en «peliculas»: {falta}")
        elegidas = [por_titulo[x] for x in banco["lista_fija"]]
    else:
        elegidas = []
        for nivel, n in banco.get("reparto", {"fácil": 3, "media": 2, "difícil": 1}).items():
            elegidas += eq.azar.sample([x for x in banco["peliculas"] if x["nivel"] == nivel], n)
        eq.azar.shuffle(elegidas)
    publico, trozos = [], []
    for i, x in enumerate(elegidas):
        tr = eq.trozo(i)
        trozos.append(tr)
        titulos = [normalizar_titulo(y) for y in [x["titulo"], *x.get("tambien", [])]]
        publico.append({"emojis": x["emojis"], "sellos": eq.sellos(tr, titulos)})
    return {"prueba": {"peliculas": publico}, "clave": "".join(trozos),
            "partes": [{"pregunta": " ".join(x["emojis"]), "respuestas": [x["titulo"], *x.get("tambien", [])]} for x in elegidas]}


def contenido_wordle(banco, eq: Equipo):
    """E · Wordle: una palabra de 5 letras y otra de 6. Se reparten en orden para que dos equipos seguidos nunca
    tengan la misma. EXCEPCIÓN DOCUMENTADA: van ofuscadas (el móvil las necesita para colorear)."""
    palabras = []
    for lista in (banco["cinco"], banco["seis"]):
        orden = eq.permutacion(lista)
        palabras.append(orden[(eq.eq - 1) % len(orden)].upper())
    eq.compartido.setdefault("palabras", set()).update(palabras)
    publico = []
    for i, w in enumerate(palabras):
        sal_w = derivar(eq.semilla, f"wordle:{eq.est}:{eq.eq}:{i}")[:8].hex()
        publico.append({"palabra": ofuscar(w, sal_w), "salPalabra": sal_w})
    return {"prueba": {"palabras": publico}, "clave": "".join(palabras),
            "partes": [{"pregunta": f"{len(w)} letras", "respuestas": [w.lower()]} for w in palabras]}


def contenido_binario(banco, eq: Equipo):
    """C · Binario: una palabra de cada lista (4, 5 y 6 letras), sin repetir las del Wordle del equipo. Cada letra es
    una fila de 5 bombillas (A=1 … Z=26)."""
    usadas = eq.compartido.get("palabras", set())
    palabras = []
    for lista in banco["palabras"]:
        libres = [w.upper() for w in lista if w.upper() not in usadas] or [w.upper() for w in lista]
        palabras.append(eq.azar.choice(libres))
    publico, trozos = [], []
    for i, w in enumerate(palabras):
        tr = eq.trozo(i)
        trozos.append(tr)
        publico.append({"filas": [format(ord(c) - 64, "05b") for c in w], "sellos": eq.sellos(tr, [w])})
    return {"prueba": {"palabras": publico}, "clave": "".join(trozos),
            "partes": [{"pregunta": f"{len(w)} letras", "respuestas": [w.lower()]} for w in palabras]}


def contenido_qr(banco, eq: Equipo):
    """D · QR escondido: 3 QR impresos (los mismos para todos: secretos de la estación → qrs). Al escanear el QR i,
    se abre (con su texto) la palabra de ESTE equipo para ese QR. Las 3 palabras, en orden, se escriben como clave."""
    qrs = eq.estacion["qrs"]
    palabras = eq.azar.sample([w.upper() for w in banco["palabras"]], len(qrs))
    publico, trozos = [], []
    for i, (qr, w) in enumerate(zip(qrs, palabras)):
        tr = eq.trozo(i)
        trozos.append(tr)
        publico.append({"escaneo": sellar(w, qr, eq.sal), "sellos": eq.sellos(tr, [w])})
    return {"prueba": {"qrs": publico}, "clave": "".join(trozos),
            "partes": [{"pregunta": f"QR D{i + 1}", "respuestas": [w.lower()]} for i, w in enumerate(palabras)]}


def contenido_geoguessr(banco, eq: Equipo):
    """F · GeoGuessr: 5 fotos (1 de Granada, 2 de España, 2 del mundo), barajadas, con las opciones barajadas.
    La clave son las letras de las correctas en orden («cabda»)."""
    elegidas = []
    for grupo, n in banco.get("reparto", {"granada": 1, "espana": 2, "mundo": 2}).items():
        elegidas += eq.azar.sample([f for f in banco["fotos"] if f["grupo"] == grupo], n)
    eq.azar.shuffle(elegidas)
    imagenes, letras = [], ""
    for f in elegidas:
        opciones = list(f["opciones"])
        eq.azar.shuffle(opciones)
        letras += "abcd"[opciones.index(f["opciones"][0])]
        imagenes.append({"src": f["src"], "credito": f.get("credito", ""), "opciones": opciones})
    return {"prueba": {"imagenes": imagenes}, "clave": letras,
            "partes": [{"pregunta": f["lugar"], "respuestas": [letras[i]]} for i, f in enumerate(elegidas)]}


NUMEROS_TXT = ["Ninguna", "Una", "Dos", "Tres", "Cuatro", "Cinco"]


def texto_pista(bien: int, mal: int) -> str:
    """(2, 0) → «Dos cifras son correctas y están bien colocadas»…"""
    total = bien + mal
    if not total:
        return "Ninguna cifra es correcta"
    s = "s" if total > 1 else ""
    base = f"{NUMEROS_TXT[total]} cifra{s} {'son' if total > 1 else 'es'} correcta{s}"
    if not mal:
        return base + (" y están bien colocadas" if total > 1 else " y está bien colocada")
    if not bien:
        return base + (" pero están mal colocadas" if total > 1 else " pero está mal colocada")
    return (base + f": {NUMEROS_TXT[bien].lower()} bien colocada{'s' if bien > 1 else ''}"
            f" y {'otra' if bien == 1 and mal == 1 else NUMEROS_TXT[mal].lower()} mal colocada{'s' if mal > 1 else ''}")


def respuesta_pista(secreto: str, intento: str):
    bien = sum(a == b for a, b in zip(secreto, intento))
    return bien, len(set(secreto) & set(intento)) - bien


def generar_escotilla(azar, cifras: int, n_pistas: int):
    """Acertijo de la escotilla con UNA sola solución (cifras sin repetir), comprobada probando todas las
    combinaciones. Siempre lleva una pista sin ninguna cifra correcta, ninguna pista con todas las cifras correctas
    y ninguna sobra (quitando cualquiera, ya hay más de una solución): así la dificultad es parecida para todos."""
    todos = ["".join(x) for x in itertools.permutations("0123456789", cifras)]
    for _ in range(20000):
        secreto = azar.choice(todos)
        fuera = [d for d in "0123456789" if d not in secreto]
        cero = "".join(azar.sample(fuera, cifras))
        pistas = [cero]
        cand = [c for c in todos if respuesta_pista(c, cero) == (0, 0)]
        intentos = 0
        while len(pistas) < n_pistas and intentos < 400:  # si se atasca (ya hay una sola solución), se empieza de nuevo
            intentos += 1
            g = azar.choice(todos)
            r = respuesta_pista(secreto, g)
            if g in pistas or sum(r) == 0 or sum(r) == cifras:
                continue
            nuevo = [c for c in cand if respuesta_pista(c, g) == r]
            if len(nuevo) < len(cand) and (len(nuevo) > 1 or len(pistas) == n_pistas - 1):
                pistas.append(g)
                cand = nuevo
        if cand != [secreto]:
            continue
        sobra = False
        for i in range(len(pistas)):
            resto = pistas[:i] + pistas[i + 1:]
            if sum(all(respuesta_pista(c, g) == respuesta_pista(secreto, g) for g in resto) for c in todos) == 1:
                sobra = True
                break
        if sobra:
            continue
        azar.shuffle(pistas)
        return secreto, [{"codigo": g, "texto": texto_pista(*respuesta_pista(secreto, g))} for g in pistas]
    raise RuntimeError(f"No encuentro una escotilla de {cifras} cifras con {n_pistas} pistas")


def comprobar_escotilla_fija(n: int, esc: dict) -> str:
    """Escotilla escrita a mano: prueba TODAS las combinaciones de cifras distintas y exige una única solución, que sea
    la indicada, y que cada pista diga lo que dice su «bien»/«mal». Devuelve la solución."""
    sol = str(esc["solucion"])
    cifras = len(sol)
    for p in esc["pistas"]:
        if respuesta_pista(sol, str(p["codigo"])) != (int(p["bien"]), int(p["mal"])):
            sys.exit(f"ERROR: escotilla fija {n}: la pista {p['codigo']} no cuadra con la solución {sol}.")
    todos = ["".join(x) for x in itertools.permutations("0123456789", cifras)]
    validas = [c for c in todos if all(respuesta_pista(c, str(p["codigo"])) == (int(p["bien"]), int(p["mal"])) for p in esc["pistas"])]
    if validas != [sol]:
        sys.exit(f"ERROR: la escotilla fija {n} tiene {len(validas)} soluciones ({', '.join(validas[:10])}), no solo {sol}.")
    return sol


def contenido_caja(banco, eq: Equipo):
    """H · Escotilla: dos escotillas seguidas (3 cifras con 5 pistas y 4 cifras con 6), generadas por equipo. La
    primera se comprueba en el móvil con su huella; la clave es la unión de los dos códigos."""
    escotillas, codigos = [], []
    if banco.get("escotillas_fijas"):
        # Acertijos escritos a mano (iguales para todos), con las pistas en su orden
        fijas = banco["escotillas_fijas"]
        for i, esc in enumerate(fijas):
            codigo_e = comprobar_escotilla_fija(i + 1, esc)
            codigos.append(codigo_e)
            escotillas.append({"cifras": len(codigo_e), "pistas": [{"codigo": str(p["codigo"]), "texto": p["texto"]} for p in esc["pistas"]],
                               **({"huella": huella(codigo_e, eq.sal)} if i < len(fijas) - 1 else {})})
        return {"prueba": {"escotillas": escotillas}, "clave": "".join(codigos),
                "partes": [{"pregunta": f"Escotilla {i + 1}", "respuestas": [c]} for i, c in enumerate(codigos)]}
    for i, conf in enumerate(banco.get("escotillas", [{"cifras": 3, "pistas": 5}, {"cifras": 4, "pistas": 6}])):
        codigo_e, pistas = generar_escotilla(eq.azar, int(conf["cifras"]), int(conf["pistas"]))
        codigos.append(codigo_e)
        escotillas.append({"cifras": len(codigo_e), "pistas": pistas,
                           **({"huella": huella(codigo_e, eq.sal)} if i < len(banco.get("escotillas", [1, 1])) - 1 else {})})
    return {"prueba": {"escotillas": escotillas}, "clave": "".join(codigos),
            "partes": [{"pregunta": f"Escotilla {i + 1}", "respuestas": [c]} for i, c in enumerate(codigos)]}


def contenido_bulo(banco, eq: Equipo):
    """J · ¿Bulo o verdad?: 10 noticias (5 bulos y 5 verdades) en 2 rondas de 5, con 2 o 3 bulos por ronda. Cada
    ronda tiene su patrón (b/v); la 1.ª se comprueba con su huella. Las explicaciones de cada ronda van cifradas con
    lo acertado hasta esa ronda. Clave = los dos patrones seguidos."""
    rondas, por_ronda = int(banco.get("rondas", 2)), int(banco.get("por_ronda", 5))
    n_bulos = int(banco.get("bulos", 5))
    bulos = eq.azar.sample([x for x in banco["noticias"] if x["es"] == "b"], n_bulos)
    verdades = eq.azar.sample([x for x in banco["noticias"] if x["es"] == "v"], rondas * por_ronda - n_bulos)
    # Bulos por ronda lo más parejos posible (5 en 2 rondas → 2 y 3, en orden al azar)
    reparto = [n_bulos // rondas + (1 if i < n_bulos % rondas else 0) for i in range(rondas)]
    eq.azar.shuffle(reparto)
    publico, patrones, acumulado = [], [], ""
    for r, nb in enumerate(reparto):
        ronda = bulos[:nb] + verdades[:por_ronda - nb]
        bulos, verdades = bulos[nb:], verdades[por_ronda - nb:]
        eq.azar.shuffle(ronda)
        patron = "".join(x["es"] for x in ronda)
        patrones.append(patron)
        acumulado += patron
        expl = [("BULO: " if x["es"] == "b" else "VERDAD: ") + x["explicacion"] for x in ronda]
        publico.append({"afirmaciones": [x["texto"] for x in ronda],
                        "explicacionesCifradas": cifrar(json.dumps(expl, ensure_ascii=False), acumulado, eq.sal),
                        **({"huella": huella(acumulado, eq.sal)} if r < rondas - 1 else {})})
    return {"prueba": {"rondas": publico}, "clave": "".join(patrones),
            "partes": [{"pregunta": f"Ronda {i + 1}", "respuestas": [p]} for i, p in enumerate(patrones)]}


LETRAS_CLAVE = "ACEFHJKMNPRTUVWXY"  # letras que no se confunden


def letras_equipo(eq: Equipo, n=4) -> list:
    return eq.azar.sample(LETRAS_CLAVE, n)


# ---------- G · Busca las diferencias ----------
# Escena de 400 × 300 (4:3) dividida en 4 zonas de 200 × 150 (1 y 2 arriba, 3 y 4 abajo). Cada zona tiene 4 objetos
# en una rejilla de 3 × 2 huecos; la «recibida» tiene 3 diferencias por zona. Todos los equipos tienen los mismos
# TIPOS de diferencia (2 de cada), repartidos al azar entre las zonas: misma dificultad, distinto contenido.
OBJETOS_DIF = {  # tipo: (tamaño, ¿se nota al girarlo?)
    "planeta": (34, False), "luna": (30, True), "estrella": (24, False), "cohete": (36, True),
    "cubesat": (32, True), "astronauta": (34, True), "cometa": (34, True), "antena": (32, True),
}
COLORES_DIF = {"ambar": "#ffb627", "azul": "#3d8bff", "blanco": "#eef1fa", "coral": "#ff6b5b", "fosforo": "#5ee6d0"}
# Cambio de color siempre a uno con brillo muy distinto (que se note también sin distinguir bien los tonos)
CAMBIO_COLOR = {"ambar": "azul", "azul": "blanco", "blanco": "azul", "coral": "blanco", "fosforo": "azul"}
TIPOS_DIF = ["falta", "extra", "tamano", "girado", "color", "movido"]


def contenido_diferencias(banco, eq: Equipo):
    az = eq.azar
    zonas = [(0, 0), (200, 0), (0, 150), (200, 150)]
    estrellas = [[round(az.uniform(4, 396), 1), round(az.uniform(4, 296), 1), round(az.choice([0.6, 0.8, 1.1, 1.4]), 1)]
                 for _ in range(int(banco.get("estrellas", 70)))]
    # 12 diferencias: 2 de cada tipo, repartidas 3 por zona sin repetir tipo en la misma zona
    while True:
        bolsa = [x for x in TIPOS_DIF for _ in range(2)]
        az.shuffle(bolsa)
        por_zona = [bolsa[i * 3:(i + 1) * 3] for i in range(4)]
        if all(len(set(z)) == 3 for z in por_zona):
            break
    original, recibida, difs = [], [], []
    letras = letras_equipo(eq)
    sellos = []
    for z, (x0, y0) in enumerate(zonas):
        huecos = [(c, f) for c in range(3) for f in range(2)]
        az.shuffle(huecos)
        usados, libres = huecos[:4], huecos[4:]
        objs = []
        for i, (c, f) in enumerate(usados):
            tipo = az.choice(list(OBJETOS_DIF))
            s = OBJETOS_DIF[tipo][0]
            objs.append({"t": tipo, "x": round(x0 + 36 + c * 64 + az.uniform(-6, 6), 1), "y": round(y0 + 40 + f * 72 + az.uniform(-6, 6), 1),
                         "s": s, "r": az.choice([0, 0, 15, -15, 30]), "c": az.choice(list(COLORES_DIF))})
            if tipo == "planeta" and az.random() < 0.5:
                objs[-1]["a"] = 1  # con anillo
        nuevos = [dict(o) for o in objs]
        candidatos = list(range(len(objs)))
        az.shuffle(candidatos)
        ids = []
        for k, tipo_d in enumerate(por_zona[z]):
            did = f"{z + 1}{'abc'[k]}{trozo_clave(eq.semilla, f'dif:{eq.est}:{eq.eq}:{z}:{k}', 3)}"
            ids.append(did)
            if tipo_d == "extra":
                c, f = libres.pop()
                tipo = az.choice(["estrella", "planeta", "luna", "cometa"])
                o = {"t": tipo, "x": round(x0 + 36 + c * 64, 1), "y": round(y0 + 40 + f * 72, 1), "s": OBJETOS_DIF[tipo][0],
                     "r": 0, "c": az.choice(list(COLORES_DIF))}
                nuevos.append(o)
                difs.append({"id": did, "x": o["x"], "y": o["y"], "r": 28})
                continue
            # Las demás cambian un objeto (uno distinto en cada diferencia; para girar, uno que se note girado)
            i = next(j for j in candidatos if tipo_d != "girado" or OBJETOS_DIF[objs[j]["t"]][1])
            candidatos.remove(i)
            o, n = objs[i], nuevos[i]
            if tipo_d == "falta":
                n["oculto"] = 1
            elif tipo_d == "tamano":
                n["s"] = round(o["s"] * (1.7 if o["s"] < 32 else 0.55))
            elif tipo_d == "girado":
                n["r"] = o["r"] + az.choice([90, 180, -90])
            elif tipo_d == "color":
                n["c"] = CAMBIO_COLOR[o["c"]]
            elif tipo_d == "movido":
                dx = 30 if o["x"] - x0 < 100 else -30
                n["x"], n["y"] = round(o["x"] + dx, 1), round(min(max(o["y"] + az.choice([-22, 22]), y0 + 22), y0 + 128), 1)
            d = {"id": did, "x": n["x"], "y": n["y"], "r": 28}
            if tipo_d == "movido":  # también vale tocar donde estaba
                d["x2"], d["y2"] = o["x"], o["y"]
            difs.append(d)
        original += objs
        recibida += [n for n in nuevos if not n.get("oculto")]
        # La letra de la zona se abre con los ids de sus 3 diferencias (las encuentra quien las toca)
        sellos.append(sellar(letras[z], f"zona{z + 1}" + "".join(sorted(ids)), eq.sal))
    for o in original + recibida:
        o["c"] = COLORES_DIF.get(o["c"], o["c"])
    return {"prueba": {"estrellas": estrellas, "original": original, "recibida": recibida, "diferencias": difs,
                       "sellosZona": sellos},
            "clave": "".join(letras),
            "partes": [{"pregunta": f"Zona {z + 1}", "respuestas": [letras[z].lower()]} for z in range(4)]}


# ---------- I · Imagen SSTV desordenada ----------
# Cuatro puzles independientes de 3 × 3, cada uno con su ilustración (SVG propio, de colores vivos y con algo
# reconocible en cada pieza). Cada puzle resuelto da una letra; las 4, en orden, forman la palabra del banco («NAVE»).
# Con «igual_para_todos», la misma mezcla y la misma clave para todos los equipos.
def mezclar_puzle(azar, n=9, fuera_min=7):
    """Piezas cambiadas de sitio y giradas, sin NINGUNA en su sitio y orientación correctos, y con al menos
    «fuera_min» piezas fuera de su sitio (para que no sea solo girar)."""
    for _ in range(2000):
        orden = list(range(n))
        azar.shuffle(orden)
        inicio = [[p, azar.randrange(4)] for p in orden]
        for h, (p, g) in enumerate(inicio):
            if p == h and g == 0:
                inicio[h][1] = azar.randrange(1, 4)
        if sum(p != h for h, (p, _) in enumerate(inicio)) >= fuera_min:
            return inicio
    raise RuntimeError("No consigo mezclar el puzle")


def contenido_sstv(banco, eq: Equipo):
    letras = list(str(banco.get("palabra", "NAVE")).upper())
    imagenes = banco["imagenes"]
    if len(letras) != len(imagenes):
        sys.exit(f"ERROR: privado/bancos.json → sstv_puzle: la palabra «{''.join(letras)}» tiene {len(letras)} letras y hay {len(imagenes)} imágenes.")
    puzles = []
    for q, im in enumerate(imagenes):
        if not (WEB / im["src"]).exists():
            print(f"  · OJO: falta la imagen del puzle {q + 1}: web/{im['src']}")
        puzles.append({"src": im["src"], "inicio": mezclar_puzle(eq.azar),
                       # La letra se abre al resolverlo (ver la EXCEPCIÓN en web/js/pruebas/sstv_puzle.js)
                       "sello": sellar(letras[q], f"puzle{q + 1}resuelto", eq.sal)})
    return {"prueba": {"puzles": puzles}, "clave": "".join(letras),
            "partes": [{"pregunta": f"Imagen {q + 1} ({im.get('nombre', '')})", "respuestas": [letras[q].lower()]} for q, im in enumerate(imagenes)]}


# ---------- G · ¿Más o menos? ----------
def contenido_mas_menos(banco, eq: Equipo):
    """Parejas de «¿qué es más…?». El móvil necesita saber al momento si aciertan, pero sin respuestas en claro: cada
    pareja lleva la huella (PBKDF2 con sal) del nombre correcto, y su dato va cifrado con ese nombre (solo se lee tras
    contestar). La clave de la estación se revela al encadenar la racha: va ofuscada, como las palabras del Wordle."""
    parejas = []
    for x in banco["parejas"]:
        buena = x[x["correcta"]]["nombre"]
        parejas.append({"pregunta": x["pregunta"], "opciones": [x["a"], x["b"]],
                        "huella": huella(buena, eq.sal), "datoCifrado": cifrar(x["dato"], buena, eq.sal)})
    clave = trozo_clave(eq.semilla, f"masmenos:{eq.est}", 8)
    sal_c = derivar(eq.semilla, f"masmenos-sal:{eq.est}")[:8].hex()
    return {"prueba": {"racha": int(banco.get("racha", 8)), "porIntento": int(banco.get("por_intento", 8)),
                       "parejas": parejas, "clave": ofuscar(clave, sal_c), "salClave": sal_c},
            "clave": clave,
            "partes": [{"pregunta": x["pregunta"].replace("*", "") + f" {x['a']['nombre']} / {x['b']['nombre']}",
                        "respuestas": [x[x["correcta"]]["nombre"]], "opciones": [x["a"]["nombre"], x["b"]["nombre"]]}
                       for x in banco["parejas"]]}


# tipo de prueba → función que crea el contenido de un equipo a partir de su banco (privado/bancos.json → tipo)
CONTENIDO = {"mas_menos": contenido_mas_menos, "diferencias": contenido_diferencias, "sstv_puzle": contenido_sstv, "morse": contenido_morse, "pelis": contenido_pelis, "wordle": contenido_wordle, "binario": contenido_binario,
             "qr_escondido": contenido_qr, "geoguessr": contenido_geoguessr, "caja_fuerte": contenido_caja,
             "bulo_verdad": contenido_bulo}
# Las que se generan antes que las demás (el Binario evita las palabras del Wordle de cada equipo)
PRIMERO = ["wordle"]


def generar_por_equipo(e, s, bancos, semilla, n_eq, compartido):
    """Contenido y claves de cada equipo para una estación de CONTENIDO. Devuelve (público, secreto) por equipo."""
    tipo = e["prueba"]["tipo"]
    if tipo not in bancos:
        sys.exit(f"ERROR: falta el banco «{tipo}» en privado/bancos.json (estación {e['letra']}).")
    publico, secreto = {}, {}
    # «igual_para_todos» en el banco: el mismo contenido, la misma sal y la misma clave para todos los equipos
    igual = bool(bancos[tipo].get("igual_para_todos"))
    comun = None
    for k in range(1, n_eq + 1):
        if igual and comun:
            publico[str(k)], secreto[str(k)] = comun
            continue
        eq = Equipo(semilla, e["id"], 0 if igual else k, compartido.setdefault(k, {}), s)
        c = CONTENIDO[tipo](bancos[tipo], eq)
        clave = normalizar(c["clave"])
        pub = {"prueba": c["prueba"], "sal": eq.sal, "huella": huella(clave, eq.sal)}
        if s.get("dato"):
            pub["datoCifrado"] = [cifrar("gk:" + s["dato"], clave, eq.sal)]
        publico[str(k)] = pub
        secreto[str(k)] = {"clave": clave, **{x: v for x, v in c.items() if x not in ("prueba", "clave")}}
        if igual:
            comun = (publico[str(k)], secreto[str(k)])
    return publico, secreto


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

    ruta_bancos = PRIVADO / "bancos.json"
    bancos = json.loads(ruta_bancos.read_text(encoding="utf-8")) if ruta_bancos.exists() else {}
    sec = {
        # Semilla del contenido por equipo: se conserva siempre (también con --rotar) para que no cambie el contenido
        "semilla": todo_previo.get("semilla") or secrets.token_hex(32),
        "organizacion": previo.get("organizacion") or {"codigo": codigo(8), "sal": secrets.token_hex(16)},
        "ntfy_tema": previo.get("ntfy_tema") or ("gymkhana-sstv-" + secrets.token_hex(8)),
        "equipos": {},
        "estaciones": {},
    }
    for k in range(1, n_eq + 1):
        sec["equipos"][str(k)] = previo.get("equipos", {}).get(str(k)) or {"codigo": codigo(), "sal": secrets.token_hex(16)}
    claves_azar = []
    publico_eq = {}  # id de estación → contenido público de cada equipo (pruebas de CONTENIDO)
    secreto_eq = {}  # id de estación → secretos de cada equipo
    compartido = {}  # equipo → lo ya elegido en otras estaciones (por ejemplo las palabras del Wordle)
    de_contenido = [e for e in est if (e.get("prueba") or {}).get("tipo") in CONTENIDO]
    for e in sorted(de_contenido, key=lambda e: 0 if e["prueba"]["tipo"] in PRIMERO else 1):
        s_prev = todo_previo.get("estaciones", {}).get(str(e["id"])) or {}
        if e["prueba"]["tipo"] == "qr_escondido":
            # Los 3 QR impresos: el mismo texto para todos los equipos; se conservan (con --rotar, se renuevan)
            n_qr = len(e["prueba"].get("escondites") or [1, 2, 3])
            viejos = (previo.get("estaciones", {}).get(str(e["id"])) or {}).get("qrs") or []
            s_prev = {**s_prev, "qrs": [viejos[i] if i < len(viejos) else f"GK-QR-{codigo()}-{i + 1}" for i in range(n_qr)]}
        publico_eq[e["id"]], secreto_eq[e["id"]] = generar_por_equipo(e, s_prev, bancos, sec["semilla"], n_eq, compartido)
        secreto_eq[e["id"]] = (s_prev.get("qrs"), secreto_eq[e["id"]])
    for e in est:
        tipo = (e.get("prueba") or {}).get("tipo", "codigo_estacion")
        siempre = todo_previo.get("estaciones", {}).get(str(e["id"])) or {}  # respuestas y sinónimos
        p = previo.get("estaciones", {}).get(str(e["id"])) or {}
        s = {
            **siempre,  # se conservan los campos extra (por ejemplo «alternativas»)
            "token": p.get("token") or secrets.token_urlsafe(12),
            "sal": p.get("sal") or secrets.token_hex(16),
        }
        if tipo in CONTENIDO:
            # Contenido y clave distintos para cada equipo (la estación no tiene clave propia)
            for x in ("clave", "alternativas", "equipos", "qr", "peliculas", "explicaciones"):
                s.pop(x, None)
            qrs, s["equipos"] = secreto_eq[e["id"]]
            if qrs:
                s["qrs"] = qrs
        elif tipo == "codigo_estacion":
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
             # Pruebas de CONTENIDO: contenido, sal y huella de cada equipo; las demás, una huella para todos
             **({"equipos": publico_eq[e["id"]]} if e["id"] in publico_eq else
                {"huella": huella(sec["estaciones"][str(e["id"])]["clave"], sec["estaciones"][str(e["id"])]["sal"])})}
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
    def clave_fb(v):
        """Clave y sinónimos (las reglas los miran en «alternativas»), ya normalizados."""
        return {"clave": normalizar(v["clave"]),
                **({"alternativas": {normalizar(a): True for a in v["alternativas"] if normalizar(a)}}
                   if v.get("alternativas") else {})}

    def estacion_fb(token, v):
        """Las reglas comprueban la clave DEL EQUIPO (secretos/estaciones/$id/equipos/$equipo). En las pruebas de
        contenido cada equipo tiene la suya; en las demás, la misma para todos."""
        por_eq = v.get("equipos") or {}
        return {"token": token, "equipos": {str(k): clave_fb(por_eq.get(str(k)) or v) for k in range(1, n_eq + 1)}}

    secretos_fb = {
        "organizacion": normalizar(sec["organizacion"]["codigo"]),
        "equipos": {k: normalizar(v["codigo"]) for k, v in sec["equipos"].items()},
        "estaciones": {k: estacion_fb(v["token"], v) for k, v in sec["estaciones"].items()},
    }
    secretos_fb["estaciones"]["final"] = estacion_fb(TOKEN_FINAL, {"clave": sec["final"]["clave"]})
    secretos_fb["estaciones"]["meta"] = estacion_fb(sec["meta"]["token"], {"clave": CLAVE_META})
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
                        "clave": sec["estaciones"][str(e["id"])].get("clave", "(una por equipo)"),
                        "porEquipo": {k: {"clave": v["clave"], "partes": v.get("partes", [])}
                                      for k, v in (sec["estaciones"][str(e["id"])].get("equipos") or {}).items()},
                        "alternativas": sec["estaciones"][str(e["id"])].get("alternativas", []),
                        "peliculas": sec["estaciones"][str(e["id"])].get("peliculas", []),
                        "prueba": e.get("prueba") or {},
                        "pregunta": descifrar_morse(e["prueba"]["cartel"]) if (e.get("prueba") or {}).get("tipo") == "morse" and e["prueba"].get("cartel") else "",
                        "qr": sec["estaciones"][str(e["id"])].get("qr", ""),
                        "qrs": sec["estaciones"][str(e["id"])].get("qrs", []),
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
