"""Local web server for the app: like `python3 -m http.server`, but tells the browser
not to cache, so code changes show up on a normal reload.

Run from the project folder:   python3 serve.py        (then open http://localhost:8766/web/)
"""
import functools
import http.server
import sys
from pathlib import Path

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8766
ROOT = Path(__file__).resolve().parent


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    handler = functools.partial(NoCacheHandler, directory=str(ROOT))
    with http.server.ThreadingHTTPServer(("127.0.0.1", PORT), handler) as httpd:
        print(f"Serving {ROOT} at http://localhost:{PORT}/web/  (Ctrl-C to stop)")
        httpd.serve_forever()
