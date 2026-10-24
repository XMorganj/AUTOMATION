import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { videoDir } from "./storage";
import type { AudioKind } from "./audio";
import type { AudioMeta, MusicInfo, WordTiming } from "./voiceShared";

/**
 * Narration audio and background music, stored next to a video's images:
 *   <root>/videos/<id>/audio/001.mp3 + 001.json   (the .json holds the settings used and word timing)
 *   <root>/videos/<id>/music.mp3     + music.json (original file name)
 * Callers must pass a validated video id and shot number (see storage.ts).
 */

const pad = (n: number) => String(n).padStart(3, "0");
const audioDir = (id: string) => path.join(videoDir(id), "audio");
const NARRATION_EXTS = ["mp3", "wav"] as const;
const MUSIC_EXTS: AudioKind[] = ["mp3", "wav", "m4a", "ogg", "flac"];

export interface StoredAudio extends AudioMeta {
  words: WordTiming[];
}

async function atomicWrite(dest: string, data: Buffer) {
  const tmp = `${dest}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, data);
  await fs.rename(tmp, dest);
}

/* ---------- narration, one file per shot ---------- */

export async function saveShotAudio(
  videoId: string,
  meta: Omit<AudioMeta, "bytes" | "mtime">,
  data: Buffer,
  words: WordTiming[],
): Promise<AudioMeta> {
  const dir = audioDir(videoId);
  await fs.mkdir(dir, { recursive: true });
  for (const e of NARRATION_EXTS) {
    if (e !== meta.ext) await fs.rm(path.join(dir, `${pad(meta.n)}.${e}`), { force: true });
  }
  const dest = path.join(dir, `${pad(meta.n)}.${meta.ext}`);
  await atomicWrite(dest, data);
  const st = await fs.stat(dest);
  const full: StoredAudio = { ...meta, bytes: st.size, mtime: Math.round(st.mtimeMs), words };
  // the .json is written last: a shot only counts as "generated" once both files are complete
  await atomicWrite(path.join(dir, `${pad(meta.n)}.json`), Buffer.from(JSON.stringify(full)));
  const { words: _words, ...listed } = full;
  void _words;
  return listed;
}

export async function listShotAudio(videoId: string): Promise<AudioMeta[]> {
  let names: string[];
  try {
    names = await fs.readdir(audioDir(videoId));
  } catch {
    return [];
  }
  const out: AudioMeta[] = [];
  for (const name of names) {
    if (!/^\d{3,4}\.json$/.test(name)) continue;
    try {
      const full = JSON.parse(await fs.readFile(path.join(audioDir(videoId), name), "utf8")) as StoredAudio;
      await fs.access(path.join(audioDir(videoId), `${pad(full.n)}.${full.ext}`)); // audio file must exist too
      const { words, ...listed } = full;
      void words;
      out.push(listed);
    } catch {
      /* half-written or hand-edited: ignore, the shot just shows as missing */
    }
  }
  return out.sort((a, b) => a.n - b.n);
}

export async function readShotAudio(videoId: string, n: number): Promise<{ ext: "mp3" | "wav"; data: Buffer; mtime: number } | null> {
  for (const ext of NARRATION_EXTS) {
    const file = path.join(audioDir(videoId), `${pad(n)}.${ext}`);
    try {
      const [data, st] = await Promise.all([fs.readFile(file), fs.stat(file)]);
      return { ext, data, mtime: Math.round(st.mtimeMs) };
    } catch {
      /* try next */
    }
  }
  return null;
}

export async function deleteShotAudio(videoId: string, n: number): Promise<boolean> {
  let removed = false;
  for (const f of [...NARRATION_EXTS.map((e) => `${pad(n)}.${e}`), `${pad(n)}.json`]) {
    try {
      await fs.unlink(path.join(audioDir(videoId), f));
      removed = true;
    } catch {
      /* not there */
    }
  }
  return removed;
}

export async function deleteAllAudio(videoId: string): Promise<void> {
  await fs.rm(audioDir(videoId), { recursive: true, force: true });
}

/* ---------- background music, one file per video ---------- */

const cleanName = (name: string) =>
  name
    .replace(/[\\/]/g, "_")
    .replace(/[^\w .()\-]/g, "")
    .trim()
    .slice(0, 120) || "music";

export async function saveMusic(videoId: string, kind: AudioKind, data: Buffer, name: string): Promise<MusicInfo> {
  const dir = videoDir(videoId);
  await fs.mkdir(dir, { recursive: true });
  for (const e of MUSIC_EXTS) {
    if (e !== kind) await fs.rm(path.join(dir, `music.${e}`), { force: true });
  }
  const dest = path.join(dir, `music.${kind}`);
  await atomicWrite(dest, data);
  await atomicWrite(path.join(dir, "music.json"), Buffer.from(JSON.stringify({ name: cleanName(name) })));
  const st = await fs.stat(dest);
  return { ext: kind, name: cleanName(name), bytes: st.size, mtime: Math.round(st.mtimeMs) };
}

export async function musicInfo(videoId: string): Promise<MusicInfo | null> {
  const dir = videoDir(videoId);
  for (const ext of MUSIC_EXTS) {
    try {
      const st = await fs.stat(path.join(dir, `music.${ext}`));
      let name = "music";
      try {
        name = (JSON.parse(await fs.readFile(path.join(dir, "music.json"), "utf8")) as { name?: string }).name ?? "music";
      } catch {
        /* name is cosmetic */
      }
      return { ext, name, bytes: st.size, mtime: Math.round(st.mtimeMs) };
    } catch {
      /* try next */
    }
  }
  return null;
}

export async function readMusic(videoId: string): Promise<{ ext: AudioKind; data: Buffer } | null> {
  const info = await musicInfo(videoId);
  if (!info) return null;
  try {
    return { ext: info.ext as AudioKind, data: await fs.readFile(path.join(videoDir(videoId), `music.${info.ext}`)) };
  } catch {
    return null;
  }
}

export async function deleteMusic(videoId: string): Promise<boolean> {
  let removed = false;
  for (const f of [...MUSIC_EXTS.map((e) => `music.${e}`), "music.json"]) {
    try {
      await fs.unlink(path.join(videoDir(videoId), f));
      removed = true;
    } catch {
      /* not there */
    }
  }
  return removed;
}
