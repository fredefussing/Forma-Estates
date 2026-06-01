import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { isFalConfigured, uploadToFal, generateShowcaseClip, downloadToFile } from "./fal";

// ===== BOLIG SHOWCASE VIDEO =====
// Vertical (9:16) property reel. PRIMARY path: each photo becomes one real AI
// image-to-video clip (Kling 2.1) with a single genuine gimbal camera move —
// dolly in/out, truck left/right — then the clips are cut to the music's beat,
// each fitted WHOLE (never cropped) onto a blurred fill of itself, and muxed with
// a music bed + burned-in captions. This is the look the reference videos have;
// FFmpeg-faked pan/zoom never matched it. FALLBACK path (no FAL_KEY, or every AI
// clip failed): the original 100%-local FFmpeg engine that fakes the gimbal move
// with split-layer zoompan on a still — $0 but less convincing. Either way the
// render runs async in-memory because the work (AI generation or a 1080x1920
// encode) far exceeds Replit's ~2 min HTTP proxy timeout.

type ShowcaseStatus = "processing" | "completed" | "failed";

export interface ShowcaseProgress {
  stage: "uploading" | "generating" | "compositing" | "complete" | "failed";
  currentClip: number;
  totalClips: number;
  message: string;
  videoUrls?: Record<string, string>;
  cleanVideoUrls?: Record<string, string>;
}

interface ShowcaseJob {
  status: ShowcaseStatus;
  videoUrls?: Record<string, string>;
  cleanVideoUrls?: Record<string, string>;
  error?: string;
  createdAt: number;
  progress: ShowcaseProgress;
}

const jobs = new Map<string, ShowcaseJob>();

export function getShowcaseJob(id: string): ShowcaseJob | undefined {
  return jobs.get(id);
}

function setProgress(jobId: string, p: ShowcaseProgress) {
  const job = jobs.get(jobId);
  if (job) jobs.set(jobId, { ...job, progress: p });
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

// Read a photo's pixel size so we can fit it whole (no crop) and size the blurred
// fill around it. Cheap one-shot ffprobe per unique source image.
function ffprobeSize(p: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffprobe", [
      "-v", "error", "-select_streams", "v:0",
      "-show_entries", "stream=width,height", "-of", "csv=s=x:p=0", p,
    ]);
    let out = "";
    proc.stdout.on("data", (d) => (out += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      const m = out.trim().match(/(\d+)x(\d+)/);
      const w = m ? +m[1] : 0;
      const h = m ? +m[2] : 0;
      if (code === 0 && w > 0 && h > 0) resolve({ w, h });
      else reject(new Error(`ffprobe size failed for ${p}`));
    });
  });
}

// Background music: a few pre-generated, royalty-free instrumental beds that ship
// with the app. Rendering stays $0 per video because we reuse these local files
// (no per-render AI/audio cost). Key "none" / undefined = silent.
const MUSIC_DIR = path.join(process.cwd(), "server", "music");
const MUSIC_TRACKS: Record<string, string> = {
  calm: "calm.mp3",
  uplifting: "uplifting.mp3",
  modern: "modern.mp3",
  tension: "tension.mp3",
};
function resolveMusic(key?: string): string | null {
  if (!key || key === "none") return null;
  const file = MUSIC_TRACKS[key];
  if (!file) return null;
  const p = path.join(MUSIC_DIR, file);
  return fs.existsSync(p) ? p : null;
}

// Beat-synced cuts: each music bed has a steady pulse measured via ffmpeg+
// autocorrelation (period = seconds per beat, phase = time of first strong onset).
// At render time we lock every image switch to a whole number of beats so the
// cuts land on the rhythm. Seek = phase % period aligns the track's pulse with t=0.
//
// Measured BPM (new tracks, June 2026):
//   calm:      80 BPM  → period=0.7500s  phase=10.728s
//   modern:   127 BPM  → period=0.4724s  phase=0.650s
//   uplifting: 96 BPM  → period=0.6250s  phase=1.602s  (detected 192; halved)
//   tension:   69 BPM  → period=0.8696s  phase=0.000s
const BEAT_GRID: Record<string, { period: number; phase: number }> = {
  calm:      { period: 0.7500, phase: 10.728 },
  modern:    { period: 0.4724, phase: 0.650  },
  uplifting: { period: 0.6250, phase: 1.602  },
  tension:   { period: 0.8696, phase: 0.000  },
};
// Aim for a punchy ~16s reel; the fast beat cuts fill it by cycling the photos.
const TARGET_TOTAL_SEC = 16;
// No music => no beat to follow, so cut at this snappy fixed pace.
const SILENT_SLIDE_SEC = 0.7;
// Hard cap on clip count so a huge upload can't blow up encode time.
const MAX_SLIDES = 48;
// Roughly how long a photo should hold; snapped to a whole number of beats so a
// fast track (short period) cuts every beat and a slow one every 2 beats.
const TARGET_SLIDE_SEC = 0.55;

