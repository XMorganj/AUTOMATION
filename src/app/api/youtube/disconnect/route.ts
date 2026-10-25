import { NextResponse } from "next/server";
import { disconnect } from "@/lib/youtube";

export const runtime = "nodejs";

export async function POST() {
  await disconnect();
  return NextResponse.json({ ok: true });
}
