/**
 * Voice types and helpers shared by the browser and the API routes.
 * Deliberately NOT a "use client" file: server code importing a value from a client module
 * gets a placeholder instead of the real value.
 */
import { hashText } from "./shots";

export interface VoiceInfo {
  id: string;
  name: string;
  category: string;
  description: string;
  labels: { gender?: string; accent?: string; age?: string; useCase?: string };
  previewUrl: string | null;
}

export interface ModelInfo {
  id: string;
  name: string;
  /** characters allowed in one request */
  maxChars: number | null;
  /** credits used per character, relative to 1 */
  costFactor: number;
  costKnown: boolean;
}

export interface Usage {
  tier: string;
  used: number;
  limit: number;
}

export interface VoiceConfig {
  configured: boolean;
  voices: VoiceInfo[];
  /** set when the key works but the voice list couldn't be read (e.g. a restricted key) */
  voicesError?: string;
  models: ModelInfo[];
  usage: Usage | null;
  /** how many requests to run at once, from the plan */
  concurrency: number;
}

export interface WordTiming {
  w: string;
  s: number;
  e: number;
}

export interface AudioMeta {
  n: number;
  ext: "mp3" | "wav";
  duration: number;
  /** fingerprint of the text + voice + settings this audio was made from */
  key: string;
  voiceId: string;
  modelId: string;
  chars: number;
  bytes: number;
  mtime: number;
}

export interface MusicInfo {
  ext: string;
  name: string;
  bytes: number;
  mtime: number;
}

export interface VoiceChoice {
  voiceId: string;
  voiceName: string;
  modelId: string;
  stability: number;
  similarity: number;
  style: number;
  speed: number;
  boost: boolean;
}

export const DEMO_ID = "demo";

export const DEFAULT_SETTINGS = { stability: 0.5, similarity: 0.75, style: 0, speed: 1, boost: true };

export const PRESETS: { id: string; label: string; hint: string; settings: typeof DEFAULT_SETTINGS }[] = [
  { id: "natural", label: "Natural narrator", hint: "Balanced and clear", settings: { ...DEFAULT_SETTINGS } },
  { id: "steady", label: "Calm & steady", hint: "Even pacing for long videos", settings: { stability: 0.75, similarity: 0.75, style: 0, speed: 0.97, boost: true } },
  { id: "story", label: "Expressive storyteller", hint: "More emotion and variation", settings: { stability: 0.35, similarity: 0.75, style: 0.3, speed: 1, boost: true } },
];

/** Fingerprint of everything that changes how a shot sounds. If it changes, that shot's audio is out of date. */
export function voiceKey(text: string, c: VoiceChoice): string {
  return hashText([text.trim(), c.voiceId, c.modelId, c.stability, c.similarity, c.style, c.speed, c.boost].join("|"));
}
