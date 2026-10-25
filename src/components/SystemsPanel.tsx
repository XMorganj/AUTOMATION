"use client";

import { useSystemStatus } from "@/lib/useSystemStatus";

/** Tells you what this deployment can do right now, so a missing key never comes as a surprise mid-video. */
export function SystemsPanel() {
  const s = useSystemStatus();
  const rows: { label: string; detail: string; ok: boolean | null }[] = [
    {
      label: "Writing",
      detail: s ? (s.ai.ready ? (s.ai.provider === "ollama" ? "Ollama" : "Claude") : "Demo text only (no ANTHROPIC_API_KEY)") : "Checking…",
      ok: s ? s.ai.ready : null,
    },
    {
      label: "Voiceover",
      detail: s ? (s.voice.ready ? "ElevenLabs" : "Silent demo audio (no ELEVENLABS_API_KEY)") : "Checking…",
      ok: s ? s.voice.ready : null,
    },
    {
      label: "Render",
      detail: s ? (s.render.ready ? "FFmpeg found" : "FFmpeg not found on this server") : "Checking…",
      ok: s ? s.render.ready : null,
    },
    {
      label: "YouTube upload",
      detail: s ? (s.upload.ready ? "Google keys set" : "Not connected yet") : "Checking…",
      ok: s ? s.upload.ready : null,
    },
  ];
  return (
    <section className="glass p-4" aria-labelledby="sys-h">
      <h2 id="sys-h" className="eyebrow mb-3" style={{ fontFamily: "var(--font-mono)" }}>
        Systems
      </h2>
      <ul className="space-y-2.5">
        {rows.map((r) => (
          <li key={r.label} className="flex items-start gap-3">
            <span className="led mt-[5px]" data-on={r.ok === true} data-tone={r.ok === false ? "warn" : undefined} />
            <div className="min-w-0">
              <div className="text-sm font-semibold">{r.label}</div>
              <div className="text-xs text-[var(--text-muted)]">{r.detail}</div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
