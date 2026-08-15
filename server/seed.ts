import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { ROOT_DIR, STORAGE_DIR } from "./config";
import {
  getProjectBySlug,
  insertProject,
  insertRevision,
  insertView,
  listProjects,
  publishRevision,
} from "./db";
import { processCadFile } from "./processor";

const DEMO_SLUG = "26-0147";

export async function seedDemoIfEmpty(): Promise<void> {
  if (listProjects().length > 0 || getProjectBySlug(DEMO_SLUG)) return;

  const samplePath = join(ROOT_DIR, "samples", "demo.stp");
  if (!existsSync(samplePath)) {
    console.warn("Seed saltato: manca samples/demo.stp");
    return;
  }

  const project = {
    id: randomUUID(),
    slug: DEMO_SLUG,
    jobCode: "26/0147",
    clientName: "ROSSI SPA",
    title: "Scala ingresso principale",
    createdAt: new Date().toISOString(),
  };
  insertProject(project);

  const bytes = new Uint8Array(readFileSync(samplePath));
  const destDir = join(STORAGE_DIR, project.slug, "rev3");
  const processed = await processCadFile({
    kind: "step",
    bytes,
    originalName: "scala-ingresso.stp",
    destDir,
  });

  const rev2 = {
    id: randomUUID(),
    projectId: project.id,
    revision: 2,
    originalFilename: "scala-ingresso-rev02.stp",
    originalPath: processed.originalPath,
    viewerPath: processed.viewerPath,
    assemblyPath: processed.assemblyPath,
    published: false,
    superseded: true,
    createdAt: new Date(Date.now() - 86400000 * 12).toISOString(),
    notes: "Revisione superata, tenuta per lo storico officina.",
    partCount: processed.partCount,
    triangleCount: processed.triangleCount,
  };
  const rev3 = {
    id: randomUUID(),
    projectId: project.id,
    revision: 3,
    originalFilename: "scala-ingresso-rev03.stp",
    originalPath: processed.originalPath,
    viewerPath: processed.viewerPath,
    assemblyPath: processed.assemblyPath,
    published: false,
    superseded: false,
    createdAt: new Date().toISOString(),
    notes: "Revisione corrente. Geometria di prova (cubo STEP): sostituire con lo STEP reale.",
    partCount: processed.partCount,
    triangleCount: processed.triangleCount,
  };
  insertRevision(rev2);
  insertRevision(rev3);
  publishRevision(project.id, rev3.id);
  insertView({
    id: randomUUID(),
    projectId: project.id,
    revisionId: rev3.id,
    name: "Assieme completo",
    kind: "generale",
    isolatePartIds: [],
    visibleNames: [],
    explode: 0,
    createdAt: new Date().toISOString(),
  });
  insertView({
    id: randomUUID(),
    projectId: project.id,
    revisionId: rev3.id,
    name: "Montaggio esploso",
    kind: "esploso",
    isolatePartIds: [],
    visibleNames: [],
    explode: 0.7,
    createdAt: new Date().toISOString(),
  });
  console.log("Commessa demo 26/0147 (REV.03) pronta.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedDemoIfEmpty()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
