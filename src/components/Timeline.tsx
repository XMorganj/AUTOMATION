"use client";

import { useState } from "react";
import { Layers } from "lucide-react";
import { HOLD_MAX, SPEED_MAX, SPEED_MIN, TRANSITIONS, planTimeline, resolveEdit, type TransitionId } from "@/lib/renderShared";
import { setShotEdit } from "@/lib/shotEdits";
import type { Shot, Video } from "@/lib/videos";

const pad = (n: number) => String(n).padStart(3, "0");
const PX_PER_SECOND = 56;
const MIN_BLOCK = 44;

function stamp(s: number) {
  const t = Math.round(s);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

/**
 * Every shot as a block on a time ruler. Block width is the time the shot really takes in the finished video; the hatched
 * band at the start of a block is a crossfade, and the one at the end is a pause. Click a block to change how it joins,
 * how long it holds and how fast it is narrated.
 */
export function Timeline({
  video,
  shots,
  durations,
  imageVersions,
  fps,
}: {
  video: Video;
  shots: Shot[];
  /** narration seconds per shot number */
  durations: Record<number, number | undefined>;
  imageVersions: Record<number, number | undefined>;
  fps: number;
}) {
  const [sel, setSel] = useState<number | null>(null);
  if (!shots.every((s) => durations[s.n] !== undefined)) return null;

  const edits = shots.map((s, i) => resolveEdit(video.transition, video.shotEdits?.[s.n], i === 0));
  const tl = planTimeline(
    shots.map((s, i) => ({ duration: durations[s.n] ?? 0, edit: edits[i] })),
    fps,
  );
  const total = tl.totalFrames / fps;
  const widths = tl.outFrames.map((f) => Math.max(MIN_BLOCK, (f / fps) * PX_PER_SECOND));
  const width = widths.reduce((a, b) => a + b, 0);
  const ticks = Array.from({ length: Math.floor(total / 5) + 1 }, (_, i) => i * 5);
  const selIndex = sel === null ? -1 : shots.findIndex((s) => s.n === sel);
  const edit = selIndex >= 0 ? edits[selIndex] : null;
  const shot = selIndex >= 0 ? shots[selIndex] : null;
  const stored = shot ? video.shotEdits?.[shot.n] : undefined;

  return (
    <section aria-label="Timeline" data-testid="timeline" className="glass p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="eyebrow flex items-center gap-2">
          <Layers size={13} /> Timeline
        </h3>
        <p className="text-xs text-[var(--text-muted)]">
          {stamp(total)} total · click a shot to change how it joins, holds and sounds
        </p>
      </div>

      <div className="overflow-x-auto pb-2">
        <div style={{ width }} className="relative">
          {/* ruler: ticks are only a guide, block widths are not scaled to them exactly because tiny shots keep a minimum width */}
          <div className="relative mb-1 h-4 border-b border-[var(--border)] font-mono text-[10px] text-[var(--text-faint)]" aria-hidden>
            {ticks.map((t) => {
              const left = (t / total) * width;
              return (
                <span key={t} className="absolute top-0" style={{ left }}>
                  {stamp(t)}
                </span>
              );
            })}
          </div>
          <ol className="flex">
            {shots.map((s, i) => {
              const e = edits[i];
              const w = widths[i];
              const ov = (tl.inOverlap[i] / fps) * PX_PER_SECOND;
              const holdPx = (e.hold / (tl.outFrames[i] / fps)) * w;
              const active = sel === s.n;
              const img = imageVersions[s.n];
              return (
                <li key={s.n} style={{ width: w }} className="relative">
                  <button
                    type="button"
                    data-testid={`tl-shot-${s.n}`}
                    aria-pressed={active}
                    aria-label={`Shot ${s.n}, ${(tl.outFrames[i] / fps).toFixed(1)} seconds, enters with ${e.transition}`}
                    onClick={() => setSel(active ? null : s.n)}
                    className="relative block h-16 w-full overflow-hidden border text-left"
                    style={{
                      borderColor: active ? "var(--accent)" : "var(--border-strong)",
                      background: "var(--bg)",
                      outline: active ? "2px solid var(--accent)" : undefined,
                      outlineOffset: -2,
                    }}
                  >
                    {img !== undefined && (
                      // eslint-disable-next-line @next/next/no-img-element -- local files from our own route
                      <img src={`/api/images/${video.id}/${s.n}?v=${img}`} alt="" className="absolute inset-0 size-full object-cover opacity-60" draggable={false} />
                    )}
                    {ov > 0 && (
                      <span
                        data-testid={`tl-fade-${s.n}`}
                        className="absolute inset-y-0 left-0"
                        style={{ width: ov, background: "linear-gradient(90deg, var(--accent), transparent)", opacity: 0.55 }}
                        title="Crossfade"
                      />
                    )}
                    {e.hold > 0 && (
                      <span
                        data-testid={`tl-hold-${s.n}`}
                        className="absolute inset-y-0 right-0"
                        style={{ width: Math.min(w, holdPx), background: "repeating-linear-gradient(45deg, var(--border-strong) 0 4px, transparent 4px 8px)" }}
                        title="Pause"
                      />
                    )}
                    <span className="badge absolute left-1 top-1" style={{ background: "rgba(0,0,0,.65)", color: "#fff" }}>
                      {pad(s.n)}
                    </span>
                    {(e.speed !== 1 || e.transition === "dip" || e.transition === "flash") && (
                      <span className="badge absolute bottom-1 left-1" style={{ background: "rgba(0,0,0,.65)", color: "#fff" }}>
                        {e.speed !== 1 ? `${e.speed}×` : ""}
                        {e.speed !== 1 && i > 0 && (e.transition === "dip" || e.transition === "flash") ? " " : ""}
                        {i > 0 && (e.transition === "dip" || e.transition === "flash") ? e.transition : ""}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      {shot && edit && (
        <div data-testid="tl-editor" className="mt-3 grid gap-3 border-t border-[var(--border)] pt-3 sm:grid-cols-3">
          <label className="text-xs text-[var(--text-muted)]">
            Shot {shot.n} enters with
            <select
              className="input mt-1 !text-xs"
              disabled={selIndex === 0}
              value={stored?.transition ?? ""}
              onChange={(e) => setShotEdit(video.id, shot.n, { transition: (e.target.value || undefined) as TransitionId | undefined })}
            >
              <option value="">{selIndex === 0 ? "Start of video" : `Default (${TRANSITIONS.find((t) => t.id === edit.transition)?.label})`}</option>
              {selIndex > 0 &&
                TRANSITIONS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
            </select>
          </label>
          <label className="text-xs text-[var(--text-muted)]">
            Pause after: {edit.hold.toFixed(1)}s
            <input
              type="range"
              aria-label="Pause after this shot"
              className="mt-2 block w-full"
              min={0}
              max={HOLD_MAX}
              step={0.5}
              value={edit.hold}
              onChange={(e) => setShotEdit(video.id, shot.n, { hold: Number(e.target.value) })}
            />
          </label>
          <label className="text-xs text-[var(--text-muted)]">
            Narration speed: {edit.speed.toFixed(2)}×
            <input
              type="range"
              aria-label="Narration speed for this shot"
              className="mt-2 block w-full"
              min={SPEED_MIN}
              max={SPEED_MAX}
              step={0.05}
              value={edit.speed}
              onChange={(e) => setShotEdit(video.id, shot.n, { speed: Number(e.target.value) })}
            />
          </label>
        </div>
      )}
    </section>
  );
}