// ── AI path tuning ────────────────────────────────────────────────────────────
// Each AI clip is a PAID asset, so we never cycle them — one clip per photo. Cap
// the count so a giant upload can't run up a huge bill / render time.
const MAX_AI_CLIPS = 12;
// AI clips carry their OWN visible camera move, so slides hold longer than the
// fast local cuts (a 0.5s window would hide the dolly). Aim for ~this total and
// keep each slide between MIN/MAX (MAX must stay under the 5s source clip).
const AI_TARGET_TOTAL_SEC = 15;
const AI_MIN_SLIDE_SEC = 1.6;
const AI_MAX_SLIDE_SEC = 4.6;

// Energy-aware beat plan for the AI path. Beat counts chosen so every duration
// stays inside [AI_MIN=1.6s, AI_MAX=4.6s] with the new measured periods:
//   calm      (0.75s):  short=3→2.25s  medium=4→3.00s  long=5→3.75s
//   modern    (0.4724s):short=4→1.89s  medium=6→2.83s  long=9→4.25s
//   uplifting (0.625s): short=3→1.88s  medium=5→3.13s  long=7→4.38s
//   tension   (0.8696s):short=2→1.74s  medium=3→2.61s  long=5→4.35s
type EnergyLevel = "short" | "medium" | "long";

const ENERGY_BEATS: Record<string, Record<EnergyLevel, number>> = {
  calm:      { short: 3, medium: 4, long: 5 },
  modern:    { short: 4, medium: 6, long: 9 },
  uplifting: { short: 3, medium: 5, long: 7 },
  tension:   { short: 2, medium: 3, long: 5 },
};

// Map normalised reel position (0=first clip, 1=last) to an energy level.
const ENERGY_SEQUENCE: Record<string, (pos: number) => EnergyLevel> = {
  // Calm: slow, contemplative — long breathes throughout, gentle dip mid-reel.
  calm: (pos) => {
    if (pos < 0.15) return "long";
    if (pos < 0.42) return "medium";
    if (pos < 0.62) return "long";
    if (pos < 0.82) return "medium";
    return "long";
  },
  // Modern: punchy editorial — hook/chorus hits hard, verses breathe.
  modern: (pos) => {
    if (pos < 0.10) return "medium";
    if (pos < 0.32) return "short";
    if (pos < 0.52) return "medium";
    if (pos < 0.72) return "short";
    return "medium";
  },
  // Uplifting: breath → build → peak → settle → close.
  uplifting: (pos) => {
    if (pos < 0.12) return "long";
    if (pos < 0.32) return "medium";
    if (pos < 0.58) return "short";
    if (pos < 0.78) return "medium";
    return "long";
  },
  // Tension: dark Nordic noir — opens heavy, builds in middle, closes heavy.
  tension: (pos) => {
    if (pos < 0.20) return "long";
    if (pos < 0.45) return "medium";
    if (pos < 0.65) return "short";
    if (pos < 0.82) return "medium";
    return "long";
  },
};

function energyPlanAI(
  musicKey: string | undefined,
  n: number,
): { durations: number[]; musicSeek: number } {
  const key = !musicKey || musicKey === "none" ? null : musicKey;
  const grid = key ? BEAT_GRID[key] : undefined;
  const beatMap = key ? ENERGY_BEATS[key] : undefined;
  const seq = key ? ENERGY_SEQUENCE[key] : undefined;

  if (!grid || !beatMap || !seq) {
    const dur = +(Math.min(AI_MAX_SLIDE_SEC, Math.max(AI_MIN_SLIDE_SEC, AI_TARGET_TOTAL_SEC / n)).toFixed(3));
    return { durations: Array(n).fill(dur), musicSeek: 0 };
  }

  const durations = Array.from({ length: n }, (_, i) => {
    const pos = n > 1 ? i / (n - 1) : 0.5;
    const level = seq(pos);
    let beats = beatMap[level];
    let dur = beats * grid.period;
    while (dur > AI_MAX_SLIDE_SEC && beats > 1) { beats--; dur = beats * grid.period; }
    while (dur < AI_MIN_SLIDE_SEC) { beats++; dur = beats * grid.period; }
    return +dur.toFixed(4);
  });

  let seek = grid.phase % grid.period;
  if (seek < 0) seek += grid.period;

  const total = durations.reduce((a, b) => a + b, 0);
  console.log(`[showcase] energy plan (${key}, ${n} clips): [${durations.join(", ")}]s = ${total.toFixed(2)}s total`);

  return { durations, musicSeek: +seek.toFixed(3) };
}

