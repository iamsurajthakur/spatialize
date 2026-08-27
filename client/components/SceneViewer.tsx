"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { ThreeMFLoader } from "three/examples/jsm/Addons.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

type SceneObject = {
    id: string
    type: string
    x: number
    y: number
    z: number
    width: number
    height: number
    depth: number
}

type SceneData = {
    room_size_hint: {
        width: number
        height: number
        depth: number
    }

    objects: SceneObject[]
}

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


        // -----------------------------------
        // Cleanup
        // -----------------------------------

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

function buildScene(
    scene: THREE.Scene,
    sceneData: SceneData
) {
    const wallMaterial = new THREE.MeshStandardMaterial({
        color: 0xaaaaa,
    })

    const furnitureMaterial = new THREE.MeshStandardMaterial({
        color: 0x8b5a2b,
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

        const geometry =
            new THREE.BoxGeometry(
                object.width,
                object.height,
                object.depth
            );

        const mesh =
            new THREE.Mesh(
                geometry,
                furnitureMaterial
            );


        // grid -> three.js world coordinates
        // our sample data directly represents world coordinates for now later this function will convert vlm grid coordinates into world space.

        mesh.position.set(
            object.x,
            object.y,
            object.z
        );

        mesh.name = object.id;

        scene.add(mesh);
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