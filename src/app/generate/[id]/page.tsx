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
        className="mb-2 inline-flex items-center gap-1.5 px-1 text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text)]"
      >
        <ArrowLeft size={13} /> All videos
      </Link>
      <h1 className="mb-5 px-1 text-xl font-bold tracking-tight md:text-2xl">{video.title}</h1>

      <Stepper video={video} />

      <section className="glass mt-5 p-5 md:p-7" aria-labelledby="step-h">
        <div className="mb-1 flex items-center gap-3">
          <h2 id="step-h" className="text-xl font-bold">
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
        ) : (
          <div className="rounded-2xl border border-dashed p-6 text-sm text-[var(--text-muted)]" style={{ borderColor: "var(--border-strong)" }}>
            This step is next on the build list. The pipeline, saved state and navigation already work, so it will
            plug straight in.
          </div>
        )}
      </section>
    </>
  );
}

function Stepper({ video }: { video: Video }) {
  return (
    <nav aria-label="Video steps" className="-mx-1 overflow-x-auto px-1 pb-1">
      <ol className="flex min-w-max gap-2">
        {STEPS.map((s, i) => {
          const status = video.steps[s.id];
          const active = video.currentStep === s.id;
          const done = status === "approved";
          return (
            <li key={s.id}>
              <button
                aria-current={active ? "step" : undefined}
                onClick={() => updateVideo(video.id, { currentStep: s.id as StepId })}
                className="pill"
                data-active={active}
                style={
                  done && !active
                    ? { color: "var(--good)", borderColor: "color-mix(in srgb, var(--good) 40%, transparent)" }
                    : undefined
                }
              >
                {done ? (
                  <Check size={13} strokeWidth={3} />
                ) : (
                  <span className="text-[11px] opacity-70">{i + 1}</span>
                )}
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
