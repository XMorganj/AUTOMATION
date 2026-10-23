"use client";

import { useState } from "react";
import { Check, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { lengthStats } from "@/lib/pipeline";
import { postJson } from "@/lib/api";
import { countWords } from "@/lib/shots";
import { updateVideo, type Video } from "@/lib/videos";

export function ScriptStep({ video }: { video: Video }) {
  const script = video.script ?? "";
  const words = countWords(script);
  const target = lengthStats(video.lengthMin).words;
  const approved = video.steps.script === "approved";

  const [busy, setBusy] = useState<null | "write" | "rewrite">(null);
  const [error, setError] = useState<string | null>(null);
  const [mock, setMock] = useState(false);
  const [instruction, setInstruction] = useState("");

  const within = words >= target * 0.9 && words <= target * 1.1;

  async function run(kind: "write" | "rewrite") {
    if (kind === "write" && script && !window.confirm("Replace the current script with a brand new one?")) return;
    setBusy(kind);
    setError(null);
    try {
      const data = await postJson<{ script: string; mock: boolean }>("/api/script", {
        title: video.title,
        minutes: video.lengthMin,
        theme: video.theme,
        notes: video.scriptNotes ?? "",
        ...(kind === "rewrite" ? { current: script, instruction } : {}),
      });
      setMock(data.mock);
      updateVideo(video.id, (v) => ({
        script: data.script,
        steps: { ...v.steps, script: "ready" },
      }));
      if (kind === "rewrite") setInstruction("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  function edit(value: string) {
    updateVideo(video.id, (v) => ({
      script: value,
      steps: { ...v.steps, script: value.trim() ? "ready" : "in_progress" },
    }));
  }

  function approve() {
    updateVideo(video.id, (v) => ({
      currentStep: "factcheck",
      steps: {
        ...v.steps,
        script: "approved",
        factcheck: v.steps.factcheck === "not_started" ? "in_progress" : v.steps.factcheck,
      },
    }));
  }

  return (
    <div className="space-y-6">
      <div>
        <label htmlFor="notes" className="mb-2 block text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-faint)]">
          Tone and style notes (optional)
        </label>
        <input
          id="notes"
          className="input"
          placeholder="e.g. warm and thoughtful, short punchy sentences, a little humour"
          maxLength={600}
          value={video.scriptNotes ?? ""}
          onChange={(e) => updateVideo(video.id, { scriptNotes: e.target.value })}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" onClick={() => run("write")} disabled={busy !== null}>
          {busy === "write" ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
          {script ? "Write a new script" : `Write the script (~${target.toLocaleString()} words)`}
        </button>
        {busy === "write" && (
          <span className="text-xs text-[var(--text-muted)]">Writing. Long scripts can take a minute or two.</span>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--bad)" }}>
          {error}
        </p>
      )}
      {mock && (
        <p className="text-xs text-[var(--text-muted)]">
          This is placeholder text. Add <code>ANTHROPIC_API_KEY</code> to <code>.env.local</code> and restart for a real script.
        </p>
      )}

      {script || busy ? (
        <>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label htmlFor="script" className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-faint)]">
                Script
              </label>
              <span
                className="badge"
                style={{
                  color: within ? "var(--good)" : "var(--warn)",
                  background: `color-mix(in srgb, ${within ? "var(--good)" : "var(--warn)"} 15%, transparent)`,
                }}
              >
                {words.toLocaleString()} / ~{target.toLocaleString()} words
              </span>
            </div>
            <textarea
              id="script"
              className="input min-h-[22rem] resize-y leading-relaxed"
              value={script}
              disabled={busy !== null}
              onChange={(e) => edit(e.target.value)}
              spellCheck
            />
          </div>

          <div>
            <label htmlFor="rewrite" className="mb-2 block text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-faint)]">
              Ask for a change
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="rewrite"
                className="input"
                placeholder="e.g. make the opening hook stronger, or cut the second half by a third"
                maxLength={600}
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && instruction.trim() && busy === null && run("rewrite")}
              />
              <button
                className="btn shrink-0 justify-center"
                onClick={() => run("rewrite")}
                disabled={busy !== null || !instruction.trim()}
              >
                {busy === "rewrite" ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                Rewrite
              </button>
            </div>
          </div>
        </>
      ) : null}

      <div className="flex items-center justify-end gap-3">
        {approved && <span className="text-xs text-[var(--text-muted)]">Approved. Edits will need re-approval.</span>}
        <button className="btn btn-primary" disabled={!script.trim() || busy !== null} onClick={approve}>
          <Check size={15} /> {approved ? "Continue to Fact check" : "Approve & continue"}
        </button>
      </div>
    </div>
  );
}
