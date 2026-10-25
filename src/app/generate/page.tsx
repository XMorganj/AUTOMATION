"use client";

import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { VideoRow } from "@/components/VideoRow";
import { createVideo, useVideos } from "@/lib/videos";

export default function GeneratePage() {
  const router = useRouter();
  const videos = useVideos();

  return (
    <>
      <PageHeader
        eyebrow="Videos"
        title="Generate AI videos"
        subtitle="Each video moves along a ten-step run sheet, from idea to upload."
        actions={
          <button className="btn btn-primary" onClick={() => router.push(`/generate/${createVideo().id}`)}>
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
          {videos.map((v) => (
            <VideoRow key={v.id} video={v} removable />
          ))}
        </ul>
      )}
    </>
  );
}
