"use client";

import { useEffect, useRef, useState } from "react";
import SceneViewer from "@/components/SceneViewer";
import type { SceneData } from "@/lib/SceneData";

import { fetchScene, type SceneResponse } from "@/lib/sceneApi";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [sceneData, setSceneData] = useState<SceneData | null>(null);
  const [activeScene, setActiveScene] = useState<SceneResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Optional: Create a local URL to show a tiny preview of the selected image
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const restoreRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    const abort = new AbortController();
    restoreRequest.current = abort;
    const id = Number(new URLSearchParams(window.location.search).get("scene"));
    if (Number.isSafeInteger(id) && id > 0) {
      fetchScene(id, abort.signal)
        .then((scene) => {
          if (abort.signal.aborted) return;
          setActiveScene(scene);
          setSceneData(scene.scene_data);
          setPreviewUrl(scene.image);
        })
        .catch((error) => {
          if (!abort.signal.aborted) setError(error.message);
        });
    }
    return () => abort.abort();
  }, []);

  const rememberScene = (id: number | null) => {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("scene", String(id));
    else url.searchParams.delete("scene");
    window.history.replaceState(null, "", url);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0] ?? null;
    setFile(selectedFile);
    setError("");

    if (selectedFile) {
      setPreviewUrl(URL.createObjectURL(selectedFile));
    } else {
      setPreviewUrl(null);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError("Please select an image to generate a 3D model.");
      return;
    }

    setLoading(true);
    restoreRequest.current?.abort();
    setError("");
    setSceneData(null);

    try {
      const formData = new FormData();
      formData.append("image", file);

      const uploadResponse = await fetch("http://127.0.0.1:8000/api/scenes/", {
        method: "POST",
        body: formData,
      });

      if (!uploadResponse.ok) throw new Error("Upload failed.");

      const uploadedScene: SceneResponse = await uploadResponse.json();

      const scene = await fetchScene(uploadedScene.id);
      setActiveScene(scene);
      setPreviewUrl(scene.image);
      rememberScene(scene.id);
      setSceneData(scene.scene_data);
    } catch (err) {
      console.error(err);
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const resetState = () => {
    rememberScene(null);
    setActiveScene(null);
    setSceneData(null);
    setFile(null);
    setPreviewUrl(null);
  };

  return (
    <main className="min-h-screen w-full bg-[#fafafa] text-zinc-900 font-sans selection:bg-zinc-200">
      {/* --- UPLOAD UI --- */}
      {!sceneData && (
        <div className="flex flex-col items-center justify-center min-h-screen p-4 sm:p-8 animate-in fade-in duration-700">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-[0_2px_40px_-12px_rgba(0,0,0,0.1)] border border-zinc-200 p-8">
            <div className="text-center mb-8">
              <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 mb-2">
                Spatialize
              </h1>
              <p className="text-sm text-zinc-500">Upload a 2D image to generate a 3D model.</p>
            </div>

            {/* Custom File Input Area */}
            <div className="mb-6">
              <label
                htmlFor="file-upload"
                className={`relative flex flex-col items-center justify-center w-full h-48 rounded-xl border-2 border-dashed transition-all cursor-pointer overflow-hidden group ${
                  file
                    ? "border-zinc-300 bg-zinc-50"
                    : "border-zinc-200 bg-white hover:border-zinc-400 hover:bg-zinc-50"
                }`}
              >
                {previewUrl ? (
                  // Image Selected State
                  <div className="flex flex-col items-center justify-center w-full h-full p-4 text-center">
                    <div className="w-16 h-16 mb-3 rounded-lg overflow-hidden border border-zinc-200 shadow-sm">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                    </div>
                    <p className="text-sm font-medium text-zinc-700 truncate w-full px-4">
                      {file?.name}
                    </p>
                    <p className="text-xs text-zinc-400 mt-1">Click to choose a different image</p>
                  </div>
                ) : (
                  // Empty State
                  <div className="flex flex-col items-center justify-center py-6">
                    <div className="p-3 bg-zinc-100 rounded-full mb-3 group-hover:scale-105 transition-transform">
                      <svg
                        className="w-6 h-6 text-zinc-500"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                        />
                      </svg>
                    </div>
                    <p className="text-sm font-medium text-zinc-700">Click to browse files</p>
                    <p className="text-xs text-zinc-400 mt-1">Supports JPG, PNG, WEBP</p>
                  </div>
                )}

                <input
                  id="file-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-100 flex items-start gap-2 text-red-600 text-sm">
                <svg
                  className="w-4 h-4 mt-0.5 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span>{error}</span>
              </div>
            )}

            {/* Action Button */}
            <button
              onClick={handleUpload}
              disabled={loading || !file}
              className="w-full cursor-pointer relative flex items-center justify-center gap-2 bg-zinc-900 text-white text-sm font-medium h-11 rounded-xl transition-all hover:bg-zinc-800 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
            >
              {loading ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Generating 3D Model...
                </>
              ) : (
                "Generate Model"
              )}
            </button>
          </div>
        </div>
      )}

      {/* --- SCENE VIEWER UI --- */}
      {sceneData && (
        <div className="relative w-full h-screen bg-zinc-950 animate-in fade-in duration-1000">
          {/* Subtle overlay header for the 3D viewer */}
          <div className="absolute top-0 left-0 right-0 p-6 z-10 flex justify-between items-center pointer-events-none">
            <h2 className="text-white/80 font-medium tracking-wide">Spatialize Viewer</h2>
            <button
              onClick={resetState}
              className="pointer-events-auto px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm rounded-lg backdrop-blur-md transition-colors border border-white/10"
            >
              Upload New Image
            </button>
          </div>

          <SceneViewer
            key={activeScene?.id}
            sceneId={activeScene?.id}
            manualOverrides={activeScene?.manual_overrides}
            sceneData={sceneData}
            sourceImageUrl={previewUrl}
          />
        </div>
      )}
    </main>
  );
}
