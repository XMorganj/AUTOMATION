"use client";

import { useSyncExternalStore } from "react";
import { STEP_IDS, type StepId, type StepStatus } from "./pipeline";
import type { Intensity, MotionId } from "./motion";
import type { VoiceChoice } from "./voice";
import type { Overlay, RenderOptions, ShotEdit, TransitionDefault } from "./renderShared";
import type { SeoData } from "./seoShared";

export interface Idea {
  title: string;
  hook: string;
}

export type Verdict = "check" | "wrong";

export interface Claim {
  id: string;
  quote: string;
  verdict: Verdict;
  note: string;
  fix: string;
  /** "fixed" = suggested fix applied to the script; "kept" = reviewed and left as is */
  resolved?: "fixed" | "kept";
}

export interface FactCheck {
  summary: string;
  correctCount: number;
  claims: Claim[];
  /** hash of the script this check was run against, to detect later edits */
  scriptHash: string;
  mock?: boolean;
}

export interface Shot {
  n: number;
  narration: string;
  prompt: string;
}

export interface Video {
  id: string;
  title: string;
  lengthMin: number;
  theme: string;
  ideas: Idea[];
  // Added after v1: optional so videos saved earlier still load.
  script?: string;
  scriptNotes?: string;
  factcheck?: FactCheck;
  artStyle?: string;
  shots?: Shot[];
  /** hash of the script the shots were built from */
  shotsScriptHash?: string;
  voice?: VoiceChoice;
  /** background music mix settings; the file itself lives on disk */
  music?: { volume: number; duck: boolean };
  /** title, description, tags, chapters and thumbnail settings */
  seo?: SeoData;
  /** quality, frame rate, captions and sound choices for the render step */
  renderOptions?: Partial<RenderOptions>;
  /** the choices made on the Upload screen, so a reload or a second upload keeps them */
  uploadSettings?: { privacy: "private" | "unlisted" | "public" | "schedule"; categoryId: string; kids: boolean | null; ai: boolean };
  /** how shots join by default (the first shot has nothing before it) */
  transition?: TransitionDefault;
  /** per-shot pause, narration speed and transition, only for shots changed by hand */
  shotEdits?: Record<number, ShotEdit>;
  /** words laid over a shot's picture, by shot number */
  shotOverlays?: Record<number, Overlay>;
  /** set when the video has been uploaded to YouTube */
  youtube?: { id: string; privacy: string; uploadedAt: number; publishAt?: string };
  motionIntensity?: Intensity;
  /** seeds the automatic motion pattern; "Shuffle" picks a new one */
  motionSeed?: number;
  /** only the shots the person changed by hand; every other shot follows the automatic pattern */
  motionOverrides?: Record<number, MotionId>;
  currentStep: StepId;
  steps: Record<StepId, StepStatus>;
  createdAt: number;
  updatedAt: number;
}

const KEY = "studio.videos.v1";
const EMPTY: Video[] = [];

const listeners = new Set<() => void>();
let cacheRaw: string | null = null;
let cacheVal: Video[] = EMPTY;

function read(): Video[] {
  if (typeof window === "undefined") return EMPTY;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return cacheVal;
  }
  if (raw === cacheRaw) return cacheVal;
  cacheRaw = raw;
  try {
    cacheVal = raw ? (JSON.parse(raw) as Video[]) : EMPTY;
  } catch {
    cacheVal = EMPTY;
  }
  return cacheVal;
}

function write(videos: Video[]) {
  const raw = JSON.stringify(videos);
  try {
    window.localStorage.setItem(KEY, raw);
  } catch {
    /* storage unavailable: keep in-memory only */
  }
  cacheRaw = raw;
  cacheVal = videos;
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useVideos(): Video[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export function useVideo(id: string): Video | undefined {
  const videos = useVideos();
  return videos.find((v) => v.id === id);
}

function blankSteps(): Record<StepId, StepStatus> {
  return Object.fromEntries(STEP_IDS.map((s) => [s, "not_started"])) as Record<StepId, StepStatus>;
}

export function createVideo(partial?: Partial<Video>): Video {
  const now = Date.now();
  const video: Video = {
    id: crypto.randomUUID(),
    title: "Untitled video",
    lengthMin: 10,
    theme: "",
    ideas: [],
    currentStep: "idea",
    steps: { ...blankSteps(), idea: "in_progress" },
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
  write([video, ...read()]);
  return video;
}

export function updateVideo(id: string, patch: Partial<Video> | ((v: Video) => Partial<Video>)) {
  write(
    read().map((v) =>
      v.id === id ? { ...v, ...(typeof patch === "function" ? patch(v) : patch), updatedAt: Date.now() } : v,
    ),
  );
}

export function deleteVideo(id: string) {
  write(read().filter((v) => v.id !== id));
  // also remove this video's images from disk; if that fails the files are just orphaned, nothing breaks
  void fetch(`/api/images/${id}`, { method: "DELETE", keepalive: true }).catch(() => {});
}

export function progressOf(v: Video): number {
  const done = STEP_IDS.filter((s) => v.steps[s] === "approved").length;
  return done / STEP_IDS.length;
}
