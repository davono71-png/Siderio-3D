import { describe, expect, it } from "vitest";
import { detectCadKind, uploadRejectionMessage } from "./format";

const stepHeader = new TextEncoder().encode("ISO-10303-21;\nHEADER;");
const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00]);

describe("detectCadKind", () => {
  it("riconosce STEP dal contenuto, anche con estensione sbagliata", () => {
    expect(detectCadKind("pezzo.asm", stepHeader)).toBe("step");
    expect(detectCadKind("modello.stp", stepHeader)).toBe("step");
  });

  it("rifiuta i nativi Solid Edge", () => {
    expect(detectCadKind("scala.asm", ole)).toBe("native-cad");
    expect(uploadRejectionMessage("native-cad", "scala.asm")).toMatch(/Salva con nome/i);
  });
});
