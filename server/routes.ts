import type { FastifyInstance, FastifyRequest } from "fastify";
import { createReadStream, existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import QRCode from "qrcode";
import { detectCadKind, uploadRejectionMessage } from "../shared/format";
import { formatRevision, jobToSlug, paperRevisionWarning, parseRevisionLabel } from "../shared/slug";
import type { CreateProjectInput, ProjectDetail, ViewerPayload } from "../shared/types";
import { PUBLIC_URL, STORAGE_DIR } from "./config";
import {
  getProjectBySlug,
  getPublishedRevision,
  getRevision,
  insertProject,
  insertRevision,
  insertView,
  listProjects,
  listRevisions,
  listViews,
  nextRevisionNumber,
  publishRevision,
  readAssembly,
} from "./db";
import { processCadFile } from "./processor";

function publicBase(request: FastifyRequest): string {
  if (PUBLIC_URL) return PUBLIC_URL;
  const proto = String(request.headers["x-forwarded-proto"] ?? "http");
  const host = String(request.headers.host ?? `127.0.0.1`);
  return `${proto}://${host}`;
}

function viewerUrl(request: FastifyRequest, slug: string): string {
  return `${publicBase(request)}/c/${slug}`;
}

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/health", async () => ({ ok: true, app: "siderio-3d" }));

  app.get("/api/projects", async () => ({ projects: listProjects() }));

  app.post("/api/projects", async (request, reply) => {
    const body = request.body as CreateProjectInput;
    const jobCode = body.jobCode?.trim();
    const clientName = body.clientName?.trim();
    const title = body.title?.trim();
    if (!jobCode || !clientName || !title) {
      return reply.code(400).send({ error: "Servono commessa, cliente e titolo." });
    }
    const slug = jobToSlug(jobCode);
    if (getProjectBySlug(slug)) {
      return reply.code(409).send({ error: `La commessa ${jobCode} esiste già.` });
    }
    const project = {
      id: randomUUID(),
      slug,
      jobCode,
      clientName,
      title,
      createdAt: new Date().toISOString(),
    };
    insertProject(project);
    return { project };
  });

  app.get("/api/projects/:slug", async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const project = getProjectBySlug(slug);
    if (!project) return reply.code(404).send({ error: "Commessa non trovata." });
    const detail: ProjectDetail = {
      project,
      revisions: listRevisions(project.id),
      current: getPublishedRevision(project.id),
      views: listViews(project.id),
    };
    return detail;
  });

  app.get("/api/projects/:slug/viewer", async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const query = request.query as { carta?: string; vista?: string };
    const project = getProjectBySlug(slug);
    if (!project) return reply.code(404).send({ error: "Commessa non trovata." });
    const revision = getPublishedRevision(project.id);
    if (!revision?.viewerPath) {
      return reply.code(409).send({ error: "Nessuna revisione pubblicata per questa commessa." });
    }
    const payload: ViewerPayload = {
      project,
      revision,
      assembly: readAssembly(revision),
      glbUrl: `/api/projects/${project.slug}/glb`,
      views: listViews(project.id),
      paperWarning: paperRevisionWarning(parseRevisionLabel(query.carta ?? null), revision.revision),
    };
    return payload;
  });

  app.get("/api/projects/:slug/glb", async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const project = getProjectBySlug(slug);
    if (!project) return reply.code(404).send({ error: "Commessa non trovata." });
    const revision = getPublishedRevision(project.id);
    if (!revision?.viewerPath || !existsSync(revision.viewerPath)) {
      return reply.code(404).send({ error: "Modello viewer non trovato." });
    }
    reply.header("Content-Type", "model/gltf-binary");
    reply.header("Cache-Control", "no-cache");
    return reply.send(createReadStream(revision.viewerPath));
  });

  app.get("/api/projects/:slug/qr", async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const project = getProjectBySlug(slug);
    if (!project) return reply.code(404).send({ error: "Commessa non trovata." });
    const url = viewerUrl(request, project.slug);
    const svg = await QRCode.toString(url, { type: "svg", margin: 1, width: 320 });
    return { url, svg, label: `${project.jobCode}  REV.${formatRevision(getPublishedRevision(project.id)?.revision ?? 0)}` };
  });

  app.post("/api/projects/:slug/revisions/:id/publish", async (request, reply) => {
    const { slug, id } = request.params as { slug: string; id: string };
    const project = getProjectBySlug(slug);
    if (!project) return reply.code(404).send({ error: "Commessa non trovata." });
    const revision = getRevision(id);
    if (!revision || revision.projectId !== project.id) {
      return reply.code(404).send({ error: "Revisione non trovata." });
    }
    publishRevision(project.id, revision.id);
    return { ok: true, current: getPublishedRevision(project.id) };
  });

  app.post("/api/projects/:slug/revisions", async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const project = getProjectBySlug(slug);
    if (!project) return reply.code(404).send({ error: "Commessa non trovata." });

    const file = await request.file();
    if (!file) return reply.code(400).send({ error: "Allega un file STEP." });

    const bytes = await file.toBuffer();
    const kind = detectCadKind(file.filename, bytes);
    const rejection = uploadRejectionMessage(kind, file.filename);
    if (rejection || (kind !== "step" && kind !== "iges" && kind !== "brep")) {
      return reply.code(415).send({ error: rejection ?? "Formato non supportato." });
    }

    const revisionNumber = nextRevisionNumber(project.id);
    const destDir = join(STORAGE_DIR, project.slug, `rev${revisionNumber}`);
    const processed = await processCadFile({
      kind,
      bytes,
      originalName: file.filename,
      destDir,
    });

    const notes = typeof file.fields.notes === "object" && "value" in file.fields.notes
      ? String(file.fields.notes.value)
      : null;
    const publishNow =
      typeof file.fields.publish === "object" && "value" in file.fields.publish
        ? String(file.fields.publish.value) !== "0"
        : true;

    const revision = {
      id: randomUUID(),
      projectId: project.id,
      revision: revisionNumber,
      originalFilename: file.filename,
      originalPath: processed.originalPath,
      viewerPath: processed.viewerPath,
      assemblyPath: processed.assemblyPath,
      published: false,
      superseded: false,
      createdAt: new Date().toISOString(),
      notes,
      partCount: processed.partCount,
      triangleCount: processed.triangleCount,
    };
    insertRevision(revision);
    if (publishNow) {
      publishRevision(project.id, revision.id);
    }
    if (revisionNumber === 1) {
      insertView({
        id: randomUUID(),
        projectId: project.id,
        revisionId: revision.id,
        name: "Assieme completo",
        kind: "generale",
        isolatePartIds: [],
        explode: 0,
        createdAt: new Date().toISOString(),
      });
      insertView({
        id: randomUUID(),
        projectId: project.id,
        revisionId: revision.id,
        name: "Montaggio esploso",
        kind: "esploso",
        isolatePartIds: [],
        explode: 0.65,
        createdAt: new Date().toISOString(),
      });
    }
    return { revision: getRevision(revision.id), current: getPublishedRevision(project.id) };
  });
}
