import * as THREE from "three";

export function createSofa(): THREE.Group {
  const group = new THREE.Group();

  // Materials
  const fabricMaterial = new THREE.MeshStandardMaterial({
    color: 0x4a4a4a, // Dark gray fabric
    roughness: 0.9,
  });

  const legMaterial = new THREE.MeshStandardMaterial({
    color: 0x1a1a1a, // Dark/black wood legs
    roughness: 0.5,
  });

  // 1. Legs
  // The legs touch the floor at y = -0.5 (assuming total height 1.0)
  const legGeo = new THREE.BoxGeometry(0.08, 0.1, 0.08);
  const legPositions = [
    [-0.9, -0.45, -0.35],
    [0.9, -0.45, -0.35],
    [-0.9, -0.45, 0.35],
    [0.9, -0.45, 0.35],
  ];

  legPositions.forEach((pos) => {
    const leg = new THREE.Mesh(legGeo, legMaterial);
    leg.position.set(pos[0], pos[1], pos[2]);
    leg.castShadow = true;
    leg.receiveShadow = true;
    group.add(leg);
  });

  // 2. Base Frame
  // Covers the bottom part above the legs
  const baseGeo = new THREE.BoxGeometry(2.0, 0.15, 0.9);
  const base = new THREE.Mesh(baseGeo, fabricMaterial);
  base.position.set(0, -0.325, 0);
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  // 3. Backrest
  // The tall back part of the sofa
  const backrestGeo = new THREE.BoxGeometry(2.0, 0.75, 0.2);
  const backrest = new THREE.Mesh(backrestGeo, fabricMaterial);
  backrest.position.set(0, 0.125, -0.35);
  backrest.castShadow = true;
  backrest.receiveShadow = true;
  group.add(backrest);

  // 4. Armrests
  // Left and right side armrests
  const armrestGeo = new THREE.BoxGeometry(0.15, 0.35, 0.7);

  const armrestL = new THREE.Mesh(armrestGeo, fabricMaterial);
  armrestL.position.set(-0.925, -0.075, 0.1);
  armrestL.castShadow = true;
  armrestL.receiveShadow = true;
  group.add(armrestL);

  const armrestR = new THREE.Mesh(armrestGeo, fabricMaterial);
  armrestR.position.set(0.925, -0.075, 0.1);
  armrestR.castShadow = true;
  armrestR.receiveShadow = true;
  group.add(armrestR);

  // 5. Seat Cushions
  // 3 distinct cushions resting on the base frame
  const cushionGeo = new THREE.BoxGeometry(0.55, 0.15, 0.7);
  const cushionXPositions = [-0.57, 0, 0.57];

  cushionXPositions.forEach((xPos) => {
    const cushion = new THREE.Mesh(cushionGeo, fabricMaterial);
    cushion.position.set(xPos, -0.175, 0.1); // Resting on base frame

    // Slightly curve the cushions by rotating very subtly (optional touch of realism)
    cushion.rotation.x = -0.02;

    cushion.castShadow = true;
    cushion.receiveShadow = true;
    group.add(cushion);
  });

  return group;
}
