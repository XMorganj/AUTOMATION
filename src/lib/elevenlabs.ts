import "server-only";
import type { ModelInfo, Usage, VoiceInfo } from "./voiceShared";

/**
 * ElevenLabs client. Server-side only: the API key never reaches the browser.
 * Endpoints and field names were checked against the ElevenLabs API reference (Oct 2026):
 *   GET  /v2/voices            list voices (paginated)
 *   GET  /v1/models            list models, with per-character cost and request size limits
 *   GET  /v1/user/subscription characters used / allowed this period
 *   POST /v1/text-to-speech/{voice_id}/with-timestamps   audio + per-character timing
 * Authentication is the `xi-api-key` header.
 */

const base = () => (process.env.ELEVENLABS_BASE_URL || "https://api.elevenlabs.io").replace(/\/$/, "");

export const hasElevenKey = () => Boolean(process.env.ELEVENLABS_API_KEY);

export class ElError extends Error {
  constructor(
    message: string,
    public status: number,
    /** ElevenLabs' own status string, e.g. "quota_exceeded" */
    public code: string,
  ) {
    super(message);
  }
}

function friendly(status: number, code: string, message: string): ElError {
  switch (code) {
    case "invalid_api_key":
      return new ElError("ElevenLabs rejected the API key. Check ELEVENLABS_API_KEY in .env.local and restart.", 401, code);
    case "quota_exceeded":
      return new ElError("Your ElevenLabs plan is out of characters for this period. Top up, upgrade, or wait for the reset.", 402, code);
    case "voice_not_found":
      return new ElError("That voice wasn't found on your ElevenLabs account. Pick another voice.", 404, code);
    case "too_many_concurrent_requests":
      return new ElError("ElevenLabs is limiting how many requests run at once on your plan.", 429, code);
    case "system_busy":
      return new ElError("ElevenLabs is busy right now.", 429, code);
    case "max_character_limit_exceeded":
      return new ElError("That text is longer than this model accepts in one request.", 400, code);
  }
  if (status === 401 || status === 403) {
    return new ElError(
      `ElevenLabs refused the request${message ? `: ${message}` : ""}. If your API key is restricted, it needs permission for text to speech and for reading voices.`,
      status,
      code,
    );
  }
  return new ElError(`${message || "ElevenLabs returned an error"} (${status}).`, status >= 500 ? 502 : status, code);
}

async function toError(res: Response): Promise<ElError> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* not JSON */
  }
  const detail = (body as { detail?: unknown } | null)?.detail;
  let code = "unknown";
  let message = "";
  if (typeof detail === "string") {
    message = detail;
  } else if (Array.isArray(detail)) {
    code = "validation";
    message = detail
      .map((d: { loc?: unknown[]; msg?: string }) => `${Array.isArray(d?.loc) ? d.loc.join(".") + ": " : ""}${d?.msg ?? ""}`)
      .join("; ");
  } else if (detail && typeof detail === "object") {
    code = String((detail as { status?: unknown }).status ?? "unknown");
    message = String((detail as { message?: unknown }).message ?? "");
  }
  return friendly(res.status, code, message);
}

async function el(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new ElError("No ElevenLabs API key is configured.", 500, "no_key");
  let res: Response;
  try {
    res = await fetch(base() + path, {
      ...init,
      headers: { "xi-api-key": key, ...(init.headers as Record<string, string> | undefined) },
      signal: AbortSignal.timeout(init.timeoutMs ?? 60_000),
    });
  } catch {
    throw new ElError("Couldn't reach ElevenLabs. Check your internet connection.", 502, "network");
  }
  if (!res.ok) throw await toError(res);
  return res;
}

/* ---------- voices, models, usage (cached for a few minutes; they rarely change) ---------- */

const TTL = 5 * 60_000;
const cache = new Map<string, { at: number; value: unknown }>();
async function cached<T>(name: string, refresh: boolean, load: () => Promise<T>): Promise<T> {
  const k = `${base()}|${process.env.ELEVENLABS_API_KEY}|${name}`;
  const hit = cache.get(k);
  if (!refresh && hit && Date.now() - hit.at < TTL) return hit.value as T;
  const value = await load();
  cache.set(k, { at: Date.now(), value });
  return value;
}

interface RawVoice {
  voice_id?: string;
  name?: string;
  category?: string;
  description?: string | null;
  preview_url?: string | null;
  labels?: Record<string, string> | null;
}

export function listVoices(refresh = false): Promise<VoiceInfo[]> {
  return cached("voices", refresh, async () => {
    const out: VoiceInfo[] = [];
    let token: string | null = null;
    for (let page = 0; page < 3; page++) {
      const q = new URLSearchParams({ page_size: "100", include_total_count: "false" });
      if (token) q.set("next_page_token", token);
      const j = (await (await el(`/v2/voices?${q}`)).json()) as { voices?: RawVoice[]; has_more?: boolean; next_page_token?: string | null };
      for (const v of j.voices ?? []) {
        if (!v.voice_id || !v.name) continue;
        out.push({
          id: v.voice_id,
          name: v.name,
          category: v.category ?? "other",
          description: (v.description ?? "").slice(0, 220),
          labels: {
            gender: v.labels?.gender,
            accent: v.labels?.accent,
            age: v.labels?.age,
            useCase: v.labels?.use_case ?? v.labels?.usecase,
          },
          previewUrl: v.preview_url ?? null,
        });
      }
      if (!j.has_more || !j.next_page_token) break;
      token = j.next_page_token;
    }
    return out;
  });
}

