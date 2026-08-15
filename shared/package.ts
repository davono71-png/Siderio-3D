/** Trova siderio.json e lo STEP dentro una cartella (o un elenco di file scelti). */
export function findPackageParts(fileNames: string[]): { manifest: string; step: string } | null {
  const base = (name: string) => name.replace(/\\/g, "/").split("/").pop() ?? name;
  const manifest =
    fileNames.find((name) => base(name).toLowerCase() === "siderio.json") ??
    fileNames.find((name) => {
      const file = base(name).toLowerCase();
      return file.endsWith(".json") && file !== "assembly.json";
    });
  const step = fileNames.find((name) => /\.(stp|step|stpz)$/i.test(base(name)));
  if (!manifest || !step) return null;
  return { manifest, step };
}
