"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, ExternalLink, Loader2, LogOut, RotateCcw, Tv, Upload, X } from "lucide-react";
import { ApiError, copyText, postJson } from "@/lib/api";
import { finalDescription } from "@/lib/seoShared";
import {
  CATEGORIES,
  DEFAULT_UPLOAD_OPTIONS,
  describeBytes,
  type Privacy,
  type UploadOptions,
  type UploadState,
  type YoutubeStatus,
} from "@/lib/uploadShared";
import { updateVideo, type Video } from "@/lib/videos";

const H = ({ children }: { children: React.ReactNode }) => <h3 className="eyebrow mb-2">{children}</h3>;

/** Poll the upload state: fast while uploading, otherwise once. */
function useUpload(videoId: string) {
  const [state, setState] = useState<UploadState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () => {
      fetch(`/api/upload/${videoId}`, { cache: "no-store" })
        .then(async (res) => {
          if (!res.ok) throw new Error(`Couldn't check the upload (${res.status}).`);
          return (await res.json()) as UploadState;
        })
        .then((s) => {
          if (cancelled) return;
          setState(s);
          setError(null);
          if (s.job?.status === "running") timer = setTimeout(load, 1000);
        })
        .catch((e) => {
          if (cancelled) return;
          setError(e instanceof Error ? e.message : "Couldn't check the upload.");
        });
    };
    load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [videoId, tick]);

  return { state, error, refresh };
}

