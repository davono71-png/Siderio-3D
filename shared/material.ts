export type MaterialId =
  | "acciaio"
  | "ottone"
  | "acciaio-inox"
  | "alluminio"
  | "vetro"
  | "legno"
  | "plastica"
  | "muri";

export type CatalogMaterial = {
  id: MaterialId;
  label: string;
  /** Densità in g/cm³. Null solo per i muri: non pesano mai. */
  density: number | null;
  weighs: boolean;
  glass: boolean;
  color: [number, number, number];
  metalness: number;
  roughness: number;
};

export type MaterialSpec = {
  id?: MaterialId;
  name: string;
  density: number | null;
  opacity: number | null;
  color: [number, number, number] | null;
};

/** Metalli, poi vetro, legno, plastica, muri. Densità tipiche di officina. */
export const MATERIALS: CatalogMaterial[] = [
  { id: "acciaio", label: "Acciaio", density: 7.85, weighs: true, glass: false, color: [0.55, 0.57, 0.6], metalness: 0.72, roughness: 0.38 },
  { id: "ottone", label: "Ottone", density: 8.4, weighs: true, glass: false, color: [0.78, 0.62, 0.22], metalness: 0.75, roughness: 0.32 },
  { id: "acciaio-inox", label: "Acciaio inox", density: 7.9, weighs: true, glass: false, color: [0.72, 0.74, 0.76], metalness: 0.82, roughness: 0.28 },
  { id: "alluminio", label: "Alluminio", density: 2.7, weighs: true, glass: false, color: [0.78, 0.8, 0.83], metalness: 0.65, roughness: 0.35 },
  { id: "vetro", label: "Vetro", density: 2.5, weighs: true, glass: true, color: [0.478, 0.831, 0.541], metalness: 0.05, roughness: 0.08 },
  { id: "legno", label: "Legno", density: 0.65, weighs: true, glass: false, color: [0.62, 0.42, 0.22], metalness: 0, roughness: 0.78 },
  { id: "plastica", label: "Plastica", density: 1.4, weighs: true, glass: false, color: [0.82, 0.84, 0.86], metalness: 0.05, roughness: 0.55 },
  { id: "muri", label: "Muri", density: null, weighs: false, glass: false, color: [0.78, 0.74, 0.66], metalness: 0, roughness: 0.92 },
];

const MATERIAL_IDS = new Set(MATERIALS.map((item) => item.id));

export function isMaterialId(value: unknown): value is MaterialId {
  return typeof value === "string" && MATERIAL_IDS.has(value as MaterialId);
}

export function getMaterial(id: MaterialId): CatalogMaterial {
  return MATERIALS.find((item) => item.id === id) ?? MATERIALS[0];
}

export function catalogToPartMaterial(catalog: CatalogMaterial): MaterialSpec {
  return {
    id: catalog.id,
    name: catalog.label,
    density: catalog.weighs ? catalog.density : null,
    opacity: catalog.glass ? 0.42 : 1,
    color: catalog.color,
  };
}

/** Abbina un nome importato al catalogo Siderio. */
export function resolveCatalogMaterial(name: string | null | undefined): CatalogMaterial | null {
  if (!name) return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (isMaterialId(trimmed)) return getMaterial(trimmed);
  const lower = trimmed.toLowerCase();
  const byLabel = MATERIALS.find((item) => item.label.toLowerCase() === lower);
  if (byLabel) return byLabel;
  if (/inox|stainless/.test(lower)) return getMaterial("acciaio-inox");
  if (/allumin|alumin/.test(lower)) return getMaterial("alluminio");
  if (/ottone|brass/.test(lower)) return getMaterial("ottone");
  if (/acciaio|steel|\bferro\b/.test(lower)) return getMaterial("acciaio");
  if (/vetro|vetrata|vetrate|\bglass\b|cristallo/.test(lower)) return getMaterial("vetro");
  if (/legno|wood|timber/.test(lower)) return getMaterial("legno");
  if (/plastic|pvc|nylon|polimer/.test(lower)) return getMaterial("plastica");
  if (/mur[oi]|wall|calcestruzzo|concrete|intonaco/.test(lower)) return getMaterial("muri");
  return null;
}

/** 1 = opaco. Sotto soglia usa lo stile trasparente del FaceStyle, non il nome file. */
export function isTransparent(opacity: number | null | undefined): boolean {
  return opacity != null && Number.isFinite(opacity) && opacity < 0.98;
}

export function isGlassMaterial(name: string | null | undefined): boolean {
  return resolveCatalogMaterial(name)?.glass === true;
}

export function materialWeighs(spec: MaterialSpec | null | undefined): boolean {
  const catalog = resolveCatalogMaterial(spec?.id ?? spec?.name);
  return Boolean(catalog?.weighs && catalog.density != null);
}

/** SE spesso dà kg/m³ (7850); Siderio usa g/cm³ (7.85). */
export function densityToGcm3(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  const gcm3 = value > 50 ? value / 1000 : value;
  return gcm3 > 0.01 && gcm3 < 30 ? gcm3 : null;
}

export function parsePartMaterial(raw: unknown): MaterialSpec | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const name = typeof data.name === "string" ? data.name.trim() : "";
  const catalog = resolveCatalogMaterial(isMaterialId(data.id) ? data.id : name);
  if (catalog) return catalogToPartMaterial(catalog);
  const opacity =
    typeof data.opacity === "number" && Number.isFinite(data.opacity)
      ? data.opacity > 1 && data.opacity <= 100
        ? data.opacity / 100
        : data.opacity
      : null;
  const color =
    Array.isArray(data.color) &&
    data.color.length >= 3 &&
    data.color.slice(0, 3).every((item) => typeof item === "number" && Number.isFinite(item))
      ? (data.color.slice(0, 3).map((item) => {
          const n = item as number;
          return n > 1.5 ? n / 255 : n;
        }) as [number, number, number])
      : null;
  if (!name && opacity == null && !color) return null;
  return { name, density: null, opacity, color };
}

/** volume mm³, density g/cm³ → kg. I muri non passano da qui: density è null. */
export function weightKg(volumeMm3: number, density: number): number {
  return (Math.abs(volumeMm3) * density) / 1e6;
}

export function partWeightKg(
  volumeMm3: number,
  spec: { id?: MaterialId; name?: string | null; density?: number | null } | null | undefined,
): number | null {
  const catalog = resolveCatalogMaterial(spec?.id ?? spec?.name);
  if (!catalog || !catalog.weighs || catalog.density == null) return null;
  return weightKg(volumeMm3, catalog.density);
}

export function formatMm(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(1)} mm`;
}

export function formatWeight(kg: number | null): string {
  if (kg == null || !Number.isFinite(kg)) return "—";
  if (kg < 1) return `${(kg * 1000).toFixed(0)} g`;
  return `${kg.toFixed(3)} kg`;
}

export function isCameraPose(value: unknown): value is {
  position: [number, number, number];
  target: [number, number, number];
  up: [number, number, number];
  ortho: boolean;
  zoom: number;
} {
  if (!value || typeof value !== "object") return false;
  const pose = value as Record<string, unknown>;
  const vec3 = (item: unknown) => Array.isArray(item) && item.length === 3 && item.every((n) => typeof n === "number");
  return vec3(pose.position) && vec3(pose.target) && vec3(pose.up) && typeof pose.ortho === "boolean" && typeof pose.zoom === "number";
}
