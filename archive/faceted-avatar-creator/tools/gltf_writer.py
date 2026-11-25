"""Small GLB writer: meshes with shared accessors, sparse morph targets and custom attributes."""
import json, struct, numpy as np

FLOAT, U8, U16, U32, I16 = 5126, 5121, 5123, 5125, 5122
NCOMP = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}


class GLB:
    def __init__(self):
        self.bin = bytearray()
        self.j = {'asset': {'version': '2.0', 'generator': '10000wpm avatar build'}, 'buffers': [{}], 'bufferViews': [],
                  'accessors': [], 'meshes': [], 'nodes': [], 'scenes': [{'nodes': []}], 'scene': 0, 'materials': []}
        self.mats = {}

    def _view(self, data, target=None, stride=None):
        while len(self.bin) % 4: self.bin.append(0)
        bv = {'buffer': 0, 'byteOffset': len(self.bin), 'byteLength': len(data)}
        if target: bv['target'] = target
        if stride: bv['byteStride'] = stride
        self.bin += data
        self.j['bufferViews'].append(bv)
        return len(self.j['bufferViews']) - 1

    def accessor(self, arr, ctype, typ, target=None, normalized=False, minmax=False, stride=None):
        arr = np.ascontiguousarray(arr)
        view = self._view(arr.tobytes(), target, stride)
        a = {'bufferView': view, 'componentType': ctype, 'count': int(arr.shape[0]), 'type': typ}
        if normalized: a['normalized'] = True
        if minmax:
            a['min'] = [float(x) for x in arr.reshape(arr.shape[0], -1).min(0)]
            a['max'] = [float(x) for x in arr.reshape(arr.shape[0], -1).max(0)]
        self.j['accessors'].append(a)
        return len(self.j['accessors']) - 1

    def sparse_vec3(self, delta, n):
        """Morph target stored as only the vertices that move."""
        nz = np.nonzero(np.abs(delta).max(1) > 0)[0]
        a = {'componentType': FLOAT, 'count': n, 'type': 'VEC3',
             'min': [float(x) for x in delta.min(0)], 'max': [float(x) for x in delta.max(0)]}
        if len(nz):
            iv = self._view(nz.astype(np.uint16).tobytes())
            vv = self._view(delta[nz].astype(np.float32).tobytes())
            a['sparse'] = {'count': int(len(nz)), 'indices': {'bufferView': iv, 'componentType': U16}, 'values': {'bufferView': vv}}
        self.j['accessors'].append(a)
        return len(self.j['accessors']) - 1

    def sparse_many(self, deltas, n):
        """Morph targets stored as only the vertices that move, all in two shared views."""
        idx_bytes, val_bytes, metas = bytearray(), bytearray(), []
        for d in deltas:
            nz = np.nonzero(np.abs(d).max(1) > 0)[0]
            while len(idx_bytes) % 4: idx_bytes.append(0)
            metas.append((nz, len(idx_bytes), len(val_bytes), d))
            idx_bytes += nz.astype(np.uint16).tobytes(); val_bytes += d[nz].astype(np.float32).tobytes()
        iv = self._view(bytes(idx_bytes)); vv = self._view(bytes(val_bytes))
        out = []
        for nz, io, vo, d in metas:
            a = {'componentType': FLOAT, 'count': n, 'type': 'VEC3',
                 'min': [round(float(x), 5) for x in d.min(0)], 'max': [round(float(x), 5) for x in d.max(0)]}
            if len(nz):
                a['sparse'] = {'count': int(len(nz)), 'indices': {'bufferView': iv, 'byteOffset': io, 'componentType': U16},
                               'values': {'bufferView': vv, 'byteOffset': vo}}
            self.j['accessors'].append(a); out.append(len(self.j['accessors']) - 1)
        return out

    def qvec3(self, arr, target=34962):
        """Positions as normalized int16 (KHR_mesh_quantization), padded to 8 bytes a vertex.
        Returns the accessor and the offset and scale that turn the stored values back
        into MakeHuman decimetres: p = offset + q * scale."""
        arr = np.asarray(arr, np.float64)
        lo, hi = arr.min(0), arr.max(0); off = (lo + hi) / 2; sc = float((hi - lo).max() / 2) or 1.0
        q = np.zeros((len(arr), 4), np.int16)
        q[:, :3] = np.round((arr - off) / sc * 32767)
        view = self._view(q.tobytes(), target, stride=8)
        a = {'bufferView': view, 'componentType': I16, 'count': int(len(arr)), 'type': 'VEC3', 'normalized': True,
             'min': [int(x) for x in q[:, :3].min(0)], 'max': [int(x) for x in q[:, :3].max(0)]}
        self.j['accessors'].append(a)
        self.quantized = True
        return len(self.j['accessors']) - 1, [float(x) for x in off], sc

    def sparse_q(self, deltas, n):
        """Morph targets as normalized int16, only the vertices that move. Returns the
        accessors and each target's scale (delta = q * scale)."""
        idx_bytes, val_bytes, metas = bytearray(), bytearray(), []
        for d in deltas:
            d = np.asarray(d, np.float64)
            nz = np.nonzero(np.abs(d).max(1) > 0)[0]
            sc = float(np.abs(d).max()) or 1.0
            q = np.round(d[nz] / sc * 32767).astype(np.int16)
            while len(idx_bytes) % 4: idx_bytes.append(0)
            while len(val_bytes) % 4: val_bytes.append(0)
            metas.append((nz, len(idx_bytes), len(val_bytes), q, sc))
            idx_bytes += nz.astype(np.uint16).tobytes(); val_bytes += q.tobytes()
        while len(idx_bytes) % 4: idx_bytes.append(0)
        while len(val_bytes) % 4: val_bytes.append(0)
        iv = self._view(bytes(idx_bytes)); vv = self._view(bytes(val_bytes))
        out, scales = [], []
        for nz, io, vo, q, sc in metas:
            a = {'componentType': I16, 'normalized': True, 'count': n, 'type': 'VEC3',
                 'min': [int(x) for x in (q.min(0) if len(q) else [0, 0, 0])], 'max': [int(x) for x in (q.max(0) if len(q) else [0, 0, 0])]}
            if len(nz):
                a['sparse'] = {'count': int(len(nz)), 'indices': {'bufferView': iv, 'byteOffset': io, 'componentType': U16},
                               'values': {'bufferView': vv, 'byteOffset': vo}}
            self.j['accessors'].append(a); out.append(len(self.j['accessors']) - 1); scales.append(sc)
        self.quantized = True
        return out, scales

    def material(self, name):
        if name not in self.mats:
            self.j['materials'].append({'name': name, 'pbrMetallicRoughness': {'baseColorFactor': [.6, .6, .6, 1], 'metallicFactor': 0}, 'doubleSided': True})
            self.mats[name] = len(self.j['materials']) - 1
        return self.mats[name]

    def mesh(self, name, prims, extras=None, node_extras=None):
        m = {'name': name, 'primitives': prims}
        if extras: m['extras'] = extras
        self.j['meshes'].append(m)
        node = {'name': name, 'mesh': len(self.j['meshes']) - 1}
        if node_extras: node['extras'] = node_extras
        self.j['nodes'].append(node)
        self.j['scenes'][0]['nodes'].append(len(self.j['nodes']) - 1)

    def save(self, path, extras=None):
        if extras: self.j['scenes'][0]['extras'] = extras
        if getattr(self, 'quantized', False):
            self.j['extensionsUsed'] = ['KHR_mesh_quantization']; self.j['extensionsRequired'] = ['KHR_mesh_quantization']
        while len(self.bin) % 4: self.bin.append(0)
        self.j['buffers'][0]['byteLength'] = len(self.bin)
        js = json.dumps(self.j, separators=(',', ':')).encode()
        while len(js) % 4: js += b' '
        out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(self.bin))
        out += struct.pack('<II', len(js), 0x4E4F534A) + js
        out += struct.pack('<II', len(self.bin), 0x004E4942) + bytes(self.bin)
        open(path, 'wb').write(out)
        return len(out)
