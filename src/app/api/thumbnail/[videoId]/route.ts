import { NextResponse } from "next/server";
import { serveBytes } from "@/lib/http";
import { validVideoId } from "@/lib/storage";
import { deleteThumb, isJpeg, jpegSize, MAX_THUMB_BYTES, readThumb, saveThumb } from "@/lib/thumbStorage";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ videoId: string }> };
const BAD = () => NextResponse.json({ error: "Invalid video id." }, { status: 400 });

export async function GET(req: Request, { params }: Ctx) {
  const { videoId } = await params;
  if (!validVideoId(videoId)) return BAD();
  const t = await readThumb(videoId);
  if (!t) return NextResponse.json({ error: "No thumbnail yet." }, { status: 404 });
  return serveBytes(req, t.data, "image/jpeg");
}

/** Save the thumbnail. The body is the raw JPEG, which must be 1280x720 and under 2 MB (YouTube's rules). */
export async function PUT(req: Request, { params }: Ctx) {
  const { videoId } = await params;
  if (!validVideoId(videoId)) return BAD();
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_THUMB_BYTES) return NextResponse.json({ error: "YouTube thumbnails must be under 2 MB." }, { status: 413 });
  const data = Buffer.from(await req.arrayBuffer());
  if (data.length > MAX_THUMB_BYTES) return NextResponse.json({ error: "YouTube thumbnails must be under 2 MB." }, { status: 413 });
  if (!isJpeg(data)) return NextResponse.json({ error: "That isn't a JPEG image." }, { status: 400 });
  const size = jpegSize(data);
  if (!size || size.w !== 1280 || size.h !== 720) {
    return NextResponse.json({ error: `Thumbnails must be 1280×720${size ? ` (this one is ${size.w}×${size.h})` : ""}.` }, { status: 400 });
  }
  const saved = await saveThumb(videoId, data);
  return NextResponse.json({ ok: true, ...saved });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { videoId } = await params;
  if (!validVideoId(videoId)) return BAD();
  return NextResponse.json({ ok: true, removed: await deleteThumb(videoId) });
}