// Work out how long each photo holds (a whole number of beats so every hard cut
// lands on the pulse), how many slides to render (photos are cycled to fill the
// reel), and a small audio pre-roll so a beat sits at t=0 and every cut is on it.
function beatPlan(
  musicKey: string | undefined,
  n: number,
): { slideDur: number; musicSeek: number; slideCount: number } {
  const key = !musicKey || musicKey === "none" ? null : musicKey;
  const grid = key ? BEAT_GRID[key] : undefined;
  if (!grid) {
    const slideDur = SILENT_SLIDE_SEC;
    const fill = Math.min(MAX_SLIDES, Math.round(TARGET_TOTAL_SEC / slideDur));
    return { slideDur, musicSeek: 0, slideCount: Math.max(n, fill) };
  }
  const beats = Math.max(1, Math.round(TARGET_SLIDE_SEC / grid.period));
  const slideDur = +(beats * grid.period).toFixed(4);
  const fill = Math.min(MAX_SLIDES, Math.round(TARGET_TOTAL_SEC / slideDur));
  const slideCount = Math.max(n, fill);
  // Seek the bed so a beat sits at t=0; every slide boundary is a whole number of
  // beats, so each hard cut then coincides with a beat.
  let seek = grid.phase % grid.period;
  if (seek < 0) seek += grid.period;
  return { slideDur, musicSeek: +seek.toFixed(3), slideCount };
}

// Run async tasks with a bounded number in flight at once. Used to cap how many
// PAID Kling generations a single job fires in parallel so one big upload can't
// open 12 concurrent paid calls (cost + external-API pressure). Order of results
// matches the input order.
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) break;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

// Most Kling generations a single job runs concurrently. Each is a paid call, so
// we trickle them rather than firing all MAX_AI_CLIPS at once.
const AI_CLIP_CONCURRENCY = 3;

// Even-rounded value — x264/yuv420p needs even pixel dimensions and offsets.
const even = (v: number) => Math.max(2, Math.round(v / 2) * 2);

// Build ONE slide: the full (uncropped) photo on a blurred fill of itself, plus a
// gimbal-style camera move. We never crop the photo to fill the 9:16 frame — the
// whole image is always on screen, letterboxed by a blurred, slightly darkened
// copy of itself so the clip is social-ready. The sharp foreground and the blurred
// background move by DIFFERENT amounts, which reads as real depth/parallax — the
// "shot on a gimbal" look. Moves cycle per slide: dolly-in, crab-right, dolly-out,
// crab-left.
function buildSlide(i: number, dims: { w: number; h: number }, frames: number): string {
  const fm1 = Math.max(1, frames - 1);
  const D = ((frames - 1) / FPS).toFixed(4); // clip length in seconds (for overlay `t`)
  const f = Math.min(W / dims.w, H / dims.h); // fit-whole factor
  const fw = even(dims.w * f);
  const fh = even(dims.h * f);
  const cx = even((W - fw) / 2);
  const cy = even((H - fh) / 2);
  // Crab moves inset the photo to 90% so it can slide sideways and still stay fully
  // on screen (the freed margin reveals the blurred fill).
  const f9 = f * 0.9;
  const fw9 = even(dims.w * f9);
  const fh9 = even(dims.h * f9);
  const cx9 = even((W - fw9) / 2);
  const cy9 = even((H - fh9) / 2);
  const amp = Math.max(2, cx9); // horizontal travel kept inside the margin

  // Blurred-fill background: scale to COVER the frame, blur + darken, then a gentle
  // move of its own.
  const bgLayer = (z: string, x: string) =>
    `[${i}:v]split=2[a${i}][b${i}];` +
    `[a${i}]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},` +
    `boxblur=26:2,eq=brightness=-0.05,setsar=1,` +
    `zoompan=z='${z}':d=${frames}:x='${x}':y='ih/2-(ih/zoom/2)':s=${W}x${H}:fps=${FPS},setsar=1[bg${i}];`;

  // Ease-in-out via cosine: smooth = (1 - cos(PI * on/fm1)) / 2
  // This gives 0 at start, 1 at end, with gentle acceleration + deceleration.
  const easeExpr = `(1-cos(3.14159265*on/${fm1}))/2`;

  const move = i % 4;
  if (move === 0 || move === 2) {
    // Dolly in (push toward the room) / dolly out (pull back). The sharp photo
    // scales one way while the blur scales the other → depth. Zoom range
    // increased to 1.0→1.15 (was 1.07) so movement reads clearly on mobile.
    const fgZ = move === 0
      ? `min(1.15,1.0+0.15*(${easeExpr}))`
      : `max(1.0,1.15-0.15*(${easeExpr}))`;
    const bgZ = move === 0
      ? `max(1.10,1.14-0.04*(${easeExpr}))`
      : `min(1.14,1.10+0.04*(${easeExpr}))`;
    return (
      bgLayer(bgZ, `iw/2-(iw/zoom/2)`) +
      `[b${i}]scale=${fw}:${fh},eq=brightness=0.03:contrast=1.05:saturation=1.02,setsar=1,` +
      `zoompan=z='${fgZ}':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${fw}x${fh}:fps=${FPS},setsar=1[fg${i}];` +
      `[bg${i}][fg${i}]overlay=x=${cx}:y=${cy},format=yuv420p,setsar=1[v${i}]`
    );
  }
  // Crab right (1) / crab left (3): the sharp photo slides sideways while the blur
  // drifts the opposite way a little → parallax. Pan amount increased to 6%.
  const sign = move === 1 ? "+" : "-";
  const bgSign = move === 1 ? "-" : "+";
  // Use ease-in-out on the pan as well: map easeExpr (0→1) to (-1→+1) range.
  const easeLinear = `(${easeExpr}*2-1)`;
  const panAmt = Math.round(amp * 1.4);
  const ovx = `min(max(${cx9}${sign}${panAmt}*${easeLinear},0),${W - fw9})`;
  const bgx = `iw/2-(iw/zoom/2)${bgSign}24*${easeLinear}`;
  return (
    bgLayer(`1.06`, bgx) +
    `[b${i}]scale=${fw9}:${fh9},eq=brightness=0.03:contrast=1.05:saturation=1.02,setsar=1[fg${i}];` +
    `[bg${i}][fg${i}]overlay=x='${ovx}':y=${cy9}:eof_action=repeat:repeatlast=1,format=yuv420p,setsar=1[v${i}]`
  );
}

