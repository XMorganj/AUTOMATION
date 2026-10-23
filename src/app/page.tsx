"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { CalendarRange, Clapperboard, Scissors, Sparkles, UploadCloud } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { createVideo, progressOf, useVideos } from "@/lib/videos";
import { STEPS } from "@/lib/pipeline";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function useGreeting() {
  return useSyncExternalStore(
    () => () => {},
    greeting,
    () => "Welcome",
  );
}

export default function HomePage() {
  const router = useRouter();
  const hello = useGreeting();
  const videos = useVideos();
  const recent = [...videos].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 4);

  const start = () => {
    const v = createVideo();
    router.push(`/generate/${v.id}`);
  };

  return (
    <>
      <PageHeader title={`${hello}.`} subtitle="What do you want to make today?" />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Start something">
        <button
          onClick={start}
          className="glass glass-hover group relative overflow-hidden p-5 text-left"
          style={{ borderColor: "color-mix(in srgb, var(--accent) 55%, transparent)" }}
        >
          <div
            className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full blur-3xl"
            style={{ background: "var(--accent)", opacity: 0.22 }}
          />
          <Sparkles className="mb-4" style={{ color: "var(--accent)" }} size={22} />
          <h2 className="text-base font-bold">Generate an AI video</h2>
          <p className="mt-1.5 text-sm text-[var(--text-muted)]">
            Idea → script → images → voice → finished video, in any niche and style.
          </p>
        </button>

        <ActionCard href="/publish" icon={<UploadCloud size={22} />} title="Publish your own video">
          Drop in a video you made. Get captions, title, description, tags and a thumbnail.
        </ActionCard>
        <ActionCard href="/shorts" icon={<Scissors size={22} />} title="Make Shorts">
          Turn a long video into vertical Shorts with captions and titles.
        </ActionCard>
        <ActionCard href="/calendar" icon={<CalendarRange size={22} />} title="Plan your content">
          See what&apos;s planned, scheduled and uploaded.
        </ActionCard>
      </section>

      <section className="mt-10" aria-labelledby="continue-h">
        <h2 id="continue-h" className="mb-3 px-1 text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-faint)]">
          Continue where you left off
        </h2>

        {recent.length === 0 ? (
          <div className="glass flex flex-col items-start gap-3 p-6">
            <Clapperboard size={22} style={{ color: "var(--accent)" }} />
            <p className="text-sm text-[var(--text-muted)]">
              No videos yet. Start your first one and it will show up here with its progress.
            </p>
            <button className="btn btn-primary" onClick={start}>
              <Sparkles size={15} /> New AI video
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {recent.map((v) => {
              const pct = Math.round(progressOf(v) * 100);
              const step = STEPS.find((s) => s.id === v.currentStep)?.label;
              return (
                <Link key={v.id} href={`/generate/${v.id}`} className="glass glass-hover block p-4">
                  <div className="text-[11px] font-semibold text-[var(--text-faint)]">AI video · {step}</div>
                  <div className="mt-1 line-clamp-2 min-h-[2.6em] text-sm font-bold leading-snug">{v.title}</div>
                  <div
                    className="mt-3 h-1.5 overflow-hidden rounded-full"
                    style={{ background: "var(--border)" }}
                    role="progressbar"
                    aria-valuenow={pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Progress"
                  >
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.max(pct, 4)}%`, background: "linear-gradient(90deg, var(--accent), var(--accent-2))" }}
                    />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}

function ActionCard({
  href,
  icon,
  title,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className="glass glass-hover block p-5">
      <div className="mb-4" style={{ color: "var(--accent)" }}>
        {icon}
      </div>
      <h2 className="text-base font-bold">{title}</h2>
      <p className="mt-1.5 text-sm text-[var(--text-muted)]">{children}</p>
    </Link>
  );
}
