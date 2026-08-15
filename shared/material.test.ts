import { describe, expect, it } from "vitest";
import {
  MATERIALS,
  catalogToPartMaterial,
  densityToGcm3,
  formatWeight,
  isCameraPose,
  isGlassMaterial,
  isMaterialId,
  parsePartMaterial,
  partWeightKg,
  resolveCatalogMaterial,
  weightKg,
} from "./material";

describe("catalogo materiali", () => {
  it("mette prima i metalli, poi vetro legno plastica muri", () => {
    expect(MATERIALS.map((item) => item.id)).toEqual([
      "acciaio",
      "ottone",
      "acciaio-inox",
      "alluminio",
      "vetro",
      "legno",
      "plastica",
      "muri",
    ]);
  });

  it("allega le densità Siderio e lascia i muri senza peso", () => {
    expect(resolveCatalogMaterial("acciaio")?.density).toBeCloseTo(7.85);
    expect(resolveCatalogMaterial("ottone")?.density).toBeCloseTo(8.4);
    expect(resolveCatalogMaterial("acciaio-inox")?.density).toBeCloseTo(7.9);
    expect(resolveCatalogMaterial("alluminio")?.density).toBeCloseTo(2.7);
    expect(resolveCatalogMaterial("vetro")?.density).toBeCloseTo(2.5);
    expect(resolveCatalogMaterial("legno")?.density).toBeCloseTo(0.65);
    expect(resolveCatalogMaterial("plastica")?.density).toBeCloseTo(1.4);
    expect(resolveCatalogMaterial("muri")?.density).toBeNull();
    expect(resolveCatalogMaterial("muri")?.weighs).toBe(false);
    expect(partWeightKg(1_000_000, catalogToPartMaterial(MATERIALS.find((item) => item.id === "muri")!))).toBeNull();
  });

  it("i muri non pesano anche se la densità fosse sbagliata", () => {
    expect(partWeightKg(2_000_000, { id: "muri", name: "Muri", density: 2.4 })).toBeNull();
  });
});

describe("parsePartMaterial", () => {
  it("porta i nomi importati nel catalogo Siderio", () => {
    const spec = parsePartMaterial({
      name: "Glass",
      density: 2500,
      opacity: 0.35,
      color: [0.4, 0.7, 0.85],
    });
    expect(spec?.id).toBe("vetro");
    expect(spec?.name).toBe("Vetro");
    expect(spec?.density).toBeCloseTo(2.5);
    expect(isGlassMaterial(spec?.name)).toBe(true);
  });

  it("non usa la densità Solid Edge se il nome non è in catalogo", () => {
    const spec = parsePartMaterial({ name: "Mistero", density: 7850 });
    expect(spec?.density).toBeNull();
    expect(isMaterialId(spec?.id)).toBe(false);
  });
});

describe("isGlassMaterial", () => {
  it("riconosce il vetro dal catalogo", () => {
    expect(isGlassMaterial("Vetro")).toBe(true);
    expect(isGlassMaterial("Glass")).toBe(true);
    expect(isGlassMaterial("Acciaio")).toBe(false);
  });
});

describe("densityToGcm3", () => {
  it("converte kg/m³ in g/cm³", () => {
    expect(densityToGcm3(7850)).toBeCloseTo(7.85);
    expect(densityToGcm3(2.7)).toBeCloseTo(2.7);
  });
});

describe("weightKg", () => {
  it("converte mm³ e densità in kg", () => {
    expect(weightKg(1_000_000, 2.7)).toBeCloseTo(2.7, 5);
    expect(formatWeight(0.12)).toBe("120 g");
  });
});

describe("isCameraPose", () => {
  it("accetta una posa completa", () => {
    expect(
      isCameraPose({
        position: [1, 2, 3],
        target: [0, 0, 0],
        up: [0, 0, 1],
        ortho: true,
        zoom: 1.2,
      }),
    ).toBe(true);
    expect(isCameraPose({ position: [1, 2, 3] })).toBe(false);
  });
});
