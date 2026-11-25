"""Shared Playwright setup for the 1000wpm site.

Serves a folder over http, routes the three.js CDN to the local copy and drops
Google Fonts so the container never needs the network.
"""
import functools, http.server, os, socketserver, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

THREE = Path('/home/claude/deps/node_modules/three')
CDN = 'https://cdn.jsdelivr.net/npm/three@0.170.0/'


class _Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def serve(root, port=8765):
    handler = functools.partial(_Quiet, directory=str(root))
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.ThreadingTCPServer(('127.0.0.1', port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, f'http://127.0.0.1:{port}/'


def _route_three(route):
    rel = route.request.url[len(CDN):].split('?')[0]
    f = THREE / rel
    if f.is_file():
        route.fulfill(path=str(f), headers={'content-type': 'text/javascript', 'access-control-allow-origin': '*'})
    else:
        route.abort()


def browser(p, mobile=False):
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome',
                          args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    opts = dict(viewport={'width': 390, 'height': 844}, device_scale_factor=3, is_mobile=True, has_touch=True) if mobile \
        else dict(viewport={'width': 1440, 'height': 900})
    ctx = b.new_context(**opts)
    ctx.route(CDN + '**', _route_three)
    ctx.route('https://fonts.googleapis.com/**', lambda r: r.fulfill(body='', headers={'content-type': 'text/css'}))
    ctx.route('https://fonts.gstatic.com/**', lambda r: r.abort())
    ctx.add_init_script("try{localStorage.setItem('wpm-skip-intro','1');localStorage.setItem('wpm-fell-in','1')}catch(e){}")
    return b, ctx
