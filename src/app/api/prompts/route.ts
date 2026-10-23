import { NextResponse } from "next/server";
import { AiError, claude, extractJson, hasKey } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_SHOTS_PER_CALL = 25;

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

  const list = shots.map((s) => `${s.n}. ${s.narration}`).join("\n");
  const prompt = `You write image-generation prompts for a YouTube video titled "${title}".

Video opening, for context on characters and setting:
"""
${outline}
"""

Locked art style (every prompt must be written to produce exactly this look):
"""
${artStyle}
"""

Below are ${shots.length} numbered narration segments. Write one image prompt for each, in the same order.

Each prompt must:
- Describe one clear, visual scene that illustrates what the narration says. Show it, do not just restate it.
- Start with the art style, restated in a short form, so each prompt works on its own when pasted alone.
- Describe recurring characters the same way every time (same age, clothes, hair, features) so they look consistent from shot to shot.
- Include the setting, the action, the expression or mood, and the lighting.
- End with: "16:9 widescreen. No text, no captions, no watermark."
- Be 2 to 4 sentences, with no markdown.

Narration segments:
${list}

Return ONLY a JSON array of exactly ${shots.length} strings, in order. No prose, no code fences.`;

  try {
    const text = await claude(prompt, Math.min(16_000, shots.length * 260 + 400));
    const arr = extractJson<unknown[]>(text, "array");
    if (arr.length !== shots.length || arr.some((p) => typeof p !== "string" || !p.trim())) {
      throw new AiError("The AI returned the wrong number of prompts. Try again.");
    }
    return NextResponse.json({ mock: false, prompts: (arr as string[]).map((p) => p.trim()) });
  } catch (err) {
    const e = err instanceof AiError ? err : new AiError("Couldn't write the prompts. Try again.");
    console.error("prompts route failed", err);
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
}
