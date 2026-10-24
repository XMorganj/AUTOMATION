import { NextResponse } from "next/server";
import { AiError, extractJson, generateAIContent, hasKey } from "@/lib/ai";
import { evenChapterDrafts } from "@/lib/chapters";
import { oneLine, sanitize, str } from "@/lib/seoSanitize";
import type { SeoSuggestions } from "@/lib/seoShared";

export const runtime = "nodejs";
export const maxDuration = 180;

const MAX_SHOTS = 400;

function mock(title: string, theme: string, shotNumbers: number[]): SeoSuggestions {
  const t = title || theme || "Your video";
  const topic = theme || title || "this topic";
  return {
    titles: [
      { title: t.slice(0, 100), style: "Your working title" },
      { title: `The Truth About ${topic}`.slice(0, 100), style: "Curiosity" },
      { title: `${topic}: Everything You Need to Know`.slice(0, 100), style: "Guide" },
      { title: `7 Surprising Facts About ${topic}`.slice(0, 100), style: "List" },
      { title: `Why ${topic} Matters More Than You Think`.slice(0, 100), style: "Stakes" },
    ],
    description: `${t}. This is placeholder text: set up an AI provider and this becomes a real description written from your script, with the keywords near the start.\n\nSubscribe for more videos like this.`,
    tags: [topic, "documentary", "explained", "history", "story"].map((x) => x.toLowerCase()),
    hashtags: [topic.replace(/\W+/g, ""), "documentary", "explained"].filter(Boolean),
    thumbnailTexts: ["THE TRUTH", "WHAT HAPPENED?", "NEVER TOLD"],
    chapters: spread(shotNumbers),
    mock: true,
  };
}

/** Six evenly spaced chapters, using the real shot numbers. */
function spread(shotNumbers: number[]) {
  return evenChapterDrafts(Math.max(1, shotNumbers.length), 6).map((c) => ({ ...c, shot: shotNumbers[c.shot - 1] ?? c.shot }));
}

export async function POST(req: Request) {
  let b: Record<string, unknown>;
  try {
    b = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const title = oneLine(str(b.title, 200));
  const theme = oneLine(str(b.theme, 300));
  const script = str(b.script, 60_000).trim();
  if (!script) return NextResponse.json({ error: "Write the script first. The titles and description come from it." }, { status: 400 });

  const rawShots = Array.isArray(b.shots) ? b.shots.slice(0, MAX_SHOTS) : [];
  const shots = rawShots
    .map((s) => {
      const o = (s ?? {}) as Record<string, unknown>;
      return { n: typeof o.n === "number" && Number.isInteger(o.n) && o.n > 0 ? o.n : 0, text: oneLine(str(o.text, 120)) };
    })
    .filter((s) => s.n && s.text);
  const shotNumbers = shots.map((s) => s.n);

  if (!hasKey()) return NextResponse.json(mock(title, theme, shotNumbers));

  const prompt = `
You are a YouTube SEO and packaging expert. Write the title, description and tags for this video.

WORKING TITLE: ${title || "(none yet)"}
${theme ? `NICHE: ${theme}\n` : ""}
SCRIPT:
"""
${script.slice(0, 24_000)}
"""
${shots.length ? `\nSHOTS (number, then what is said), for chapter markers:\n${shots.map((s) => `${s.n}. ${s.text}`).join("\n")}\n` : ""}
Write:
1. "titles": exactly 5 different title options, each under 70 characters, each in a different style (for example curiosity, how-to, list, bold claim, question). Specific and honest, no misleading clickbait, no ALL CAPS shouting. Put the main keyword near the start.
2. "description": 150 to 300 words. The first two sentences must hook the viewer and contain the main keyword, because that is all that shows in search. Then a short summary of what the video covers. End with a one-line call to subscribe. Do NOT include timestamps or hashtags here.
3. "tags": 12 to 20 search phrases people would type, most important first. No # symbol.
4. "hashtags": exactly 3 relevant hashtag words, no # symbol, no spaces.
5. "thumbnailTexts": 3 options of 2 to 4 words that would look strong in huge letters on a thumbnail and add curiosity without repeating the title.
${shots.length ? `6. "chapters": 5 to 10 chapters. Each has "shot" (a shot number from the list above where that part begins) and "title" (under 50 characters, descriptive). The first chapter must start at shot ${shots[0].n}. Shot numbers must increase.` : `6. "chapters": []`}

Do not use the characters < or > anywhere.

Return ONLY one valid JSON object, no explanations, no markdown, in exactly this shape:
{"titles":[{"title":"...","style":"..."}],"description":"...","tags":["..."],"hashtags":["..."],"thumbnailTexts":["..."],"chapters":[{"shot":1,"title":"..."}]}
`;

  try {
    const text = await generateAIContent({
      prompt,
      systemPrompt: "You are an expert YouTube strategist. Return only a valid JSON object.",
      maxTokens: 3000,
    });
    const clean = sanitize(extractJson<unknown>(text), shotNumbers);
    if (clean.titles.length === 0 || !clean.description) {
      throw new AiError("The AI's answer was missing titles or a description. Try again.");
    }
    if (clean.chapters.length < 3 && shotNumbers.length >= 3) clean.chapters = spread(shotNumbers);
    return NextResponse.json({ ...clean, mock: false } satisfies SeoSuggestions);
  } catch (err) {
    console.error("SEO route failed:", err);
    const e = err instanceof AiError ? err : new AiError("Couldn't write the title and description. Try again.");
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
}
