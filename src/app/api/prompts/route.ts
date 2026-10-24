import { NextResponse } from "next/server";
import {
  AiError,
  generateAIContent,
  extractJson,
  hasKey,
} from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_SHOTS_PER_CALL = 25;

interface Shot {
  n: number;
  narration: string;
}

export async function POST(req: Request) {
  let b: {
    title?: unknown;
    artStyle?: unknown;
    outline?: unknown;
    shots?: unknown;
  };

  try {
    b = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const title =
    typeof b.title === "string"
      ? b.title.slice(0, 200)
      : "";

  const artStyle =
    typeof b.artStyle === "string"
      ? b.artStyle.slice(0, 1200).trim()
      : "";

  const outline =
    typeof b.outline === "string"
      ? b.outline.slice(0, 1500)
      : "";

  if (!artStyle) {
    return NextResponse.json(
      { error: "Describe the art style first." },
      { status: 400 }
    );
  }

  if (
    !Array.isArray(b.shots) ||
    b.shots.length === 0 ||
    b.shots.length > MAX_SHOTS_PER_CALL
  ) {
    return NextResponse.json(
      {
        error: `Send between 1 and ${MAX_SHOTS_PER_CALL} shots per request.`,
      },
      { status: 400 }
    );
  }

  const shots: Shot[] = (
    b.shots as {
      n?: unknown;
      narration?: unknown;
    }[]
  ).map((s) => ({
    n: typeof s.n === "number" ? s.n : 0,
    narration:
      typeof s.narration === "string"
        ? s.narration.slice(0, 1000)
        : "",
  }));

  if (shots.some((s) => !s.n || !s.narration)) {
    return NextResponse.json(
      {
        error: "Every shot needs a number and narration.",
      },
      { status: 400 }
    );
  }

  // Check Ollama configuration
  if (!hasKey("ollama")) {
    return NextResponse.json({
      mock: true,
      prompts: shots.map(
        (s) =>
          `${artStyle}. Scene: ${s.narration} 16:9 widescreen. No text, no captions, no watermark.`
      ),
    });
  }

  const list = shots
    .map((s) => `${s.n}. ${s.narration}`)
    .join("\n");

  const prompt = `
You are a professional AI image prompt engineer.

Your task is to generate cinematic image prompts
for a YouTube video titled:

"${title}"

VIDEO CONTEXT:
"""
${outline}
"""

LOCKED ART STYLE:
"""
${artStyle}
"""

You must maintain the same visual style across
every generated image.

Below are ${shots.length} numbered narration segments.

Generate exactly ONE image prompt per narration segment.

REQUIREMENTS:

1. Describe a clear visual scene.
2. Illustrate the narration visually.
3. Start each prompt with the locked art style.
4. Keep recurring characters visually consistent.
5. Describe characters' clothing, age, hairstyle,
   facial features, and appearance consistently.
6. Include the setting and environment.
7. Include the action taking place.
8. Include expressions and emotional atmosphere.
9. Describe lighting and cinematic composition.
10. Each prompt must contain 2–4 sentences.
11. Do not use markdown formatting.

Every prompt MUST end with:

"16:9 widescreen. No text, no captions, no watermark."

NARRATION SEGMENTS:

${list}

IMPORTANT:

Return ONLY a valid JSON array containing
exactly ${shots.length} strings.

No explanations.
No markdown.
No code fences.

Example:

[
  "Cinematic dark historical painting. A mysterious castle surrounded by fog at midnight. Dramatic moonlight illuminates the ancient stone walls. 16:9 widescreen. No text, no captions, no watermark.",
  "Cinematic dark historical painting. A lone traveler approaches the castle gates carrying a lantern. Heavy mist covers the forest. 16:9 widescreen. No text, no captions, no watermark."
]
`;

  try {
    // Generate image prompts using local Ollama
    const text = await generateAIContent({
      prompt,
      systemPrompt:
        "You are an expert cinematic image prompt engineer. Return only valid JSON arrays.",
      provider: "ollama",
    });

    // Extract JSON response
    const arr = extractJson<unknown[]>(text);

    if (
      !Array.isArray(arr) ||
      arr.length !== shots.length ||
      arr.some(
        (p) =>
          typeof p !== "string" ||
          !p.trim()
      )
