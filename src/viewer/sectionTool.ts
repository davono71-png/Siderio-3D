import * as THREE from "three";
import {
  boundarySegments,
  faceCentroid,
  faceNormal,
  faceSpan,
  growCoplanar,
  relativePositions,
  type Tri3,
} from "../../shared/planarFace";
import { keepSideClip, closestPointOnRay, dragPlaneNormal, offsetAlongNormal, rayHitPlane, sideSign } from "../../shared/section";

export type SectionPhase = "off" | "pickFace" | "dragPlane" | "pickSide" | "clipped";

const FILL = 0xd7a441;
const EDGE = 0xff9a3c;
const ARROW = 0xff5a1f;

export class SectionTool {
  phase: SectionPhase = "off";
  onPhase: ((phase: SectionPhase) => void) | null = null;
  onClip: ((plane: THREE.Plane | null) => void) | null = null;

  private readonly overlay = new THREE.Scene();
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly gizmo = new THREE.Group();
  private readonly patchMesh: THREE.Mesh;
  private readonly outline: THREE.LineSegments;
  private readonly arrow: THREE.ArrowHelper;
  private readonly clip = new THREE.Plane();
  private readonly triCache = new WeakMap<THREE.Mesh, Tri3[]>();
  private normal = new THREE.Vector3(0, 0, 1);
  private base = new THREE.Vector3();
  private origin = new THREE.Vector3();
  private offset = 0;
  private span = 1;
  private keep: 1 | -1 = 1;
  private lastClip: THREE.Plane | null = null;
  private hoverKey = "";

