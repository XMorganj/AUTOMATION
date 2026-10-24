import { NextResponse } from "next/server";
import { deleteAllAudio, listShotAudio, musicInfo } from "@/lib/audioStorage";
import { validVideoId } from "@/lib/storage";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ videoId: string }> };

/** Which shots have narration, how long each is, and the background music file if there is one. */
export async function GET(_req: Request, { params }: Ctx) {
  const { videoId } = await params;
  if (!validVideoId(videoId)) return NextResponse.json({ error: "Invalid video id." }, { status: 400 });
  const [shots, music] = await Promise.all([listShotAudio(videoId), musicInfo(videoId)]);
  return NextResponse.json({ shots, music }, { headers: { "cache-control": "no-store" } });
}

/** Remove all narration for a video (music is kept). */
export async function DELETE(_req: Request, { params }: Ctx) {
  const { videoId } = await params;
  if (!validVideoId(videoId)) return NextResponse.json({ error: "Invalid video id." }, { status: 400 });
  await deleteAllAudio(videoId);
  return NextResponse.json({ ok: true });
}
