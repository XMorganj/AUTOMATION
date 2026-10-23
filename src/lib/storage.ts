import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Local file storage for generated media. Everything lives under one data folder
 * (default ./data, override with STUDIO_DATA_DIR):  <root>/videos/<videoId>/images/001.png
 *
 * IDs and shot numbers coming from the network are validated strictly before they touch a path,
 * so a request can never read or write outside that folder.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
export const MAX_SHOT = 2000;

export type ImageExt = "png" | "jpg" | "webp";
const EXTS: ImageExt[] = ["png", "jpg", "webp"];
const MIME: Record<ImageExt, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };

export function mimeFor(ext: ImageExt): string {
  return MIME[ext];
}

export function validVideoId(id: string): boolean {
  return UUID.test(id);
}

export function parseShot(n: string): number | null {
  if (!/^\d{1,4}$/.test(n)) return null;
  const v = parseInt(n, 10);
  return v >= 1 && v <= MAX_SHOT ? v : null;
}

export function dataRoot(): string {
  return path.resolve(process.env.STUDIO_DATA_DIR || path.join(process.cwd(), "data"));
}

function videoDir(id: string): string {
  return path.join(dataRoot(), "videos", id);
}

function imagesDir(id: string): string {
  return path.join(videoDir(id), "images");
}

const pad = (n: number) => String(n).padStart(3, "0");

/** Identify an image by its first bytes. The browser-supplied type and filename are never trusted. */
export function sniffImage(buf: Buffer): ImageExt | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.length >= 12 && buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP")
    return "webp";
  return null;
}

export interface StoredImage {
  n: number;
  ext: ImageExt;
  size: number;
  mtime: number;
}

export async function listImages(videoId: string): Promise<StoredImage[]> {
  let names: string[];
  try {
    names = await fs.readdir(imagesDir(videoId));
  } catch {
    return [];
  }
  const out: StoredImage[] = [];
  for (const name of names) {
    const m = /^(\d{3,4})\.(png|jpg|webp)$/.exec(name);
    if (!m) continue;
    try {
      const st = await fs.stat(path.join(imagesDir(videoId), name));
      out.push({ n: parseInt(m[1], 10), ext: m[2] as ImageExt, size: st.size, mtime: Math.round(st.mtimeMs) });
    } catch {
      /* removed while listing */
    }
  }
  return out.sort((a, b) => a.n - b.n);
}

export async function saveImage(videoId: string, n: number, ext: ImageExt, data: Buffer): Promise<StoredImage> {
  const dir = imagesDir(videoId);
  await fs.mkdir(dir, { recursive: true });
  // write to a temp name first so a crash can never leave a half-written image behind
  const tmp = path.join(dir, `.tmp-${pad(n)}-${process.pid}-${Date.now()}`);
  await fs.writeFile(tmp, data);
  for (const e of EXTS) {
    if (e !== ext) await fs.rm(path.join(dir, `${pad(n)}.${e}`), { force: true });
  }
  const dest = path.join(dir, `${pad(n)}.${ext}`);
  await fs.rename(tmp, dest);
  const st = await fs.stat(dest);
  return { n, ext, size: st.size, mtime: Math.round(st.mtimeMs) };
}

export async function readImage(videoId: string, n: number): Promise<{ ext: ImageExt; data: Buffer; mtime: number } | null> {
  for (const ext of EXTS) {
    const file = path.join(imagesDir(videoId), `${pad(n)}.${ext}`);
    try {
      const [data, st] = await Promise.all([fs.readFile(file), fs.stat(file)]);
      return { ext, data, mtime: Math.round(st.mtimeMs) };
    } catch {
      /* try next extension */
    }
  }
  return null;
}

export async function deleteImage(videoId: string, n: number): Promise<boolean> {
  let removed = false;
  for (const ext of EXTS) {
    const file = path.join(imagesDir(videoId), `${pad(n)}.${ext}`);
    try {
      await fs.unlink(file);
      removed = true;
    } catch {
      /* not there */
    }
  }
  return removed;
}

export async function deleteVideoFiles(videoId: string): Promise<void> {
  await fs.rm(videoDir(videoId), { recursive: true, force: true });
}
