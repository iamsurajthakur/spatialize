import React from "react";
import { createRoot } from "react-dom/client";
import SceneViewer from "../components/SceneViewer";

const data = await fetch("/scene.json").then((response) => response.json());
const title = new URLSearchParams(window.location.search).get("label") ?? "Geometry replay";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <div style={{ height: "100vh", background: "#18181b" }}>
      <div style={{ position: "absolute", top: 20, left: 20, color: "white", fontFamily: "sans-serif" }}>{title}</div>
      <SceneViewer sceneData={data} sourceImageUrl="/source-image" />
    </div>
  </React.StrictMode>,
);
