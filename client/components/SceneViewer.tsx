"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { SceneData } from "@/lib/SceneData";
import { createBed } from "@/components/generators/bed";
import { createSofa } from "@/components/generators/sofa";
import { createDesk } from "@/components/generators/desk";
import { createChair } from "@/components/generators/chair";
import { createLamp } from "@/components/generators/lamp";
import { createPlant } from "@/components/generators/plant";


type SceneViewerProps = {
    sceneData: SceneData
}

export default function SceneViewer({ sceneData }: SceneViewerProps) {
    const containerRef = useRef<HTMLDivElement>(null)
    const mountedRef = useRef(false)

    useEffect(() => {
        if (mountedRef.current) return
        mountedRef.current = true
        if (!containerRef.current) {
            return
        }

        // Clear any existing canvas from previous renders (e.g., HMR, StrictMode cleanup race)
        while (containerRef.current.firstChild) {
            containerRef.current.removeChild(containerRef.current.firstChild)
        }

        // Scene
        const scene = new THREE.Scene()

        scene.background = new THREE.Color(0x202020)

        // Camera
        const camera = new THREE.PerspectiveCamera(
            60,
            window.innerWidth / window.innerHeight,
            0.1,
            100
        )

        camera.position.set(2, 15, 6)

        // Renderer
        const renderer = new THREE.WebGLRenderer({
            antialias: true,
        })

        renderer.setSize(
            window.innerWidth,
            window.innerHeight,
        )

        renderer.setPixelRatio(
            Math.min(window.devicePixelRatio, 2)
        )

        containerRef.current?.appendChild(renderer.domElement)

        // Controls

        const controls = new OrbitControls(
            camera,
            renderer.domElement,
        )

        controls.enableDamping = true
        controls.target.set(0, 1, 0)


        // Build the scene from data
        buildScene(scene, sceneData)

        // Resize

        const handleResize = () => {
            camera.aspect = window.innerWidth / window.innerHeight

            camera.updateProjectionMatrix()

            renderer.setSize(
                window.innerWidth,
                window.innerHeight
            )
        }

        window.addEventListener(
            "resize",
            handleResize
        )

        let animationFrameId: number

        const animate = () => {
            animationFrameId = requestAnimationFrame(animate)

            controls.update()

            renderer.render(
                scene,
                camera
            )
        }

        animate()

        // Cleanup

        return () => {
            cancelAnimationFrame(animationFrameId);

            window.removeEventListener(
                "resize",
                handleResize
            );

            controls.dispose();
            renderer.dispose();

            if (
                containerRef.current &&
                containerRef.current.contains(renderer.domElement)
            ) {
                containerRef.current.removeChild(
                    renderer.domElement
                );
            }

            // Reset mountedRef so component can re-initialize on true remount
            mountedRef.current = false;
        };
    }, [sceneData])

    return (
        <div
            ref={containerRef}
            style={{
                width: "100%",
                height: "100%",
            }}
        />
    )
}

const generators: Record<
    string,
    () => THREE.Group
> = {
    bed: createBed,
    sofa: createSofa,
    desk: createDesk,
    chair: createChair,
  lamp: createLamp,
    plant: createPlant,
};

function buildScene(
    scene: THREE.Scene,
    sceneData: SceneData
) {
    const wallMaterial = new THREE.MeshStandardMaterial({
        color: 0xaaaaaa,
    })

    // Room dimenstions
    const roomWidth = sceneData.room_size_hint.width;

    const roomHeight = sceneData.room_size_hint.height;

    const roomDepth = sceneData.room_size_hint.depth;

    // Floor

    const floorGeometry = new THREE.BoxGeometry(
        roomWidth,
        0.2,
        roomDepth
    )

    const floor = new THREE.Mesh(
        floorGeometry,
        wallMaterial
    )

    floor.position.y = -0.1

    scene.add(floor)

    // Walls

    const backWall =
        new THREE.Mesh(
            new THREE.BoxGeometry(
                roomWidth,
                roomHeight,
                0.2
            ),
            wallMaterial
        );

    backWall.position.set(
        0,
        roomHeight / 2,
        -roomDepth / 2
    );

    scene.add(backWall);


    const frontWall =
        new THREE.Mesh(
            new THREE.BoxGeometry(
                roomWidth,
                roomHeight,
                0.2
            ),
            wallMaterial
        );

    frontWall.position.set(
        0,
        roomHeight / 2,
        roomDepth / 2
    );

    scene.add(frontWall);


    const leftWall =
        new THREE.Mesh(
            new THREE.BoxGeometry(
                0.2,
                roomHeight,
                roomDepth
            ),
            wallMaterial
        );

    leftWall.position.set(
        -roomWidth / 2,
        roomHeight / 2,
        0
    );

    scene.add(leftWall);


    const rightWall =
        new THREE.Mesh(
            new THREE.BoxGeometry(
                0.2,
                roomHeight,
                roomDepth
            ),
            wallMaterial
        );

    rightWall.position.set(
        roomWidth / 2,
        roomHeight / 2,
        0
    );

    scene.add(rightWall);

    // Objects

    for (const object of sceneData.objects) {
    
        const generator = generators[object.type];
    
        if (!generator) {
            console.warn(
                `No generator found for object type: ${object.type}`
            );
            continue;
        }
    
        const object3D = generator();
        object3D.position.set(object.x, object.y, object.z);
        object3D.name = object.id;
        
        // Keep the object's real bounding box inside the walls,
        // no matter how object.x/z were computed upstream
        const box = new THREE.Box3().setFromObject(object3D);
        const innerHalfWidth = roomWidth / 2 - 0.1;
        const innerHalfDepth = roomDepth / 2 - 0.1;
        
        const overLeft = -innerHalfWidth - box.min.x;
        if (overLeft > 0) object3D.position.x += overLeft;
        
        const overRight = box.max.x - innerHalfWidth;
        if (overRight > 0) object3D.position.x -= overRight;
        
        const overBack = -innerHalfDepth - box.min.z;
        if (overBack > 0) object3D.position.z += overBack;
        
        const overFront = box.max.z - innerHalfDepth;
        if (overFront > 0) object3D.position.z -= overFront;
        
        scene.add(object3D);
    }

    // Lighting

    const ambientLight =
        new THREE.AmbientLight(
            0xffffff,
            1
        );

    scene.add(ambientLight);


    const directionalLight =
        new THREE.DirectionalLight(
            0xffffff,
            2
        );

    directionalLight.position.set(
        5,
        10,
        5
    );

    scene.add(directionalLight);

}