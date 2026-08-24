"use client";

import { useEffect, useState } from "react";

export default function Home() {
  const [status, setStatus] = useState("Loading...");

  useEffect(() => {
    fetch("http://127.0.0.1:8000/api/ping/")
      .then((response) => response.json())
      .then((data) => {
        setStatus(data.status);
      })
      .catch(() => {
        setStatus("Failed to connect");
      });
  }, []);

  return (
    <main>
      <h1>AI Scene</h1>
      <p>Backend says: {status}</p>
    </main>
  );
}