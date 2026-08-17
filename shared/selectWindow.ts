export type ScreenRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

/** Drag verso sinistra: crossing (anche parzialmente compreso). Verso destra: window. */
export function isCrossingSelect(startX: number, endX: number): boolean {
  return endX < startX;
}

export function normalizeRect(x0: number, y0: number, x1: number, y1: number): ScreenRect {
  return {
    left: Math.min(x0, x1),
    top: Math.min(y0, y1),
    right: Math.max(x0, x1),
    bottom: Math.max(y0, y1),
  };
}

export function rectsIntersect(a: ScreenRect, b: ScreenRect): boolean {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}

export function rectContains(outer: ScreenRect, inner: ScreenRect): boolean {
  return inner.left >= outer.left && inner.right <= outer.right && inner.top >= outer.top && inner.bottom <= outer.bottom;
}

export function partHitsWindow(part: ScreenRect, window: ScreenRect, crossing: boolean): boolean {
  return crossing ? rectsIntersect(window, part) : rectContains(window, part);
}
