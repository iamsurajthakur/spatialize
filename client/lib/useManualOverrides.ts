"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ManualOverrides, ManualTransform } from "./SceneData";
import { saveOverrides } from "./sceneApi";

export function useManualOverrides(sceneId: number | undefined, initial: ManualOverrides) {
  const overrides = useRef<ManualOverrides>({ ...initial });
  const [status, setStatus] = useState("saved");
  const mounted = useRef(false);
  const running = useRef(false);
  const pending = useRef(false);
  const dirty = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      mounted.current = false;
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, []);

  const save = useCallback(async () => {
    if (!sceneId) return;
    pending.current = true;
    if (running.current) return;
    running.current = true;
    if (mounted.current) setStatus("saving");
    try {
      // One request at a time; coalesce edits made while a save is in flight.
      while (pending.current) {
        pending.current = false;
        const snapshot = overrides.current;
        await saveOverrides(sceneId, snapshot);
        dirty.current = snapshot !== overrides.current;
      }
      if (mounted.current) setStatus(dirty.current ? "editing" : "saved");
    } catch {
      if (mounted.current) setStatus("error");
    } finally {
      running.current = false;
    }
  }, [sceneId]);

  const update = useCallback((id: string, transform: ManualTransform | null) => {
    const next = { ...overrides.current };
    if (transform) next[id] = transform;
    else delete next[id];
    overrides.current = next;
    dirty.current = true;
    setStatus("editing");
  }, []);

  return { overrides, status, update, save };
}
