"use client";

import { memo, useState } from "react";
import { Check, Copy, Loader2, Wand2 } from "lucide-react";
import { WORDS_PER_SHOT } from "@/lib/pipeline";
import { copyText, postJson } from "@/lib/api";
import { hashText, splitShots } from "@/lib/shots";
import { updateVideo, type Shot, type Video } from "@/lib/videos";
import { NeedsScript, StaleNotice } from "./notices";

const BATCH = 20;

const PRESETS: { label: string; style: string }[] = [
  {
    label: "Flat doodle stickman",
    style:
      "Flat-colour 2D doodle explainer illustration in a simple stickman style: round heads, small black dot eyes, simple expressive eyebrows and mouths, thin limbs, thick clean black outlines, minimal shading, warm limited colour palette.",
  },
  {
    label: "Cinematic realistic",
    style:
      "Cinematic photorealistic film still, shallow depth of field, dramatic natural lighting, rich colour grading, 35mm lens, high detail.",
  },
  {
    label: "Storybook watercolour",
    style:
      "Soft hand-painted watercolour storybook illustration, gentle washes of colour, visible paper texture, warm friendly characters, delicate ink linework.",
  },
  {
    label: "Dark documentary",
    style:
      "Moody dark documentary look, desaturated colours, deep shadows, high contrast, grainy film texture, muted teal and amber tones, atmospheric haze.",
  },
  {
    label: "3D clay animation",
    style:
      "Charming 3D claymation style, handmade plasticine characters with visible fingerprint texture, soft studio lighting, tiny miniature sets, shallow depth of field.",
  },
];

const AGENT_INSTRUCTIONS = `You will receive numbered image prompts. For each one:
1. Generate exactly one 16:9 widescreen image.
2. Keep the art style and every recurring character identical across all images.
3. Do not add text, captions or watermarks to any image.
4. Name or number each result with its three-digit prompt number (001, 002, 003 ...) so the images can be matched back to their shots in order.
Work through the prompts in order and do not skip any.`;

