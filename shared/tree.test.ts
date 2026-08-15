import { describe, expect, it } from "vitest";
import { nestOccurrenceList, nodeMatches } from "./tree";

describe("nestOccurrenceList", () => {
  it("annida i figli sotto il sottoassieme, nello stesso ordine", () => {
    const nested = nestOccurrenceList([
      { id: "telaio.par:1", name: "telaio.par:1", partId: "telaio.par:1", children: [] },
      { id: "anta.asm:1", name: "anta.asm:1", partId: "anta.asm:1", children: [] },
      { id: "anta.asm:1/vetro.par:1", name: "vetro.par:1", partId: "anta.asm:1/vetro.par:1", children: [] },
      { id: "anta.asm:1/maniglia.par:1", name: "maniglia.par:1", partId: "anta.asm:1/maniglia.par:1", children: [] },
    ]);
    expect(nested.map((node) => node.name)).toEqual(["telaio.par:1", "anta.asm:1"]);
    expect(nested[1]?.children.map((node) => node.name)).toEqual(["vetro.par:1", "maniglia.par:1"]);
  });

  it("non altera un albero già nidificato", () => {
    const nested = nestOccurrenceList([
      {
        id: "n1",
        name: "Gruppo",
        partId: null,
        children: [{ id: "n2", name: "Pezzo", partId: "p0", children: [] }],
      },
    ]);
    expect(nested[0]?.children[0]?.name).toBe("Pezzo");
  });
});

describe("nodeMatches", () => {
  it("trova un pezzo anche dentro un sottoassieme", () => {
    const group = {
      id: "g",
      name: "Anta",
      partId: null,
      children: [{ id: "v", name: "Ar3981_Vetro_1.par:1", partId: "v", children: [] }],
    };
    expect(nodeMatches(group, "vetro")).toBe(true);
    expect(nodeMatches(group, "telaio")).toBe(false);
  });
});
