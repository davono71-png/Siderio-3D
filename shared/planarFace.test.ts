import { describe, expect, it } from "vitest";
import { boundarySegments, faceCentroid, growCoplanar } from "./planarFace";
import type { Tri3 } from "./planarFace";

const rect: Tri3[] = [
  { a: { x: 0, y: 0, z: 0 }, b: { x: 40, y: 0, z: 0 }, c: { x: 40, y: 10, z: 0 } },
  { a: { x: 0, y: 0, z: 0 }, b: { x: 40, y: 10, z: 0 }, c: { x: 0, y: 10, z: 0 } },
];

const island: Tri3 = {
  a: { x: 100, y: 0, z: 0 },
  b: { x: 110, y: 0, z: 0 },
  c: { x: 100, y: 10, z: 0 },
};

const back: Tri3 = {
  a: { x: 0, y: 0, z: 8 },
  b: { x: 40, y: 0, z: 8 },
  c: { x: 0, y: 10, z: 8 },
};

describe("growCoplanar", () => {
  it("collects both triangles of a rectangular face", () => {
    expect(growCoplanar(rect, 0, 0.05)).toEqual([0, 1]);
  });

  it("does not jump to a disconnected coplanar island", () => {
    expect(growCoplanar([...rect, island], 0, 0.05)).toEqual([0, 1]);
  });

  it("does not include a parallel face offset along the normal", () => {
    expect(growCoplanar([...rect, back], 0, 0.05)).toEqual([0, 1]);
  });
});

describe("faceCentroid", () => {
  it("sits in the middle of the rectangle", () => {
    const c = faceCentroid(rect, [0, 1]);
    expect(c.x).toBeCloseTo(20, 5);
    expect(c.y).toBeCloseTo(5, 5);
    expect(c.z).toBeCloseTo(0, 5);
  });
});

describe("boundarySegments", () => {
  it("keeps the outer loop of the rectangle", () => {
    expect(boundarySegments(rect, [0, 1], 0.05)).toHaveLength(4);
  });
});
