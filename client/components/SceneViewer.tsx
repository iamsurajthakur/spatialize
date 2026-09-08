"use client";

import { JSX, useEffect, useRef, useState } from "react";
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

// A single warm accent — brass, like an instrument on a tripod — set against
// the cool graphite chrome. Kept apart from the amber/red/green/sky used in
// the debug overlay, which carry their own meaning and shouldn't compete.
const ACCENT = "#D4A056";

const VIEW_OPTIONS: { id: ViewMode; label: string; icon: JSX.Element }[] = [
  {
    id: "source",
    label: "Source",
    icon: (
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4">
        <rect x="2" y="3" width="12" height="10" rx="1.2" />
        <circle cx="5.6" cy="6.4" r="1" />
        <path d="M2.8 11.5 6 8.4a1 1 0 0 1 1.4 0L9 10l1.4-1.4a1 1 0 0 1 1.4 0l1.4 1.4" />
      </svg>
    ),
  },
  {
    id: "overview",
    label: "Overview",
    icon: (
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
        <path d="M8 1.6 14 5v6L8 14.4 2 11V5z" />
        <path d="M2 5l6 3.4L14 5M8 8.4v6" />
      </svg>
    ),
  },
  {
    id: "top",
    label: "Top",
    icon: (
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4">
        <rect x="2.5" y="2.5" width="11" height="11" rx="1.2" />
        <circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
];

function StatusDot({ status }: { status: "idle" | "editing" | "saving" | "error" | "saved" | string }) {
  const color =
    status === "error" ? "#F87171" : status === "saving" || status === "editing" ? ACCENT : "#4ADE80";
  return (
    <span className="relative flex h-1.5 w-1.5">
      {status === "saving" && (
        <span
          className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
          style={{ backgroundColor: color }}
        />
      )}
      <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
    </span>
  );
}

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

  const statusLabel =
    status === "saving"
      ? "Saving"
      : status === "error"
        ? "Not saved"
        : status === "editing"
          ? "Editing"
          : "Saved";

  return (
    <div className="h-full w-full flex flex-col pt-20 bg-[#101114] text-white">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.07] bg-[#17181B]/95 backdrop-blur">
        <div className="flex items-center gap-0.5 rounded-md bg-white/[0.04] p-0.5">
          {VIEW_OPTIONS.map(({ id, label, icon }) => {
            const active = mode === id;
            return (
              <button
                key={id}
                onClick={() => setMode(id)}
                aria-pressed={active}
                className={`flex items-center gap-1.5 rounded px-2.5 py-1.5 text-[13px] leading-none transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40 ${
                  active ? "bg-white/[0.09] text-white" : "text-white/45 hover:text-white/75"
                }`}
                style={active ? { color: "#F0D9B5" } : undefined}
              >
                <span style={active ? { color: ACCENT } : undefined}>{icon}</span>
                {label}
              </button>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-3">
          {sceneId && (
            <div className="flex items-center gap-1.5 text-[12px] text-white/50" role="status" aria-live="polite">
              <StatusDot status={status} />
              <span>{statusLabel}</span>
              {status === "error" && (
                <button
                  onClick={() => void save()}
                  className="ml-1 underline decoration-white/30 underline-offset-2 hover:text-white/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40 rounded"
                >
                  Retry
                </button>
              )}
            </div>
          )}

          {objectDebug && (
            <>
              <div className="h-4 w-px bg-white/10" />
              <button
                onClick={() => setShowDebug(!showDebug)}
                aria-pressed={showDebug}
                className={`flex items-center gap-1.5 rounded px-2 py-1.5 text-[13px] leading-none transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40 ${
                  showDebug ? "text-white bg-white/[0.07]" : "text-white/45 hover:text-white/75"
                }`}
              >
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4">
                  <path d="M2 5.5 8 2l6 3.5v5L8 14 2 10.5z" />
                  <path d="M2 5.5 8 9l6-3.5M8 9v5" />
                </svg>
                Placement details
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-1 min-h-0 flex-col md:flex-row">
        {sourceImageUrl && (
          <div className="relative flex items-center justify-center md:w-2/5 h-1/3 md:h-full bg-[#0B0C0E] border-b md:border-b-0 md:border-r border-white/[0.06]">
            <div className="relative w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={sourceImageUrl}
                alt="Source room"
                className="w-full max-h-full object-contain"
              />
              <span className="pointer-events-none absolute left-2.5 bottom-2.5 rounded bg-black/50 px-1.5 py-0.5 font-mono text-[10px] tracking-tight text-white/60">
                source photo
              </span>
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
            <div className="pointer-events-none absolute bottom-4 inset-x-0 flex justify-center">
              <div className="flex items-center gap-2.5 rounded-full border border-white/10 bg-black/40 backdrop-blur px-3 py-1.5 text-[11px] text-white/60">
                <span className="flex items-center gap-1.5">
                  <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.4">
                    <path d="M4 2v9.5a.9.9 0 0 0 1.5.7l1.6-1.4 1 3 1.7-.7-1-3h2.2z" />
                  </svg>
                  Click furniture to move or rotate
                </span>
                <span className="h-3 w-px bg-white/15" />
                <span className="flex items-center gap-1.5">
                  <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.4">
                    <path d="M8 2a6 6 0 1 1-5.2 3" />
                    <path d="M2 2.5v3h3" />
                  </svg>
                  Drag empty space to orbit
                </span>
              </div>
            </div>
          )}
        </div>

        {showDebug && objectDebug && (
          <aside className="w-full md:w-80 max-h-80 md:max-h-full overflow-auto bg-[#17181B] border-t md:border-t-0 md:border-l border-white/[0.07] p-4 text-xs">
            <h2 className="text-[13px] font-medium text-white/90 mb-3">Placement details</h2>

            <div className="flex flex-col gap-1.5 mb-3 text-white/60">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#fbbf24" }} />
                Input floor anchor, from the source photo
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#4ade80" }} />
                Final placement, projected onto the floor
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border border-white/[0.07] bg-white/[0.03] px-2.5 py-1.5 mb-3 font-mono text-[11px] text-white/50">
              <span>{sceneData.debug_info?.floor_mapping.method}</span>
              <span>camera · {sceneData.camera?.method}</span>
            </div>

            <div className="relative mb-3">
              <select
                aria-label="Inspect object"
                value={selected ?? Object.keys(objectDebug)[0] ?? ""}
                onChange={(e) => setSelected(e.target.value)}
                className="w-full appearance-none rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1.5 pr-7 text-[12px] text-white/85 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
              >
                {Object.keys(objectDebug).map((id) => (
                  <option key={id} value={id} className="bg-[#17181B]">
                    {id}
                  </option>
                ))}
              </select>
              <svg
                viewBox="0 0 16 16"
                width="12"
                height="12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40"
              >
                <path d="M4 6l4 4 4-4" />
              </svg>
            </div>

            <pre className="whitespace-pre-wrap break-words rounded-md border border-white/[0.07] bg-black/30 p-3 font-mono text-[11px] leading-relaxed text-white/70">
              {JSON.stringify(objectDebug[selected ?? Object.keys(objectDebug)[0]], null, 2)}
            </pre>
          </aside>
        )}
      </div>
    </div>
  );
}