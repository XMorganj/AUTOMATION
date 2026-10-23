"use client";

import { useSyncExternalStore } from "react";

export type Theme = "dark" | "light";
export type Accent = "ember" | "sunset" | "rose" | "violet" | "ocean" | "aurora";

export const ACCENTS: { id: Accent; label: string; color: string }[] = [
  { id: "ember", label: "Ember", color: "#ff7a45" },
  { id: "sunset", label: "Sunset", color: "#ff5d73" },
  { id: "rose", label: "Rose", color: "#f472b6" },
  { id: "violet", label: "Violet", color: "#8b7bff" },
  { id: "ocean", label: "Ocean", color: "#38a8ff" },
  { id: "aurora", label: "Aurora", color: "#2fd6a3" },
];

const listeners = new Set<() => void>();

function get(key: string, fallback: string): string {
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function set(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
  document.documentElement.setAttribute(key === "studio.theme" ? "data-theme" : "data-accent", value);
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const t = useSyncExternalStore(subscribe, () => get("studio.theme", "dark") as Theme, () => "dark" as Theme);
  return [t, (v) => set("studio.theme", v)];
}

export function useAccent(): [Accent, (a: Accent) => void] {
  const a = useSyncExternalStore(subscribe, () => get("studio.accent", "ember") as Accent, () => "ember" as Accent);
  return [a, (v) => set("studio.accent", v)];
}

/** Runs before paint so the saved theme and accent never flash. */
export const THEME_BOOT_SCRIPT = `try{var d=document.documentElement;d.setAttribute('data-theme',localStorage.getItem('studio.theme')||'dark');d.setAttribute('data-accent',localStorage.getItem('studio.accent')||'ember')}catch(e){}`;
