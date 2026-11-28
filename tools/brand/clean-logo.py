"""Clean the traced CTRL logo: flatten the traced path, drop the stair-step
wobble with Douglas-Peucker, and write straight-edged SVGs with tight viewBoxes.

  python3 tools/brand/clean-logo.py SRC.svg OUT.svg [tolerance]

The traced files in assets/brand were made from a phone screenshot, so their
edges wobble at large sizes. The logo is all straight blades and straight
letter strokes with a few rounded corners, so a simplified polygon is the
same drawing with clean edges. Rounded corners keep enough points to read
as round at any size the site uses.
"""
import re, sys

def parse(d):
    toks = re.findall(r'[MLCZmlcz]|-?\d*\.?\d+', d)
    polys, cur, i, cmd, pt = [], [], 0, None, (0, 0)
    while i < len(toks):
        t = toks[i]
        if t in 'MLCZ':
            cmd = t; i += 1
            if t == 'Z':
                if cur: polys.append(cur); cur = []
                continue
        if cmd == 'M':
            pt = (float(toks[i]), float(toks[i+1])); i += 2
            if cur: polys.append(cur)
            cur = [pt]; cmd = 'L'
        elif cmd == 'L':
            pt = (float(toks[i]), float(toks[i+1])); i += 2; cur.append(pt)
        elif cmd == 'C':
            c1 = (float(toks[i]), float(toks[i+1])); c2 = (float(toks[i+2]), float(toks[i+3]))
            p3 = (float(toks[i+4]), float(toks[i+5])); i += 6
            for k in range(1, 7):
                s = k / 6; u = 1 - s
                cur.append((u**3*pt[0] + 3*u*u*s*c1[0] + 3*u*s*s*c2[0] + s**3*p3[0],
                            u**3*pt[1] + 3*u*u*s*c1[1] + 3*u*s*s*c2[1] + s**3*p3[1]))
            pt = p3
        else:
            raise ValueError(t)
    if cur: polys.append(cur)
    return polys

def dp(pts, tol):
    if len(pts) < 3: return pts
    a, b = pts[0], pts[-1]
    dx, dy = b[0]-a[0], b[1]-a[1]; L = (dx*dx + dy*dy) ** .5 or 1e-9
    best, bi = -1, 0
    for j in range(1, len(pts)-1):
        p = pts[j]
        dist = abs(dy*p[0] - dx*p[1] + b[0]*a[1] - b[1]*a[0]) / L
        if dist > best: best, bi = dist, j
    if best > tol:
        return dp(pts[:bi+1], tol)[:-1] + dp(pts[bi:], tol)
    return [a, b]

def simplify_closed(poly, tol):
    # split at the point farthest from the first one so DP has two open halves
    p0 = poly[0]
    far = max(range(len(poly)), key=lambda j: (poly[j][0]-p0[0])**2 + (poly[j][1]-p0[1])**2)
    a = dp(poly[:far+1], tol); b = dp(poly[far:] + [p0], tol)
    return a[:-1] + b[:-1]

src, out = sys.argv[1], sys.argv[2]
tol = float(sys.argv[3]) if len(sys.argv) > 3 else 3.0
d = re.search(r' d="([^"]+)"', open(src).read()).group(1)
polys = [simplify_closed(p, tol) for p in parse(d)]
xs = [p[0] for q in polys for p in q]; ys = [p[1] for q in polys for p in q]
pad = 8
x0, y0 = int(min(xs)) - pad, int(min(ys)) - pad
w, h = int(max(xs)) + pad - x0, int(max(ys)) + pad - y0
def rounded(q, R):
    # each corner becomes a quadratic curve that starts and ends at most R
    # from the vertex (and never past half of either side), so long straight
    # edges stay straight and runs of short segments join into one smooth curve
    if R <= 0:
        return 'M' + 'L'.join(f'{p[0]-x0:.1f} {p[1]-y0:.1f}' for p in q) + 'Z'
    n = len(q); out = []
    for j in range(n):
        a, b, c = q[j-1], q[j], q[(j+1) % n]
        def toward(p, t):
            dx, dy = p[0]-b[0], p[1]-b[1]; L = (dx*dx+dy*dy) ** .5 or 1
            r = min(R, L * .5); return (b[0]+dx/L*r, b[1]+dy/L*r)
        p1, p2 = toward(a, 0), toward(c, 0)
        out.append((p1, b, p2))
    f = lambda p: f'{p[0]-x0:.1f} {p[1]-y0:.1f}'
    d = 'M' + f(out[0][0]) + 'Q' + f(out[0][1]) + ' ' + f(out[0][2])
    for p1, b, p2 in out[1:]:
        d += 'L' + f(p1) + 'Q' + f(b) + ' ' + f(p2)
    return d + 'Z'
R = float(sys.argv[4]) if len(sys.argv) > 4 else 0
path = ''.join(rounded(q, R) for q in polys)
open(out, 'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}"><path fill="currentColor" fill-rule="evenodd" d="{path}"/></svg>\n')
print(out, 'points', sum(len(q) for q in polys), 'viewBox', w, h)
