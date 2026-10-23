import { NextResponse } from "next/server";
import {
  MAX_IMAGE_BYTES,
  deleteImage,
  mimeFor,
  parseShot,
  readImage,
  saveImage,
  sniffImage,
  validVideoId,
} from "@/lib/storage";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ videoId: string; n: string }> };

async function parse(params: Ctx["params"]) {
  const { videoId, n } = await params;
  const shot = parseShot(n);
  if (!validVideoId(videoId) || shot === null) return null;
  return { videoId, shot };
}

const BAD = () => NextResponse.json({ error: "Invalid video id or shot number." }, { status: 400 });

export async function GET(_req: Request, { params }: Ctx) {
  const p = await parse(params);
  if (!p) return BAD();
  const img = await readImage(p.videoId, p.shot);
  if (!img) return NextResponse.json({ error: "No image for this shot." }, { status: 404 });
  return new Response(new Uint8Array(img.data), {
    headers: {
      "content-type": mimeFor(img.ext),
      // the client adds ?v=<mtime>, so a replaced image always has a new URL and this can be cached hard
      "cache-control": "private, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function PUT(req: Request, { params }: Ctx) {
  const p = await parse(params);
  if (!p) return BAD();

  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "That image is larger than 25 MB." }, { status: 413 });
  }

  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length === 0) return NextResponse.json({ error: "The file was empty." }, { status: 400 });
  if (buf.length > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "That image is larger than 25 MB." }, { status: 413 });
  }

  const ext = sniffImage(buf);
  if (!ext) {
    return NextResponse.json({ error: "That file isn't a PNG, JPEG or WebP image." }, { status: 415 });
  }

  try {
    const saved = await saveImage(p.videoId, p.shot, ext, buf);
    return NextResponse.json({ ok: true, image: saved });
  } catch (err) {
    console.error("saveImage failed", err);
    return NextResponse.json({ error: "Couldn't save the image on disk." }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const p = await parse(params);
  if (!p) return BAD();
  const removed = await deleteImage(p.videoId, p.shot);
  return NextResponse.json({ ok: true, removed });
}
