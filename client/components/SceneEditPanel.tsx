import type { ManualTransform } from "@/lib/SceneData";
import type { EditMode, Selection } from "@/lib/sceneEditor";

export default function SceneEditPanel({
  selection,
  mode,
  onMode,
  onEdit,
  onReset,
  onClose,
}: {
  selection: NonNullable<Selection>;
  mode: EditMode;
  onMode: (mode: EditMode) => void;
  onEdit: (transform: ManualTransform) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  return (
    <section
      aria-label="Edit selected object"
      className="absolute top-3 left-3 w-56 rounded-xl border border-white/15 bg-zinc-900/95 p-3 text-xs text-zinc-200 shadow-xl"
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <p className="font-semibold text-sm capitalize">{selection.type}</p>
          <p className="truncate text-zinc-400">{selection.id}</p>
        </div>
        <button
          aria-label="Deselect object"
          onClick={onClose}
          className="px-2 py-1 rounded bg-white/10"
        >
          ×
        </button>
      </div>
      <div className="flex gap-2 mb-3">
        {(["translate", "rotate"] as const).map((value) => (
          <button
            key={value}
            aria-pressed={mode === value}
            onClick={() => onMode(value)}
            className={`flex-1 rounded px-2 py-2 ${mode === value ? "bg-sky-600 text-white" : "bg-white/10"}`}
          >
            {value === "translate" ? "Move (G)" : "Rotate (R)"}
          </button>
        ))}
      </div>
      {(
        [
          ["x", "X position (m)"],
          ["z", "Z position (m)"],
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
            className="w-24 rounded bg-zinc-800 px-2 py-1.5 border border-white/10"
          />
        </label>
      ))}
      <button onClick={onReset} className="w-full rounded bg-white/10 px-3 py-2 mt-1">
        Reset object
      </button>
      <p className="mt-2 text-zinc-400">
        Drag the arrows or floor handle. Edits save automatically. Esc deselects.
      </p>
    </section>
  );
}
