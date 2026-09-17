import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  buildScene,
  createSceneCamera,
  createSceneObject,
  disposeScene,
} from "../lib/sceneBuilder";
import { COORDINATE_CONVENTION, type SceneData, type SceneObject } from "../lib/SceneData";

const server = fileURLToPath(new URL("../../server/", import.meta.url));
function geometry(input: unknown): SceneData {
  const result = spawnSync(
    `${server}/venv/bin/python`,
    [
      "-B",
      "-c",
      "import sys; from scenes.schemas import SceneGeometryInput; from scenes.geometry_engine import compute_geometry; print(compute_geometry(SceneGeometryInput.model_validate_json(sys.stdin.read())).model_dump_json())",
    ],
    { cwd: server, input: JSON.stringify(input), encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}
function close(actual: number, expected: number, tolerance = 1e-6) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
}
function uv(camera: THREE.Camera, x: number, y: number, z: number) {
  camera.updateMatrixWorld(true);
  const p = new THREE.Vector3(x, y, z).project(camera);
  return { x: (p.x + 1) / 2, y: (1 - p.y) / 2 };
}
const fixture = JSON.parse(
  readFileSync(`${server}/scenes/fixtures/basic_room_annotated.json`, "utf8"),
);
const sceneData = geometry(fixture);

describe("backend to Three.js geometry contract", () => {
  it("centers and scales every semantic generator, including fallback types", () => {
    for (const type of [
      "bed",
      "desk",
      "chair",
      "sofa",
      "lamp",
      "plant",
      "table",
      "tv",
      "cabinet",
      "bookshelf",
      "window",
      "generic",
    ]) {
      for (const angle of [0, 90, -90, 35, 180]) {
        const obj: SceneObject = {
          id: type,
          type,
          x: 0.4,
          y: 0.8,
          z: -0.7,
          width: 1.4,
          height: 1.6,
          depth: 0.7,
          rotation_y: angle,
        };
        const mesh = createSceneObject(obj);
        const box = new THREE.Box3().setFromObject(mesh);
        const center = box.getCenter(new THREE.Vector3());
        close(mesh.position.x, obj.x);
        close(mesh.position.y, obj.y);
        close(mesh.position.z, obj.z);
        // At oblique angles an asymmetric asset need not occupy the center of
        // its rotated enclosing box. Its LOCAL box center remains the origin.
        if (angle % 90 === 0) {
          close(center.x, obj.x);
          close(center.z, obj.z);
        }
        close(center.y, obj.y);
        close(box.min.y, 0);
        const c = Math.abs(Math.cos((angle * Math.PI) / 180)),
          s = Math.abs(Math.sin((angle * Math.PI) / 180));
        // Box3 transforms the local mesh bounds; the visible geometry cannot
        // exceed the backend's rotated local box (it may occupy less at 35°).
        assert.ok(box.max.x - obj.x <= (c * obj.width + s * obj.depth) / 2 + 1e-6);
        assert.ok(box.max.z - obj.z <= (s * obj.width + c * obj.depth) / 2 + 1e-6);
        assert.ok(obj.x - box.min.x <= (c * obj.width + s * obj.depth) / 2 + 1e-6);
        assert.ok(obj.z - box.min.z <= (s * obj.width + c * obj.depth) / 2 + 1e-6);
        close(mesh.rotation.y, (angle * Math.PI) / 180);
      }
    }
  });

  it("renders a detected bookshelf with open bays facing into the room", () => {
    const data = geometry({
      objects: [
        {
          id: "bookshelf_1",
          type: "bookshelf",
          bbox: { x_min: 0.3, x_max: 0.5, y_min: 0.2, y_max: 0.7 },
          wall_relation: { type: "against_wall", target: "back_wall" },
        },
      ],
    });
    const object = data.objects[0];
    assert.equal(object.type, "bookshelf");
    assert.ok(object.height > object.width && object.width > object.depth);
    const scene = new THREE.Scene();
    const { objects } = buildScene(scene, data);
    const bookshelf = objects.get(object.id)!;
    const bounds = new THREE.Box3().setFromObject(bookshelf);
    close(bounds.min.y, 0);
    close(bounds.min.z, -2.5);
    // A ray through the empty space above the lowest row of books should hit
    // the recessed back panel, proving this is an open shelf, not a solid box.
    const ray = new THREE.Raycaster(
      new THREE.Vector3(object.x, object.height * 0.18, object.z + 1),
      new THREE.Vector3(0, 0, -1),
    );
    const hits = ray.intersectObject(bookshelf, true);
    assert.ok(hits.length > 0);
    assert.ok(hits[0].point.z < object.z);
    bookshelf.traverse((child) => {
      assert.equal(child.userData.sceneObjectId, object.id);
    });
    disposeScene(scene);
  });

  it("mounts windows at their observed wall positions for perspective and orthographic images", () => {
    for (const original of [
      new THREE.PerspectiveCamera(55, 1.5, 0.01, 100),
      new THREE.OrthographicCamera(-4.5, 4.5, 3, -3, 0.01, 100),
    ]) {
      original.position.set(3, 4, 8);
      original.lookAt(0, 0, 0);
      const floor = (x: number, z: number) => uv(original, x, 0, z);
      const expected = [
        { wall: "back_wall", x: -0.7, y: 1.8, z: -2.42, rotation: 0 },
        { wall: "left_wall", x: -2.42, y: 1.7, z: 0.2, rotation: 90 },
        { wall: "right_wall", x: 2.42, y: 1.6, z: -0.4, rotation: -90 },
        { wall: "front_wall", x: 0.3, y: 1.5, z: 2.42, rotation: 180 },
      ];
      const data = geometry({
        image_aspect_ratio: 1.5,
        room_landmarks: {
          back_left_corner: floor(-2.5, -2.5),
          back_right_corner: floor(2.5, -2.5),
          left_front_floor: floor(-2.5, 2.5),
          right_front_floor: floor(2.5, 2.5),
          confidence: 1,
        },
        objects: expected.map(({ wall, x, y, z }) => {
          const center = uv(original, x, y, z);
          return {
            id: wall,
            type: "window",
            center,
            floor_contact: null,
            support: wall,
            bbox: {
              x_min: center.x - 0.02,
              x_max: center.x + 0.02,
              y_min: center.y - 0.02,
              y_max: center.y + 0.02,
            },
            wall_relation: { type: "against_wall", target: wall },
          };
        }),
      });
      const scene = new THREE.Scene();
      const room = buildScene(scene, data);
      for (const position of expected) {
        const obj = data.objects.find((o) => o.id === position.wall)!;
        close(obj.x, position.x);
        close(obj.y, position.y);
        close(obj.z, position.z);
        close(obj.rotation_y!, position.rotation);
        const mesh = room.objects.get(obj.id)!;
        const bounds = new THREE.Box3().setFromObject(mesh);
        assert.ok(bounds.min.y > 0);
        assert.ok(bounds.max.y < 3);
        assert.ok(mesh.children[0].children.length > 1);
      }
      room.updateWalls(original);
      assert.equal(room.objects.get("back_wall")!.visible, true);
      assert.equal(room.objects.get("front_wall")!.visible, false);
      original.position.set(0, 2, -8);
      room.updateWalls(original);
      assert.equal(room.objects.get("back_wall")!.visible, false);
      assert.equal(room.objects.get("front_wall")!.visible, true);
      disposeScene(scene);
    }
  });

  it("renders every API object at its final position with floor/support contact", () => {
    const scene = new THREE.Scene();
    buildScene(scene, sceneData);
    for (const obj of sceneData.objects) {
      const mesh = scene.getObjectByName(obj.id);
      assert.ok(mesh);
      close(mesh.position.x, obj.x);
      close(mesh.position.y, obj.y);
      close(mesh.position.z, obj.z);
      const box = new THREE.Box3().setFromObject(mesh);
      close(box.min.y, obj.y - obj.height / 2);
      assert.ok(box.min.x >= -2.5 - 1e-6 && box.max.x <= 2.5 + 1e-6);
      assert.ok(box.min.z >= -2.5 - 1e-6 && box.max.z <= 2.5 + 1e-6);
    }
    disposeScene(scene);
  });

  it("places wall inner faces at backend limits and hides the camera-side wall", () => {
    const scene = new THREE.Scene();
    const room = buildScene(scene, sceneData);
    for (const [name, axis, end, expected] of [
      ["back_wall", "z", "max", -2.5],
      ["front_wall", "z", "min", 2.5],
      ["left_wall", "x", "max", -2.5],
      ["right_wall", "x", "min", 2.5],
    ] as const) {
      const box = new THREE.Box3().setFromObject(scene.getObjectByName(name)!);
      close(box[end][axis], expected);
    }
    const { camera } = createSceneCamera(sceneData, 1, "overview");
    room.updateWalls(camera);
    assert.equal(scene.getObjectByName("front_wall")!.visible, false);
    assert.equal(scene.getObjectByName("back_wall")!.visible, true);
    disposeScene(scene);
  });

  it("has +X screen-right, +Y up, -Z at top of floor plan", () => {
    assert.equal(sceneData.coordinate_convention, COORDINATE_CONVENTION);
    const { camera } = createSceneCamera(sceneData, 1, "overview");
    assert.ok(uv(camera, 1, 0, 0).x > uv(camera, -1, 0, 0).x);
    assert.ok(uv(camera, 0, 1, 0).y < uv(camera, 0, 0, 0).y);
    assert.ok(uv(camera, 0, 0, 1).y > uv(camera, 0, 0, -1).y);
    const top = createSceneCamera(sceneData, 1, "top").camera;
    assert.ok(uv(top, 0, 0, -1).y < uv(top, 0, 0, 1).y);
  });

  it("matches the oblique affine source floor and preserves projected furniture ordering", () => {
    const { camera } = createSceneCamera(sceneData, fixture.image_aspect_ratio, "source");
    for (const [x, z, key] of [
      [-2.5, -2.5, "back_left_corner"],
      [2.5, -2.5, "back_right_corner"],
      [-2.5, 2.5, "left_front_floor"],
      [2.5, 2.5, "right_front_floor"],
    ] as const) {
      const point = uv(camera, x, 0, z),
        expected = fixture.room_landmarks[key];
      close(point.x, expected.x);
      close(point.y, expected.y);
    }
    const objectPoint = (id: string) => {
      const o = sceneData.objects.find((o) => o.id === id)!;
      return uv(camera, o.x, 0, o.z);
    };
    assert.ok(objectPoint("desk_1").x < objectPoint("bed_1").x);
    assert.ok(objectPoint("bed_1").x < objectPoint("sofa_1").x);
    assert.ok(objectPoint("bed_1").y < objectPoint("sofa_1").y);
  });

  it("round trips an independent perspective Three camera through Python and back", () => {
    const original = new THREE.PerspectiveCamera(55, 1.5, 0.01, 100);
    original.position.set(3, 4, 8);
    original.lookAt(0, 0, 0);
    const floor = (x: number, z: number) => uv(original, x, 0, z);
    const contacts = [
      { id: "left", x: -1.2, z: -0.8 },
      { id: "right", x: 1.1, z: 1.3 },
    ];
    const input = {
      image_aspect_ratio: 1.5,
      room_landmarks: {
        back_left_corner: floor(-2.5, -2.5),
        back_right_corner: floor(2.5, -2.5),
        left_front_floor: floor(-2.5, 2.5),
        right_front_floor: floor(2.5, 2.5),
        confidence: 1,
      },
      objects: contacts.map(({ id, x, z }) => ({
        id,
        type: "chair",
        floor_contact: floor(x, z),
        confidence: 1,
        bbox: {
          x_min: floor(x, z).x - 0.02,
          x_max: floor(x, z).x + 0.02,
          y_min: floor(x, z).y - 0.1,
          y_max: floor(x, z).y,
        },
      })),
    };
    const result = geometry(input);
    const recovered = createSceneCamera(result, 1.5, "source").camera;
    for (const expected of contacts) {
      const object = result.objects.find((o) => o.id === expected.id)!;
      close(object.x, expected.x);
      close(object.z, expected.z);
      const screen = uv(recovered, object.x, 0, object.z);
      close(screen.x, floor(expected.x, expected.z).x);
      close(screen.y, floor(expected.x, expected.z).y);
    }
    assert.equal(result.camera!.method, "floor_camera_centered_intrinsics");
  });

  it("initial control update preserves the source camera projection", () => {
    const { camera, target } = createSceneCamera(sceneData, fixture.image_aspect_ratio, "source");
    const before = uv(camera, 1, 0, -1);
    const controls = new OrbitControls(camera);
    controls.target.copy(target);
    controls.enableDamping = true;
    controls.update();
    const after = uv(camera, 1, 0, -1);
    close(after.x, before.x);
    close(after.y, before.y);
  });
});
