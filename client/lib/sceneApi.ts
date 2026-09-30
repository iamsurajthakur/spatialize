import type { ManualOverrides, SceneData } from "./SceneData";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000")
  .trim()
  .replace(/\/+$/, "");
const API = `${API_BASE}/api/scenes/`;
export type SceneResponse = {
  id: number;
  image: string;
  scene_data: SceneData;
  manual_overrides: ManualOverrides;
};

export async function uploadScene(file: File): Promise<SceneResponse> {
  const body = new FormData();
  body.append("image", file);
  const response = await fetch(API, { method: "POST", body });
  if (!response.ok) {
    const problem = await response.json().catch(() => null);
    const detail =
      ["ai_unavailable", "ai_request_failed"].includes(problem?.code) &&
      typeof problem?.detail === "string"
        ? problem.detail
        : "Could not generate the scene. Please try again.";
    throw new Error(detail);
  }
  return response.json();
}

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
