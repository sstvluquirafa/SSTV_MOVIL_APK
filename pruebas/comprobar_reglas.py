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
comprobar(secretos.get("final", {}).get("token") == "palabra" and bool(secretos["final"].get("clave")), "secretos: «final» con token fijo y clave")
comprobar(secretos.get("meta", {}).get("clave") == "llegada" and bool(secretos["meta"].get("token")), "secretos: «meta» con su token y clave «llegada»")

print("Reglas")
regla = reglas["rules"]["vivo"]["progreso"]["$equipo"]["$estacion"][".write"]
for trozo, que in [
    ("root.child('vivo/estado/iniciada').val() === true", "la partida tiene que estar en marcha"),
    ("child('anterior').val() === 'inicio' || data.parent().child(", "hace falta el paso anterior de su ruta"),
    ("child('token').val() === root.child('secretos/estaciones').child($estacion).child('token').val()", "token correcto"),
    ("child('clave').val() === root.child('secretos/estaciones').child($estacion).child('clave').val()", "clave correcta"),
    ("child('alternativas')", "sinónimos aceptados"),
    ("!data.exists()", "no se puede reescribir un paso"),
]:
    comprobar(trozo in regla, que)

print("Simulación de la regla de orden (palabra y meta)")


def puede(progreso, paso, ruta, token, clave):
    """Lo mismo que la regla .write de vivo/progreso/$equipo/$estacion (sin la parte de miembro ni partida)."""
    pasos = datos["rutas"][ruta]
    if paso not in pasos or paso in progreso:
        return False
    ant = pasos[paso]["anterior"]
    if ant != "inicio" and ant not in progreso:
        return False
    s = secretos[paso]
    return token == s["token"] and (clave == s["clave"] or (clave in s.get("alternativas", {})))


ruta = "1"
orden = sorted((k for k in datos["rutas"][ruta] if k not in ("final", "meta")), key=lambda k: datos["rutas"][ruta][k]["paso"])
hechas = {k: True for k in orden[:-1]}
fin, meta = secretos["final"], secretos["meta"]
comprobar(not puede(hechas, "final", ruta, fin["token"], fin["clave"]), "sin la última estación no se puede registrar la palabra")
comprobar(not puede(hechas, "meta", ruta, meta["token"], meta["clave"]), "sin la palabra no se puede registrar la meta")
todas = dict(hechas, **{orden[-1]: True})
comprobar(not puede(todas, "final", ruta, fin["token"], "otrapalabra"), "con una palabra incorrecta se rechaza")
comprobar(puede(todas, "final", ruta, fin["token"], fin["clave"]), "con todas las estaciones y la palabra buena se acepta")
comprobar(not puede(todas, "meta", ruta, meta["token"], meta["clave"]), "la meta sigue cerrada hasta registrar la palabra")
con_palabra = dict(todas, final=True)
comprobar(not puede(con_palabra, "meta", ruta, "tokenfalso", meta["clave"]), "la meta con un QR falso se rechaza")
comprobar(puede(con_palabra, "meta", ruta, meta["token"], meta["clave"]), "la meta con su QR se acepta")

print()
if fallos:
    print(f"{len(fallos)} comprobaciones fallidas")
    sys.exit(1)
print("Todo correcto.")
