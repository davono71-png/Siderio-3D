import Database from "better-sqlite3";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { DB_PATH } from "./config";
import type { AssemblyTree, ModelRevision, Project, SavedView } from "../shared/types";
import { isCameraPose } from "../shared/material";

mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  job_code TEXT NOT NULL,
  client_name TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS model_revisions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  original_filename TEXT,
  original_path TEXT,
  viewer_path TEXT,
  assembly_path TEXT,
  published INTEGER NOT NULL DEFAULT 0,
  superseded INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  notes TEXT,
  part_count INTEGER NOT NULL DEFAULT 0,
  triangle_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE (project_id, revision),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS saved_views (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  revision_id TEXT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  isolate_part_ids TEXT NOT NULL DEFAULT '[]',
  visible_names TEXT NOT NULL DEFAULT '[]',
  explode REAL NOT NULL DEFAULT 0,
  camera TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS share_links (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  pin TEXT,
  expires_at TEXT,
  revoked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
`);

try {
  db.exec("ALTER TABLE saved_views ADD COLUMN visible_names TEXT NOT NULL DEFAULT '[]'");
} catch {
  // colonna già presente
}
try {
  db.exec("ALTER TABLE saved_views ADD COLUMN camera TEXT");
} catch {
  // colonna già presente
}

type ProjectRow = {
  id: string;
  slug: string;
  job_code: string;
  client_name: string;
  title: string;
  created_at: string;
};

type RevisionRow = {
  id: string;
  project_id: string;
  revision: number;
  original_filename: string | null;
  original_path: string | null;
  viewer_path: string | null;
  assembly_path: string | null;
  published: number;
  superseded: number;
  created_at: string;
  notes: string | null;
  part_count: number;
  triangle_count: number;
};

type ViewRow = {
  id: string;
  project_id: string;
  revision_id: string | null;
  name: string;
  kind: SavedView["kind"];
  isolate_part_ids: string;
  visible_names: string;
  explode: number;
  created_at: string;
  camera: string | null;
};

export function mapProject(row: ProjectRow): Project {
  return {
    id: row.id,
    slug: row.slug,
    jobCode: row.job_code,
    clientName: row.client_name,
    title: row.title,
    createdAt: row.created_at,
  };
}

export function mapRevision(row: RevisionRow): ModelRevision {
  return {
    id: row.id,
    projectId: row.project_id,
    revision: row.revision,
    originalFilename: row.original_filename,
    originalPath: row.original_path,
    viewerPath: row.viewer_path,
    assemblyPath: row.assembly_path,
    published: Boolean(row.published),
    superseded: Boolean(row.superseded),
    createdAt: row.created_at,
    notes: row.notes,
    partCount: row.part_count,
    triangleCount: row.triangle_count,
  };
}

export function mapView(row: ViewRow): SavedView {
  let camera: SavedView["camera"] = null;
  if (row.camera) {
    try {
      const parsed: unknown = JSON.parse(row.camera);
      if (isCameraPose(parsed)) camera = parsed;
    } catch {
      camera = null;
    }
  }
  return {
    id: row.id,
    projectId: row.project_id,
    revisionId: row.revision_id,
    name: row.name,
    kind: row.kind,
    isolatePartIds: JSON.parse(row.isolate_part_ids) as string[],
    visibleNames: JSON.parse(row.visible_names || "[]") as string[],
    explode: row.explode,
    camera,
    createdAt: row.created_at,
  };
}

export function listProjects(): Project[] {
  return db
    .prepare("SELECT * FROM projects ORDER BY created_at DESC")
    .all()
    .map((row) => mapProject(row as ProjectRow));
}

export function getProjectBySlug(slug: string): Project | null {
  const row = db.prepare("SELECT * FROM projects WHERE slug = ?").get(slug) as ProjectRow | undefined;
  return row ? mapProject(row) : null;
}

export function insertProject(project: Project): void {
  db.prepare(
    `INSERT INTO projects (id, slug, job_code, client_name, title, created_at)
     VALUES (@id, @slug, @jobCode, @clientName, @title, @createdAt)`,
  ).run(project);
}

export function listRevisions(projectId: string): ModelRevision[] {
  return db
    .prepare("SELECT * FROM model_revisions WHERE project_id = ? ORDER BY revision DESC")
    .all(projectId)
    .map((row) => mapRevision(row as RevisionRow));
}

export function getRevision(id: string): ModelRevision | null {
  const row = db.prepare("SELECT * FROM model_revisions WHERE id = ?").get(id) as RevisionRow | undefined;
  return row ? mapRevision(row) : null;
}

export function getPublishedRevision(projectId: string): ModelRevision | null {
  const row = db
    .prepare(
      "SELECT * FROM model_revisions WHERE project_id = ? AND published = 1 ORDER BY revision DESC LIMIT 1",
    )
    .get(projectId) as RevisionRow | undefined;
  return row ? mapRevision(row) : null;
}

export function nextRevisionNumber(projectId: string): number {
  const row = db
    .prepare("SELECT MAX(revision) AS max_rev FROM model_revisions WHERE project_id = ?")
    .get(projectId) as { max_rev: number | null };
  return (row.max_rev ?? 0) + 1;
}

export function insertRevision(revision: ModelRevision): void {
  db.prepare(
    `INSERT INTO model_revisions (
      id, project_id, revision, original_filename, original_path, viewer_path, assembly_path,
      published, superseded, created_at, notes, part_count, triangle_count
    ) VALUES (
      @id, @projectId, @revision, @originalFilename, @originalPath, @viewerPath, @assemblyPath,
      @published, @superseded, @createdAt, @notes, @partCount, @triangleCount
    )`,
  ).run({
    ...revision,
    published: revision.published ? 1 : 0,
    superseded: revision.superseded ? 1 : 0,
  });
}

export function publishRevision(projectId: string, revisionId: string): void {
  const tx = db.transaction(() => {
    db.prepare("UPDATE model_revisions SET published = 0, superseded = 1 WHERE project_id = ?").run(projectId);
    db.prepare("UPDATE model_revisions SET published = 1, superseded = 0 WHERE id = ? AND project_id = ?").run(
      revisionId,
      projectId,
    );
  });
  tx();
}

export function listViews(projectId: string): SavedView[] {
  return db
    .prepare("SELECT * FROM saved_views WHERE project_id = ? ORDER BY created_at ASC")
    .all(projectId)
    .map((row) => mapView(row as ViewRow));
}

export function insertView(view: SavedView): void {
  db.prepare(
    `INSERT INTO saved_views (id, project_id, revision_id, name, kind, isolate_part_ids, visible_names, explode, camera, created_at)
     VALUES (@id, @projectId, @revisionId, @name, @kind, @isolatePartIds, @visibleNames, @explode, @camera, @createdAt)`,
  ).run({
    ...view,
    isolatePartIds: JSON.stringify(view.isolatePartIds),
    visibleNames: JSON.stringify(view.visibleNames ?? []),
    camera: view.camera ? JSON.stringify(view.camera) : null,
  });
}

export function readAssembly(revision: ModelRevision): AssemblyTree {
  if (!revision.assemblyPath) {
    throw new Error("Revisione senza albero assieme");
  }
  return JSON.parse(readFileSync(revision.assemblyPath, "utf8")) as AssemblyTree;
}

export function writeAssembly(revision: ModelRevision, assembly: AssemblyTree): void {
  if (!revision.assemblyPath) {
    throw new Error("Revisione senza albero assieme");
  }
  writeFileSync(revision.assemblyPath, JSON.stringify(assembly, null, 2));
}
