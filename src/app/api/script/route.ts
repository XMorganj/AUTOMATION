import { NextResponse } from "next/server";
import { AiError, claude, hasKey } from "@/lib/ai";
import { WORDS_PER_MIN } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 180;

function mockScript(title: string, words: number): string {
  const para = (n: number) =>
    `This is placeholder narration ${n} for "${title}". Add ANTHROPIC_API_KEY to your environment file and this will be a real script written for the length you chose. For now it lets you try the editor, the fact check and the image prompts.`;
  const count = Math.max(3, Math.round(words / 40));
  return Array.from({ length: count }, (_, i) => para(i + 1)).join("\n\n");
}

export async function POST(req: Request) {
  let b: { title?: unknown; minutes?: unknown; theme?: unknown; notes?: unknown; current?: unknown; instruction?: unknown };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
  const title = str(b.title, 200).trim();
  const theme = str(b.theme, 300).trim();
  const notes = str(b.notes, 600).trim();
  const current = str(b.current, 40_000).trim();
  const instruction = str(b.instruction, 600).trim();
  const minutes = typeof b.minutes === "number" && b.minutes >= 1 && b.minutes <= 60 ? b.minutes : 10;

  if (!title) return NextResponse.json({ error: "Pick a video title first." }, { status: 400 });

  const words = Math.round(minutes * WORDS_PER_MIN);

  if (!hasKey()) return NextResponse.json({ script: mockScript(title, words), mock: true });

  const rules = `Rules for the narration:
- Plain spoken narration only: no headings, no markdown, no bullet points, no stage directions, no "[music]" or "Scene 1" labels, no speaker names.
- Short paragraphs separated by a blank line. Short, clear sentences that sound natural read aloud by a text-to-speech voice.
- Open with a hook in the first two sentences that makes the viewer want to keep watching. Never open with "Hey guys", "Welcome back" or a greeting.
- Build the story in a clear order with a payoff at the end. Close with one strong final line.
- Only state facts you are confident are true. Do not invent statistics, quotes, dates or sources. When unsure, speak in general terms instead.
- Return ONLY the narration text.`;

  const prompt = instruction && current
    ? `You are editing the narration script for a YouTube video titled "${title}".

Current script:
"""
${current}
"""

Edit instruction from the creator: ${instruction}

Apply the instruction and return the full revised script. Keep it close to ${words} words (about ${minutes} minutes) unless the instruction says otherwise. Keep everything the instruction does not mention as it is.

${rules}`
    : `Write the full narration script for a YouTube video titled "${title}".

Length: about ${words} words (roughly ${minutes} minutes spoken at a natural pace). Stay within 10% of that.
${theme ? `Topic or niche: ${theme}\n` : ""}${notes ? `Tone and style notes from the creator: ${notes}\n` : ""}
${rules}`;

  try {
    const text = await claude(prompt, Math.min(16_000, Math.round(words * 1.8) + 600));
    return NextResponse.json({ script: text.trim(), mock: false });
  } catch (err) {
    const e = err instanceof AiError ? err : new AiError("Couldn't write the script. Try again.");
    console.error("script route failed", err);
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
}
