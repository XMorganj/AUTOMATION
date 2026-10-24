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
