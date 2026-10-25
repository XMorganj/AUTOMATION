import { NextResponse } from "next/server";
import { connectWithCode, redirectUri, YtError } from "@/lib/youtube";

export const runtime = "nodejs";

/** Google sends the person back here with a one-time code. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const cookies = req.headers.get("cookie") ?? "";
  const get = (n: string) => decodeURIComponent(new RegExp(`(?:^|; )${n}=([^;]*)`).exec(cookies)?.[1] ?? "");
  const stored = get("mas_yt_state");
  const rawReturn = get("mas_yt_return") || "/";
  const returnTo = rawReturn.startsWith("/") && !rawReturn.startsWith("//") ? rawReturn : "/";
  const base = redirectUri(req).replace(/\/api\/youtube\/callback$/, "");

  const done = (ok: boolean, msg?: string) => {
    const q = ok ? "yt=connected" : `yt=error&msg=${encodeURIComponent(msg ?? "Couldn't connect YouTube.")}`;
    const res = NextResponse.redirect(`${base}${returnTo}${returnTo.includes("?") ? "&" : "?"}${q}`);
    res.cookies.set("mas_yt_state", "", { path: "/api/youtube", maxAge: 0 });
    res.cookies.set("mas_yt_return", "", { path: "/api/youtube", maxAge: 0 });
    return res;
  };

  const err = url.searchParams.get("error");
  if (err) return done(false, err === "access_denied" ? "You cancelled the Google sign-in." : `Google said: ${err}`);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || !stored || state !== stored) return done(false, "That sign-in link didn't match. Press Connect YouTube again.");

  try {
    await connectWithCode(code, redirectUri(req));
    return done(true);
  } catch (e) {
    return done(false, e instanceof YtError ? e.message : "Couldn't connect YouTube.");
  }
}
