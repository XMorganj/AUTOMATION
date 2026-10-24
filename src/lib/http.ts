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