// Build the filter_complex graph: one gimbal slide per photo, joined with HARD CUTS
// (concat, no crossfade) so every switch is instant and lands on the beat. `n` is
// the slide count (photos already cycled); `sizes[i]` is the source photo's pixels.
function buildFilter(n: number, slideDur: number, sizes: Array<{ w: number; h: number }>): string {
  const frames = Math.max(2, Math.round(slideDur * FPS));
  const parts: string[] = [];
  for (let i = 0; i < n; i++) parts.push(buildSlide(i, sizes[i], frames));

  if (n === 1) {
    // Single image: just expose it as the output label.
    parts.push(`[v0]null[vbase]`);
    return parts.join(";");
  }

  // Hard cuts: concatenate the slides with no transition.
  const inputs = Array.from({ length: n }, (_, i) => `[v${i}]`).join("");
  parts.push(`${inputs}concat=n=${n}:v=1:a=0[vbase]`);
  return parts.join(";");
}

// Build ONE slide from an AI VIDEO clip (input `i`). The real camera move already
// lives in the footage, so we add NO zoompan here — we only trim the clip to the
// beat length and fit it WHOLE (no crop) onto a blurred fill of itself so the 9:16
// frame is full-bleed. `dims` is the clip's pixel size from ffprobe.
function buildSlideVideo(i: number, dims: { w: number; h: number }, slideDur: number): string {
  const f = Math.min(W / dims.w, H / dims.h); // fit-whole factor
  const fw = even(dims.w * f);
  const fh = even(dims.h * f);
  const cx = even((W - fw) / 2);
  const cy = even((H - fh) / 2);
  const dur = slideDur.toFixed(4);
  return (
    `[${i}:v]trim=0:${dur},setpts=PTS-STARTPTS,fps=${FPS},split=2[a${i}][b${i}];` +
    `[a${i}]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},` +
    `boxblur=26:2,eq=brightness=-0.05,setsar=1[bg${i}];` +
    `[b${i}]scale=${fw}:${fh},eq=brightness=0.03:contrast=1.05:saturation=1.02,setsar=1[fg${i}];` +
    `[bg${i}][fg${i}]overlay=x=${cx}:y=${cy},format=yuv420p,setsar=1[v${i}]`
  );
}

// Filter graph for the AI path: one trimmed clip per slide, joined with HARD CUTS
// on the beat. `n` is the clip/slide count (never cycled); `sizes[i]` is clip i's
// pixel size.
function buildFilterVideo(n: number, durations: number[], sizes: Array<{ w: number; h: number }>): string {
  const parts: string[] = [];
  for (let i = 0; i < n; i++) parts.push(buildSlideVideo(i, sizes[i], durations[i]));

  if (n === 1) {
    parts.push(`[v0]null[vbase]`);
    return parts.join(";");
  }
  const inputs = Array.from({ length: n }, (_, i) => `[v${i}]`).join("");
  parts.push(`${inputs}concat=n=${n}:v=1:a=0[vbase]`);
  return parts.join(";");
}

// "Clean" (no blurred fill) slide for an AI VIDEO clip — the real camera move
// already lives in the footage; we just trim and crop-to-fill the 9:16 frame.
function buildSlideVideoClean(i: number, dims: { w: number; h: number }, slideDur: number): string {
  const dur = slideDur.toFixed(4);
  return (
    `[${i}:v]trim=0:${dur},setpts=PTS-STARTPTS,fps=${FPS},` +
    `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},` +
    `eq=brightness=0.02:contrast=1.03:saturation=1.02,format=yuv420p,setsar=1[v${i}]`
  );
}

function buildFilterVideoClean(n: number, durations: number[], sizes: Array<{ w: number; h: number }>): string {
  const parts: string[] = [];
  for (let i = 0; i < n; i++) parts.push(buildSlideVideoClean(i, sizes[i], durations[i]));
  if (n === 1) { parts.push(`[v0]null[vbase]`); return parts.join(";"); }
  const inputs = Array.from({ length: n }, (_, i) => `[v${i}]`).join("");
  parts.push(`${inputs}concat=n=${n}:v=1:a=0[vbase]`);
  return parts.join(";");
}

