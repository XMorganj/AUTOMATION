/** Render types and validation shared by the browser and the API routes. Not a "use client" file. */
import { INTENSITIES, MOTIONS, type Intensity, type MotionId } from "./motion";
import type { CaptionStyle } from "./captions";

const MAX_SHOT = 2000;

/** Seconds of breathing room after each shot's narration (the last shot gets a longer one). */
export const SHOT_TAIL = 0.35;
export const LAST_TAIL = 1.0;

/** How many frames a shot lasts in the render. The renderer and the chapter timestamps both use this, so they always agree. */
export function shotFrames(narrationSeconds: number, isLast: boolean, fps: number): number {
  return Math.max(fps, Math.ceil((narrationSeconds + (isLast ? LAST_TAIL : SHOT_TAIL)) * fps));
}

/* ---------- Shot edits: how shots join, how long they linger, how fast the narration runs ---------- */

export const TRANSITIONS = [
  { id: "cut", label: "Cut", hint: "Straight to the next shot" },
  { id: "fade", label: "Crossfade", hint: "One picture dissolves into the next" },
  { id: "dip", label: "Dip to black", hint: "Fades out, then the next fades in" },
  { id: "flash", label: "Flash", hint: "A quick pass through white" },
] as const;
export type TransitionId = (typeof TRANSITIONS)[number]["id"];

/** Longest transition. It must fit inside the quiet gap after the narration, so the voice is never cut or overlapped. */
export const MAX_TLEN = 0.3;
export const MIN_TLEN = 0.1;
export const SPEED_MIN = 0.8;
export const SPEED_MAX = 1.3;
export const HOLD_MAX = 3;

/** What one shot is allowed to change. Anything left out follows the video-wide default. */
export interface ShotEdit {
  /** narration speed, pitch kept */
  speed?: number;
  /** extra seconds the picture stays after the narration */
  hold?: number;
  /** how this shot is entered from the one before it */
  transition?: TransitionId;
}
/** The video-wide default for how shots join. */
export interface TransitionDefault {
  style: TransitionId;
  length: number;
}
/** Words laid over the picture of one shot: a title, a name, a number. */
export const OVERLAY_PLACES = [
  { id: "top", label: "Top" },
  { id: "middle", label: "Middle" },
  { id: "lower", label: "Lower third" },
] as const;
export type OverlayPlace = (typeof OVERLAY_PLACES)[number]["id"];
export const OVERLAY_WHEN = [
  { id: "intro", label: "First 3 seconds" },
  { id: "shot", label: "Whole shot" },
] as const;
export type OverlayWhen = (typeof OVERLAY_WHEN)[number]["id"];
export const MAX_OVERLAY_CHARS = 100;
export interface Overlay {
  text: string;
  place: OverlayPlace;
  when: OverlayWhen;
}
/** Make an untrusted overlay safe: trimmed text, known place and timing. Returns undefined when there is nothing to show. */
export function cleanOverlay(o: unknown): Overlay | undefined {
  const r = (o ?? {}) as Record<string, unknown>;
  const text = typeof r.text === "string" ? r.text.replace(/\s+/g, " ").trim().slice(0, MAX_OVERLAY_CHARS) : "";
  if (!text) return undefined;
  const place = OVERLAY_PLACES.some((x) => x.id === r.place) ? (r.place as OverlayPlace) : "lower";
  const when = OVERLAY_WHEN.some((x) => x.id === r.when) ? (r.when as OverlayWhen) : "intro";
  return { text, place, when };
}

export interface ResolvedEdit {
  speed: number;
  hold: number;
  transition: TransitionId;
  /** seconds */
  tlen: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

export function resolveEdit(def: TransitionDefault | undefined, e: ShotEdit | undefined, first: boolean): ResolvedEdit {
  const ids = TRANSITIONS.map((t) => t.id) as string[];
  const style = e?.transition && ids.includes(e.transition) ? e.transition : (def?.style ?? "cut");
  return {
    speed: clamp(num(e?.speed, 1), SPEED_MIN, SPEED_MAX),
    hold: clamp(num(e?.hold, 0), 0, HOLD_MAX),
    transition: first ? "cut" : style,
    tlen: clamp(num(def?.length, 0.3), MIN_TLEN, MAX_TLEN),
  };
}

export interface TimelineShot {
  /** narration length in seconds, before any speed change */
  duration: number;
  edit: ResolvedEdit;
}
export interface Timeline {
  /** frames each shot would last on its own (narration + pause + tail) */
  frames: number[];
  /** frames of the previous shot that dissolve into this one (crossfade only; they come out of the previous shot's tail) */
  inOverlap: number[];
  /** frames of each shot that end up in the video */
  outFrames: number[];
  /** seconds from the start of the video to the start of each shot */
  starts: number[];
  totalFrames: number;
}

/**
 * The single place that works out how long every shot lasts and when it starts. The renderer, the chapter timestamps
 * and the length shown on screen all call this, so they can never disagree.
 */
export function planTimeline(shots: TimelineShot[], fps: number): Timeline {
  const n = shots.length;
  const frames = shots.map((s, i) => shotFrames(s.duration / s.edit.speed + s.edit.hold, i === n - 1, fps));
  // frames after the last spoken word; a crossfade may only use these
  const quiet = shots.map((s, i) => frames[i] - Math.ceil((s.duration / s.edit.speed) * fps));
  const inOverlap = shots.map((s, i) => {
    if (i === 0 || s.edit.transition !== "fade") return 0;
    return Math.max(0, Math.min(Math.round(s.edit.tlen * fps), quiet[i - 1], frames[i] - 1));
  });
  const outFrames = frames.map((f, i) => f - (inOverlap[i + 1] ?? 0));
  const starts: number[] = [];
  let acc = 0;
  outFrames.forEach((f) => {
    starts.push(acc / fps);
    acc += f;
  });
  return { frames, inOverlap, outFrames, starts, totalFrames: acc };
}

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
  shots: ({ n: number; motion: MotionId; overlay?: Overlay } & ResolvedEdit)[];
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
    const tr = TRANSITIONS.some((t) => t.id === s.transition) ? (s.transition as TransitionId) : "cut";
    shots.push({
      n,
      motion: s.motion as MotionId,
      speed: clamp(num(s.speed, 1), SPEED_MIN, SPEED_MAX),
      hold: clamp(num(s.hold, 0), 0, HOLD_MAX),
      transition: tr,
      tlen: clamp(num(s.tlen, 0.3), MIN_TLEN, MAX_TLEN),
      ...(cleanOverlay(s.overlay) ? { overlay: cleanOverlay(s.overlay) } : {}),
    });
  }
  shots.sort((a, c) => a.n - c.n);
  if (shots.length) shots[0].transition = "cut";

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
