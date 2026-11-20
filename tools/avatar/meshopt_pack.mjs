// Compress every bufferView of a GLB with EXT_meshopt_compression (lossless codecs).
// Usage: node meshopt_pack.mjs in.glb out.glb
import fs from 'fs';
import { MeshoptEncoder } from 'meshoptimizer';
await MeshoptEncoder.ready;
const [inp, out] = process.argv.slice(2);
const b = fs.readFileSync(inp);
const jl = b.readUInt32LE(12);
const j = JSON.parse(b.subarray(20, 20 + jl).toString());
const binStart = 20 + jl + 8;
const bin = b.subarray(binStart, binStart + j.buffers[0].byteLength);
const SIZE = { 5126: 4, 5123: 2, 5121: 1, 5125: 4, 5122: 2, 5120: 1 }, N = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
// how each view is read: element size and mode
const use = new Map();
const meshIdx = new Set();
for (const m of j.meshes) for (const p of m.primitives) {
  if (p.indices !== undefined) { const a = j.accessors[p.indices]; use.set(a.bufferView, { size: SIZE[a.componentType], mode: p.mode === 1 ? 'INDICES' : 'TRIANGLES' }); }
}
for (const a of j.accessors) {
  if (a.bufferView !== undefined && !use.has(a.bufferView)) use.set(a.bufferView, { size: SIZE[a.componentType] * N[a.type], mode: 'ATTRIBUTES' });
  if (a.sparse) {
    use.set(a.sparse.indices.bufferView, { size: SIZE[a.sparse.indices.componentType], mode: 'INDICES' });
    use.set(a.sparse.values.bufferView, { size: SIZE[a.componentType] * N[a.type], mode: 'ATTRIBUTES' });
  }
}
const chunks = []; let off = 0;
j.bufferViews.forEach((bv, i) => {
  const u = use.get(i);
  const src = new Uint8Array(bin.buffer, bin.byteOffset + (bv.byteOffset || 0), bv.byteLength);
  let mode = u.mode, size = bv.byteStride || u.size;
  // tightly packed views with an odd element size (int16 VEC3 sparse values) are
  // compressed as 4-byte words; the decoded bytes are the same
  if (mode === 'ATTRIBUTES' && size % 4) { if (bv.byteLength % 4) throw new Error('view ' + i + ' size ' + size); size = 4; }
  const count = bv.byteLength / size;
  const enc = MeshoptEncoder.encodeGltfBuffer(src, count, size, mode, 0);
  while (off % 4) { chunks.push(new Uint8Array(1)); off++; }
  chunks.push(enc);
  bv.extensions = { EXT_meshopt_compression: { buffer: 0, byteOffset: off, byteLength: enc.length, byteStride: size, count, mode } };
  off += enc.length;
  bv.buffer = 1;
});
while (off % 4) { chunks.push(new Uint8Array(1)); off++; }
const fallbackLen = j.buffers[0].byteLength;
j.buffers = [{ byteLength: off }, { byteLength: fallbackLen, extensions: { EXT_meshopt_compression: { fallback: true } } }];
j.extensionsUsed = [...new Set([...(j.extensionsUsed || []), 'EXT_meshopt_compression'])];
j.extensionsRequired = [...new Set([...(j.extensionsRequired || []), 'EXT_meshopt_compression'])];
const binOut = Buffer.concat(chunks.map(c => Buffer.from(c.buffer, c.byteOffset, c.byteLength)));
let js = Buffer.from(JSON.stringify(j));
const pad = (4 - js.length % 4) % 4; js = Buffer.concat([js, Buffer.alloc(pad, 0x20)]);
const head = Buffer.alloc(12); head.writeUInt32LE(0x46546C67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + binOut.length, 8);
const jh = Buffer.alloc(8); jh.writeUInt32LE(js.length, 0); jh.writeUInt32LE(0x4E4F534A, 4);
const bh = Buffer.alloc(8); bh.writeUInt32LE(binOut.length, 0); bh.writeUInt32LE(0x004E4942, 4);
fs.writeFileSync(out, Buffer.concat([head, jh, js, bh, binOut]));
console.log(JSON.stringify({ in: b.length, out: 12 + 8 + js.length + 8 + binOut.length, json: js.length, bin: binOut.length }));
