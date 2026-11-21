# Third-party data

## World map outline

`js/app/world-110m.js` is built by `tools/map/build_world.py` from the Natural Earth 1:110m Cultural Vectors, Admin 0 Countries (`ne_110m_admin_0_countries.geojson`, nvkelso/natural-earth-vector on GitHub). Natural Earth is in the public domain: https://www.naturalearthdata.com/about/terms-of-use/

The time zone to country table in the same file comes from the IANA time zone database `zone.tab`, which is also in the public domain.

## three.js

`lib/three/` holds three.js 0.170.0 (the minified build and the 20 addon files the site imports), copied from the npm package so no visitor loads code from a CDN. MIT licence, in `lib/three/LICENSE`.

## Fonts

`fonts/` holds Chakra Petch (400, 600, 700), JetBrains Mono (400, 600) and Share Tech Mono (400) from the Fontsource npm packages, served from the site so no visitor's address goes to Google. All three are under the SIL Open Font License 1.1, in `fonts/LICENSE-*.txt`. `css/fonts.css` lists them.
