/**
 * Camera motion for a still image (the "Ken Burns" effect).
 *
 * A motion is described as a start view and an end view, where a view is how much the image is zoomed in
 * and where the centre of the visible window sits. The live preview in the browser and the final render
 * both read from this one definition, so what you preview is what gets rendered.
 *
 * All positions are fractions of the image (0 to 1). A view never shows anything outside the image.
 */

export type MotionId = "zoom_in" | "zoom_out" | "pan_left" | "pan_right" | "pan_up" | "pan_down" | "drift" | "still";
export type Intensity = "subtle" | "normal" | "dramatic";

export const MOTIONS: { id: MotionId; label: string }[] = [
  { id: "zoom_in", label: "Slow zoom in" },
  { id: "zoom_out", label: "Slow zoom out" },
  { id: "pan_left", label: "Pan left" },
  { id: "pan_right", label: "Pan right" },
  { id: "pan_up", label: "Pan up" },
  { id: "pan_down", label: "Pan down" },
  { id: "drift", label: "Gentle drift" },
  { id: "still", label: "Still" },
];

export const INTENSITIES: { id: Intensity; label: string; hint: string }[] = [
  { id: "subtle", label: "Subtle", hint: "8% zoom" },
  { id: "normal", label: "Normal", hint: "15% zoom" },
  { id: "dramatic", label: "Dramatic", hint: "30% zoom" },
];

/** Maximum zoom reached by a motion at each intensity. */
export const ZOOM: Record<Intensity, number> = { subtle: 1.08, normal: 1.15, dramatic: 1.3 };

export interface View {
  /** zoom factor, 1 = whole image */
  s: number;
  /** centre of the visible window */
  cx: number;
  cy: number;
}

/** How far the window centre can move from the middle at zoom `s` without leaving the image. */
const room = (s: number) => (1 - 1 / s) / 2;

export function motionPath(id: MotionId, intensity: Intensity): { from: View; to: View } {
  const S = ZOOM[intensity];
  const o = room(S);
  const mid = { cx: 0.5, cy: 0.5 };
  switch (id) {
    case "zoom_in":
      return { from: { s: 1, ...mid }, to: { s: S, ...mid } };
    case "zoom_out":
      return { from: { s: S, ...mid }, to: { s: 1, ...mid } };
    case "pan_left":
      return { from: { s: S, cx: 0.5 + o, cy: 0.5 }, to: { s: S, cx: 0.5 - o, cy: 0.5 } };
    case "pan_right":
      return { from: { s: S, cx: 0.5 - o, cy: 0.5 }, to: { s: S, cx: 0.5 + o, cy: 0.5 } };
    case "pan_up":
      return { from: { s: S, cx: 0.5, cy: 0.5 + o }, to: { s: S, cx: 0.5, cy: 0.5 - o } };
    case "pan_down":
      return { from: { s: S, cx: 0.5, cy: 0.5 - o }, to: { s: S, cx: 0.5, cy: 0.5 + o } };
    case "drift": {
      // a slower, smaller diagonal move: half the zoom, 80% of the available room
      const s = 1 + (S - 1) * 0.5;
      const d = room(s) * 0.8;
      return { from: { s, cx: 0.5 - d, cy: 0.5 + d * 0.6 }, to: { s, cx: 0.5 + d, cy: 0.5 - d * 0.6 } };
    }
    case "still":
      return { from: { s: 1, ...mid }, to: { s: 1, ...mid } };
  }
}

/** CSS transform that shows `v`. Apply to the image with `transform-origin: 0 0` inside an overflow-hidden frame. */
export function viewTransform(v: View): string {
  const tx = (0.5 - v.cx * v.s) * 100;
  const ty = (0.5 - v.cy * v.s) * 100;
  return `translate(${tx.toFixed(3)}%, ${ty.toFixed(3)}%) scale(${v.s})`;
}

// A repeating order with no two neighbours the same, and no pan straight back the way the last one came.
const PATTERN: MotionId[] = ["zoom_in", "pan_right", "zoom_out", "pan_left", "zoom_in", "pan_down", "zoom_out", "pan_up", "drift"];

/** The motion a shot gets until you change it. Deterministic, so the render picks the same one the preview showed. */
export function autoMotion(shot: number, seed: number): MotionId {
  const offset = Math.abs(Math.trunc(seed)) % PATTERN.length;
  return PATTERN[(shot - 1 + offset) % PATTERN.length];
}

/** Stable starting seed for a video, so each video gets its own rhythm. */
export function seedFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}
