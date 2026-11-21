// From Gid's app-defense skill, with blob: and wasm allowed for three.js loaders and workers.
// Writes the Content-Security-Policy meta tag a page needs, so injected scripts can't run but the app still works.
// node csp-tag.mjs index.html            prints the tag
// node csp-tag.mjs index.html --write    puts it in the page (replaces an old one)
// node csp-tag.mjs index.html --check    exit 1 if the page's tag is missing or out of date (for the deploy check)
// It allows: the page's own files, each inline <script> by its sha256 fingerprint, scripts and styles
// from the CDN hosts the page already loads, and inline styles (style="" is common and low risk).
// After any edit to an inline <script>, run --write again, or that script stops running.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const [file, mode] = process.argv.slice(2);
if (!file) { console.log('node csp-tag.mjs <page.html> [--write | --check]'); process.exit(2); }
const page = readFileSync(file, 'utf8');
const noCsp = page.replace(/<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*>\s*/i, '');

const hashes = [];
for (const m of noCsp.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
  const [, attrs, body] = m;
  if (/\bsrc=/i.test(attrs) || /type=["'](?!module|importmap|text\/javascript|application\/javascript)/i.test(attrs) || !body.trim()) continue;
  hashes.push(`'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`);
}
const hosts = re => [...new Set([...noCsp.matchAll(re)].map(m => new URL(m[1]).origin))];
const scriptHosts = hosts(/<script[^>]+src=["'](https:\/\/[^"']+)["']/gi);
const styleHosts = [...new Set([...noCsp.matchAll(/<link\b[^>]*>/gi)].map(m => m[0])
  .filter(t => /rel=["']stylesheet["']/i.test(t))
  .map(t => t.match(/href=["'](https:\/\/[^"']+)["']/i)?.[1]).filter(Boolean).map(u => new URL(u).origin))];
const fontHosts = styleHosts.some(h => h.includes('fonts.googleapis.com')) ? ['https://fonts.gstatic.com'] : [];
const inlineHandlers = /\son[a-z]+\s*=\s*["']/i.test(noCsp.replace(/<script[\s\S]*?<\/script>/gi, ''));

const policy = [
  "default-src 'self'",
  // wasm-unsafe-eval lets three.js's mesh decoder compile WebAssembly; plain JS eval stays blocked
  ['script-src', "'self'", "'wasm-unsafe-eval'", ...hashes, ...scriptHosts].join(' '),
  ['style-src', "'self'", "'unsafe-inline'", ...styleHosts].join(' '),
  "img-src 'self' data: blob:",
  ['font-src', "'self'", 'data:', ...fontHosts].join(' '),
  // blob: and data: for three.js loaders (GLTF textures, avatar pictures); add the game server here when it exists
  "connect-src 'self' blob: data:",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');
const tag = `<meta http-equiv="Content-Security-Policy" content="${policy}">`;

if (inlineHandlers) console.error('Note: the page has onclick="..." style handlers in its HTML. The policy blocks those; move them into the script with addEventListener.');
if (mode === '--check') {
  const current = page.match(/<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*>/i)?.[0];
  if (current === tag) { console.log(`${file}: CSP up to date (${hashes.length} inline script(s)).`); process.exit(0); }
  console.log(current ? `${file}: CSP out of date. An inline script changed, or a CDN was added. Run: node csp-tag.mjs ${file} --write` : `${file}: no CSP. Run: node csp-tag.mjs ${file} --write`);
  process.exit(1);
} else if (mode === '--write') {
  if (!/<head[^>]*>/i.test(noCsp)) { console.error('No <head> in the page.'); process.exit(1); }
  writeFileSync(file, noCsp.replace(/<head[^>]*>/i, h => `${h}\n${tag}`));
  console.log(`${file}: CSP written (${hashes.length} inline script(s), ${scriptHosts.length + styleHosts.length} CDN host(s)).`);
} else console.log(tag);
