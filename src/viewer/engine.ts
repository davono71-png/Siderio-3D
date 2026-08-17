import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { AssemblyNode, AssemblyPart, AssemblyTree, CameraPose, PartMaterial } from "../../shared/types";
import {
  catalogToPartMaterial,
  getMaterial,
  isGlassMaterial,
  isMaterialId,
  isTransparent,
  parsePartMaterial,
  partWeightKg,
  resolveCatalogMaterial,
  type MaterialId,
} from "../../shared/material";
import { type StandardView } from "../../shared/view";
import { orbitDepth, pointOnViewAxis } from "../../shared/orbitPivot";
import { isCrossingSelect, normalizeRect, partHitsWindow, type ScreenRect } from "../../shared/selectWindow";
import { SectionTool, type SectionPhase } from "./sectionTool";
import { ViewCubeWidget, type CubeCommand } from "./viewCube";

export type { SectionPhase };

export type PartMeasure = {
  ids: string[];
  names: string[];
  multi: boolean;
  size: { x: number; y: number; z: number } | null;
  material: string | null;
  materialId: MaterialId | null;
  weightKg: number | null;
};

export type MousePreset = "siderio" | "cad";
export type { StandardView };

type PartEntry = {
  id: string;
  name: string;
  meshes: THREE.Mesh[];
  restPositions: THREE.Vector3[];
  explodeDirs: THREE.Vector3[];
  materials: THREE.MeshStandardMaterial[];
  baseColors: THREE.Color[];
  glass: boolean;
  materialName: string | null;
  materialId: MaterialId | null;
  density: number | null;
};

const GLASS_COLOR = new THREE.Color(0x7ad48a);
const SELECT_YELLOW = new THREE.Color(0xffe14a);
const SELECT_EMISSIVE = new THREE.Color(0xffcc33);

export class SiderioEngine {
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  private readonly persp: THREE.PerspectiveCamera;
  private readonly ortho: THREE.OrthographicCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly controls: OrbitControls;
  private readonly root = new THREE.Group();
  private readonly loader = new GLTFLoader();
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly clock = new THREE.Clock();
  private parts = new Map<string, PartEntry>();
  private partByMesh = new Map<THREE.Mesh, string>();
  private selectedIds = new Set<string>();
  private selectionLabel: string | null = null;
  private selectionMulti = false;
  private hidden = new Set<string>();
  private isolated = new Set<string>();
  private visibleNames: string[] | null = null;
  private explode = 0;
  private modelCenter = new THREE.Vector3();
  private modelSize = 1;
  private disposed = false;
  private pointerDown: { x: number; y: number; button: number; ctrl: boolean; empty: boolean } | null = null;
  private lastPointer = { x: 0, y: 0 };
  private mmbDown = false;
  private windowZoom = false;
  private zoomRectEl: HTMLDivElement | null = null;
  private readonly resizeObserver: ResizeObserver;
  private readonly viewCube: ViewCubeWidget | null = null;
  private readonly cubeHost: HTMLDivElement | null = null;
  private readonly section: SectionTool;
  private readonly materialSides = new Map<THREE.Material, THREE.Side>();
  onSelectionChange: ((ids: string[], parts: AssemblyPart[]) => void) | null = null;
  onWindowZoomChange: ((active: boolean) => void) | null = null;
  onSectionChange: ((phase: SectionPhase) => void) | null = null;
  private assemblyParts: AssemblyPart[] = [];

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = false;
    this.renderer.sortObjects = true;
    this.renderer.localClippingEnabled = true;
    this.renderer.clippingPlanes = [];

