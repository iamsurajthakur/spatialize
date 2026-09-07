import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { clampTransform, generatedTransform } from "../lib/manualTransforms";
import { createSceneObject } from "../lib/sceneBuilder";

const room = { width: 5, height: 3, depth: 5 };
const sofa = { id: "sofa_1", type: "sofa", width: 2, height: 0.8, depth: 1, x: 0, y: 0.4, z: 0 };

describe("manual floor transforms", () => {
  it("keeps the rendered rotated furniture inside all four walls", () => {
    for (const rotation_y of [0, 35, 45, 90, -90, 180, 450]) {
      for (const x of [-100, 0, 100])
        for (const z of [-100, 0, 100]) {
          const transform = clampTransform(sofa, room, { x, z, rotation_y });
          assert.ok(transform);
          const mesh = createSceneObject({ ...sofa, ...transform });
          const box = new THREE.Box3().setFromObject(mesh);
          assert.ok(box.min.x >= -2.5 - 1e-7 && box.max.x <= 2.5 + 1e-7);
          assert.ok(box.min.z >= -2.5 - 1e-7 && box.max.z <= 2.5 + 1e-7);
          assert.equal(mesh.position.y, sofa.y);
          assert.equal(mesh.userData.sceneObjectId, sofa.id);
        }
    }
  });
  it("preserves the generated transform and defaults legacy rotation to zero", () => {
    const original = structuredClone(sofa);
    clampTransform(sofa, room, { x: 10, z: -10, rotation_y: 90 });
    assert.deepEqual(sofa, original);
    assert.deepEqual(generatedTransform(sofa), { x: 0, z: 0, rotation_y: 0 });
  });
  it("rejects an orientation that cannot fit, and nonfinite inputs", () => {
    assert.equal(clampTransform({ ...sofa, width: 6 }, room, { x: 0, z: 0, rotation_y: 0 }), null);
    assert.equal(clampTransform(sofa, room, { x: NaN, z: 0, rotation_y: 0 }), null);
  });
});
