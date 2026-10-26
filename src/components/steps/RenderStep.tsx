"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Download, Film, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { ApiError, postJson } from "@/lib/api";
import { autoMotion, seedFromId, type Intensity, type MotionId } from "@/lib/motion";
import { CAPTION_OPTIONS, DEFAULT_RENDER_OPTIONS, RESOLUTIONS, planTimeline, resolveEdit, type RenderOptions, type RenderPlan, type RenderState } from "@/lib/renderShared";
import { hashText } from "@/lib/shots";
import { useStoredImages } from "@/lib/useStoredImages";
import { updateVideo, type Video } from "@/lib/videos";
import { useShotAudio } from "@/lib/voice";
import { NeedsPrompts, NeedsScript } from "./notices";

const mmss = (s: number) => `${Math.floor(Math.round(s) / 60)}:${String(Math.round(s) % 60).padStart(2, "0")}`;
const mb = (b: number) => (b >= 1_073_741_824 ? `${(b / 1_073_741_824).toFixed(2)} GB` : `${(b / 1_048_576).toFixed(1)} MB`);

/** Poll the render state. Fast while a render is running, otherwise just once. */
function useRender(videoId: string) {
  const [state, setState] = useState<RenderState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);
  const running = state?.job?.status === "running";

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () => {
      fetch(`/api/render/${videoId}`, { cache: "no-store" })
        .then(async (res) => {
          if (!res.ok) throw new Error(`Couldn't check the render (${res.status}).`);
          return (await res.json()) as RenderState;
        })
        .then((s) => {
          if (cancelled) return;
          setState(s);
          setError(null);
          if (s.job?.status === "running") timer = setTimeout(load, 1000);
        })
        .catch((e) => {
          if (cancelled) return;
          setError(e instanceof Error ? e.message : "Couldn't check the render.");
          if (running) timer = setTimeout(load, 3000);
        });
    };
    load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // `running` is read only to decide whether to keep retrying after an error
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId, tick]);

  return { state, error, refresh };
}

export function RenderStep({ video }: { video: Video }) {
  const shots = video.shots ?? [];
  if (!(video.script ?? "").trim()) return <NeedsScript video={video} />;
  if (shots.length === 0) return <NeedsPrompts video={video} />;
  return <Loaded video={video} shots={shots} />;
}

