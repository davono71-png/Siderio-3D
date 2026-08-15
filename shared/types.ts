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
};

export type AssemblyTree = {
  unit: "mm";
  root: AssemblyNode;
  parts: AssemblyPart[];
};

export type SavedView = {
  id: string;
  projectId: string;
  revisionId: string | null;
  name: string;
  kind: "generale" | "dettaglio" | "esploso" | "montaggio";
  isolatePartIds: string[];
  explode: number;
  createdAt: string;
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
