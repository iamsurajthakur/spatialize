import * as THREE from "three";

export function createPlant(): THREE.Group {
  const group = new THREE.Group();

  // Materials
  const potMaterial = new THREE.MeshStandardMaterial({
    color: 0xb5651d, // Terracotta pot
    roughness: 0.8,
  });

  const soilMaterial = new THREE.MeshStandardMaterial({
    color: 0x2b1e14, // Dark soil
    roughness: 1.0,
  });

  const stemMaterial = new THREE.MeshStandardMaterial({
    color: 0x4a3728, // Woody brown stem
    roughness: 0.7,
  });

  const foliageMaterial = new THREE.MeshStandardMaterial({
    color: 0x3f6b3f, // Medium green
    roughness: 0.85,
  });

  const foliageMaterialLight = new THREE.MeshStandardMaterial({
    color: 0x527d4c, // Slightly lighter green for a bit of variation
    roughness: 0.85,
  });

  // 1. Pot
  // Tapered cylinder that touches the floor at y = -0.6 (assuming total height 1.2)
  const potGeo = new THREE.CylinderGeometry(0.22, 0.16, 0.35, 24);
  const pot = new THREE.Mesh(potGeo, potMaterial);
  pot.position.set(0, -0.425, 0);
  pot.castShadow = true;
  pot.receiveShadow = true;
  group.add(pot);

  // 2. Soil
  // Sits just inside the rim of the pot
  const soilGeo = new THREE.CylinderGeometry(0.19, 0.19, 0.05, 24);
  const soil = new THREE.Mesh(soilGeo, soilMaterial);
  soil.position.set(0, -0.28, 0);
  soil.receiveShadow = true;
  group.add(soil);

  // 3. Stem
  // Rises from the soil up into the foliage cluster
  const stemGeo = new THREE.CylinderGeometry(0.02, 0.025, 0.45, 12);
  const stem = new THREE.Mesh(stemGeo, stemMaterial);
  stem.position.set(0, -0.03, 0);
  stem.castShadow = true;
  stem.receiveShadow = true;
  group.add(stem);

  // 4. Foliage
  // A single unit sphere reused and scaled per cluster, rather than a
  // unique geometry per leaf mass — cheaper and just as effective
  const foliageGeo = new THREE.SphereGeometry(1, 16, 12);
  const foliageClusters = [
    { pos: [0, 0.38, 0], scale: 0.22, material: foliageMaterial },
    { pos: [0.16, 0.28, 0.08], scale: 0.15, material: foliageMaterialLight },
    { pos: [-0.15, 0.3, -0.1], scale: 0.16, material: foliageMaterial },
    { pos: [0.08, 0.2, -0.16], scale: 0.13, material: foliageMaterialLight },
    { pos: [-0.14, 0.22, 0.13], scale: 0.14, material: foliageMaterial },
  ];

  foliageClusters.forEach((cluster) => {
    const leafCluster = new THREE.Mesh(foliageGeo, cluster.material);
    leafCluster.position.set(cluster.pos[0], cluster.pos[1], cluster.pos[2]);
    leafCluster.scale.setScalar(cluster.scale);
    leafCluster.castShadow = true;
    leafCluster.receiveShadow = true;
    group.add(leafCluster);
  });

  return group;
}
