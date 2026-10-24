import { serveFile } from "@/lib/http";
import { outputPath } from "@/lib/render";
import { validVideoId } from "@/lib/storage";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ videoId: string }> };

/** Play (or with ?download=1 save) the finished video. `?name=` sets the saved file name. */
export async function GET(req: Request, { params }: Ctx) {
  const { videoId } = await params;
  if (!validVideoId(videoId)) return Response.json({ error: "Invalid video id." }, { status: 400 });
  const url = new URL(req.url);
  let name: string | undefined;
  if (url.searchParams.get("download")) {
    const base = (url.searchParams.get("name") || "video").replace(/[^\w .\-()]/g, "").trim().slice(0, 100) || "video";
    name = `${base}.mp4`;
  }
  return serveFile(req, outputPath(videoId), "video/mp4", name);
}
