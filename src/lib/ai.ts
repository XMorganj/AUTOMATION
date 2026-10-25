import "server-only";
import { recordUsage } from "./usage";

/**
 * Text generation for ideas, scripts, fact checks and image prompts. Server-side only: keys never reach the browser.
 *
 * Provider is chosen by DEFAULT_AI_PROVIDER ("anthropic" by default, or "ollama"):
 *  - ollama:    a local model, reached at OLLAMA_BASE_URL (works through an ngrok URL too). OLLAMA_MODEL, OLLAMA_NUM_CTX.
 *  - anthropic: Claude, with ANTHROPIC_API_KEY. ANTHROPIC_MODEL and ANTHROPIC_BASE_URL are optional.
 */

export type Provider = "anthropic" | "ollama";

export interface GenerateOptions {
  prompt: string;
  systemPrompt?: string;
  /** overrides DEFAULT_AI_PROVIDER for this call */
  provider?: Provider;
  /** the most the model may write; keeps long scripts from being cut off, and short jobs from rambling */
  maxTokens?: number;
}

export class AiError extends Error {
  status: number;
  constructor(message: string, status: number = 502) {
    super(message);
    this.name = "AiError";
    this.status = status;
  }
}

export function activeProvider(provider?: string): Provider {
  const p = (provider || process.env.DEFAULT_AI_PROVIDER || "anthropic").toLowerCase();
  return p === "anthropic" ? "anthropic" : "ollama";
}

/** Is the chosen provider set up? Ollama needs a URL (OLLAMA_BASE_URL, or a local default); Claude needs a key. */
export function hasKey(provider?: string): boolean {
  return activeProvider(provider) === "anthropic" ? Boolean(process.env.ANTHROPIC_API_KEY) : true;
}

/** Pull JSON out of a model reply, even when it is wrapped in markdown fences or has chatter around it. */
export function extractJson<T = unknown>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    /* try the cleaned-up versions below */
  }
  const cleaned = text.replace(/```(?:json)?\s*([\s\S]*?)\s*```/g, "$1").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    /* fall through */
  }
  const first = cleaned.search(/[{[]/);
  const last = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
  if (first !== -1 && last > first) {
    try {
      return JSON.parse(cleaned.slice(first, last + 1)) as T;
    } catch {
      /* fall through */
    }
  }
  throw new AiError(`The AI's reply wasn't in the expected format. Try again. (${text.slice(0, 80).replace(/\s+/g, " ")}…)`);
}

export async function generateAIContent(opts: GenerateOptions): Promise<string> {
  return activeProvider(opts.provider) === "anthropic" ? callAnthropic(opts) : callOllama(opts);
}

async function callAnthropic({ prompt, systemPrompt, maxTokens }: GenerateOptions): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new AiError("ANTHROPIC_API_KEY isn't set. Add it to .env.local, or set DEFAULT_AI_PROVIDER=ollama to use a local model.", 400);
  const base = (process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/+$/, "");

  let res: Response;
  try {
    res = await fetch(`${base}/v1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
        max_tokens: maxTokens ?? 4096,
        ...(systemPrompt ? { system: systemPrompt } : {}),
        messages: [{ role: "user", content: prompt }],
      }),
    });
  } catch {
    throw new AiError("Couldn't reach the Anthropic API. Check your internet connection.", 502);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new AiError(`The AI service returned ${res.status}. ${body.slice(0, 160)}`.trim(), res.status === 429 || res.status === 401 ? res.status : 502);
  }
  const data = (await res.json()) as { content?: { type: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number } };
  recordUsage("anthropic", data.usage?.input_tokens ?? 0, data.usage?.output_tokens ?? 0);
  const text = (data.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
  if (!text.trim()) throw new AiError("The AI returned an empty reply. Try again.", 502);
  return text;
}

async function callOllama({ prompt, systemPrompt, maxTokens }: GenerateOptions): Promise<string> {
  const base = (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/+$/, "");
  const model = process.env.OLLAMA_MODEL || "huihui_ai/dolphin3-abliterated:8b-llama3.1-q4_K_M";
  // Ollama reads only the first 2-4k tokens by default and quietly drops the rest, which would cut off long scripts
  const numCtx = Number(process.env.OLLAMA_NUM_CTX) || 16384;

  let res: Response;
  try {
    res = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json", "ngrok-skip-browser-warning": "true" },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [
          ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
          { role: "user", content: prompt },
        ],
        options: { num_ctx: numCtx, ...(maxTokens ? { num_predict: maxTokens } : {}) },
      }),
    });
  } catch {
    throw new AiError(`Couldn't reach Ollama at ${base}. Is it running (and the ngrok link still live)?`, 502);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new AiError(`Ollama returned ${res.status}. ${body.slice(0, 160)}`.trim(), 502);
  }
  const data = (await res.json()) as { message?: { content?: string }; prompt_eval_count?: number; eval_count?: number };
  recordUsage("ollama", data.prompt_eval_count ?? 0, data.eval_count ?? 0);
  const text = data.message?.content ?? "";
  if (!text.trim()) throw new AiError("The AI returned an empty reply. Try again.", 502);
  return text;
}
