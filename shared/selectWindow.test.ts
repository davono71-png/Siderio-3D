import { describe, expect, it } from "vitest";
import { isCrossingSelect, normalizeRect, partHitsWindow } from "./selectWindow";

describe("selectWindow", () => {
  it("a sinistra è crossing, a destra è window", () => {
    expect(isCrossingSelect(100, 40)).toBe(true);
    expect(isCrossingSelect(100, 160)).toBe(false);
  });

  it("window prende solo il pezzo interamente compreso", () => {
    const window = normalizeRect(10, 10, 100, 100);
    expect(partHitsWindow({ left: 20, top: 20, right: 80, bottom: 80 }, window, false)).toBe(true);
    expect(partHitsWindow({ left: 5, top: 20, right: 80, bottom: 80 }, window, false)).toBe(false);
  });

  it("crossing prende anche il pezzo parzialmente compreso", () => {
    const window = normalizeRect(10, 10, 100, 100);
    expect(partHitsWindow({ left: 5, top: 20, right: 80, bottom: 80 }, window, true)).toBe(true);
    expect(partHitsWindow({ left: 200, top: 200, right: 240, bottom: 240 }, window, true)).toBe(false);
  });
});
