import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { dataRoot } from "./storage";

/**
 * A small ledger of AI usage, kept in data/usage.json, grouped by month and provider.
 * It only counts what the AI services report back (tokens), so it never has to guess. Recording is best effort:
 * a failure here must never break a video.
 */

export interface ProviderUsage {
  calls: number;
  inputTokens: number;
  outputTokens: number;
}
export type Ledger = Record<string, Record<string, ProviderUsage>>; // month ("2026-10") -> provider -> usage

const file = () => path.join(dataRoot(), "usage.json");
const month = (d = new Date()) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

// one write at a time, so two calls finishing together don't overwrite each other
const g = globalThis as unknown as { __usageChain?: Promise<unknown> };

export async function readLedger(): Promise<Ledger> {
  try {
    return JSON.parse(await fs.readFile(file(), "utf8")) as Ledger;
  } catch {
    return {};
  }
}

export function recordUsage(provider: string, inputTokens: number, outputTokens: number): void {
  const add = async () => {
    try {
      const ledger = await readLedger();
      const m = (ledger[month()] ??= {});
      const p = (m[provider] ??= { calls: 0, inputTokens: 0, outputTokens: 0 });
      p.calls += 1;
      p.inputTokens += Math.max(0, Math.round(inputTokens) || 0);
      p.outputTokens += Math.max(0, Math.round(outputTokens) || 0);
      await fs.mkdir(path.dirname(file()), { recursive: true });
      const tmp = `${file()}.tmp-${process.pid}`;
      await fs.writeFile(tmp, JSON.stringify(ledger));
      await fs.rename(tmp, file());
    } catch {
      /* best effort */
    }
  };
  g.__usageChain = (g.__usageChain ?? Promise.resolve()).then(add, add);
}

/** Dollar cost for this month's Claude use, only when the person has told us the rates (per million tokens). */
export function claudeCost(u: ProviderUsage | undefined): number | null {
  const inRate = Number(process.env.ANTHROPIC_INPUT_USD_PER_MTOK);
  const outRate = Number(process.env.ANTHROPIC_OUTPUT_USD_PER_MTOK);
  if (!u || !(inRate > 0) || !(outRate > 0)) return null;
  return (u.inputTokens / 1e6) * inRate + (u.outputTokens / 1e6) * outRate;
}

export const currentMonth = month;
