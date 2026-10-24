"use client";

import { memo, useEffect, useRef } from "react";
import { Check, Play, Shuffle } from "lucide-react";
import { EASE_CSS, INTENSITIES, MOTIONS, autoMotion, motionPath, seedFromId, viewTransform, type Intensity, type MotionId } from "@/lib/motion";
import { WORDS_PER_MIN } from "@/lib/pipeline";
import { countWords } from "@/lib/shots";
import { useStoredImages } from "@/lib/useStoredImages";
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

  const touch = (v: Video) => ({ ...v.steps, motion: v.steps.motion === "approved" ? "approved" : "ready" }) as Video["steps"];

  function setIntensity(i: Intensity) {
    updateVideo(video.id, (v) => ({ motionIntensity: i, steps: touch(v) }));
  }

  function setMotion(n: number, id: MotionId) {
    updateVideo(video.id, (v) => ({ motionOverrides: { ...(v.motionOverrides ?? {}), [n]: id }, steps: touch(v) }));
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
}: {
  shot: Shot;
  videoId: string;
  imageVersion: number | undefined;
  motion: MotionId;
  intensity: Intensity;
  onChange: (n: number, id: MotionId) => void;
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
        <p className="mt-1 px-0.5 text-[11px] text-[var(--text-faint)]">~{shotSeconds(shot.narration).toFixed(1)}s</p>
      </div>
    </li>
  );
});
