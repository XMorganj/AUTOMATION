import "server-only";
import { spawn, type ChildProcess } from "node:child_process";

/** Set FFMPEG_PATH / FFPROBE_PATH if the programs aren't on your PATH. */
export const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
export const FFPROBE = process.env.FFPROBE_PATH || "ffprobe";

let cached: Promise<boolean> | null = null;

/** Is FFmpeg installed and runnable? Checked once, then remembered. */
export function ffmpegAvailable(): Promise<boolean> {
  cached ??= new Promise((resolve) => {
    const p = spawn(FFMPEG, ["-version"], { stdio: "ignore" });
    p.on("error", () => resolve(false));
    p.on("exit", (code) => resolve(code === 0));
  });
  return cached;
}

export interface RunHandle {
  child: ChildProcess;
  done: Promise<void>;
}

/**
 * Run FFmpeg with an argument list (never through a shell). `onFrame` gets the output frame count as it grows.
 * Rejects with the last lines of FFmpeg's own error output if it fails.
 */
export function runFfmpeg(args: string[], opts: { cwd: string; onFrame?: (frame: number) => void; onStart?: (child: ChildProcess) => void }): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG, ["-hide_banner", "-nostdin", "-y", "-loglevel", "error", "-progress", "pipe:1", "-nostats", ...args], {
      cwd: opts.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    opts.onStart?.(child);
    let tail = "";
    let buf = "";
    child.stdout.on("data", (d: Buffer) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        if (line.startsWith("frame=")) opts.onFrame?.(Number(line.slice(6)) || 0);
      }
    });
    child.stderr.on("data", (d: Buffer) => {
      tail = (tail + d.toString()).slice(-1500);
    });
    child.on("error", (e) => reject(new Error(`Couldn't start FFmpeg: ${e.message}`)));
    child.on("exit", (code, signal) => {
      if (code === 0) resolve();
      else if (signal) reject(new Error("canceled"));
      else reject(new Error(tail.trim().split("\n").slice(-6).join("\n") || `FFmpeg exited with code ${code}`));
    });
  });
}

/** Duration, size and frame rate of a finished video. */
export function probeVideo(file: string): Promise<{ duration: number; width: number; height: number; fps: number }> {
  return new Promise((resolve, reject) => {
    const p = spawn(FFPROBE, ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    p.stdout.on("data", (d: Buffer) => (out += d.toString()));
    p.on("error", reject);
    p.on("exit", () => {
      try {
        const j = JSON.parse(out) as { format?: { duration?: string }; streams?: { codec_type: string; width?: number; height?: number; r_frame_rate?: string }[] };
        const v = j.streams?.find((s) => s.codec_type === "video");
        const [a, b] = (v?.r_frame_rate ?? "0/1").split("/").map(Number);
        resolve({ duration: Number(j.format?.duration) || 0, width: v?.width ?? 0, height: v?.height ?? 0, fps: b ? a / b : 0 });
      } catch (e) {
        reject(e);
      }
    });
  });
}
