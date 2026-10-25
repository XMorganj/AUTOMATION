import { NextResponse } from "next/server";
import { validVideoId } from "@/lib/storage";
import { cancelUpload, clearUpload, parseRequest, startUpload, uploadState } from "@/lib/youtubeUpload";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ videoId: string }> };
const BAD = () => NextResponse.json({ error: "Invalid video id." }, { status: 400 });
const noStore = { "cache-control": "no-store" };

/** Connection, the rendered file, the thumbnail and the current or last upload. The browser polls this. */
export async function GET(_req: Request, { params }: Ctx) {
  const { videoId } = await params;
  if (!validVideoId(videoId)) return BAD();
  return NextResponse.json(await uploadState(videoId), { headers: noStore });
}

/** Start (or resume) an upload. The video file comes from the server; only the text and settings come from the browser. */
export async function POST(req: Request, { params }: Ctx) {
  const { videoId } = await params;
  if (!validVideoId(videoId)) return BAD();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = parseRequest(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const r = await startUpload(videoId, parsed.req);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ job: r.job }, { status: 202, headers: noStore });
}

/** Cancel a running upload; if none is running, clear the finished or failed record. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const { videoId } = await params;
  if (!validVideoId(videoId)) return BAD();
  if (await cancelUpload(videoId)) return NextResponse.json({ ok: true, canceled: true });
  await clearUpload(videoId);
  return NextResponse.json({ ok: true, cleared: true });
}
