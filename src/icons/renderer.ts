// Rendering pipeline adapted through ps2mcs from caol64/ps2mc-browser (MIT). See THIRD_PARTY_NOTICES.md.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { shapeWeights } from "./parser";
import type { IconModel, IconSys } from "./parser";

export interface PreviewHandle {
  readonly canStepFrames: boolean;
  animate(value: boolean): void;
  stepFrame(direction: -1 | 1): void;
  setFreeView(value: boolean): void;
  resetView(): void;
  rotateView(horizontal: number, vertical: number): void;
  zoomView(inward: boolean): void;
  dispose(): void;
}

interface Preview {
  canvas: HTMLCanvasElement;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  geometry: THREE.BufferGeometry;
  material: THREE.ShaderMaterial;
  texture: THREE.DataTexture;
  group: THREE.Group;
  homeCamera: THREE.Vector3;
  controls: OrbitControls | undefined;
  view: "overview" | "detail";
  model: IconModel;
  freeView: boolean;
  freeYaw: number;
  active: boolean;
  animationFrame: number;
  rotationElapsed: number;
  dirty: boolean;
  fail: () => void;
  observer: ResizeObserver;
}
const previews = new Set<Preview>();
let renderer: THREE.WebGLRenderer | undefined;
let frame = 0,
  lastTime = 0;
