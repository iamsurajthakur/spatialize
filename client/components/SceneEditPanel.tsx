import type { ManualTransform } from "@/lib/SceneData";
import type { EditMode, Selection } from "@/lib/sceneEditor";

export default function SceneEditPanel({
  selection,
  mode,
  onMode,
  onEdit,
  onReset,
  onClose,
  embedded = false,
}: {
  selection: NonNullable<Selection>;
  mode: EditMode;
  onMode: (mode: EditMode) => void;
  onEdit: (transform: ManualTransform) => void;
  onReset: () => void;
  onClose: () => void;
  embedded?: boolean;
}) {
  return (
    <section
      aria-label="Edit selected object"
      className={`viewer-edit-panel${embedded ? " is-embedded" : ""}`}
    >
      {!embedded && (
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0">
            <p className="font-semibold text-sm capitalize">{selection.type}</p>
            <p className="truncate text-zinc-400">{selection.id}</p>
          </div>
          <button aria-label="Deselect object" onClick={onClose} className="viewer-icon-button">
            ×
          </button>
        </div>
      )}
      <div className="viewer-edit-modes">
        {(["translate", "rotate"] as const).map((value) => (
          <button
            key={value}
            aria-pressed={mode === value}
            onClick={() => onMode(value)}
            className="viewer-edit-mode"
          >
            {value === "translate" ? "Move (G)" : "Rotate (R)"}
          </button>
        ))}
        {embedded && (
          <button
            aria-label="Deselect object"
            title="Deselect object"
            onClick={onClose}
            className="viewer-icon-button"
          >
            ×
          </button>
        )}
      </div>
      {(
        [
          ["x", "X position"],
          ["z", "Z position"],
          ["rotation_y", "Y rotation (°)"],
        ] as const
      ).map(([field, label]) => (
        <label key={field} className="flex items-center justify-between gap-2 mb-2">
          {label}
          <input
            key={`${selection.id}:${selection.transform[field]}`}
            type="number"
            step={field === "rotation_y" ? 1 : 0.05}
            defaultValue={Number(selection.transform[field].toFixed(3))}
            onBlur={(event) => {
              const value = event.currentTarget.valueAsNumber;
              if (Number.isFinite(value)) onEdit({ ...selection.transform, [field]: value });
              // Also restore the displayed value when clamping rejects a change
              // or returns the same transform (so React does not replace the input).
              event.currentTarget.value = String(Number(selection.transform[field].toFixed(3)));
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            className="viewer-edit-input"
          />
        </label>
      ))}
      <button onClick={onReset} className="viewer-reset-object">
        Reset object
      </button>
      <p className="viewer-property-note mt-3">
        Drag the arrows or floor handle. Edits save automatically.{!embedded && " Esc deselects."}
      </p>
    </section>
  );
}
