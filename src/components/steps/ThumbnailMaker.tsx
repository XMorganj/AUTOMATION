"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Download, Loader2, Trash2 } from "lucide-react";
import type { ThumbSettings } from "@/lib/seoShared";

const W = 1280;
const H = 720;
const COLORS: Record<ThumbSettings["color"], string> = { yellow: "#FFD60A", white: "#FFFFFF", red: "#FF3B30" };
const LAYOUTS: { id: ThumbSettings["layout"]; label: string }[] = [
  { id: "left", label: "Big left" },
  { id: "center", label: "Centre" },
  { id: "bar", label: "Bottom bar" },
];
const FONT = `900 %spx Impact, "Arial Black", "Helvetica Neue", Arial, sans-serif`;

/** Greedy word wrap for the given width. */
function wrap(ctx: CanvasRenderingContext2D, words: string[], maxWidth: number): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (cur && ctx.measureText(test).width > maxWidth) {
      lines.push(cur);
      cur = w;
    } else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Draw the thumbnail. `img` may be null (then a plain dark backdrop is used). */
export function drawThumbnail(ctx: CanvasRenderingContext2D, img: CanvasImageSource | null, size: { w: number; h: number } | null, s: ThumbSettings) {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#101014";
  ctx.fillRect(0, 0, W, H);
  if (img && size && size.w && size.h) {
    // cover-crop to 16:9
    const scale = Math.max(W / size.w, H / size.h);
    const dw = size.w * scale;
    const dh = size.h * scale;
    ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
  }

  const text = s.text.trim().toUpperCase();
  if (!text) return;
  const words = text.split(/\s+/);
  const accent = COLORS[s.color];

  // readability: a dark gradient behind the words
  if (s.layout === "left") {
    const g = ctx.createLinearGradient(0, 0, W * 0.75, 0);
    g.addColorStop(0, "rgba(0,0,0,0.88)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  } else if (s.layout === "center") {
    ctx.fillStyle = "rgba(0,0,0,0.38)";
    ctx.fillRect(0, 0, W, H);
  } else {
    const g = ctx.createLinearGradient(0, H * 0.45, 0, H);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.9)");
    ctx.fillStyle = g;
    ctx.fillRect(0, H * 0.45, W, H * 0.55);
  }

  const maxW = s.layout === "left" ? W * 0.58 : W * 0.88;
  const maxH = s.layout === "bar" ? H * 0.3 : H * 0.7;
  const maxLines = s.layout === "bar" ? 2 : 4;

  // biggest font that fits the box
  let size2 = s.layout === "bar" ? 130 : 190;
  let lines: string[] = [];
  for (; size2 >= 40; size2 -= 4) {
    ctx.font = FONT.replace("%s", String(size2));
    lines = wrap(ctx, words, maxW);
    if (lines.length <= maxLines && lines.length * size2 * 1.04 <= maxH && lines.every((l) => ctx.measureText(l).width <= maxW)) break;
  }
  ctx.font = FONT.replace("%s", String(size2));
  ctx.textBaseline = "top";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(8, size2 * 0.14);
  ctx.strokeStyle = "#000";

  const lineH = size2 * 1.04;
  const blockH = lines.length * lineH;
  const align = s.layout === "left" ? "left" : "center";
  ctx.textAlign = align;
  const x = s.layout === "left" ? 64 : W / 2;
  const top = s.layout === "bar" ? H - blockH - 44 : s.layout === "left" ? (H - blockH) / 2 : (H - blockH) / 2;

  // which line/word gets the accent colour: the last word, when asked
  lines.forEach((line, i) => {
    const y = top + i * lineH;
    const isLast = i === lines.length - 1;
    const parts = isLast && s.highlightLast && line.includes(" ") ? [line.slice(0, line.lastIndexOf(" ")), line.slice(line.lastIndexOf(" ") + 1)] : null;
    if (!parts) {
      ctx.strokeText(line, x, y);
      ctx.fillStyle = s.highlightLast ? (isLast ? accent : "#fff") : accent;
      ctx.fillText(line, x, y);
      return;
    }
    // two colours on one line: measure, then draw left to right
    ctx.textAlign = "left";
    const head = parts[0] + " ";
    const wHead = ctx.measureText(head).width;
    const wTail = ctx.measureText(parts[1]).width;
    const start = align === "left" ? x : x - (wHead + wTail) / 2;
    ctx.strokeText(head, start, y);
    ctx.fillStyle = "#fff";
    ctx.fillText(head, start, y);
    ctx.strokeText(parts[1], start + wHead, y);
    ctx.fillStyle = accent;
    ctx.fillText(parts[1], start + wHead, y);
    ctx.textAlign = align;
  });
}

