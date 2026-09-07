import * as THREE from "three";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  roomDimensions,
  type ManualOverrides,
  type ManualTransform,
  type SceneData,
} from "./SceneData";
import { clampTransform, generatedTransform } from "./manualTransforms";

export type EditMode = "translate" | "rotate";
export type Selection = { id: string; type: string; transform: ManualTransform } | null;

export function createSceneEditor({
  scene,
  camera,
  canvas,
  orbit,
  data,
  objects,
  overrides,
  onSelect,
  onChange,
  onCommit,
  onMode,
}: {
  scene: THREE.Scene;
  camera: THREE.Camera;
  canvas: HTMLCanvasElement;
  orbit: OrbitControls;
  data: SceneData;
  objects: Map<string, THREE.Group>;
  overrides: ManualOverrides;
  onSelect: (selection: Selection) => void;
  onChange: (id: string, transform: ManualTransform | null) => void;
  onCommit: () => void;
  onMode: (mode: EditMode) => void;
}) {
  const room = roomDimensions(data);
  const originals = new Map(data.objects.map((object) => [object.id, object]));
  const transform = new TransformControls(camera, canvas);
  transform.setSpace("world");
  transform.setSize(0.85);
  const helper = transform.getHelper();
  scene.add(helper);
  const highlight = new THREE.BoxHelper(new THREE.Object3D(), 0x38bdf8);
  highlight.material.depthTest = false;
  highlight.renderOrder = 1000;
  highlight.visible = false;
  scene.add(highlight);
  let selected: string | null = null;
  let lastValid: ManualTransform | null = null;
  let changed = false;
  let usedGizmo = false;
  let pointerStart: { x: number; y: number; id: number } | null = null;

  function apply(id: string, value: ManualTransform) {
    const mesh = objects.get(id)!;
    mesh.position.set(value.x, originals.get(id)!.y, value.z);
    mesh.rotation.set(0, THREE.MathUtils.degToRad(value.rotation_y), 0);
    mesh.updateMatrixWorld(true);
  }
  for (const [id, value] of Object.entries(overrides)) {
    if (objects.has(id)) apply(id, value);
  }

  function publish() {
    if (!selected) {
      onSelect(null);
      return;
    }
    const mesh = objects.get(selected)!;
    highlight.setFromObject(mesh);
    onSelect({ id: selected, type: originals.get(selected)!.type, transform: lastValid! });
  }
  function select(id: string | null) {
    if (transform.dragging) return;
    selected = id && objects.has(id) ? id : null;
    transform.detach();
    highlight.visible = selected !== null;
    if (selected) {
      const mesh = objects.get(selected)!;
      lastValid = {
        x: mesh.position.x,
        z: mesh.position.z,
        rotation_y: THREE.MathUtils.radToDeg(mesh.rotation.y),
      };
      transform.attach(mesh);
    }
    publish();
  }
  function setMode(mode: EditMode) {
    if (transform.dragging) return;
    transform.setMode(mode);
    transform.showX = mode === "translate";
    transform.showY = mode === "rotate";
    transform.showZ = mode === "translate";
    transform.showXY = false;
    transform.showYZ = false;
    transform.showXZ = mode === "translate";
    transform.showXYZE = false;
    onMode(mode);
  }
  setMode("translate");

  function edit(value: ManualTransform) {
    if (!selected) return;
    const next = clampTransform(originals.get(selected)!, room, value);
    // Keep the last valid orientation when its rotated box cannot fit in the room.
    if (next) {
      lastValid = next;
      onChange(selected, next);
      changed = true;
    }
    apply(selected, lastValid!);
    publish();
  }
  function commit() {
    if (changed) {
      changed = false;
      onCommit();
    }
  }
  function objectChange() {
    if (!selected) return;
    const mesh = objects.get(selected)!;
    edit({
      x: mesh.position.x,
      z: mesh.position.z,
      rotation_y: THREE.MathUtils.radToDeg(mesh.rotation.y),
    });
  }
  function draggingChanged(event: { value?: unknown }) {
    orbit.enabled = !event.value;
    if (event.value) usedGizmo = true;
    else commit();
  }
  transform.addEventListener("objectChange", objectChange);
  transform.addEventListener("dragging-changed", draggingChanged);

  const raycaster = new THREE.Raycaster();
  function pointerDown(event: PointerEvent) {
    if (event.button !== 0 || !event.isPrimary) {
      pointerStart = null;
      return;
    }
    pointerStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
    usedGizmo = transform.dragging;
  }
  function pointerUp(event: PointerEvent) {
    const start = pointerStart;
    pointerStart = null;
    if (
      !start ||
      event.pointerId !== start.id ||
      usedGizmo ||
      Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5
    )
      return;
    const rect = canvas.getBoundingClientRect();
    const viewport = transform.viewport ?? new THREE.Vector4(0, 0, rect.width, rect.height);
    const x = (event.clientX - rect.left - viewport.x) / viewport.z;
    const y = (event.clientY - rect.top - (rect.height - viewport.y - viewport.w)) / viewport.w;
    if (x < 0 || x > 1 || y < 0 || y > 1) {
      select(null);
      return;
    }
    scene.updateMatrixWorld(true);
    raycaster.setFromCamera(new THREE.Vector2(x * 2 - 1, 1 - y * 2), camera);
    // Only furniture enters this raycast: room surfaces, gizmos and helpers never select.
    const hit = raycaster.intersectObjects([...objects.values()], true)[0];
    select(hit?.object.userData.sceneObjectId ?? null);
  }
  function cancelPointer() {
    pointerStart = null;
    transform.pointerUp(new PointerEvent("pointerup", { button: 0 }));
    orbit.enabled = true;
  }
  function keyDown(event: KeyboardEvent) {
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.closest("input, textarea, select") || target.isContentEditable)
    )
      return;
    if (event.ctrlKey || event.metaKey || event.altKey || transform.dragging) return;
    if (event.key === "Escape") select(null);
    if (selected && event.key.toLowerCase() === "g") setMode("translate");
    if (selected && event.key.toLowerCase() === "r") setMode("rotate");
  }
  canvas.addEventListener("pointerdown", pointerDown);
  canvas.addEventListener("pointerup", pointerUp);
  canvas.addEventListener("pointercancel", cancelPointer);
  window.addEventListener("blur", cancelPointer);
  window.addEventListener("keydown", keyDown);

  return {
    select,
    setMode,
    setViewport(viewport: THREE.Vector4 | null) {
      transform.viewport = viewport;
    },
    edit(value: ManualTransform) {
      edit(value);
      commit();
    },
    reset() {
      if (!selected || transform.dragging) return;
      lastValid = generatedTransform(originals.get(selected)!);
      apply(selected, lastValid);
      onChange(selected, null);
      publish();
      onCommit();
    },
    dispose() {
      commit();
      canvas.removeEventListener("pointerdown", pointerDown);
      canvas.removeEventListener("pointerup", pointerUp);
      canvas.removeEventListener("pointercancel", cancelPointer);
      window.removeEventListener("blur", cancelPointer);
      window.removeEventListener("keydown", keyDown);
      transform.removeEventListener("objectChange", objectChange);
      transform.removeEventListener("dragging-changed", draggingChanged);
      transform.detach();
      transform.dispose();
      scene.remove(helper, highlight);
      highlight.geometry.dispose();
      highlight.material.dispose();
      orbit.enabled = true;
    },
  };
}

export type SceneEditor = ReturnType<typeof createSceneEditor>;
