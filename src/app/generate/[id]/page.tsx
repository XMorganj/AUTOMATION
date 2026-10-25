"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Check } from "lucide-react";
import { STEPS, type StepId } from "@/lib/pipeline";
import { updateVideo, useVideo, type Video } from "@/lib/videos";
import { IdeaStep } from "@/components/steps/IdeaStep";
import { ScriptStep } from "@/components/steps/ScriptStep";
import { FactCheckStep } from "@/components/steps/FactCheckStep";
import { PromptsStep } from "@/components/steps/PromptsStep";
import { ImagesStep } from "@/components/steps/ImagesStep";
import { MotionStep } from "@/components/steps/MotionStep";
import { VoiceStep } from "@/components/steps/VoiceStep";
import { RenderStep } from "@/components/steps/RenderStep";
import { SeoStep } from "@/components/steps/SeoStep";
import { UploadStep } from "@/components/steps/UploadStep";

export default function VideoPage() {
  const { id } = useParams<{ id: string }>();
  const video = useVideo(id);

  if (!video) {
    return (
      <div className="glass p-8">
        <p className="text-sm text-[var(--text-muted)]">This video wasn&apos;t found on this device.</p>
        <Link href="/generate" className="btn mt-4">
          <ArrowLeft size={14} /> All videos
        </Link>
      </div>
    );
  }

  const step = STEPS.find((s) => s.id === video.currentStep) ?? STEPS[0];

  return (
    <>
      <Link
        href="/generate"
        className="eyebrow mb-3 inline-flex items-center gap-1.5 hover:text-[var(--text)]"
      >
        <ArrowLeft size={12} /> All videos
      </Link>
      <h1 className="mb-6 text-balance text-2xl leading-tight md:text-3xl">{video.title}</h1>

      <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
        <RunSheet video={video} />

        <section className="glass min-w-0 p-5 md:p-7" aria-labelledby="step-h">
          <div className="eyebrow mb-2">
            Step {STEPS.findIndex((s) => s.id === step.id) + 1} of {STEPS.length}
          </div>
          <div className="mb-1 flex flex-wrap items-center gap-3">
            <h2 id="step-h" className="text-2xl">
              {step.label}
            </h2>
            <StatusBadge status={video.steps[step.id]} />
          </div>
          <p className="mb-6 text-sm text-[var(--text-muted)]">{step.blurb}</p>

          {step.id === "idea" ? (
            <IdeaStep video={video} />
          ) : step.id === "script" ? (
            <ScriptStep video={video} />
          ) : step.id === "factcheck" ? (
            <FactCheckStep video={video} />
          ) : step.id === "prompts" ? (
            <PromptsStep video={video} />
          ) : step.id === "images" ? (
            <ImagesStep video={video} />
          ) : step.id === "motion" ? (
            <MotionStep video={video} />
          ) : step.id === "voice" ? (
            <VoiceStep video={video} />
          ) : step.id === "render" ? (
            <RenderStep video={video} />
          ) : step.id === "seo" ? (
            <SeoStep video={video} />
          ) : step.id === "upload" ? (
            <UploadStep video={video} />
          ) : (
            <div className="border border-dashed p-6 text-sm text-[var(--text-muted)]" style={{ borderColor: "var(--border-strong)", borderRadius: 8 }}>
              This step is next on the build list. The pipeline, saved state and navigation already work, so it will
              plug straight in.
            </div>
          )}
        </section>
      </div>
    </>
  );
}

/** The run sheet: every step in order, with its status, down the side (or along the top on small screens). */
function RunSheet({ video }: { video: Video }) {
  return (
    <nav aria-label="Video steps" className="lg:sticky lg:top-20 lg:self-start">
      <ol className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:gap-0 lg:overflow-visible lg:px-0">
        {STEPS.map((s, i) => {
          const status = video.steps[s.id];
          const active = video.currentStep === s.id;
          const done = status === "approved";
          const tone =
            status === "approved" ? "var(--good)" : status === "in_progress" ? "var(--warn)" : status === "ready" ? "var(--accent)" : "var(--border-strong)";
          return (
            <li key={s.id} className="relative shrink-0">
              <button
                aria-current={active ? "step" : undefined}
                onClick={() => updateVideo(video.id, { currentStep: s.id as StepId })}
                className="flex w-full items-center gap-3 border px-3 py-2 text-left text-sm font-semibold transition-colors lg:border-0 lg:border-l-2 lg:py-2.5"
                style={{
                  borderRadius: 6,
                  color: active ? "var(--text)" : "var(--text-muted)",
                  background: active ? "var(--surface)" : "transparent",
                  borderColor: active ? "var(--accent)" : "var(--border)",
                }}
              >
                <span
                  className="grid size-5 shrink-0 place-items-center text-[10px] font-bold"
                  style={{
                    fontFamily: "var(--font-mono)",
                    borderRadius: 4,
                    background: done ? tone : "transparent",
                    border: `1.5px solid ${tone}`,
                    color: done ? "var(--bg)" : tone,
                  }}
                >
                  {done ? <Check size={11} strokeWidth={3.5} /> : i + 1}
                </span>
                {s.label}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function StatusBadge({ status }: { status: Video["steps"][StepId] }) {
  const map = {
    not_started: { label: "Not started", color: "var(--text-faint)" },
    in_progress: { label: "In progress", color: "var(--warn)" },
    ready: { label: "Ready for review", color: "var(--accent)" },
    approved: { label: "Approved", color: "var(--good)" },
  } as const;
  const m = map[status];
  return (
    <span
      className="badge"
      style={{ color: m.color, background: `color-mix(in srgb, ${m.color} 15%, transparent)` }}
    >
      {m.label}
    </span>
  );
}
