import { NextResponse } from "next/server";
import {
  AiError,
  generateAIContent,
  extractJson,
  hasKey,
} from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 180;

interface RawClaim {
  quote?: unknown;
  verdict?: unknown;
  note?: unknown;
  fix?: unknown;
}

interface FactCheckResult {
  summary?: unknown;
  correctCount?: unknown;
  claims?: unknown;
}

export async function POST(req: Request) {
  let b: { title?: unknown; script?: unknown };

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

  const script =
    typeof b.script === "string"
      ? b.script.slice(0, 40_000).trim()
      : "";

  if (script.length < 40) {
    return NextResponse.json(
      { error: "Write or generate a script first." },
      { status: 400 }
    );
  }

  if (!hasKey()) {
    return NextResponse.json(
      {
        error:
          "Ollama is not configured. Set OLLAMA_BASE_URL in Render.",
      },
      { status: 503 }
    );
  }

  const prompt = `
You are a careful fact-checker reviewing a YouTube narration
script before it is published.

Video title: "${title}"

Script:
"""
${script}
"""

Find every concrete, checkable factual claim, including:
- Names
- Dates
- Numbers
- Quotes
- Historical events
- Scientific statements
- Scripture references

Classify each claim:

"correct":
You are confident the claim is accurate.
Do not list these claims. Only count them.

"check":
The claim is plausible but cannot be fully confirmed,
is oversimplified, or is contested.

"wrong":
You are confident the claim is inaccurate.

For each "check" or "wrong" claim provide:

"quote":
Exact words copied from the script.
Maximum 200 characters.

"verdict":
Either "check" or "wrong".

"note":
One or two sentences explaining the issue.

"fix":
An accurate replacement that preserves the original tone.
Use an empty string if verification is required.

IMPORTANT:
You have no internet access.
Never invent evidence or sources.
If uncertain, classify the claim as "check".

Return ONLY valid JSON.

Expected format:

{
  "summary": "Overall verdict",
  "correctCount": 0,
  "claims": [
    {
      "quote": "Exact claim",
      "verdict": "check",
      "note": "Explanation",
      "fix": "Suggested correction"
    }
  ]
}
`;

  try {
    const text = await generateAIContent({
      prompt,
      systemPrompt:
        "You are an expert historical and scientific fact-checker. Return only valid JSON.",
      maxTokens: 6000,
    });

    const raw = extractJson<FactCheckResult>(text);

    const claims = (
      Array.isArray(raw.claims)
        ? (raw.claims as RawClaim[])
        : []
    )
      .filter(
        (c) =>
          typeof c.quote === "string" &&
          c.quote.trim() &&
          (c.verdict === "check" ||
            c.verdict === "wrong") &&
          typeof c.note === "string"
      )
      .map((c, i) => ({
        id: `c${i + 1}`,
        quote: (c.quote as string).trim(),
        verdict: c.verdict as "check" | "wrong",
        note: c.note as string,
        fix:
          typeof c.fix === "string" &&
          script.includes(
            (c.quote as string).trim()
          )
            ? c.fix
            : "",
      }));

    return NextResponse.json({
      mock: false,
      summary:
        typeof raw.summary === "string"
          ? raw.summary
          : "",
      correctCount:
        typeof raw.correctCount === "number" &&
        raw.correctCount >= 0
          ? Math.round(raw.correctCount)
          : 0,
      claims,
    });
  } catch (err) {
    console.error("Factcheck route failed:", err);

    const e =
      err instanceof AiError
        ? err
        : new AiError(
            "Couldn't run the fact check. Try again."
          );

    return NextResponse.json(
      { error: e.message },
      { status: e.status }
    );
  }
}
