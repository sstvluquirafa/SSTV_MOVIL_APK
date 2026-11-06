"""Servidor local de web/ para las pruebas automáticas.

Como «python -m http.server», pero con una cola de conexiones más larga: con varias pruebas a la vez, el de serie
(cola de 5) rechaza conexiones en Windows. Uso: python servidor.py PUERTO
"""
import functools
import http.server
import sys
from pathlib import Path

WEB = Path(__file__).resolve().parent.parent / "web"


class Servidor(http.server.ThreadingHTTPServer):
    request_queue_size = 128


class Manejador(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):  # sin ruido en la consola
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    puerto = int(sys.argv[1]) if len(sys.argv) > 1 else 8091
    Servidor(("127.0.0.1", puerto), functools.partial(Manejador, directory=str(WEB))).serve_forever()
