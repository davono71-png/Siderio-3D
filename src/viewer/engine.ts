import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { AssemblyPart, AssemblyTree } from "../../shared/types";

export type MousePreset = "siderio" | "cad";
export type StandardView = "iso" | "front" | "back" | "left" | "right" | "top" | "bottom";

type PartEntry = {
  id: string;
  name: string;
  meshes: THREE.Mesh[];
  restPositions: THREE.Vector3[];
  explodeDirs: THREE.Vector3[];
  materials: THREE.MeshStandardMaterial[];
};

export class SiderioEngine {
  readonly camera: THREE.PerspectiveCamera;
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
  private selectedId: string | null = null;
  private hidden = new Set<string>();
  private isolated: string | null = null;
  private explode = 0;
  private modelCenter = new THREE.Vector3();
  private modelSize = 1;
  private disposed = false;
  private pointerDown: { x: number; y: number; button: number } | null = null;
  onSelectionChange: ((partId: string | null, part: AssemblyPart | null) => void) | null = null;
  private assemblyParts: AssemblyPart[] = [];

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = false;

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100000);
    this.camera.up.set(0, 0, 1);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = true;
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.PAN,
    };
    this.controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };

    this.scene.background = new THREE.Color(0x1b1f24);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.45));
    const hemi = new THREE.HemisphereLight(0xdde7f2, 0x3a3328, 0.7);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 1.05);
    key.position.set(0.6, -1, 0.85);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xb9c7d6, 0.35);
    fill.position.set(-0.8, 0.4, 0.3);
    this.scene.add(fill);
    this.scene.add(this.root);

    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("resize", this.resize);
    this.resize();
    this.tick();
  }

  setMousePreset(preset: MousePreset): void {
    if (preset === "cad") {
      this.controls.mouseButtons = {
        LEFT: THREE.MOUSE.PAN,
        MIDDLE: THREE.MOUSE.ROTATE,
        RIGHT: THREE.MOUSE.PAN,
      };
      this.controls.enableRotate = true;
    } else {
      this.controls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.PAN,
        RIGHT: THREE.MOUSE.PAN,
      };
    }
  }

  async load(glbUrl: string, assembly: AssemblyTree): Promise<void> {
    this.clearModel();
    this.assemblyParts = assembly.parts;
    const gltf = await this.loader.loadAsync(glbUrl);
    this.root.add(gltf.scene);
    this.collectParts(gltf.scene);
    this.computeExplode();
    this.fit();
  }

  getSelectedId(): string | null {
    return this.selectedId;
  }

  select(partId: string | null): void {
    this.selectedId = partId;
    this.refreshMaterials();
    const part = partId ? this.assemblyParts.find((item) => item.id === partId) ?? null : null;
    this.onSelectionChange?.(partId, part);
  }

  isolate(): void {
    if (!this.selectedId) return;
    this.isolated = this.selectedId;
    this.applyVisibility();
  }

  hideSelected(): void {
    if (!this.selectedId) return;
    this.hidden.add(this.selectedId);
    if (this.isolated === this.selectedId) this.isolated = null;
    this.select(null);
    this.applyVisibility();
  }

  showAll(): void {
    this.hidden.clear();
    this.isolated = null;
    this.setExplode(0);
    this.applyVisibility();
    this.fit();
  }

  fit(selectionOnly = false): void {
    const box = new THREE.Box3();
    const target = new THREE.Object3D();
    this.root.updateWorldMatrix(true, true);
    if (selectionOnly && this.selectedId) {
      const entry = this.parts.get(this.selectedId);
      entry?.meshes.forEach((mesh) => box.expandByObject(mesh));
    } else {
      box.setFromObject(this.root);
    }
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3()).length();
    const center = box.getCenter(new THREE.Vector3());
    this.modelCenter.copy(center);
    this.modelSize = Math.max(size, 1);
    const distance = size * 1.15;
    this.camera.near = Math.max(distance / 1000, 0.01);
    this.camera.far = distance * 100;
    this.camera.updateProjectionMatrix();
    this.camera.position.copy(center).add(new THREE.Vector3(0.72, -0.86, 0.62).multiplyScalar(distance));
    this.controls.target.copy(center);
    this.controls.minDistance = size * 0.05;
    this.controls.maxDistance = size * 20;
    this.controls.update();
    target.position.copy(center);
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
    const box = new THREE.Box3().setFromObject(this.root);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length();
    this.camera.position.copy(center).add(dirs[view].normalize().multiplyScalar(size * 1.2));
    this.controls.target.copy(center);
    this.controls.update();
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

  applyViewPreset(isolatePartIds: string[], explode: number): void {
    this.hidden.clear();
    this.isolated = isolatePartIds[0] ?? null;
    if (this.isolated) this.select(this.isolated);
    this.setExplode(explode);
    this.applyVisibility();
    this.fit(Boolean(this.isolated));
  }

  dispose(): void {
    this.disposed = true;
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("resize", this.resize);
    this.controls.dispose();
    this.clearModel();
    this.renderer.dispose();
  }

  private clearModel(): void {
    this.root.clear();
    this.parts.clear();
    this.partByMesh.clear();
    this.hidden.clear();
    this.isolated = null;
    this.selectedId = null;
    this.explode = 0;
  }

  private collectParts(object: THREE.Object3D): void {
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const partId = findPartId(child) ?? child.name ?? `mesh-${this.parts.size}`;
      child.castShadow = false;
      const materials = (Array.isArray(child.material) ? child.material : [child.material]).map((material) => {
        if (material instanceof THREE.MeshStandardMaterial) {
          material.metalness = 0.18;
          material.roughness = 0.52;
          return material;
        }
        const next = new THREE.MeshStandardMaterial({ color: 0xb8bec6, metalness: 0.18, roughness: 0.52 });
        child.material = next;
        return next;
      });
      const existing = this.parts.get(partId);
      if (existing) {
        existing.meshes.push(child);
        existing.materials.push(...materials);
      } else {
        this.parts.set(partId, {
          id: partId,
          name: child.name || partId,
          meshes: [child],
          restPositions: [],
          explodeDirs: [],
          materials,
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
      const visible = this.isolated ? id === this.isolated : !this.hidden.has(id);
      entry.meshes.forEach((mesh) => {
        mesh.visible = visible;
      });
    }
    this.refreshMaterials();
  }

  private refreshMaterials(): void {
    for (const [id, entry] of this.parts) {
      const selected = id === this.selectedId;
      entry.materials.forEach((material) => {
        material.emissive.setHex(selected ? 0x8a5a12 : 0x000000);
        material.emissiveIntensity = selected ? 0.35 : 0;
      });
    }
  }

  private readonly onPointerDown = (event: PointerEvent) => {
    this.pointerDown = { x: event.clientX, y: event.clientY, button: event.button };
  };

  private readonly onPointerUp = (event: PointerEvent) => {
    if (!this.pointerDown || event.button !== 0) {
      this.pointerDown = null;
      return;
    }
    const dx = event.clientX - this.pointerDown.x;
    const dy = event.clientY - this.pointerDown.y;
    this.pointerDown = null;
    if (dx * dx + dy * dy > 16) return;
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects([...this.partByMesh.keys()].filter((mesh) => mesh.visible), false);
    const hit = hits[0]?.object;
    if (hit instanceof THREE.Mesh) {
      this.select(this.partByMesh.get(hit) ?? null);
    } else {
      this.select(null);
    }
  };

  private readonly resize = () => {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const width = parent.clientWidth;
    const height = parent.clientHeight;
    if (width < 2 || height < 2) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  };

  private readonly tick = () => {
    if (this.disposed) return;
    requestAnimationFrame(this.tick);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.clock.getDelta();
  };
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
