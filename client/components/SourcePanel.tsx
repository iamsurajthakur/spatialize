"use client";

import { useState, type CSSProperties } from "react";
import type { SceneData } from "@/lib/SceneData";

export default function SourcePanel({
  url,
  sceneData,
  showDetails,
  selectedId,
  onInspect,
}: {
  url: string;
  sceneData: SceneData;
  showDetails: boolean;
  selectedId: string | null;
  onInspect: (id: string) => void;
}) {
  const [aspect, setAspect] = useState(sceneData.camera?.image_aspect_ratio ?? 1);
  const objects = sceneData.debug_info?.objects;
  return (
    <section className="viewer-source" aria-label="Source image comparison">
      <div className="viewer-panel-heading">
        <h2>Source photo</h2>
        <span>Reference</span>
      </div>
      <div className="viewer-source-stage">
        <div className="viewer-source-image" style={{ "--source-aspect": aspect } as CSSProperties}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt="Source room"
            draggable={false}
            onLoad={(event) => {
              const image = event.currentTarget;
              if (image.naturalHeight) setAspect(image.naturalWidth / image.naturalHeight);
            }}
          />
          {showDetails && objects && (
            <svg
              viewBox="0 0 1 1"
              preserveAspectRatio="none"
              className="viewer-source-overlay"
              aria-label="Source placement anchors"
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
              {Object.entries(objects).map(([id, debug]) => (
                <g
                  key={id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Inspect ${id}`}
                  aria-pressed={selectedId === id}
                  onClick={() => onInspect(id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onInspect(id);
                    }
                  }}
                  className="viewer-anchor"
                >
                  {debug.floor_contact && (
                    <circle
                      cx={debug.floor_contact.x}
                      cy={debug.floor_contact.y}
                      r="0.007"
                      fill="#fbbf24"
                    >
                      <title>{id}: input anchor</title>
                    </circle>
                  )}
                  {debug.reprojected_floor_contact && (
                    <>
                      {debug.floor_contact && (
                        <line
                          x1={debug.floor_contact.x}
                          y1={debug.floor_contact.y}
                          x2={debug.reprojected_floor_contact.x}
                          y2={debug.reprojected_floor_contact.y}
                          stroke="#f87171"
                          strokeWidth="0.002"
                        />
                      )}
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
                  {selectedId === id &&
                    (debug.reprojected_floor_contact ?? debug.floor_contact) && (
                      <circle
                        cx={(debug.reprojected_floor_contact ?? debug.floor_contact)!.x}
                        cy={(debug.reprojected_floor_contact ?? debug.floor_contact)!.y}
                        r="0.014"
                        fill="none"
                        stroke="#fff"
                        strokeWidth="0.002"
                      />
                    )}
                </g>
              ))}
            </svg>
          )}
        </div>
      </div>
      <div className="viewer-source-caption">
        {showDetails && objects ? (
          <>
            <span>
              <i className="anchor-input" />
              Input anchor
            </span>
            <span>
              <i className="anchor-final" />
              Final placement
            </span>
          </>
        ) : (
          <span>Original image · uncropped</span>
        )}
      </div>
    </section>
  );
}