// "Clean" slide for a LOCAL PHOTO — crop-to-fill 9:16 with a gentle dolly/crab
// move. Scale to 115% of target so zoompan has room to zoom without border bleed.
function buildSlideClean(i: number, dims: { w: number; h: number }, frames: number): string {
  const fm1 = Math.max(1, frames - 1);
  const easeExpr = `(1-cos(3.14159265*on/${fm1}))/2`;
  const move = i % 4;
  // Scale to 1.15× fill — gives zoompan up to z=1.10 before bleed
  const bigW = even(Math.ceil(W * 1.15));
  const bigH = even(Math.ceil(H * 1.15));
  let z: string, panX: string;
  if (move === 0) {
    z = `min(1.10,1.0+0.10*(${easeExpr}))`;
    panX = `iw/2-(iw/zoom/2)`;
  } else if (move === 2) {
    z = `max(1.0,1.10-0.10*(${easeExpr}))`;
    panX = `iw/2-(iw/zoom/2)`;
  } else {
    z = `1.06`;
    const sign = move === 1 ? `+` : `-`;
    panX = `iw/2-(iw/zoom/2)${sign}28*(${easeExpr}*2-1)`;
  }
  return (
    `[${i}:v]scale=${bigW}:${bigH}:force_original_aspect_ratio=increase,setsar=1,` +
    `eq=brightness=0.03:contrast=1.05:saturation=1.02,` +
    `zoompan=z='${z}':d=${frames}:x='${panX}':y='ih/2-(ih/zoom/2)':s=${W}x${H}:fps=${FPS},` +
    `format=yuv420p,setsar=1[v${i}]`
  );
}

function buildFilterClean(n: number, slideDur: number, sizes: Array<{ w: number; h: number }>): string {
  const frames = Math.max(2, Math.round(slideDur * FPS));
  const parts: string[] = [];
  for (let i = 0; i < n; i++) parts.push(buildSlideClean(i, sizes[i], frames));
  if (n === 1) { parts.push(`[v0]null[vbase]`); return parts.join(";"); }
  const inputs = Array.from({ length: n }, (_, i) => `[v${i}]`).join("");
  parts.push(`${inputs}concat=n=${n}:v=1:a=0[vbase]`);
  return parts.join(";");
}

// Text overlay: a bundled bold sans-serif, plus a FIXED contact line that is the
// same on every video (the agency's details). The per-video address is optional
// and supplied by the user. Rendered with drawtext (burned in) so the clip is
// self-contained — no external player or caption track needed.
// Prefer Inter (downloaded to public/fonts/) — clean, modern real-estate look.
// Fall back to system DejaVu so the server never crashes when the font is missing.
const _INTER_BOLD = `${process.cwd()}/public/fonts/Inter-Bold.otf`;
const _INTER_REG  = `${process.cwd()}/public/fonts/Inter-Regular.otf`;
const _DEJAVU_B   = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
const _DEJAVU_R   = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
const FONT_BOLD = fs.existsSync(_INTER_BOLD) ? _INTER_BOLD : _DEJAVU_B;
const FONT_REG  = fs.existsSync(_INTER_REG)  ? _INTER_REG  : _DEJAVU_R;
const FONT      = FONT_BOLD; // legacy alias

const CONTACT_TEXT =
  "Forma Estates  |  +45 70 70 70 70  |  kontakt@formaestates.dk";

// One white-on-shadow centred caption. No box background — just a 3px black
// border outline + drop-shadow so text is legible on any background.
function drawCaption(
  file: string,
  size: number,
  y: string,
  alpha: string,
  enable: string,
  fontfile: string = FONT_BOLD,
  lineSpacing = 0,
): string {
  const ls = lineSpacing > 0 ? `:line_spacing=${lineSpacing}` : "";
  return (
    `drawtext=fontfile=${fontfile}:textfile=${file}:expansion=none:` +
    `fontcolor=white:fontsize=${size}${ls}:` +
    `borderw=3:bordercolor=black@0.45:` +
    `shadowcolor=black@0.55:shadowx=2:shadowy=2:` +
    `x=(w-text_w)/2:y=${y}:alpha='${alpha}':enable='${enable}'`
  );
}

// Inputs for one render: the per-slide FFmpeg input files (images or clips), the
// beat plan, and the video filter graph. `tmpClips` are downloaded AI clips the
// caller must delete after the encode.
interface RenderInputs {
  inputPaths: string[];
  slideCount: number;
  slideDur: number;           // uniform value (local path) or per-clip average
  durations?: number[];       // per-clip durations for energy-aware AI path
  musicSeek: number;
  filter: string;
  tmpClips: string[];
}

