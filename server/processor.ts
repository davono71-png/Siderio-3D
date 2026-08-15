import { Document, NodeIO } from "@gltf-transform/core";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import type { AssemblyNode, AssemblyPart, AssemblyTree } from "../shared/types";

const require = createRequire(import.meta.url);

type OcctNode = {
  name?: string;
  meshes?: number[];
  children?: OcctNode[];
};

type OcctMesh = {
  name?: string;
  color?: [number, number, number];
  attributes: {
    position: { array: number[] };
    normal?: { array: number[] };
  };
  index: { array: number[] };
};

type OcctResult = {
  success?: boolean;
  root?: OcctNode;
  meshes?: OcctMesh[];
};

type OcctModule = {
  ReadStepFile: (data: Uint8Array, params: Record<string, unknown> | null) => OcctResult;
  ReadIgesFile: (data: Uint8Array, params: Record<string, unknown> | null) => OcctResult;
  ReadBrepFile: (data: Uint8Array, params: Record<string, unknown> | null) => OcctResult;
};

let occtPromise: Promise<OcctModule> | null = null;

async function getOcct(): Promise<OcctModule> {
  if (!occtPromise) {
    const factory = require("occt-import-js") as (overrides?: object) => Promise<OcctModule>;
    occtPromise = factory();
  }
  return occtPromise;
}

const DEFAULT_COLOR: [number, number, number] = [0.72, 0.75, 0.78];

export type ProcessResult = {
  viewerPath: string;
  assemblyPath: string;
  originalPath: string;
  partCount: number;
  triangleCount: number;
  assembly: AssemblyTree;
};

export async function processCadFile(options: {
  kind: "step" | "iges" | "brep";
  bytes: Uint8Array;
  originalName: string;
  destDir: string;
}): Promise<ProcessResult> {
  mkdirSync(options.destDir, { recursive: true });
  const originalPath = join(options.destDir, sanitizeFileName(options.originalName));
  writeFileSync(originalPath, options.bytes);

  const occt = await getOcct();
  const params = {
    linearUnit: "millimeter",
    linearDeflectionType: "bounding_box_ratio",
    linearDeflection: 0.001,
    angularDeflection: 0.5,
  };
  const result =
    options.kind === "iges"
      ? occt.ReadIgesFile(options.bytes, params)
      : options.kind === "brep"
        ? occt.ReadBrepFile(options.bytes, params)
        : occt.ReadStepFile(options.bytes, params);

  if (!result?.success || !result.meshes?.length) {
    throw new Error("Conversione CAD non riuscita. Controlla che il file STEP sia valido.");
  }

  const built = await buildViewerAssets(result, options.destDir);
  return {
    ...built,
    originalPath,
  };
}

async function buildViewerAssets(
  result: OcctResult,
  destDir: string,
): Promise<Omit<ProcessResult, "originalPath">> {
  const document = new Document();
  const buffer = document.createBuffer();
  const scene = document.createScene("Siderio");
  document.getRoot().setDefaultScene(scene);

  const parts: AssemblyPart[] = [];
  const counters = { node: 0, part: 0 };
  const rootNode = walkNode(result.root ?? { name: "Assieme", meshes: [], children: [] }, result.meshes ?? [], {
    document,
    buffer,
    parts,
    counters,
  });
  scene.addChild(rootNode.gltf);

  const viewerPath = join(destDir, "model.glb");
  const assemblyPath = join(destDir, "assembly.json");
  const io = new NodeIO();
  const glb = await io.writeBinary(document);
  writeFileSync(viewerPath, glb);

  const assembly: AssemblyTree = {
    unit: "mm",
    root: rootNode.tree,
    parts,
  };
  writeFileSync(assemblyPath, JSON.stringify(assembly, null, 2));

  return {
    viewerPath,
    assemblyPath,
    partCount: parts.length,
    triangleCount: parts.reduce((sum, part) => sum + part.triangleCount, 0),
    assembly,
  };
}

function walkNode(
  node: OcctNode,
  meshes: OcctMesh[],
  ctx: {
    document: Document;
    buffer: ReturnType<Document["createBuffer"]>;
    parts: AssemblyPart[];
    counters: { node: number; part: number };
  },
): { gltf: ReturnType<Document["createNode"]>; tree: AssemblyNode } {
  const name = node.name?.trim() || "Gruppo";
  const tree: AssemblyNode = {
    id: `n${ctx.counters.node++}`,
    name,
    partId: null,
    children: [],
  };
  const gltf = ctx.document.createNode(name);

  for (const meshIndex of node.meshes ?? []) {
    const mesh = meshes[meshIndex];
    if (!mesh) continue;
    const part = addMesh(mesh, ctx);
    tree.children.push({
      id: `n${ctx.counters.node++}`,
      name: part.name,
      partId: part.id,
      children: [],
    });
    gltf.addChild(part.node);
  }

  for (const child of node.children ?? []) {
    const walked = walkNode(child, meshes, ctx);
    tree.children.push(walked.tree);
    gltf.addChild(walked.gltf);
  }

  if (tree.children.length === 1 && tree.children[0].partId && tree.partId == null) {
    tree.partId = tree.children[0].partId;
  }

  return { gltf, tree };
}

function addMesh(
  mesh: OcctMesh,
  ctx: {
    document: Document;
    buffer: ReturnType<Document["createBuffer"]>;
    parts: AssemblyPart[];
    counters: { node: number; part: number };
  },
) {
  const partId = `p${ctx.counters.part++}`;
  const name = mesh.name?.trim() || `Parte ${ctx.counters.part}`;
  const color = mesh.color ?? DEFAULT_COLOR;
  const positions = new Float32Array(mesh.attributes.position.array);
  const indices = new Uint32Array(mesh.index.array);
  const triangleCount = Math.floor(indices.length / 3);

  const position = ctx.document
    .createAccessor(`${partId}_pos`)
    .setType("VEC3")
    .setArray(positions)
    .setBuffer(ctx.buffer);
  const index = ctx.document
    .createAccessor(`${partId}_idx`)
    .setType("SCALAR")
    .setArray(indices)
    .setBuffer(ctx.buffer);
  const material = ctx.document
    .createMaterial(name)
    .setBaseColorFactor([color[0], color[1], color[2], 1])
    .setMetallicFactor(0.15)
    .setRoughnessFactor(0.55);
  const primitive = ctx.document
    .createPrimitive()
    .setAttribute("POSITION", position)
    .setIndices(index)
    .setMaterial(material);

  if (mesh.attributes.normal?.array?.length) {
    primitive.setAttribute(
      "NORMAL",
      ctx.document
        .createAccessor(`${partId}_nrm`)
        .setType("VEC3")
        .setArray(new Float32Array(mesh.attributes.normal.array))
        .setBuffer(ctx.buffer),
    );
  }

  const gltfMesh = ctx.document.createMesh(name).addPrimitive(primitive);
  gltfMesh.setExtras({ siderioPartId: partId });
  const node = ctx.document.createNode(name).setMesh(gltfMesh);
  node.setExtras({ siderioPartId: partId });
  ctx.parts.push({ id: partId, name, triangleCount, color });
  return { id: partId, name, node };
}

function sanitizeFileName(name: string): string {
  const base = name.replace(/[/\\?%*:|"<>]/g, "_").trim() || "modello.stp";
  return base;
}
