import type { ManualOverrides, SceneData } from "./SceneData";

const API = "http://127.0.0.1:8000/api/scenes/";
export type SceneResponse = {
  id: number;
  image: string;
  scene_data: SceneData;
  manual_overrides: ManualOverrides;
};

export async function fetchScene(id: number, signal?: AbortSignal): Promise<SceneResponse> {
  const response = await fetch(`${API}${id}/`, { signal, cache: "no-store" });
  if (!response.ok) throw new Error("Failed to load saved scene.");
  return response.json();
}

export async function saveOverrides(id: number, overrides: ManualOverrides) {
  const response = await fetch(`${API}${id}/`, {
    method: "PATCH",
    signal: AbortSignal.timeout(15000),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ manual_overrides: overrides }),
  });
  if (!response.ok) throw new Error("Could not save edits. Retry to keep your changes.");
}
