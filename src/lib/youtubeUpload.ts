import "server-only";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { outputPath } from "./render";
import { videoDir } from "./storage";
import { readThumb } from "./thumbStorage";
import { accessToken, apiBase, apiError, connection, isConfigured, YtError } from "./youtube";
import { DESCRIPTION_BYTES, TAG_CHARS, TITLE_LIMIT, type UploadJob, type UploadOptions, type UploadRequest, type UploadState } from "./uploadShared";

/**
 * Sends the rendered MP4 to YouTube with the resumable upload protocol, in 8 MB pieces. If the connection drops,
 * it asks YouTube how much arrived and carries on from there, so a long upload never starts over.
 * One upload runs at a time. The job record lives next to the video, so a page reload (or a restarted server) can still
 * show what happened and resume.
 */

const CHUNK = 8 * 1024 * 1024; // must be a multiple of 256 KiB
const TRIES = 5;

interface Live {
  job: UploadJob;
  abort: AbortController;
  canceled: boolean;
}

const g = globalThis as unknown as { __uploads?: Map<string, Live> };
const live = (g.__uploads ??= new Map<string, Live>());

const dir = (id: string) => path.join(videoDir(id), "upload");
const jobFile = (id: string) => path.join(dir(id), "job.json");
const sessionFile = (id: string) => path.join(dir(id), "session.txt");

async function readJson<T>(f: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(f, "utf8")) as T;
  } catch {
    return null;
  }
}
const saveJob = (id: string, job: UploadJob) => fs.mkdir(dir(id), { recursive: true }).then(() => fs.writeFile(jobFile(id), JSON.stringify(job)));
const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => (clearTimeout(t), resolve()), { once: true });
  });

export const anyUploadRunning = () => [...live.values()].some((l) => l.job.status === "running");

export async function uploadState(videoId: string): Promise<UploadState> {
  const [conn, vstat, thumb] = await Promise.all([
    connection(),
    fs.stat(outputPath(videoId)).catch(() => null),
    readThumb(videoId),
  ]);
  let job = live.get(videoId)?.job ?? (await readJson<UploadJob>(jobFile(videoId)));
  if (job && job.status === "running" && !live.has(videoId)) {
    // the server restarted mid-upload
    const session = await fs.readFile(sessionFile(videoId), "utf8").catch(() => "");
    job = { ...job, status: "failed", error: "The upload was interrupted. Press Upload to carry on from where it stopped.", resumable: Boolean(session) };
  }
  return {
    configured: isConfigured(),
    connected: conn.connected,
    channel: conn.channel,
    job,
    video: { exists: Boolean(vstat), bytes: vstat?.size ?? 0 },
    thumbnail: { exists: Boolean(thumb), bytes: thumb?.data.length ?? 0 },
  };
}

/** Check an untrusted request from the browser. */
export function parseRequest(raw: unknown): { ok: true; req: UploadRequest } | { ok: false; error: string } {
  const b = (raw ?? {}) as Record<string, unknown>;
  const title = typeof b.title === "string" ? b.title.replace(/[<>]/g, "").replace(/\s+/g, " ").trim() : "";
  const description = typeof b.description === "string" ? b.description.replace(/[<>]/g, "").trim() : "";
  const tags = Array.isArray(b.tags) ? b.tags.filter((t): t is string => typeof t === "string").map((t) => t.replace(/[<>,]/g, "").trim()).filter(Boolean) : [];
  const o = (b.options ?? {}) as Record<string, unknown>;

  if (!title) return { ok: false, error: "The video needs a title." };
  if (title.length > TITLE_LIMIT) return { ok: false, error: `The title is ${title.length} characters; YouTube allows ${TITLE_LIMIT}.` };
  if (Buffer.byteLength(description) > DESCRIPTION_BYTES) return { ok: false, error: `The description is too long; YouTube allows ${DESCRIPTION_BYTES} bytes.` };
  const tagChars = tags.reduce((n, t) => n + t.length + (t.includes(" ") ? 2 : 0), 0) + Math.max(0, tags.length - 1);
  if (tagChars > TAG_CHARS) return { ok: false, error: `The tags are ${tagChars} characters; YouTube allows ${TAG_CHARS}.` };

  const privacy = o.privacy === "public" || o.privacy === "unlisted" || o.privacy === "private" ? o.privacy : null;
  if (!privacy) return { ok: false, error: "Choose private, unlisted or public." };
  let publishAt: string | undefined;
  if (typeof o.publishAt === "string" && o.publishAt) {
    const t = Date.parse(o.publishAt);
    if (!Number.isFinite(t)) return { ok: false, error: "The scheduled time isn't a valid date." };
    if (privacy !== "private") return { ok: false, error: "A scheduled video is uploaded as private and goes public at the time you pick." };
    if (t < Date.now() + 5 * 60_000) return { ok: false, error: "Pick a time at least 5 minutes from now." };
    publishAt = new Date(t).toISOString();
  }
  const categoryId = typeof o.categoryId === "string" && /^\d{1,3}$/.test(o.categoryId) ? o.categoryId : "22";
  const options: UploadOptions = {
    privacy,
    publishAt,
    categoryId,
    madeForKids: o.madeForKids === true,
    aiDisclosure: o.aiDisclosure !== false,
  };
  return { ok: true, req: { title, description, tags, options, again: b.again === true } };
}

