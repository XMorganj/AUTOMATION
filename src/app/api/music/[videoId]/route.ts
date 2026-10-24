import { NextResponse } from "next/server";
import { audioMime, sniffAudio } from "@/lib/audio";
import { deleteMusic, musicInfo, readMusic, saveMusic } from "@/lib/audioStorage";
import { serveBytes } from "@/lib/http";
import { validVideoId } from "@/lib/storage";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ videoId: string }> };

const MAX_MUSIC_BYTES = 60 * 1024 * 1024;
const BAD = () => NextResponse.json({ error: "Invalid video id." }, { status: 400 });

export async function GET(req: Request, { params }: Ctx) {
  const { videoId } = await params;
  if (!validVideoId(videoId)) return BAD();
  const m = await readMusic(videoId);
  if (!m) return NextResponse.json({ error: "No music for this video." }, { status: 404 });
  return serveBytes(req, m.data, audioMime(m.ext));
}

/** Upload a background track. The body is the raw audio file; the original name comes in the `x-file-name` header. */
export async function PUT(req: Request, { params }: Ctx) {
  const { videoId } = await params;
  if (!validVideoId(videoId)) return BAD();

  if (Number(req.headers.get("content-length") || 0) > MAX_MUSIC_BYTES) {
    return NextResponse.json({ error: "That audio file is larger than 60 MB." }, { status: 413 });
  }
  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length === 0) return NextResponse.json({ error: "The file was empty." }, { status: 400 });
  if (buf.length > MAX_MUSIC_BYTES) return NextResponse.json({ error: "That audio file is larger than 60 MB." }, { status: 413 });

  const kind = sniffAudio(buf);
  if (!kind) return NextResponse.json({ error: "That isn't a supported audio file. Use MP3, WAV, M4A, OGG or FLAC." }, { status: 415 });

  let name = "music";
  try {
    name = decodeURIComponent(req.headers.get("x-file-name") || "music");
  } catch {
    /* keep the default name */
  }
  return NextResponse.json({ ok: true, music: await saveMusic(videoId, kind, buf, name) });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { videoId } = await params;
  if (!validVideoId(videoId)) return BAD();
  const had = Boolean(await musicInfo(videoId));
  await deleteMusic(videoId);
  return NextResponse.json({ ok: true, removed: had });
}
