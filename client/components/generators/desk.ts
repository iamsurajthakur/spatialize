import * as THREE from "three";

export function createDesk(): THREE.Group {
  const group = new THREE.Group();

  // Materials
  const deskTopMaterial = new THREE.MeshStandardMaterial({
    color: 0x8b5a2b, // Warm wood-toned desktop
    roughness: 0.6,
  });

  const frameMaterial = new THREE.MeshStandardMaterial({
    color: 0x2b2b2b, // Dark metal legs/apron
    roughness: 0.4,
    metalness: 0.6,
  });

  const drawerMaterial = new THREE.MeshStandardMaterial({
    color: 0x5a3d24, // Slightly darker wood for the drawer unit
    roughness: 0.55,
  });

  const handleMaterial = new THREE.MeshStandardMaterial({
    color: 0xc0c0c0, // Brushed metal handle
    roughness: 0.3,
    metalness: 0.8,
  });

  // 1. Legs
  // The legs touch the floor at y = -0.375 (assuming total height 0.75)
  const legGeo = new THREE.BoxGeometry(0.05, 0.65, 0.05);
  const legPositions = [
    [-0.65, -0.05, -0.3],
    [0.65, -0.05, -0.3],
    [-0.65, -0.05, 0.3],
    [0.65, -0.05, 0.3],
  ];

  legPositions.forEach((pos) => {
    const leg = new THREE.Mesh(legGeo, frameMaterial);
    leg.position.set(pos[0], pos[1], pos[2]);
    leg.castShadow = true;
    leg.receiveShadow = true;
    group.add(leg);
  });

  // 2. Apron Frame
  // Thin frame connecting the tops of the legs, sits just beneath the desktop
  const apronGeo = new THREE.BoxGeometry(1.3, 0.06, 0.6);
  const apron = new THREE.Mesh(apronGeo, frameMaterial);
  apron.position.set(0, 0.305, 0);
  apron.castShadow = true;
  apron.receiveShadow = true;
  group.add(apron);

  // 3. Desktop
  // The main work surface
  const topGeo = new THREE.BoxGeometry(1.4, 0.04, 0.7);
  const top = new THREE.Mesh(topGeo, deskTopMaterial);
  top.position.set(0, 0.355, 0);
  top.castShadow = true;
  top.receiveShadow = true;
  group.add(top);

  // 4. Drawer Unit
  // A small pedestal hanging beneath the right side of the desktop
  const drawerUnitGeo = new THREE.BoxGeometry(0.36, 0.22, 0.55);
  const drawerUnit = new THREE.Mesh(drawerUnitGeo, drawerMaterial);
  drawerUnit.position.set(0.42, 0.225, 0);
  drawerUnit.castShadow = true;
  drawerUnit.receiveShadow = true;
  group.add(drawerUnit);

  // 5. Drawer Front & Handle
  // Slightly proud front panel plus a handle for visual detail
  const drawerFrontGeo = new THREE.BoxGeometry(0.32, 0.18, 0.02);
  const drawerFront = new THREE.Mesh(drawerFrontGeo, drawerMaterial);
  drawerFront.position.set(0.42, 0.225, 0.285);
  drawerFront.castShadow = true;
  drawerFront.receiveShadow = true;
  group.add(drawerFront);

  const handleGeo = new THREE.BoxGeometry(0.14, 0.02, 0.02);
  const handle = new THREE.Mesh(handleGeo, handleMaterial);
  handle.position.set(0.42, 0.225, 0.305);
  handle.castShadow = true;
  handle.receiveShadow = true;
  group.add(handle);

  return group;
}
