"use client";

import { useState } from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
import { LENGTH_OPTIONS, lengthStats } from "@/lib/pipeline";
import { updateVideo, type Idea, type Video } from "@/lib/videos";

export function IdeaStep({ video }: { video: Video }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mock, setMock] = useState(false);
  const stats = lengthStats(video.lengthMin);
  const approved = video.steps.idea === "approved";
  const canApprove = video.title.trim().length > 0 && video.title !== "Untitled video";

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ideas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ theme: video.theme, minutes: video.lengthMin }),
      });
      const data = (await res.json()) as { ideas?: Idea[]; mock?: boolean; error?: string };
      if (!res.ok || !data.ideas) throw new Error(data.error || "Something went wrong.");
      setMock(Boolean(data.mock));
      updateVideo(video.id, (v) => ({
        ideas: data.ideas!,
        steps: { ...v.steps, idea: v.steps.idea === "approved" ? "approved" : "in_progress" },
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function pick(idea: Idea) {
    updateVideo(video.id, (v) => ({
      title: idea.title,
      steps: { ...v.steps, idea: "ready" },
    }));
  }

  function approve() {
    updateVideo(video.id, (v) => ({
      currentStep: "script",
      steps: { ...v.steps, idea: "approved", script: v.steps.script === "not_started" ? "in_progress" : v.steps.script },
    }));
  }

  return (
    <div className="space-y-7">
      <div>
        <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-faint)]">
          How long should the video be?
        </h3>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Video length">
          {LENGTH_OPTIONS.map((m) => (
            <button
              key={m}
              className="pill"
              data-active={video.lengthMin === m}
              aria-pressed={video.lengthMin === m}
              onClick={() => updateVideo(video.id, { lengthMin: m })}
            >
              {m} min
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          ≈ {stats.words.toLocaleString()} words of narration · about {stats.images} images · about {stats.chars.toLocaleString()} voice characters.{" "}
          {video.lengthMin >= 8 ? "8+ minutes lets YouTube show mid-roll ads." : "Under 8 minutes can't carry mid-roll ads."}
        </p>
      </div>

      <div>
        <label htmlFor="theme" className="mb-2 block text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-faint)]">
          Ideas
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="theme"
            className="input"
            placeholder="Optional: a theme or topic for the ideas (e.g. sleep, ancient Rome, money habits)"
            value={video.theme}
            maxLength={300}
            onChange={(e) => updateVideo(video.id, { theme: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && !loading && generate()}
          />
          <button className="btn btn-primary shrink-0 justify-center" onClick={generate} disabled={loading}>
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            {video.ideas.length ? "Generate 5 new ideas" : "Generate 5 ideas"}
          </button>
        </div>
        {error && (
          <p role="alert" className="mt-2 text-sm" style={{ color: "var(--bad)" }}>
            {error}
          </p>
        )}
        {mock && (
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            These are placeholder ideas. Add <code>ANTHROPIC_API_KEY</code> to <code>.env.local</code> for real AI ideas.
          </p>
        )}
      </div>

      {video.ideas.length > 0 && (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {video.ideas.map((idea) => {
            const selected = idea.title === video.title;
            return (
              <li key={idea.title}>
                <button
                  onClick={() => pick(idea)}
                  aria-pressed={selected}
                  className="glass glass-hover h-full w-full p-4 text-left"
                  style={selected ? { borderColor: "var(--accent)", boxShadow: "0 0 0 1px var(--accent)" } : undefined}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm font-bold leading-snug">{idea.title}</div>
                    {selected && <Check size={16} style={{ color: "var(--accent)" }} className="shrink-0" />}
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">{idea.hook}</p>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div>
        <label htmlFor="title" className="mb-2 block text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-faint)]">
          Your video
        </label>
        <input
          id="title"
          className="input"
          placeholder="Click an idea above, or type your own title"
          value={video.title === "Untitled video" ? "" : video.title}
          maxLength={120}
          onChange={(e) =>
            updateVideo(video.id, (v) => ({
              title: e.target.value || "Untitled video",
              steps: { ...v.steps, idea: v.steps.idea === "approved" ? "approved" : e.target.value ? "ready" : "in_progress" },
            }))
          }
        />
      </div>

      <div className="flex items-center justify-end gap-3">
        {approved && <span className="text-xs text-[var(--text-muted)]">Approved. You can still change it.</span>}
        <button className="btn btn-primary" disabled={!canApprove} onClick={approve}>
          <Check size={15} /> {approved ? "Continue to Script" : "Approve & continue"}
        </button>
      </div>
    </div>
  );
}
