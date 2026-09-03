import * as THREE from "three";

export function createLamp(): THREE.Group {
    const group = new THREE.Group();

    // Materials
    const standMaterial = new THREE.MeshStandardMaterial({
        color: 0x1a1a1a, // Same dark metal tone as the desk/chair legs
        roughness: 0.5,
        metalness: 0.6
    });

    const shadeMaterial = new THREE.MeshStandardMaterial({
        color: 0xe8dcc8, // Warm off-white fabric shade
        roughness: 0.8,
        side: THREE.DoubleSide // visible from underneath, where the bulb sits
    });

    const bulbMaterial = new THREE.MeshStandardMaterial({
        color: 0xfff2cc,
        emissive: 0xfff2cc,
        emissiveIntensity: 1.2,
        roughness: 0.3
    });

    // 1. Base
    // Flat disc that touches the floor at y = -0.75 (assuming total height 1.5)
    const baseGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.05, 24);
    const base = new THREE.Mesh(baseGeo, standMaterial);
    base.position.set(0, -0.725, 0);
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    // 2. Pole
    // Thin vertical rod rising from the base up to the shade
    const poleGeo = new THREE.CylinderGeometry(0.02, 0.02, 1.1, 16);
    const pole = new THREE.Mesh(poleGeo, standMaterial);
    pole.position.set(0, -0.15, 0);
    pole.castShadow = true;
    pole.receiveShadow = true;
    group.add(pole);

    // 3. Shade
    // Open-ended frustum (no top/bottom caps) so light can pass through
    // the opening at the bottom, wider than the top
    const shadeGeo = new THREE.CylinderGeometry(0.12, 0.18, 0.35, 24, 1, true);
    const shade = new THREE.Mesh(shadeGeo, shadeMaterial);
    shade.position.set(0, 0.575, 0);
    shade.castShadow = true;
    shade.receiveShadow = true;
    group.add(shade);

    // 4. Bulb + Light
    // A small emissive sphere for the visual glow, plus a real point light
    // so the lamp actually illuminates the room around it
    const bulbGeo = new THREE.SphereGeometry(0.04, 12, 12);
    const bulb = new THREE.Mesh(bulbGeo, bulbMaterial);
    bulb.position.set(0, 0.45, 0);
    group.add(bulb);

    const light = new THREE.PointLight(0xffd9a0, 1.5, 4, 2);
    light.position.set(0, 0.45, 0);
    // Shadow-casting lights get expensive fast if every lamp instance has
    // one on — leave this off unless a specific lamp needs cast shadows
    light.castShadow = false;
    group.add(light);

    return group;
}