export function PromptsStep({ video }: { video: Video }) {
  const script = video.script ?? "";
  const shots = video.shots ?? [];
  const style = video.artStyle ?? PRESETS[0].style;
  const approved = video.steps.prompts === "approved";

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mock, setMock] = useState(false);
  const [copied, setCopied] = useState<null | "prompts" | "agent">(null);

  if (!script.trim()) return <NeedsScript video={video} />;

  const stale = shots.length > 0 && video.shotsScriptHash !== hashText(script);
  const allFilled = shots.length > 0 && shots.every((s) => s.prompt.trim());

  async function build() {
    if (shots.length && !window.confirm("Rebuild all prompts? Any edits you made to them will be lost.")) return;

    const narrations = splitShots(script, WORDS_PER_SHOT);
    const scriptHash = hashText(script);
    const outline = script.slice(0, 1200);
    const built: Shot[] = [];

    setBusy(true);
    setError(null);
    setProgress({ done: 0, total: narrations.length });
    try {
      for (let i = 0; i < narrations.length; i += BATCH) {
        const chunk = narrations.slice(i, i + BATCH).map((narration, j) => ({ n: i + j + 1, narration }));
        const data = await postJson<{ prompts: string[]; mock: boolean }>("/api/prompts", {
          title: video.title,
          artStyle: style,
          outline,
          shots: chunk,
        });
        setMock(data.mock);
        chunk.forEach((c, j) => built.push({ n: c.n, narration: c.narration, prompt: data.prompts[j] }));
        setProgress({ done: built.length, total: narrations.length });
        // save as we go so a failure halfway keeps what was already written
        updateVideo(video.id, (v) => ({
          shots: [...built],
          shotsScriptHash: scriptHash,
          steps: { ...v.steps, prompts: "in_progress" },
        }));
      }
      updateVideo(video.id, (v) => ({ steps: { ...v.steps, prompts: "ready" } }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong.";
      setError(
        built.length ? `${msg} The first ${built.length} prompts were saved. Press Build again to redo them all.` : msg,
      );
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  function setPrompt(n: number, prompt: string) {
    updateVideo(video.id, (v) => ({
      shots: (v.shots ?? []).map((s) => (s.n === n ? { ...s, prompt } : s)),
    }));
  }

  async function copy(kind: "prompts" | "agent") {
    const text =
      kind === "agent"
        ? AGENT_INSTRUCTIONS
        : shots.map((s) => `${String(s.n).padStart(3, "0")}. ${s.prompt}`).join("\n\n");
    if (await copyText(text)) {
      setCopied(kind);
      setTimeout(() => setCopied(null), 1800);
    } else {
      setError("Couldn't copy. Your browser blocked clipboard access.");
    }
  }

  function approve() {
    updateVideo(video.id, (v) => ({
      currentStep: "images",
      steps: {
        ...v.steps,
        prompts: "approved",
        images: v.steps.images === "not_started" ? "in_progress" : v.steps.images,
      },
    }));
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-faint)]">Art style</h3>
        <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Style presets">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              className="pill"
              data-active={style === p.style}
              onClick={() => updateVideo(video.id, { artStyle: p.style })}
              disabled={busy}
            >
              {p.label}
            </button>
          ))}
        </div>
        <label htmlFor="style" className="sr-only">
          Art style description
        </label>
        <textarea
          id="style"
          className="input min-h-24 resize-y"
          value={style}
          maxLength={1200}
          disabled={busy}
          onChange={(e) => updateVideo(video.id, { artStyle: e.target.value })}
        />
        <p className="mt-1.5 text-xs text-[var(--text-muted)]">
          Every prompt is written to match this exactly, which keeps the look consistent from the first shot to the last.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" onClick={build} disabled={busy || !style.trim()}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
          {shots.length ? "Rebuild all prompts" : "Build image prompts"}
        </button>
        {progress && (
          <span className="text-xs text-[var(--text-muted)]" role="status">
            Writing prompts: {progress.done} of {progress.total}
          </span>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--bad)" }}>
          {error}
        </p>
      )}
      {stale && <StaleNotice what="these prompts" onRedo={build} busy={busy} />}
      {mock && (
        <p className="text-xs text-[var(--text-muted)]">
          These are placeholder prompts. Add <code>ANTHROPIC_API_KEY</code> to <code>.env.local</code> and restart for real ones.
        </p>
      )}

      {shots.length > 0 && (
        <>
          <div className="glass flex flex-wrap items-center gap-3 p-4" style={{ borderRadius: 16 }}>
            <div className="mr-auto text-sm">
              <strong>{shots.length}</strong> shots {busy ? "so far" : "ready"}
              {!busy && (
                <span className="text-[var(--text-muted)]"> · next, make one image per prompt in Gemini or Flow</span>
              )}
            </div>
            <button className="btn" onClick={() => copy("agent")} disabled={busy}>
              {copied === "agent" ? <Check size={14} /> : <Copy size={14} />} Copy agent instructions
            </button>
            <button className="btn btn-primary" onClick={() => copy("prompts")} disabled={busy}>
              {copied === "prompts" ? <Check size={14} /> : <Copy size={14} />} Copy all {shots.length} prompts
            </button>
          </div>

          <ol className="space-y-3">
            {shots.map((s) => (
              <ShotRow key={s.n} shot={s} onChange={setPrompt} />
            ))}
          </ol>
        </>
      )}

      <div className="flex items-center justify-end gap-3">
        {approved && <span className="text-xs text-[var(--text-muted)]">Approved.</span>}
        <button className="btn btn-primary" disabled={!allFilled || busy} onClick={approve}>
          <Check size={15} /> {approved ? "Continue to Images" : "Approve & continue"}
        </button>
      </div>
    </div>
  );
}

const ShotRow = memo(function ShotRow({ shot, onChange }: { shot: Shot; onChange: (n: number, prompt: string) => void }) {
  const id = `shot-${shot.n}`;
  return (
    <li className="glass p-4" style={{ borderRadius: 16 }}>
      <div className="mb-2 flex items-start gap-3">
        <span className="badge shrink-0" style={{ background: "var(--surface-hover)", color: "var(--accent)" }}>
          {String(shot.n).padStart(3, "0")}
        </span>
        <p className="text-xs italic leading-relaxed text-[var(--text-muted)]">{shot.narration}</p>
      </div>
      <label htmlFor={id} className="sr-only">
        Image prompt {shot.n}
      </label>
      <textarea
        id={id}
        className="input min-h-20 resize-y text-[13px] leading-relaxed"
        value={shot.prompt}
        onChange={(e) => onChange(shot.n, e.target.value)}
      />
    </li>
  );
});