const vertexShader = `varying vec2 vUv; varying vec3 vNormal; varying vec3 vColor;
void main() { vUv=uv; vNormal=normal; vColor=color; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const fragmentShader = `uniform sampler2D iconTexture; uniform vec3 ambient; uniform vec3 dirs[3]; uniform vec3 lights[3];
uniform bool textured; varying vec2 vUv; varying vec3 vNormal; varying vec3 vColor;
void main() { vec3 n=normalize(vNormal+vec3(0.000001)); vec3 light=ambient;
for(int i=0;i<3;i++){ light+=max(dot(n,normalize(-dirs[i]+vec3(0.000001))),0.0)*lights[i]; }
vec3 base=textured ? texture2D(iconTexture,vUv).rgb : vColor;
gl_FragColor=vec4(base*light,1.0); }`;

function getRenderer(): THREE.WebGLRenderer {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.addEventListener("webglcontextlost", () => {
      for (const preview of [...previews]) preview.fail();
    });
  }
  return renderer;
}
function schedule(): void {
  if (!frame && previews.size && !document.hidden)
    frame = requestAnimationFrame(tick);
}
function tick(now: number): void {
  frame = 0;
  const delta = lastTime ? Math.min((now - lastTime) / 1000, 0.05) : 0;
  lastTime = now;
  let moving = false;
  for (const p of [...previews]) {
    if (!p.active && !p.dirty) continue;
    if (p.active) {
      // PS2IODB uses 60 animation frames per second before the stored speed.
      p.animationFrame += delta * 60 * p.model.speed;
      if (!p.freeView) p.rotationElapsed += delta;
      moving = true;
    }
    try {
      draw(p);
      p.dirty = false;
    } catch {
      p.fail();
    }
  }
  if (moving) schedule();
  else lastTime = 0;
}
function draw(p: Preview): void {
  const r = getRenderer();
  const clientWidth = Math.max(1, p.canvas.clientWidth);
  const clientHeight = Math.max(1, p.canvas.clientHeight);
  // Cap both axes with one scale so the canvas and camera keep the same ratio.
  const scale = Math.min(devicePixelRatio, 2, 640 / Math.max(clientWidth, clientHeight));
  const width = Math.max(1, Math.round(clientWidth * scale));
  const height = Math.max(1, Math.round(clientHeight * scale));
  if (p.canvas.width !== width || p.canvas.height !== height) {
    p.canvas.width = width;
    p.canvas.height = height;
  }
  r.setSize(width, height, false);
  p.camera.aspect = width / height;
  p.camera.updateProjectionMatrix();
  const weights = shapeWeights(p.model, p.animationFrame);
  const attr = p.geometry.getAttribute("position") as THREE.BufferAttribute;
  const output = attr.array as Float32Array;
  output.fill(0);
  p.model.shapes.forEach((shape, s) => {
    const w = weights[s]!;
    if (w)
      for (let i = 0; i < output.length; i++)
        output[i] = output[i]! + shape[i]! * w;
  });
  attr.needsUpdate = true;
  p.group.rotation.y = p.freeView
    ? p.freeYaw
    : p.view === "overview" ? 0 : 0.65 + p.rotationElapsed * 0.4;
  r.render(p.scene, p.camera);
  const ctx = p.canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable.");
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(r.domElement, 0, 0);
}
export function mountPreview(
  canvas: HTMLCanvasElement,
  model: IconModel,
  sys: IconSys,
  fail: () => void,
  view: "overview" | "detail" = "detail",
): PreviewHandle {
  getRenderer();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(model.shapes[0]!.slice(), 3),
  );
  geometry.setAttribute("normal", new THREE.BufferAttribute(model.normals, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(model.uvs, 2));
  geometry.setAttribute("color", new THREE.BufferAttribute(model.colors, 3));
  const texture = new THREE.DataTexture(
    model.texture ?? new Uint8Array([255, 255, 255, 255]),
    model.texture ? 128 : 1,
    model.texture ? 128 : 1,
  );
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  // Match PS2IODB's colour cap for games such as Shadow of the Colossus.
  // Preserve negative channels, which can subtract light.
  const lightColor = (channels: number[]) =>
    new THREE.Vector3(...(channels.map((value) => Math.min(value, 1)) as [number, number, number]));
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    vertexColors: true,
    side: THREE.DoubleSide,
    uniforms: {
      iconTexture: { value: texture },
      textured: { value: !!model.texture },
      ambient: {
        value: lightColor(sys.ambient),
      },
      dirs: {
        value: sys.lightDirs.map(
          (v) => new THREE.Vector3(...(v as [number, number, number])),
        ),
      },
      lights: {
        value: sys.lightColors.map(lightColor),
      },
    },
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  const bounds = new THREE.Box3();
  // Ignore degenerate triangles when framing, as in the sibling browser.
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3(),
    cross = new THREE.Vector3();
  for (const shape of model.shapes)
    for (let i = 0; i < shape.length; i += 9) {
      a.fromArray(shape, i);
      b.fromArray(shape, i + 3);
      c.fromArray(shape, i + 6);
      cross.subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
      if (cross.lengthSq() > 1e-8) {
        bounds.expandByPoint(a);
        bounds.expandByPoint(b);
        bounds.expandByPoint(c);
      }
    }
  if (bounds.isEmpty()) bounds.setFromArray(model.shapes[0]!);
  const center = bounds.getCenter(new THREE.Vector3()),
    radius = Math.max(bounds.getSize(new THREE.Vector3()).length() / 2, 0.1);
  mesh.position.copy(center).negate();
  const oriented = new THREE.Group();
  oriented.rotation.x = Math.PI;
  oriented.add(mesh);
  const group = new THREE.Group();
  group.add(oriented);
  const scene = new THREE.Scene();
  scene.add(group);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 200);
  const distance = radius * 3.4;
  // The overview angle was chosen by comparing the supplied PS2 screenshot.
  const elevation =
    view === "overview" ? THREE.MathUtils.degToRad(45) : Math.atan2(0.1, 3.4);
  camera.position.set(0, Math.sin(elevation) * distance, Math.cos(elevation) * distance);
  camera.lookAt(0, 0, 0);
  const observer = new ResizeObserver(() => {
    preview.dirty = true;
    schedule();
  });
  const preview: Preview = {
    canvas,
    model,
    geometry,
    material,
    texture,
    scene,
    camera,
    group,
    homeCamera: camera.position.clone(),
    controls: undefined,
    view,
    observer,
    fail,
    freeView: false,
    freeYaw: 0.65,
    active: false,
    animationFrame: model.offset,
    rotationElapsed: 0,
    dirty: true,
  };
  previews.add(preview);
  observer.observe(canvas);
  schedule();
  function invalidate() {
    preview.dirty = true;
    schedule();
  }
  const canStepFrames = model.duration > 0 && model.shapes.length > 1 &&
    model.tracks.some((track) => track.keys.length > 1);
  return {
    canStepFrames,
    animate(value) {
      preview.active = value;
      invalidate();
    },
    stepFrame(direction) {
      if (!preview.freeView || preview.active || !canStepFrames) return;
      const duration = model.duration;
      preview.animationFrame = ((preview.animationFrame + direction) % duration + duration) % duration;
      invalidate();
    },
    setFreeView(value) {
      if (preview.freeView === value) return;
      preview.freeView = value;
      if (value) {
        preview.freeYaw = preview.view === "overview" ? 0 : 0.65 + preview.rotationElapsed * 0.4;
        const controls = new OrbitControls(camera, canvas);
        controls.enablePan = false;
        controls.enableDamping = false;
        controls.minDistance = radius * 1.5;
        controls.maxDistance = radius * 8;
        controls.minPolarAngle = 0.05;
        controls.maxPolarAngle = Math.PI - 0.05;
        controls.addEventListener("change", invalidate);
        preview.controls = controls;
      } else {
        preview.controls?.dispose();
        preview.controls = undefined;
        camera.position.copy(preview.homeCamera);
        camera.lookAt(0, 0, 0);
      }
      invalidate();
    },
    resetView() {
      if (!preview.freeView) return;
      preview.freeYaw = 0.65;
      camera.position.copy(preview.homeCamera);
      preview.controls?.target.set(0, 0, 0);
      preview.controls?.update();
      invalidate();
    },
    rotateView(horizontal, vertical) {
      if (!preview.freeView || !preview.controls) return;
      if (horizontal) preview.controls.rotateLeft(horizontal);
      if (vertical) preview.controls.rotateUp(vertical);
    },
    zoomView(inward) {
      if (!preview.freeView || !preview.controls) return;
      const scale = 1 / 1.2;
      if (inward) preview.controls.dollyIn(scale);
      else preview.controls.dollyOut(scale);
    },
    dispose() {
      previews.delete(preview);
      observer.disconnect();
      preview.controls?.dispose();
      geometry.dispose();
      material.dispose();
      texture.dispose();
      if (!previews.size) {
        cancelAnimationFrame(frame);
        frame = 0;
        lastTime = 0;
        renderer?.dispose();
        renderer?.forceContextLoss();
        renderer = undefined;
      }
    },
  };
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    cancelAnimationFrame(frame);
    frame = 0;
    lastTime = 0;
  } else schedule();
});
