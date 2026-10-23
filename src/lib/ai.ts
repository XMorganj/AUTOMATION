import "server-only";

/** Thin wrapper around the Anthropic Messages API. Server-side only: the key never reaches the browser. */

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

export class AiError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

export function hasKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function claude(prompt: string, maxTokens: number): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new AiError("No API key configured.", 500);

  const base = (process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/$/, "");
  const res = await fetch(`${base}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(170_000),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error("Anthropic error", res.status, detail.slice(0, 500));
    throw new AiError(`The AI service returned ${res.status}.`);
  }

  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = data.content?.find((c) => c.type === "text")?.text;
  if (!text) throw new AiError("The AI service returned an empty response.");
  return text;
}

/** Pull the first JSON array/object out of a model reply, tolerating stray prose or code fences. */
export function extractJson<T>(text: string, kind: "array" | "object"): T {
  const open = kind === "array" ? "[" : "{";
  const close = kind === "array" ? "]" : "}";
  const start = text.indexOf(open);
  const end = text.lastIndexOf(close);
  if (start === -1 || end <= start) throw new AiError("Couldn't read the AI response. Try again.");
  try {
    return JSON.parse(text.slice(start, end + 1)) as T;
  } catch {
    throw new AiError("Couldn't read the AI response. Try again.");
  }
}
