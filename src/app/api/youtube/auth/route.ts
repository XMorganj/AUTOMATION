import { NextResponse } from "next/server";
import { buildAuthUrl, isConfigured, newState, redirectUri } from "@/lib/youtube";

export const runtime = "nodejs";

/** Send the person to Google's consent screen. A random state value, kept in a cookie, proves the answer is ours. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = url.searchParams.get("returnTo") ?? "/";
  // only ever go back to a path on this site
  const returnTo = back.startsWith("/") && !back.startsWith("//") && !back.includes("\\") ? back : "/";
  if (!isConfigured()) {
    return NextResponse.redirect(new URL(`${returnTo}${returnTo.includes("?") ? "&" : "?"}yt=error&msg=${encodeURIComponent("Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET first.")}`, redirectUri(req)));
  }
  const state = newState();
  const res = NextResponse.redirect(buildAuthUrl(state, redirectUri(req)));
  const opts = { httpOnly: true, sameSite: "lax" as const, secure: redirectUri(req).startsWith("https:"), path: "/api/youtube", maxAge: 600 };
  res.cookies.set("mas_yt_state", state, opts);
  res.cookies.set("mas_yt_return", returnTo, opts);
  return res;
}
