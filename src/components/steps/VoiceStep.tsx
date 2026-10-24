"use client";

import { useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Loader2, Pause, Play, RotateCcw, Trash2, Upload } from "lucide-react";
import { ApiError, postJson } from "@/lib/api";
import { usePlayer } from "@/lib/usePlayer";
import { DEFAULT_SETTINGS, DEMO_ID, useShotAudio, useVoiceConfig, voiceKey, type AudioMeta, type VoiceChoice, type VoiceConfig } from "@/lib/voice";
import { updateVideo, type Shot, type Video } from "@/lib/videos";
import { NeedsPrompts, NeedsScript } from "./notices";
import { VoicePicker } from "./VoicePicker";

const pad = (n: number) => String(n).padStart(3, "0");
const FATAL = new Set(["invalid_api_key", "quota_exceeded", "voice_not_found", "no_key"]);
const MAX_RETRIES = 4;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function mmss(totalSeconds: number): string {
  const s = Math.round(totalSeconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

type Row = "ready" | "stale" | "missing";

export function VoiceStep({ video }: { video: Video }) {
  const { state, reload } = useVoiceConfig();
  const shots = video.shots ?? [];

  if (!(video.script ?? "").trim()) return <NeedsScript video={video} />;
  if (shots.length === 0) return <NeedsPrompts video={video} />;

  if (state.status === "loading") return <p className="text-sm text-[var(--text-muted)]">Loading voices…</p>;
  if (state.status === "error") {
    return (
      <div className="space-y-3" role="alert">
        <p className="text-sm" style={{ color: "var(--bad)" }}>
          {state.message}
        </p>
        <button className="btn" onClick={reload}>
          <RotateCcw size={14} /> Try again
        </button>
      </div>
    );
  }
  return <Loaded video={video} shots={shots} config={state.config} reloadConfig={reload} />;
}

function Loaded({ video, shots, config, reloadConfig }: { video: Video; shots: Shot[]; config: VoiceConfig; reloadConfig: () => void }) {
  const { meta, music, loaded, refresh } = useShotAudio(video.id);
  const player = usePlayer();
  const demo = !config.configured;

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [failed, setFailed] = useState<Record<number, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<number[] | null>(null);
  const [musicBusy, setMusicBusy] = useState(false);
  const [musicError, setMusicError] = useState<string | null>(null);
  const cancel = useRef(false);
  const lastRefresh = useRef(0);

  const choice: VoiceChoice | undefined = video.voice
    ? { ...DEFAULT_SETTINGS, ...video.voice }
    : demo
      ? { ...DEFAULT_SETTINGS, voiceId: DEMO_ID, voiceName: "Demo voice (silent)", modelId: DEMO_ID }
      : undefined;

  const rows = useMemo(() => {
    const out: Record<number, Row> = {};
    for (const s of shots) {
      const m = meta[s.n];
      out[s.n] = !m ? "missing" : choice && m.key === voiceKey(s.narration, choice) ? "ready" : "stale";
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `choice` is rebuilt every render; its fields are what matter
  }, [shots, meta, choice?.voiceId, choice?.modelId, choice?.stability, choice?.similarity, choice?.style, choice?.speed, choice?.boost]);

  const todo = shots.filter((s) => rows[s.n] !== "ready").map((s) => s.n);
  const readyCount = shots.length - todo.length;
  const totalSeconds = shots.reduce((sum, s) => sum + (rows[s.n] === "ready" ? (meta[s.n]?.duration ?? 0) : 0), 0);
  const approved = video.steps.voice === "approved";
  const model = config.models.find((m) => m.id === choice?.modelId);
  const factor = model?.costKnown ? model.costFactor : 1;

  const charsFor = (ns: number[]) => ns.reduce((sum, n) => sum + (shots.find((s) => s.n === n)?.narration.trim().length ?? 0), 0);
  const remaining = config.usage ? Math.max(0, config.usage.limit - config.usage.used) : null;

  function setVoice(c: VoiceChoice) {
    updateVideo(video.id, (v) => ({ voice: c, steps: { ...v.steps, voice: v.steps.voice === "approved" ? "in_progress" : v.steps.voice === "not_started" ? "in_progress" : v.steps.voice } }));
  }

  async function generateOne(n: number, c: VoiceChoice): Promise<{ ok: true } | { ok: false; message: string; fatal: boolean }> {
    const i = shots.findIndex((s) => s.n === n);
    const s = shots[i];
    let attempt = 0;
    for (;;) {
      try {
        await postJson(`/api/voiceover/${video.id}/${n}`, {
          text: s.narration,
          voiceId: c.voiceId,
          modelId: c.modelId,
          key: voiceKey(s.narration, c),
          settings: { stability: c.stability, similarity: c.similarity, style: c.style, speed: c.speed, boost: c.boost },
          previousText: shots[i - 1]?.narration,
          nextText: shots[i + 1]?.narration,
        });
        return { ok: true };
      } catch (e) {
        const err = e instanceof ApiError ? e : new ApiError("Something went wrong.", 0);
        if (err.status === 429 && attempt < MAX_RETRIES) {
          attempt++;
          await sleep(1500 * 2 ** (attempt - 1));
          continue;
        }
        return { ok: false, message: err.message, fatal: FATAL.has(err.code ?? "") || err.status === 401 || err.status === 403 };
      }
    }
  }

  async function run(ns: number[]) {
    if (!choice || ns.length === 0) return;
    setConfirm(null);
    setBusy(true);
    setFatal(null);
    setNotice(null);
    cancel.current = false;
    setProgress({ done: 0, total: ns.length });
    setFailed((f) => {
      const next = { ...f };
      ns.forEach((n) => delete next[n]);
      return next;
    });

    const queue = [...ns];
    let done = 0;
    let stop = false;
    const workers = Math.max(1, Math.min(config.concurrency, ns.length));
    await Promise.all(
      Array.from({ length: workers }, async () => {
        while (!stop && !cancel.current) {
          const n = queue.shift();
          if (n === undefined) return;
          const r = await generateOne(n, choice);
          if (r.ok) {
            done++;
            setProgress({ done, total: ns.length });
            // show finished rows as they land, but don't re-list on every single shot
            if (Date.now() - lastRefresh.current > 1200) {
              lastRefresh.current = Date.now();
              refresh();
            }
          } else if (r.fatal) {
            stop = true;
            setFatal(r.message);
          } else {
            setFailed((f) => ({ ...f, [n]: r.message }));
          }
        }
      }),
    );
    refresh();
    reloadConfig();
    setBusy(false);
    if (cancel.current) setNotice("Stopped. Shots already done are saved.");
  }

  function start(ns: number[]) {
    if (demo || ns.length === 0) return void run(ns);
    setConfirm(ns);
  }

  async function removeAll() {
    if (!window.confirm("Delete all narration for this video? You can generate it again, but that uses credits.")) return;
    await fetch(`/api/voiceover/${video.id}`, { method: "DELETE" }).catch(() => {});
    refresh();
  }

  async function uploadMusic(file: File) {
    setMusicBusy(true);
    setMusicError(null);
    try {
      const res = await fetch(`/api/music/${video.id}`, { method: "PUT", headers: { "x-file-name": encodeURIComponent(file.name) }, body: file });
      if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error || `Upload failed (${res.status}).`);
      if (!video.music) updateVideo(video.id, { music: { volume: 0.15, duck: true } });
      refresh();
    } catch (e) {
      setMusicError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setMusicBusy(false);
    }
  }

  async function removeMusic() {
    await fetch(`/api/music/${video.id}`, { method: "DELETE" }).catch(() => {});
    refresh();
  }

  function approve() {
    player.stop();
    updateVideo(video.id, (v) => ({
      currentStep: "render",
      steps: { ...v.steps, voice: "approved", render: v.steps.render === "not_started" ? "in_progress" : v.steps.render },
    }));
  }

  const musicMix = video.music ?? { volume: 0.15, duck: true };

  return (
    <div className="space-y-7">
      {demo && (
        <div className="rounded-2xl p-4 text-sm" role="status" style={{ background: "color-mix(in srgb, var(--warn) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--warn) 40%, transparent)" }}>
          <strong>Demo mode.</strong> No ElevenLabs key is set, so narration will be silent placeholders with realistic timing. Add <code>ELEVENLABS_API_KEY</code> to <code>.env.local</code> and restart to get real voices.
        </div>
      )}

      {config.usage && (
        <p className="text-xs text-[var(--text-muted)]">
          ElevenLabs plan: {config.usage.tier} · {config.usage.used.toLocaleString()} of {config.usage.limit.toLocaleString()} characters used
        </p>
      )}

      <VoicePicker config={config} choice={choice} onChange={setVoice} player={player} disabled={busy} />

      {choice && (
        <section aria-labelledby="narr-h" className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <h3 id="narr-h" className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-faint)]">
              Narration
            </h3>
            <span className="text-xs text-[var(--text-muted)]" data-testid="voice-count">
              {loaded ? `${readyCount} of ${shots.length} shots ready${readyCount > 0 ? ` · ${mmss(totalSeconds)}` : ""}` : "Checking saved narration…"}
            </span>
            <div className="ml-auto flex flex-wrap gap-2">
              {busy ? (
                <button className="btn" onClick={() => (cancel.current = true)}>
                  Stop
                </button>
              ) : (
                <>
                  <button className="btn btn-primary" disabled={!loaded || todo.length === 0} onClick={() => start(todo)}>
                    {readyCount === 0 ? "Generate narration" : `Generate ${todo.length} remaining`}
                  </button>
                  {readyCount > 0 && (
                    <button className="btn" onClick={removeAll} aria-label="Delete all narration">
                      <Trash2 size={14} />
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {busy && (
            <div role="status" aria-live="polite" className="text-xs text-[var(--text-muted)]">
              <div className="mb-1.5 flex items-center gap-2">
                <Loader2 size={13} className="animate-spin" /> Generating {progress.done} of {progress.total}…
              </div>
              <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "var(--surface-hover)" }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%`, background: "var(--accent)" }} />
              </div>
            </div>
          )}

          {confirm && (
            <div role="alertdialog" aria-labelledby="confirm-h" className="rounded-2xl p-4 text-sm" style={{ background: "var(--surface-hover)", border: "1px solid var(--border-strong)" }}>
              <p id="confirm-h" className="font-semibold">
                Generate {confirm.length} shot{confirm.length > 1 ? "s" : ""}?
              </p>
              <p className="mt-1 text-[var(--text-muted)]">
                This sends about {charsFor(confirm).toLocaleString()} characters to ElevenLabs
                {factor !== 1 ? ` (about ${Math.round(charsFor(confirm) * factor).toLocaleString()} credits on this model)` : ""}.
                {remaining !== null ? ` You have ${remaining.toLocaleString()} left this period.` : ""}
              </p>
              {remaining !== null && Math.round(charsFor(confirm) * factor) > remaining && (
                <p className="mt-1 flex items-center gap-1.5" style={{ color: "var(--warn)" }}>
                  <AlertTriangle size={14} /> That is more than your remaining balance, so it will stop part way.
                </p>
              )}
              <div className="mt-3 flex gap-2">
                <button className="btn btn-primary" onClick={() => run(confirm)}>
                  Generate
                </button>
                <button className="btn" onClick={() => setConfirm(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {fatal && (
            <p role="alert" className="text-sm" style={{ color: "var(--bad)" }}>
              {fatal}
            </p>
          )}
          {notice && (
            <p role="status" className="text-xs text-[var(--text-muted)]">
              {notice}
            </p>
          )}
          {player.error && (
            <p role="alert" className="text-xs" style={{ color: "var(--bad)" }}>
              {player.error}
            </p>
          )}
          {readyCount < shots.length && Object.keys(failed).length > 0 && !busy && (
            <p className="text-xs" style={{ color: "var(--warn)" }}>
              {Object.keys(failed).length} shot{Object.keys(failed).length > 1 ? "s" : ""} didn&apos;t finish. Use Redo on those rows.
            </p>
          )}

          <ul className="space-y-2">
            {shots.map((s) => (
              <ShotRow
                key={s.n}
                shot={s}
                status={rows[s.n]}
                meta={meta[s.n]}
                error={failed[s.n]}
                videoId={video.id}
                playing={player.playing === `shot:${s.n}`}
                busy={busy}
                onPlay={() => meta[s.n] && player.toggle(`shot:${s.n}`, `/api/voiceover/${video.id}/${s.n}?v=${meta[s.n].mtime}`)}
                onRedo={() => (demo ? run([s.n]) : setConfirm([s.n]))}
              />
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="music-h" className="space-y-3">
        <h3 id="music-h" className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-faint)]">
          Background music <span className="font-normal normal-case tracking-normal">(optional)</span>
        </h3>
        {music ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="font-semibold">{music.name}</span>
              <span className="text-xs text-[var(--text-muted)]">{(music.bytes / 1_048_576).toFixed(1)} MB</span>
              <button className="btn !px-3 !py-1.5 !text-xs" onClick={() => player.toggle("music", `/api/music/${video.id}?v=${music.mtime}`)}>
                {player.playing === "music" ? <Pause size={12} /> : <Play size={12} />} Preview
              </button>
              <button className="btn !px-3 !py-1.5 !text-xs" onClick={removeMusic}>
                <Trash2 size={12} /> Remove
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className="mb-1 flex justify-between">
                  <label htmlFor="music-vol" className="text-sm font-semibold">
                    Music volume
                  </label>
                  <span className="text-xs tabular-nums text-[var(--text-muted)]">{Math.round(musicMix.volume * 100)}%</span>
                </div>
                <input
                  id="music-vol"
                  type="range"
                  min={0}
                  max={0.6}
                  step={0.01}
                  value={musicMix.volume}
                  onChange={(e) => updateVideo(video.id, { music: { ...musicMix, volume: Number(e.target.value) } })}
                  className="w-full accent-[var(--accent)]"
                />
              </div>
              <label className="flex items-center gap-2.5 self-end text-sm">
                <input type="checkbox" checked={musicMix.duck} onChange={(e) => updateVideo(video.id, { music: { ...musicMix, duck: e.target.checked } })} className="size-4 accent-[var(--accent)]" />
                Lower the music while the narrator speaks
              </label>
            </div>
          </div>
        ) : (
          <label className="btn cursor-pointer" aria-disabled={musicBusy}>
            {musicBusy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Add a music file
            <input
              type="file"
              accept="audio/mpeg,audio/wav,audio/mp4,audio/ogg,audio/flac,.mp3,.wav,.m4a,.ogg,.flac"
              className="sr-only"
              disabled={musicBusy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void uploadMusic(f);
              }}
            />
          </label>
        )}
        {musicError && (
          <p role="alert" className="text-xs" style={{ color: "var(--bad)" }}>
            {musicError}
          </p>
        )}
        <p className="text-xs text-[var(--text-faint)]">Use music you have the rights to. It loops under the whole video and is mixed in at render time.</p>
      </section>

      <div className="flex items-center justify-end gap-3">
        {approved && <span className="text-xs text-[var(--text-muted)]">Approved.</span>}
        <button className="btn btn-primary" onClick={approve} disabled={!loaded || readyCount < shots.length || busy}>
          <Check size={15} /> {approved ? "Continue to Render" : "Approve & continue"}
        </button>
      </div>
    </div>
  );
}

function ShotRow({
  shot,
  status,
  meta,
  error,
  playing,
  busy,
  onPlay,
  onRedo,
}: {
  shot: Shot;
  status: Row;
  meta: AudioMeta | undefined;
  error: string | undefined;
  videoId: string;
  playing: boolean;
  busy: boolean;
  onPlay: () => void;
  onRedo: () => void;
}) {
  const verb = error ? "Retry" : status === "missing" ? "Generate" : "Redo";
  const label = error ? "Failed" : status === "ready" ? "Ready" : status === "stale" ? "Out of date" : "Not made";
  const color = error ? "var(--bad)" : status === "ready" ? "var(--good)" : status === "stale" ? "var(--warn)" : "var(--text-faint)";
  return (
    <li className="glass flex flex-wrap items-center gap-3 p-3" style={{ borderRadius: 14 }} data-status={error ? "failed" : status}>
      <span className="badge shrink-0">{pad(shot.n)}</span>
      <p className="min-w-0 flex-1 basis-60 text-sm text-[var(--text-muted)]">{shot.narration}</p>
      <span className="text-xs font-semibold" style={{ color }}>
        {label}
        {meta && status !== "missing" ? <span className="font-normal text-[var(--text-muted)]"> · {meta.duration.toFixed(1)}s</span> : null}
      </span>
      {meta && (
        <button className="btn !px-3 !py-1.5 !text-xs" onClick={onPlay} aria-label={`${playing ? "Pause" : "Play"} narration for shot ${shot.n}`}>
          {playing ? <Pause size={12} /> : <Play size={12} />}
        </button>
      )}
      <button className="btn !px-3 !py-1.5 !text-xs" onClick={onRedo} disabled={busy} aria-label={`${verb} narration for shot ${shot.n}`}>
        <RotateCcw size={12} /> {verb === "Generate" ? "Make" : verb}
      </button>
      {error && (
        <p role="alert" className="basis-full text-xs" style={{ color: "var(--bad)" }}>
          {error}
        </p>
      )}
    </li>
  );
}
