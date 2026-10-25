import { NextResponse } from "next/server";
import { activeProvider, hasKey } from "@/lib/ai";
import { hasElevenKey } from "@/lib/elevenlabs";
import { ffmpegAvailable } from "@/lib/ffmpeg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** What this deployment is set up to do. Only yes/no answers, never a key. */
export async function GET() {
  const provider = activeProvider();
  return NextResponse.json({
    ai: { provider, ready: hasKey() },
    voice: { ready: hasElevenKey() },
    render: { ready: await ffmpegAvailable().catch(() => false) },
    upload: { ready: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) },
  });
}
