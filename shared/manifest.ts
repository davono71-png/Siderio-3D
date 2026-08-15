import type { AssemblyTree, SolidEdgeManifest } from "./types";

export function parseSolidEdgeManifest(raw: unknown): SolidEdgeManifest {
  if (!raw || typeof raw !== "object") {
    throw new Error("Manifest Solid Edge mancante o non valido.");
  }
  const data = raw as Record<string, unknown>;
  const jobCode = String(data.jobCode ?? "").trim();
  const clientName = String(data.clientName ?? "").trim();
  const title = String(data.title ?? "").trim();
  if (!jobCode || !clientName || !title) {
    throw new Error("Nel manifest servono commessa, cliente e titolo.");
  }
  const source = (data.source ?? {}) as Record<string, unknown>;
  const configurations = Array.isArray(data.configurations) ? data.configurations : [];
  return {
    jobCode,
    clientName,
    title,
    revision: typeof data.revision === "number" ? data.revision : undefined,
    notes: typeof data.notes === "string" ? data.notes : undefined,
    source: {
      application: "Solid Edge",
      document: String(source.document ?? "Assieme.asm"),
      fullPath: typeof source.fullPath === "string" ? source.fullPath : undefined,
    },
    assembly: isAssembly(data.assembly) ? data.assembly : undefined,
    configurations: configurations.map((item) => {
      const config = (item ?? {}) as Record<string, unknown>;
      return {
        name: String(config.name ?? "Configurazione").trim() || "Configurazione",
        visibleNames: Array.isArray(config.visibleNames)
          ? config.visibleNames.map((name) => String(name))
          : [],
        explode: typeof config.explode === "number" ? config.explode : 0,
      };
    }),
  };
}

function isAssembly(value: unknown): value is AssemblyTree {
  if (!value || typeof value !== "object") return false;
  const tree = value as AssemblyTree;
  return Boolean(tree.root && Array.isArray(tree.parts));
}
