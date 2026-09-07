"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { ManualOverrides, SceneData } from "@/lib/SceneData";
import { buildScene, createSceneCamera, disposeScene, type ViewMode } from "@/lib/sceneBuilder";

import {
  createSceneEditor,
  type SceneEditor,
  type Selection,
  type EditMode,
} from "@/lib/sceneEditor";
import { useManualOverrides } from "@/lib/useManualOverrides";
import SceneEditPanel from "./SceneEditPanel";

const EMPTY_OVERRIDES: ManualOverrides = {};

export default function SceneViewer({
  sceneData,
  sourceImageUrl,
  sceneId,
  manualOverrides = EMPTY_OVERRIDES,
}: {
  sceneData: SceneData;
  sceneId?: number;
  manualOverrides?: ManualOverrides;
  sourceImageUrl?: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<ViewMode>("source");
  const [showDebug, setShowDebug] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const editorRef = useRef<SceneEditor | null>(null);
  const selectionRef = useRef<string | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [editMode, setEditMode] = useState<EditMode>("translate");
  const { overrides, status, update, save } = useManualOverrides(sceneId, manualOverrides);
  const objectDebug = sceneData.debug_info?.objects;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x252830);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    const {
      camera,
      target,
      aspect: sourceAspect,
    } = createSceneCamera(sceneData, container.clientWidth / container.clientHeight, mode);
    const controls = new OrbitControls(camera);
    controls.target.copy(target);
    controls.enableDamping = true;
    const room = buildScene(scene, sceneData);
    const editor = sceneId
      ? createSceneEditor({
          scene,
          camera,
          canvas: renderer.domElement,
          orbit: controls,
          data: sceneData,
          objects: room.objects,
          overrides: overrides.current,
          onSelect: (value) => {
            selectionRef.current = value?.id ?? null;
            setSelection(value);
          },
          onChange: update,
          onCommit: save,
          onMode: setEditMode,
        })
      : null;
    editorRef.current = editor;
    editor?.select(selectionRef.current);
    // Register TransformControls first so it disables orbit before a gizmo pointerdown.
    controls.connect(renderer.domElement);

    const resize = () => {
      const width = container.clientWidth,
        height = container.clientHeight;
      renderer.setSize(width, height);
      if (mode === "source" && sceneData.camera) {
        // Fit the source aspect inside the viewport without stretching its camera.
        const w = Math.min(width, height * sourceAspect),
          h = w / sourceAspect;
        const viewport = new THREE.Vector4((width - w) / 2, (height - h) / 2, w, h);
        renderer.setViewport(viewport);
        editor?.setViewport(viewport);
      } else {
        const aspect = width / height;
        if (camera instanceof THREE.PerspectiveCamera) camera.aspect = aspect;
        else {
          const halfHeight = (camera.top - camera.bottom) / 2;
          camera.left = -halfHeight * aspect;
          camera.right = halfHeight * aspect;
        }
        camera.updateProjectionMatrix();
      }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();
    let frame: number;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      if (controls.enabled) controls.update();
      room.updateWalls(camera);
      renderer.render(scene, camera);
    };
    animate();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      editor?.dispose();
      editorRef.current = null;
      controls.dispose();
      disposeScene(scene);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [sceneData, mode, sceneId, overrides, update, save]);

  return (
    <div className="h-full w-full flex flex-col pt-20">
      <div className="flex flex-wrap gap-2 px-4 pb-3 text-sm text-white">
        {(["source", "overview", "top"] as const).map((view) => (
          <button
            key={view}
            onClick={() => setMode(view)}
            className={`px-3 py-1 rounded ${mode === view ? "bg-white/25" : "bg-white/10"}`}
          >
            {view === "source" ? "Source view" : view === "top" ? "Top view" : "Overview"}
          </button>
        ))}
        {sceneId && (
          <span
            className="ml-auto self-center text-xs text-zinc-300"
            role="status"
            aria-live="polite"
          >
            {status === "saving"
              ? "Saving…"
              : status === "error"
                ? "Edits not saved."
                : status === "editing"
                  ? "Editing…"
                  : "All edits saved"}
            {status === "error" && (
              <button onClick={() => void save()} className="ml-2 underline text-sky-300">
                Retry save
              </button>
            )}
          </span>
        )}
        {objectDebug && (
          <button
            className="px-3 py-1 rounded bg-white/10"
            onClick={() => setShowDebug(!showDebug)}
          >
            Placement details
          </button>
        )}
      </div>
      <div className="flex flex-1 min-h-0 flex-col md:flex-row">
        {sourceImageUrl && (
          <div className="relative flex items-center justify-center md:w-2/5 h-1/3 md:h-full bg-zinc-900">
            <div className="relative w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={sourceImageUrl}
                alt="Source room"
                className="w-full max-h-full object-contain"
              />
              {showDebug && objectDebug && (
                <svg
                  viewBox="0 0 1 1"
                  preserveAspectRatio="none"
                  className="absolute inset-0 w-full h-full"
                >
                  {sceneData.debug_info?.floor_mapping.image_quad && (
                    <polygon
                      points={sceneData.debug_info.floor_mapping.image_quad
                        .map((point) => point.join(","))
                        .join(" ")}
                      fill="none"
                      stroke="#38bdf8"
                      strokeWidth="0.003"
                    />
                  )}
                  {Object.entries(objectDebug).map(([id, debug]) => (
                    <g key={id} onClick={() => setSelected(id)} style={{ cursor: "pointer" }}>
                      <circle
                        cx={debug.floor_contact.x}
                        cy={debug.floor_contact.y}
                        r="0.007"
                        fill="#fbbf24"
                      >
                        <title>{id}: input anchor</title>
                      </circle>
                      {debug.reprojected_floor_contact && (
                        <>
                          <line
                            x1={debug.floor_contact.x}
                            y1={debug.floor_contact.y}
                            x2={debug.reprojected_floor_contact.x}
                            y2={debug.reprojected_floor_contact.y}
                            stroke="#f87171"
                            strokeWidth="0.002"
                          />
                          <circle
                            cx={debug.reprojected_floor_contact.x}
                            cy={debug.reprojected_floor_contact.y}
                            r="0.005"
                            fill="#4ade80"
                          >
                            <title>{id}: final anchor</title>
                          </circle>
                        </>
                      )}
                    </g>
                  ))}
                </svg>
              )}
            </div>
          </div>
        )}
        <div className="relative flex-1 min-h-0 min-w-0">
          <div ref={containerRef} className="absolute inset-0" />
          {sceneId && selection && (
            <SceneEditPanel
              selection={selection}
              mode={editMode}
              onMode={(value) => editorRef.current?.setMode(value)}
              onEdit={(value) => editorRef.current?.edit(value)}
              onReset={() => editorRef.current?.reset()}
              onClose={() => editorRef.current?.select(null)}
            />
          )}
          {sceneId && !selection && (
            <p className="pointer-events-none absolute bottom-4 inset-x-0 text-center text-xs text-white/70">
              Click furniture to move or rotate it · Drag empty space to orbit
            </p>
          )}
        </div>
        {showDebug && objectDebug && (
          <aside className="w-full md:w-80 max-h-80 md:max-h-full overflow-auto bg-zinc-900 p-4 text-xs text-zinc-200">
            <p className="mb-2">
              Amber: input floor anchor. Green: final placement projected onto the source floor.
            </p>
            <p className="mb-2">
              {sceneData.debug_info?.floor_mapping.method} · camera: {sceneData.camera?.method}
            </p>
            <select
              aria-label="Inspect object"
              value={selected ?? Object.keys(objectDebug)[0] ?? ""}
              onChange={(e) => setSelected(e.target.value)}
              className="w-full bg-zinc-800 p-2 mb-3"
            >
              {Object.keys(objectDebug).map((id) => (
                <option key={id}>{id}</option>
              ))}
            </select>
            <pre className="whitespace-pre-wrap break-words">
              {JSON.stringify(objectDebug[selected ?? Object.keys(objectDebug)[0]], null, 2)}
            </pre>
          </aside>
        )}
      </div>
    </div>
  );
}