export function ThumbnailMaker({
  videoId,
  shots,
  imageVersions,
  settings,
  suggestions,
  savedAt,
  onChange,
  onSaved,
  onRemoved,
}: {
  videoId: string;
  shots: number[];
  imageVersions: Record<number, number>;
  settings: ThumbSettings;
  suggestions: string[];
  savedAt: number;
  onChange: (s: ThumbSettings) => void;
  onSaved: (at: number) => void;
  onRemoved: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<{ el: HTMLImageElement; w: number; h: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasImage = settings.shot in imageVersions;
  const version = imageVersions[settings.shot];

  // load the chosen shot's picture
  useEffect(() => {
    if (version === undefined) return;
    let cancelled = false;
    const el = new Image();
    el.onload = () => !cancelled && setImg({ el, w: el.naturalWidth, h: el.naturalHeight });
    el.onerror = () => !cancelled && setImg(null);
    el.src = `/api/images/${videoId}/${settings.shot}?v=${version}`;
    return () => {
      cancelled = true;
    };
  }, [videoId, settings.shot, version]);

  const visibleImg = hasImage ? img : null;
  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    drawThumbnail(ctx, visibleImg?.el ?? null, visibleImg ? { w: visibleImg.w, h: visibleImg.h } : null, settings);
  }, [visibleImg, settings]);

  /** JPEG under YouTube's 2 MB limit: lower the quality until it fits. */
  const toJpeg = useCallback(async (): Promise<Blob> => {
    const c = canvas.current;
    if (!c) throw new Error("The preview isn't ready yet.");
    for (let q = 0.92; q >= 0.5; q -= 0.1) {
      const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/jpeg", q));
      if (blob && blob.size < 1_900_000) return blob;
    }
    throw new Error("Couldn't make the image small enough (under 2 MB).");
  }, []);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const blob = await toJpeg();
      const res = await fetch(`/api/thumbnail/${videoId}`, { method: "PUT", body: blob });
      const data = (await res.json().catch(() => null)) as { error?: string; mtime?: number } | null;
      if (!res.ok) throw new Error(data?.error || `Couldn't save (${res.status}).`);
      onSaved(data?.mtime ?? Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the thumbnail.");
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    setError(null);
    try {
      const blob = await toJpeg();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "thumbnail.jpg";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't make the download.");
    }
  }

  async function remove() {
    await fetch(`/api/thumbnail/${videoId}`, { method: "DELETE" }).catch(() => {});
    onRemoved();
  }

  const set = (p: Partial<ThumbSettings>) => onChange({ ...settings, ...p });

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <div>
        <canvas ref={canvas} width={W} height={H} data-testid="thumb-canvas" className="aspect-video w-full rounded-2xl bg-black" role="img" aria-label={`Thumbnail preview: ${settings.text || "no text yet"}`} />
        <p className="mt-2 text-xs text-[var(--text-faint)]">1280 × 720, saved as a JPEG under 2 MB, the size YouTube asks for.</p>
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="thumb-text" className="mb-1.5 block text-sm font-semibold">
            Words on the thumbnail
          </label>
          <input id="thumb-text" className="input" value={settings.text} maxLength={40} onChange={(e) => set({ text: e.target.value })} placeholder="2 to 4 words works best" />
          {suggestions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Suggested thumbnail text">
              {suggestions.map((t) => (
                <button key={t} className="pill" data-active={settings.text === t} onClick={() => set({ text: t })}>
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <label htmlFor="thumb-shot" className="mb-1.5 block text-sm font-semibold">
            Picture
          </label>
          <select id="thumb-shot" className="input" value={settings.shot} onChange={(e) => set({ shot: Number(e.target.value) })}>
            {shots.map((n) => (
              <option key={n} value={n}>
                Shot {n}
                {n in imageVersions ? "" : " (no image yet)"}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-3">
          <div>
            <h4 className="mb-1.5 text-sm font-semibold">Layout</h4>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Thumbnail layout">
              {LAYOUTS.map((l) => (
                <button key={l.id} className="pill" data-active={settings.layout === l.id} aria-pressed={settings.layout === l.id} onClick={() => set({ layout: l.id })}>
                  {l.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <h4 className="mb-1.5 text-sm font-semibold">Colour</h4>
            <div className="flex gap-2" role="group" aria-label="Thumbnail text colour">
              {(Object.keys(COLORS) as ThumbSettings["color"][]).map((c) => (
                <button
                  key={c}
                  className="size-8 rounded-full border-2"
                  aria-label={c}
                  aria-pressed={settings.color === c}
                  style={{ background: COLORS[c], borderColor: settings.color === c ? "var(--accent)" : "var(--border-strong)" }}
                  onClick={() => set({ color: c })}
                />
              ))}
            </div>
          </div>
        </div>

        <label className="flex items-center gap-2.5 text-sm">
          <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={settings.highlightLast} onChange={(e) => set({ highlightLast: e.target.checked })} />
          Colour only the last word
        </label>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button className="btn btn-primary" onClick={save} disabled={busy || !settings.text.trim()}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} {savedAt ? "Save changes" : "Save thumbnail"}
          </button>
          <button className="btn" onClick={download} disabled={!settings.text.trim()}>
            <Download size={14} /> JPG
          </button>
          {savedAt > 0 && (
            <button className="btn" onClick={remove} aria-label="Delete saved thumbnail">
              <Trash2 size={14} />
            </button>
          )}
        </div>
        {savedAt > 0 && (
          <p className="text-xs" style={{ color: "var(--good)" }} data-testid="thumb-saved">
            Saved. Changes you make here aren&apos;t used until you press Save changes.
          </p>
        )}
        {!hasImage && <p className="text-xs" style={{ color: "var(--warn)" }}>This shot has no image yet, so the thumbnail uses a plain dark background.</p>}
        {error && (
          <p role="alert" className="text-xs" style={{ color: "var(--bad)" }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
