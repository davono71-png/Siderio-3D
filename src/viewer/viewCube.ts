import * as THREE from "three";
import type { StandardView } from "../../shared/view";

const CUBE = 128;

const FACES: { view: StandardView; label: string; dir: THREE.Vector3; color: number }[] = [
  { view: "front", label: "FRONTE", dir: new THREE.Vector3(0, -1, 0), color: 0xf4f4f4 },
  { view: "back", label: "RETRO", dir: new THREE.Vector3(0, 1, 0), color: 0xe8e8e8 },
  { view: "right", label: "DESTRA", dir: new THREE.Vector3(1, 0, 0), color: 0xeeeeee },
  { view: "left", label: "SINISTRA", dir: new THREE.Vector3(-1, 0, 0), color: 0xeeeeee },
  { view: "top", label: "ALTO", dir: new THREE.Vector3(0, 0, 1), color: 0xd7a441 },
  { view: "bottom", label: "BASSO", dir: new THREE.Vector3(0, 0, -1), color: 0xd0d0d0 },
];

export type CubeCommand =
  | { kind: "face"; view: StandardView }
  | { kind: "dir"; dir: THREE.Vector3 }
  | { kind: "rotate"; degrees: number }
  | { kind: "home" }
  | { kind: "projection" };

export class ViewCubeWidget {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(40, 1, 0.1, 20);
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly pickables: THREE.Object3D[] = [];
  private readonly cube = new THREE.Group();
  private readonly canvas: HTMLCanvasElement;
  private readonly chrome: HTMLDivElement;
  private readonly projBtn: HTMLButtonElement;

  constructor(
    private readonly host: HTMLElement,
    private readonly getCamera: () => THREE.Camera,
    private readonly onCommand: (command: CubeCommand) => void,
  ) {
    host.classList.add("view-cube-host");
    this.canvas = document.createElement("canvas");
    this.canvas.className = "view-cube";
    host.appendChild(this.canvas);
    this.chrome = buildChrome((command) => this.onCommand(command));
    host.appendChild(this.chrome);
    this.projBtn = document.createElement("button");
    this.projBtn.type = "button";
    this.projBtn.className = "cube-proj";
    this.projBtn.title = "Proiezione";
    this.projBtn.textContent = "Assonometria";
    this.projBtn.addEventListener("pointerdown", (event) => event.stopPropagation());
    this.projBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.onCommand({ kind: "projection" });
    });
    host.appendChild(this.projBtn);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(CUBE, CUBE, false);
    this.camera.up.set(0, 0, 1);
    this.scene.add(new THREE.AmbientLight(0xffffff, 1));
    const light = new THREE.DirectionalLight(0xffffff, 0.4);
    light.position.set(2, -3, 4);
    this.scene.add(light);

    const box = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0xb8bec4, roughness: 0.5, metalness: 0.08 }),
    );
    this.cube.add(box);

    for (const face of FACES) {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.7, 0.7),
        new THREE.MeshBasicMaterial({ map: labelTexture(face.label, face.color) }),
      );
      mesh.position.copy(face.dir).multiplyScalar(0.51);
      mesh.lookAt(face.dir.clone().multiplyScalar(2));
      mesh.userData.command = { kind: "face", view: face.view } satisfies CubeCommand;
      this.cube.add(mesh);
      this.pickables.push(mesh);
    }

    for (const sx of [-1, 1] as const) {
      for (const sy of [-1, 1] as const) {
        for (const sz of [-1, 1] as const) {
          const dir = new THREE.Vector3(sx, sy, sz).normalize();
          const corner = new THREE.Mesh(
            new THREE.ConeGeometry(0.13, 0.2, 3),
            new THREE.MeshBasicMaterial({ color: 0x4fc3f7 }),
          );
          corner.position.set(sx * 0.5, sy * 0.5, sz * 0.5);
          corner.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
          corner.userData.command = { kind: "dir", dir } satisfies CubeCommand;
          this.cube.add(corner);
          this.pickables.push(corner);
        }
      }
    }

    this.scene.add(this.cube);
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
  }

  setOrthographic(on: boolean): void {
    this.projBtn.textContent = on ? "Prospettiva" : "Assonometria";
    this.projBtn.classList.toggle("on", on);
    this.projBtn.title = on ? "Passa a vista prospettica" : "Passa a vista assonometrica";
  }

  sync(): void {
    const main = this.getCamera();
    const dir = new THREE.Vector3();
    main.getWorldDirection(dir);
    this.camera.position.copy(dir).multiplyScalar(-3.35);
    this.camera.up.copy(main.up);
    this.camera.lookAt(0, 0, 0);
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.renderer.dispose();
    this.host.replaceChildren();
  }

  private readonly onPointerDown = (event: PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.pickables, false)[0];
    const command = hit?.object.userData.command as CubeCommand | undefined;
    if (command) this.onCommand(command);
  };
}

function buildChrome(onCommand: (command: CubeCommand) => void): HTMLDivElement {
  const bar = document.createElement("div");
  bar.className = "view-cube-chrome";
  bar.innerHTML = `
    <button type="button" class="cube-home" title="Home" aria-label="Vista home">⌂</button>
    <button type="button" class="cube-rot" data-deg="-90" title="Ruota -90°" aria-label="Ruota 90 gradi antiorario">↶</button>
    <button type="button" class="cube-rot" data-deg="90" title="Ruota +90°" aria-label="Ruota 90 gradi orario">↷</button>
  `;
  bar.addEventListener("pointerdown", (event) => event.stopPropagation());
  bar.querySelector(".cube-home")?.addEventListener("click", (event) => {
    event.preventDefault();
    onCommand({ kind: "home" });
  });
  bar.querySelectorAll<HTMLButtonElement>(".cube-rot").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      onCommand({ kind: "rotate", degrees: Number(button.dataset.deg) });
    });
  });
  return bar;
}

function labelTexture(text: string, color: number): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = "#222";
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, 124, 124);
  ctx.fillStyle = "#111";
  ctx.font = "bold 20px Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}
