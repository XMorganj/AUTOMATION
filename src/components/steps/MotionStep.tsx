"use client";

import { memo, useEffect, useRef } from "react";
import { Check, Play, Shuffle } from "lucide-react";
import { EASE_CSS, INTENSITIES, MOTIONS, autoMotion, motionPath, seedFromId, viewTransform, type Intensity, type MotionId } from "@/lib/motion";
import { WORDS_PER_MIN } from "@/lib/pipeline";
import { countWords } from "@/lib/shots";
import { useStoredImages } from "@/lib/useStoredImages";
import { HOLD_MAX, MAX_TLEN, MIN_TLEN, SPEED_MAX, SPEED_MIN, TRANSITIONS, type ShotEdit, type TransitionId } from "@/lib/renderShared";
import { mergeShotEdit } from "@/lib/shotEdits";
import { updateVideo, type Shot, type Video } from "@/lib/videos";
import { NeedsPrompts, NeedsScript } from "./notices";

const pad = (n: number) => String(n).padStart(3, "0");
const PREVIEW_MAX_SECONDS = 6;

/** How long a shot stays on screen, from how long its narration takes to say. */
function shotSeconds(narration: string): number {
  return Math.max(2, (countWords(narration) / WORDS_PER_MIN) * 60);
}

function mmss(totalSeconds: number): string {
  const s = Math.round(totalSeconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function MotionStep({ video }: { video: Video }) {
  const shots = video.shots ?? [];
  const { images, loaded } = useStoredImages(video.id);

  if (!(video.script ?? "").trim()) return <NeedsScript video={video} />;
  if (shots.length === 0) return <NeedsPrompts video={video} />;

  const intensity: Intensity = video.motionIntensity ?? "normal";
  const seed = video.motionSeed ?? seedFromId(video.id);
  const overrides = video.motionOverrides ?? {};
  const motionFor = (n: number): MotionId => overrides[n] ?? autoMotion(n, seed);

  const approved = video.steps.motion === "approved";
  const totalSeconds = shots.reduce((sum, s) => sum + shotSeconds(s.narration), 0);
  const withoutImage = loaded ? shots.filter((s) => !images[s.n]).length : 0;
  const changed = Object.keys(overrides).filter((n) => Number(n) <= shots.length).length;

  const changedEdits = Object.keys(video.shotEdits ?? {}).length;
  const touch = (v: Video) => ({ ...v.steps, motion: v.steps.motion === "approved" ? "approved" : "ready" }) as Video["steps"];

  function setIntensity(i: Intensity) {
    updateVideo(video.id, (v) => ({ motionIntensity: i, steps: touch(v) }));
  }

  function setMotion(n: number, id: MotionId) {
    updateVideo(video.id, (v) => ({ motionOverrides: { ...(v.motionOverrides ?? {}), [n]: id }, steps: touch(v) }));
  }

  const tDefault = video.transition ?? { style: "cut" as TransitionId, length: 0.3 };
  const edits = video.shotEdits ?? {};

  function setTransition(style: TransitionId, length: number) {
    updateVideo(video.id, (v) => ({ transition: { style, length }, steps: touch(v) }));
  }

  /** apply one style to every shot, dropping hand-picked styles */
  function applyAll(style: TransitionId) {
    updateVideo(video.id, (v) => {
      const next: Record<number, ShotEdit> = {};
      for (const [k, e] of Object.entries(v.shotEdits ?? {})) {
        const { transition: _t, ...rest } = e;
        void _t;
        if (Object.keys(rest).length) next[Number(k)] = rest;
      }
      return { transition: { style, length: v.transition?.length ?? 0.3 }, shotEdits: next, steps: touch(v) };
    });
  }

  function setEdit(n: number, patch: ShotEdit) {
    updateVideo(video.id, (v) => ({ shotEdits: mergeShotEdit(v.shotEdits, n, patch), steps: touch(v) }));
  }

  function shuffle() {
    if (changed > 0 && !window.confirm("Shuffle all shots? Your hand-picked motions will be replaced.")) return;
    updateVideo(video.id, (v) => ({
      motionSeed: Math.floor(Math.random() * 1_000_000_000),
      motionOverrides: {},
      steps: touch(v),
    }));
  }

  function approve() {
    updateVideo(video.id, (v) => ({
      currentStep: "voice",
      steps: { ...v.steps, motion: "approved", voice: v.steps.voice === "not_started" ? "in_progress" : v.steps.voice },
    }));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
        <div>
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-faint)]">How much movement</h3>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Motion intensity">
            {INTENSITIES.map((i) => (
              <button key={i.id} className="pill" data-active={intensity === i.id} aria-pressed={intensity === i.id} onClick={() => setIntensity(i.id)}>
                {i.label} <span className="font-normal opacity-70">{i.hint}</span>
              </button>
            ))}
          </div>
        </div>
        <button className="btn" onClick={shuffle}>
          <Shuffle size={15} /> Shuffle all
        </button>
        <p className="ml-auto text-xs text-[var(--text-muted)]">
          {shots.length} shots · about {mmss(totalSeconds)} of video
          {changed > 0 ? ` · ${changed} changed by hand` : ""}
        </p>
      </div>

      <div>
        <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-faint)]">Between shots</h3>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Transition between shots">
          {TRANSITIONS.map((t) => (
            <button key={t.id} className="pill" title={t.hint} data-active={tDefault.style === t.id} aria-pressed={tDefault.style === t.id} onClick={() => setTransition(t.id, tDefault.length)}>
              {t.label}
            </button>
          ))}
          <button className="btn" onClick={() => applyAll(tDefault.style)} disabled={changedEdits === 0}>
            Apply to all shots
          </button>
          <label className="ml-2 flex items-center gap-2 text-xs text-[var(--text-muted)]">
            Length
            <input
              type="range"
              aria-label="Transition length"
              min={MIN_TLEN}
              max={MAX_TLEN}
              step={0.05}
              value={tDefault.length}
              onChange={(e) => setTransition(tDefault.style, Number(e.target.value))}
            />
            {tDefault.length.toFixed(2)}s
          </label>
        </div>
        <p className="mt-1 text-[11px] text-[var(--text-faint)]">
          Crossfades use the quiet gap after each line, so the voice is never cut. Pause adds time after a line; speed changes narration pace (pitch kept).
        </p>
      </div>

      <p className="text-xs text-[var(--text-muted)]">
        Hover a shot, or press its play button, to preview the move. The final video uses exactly this movement.
      </p>

      {withoutImage > 0 && (
        <p className="text-xs" style={{ color: "var(--warn)" }}>
          {withoutImage} shot{withoutImage > 1 ? "s have" : " has"} no image yet, so {withoutImage > 1 ? "they preview" : "it previews"} on a placeholder. You can still choose motion now.
        </p>
      )}

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {shots.map((s) => (
          <ShotCard
            key={s.n}
            shot={s}
            videoId={video.id}
            imageVersion={images[s.n]?.mtime}
            motion={motionFor(s.n)}
            intensity={intensity}
            onChange={setMotion}
            edit={edits[s.n]}
            first={s.n === shots[0].n}
            defaultStyle={tDefault.style}
            onEdit={setEdit}
          />
        ))}
      </ul>

      <div className="flex items-center justify-end gap-3">
        {approved && <span className="text-xs text-[var(--text-muted)]">Approved.</span>}
        <button className="btn btn-primary" onClick={approve}>
          <Check size={15} /> {approved ? "Continue to Voiceover" : "Approve & continue"}
        </button>
      </div>
    </div>
  );
}

