import * as THREE from "three";

export function createBookshelf(): THREE.Group {
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x956b46, roughness: 0.75 });
  const backing = new THREE.MeshStandardMaterial({ color: 0x705039, roughness: 0.9 });
  const paper = new THREE.MeshStandardMaterial({ color: 0xe7dfca, roughness: 0.95 });
  const covers = [0x405f66, 0xa65c45, 0x78825b, 0xc49a54, 0x63596e, 0x3f4d62].map(
    (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.85 }),
  );
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);

  function box(
    parent: THREE.Group,
    size: [number, number, number],
    position: [number, number, number],
    material: THREE.MeshStandardMaterial,
  ) {
    const mesh = new THREE.Mesh(boxGeometry, material);
    mesh.scale.set(...size);
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  // Local front is +Z, matching the backend's wall-facing rotations.
  const width = 1.0;
  const height = 1.9;
  const depth = 0.36;
  const board = 0.04;
  const bays = 5;
  const shelfSpacing = (height - board) / bays;

  for (const side of [-1, 1]) {
    box(group, [board, height, depth], [(side * (width - board)) / 2, height / 2, 0], wood);
  }
  box(
    group,
    [width - 2 * board, height - 2 * board, 0.025],
    [0, height / 2, -depth / 2 + 0.0125],
    backing,
  );
  for (let shelf = 0; shelf <= bays; shelf++) {
    box(group, [width - 2 * board, board, depth], [0, board / 2 + shelf * shelfSpacing, 0], wood);
  }

  function book(bookWidth: number, bookHeight: number, color: number) {
    const bookGroup = new THREE.Group();
    const bookDepth = 0.24;
    const cover = covers[color % covers.length];
    box(bookGroup, [bookWidth, bookHeight, bookDepth], [0, bookHeight / 2, 0], cover);
    // Exposed page edges at the top and subtle bands on the front-facing spine.
    box(
      bookGroup,
      [bookWidth - 0.008, 0.006, bookDepth - 0.018],
      [0, bookHeight - 0.002, -0.005],
      paper,
    );
    for (const y of [0.035, bookHeight - 0.04]) {
      box(bookGroup, [bookWidth * 0.7, 0.007, 0.002], [0, y, bookDepth / 2], paper);
    }
    return bookGroup;
  }

  // Fixed variations keep saved scenes identical on every render.
  for (let shelf = 0; shelf < bays; shelf++) {
    const shelfTop = board + shelf * shelfSpacing;
    const count = shelf % 2 === 0 ? 6 : 4;
    let x = -width / 2 + board + 0.025;
    for (let index = 0; index < count; index++) {
      const bookWidth = 0.045 + ((index + shelf) % 3) * 0.012;
      const bookHeight = 0.21 + ((index * 2 + shelf) % 4) * 0.02;
      const volume = book(bookWidth, bookHeight, index + shelf * 2);
      volume.position.set(x + bookWidth / 2, shelfTop, 0.02);
      group.add(volume);
      x += bookWidth + 0.008;
    }

    if (shelf % 2 === 1) {
      // A small horizontal stack leaves visible open space in each shelf bay.
      let stackTop = shelfTop;
      for (let index = 0; index < 3; index++) {
        const thickness = 0.045 + index * 0.005;
        const volume = book(thickness, 0.25 - index * 0.015, shelf + index);
        volume.rotation.z = -Math.PI / 2;
        volume.position.set(0.13, stackTop + thickness / 2, 0.015);
        group.add(volume);
        stackTop += thickness;
      }
    }
  }

  return group;
}
