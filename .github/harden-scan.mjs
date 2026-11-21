// From Gid's app-defense skill; this copy also counts e(...) as escaping, since the site names UI.esc that way.
// Checks a web app's own code for missing defenses, grouped by the OWASP Top 10:2025 risk each one guards.
// node harden-scan.mjs <folder>
// No packages needed. Each hit is a place to look, with the fix. Exit code 1 when anything high is found.
// For patient-data leaks, run clinic-safety's phi-scan.mjs as well; this file doesn't repeat those checks.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const root = process.argv[2] || '.';
const TEXT_FIELD = /[\w?]+(\.|\?\.)(?:[\w?]+(\.|\?\.))*(name|names|fullName|firstName|lastName|note|notes|complaint|history|brand|title|address|email|comment|comments|reason|text|desc|description|message|remarks|allerg\w*|diagnos\w*|medication\w*)\b/i;
const checks = [
  // the real danger inside a template: a record's text field dropped in without escaping
  { id: 'unescaped-text', risk: 'A05 Injection', level: 'high',
    test: line => {
      if (!/<\/?[a-z][\w-]*[\s>/]/i.test(line) || /html`/.test(line)) return false;   // only lines that build markup
      for (const [, body] of line.matchAll(/\$\{([^{}]*)\}/g)) {
        if (!TEXT_FIELD.test(body)) continue;
        if (/\b(esc|e|escape|escapeHtml|encodeURIComponent|fmt\w*|displayName|String\(Number)\(/.test(body)) continue;
        // a field used only as a condition, printing fixed text: ${p.allergies ? '<span>Allergy</span>' : ''}
        const lit = `(?:'[^'$]*'|"[^"$]*"|\`[^\`$]*\`)`;
        if (new RegExp(`^\\s*[\\w.?!]+\\s*\\?\\s*${lit}\\s*:\\s*${lit}\\s*$`).test(body)) continue;
        return true;
      }
      return false;
    },
    fix: 'A record\'s text field (name, note, brand...) put into markup without escaping. Wrap it: ${esc(p.name)}, or build the markup with the html`` tag from safe-dom.js.' },
  // A05 Injection: attacker text turned into page code (cross-site scripting)
  { id: 'xss-sink', risk: 'A05 Injection', level: 'high',
    re: /\.(innerHTML|outerHTML)\s*\+?=/,
    // fine: a plain string with no ${...}, or markup built with this skill's html`` tag
    skip: /\.(?:inner|outer)HTML\s*=\s*(?:(['"])[^'"]*\1|`[^`$]*`)\s*;?\s*$|=\s*html`|export function setHTML/,
    fix: 'Text from a user, a file or a QR code put into innerHTML can run as code. Use textContent, el(), or the html`` tag from safe-dom.js.' },
  { id: 'xss-sink', risk: 'A05 Injection', level: 'high', re: /\.insertAdjacentHTML\(|document\.write(ln)?\(/,
    fix: 'Builds page code from a string. Create elements and set textContent instead.' },
  { id: 'eval', risk: 'A05 Injection', level: 'high',
    re: /\beval\(|new Function\(|set(Timeout|Interval)\(\s*['"`]/,
    fix: 'Runs a string as code. Parse data with JSON.parse and pass functions, not strings, to timers.' },
  // A03 Software Supply Chain Failures: code you load from someone else
  { id: 'no-sri', risk: 'A03 Supply Chain', level: 'high',
    re: /<script[^>]+src=["']https?:\/\/(?![^"']*\b(localhost|127\.0\.0\.1)\b)[^"']+["'](?![^>]*\bintegrity=)[^>]*>/i,
    fix: 'A script from a CDN with no integrity hash runs whatever that server sends, today and after it\'s hacked. Copy the file into the repo, or add integrity="sha384-..." crossorigin="anonymous".' },
  { id: 'no-sri', risk: 'A03 Supply Chain', level: 'medium',
    re: /<link[^>]+href=["']https?:\/\/[^"']+\.css[^"']*["'](?![^>]*\bintegrity=)[^>]*>/i,
    fix: 'A stylesheet from a CDN with no integrity hash. Copy it in or add integrity.' },
  // A04 Cryptographic Failures
  { id: 'weak-random', risk: 'A04 Cryptographic Failures', level: 'high',
    re: /Math\.random\(\)[^;\n]*\b(token|secret|pin|otp|password|passcode|key|salt|voucher|code|session|nonce|id)\b|\b(token|secret|pin|otp|password|passcode|salt|voucher|session|nonce)\w*\s*[:=][^;\n]*Math\.random\(\)/i,
    fix: 'Math.random() can be predicted. Use crypto.getRandomValues() or crypto.randomUUID() for IDs, PINs, vouchers and tokens.' },
  { id: 'plain-http', risk: 'A04 Cryptographic Failures', level: 'medium',
    re: /(src|href|fetch\(|action)\s*=?\s*\(?\s*["']http:\/\/(?!localhost|127\.0\.0\.1|www\.w3\.org)/i,
    fix: 'Loads or sends over plain http, which anyone on the same Wi-Fi can read or change. Use https.' },
  { id: 'weak-hash', risk: 'A04 Cryptographic Failures', level: 'high',
    re: /(digest\(\s*['"]SHA-(1|256)['"][^;\n]*\b(pin|password|passcode)\b|\b(pin|password|passcode)\w*[^;\n]*digest\(\s*['"]SHA-(1|256)['"]|md5\(|sha1\()/i,
    fix: 'A PIN or password hashed with one fast hash can be guessed in seconds. Use PBKDF2 with a salt and 300,000+ rounds (clinic-safety\'s Vault does this).' },
  // A01 Broken Access Control
  { id: 'client-only-gate', risk: 'A01 Broken Access Control', level: 'high',
    re: /\b(password|passcode|pin|adminpass|admin_password|secret)\w*\s*(===?|!==?)\s*['"`][^'"`]{3,}['"`]|['"`][^'"`]{3,}['"`]\s*(===?|!==?)\s*\w*(password|passcode|pin)\b|\b(isAdmin|role)\s*(===?)\s*['"`](admin|owner)['"`]/i,
    fix: 'A password or role checked against a value written in the code. On GitHub Pages anyone can read the code and the value. Protect data by encrypting it with the user\'s PIN, or check access on a server.' },
  { id: 'postmessage-origin', risk: 'A01 Broken Access Control', level: 'high',
    re: /addEventListener\(\s*['"]message['"]/,
    needsNear: /\.origin\b/, near: 6,
    fix: 'Listens for messages from other windows without checking event.origin, so any site that opens yours can send it commands.' },
  { id: 'open-redirect', risk: 'A01 Broken Access Control', level: 'medium',
    re: /location(\.href)?\s*=\s*[^;\n]*(\.get\(|location\.search|location\.hash)/, skip: /safeNext\(/,
    fix: 'Sends visitors to an address taken from the link. Only allow your own pages: check it starts with "/" and not "//".' },
  // A02 Security Misconfiguration
  { id: 'no-csp', risk: 'A02 Misconfiguration', level: 'medium', html: true,
    fix: 'No Content-Security-Policy. Add the meta tag from this skill so injected scripts from other sites can\'t run.' },
  { id: 'secret-in-code', risk: 'A02 Misconfiguration', level: 'high',
    re: /(AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{40,}|sk-(live|proj|ant)?-?[A-Za-z0-9_-]{20,}|sk_live_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|service_role)/,
    fix: 'A private key in code that ships to the browser. Anyone can copy it. Revoke it now, then move the call to a server or a serverless function.' },
  { id: 'public-key', risk: 'A02 Misconfiguration', level: 'info',
    re: /AIza[0-9A-Za-z_-]{35}/,
    fix: 'A Google/Firebase browser key. These are meant to be public, but restrict it to your domain in Google Cloud Console and lock Firebase down with security rules.' },
  // A10 Mishandling of Exceptional Conditions
  { id: 'swallowed-error', risk: 'A10 Exceptional Conditions', level: 'medium',
    re: /catch\s*(\(\s*\w*\s*\))?\s*\{\s*\}/,
    fix: 'An error caught and thrown away. A failed save then looks like it worked. Show the user it failed, or at least log it.' },
];

const skipDir = /^(node_modules|\.git|dist|build|vendor|\.github|lib|libs|third_party)$/;
const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) { if (!skipDir.test(f)) walk(p); }
    else if (/\.(m?js|ts|jsx|tsx|html|vue|svelte)$/.test(f) && !/\.min\./.test(f)) files.push(p);
  }
})(root);

const hits = [];
for (const f of files) {
  const text = readFileSync(f, 'utf8');
  const lines = text.split('\n');
  const rel = relative(root, f);
  const escapes = /\besc\(|\bescape(Html)?\(|html`/.test(text);
  if (extname(f) === '.html' && /<script\b/i.test(text) && !/http-equiv=["']Content-Security-Policy["']/i.test(text)) {
    const c = checks.find(c => c.id === 'no-csp');
    hits.push({ ...c, file: rel, line: 1, code: '(whole page)' });
  }
  lines.forEach((line, i) => {
    if (line.length > 2000 || /^\s*(\/\/|\*|<!--)/.test(line)) return;
    for (const c of checks) {
      if (c.test ? !c.test(line) : (!c.re || !c.re.test(line) || (c.skip && c.skip.test(line)))) continue;
      if (c.needsNear && lines.slice(i, i + c.near + 1).some(l => c.needsNear.test(l))) continue;
      let hit = { ...c, file: rel, line: i + 1, code: line.trim().slice(0, 120) };
      // a file that escapes its values: innerHTML is a place to review, not a finding
      if (c.id === 'xss-sink' && escapes) {
        hit = { ...hit, id: 'xss-review', level: 'info',
          fix: 'innerHTML or insertAdjacentHTML in a file that escapes its values. Fine if every ${...} that holds text is wrapped in esc(); the unescaped-text check flags the ones that aren\'t.' };
      }
      hits.push(hit);
      break;
    }
  });
}

const order = { high: 0, medium: 1, info: 2 };
hits.sort((a, b) => order[a.level] - order[b.level] || a.risk.localeCompare(b.risk));
const groups = {};
for (const h of hits) (groups[`${h.level.toUpperCase()}  ${h.risk}  (${h.id})`] ||= []).push(h);
for (const [k, list] of Object.entries(groups)) {
  console.log(`\n${k}: ${list.length}\n  ${list[0].fix}`);
  for (const h of list.slice(0, 12)) console.log(`  ${h.file}:${h.line}  ${h.code}`);
  if (list.length > 12) console.log(`  ...and ${list.length - 12} more`);
}
const high = hits.filter(h => h.level === 'high').length;
console.log(`\n${files.length} files checked: ${high} high, ${hits.filter(h => h.level === 'medium').length} medium, ${hits.filter(h => h.level === 'info').length} info.`);
process.exit(high ? 1 : 0);
