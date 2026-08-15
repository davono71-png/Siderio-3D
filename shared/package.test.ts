import { describe, expect, it } from "vitest";
import { findPackageParts } from "./package";

describe("findPackageParts", () => {
  it("trova siderio.json e lo STEP nella cartella esportata", () => {
    const found = findPackageParts([
      "26-0147_Serramento/siderio.json",
      "26-0147_Serramento/model.stp",
      "26-0147_Serramento/note.txt",
    ]);
    expect(found).toEqual({
      manifest: "26-0147_Serramento/siderio.json",
      step: "26-0147_Serramento/model.stp",
    });
  });

  it("rifiuta una cartella senza STEP", () => {
    expect(findPackageParts(["siderio.json"])).toBeNull();
  });
});