const ShotCard = memo(function ShotCard({
  shot,
  videoId,
  imageVersion,
  motion,
  intensity,
  onChange,
  edit,
  first,
  defaultStyle,
  onEdit,
}: {
  shot: Shot;
  videoId: string;
  imageVersion: number | undefined;
  motion: MotionId;
  intensity: Intensity;
  onChange: (n: number, id: MotionId) => void;
  edit: ShotEdit | undefined;
  first: boolean;
  defaultStyle: TransitionId;
  onEdit: (n: number, patch: ShotEdit) => void;
}) {
  const moverRef = useRef<HTMLDivElement>(null);
  const anim = useRef<Animation | null>(null);
  const seconds = Math.min(shotSeconds(shot.narration), PREVIEW_MAX_SECONDS);
  const { from, to } = motionPath(motion, intensity);

  const stop = () => {
    anim.current?.cancel();
    anim.current = null;
  };

  const play = () => {
    const el = moverRef.current;
    if (!el) return;
    stop();
    anim.current = el.animate([{ transform: viewTransform(from) }, { transform: viewTransform(to) }], {
      duration: seconds * 1000,
      easing: EASE_CSS,
      fill: "forwards",
    });
  };

  // a preview that was running for the old motion or intensity must not keep going
  useEffect(() => {
    anim.current?.cancel();
    anim.current = null;
  }, [motion, intensity]);
  useEffect(
    () => () => {
      anim.current?.cancel();
    },
    [],
  );

  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const id = `motion-${shot.n}`;

  return (
    <li className="glass overflow-hidden" style={{ borderRadius: 14 }}>
      <div
        className="relative aspect-video overflow-hidden"
        style={{ background: "color-mix(in srgb, var(--bg) 60%, transparent)" }}
        onMouseEnter={() => !reduce && play()}
        onMouseLeave={stop}
      >
        {/* the mover is the thing that zooms and pans; the frame around it stays put */}
        <div ref={moverRef} data-testid={`mover-${shot.n}`} className="absolute inset-0 origin-top-left will-change-transform" style={{ transform: viewTransform(from) }}>
          {imageVersion !== undefined ? (
            // eslint-disable-next-line @next/next/no-img-element -- local files served by our own route; the Next image optimizer adds nothing here
            <img
              src={`/api/images/${videoId}/${shot.n}?v=${imageVersion}`}
              alt={`Shot ${shot.n}: ${shot.narration.slice(0, 90)}`}
              loading="lazy"
              className="size-full object-cover"
              draggable={false}
            />
          ) : (
            <div
              className="grid size-full place-items-center text-2xl font-bold"
              style={{ background: "repeating-linear-gradient(45deg, var(--surface-hover) 0 14px, transparent 14px 28px)", color: "var(--text-faint)" }}
              aria-hidden
            >
              {pad(shot.n)}
            </div>
          )}
        </div>
        <span className="badge absolute left-1.5 top-1.5" style={{ background: "rgba(0,0,0,.65)", color: "#fff" }}>
          {pad(shot.n)}
        </span>
        <button
          className="absolute bottom-1.5 right-1.5 grid size-7 place-items-center rounded-full"
          style={{ background: "rgba(0,0,0,.65)", color: "#fff" }}
          onClick={play}
          aria-label={`Preview motion for shot ${shot.n}`}
        >
          <Play size={12} fill="currentColor" />
        </button>
      </div>
      <div className="p-2">
        <label htmlFor={id} className="sr-only">
          Motion for shot {shot.n}
        </label>
        <select id={id} className="input !px-2.5 !py-1.5 !text-xs" value={motion} onChange={(e) => onChange(shot.n, e.target.value as MotionId)}>
          {MOTIONS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        {!first && (
          <select
            aria-label={`Transition into shot ${shot.n}`}
            className="input mt-1 !px-2.5 !py-1.5 !text-xs"
            value={edit?.transition ?? ""}
            onChange={(e) => onEdit(shot.n, { transition: (e.target.value || undefined) as TransitionId | undefined })}
          >
            <option value="">Into: {TRANSITIONS.find((t) => t.id === defaultStyle)?.label} (default)</option>
            {TRANSITIONS.map((t) => (
              <option key={t.id} value={t.id}>
                Into: {t.label}
              </option>
            ))}
          </select>
        )}
        <div className="mt-1 grid grid-cols-2 gap-1.5">
          <label className="text-[11px] text-[var(--text-faint)]">
            Pause
            <input
              type="number"
              aria-label={`Pause after shot ${shot.n} in seconds`}
              className="input !px-2 !py-1 !text-xs"
              min={0}
              max={HOLD_MAX}
              step={0.5}
              value={edit?.hold ?? 0}
              onChange={(e) => onEdit(shot.n, { hold: Math.min(HOLD_MAX, Math.max(0, Number(e.target.value) || 0)) })}
            />
          </label>
          <label className="text-[11px] text-[var(--text-faint)]">
            Speed
            <input
              type="number"
              aria-label={`Narration speed for shot ${shot.n}`}
              className="input !px-2 !py-1 !text-xs"
              min={SPEED_MIN}
              max={SPEED_MAX}
              step={0.05}
              value={edit?.speed ?? 1}
              onChange={(e) => onEdit(shot.n, { speed: Math.min(SPEED_MAX, Math.max(SPEED_MIN, Number(e.target.value) || 1)) })}
            />
          </label>
        </div>
        <p className="mt-1 px-0.5 text-[11px] text-[var(--text-faint)]">~{(shotSeconds(shot.narration) / (edit?.speed ?? 1) + (edit?.hold ?? 0)).toFixed(1)}s</p>
      </div>
    </li>
  );
});
