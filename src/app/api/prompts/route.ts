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

  const list = shots
    .map((s) => `${s.n}. ${s.narration}`)
    .join("\n");

  const prompt = `
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

1. Generate exactly ${shots.length} image prompts.
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

Return ONLY a valid JSON array of exactly ${shots.length} strings.

Do not include explanations or code fences.
`;

  try {
    const text = await generateAIContent({
      prompt,
      systemPrompt:
        "You are an expert cinematic image prompt engineer. Return only valid JSON arrays.",
      maxTokens: Math.min(16_000, shots.length * 260 + 400),
    });

    const arr = extractJson<unknown[]>(text);

    if (
      !Array.isArray(arr) ||
      arr.length !== shots.length ||
      arr.some(
        (p) =>
          typeof p !== "string" ||
          !p.trim()
      )
    ) {
      throw new AiError(
        "The AI returned the wrong number of prompts. Try again."
      );
    }

    return NextResponse.json({
      mock: false,
      prompts: (arr as string[]).map((p) => p.trim()),
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
