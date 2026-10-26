import { HOLD_MAX, SPEED_MAX, SPEED_MIN, type ShotEdit } from "./renderShared";
import { updateVideo } from "./videos";

/** Merge a change into one shot's edit, dropping values that are just the defaults so the saved data stays small. */
export function mergeShotEdit(all: Record<number, ShotEdit> | undefined, n: number, patch: ShotEdit): Record<number, ShotEdit> {
  const cur = { ...(all ?? {})[n], ...patch };
  const clean: ShotEdit = {};
  if (cur.speed !== undefined && cur.speed !== 1) clean.speed = Math.min(SPEED_MAX, Math.max(SPEED_MIN, cur.speed));
  if (cur.hold !== undefined && cur.hold !== 0) clean.hold = Math.min(HOLD_MAX, Math.max(0, cur.hold));
  if (cur.transition !== undefined) clean.transition = cur.transition;
  const out = { ...(all ?? {}) };
  if (Object.keys(clean).length) out[n] = clean;
  else delete out[n];
  return out;
}

export function setShotEdit(videoId: string, n: number, patch: ShotEdit) {
  updateVideo(videoId, (v) => ({ shotEdits: mergeShotEdit(v.shotEdits, n, patch) }));
}
