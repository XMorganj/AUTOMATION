"use client";

import { AlertTriangle } from "lucide-react";
import { updateVideo, type Video } from "@/lib/videos";
import type { StepId } from "@/lib/pipeline";

export function NeedsScript({ video }: { video: Video }) {
  return (
    <div className="rounded-2xl border border-dashed p-6 text-sm" style={{ borderColor: "var(--border-strong)" }}>
      <p className="text-[var(--text-muted)]">This step works from your script, and there isn&apos;t one yet.</p>
      <button className="btn mt-4" onClick={() => updateVideo(video.id, { currentStep: "script" as StepId })}>
        Go to Script
      </button>
    </div>
  );
}

export function NeedsPrompts({ video }: { video: Video }) {
  return (
    <div className="rounded-2xl border border-dashed p-6 text-sm" style={{ borderColor: "var(--border-strong)" }}>
      <p className="text-[var(--text-muted)]">
        This step works on shots, and the shots come from the Image prompts step. Build those first.
      </p>
      <button className="btn mt-4" onClick={() => updateVideo(video.id, { currentStep: "prompts" as StepId })}>
        Go to Image prompts
      </button>
    </div>
  );
}

export function StaleNotice({ what, onRedo, busy }: { what: string; onRedo: () => void; busy: boolean }) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-3 rounded-2xl p-4 text-sm"
      style={{
        background: "color-mix(in srgb, var(--warn) 12%, transparent)",
        border: "1px solid color-mix(in srgb, var(--warn) 40%, transparent)",
      }}
    >
      <AlertTriangle size={16} style={{ color: "var(--warn)" }} />
      <span className="flex-1">The script changed after {what} was made, so it may be out of date.</span>
      <button className="btn" onClick={onRedo} disabled={busy}>
        Redo it
      </button>
    </div>
  );
}
