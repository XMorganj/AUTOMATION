/** Render types and validation shared by the browser and the API routes. Not a "use client" file. */
import { INTENSITIES, MOTIONS, type Intensity, type MotionId } from "./motion";
import type { CaptionStyle } from "./captions";

const MAX_SHOT = 2000;

export const RESOLUTIONS = [
  { id: 720, label: "720p", w: 1280, h: 720, hint: "Fast, good for drafts" },
  { id: 1080, label: "1080p", w: 1920, h: 1080, hint: "Standard for YouTube" },
  { id: 2160, label: "4K", w: 3840, h: 2160, hint: "Slow, big files" },
] as const;
export type ResolutionId = (typeof RESOLUTIONS)[number]["id"];

export const CAPTION_OPTIONS: { id: CaptionStyle; label: string; hint: string }[] = [
  { id: "karaoke", label: "Highlight", hint: "A few words, each lighting up as it's spoken" },
  { id: "pop", label: "One word", hint: "Big single words, shorts-style" },
  { id: "off", label: "None", hint: "No captions" },
];

/** The choices on the Render screen that are saved with the video. */
export interface RenderOptions {
  resolution: ResolutionId;
  fps: 24 | 30;
  captions: CaptionStyle;
  loudness: boolean;
  useMusic: boolean;
}

export const DEFAULT_RENDER_OPTIONS: RenderOptions = { resolution: 1080, fps: 30, captions: "karaoke", loudness: true, useMusic: true };

export interface RenderPlan {
  resolution: ResolutionId;
  fps: 24 | 30;
  captions: CaptionStyle;
  /** even out the loudness to YouTube's target */
  loudness: boolean;
  intensity: Intensity;
  /** null = leave any uploaded music out */
  music: { volume: number; duck: boolean } | null;
  shots: { n: number; motion: MotionId }[];
  /** only used to name the download */
  title: string;
  /** the browser's fingerprint of every input, so it can tell later whether the render is out of date */
  fingerprint: string;
}

export type JobStatus = "running" | "done" | "failed" | "canceled";

export interface RenderJob {
  id: string;
  status: JobStatus;
  /** what it's doing right now, in plain words */
  phase: string;
  /** 0..1 */
  progress: number;
  shotsDone: number;
  shotsTotal: number;
  startedAt: number;
  finishedAt?: number;
  error?: string;
}

export interface RenderOutput {
  bytes: number;
  duration: number;
  width: number;
  height: number;
  fps: number;
  finishedAt: number;
  fingerprint: string;
  captions: CaptionStyle;
  music: boolean;
}

export interface RenderState {
  ffmpeg: boolean;
  job: RenderJob | null;
  output: RenderOutput | null;
}

const MOTION_IDS = new Set<string>(MOTIONS.map((m) => m.id));
const INTENSITY_IDS = new Set<string>(INTENSITIES.map((i) => i.id));

/** Check an untrusted plan from the browser. Returns the clean plan, or a message saying what's wrong. */
export function parsePlan(raw: unknown): { ok: true; plan: RenderPlan } | { ok: false; error: string } {
  const b = (raw ?? {}) as Record<string, unknown>;
  const res = RESOLUTIONS.find((r) => r.id === b.resolution);
  if (!res) return { ok: false, error: "Choose 720p, 1080p or 4K." };
  if (b.fps !== 24 && b.fps !== 30) return { ok: false, error: "Frame rate must be 24 or 30." };
  if (b.captions !== "karaoke" && b.captions !== "pop" && b.captions !== "off") return { ok: false, error: "Unknown caption style." };
  if (typeof b.intensity !== "string" || !INTENSITY_IDS.has(b.intensity)) return { ok: false, error: "Unknown motion intensity." };
  if (!Array.isArray(b.shots) || b.shots.length < 1 || b.shots.length > MAX_SHOT) return { ok: false, error: "No shots to render." };

  const seen = new Set<number>();
  const shots: RenderPlan["shots"] = [];
  for (const s of b.shots as Record<string, unknown>[]) {
    const n = s?.n;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > MAX_SHOT || seen.has(n)) return { ok: false, error: "The shot list is invalid." };
    if (typeof s.motion !== "string" || !MOTION_IDS.has(s.motion)) return { ok: false, error: `Shot ${n} has an unknown motion.` };
    seen.add(n);
    shots.push({ n, motion: s.motion as MotionId });
  }
  shots.sort((a, c) => a.n - c.n);

  let music: RenderPlan["music"] = null;
  if (b.music) {
    const m = b.music as Record<string, unknown>;
    const volume = typeof m.volume === "number" && Number.isFinite(m.volume) ? Math.min(0.6, Math.max(0, m.volume)) : 0.15;
    music = { volume, duck: m.duck !== false };
  }
  const title = (typeof b.title === "string" ? b.title : "video").slice(0, 120);
  const fingerprint = typeof b.fingerprint === "string" && /^[a-z0-9]{1,40}$/.test(b.fingerprint) ? b.fingerprint : "";

  return {
    ok: true,
    plan: {
      resolution: res.id,
      fps: b.fps,
      captions: b.captions,
      loudness: b.loudness !== false,
      intensity: b.intensity as Intensity,
      music,
      shots,
      title,
      fingerprint,
    },
  };
}