// FALLBACK (free, local): cycle the photos to fill a punchy reel and fake the
// gimbal move with split-layer zoompan on each still.
async function buildLocalInputs(imagePaths: string[], musicKey?: string): Promise<RenderInputs> {
  const n = imagePaths.length;
  const { slideDur, musicSeek, slideCount } = beatPlan(musicKey, n);
  const inputPaths: string[] = [];
  for (let k = 0; k < slideCount; k++) inputPaths.push(imagePaths[k % n]);
  // Each slide fits its photo WHOLE (no crop), so we need the source pixel size.
  // Probe once per unique photo and reuse across cycled slides.
  const sizeCache = new Map<string, { w: number; h: number }>();
  const sizes: Array<{ w: number; h: number }> = [];
  for (const p of inputPaths) {
    let s = sizeCache.get(p);
    if (!s) {
      s = await ffprobeSize(p);
      sizeCache.set(p, s);
    }
    sizes.push(s);
  }
  const filter = buildFilter(slideCount, slideDur, sizes);
  return { inputPaths, slideCount, slideDur, musicSeek, filter, tmpClips: [] };
}

// Thin struct holding the downloaded AI clips and their pixel sizes — the
// mood-independent part of a paid Kling generation pass. The energy plan (clip
// durations) is computed per mood in makeRenderInputsAI so the same clips are
// assembled into every mood variant without a second Kling API call.
interface AIClipData {
  clipPaths: string[];
  sizes: Array<{ w: number; h: number }>;
}

// PRIMARY (paid AI): turn each photo (capped) into one real Kling 2.1 i2v clip
// with a genuine camera move, generated in PARALLEL. Returns null if EVERY clip
// failed so the caller can fall back to the free local engine.
async function buildAIClips(
  imagePaths: string[],
  outDir: string,
  onProgress?: (p: ShowcaseProgress) => void,
): Promise<AIClipData | null> {
  const photos = imagePaths.slice(0, MAX_AI_CLIPS);
  const total = photos.length;

  onProgress?.({ stage: "uploading", currentClip: 0, totalClips: total, message: `Uploader ${total} billeder…` });

  const uploads = await Promise.all(
    photos.map((p) =>
      uploadToFal(p)
        .then((url) => url)
        .catch((e) => {
          console.warn("[showcase] upload failed:", e?.message || e);
          return null;
        }),
    ),
  );

  let done = 0;
  onProgress?.({ stage: "generating", currentClip: 0, totalClips: total, message: `Laver AI-klip 0/${total}…` });

  const clips = await mapLimit(uploads, AI_CLIP_CONCURRENCY, async (url, i) => {
    if (!url) return null;
    try {
      const { videoUrl } = await generateShowcaseClip(url, i);
      const dest = path.join(
        outDir,
        `clip-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}.mp4`,
      );
      await downloadToFile(videoUrl, dest);
      done++;
      onProgress?.({ stage: "generating", currentClip: done, totalClips: total, message: `Laver AI-klip ${done}/${total}…` });
      return dest;
    } catch (e: any) {
      console.warn(`[showcase] clip ${i} failed:`, e?.message || e);
      done++;
      onProgress?.({ stage: "generating", currentClip: done, totalClips: total, message: `Laver AI-klip ${done}/${total}… (et klip fejlede)` });
      return null;
    }
  });

  const clipPaths = clips.filter((c): c is string => !!c);
  if (clipPaths.length === 0) return null;

  try {
    const sizes: Array<{ w: number; h: number }> = [];
    for (const c of clipPaths) sizes.push(await ffprobeSize(c));
    return { clipPaths, sizes };
  } catch (e) {
    for (const c of clipPaths) fs.promises.unlink(c).catch(() => {});
    throw e;
  }
}

// Build mood-specific RenderInputs from raw AI clips. Energy plan (timing)
// varies per mood so every assembled video has different cut rhythm.
function makeRenderInputsAI(clips: AIClipData, musicKey: string): RenderInputs {
  const n = clips.clipPaths.length;
  const { durations, musicSeek } = energyPlanAI(musicKey, n);
  const filter = buildFilterVideo(n, durations, clips.sizes);
  const avgDur = +(durations.reduce((a, b) => a + b, 0) / n).toFixed(4);
  return { inputPaths: clips.clipPaths, slideCount: n, slideDur: avgDur, durations, musicSeek, filter, tmpClips: clips.clipPaths };
}

// Same as above but uses the "clean" (crop-to-fill, no blurred bg) filter.
function makeRenderInputsAIClean(clips: AIClipData, musicKey: string): RenderInputs {
  const n = clips.clipPaths.length;
  const { durations, musicSeek } = energyPlanAI(musicKey, n);
  const filter = buildFilterVideoClean(n, durations, clips.sizes);
  const avgDur = +(durations.reduce((a, b) => a + b, 0) / n).toFixed(4);
  return { inputPaths: clips.clipPaths, slideCount: n, slideDur: avgDur, durations, musicSeek, filter, tmpClips: [] };
}