/** Local "YYYY-MM-DDTHH:mm" for a datetime-local input, N hours from now. */
function localInput(hoursAhead: number) {
  const d = new Date(Date.now() + hoursAhead * 3_600_000);
  d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function UploadStep({ video }: { video: Video }) {
  const seo = video.seo;
  const { state, error: stateError, refresh } = useUpload(video.id);
  const [yt, setYt] = useState<YoutubeStatus | null>(null);
  const [banner, setBanner] = useState<{ ok: boolean; text: string } | null>(() => {
    // coming back from Google: ?yt=connected or ?yt=error&msg=...
    if (typeof window === "undefined") return null;
    const q = new URLSearchParams(window.location.search);
    const r = q.get("yt");
    if (!r) return null;
    return r === "connected" ? { ok: true, text: "YouTube connected." } : { ok: false, text: q.get("msg") || "Couldn't connect YouTube." };
  });
  const [copied, setCopied] = useState(false);

  const saved = video.uploadSettings;
  const privacy: Privacy | "schedule" = saved?.privacy ?? DEFAULT_UPLOAD_OPTIONS.privacy;
  const categoryId = saved?.categoryId ?? DEFAULT_UPLOAD_OPTIONS.categoryId;
  const kids: boolean | null = saved?.kids ?? null;
  const ai = saved?.ai ?? DEFAULT_UPLOAD_OPTIONS.aiDisclosure;
  const keep = (patch: Partial<NonNullable<Video["uploadSettings"]>>) =>
    updateVideo(video.id, (v) => ({
      uploadSettings: { privacy: "private", categoryId: "22", kids: null, ai: true, ...v.uploadSettings, ...patch },
    }));
  const setPrivacy = (p: Privacy | "schedule") => keep({ privacy: p });
  const setCategoryId = (c: string) => keep({ categoryId: c });
  const setKids = (k: boolean) => keep({ kids: k });
  const setAi = (a: boolean) => keep({ ai: a });
  const [when, setWhen] = useState(() => localInput(24));
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [showDesc, setShowDesc] = useState(false);

  // Whether Google keys exist, plus the exact redirect address to register
  useEffect(() => {
    fetch("/api/youtube/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: YoutubeStatus | null) => j && setYt(j))
      .catch(() => {});
  }, [state?.connected]);

  // Tidy the address bar after reading the result above
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (!q.has("yt")) return;
    q.delete("yt");
    q.delete("msg");
    const rest = q.toString();
    window.history.replaceState(null, "", window.location.pathname + (rest ? `?${rest}` : ""));
  }, []);

  const job = state?.job ?? null;
  const running = job?.status === "running";
  const done = job?.status === "done";

  const description = useMemo(
    () => (seo ? (seo.finalDescription ?? finalDescription(seo.description, "", seo.hashtags)) : ""),
    [seo],
  );

  // Record the upload on the video once it has finished
  useEffect(() => {
    if (!job || job.status !== "done" || !job.youtubeId) return;
    if (video.youtube?.id === job.youtubeId && video.steps.upload === "approved") return;
    updateVideo(video.id, (v) => ({
      youtube: { id: job.youtubeId as string, privacy: job.privacy ?? job.options.privacy, uploadedAt: job.finishedAt ?? Date.now(), publishAt: job.options.publishAt },
      steps: { ...v.steps, upload: "approved" },
    }));
  }, [job, video.id, video.youtube?.id, video.steps.upload]);

  if (!seo || video.steps.seo !== "approved") {
    return (
      <div className="border border-dashed p-6 text-sm" style={{ borderColor: "var(--border-strong)", borderRadius: 8 }}>
        <p className="text-[var(--text-muted)]">Finish Title &amp; SEO first. The upload uses its title, description, tags and thumbnail.</p>
        <button className="btn mt-4" onClick={() => updateVideo(video.id, { currentStep: "seo" })}>
          Go to Title &amp; SEO
        </button>
      </div>
    );
  }

  const configured = state?.configured ?? yt?.configured ?? false;
  const connected = state?.connected ?? false;
  const noVideo = state ? !state.video.exists : false;
  const scheduleOk = privacy !== "schedule" || Number.isFinite(Date.parse(when));
  const options = (): UploadOptions => ({
    privacy: privacy === "schedule" ? "private" : privacy,
    publishAt: privacy === "schedule" ? new Date(when).toISOString() : undefined,
    categoryId,
    madeForKids: kids === true,
    aiDisclosure: ai,
  });

  const checks: { ok: boolean; block?: boolean; text: string }[] = [
    {
      ok: !noVideo && Boolean(state),
      block: true,
      text: state?.video.exists ? `Rendered video ready (${describeBytes(state.video.bytes)})` : "No rendered video yet. Render it in the Render step",
    },
    { ok: seo.title.trim().length > 0 && seo.title.length <= 100, block: true, text: `Title: ${seo.title || "(missing)"}` },
    { ok: video.steps.render === "approved", text: video.steps.render === "approved" ? "Render approved" : "The Render step isn't approved. Make sure this is the version you want" },
    { ok: Boolean(state?.thumbnail.exists), text: state?.thumbnail.exists ? "Thumbnail ready" : "No thumbnail saved. YouTube will pick a frame instead" },
    { ok: Boolean(seo.finalDescription), text: seo.finalDescription ? "Description includes the chapter timestamps" : "Approve Title & SEO again to include chapter timestamps in the description" },
  ];
  const blocked = checks.some((c) => c.block && !c.ok);

  async function start(again = false) {
    if (privacy === "public" && !window.confirm("This will make the video public on YouTube right away. Continue?")) return;
    if (again && !window.confirm("This video was already uploaded. Upload it again as a new YouTube video?")) return;
    setStarting(true);
    setStartError(null);
    try {
      await postJson(`/api/upload/${video.id}`, { title: seo!.title, description, tags: seo!.tags, options: options(), again });
      refresh();
    } catch (e) {
      setStartError(e instanceof ApiError ? e.message : "Couldn't start the upload.");
    } finally {
      setStarting(false);
    }
  }

  async function cancel() {
    await fetch(`/api/upload/${video.id}`, { method: "DELETE" }).catch(() => {});
    refresh();
  }

  async function disconnect() {
    if (!window.confirm("Disconnect YouTube? You can connect it again any time.")) return;
    await fetch("/api/youtube/disconnect", { method: "POST" }).catch(() => {});
    refresh();
  }

  const pct = job && job.total ? Math.min(100, Math.floor((job.sent / job.total) * 100)) : 0;
  const returnTo = typeof window === "undefined" ? "/" : window.location.pathname;

  return (
    <div className="space-y-7">
      {banner && (
        <div
          role="status"
          className="flex items-center gap-2 border p-3 text-sm"
          style={{ borderRadius: 8, borderColor: banner.ok ? "var(--good)" : "var(--bad)", color: banner.ok ? "var(--good)" : "var(--bad)" }}
        >
          {banner.ok ? <Check size={15} /> : <AlertTriangle size={15} />}
          <span className="flex-1">{banner.text}</span>
          <button className="btn" style={{ padding: ".3rem .5rem" }} aria-label="Dismiss" onClick={() => setBanner(null)}>
            <X size={13} />
          </button>
        </div>
      )}

      {/* ---- Connection ---- */}
      <section aria-labelledby="conn-h">
        <H>YouTube account</H>
        {!state ? (
          <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
            <Loader2 size={14} className="animate-spin" /> Checking…
          </div>
        ) : !configured ? (
          <div className="glass space-y-3 p-4 text-sm">
            <p className="font-semibold">Set up Google once, then it&apos;s one click per video.</p>
            <ol className="list-decimal space-y-1.5 pl-5 text-[var(--text-muted)]">
              <li>In console.cloud.google.com, make a project and turn on <strong className="text-[var(--text)]">YouTube Data API v3</strong>.</li>
              <li>Set up the OAuth consent screen (External) and add your Google account as a test user.</li>
              <li>Create an <strong className="text-[var(--text)]">OAuth client ID</strong> of type Web application, and add this redirect address:</li>
            </ol>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate border px-2.5 py-2 text-xs" style={{ borderColor: "var(--border-strong)", borderRadius: 6, fontFamily: "var(--font-mono)" }}>
                {yt?.redirectUri ?? "…"}
              </code>
              <button
                className="btn"
                onClick={async () => {
                  if (yt && (await copyText(yt.redirectUri))) {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }
                }}
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="text-[var(--text-muted)]">
              Then add <code style={{ fontFamily: "var(--font-mono)" }}>GOOGLE_CLIENT_ID</code> and{" "}
              <code style={{ fontFamily: "var(--font-mono)" }}>GOOGLE_CLIENT_SECRET</code> to this site&apos;s settings, restart it, and press Check again.
            </p>
            <button className="btn" onClick={refresh}>
              <RotateCcw size={14} /> Check again
            </button>
          </div>
        ) : !connected ? (
          <div className="glass flex flex-wrap items-center gap-4 p-4">
            <Tv size={22} style={{ color: "var(--accent)" }} />
            <p className="min-w-0 flex-1 text-sm text-[var(--text-muted)]">Connect the Google account that owns your channel. MA Studio can then upload videos and set thumbnails. It cannot delete anything.</p>
            <a className="btn btn-primary" href={`/api/youtube/auth?returnTo=${encodeURIComponent(returnTo)}`}>
              Connect YouTube
            </a>
          </div>
        ) : (
          <div className="glass flex flex-wrap items-center gap-3 p-4">
            <span className="led" data-on="true" />
            <p className="min-w-0 flex-1 text-sm">
              Connected{state.channel ? <> as <strong>{state.channel.title}</strong></> : null}
            </p>
            <button className="btn" onClick={disconnect} disabled={running}>
              <LogOut size={14} /> Disconnect
            </button>
          </div>
        )}
        {stateError && <p role="alert" className="mt-2 text-sm" style={{ color: "var(--bad)" }}>{stateError}</p>}
      </section>

      {connected && (
        <>
          {/* ---- What will be sent ---- */}
          <section aria-label="What will be uploaded">
            <H>What will be uploaded</H>
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
              <div className="space-y-3">
                <div className="glass p-4">
                  <div className="eyebrow">Title</div>
                  <div className="mt-1 text-lg font-semibold leading-snug">{seo.title}</div>
                  <div className="eyebrow mt-3">Tags</div>
                  <div className="mt-1 text-sm text-[var(--text-muted)]">{seo.tags.slice(0, 8).join(", ")}{seo.tags.length > 8 ? ` +${seo.tags.length - 8} more` : ""}</div>
                  <button className="btn mt-3" onClick={() => setShowDesc((s) => !s)} aria-expanded={showDesc}>
                    {showDesc ? "Hide description" : "Show description"}
                  </button>
                  {showDesc && (
                    <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap border p-3 text-xs" style={{ borderColor: "var(--border)", borderRadius: 6, fontFamily: "var(--font-sans)" }}>
                      {description}
                    </pre>
                  )}
                  <button className="btn mt-3 ml-2" onClick={() => updateVideo(video.id, { currentStep: "seo" })}>
                    Edit in Title &amp; SEO
                  </button>
                </div>

                <ul className="space-y-1.5 text-sm" aria-label="Checks">
                  {checks.map((c) => (
                    <li key={c.text} className="flex items-start gap-2.5">
                      {c.ok ? <Check size={15} className="mt-0.5 shrink-0" style={{ color: "var(--good)" }} /> : <AlertTriangle size={15} className="mt-0.5 shrink-0" style={{ color: c.block ? "var(--bad)" : "var(--warn)" }} />}
                      <span className={c.ok ? "text-[var(--text-muted)]" : ""}>{c.text}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {state?.video.exists && (
                <video
                  controls
                  preload="metadata"
                  className="aspect-video w-full border bg-black"
                  style={{ borderColor: "var(--border)", borderRadius: 8 }}
                  src={`/api/render/${video.id}/video`}
                  aria-label="The rendered video"
                />
              )}
            </div>
          </section>

          {/* ---- Settings ---- */}
          <section aria-label="Upload settings" className="space-y-6">
            <div>
              <H>Who can watch</H>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4" role="radiogroup" aria-label="Visibility">
                {(
                  [
                    ["private", "Private", "Only you. Safest: check it in YouTube Studio, then publish."],
                    ["unlisted", "Unlisted", "Anyone with the link."],
                    ["public", "Public", "Live on your channel immediately."],
                    ["schedule", "Schedule", "Uploaded private, goes public at the time you pick."],
                  ] as const
                ).map(([id, label, hint]) => (
                  <button
                    key={id}
                    role="radio"
                    aria-checked={privacy === id}
                    disabled={running}
                    onClick={() => setPrivacy(id)}
                    className="glass glass-hover p-3 text-left"
                    style={privacy === id ? { borderColor: "var(--accent)", boxShadow: "inset 0 0 0 1px var(--accent)" } : undefined}
                  >
                    <div className="text-sm font-semibold">{label}</div>
                    <div className="mt-1 text-xs text-[var(--text-muted)]">{hint}</div>
                  </button>
                ))}
              </div>
              {privacy === "schedule" && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <label className="text-sm font-semibold" htmlFor="when">Go public at</label>
                  <input id="when" type="datetime-local" className="input" style={{ width: "auto" }} value={when} min={localInput(0.2)} onChange={(e) => setWhen(e.target.value)} disabled={running} />
                  <span className="eyebrow">Your time ({Intl.DateTimeFormat().resolvedOptions().timeZone})</span>
                  {!scheduleOk && <span className="text-xs" style={{ color: "var(--bad)" }}>Pick a date and time.</span>}
                  <span className="text-xs text-[var(--text-muted)]">It must be at least 5 minutes from now.</span>
                </div>
              )}
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <H>Category</H>
                <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} disabled={running} aria-label="Category">
                  {CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <H>Audience (YouTube requires an answer)</H>
                <div className="flex gap-2" role="radiogroup" aria-label="Made for kids">
                  {([[false, "No, not made for kids"], [true, "Yes, made for kids"]] as const).map(([v, label]) => (
                    <button key={label} role="radio" aria-checked={kids === v} className="pill" data-active={kids === v} disabled={running} onClick={() => setKids(v)}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <label className="flex cursor-pointer items-start gap-3 text-sm">
              <input type="checkbox" className="mt-1" checked={ai} disabled={running} onChange={(e) => setAi(e.target.checked)} />
              <span>
                <strong>Tell viewers this contains AI-made content.</strong>{" "}
                <span className="text-[var(--text-muted)]">YouTube asks creators to disclose realistic AI-generated or altered material. Leave this on unless the video clearly has none.</span>
              </span>
            </label>
          </section>

          {/* ---- Upload / progress ---- */}
          <section aria-label="Upload" className="space-y-4">
            {running && job && (
              <div className="glass p-4" role="status">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 font-semibold"><Loader2 size={15} className="animate-spin" /> {job.phase}</span>
                  <span className="eyebrow">{pct}% · {describeBytes(job.sent)} of {describeBytes(job.total)}</span>
                </div>
                <div className="h-2 overflow-hidden" style={{ background: "var(--border)", borderRadius: 3 }} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Upload progress">
                  <div className="h-full transition-[width]" style={{ width: `${Math.max(pct, 2)}%`, background: "var(--accent)" }} />
                </div>
                <p className="mt-2 text-xs text-[var(--text-muted)]">You can leave this page. The upload keeps going on the server.</p>
                <button className="btn mt-3" onClick={cancel}>Cancel upload</button>
              </div>
            )}

            {job?.status === "failed" && (
              <div role="alert" className="flex items-start gap-3 border p-4 text-sm" style={{ borderRadius: 8, borderColor: "var(--bad)" }}>
                <AlertTriangle size={16} className="mt-0.5 shrink-0" style={{ color: "var(--bad)" }} />
                <div>
                  <p className="font-semibold">The upload didn&apos;t finish.</p>
                  <p className="text-[var(--text-muted)]">{job.error}</p>
                  {job.resumable && <p className="mt-1 text-[var(--text-muted)]">{describeBytes(job.sent)} already arrived, so pressing Upload carries on from there.</p>}
                </div>
              </div>
            )}
            {job?.status === "canceled" && <p className="text-sm text-[var(--text-muted)]">Upload canceled.</p>}

            {done && job?.youtubeId && (
              <div className="glass p-5" style={{ borderColor: "var(--good)" }}>
                <div className="flex items-center gap-2 text-lg font-semibold" style={{ fontFamily: "var(--font-display)" }}>
                  <Check size={18} style={{ color: "var(--good)" }} /> Uploaded to YouTube
                </div>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  {job.options.publishAt
                    ? `It's private now and goes public ${new Date(job.options.publishAt).toLocaleString()}.`
                    : job.privacy && job.privacy !== job.options.privacy
                      ? `You asked for ${job.options.privacy}, but YouTube set it to ${job.privacy}. New Google projects are limited to private until they pass an audit. Change it in YouTube Studio.`
                      : `It's ${job.privacy ?? job.options.privacy}.`}
                </p>
                {job.thumbnail === "failed" && <p className="mt-1 text-sm" style={{ color: "var(--warn)" }}>{job.thumbnailError}</p>}
                {job.thumbnail === "skipped" && <p className="mt-1 text-sm text-[var(--text-muted)]">No thumbnail was uploaded, so YouTube chose a frame.</p>}
                <div className="mt-4 flex flex-wrap gap-2">
                  <a className="btn btn-primary" href={`https://youtu.be/${job.youtubeId}`} target="_blank" rel="noreferrer">
                    <ExternalLink size={14} /> Watch on YouTube
                  </a>
                  <a className="btn" href={`https://studio.youtube.com/video/${job.youtubeId}/edit`} target="_blank" rel="noreferrer">
                    Open in YouTube Studio
                  </a>
                </div>
              </div>
            )}

            {startError && <p role="alert" className="text-sm" style={{ color: "var(--bad)" }}>{startError}</p>}

            {!running && (
              <div className="flex flex-wrap items-center gap-3">
                {done ? (
                  <button className="btn" onClick={() => start(true)} disabled={starting || blocked || kids === null || !scheduleOk}>
                    <Upload size={15} /> Upload again as a new video
                  </button>
                ) : (
                  <button className="btn btn-primary" onClick={() => start(false)} disabled={starting || blocked || kids === null || !scheduleOk}>
                    {starting ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                    {job?.status === "failed" && job.resumable ? "Resume upload" : privacy === "schedule" ? "Upload and schedule" : "Upload to YouTube"}
                  </button>
                )}
                {kids === null && !blocked && <span className="text-xs text-[var(--text-muted)]">Answer the audience question above first.</span>}
                {blocked && <span className="text-xs" style={{ color: "var(--bad)" }}>Fix the red items above first.</span>}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
