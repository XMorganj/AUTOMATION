import { planTimeline, type ResolvedEdit } from "./renderShared";

export interface ChapterDraft {
  /** the shot this chapter begins at */
  shot: number;
  title: string;
}

export interface Chapter extends ChapterDraft {
  /** seconds from the start of the video */
  time: number;
}

/**
 * When each shot begins in the rendered video, in seconds. `durations` is each shot's narration length, in shot order;
 * `edits` (same order) carries any pause, narration speed or crossfade the person chose.
 */
export function shotStarts(durations: number[], fps: number, edits?: ResolvedEdit[]): number[] {
  const plain: ResolvedEdit = { speed: 1, hold: 0, transition: "cut", tlen: 0.3 };
  return planTimeline(
    durations.map((duration, i) => ({ duration, edit: edits?.[i] ?? plain })),
    fps,
  ).starts;
}

export function stamp(sec: number): string {
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}

/**
 * Turn chapter drafts into timestamps YouTube will accept: the first must be 0:00, there must be at least three,
 * and each must be at least 10 seconds long. Chapters that break the rules are merged into the one before.
 * Returns [] when there isn't enough video for three chapters (then YouTube would ignore them anyway).
 */
export function buildChapters(drafts: ChapterDraft[], starts: number[], minSeconds = 10): Chapter[] {
  const sorted = [...drafts]
    .filter((d) => Number.isInteger(d.shot) && d.shot >= 1 && d.shot <= starts.length && d.title.trim())
    .sort((a, b) => a.shot - b.shot);
  const out: Chapter[] = [];
  for (const d of sorted) {
    if (out.length && d.shot === out[out.length - 1].shot) continue;
    out.push({ ...d, title: d.title.trim(), time: Math.floor(starts[d.shot - 1]) });
  }
  if (out.length) {
    out[0] = { ...out[0], shot: 1, time: 0 }; // the first chapter always starts the video
  }
  // drop any chapter that starts less than minSeconds after the previous kept one
  const kept: Chapter[] = [];
  for (const c of out) {
    if (kept.length && c.time - kept[kept.length - 1].time < minSeconds) continue;
    kept.push(c);
  }
  // the last chapter must also be long enough
  const total = starts.length ? starts[starts.length - 1] + 1 : 0;
  while (kept.length > 1 && total - kept[kept.length - 1].time < minSeconds) kept.pop();
  return kept.length >= 3 ? kept : [];
}

/** Evenly spaced placeholder chapters, used when the AI gives none that work. */
export function evenChapterDrafts(shotCount: number, parts = 6): ChapterDraft[] {
  const n = Math.max(1, Math.min(parts, shotCount));
  return Array.from({ length: n }, (_, i) => ({ shot: Math.floor((i * shotCount) / n) + 1, title: `Part ${i + 1}` }));
}

export const chapterLines = (chapters: Chapter[]) => chapters.map((c) => `${stamp(c.time)} ${c.title}`).join("\n");
