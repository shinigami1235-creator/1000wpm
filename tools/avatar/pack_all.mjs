// Pack every *.glb.raw under a folder into *.glb with meshopt_pack.mjs's compression.
// Usage: node pack_all.mjs assets/avatar
import fs from 'fs'; import path from 'path'; import { execFileSync } from 'child_process';
const root = process.argv[2]; const here = path.dirname(new URL(import.meta.url).pathname);
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
let total = 0;
for (const f of walk(root).filter(f => f.endsWith('.glb.raw'))) {
  const out = f.slice(0, -4);
  execFileSync('node', [path.join(here, 'meshopt_pack.mjs'), f, out]);
  fs.unlinkSync(f); total += fs.statSync(out).size;
}
console.log(JSON.stringify({ packed_bytes: total }));