export async function startUpload(videoId: string, req: UploadRequest): Promise<{ ok: true; job: UploadJob } | { ok: false; status: number; error: string }> {
  if (!isConfigured()) return { ok: false, status: 503, error: "Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET first." };
  const conn = await connection();
  if (!conn.connected) return { ok: false, status: 401, error: "Connect YouTube first." };
  if (anyUploadRunning()) return { ok: false, status: 409, error: "Another upload is running. Wait for it to finish." };

  const stat = await fs.stat(outputPath(videoId)).catch(() => null);
  if (!stat || stat.size === 0) return { ok: false, status: 409, error: "There's no rendered video yet. Render it first." };

  const prev = await readJson<UploadJob>(jobFile(videoId));
  if (prev?.status === "done" && !req.again) {
    return { ok: false, status: 409, error: "This video was already uploaded. Confirm to upload it again." };
  }
  // carry on an interrupted upload only if it was the same file
  let session = "";
  if (prev && prev.status !== "done" && prev.total === stat.size) session = await fs.readFile(sessionFile(videoId), "utf8").catch(() => "");
  if (!session) await fs.rm(sessionFile(videoId), { force: true });

  const job: UploadJob = {
    id: randomUUID(),
    status: "running",
    phase: session ? "Resuming" : "Starting",
    sent: 0,
    total: stat.size,
    startedAt: Date.now(),
    options: req.options,
    title: req.title,
  };
  const entry: Live = { job, abort: new AbortController(), canceled: false };
  live.set(videoId, entry);
  await saveJob(videoId, job);
  void run(videoId, req, entry).catch(() => {});
  return { ok: true, job };
}

export async function cancelUpload(videoId: string): Promise<boolean> {
  const l = live.get(videoId);
  if (!l || l.job.status !== "running") return false;
  l.canceled = true;
  l.abort.abort();
  return true;
}

/** Forget a finished or failed record (so the screen goes back to ready) without touching YouTube. */
export async function clearUpload(videoId: string) {
  if (live.get(videoId)?.job.status === "running") return;
  live.delete(videoId);
  await fs.rm(dir(videoId), { recursive: true, force: true });
}

