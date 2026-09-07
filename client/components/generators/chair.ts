import * as THREE from "three";

export function createChair(): THREE.Group {
  const group = new THREE.Group();

  // Materials
  // Reusing the sofa's exact tones so mixed furniture in a scene reads
  // as one cohesive set rather than mismatched pieces
  const fabricMaterial = new THREE.MeshStandardMaterial({
    color: 0x4a4a4a, // Dark gray fabric
    roughness: 0.9,
  });

  const legMaterial = new THREE.MeshStandardMaterial({
    color: 0x1a1a1a, // Dark/black wood legs
    roughness: 0.5,
  });

  // 1. Legs
  // The legs touch the floor at y = -0.45 (assuming total height 0.9)
  const legGeo = new THREE.BoxGeometry(0.04, 0.4, 0.04);
  const legPositions = [
    [-0.19, -0.25, -0.19],
    [0.19, -0.25, -0.19],
    [-0.19, -0.25, 0.19],
    [0.19, -0.25, 0.19],
  ];

  legPositions.forEach((pos) => {
    const leg = new THREE.Mesh(legGeo, legMaterial);
    leg.position.set(pos[0], pos[1], pos[2]);
    leg.castShadow = true;
    leg.receiveShadow = true;
    group.add(leg);
  });

  // 2. Seat
  // Rests directly on top of the legs; seat top lands at y = 0
  const seatGeo = new THREE.BoxGeometry(0.45, 0.05, 0.45);
  const seat = new THREE.Mesh(seatGeo, fabricMaterial);
  seat.position.set(0, -0.025, 0);
  seat.castShadow = true;
  seat.receiveShadow = true;
  group.add(seat);

  // 3. Backrest
  // Rises from the back edge of the seat (z = -0.2, matching the
  // sofa/desk convention where -z is the back and +z is the front).
  // Slight rotation adds a bit of recline instead of a stiff right angle.
  const backrestGeo = new THREE.BoxGeometry(0.45, 0.45, 0.05);
  const backrest = new THREE.Mesh(backrestGeo, fabricMaterial);
  backrest.position.set(0, 0.225, -0.2);
  backrest.rotation.x = -0.1;
  backrest.castShadow = true;
  backrest.receiveShadow = true;
  group.add(backrest);

  // 4. Armrests
  // Left and right blocks flush against the seat's outer edges
  const armrestGeo = new THREE.BoxGeometry(0.05, 0.2, 0.35);

  const armrestL = new THREE.Mesh(armrestGeo, fabricMaterial);
  armrestL.position.set(-0.25, 0.1, 0);
  armrestL.castShadow = true;
  armrestL.receiveShadow = true;
  group.add(armrestL);

  const armrestR = new THREE.Mesh(armrestGeo, fabricMaterial);
  armrestR.position.set(0.25, 0.1, 0);
  armrestR.castShadow = true;
  armrestR.receiveShadow = true;
  group.add(armrestR);

  return group;
}
