"use client";

import { useEffect, useState } from "react";
import type { UsageReport } from "@/app/api/usage/route";
import { useVideos } from "@/lib/videos";

const n = (x: number) => x.toLocaleString();
const compact = (x: number) => (x >= 1e6 ? `${(x / 1e6).toFixed(1)}M` : x >= 1e3 ? `${(x / 1e3).toFixed(1)}k` : String(x));

/** What this month has used, and whether the credits left will cover the videos in production. */
export function UsagePanel() {
  const videos = useVideos();
  const [r, setR] = useState<UsageReport | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/usage", { cache: "no-store" })
      .then((x) => (x.ok ? x.json() : null))
      .then((j: UsageReport | null) => live && j && setR(j))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  // characters still to be spoken in videos whose voiceover isn't approved yet
  const needed = videos
    .filter((v) => v.steps.upload !== "approved" && v.steps.voice !== "approved")
    .reduce((sum, v) => sum + (v.shots?.length ? v.shots.reduce((s, x) => s + x.narration.trim().length, 0) : (v.script ?? "").trim().length), 0);

  const u = r?.voice.usage ?? null;
  const left = u ? Math.max(0, u.limit - u.used) : null;
  const pct = u && u.limit ? Math.min(100, Math.round((u.used / u.limit) * 100)) : 0;
  const short = left !== null && needed > left;

  return (
    <section className="glass p-4" aria-labelledby="usage-h">
      <h2 id="usage-h" className="eyebrow mb-3" style={{ fontFamily: "var(--font-mono)" }}>
        Usage this month
      </h2>

      <div className="mb-4">
        <div className="mb-1 flex items-baseline justify-between text-sm">
          <span className="font-semibold">Voice credits</span>
          {u && <span className="eyebrow">{pct}% used</span>}
        </div>
        {!r ? (
          <div className="text-xs text-[var(--text-muted)]">Checking…</div>
        ) : !r.voice.configured ? (
          <div className="text-xs text-[var(--text-muted)]">No ElevenLabs key, so voiceover is silent demo audio and costs nothing.</div>
        ) : !u ? (
          <div className="text-xs text-[var(--text-muted)]">Couldn&apos;t read the balance. The key may not be allowed to see usage.</div>
        ) : (
          <>
            <div className="h-2 overflow-hidden" style={{ background: "var(--border)", borderRadius: 3 }} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Voice credits used">
              <div className="h-full" style={{ width: `${Math.max(pct, 1)}%`, background: pct > 90 ? "var(--bad)" : pct > 70 ? "var(--warn)" : "var(--accent)" }} />
            </div>
            <div className="mt-1.5 text-xs text-[var(--text-muted)]">
              {n(left ?? 0)} of {n(u.limit)} characters left · {u.tier} plan
            </div>
            <div className="mt-1 text-xs" style={{ color: short ? "var(--bad)" : "var(--text-muted)" }}>
              {needed === 0
                ? "No narration waiting to be voiced."
                : short
                  ? `Videos in production need about ${n(needed)} characters. That's more than you have left.`
                  : `Videos in production need about ${n(needed)} characters.`}
            </div>
          </>
        )}
      </div>

      <div>
        <div className="mb-1 text-sm font-semibold">Writing (AI)</div>
        {!r ? (
          <div className="text-xs text-[var(--text-muted)]">Checking…</div>
        ) : r.ai.length === 0 ? (
          <div className="text-xs text-[var(--text-muted)]">Nothing used yet this month.</div>
        ) : (
          <ul className="space-y-1.5">
            {r.ai.map((a) => (
              <li key={a.provider} className="text-xs text-[var(--text-muted)]">
                <span className="font-semibold capitalize text-[var(--text)]">{a.provider === "anthropic" ? "Claude" : a.provider}</span>: {n(a.calls)} requests · {compact(a.inputTokens)} in · {compact(a.outputTokens)} out
                {a.provider === "anthropic" &&
                  (a.costUsd !== null ? ` · about $${a.costUsd.toFixed(2)}` : " · set the price per million tokens in the site settings to see dollars")}
                {a.provider === "ollama" && " · runs on your own computer, no charge"}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
