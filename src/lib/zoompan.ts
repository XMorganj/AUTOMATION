import { motionPath, type Intensity, type MotionId } from "./motion";

/**
 * FFmpeg `zoompan` expressions for a motion, using the same start/end views and easing as the browser preview.
 * `z` is the zoom, `x`/`y` the top-left corner of the visible window in input pixels.
 * `frames` is the number of frames in the whole shot. `offset` starts the move part-way through, so a crossfade can keep the
 * previous shot moving while it dissolves into the next.
 */
export function zoompanExpr(motion: MotionId, intensity: Intensity, frames: number, offset = 0): { z: string; x: string; y: string } {
  const { from, to } = motionPath(motion, intensity);
  const f = (n: number) => n.toFixed(6);
  const last = Math.max(1, frames - 1);
  // ld(1) = eased progress 0..1 (smoothstep of on/(frames-1)); ld(2) = current zoom
  const progress = `st(0,min(1,(on+${offset})/${last}));st(1,ld(0)*ld(0)*(3-2*ld(0)));`;
  const zoom = `${f(from.s)}+(${f(to.s)}-${f(from.s)})*ld(1)`;
  return {
    z: `${progress}${zoom}`,
    x: `${progress}st(2,${zoom});(${f(from.cx)}+(${f(to.cx)}-${f(from.cx)})*ld(1))*iw-iw/ld(2)/2`,
    y: `${progress}st(2,${zoom});(${f(from.cy)}+(${f(to.cy)}-${f(from.cy)})*ld(1))*ih-ih/ld(2)/2`,
  };
}
