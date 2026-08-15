/** Piano Three.js: i punti con n·x + constant < 0 vengono tagliati. */

export type ClipPlane = { x: number; y: number; z: number; constant: number };
export type Vec3 = { x: number; y: number; z: number };

export function keepSideClip(
  normal: Vec3,
  origin: Vec3,
  keepSign: 1 | -1,
): ClipPlane {
  const x = normal.x * keepSign;
  const y = normal.y * keepSign;
  const z = normal.z * keepSign;
  return { x, y, z, constant: -(x * origin.x + y * origin.y + z * origin.z) };
}

export function pointKept(plane: ClipPlane, px: number, py: number, pz: number): boolean {
  return plane.x * px + plane.y * py + plane.z * pz + plane.constant >= -1e-9;
}

export function sideSign(normal: Vec3, origin: Vec3, point: Vec3): 1 | -1 {
  const d =
    normal.x * (point.x - origin.x) + normal.y * (point.y - origin.y) + normal.z * (point.z - origin.z);
  return d < 0 ? -1 : 1;
}

/** Normale del piano di trascinamento: contiene l'asse della faccia e resta visibile alla camera. */
export function dragPlaneNormal(viewDir: Vec3, up: Vec3, faceNormal: Vec3): Vec3 {
  const d = viewDir.x * faceNormal.x + viewDir.y * faceNormal.y + viewDir.z * faceNormal.z;
  let x = viewDir.x - faceNormal.x * d;
  let y = viewDir.y - faceNormal.y * d;
  let z = viewDir.z - faceNormal.z * d;
  let len = Math.hypot(x, y, z);
  if (len < 1e-8) {
    x = up.y * faceNormal.z - up.z * faceNormal.y;
    y = up.z * faceNormal.x - up.x * faceNormal.z;
    z = up.x * faceNormal.y - up.y * faceNormal.x;
    len = Math.hypot(x, y, z);
  }
  if (len < 1e-8) return { x: 1, y: 0, z: 0 };
  return { x: x / len, y: y / len, z: z / len };
}

export function rayHitPlane(origin: Vec3, dir: Vec3, planeN: Vec3, planePoint: Vec3): Vec3 | null {
  const denom = planeN.x * dir.x + planeN.y * dir.y + planeN.z * dir.z;
  if (Math.abs(denom) < 1e-10) return null;
  const t =
    ((planePoint.x - origin.x) * planeN.x +
      (planePoint.y - origin.y) * planeN.y +
      (planePoint.z - origin.z) * planeN.z) /
    denom;
  return { x: origin.x + dir.x * t, y: origin.y + dir.y * t, z: origin.z + dir.z * t };
}

export function offsetAlongNormal(hit: Vec3, base: Vec3, normal: Vec3): number {
  return (hit.x - base.x) * normal.x + (hit.y - base.y) * normal.y + (hit.z - base.z) * normal.z;
}

/** Punto sul raggio più vicino all'origine del piano: vale anche con raggi paralleli (assonometria). */
export function closestPointOnRay(origin: Vec3, dir: Vec3, point: Vec3): Vec3 {
  const t = dir.x * (point.x - origin.x) + dir.y * (point.y - origin.y) + dir.z * (point.z - origin.z);
  return { x: origin.x + dir.x * t, y: origin.y + dir.y * t, z: origin.z + dir.z * t };
}
