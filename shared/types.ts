import type { MaterialId } from "./material";

export type Project = {
  id: string;
  slug: string;
  jobCode: string;
  clientName: string;
  title: string;
  createdAt: string;
};

export type ModelRevision = {
  id: string;
  projectId: string;
  revision: number;
  originalFilename: string | null;
  originalPath: string | null;
  viewerPath: string | null;
  assemblyPath: string | null;
  published: boolean;
  superseded: boolean;
  createdAt: string;
  notes: string | null;
  partCount: number;
  triangleCount: number;
};

export type AssemblyNode = {
  id: string;
  name: string;
  partId: string | null;
  children: AssemblyNode[];
};

export type AssemblyPart = {
  id: string;
  name: string;
  triangleCount: number;
  color: [number, number, number];
  /** Catalogo Siderio (acciaio, vetro, muri, …), non i valori importati da Solid Edge. */
  material?: PartMaterial | null;
};

export type PartMaterial = {
  id?: MaterialId;
  name: string;
  /** Densità in g/cm³. Null per i muri. */
  density: number | null;
  /** 1 = opaco, 0 = trasparente. */
  opacity: number | null;
  color?: [number, number, number] | null;
};

export type AssemblyTree = {
  unit: "mm";
  root: AssemblyNode;
  parts: AssemblyPart[];
};

export type SavedViewKind = "generale" | "dettaglio" | "esploso" | "montaggio" | "configurazione" | "foto";

export type CameraPose = {
  position: [number, number, number];
  target: [number, number, number];
  up: [number, number, number];
  ortho: boolean;
  zoom: number;
};

export type SavedView = {
  id: string;
  projectId: string;
  revisionId: string | null;
  name: string;
  kind: SavedViewKind;
  isolatePartIds: string[];
  visibleNames: string[];
  explode: number;
  camera?: CameraPose | null;
  createdAt: string;
};

/** Pacchetto inviato da Solid Edge (add-in / Pubblica in officina). */
export type SolidEdgeManifest = {
  jobCode: string;
  clientName: string;
  title: string;
  revision?: number;
  notes?: string;
  source: {
    application: "Solid Edge";
    document: string;
    fullPath?: string;
  };
  assembly?: AssemblyTree;
  configurations: Array<{
    name: string;
    visibleNames: string[];
    explode?: number;
  }>;
};

export type ProjectDetail = {
  project: Project;
  revisions: ModelRevision[];
  current: ModelRevision | null;
  views: SavedView[];
};

export type ViewerPayload = {
  project: Project;
  revision: ModelRevision;
  assembly: AssemblyTree;
  glbUrl: string;
  views: SavedView[];
  paperWarning: { paper: number; current: number } | null;
};

export type CreateProjectInput = {
  jobCode: string;
  clientName: string;
  title: string;
};
