import { NextResponse } from "next/server";
import { audioDuration, audioMime, evenWords, silentWav, wordsFromAlignment } from "@/lib/audio";
import { deleteShotAudio, readShotAudio, saveShotAudio } from "@/lib/audioStorage";
import { ElError, hasElevenKey, synthesize } from "@/lib/elevenlabs";
import { serveBytes } from "@/lib/http";
import { parseShot, validVideoId } from "@/lib/storage";
import { DEMO_ID } from "@/lib/voiceShared";

export const runtime = "nodejs";
export const maxDuration = 180;

type Ctx = { params: Promise<{ videoId: string; n: string }> };

const MAX_TEXT = 2500;
const BAD = () => NextResponse.json({ error: "Invalid video id or shot number." }, { status: 400 });

async function parse(params: Ctx["params"]) {
  const { videoId, n } = await params;
  const shot = parseShot(n);
  return validVideoId(videoId) && shot !== null ? { videoId, shot } : null;
}

const num = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/** Play a shot's narration. */
export async function GET(req: Request, { params }: Ctx) {
  const p = await parse(params);
  if (!p) return BAD();
  const a = await readShotAudio(p.videoId, p.shot);
  if (!a) return NextResponse.json({ error: "No narration for this shot." }, { status: 404 });
  return serveBytes(req, a.data, audioMime(a.ext));
}

/** Generate narration for one shot. This is the call that spends ElevenLabs characters. */
export async function POST(req: Request, { params }: Ctx) {
  const p = await parse(params);
  if (!p) return BAD();

  let b: Record<string, unknown>;
  try {
    b = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const text = str(b.text, MAX_TEXT + 1).trim();
  if (!text) return NextResponse.json({ error: "This shot has no text to speak." }, { status: 400 });
  if (text.length > MAX_TEXT) {
    return NextResponse.json({ error: `This shot's text is longer than ${MAX_TEXT} characters. Split it into two shots.` }, { status: 400 });
  }

  const voiceId = str(b.voiceId, 64);
  const modelId = str(b.modelId, 60);
  if (voiceId !== DEMO_ID && !/^[A-Za-z0-9_-]{6,64}$/.test(voiceId)) {
    return NextResponse.json({ error: "Choose a voice first." }, { status: 400 });
  }
  if (modelId !== DEMO_ID && !/^[a-z0-9_.-]{2,60}$/.test(modelId)) {
    return NextResponse.json({ error: "Choose a model first." }, { status: 400 });
  }
  const key = str(b.key, 40);
  if (!/^[a-z0-9]{1,40}$/.test(key)) return NextResponse.json({ error: "Missing fingerprint." }, { status: 400 });

  const s = (b.settings ?? {}) as Record<string, unknown>;
  const settings = {
    stability: num(s.stability, 0, 1, 0.5),
    similarity: num(s.similarity, 0, 1, 0.75),
    style: num(s.style, 0, 1, 0),
    speed: num(s.speed, 0.7, 1.2, 1),
    boost: s.boost !== false,
  };

  try {
    let audio: Buffer;
    let ext: "mp3" | "wav";
    let duration: number;
    let words;

    if (!hasElevenKey() || voiceId === DEMO_ID) {
      // No key: silent placeholder audio with believable timing (about 2.4 words a second)
      const count = text.split(/\s+/).length;
      audio = silentWav(Math.max(1, count / 2.4));
      ext = "wav";
      duration = await audioDuration(audio, ext);
      words = evenWords(text, duration);
    } else {
      const r = await synthesize({
        voiceId,
        modelId,
        text,
        settings,
        previousText: str(b.previousText, 400).trim() || undefined,
        nextText: str(b.nextText, 400).trim() || undefined,
      });
      audio = r.audio;
      ext = "mp3";
      duration = await audioDuration(audio, ext);
      words = r.alignment ? wordsFromAlignment(r.alignment) : evenWords(text, duration);
    }

    const saved = await saveShotAudio(p.videoId, { n: p.shot, ext, duration, key, voiceId, modelId, chars: text.length }, audio, words);
    return NextResponse.json({ ok: true, audio: saved, demo: ext === "wav" });
  } catch (err) {
    if (err instanceof ElError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    console.error("voiceover generate failed", err);
    return NextResponse.json({ error: "Couldn't save the narration. Try again." }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const p = await parse(params);
  if (!p) return BAD();
  return NextResponse.json({ ok: true, removed: await deleteShotAudio(p.videoId, p.shot) });
}
