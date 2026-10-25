"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { CalendarRange, Plus, Scissors, UploadCloud } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { SystemsPanel } from "@/components/SystemsPanel";
import { VideoRow } from "@/components/VideoRow";
import { createVideo, useVideos } from "@/lib/videos";

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

export default function DeskPage() {
  const router = useRouter();
  const hello = useGreeting();
  const date = useToday();
  const videos = useVideos();
  const sorted = [...videos].sort((a, b) => b.updatedAt - a.updatedAt);

  const published = videos.filter((v) => v.steps.upload === "approved").length;
  const toUpload = videos.filter((v) => v.steps.upload !== "approved" && v.steps.seo === "approved").length;
  const inProduction = videos.length - published - toUpload;

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
        <div className="min-w-0">
          <dl className="mb-6 grid grid-cols-3 gap-px overflow-hidden rounded-[10px] border" style={{ background: "var(--border)", borderColor: "var(--border)" }}>
            {[
              ["In production", inProduction],
              ["Ready to upload", toUpload],
              ["Published", published],
            ].map(([label, n]) => (
              <div key={label} className="px-4 py-3" style={{ background: "var(--surface)" }}>
                <dt className="eyebrow">{label}</dt>
                <dd className="mt-1 font-[family-name:var(--font-display)] text-3xl">{n}</dd>
              </div>
            ))}
          </dl>

          <h2 className="eyebrow mb-3" style={{ fontFamily: "var(--font-mono)" }}>
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
              {sorted.slice(0, 8).map((v) => (
                <VideoRow key={v.id} video={v} />
              ))}
            </ul>
          )}
          {sorted.length > 8 && (
            <Link href="/generate" className="btn mt-4">
              All {sorted.length} videos
            </Link>
          )}
        </div>

        <aside className="space-y-4">
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
        </aside>
      </div>
    </>
  );
}
