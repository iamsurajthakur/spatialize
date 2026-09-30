"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type { ImagePoint, ManualOverrides, SceneData } from "@/lib/SceneData";
import type { Selection } from "@/lib/sceneEditor";

const number = (value: number | undefined | null) =>
  value == null || !Number.isFinite(value) ? "—" : Number(value.toFixed(3)).toString();
const point = (value: ImagePoint | null | undefined) =>
  value ? `${number(value.x)}, ${number(value.y)}` : "Not available";
const method = (value: string | undefined | null) =>
  value ? value.replaceAll("_", " ") : "Not available";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="viewer-property">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export default function PlacementInspector({
  sceneData,
  selectedId,
  selection,
  overrides,
  onInspect,
  onClose,
  editControls,
}: {
  sceneData: SceneData;
  selectedId: string | null;
  selection: Selection;
  overrides: ManualOverrides;
  onInspect: (id: string) => void;
  onClose: () => void;
  editControls?: ReactNode;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
  }, []);
  const id = selectedId ?? sceneData.objects[0]?.id;
  const object = sceneData.objects.find((object) => object.id === id);
  const debug = id ? sceneData.debug_info?.objects[id] : undefined;
  const transform = selection?.id === id ? selection.transform : id ? overrides[id] : undefined;
  return (
    <aside
      id="placement-inspector"
      className="viewer-inspector"
      aria-labelledby="inspector-title"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="viewer-inspector-header">
        <h2 id="inspector-title">Placement details</h2>
        <button
          ref={closeRef}
          className="viewer-icon-button"
          onClick={onClose}
          aria-label="Close placement details"
          title="Close placement details"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            aria-hidden="true"
          >
            <path d="m4 4 8 8m0-8-8 8" />
          </svg>
        </button>
      </div>
      <div className="viewer-inspector-scroll">
        <section className="viewer-property-section">
          <label htmlFor="inspect-object" className="viewer-section-title">
            {selection ? "Selected object" : "Inspect object"}
          </label>
          <select
            id="inspect-object"
            aria-label="Inspect object"
            className="viewer-object-select"
            value={id ?? ""}
            onChange={(event) => onInspect(event.target.value)}
          >
            {sceneData.objects.map((object) => (
              <option key={object.id} value={object.id}>
                {object.id}
              </option>
            ))}
          </select>
          {object && (
            <p className="viewer-object-type">
              {object.type}
              <span>{id && overrides[id] ? "Manually adjusted" : "Generated placement"}</span>
            </p>
          )}
        </section>
        {object ? (
          <>
            <section className="viewer-property-section">
              <h3 className="viewer-section-title">Scene placement</h3>
              {editControls ? (
                <>
                  {editControls}
                  <dl>
                    <Row label="Y position">{number(object.y)}</Row>
                  </dl>
                </>
              ) : (
                <dl>
                  <Row label="X position">{number(transform?.x ?? object.x)}</Row>
                  <Row label="Y position">{number(object.y)}</Row>
                  <Row label="Z position">{number(transform?.z ?? object.z)}</Row>
                  <Row label="Y rotation">
                    {number(transform?.rotation_y ?? object.rotation_y ?? 0)}°
                  </Row>
                </dl>
              )}
              <p className="viewer-property-note">Scene units · estimated geometry</p>
            </section>
            <section className="viewer-property-section">
              <h3 className="viewer-section-title">Source detection</h3>
              {debug ? (
                <>
                  <dl>
                    <Row label="Bounding box min">
                      {debug.bbox_normalized
                        ? `${number(debug.bbox_normalized.x_min)}, ${number(debug.bbox_normalized.y_min)}`
                        : "Not available"}
                    </Row>
                    <Row label="Bounding box max">
                      {debug.bbox_normalized
                        ? `${number(debug.bbox_normalized.x_max)}, ${number(debug.bbox_normalized.y_max)}`
                        : "Not available"}
                    </Row>
                    <Row label="Input anchor">{point(debug.floor_contact)}</Row>
                    <Row label="Projected anchor">{point(debug.reprojected_floor_contact)}</Row>
                    <Row label="Confidence">
                      {debug.confidence == null ? "—" : `${Math.round(debug.confidence * 100)}%`}
                    </Row>
                  </dl>
                  <p className="viewer-property-note">
                    Normalized image coordinates (0–1). Anchors describe the original generation.
                  </p>
                </>
              ) : (
                <p className="viewer-property-note">
                  Source detection data is unavailable for this scene.
                </p>
              )}
            </section>
            <section className="viewer-property-section">
              <h3 className="viewer-section-title">Placement method</h3>
              <dl>
                <Row label="Floor mapping">
                  {method(sceneData.debug_info?.floor_mapping.method)}
                </Row>
                <Row label="Contact method">{method(debug?.contact_method)}</Row>
                <Row label="Wall">
                  {debug?.wall_selected ? method(debug.wall_selected) : "None recorded"}
                </Row>
                <Row label="Camera">{method(sceneData.camera?.method)}</Row>
              </dl>
              {!!debug?.warnings?.length && (
                <ul className="viewer-warnings">
                  {debug.warnings.map((warning, index) => (
                    <li key={index}>{warning}</li>
                  ))}
                </ul>
              )}
            </section>
          </>
        ) : (
          <p className="viewer-property-note">No objects available to inspect.</p>
        )}
        <details className="viewer-advanced">
          <summary>
            Advanced <span>Raw placement data</span>
          </summary>
          <p className="viewer-property-note">
            Complete generated data is retained below. Manual edits are listed separately.
          </p>
          <details>
            <summary>Selected object JSON</summary>
            <pre>
              {JSON.stringify(
                { object, placement: debug, manual_override: id ? (overrides[id] ?? null) : null },
                null,
                2,
              )}
            </pre>
          </details>
          <details>
            <summary>Complete scene JSON</summary>
            <pre>
              {JSON.stringify({ scene_data: sceneData, manual_overrides: overrides }, null, 2)}
            </pre>
          </details>
        </details>
      </div>
    </aside>
  );
}
