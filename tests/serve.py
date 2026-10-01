# Tiny static server for local testing. Run: python3 tests/serve.py 8123
import http.server, socketserver, sys, os
TYPES = {'.mjs': 'text/javascript', '.js': 'text/javascript', '.wasm': 'application/wasm',
         '.webmanifest': 'application/manifest+json', '.task': 'application/octet-stream'}
class H(http.server.SimpleHTTPRequestHandler):
    def guess_type(self, path):
        ext = os.path.splitext(path)[1]
        return TYPES.get(ext) or super().guess_type(path)
    def log_message(self, *a): pass
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()
os.chdir(sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), '..'))
socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(('127.0.0.1', int(sys.argv[1]) if len(sys.argv) > 1 else 8123), H) as s:
    s.serve_forever()
