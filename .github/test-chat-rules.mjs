// Checks the Open Port chat rules (js/net/chat-rules.js) catch contact details and leave
// ordinary chat alone. node .github/test-chat-rules.mjs, exit 1 on a failure.
// Add a line here whenever a new way around the filter turns up.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
globalThis.window = globalThis;
for (const f of ['words', 'wordbank-common', 'wordbank', 'net/filter', 'net/chat-rules', 'net/chat-lines']) require(`../js/${f}.js`);
const R = globalThis.ChatRules;

const blocked = {
  link: ['go to bit.ly/abc', 't.me/bob', 'www . evil . com', 'evil dot com/free', 'evil . gg', 'https://x.y', 'email bob at gmail dot com'],
  email: ['bob@gmail.com', 'mail bob@yahoo.co'],
  phone: ['call 0812345678', 'call 081 234 5678', '๐๘๑๒๓๔๕๖๗๘'],
  handle: ['add me on discord: bob#1234', 'my ig is bob_types', 'line id bobby', 'snap: bob'],
};
const fine = ['hi everyone', 'gg wp', 'i got 3. me too', 'I want to go home. me too', 'see you at 5. gg',
  'that was close. to be honest', 'the dot matters', 'what wpm is everyone at?'];

let bad = 0;
for (const [kind, lines] of Object.entries(blocked)) for (const t of lines) {
  const got = R.contact(t);
  if (got !== kind) { bad++; console.log(`should be ${kind}: "${t}" -> "${got}"`); }
}
for (const t of fine) {
  const got = R.contact(t);
  if (got) { bad++; console.log(`should pass: "${t}" -> "${got}"`); }
}
// the demo players' own lines must all pass (timestamps in the file are not chat)
const all = [];
(function walk(x) { if (typeof x === 'string') all.push(x); else if (x && typeof x === 'object') Object.values(x).forEach(walk); })(globalThis.CHAT_LINES);
for (const t of all) if (!/^\d{4}-\d\d-\d\dT/.test(t) && R.contact(t)) { bad++; console.log(`demo line blocked: "${t}"`); }

console.log(bad ? `${bad} failed` : `chat rules: all ${Object.values(blocked).flat().length + fine.length + all.length} checks passed`);
process.exit(bad ? 1 : 0);
