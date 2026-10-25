"use client";

import Link from "next/link";
import { ArrowRight, Trash2 } from "lucide-react";
import { RunStrip } from "@/components/RunStrip";
import { STEPS } from "@/lib/pipeline";
import { deleteVideo, progressOf, type Video } from "@/lib/videos";

/** One video on the production board. */
export function VideoRow({ video, removable = false, index = 0 }: { video: Video; removable?: boolean; index?: number }) {
  const done = Math.round(progressOf(video) * STEPS.length);
  const step = STEPS.find((s) => s.id === video.currentStep)?.label;
  const finished = done === STEPS.length;
  return (
    <li className="glass glass-hover rise flex items-center gap-3 p-4" style={{ ["--i" as string]: Math.min(index, 8) }}>
      <Link href={`/generate/${video.id}`} className="min-w-0 flex-1">
        <div className="eyebrow mb-1">
          {finished ? "Published" : `Now on ${step}`} · {video.lengthMin} min
        </div>
        <div className="truncate text-[15px] font-semibold">{video.title}</div>
        <div className="mt-3 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <RunStrip video={video} />
          </div>
          <span className="eyebrow shrink-0">
            {done}/{STEPS.length}
          </span>
        </div>
      </Link>
      <Link href={`/generate/${video.id}`} className="btn hidden sm:inline-flex" aria-label={`Open ${video.title}`}>
        Open <ArrowRight size={14} />
      </Link>
      {removable && (
        <button
          className="btn"
          aria-label={`Delete ${video.title}`}
          onClick={() => {
            if (window.confirm(`Delete "${video.title}"? This can't be undone.`)) deleteVideo(video.id);
          }}
        >
          <Trash2 size={14} />
        </button>
      )}
    </li>
  );
}
