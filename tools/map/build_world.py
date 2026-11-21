"""Builds js/app/world-110m.js from Natural Earth 1:110m admin 0 countries (public domain).

  python3 -I tools/map/build_world.py ne_110m_admin_0_countries.geojson /usr/share/zoneinfo/zone.tab js/app/world-110m.js

Coordinates are rounded to 0.1 degree and stored as deltas, one flat list per ring:
[x0, y0, dx1, dy1, ...] in tenths of a degree. Antarctica is left out.
The zone.tab part maps each IANA time zone to its ISO country code so the site can
guess a player's country from the browser without a network call.
"""
import json, sys

src, zonetab, out = sys.argv[1:4]
Q = 10
d = json.load(open(src))

# small countries the 110m set has no shape for: label point only
EXTRA = {
    'SG': ('Singapore', 103.82, 1.35), 'HK': ('Hong Kong', 114.17, 22.32), 'MO': ('Macao', 113.55, 22.17),
    'BH': ('Bahrain', 50.55, 26.07), 'MT': ('Malta', 14.43, 35.9), 'MV': ('Maldives', 73.51, 4.18),
    'MU': ('Mauritius', 57.55, -20.25), 'BB': ('Barbados', -59.54, 13.19), 'AD': ('Andorra', 1.6, 42.55),
    'LI': ('Liechtenstein', 9.55, 47.16), 'MC': ('Monaco', 7.42, 43.74), 'SM': ('San Marino', 12.46, 43.94),
    'BN': ('Brunei', 114.73, 4.54), 'QA': ('Qatar', 51.18, 25.35), 'GU': ('Guam', 144.79, 13.44),
    'WS': ('Samoa', -172.1, -13.76), 'TO': ('Tonga', -175.2, -21.18), 'CV': ('Cabo Verde', -23.6, 15.1),
    'KM': ('Comoros', 43.33, -11.7), 'SC': ('Seychelles', 55.45, -4.62), 'AG': ('Antigua and Barbuda', -61.8, 17.07),
    'LC': ('Saint Lucia', -60.98, 13.9), 'GD': ('Grenada', -61.68, 12.12), 'DM': ('Dominica', -61.36, 15.42),
    'KN': ('Saint Kitts and Nevis', -62.75, 17.33), 'VC': ('Saint Vincent', -61.2, 13.25), 'PF': ('French Polynesia', -149.4, -17.65),
    'RE': ('Reunion', 55.53, -21.12), 'AW': ('Aruba', -69.97, 12.52), 'CW': ('Curacao', -68.99, 12.17),
    'BM': ('Bermuda', -64.75, 32.3), 'KY': ('Cayman Islands', -81.25, 19.31), 'FO': ('Faroe Islands', -6.9, 62.0),
    'IM': ('Isle of Man', -4.53, 54.23), 'JE': ('Jersey', -2.13, 49.21), 'GI': ('Gibraltar', -5.35, 36.14),
    'MP': ('Northern Mariana Islands', 145.75, 15.2), 'FM': ('Micronesia', 158.2, 6.9), 'PW': ('Palau', 134.58, 7.5),
    'MH': ('Marshall Islands', 171.2, 7.1), 'KI': ('Kiribati', -157.4, 1.87), 'TV': ('Tuvalu', 179.2, -8.5),
    'NR': ('Nauru', 166.93, -0.53), 'ST': ('Sao Tome and Principe', 6.6, 0.25), 'GP': ('Guadeloupe', -61.55, 16.25),
    'MQ': ('Martinique', -61.02, 14.64), 'GF': ('French Guiana', -53.1, 3.9), 'YT': ('Mayotte', 45.15, -12.82),
    'VI': ('U.S. Virgin Islands', -64.8, 18.34), 'AS': ('American Samoa', -170.7, -14.3), 'XK': ('Kosovo', 20.9, 42.6),
}

def q(v): return int(round(v * Q))

