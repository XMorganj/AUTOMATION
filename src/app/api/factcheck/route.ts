import { NextResponse } from "next/server";
import { AiError, extractJson, generateAIContent, hasKey } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 180;

interface RawClaim {
  quote?: unknown;
  verdict?: unknown;
  note?: unknown;
  fix?: unknown;
}

export async function POST(req: Request) {
  let b: { title?: unknown; script?: unknown };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const title = typeof b.title === "string" ? b.title.slice(0, 200) : "";
  const script = typeof b.script === "string" ? b.script.slice(0, 40_000).trim() : "";
  if (script.length < 40) return NextResponse.json({ error: "Write or generate a script first." }, { status: 400 });

  if (!hasKey()) {
    // Demo result so the screen can be tried without a key. Quotes the script's first sentence.
    const first = script.match(/[^.!?\n]+[.!?]/)?.[0]?.trim() ?? script.slice(0, 80);
    return NextResponse.json({
      mock: true,
      summary: "Demo result. Add ANTHROPIC_API_KEY for a real fact check.",
      correctCount: 0,
      claims: [
        {
          id: "demo-1",
          quote: first,
          verdict: "check",
          note: "Sample finding to show how this screen works.",
          fix: "",
        },
      ],
    });
  }

  const prompt = `You are a careful fact-checker reviewing a YouTube narration script before it is published. Video title: "${title}".

Script:
"""
${script}
"""

Find every concrete, checkable factual claim (names, dates, numbers, quotes, events, scientific or historical statements, scripture references). Judge each from what you reliably know:
- "correct": you are confident it is accurate. Do NOT list these. Just count them.
- "check": plausible but you cannot fully confirm it, or it is oversimplified, or it is contested.
- "wrong": you are confident it is inaccurate.

For each "check" or "wrong" claim give:
- "quote": the exact words from the script, copied verbatim, one sentence or less (under 200 characters). It must appear in the script exactly as written.
- "verdict": "check" or "wrong".
- "note": one or two sentences explaining the problem.
- "fix": a replacement for the quote that is accurate and keeps the same tone and roughly the same length. Empty string if the claim should simply be verified rather than changed.

Be honest about limits: you have no internet access, so flag anything you are not sure about as "check" rather than guessing.

Return ONLY a JSON object, no prose, no code fences:
{"summary": "<one or two sentence overall verdict>", "correctCount": <integer>, "claims": [{"quote": "...", "verdict": "check", "note": "...", "fix": "..."}]}`;

  try {
    const text = await generateAIContent({ prompt, maxTokens: 6000 });
    const raw = extractJson<{ summary?: unknown; correctCount?: unknown; claims?: unknown }>(text);
    const claims = (Array.isArray(raw.claims) ? (raw.claims as RawClaim[]) : [])
      .filter(
        (c) =>
          typeof c.quote === "string" &&
          c.quote.trim() &&
          (c.verdict === "check" || c.verdict === "wrong") &&
          typeof c.note === "string",
      )
      .map((c, i) => ({
        id: `c${i + 1}`,
        quote: (c.quote as string).trim(),
        verdict: c.verdict as "check" | "wrong",
        note: c.note as string,
        // a fix is only offered if the quote can actually be found in the script to replace
        fix: typeof c.fix === "string" && script.includes((c.quote as string).trim()) ? c.fix : "",
      }));

    return NextResponse.json({
      mock: false,
      summary: typeof raw.summary === "string" ? raw.summary : "",
      correctCount: typeof raw.correctCount === "number" && raw.correctCount >= 0 ? Math.round(raw.correctCount) : 0,
      claims,
    });
  } catch (err) {
    const e = err instanceof AiError ? err : new AiError("Couldn't run the fact check. Try again.");
    console.error("factcheck route failed", err);
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
}
