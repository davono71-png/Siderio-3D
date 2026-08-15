import { describe, expect, it } from "vitest";
import { orbitDepth, pointOnViewAxis } from "./orbitPivot";

describe("orbitDepth", () => {
  it("uses the hit depth when it sits on the model", () => {
    expect(orbitDepth(120, 150, 80)).toBeCloseTo(120, 5);
  });

  it("falls back near the model center if the ray misses", () => {
    const depth = orbitDepth(null, 200, 50);
    expect(depth).toBeGreaterThan(50);
    expect(depth).toBeLessThanOrEqual(250);
  });

  it("does not accept a huge far-plane depth", () => {
    expect(orbitDepth(8000, 180, 60)).toBeLessThanOrEqual(240);
  });
});

describe("pointOnViewAxis", () => {
  it("places the pivot in front of the camera", () => {
    const p = pointOnViewAxis({ x: 0, y: -100, z: 40 }, { x: 0, y: 1, z: 0 }, 80);
    expect(p.y).toBeCloseTo(-20, 5);
  });
});
