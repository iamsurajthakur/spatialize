import * as THREE from "three";

export function createBed(): THREE.Group {
    const group = new THREE.Group();

    // Materials
    const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.8 }); // Wood brown
    const mattressMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }); // White
    const blanketMaterial = new THREE.MeshStandardMaterial({ color: 0x4a90e2, roughness: 0.9 }); // Blue
    const pillowMaterial = new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.9 }); // Off-white

    // 1. Bed Frame Base
    const frame = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 0.15, 2.1),
        frameMaterial
    );
    frame.position.y = -0.075; 
    frame.castShadow = true;
    frame.receiveShadow = true;

    // 2. Legs
    const legGeo = new THREE.BoxGeometry(0.1, 0.3, 0.1);
    const legPositions = [
        [-0.7, -0.3, -0.95],
        [0.7, -0.3, -0.95],
        [-0.7, -0.3, 0.95],
        [0.7, -0.3, 0.95]
    ];
    legPositions.forEach(pos => {
        const leg = new THREE.Mesh(legGeo, frameMaterial);
        leg.position.set(pos[0], pos[1], pos[2]);
        leg.castShadow = true;
        leg.receiveShadow = true;
        group.add(leg);
    });

    // 3. Headboard (goes to floor)
    const headboard = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 1.2, 0.1),
        frameMaterial
    );
    headboard.position.set(0, 0.15, -1.0); // Inside the frame edge slightly
    headboard.castShadow = true;
    headboard.receiveShadow = true;

    // 4. Mattress
    const mattress = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 0.25, 2.0),
        mattressMaterial
    );
    mattress.position.set(0, 0.125, 0); // On top of frame
    mattress.castShadow = true;
    mattress.receiveShadow = true;

    // 5. Blanket (slightly wider and taller than mattress to wrap over it)
    const blanket = new THREE.Mesh(
        new THREE.BoxGeometry(1.52, 0.26, 1.4),
        blanketMaterial
    );
    blanket.position.set(0, 0.125, 0.3); // Offset towards the foot of the bed
    blanket.castShadow = true;
    blanket.receiveShadow = true;

    // 6. Pillows
    const pillowGeo = new THREE.BoxGeometry(0.6, 0.12, 0.35);
    
    const pillow1 = new THREE.Mesh(pillowGeo, pillowMaterial);
    pillow1.position.set(-0.35, 0.29, -0.75);
    pillow1.rotation.x = Math.PI / 12;
    pillow1.castShadow = true;
    pillow1.receiveShadow = true;

    const pillow2 = new THREE.Mesh(pillowGeo, pillowMaterial);
    pillow2.position.set(0.35, 0.29, -0.75);
    pillow2.rotation.x = Math.PI / 12;
    pillow2.castShadow = true;
    pillow2.receiveShadow = true;

    group.add(
        frame,
        headboard,
        mattress,
        blanket,
        pillow1,
        pillow2
    );

    return group;
}