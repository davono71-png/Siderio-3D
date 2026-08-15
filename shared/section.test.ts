import { describe, expect, it } from "vitest";
import {
  closestPointOnRay,
  dragPlaneNormal,
  keepSideClip,
  offsetAlongNormal,
  pointKept,
  rayHitPlane,
  sideSign,
} from "./section";

describe("keepSideClip", () => {
  it("keeps the positive side of +Z at the origin", () => {
    const plane = keepSideClip({ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 0 }, 1);
    expect(pointKept(plane, 0, 0, 1)).toBe(true);
    expect(pointKept(plane, 0, 0, -1)).toBe(false);
  });

  it("keeps the negative side when keepSign is -1", () => {
    const plane = keepSideClip({ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 2 }, -1);
    expect(pointKept(plane, 0, 0, 1)).toBe(true);
    expect(pointKept(plane, 0, 0, 3)).toBe(false);
  });

  it("sideSign follows the mouse relative to the plane", () => {
    expect(sideSign({ x: 1, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }, { x: 8, y: 1, z: 0 })).toBe(1);
    expect(sideSign({ x: 1, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }, { x: 1, y: 1, z: 0 })).toBe(-1);
  });
});

describe("orthographic section drag", () => {
  const view = { x: 0, y: -1, z: 0 };
  const up = { x: 0, y: 0, z: 1 };
  const normal = { x: 1, y: 0, z: 0 };
  const base = { x: 0, y: 0, z: 0 };

  it("intersects an orthographic ray parallel to the view", () => {
    const planeN = dragPlaneNormal(view, up, normal);
    const hit = rayHitPlane({ x: 12, y: 40, z: 3 }, view, planeN, base);
    expect(hit).not.toBeNull();
    expect(offsetAlongNormal(hit!, base, normal)).toBeCloseTo(12, 5);
  });

  it("does not use a plane parallel to the ortho ray", () => {
    const planeN = dragPlaneNormal(view, up, normal);
    expect(Math.abs(planeN.x * view.x + planeN.y * view.y + planeN.z * view.z)).toBeGreaterThan(0.5);
  });

  it("flips keep side from the closest point on an ortho ray", () => {
    const left = closestPointOnRay({ x: -4, y: 20, z: 0 }, view, base);
    const right = closestPointOnRay({ x: 4, y: 20, z: 0 }, view, base);
    expect(sideSign(normal, base, left)).toBe(-1);
    expect(sideSign(normal, base, right)).toBe(1);
  });
});
