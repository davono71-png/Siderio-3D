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

  it("ignora il campo files del pacchetto su disco", () => {
    const manifest = parseSolidEdgeManifest({
      jobCode: "26/0147",
      clientName: "ROSSI SPA",
      title: "Scala",
      source: { application: "Solid Edge", document: "SCALA.ASM" },
      files: { step: "model.stp", manifest: "siderio.json" },
      configurations: [],
    });
    expect(manifest.jobCode).toBe("26/0147");
  });

  it("rifiuta un manifest vuoto", () => {
    expect(() => parseSolidEdgeManifest({})).toThrow(/commessa/i);
  });

  it("conserva il materiale della tabella Solid Edge", () => {
    const manifest = parseSolidEdgeManifest({
      jobCode: "1",
      clientName: "Cliente",
      title: "Serramento",
      source: { application: "Solid Edge", document: "A.ASM" },
      configurations: [],
      assembly: {
        unit: "mm",
        root: { id: "root", name: "A", partId: null, children: [] },
        parts: [
          {
            id: "p1",
            name: "Ar3981_Vetro_1.par:1",
            triangleCount: 0,
            color: [0.4, 0.7, 0.8],
            material: { name: "Glass", density: 2.5, opacity: 0.3 },
          },
        ],
      },
    });
    expect(manifest.assembly?.parts[0]?.material?.id).toBe("vetro");
    expect(manifest.assembly?.parts[0]?.material?.name).toBe("Vetro");
    expect(manifest.assembly?.parts[0]?.material?.density).toBeCloseTo(2.5);
  });
});
