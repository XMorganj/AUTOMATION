import "server-only";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { ChildProcess } from "node:child_process";
import { buildAss, buildOverlayAss } from "./captions";
import { ffmpegAvailable, probeVideo, runFfmpeg } from "./ffmpeg";
import { musicPath, shotAudioForRender } from "./audioStorage";
import { RESOLUTIONS, planTimeline, type ResolvedEdit, type RenderJob, type RenderOutput, type RenderPlan, type RenderState } from "./renderShared";
import { imagePath, videoDir } from "./storage";
import { zoompanExpr } from "./zoompan";

/**
 * Turns a video's shots into one MP4.
 *
 *   per shot:  image -> smooth zoom/pan (zoompan, same easing as the preview) -> captions burned in -> one H.264 clip,
 *              and the shot's narration padded to the clip's exact length as PCM
 *   then:      clips joined without re-encoding; narration + music mixed (music ducks under speech) -> AAC
 *
 * One render runs at a time (FFmpeg already uses the cores), and a render never touches the previous good file
 * until the new one is complete.
 */

const AUDIO_RATE = 48000;
const FONT = process.env.CAPTION_FONT || "Poppins";

interface Live {
  job: RenderJob;
  videoId: string;
  child: ChildProcess | null;
  canceled: boolean;
}

// kept on globalThis so a dev-server reload doesn't lose track of a running render
const g = globalThis as unknown as { __renders?: Map<string, Live> };
const live = (g.__renders ??= new Map<string, Live>());

const renderDir = (videoId: string) => path.join(videoDir(videoId), "render");
const outputFile = (videoId: string) => path.join(renderDir(videoId), "video.mp4");
const writeJson = (file: string, data: unknown) => fs.writeFile(file, JSON.stringify(data));
const readJson = async <T>(file: string): Promise<T | null> => {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
};

export function outputPath(videoId: string) {
  return outputFile(videoId);
}

export function anyRenderRunning(): boolean {
  return [...live.values()].some((l) => l.job.status === "running");
}

export async function renderState(videoId: string): Promise<RenderState> {
  const ffmpeg = await ffmpegAvailable();
  let job = live.get(videoId)?.job ?? (await readJson<RenderJob>(path.join(renderDir(videoId), "job.json")));
  // a job saved as "running" with nothing running it means the app was restarted mid-render
  if (job && job.status === "running" && !live.has(videoId)) {
    job = { ...job, status: "failed", error: "The app restarted while this was rendering. Start it again.", finishedAt: Date.now() };
  }
  let output = await readJson<RenderOutput>(path.join(renderDir(videoId), "output.json"));
  if (output) {
    try {
      await fs.access(outputFile(videoId));
    } catch {
      output = null;
    }
  }
  return { ffmpeg, job, output };
}

export async function cancelRender(videoId: string): Promise<boolean> {
  const l = live.get(videoId);
  if (!l || l.job.status !== "running") return false;
  l.canceled = true;
  l.child?.kill("SIGKILL");
  return true;
}

export async function deleteRender(videoId: string): Promise<void> {
  if (live.get(videoId)?.job.status === "running") return;
  await fs.rm(renderDir(videoId), { recursive: true, force: true });
  live.delete(videoId);
}

/** What a plan needs from disk. Returns the first problem in plain words, or the resolved inputs. */
type Gathered = { shots: ShotInput[]; error?: undefined } | { error: string; shots?: undefined };
interface ShotInput {
  n: number;
  motion: RenderPlan["shots"][number]["motion"];
  edit: ResolvedEdit;
  overlay?: RenderPlan["shots"][number]["overlay"];
  image: string;
  audio: string;
  duration: number;
  words: { w: string; s: number; e: number }[];
}

