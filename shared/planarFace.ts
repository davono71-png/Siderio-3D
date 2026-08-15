export type Vec3 = { x: number; y: number; z: number };
export type Tri3 = { a: Vec3; b: Vec3; c: Vec3 };

export function growCoplanar(tris: Tri3[], seed: number, distEps: number, minDot = 0.985): number[] {
  if (seed < 0 || seed >= tris.length) return [];
  const seedTri = tris[seed];
  const n = triNormal(seedTri);
  const nLen = length(n);
  if (nLen < 1e-12) return [seed];
  n.x /= nLen;
  n.y /= nLen;
  n.z /= nLen;
  const planeD = dot(n, seedTri.a);
  const scale = 1 / Math.max(distEps, 1e-9);
  const edgeToTris = new Map<string, number[]>();
  for (let i = 0; i < tris.length; i++) {
    if (!samePlane(tris[i], n, planeD, distEps, minDot)) continue;
    for (const key of edgeKeys(tris[i], scale)) {
      const list = edgeToTris.get(key);
      if (list) list.push(i);
      else edgeToTris.set(key, [i]);
    }
  }
  const seen = new Set<number>([seed]);
  const queue = [seed];
  while (queue.length) {
    const current = queue.pop()!;
    for (const key of edgeKeys(tris[current], scale)) {
      for (const next of edgeToTris.get(key) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return [...seen].sort((a, b) => a - b);
}

export function faceCentroid(tris: Tri3[], indices: number[]): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  let n = 0;
  for (const i of indices) {
    const tri = tris[i];
    x += tri.a.x + tri.b.x + tri.c.x;
    y += tri.a.y + tri.b.y + tri.c.y;
    z += tri.a.z + tri.b.z + tri.c.z;
    n += 3;
  }
  if (!n) return { x: 0, y: 0, z: 0 };
  return { x: x / n, y: y / n, z: z / n };
}

export function faceNormal(tris: Tri3[], indices: number[]): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const i of indices) {
    const n = triNormal(tris[i]);
    x += n.x;
    y += n.y;
    z += n.z;
  }
  const len = Math.hypot(x, y, z);
  if (len < 1e-12) return { x: 0, y: 0, z: 1 };
  return { x: x / len, y: y / len, z: z / len };
}

export function faceSpan(tris: Tri3[], indices: number[], origin: Vec3): number {
  let max = 0;
  for (const i of indices) {
    for (const p of [tris[i].a, tris[i].b, tris[i].c]) {
      const d = Math.hypot(p.x - origin.x, p.y - origin.y, p.z - origin.z);
      if (d > max) max = d;
    }
  }
  return max;
}

export function relativePositions(tris: Tri3[], indices: number[], origin: Vec3): Float32Array {
  const data = new Float32Array(indices.length * 9);
  let o = 0;
  for (const i of indices) {
    const tri = tris[i];
    for (const p of [tri.a, tri.b, tri.c]) {
      data[o++] = p.x - origin.x;
      data[o++] = p.y - origin.y;
      data[o++] = p.z - origin.z;
    }
  }
  return data;
}

export function boundarySegments(tris: Tri3[], indices: number[], distEps: number): Vec3[][] {
  const scale = 1 / Math.max(distEps, 1e-9);
  const edges = new Map<string, { count: number; a: Vec3; b: Vec3 }>();
  for (const i of indices) {
    const tri = tris[i];
    const verts = [tri.a, tri.b, tri.c, tri.a];
    for (let k = 0; k < 3; k++) {
      const a = verts[k];
      const b = verts[k + 1];
      const key = edgeKey(vertKey(a, scale), vertKey(b, scale));
      const existing = edges.get(key);
      if (existing) existing.count += 1;
      else edges.set(key, { count: 1, a, b });
    }
  }
  const segments: Vec3[][] = [];
  for (const edge of edges.values()) {
    if (edge.count === 1) segments.push([edge.a, edge.b]);
  }
  return segments;
}

function samePlane(tri: Tri3, n: Vec3, planeD: number, distEps: number, minDot: number): boolean {
  const tn = triNormal(tri);
  const tnLen = length(tn);
  if (tnLen < 1e-12) return false;
  const aligned = (tn.x * n.x + tn.y * n.y + tn.z * n.z) / tnLen;
  if (aligned < minDot) return false;
  return (
    Math.abs(dot(n, tri.a) - planeD) <= distEps &&
    Math.abs(dot(n, tri.b) - planeD) <= distEps &&
    Math.abs(dot(n, tri.c) - planeD) <= distEps
  );
}

function triNormal(tri: Tri3): Vec3 {
  const abx = tri.b.x - tri.a.x;
  const aby = tri.b.y - tri.a.y;
  const abz = tri.b.z - tri.a.z;
  const acx = tri.c.x - tri.a.x;
  const acy = tri.c.y - tri.a.y;
  const acz = tri.c.z - tri.a.z;
  return { x: aby * acz - abz * acy, y: abz * acx - abx * acz, z: abx * acy - aby * acx };
}

function edgeKeys(tri: Tri3, scale: number): string[] {
  const ka = vertKey(tri.a, scale);
  const kb = vertKey(tri.b, scale);
  const kc = vertKey(tri.c, scale);
  return [edgeKey(ka, kb), edgeKey(kb, kc), edgeKey(kc, ka)];
}

function vertKey(p: Vec3, scale: number): string {
  return `${Math.round(p.x * scale)}:${Math.round(p.y * scale)}:${Math.round(p.z * scale)}`;
}

function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function length(v: Vec3): number {
  return Math.hypot(v.x, v.y, v.z);
}
