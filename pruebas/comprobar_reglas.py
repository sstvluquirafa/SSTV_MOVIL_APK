"""Comprueba que los datos para Firebase y las reglas encajan para la palabra final y la meta.

No sustituye a probar contra Firebase (o su emulador, que necesita Java 11 o superior): revisa que
privado/firebase_importar.json tiene los pasos «final» y «meta» al final de cada ruta, con sus secretos, y que
firebase/reglas.json sigue exigiendo orden, token y clave al completar un paso. Además simula esa regla en Python
para ver que no deja saltarse la palabra ni la meta.

Uso (desde la raíz del proyecto o desde pruebas/):  python pruebas/comprobar_reglas.py
"""
import json
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
try:  # tildes en la consola de Windows
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass
fallos = []


def comprobar(cond, texto):
    print(("  ok  " if cond else "  MAL ") + texto)
    if not cond:
        fallos.append(texto)


datos = json.loads((RAIZ / "privado" / "firebase_importar.json").read_text(encoding="utf-8"))
reglas_txt = (RAIZ / "firebase" / "reglas.json").read_text(encoding="utf-8")
reglas = json.loads(reglas_txt)
secretos = datos["secretos"]["estaciones"]

print("Datos para Firebase")
for r, pasos in datos["rutas"].items():
    estaciones = sorted((p for k, p in pasos.items() if k not in ("final", "meta")), key=lambda p: p["paso"])
    ultima = next(k for k, p in pasos.items() if p["paso"] == len(estaciones))
    comprobar(pasos.get("final", {}).get("anterior") == ultima, f"ruta {r}: «final» va después de la última estación ({ultima})")
    comprobar(pasos.get("meta", {}).get("anterior") == "final", f"ruta {r}: «meta» va después de «final»")
equipos = sorted(datos["equipos"])
comprobar(secretos.get("final", {}).get("token") == "palabra" and all(secretos["final"]["equipos"][q].get("clave") for q in equipos), "secretos: «final» con token fijo y clave para cada equipo")
comprobar(bool(secretos.get("meta", {}).get("token")) and all(secretos["meta"]["equipos"][q].get("clave") == "llegada" for q in equipos), "secretos: «meta» con su token y clave «llegada» para cada equipo")
comprobar(all(set(v.get("equipos", {})) == set(equipos) for v in secretos.values()), "secretos: todas las estaciones tienen la clave de cada equipo")

print("Reglas")
regla = reglas["rules"]["vivo"]["progreso"]["$equipo"]["$estacion"][".write"]
for trozo, que in [
    ("root.child('vivo/estado/iniciada').val() === true", "la partida tiene que estar en marcha"),
    ("child('anterior').val() === 'inicio' || data.parent().child(", "hace falta el paso anterior de su ruta"),
    ("child('token').val() === root.child('secretos/estaciones').child($estacion).child('token').val()", "token correcto"),
    ("child('clave').val() === root.child('secretos/estaciones').child($estacion).child('equipos').child($equipo).child('clave').val()", "clave correcta DEL EQUIPO"),
    ("child('equipos').child($equipo).child('alternativas')", "sinónimos aceptados (del equipo)"),
    ("!data.exists()", "no se puede reescribir un paso"),
]:
    comprobar(trozo in regla, que)

print("Simulación de la regla de orden (palabra y meta)")


def puede(progreso, paso, ruta, token, clave, equipo="1"):
    """Lo mismo que la regla .write de vivo/progreso/$equipo/$estacion (sin la parte de miembro ni partida)."""
    pasos = datos["rutas"][ruta]
    if paso not in pasos or paso in progreso:
        return False
    ant = pasos[paso]["anterior"]
    if ant != "inicio" and ant not in progreso:
        return False
    s = secretos[paso]
    c = s["equipos"][equipo]
    return token == s["token"] and (clave == c["clave"] or (clave in c.get("alternativas", {})))


ruta = "1"
orden = sorted((k for k in datos["rutas"][ruta] if k not in ("final", "meta")), key=lambda k: datos["rutas"][ruta][k]["paso"])
hechas = {k: True for k in orden[:-1]}
fin = {"token": secretos["final"]["token"], "clave": secretos["final"]["equipos"]["1"]["clave"]}
meta = {"token": secretos["meta"]["token"], "clave": secretos["meta"]["equipos"]["1"]["clave"]}
comprobar(not puede(hechas, "final", ruta, fin["token"], fin["clave"]), "sin la última estación no se puede registrar la palabra")
comprobar(not puede(hechas, "meta", ruta, meta["token"], meta["clave"]), "sin la palabra no se puede registrar la meta")
todas = dict(hechas, **{orden[-1]: True})
comprobar(not puede(todas, "final", ruta, fin["token"], "otrapalabra"), "con una palabra incorrecta se rechaza")
comprobar(puede(todas, "final", ruta, fin["token"], fin["clave"]), "con todas las estaciones y la palabra buena se acepta")
comprobar(not puede(todas, "meta", ruta, meta["token"], meta["clave"]), "la meta sigue cerrada hasta registrar la palabra")
con_palabra = dict(todas, final=True)
comprobar(not puede(con_palabra, "meta", ruta, "tokenfalso", meta["clave"]), "la meta con un QR falso se rechaza")
comprobar(puede(con_palabra, "meta", ruta, meta["token"], meta["clave"]), "la meta con su QR se acepta")

print("Simulación: clave por equipo (estaciones de contenido)")
por_eq = {k: v for k, v in secretos.items() if len({c["clave"] for c in v["equipos"].values()}) > 1}
comprobar(bool(por_eq), "hay estaciones con una clave distinta para cada equipo")
for k, v in por_eq.items():
    r1 = next(r for r, pasos in datos["rutas"].items() if pasos[k]["anterior"] == "inicio")
    c1, c2 = v["equipos"]["1"]["clave"], v["equipos"]["2"]["clave"]
    comprobar(puede({}, k, r1, v["token"], c1, "1"), f"estación {k}: el equipo 1 con su clave se acepta")
    comprobar(not puede({}, k, r1, v["token"], c2, "1"), f"estación {k}: el equipo 1 con la clave del equipo 2 se rechaza")

print()
if fallos:
    print(f"{len(fallos)} comprobaciones fallidas")
    sys.exit(1)
print("Todo correcto.")