countries = []
seen = set()
for f in d['features']:
    p = f['properties']
    code = p['ISO_A2_EH'] if p['ISO_A2_EH'] != '-99' else p['ADM0_A3'][:2]
    if p['ADM0_A3'] == 'ATA': continue
    if code in ('-9', '-99'): code = p['ADM0_A3']  # N. Cyprus, Somaliland keep their 3-letter code
    name = p['NAME']
    g = f['geometry']
    polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
    rings = []
    for poly in polys:
        ring = poly[0]  # outer ring only; 110m has almost no holes that show at this size
        pts = []
        for lon, lat in ring:
            pt = (q(lon), q(lat))
            if not pts or pts[-1] != pt: pts.append(pt)
        if len(pts) < 4: continue
        flat = [pts[0][0], pts[0][1]]
        for a, b in zip(pts, pts[1:]): flat += [b[0] - a[0], b[1] - a[1]]
        rings.append(flat)
    countries.append([code, name, q(p['LABEL_X']), q(p['LABEL_Y']), rings])
    seen.add(code)

for code, (name, lon, lat) in EXTRA.items():
    if code not in seen: countries.append([code, name, q(lon), q(lat), []])

tz = {}
for line in open(zonetab):
    if line.startswith('#') or not line.strip(): continue
    cc, _, zone = line.split('\t')[:3]
    tz[zone.strip()] = cc
# old names that browsers (ICU) still report
for old, new in {'Asia/Calcutta': 'Asia/Kolkata', 'Asia/Saigon': 'Asia/Ho_Chi_Minh', 'Asia/Katmandu': 'Asia/Kathmandu',
                 'Asia/Rangoon': 'Asia/Yangon', 'Europe/Kiev': 'Europe/Kyiv', 'America/Buenos_Aires': 'America/Argentina/Buenos_Aires',
                 'Asia/Ulan_Bator': 'Asia/Ulaanbaatar', 'Asia/Dacca': 'Asia/Dhaka', 'Asia/Thimbu': 'Asia/Thimphu',
                 'Atlantic/Faeroe': 'Atlantic/Faroe', 'America/Godthab': 'America/Nuuk', 'Pacific/Truk': 'Pacific/Chuuk',
                 'Pacific/Ponape': 'Pacific/Pohnpei', 'America/Indianapolis': 'America/Indiana/Indianapolis',
                 'America/Louisville': 'America/Kentucky/Louisville', 'Australia/ACT': 'Australia/Sydney',
                 'Asia/Chongqing': 'Asia/Shanghai', 'Asia/Harbin': 'Asia/Shanghai', 'Asia/Istanbul': 'Europe/Istanbul',
                 'US/Eastern': 'America/New_York', 'US/Central': 'America/Chicago', 'US/Mountain': 'America/Denver',
                 'US/Pacific': 'America/Los_Angeles', 'Europe/Uzhgorod': 'Europe/Kyiv', 'Asia/Ujung_Pandang': 'Asia/Makassar',
                 'America/Coral_Harbour': 'America/Atikokan', 'Pacific/Enderbury': 'Pacific/Kanton'}.items():
    if new in tz: tz[old] = tz[new]
# group zones by country to keep the file small: { CC: "Area/City Area/City ..." }
by = {}
for zone, cc in sorted(tz.items()): by.setdefault(cc, []).append(zone)
tzs = {cc: ' '.join(z) for cc, z in sorted(by.items())}

data = {'v': 1, 'q': Q, 'c': countries, 'tz': tzs}
body = json.dumps(data, separators=(',', ':'))
with open(out, 'w') as fh:
    fh.write('// Generated by tools/map/build_world.py from Natural Earth 1:110m admin 0 countries\n'
             '// (public domain, naturalearthdata.com) and the IANA zone.tab (public domain). Do not edit.\n')
    fh.write('window.WORLD_110M=' + body + ';\n')
print(len(countries), 'countries', sum(len(r) for c in countries for r in c[4]) // 2, 'points', len(body), 'bytes')