function Loaded({ video, shots }: { video: Video; shots: NonNullable<Video["shots"]> }) {
  const { images, loaded: imagesLoaded } = useStoredImages(video.id);
  const { meta, music, loaded: audioLoaded } = useShotAudio(video.id);
  const { state, error, refresh } = useRender(video.id);

  const opts = { ...DEFAULT_RENDER_OPTIONS, ...video.renderOptions };
  const { resolution, fps, captions, loudness, useMusic } = opts;
  const setOpt = (patch: Partial<RenderOptions>) => updateVideo(video.id, (v) => ({ renderOptions: { ...v.renderOptions, ...patch } }));
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const job = state?.job ?? null;
  const output = state?.output ?? null;
  const running = job?.status === "running";

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  const intensity: Intensity = video.motionIntensity ?? "normal";
  const seed = video.motionSeed ?? seedFromId(video.id);
  const overrides = video.motionOverrides ?? {};
  const musicVolume = video.music?.volume ?? 0.15;
  const musicDuck = video.music?.duck ?? true;
  const withMusic = Boolean(music && useMusic);
  const overridesKey = JSON.stringify(overrides);

  const missingImages = imagesLoaded ? shots.filter((s) => !images[s.n]).map((s) => s.n) : [];
  const missingAudio = audioLoaded ? shots.filter((s) => !meta[s.n]).map((s) => s.n) : [];
  const ready = imagesLoaded && audioLoaded && missingImages.length === 0 && missingAudio.length === 0;
  const narrationSeconds = shots.reduce((sum, s) => sum + (meta[s.n]?.duration ?? 0), 0);
  const edits = video.shotEdits;
  const transitionDefault = video.transition;
  const lengthEstimate = audioLoaded && shots.every((s) => meta[s.n])
    ? planTimeline(
        shots.map((s, i) => ({ duration: meta[s.n]?.duration ?? 0, edit: resolveEdit(transitionDefault, edits?.[s.n], i === 0) })),
        fps,
      ).totalFrames / fps
    : narrationSeconds + shots.length * 0.35 + 0.65;

  const plan = useMemo<Omit<RenderPlan, "fingerprint">>(
    () => {
      const ov = JSON.parse(overridesKey) as Record<number, MotionId>;
      return {
        resolution,
        fps,
        captions,
        loudness,
        intensity,
        music: withMusic ? { volume: musicVolume, duck: musicDuck } : null,
        shots: shots.map((s, i) => ({ n: s.n, motion: ov[s.n] ?? autoMotion(s.n, seed), ...resolveEdit(transitionDefault, edits?.[s.n], i === 0) })),
        title: video.title,
      };
    },
    [resolution, fps, captions, loudness, intensity, withMusic, musicVolume, musicDuck, shots, overridesKey, seed, video.title, edits, transitionDefault],
  );

  /** Changes whenever anything that ends up in the video changes (settings, motion, images, narration, music). */
  const fingerprint = useMemo(
    () =>
      hashText(
        JSON.stringify([
          plan.resolution, plan.fps, plan.captions, plan.loudness, plan.music, plan.shots,
          shots.map((s) => [images[s.n]?.mtime, meta[s.n]?.mtime]),
          withMusic ? music?.mtime : null,
        ]),
      ),
    [plan, shots, images, meta, music, withMusic],
  );

  const stale = Boolean(output && ready && output.fingerprint !== fingerprint);

  async function start() {
    setStarting(true);
    setStartError(null);
    try {
      await postJson(`/api/render/${video.id}`, { ...plan, fingerprint });
      refresh();
    } catch (e) {
      setStartError(e instanceof ApiError ? e.message : "Couldn't start the render.");
    } finally {
      setStarting(false);
    }
  }

  async function stop() {
    await fetch(`/api/render/${video.id}`, { method: "DELETE" }).catch(() => {});
    refresh();
  }

  async function removeVideo() {
    if (!window.confirm("Delete the rendered video? You can render it again.")) return;
    await fetch(`/api/render/${video.id}`, { method: "DELETE" }).catch(() => {});
    refresh();
  }

  function approve() {
    updateVideo(video.id, (v) => ({
      currentStep: "seo",
      steps: { ...v.steps, render: "approved", seo: v.steps.seo === "not_started" ? "in_progress" : v.steps.seo },
    }));
  }

  if (state && !state.ffmpeg) {
    return (
      <div role="alert" className="rounded-2xl p-5 text-sm" style={{ background: "color-mix(in srgb, var(--bad) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--bad) 40%, transparent)" }}>
        <p className="font-semibold">FFmpeg isn&apos;t installed on this computer.</p>
        <p className="mt-1 text-[var(--text-muted)]">
          Rendering needs it. Install FFmpeg from ffmpeg.org, check that <code>ffmpeg -version</code> works in a terminal, then restart the app. If it lives somewhere unusual, set <code>FFMPEG_PATH</code> and <code>FFPROBE_PATH</code> in <code>.env.local</code>.
        </p>
      </div>
    );
  }

  const elapsed = job ? ((job.finishedAt ?? now) - job.startedAt) / 1000 : 0;
  const eta = running && job && job.progress > 0.05 ? (elapsed / job.progress) * (1 - job.progress) : null;
  const optionsDisabled = running || starting;
  const resInfo = RESOLUTIONS.find((r) => r.id === resolution);

  return (
    <div className="space-y-7">
      {/* what's missing */}
      {(missingImages.length > 0 || missingAudio.length > 0) && (
        <div className="space-y-3 rounded-2xl p-4 text-sm" role="status" style={{ background: "color-mix(in srgb, var(--warn) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--warn) 40%, transparent)" }}>
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle size={15} style={{ color: "var(--warn)" }} /> Not ready to render yet
          </p>
          {missingImages.length > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex-1">
                {missingImages.length} shot{missingImages.length > 1 ? "s have" : " has"} no image ({list(missingImages)}).
              </span>
              <button className="btn" onClick={() => updateVideo(video.id, { currentStep: "images" })}>
                Go to Images
              </button>
            </div>
          )}
          {missingAudio.length > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex-1">
                {missingAudio.length} shot{missingAudio.length > 1 ? "s have" : " has"} no narration ({list(missingAudio)}).
              </span>
              <button className="btn" onClick={() => updateVideo(video.id, { currentStep: "voice" })}>
                Go to Voiceover
              </button>
            </div>
          )}
        </div>
      )}

      {/* options */}
      <div className="grid gap-6 md:grid-cols-2">
        <Group title="Quality">
          {RESOLUTIONS.map((r) => (
            <button key={r.id} className="pill" data-active={resolution === r.id} aria-pressed={resolution === r.id} title={r.hint} disabled={optionsDisabled} onClick={() => setOpt({ resolution: r.id })}>
              {r.label}
            </button>
          ))}
        </Group>
        <Group title="Frame rate">
          {([24, 30] as const).map((f) => (
            <button key={f} className="pill" data-active={fps === f} aria-pressed={fps === f} disabled={optionsDisabled} onClick={() => setOpt({ fps: f })}>
              {f} fps
            </button>
          ))}
        </Group>
        <Group title="Captions">
          {CAPTION_OPTIONS.map((c) => (
            <button key={c.id} className="pill" data-active={captions === c.id} aria-pressed={captions === c.id} title={c.hint} disabled={optionsDisabled} onClick={() => setOpt({ captions: c.id })}>
              {c.label}
            </button>
          ))}
        </Group>
        <div className="space-y-2.5">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-faint)]">Sound</h3>
          <label className="flex items-center gap-2.5 text-sm">
            <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={loudness} disabled={optionsDisabled} onChange={(e) => setOpt({ loudness: e.target.checked })} />
            Even out the loudness <span className="text-xs text-[var(--text-muted)]">(YouTube&apos;s target)</span>
          </label>
          {music ? (
            <label className="flex items-center gap-2.5 text-sm">
              <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={useMusic} disabled={optionsDisabled} onChange={(e) => setOpt({ useMusic: e.target.checked })} />
              Include background music <span className="text-xs text-[var(--text-muted)]">({music.name}, {Math.round((video.music?.volume ?? 0.15) * 100)}%{(video.music?.duck ?? true) ? ", ducks under speech" : ""})</span>
            </label>
          ) : (
            <p className="text-xs text-[var(--text-muted)]">No background music. You can add some in the Voiceover step.</p>
          )}
        </div>
      </div>

      <p className="text-xs text-[var(--text-muted)]">
        {shots.length} shots · about {mmss(lengthEstimate)} long · {resInfo?.label} {fps} fps. Images that aren&apos;t 16:9 are cropped to fit.
        {resolution === 2160 ? " 4K takes a lot longer to render and makes very large files." : ""}
      </p>

      {/* start / progress */}
      {running && job ? (
        <div role="status" aria-live="polite" className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Loader2 size={15} className="animate-spin" />
            <span data-testid="render-phase">{job.phase}</span>
            <span className="tabular-nums text-[var(--text-muted)]" data-testid="render-pct">
              {Math.round(job.progress * 100)}%
            </span>
            <span className="text-xs text-[var(--text-muted)]">
              {mmss(elapsed)} elapsed{eta !== null ? ` · about ${mmss(eta)} left` : ""}
            </span>
            <button className="btn ml-auto" onClick={stop}>
              Stop
            </button>
          </div>
          <div className="h-2 overflow-hidden rounded-full" style={{ background: "var(--surface-hover)" }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${job.progress * 100}%`, background: "var(--accent)" }} />
          </div>
          <p className="text-xs text-[var(--text-faint)]">You can leave this page. The render keeps going as long as the app is running.</p>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn btn-primary" onClick={start} disabled={!ready || starting || !state}>
            {starting ? <Loader2 size={15} className="animate-spin" /> : <Film size={15} />} {output ? "Render again" : "Render video"}
          </button>
          {!ready && imagesLoaded && audioLoaded && <span className="text-xs text-[var(--text-muted)]">Fix the items above first.</span>}
        </div>
      )}

      {startError && (
        <p role="alert" className="text-sm" style={{ color: "var(--bad)" }}>
          {startError}
        </p>
      )}
      {error && !running && (
        <p role="alert" className="text-xs" style={{ color: "var(--bad)" }}>
          {error}
        </p>
      )}
      {job?.status === "failed" && !running && (
        <div role="alert" className="rounded-2xl p-4 text-sm" style={{ background: "color-mix(in srgb, var(--bad) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--bad) 40%, transparent)" }}>
          <p className="font-semibold">The render failed{output ? " (your earlier video is still here)" : ""}.</p>
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-xs text-[var(--text-muted)]">{job.error}</pre>
        </div>
      )}
      {job?.status === "canceled" && !running && (
        <p role="status" className="text-xs text-[var(--text-muted)]">
          Render stopped.{output ? " Your earlier video is unchanged." : ""}
        </p>
      )}

      {/* the finished video */}
      {output && (
        <section aria-labelledby="out-h" className="space-y-3">
          <h3 id="out-h" className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-faint)]">
            Your video
          </h3>
          {stale && !running && (
            <div role="status" className="flex flex-wrap items-center gap-3 rounded-2xl p-4 text-sm" style={{ background: "color-mix(in srgb, var(--warn) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--warn) 40%, transparent)" }}>
              <AlertTriangle size={16} style={{ color: "var(--warn)" }} />
              <span className="flex-1">Something changed since this was rendered (settings, motion, images, narration or music).</span>
              <button className="btn" onClick={start} disabled={starting}>
                <RotateCcw size={14} /> Render again
              </button>
            </div>
          )}
          <video
            key={output.finishedAt}
            data-testid="render-video"
            className="aspect-video w-full rounded-2xl bg-black"
            controls
            preload="metadata"
            src={`/api/render/${video.id}/video?v=${output.finishedAt}`}
          />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[var(--text-muted)]" data-testid="render-info">
            <span>
              {mmss(output.duration)} · {output.width}×{output.height} · {Math.round(output.fps)} fps · {mb(output.bytes)}
            </span>
            <a className="btn ml-auto" href={`/api/render/${video.id}/video?download=1&name=${encodeURIComponent(video.title)}`} download>
              <Download size={14} /> Download MP4
            </a>
            <button className="btn" onClick={removeVideo} disabled={running} aria-label="Delete rendered video">
              <Trash2 size={14} />
            </button>
          </div>
        </section>
      )}

      <div className="flex items-center justify-end gap-3">
        {video.steps.render === "approved" && <span className="text-xs text-[var(--text-muted)]">Approved.</span>}
        <button className="btn btn-primary" onClick={approve} disabled={!output || running}>
          <Check size={15} /> {video.steps.render === "approved" ? "Continue to Title & SEO" : "Approve & continue"}
        </button>
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-faint)]">{title}</h3>
      <div className="flex flex-wrap gap-2" role="group" aria-label={title}>
        {children}
      </div>
    </div>
  );
}

function list(ns: number[]): string {
  return ns.length > 8 ? `${ns.slice(0, 8).join(", ")} and ${ns.length - 8} more` : ns.join(", ");
}