async function gather(videoId: string, plan: RenderPlan): Promise<Gathered> {
  const missingImages: number[] = [];
  const missingAudio: number[] = [];
  const shots: ShotInput[] = [];
  for (const s of plan.shots) {
    const [image, audio] = await Promise.all([imagePath(videoId, s.n), shotAudioForRender(videoId, s.n)]);
    if (!image) missingImages.push(s.n);
    if (!audio) missingAudio.push(s.n);
    if (image && audio) shots.push({
      n: s.n,
      motion: s.motion,
      edit: { speed: s.speed, hold: s.hold, transition: s.transition, tlen: s.tlen },
      overlay: s.overlay,
      image,
      audio: audio.file,
      duration: audio.duration,
      words: audio.words,
    });
  }
  const list = (a: number[]) => (a.length > 6 ? `${a.slice(0, 6).join(", ")} and ${a.length - 6} more` : a.join(", "));
  if (missingImages.length) return { error: `Shot ${list(missingImages)} ${missingImages.length > 1 ? "have" : "has"} no image yet. Add ${missingImages.length > 1 ? "them" : "it"} in the Images step.` };
  if (missingAudio.length) return { error: `Shot ${list(missingAudio)} ${missingAudio.length > 1 ? "have" : "has"} no narration yet. Generate it in the Voiceover step.` };
  return { shots };
}

export async function startRender(videoId: string, plan: RenderPlan): Promise<{ ok: true; job: RenderJob } | { ok: false; status: number; error: string }> {
  if (!(await ffmpegAvailable())) {
    return { ok: false, status: 503, error: "FFmpeg isn't installed on this computer. Install it (ffmpeg.org), make sure `ffmpeg` runs in a terminal, then restart the app." };
  }
  if (anyRenderRunning()) return { ok: false, status: 409, error: "A render is already running. Wait for it to finish or stop it first." };

  const inputs = await gather(videoId, plan);
  if (inputs.error !== undefined) return { ok: false, status: 400, error: inputs.error };
  const music = plan.music ? ((await musicPath(videoId)) ?? null) : null;

  const job: RenderJob = {
    id: randomUUID(),
    status: "running",
    phase: "Getting ready",
    progress: 0,
    shotsDone: 0,
    shotsTotal: inputs.shots.length,
    startedAt: Date.now(),
  };
  const l: Live = { job, videoId, child: null, canceled: false };
  live.set(videoId, l);
  await fs.mkdir(renderDir(videoId), { recursive: true });
  await writeJson(path.join(renderDir(videoId), "job.json"), job);

  void run(l, plan, inputs.shots, music).catch(() => {});
  return { ok: true, job };
}

/** Remember the running FFmpeg so Stop can kill it; if Stop already happened, kill it straight away. */
function track(l: Live, c: ChildProcess) {
  l.child = c;
  if (l.canceled) c.kill("SIGKILL");
}