    this.persp = new THREE.PerspectiveCamera(45, 1, 0.1, 100000);
    this.persp.up.set(0, 0, 1);
    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100000);
    this.ortho.up.set(0, 0, 1);
    this.camera = this.persp;

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = true;
    this.controls.zoomToCursor = true;
    this.controls.minZoom = 0.05;
    this.controls.maxZoom = 80;
    this.applyCadMouse();
    this.controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };

    this.scene.background = new THREE.Color(0xc5c8cc);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const hemi = new THREE.HemisphereLight(0xf4f6f8, 0x7a7e84, 0.75);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 1.05);
    key.position.set(0.6, -1, 0.85);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xb9c7d6, 0.35);
    fill.position.set(-0.8, 0.4, 0.3);
    this.scene.add(fill);
    this.scene.add(this.root);

    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("resize", this.resize);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    const parent = canvas.parentElement;
    if (parent) {
      this.resizeObserver.observe(parent);
      this.cubeHost = document.createElement("div");
      this.cubeHost.className = "view-cube-host";
      parent.appendChild(this.cubeHost);
      this.viewCube = new ViewCubeWidget(this.cubeHost, () => this.camera, (command) => this.handleCubeCommand(command));
    }
    this.section = new SectionTool(
      () => this.camera,
      () => [...this.partByMesh.keys()].filter((mesh) => mesh.visible),
      () => this.modelSize,
    );
    this.section.onPhase = (phase) => {
      this.canvas.style.cursor = this.windowZoom ? "crosshair" : this.section.cursor();
      this.onSectionChange?.(phase);
    };
    this.section.onClip = (plane) => this.applyClip(plane);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    this.resize();
    this.tick();
  }

  setMousePreset(preset: MousePreset): void {
    if (preset === "cad") this.applyCadMouse();
    else {
      this.controls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.PAN,
        RIGHT: THREE.MOUSE.PAN,
      };
    }
  }

  setWindowZoom(active: boolean): void {
    this.windowZoom = active;
    if (active && this.section.isWizard()) this.section.cancelWizard();
    this.canvas.style.cursor = active ? "crosshair" : this.section.cursor();
    if (!active) this.clearZoomRect();
    this.onWindowZoomChange?.(active);
  }

  isOrthographic(): boolean {
    return this.camera === this.ortho;
  }

  toggleProjection(): void {
    const target = this.controls.target.clone();
    const pos = this.camera.position.clone();
    const up = this.camera.up.clone();
    const dir = pos.clone().sub(target);
    if (dir.lengthSq() < 1e-8) dir.set(0.72, -0.86, 0.62);
    dir.normalize();
    const dist = Math.max(pos.distanceTo(target), 1);
    if (this.camera === this.persp) {
      const halfH = Math.tan(THREE.MathUtils.degToRad(this.persp.fov / 2)) * dist;
      this.syncOrthoFrustum();
      this.ortho.zoom = THREE.MathUtils.clamp(this.ortho.top / Math.max(halfH, 1e-6), 0.05, 80);
      this.ortho.near = this.persp.near;
      this.ortho.far = this.persp.far;
      this.ortho.position.copy(pos);
      this.ortho.up.copy(up);
      this.ortho.lookAt(target);
      this.ortho.updateProjectionMatrix();
      this.camera = this.ortho;
    } else {
      const halfH = this.ortho.top / Math.max(this.ortho.zoom, 1e-6);
      const nextDist = halfH / Math.tan(THREE.MathUtils.degToRad(this.persp.fov / 2));
      this.persp.near = this.ortho.near;
      this.persp.far = this.ortho.far;
      this.persp.position.copy(target).addScaledVector(dir, nextDist);
      this.persp.up.copy(up);
      this.persp.lookAt(target);
      this.persp.updateProjectionMatrix();
      this.camera = this.persp;
    }
    this.controls.object = this.camera;
    this.controls.target.copy(target);
    this.controls.update();
    this.viewCube?.setOrthographic(this.camera === this.ortho);
  }

  toggleSection(): void {
    if (this.windowZoom) this.setWindowZoom(false);
    this.section.toggle();
    this.canvas.style.cursor = this.section.cursor();
  }

  sectionPhase(): SectionPhase {
    return this.section.phase;
  }

  clearSection(): void {
    this.section.clear();
    this.canvas.style.cursor = this.windowZoom ? "crosshair" : "";
  }

  isWindowZoom(): boolean {
    return this.windowZoom;
  }

  async load(glbUrl: string, assembly: AssemblyTree): Promise<void> {
    this.clearModel();
    this.assemblyParts = assembly.parts.map((part) => ({
      ...part,
      material: parsePartMaterial(part.material),
    }));
    const gltf = await this.loader.loadAsync(glbUrl);
    this.root.add(gltf.scene);
    this.collectParts(gltf.scene);
    this.computeExplode();
    this.resize();
    this.fit();
  }

  getSelectedIds(): string[] {
    return [...this.selectedIds];
  }

  setPartsMaterial(ids: string[], materialId: MaterialId): void {
    const spec = catalogToPartMaterial(getMaterial(materialId));
    for (const id of ids) {
      const entry = this.parts.get(id);
      if (entry) {
        entry.materialId = spec.id ?? materialId;
        entry.materialName = spec.name;
        entry.density = spec.density;
        entry.glass = isGlassMaterial(spec.name);
        entry.materials.forEach((material) => applyLook(material, spec));
        entry.baseColors = entry.materials.map((material) => material.color.clone());
      }
      const part = this.assemblyParts.find((item) => item.id === id);
      if (part) part.material = spec;
    }
    this.refreshMaterials();
    this.emitSelection();
  }

  select(partId: string | null, additive = false): void {
    if (!additive) this.selectedIds.clear();
    if (partId) {
      if (additive && this.selectedIds.has(partId)) this.selectedIds.delete(partId);
      else this.selectedIds.add(partId);
    }
    const label = partId ? (this.parts.get(partId)?.name ?? partId) : null;
    this.markSelection(additive, label);
    this.refreshMaterials();
    this.emitSelection();
  }

  selectMany(ids: string[], additive = false): void {
    if (!additive) this.selectedIds.clear();
    for (const id of ids) this.selectedIds.add(id);
    this.selectionMulti = this.selectedIds.size > 1;
    this.selectionLabel =
      this.selectionMulti || this.selectedIds.size === 0
        ? null
        : (this.parts.get([...this.selectedIds][0] ?? "")?.name ?? null);
    this.refreshMaterials();
    this.emitSelection();
  }

  selectTreeNode(node: AssemblyNode, additive = false): void {
    const ids = collectRenderableIds(node, this.parts);
    if (!ids.length) return;
    if (!additive) this.selectedIds.clear();
    for (const id of ids) this.selectedIds.add(id);
    this.markSelection(additive, node.name);
    this.refreshMaterials();
    this.emitSelection();
  }

  isolate(): void {
    if (!this.selectedIds.size) return;
    this.isolated = new Set(this.selectedIds);
    this.applyVisibility();
    this.fit(true);
  }

  hideSelected(): void {
    if (!this.selectedIds.size) return;
    for (const id of this.selectedIds) this.hidden.add(id);
    this.isolated.clear();
    this.selectedIds.clear();
    this.selectionLabel = null;
    this.selectionMulti = false;
    this.applyVisibility();
    this.emitSelection();
  }

  showAll(): void {
    this.hidden.clear();
    this.isolated.clear();
    this.visibleNames = null;
    this.setExplode(0);
    this.applyVisibility();
    this.fit();
  }

  fit(selectionOnly = false): void {
    const box = new THREE.Box3();
    this.root.updateWorldMatrix(true, true);
    if (selectionOnly && this.selectedIds.size) {
      for (const id of this.selectedIds) {
        this.parts.get(id)?.meshes.forEach((mesh) => {
          if (mesh.visible) box.expandByObject(mesh);
        });
      }
    } else {
      for (const entry of this.parts.values()) {
        entry.meshes.forEach((mesh) => {
          if (mesh.visible) box.expandByObject(mesh);
        });
      }
      if (box.isEmpty()) box.setFromObject(this.root);
    }
    if (box.isEmpty()) return;
    this.applyBoxFit(box);
  }

  setView(view: StandardView): void {
    const dirs: Record<StandardView, THREE.Vector3> = {
      iso: new THREE.Vector3(1, -1.15, 0.85),
      front: new THREE.Vector3(0, -1, 0),
      back: new THREE.Vector3(0, 1, 0),
      left: new THREE.Vector3(-1, 0, 0),
      right: new THREE.Vector3(1, 0, 0),
      top: new THREE.Vector3(0, 0, 1),
      bottom: new THREE.Vector3(0, 0, -1),
    };
    this.lookAlong(dirs[view]);
  }

  lookAlong(direction: THREE.Vector3): void {
    const box = visibleBox(this.parts);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = Math.max(box.getSize(new THREE.Vector3()).length(), 1);
    const dir = direction.clone().normalize();
    this.camera.up.set(0, 0, 1);
    if (Math.abs(dir.z) > 0.92) this.camera.up.set(0, -1, 0);
    this.camera.position.copy(center).add(dir.multiplyScalar(size * 1.25));
    this.controls.target.copy(center);
    this.controls.update();
  }

  rotateView90(degrees: number): void {
    const axis = new THREE.Vector3(0, 0, 1);
    const rad = THREE.MathUtils.degToRad(degrees);
    const offset = this.camera.position.clone().sub(this.controls.target);
    offset.applyAxisAngle(axis, rad);
    this.camera.position.copy(this.controls.target).add(offset);
    this.camera.up.applyAxisAngle(axis, rad).normalize();
    this.controls.update();
  }

  private handleCubeCommand(command: CubeCommand): void {
    if (command.kind === "face") this.setView(command.view);
    else if (command.kind === "dir") this.lookAlong(command.dir);
    else if (command.kind === "rotate") this.rotateView90(command.degrees);
    else if (command.kind === "projection") this.toggleProjection();
    else this.setView("iso");
  }

  setExplode(value: number): void {
    this.explode = value;
    const scale = this.modelSize * 0.55 * value;
    for (const entry of this.parts.values()) {
      entry.meshes.forEach((mesh, index) => {
        mesh.position.copy(entry.restPositions[index]).addScaledVector(entry.explodeDirs[index], scale);
      });
    }
  }

  getExplode(): number {
    return this.explode;
  }

  captureDisplayConfig(): { visibleNames: string[]; explode: number } {
    const names: string[] = [];
    let total = 0;
    for (const entry of this.parts.values()) {
      total += 1;
      if (entry.meshes.some((mesh) => mesh.visible)) names.push(entry.name);
    }
    return { visibleNames: names.length === total ? [] : names, explode: this.explode };
  }

  captureCamera(): CameraPose {
    return {
      position: this.camera.position.toArray() as [number, number, number],
      target: this.controls.target.toArray() as [number, number, number],
      up: this.camera.up.toArray() as [number, number, number],
      ortho: this.camera === this.ortho,
      zoom: this.ortho.zoom,
    };
  }

  applyCamera(pose: CameraPose): void {
    const target = new THREE.Vector3(...pose.target);
    if (pose.ortho) {
      this.syncOrthoFrustum();
      this.ortho.zoom = THREE.MathUtils.clamp(pose.zoom || 1, 0.05, 80);
      this.ortho.position.fromArray(pose.position);
      this.ortho.up.fromArray(pose.up);
      this.ortho.lookAt(target);
      this.ortho.updateProjectionMatrix();
      this.camera = this.ortho;
    } else {
      this.persp.position.fromArray(pose.position);
      this.persp.up.fromArray(pose.up);
      this.persp.lookAt(target);
      this.persp.updateProjectionMatrix();
      this.camera = this.persp;
    }
    this.controls.object = this.camera;
    this.controls.target.copy(target);
    this.controls.update();
    this.viewCube?.setOrthographic(this.camera === this.ortho);
  }

  measureSelection(): PartMeasure {
    const ids = [...this.selectedIds];
    const names =
      this.selectionLabel && !this.selectionMulti
        ? [this.selectionLabel]
        : ids.map((id) => this.parts.get(id)?.name ?? id);
    if (!ids.length) {
      return { ids, names, multi: false, size: null, material: null, materialId: null, weightKg: null };
    }
    const box = new THREE.Box3();
    let weight = 0;
    let weighed = false;
    const materials = new Set<string>();
    const materialIds = new Set<MaterialId>();
    for (const id of ids) {
      const entry = this.parts.get(id);
      if (!entry) continue;
      if (entry.materialName) materials.add(entry.materialName);
      if (entry.materialId) materialIds.add(entry.materialId);
      const spec = this.assemblyParts.find((item) => item.id === id)?.material ?? null;
      entry.meshes.forEach((mesh) => {
        if (!mesh.visible) return;
        box.expandByObject(mesh);
        const vol = meshVolume(mesh);
        const partKg = partWeightKg(vol, spec ?? (entry.materialId ? catalogToPartMaterial(getMaterial(entry.materialId)) : null));
        if (partKg != null) {
          weight += partKg;
          weighed = true;
        }
      });
    }
    const size = box.isEmpty() ? null : box.getSize(new THREE.Vector3());
    return {
      ids,
      names,
      multi: this.selectionMulti,
      size: size ? { x: size.x, y: size.y, z: size.z } : null,
      material: materials.size === 1 ? [...materials][0] : materials.size > 1 ? "Vari" : null,
      materialId: materialIds.size === 1 ? [...materialIds][0] : null,
      weightKg: weighed ? weight : null,
    };
  }

  applyViewPreset(isolatePartIds: string[], explode: number, visibleNames: string[] = []): void {
    this.hidden.clear();
    this.isolated.clear();
    this.visibleNames = visibleNames.length ? visibleNames.map((name) => name.toLowerCase()) : null;
    if (!this.visibleNames && isolatePartIds[0]) this.isolated = new Set(isolatePartIds);
    this.setExplode(explode);
    this.applyVisibility();
    this.fit(this.isolated.size > 0);
  }

  dispose(): void {
    this.disposed = true;
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.section.dispose();
    this.viewCube?.dispose();
    this.cubeHost?.remove();
    this.clearZoomRect();
    this.controls.dispose();
    this.clearModel();
    this.renderer.dispose();
  }

  private applyCadMouse(): void {
    this.controls.mouseButtons = {
      LEFT: -1 as THREE.MOUSE,
      MIDDLE: THREE.MOUSE.ROTATE,
      RIGHT: THREE.MOUSE.PAN,
    };
    this.controls.enableRotate = true;
    this.controls.enablePan = true;
  }

  private markSelection(additive: boolean, label: string | null): void {
    if (!additive) {
      this.selectionMulti = false;
      this.selectionLabel = label;
      return;
    }
    this.selectionMulti = this.selectedIds.size > 1;
    if (this.selectionMulti) this.selectionLabel = null;
    else if (label) this.selectionLabel = label;
  }

  private emitSelection(): void {
    const ids = [...this.selectedIds];
    const parts = ids.map((id) => {
      const fromAsm = this.assemblyParts.find((item) => item.id === id);
      if (fromAsm) return fromAsm;
      const entry = this.parts.get(id);
      const byName = entry
        ? this.assemblyParts.find((item) => item.name.toLowerCase() === entry.name.toLowerCase())
        : undefined;
      if (byName) return byName;
      return {
        id,
        name: entry?.name ?? id,
        triangleCount: 0,
        color: [1, 0.88, 0.29] as [number, number, number],
      };
    });
    this.onSelectionChange?.(ids, parts);
  }

  private applyBoxFit(box: THREE.Box3): void {
    const size = box.getSize(new THREE.Vector3()).length();
    const center = box.getCenter(new THREE.Vector3());
    this.modelCenter.copy(center);
    this.modelSize = Math.max(size, 1);
    const distance = size * 1.15;
    this.persp.near = Math.max(distance / 1000, 0.01);
    this.persp.far = distance * 100;
    this.persp.updateProjectionMatrix();
    this.ortho.near = this.persp.near;
    this.ortho.far = this.persp.far;
    this.syncOrthoFrustum();
    this.ortho.zoom = 1;
    this.ortho.updateProjectionMatrix();
    const offset = this.camera.position.clone().sub(this.controls.target);
    if (offset.lengthSq() < 1e-8) offset.set(0.72, -0.86, 0.62);
    this.camera.position.copy(center).add(offset.normalize().multiplyScalar(distance));
    this.controls.target.copy(center);
    this.controls.minDistance = size * 0.05;
    this.controls.maxDistance = size * 20;
    this.controls.update();
  }

  private clearModel(): void {
    this.root.clear();
    this.parts.clear();
    this.partByMesh.clear();
    this.hidden.clear();
    this.isolated.clear();
    this.visibleNames = null;
    this.selectedIds.clear();
    this.selectionLabel = null;
    this.selectionMulti = false;
    this.explode = 0;
    if (!this.disposed) this.section.clear();
  }

  private collectParts(object: THREE.Object3D): void {
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || child.userData.siderioEdge) return;
      const partId = findPartId(child) ?? child.name ?? `mesh-${this.parts.size}`;
      const specPart = resolveAssemblyPart(this.assemblyParts, partId, child.name);
      const assemblyName = specPart?.name ?? child.name ?? partId;
      const spec = specPart?.material ?? null;
      child.castShadow = false;
      const glass = isGlassMaterial(spec?.name);
      const materials = (Array.isArray(child.material) ? child.material : [child.material]).map((material) => {
        const next =
          material instanceof THREE.MeshStandardMaterial
            ? material
            : new THREE.MeshStandardMaterial({ color: 0xb8bec6 });
        if (!(material instanceof THREE.MeshStandardMaterial)) child.material = next;
        applyLook(next, spec);
        return next;
      });
      const baseColors = materials.map((material) => material.color.clone());
      addWireframe(child);
      const existing = this.parts.get(partId);
      if (existing) {
        existing.meshes.push(child);
        existing.materials.push(...materials);
        existing.baseColors.push(...baseColors);
      } else {
        this.parts.set(partId, {
          id: partId,
          name: assemblyName,
          meshes: [child],
          restPositions: [],
          explodeDirs: [],
          materials,
          baseColors,
          glass,
          materialName: spec?.name?.trim() || null,
          materialId: spec?.id && isMaterialId(spec.id) ? spec.id : null,
          density: spec?.density ?? null,
        });
      }
      this.partByMesh.set(child, partId);
    });
  }

  private computeExplode(): void {
    const box = new THREE.Box3().setFromObject(this.root);
    const center = box.getCenter(new THREE.Vector3());
    this.modelCenter.copy(center);
    this.modelSize = Math.max(box.getSize(new THREE.Vector3()).length(), 1);
    for (const entry of this.parts.values()) {
      entry.restPositions = entry.meshes.map((mesh) => mesh.position.clone());
      entry.explodeDirs = entry.meshes.map((mesh) => {
        const partBox = new THREE.Box3().setFromObject(mesh);
        const partCenter = partBox.getCenter(new THREE.Vector3());
        const dir = partCenter.sub(center);
        if (dir.lengthSq() < 1e-8) dir.set(0, 0, 1);
        return dir.normalize();
      });
    }
  }

  private applyVisibility(): void {
    for (const [id, entry] of this.parts) {
      const inConfig = !this.visibleNames || nameMatches(entry.name, this.visibleNames);
      const isolated = this.isolated.size === 0 || this.isolated.has(id);
      const visible = isolated && inConfig && !this.hidden.has(id);
      entry.meshes.forEach((mesh) => {
        mesh.visible = visible;
      });
    }
    this.refreshMaterials();
  }

  private refreshMaterials(): void {
    for (const [id, entry] of this.parts) {
      const selected = this.selectedIds.has(id);
      entry.materials.forEach((material, index) => {
        const base = entry.baseColors[index] ?? material.color;
        if (selected) {
          material.color.copy(base).lerp(SELECT_YELLOW, entry.glass ? 0.55 : 0.72);
          material.emissive.copy(SELECT_EMISSIVE);
          material.emissiveIntensity = 0.95;
        } else {
          material.color.copy(base);
          material.emissive.setHex(0x000000);
          material.emissiveIntensity = 0;
        }
      });
      entry.meshes.forEach((mesh) => {
        const edges = mesh.getObjectByName("siderio-edges");
        if (edges instanceof THREE.LineSegments && edges.material instanceof THREE.LineBasicMaterial) {
          edges.material.color.setHex(selected ? 0xfff176 : 0x0f1216);
        }
      });
    }
  }

  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Control" || event.key === "Meta") {
      if (!event.repeat) this.switchOrbitModifier(true);
      return;
    }
    if (event.key !== "Escape") return;
    if (this.section.isWizard()) this.section.cancelWizard();
    else if (this.section.phase === "clipped") this.section.clear();
    this.canvas.style.cursor = this.windowZoom ? "crosshair" : this.section.cursor();
  };

  private readonly onKeyUp = (event: KeyboardEvent) => {
    if (event.key !== "Control" && event.key !== "Meta") return;
    if (event.ctrlKey || event.metaKey) return;
    this.switchOrbitModifier(false);
  };

  private switchOrbitModifier(pan: boolean): void {
    if (!this.mmbDown) return;
    const orbit = this.controls as OrbitControls & {
      state: number;
      _handleMouseDownPan: (event: { clientX: number; clientY: number }) => void;
      _handleMouseDownRotate: (event: { clientX: number; clientY: number }) => void;
    };
    const pos = { clientX: this.lastPointer.x, clientY: this.lastPointer.y };
    const rotate = 0;
    const panState = 2;
    if (pan && orbit.state === rotate) {
      orbit._handleMouseDownPan(pos);
      orbit.state = panState;
    } else if (!pan && orbit.state === panState) {
      orbit._handleMouseDownRotate(pos);
      orbit.state = rotate;
    }
  }

  private applyClip(plane: THREE.Plane | null): void {
    this.renderer.clippingPlanes = plane ? [plane] : [];
    const on = plane != null;
    for (const entry of this.parts.values()) {
      for (const material of entry.materials) {
        if (on) {
          if (!this.materialSides.has(material)) this.materialSides.set(material, material.side);
          material.side = THREE.DoubleSide;
        } else {
          const prev = this.materialSides.get(material);
          if (prev != null) material.side = prev;
        }
      }
    }
    if (!on) this.materialSides.clear();
  }

  private syncOrthoFrustum(): void {
    const parent = this.canvas.parentElement;
    const width = Math.max(parent?.clientWidth ?? this.canvas.clientWidth, 1);
    const height = Math.max(parent?.clientHeight ?? this.canvas.clientHeight, 1);
    const half = Math.max(this.modelSize * 0.35, 1);
    this.ortho.left = -half * (width / height);
    this.ortho.right = half * (width / height);
    this.ortho.top = half;
    this.ortho.bottom = -half;
  }

  private readonly onPointerDown = (event: PointerEvent) => {
    this.lastPointer = { x: event.clientX, y: event.clientY };
    const empty =
      event.button === 0 && !this.windowZoom && !this.section.isWizard() ? !this.hitPartAt(event.clientX, event.clientY) : false;
    this.pointerDown = {
      x: event.clientX,
      y: event.clientY,
      button: event.button,
      ctrl: event.ctrlKey || event.metaKey,
      empty,
    };
    if (event.button === 1) this.mmbDown = true;
    if (event.button === 1) this.anchorOrbitToModel(event);
    if (this.windowZoom && event.button === 0 && !this.section.isWizard()) {
      this.ensureZoomRect("zoom");
      this.updateZoomRect(event.clientX, event.clientY, event.clientX, event.clientY);
    }
    if (event.button === 0) {
      try {
        this.canvas.setPointerCapture(event.pointerId);
      } catch {
        /* capture non disponibile */
      }
    }
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    this.lastPointer = { x: event.clientX, y: event.clientY };
    if (this.section.isWizard()) {
      this.section.handleMove(event, this.canvas);
      return;
    }
    if (!this.pointerDown || this.pointerDown.button !== 0) return;
    const dx = event.clientX - this.pointerDown.x;
    const dy = event.clientY - this.pointerDown.y;
    if (this.windowZoom) {
      this.updateZoomRect(this.pointerDown.x, this.pointerDown.y, event.clientX, event.clientY);
      return;
    }
    if (!this.pointerDown.empty || dx * dx + dy * dy < 36) return;
    this.ensureZoomRect(isCrossingSelect(this.pointerDown.x, event.clientX) ? "crossing" : "window");
    this.updateZoomRect(this.pointerDown.x, this.pointerDown.y, event.clientX, event.clientY);
  };

  private readonly onPointerUp = (event: PointerEvent) => {
    this.lastPointer = { x: event.clientX, y: event.clientY };
    if (event.button === 1) this.mmbDown = false;
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    if (!this.pointerDown) return;
    const start = this.pointerDown;
    this.pointerDown = null;
    if (event.button !== 0) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;

    if (this.section.isWizard()) {
      if (this.section.phase === "pickFace" && dx * dx + dy * dy > 16) return;
      this.section.handleClick(event, this.canvas);
      return;
    }

    if (this.windowZoom) {
      if (dx * dx + dy * dy > 36) this.zoomToScreenRect(start.x, start.y, event.clientX, event.clientY);
      this.clearZoomRect();
      this.setWindowZoom(false);
      return;
    }

    if (start.empty && dx * dx + dy * dy > 36) {
      this.selectByScreenRect(start.x, start.y, event.clientX, event.clientY, start.ctrl);
      this.clearZoomRect();
      return;
    }
    this.clearZoomRect();

    if (dx * dx + dy * dy > 16) return;
    const hit = this.hitPartAt(event.clientX, event.clientY);
    if (hit) this.select(hit, start.ctrl);
    else if (!start.ctrl) this.select(null);
  };

  private zoomToScreenRect(x0: number, y0: number, x1: number, y1: number): void {
    const rect = this.canvas.getBoundingClientRect();
    const left = Math.min(x0, x1);
    const right = Math.max(x0, x1);
    const top = Math.min(y0, y1);
    const bottom = Math.max(y0, y1);
    if (right - left < 8 || bottom - top < 8) return;
    const ndc = (x: number, y: number) =>
      new THREE.Vector2(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
      this.camera.getWorldDirection(new THREE.Vector3()),
      this.controls.target,
    );
    const corners = [ndc(left, top), ndc(right, top), ndc(right, bottom), ndc(left, bottom)];
    const points: THREE.Vector3[] = [];
    for (const corner of corners) {
      this.raycaster.setFromCamera(corner, this.camera);
      const point = new THREE.Vector3();
      this.raycaster.ray.intersectPlane(plane, point);
      if (point) points.push(point.clone());
    }
    if (points.length < 4) return;
    const box = new THREE.Box3().setFromPoints(points);
    this.applyBoxFit(box);
  }

  private hitPartAt(clientX: number, clientY: number): string | null {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(
      [...this.partByMesh.keys()].filter((mesh) => mesh.visible),
      false,
    );
    const hit = hits[0]?.object;
    return hit instanceof THREE.Mesh ? (this.partByMesh.get(hit) ?? null) : null;
  }

  private selectByScreenRect(x0: number, y0: number, x1: number, y1: number, additive: boolean): void {
    const window = normalizeRect(x0, y0, x1, y1);
    if (window.right - window.left < 8 || window.bottom - window.top < 8) return;
    const crossing = isCrossingSelect(x0, x1);
    const canvasRect = this.canvas.getBoundingClientRect();
    this.camera.updateMatrixWorld();
    const ids: string[] = [];
    for (const [id, entry] of this.parts) {
      const screen = projectPartToScreen(entry, this.camera, canvasRect);
      if (screen && partHitsWindow(screen, window, crossing)) ids.push(id);
    }
    this.selectMany(ids, additive);
  }

  private ensureZoomRect(kind: "zoom" | "crossing" | "window" = "zoom"): void {
    if (!this.zoomRectEl) {
      const parent = this.canvas.parentElement;
      if (!parent) return;
      const el = document.createElement("div");
      parent.appendChild(el);
      this.zoomRectEl = el;
    }
    this.zoomRectEl.className = kind === "zoom" ? "zoom-rect" : `sel-rect ${kind}`;
  }

  private updateZoomRect(x0: number, y0: number, x1: number, y1: number): void {
    if (!this.zoomRectEl) return;
    const parent = this.canvas.parentElement?.getBoundingClientRect();
    if (!parent) return;
    const left = Math.min(x0, x1) - parent.left;
    const top = Math.min(y0, y1) - parent.top;
    this.zoomRectEl.style.left = `${left}px`;
    this.zoomRectEl.style.top = `${top}px`;
    this.zoomRectEl.style.width = `${Math.abs(x1 - x0)}px`;
    this.zoomRectEl.style.height = `${Math.abs(y1 - y0)}px`;
  }

  private clearZoomRect(): void {
    this.zoomRectEl?.remove();
    this.zoomRectEl = null;
  }

  /** Centro di tilt sul pezzo, alla profondità sotto il cursore, sull'asse di vista (niente sfera enorme). */
  private anchorOrbitToModel(event: PointerEvent): void {
    this.camera.updateMatrixWorld();
    const ndc = this.ndcFromClient(event.clientX, event.clientY);
    this.raycaster.setFromCamera(ndc, this.camera);
    const view = this.camera.getWorldDirection(new THREE.Vector3());
    const box = visibleBox(this.parts);
    const center = box.isEmpty() ? this.modelCenter.clone() : box.getCenter(new THREE.Vector3());
    const radius = box.isEmpty()
      ? Math.max(this.modelSize * 0.5, 1)
      : Math.max(box.getSize(new THREE.Vector3()).length() * 0.5, 1);
    const camToCenter = this.camera.position.distanceTo(center);
    const hitDepth = this.orbitHitDepth(box, view);
    const depth = orbitDepth(hitDepth, camToCenter, radius);
    const pivot = pointOnViewAxis(this.camera.position, view, depth);
    this.controls.target.set(pivot.x, pivot.y, pivot.z);
    this.controls.minDistance = radius * 0.05;
    this.controls.maxDistance = Math.max(radius * 8, camToCenter * 2);
    this.controls.update();
  }

  private orbitHitDepth(box: THREE.Box3, view: THREE.Vector3): number | null {
    const cam = this.camera.position;
    const meshes = [...this.partByMesh.keys()].filter((mesh) => mesh.visible);
    const hit = this.raycaster.intersectObjects(meshes, false)[0];
    if (hit) return hit.point.clone().sub(cam).dot(view);
    if (!box.isEmpty()) {
      const point = new THREE.Vector3();
      if (this.raycaster.ray.intersectBox(box, point)) return point.sub(cam).dot(view);
    }
    return null;
  }

  private ndcFromClient(clientX: number, clientY: number): THREE.Vector2 {
    const rect = this.canvas.getBoundingClientRect();
    return new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
  }

  private readonly resize = () => {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const width = parent.clientWidth;
    const height = parent.clientHeight;
    if (width < 2 || height < 2) return;
    this.persp.aspect = width / height;
    this.persp.updateProjectionMatrix();
    this.syncOrthoFrustum();
    this.ortho.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  };

  private readonly tick = () => {
    if (this.disposed) return;
    requestAnimationFrame(this.tick);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.section.renderOverlay(this.renderer, this.camera);
    this.viewCube?.sync();
    this.clock.getDelta();
  };
}

