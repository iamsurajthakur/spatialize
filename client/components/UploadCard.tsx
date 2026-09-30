"use client";

import { useRef, useState } from "react";

type UploadCardProps = {
  file: File | null;
  previewUrl: string | null;
  loading: boolean;
  error: string;
  onFileSelect: (file: File) => void;
  onGenerate: () => void;
};

export default function UploadCard({
  file,
  previewUrl,
  loading,
  error,
  onFileSelect,
  onGenerate,
}: UploadCardProps) {
  const [dragActive, setDragActive] = useState(false);
  const dragDepth = useRef(0);

  return (
    <form
      className="home-upload-card"
      onSubmit={(event) => {
        event.preventDefault();
        onGenerate();
      }}
      aria-label="Generate a 3D scene"
      aria-busy={loading}
    >
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-sm font-medium">Your room image</h2>
        <span className="home-metadata font-mono text-[11px]">01 / INPUT</span>
      </div>
      <label
        className={`home-dropzone ${dragActive ? "is-dragging" : ""} ${loading ? "is-loading" : ""}`}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!loading && event.dataTransfer.types.includes("Files")) {
            dragDepth.current += 1;
            setDragActive(true);
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = loading ? "none" : "copy";
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragActive(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          dragDepth.current = 0;
          setDragActive(false);
          const dropped = event.dataTransfer.files[0];
          if (dropped && !loading) onFileSelect(dropped);
        }}
      >
        <input
          id="file-upload"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={loading}
          aria-label={file ? "Choose a different room image" : "Upload a room image"}
          aria-describedby={`upload-formats${error ? " upload-error" : ""}`}
          aria-invalid={Boolean(error)}
          className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-wait"
          onChange={(event) => {
            const selected = event.target.files?.[0];
            if (selected) onFileSelect(selected);
            event.target.value = "";
          }}
        />
        {previewUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="Selected room image preview" className="home-preview" />
            <p className="mt-3 w-full truncate px-4 text-sm font-medium">
              {dragActive ? "Drop to replace image" : file?.name}
            </p>
            <p className="home-metadata mt-1 text-xs">
              {loading ? "Analyzing your room…" : "Image selected · Click or drop to replace"}
            </p>
          </>
        ) : (
          <>
            <div className="home-upload-icon" aria-hidden="true">
              <svg
                width="25"
                height="25"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 16V3m-4 4 4-4 4 4M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
              </svg>
            </div>
            <p className="mt-4 text-[15px] font-medium">
              {dragActive ? "Release to add your image" : "Drop an image here"}
            </p>
            <p className="home-metadata mt-1 text-sm">
              or <span className="home-browse">click to browse</span>
            </p>
          </>
        )}
        <p
          id="upload-formats"
          className="home-metadata mt-5 font-mono text-[10px] tracking-[0.12em]"
        >
          JPG · PNG · WEBP
        </p>
      </label>
      {error && (
        <p
          id="upload-error"
          role="alert"
          className="home-error mt-4 rounded-lg border px-3 py-2.5 text-sm"
        >
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={loading || !file}
        className="home-generate mt-5 flex h-12 w-full items-center justify-center gap-2.5 rounded-lg text-sm font-medium"
      >
        {loading ? (
          <>
            <svg
              className="home-spinner h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" opacity=".25" />
              <path
                d="M12 3a9 9 0 0 1 9 9"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            Generating 3D Model…
          </>
        ) : (
          <>
            Generate Model
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4 12h16m-6-6 6 6-6 6" />
            </svg>
          </>
        )}
      </button>
      <p role="status" className="home-metadata mt-3 text-center text-xs leading-5">
        {loading
          ? "Estimating layout and geometry. This may take a moment."
          : "One image. A new perspective."}
      </p>
    </form>
  );
}