async function run(l: Live, plan: RenderPlan, shots: ShotInput[], music: string | null) {
  const { videoId, job } = l;
  const res = RESOLUTIONS.find((r) => r.id === plan.resolution)!;
  const { w, h } = res;
  const fps = plan.fps;
  const root = renderDir(videoId);
  const work = path.join(root, `work-${job.id.slice(0, 8)}`);
  const save = () => writeJson(path.join(root, "job.json"), job).catch(() => {});
  const check = () => {
    if (l.canceled) throw new Error("canceled");
  };

  try {
    await fs.mkdir(work, { recursive: true });

    // length of each clip, in whole frames so audio and video stay locked
    const tl = planTimeline(shots.map((s) => ({ duration: s.duration, edit: s.edit })), fps);
    const plans = shots.map((s, i) => ({
      ...s,
      frames: tl.frames[i],
      outFrames: tl.outFrames[i],
      inOverlap: tl.inOverlap[i],
      outSeconds: tl.outFrames[i] / fps,
    }));
    const totalFrames = tl.totalFrames;
    const totalSeconds = totalFrames / fps;
    const SHOTS_SHARE = 0.9;
    let framesDone = 0;

    // oversample before zooming so slow moves don't shimmer
    const k = plan.resolution === 2160 ? 1.25 : 2;
    const bw = Math.round((w * k) / 2) * 2;
    const bh = Math.round((h * k) / 2) * 2;
    const still = (input: number, frames: number, z: { z: string; x: string; y: string }) =>
      `[${input}:v]scale=${bw}:${bh}:force_original_aspect_ratio=increase:flags=lanczos,crop=${bw}:${bh},` +
      `zoompan=z='${z.z}':x='${z.x}':y='${z.y}':d=${frames}:s=${w}x${h}:fps=${fps},setsar=1,format=yuv420p`;

    const videoList: string[] = [];
    const audioList: string[] = [];

    for (let i = 0; i < plans.length; i++) {
      check();
      const p = plans[i];
      const prev = i > 0 ? plans[i - 1] : null;
      const next = i < plans.length - 1 ? plans[i + 1] : null;
      const tag = String(p.n).padStart(4, "0");
      job.phase = `Rendering shot ${i + 1} of ${plans.length}`;
      job.shotsDone = i;
      await save();

      // captions follow the narration, which may have been sped up or slowed down
      const sp = p.edit.speed;
      const words = sp === 1 ? p.words : p.words.map((x) => ({ ...x, s: x.s / sp, e: x.e / sp }));
      const ass = plan.captions === "off" ? "" : buildAss(words, plan.captions, FONT, p.outSeconds);
      if (ass) await fs.writeFile(path.join(work, `cap-${tag}.ass`), ass);
      const ovAss = p.overlay ? buildOverlayAss(p.overlay, p.outSeconds, FONT) : "";
      if (ovAss) await fs.writeFile(path.join(work, `ov-${tag}.ass`), ovAss);

      // the picture for this shot, with its captions
      const z = zoompanExpr(p.motion, plan.intensity, p.frames);
      const cross = p.inOverlap > 0 && prev;
      let graph = `${still(0, p.frames, z)}${ass ? `,ass=cap-${tag}.ass` : ""}${ovAss ? `,ass=ov-${tag}.ass` : ""}[vb]`;
      const inputs = ["-i", p.image, "-i", p.audio];

      if (cross) {
        // the previous picture keeps moving for a moment and dissolves into this one
        inputs.push("-i", prev.image);
        const pz = zoompanExpr(prev.motion, plan.intensity, prev.frames, prev.frames - p.inOverlap);
        graph += `;${still(2, p.inOverlap, pz)}[va];[va][vb]xfade=transition=fade:duration=${(p.inOverlap / fps).toFixed(6)}:offset=0[vx]`;
      } else {
        graph += `;[vb]null[vx]`;
      }
      // dip to black / flash through white: this shot fades in, and the one before faded out
      const fadeLen = Math.max(1, Math.round(p.edit.tlen * fps));
      const colour = (t: ResolvedEdit["transition"]) => (t === "flash" ? "white" : "black");
      const fades: string[] = [];
      if (prev && (p.edit.transition === "dip" || p.edit.transition === "flash")) {
        fades.push(`fade=t=in:s=0:n=${fadeLen}:color=${colour(p.edit.transition)}`);
      }
      if (next && (next.edit.transition === "dip" || next.edit.transition === "flash")) {
        const n = Math.min(fadeLen, p.outFrames);
        fades.push(`fade=t=out:s=${Math.max(0, p.outFrames - n)}:n=${n}:color=${colour(next.edit.transition)}`);
      }
      graph += `;[vx]${fades.length ? fades.join(",") : "null"}[v]`;

      const tempo = Math.abs(sp - 1) > 0.001 ? `atempo=${sp.toFixed(4)},` : "";
      const audio = `[1:a]${tempo}aresample=${AUDIO_RATE},aformat=channel_layouts=stereo,apad=whole_dur=${p.outSeconds.toFixed(6)},atrim=0:${p.outSeconds.toFixed(6)}[a]`;

      const before = framesDone;
      await runFfmpeg(
        [
          ...inputs,
          "-filter_complex", `${graph};${audio}`,
          "-map", "[v]", "-frames:v", String(p.outFrames), "-t", p.outSeconds.toFixed(6),
          "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-pix_fmt", "yuv420p", "-r", String(fps), "-g", String(fps * 2), "-an",
          `clip-${tag}.mp4`,
          "-map", "[a]", "-c:a", "pcm_s16le", "-t", p.outSeconds.toFixed(6), `aud-${tag}.wav`,
        ],
        {
          cwd: work,
          onStart: (c) => track(l, c),
          onFrame: (f) => {
            job.progress = ((before + Math.min(f, p.outFrames)) / totalFrames) * SHOTS_SHARE;
          },
        },
      );
      framesDone += p.outFrames;
      job.progress = (framesDone / totalFrames) * SHOTS_SHARE;
      videoList.push(`file 'clip-${tag}.mp4'`);
      audioList.push(`file 'aud-${tag}.wav'`);
    }
    check();
    job.shotsDone = plans.length;

    // join and mix
    job.phase = "Mixing sound and joining shots";
    await save();
    await fs.writeFile(path.join(work, "video.txt"), videoList.join("\n"));
    await fs.writeFile(path.join(work, "audio.txt"), audioList.join("\n"));

    const T = totalSeconds.toFixed(3);
    const filters: string[] = [];
    const args = ["-f", "concat", "-safe", "0", "-i", "video.txt", "-f", "concat", "-safe", "0", "-i", "audio.txt"];
    let last = "[1:a]";
    if (music && plan.music) {
      args.push("-stream_loop", "-1", "-t", T, "-i", music);
      const fade = totalSeconds > 8 ? `,afade=t=out:st=${(totalSeconds - 3).toFixed(3)}:d=3` : "";
      filters.push(`[2:a]aresample=${AUDIO_RATE},aformat=channel_layouts=stereo,volume=${plan.music.volume.toFixed(3)}${fade}[m]`);
      if (plan.music.duck) {
        filters.push(`${last}asplit=2[n1][n2]`);
        filters.push(`[m][n2]sidechaincompress=threshold=0.02:ratio=10:attack=15:release=450[md]`);
        filters.push(`[n1][md]amix=inputs=2:normalize=0:duration=first[mix]`);
      } else {
        filters.push(`${last}[m]amix=inputs=2:normalize=0:duration=first[mix]`);
      }
      last = "[mix]";
    }
    filters.push(`${last}${plan.loudness ? `loudnorm=I=-16:TP=-1.5:LRA=11,aresample=${AUDIO_RATE},` : ""}asetpts=N/SR/TB,apad=whole_dur=${T},atrim=0:${T}[aout]`);

    const tmp = path.join(root, "video.tmp.mp4");
    await runFfmpeg(
      [...args, "-filter_complex", filters.join(";"), "-map", "0:v", "-map", "[aout]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", String(AUDIO_RATE), "-movflags", "+faststart", "-t", T, tmp],
      { cwd: work, onStart: (c) => track(l, c) },
    );
    check();

    const info = await probeVideo(tmp);
    const st = await fs.stat(tmp);
    await fs.rename(tmp, outputFile(videoId));
    const output: RenderOutput = {
      bytes: st.size,
      duration: info.duration,
      width: info.width,
      height: info.height,
      fps: info.fps,
      finishedAt: Date.now(),
      fingerprint: plan.fingerprint,
      captions: plan.captions,
      music: Boolean(music && plan.music),
    };
    await writeJson(path.join(root, "output.json"), output);
    job.status = "done";
    job.phase = "Done";
    job.progress = 1;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (l.canceled || msg === "canceled") {
      job.status = "canceled";
      job.phase = "Stopped";
    } else {
      job.status = "failed";
      job.phase = "Failed";
      job.error = msg.slice(0, 600);
    }
    await fs.rm(path.join(root, "video.tmp.mp4"), { force: true }).catch(() => {});
  } finally {
    job.finishedAt = Date.now();
    l.child = null;
    if (!process.env.KEEP_WORK) await fs.rm(work, { recursive: true, force: true }).catch(() => {});
    await save();
  }
}
