import { describe, expect, it } from "vitest";
import { configNameError, displayViewName } from "./view";

describe("displayViewName", () => {
  it("toglie il suffisso Solid Edge", () => {
    expect(displayViewName("predefinito,Solid Edge")).toBe("predefinito");
    expect(displayViewName("solo telaio")).toBe("solo telaio");
  });
});

describe("configNameError", () => {
  it("richiede un nome", () => {
    expect(configNameError("  ")).toBeTruthy();
    expect(configNameError("Montaggio anta")).toBeNull();
  });
});