  constructor(
    private readonly getCamera: () => THREE.Camera,
    private readonly getMeshes: () => THREE.Mesh[],
    private readonly getModelSize: () => number,
  ) {
    this.patchMesh = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({
        color: FILL,
        transparent: true,
        opacity: 0.38,
        side: THREE.DoubleSide,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    );
    this.outline = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: EDGE, depthTest: false }),
    );
    this.gizmo.add(this.patchMesh, this.outline);
    this.gizmo.visible = false;
    this.overlay.add(this.gizmo);

    this.arrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(), 1, ARROW, 0.22, 0.14);
    this.arrow.visible = false;
    this.overlay.add(this.arrow);
  }

  isWizard(): boolean {
    return this.phase === "pickFace" || this.phase === "dragPlane" || this.phase === "pickSide";
  }

  isActive(): boolean {
    return this.phase !== "off";
  }

  toggle(): void {
    if (this.isWizard()) {
      this.cancelWizard();
      return;
    }
    if (this.phase === "clipped") {
      this.clear();
      return;
    }
    this.setPhase("pickFace");
  }

  cancelWizard(): void {
    this.hideHelpers();
    if (this.lastClip) {
      this.onClip?.(this.lastClip);
      this.setPhase("clipped");
    } else {
      this.onClip?.(null);
      this.setPhase("off");
    }
  }

  clear(): void {
    this.lastClip = null;
    this.hoverKey = "";
    this.hideHelpers();
    this.onClip?.(null);
    this.setPhase("off");
  }

  handleMove(event: PointerEvent, canvas: HTMLCanvasElement): void {
    if (this.phase === "off" || this.phase === "clipped") return;
    this.setPointer(event, canvas);
    this.aimRay();
    if (this.phase === "pickFace") this.hoverFace();
    else if (this.phase === "dragPlane") this.movePlane();
    else this.moveSide();
  }

  handleClick(event: PointerEvent, canvas: HTMLCanvasElement): boolean {
    if (!this.isWizard()) return false;
    this.setPointer(event, canvas);
    this.aimRay();
    if (this.phase === "pickFace") {
      const hit = this.hitFace();
      if (!hit) return true;
      this.beginDrag(hit);
      return true;
    }
    if (this.phase === "dragPlane") {
      this.setPhase("pickSide");
      this.arrow.visible = true;
      this.moveSide();
      return true;
    }
    this.commit();
    return true;
  }

  renderOverlay(renderer: THREE.WebGLRenderer, camera: THREE.Camera): void {
    if (!this.isWizard()) return;
    const planes = renderer.clippingPlanes;
    renderer.clippingPlanes = [];
    renderer.autoClear = false;
    renderer.render(this.overlay, camera);
    renderer.autoClear = true;
    renderer.clippingPlanes = planes;
  }

  cursor(): string {
    if (this.phase === "pickFace") return "cell";
    if (this.phase === "dragPlane") return "move";
    if (this.phase === "pickSide") return "pointer";
    return "";
  }

  dispose(): void {
    this.clear();
    this.overlay.clear();
    this.patchMesh.geometry.dispose();
    (this.patchMesh.material as THREE.Material).dispose();
    this.outline.geometry.dispose();
    (this.outline.material as THREE.Material).dispose();
  }

  private commit(): void {
    this.applyKeepClip();
    this.lastClip = this.clip.clone();
    this.hideHelpers();
    this.setPhase("clipped");
  }

  private beginDrag(hit: THREE.Intersection): void {
    if (!this.showPatch(hit, true)) return;
    this.offset = 0;
    this.origin.copy(this.base);
    this.gizmo.position.copy(this.origin);
    this.gizmo.visible = true;
    this.arrow.visible = false;
    this.setPhase("dragPlane");
  }

  private hoverFace(): void {
    const hit = this.hitFace();
    if (!hit) {
      this.hoverKey = "";
      this.gizmo.visible = false;
      return;
    }
    const key = `${hit.object.id}:${hit.faceIndex ?? hit.face?.a}`;
    if (key === this.hoverKey && this.gizmo.visible) return;
    if (!this.showPatch(hit, false)) {
      this.gizmo.visible = false;
      return;
    }
    this.hoverKey = key;
    this.offset = 0;
    this.origin.copy(this.base);
    this.gizmo.position.copy(this.origin);
    this.gizmo.visible = true;
  }

  private movePlane(): void {
    const camera = this.getCamera();
    const view = new THREE.Vector3();
    camera.getWorldDirection(view);
    const planeN = dragPlaneNormal(view, camera.up, this.normal);
    const hit = rayHitPlane(this.raycaster.ray.origin, this.raycaster.ray.direction, planeN, this.base);
    if (!hit) return;
    const limit = Math.max(this.getModelSize(), this.span * 8, 1);
    this.offset = THREE.MathUtils.clamp(offsetAlongNormal(hit, this.base, this.normal), -limit, limit);
    this.origin.copy(this.base).addScaledVector(this.normal, this.offset);
    this.gizmo.position.copy(this.origin);
  }

  private moveSide(): void {
    this.keep = this.keepFromMouse();
    const dir = this.normal.clone().multiplyScalar(this.keep);
    const length = Math.max(this.span * 0.7, this.getModelSize() * 0.04);
    this.arrow.position.copy(this.origin);
    this.arrow.setDirection(dir);
    this.arrow.setLength(length, length * 0.32, length * 0.2);
    this.arrow.visible = true;
  }

  private keepFromMouse(): 1 | -1 {
    const point = closestPointOnRay(this.raycaster.ray.origin, this.raycaster.ray.direction, this.origin);
    return sideSign(this.normal, this.origin, point);
  }

  private aimRay(): void {
    const camera = this.getCamera();
    camera.updateMatrixWorld();
    if (camera instanceof THREE.OrthographicCamera) camera.updateProjectionMatrix();
    this.raycaster.setFromCamera(this.pointer, camera);
  }

  private applyKeepClip(): void {
    const clip = keepSideClip(this.normal, this.origin, this.keep);
    this.clip.set(new THREE.Vector3(clip.x, clip.y, clip.z), clip.constant);
    this.onClip?.(this.clip);
  }

  private hitFace(): THREE.Intersection | undefined {
    const hits = this.raycaster.intersectObjects(this.getMeshes(), false);
    return hits.find((hit) => hit.face && hit.object instanceof THREE.Mesh);
  }

  private showPatch(hit: THREE.Intersection, lockNormal: boolean): boolean {
    const mesh = hit.object as THREE.Mesh;
    const tris = this.trianglesOf(mesh);
    if (!tris.length) return false;
    const seed = seedIndex(hit, tris.length);
    const model = Math.max(this.getModelSize(), 1);
    const eps = Math.max(model * 1e-5, 1e-3);
    const indices = growCoplanar(tris, seed, eps);
    if (!indices.length) return false;
    const centroid = faceCentroid(tris, indices);
    const n = faceNormal(tris, indices);
    this.base.set(centroid.x, centroid.y, centroid.z);
    if (lockNormal || this.phase === "pickFace") {
      this.normal.set(n.x, n.y, n.z);
      if (hit.face) {
        const hitN = hit.face.normal.clone().transformDirection(mesh.matrixWorld).normalize();
        if (this.normal.dot(hitN) < 0) this.normal.negate();
      }
    }
    this.span = Math.max(faceSpan(tris, indices, centroid), model * 0.02);
    this.patchMesh.geometry.dispose();
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(relativePositions(tris, indices, centroid), 3));
    this.patchMesh.geometry = geom;
    this.outline.geometry.dispose();
    this.outline.geometry = outlineGeometry(tris, indices, centroid, eps);
    return true;
  }

  private trianglesOf(mesh: THREE.Mesh): Tri3[] {
    const cached = this.triCache.get(mesh);
    if (cached) return cached;
    mesh.updateWorldMatrix(true, false);
    const pos = mesh.geometry.getAttribute("position");
    if (!pos) return [];
    const index = mesh.geometry.getIndex();
    const triCount = index ? Math.floor(index.count / 3) : Math.floor(pos.count / 3);
    const tris: Tri3[] = [];
    const v = new THREE.Vector3();
    const world = (i: number): { x: number; y: number; z: number } => {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      return { x: v.x, y: v.y, z: v.z };
    };
    for (let t = 0; t < triCount; t++) {
      const ia = index ? index.getX(t * 3) : t * 3;
      const ib = index ? index.getX(t * 3 + 1) : t * 3 + 1;
      const ic = index ? index.getX(t * 3 + 2) : t * 3 + 2;
      tris.push({ a: world(ia), b: world(ib), c: world(ic) });
    }
    this.triCache.set(mesh, tris);
    return tris;
  }

  private hideHelpers(): void {
    this.gizmo.visible = false;
    this.arrow.visible = false;
    this.hoverKey = "";
  }

  private setPointer(event: PointerEvent, canvas: HTMLCanvasElement): void {
    const rect = canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private setPhase(phase: SectionPhase): void {
    this.phase = phase;
    this.onPhase?.(phase);
  }
}

function seedIndex(hit: THREE.Intersection, triCount: number): number {
  if (hit.faceIndex != null && hit.faceIndex >= 0 && hit.faceIndex < triCount) return hit.faceIndex;
  return 0;
}

function outlineGeometry(tris: Tri3[], indices: number[], origin: { x: number; y: number; z: number }, eps: number): THREE.BufferGeometry {
  const segments = boundarySegments(tris, indices, eps);
  const data = new Float32Array(segments.length * 6);
  let o = 0;
  for (const [a, b] of segments) {
    data[o++] = a.x - origin.x;
    data[o++] = a.y - origin.y;
    data[o++] = a.z - origin.z;
    data[o++] = b.x - origin.x;
    data[o++] = b.y - origin.y;
    data[o++] = b.z - origin.z;
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(data, 3));
  return geom;
}
