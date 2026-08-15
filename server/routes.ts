import type { FastifyInstance, FastifyRequest } from "fastify";
import { createReadStream, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import QRCode from "qrcode";
import { detectCadKind, uploadRejectionMessage } from "../shared/format";
import { parseSolidEdgeManifest } from "../shared/manifest";
import { formatRevision, jobToSlug, paperRevisionWarning, parseRevisionLabel } from "../shared/slug";
import { catalogToPartMaterial, getMaterial, isCameraPose, isMaterialId } from "../shared/material";
import { configNameError } from "../shared/view";
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
    writeAssembly,
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
      views: listViews(project.id).filter(
        (view) =>
          !view.revisionId ||
          view.revisionId === revision.id ||
          view.kind === "configurazione" ||
          view.kind === "foto",
      ),
      paperWarning: paperRevisionWarning(parseRevisionLabel(query.carta ?? null), revision.revision),
    };
    return payload;
  });

  app.post("/api/projects/:slug/views", async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const project = getProjectBySlug(slug);
    if (!project) return reply.code(404).send({ error: "Commessa non trovata." });
    const body = request.body as {
      name?: string;
      kind?: string;
      visibleNames?: unknown;
      explode?: unknown;
      camera?: unknown;
    };
    const nameError = configNameError(body.name ?? "");
    if (nameError) return reply.code(400).send({ error: nameError });
    const revision = getPublishedRevision(project.id);
    const isFoto = body.kind === "foto";
    if (isFoto && !isCameraPose(body.camera)) {
      return reply.code(400).send({ error: "La foto deve includere il punto di vista." });
    }
    const visibleNames = Array.isArray(body.visibleNames)
      ? body.visibleNames.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [];
    const explode = typeof body.explode === "number" && Number.isFinite(body.explode) ? body.explode : 0;
    const view = {
      id: randomUUID(),
      projectId: project.id,
      revisionId: revision?.id ?? null,
      name: (body.name ?? "").trim(),
      kind: isFoto ? ("foto" as const) : ("configurazione" as const),
      isolatePartIds: [] as string[],
      visibleNames: isFoto ? [] : visibleNames,
      explode: isFoto ? 0 : Math.min(1, Math.max(0, explode)),
      camera: isFoto && isCameraPose(body.camera) ? body.camera : null,
      createdAt: new Date().toISOString(),
    };
    insertView(view);
    return { view };
  });

  app.patch("/api/projects/:slug/materials", async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const project = getProjectBySlug(slug);
    if (!project) return reply.code(404).send({ error: "Commessa non trovata." });
    const revision = getPublishedRevision(project.id);
    if (!revision) return reply.code(409).send({ error: "Nessuna revisione pubblicata." });
    const body = request.body as { assignments?: unknown };
    if (!Array.isArray(body.assignments) || body.assignments.length === 0) {
      return reply.code(400).send({ error: "Servono le assegnazioni materiale." });
    }
    const assembly = readAssembly(revision);
    for (const item of body.assignments) {
      if (!item || typeof item !== "object") continue;
      const row = item as { partId?: unknown; materialId?: unknown };
      if (typeof row.partId !== "string" || !isMaterialId(row.materialId)) {
        return reply.code(400).send({ error: "Materiale non valido." });
      }
      const part = assembly.parts.find((entry) => entry.id === row.partId);
      if (!part) continue;
      part.material = catalogToPartMaterial(getMaterial(row.materialId));
    }
    writeAssembly(revision, assembly);
    return { ok: true, assembly };
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
        visibleNames: [],
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
        visibleNames: [],
        explode: 0.65,
        createdAt: new Date().toISOString(),
      });
    }
    return { revision: getRevision(revision.id), current: getPublishedRevision(project.id) };
  });

  app.post("/api/publish", async (request, reply) => {
    let stepBytes: Uint8Array | null = null;
    let stepName = "solidedge.stp";
    let manifestRaw: unknown = null;

    for await (const part of request.parts()) {
      if (part.type === "file" && (part.fieldname === "step" || part.fieldname === "file")) {
        stepName = part.filename || stepName;
        stepBytes = await part.toBuffer();
      } else if (part.type === "file" && (part.fieldname === "manifest" || /siderio\.json$/i.test(part.filename))) {
        manifestRaw = JSON.parse(Buffer.from(await part.toBuffer()).toString("utf8"));
      } else if (part.type === "field" && part.fieldname === "manifest") {
        manifestRaw = JSON.parse(String(part.value));
      }
    }

    if (!stepBytes) {
      return reply.code(400).send({ error: "Nel pacchetto manca lo STEP (model.stp)." });
    }
    let manifest;
    try {
      manifest = parseSolidEdgeManifest(manifestRaw);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Manifest non valido." });
    }

    const kind = detectCadKind(stepName, stepBytes);
    if (kind !== "step" && kind !== "iges" && kind !== "brep") {
      return reply.code(415).send({
        error: "Solid Edge deve esportare la geometria in STEP (SaveAs), non inviare l'ASM nativo.",
      });
    }

    const slug = jobToSlug(manifest.jobCode);
    let project = getProjectBySlug(slug);
    if (!project) {
      project = {
        id: randomUUID(),
        slug,
        jobCode: manifest.jobCode,
        clientName: manifest.clientName,
        title: manifest.title,
        createdAt: new Date().toISOString(),
      };
      insertProject(project);
    }

    const revisionNumber = nextRevisionNumber(project.id);
    const destDir = join(STORAGE_DIR, project.slug, `rev${revisionNumber}`);
    const processed = await processCadFile({
      kind,
      bytes: stepBytes,
      originalName: stepName,
      destDir,
    });
    if (manifest.assembly) {
      writeFileSync(processed.assemblyPath, JSON.stringify(manifest.assembly, null, 2));
    }

    const revision = {
      id: randomUUID(),
      projectId: project.id,
      revision: revisionNumber,
      originalFilename: manifest.source.document,
      originalPath: processed.originalPath,
      viewerPath: processed.viewerPath,
      assemblyPath: processed.assemblyPath,
      published: false,
      superseded: false,
      createdAt: new Date().toISOString(),
      notes: manifest.notes ?? `Pubblicato da Solid Edge: ${manifest.source.document}`,
      partCount: manifest.assembly?.parts.length ?? processed.partCount,
      triangleCount: processed.triangleCount,
    };
    insertRevision(revision);
    publishRevision(project.id, revision.id);

    insertView({
      id: randomUUID(),
      projectId: project.id,
      revisionId: revision.id,
      name: "Completo",
      kind: "generale",
      isolatePartIds: [],
      visibleNames: [],
      explode: 0,
      createdAt: new Date().toISOString(),
    });
    for (const config of manifest.configurations) {
      insertView({
        id: randomUUID(),
        projectId: project.id,
        revisionId: revision.id,
        name: config.name,
        kind: "configurazione",
        isolatePartIds: [],
        visibleNames: config.visibleNames,
        explode: config.explode ?? 0,
        createdAt: new Date().toISOString(),
      });
    }

    return {
      ok: true,
      project,
      revision: getRevision(revision.id),
      viewerUrl: viewerUrl(request, project.slug),
    };
  });
}
