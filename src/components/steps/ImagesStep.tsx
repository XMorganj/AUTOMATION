"use client";

import { useRef, useState } from "react";
import { Check, FolderOpen, ImagePlus, Loader2, RefreshCw, Trash2, UploadCloud } from "lucide-react";
import { matchFiles } from "@/lib/match";
import { updateVideo, type Video } from "@/lib/videos";
import { useStoredImages } from "@/lib/useStoredImages";
import { NeedsPrompts, NeedsScript } from "./notices";

const MAX_BYTES = 25 * 1024 * 1024;
const IMAGE_RE = /\.(png|jpe?g|webp)$/i;
const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

interface Candidate {
  name: string;
  blob: Blob;
}

async function putImage(videoId: string, n: number, blob: Blob): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`/api/images/${videoId}/${n}`, {
      method: "PUT",
      headers: { "content-type": blob.type || "application/octet-stream" },
      body: blob,
    });
  } catch {
    throw new Error("couldn't reach the server");
  }
  if (!res.ok) {
    const msg = ((await res.json().catch(() => null)) as { error?: string } | null)?.error;
    throw new Error(msg ?? `error ${res.status}`);
  }
}

async function aspectOf(blob: Blob): Promise<number | null> {
  try {
    const bmp = await createImageBitmap(blob);
    const r = bmp.width / bmp.height;
    bmp.close();
    return r;
  } catch {
    return null;
  }
}

async function runPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}

const pad = (n: number) => String(n).padStart(3, "0");

