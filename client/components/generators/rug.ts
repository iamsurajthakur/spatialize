import * as THREE from "three";

export function createRug(color?: string | null): THREE.Group {
  const group = new THREE.Group();
  const baseColor = new THREE.Color(color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#b7a58a");
  const fabric = new THREE.MeshStandardMaterial({ color: baseColor, roughness: 1 });
  const binding = new THREE.MeshStandardMaterial({
    color: baseColor.clone().multiplyScalar(0.78),
    roughness: 1,
  });
  const thread = new THREE.MeshStandardMaterial({
    color: baseColor.clone().lerp(new THREE.Color(0xffffff), 0.025),
    roughness: 1,
  });
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  function panel(
    name: string,
    size: [number, number, number],
    position: [number, number, number],
    material: THREE.Material,
  ) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.scale.set(...size);
    mesh.position.set(...position);
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // A thin backing and raised fabric surface avoid flickering against the floor.
  panel("rug_binding", [2, 0.014, 2.8], [0, 0, 0], binding);
  panel("rug_fabric", [1.9, 0.002, 2.7], [0, 0.008, 0], fabric);
  // Subtle, deterministic weave detail keeps the detected base color dominant.
  for (let index = 0; index < 36; index++) {
    panel("rug_thread", [0.004, 0.0003, 2.62], [-0.91 + index * 0.052, 0.009, 0], thread);
  }
  return group;
}
