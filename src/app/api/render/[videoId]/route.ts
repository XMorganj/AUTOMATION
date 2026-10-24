import { NextResponse } from "next/server";
import { cancelRender, deleteRender, renderState, startRender } from "@/lib/render";
import { parsePlan } from "@/lib/renderShared";
import { validVideoId } from "@/lib/storage";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ videoId: string }> };
const BAD = () => NextResponse.json({ error: "Invalid video id." }, { status: 400 });
const noStore = { "cache-control": "no-store" };

/** Current render job (if any) and the finished video (if any). The browser polls this while rendering. */
export async function GET(_req: Request, { params }: Ctx) {
  const { videoId } = await params;
  if (!validVideoId(videoId)) return BAD();
  return NextResponse.json(await renderState(videoId), { headers: noStore });
}

/** Start a render. */
export async function POST(req: Request, { params }: Ctx) {
  const { videoId } = await params;
  if (!validVideoId(videoId)) return BAD();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = parsePlan(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const r = await startRender(videoId, parsed.plan);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ job: r.job }, { status: 202, headers: noStore });
}

/** Stop a running render; if nothing is running, delete the finished video. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const { videoId } = await params;
  if (!validVideoId(videoId)) return BAD();
  if (await cancelRender(videoId)) return NextResponse.json({ ok: true, canceled: true });
  await deleteRender(videoId);
  return NextResponse.json({ ok: true, deleted: true });
}