const _volA = new THREE.Vector3();
const _volB = new THREE.Vector3();
const _volC = new THREE.Vector3();
const _volCross = new THREE.Vector3();

function meshVolume(mesh: THREE.Mesh): number {
  const geometry = mesh.geometry;
  const pos = geometry.getAttribute("position");
  if (!pos) return 0;
  mesh.updateWorldMatrix(true, false);
  const matrix = mesh.matrixWorld;
  const index = geometry.getIndex();
  const triCount = index ? Math.floor(index.count / 3) : Math.floor(pos.count / 3);
  let volume = 0;
  for (let i = 0; i < triCount; i++) {
    const ia = index ? index.getX(i * 3) : i * 3;
    const ib = index ? index.getX(i * 3 + 1) : i * 3 + 1;
    const ic = index ? index.getX(i * 3 + 2) : i * 3 + 2;
    _volA.fromBufferAttribute(pos, ia).applyMatrix4(matrix);
    _volB.fromBufferAttribute(pos, ib).applyMatrix4(matrix);
    _volC.fromBufferAttribute(pos, ic).applyMatrix4(matrix);
    volume += _volA.dot(_volCross.crossVectors(_volB, _volC)) / 6;
  }
  return Math.abs(volume);
}

function applyLook(material: THREE.MeshStandardMaterial, spec: PartMaterial | null): void {
  const catalog = resolveCatalogMaterial(spec?.id ?? spec?.name);
  if (catalog?.glass) {
    material.color.copy(GLASS_COLOR);
    material.transparent = true;
    material.opacity = 0.42;
    material.depthWrite = false;
    material.roughness = catalog.roughness;
    material.metalness = catalog.metalness;
    material.side = THREE.DoubleSide;
    return;
  }
  if (catalog) {
    material.color.setRGB(catalog.color[0], catalog.color[1], catalog.color[2]);
    material.transparent = false;
    material.opacity = 1;
    material.depthWrite = true;
    material.metalness = catalog.metalness;
    material.roughness = catalog.roughness;
    material.side = THREE.FrontSide;
    return;
  }
  if (spec?.color) {
    material.color.setRGB(spec.color[0], spec.color[1], spec.color[2]);
  }
  if (isTransparent(spec?.opacity)) {
    material.transparent = true;
    material.opacity = spec?.opacity ?? 0.4;
    material.depthWrite = false;
    material.roughness = 0.08;
    material.metalness = 0.05;
    material.side = THREE.DoubleSide;
    return;
  }
  material.transparent = false;
  material.opacity = 1;
  material.depthWrite = true;
  material.metalness = 0.18;
  material.roughness = 0.52;
}

