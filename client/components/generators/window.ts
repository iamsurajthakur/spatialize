import * as THREE from "three";

export function createWindow(): THREE.Group {
  const group = new THREE.Group();
  const frame = new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.55 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x636b70, metalness: 0.7, roughness: 0.3 });
  // Opaque, glossy glazing stays visible against the room's solid wall surfaces.
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x9ecddd,
    roughness: 0.16,
    metalness: 0.08,
    clearcoat: 0.9,
  });
  const reflection = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  });
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  function box(
    size: [number, number, number],
    position: [number, number, number],
    material: THREE.Material,
  ) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.scale.set(...size);
    mesh.position.set(...position);
    mesh.castShadow = material === frame;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  // The back sits against the wall; the frame, sill, and handles face local +Z.
  for (const side of [-1, 1]) {
    box([0.07, 1.06, 0.09], [side * 0.565, 0, -0.01], frame);
    box([1.2, 0.07, 0.09], [0, side * 0.565, -0.01], frame);
  }
  box([1.2, 0.06, 0.16], [0, -0.57, 0.02], frame);
  box([0.04, 1.06, 0.055], [0, 0, 0.01], frame);
  box([1.06, 0.04, 0.055], [0, 0, 0.01], frame);
  for (const x of [-0.275, 0.275]) {
    for (const y of [-0.275, 0.275]) {
      box([0.51, 0.51, 0.015], [x, y, -0.025], glass);
      for (const offset of [-0.06, 0.02]) {
        const glint = box([0.025, 0.26, 0.002], [x + offset, y + 0.035, -0.016], reflection);
        glint.rotation.z = -Math.PI / 5;
      }
    }
  }
  box([0.022, 0.12, 0.025], [0.055, -0.12, 0.047], metal);
  return group;
}
