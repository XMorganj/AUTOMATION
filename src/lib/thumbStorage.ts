import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { videoDir } from "./storage";

/** One thumbnail per video, always JPEG (YouTube's limit is 2 MB), at <root>/videos/<id>/thumbnail.jpg. */
export const MAX_THUMB_BYTES = 2 * 1024 * 1024;
const file = (id: string) => path.join(videoDir(id), "thumbnail.jpg");

export const isJpeg = (b: Buffer) => b.length > 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

/** JPEG size from its markers, so we can insist on 1280x720 without decoding the picture. */
export function jpegSize(b: Buffer): { w: number; h: number } | null {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const len = b.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return null;
}

export async function saveThumb(videoId: string, data: Buffer): Promise<{ bytes: number; mtime: number }> {
  await fs.mkdir(videoDir(videoId), { recursive: true });
  const tmp = `${file(videoId)}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, data);
  await fs.rename(tmp, file(videoId));
  const st = await fs.stat(file(videoId));
  return { bytes: st.size, mtime: Math.round(st.mtimeMs) };
}

export async function readThumb(videoId: string): Promise<{ data: Buffer; mtime: number } | null> {
  try {
    const [data, st] = await Promise.all([fs.readFile(file(videoId)), fs.stat(file(videoId))]);
    return { data, mtime: Math.round(st.mtimeMs) };
  } catch {
    return null;
  }
}

export async function deleteThumb(videoId: string): Promise<boolean> {
  try {
    await fs.unlink(file(videoId));
    return true;
  } catch {
    return false;
  }
}
