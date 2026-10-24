"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, Copy, Loader2, Plus, Sparkles, X } from "lucide-react";
import { ApiError, copyText, postJson } from "@/lib/api";
import { buildChapters, chapterLines, shotStarts, stamp, type ChapterDraft } from "@/lib/chapters";
import { DEFAULT_RENDER_OPTIONS } from "@/lib/renderShared";
import {
  DESCRIPTION_MAX,
  TAGS_MAX_CHARS,
  TITLE_GOOD,
  TITLE_MAX,
  finalDescription,
  noAngles,
  tagChars,
  type SeoData,
  type SeoSuggestions,
  type ThumbSettings,
} from "@/lib/seoShared";
import { hashText } from "@/lib/shots";
import { useStoredImages } from "@/lib/useStoredImages";
import { updateVideo, type Video } from "@/lib/videos";
import { useShotAudio } from "@/lib/voice";
import { NeedsScript, StaleNotice } from "./notices";
import { ThumbnailMaker } from "./ThumbnailMaker";

const H = ({ children, id }: { children: React.ReactNode; id?: string }) => (
  <h3 id={id} className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-faint)]">
    {children}
  </h3>
);

export function SeoStep({ video }: { video: Video }) {
  const script = video.script ?? "";
  const shots = useMemo(() => video.shots ?? [], [video.shots]);
  const seo = video.seo;
  const { meta, loaded: audioLoaded } = useShotAudio(video.id);
  const { images } = useStoredImages(video.id);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [newTag, setNewTag] = useState("");

  const fps = video.renderOptions?.fps ?? DEFAULT_RENDER_OPTIONS.fps;
  const { starts, haveTimes } = useMemo(() => {
    const durations = shots.map((s) => meta[s.n]?.duration);
    const have = audioLoaded && shots.length > 0 && durations.every((d) => typeof d === "number");
    return { haveTimes: have, starts: have ? shotStarts(durations as number[], fps) : [] };
  }, [shots, meta, audioLoaded, fps]);
  const shotIndex = useMemo(() => new Map(shots.map((s, i) => [s.n, i])), [shots]);

  // chapters in shot-index terms (buildChapters wants 1..N positions), then back to the real shot numbers
  const chapters = useMemo(() => {
    if (!seo || !haveTimes) return [];
    const drafts = seo.chapters.flatMap((c) => (shotIndex.has(c.shot) ? [{ shot: (shotIndex.get(c.shot) as number) + 1, title: c.title }] : []));
    return buildChapters(drafts, starts).map((c) => ({ ...c, shot: shots[c.shot - 1].n }));
  }, [seo, haveTimes, shotIndex, starts, shots]);

  if (!script.trim()) return <NeedsScript video={video} />;

  const scriptHash = hashText(script);
  const stale = Boolean(seo && seo.scriptHash !== scriptHash);
  const approved = video.steps.seo === "approved";

  function save(patch: Partial<SeoData>) {
    updateVideo(video.id, (v) => {
      if (!v.seo) return {};
      const next = { ...v.seo, ...patch };
      const ready = next.title.trim() && next.description.trim();
      return { seo: next, steps: { ...v.steps, seo: ready ? "ready" : "in_progress" } };
    });
  }

  async function generate() {
    if (seo && !stale && !window.confirm("Write new titles, description and tags? Your edits to those will be replaced.")) return;
    setBusy(true);
    setError(null);
    try {
      const r = await postJson<SeoSuggestions>("/api/seo", {
        title: video.title,
        theme: video.theme,
        script,
        shots: shots.map((s) => ({ n: s.n, text: s.narration })),
      });
      const firstShot = shots.find((s) => s.n in images)?.n ?? shots[0]?.n ?? 1;
      const thumb: ThumbSettings = seo?.thumb ?? { shot: firstShot, text: r.thumbnailTexts[0] ?? "", layout: "left", color: "yellow", highlightLast: false };
      updateVideo(video.id, (v) => ({
        seo: {
          title: r.titles[0]?.title ?? v.title,
          titleOptions: r.titles,
          description: r.description,
          tags: r.tags,
          hashtags: r.hashtags,
          thumbnailTexts: r.thumbnailTexts,
          chapters: r.chapters,
          thumb: seo?.thumb ? { ...thumb } : { ...thumb, text: thumb.text || r.thumbnailTexts[0] || "" },
          thumbSavedAt: v.seo?.thumbSavedAt,
          scriptHash,
          mock: r.mock,
        },
        steps: { ...v.steps, seo: "ready" },
      }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function copy(key: string, text: string) {
    if (await copyText(text)) {
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    }
  }

  function approve() {
    updateVideo(video.id, (v) => ({
      currentStep: "upload",
      steps: { ...v.steps, seo: "approved", upload: v.steps.upload === "not_started" ? "in_progress" : v.steps.upload },
    }));
  }

  if (!seo) {
    return (
      <div className="space-y-4">
        <p className="max-w-xl text-sm text-[var(--text-muted)]">
          This reads your script and writes five title options, a description that hooks in the first two lines, tags, hashtags, chapter markers and text ideas for the thumbnail. You can edit everything afterwards.
        </p>
        <button className="btn btn-primary" onClick={generate} disabled={busy}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} Write title &amp; description
        </button>
        {error && (
          <p role="alert" className="text-sm" style={{ color: "var(--bad)" }}>
            {error}
          </p>
        )}
      </div>
    );
  }

  const chapterText = chapterLines(chapters);
  const full = finalDescription(seo.description, chapterText, seo.hashtags);
  const titleLen = seo.title.length;
  const thumb: ThumbSettings = seo.thumb ?? { shot: shots[0]?.n ?? 1, text: "", layout: "left", color: "yellow", highlightLast: false };
  const imageVersions = Object.fromEntries(Object.entries(images).map(([n, im]) => [Number(n), im.mtime]));

  const checks: { ok: boolean; text: string; warn?: boolean }[] = [
    { ok: titleLen > 0 && titleLen <= TITLE_GOOD, warn: titleLen > TITLE_GOOD && titleLen <= TITLE_MAX, text: titleLen === 0 ? "Pick a title" : titleLen <= TITLE_GOOD ? `Title is ${titleLen} characters (fits in search results)` : titleLen <= TITLE_MAX ? `Title is ${titleLen} characters; it may be cut off after about ${TITLE_GOOD}` : `Title is over ${TITLE_MAX} characters` },
    { ok: seo.description.trim().length >= 150, text: seo.description.trim().length >= 150 ? "Description is long enough to help search" : "Description is short; 150+ characters helps search" },
    { ok: chapters.length >= 3, text: chapters.length >= 3 ? `${chapters.length} chapters starting at 0:00` : haveTimes ? "Needs at least 3 chapters, 10 seconds or more apart" : "Chapter times need narration for every shot" },
    { ok: seo.tags.length >= 5 && tagChars(seo.tags) <= TAGS_MAX_CHARS, text: tagChars(seo.tags) > TAGS_MAX_CHARS ? `Tags are ${tagChars(seo.tags)} characters; the limit is ${TAGS_MAX_CHARS}` : seo.tags.length < 5 ? "Add at least 5 tags" : `${seo.tags.length} tags (${tagChars(seo.tags)} of ${TAGS_MAX_CHARS} characters)` },
    { ok: seo.hashtags.length >= 1 && seo.hashtags.length <= 3, text: "1 to 3 hashtags (YouTube shows the first three above the title)" },
    { ok: Boolean(seo.thumbSavedAt), text: seo.thumbSavedAt ? "Thumbnail saved" : "Make and save a thumbnail" },
  ];
  const canApprove = titleLen > 0 && titleLen <= TITLE_MAX && seo.description.trim().length > 0 && full.length <= DESCRIPTION_MAX;

  return (
    <div className="space-y-8">
      {stale && <StaleNotice what="the titles and description" onRedo={generate} busy={busy} />}
      {seo.mock && (
        <p role="status" className="text-xs" style={{ color: "var(--warn)" }}>
          These are placeholders, because no AI is set up. Check the AI settings in your <code>.env.local</code>.
        </p>
      )}

      {/* title */}
      <section aria-labelledby="t-h">
        <H id="t-h">Title</H>
        <div className="space-y-2" role="radiogroup" aria-labelledby="t-h">
          {seo.titleOptions.map((o) => (
            <label key={o.title} className="glass flex cursor-pointer items-start gap-3 p-3" style={{ borderRadius: 14, ...(seo.title === o.title ? { borderColor: "var(--accent)" } : {}) }}>
              <input type="radio" name="title-option" className="mt-1 accent-[var(--accent)]" checked={seo.title === o.title} onChange={() => save({ title: o.title })} />
              <span className="min-w-0 flex-1 text-sm">
                {o.title}
                <span className="ml-2 text-xs text-[var(--text-muted)]">
                  {o.title.length} characters{o.style ? ` · ${o.style}` : ""}
                </span>
              </span>
            </label>
          ))}
        </div>
        <label htmlFor="title" className="mb-1 mt-3 block text-sm font-semibold">
          Final title <span className="font-normal text-[var(--text-muted)]">(edit freely)</span>
        </label>
        <input id="title" className="input" value={seo.title} maxLength={TITLE_MAX + 20} onChange={(e) => save({ title: noAngles(e.target.value) })} />
        <p className="mt-1 text-xs tabular-nums" style={{ color: titleLen > TITLE_MAX ? "var(--bad)" : titleLen > TITLE_GOOD ? "var(--warn)" : "var(--text-muted)" }} data-testid="title-count">
          {titleLen} / {TITLE_MAX}
        </p>
      </section>

      {/* description */}
      <section aria-labelledby="d-h">
        <div className="flex items-center">
          <H id="d-h">Description</H>
          <button className="btn ml-auto !px-3 !py-1.5 !text-xs" onClick={() => copy("desc", full)}>
            {copied === "desc" ? <Check size={12} /> : <Copy size={12} />} Copy with chapters
          </button>
        </div>
        <textarea id="desc" aria-labelledby="d-h" className="input min-h-44" value={seo.description} onChange={(e) => save({ description: noAngles(e.target.value) })} />
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Only the first two lines show in search, so they should hook. {seo.description.length} characters. Chapters and hashtags are added below automatically.
        </p>
      </section>

      {/* chapters */}
      <section aria-labelledby="c-h">
        <div className="flex items-center">
          <H id="c-h">Chapters</H>
          {chapterText && (
            <button className="btn ml-auto !px-3 !py-1.5 !text-xs" onClick={() => copy("chap", chapterText)}>
              {copied === "chap" ? <Check size={12} /> : <Copy size={12} />} Copy
            </button>
          )}
        </div>
        {!haveTimes ? (
          <p className="text-sm text-[var(--text-muted)]">
            {shots.length === 0 ? "Chapters come from your shots. Build the image prompts first." : audioLoaded ? "Chapter times come from the narration, and some shots don't have any yet. Finish the Voiceover step." : "Checking narration…"}
          </p>
        ) : chapters.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">No chapters fit YouTube&apos;s rules yet (at least 3, starting at 0:00, 10 seconds or more apart).</p>
        ) : (
          <ul className="space-y-2" data-testid="chapter-list">
            {chapters.map((c) => (
              <li key={c.shot} className="flex items-center gap-3">
                <span className="w-14 shrink-0 text-sm tabular-nums text-[var(--text-muted)]">{stamp(c.time)}</span>
                <input
                  className="input !py-1.5"
                  aria-label={`Chapter at ${stamp(c.time)}`}
                  value={c.title}
                  maxLength={60}
                  onChange={(e) => save({ chapters: seo.chapters.map((x: ChapterDraft) => (x.shot === c.shot ? { ...x, title: noAngles(e.target.value) } : x)) })}
                />
                {c.time > 0 && (
                  <button className="btn !px-2.5 !py-1.5" aria-label={`Remove chapter at ${stamp(c.time)}`} onClick={() => save({ chapters: seo.chapters.filter((x: ChapterDraft) => x.shot !== c.shot) })}>
                    <X size={12} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {haveTimes && (
          <p className="mt-2 text-xs text-[var(--text-faint)]">Times follow your narration exactly as the Render step lays it out ({fps} fps).</p>
        )}
      </section>

      {/* tags */}
      <section aria-labelledby="g-h">
        <div className="flex items-center">
          <H id="g-h">Tags</H>
          <button className="btn ml-auto !px-3 !py-1.5 !text-xs" onClick={() => copy("tags", seo.tags.join(", "))}>
            {copied === "tags" ? <Check size={12} /> : <Copy size={12} />} Copy
          </button>
        </div>
        <ul className="flex flex-wrap gap-2" data-testid="tag-list">
          {seo.tags.map((t) => (
            <li key={t} className="pill" style={{ cursor: "default" }}>
              {t}
              <button aria-label={`Remove tag ${t}`} onClick={() => save({ tags: seo.tags.filter((x) => x !== t) })} className="ml-1 opacity-70 hover:opacity-100">
                <X size={11} />
              </button>
            </li>
          ))}
        </ul>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const t = noAngles(newTag).replace(/^#/, "").replace(/,/g, " ").replace(/\s+/g, " ").trim().slice(0, 40);
            if (t && !seo.tags.some((x) => x.toLowerCase() === t.toLowerCase())) save({ tags: [...seo.tags, t] });
            setNewTag("");
          }}
        >
          <input className="input" aria-label="Add a tag" placeholder="Add a tag" value={newTag} maxLength={40} onChange={(e) => setNewTag(e.target.value)} />
          <button className="btn shrink-0" type="submit" disabled={!newTag.trim()}>
            <Plus size={14} /> Add
          </button>
        </form>
        <p className="mt-1.5 text-xs tabular-nums" style={{ color: tagChars(seo.tags) > TAGS_MAX_CHARS ? "var(--bad)" : "var(--text-muted)" }}>
          {tagChars(seo.tags)} / {TAGS_MAX_CHARS} characters
        </p>
        <p className="mt-3 text-xs text-[var(--text-muted)]">
          Hashtags: {seo.hashtags.length ? seo.hashtags.map((h) => `#${h}`).join(" ") : "none"}
        </p>
      </section>

      {/* thumbnail */}
      <section aria-labelledby="th-h">
        <H id="th-h">Thumbnail</H>
        <ThumbnailMaker
          videoId={video.id}
          shots={shots.map((s) => s.n)}
          imageVersions={imageVersions}
          settings={thumb}
          suggestions={seo.thumbnailTexts}
          savedAt={seo.thumbSavedAt ?? 0}
          onChange={(t) => save({ thumb: t })}
          onSaved={(at) => save({ thumbSavedAt: at })}
          onRemoved={() => save({ thumbSavedAt: 0 })}
        />
      </section>

      {/* checklist */}
      <section aria-labelledby="k-h">
        <H id="k-h">Before you publish</H>
        <ul className="space-y-1.5 text-sm" data-testid="checklist">
          {checks.map((c) => (
            <li key={c.text} className="flex items-start gap-2" data-ok={c.ok}>
              {c.ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" style={{ color: "var(--good)" }} /> : <AlertTriangle size={16} className="mt-0.5 shrink-0" style={{ color: c.warn ? "var(--warn)" : "var(--text-faint)" }} />}
              <span className={c.ok ? "" : "text-[var(--text-muted)]"}>{c.text}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {error && (
          <p role="alert" className="mr-auto text-sm" style={{ color: "var(--bad)" }}>
            {error}
          </p>
        )}
        <button className="btn" onClick={generate} disabled={busy}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} Write new ones
        </button>
        {approved && <span className="text-xs text-[var(--text-muted)]">Approved.</span>}
        <button className="btn btn-primary" onClick={approve} disabled={!canApprove}>
          <Check size={15} /> {approved ? "Continue to Upload" : "Approve & continue"}
        </button>
      </div>
    </div>
  );
}