// FALLBACK clean version: same as buildLocalInputs but uses crop-to-fill slides.
async function buildLocalInputsClean(imagePaths: string[], musicKey?: string): Promise<RenderInputs> {
  const n = imagePaths.length;
  const { slideDur, musicSeek, slideCount } = beatPlan(musicKey, n);
  const inputPaths: string[] = [];
  for (let k = 0; k < slideCount; k++) inputPaths.push(imagePaths[k % n]);
  const sizeCache = new Map<string, { w: number; h: number }>();
  const sizes: Array<{ w: number; h: number }> = [];
  for (const p of inputPaths) {
    let s = sizeCache.get(p);
    if (!s) { s = await ffprobeSize(p); sizeCache.set(p, s); }
    sizes.push(s);
  }
  const filter = buildFilterClean(slideCount, slideDur, sizes);
  return { inputPaths, slideCount, slideDur, musicSeek, filter, tmpClips: [] };
}

// Assemble one MP4 from pre-built render inputs. Returns the public /uploads/
// URL of the finished file. Does NOT delete tmpClips — the caller does that
// after all mood variants are done. Cleans up only its own text overlay files.
async function assembleVideo(
  inputs: RenderInputs,
  outDir: string,
  address: string | undefined,
  moodKey: string,
): Promise<string> {
  const { inputPaths, slideCount, slideDur, musicSeek, filter } = inputs;
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const filename = `showcase-${ts}-${rand}-${moodKey}.mp4`;
  const outPath = path.join(outDir, filename);

  const videoTotal = inputs.durations
    ? +inputs.durations.reduce((a, b) => a + b, 0).toFixed(3)
    : +(slideCount * slideDur).toFixed(3);
  const musicPath = resolveMusic(moodKey);

  const args: string[] = ["-y"];
  for (const p of inputPaths) {
    args.push("-i", p);
  }

  const tmpFiles: string[] = [];
  let overlayChain = `;[vbase]null[vout]`;
  if (fs.existsSync(FONT_BOLD)) {
    const baseName = filename.replace(/\.mp4$/, "");
    const draws: string[] = [];

    const contactFile = path.join(outDir, `${baseName}-contact.txt`);
    fs.writeFileSync(contactFile, CONTACT_TEXT, "utf8");
    tmpFiles.push(contactFile);
    const cStart  = +(videoTotal * 0.70).toFixed(3);
    const cFadeEnd = +(videoTotal * 0.73).toFixed(3);
    const cFadeDur = Math.max(0.01, cFadeEnd - cStart).toFixed(3);
    const contactAlpha = `if(lt(t,${cStart.toFixed(2)}),0,if(lt(t,${cFadeEnd.toFixed(2)}),(t-${cStart.toFixed(2)})/${cFadeDur},1))`;
    draws.push(
      drawCaption(contactFile, 26, "h-text_h-50", contactAlpha, `between(t,${cStart.toFixed(2)},${videoTotal.toFixed(2)})`, FONT_REG),
    );

    const addr = (address || "").trim();
    if (addr && videoTotal >= 2.0) {
      const addrFile = path.join(outDir, `${baseName}-addr.txt`);
      fs.writeFileSync(addrFile, addr, "utf8");
      tmpFiles.push(addrFile);
      const addrEnd = Math.min(4.5, videoTotal);
      const addrHold = Math.min(3.5, videoTotal * 0.6);
      const addrSize = Math.max(26, Math.min(42, Math.floor(950 / (addr.length * 0.55))));
      const addrAlpha =
        `if(lt(t,0.8),t/0.8,if(lt(t,${addrHold.toFixed(2)}),1,if(lt(t,${addrEnd.toFixed(2)}),(${addrEnd.toFixed(2)}-t)/${(addrEnd - addrHold).toFixed(2)},0)))`;
      draws.unshift(
        drawCaption(addrFile, addrSize, "60", addrAlpha, `between(t,0,${addrEnd.toFixed(2)})`, FONT_BOLD),
      );
    }
    overlayChain = `;[vbase]${draws.join(",")}[vout]`;
  }

  const videoFadeOut = Math.max(0, videoTotal - 1.0).toFixed(2);
  const videoFadeChain =
    `;[vout]fade=t=in:st=0:d=0.5:color=black,` +
    `fade=t=out:st=${videoFadeOut}:d=1.0:color=black[vfinal]`;

  let finalFilter = filter + overlayChain + videoFadeChain;
  if (musicPath) {
    args.push("-stream_loop", "-1");
    if (musicSeek > 0) args.push("-ss", String(musicSeek));
    args.push("-i", musicPath);
    const fadeOutStart = Math.max(0.1, videoTotal - 3).toFixed(2);
    const audioChain =
      `[${slideCount}:a]volume=0.32,afade=t=in:st=0:d=2,` +
      `afade=t=out:st=${fadeOutStart}:d=3[aout]`;
    finalFilter = `${finalFilter};${audioChain}`;
  }

  args.push("-filter_complex", finalFilter, "-map", "[vfinal]");
  if (musicPath) {
    args.push("-map", "[aout]");
  }
  args.push(
    "-r", String(FPS),
    "-fps_mode", "cfr",
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "18",
    "-pix_fmt", "yuv420p",
    "-profile:v", "high",
    "-level", "4.1",
    "-maxrate", "12M",
    "-bufsize", "24M",
    "-movflags", "+faststart",
  );
  if (musicPath) {
    args.push("-c:a", "aac", "-b:a", "160k", "-t", videoTotal.toFixed(2));
  } else {
    args.push("-an");
  }
  args.push(outPath);

  try {
    await runFfmpeg(args);
  } finally {
    for (const f of tmpFiles) fs.promises.unlink(f).catch(() => {});
  }

  return `/uploads/${filename}`;
}

