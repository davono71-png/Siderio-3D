import { describe, expect, it } from "vitest";
import { parseSolidEdgeManifest } from "./manifest";

describe("parseSolidEdgeManifest", () => {
  it("accetta il pacchetto del pubblicatore Solid Edge", () => {
    const manifest = parseSolidEdgeManifest({
      jobCode: "26/0147",
      clientName: "ROSSI SPA",
      title: "Scala",
      source: { application: "Solid Edge", document: "SCALA.ASM" },
      configurations: [{ name: "SOLO CARPENTERIA", visibleNames: ["TELAIO", "FIANCATA_SX"] }],
    });
    expect(manifest.configurations[0]?.name).toBe("SOLO CARPENTERIA");
    expect(manifest.source.document).toBe("SCALA.ASM");
  });

  it("rifiuta un manifest vuoto", () => {
    expect(() => parseSolidEdgeManifest({})).toThrow(/commessa/i);
  });
});
