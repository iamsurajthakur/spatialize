import * as THREE from "three";
import { createBed } from "../components/generators/bed";
import { createSofa } from "../components/generators/sofa";
import { createDesk } from "../components/generators/desk";
import { createChair } from "../components/generators/chair";
import { createLamp } from "../components/generators/lamp";
import { createPlant } from "../components/generators/plant";
import { roomDimensions, type SceneData, type SceneObject } from "./SceneData";

const generators: Record<string, () => THREE.Group> = {
  bed: createBed, sofa: createSofa, desk: createDesk, table: createDesk,
  chair: createChair, lamp: createLamp, plant: createPlant,
};

export function createSceneObject(object: SceneObject): THREE.Group {
  const asset = generators[object.type]?.() ?? new THREE.Group().add(
    new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: object.type === "tv" ? 0x252830 : 0x95765b })),
  );
  const box = new THREE.Box3().setFromObject(asset);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  asset.position.sub(center);
  const object3D = new THREE.Group();
  object3D.add(asset);
  // Normalize every generator to the backend's LOCAL bounding box. The group
  // origin is its center. Apply rotation after scale, then world translation.
  object3D.scale.set(object.width / size.x, object.height / size.y, object.depth / size.z);
  object3D.rotation.y = THREE.MathUtils.degToRad(object.rotation_y ?? 0);
  object3D.position.set(object.x, object.y, object.z);
  object3D.name = object.id;
  object3D.userData.sceneObject = true;
  return object3D;
}

export function buildScene(scene: THREE.Scene, data: SceneData) {
  const room = roomDimensions(data);
  const material = new THREE.MeshStandardMaterial({ color: 0xd6d0c6, roughness: 0.9 });
  const floor = new THREE.Mesh(new THREE.BoxGeometry(room.width, 0.1, room.depth),
    new THREE.MeshStandardMaterial({ color: 0xb69a79, roughness: 0.9 }));
  floor.position.y = -0.05; // Floor surface exactly Y=0.
  floor.name = "floor";
  scene.add(floor);

  const thickness = 0.1;
  const walls = [
    { name: "back_wall", axis: "z", sign: -1, size: [room.width, room.height, thickness] },
    { name: "front_wall", axis: "z", sign: 1, size: [room.width, room.height, thickness] },
    { name: "left_wall", axis: "x", sign: -1, size: [thickness, room.height, room.depth] },
    { name: "right_wall", axis: "x", sign: 1, size: [thickness, room.height, room.depth] },
  ].map(({ name, axis, sign, size }) => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    wall.name = name;
    wall.position.y = room.height / 2;
    // Geometry boundaries are INSIDE faces, so walls extend outward.
    if (axis === "x") wall.position.x = sign * (room.width + thickness) / 2;
    else wall.position.z = sign * (room.depth + thickness) / 2;
    scene.add(wall);
    return { mesh: wall, axis, sign };
  });
  for (const object of data.objects) scene.add(createSceneObject(object));
  scene.add(new THREE.AmbientLight(0xffffff, 1.6));
  const light = new THREE.DirectionalLight(0xffffff, 2.5);
  light.position.set(3, 8, 5);
  scene.add(light);

  return {
    updateWalls(camera: THREE.Camera) {
      for (const { mesh, axis, sign } of walls) {
        const value = axis === "x" ? camera.position.x : camera.position.z;
        const boundary = (axis === "x" ? room.width : room.depth) / 2;
        mesh.visible = value * sign < boundary; // Hide camera-side walls for a cutaway.
      }
    },
  };
}

export type ViewMode = "source" | "overview" | "top";

export function createSceneCamera(data: SceneData, aspect: number, mode: ViewMode) {
  const room = roomDimensions(data);
  const source = data.camera;
  if (mode === "source" && source) {
    const camera = source.kind === "orthographic"
      ? new THREE.OrthographicCamera(source.left, source.right, source.top, source.bottom, 0.01, 1000)
      : new THREE.PerspectiveCamera(source.fov ?? 50, source.image_aspect_ratio, 0.01, 1000);
    camera.position.fromArray(source.position);
    camera.up.fromArray(source.up);
    camera.lookAt(new THREE.Vector3(...source.target));
    return { camera, target: new THREE.Vector3(...source.target), aspect: source.image_aspect_ratio };
  }
  const span = Math.max(room.width, room.depth);
  if (mode === "top") {
    const camera = new THREE.OrthographicCamera(-span * aspect / 1.6, span * aspect / 1.6, span / 1.6, -span / 1.6, 0.01, 1000);
    camera.position.set(0, span * 3, 0);
    camera.up.set(0, 0, -1); // Back (-Z) at the top; +X still screen-right.
    camera.lookAt(0, 0, 0);
    return { camera, target: new THREE.Vector3(), aspect };
  }
  const camera = new THREE.PerspectiveCamera(50, aspect, 0.01, 1000);
  camera.position.set(0, room.height * 1.4, span * 1.6);
  const target = new THREE.Vector3(0, room.height / 4, 0);
  camera.lookAt(target);
  return { camera, target, aspect };
}

export function disposeScene(scene: THREE.Scene) {
  const materials = new Set<THREE.Material>();
  const geometries = new Set<THREE.BufferGeometry>();
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}
