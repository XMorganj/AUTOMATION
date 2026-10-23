import { NextResponse } from "next/server";
import { AiError, claude, extractJson, hasKey } from "@/lib/ai";

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
    { title: `The Untold Story Behind ${t}`, hook: "Open with the one detail almost everyone gets wrong." },
    { title: `5 Things Nobody Tells You About ${t}`, hook: "A fast list that rewards watching to the end." },
    { title: `Why ${t} Is Changing Faster Than You Think`, hook: "Start from a surprising number, then explain it." },
    { title: `I Looked Into ${t} So You Don't Have To`, hook: "Personal, curious tone with a clear verdict." },
    { title: `${t}: What Actually Works (And What Doesn't)`, hook: "Myth versus reality, one point at a time." },
  ];
}

export async function POST(req: Request) {
  let body: { theme?: unknown; minutes?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const theme = typeof body.theme === "string" ? body.theme.slice(0, 300) : "";
  const minutes = typeof body.minutes === "number" && body.minutes >= 1 && body.minutes <= 60 ? body.minutes : 10;

  if (!hasKey()) return NextResponse.json({ ideas: mockIdeas(theme), mock: true });

  const prompt = `You are a YouTube strategist. Suggest 5 distinct video ideas${
    theme ? ` about: "${theme}"` : " in a broad, evergreen, high-interest niche"
  }. Each video will be about ${minutes} minutes long.

Rules:
- Titles are specific, curiosity-driven, under 70 characters, and not clickbait lies.
- "hook" is one sentence describing the opening angle.
- Return ONLY a JSON array of exactly 5 objects: [{"title": "...", "hook": "..."}]. No prose, no code fences.`;

  try {
    const text = await claude(prompt, 1200);
    const parsed = extractJson<unknown[]>(text, "array");
    const ideas = parsed
      .filter((x): x is Idea => {
        const o = x as Partial<Idea> | null;
        return typeof o?.title === "string" && typeof o?.hook === "string";
      })
      .slice(0, 5);
    if (ideas.length === 0) throw new AiError("The AI returned no usable ideas. Try again.");
    return NextResponse.json({ ideas, mock: false });
  } catch (err) {
    const e = err instanceof AiError ? err : new AiError("Couldn't generate ideas. Try again.");
    console.error("ideas route failed", err);
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
}
