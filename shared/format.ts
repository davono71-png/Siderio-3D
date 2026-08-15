export type CadKind = "step" | "iges" | "brep" | "stl" | "native-cad" | "unknown";

const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

function startsWithBytes(bytes: Uint8Array, magic: number[]): boolean {
  if (bytes.length < magic.length) return false;
  return magic.every((value, index) => bytes[index] === value);
}

function headText(bytes: Uint8Array, length = 400): string {
  return new TextDecoder("latin1").decode(bytes.subarray(0, Math.min(bytes.length, length)));
}

export function detectCadKind(fileName: string, bytes: Uint8Array): CadKind {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  const head = headText(bytes).trimStart();

  if (head.startsWith("ISO-10303-21") || head.includes("ISO-10303-21")) {
    return "step";
  }
  if (/^\s*IGES/i.test(head) || ext === "iges" || ext === "igs") {
    if (ext === "iges" || ext === "igs" || head.includes("S      1")) return "iges";
  }
  if (head.startsWith("DBRep_DrawableShape") || ext === "brep") return "brep";
  if (ext === "stl" || head.startsWith("solid ") || startsWithBytes(bytes, [0x73, 0x6f, 0x6c, 0x69, 0x64])) {
    return "stl";
  }
  if (startsWithBytes(bytes, OLE_MAGIC)) return "native-cad";
  if (["asm", "par", "psm", "dft", "sldasm", "sldprt"].includes(ext)) return "native-cad";
  if (["step", "stp", "stpz", "p21"].includes(ext)) return "step";
  return "unknown";
}

export function uploadRejectionMessage(kind: CadKind, fileName: string): string | null {
  if (kind === "step") return null;
  if (kind === "iges" || kind === "brep") return null;
  if (kind === "native-cad") {
    return `${fileName} è un file nativo CAD (Solid Edge / analoghi) e non può essere aperto direttamente. Da Solid Edge: File → Salva con nome → STEP (*.stp).`;
  }
  if (kind === "stl") {
    return "STL è una mesh senza albero assieme. Per officina e revisioni pubblica un STEP.";
  }
  return `Formato non supportato: ${fileName}. Pubblica un file STEP (.stp / .step).`;
}