interface RawModel {
  model_id?: string;
  name?: string;
  can_do_text_to_speech?: boolean;
  requires_alpha_access?: boolean;
  token_cost_factor?: number;
  maximum_text_length_per_request?: number;
  model_rates?: { character_cost_multiplier?: number };
}

/** Models suited to narration, best long-form choice first. Realtime/conversational and deprecated Turbo models are left out. */
const PREFERRED = ["eleven_multilingual_v2", "eleven_flash_v2_5", "eleven_v4", "eleven_v3"];

export const FALLBACK_MODELS: ModelInfo[] = [
  { id: "eleven_multilingual_v2", name: "Multilingual v2", maxChars: 10_000, costFactor: 1, costKnown: false },
  { id: "eleven_flash_v2_5", name: "Flash v2.5", maxChars: 40_000, costFactor: 0.5, costKnown: false },
];

export function listModels(refresh = false): Promise<ModelInfo[]> {
  return cached("models", refresh, async () => {
    const raw = (await (await el("/v1/models")).json()) as RawModel[];
    const tts = raw.filter((m) => m.model_id && m.can_do_text_to_speech && !m.requires_alpha_access);
    const toInfo = (m: RawModel): ModelInfo => ({
      id: m.model_id!,
      name: m.name ?? m.model_id!,
      maxChars: m.maximum_text_length_per_request ?? null,
      costFactor: m.model_rates?.character_cost_multiplier ?? m.token_cost_factor ?? 1,
      costKnown: m.model_rates?.character_cost_multiplier !== undefined || m.token_cost_factor !== undefined,
    });
    const preferred = PREFERRED.map((id) => tts.find((m) => m.model_id === id)).filter((m): m is RawModel => Boolean(m));
    const chosen = preferred.length ? preferred : tts.filter((m) => !/turbo|conversational|realtime/i.test(m.model_id!));
    return chosen.map(toInfo);
  });
}

export function getUsage(refresh = false): Promise<Usage | null> {
  return cached("usage", refresh, async () => {
    const j = (await (await el("/v1/user/subscription")).json()) as { tier?: string; character_count?: number; character_limit?: number };
    if (typeof j.character_count !== "number" || typeof j.character_limit !== "number") return null;
    return { tier: j.tier ?? "unknown", used: j.character_count, limit: j.character_limit };
  });
}

/** Requests ElevenLabs allows at once, by plan (from their error-429 help page). We never use more than 4. */
export function concurrencyFor(tier: string | undefined): number {
  const t = (tier ?? "").toLowerCase();
  if (t.includes("free")) return 2;
  if (t.includes("starter")) return 3;
  if (t.includes("creator")) return 4;
  if (t.includes("pro") || t.includes("scale") || t.includes("business")) return 4;
  return 2;
}

/* ---------- speech ---------- */

export interface Alignment {
  characters: string[];
  starts: number[];
  ends: number[];
}

export interface SpeechParams {
  voiceId: string;
  modelId: string;
  text: string;
  settings: { stability: number; similarity: number; style: number; speed: number; boost: boolean };
  previousText?: string;
  nextText?: string;
}

export async function synthesize(p: SpeechParams): Promise<{ audio: Buffer; alignment: Alignment | null }> {
  const body: Record<string, unknown> = {
    text: p.text,
    model_id: p.modelId,
    voice_settings: {
      stability: p.settings.stability,
      similarity_boost: p.settings.similarity,
      style: p.settings.style,
      speed: p.settings.speed,
      use_speaker_boost: p.settings.boost,
    },
  };
  const send = (withContext: boolean) => {
    const b = { ...body };
    if (withContext && p.previousText) b.previous_text = p.previousText;
    if (withContext && p.nextText) b.next_text = p.nextText;
    return el(`/v1/text-to-speech/${encodeURIComponent(p.voiceId)}/with-timestamps?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(b),
      timeoutMs: 120_000,
    });
  };

  let res: Response;
  try {
    res = await send(true);
  } catch (e) {
    // Not every model accepts neighbouring-text context. If this one refuses it, send the shot on its own.
    const refusedContext = e instanceof ElError && e.code === "validation" && /previous_text|next_text/.test(e.message);
    if (!refusedContext) throw e;
    res = await send(false);
  }

  const j = (await res.json()) as {
    audio_base64?: string;
    alignment?: { characters?: string[]; character_start_times_seconds?: number[]; character_end_times_seconds?: number[] } | null;
  };
  if (!j.audio_base64) throw new ElError("ElevenLabs returned no audio.", 502, "empty");
  const a = j.alignment;
  const alignment =
    a?.characters && a.character_start_times_seconds && a.character_end_times_seconds && a.characters.length === a.character_start_times_seconds.length
      ? { characters: a.characters, starts: a.character_start_times_seconds, ends: a.character_end_times_seconds }
      : null;
  return { audio: Buffer.from(j.audio_base64, "base64"), alignment };
}
