"use client";

import { useSyncExternalStore } from "react";

const THEME_KEY = "spatialize-theme";

function subscribe(onChange: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const sync = () => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(THEME_KEY);
    } catch {
      // Theme switching still works when browser storage is unavailable.
    }
    document.documentElement.dataset.theme =
      saved === "light" || saved === "dark" ? saved : media.matches ? "dark" : "light";
    onChange();
  };
  media.addEventListener("change", sync);
  window.addEventListener("storage", sync);
  window.addEventListener("spatialize-theme-change", onChange);
  return () => {
    media.removeEventListener("change", sync);
    window.removeEventListener("storage", sync);
    window.removeEventListener("spatialize-theme-change", onChange);
  };
}

export default function ThemeToggle() {
  const theme = useSyncExternalStore(
    subscribe,
    () => document.documentElement.dataset.theme ?? "light",
    () => "light",
  );
  const label = `Switch to ${theme === "dark" ? "light" : "dark"} mode`;

  return (
    <button
      type="button"
      className="home-nav-control home-theme-toggle"
      aria-label={label}
      title={label}
      onClick={() => {
        const next = theme === "dark" ? "light" : "dark";
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem(THEME_KEY, next);
        } catch {
          // Keep the current session usable without persistent storage.
        }
        window.dispatchEvent(new Event("spatialize-theme-change"));
      }}
    >
      <svg
        className="theme-sun"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4m0-14.2-1.4 1.4M6.3 17.7l-1.4 1.4" />
      </svg>
      <svg
        className="theme-moon"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M20.5 14.1A8.7 8.7 0 0 1 9.9 3.5 8.7 8.7 0 1 0 20.5 14.1Z" />
      </svg>
    </button>
  );
}
