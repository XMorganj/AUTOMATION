import "server-only";
import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { dataRoot } from "./storage";

/**
 * Google sign-in for one channel owner. The refresh token is kept in a file on the server (data/youtube/tokens.json),
 * never sent to the browser. The Google keys come from GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.
 * The URLs can be overridden (GOOGLE_AUTH_URL, GOOGLE_TOKEN_URL, GOOGLE_API_BASE) so tests can use a fake Google.
 */

export class YtError extends Error {
  constructor(
    message: string,
    public status = 502,
    public reason = "",
  ) {
    super(message);
  }
}

const authUrl = () => process.env.GOOGLE_AUTH_URL || "https://accounts.google.com/o/oauth2/v2/auth";
const tokenUrl = () => process.env.GOOGLE_TOKEN_URL || "https://oauth2.googleapis.com/token";
export const apiBase = () => (process.env.GOOGLE_API_BASE || "https://www.googleapis.com").replace(/\/$/, "");
const SCOPES = ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"];

export const isConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

/** The address Google sends the person back to. Must match one registered in Google Cloud exactly. */
export function redirectUri(req: Request): string {
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;
  const url = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim() || url.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host")?.split(",")[0].trim() || req.headers.get("host") || url.host;
  return `${proto}://${host}/api/youtube/callback`;
}

interface Tokens {
  refresh_token: string;
  access_token?: string;
  expires_at?: number;
  channel?: { id: string; title: string };
}

const file = () => path.join(dataRoot(), "youtube", "tokens.json");

async function readTokens(): Promise<Tokens | null> {
  try {
    const t = JSON.parse(await fs.readFile(file(), "utf8")) as Tokens;
    return t.refresh_token ? t : null;
  } catch {
    return null;
  }
}

async function writeTokens(t: Tokens) {
  await fs.mkdir(path.dirname(file()), { recursive: true });
  const tmp = `${file()}.tmp-${process.pid}`;
  await fs.writeFile(tmp, JSON.stringify(t), { mode: 0o600 });
  await fs.rename(tmp, file());
}

export async function disconnect() {
  await fs.rm(file(), { force: true });
}

export const newState = () => randomBytes(16).toString("hex");

export function buildAuthUrl(state: string, redirect: string): string {
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: redirect,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    // always ask, so Google hands back a refresh token even if this app was approved before
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${authUrl()}?${q}`;
}

async function tokenCall(body: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(tokenUrl(), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID ?? "", client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "", ...body }),
    signal: AbortSignal.timeout(30_000),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const code = typeof json.error === "string" ? json.error : "";
    if (code === "invalid_grant") throw new YtError("Google no longer accepts the saved sign-in. Connect YouTube again.", 401, "invalid_grant");
    if (code === "invalid_client" || code === "unauthorized_client") {
      throw new YtError("Google rejected the client ID or secret. Check GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.", 500, code);
    }
    if (code === "redirect_uri_mismatch") throw new YtError("The redirect address isn't registered in Google Cloud.", 400, code);
    throw new YtError(`Google sign-in failed${code ? ` (${code})` : ""}.`, 502, code);
  }
  return json;
}

/** Finish sign-in: trade the one-time code for tokens, look up the channel, save. */
export async function connectWithCode(code: string, redirect: string) {
  const j = await tokenCall({ grant_type: "authorization_code", code, redirect_uri: redirect });
  const refresh = typeof j.refresh_token === "string" ? j.refresh_token : null;
  const access = typeof j.access_token === "string" ? j.access_token : null;
  if (!access) throw new YtError("Google didn't return an access token.");
  const prev = await readTokens();
  const refreshToken = refresh ?? prev?.refresh_token;
  if (!refreshToken) throw new YtError("Google didn't give a long-lived sign-in. Remove MA Studio at myaccount.google.com/permissions and connect again.");
  const channel = await fetchChannel(access);
  await writeTokens({
    refresh_token: refreshToken,
    access_token: access,
    expires_at: Date.now() + (Number(j.expires_in) || 3600) * 1000,
    channel: channel ?? undefined,
  });
  return channel;
}

/** A valid access token, refreshed when it is about to expire. */
export async function accessToken(force = false): Promise<string> {
  const t = await readTokens();
  if (!t) throw new YtError("YouTube isn't connected yet.", 401, "not_connected");
  if (!force && t.access_token && t.expires_at && t.expires_at - Date.now() > 60_000) return t.access_token;
  try {
    const j = await tokenCall({ grant_type: "refresh_token", refresh_token: t.refresh_token });
    const access = String(j.access_token ?? "");
    if (!access) throw new YtError("Google didn't return an access token.");
    await writeTokens({ ...t, access_token: access, expires_at: Date.now() + (Number(j.expires_in) || 3600) * 1000 });
    return access;
  } catch (err) {
    if (err instanceof YtError && err.reason === "invalid_grant") await disconnect();
    throw err;
  }
}

export async function fetchChannel(token: string): Promise<{ id: string; title: string } | null> {
  const res = await fetch(`${apiBase()}/youtube/v3/channels?part=snippet&mine=true`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) return null;
  const j = (await res.json().catch(() => null)) as { items?: { id: string; snippet?: { title?: string } }[] } | null;
  const c = j?.items?.[0];
  return c ? { id: c.id, title: c.snippet?.title ?? "Your channel" } : null;
}

export async function connection(): Promise<{ connected: boolean; channel: { id: string; title: string } | null }> {
  const t = await readTokens();
  return { connected: Boolean(t), channel: t?.channel ?? null };
}

/** Turn a Google API error body into something a person can act on. */
export async function apiError(res: Response, what: string): Promise<YtError> {
  const j = (await res.json().catch(() => null)) as { error?: { message?: string; errors?: { reason?: string }[] } } | null;
  const reason = j?.error?.errors?.[0]?.reason ?? "";
  const raw = j?.error?.message ?? "";
  if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") return new YtError("This Google project has used up its YouTube quota for today. Try again tomorrow.", 429, reason);
  if (reason === "uploadLimitExceeded") return new YtError("Your channel has hit YouTube's upload limit for now. Try again later.", 429, reason);
  if (reason === "youtubeSignupRequired" || reason === "channelNotFound") return new YtError("That Google account has no YouTube channel yet.", 403, reason);
  if (reason === "forbidden" || reason === "insufficientPermissions") return new YtError(`YouTube refused this (${what}). Disconnect and connect again, and allow every permission.`, 403, reason);
  if (reason === "invalidTags" || reason === "invalidTitle" || reason === "invalidDescription") return new YtError(`YouTube didn't accept the ${reason.replace("invalid", "").toLowerCase()}: ${raw}`, 400, reason);
  if (res.status === 401) return new YtError("YouTube sign-in expired. Connect YouTube again.", 401, "unauthorized");
  return new YtError(`YouTube returned ${res.status} while ${what}${raw ? `: ${raw}` : ""}.`, 502, reason);
}
