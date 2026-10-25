import { NextResponse } from "next/server";
import {
  AiError,
  generateAIContent,
  extractJson,
} from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_SHOTS_PER_CALL = 25;

interface Shot {
  n: number;
  narration: string;
}

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
  let body: {
    title?: unknown;
    artStyle?: unknown;
    outline?: unknown;
    shots?: unknown;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const title =
    typeof body.title === "string"
      ? body.title.slice(0, 200)
      : "";

  const artStyle =
    typeof body.artStyle === "string"
      ? body.artStyle.slice(0, 1200).trim()
      : "";

  const outline =
    typeof body.outline === "string"
      ? body.outline.slice(0, 1500)
      : "";

  if (!artStyle) {
    return NextResponse.json(
      { error: "Describe the art style first." },
      { status: 400 }
    );
  }

  if (
    !Array.isArray(body.shots) ||
    body.shots.length === 0 ||
    body.shots.length > MAX_SHOTS_PER_CALL
  ) {
    return NextResponse.json(
      {
        error: `Send between 1 and ${MAX_SHOTS_PER_CALL} shots per request.`,
      },
      { status: 400 }
    );
  }

  const shots: Shot[] = body.shots.map((s: unknown) => {
    const shot =
      s !== null && typeof s === "object"
        ? (s as Record<string, unknown>)
        : {};

    return {
      n:
        typeof shot.n === "number" &&
        Number.isInteger(shot.n) &&
        shot.n > 0
          ? shot.n
          : 0,
      narration:
        typeof shot.narration === "string"
          ? shot.narration.slice(0, 1000).trim()
          : "",
    };
  });

  if (shots.some((s) => !s.n || !s.narration)) {
    return NextResponse.json(
      { error: "Every shot needs a number and narration." },
      { status: 400 }
    );
  }

  const buildPrompt = (subset: Shot[]) => {
    const list = subset.map((s) => `${s.n}. ${s.narration}`).join("\n");
    return `
You are an expert cinematic image prompt engineer.

Generate image-generation prompts for a YouTube video.

VIDEO TITLE:
${title}

VIDEO CONTEXT:
${outline}

LOCKED ART STYLE:
${artStyle}

NARRATION SEGMENTS:
${list}

INSTRUCTIONS:

1. Generate exactly ${subset.length} image prompts.
2. Each prompt must describe one clear visual scene.
3. Maintain the locked art style across every scene.
4. Keep recurring characters visually consistent.
5. Describe clothing, age, hairstyle, and appearance.
6. Include environment, action, mood, and lighting.
7. Use cinematic composition.
8. Each prompt must be 2 to 4 sentences.
9. Do not include markdown.
10. Every prompt must end with:
"16:9 widescreen. No text, no captions, no watermark."

Return ONLY a valid JSON array of exactly ${subset.length} strings.

Do not include explanations or code fences.
`;
  };

  try {
    const ask = async (subset: Shot[]): Promise<(string | null)[]> => {
      const text = await generateAIContent({
        prompt: buildPrompt(subset),
        systemPrompt:
          "You are an expert cinematic image prompt engineer. Return only valid JSON arrays.",
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
      throw new AiError(
        `The AI only wrote ${shots.length - missing().length} of ${shots.length} prompts. Press Build again to retry the rest.`
      );
    }

    return NextResponse.json({
      mock: false,
      prompts: out as string[],
    });

  } catch (err) {
    console.error("Prompts route failed:", err);

    const e =
      err instanceof AiError
        ? err
        : new AiError(
            "Couldn't write the prompts. Try again."
          );

    return NextResponse.json(
      { error: e.message },
      { status: e.status }
    );
  }
}