function addWireframe(mesh: THREE.Mesh): void {
  if (mesh.getObjectByName("siderio-edges")) return;
  const edges = new THREE.EdgesGeometry(mesh.geometry, 18);
  const lines = new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({ color: 0x0f1216, transparent: false }),
  );
  lines.name = "siderio-edges";
  lines.userData.siderioEdge = true;
  mesh.add(lines);
}

function resolveAssemblyPart(parts: AssemblyPart[], partId: string, meshName: string): AssemblyPart | undefined {
  return (
    parts.find((part) => part.id === partId) ??
    parts.find((part) => nameMatches(part.name, [meshName]) || nameMatches(meshName, [part.name]))
  );
}

function collectRenderableIds(node: AssemblyNode, parts: Map<string, { id: string; name: string }>): string[] {
  const ids: string[] = [];
  const visit = (current: AssemblyNode) => {
    if (current.partId && parts.has(current.partId)) ids.push(current.partId);
    else {
      const found = [...parts.values()].find(
        (entry) =>
          nameMatches(entry.name, [current.name]) ||
          (current.partId ? nameMatches(entry.name, [current.partId]) : false),
      );
      if (found) ids.push(found.id);
    }
    for (const child of current.children) visit(child);
  };
  visit(node);
  return [...new Set(ids)];
}

