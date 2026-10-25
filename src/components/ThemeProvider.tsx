"use client";

import { useSyncExternalStore } from "react";

export type Theme = "dark" | "light";
export type Accent = "signal" | "tally" | "amber" | "scope" | "gel";

export const ACCENTS: { id: Accent; label: string; color: string }[] = [
  { id: "signal", label: "Signal", color: "#c6f432" },
  { id: "tally", label: "Tally", color: "#ff5a47" },
  { id: "amber", label: "Amber", color: "#ffb52e" },
  { id: "scope", label: "Scope", color: "#3fd6e6" },
  { id: "gel", label: "Gel", color: "#a595ff" },
];

const THEME_KEY = "mas.theme";
const ACCENT_KEY = "mas.accent";

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
  document.documentElement.setAttribute(key === THEME_KEY ? "data-theme" : "data-accent", value);
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const t = useSyncExternalStore(subscribe, () => get(THEME_KEY, "dark") as Theme, () => "dark" as Theme);
  return [t, (v) => set(THEME_KEY, v)];
}

export function useAccent(): [Accent, (a: Accent) => void] {
  const a = useSyncExternalStore(subscribe, () => get(ACCENT_KEY, "signal") as Accent, () => "signal" as Accent);
  return [a, (v) => set(ACCENT_KEY, v)];
}

/** Runs before paint so the saved theme and accent never flash. */
export const THEME_BOOT_SCRIPT = `try{var d=document.documentElement,t=localStorage.getItem('mas.theme'),a=localStorage.getItem('mas.accent');d.setAttribute('data-theme',t==='light'?'light':'dark');d.setAttribute('data-accent',['signal','tally','amber','scope','gel'].indexOf(a)>-1?a:'signal')}catch(e){}`;
