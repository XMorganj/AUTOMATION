import { NextResponse } from "next/server";
import { deleteVideoFiles, listImages, validVideoId } from "@/lib/storage";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ videoId: string }> };

/** List the images stored for a video. The server's disk is the source of truth. */
export async function GET(_req: Request, { params }: Ctx) {
  const { videoId } = await params;
  if (!validVideoId(videoId)) return NextResponse.json({ error: "Invalid video id." }, { status: 400 });
  return NextResponse.json({ images: await listImages(videoId) }, { headers: { "cache-control": "no-store" } });
}

/** Remove every stored file for a video (used when a video is deleted). */
export async function DELETE(_req: Request, { params }: Ctx) {
  const { videoId } = await params;
  if (!validVideoId(videoId)) return NextResponse.json({ error: "Invalid video id." }, { status: 400 });
  await deleteVideoFiles(videoId);
  return NextResponse.json({ ok: true });
}
