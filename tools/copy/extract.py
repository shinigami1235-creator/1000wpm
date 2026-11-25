"""Pull user-facing prose out of JS/HTML: string and template literals that read like sentences or labels."""
import re, sys, json
def strings(src):
    out = []
    i, n = 0, len(src)
    while i < n:
        c = src[i]
        if src.startswith('//', i):
            j = src.find('\n', i); i = n if j < 0 else j; continue
        if src.startswith('/*', i):
            j = src.find('*/', i + 2); i = n if j < 0 else j + 2; continue
        if c in '\'"`':
            q, j, buf = c, i + 1, []
            while j < n and src[j] != q:
                if src[j] == '\\': buf.append(src[j:j+2]); j += 2; continue
                buf.append(src[j]); j += 1
            s = ''.join(buf)
            line = src.count('\n', 0, i) + 1
            out.append((line, s)); i = j + 1; continue
        i += 1
    return out
def prose(s):
    t = re.sub(r'<[^>]+>', ' ', s); t = re.sub(r'\$\{[^}]*\}', 'X', t); t = re.sub(r'\s+', ' ', t).strip()
    words = re.findall(r"[A-Za-z']+", t)
    if len(words) < 3: return None
    if re.search(r'[{};=]|=>|\.js|\.css|querySelector|px\b|rgba|var\(', t) and len(words) < 8: return None
    if not re.search(r'[a-z]{2,} [a-z]{2,}', t): return None
    return t
for f in sys.argv[1:]:
    for line, s in strings(open(f).read()):
        p = prose(s)
        if p: print(f'{f}:{line}: {p}')
