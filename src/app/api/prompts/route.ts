import { NextResponse } from "next/server";
import { AiError, extractJson, generateAIContent, hasKey } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_SHOTS_PER_CALL = 25;

/**
 * Turn whatever list the model returned into exactly `n` prompts, in order. Extras are dropped, and anything it
 * skipped or left blank comes back as null so just those can be asked for again. Accepts plain strings, objects
 * like {"prompt": "..."}, or an object keyed by position.
 */
function coercePrompts(parsed: unknown, n: number): (string | null)[] {
  let items: unknown[] = [];
  if (Array.isArray(parsed)) items = parsed;
  else if (parsed && typeof parsed === "object") {
    const o = parsed as Record<string, unknown>;
    const inner = o.prompts ?? o.items ?? o.result;
    items = Array.isArray(inner) ? inner : Object.keys(o).sort((a, b) => Number(a) - Number(b)).map((k) => o[k]);
  }
  const text = (v: unknown): string | null => {
    if (typeof v === "string") return v.trim() || null;
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      const t = o.prompt ?? o.text ?? o.description;
      return typeof t === "string" ? t.trim() || null : null;
    }
    return null;
  };
  return Array.from({ length: n }, (_, i) => text(items[i]));
}

export async function POST(req: Request) {
  let b: { title?: unknown; artStyle?: unknown; outline?: unknown; shots?: unknown };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const title = typeof b.title === "string" ? b.title.slice(0, 200) : "";
  const artStyle = typeof b.artStyle === "string" ? b.artStyle.slice(0, 1200).trim() : "";
  const outline = typeof b.outline === "string" ? b.outline.slice(0, 1500) : "";

  if (!artStyle) return NextResponse.json({ error: "Describe the art style first." }, { status: 400 });
  if (!Array.isArray(b.shots) || b.shots.length === 0 || b.shots.length > MAX_SHOTS_PER_CALL) {
    return NextResponse.json({ error: `Send between 1 and ${MAX_SHOTS_PER_CALL} shots per request.` }, { status: 400 });
  }

  const shots = (b.shots as { n?: unknown; narration?: unknown }[]).map((s) => ({
    n: typeof s.n === "number" ? s.n : 0,
    narration: typeof s.narration === "string" ? s.narration.slice(0, 1000) : "",
  }));
  if (shots.some((s) => !s.n || !s.narration)) {
    return NextResponse.json({ error: "Every shot needs a number and narration." }, { status: 400 });
  }

  if (!hasKey()) {
    return NextResponse.json({
      mock: true,
      prompts: shots.map((s) => `${artStyle}. Scene: ${s.narration} 16:9 widescreen. No text, no captions, no watermark.`),
    });
  }

  const buildPrompt = (subset: { n: number; narration: string }[]) => {
    const list = subset.map((s) => `${s.n}. ${s.narration}`).join("\n");
    return `You write image-generation prompts for a YouTube video titled "${title}".

Video opening, for context on characters and setting:
"""
${outline}
"""

Locked art style (every prompt must be written to produce exactly this look):
"""
${artStyle}
"""

Below are ${subset.length} numbered narration segments. Write one image prompt for each, in the same order.

Each prompt must:
- Describe one clear, visual scene that illustrates what the narration says. Show it, do not just restate it.
- Start with the art style, restated in a short form, so each prompt works on its own when pasted alone.
- Describe recurring characters the same way every time (same age, clothes, hair, features) so they look consistent from shot to shot.
- Include the setting, the action, the expression or mood, and the lighting.
- End with: "16:9 widescreen. No text, no captions, no watermark."
- Be 2 to 4 sentences, with no markdown.

Narration segments:
${list}

Return ONLY a JSON array of exactly ${subset.length} strings, in order. No prose, no code fences.`;
  };

  try {
    const ask = async (subset: { n: number; narration: string }[]): Promise<(string | null)[]> => {
      const text = await generateAIContent({
        prompt: buildPrompt(subset),
        maxTokens: Math.min(16_000, subset.length * 260 + 400),
      });
      return coercePrompts(extractJson<unknown>(text), subset.length);
    };

    // First pass for the whole batch, then one more pass for only the shots that came back empty
    const out: (string | null)[] = await ask(shots);
    const missing = () => shots.filter((_, i) => !out[i]);
    if (missing().length > 0) {
      const subset = missing();
      const again = await ask(subset).catch(() => [] as (string | null)[]);
      subset.forEach((sh, j) => {
        if (again[j]) out[shots.indexOf(sh)] = again[j];
      });
    }
    if (missing().length > 0) {
      throw new AiError(`The AI only wrote ${shots.length - missing().length} of ${shots.length} prompts. Press Build again to retry the rest.`);
    }
    return NextResponse.json({ mock: false, prompts: out as string[] });
  } catch (err) {
    const e = err instanceof AiError ? err : new AiError("Couldn't write the prompts. Try again.");
    console.error("prompts route failed", err);
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
}
