import { NextResponse } from "next/server";
import { ElError, FALLBACK_MODELS, concurrencyFor, getUsage, hasElevenKey, listModels, listVoices } from "@/lib/elevenlabs";
import { DEMO_ID, type VoiceConfig } from "@/lib/voiceShared";

export const runtime = "nodejs";

const DEMO: VoiceConfig = {
  configured: false,
  voices: [
    {
      id: DEMO_ID,
      name: "Demo voice (silent)",
      category: "demo",
      description: "Placeholder narration with correct timing but no sound, so you can try the whole flow without an ElevenLabs key.",
      labels: {},
      previewUrl: null,
    },
  ],
  models: [{ id: DEMO_ID, name: "Demo (no key)", maxChars: null, costFactor: 0, costKnown: true }],
  usage: null,
  concurrency: 2,
};

/** Voices, models and plan usage for the voice picker. */
export async function GET(req: Request) {
  if (!hasElevenKey()) return NextResponse.json(DEMO, { headers: { "cache-control": "no-store" } });

  const refresh = new URL(req.url).searchParams.get("refresh") === "1";

  const [voices, models, usage] = await Promise.allSettled([listVoices(refresh), listModels(refresh), getUsage(refresh)]);

  // A bad key shows up on every call. Say so once, clearly, instead of three half-working lists.
  for (const r of [voices, models, usage]) {
    if (r.status === "rejected" && r.reason instanceof ElError && r.reason.code === "invalid_api_key") {
      return NextResponse.json({ error: r.reason.message }, { status: 401 });
    }
    if (r.status === "rejected" && r.reason instanceof ElError && r.reason.code === "network") {
      return NextResponse.json({ error: r.reason.message }, { status: 502 });
    }
  }

  const config: VoiceConfig = {
    configured: true,
    voices: voices.status === "fulfilled" ? voices.value : [],
    models: models.status === "fulfilled" && models.value.length ? models.value : FALLBACK_MODELS,
    usage: usage.status === "fulfilled" ? usage.value : null,
    concurrency: concurrencyFor(usage.status === "fulfilled" ? usage.value?.tier : undefined),
  };
  if (voices.status === "rejected") {
    config.voicesError =
      voices.reason instanceof ElError ? voices.reason.message : "Couldn't read your voices. You can still paste a voice ID below.";
  }
  return NextResponse.json(config, { headers: { "cache-control": "no-store" } });
}
