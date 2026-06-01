import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

// ===== BOLIG SHOWCASE VIDEO =====
// Render.ai-style vertical (9:16) property reel built 100% locally with FFmpeg.
// No AI, no external service, no audio. Each uploaded photo gets a smooth
// Ken Burns motion (alternating slow zoom-in / zoom-out) and clips are stitched
// together with soft crossfades. The render runs async in-memory because a
// 30-60s 1080x1920 encode can exceed Replit's ~2 min HTTP proxy timeout.

type ShowcaseStatus = "processing" | "completed" | "failed";

interface ShowcaseJob {
  status: ShowcaseStatus;
  videoUrl?: string;
  error?: string;
  createdAt: number;
}

const jobs = new Map<string, ShowcaseJob>();

export function getShowcaseJob(id: string): ShowcaseJob | undefined {
  return jobs.get(id);
}

// Drop jobs older than 1h so the map doesn't grow unbounded.
function pruneJobs() {
  const cutoff = Date.now() - 60 * 60 * 1000;
  const stale: string[] = [];
  jobs.forEach((job, id) => {
    if (job.createdAt < cutoff) stale.push(id);
  });
  stale.forEach((id) => jobs.delete(id));
}

// Local FFmpeg runs on this same server's CPU, so cap how many encodes run at
// once and reject new work once the backlog is full. This protects the box from
// compute-abuse / traffic spikes turning into an out-of-resources crash.
const MAX_CONCURRENT = 2;
const MAX_BACKLOG = 12; // active + queued
let activeRenders = 0;
const waiters: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (activeRenders < MAX_CONCURRENT) {
    activeRenders++;
    return Promise.resolve();
  }
  return new Promise((resolve) => waiters.push(resolve));
}

function releaseSlot() {
  const next = waiters.shift();
  if (next) {
    next(); // hand the slot directly to the next waiter (activeRenders unchanged)
  } else {
    activeRenders = Math.max(0, activeRenders - 1);
  }
}

const FPS = 30;
const W = 1080;
const H = 1920;
// Pre-upscale source before zoompan to avoid the well-known zoompan
// integer-pixel jitter — the zoom then samples from a higher-res frame.
const SRC_W = 1620;
const SRC_H = 2880;

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args);
    let stderr = "";
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-600)}`));
    });
  });
}

// Build the filter_complex graph: per-image Ken Burns then a crossfade chain.
function buildFilter(n: number, durPerImage: number, crossfade: number): string {
  const frames = Math.max(2, Math.round(durPerImage * FPS));
  const zinc = (0.12 / frames).toFixed(6);
  const parts: string[] = [];

  for (let i = 0; i < n; i++) {
    // Alternate motion for rhythm: even = slow zoom-in, odd = slow zoom-out.
    const z =
      i % 2 === 0
        ? `min(1.0+${zinc}*on,1.12)`
        : `max(1.12-${zinc}*on,1.0)`;
    parts.push(
      `[${i}:v]scale=${SRC_W}:${SRC_H}:force_original_aspect_ratio=increase,` +
        `crop=${SRC_W}:${SRC_H},` +
        `zoompan=z='${z}':d=${frames}:` +
        `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${W}x${H}:fps=${FPS},` +
        `setsar=1,format=yuv420p[v${i}]`,
    );
  }

  if (n === 1) {
    // Single image: just expose it as the output label.
    parts.push(`[v0]null[vout]`);
    return parts.join(";");
  }

  let last = `[v0]`;
  for (let j = 1; j < n; j++) {
    const offset = (j * (durPerImage - crossfade)).toFixed(3);
    const out = j === n - 1 ? `[vout]` : `[x${j}]`;
    parts.push(
      `${last}[v${j}]xfade=transition=fade:duration=${crossfade}:offset=${offset}${out}`,
    );
    last = `[x${j}]`;
  }
  return parts.join(";");
}

async function render(
  jobId: string,
  imagePaths: string[],
  outDir: string,
  durPerImage: number,
): Promise<void> {
  const crossfade = 0.7;
  const filter = buildFilter(imagePaths.length, durPerImage, crossfade);
  const filename = `showcase-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`;
  const outPath = path.join(outDir, filename);

  const args: string[] = ["-y"];
  for (const p of imagePaths) {
    args.push("-i", p);
  }
  args.push(
    "-filter_complex",
    filter,
    "-map",
    "[vout]",
    "-r",
    String(FPS),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-an",
    outPath,
  );

  await acquireSlot();
  try {
    await runFfmpeg(args);
  } finally {
    releaseSlot();
  }
  jobs.set(jobId, { status: "completed", videoUrl: `/uploads/${filename}`, createdAt: Date.now() });
}

// Kick off an async render. Returns immediately with a jobId the client polls.
export function startShowcaseVideo(
  imagePaths: string[],
  outDir: string,
  durPerImage = 3.5,
): string | null {
  pruneJobs();
  // Backpressure: refuse new work when the box is already saturated so we fail
  // fast with a clear message instead of piling up FFmpeg processes.
  if (activeRenders + waiters.length >= MAX_BACKLOG) {
    return null;
  }
  const jobId = randomUUID();
  jobs.set(jobId, { status: "processing", createdAt: Date.now() });

  // Clamp to a sane range so the slider can't produce broken output.
  const dur = Math.min(8, Math.max(2, durPerImage));

  render(jobId, imagePaths, outDir, dur)
    .catch((err: any) => {
      jobs.set(jobId, {
        status: "failed",
        error: err?.message || "Render mislykkedes",
        createdAt: Date.now(),
      });
    })
    .finally(() => {
      // Clean up the temporary source images regardless of outcome.
      for (const p of imagePaths) {
        fs.promises.unlink(p).catch(() => {});
      }
    });

  return jobId;
}
