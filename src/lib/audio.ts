import "server-only";
import type { WordTiming } from "./voiceShared";
import type { Alignment } from "./elevenlabs";

export type AudioKind = "mp3" | "wav" | "m4a" | "ogg" | "flac";

const MIME: Record<AudioKind, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  flac: "audio/flac",
};

export const audioMime = (k: AudioKind) => MIME[k];

/** Identify audio by its first bytes. File names and browser-supplied types are never trusted. */
export function sniffAudio(b: Buffer): AudioKind | null {
  if (b.length < 12) return null;
  const head = b.subarray(0, 4).toString("latin1");
  if (b.subarray(0, 3).toString("latin1") === "ID3") return "mp3"; // MP3 with a tag header
  if (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) return "mp3"; // MP3 frame sync
  if (head === "RIFF" && b.subarray(8, 12).toString("latin1") === "WAVE") return "wav";
  if (b.subarray(4, 8).toString("latin1") === "ftyp") return "m4a";
  if (head === "OggS") return "ogg";
  if (head === "fLaC") return "flac";
  return null;
}

/** A silent 16-bit mono WAV, used as placeholder narration when no ElevenLabs key is set. */
export function silentWav(seconds: number, sampleRate = 22_050): Buffer {
  const samples = Math.max(1, Math.round(seconds * sampleRate));
  const dataBytes = samples * 2;
  const buf = Buffer.alloc(44 + dataBytes); // zero-filled = silence
  buf.write("RIFF", 0, "latin1");
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write("WAVE", 8, "latin1");
  buf.write("fmt ", 12, "latin1");
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36, "latin1");
  buf.writeUInt32LE(dataBytes, 40);
  return buf;
}

/** Length of an audio file in seconds. Reads the real file; falls back to a size-based estimate only if it can't. */
export async function audioDuration(buf: Buffer, kind: AudioKind): Promise<number> {
  try {
    const { parseBuffer } = await import("music-metadata");
    const meta = await parseBuffer(buf, undefined, { duration: true });
    if (meta.format.duration && Number.isFinite(meta.format.duration)) return round3(meta.format.duration);
  } catch {
    /* fall through to estimates */
  }
  if (kind === "wav" && buf.length > 44) {
    const byteRate = buf.readUInt32LE(28);
    if (byteRate > 0) return round3((buf.length - 44) / byteRate);
  }
  if (kind === "mp3") return round3((buf.length * 8) / 128_000); // ElevenLabs sends 128 kbps MP3
  return 0;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Group ElevenLabs' per-character timing into per-word timing (what captions need). */
export function wordsFromAlignment(a: Alignment): WordTiming[] {
  const words: WordTiming[] = [];
  let cur = "";
  let start = 0;
  let end = 0;
  for (let i = 0; i < a.characters.length; i++) {
    const ch = a.characters[i];
    if (/\s/.test(ch)) {
      if (cur) words.push({ w: cur, s: round3(start), e: round3(end) });
      cur = "";
      continue;
    }
    if (!cur) start = a.starts[i];
    cur += ch;
    end = a.ends[i];
  }
  if (cur) words.push({ w: cur, s: round3(start), e: round3(end) });
  return words;
}

/** Evenly spaced word timing, for placeholder audio or when ElevenLabs sends no alignment. */
export function evenWords(text: string, duration: number): WordTiming[] {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return [];
  const per = duration / parts.length;
  return parts.map((w, i) => ({ w, s: round3(i * per), e: round3((i + 1) * per) }));
}
