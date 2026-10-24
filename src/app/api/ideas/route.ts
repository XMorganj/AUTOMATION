import { NextResponse } from "next/server";
import {
  AiError,
  generateAIContent,
  extractJson,
  hasKey,
} from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 120;

interface Idea {
  title: string;
  hook: string;
}

function mockIdeas(theme: string): Idea[] {
  const t =
    theme
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase()) || "Your Niche";

  return [
    {
      title: `The Untold Story Behind ${t}`,
      hook: "Open with the one detail almost everyone gets wrong.",
    },
    {
      title: `5 Things Nobody Tells You About ${t}`,
      hook: "A fast list that rewards watching to the end.",
    },
    {
      title: `Why ${t} Is Changing Faster Than You Think`,
      hook: "Start from a surprising number, then explain it.",
    },
    {
      title: `I Looked Into ${t} So You Don't Have To`,
      hook: "Personal, curious tone with a clear verdict.",
    },
    {
      title: `${t}: What Actually Works (And What Doesn't)`,
      hook: "Myth versus reality, one point at a time.",
    },
  ];
}

export async function POST(req: Request) {
  let body: {
    theme?: unknown;
    minutes?: unknown;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const theme =
    typeof body.theme === "string"
      ? body.theme.slice(0, 300)
      : "";

  const minutes =
    typeof body.minutes === "number" &&
    body.minutes >= 1 &&
    body.minutes <= 60
      ? body.minutes
      : 10;

  // Check whether Ollama is configured
  if (!hasKey("ollama")) {
    return NextResponse.json({
      ideas: mockIdeas(theme),
      mock: true,
    });
  }

  const prompt = `
You are a professional YouTube content strategist.

Generate exactly 5 distinct YouTube video ideas ${
    theme
      ? `about: "${theme}"`
      : "in a broad, evergreen, high-interest niche"
  }.

Each video should be approximately ${minutes} minutes long.

Requirements:

1. Titles must be specific and curiosity-driven.
2. Each title must be under 70 characters.
3. Avoid misleading clickbait.
4. Each idea must have a compelling hook.
5. Hooks should explain the opening angle in one sentence.
6. Make every idea unique and engaging.

IMPORTANT:
Return ONLY a valid JSON array.

Do not include explanations.
Do not include markdown.
Do not include code fences.

Expected format:

[
  {
    "title": "Example YouTube Title",
    "hook": "A compelling opening angle."
  }
]
`;

  try {
    // Generate ideas using local Ollama via ngrok
    const text = await generateAIContent({
      prompt,
      systemPrompt:
        "You are an expert YouTube strategist. Return only valid JSON arrays.",
      provider: "ollama",
    });

    // Parse JSON response
    const parsed = extractJson<unknown[]>(text);

    if (!Array.isArray(parsed)) {
      throw new AiError(
        "The AI returned an invalid ideas format. Try again."
      );
    }

    // Validate generated ideas
    const ideas = parsed
      .filter((x): x is Idea => {
        if (
          typeof x !== "object" ||
          x === null
        ) {
          return false;
        }

        const o = x as Partial<Idea>;

        return (
          typeof o.title === "string" &&
          typeof o.hook === "string"
        );
      })
      .slice(0, 5);

    if (ideas.length === 0) {
      throw new AiError(
        "The AI returned no usable ideas. Try again."
      );
    }

    return NextResponse.json({
      ideas,
      mock: false,
    });
  } catch (err) {
    console.error("Ideas route failed:", err);

    const e =
      err instanceof AiError
        ? err
        : new AiError(
            "Couldn't generate ideas. Try again."
          );

    return NextResponse.json(
      { error: e.message },
      { status: e.status }
    );
  }
}
