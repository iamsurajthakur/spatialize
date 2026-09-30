"use client";

import { JSX, useEffect, useRef, useState, type CSSProperties } from "react";
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
import SourcePanel from "./SourcePanel";
import PlacementInspector from "./PlacementInspector";
import "./viewer.css";

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
      <svg
        viewBox="0 0 16 16"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      >
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
      <svg
        viewBox="0 0 16 16"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      >
        <path d="M8 1.6 14 5v6L8 14.4 2 11V5z" />
        <path d="M2 5l6 3.4L14 5M8 8.4v6" />
      </svg>
    ),
  },
  {
    id: "top",
    label: "Top",
    icon: (
      <svg
        viewBox="0 0 16 16"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      >
        <rect x="2.5" y="2.5" width="11" height="11" rx="1.2" />
        <circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
];

function StatusDot({
  status,
}: {
  status: "idle" | "editing" | "saving" | "error" | "saved" | string;
}) {
  const color =
    status === "error"
      ? "#F87171"
      : status === "saving" || status === "editing"
        ? ACCENT
        : "#4ADE80";
  return (
    <span className="viewer-status-dot" style={{ backgroundColor: color }} aria-hidden="true" />
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
  const comparisonRef = useRef<HTMLDivElement>(null);
  const detailsButtonRef = useRef<HTMLButtonElement>(null);
  const resetCameraRef = useRef<(() => void) | null>(null);
  const [sourceWidth, setSourceWidth] = useState(36);
  const [mode, setMode] = useState<ViewMode>("source");
  const [showDebug, setShowDebug] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const editorRef = useRef<SceneEditor | null>(null);
  const selectionRef = useRef<string | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [editMode, setEditMode] = useState<EditMode>("translate");
  const { overrides, status, update, save } = useManualOverrides(sceneId, manualOverrides);
  const inspectedId = selection?.id ?? selected;
  const inspect = (id: string) => {
    setSelected(id);
    editorRef.current?.select(id);
  };
  const closeInspector = () => {
    setShowDebug(false);
    detailsButtonRef.current?.focus();
  };

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
    controls.saveState();
    resetCameraRef.current = () => controls.reset();
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
            setSelected(value?.id ?? null);
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
      if (!width || !height) return;
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
      resetCameraRef.current = null;
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
    <div className="viewer-body">
      <div className="viewer-toolbar" aria-label="Viewer controls">
        <div className="viewer-view-switcher" role="group" aria-label="Camera view">
          {VIEW_OPTIONS.map(({ id, label, icon }) => (
            <button
              key={id}
              onClick={() => setMode(id)}
              aria-pressed={mode === id}
              title={
                id === "source"
                  ? "Match the source image camera"
                  : id === "top"
                    ? "View the room from above"
                    : "View the room in perspective"
              }
            >
              <span aria-hidden="true">{icon}</span>
              {label}
            </button>
          ))}
        </div>
        <div className="viewer-toolbar-actions">
          <button
            className="viewer-icon-button viewer-reset-camera"
            onClick={() => resetCameraRef.current?.()}
            aria-label="Reset camera"
            title="Reset camera to the current view"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 6a5.4 5.4 0 1 1-.2 4M3 2.5V6h3.5" />
            </svg>
          </button>
          {sceneId && (
            <div className="viewer-save-status" role="status" aria-live="polite">
              <StatusDot status={status} />
              <span>{statusLabel}</span>
              {status === "error" && <button onClick={() => void save()}>Retry</button>}
            </div>
          )}
          <span className="viewer-toolbar-divider" aria-hidden="true" />
          <button
            ref={detailsButtonRef}
            className="viewer-details-toggle"
            onClick={() => setShowDebug(!showDebug)}
            aria-expanded={showDebug}
            aria-controls="placement-inspector"
            aria-label="Placement details"
            title="Placement details"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
              aria-hidden="true"
            >
              <rect x="2" y="2.5" width="12" height="11" rx="1" />
              <path d="M10 2.5v11M12 5h.1M12 8h.1M12 11h.1" />
            </svg>
            <span>Placement details</span>
          </button>
        </div>
      </div>
      <div className="viewer-workspace">
        <div
          ref={comparisonRef}
          className="viewer-comparison"
          style={{ "--source-width": `${sourceWidth}%` } as CSSProperties}
        >
          {sourceImageUrl && (
            <>
              <SourcePanel
                url={sourceImageUrl}
                sceneData={sceneData}
                showDetails={showDebug}
                selectedId={inspectedId}
                onInspect={inspect}
              />
              <div
                className="viewer-splitter"
                role="separator"
                tabIndex={0}
                aria-label="Resize source comparison"
                aria-orientation="vertical"
                aria-valuenow={Math.round(sourceWidth)}
                aria-valuemin={24}
                aria-valuemax={45}
                aria-valuetext={`${Math.round(sourceWidth)} percent source image`}
                title="Drag to resize · Arrow keys adjust · Double-click to reset"
                onPointerDown={(event) => {
                  if (event.button === 0) {
                    event.preventDefault();
                    event.currentTarget.focus();
                    event.currentTarget.setPointerCapture(event.pointerId);
                  }
                }}
                onPointerMove={(event) => {
                  if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
                  const bounds = comparisonRef.current?.getBoundingClientRect();
                  if (bounds?.width)
                    setSourceWidth(
                      Math.max(
                        24,
                        Math.min(45, ((event.clientX - bounds.left) / bounds.width) * 100),
                      ),
                    );
                }}
                onPointerUp={(event) => {
                  if (event.currentTarget.hasPointerCapture(event.pointerId))
                    event.currentTarget.releasePointerCapture(event.pointerId);
                }}
                onDoubleClick={() => setSourceWidth(36)}
                onKeyDown={(event) => {
                  if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
                    event.preventDefault();
                    setSourceWidth((width) =>
                      event.key === "Home"
                        ? 24
                        : event.key === "End"
                          ? 45
                          : Math.max(
                              24,
                              Math.min(45, width + (event.key === "ArrowRight" ? 2 : -2)),
                            ),
                    );
                  }
                }}
              >
                <span />
              </div>
            </>
          )}
          <section className="viewer-scene" aria-label="Interactive 3D scene">
            <div className="viewer-panel-heading">
              <h2>3D scene</h2>
              <span className={selection ? "viewer-active-object" : ""}>
                {selection ? selection.id : `${sceneData.objects.length} objects`}
              </span>
            </div>
            <div className="viewer-canvas-area">
              <div ref={containerRef} className="viewer-canvas" />
              {sceneId && selection && !showDebug && (
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
                <div className="viewer-hints" aria-label="Scene interaction hints">
                  <span>Click furniture to move or rotate</span>
                  <span>Drag empty space to orbit</span>
                </div>
              )}
            </div>
          </section>
        </div>
        {showDebug && (
          <PlacementInspector
            sceneData={sceneData}
            selectedId={inspectedId}
            selection={selection}
            overrides={overrides.current}
            onInspect={inspect}
            onClose={closeInspector}
            editControls={
              sceneId && selection ? (
                <SceneEditPanel
                  embedded
                  selection={selection}
                  mode={editMode}
                  onMode={(value) => editorRef.current?.setMode(value)}
                  onEdit={(value) => editorRef.current?.edit(value)}
                  onReset={() => editorRef.current?.reset()}
                  onClose={() => editorRef.current?.select(null)}
                />
              ) : undefined
            }
          />
        )}
      </div>
    </div>
  );
}
