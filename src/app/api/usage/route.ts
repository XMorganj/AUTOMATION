import { NextResponse } from "next/server";
import { hasElevenKey, getUsage } from "@/lib/elevenlabs";
import { claudeCost, currentMonth, readLedger } from "@/lib/usage";
import type { Usage } from "@/lib/voiceShared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface UsageReport {
  month: string;
  ai: { provider: string; calls: number; inputTokens: number; outputTokens: number; costUsd: number | null }[];
  voice: { configured: boolean; usage: Usage | null };
}

/** This month's AI use (from what the services reported) and the ElevenLabs credit balance. */
export async function GET() {
  const month = currentMonth();
  const ledger = (await readLedger())[month] ?? {};
  const voice = hasElevenKey() ? await getUsage(true).catch(() => null) : null;
  const body: UsageReport = {
    month,
    ai: Object.entries(ledger).map(([provider, u]) => ({
      provider,
      ...u,
      costUsd: provider === "anthropic" ? claudeCost(u) : 0,
    })),
    voice: { configured: hasElevenKey(), usage: voice },
  };
  return NextResponse.json(body, { headers: { "cache-control": "no-store" } });
}
