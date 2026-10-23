"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { createVideo, deleteVideo, progressOf, useVideos } from "@/lib/videos";
import { STEPS } from "@/lib/pipeline";

export default function GeneratePage() {
  const router = useRouter();
  const videos = useVideos();

  return (
    <>
      <PageHeader
        title="Generate AI videos"
        subtitle="The studio walks you from idea to finished video, step by step."
        actions={
          <button
            className="btn btn-primary"
            onClick={() => router.push(`/generate/${createVideo().id}`)}
          >
            <Plus size={15} /> New AI video
          </button>
        }
      />

      {videos.length === 0 ? (
        <div className="glass p-8 text-sm text-[var(--text-muted)]">
          Nothing here yet. Click <strong className="text-[var(--text)]">New AI video</strong> to start.
        </div>
      ) : (
        <ul className="space-y-3">
          {videos.map((v) => {
            const done = Math.round(progressOf(v) * 10);
            const step = STEPS.find((s) => s.id === v.currentStep)?.label;
            return (
              <li key={v.id} className="glass glass-hover flex items-center gap-3 p-4">
                <Link href={`/generate/${v.id}`} className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold">{v.title}</div>
                  <div className="mt-1 text-xs text-[var(--text-muted)]">
                    {done}/10 steps · now on {step} · {v.lengthMin} min
                  </div>
                </Link>
                <button
                  className="btn"
                  aria-label={`Delete ${v.title}`}
                  onClick={() => {
                    if (window.confirm(`Delete "${v.title}"? This can't be undone.`)) deleteVideo(v.id);
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
