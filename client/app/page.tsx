"use client";

import { useEffect, useRef, useState } from "react";
import SceneViewer from "@/components/SceneViewer";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import UploadCard from "@/components/UploadCard";
import type { SceneData } from "@/lib/SceneData";

import { fetchScene, uploadScene, type SceneResponse } from "@/lib/sceneApi";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [sceneData, setSceneData] = useState<SceneData | null>(null);
  const [activeScene, setActiveScene] = useState<SceneResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
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

  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleFileSelect = (selectedFile: File) => {
    if (loading) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(selectedFile.type)) {
      setError("Choose a JPG, PNG, or WEBP image.");
      return;
    }
    if (selectedFile.size === 0) {
      setError("This image is empty. Please choose another file.");
      return;
    }
    restoreRequest.current?.abort();
    setFile(selectedFile);
    setError("");
    setPreviewUrl(URL.createObjectURL(selectedFile));
  };

  const handleUpload = async () => {
    if (loading) return;
    if (!file) {
      setError("Please select an image to generate a 3D model.");
      return;
    }

    setLoading(true);
    restoreRequest.current?.abort();
    setError("");
    setSceneData(null);

    try {
      const uploadedScene = await uploadScene(file);

      const scene = await fetchScene(uploadedScene.id);
      setActiveScene(scene);
      setPreviewUrl(scene.image);
      rememberScene(scene.id);
      setSceneData(scene.scene_data);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const resetState = () => {
    restoreRequest.current?.abort();
    setError("");
    rememberScene(null);
    setActiveScene(null);
    setSceneData(null);
    setFile(null);
    setPreviewUrl(null);
  };

  return (
    <div className="min-h-screen w-full font-sans">
      {!sceneData && (
        <div className="home-shell">
          <a href="#room-upload" className="home-skip-link">
            Skip to upload
          </a>
          <Navbar />
          <main className="home-main">
            <section className="w-full" aria-labelledby="home-title">
              <div className="home-intro mx-auto text-center">
                <div className="home-eyebrow mx-auto mb-5 inline-flex items-center gap-3 font-mono text-[11px]">
                  <span>2D</span>
                  <span aria-hidden="true">→</span>
                  <span>3D</span>
                </div>
                <h1 id="home-title" className="home-title">
                  Turn a room image into an <span>interactive 3D scene.</span>
                </h1>
                <p className="home-description mx-auto mt-5">
                  Upload a room photograph or illustration and Spatialize will analyze its layout
                  and generate an approximate 3D scene you can explore.
                </p>
              </div>
              <div id="room-upload" tabIndex={-1} className="home-tool mx-auto mt-8 sm:mt-9">
                <UploadCard
                  file={file}
                  previewUrl={previewUrl}
                  loading={loading}
                  error={error}
                  onFileSelect={handleFileSelect}
                  onGenerate={handleUpload}
                />
              </div>
              <p className="home-metadata mx-auto mt-5 text-center text-xs leading-5">
                Estimated geometry from a single image.
              </p>
            </section>
          </main>
          <Footer />
        </div>
      )}

      {/* --- SCENE VIEWER UI --- */}
      {sceneData && (
        <main className="viewer-app">
          <header className="viewer-app-header">
            <h1>
              Spatialize <span>Viewer</span>
            </h1>
            <button onClick={resetState} className="viewer-upload-new">
              <span aria-hidden="true">+</span> Upload New Image
            </button>
          </header>

          <SceneViewer
            key={activeScene?.id}
            sceneId={activeScene?.id}
            manualOverrides={activeScene?.manual_overrides}
            sceneData={sceneData}
            sourceImageUrl={previewUrl}
          />
        </main>
      )}
    </div>
  );
}
