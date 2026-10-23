"use client";

import { useState } from "react";
import { Check, Loader2, ShieldCheck } from "lucide-react";
import { postJson } from "@/lib/api";
import { hashText } from "@/lib/shots";
import { updateVideo, type Claim, type FactCheck, type Video } from "@/lib/videos";
import { NeedsScript, StaleNotice } from "./notices";

export function FactCheckStep({ video }: { video: Video }) {
  const script = video.script ?? "";
  const fc = video.factcheck;
  const approved = video.steps.factcheck === "approved";

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!script.trim()) return <NeedsScript video={video} />;

  const stale = fc ? fc.scriptHash !== hashText(script) : false;
  const open = fc ? fc.claims.filter((c) => !c.resolved) : [];
  const openWrong = open.filter((c) => c.verdict === "wrong").length;
  const openCheck = open.filter((c) => c.verdict === "check").length;

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const data = await postJson<Omit<FactCheck, "scriptHash">>("/api/factcheck", { title: video.title, script });
      updateVideo(video.id, (v) => ({
        factcheck: { ...data, scriptHash: hashText(script) },
        steps: { ...v.steps, factcheck: "ready" },
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  function resolve(id: string, how: "fixed" | "kept") {
    updateVideo(video.id, (v) => {
      if (!v.factcheck) return {};
      const claim = v.factcheck.claims.find((c) => c.id === id);
      if (!claim) return {};
      let nextScript = v.script ?? "";
      let nextHash = v.factcheck.scriptHash;
      if (how === "fixed" && claim.fix) {
        const i = nextScript.indexOf(claim.quote);
        if (i === -1) return {};
        if (claim.quote.length >= 25) {
          // a full sentence that is wrong is wrong everywhere it is repeated
          nextScript = nextScript.split(claim.quote).join(claim.fix);
        } else {
          // very short quotes could match inside other words, so only touch the first one
          nextScript = nextScript.slice(0, i) + claim.fix + nextScript.slice(i + claim.quote.length);
        }
        nextHash = hashText(nextScript);
      }
      return {
        script: nextScript,
        factcheck: {
          ...v.factcheck,
          scriptHash: nextHash,
          claims: v.factcheck.claims.map((c) => (c.id === id ? { ...c, resolved: how } : c)),
        },
      };
    });
  }

  function approve() {
    if (
      openWrong > 0 &&
      !window.confirm(`${openWrong} claim${openWrong > 1 ? "s are" : " is"} still marked likely wrong. Continue anyway?`)
    )
      return;
    updateVideo(video.id, (v) => ({
      currentStep: "prompts",
      steps: {
        ...v.steps,
        factcheck: "approved",
        prompts: v.steps.prompts === "not_started" ? "in_progress" : v.steps.prompts,
      },
    }));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" onClick={run} disabled={busy}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
          {fc ? "Check again" : "Run fact check"}
        </button>
        {busy && <span className="text-xs text-[var(--text-muted)]">Reading through every claim. About 30 seconds.</span>}
      </div>

      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--bad)" }}>
          {error}
        </p>
      )}

      {fc && stale && <StaleNotice what="this check" onRedo={run} busy={busy} />}

      {fc && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Tile label="Correct" value={fc.correctCount} color="var(--good)" />
            <Tile label="Worth checking" value={openCheck} color="var(--warn)" />
            <Tile label="Likely wrong" value={openWrong} color="var(--bad)" />
          </div>

          {fc.summary && <p className="text-sm text-[var(--text-muted)]">{fc.summary}</p>}
          {fc.mock && (
            <p className="text-xs text-[var(--text-muted)]">
              Demo result. Add <code>ANTHROPIC_API_KEY</code> to <code>.env.local</code> and restart for a real fact check.
            </p>
          )}

          {fc.claims.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--good)" }}>
              Nothing was flagged.
            </p>
          ) : (
            <ul className="space-y-3">
              {fc.claims.map((c) => (
                <ClaimCard key={c.id} claim={c} onFix={() => resolve(c.id, "fixed")} onKeep={() => resolve(c.id, "kept")} />
              ))}
            </ul>
          )}

          <p className="text-xs text-[var(--text-faint)]">
            This check uses the AI&apos;s own knowledge, not live web sources, so treat it as a first pass. For anything
            important (dates, numbers, quotes, scripture), confirm it against a source before you publish.
          </p>
        </>
      )}

      <div className="flex items-center justify-end gap-3">
        {approved && <span className="text-xs text-[var(--text-muted)]">Approved.</span>}
        <button className="btn btn-primary" disabled={!fc || busy} onClick={approve}>
          <Check size={15} /> {approved ? "Continue to Image prompts" : "Approve & continue"}
        </button>
      </div>
    </div>
  );
}

function Tile({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="glass p-4" style={{ borderRadius: 16 }}>
      <div className="text-2xl font-bold" style={{ color }}>
        {value}
      </div>
      <div className="mt-0.5 text-xs font-semibold text-[var(--text-muted)]">{label}</div>
    </div>
  );
}

function ClaimCard({ claim, onFix, onKeep }: { claim: Claim; onFix: () => void; onKeep: () => void }) {
  const color = claim.verdict === "wrong" ? "var(--bad)" : "var(--warn)";
  const done = Boolean(claim.resolved);
  return (
    <li className="glass p-4" style={{ borderRadius: 16, opacity: done ? 0.55 : 1 }}>
      <div className="mb-2 flex items-center gap-2">
        <span className="badge" style={{ color, background: `color-mix(in srgb, ${color} 15%, transparent)` }}>
          {claim.verdict === "wrong" ? "Likely wrong" : "Worth checking"}
        </span>
        {claim.resolved && (
          <span className="badge" style={{ color: "var(--good)", background: "color-mix(in srgb, var(--good) 15%, transparent)" }}>
            {claim.resolved === "fixed" ? "Fixed" : "Kept as is"}
          </span>
        )}
      </div>
      <blockquote className="border-l-2 pl-3 text-sm font-medium italic" style={{ borderColor: color }}>
        {claim.quote}
      </blockquote>
      <p className="mt-2 text-sm text-[var(--text-muted)]">{claim.note}</p>
      {claim.fix && (
        <div
          className="mt-3 rounded-xl p-3 text-sm"
          style={{ background: "color-mix(in srgb, var(--good) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--good) 30%, transparent)" }}
        >
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--good)" }}>
            Suggested fix
          </div>
          {claim.fix}
        </div>
      )}
      {!done && (
        <div className="mt-3 flex flex-wrap gap-2">
          {claim.fix && (
            <button className="btn btn-primary" onClick={onFix}>
              Apply fix to script
            </button>
          )}
          <button className="btn" onClick={onKeep}>
            Keep as is
          </button>
        </div>
      )}
    </li>
  );
}