export function ImagesStep({ video }: { video: Video }) {
  const shots = video.shots ?? [];
  const { images, loaded, loadError, refresh } = useStoredImages(video.id);

  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);

  const pickRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const replaceFor = useRef<number | null>(null);

  if (!(video.script ?? "").trim() || shots.length === 0) {
    return shots.length === 0 && (video.script ?? "").trim() ? <NeedsPrompts video={video} /> : <NeedsScript video={video} />;
  }

  const have = shots.filter((s) => images[s.n]).length;
  const allHave = have === shots.length;
  const approved = video.steps.images === "approved";
  const extras = Object.keys(images)
    .map(Number)
    .filter((n) => n > shots.length);

  /** Turn whatever the person dropped (images, zips) into a flat list of image candidates. */
  async function expand(files: File[]): Promise<{ found: Candidate[]; problems: string[] }> {
    const found: Candidate[] = [];
    const problems: string[] = [];
    let ignored = 0;

    for (const f of files) {
      if (/\.zip$/i.test(f.name) || f.type === "application/zip" || f.type === "application/x-zip-compressed") {
        try {
          const JSZip = (await import("jszip")).default;
          const zip = await JSZip.loadAsync(f);
          const entries = Object.values(zip.files).filter((e) => !e.dir);
          if (entries.length > 3000) {
            problems.push(`${f.name} has ${entries.length} files, which is more than I'll open at once.`);
            continue;
          }
          for (const e of entries) {
            const base = e.name.replace(/^.*\//, "");
            if (e.name.startsWith("__MACOSX/") || base.startsWith(".") || !IMAGE_RE.test(base)) {
              ignored++;
              continue;
            }
            const ext = base.split(".").pop()!.toLowerCase();
            const raw = await e.async("blob");
            found.push({ name: e.name, blob: new Blob([raw], { type: MIME[ext] }) });
          }
        } catch {
          problems.push(`Couldn't open ${f.name}. Is it a valid ZIP file?`);
        }
      } else if (IMAGE_RE.test(f.name)) {
        found.push({ name: f.webkitRelativePath || f.name, blob: f });
      } else {
        ignored++;
      }
    }
    if (ignored) problems.push(`${ignored} file${ignored > 1 ? "s were" : " was"} skipped because ${ignored > 1 ? "they aren't" : "it isn't"} a PNG, JPEG or WebP image.`);
    return { found, problems };
  }

  async function handleFiles(raw: File[]) {
    if (raw.length === 0 || busy) return;
    setNotes([]);
    setErrors([]);
    setBusy({ done: 0, total: 0 });

    try {
      const { found, problems } = await expand(raw);
      const tooBig = found.filter((c) => c.blob.size > MAX_BYTES);
      const usable = found.filter((c) => c.blob.size <= MAX_BYTES);
      if (tooBig.length) problems.push(`${tooBig.length} image${tooBig.length > 1 ? "s are" : " is"} over 25 MB and was skipped.`);

      if (usable.length === 0) {
        setErrors([...problems, "No usable images found. To add a whole folder, use “Choose a folder”."]);
        return;
      }

      const match = matchFiles(
        usable.map((c) => ({ name: c.name, ref: c })),
        shots.length,
      );
      const jobs = [...match.assignments.entries()];

      const replacing = jobs.filter(([n]) => images[n]).length;
      if (replacing > 0 && !window.confirm(`This will replace ${replacing} image${replacing > 1 ? "s" : ""} you already have. Continue?`)) {
        return;
      }

      setBusy({ done: 0, total: jobs.length });
      const failures: string[] = [];
      let offRatio = 0;
      let done = 0;

      await runPool(jobs, 3, async ([n, cand]) => {
        const ratio = await aspectOf(cand.blob);
        if (ratio !== null && (ratio < 1.7 || ratio > 1.86)) offRatio++;
        try {
          await putImage(video.id, n, cand.blob);
        } catch (e) {
          failures.push(`Shot ${pad(n)} (${cand.name.replace(/^.*\//, "")}): ${e instanceof Error ? e.message : "failed"}`);
        }
        setBusy({ done: ++done, total: jobs.length });
      });

      const warn = [...match.warnings];
      if (offRatio) warn.push(`${offRatio} image${offRatio > 1 ? "s aren't" : " isn't"} 16:9, so ${offRatio > 1 ? "they'll" : "it'll"} be cropped or have bars in the final video.`);
      setNotes(warn);
      setErrors([...problems, ...failures.sort()]);
      if (jobs.length - failures.length > 0) {
        updateVideo(video.id, (v) => ({ steps: { ...v.steps, images: v.steps.images === "approved" ? "approved" : "in_progress" } }));
      }
      refresh();
    } finally {
      setBusy(null);
    }
  }

  async function handleReplace(file: File | undefined) {
    const n = replaceFor.current;
    replaceFor.current = null;
    if (!file || n === null) return;
    setNotes([]);
    setErrors([]);
    if (file.size > MAX_BYTES) {
      setErrors([`${file.name} is over 25 MB.`]);
      return;
    }
    setBusy({ done: 0, total: 1 });
    try {
      await putImage(video.id, n, file);
      const ratio = await aspectOf(file);
      if (ratio !== null && (ratio < 1.7 || ratio > 1.86)) setNotes(["That image isn't 16:9, so it'll be cropped or have bars in the final video."]);
      updateVideo(video.id, (v) => ({ steps: { ...v.steps, images: v.steps.images === "approved" ? "approved" : "in_progress" } }));
      refresh();
    } catch (e) {
      setErrors([`Shot ${pad(n)}: ${e instanceof Error ? e.message : "failed"}`]);
    } finally {
      setBusy(null);
    }
  }

  async function remove(n: number) {
    try {
      const res = await fetch(`/api/images/${video.id}/${n}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      refresh();
    } catch {
      setErrors([`Couldn't remove the image for shot ${pad(n)}.`]);
    }
  }

  async function removeExtras() {
    await Promise.all(extras.map((n) => fetch(`/api/images/${video.id}/${n}`, { method: "DELETE" })));
    refresh();
  }

  function approve() {
    updateVideo(video.id, (v) => ({
      currentStep: "motion",
      steps: { ...v.steps, images: "approved", motion: v.steps.motion === "not_started" ? "in_progress" : v.steps.motion },
    }));
  }

  const pct = Math.round((have / shots.length) * 100);

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          {loaded ? (
            <p className="text-sm">
              <strong>{have}</strong> of <strong>{shots.length}</strong> shots have an image
            </p>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">Checking saved images…</p>
          )}
          <span className="text-xs text-[var(--text-muted)]">{loaded ? `${pct}%` : ""}</span>
        </div>
        <div
          className="h-1.5 overflow-hidden rounded-full"
          style={{ background: "var(--border)" }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Shots with images"
        >
          <div className="h-full rounded-full transition-[width]" style={{ width: `${pct}%`, background: "var(--accent)" }} />
        </div>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handleFiles(Array.from(e.dataTransfer.files));
        }}
        className="rounded-2xl border-2 border-dashed p-6 text-center transition-colors md:p-8"
        style={{
          borderColor: dragging ? "var(--accent)" : "var(--border-strong)",
          background: dragging ? "color-mix(in srgb, var(--accent) 8%, transparent)" : "transparent",
        }}
      >
        <UploadCloud className="mx-auto mb-3" size={28} style={{ color: "var(--accent)" }} />
        <p className="text-sm font-semibold">Drop your images or a ZIP here</p>
        <p className="mx-auto mt-1 max-w-xl text-xs text-[var(--text-muted)]">
          Name files with their shot number (001, 002 …) and they land on the right shot. Files with other names are matched in name
          order, and you can fix any shot below.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button className="btn btn-primary" onClick={() => pickRef.current?.click()} disabled={busy !== null}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />} Choose images or ZIP
          </button>
          <button className="btn" onClick={() => folderRef.current?.click()} disabled={busy !== null}>
            <FolderOpen size={15} /> Choose a folder
          </button>
        </div>
        <input
          ref={pickRef}
          type="file"
          hidden
          multiple
          accept="image/png,image/jpeg,image/webp,.zip,application/zip"
          aria-label="Choose images or a ZIP"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            void handleFiles(files);
          }}
        />
        <input
          ref={folderRef}
          type="file"
          hidden
          multiple
          aria-label="Choose a folder of images"
          {...({ webkitdirectory: "" } as object)}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            void handleFiles(files);
          }}
        />
        <input
          ref={replaceRef}
          type="file"
          hidden
          accept="image/png,image/jpeg,image/webp"
          aria-label="Choose an image for this shot"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            void handleReplace(f);
          }}
        />
        {busy && busy.total > 0 && (
          <p className="mt-4 text-xs text-[var(--text-muted)]" role="status">
            Uploading {busy.done} of {busy.total}
          </p>
        )}
        {busy && busy.total === 0 && (
          <p className="mt-4 text-xs text-[var(--text-muted)]" role="status">
            Reading files…
          </p>
        )}
      </div>

      {loadError && (
        <p role="alert" className="text-sm" style={{ color: "var(--bad)" }}>
          {loadError}
        </p>
      )}
      {notes.length > 0 && (
        <ul className="space-y-1 rounded-2xl p-4 text-sm" style={{ background: "color-mix(in srgb, var(--warn) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--warn) 40%, transparent)" }}>
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      {errors.length > 0 && (
        <ul role="alert" className="space-y-1 text-sm" style={{ color: "var(--bad)" }}>
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      {extras.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl p-4 text-sm" style={{ background: "color-mix(in srgb, var(--warn) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--warn) 40%, transparent)" }}>
          <span className="flex-1">
            {extras.length} saved image{extras.length > 1 ? "s don't" : " doesn't"} belong to any shot anymore. This happens when the prompts were rebuilt with fewer shots.
          </span>
          <button className="btn" onClick={removeExtras}>
            Remove them
          </button>
        </div>
      )}

      {!loaded ? (
        <p className="text-sm text-[var(--text-muted)]">Loading saved images…</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {shots.map((s) => {
            const img = images[s.n];
            return (
              <li key={s.n} className="glass overflow-hidden" style={{ borderRadius: 14 }}>
                <div className="relative aspect-video" style={{ background: "color-mix(in srgb, var(--bg) 60%, transparent)" }}>
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element -- local files served by our own route; the Next image optimizer adds nothing here
                    <img
                      src={`/api/images/${video.id}/${s.n}?v=${img.mtime}`}
                      alt={`Shot ${s.n}: ${s.narration.slice(0, 90)}`}
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  ) : (
                    <div className="grid size-full place-items-center text-xs font-semibold text-[var(--text-faint)]">Missing</div>
                  )}
                  <span className="badge absolute left-1.5 top-1.5" style={{ background: "rgba(0,0,0,.65)", color: "#fff" }}>
                    {pad(s.n)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 p-2">
                  <button
                    className="btn flex-1 justify-center !px-2 !py-1.5 !text-xs"
                    disabled={busy !== null}
                    onClick={() => {
                      replaceFor.current = s.n;
                      replaceRef.current?.click();
                    }}
                    aria-label={`${img ? "Replace" : "Add"} image for shot ${s.n}`}
                  >
                    {img ? <RefreshCw size={12} /> : <ImagePlus size={12} />} {img ? "Replace" : "Add"}
                  </button>
                  {img && (
                    <button className="btn !px-2 !py-1.5" onClick={() => remove(s.n)} aria-label={`Remove image for shot ${s.n}`} disabled={busy !== null}>
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-center justify-end gap-3">
        {!allHave && loaded && <span className="text-xs text-[var(--text-muted)]">{shots.length - have} shots still need an image.</span>}
        {approved && allHave && <span className="text-xs text-[var(--text-muted)]">Approved.</span>}
        <button className="btn btn-primary" disabled={!allHave || busy !== null} onClick={approve}>
          <Check size={15} /> {approved ? "Continue to Motion" : "Approve & continue"}
        </button>
      </div>
    </div>
  );
}
