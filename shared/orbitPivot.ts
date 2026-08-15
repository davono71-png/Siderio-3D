export type Vec3 = { x: number; y: number; z: number };

/** Profondità di orbita: sul pezzo, mai dietro la camera né oltre il bbox. */
export function orbitDepth(hitDepth: number | null, camToCenter: number, modelRadius: number): number {
  const radius = Math.max(modelRadius, 1e-3);
  const fallback = Math.max(Math.abs(camToCenter), radius * 0.35);
  const depth = hitDepth != null && hitDepth > 1e-4 ? hitDepth : fallback;
  const min = Math.max(radius * 0.08, camToCenter - radius, 1e-3);
  const max = Math.max(min + radius * 0.08, camToCenter + radius);
  return Math.min(max, Math.max(min, depth));
}

export function pointOnViewAxis(origin: Vec3, viewDir: Vec3, depth: number): Vec3 {
  return {
    x: origin.x + viewDir.x * depth,
    y: origin.y + viewDir.y * depth,
    z: origin.z + viewDir.z * depth,
  };
}