async function run(videoId: string, req: UploadRequest, entry: Live) {
  const { job } = entry;
  const save = () => saveJob(videoId, job).catch(() => {});
  const file = outputPath(videoId);
  let fh: fs.FileHandle | null = null;
  try {
    fh = await fs.open(file, "r");
    let token = await accessToken();
    let session = await fs.readFile(sessionFile(videoId), "utf8").catch(() => "");
    let offset = 0;

    if (!session) {
      job.phase = "Starting the upload";
      await save();
      session = await initSession(token, req, job.total, entry.abort.signal);
      await fs.mkdir(dir(videoId), { recursive: true });
      await fs.writeFile(sessionFile(videoId), session);
    }

    let result: { id: string; privacy: string } | null = null;
    const buf = Buffer.alloc(CHUNK);
    let failures = 0;
    // first, ask where the upload stands (a no-op on a new session)
    try {
      const probe = await queryOffset(session, job.total, token, entry.abort.signal);
      if (probe.done) result = probe.done;
      else offset = probe.offset;
    } catch (err) {
      // the saved upload address has expired: begin a fresh upload
      if (err instanceof YtError && err.status === 410) {
        session = await initSession(token, req, job.total, entry.abort.signal);
        await fs.writeFile(sessionFile(videoId), session);
        offset = 0;
      } else if (entry.canceled) throw err;
    }

    while (!result) {
      if (entry.canceled) throw new YtError("Canceled.", 499, "canceled");
      job.sent = offset;
      job.phase = "Uploading";
      job.resumable = true;
      await save();
      const { bytesRead } = await fh.read(buf, 0, Math.min(CHUNK, job.total - offset), offset);
      if (bytesRead <= 0) throw new YtError("The rendered video file changed during the upload. Start again.", 409);
      const end = offset + bytesRead - 1;
      try {
        const res = await fetch(session, {
          method: "PUT",
          headers: {
            authorization: `Bearer ${token}`,
            "content-length": String(bytesRead),
            "content-range": `bytes ${offset}-${end}/${job.total}`,
            "content-type": "video/mp4",
          },
          body: new Uint8Array(buf.subarray(0, bytesRead)),
          signal: entry.abort.signal,
        });
        if (res.status === 308) {
          const range = /bytes=0-(\d+)/.exec(res.headers.get("range") ?? "");
          offset = range ? Number(range[1]) + 1 : 0;
          failures = 0;
          continue;
        }
        if (res.status === 200 || res.status === 201) {
          const j = (await res.json().catch(() => null)) as { id?: string; status?: { privacyStatus?: string } } | null;
          if (!j?.id) throw new YtError("YouTube accepted the upload but didn't return a video id.");
          result = { id: j.id, privacy: j.status?.privacyStatus ?? req.options.privacy };
          break;
        }
        if (res.status === 401) {
          token = await accessToken(true);
          continue;
        }
        if (res.status >= 500 || res.status === 429) throw new RetryError(`YouTube returned ${res.status}`);
        throw await apiError(res, "uploading the video");
      } catch (err) {
        if (entry.canceled) throw new YtError("Canceled.", 499, "canceled");
        if (!(err instanceof RetryError) && !(err instanceof TypeError) && !(err instanceof DOMException)) throw err;
        if (++failures >= TRIES) throw new YtError("The connection to YouTube kept dropping. Press Upload to resume from where it stopped.", 502, "network");
        job.phase = `Connection dropped, retrying (${failures}/${TRIES - 1})`;
        await save();
        await sleep(1000 * 2 ** (failures - 1), entry.abort.signal);
        token = await accessToken().catch(() => token);
        const q = await queryOffset(session, job.total, token, entry.abort.signal).catch(() => null);
        if (q?.done) result = q.done;
        else if (q) offset = q.offset;
      }
    }

    job.sent = job.total;
    job.youtubeId = result.id;
    job.privacy = result.privacy;
    await fs.rm(sessionFile(videoId), { force: true });

    // thumbnail: a failure here doesn't undo the upload
    const thumb = await readThumb(videoId);
    if (!thumb) job.thumbnail = "skipped";
    else {
      job.phase = "Setting the thumbnail";
      await save();
      try {
        const r = await fetch(`${apiBase()}/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(result.id)}&uploadType=media`, {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "content-type": "image/jpeg", "content-length": String(thumb.data.length) },
          body: new Uint8Array(thumb.data),
          signal: AbortSignal.timeout(60_000),
        });
        if (r.ok) job.thumbnail = "set";
        else {
          job.thumbnail = "failed";
          const e = await apiError(r, "setting the thumbnail");
          job.thumbnailError = /forbidden|permission/i.test(e.message) || e.reason === "forbidden"
            ? "YouTube won't take custom thumbnails until the channel is verified (youtube.com/verify). Set it in YouTube Studio."
            : e.message;
        }
      } catch {
        job.thumbnail = "failed";
        job.thumbnailError = "The thumbnail didn't upload. Set it in YouTube Studio.";
      }
    }

    job.status = "done";
    job.phase = "Uploaded";
    job.finishedAt = Date.now();
    job.resumable = false;
    await save();
  } catch (err) {
    const e = err instanceof YtError ? err : new YtError("The upload failed. Try again.");
    if (!(err instanceof YtError)) console.error("upload failed", err);
    job.status = entry.canceled ? "canceled" : "failed";
    job.error = entry.canceled ? undefined : e.message;
    job.phase = entry.canceled ? "Canceled" : "Failed";
    job.finishedAt = Date.now();
    job.resumable = (await fs.readFile(sessionFile(videoId), "utf8").catch(() => "")) !== "" && e.reason !== "invalid_grant";
    await save();
  } finally {
    await fh?.close().catch(() => {});
    // keep the finished record in memory so polling sees it, but allow a new run
    live.set(videoId, entry);
  }
}

class RetryError extends Error {}

async function initSession(token: string, req: UploadRequest, total: number, signal: AbortSignal): Promise<string> {
  const { options: o } = req;
  const status: Record<string, unknown> = {
    privacyStatus: o.publishAt ? "private" : o.privacy,
    selfDeclaredMadeForKids: o.madeForKids,
    containsSyntheticMedia: o.aiDisclosure,
  };
  if (o.publishAt) status.publishAt = o.publishAt;
  const res = await fetch(`${apiBase()}/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json; charset=UTF-8",
      "x-upload-content-length": String(total),
      "x-upload-content-type": "video/mp4",
    },
    body: JSON.stringify({
      snippet: { title: req.title, description: req.description, tags: req.tags, categoryId: o.categoryId },
      status,
    }),
    signal,
  });
  if (!res.ok) throw await apiError(res, "starting the upload");
  const loc = res.headers.get("location");
  if (!loc) throw new YtError("YouTube didn't return an upload address.");
  return loc;
}

/** Ask YouTube how many bytes of this upload it already has. */
async function queryOffset(session: string, total: number, token: string, signal: AbortSignal): Promise<{ offset: number; done?: { id: string; privacy: string } }> {
  const res = await fetch(session, {
    method: "PUT",
    headers: { authorization: `Bearer ${token}`, "content-length": "0", "content-range": `bytes */${total}` },
    signal,
  });
  if (res.status === 308) {
    const range = /bytes=0-(\d+)/.exec(res.headers.get("range") ?? "");
    return { offset: range ? Number(range[1]) + 1 : 0 };
  }
  if (res.status === 200 || res.status === 201) {
    const j = (await res.json().catch(() => null)) as { id?: string; status?: { privacyStatus?: string } } | null;
    if (j?.id) return { offset: total, done: { id: j.id, privacy: j.status?.privacyStatus ?? "private" } };
  }
  if (res.status === 404 || res.status === 410) throw new YtError("The saved upload expired. Start the upload again.", 410);
  throw new RetryError(`status ${res.status}`);
}