function visibleBox(parts: Map<string, PartEntry>): THREE.Box3 {
  const box = new THREE.Box3();
  for (const entry of parts.values()) {
    entry.meshes.forEach((mesh) => {
      if (mesh.visible) box.expandByObject(mesh);
    });
  }
  return box;
}

const _proj = new THREE.Vector3();
const _view = new THREE.Vector3();

function projectPartToScreen(
  entry: PartEntry,
  camera: THREE.Camera,
  canvasRect: DOMRect,
): ScreenRect | null {
  const box = new THREE.Box3();
  let any = false;
  for (const mesh of entry.meshes) {
    if (!mesh.visible) continue;
    box.expandByObject(mesh);
    any = true;
  }
  if (!any || box.isEmpty()) return null;
  const xs = [box.min.x, box.max.x];
  const ys = [box.min.y, box.max.y];
  const zs = [box.min.z, box.max.z];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let seen = false;
  for (const x of xs) {
    for (const y of ys) {
      for (const z of zs) {
        _view.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
        if (_view.z >= -1e-4) continue;
        _proj.set(x, y, z).project(camera);
        const sx = canvasRect.left + (_proj.x * 0.5 + 0.5) * canvasRect.width;
        const sy = canvasRect.top + (-_proj.y * 0.5 + 0.5) * canvasRect.height;
        minX = Math.min(minX, sx);
        maxX = Math.max(maxX, sx);
        minY = Math.min(minY, sy);
        maxY = Math.max(maxY, sy);
        seen = true;
      }
    }
  }
  return seen ? { left: minX, top: minY, right: maxX, bottom: maxY } : null;
}

function nameMatches(partName: string, visibleNames: string[]): boolean {
  const name = partName.toLowerCase();
  const stem = name.replace(/\.(par|asm|psm):\d+$/i, "");
  return visibleNames.some((item) => {
    const key = item.toLowerCase();
    const keyStem = key.replace(/\.(par|asm|psm):\d+$/i, "");
    return name === key || name.includes(key) || key.includes(name) || stem === keyStem || stem.includes(keyStem);
  });
}

function findPartId(object: THREE.Object3D): string | null {
  let current: THREE.Object3D | null = object;
  while (current) {
    const extras = current.userData as { siderioPartId?: string };
    if (extras.siderioPartId) return extras.siderioPartId;
    current = current.parent;
  }
  return null;
}
