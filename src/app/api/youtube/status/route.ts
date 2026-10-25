import { NextResponse } from "next/server";
import { connection, isConfigured, redirectUri } from "@/lib/youtube";
import type { YoutubeStatus } from "@/lib/uploadShared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Whether the Google keys are set and a channel is connected. Never returns a token. */
export async function GET(req: Request) {
  const c = await connection();
  const body: YoutubeStatus = { configured: isConfigured(), connected: c.connected, channel: c.channel, redirectUri: redirectUri(req) };
  return NextResponse.json(body, { headers: { "cache-control": "no-store" } });
}
