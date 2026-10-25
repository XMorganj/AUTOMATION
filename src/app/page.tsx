"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { ArrowRight, CalendarRange, Plus, Scissors, UploadCloud } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { RunStrip } from "@/components/RunStrip";
import { SystemsPanel } from "@/components/SystemsPanel";
import { UsagePanel } from "@/components/UsagePanel";
import { VideoRow } from "@/components/VideoRow";
import { STAGES, STEPS } from "@/lib/pipeline";
import { createVideo, progressOf, useVideos, type Video } from "@/lib/videos";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}
function today() {
  return new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}
const none = () => () => {};
const useGreeting = () => useSyncExternalStore(none, greeting, () => "Welcome");
const useToday = () => useSyncExternalStore(none, today, () => "");

const words = (v: Video) => (v.script ? v.script.trim().split(/\s+/).filter(Boolean).length : 0);
const isPublished = (v: Video) => v.steps.upload === "approved";

const ROADMAP = [
  "Series presets: one look, many videos",
  "Batch queue that runs overnight",
  "Auto-cut Shorts",
  "Thumbnail A/B variants",
  "Analytics loop from YouTube",
];

export default function DeskPage() {
  const router = useRouter();
  const hello = useGreeting();
  const date = useToday();
  const videos = useVideos();
  const sorted = [...videos].sort((a, b) => b.updatedAt - a.updatedAt);

  const published = videos.filter(isPublished).length;
  const toUpload = videos.filter((v) => !isPublished(v) && v.steps.seo === "approved").length;
  const inProduction = videos.length - published - toUpload;
  const totalWords = videos.reduce((n, v) => n + words(v), 0);
  const totalShots = videos.reduce((n, v) => n + (v.shots?.length ?? 0), 0);

  const upNext = sorted.find((v) => !isPublished(v));
  const nextStep = upNext ? STEPS.find((s) => s.id === upNext.currentStep) : undefined;

  const start = () => router.push(`/generate/${createVideo().id}`);

  return (
    <>
      <PageHeader
        eyebrow={date ? `Desk · ${date}` : "Desk"}
        title={`${hello}.`}
        subtitle="Everything in production, and what each video needs next."
        actions={
          <button className="btn btn-primary" onClick={start}>
            <Plus size={15} /> New video
          </button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0 space-y-6">
          {/* Up next */}
          {upNext && nextStep ? (
            <section className="glass rise p-5 md:p-6" style={{ ["--i" as string]: 0, borderColor: "color-mix(in srgb, var(--accent) 45%, var(--border))" }} aria-labelledby="next-h">
              <div className="eyebrow mb-2" style={{ color: "var(--accent)" }}>
                Up next
              </div>
              <h2 id="next-h" className="text-2xl leading-snug md:text-3xl">
                {upNext.title}
              </h2>
              <p className="mt-2 max-w-xl text-sm text-[var(--text-muted)]">
                <strong className="text-[var(--text)]">{nextStep.label}.</strong> {nextStep.blurb}
              </p>
              <div className="mt-5">
                <RunStrip video={upNext} height={10} />
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Link href={`/generate/${upNext.id}`} className="btn btn-primary">
                  Continue with {nextStep.label} <ArrowRight size={15} />
                </Link>
                <span className="eyebrow">
                  {Math.round(progressOf(upNext) * STEPS.length)}/{STEPS.length} steps · {upNext.lengthMin} min
                  {words(upNext) ? ` · ${words(upNext).toLocaleString()} words` : ""}
                  {upNext.shots?.length ? ` · ${upNext.shots.length} shots` : ""}
                </span>
              </div>
            </section>
          ) : null}

          {/* Counts */}
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border sm:grid-cols-4" style={{ background: "var(--border)", borderColor: "var(--border)" }}>
            {[
              ["In production", inProduction],
              ["Ready to upload", toUpload],
              ["Published", published],
              ["Words written", totalWords.toLocaleString()],
            ].map(([label, n], i) => (
              <div key={label} className="rise px-4 py-3" style={{ background: "var(--surface)", ["--i" as string]: i + 1 }}>
                <dt className="eyebrow">{label}</dt>
                <dd className="mt-1 font-[family-name:var(--font-display)] text-3xl">{n}</dd>
              </div>
            ))}
          </dl>

          {/* Pipeline board */}
          <section aria-labelledby="pipe-h">
            <h2 id="pipe-h" className="eyebrow mb-3" style={{ fontFamily: "var(--font-mono)" }}>
              Pipeline
            </h2>
            <div className="grid gap-px overflow-hidden rounded-[10px] border sm:grid-cols-2 xl:grid-cols-4" style={{ background: "var(--border)", borderColor: "var(--border)" }}>
              {STAGES.map((stage) => {
                const here = sorted.filter((v) => !isPublished(v) && stage.steps.includes(v.currentStep));
                return (
                  <div key={stage.id} className="min-h-32 p-3" style={{ background: "var(--surface)" }}>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-semibold">{stage.label}</span>
                      <span className="eyebrow">{here.length}</span>
                    </div>
                    <div className="mb-3 text-[11px] leading-tight text-[var(--text-faint)]">
                      {stage.steps.map((id) => STEPS.find((s) => s.id === id)?.label).join(" · ")}
                    </div>
                    <div className="space-y-1.5">
                      {here.length === 0 ? (
                        <div className="text-xs text-[var(--text-faint)]">Empty</div>
                      ) : (
                        here.slice(0, 4).map((v) => (
                          <Link key={v.id} href={`/generate/${v.id}`} className="chip">
                            <span className="line-clamp-2">{v.title}</span>
                            <span className="eyebrow mt-1 block">{STEPS.find((s) => s.id === v.currentStep)?.label}</span>
                          </Link>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* All videos */}
          <section aria-labelledby="board-h">
            <h2 id="board-h" className="eyebrow mb-3" style={{ fontFamily: "var(--font-mono)" }}>
              Production board
            </h2>
            {sorted.length === 0 ? (
              <div className="glass p-6">
                <p className="max-w-md text-sm text-[var(--text-muted)]">
                  Nothing in production yet. Start a video and it appears here with a block for each of its ten steps.
                </p>
                <button className="btn btn-primary mt-4" onClick={start}>
                  <Plus size={15} /> Start the first video
                </button>
              </div>
            ) : (
              <ul className="space-y-3">
                {sorted.slice(0, 8).map((v, i) => (
                  <VideoRow key={v.id} video={v} index={i} />
                ))}
              </ul>
            )}
            {sorted.length > 8 && (
              <Link href="/generate" className="btn mt-4">
                All {sorted.length} videos
              </Link>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <UsagePanel />
          <SystemsPanel />

          <section className="glass p-4" aria-labelledby="tools-h">
            <h2 id="tools-h" className="eyebrow mb-3" style={{ fontFamily: "var(--font-mono)" }}>
              Other tools
            </h2>
            <ul className="space-y-1">
              {[
                { href: "/publish", label: "Publish a video you made", icon: UploadCloud },
                { href: "/shorts", label: "Cut Shorts", icon: Scissors },
                { href: "/calendar", label: "Content calendar", icon: CalendarRange },
              ].map(({ href, label, icon: Icon }) => (
                <li key={href}>
                  <Link href={href} className="flex items-center gap-3 rounded-md px-2 py-2 text-sm font-semibold text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]">
                    <Icon size={16} style={{ color: "var(--accent)" }} />
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section className="glass p-4" aria-labelledby="road-h">
            <h2 id="road-h" className="eyebrow mb-3" style={{ fontFamily: "var(--font-mono)" }}>
              Coming to MA Studio
            </h2>
            <ul className="space-y-2">
              {ROADMAP.map((r) => (
                <li key={r} className="flex gap-2.5 text-sm text-[var(--text-muted)]">
                  <span className="mt-[7px] size-1.5 shrink-0" style={{ background: "var(--accent)" }} />
                  {r}
                </li>
              ))}
            </ul>
            <div className="eyebrow mt-4">{totalShots.toLocaleString()} shots made so far</div>
          </section>
        </aside>
      </div>
    </>
  );
}