// Four music moods rendered for every job — the AI clips are generated ONCE,
// then FFmpeg assembles a separate video per mood at zero extra AI cost.
const ALL_MOODS = ["calm", "uplifting", "modern", "tension"] as const;
const MOOD_LABELS: Record<string, string> = {
  calm: "Rolig", uplifting: "Opløftende", modern: "Moderne", tension: "Spændt",
};

async function render(
  jobId: string,
  imagePaths: string[],
  outDir: string,
  address?: string,
): Promise<void> {
  await acquireSlot();
  try {
    const emit = (p: ShowcaseProgress) => setProgress(jobId, p);

    let clipData: AIClipData | null = null;
    if (isFalConfigured()) {
      try {
        clipData = await buildAIClips(imagePaths, outDir, emit);
      } catch (e: any) {
        console.warn("[showcase] AI path failed, falling back to local:", e?.message || e);
        clipData = null;
      }
    }
    if (!clipData) {
      emit({ stage: "compositing", currentClip: 0, totalClips: imagePaths.length, message: "Bruger lokal motor (ingen AI)…" });
    }

    const n = clipData ? clipData.clipPaths.length : Math.min(imagePaths.length, MAX_AI_CLIPS);
    const videoUrls: Record<string, string> = {};
    const cleanVideoUrls: Record<string, string> = {};

    // Assemble 4 mood variants sequentially, each in two passes (postklar + original).
    // FFmpeg is CPU-bound so sequential avoids overloading the box; each pass is ~5-20s.
    for (const mood of ALL_MOODS) {
      emit({ stage: "compositing", currentClip: n, totalClips: n, message: `Sammensætter ${MOOD_LABELS[mood]}…` });
      let inputs: RenderInputs;
      if (clipData) {
        inputs = makeRenderInputsAI(clipData, mood);
      } else {
        inputs = await buildLocalInputs(imagePaths, mood);
      }
      videoUrls[mood] = await assembleVideo(inputs, outDir, address, mood);

      // Clean (no blurred fill) variant — same music/text, crop-to-fill visuals.
      let cleanInputs: RenderInputs;
      if (clipData) {
        cleanInputs = makeRenderInputsAIClean(clipData, mood);
      } else {
        cleanInputs = await buildLocalInputsClean(imagePaths, mood);
      }
      cleanVideoUrls[mood] = await assembleVideo(cleanInputs, outDir, address, `${mood}-clean`);
    }

    // Clean up downloaded AI clips — every mood + clean variant is now done.
    if (clipData) {
      for (const c of clipData.clipPaths) fs.promises.unlink(c).catch(() => {});
    }

    emit({ stage: "complete", currentClip: n, totalClips: n, message: "4 videoer klar!", videoUrls, cleanVideoUrls });
    jobs.set(jobId, {
      status: "completed",
      videoUrls,
      cleanVideoUrls,
      createdAt: Date.now(),
      progress: { stage: "complete", currentClip: n, totalClips: n, message: "4 videoer klar!", videoUrls, cleanVideoUrls },
    });
  } finally {
    releaseSlot();
  }
}

// Kick off an async render. Returns immediately with a jobId the client polls.
export function startShowcaseVideo(
  imagePaths: string[],
  outDir: string,
  address?: string,
): string | null {
  pruneJobs();
  if (activeRenders + waiters.length >= MAX_BACKLOG) {
    return null;
  }
  const jobId = randomUUID();
  const totalClips = Math.min(imagePaths.length, MAX_AI_CLIPS);
  jobs.set(jobId, {
    status: "processing",
    createdAt: Date.now(),
    progress: { stage: "uploading", currentClip: 0, totalClips, message: "Starter op…" },
  });

  render(jobId, imagePaths, outDir, address)
    .catch((err: any) => {
      const cur = jobs.get(jobId);
      jobs.set(jobId, {
        status: "failed",
        error: err?.message || "Render mislykkedes",
        createdAt: Date.now(),
        progress: {
          stage: "failed",
          currentClip: cur?.progress?.currentClip ?? 0,
          totalClips: cur?.progress?.totalClips ?? totalClips,
          message: err?.message || "Generering mislykkedes",
        },
      });
    })
    .finally(() => {
      for (const p of imagePaths) {
        fs.promises.unlink(p).catch(() => {});
      }
    });

  return jobId;
}
