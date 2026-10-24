import { NextResponse } from "next/server";
import {
  AiError,
  generateAIContent,
  hasKey,
} from "@/lib/ai";
import { WORDS_PER_MIN } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 180;

function mockScript(title: string, words: number): string {
  const para = (n: number) =>
    `This is placeholder narration ${n} for "${title}". Configure OLLAMA_BASE_URL to generate a real script using your local Ollama model.`;

  const count = Math.max(3, Math.round(words / 40));

  return Array.from(
    { length: count },
    (_, i) => para(i + 1)
  ).join("\n\n");
}

export async function POST(req: Request) {
  let b: {
    title?: unknown;
    minutes?: unknown;
    theme?: unknown;
    notes?: unknown;
    current?: unknown;
    instruction?: unknown;
  };

  try {
    b = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const str = (v: unknown, max: number) =>
    typeof v === "string" ? v.slice(0, max) : "";

  const title = str(b.title, 200).trim();
  const theme = str(b.theme, 300).trim();
  const notes = str(b.notes, 600).trim();
  const current = str(b.current, 40_000).trim();
  const instruction = str(b.instruction, 600).trim();

  const minutes =
    typeof b.minutes === "number" &&
    b.minutes >= 1 &&
    b.minutes <= 60
      ? b.minutes
      : 10;

  if (!title) {
    return NextResponse.json(
      { error: "Pick a video title first." },
      { status: 400 }
    );
  }

  const words = Math.round(minutes * WORDS_PER_MIN);

  // Check whether Ollama is configured
  if (!hasKey()) {
    return NextResponse.json({
      script: mockScript(title, words),
      mock: true,
    });
  }

  const rules = `
Rules for the narration:

- Plain spoken narration only.
- No headings.
- No markdown.
- No bullet points.
- No stage directions.
- No "[music]" labels.
- No "Scene 1" labels.
- No speaker names.
- Use short paragraphs separated by blank lines.
- Write clear sentences that sound natural when read aloud.
- Open with a compelling hook in the first two sentences.
- Never begin with "Hey guys" or "Welcome back".
- Build the story in a clear, logical order.
- Deliver a satisfying payoff at the end.
- Finish with one powerful final line.
- Only state facts you are confident are true.
- Never invent statistics, dates, quotes, or sources.
- Return ONLY the narration text.
`;

  const prompt =
    instruction && current
      ? `
You are editing the narration script for a YouTube video titled "${title}".

CURRENT SCRIPT:
"""
${current}
"""

CREATOR'S EDITING INSTRUCTION:
${instruction}

Apply the instruction carefully.

Return the full revised script.

Target length:
Approximately ${words} words.
Approximately ${minutes} minutes of narration.

Preserve everything the instruction does not mention.

${rules}
`
      : `
You are a professional YouTube documentary scriptwriter.

Write a complete narration script for a YouTube video titled:

"${title}"

TARGET LENGTH:
Approximately ${words} words.
Approximately ${minutes} minutes.

Stay within 10% of the requested word count.

${theme ? `TOPIC OR NICHE:\n${theme}\n` : ""}

${notes ? `CREATOR'S STYLE NOTES:\n${notes}\n` : ""}

${rules}
`;

  try {
    // Generate script using local Ollama through ngrok
    const text = await generateAIContent({
      prompt,
      systemPrompt:
        "You are an expert YouTube documentary scriptwriter. Write engaging, accurate, natural narration.",
      maxTokens: Math.min(16_000, Math.round(words * 1.8) + 600),
    });

    if (!text || !text.trim()) {
      throw new AiError(
        "The AI returned an empty script. Please try again."
      );
    }

    return NextResponse.json({
      script: text.trim(),
      mock: false,
    });
  } catch (err) {
    console.error("Script route failed:", err);

    const e =
      err instanceof AiError
        ? err
        : new AiError(
            "Couldn't write the script. Try again."
          );

    return NextResponse.json(
      { error: e.message },
      { status: e.status }
    );
  }
}
