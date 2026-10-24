import "server-only";

/**
 * Send bytes with HTTP Range support, so an <audio> element can seek and start playing before the file is fully loaded.
 * Only a single range is supported, which is all browsers ask for.
 */
export function serveBytes(req: Request, data: Buffer, mime: string): Response {
  const total = data.length;
  const base = {
    "content-type": mime,
    "accept-ranges": "bytes",
    // callers add ?v=<mtime> to the URL, so a replaced file always has a new address
    "cache-control": "private, max-age=31536000, immutable",
    "x-content-type-options": "nosniff",
  };

  const header = req.headers.get("range");
  if (header) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
    if (m && (m[1] || m[2])) {
      let start: number;
      let end: number;
      if (m[1] === "") {
        // "last N bytes"
        start = Math.max(0, total - Number(m[2]));
        end = total - 1;
      } else {
        start = Number(m[1]);
        end = m[2] === "" ? total - 1 : Math.min(Number(m[2]), total - 1);
      }
      if (start > end || start >= total) {
        return new Response(null, { status: 416, headers: { "content-range": `bytes */${total}` } });
      }
      return new Response(new Uint8Array(data.subarray(start, end + 1)), {
        status: 206,
        headers: { ...base, "content-range": `bytes ${start}-${end}/${total}`, "content-length": String(end - start + 1) },
      });
    }
  }
  return new Response(new Uint8Array(data), { headers: { ...base, "content-length": String(total) } });
}

/**
 * Stream a file from disk with Range support, without loading it into memory (finished videos can be hundreds of MB).
 * `downloadName` makes the browser save it instead of playing it.
 */
export async function serveFile(req: Request, file: string, mime: string, downloadName?: string): Promise<Response> {
  const { createReadStream } = await import("node:fs");
  const { stat } = await import("node:fs/promises");
  const { Readable } = await import("node:stream");
  let st;
  try {
    st = await stat(file);
  } catch {
    return Response.json({ error: "Not found." }, { status: 404 });
  }
  const total = st.size;
  const base: Record<string, string> = {
    "content-type": mime,
    "accept-ranges": "bytes",
    "cache-control": "private, no-cache",
    "x-content-type-options": "nosniff",
  };
  if (downloadName) base["content-disposition"] = `attachment; filename="${downloadName.replace(/[^\w.\- ]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`;

  let start = 0;
  let end = total - 1;
  let status = 200;
  const m = /^bytes=(\d*)-(\d*)$/.exec((req.headers.get("range") ?? "").trim());
  if (m && (m[1] || m[2])) {
    if (m[1] === "") {
      start = Math.max(0, total - Number(m[2]));
    } else {
      start = Number(m[1]);
      if (m[2] !== "") end = Math.min(Number(m[2]), total - 1);
    }
    if (start > end || start >= total) return new Response(null, { status: 416, headers: { "content-range": `bytes */${total}` } });
    status = 206;
    base["content-range"] = `bytes ${start}-${end}/${total}`;
  }
  base["content-length"] = String(end - start + 1);
  const stream = Readable.toWeb(createReadStream(file, { start, end })) as unknown as ReadableStream;
  return new Response(stream, { status, headers: base });
}
