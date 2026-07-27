import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { isFalConfigured, uploadToFal, generateShowcaseClip, generateDroneClip, generateWalkthroughClip, uploadVideoPairToFal, generateAnimationVideo, downloadToFile, selectCameraMove, CameraMove } from "./fal";
import { r2UploadFile } from "./r2";

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

function ffprobeDuration(p: string): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn("ffprobe", [
      "-v", "error", "-select_streams", "v:0",
      "-show_entries", "stream=duration", "-of", "default=noprint_wrappers=1:nokey=1", p,
    ]);
    let out = "";
    proc.stdout.on("data", (d) => (out += d.toString()));
    proc.on("error", () => resolve(5.0));
    proc.on("close", () => {
      const d = parseFloat(out.trim());
      resolve(isFinite(d) && d > 0 ? +d.toFixed(4) : 5.0);
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

// ── Beat grid (period + seek anchor) — used for clip-duration arithmetic ────
// Period = seconds between beats (BPM⁻¹). Seek = music offset so the first
// beat lands at reel t=0.  These are the verified values from manual timing.
//   calm:      80 BPM → 0.750s   modern: 127 BPM → 0.4724s
//   uplifting: 96 BPM → 0.625s   tension: 69 BPM → 0.8696s
const BEAT_GRID: Record<string, { period: number; phase: number }> = {
  // ── Original 4 tracks (manually timed) ────────────────────────────────────
  calm:      { period: 0.7500, phase: 10.728 },
  modern:    { period: 0.4724, phase: 0.650  },
  uplifting: { period: 0.6250, phase: 1.602  },
  tension:   { period: 0.8696, phase: 0.000  },
  // ── 6 Rendy-style tracks (periods derived from actual clip analysis) ───────
  // every_day:  clips are 1.167s (×1), 2.4s (×2), 3.53s (×3) → period≈1.167s
  every_day: { period: 1.1667, phase: 0.100  },
  // old_days:   clip pairs (2.53+0.80=3.33s) → 4 beats → period≈0.833s
  old_days:  { period: 0.8333, phase: 0.120  },
  // on_my_way:  all clips ~1.167s → 1 beat each → period≈1.167s
  on_my_way: { period: 1.1667, phase: 0.241  },
  // open_air:   clips 1.3s (×1) and 2.6s (×2) → period≈1.300s
  open_air:  { period: 1.3000, phase: 0.100  },
  // renegade:   intro clips exactly 4.733s ≈ 8 beats → period≈0.601s (99.7 BPM)
  renegade:  { period: 0.6014, phase: 0.090  },
  // afterdusk:  clips ~1.03s throughout → 1 beat each → period≈1.032s
  afterdusk: { period: 1.0323, phase: 0.060  },
};

// ── Pre-analyzed beat maps (from ffmpeg PCM onset-detection, June 2026) ──────
// Each entry is { t: seconds_from_track_start, e: RMS_energy_0_to_1 }.
// Used by energyPlanAI to make every clip's hold-duration respond to the
// ACTUAL loudness of the music at that moment instead of a fixed position curve.
// High energy → short clip (fast cut). Low energy → long clip (room to breathe).
// The track durations are 22s — looping is handled modulo track length.
interface BeatPoint { t: number; e: number }
const BEAT_MAPS: Record<string, { duration: number; beats: BeatPoint[] }> = {
  calm: {
    duration: 22,
    beats: [
      {t:0.11,e:0.08},{t:0.55,e:0.36},{t:1.22,e:0.61},{t:1.77,e:0.88},
      {t:2.35,e:0.76},{t:2.96,e:0.88},{t:3.59,e:0.67},{t:4.16,e:0.48},
      {t:4.74,e:0.49},{t:5.27,e:0.72},{t:5.96,e:0.86},{t:6.41,e:0.87},
      {t:7.10,e:0.65},{t:7.76,e:0.86},{t:8.35,e:0.73},{t:8.86,e:0.85},
      {t:9.44,e:0.64},{t:9.95,e:0.41},{t:10.72,e:1.00},{t:11.21,e:0.56},
      {t:11.93,e:0.70},{t:12.32,e:0.68},{t:13.06,e:0.56},{t:13.55,e:0.77},
      {t:14.30,e:0.71},{t:14.81,e:0.53},{t:15.26,e:0.82},{t:16.04,e:0.49},
      {t:16.53,e:0.71},{t:17.27,e:1.00},{t:17.72,e:0.86},{t:18.36,e:0.70},
      {t:18.95,e:0.65},{t:19.62,e:0.71},{t:20.05,e:0.83},{t:20.59,e:0.72},
      {t:21.33,e:0.60},{t:21.86,e:0.50},
    ],
  },
  modern: {
    duration: 22,
    beats: [
      {t:0.17,e:0.63},{t:1.57,e:0.61},{t:2.98,e:0.54},{t:4.39,e:0.66},
      {t:5.81,e:0.99},{t:7.20,e:0.49},{t:8.14,e:0.67},{t:10.01,e:0.66},
      {t:10.94,e:0.35},{t:12.38,e:1.00},{t:13.76,e:0.57},{t:15.64,e:0.56},
      {t:16.58,e:0.69},{t:18.45,e:0.69},{t:19.38,e:0.54},{t:21.26,e:0.48},
    ],
  },
  uplifting: {
    duration: 22,
    beats: [
      {t:0.09,e:0.32},{t:0.84,e:0.52},{t:1.59,e:0.58},{t:2.20,e:0.61},
      {t:3.10,e:0.66},{t:3.70,e:0.68},{t:4.60,e:0.51},{t:5.36,e:0.74},
      {t:6.10,e:0.46},{t:6.72,e:0.64},{t:7.45,e:0.82},{t:8.35,e:0.90},
      {t:8.95,e:0.71},{t:9.70,e:0.89},{t:10.59,e:0.68},{t:11.35,e:0.62},
      {t:11.88,e:0.97},{t:12.64,e:1.00},{t:13.44,e:0.88},{t:14.41,e:0.48},
      {t:14.88,e:0.28},{t:15.75,e:0.14},{t:16.40,e:0.06},{t:17.18,e:0.02},
      {t:17.97,e:0.01},{t:18.82,e:0.01},{t:19.39,e:0.01},{t:20.19,e:0.00},
      {t:21.20,e:0.00},{t:21.94,e:0.00},
    ],
  },
  tension: {
    duration: 22,
    beats: [
      {t:0.03,e:0.84},{t:0.57,e:0.79},{t:1.14,e:0.94},{t:1.71,e:0.69},
      {t:2.29,e:0.61},{t:2.86,e:0.46},{t:3.43,e:0.53},{t:4.00,e:0.48},
      {t:4.57,e:0.66},{t:5.14,e:0.68},{t:5.71,e:0.66},{t:6.28,e:0.37},
      {t:6.87,e:0.68},{t:7.43,e:0.51},{t:8.00,e:0.67},{t:8.57,e:0.38},
      {t:9.14,e:0.86},{t:9.72,e:0.53},{t:10.29,e:0.74},{t:10.85,e:0.47},
      {t:11.43,e:0.49},{t:12.00,e:0.35},{t:12.58,e:0.78},{t:13.14,e:0.40},
      {t:13.71,e:0.34},{t:14.29,e:1.00},{t:14.85,e:0.52},{t:15.46,e:0.48},
      {t:16.00,e:0.68},{t:16.57,e:0.52},{t:17.14,e:0.64},{t:17.71,e:0.45},
      {t:18.28,e:0.09},{t:18.85,e:0.04},{t:19.34,e:0.01},{t:20.00,e:0.01},
      {t:20.57,e:0.00},{t:21.03,e:0.00},{t:21.79,e:0.00},
    ],
  },
  // ── 6 Rendy-style tracks (PCM onset-detection, June 2026) ─────────────────
  every_day: {
    duration: 38.68,
    beats: [
      {t:0.10,e:0.15},{t:0.74,e:0.05},{t:1.63,e:0.22},{t:2.48,e:0.29},
      {t:3.72,e:0.18},{t:4.60,e:0.13},{t:5.14,e:0.06},{t:6.06,e:0.25},
      {t:7.22,e:0.21},{t:7.85,e:0.26},{t:8.74,e:0.31},{t:9.61,e:0.85},
      {t:10.53,e:0.46},{t:11.78,e:0.58},{t:12.45,e:0.94},{t:13.46,e:0.85},
      {t:14.36,e:0.94},{t:14.94,e:0.35},{t:15.94,e:0.56},{t:16.78,e:0.83},
      {t:17.92,e:0.46},{t:18.94,e:0.61},{t:19.56,e:0.84},{t:20.60,e:0.86},
      {t:21.48,e:0.82},{t:22.08,e:0.51},{t:22.97,e:1.00},{t:23.87,e:0.81},
      {t:24.76,e:0.43},{t:26.06,e:0.55},{t:26.76,e:0.95},{t:27.72,e:0.69},
      {t:28.62,e:0.65},{t:29.51,e:0.39},{t:30.17,e:1.00},{t:31.00,e:0.85},
      {t:32.33,e:0.64},{t:33.19,e:0.40},{t:33.82,e:0.69},{t:34.71,e:0.89},
      {t:35.88,e:0.43},{t:36.64,e:0.24},{t:37.28,e:0.34},{t:38.19,e:0.10},
    ],
  },
  old_days: {
    duration: 26.62,
    beats: [
      {t:0.12,e:0.47},{t:1.83,e:0.90},{t:3.28,e:0.75},{t:5.07,e:1.00},
      {t:6.58,e:0.81},{t:8.29,e:0.95},{t:9.75,e:0.80},{t:12.21,e:0.53},
      {t:13.81,e:0.56},{t:14.90,e:0.54},{t:17.01,e:0.52},{t:18.61,e:0.58},
      {t:20.21,e:0.49},{t:21.81,e:0.52},{t:23.40,e:0.38},{t:25.01,e:0.31},
    ],
  },
  on_my_way: {
    duration: 9.39,
    beats: [
      {t:0.24,e:1.00},{t:1.40,e:0.84},{t:2.74,e:0.95},{t:4.07,e:0.92},
      {t:5.40,e:0.93},{t:6.74,e:0.75},{t:8.07,e:0.83},{t:9.02,e:0.11},
    ],
  },
  open_air: {
    duration: 22.95,
    beats: [
      {t:0.10,e:0.11},{t:1.39,e:0.18},{t:2.60,e:0.23},{t:3.84,e:0.24},
      {t:4.74,e:0.32},{t:6.13,e:0.30},{t:7.34,e:0.35},{t:8.58,e:0.73},
      {t:9.39,e:0.77},{t:10.98,e:0.50},{t:12.18,e:0.66},{t:13.38,e:0.73},
      {t:14.20,e:0.93},{t:15.74,e:0.34},{t:16.98,e:0.68},{t:18.18,e:0.76},
      {t:19.02,e:1.00},{t:20.58,e:0.56},{t:21.78,e:0.39},{t:22.68,e:0.01},
    ],
  },
  renegade: {
    duration: 37.85,
    beats: [
      {t:0.09,e:0.37},{t:0.51,e:0.58},{t:1.09,e:0.59},{t:1.66,e:0.45},
      {t:2.42,e:0.42},{t:3.09,e:0.48},{t:3.48,e:0.53},{t:4.36,e:0.59},
      {t:4.90,e:0.61},{t:5.28,e:0.56},{t:6.08,e:0.41},{t:6.52,e:0.58},
      {t:7.11,e:0.54},{t:7.71,e:0.54},{t:8.31,e:0.64},{t:8.87,e:0.52},
      {t:9.55,e:0.45},{t:10.23,e:0.27},{t:10.90,e:0.24},{t:11.50,e:0.14},
      {t:11.94,e:0.14},{t:12.53,e:0.05},{t:13.15,e:0.03},{t:13.81,e:0.02},
      {t:14.43,e:0.61},{t:15.18,e:0.77},{t:15.67,e:1.00},{t:16.17,e:0.63},
      {t:16.85,e:0.93},{t:17.46,e:0.94},{t:18.01,e:0.75},{t:18.61,e:0.71},
      {t:19.24,e:0.87},{t:19.85,e:0.83},{t:20.44,e:0.71},{t:21.05,e:0.93},
      {t:21.63,e:0.59},{t:22.12,e:0.69},{t:22.84,e:0.73},{t:23.43,e:0.58},
      {t:24.04,e:0.87},{t:24.66,e:0.94},{t:25.25,e:0.87},{t:25.85,e:0.88},
      {t:26.46,e:0.93},{t:27.03,e:0.57},{t:27.65,e:0.91},{t:28.12,e:0.60},
      {t:28.86,e:0.94},{t:29.45,e:0.83},{t:30.05,e:0.78},{t:30.65,e:0.85},
      {t:31.26,e:0.92},{t:31.72,e:0.76},{t:32.35,e:0.54},{t:32.94,e:0.37},
      {t:33.64,e:0.73},{t:34.25,e:0.74},{t:34.73,e:0.58},{t:35.36,e:0.50},
      {t:36.03,e:0.27},{t:36.63,e:0.21},{t:37.24,e:0.13},
    ],
  },
  afterdusk: {
    duration: 15.45,
    beats: [
      {t:0.06,e:0.33},{t:0.95,e:0.46},{t:1.86,e:1.00},{t:3.25,e:0.61},
      {t:4.32,e:0.49},{t:4.94,e:0.57},{t:5.97,e:0.53},{t:7.42,e:0.59},
      {t:8.33,e:0.70},{t:9.39,e:0.58},{t:10.33,e:0.67},{t:11.11,e:0.61},
      {t:12.14,e:0.36},{t:13.19,e:0.47},{t:14.32,e:0.66},
    ],
  },
};

// Interpolate the normalized RMS energy at a given music timestamp.
// Handles looping by wrapping t modulo the track's duration.
// Returns 0.5 (medium) if the track has no map or is in its silent tail.
function beatEnergyAt(key: string, musicT: number): number {
  const map = BEAT_MAPS[key];
  if (!map || map.beats.length === 0) return 0.5;
  const dur = map.duration;
  const t = ((musicT % dur) + dur) % dur;
  const beats = map.beats;
  // Linear interpolation between surrounding beat points
  for (let i = 0; i < beats.length - 1; i++) {
    if (beats[i].t <= t && beats[i + 1].t >= t) {
      const lo = beats[i], hi = beats[i + 1];
      if (hi.t === lo.t) return lo.e;
      return lo.e + ((t - lo.t) / (hi.t - lo.t)) * (hi.e - lo.e);
    }
  }
  return beats[beats.length - 1].e;
}

// Aim for a punchy ~16s reel; the fast beat cuts fill it by cycling the photos.
const TARGET_TOTAL_SEC = 16;
// No music => no beat to follow, so cut at this snappy fixed pace.
const SILENT_SLIDE_SEC = 0.7;
// Hard cap on clip count so a huge upload can't blow up encode time.
const MAX_SLIDES = 48;
// Roughly how long a photo should hold; snapped to a whole number of beats so a
// fast track (short period) cuts every beat and a slow one every 2 beats.
const TARGET_SLIDE_SEC = 0.50;

// ── AI path tuning ────────────────────────────────────────────────────────────
// Each AI clip is a PAID asset, so we never cycle them — one clip per photo. Cap
// the count so a giant upload can't run up a huge bill / render time.
const MAX_AI_CLIPS = 8;
// AI clips carry their OWN visible camera move, so slides hold longer than the
// fast local cuts (a 0.5s window would hide the dolly). Aim for ~this total and
// keep each slide between MIN/MAX (MAX must stay under the 5s source clip).
const AI_TARGET_TOTAL_SEC = 15;
const AI_MIN_SLIDE_SEC = 1.6;
const AI_MAX_SLIDE_SEC = 4.6;

// Beat counts per energy level — determines how many beats each clip holds.
// Durations must land in [AI_MIN, AI_MAX] for all track periods:
//   calm(0.75s):  short=3→2.25  medium=4→3.00  long=5→3.75
//   modern(0.47s):short=4→1.89  medium=6→2.83  long=9→4.25
//   uplifting(0.625s):short=3→1.88 medium=5→3.13 long=7→4.38
//   tension(0.87s):short=2→1.74 medium=3→2.61  long=5→4.35
type EnergyLevel = "short" | "medium" | "long";
const ENERGY_BEATS: Record<string, Record<EnergyLevel, number>> = {
  // Original 4 tracks — energy-based (section structure varies per energy level)
  calm:      { short: 3, medium: 4, long: 5 },
  modern:    { short: 4, medium: 6, long: 9 },
  uplifting: { short: 3, medium: 5, long: 7 },
  tension:   { short: 2, medium: 3, long: 5 },
  // Rendy-style tracks — used as fallback only (section plan takes priority)
  // period 1.1667s: short=2→2.33s, medium=3→3.50s, long=3→3.50s
  every_day: { short: 2, medium: 3, long: 3 },
  // period 0.8333s: short=2→1.67s, medium=3→2.50s, long=4→3.33s
  old_days:  { short: 2, medium: 3, long: 4 },
  // period 1.1667s: short=2→2.33s, medium=2→2.33s, long=3→3.50s
  on_my_way: { short: 2, medium: 2, long: 3 },
  // period 1.3000s: short=2→2.60s, medium=2→2.60s, long=3→3.90s
  open_air:  { short: 2, medium: 2, long: 3 },
  // period 0.6014s: short=3→1.80s, medium=5→3.01s, long=7→4.21s
  renegade:  { short: 3, medium: 5, long: 7 },
  // period 1.0323s: short=2→2.06s, medium=2→2.06s, long=3→3.10s
  afterdusk: { short: 2, medium: 2, long: 3 },
};

// ── Section-based composition plans for Rendy-style tracks ────────────────────
// Instead of pure energy-reactive cuts, these tracks use PREDETERMINED section
// structures copied from reverse-engineering Rendy.io's editorial style.
// The function receives (clipIndex, totalClips) and returns beats-per-clip.
//
//  renegade:   cinematic slow open (3 clips × 7 beats = 4.21s), then rapid drop
//  old_days:   perfect heartbeat — alternating 3/2 beats (long-short-long-short)
//  every_day:  medium open, broader mid, medium close  (2-3-2 beat arc)
//  on_my_way:  fast and consistent throughout (all 2 beats)
//  open_air:   short-short open, long airy mid, short close
//  afterdusk:  dark and hypnotic, consistent 2-beat throughout
const SECTION_PLANS: Record<string, (i: number, n: number) => number> = {
  renegade:  (i, n) => i < Math.min(3, Math.ceil(n * 0.4)) ? 7 : 3,
  old_days:  (i)    => i % 2 === 0 ? 3 : 2,
  every_day: (i, n) => (i >= 2 && i <= n - 3) ? 3 : 2,
  on_my_way: ()     => 2,
  open_air:  (i, n) => (i >= 2 && i <= n - 3) ? 3 : 2,
  afterdusk: ()     => 2,
};

// Energy thresholds: these control how the actual audio energy maps to cut speed.
// High energy (loud beat) → cut sooner. Low energy (quiet) → hold longer.
const ENERGY_HIGH = 0.72;
const ENERGY_MED  = 0.45;

// Compute per-clip durations driven by ACTUAL audio energy at each music position.
// Each clip holds for N beats; N is determined by the music's loudness at that
// exact moment — making every reel feel uniquely alive and dynamically edited.
function energyPlanAI(
  musicKey: string | undefined,
  n: number,
): { durations: number[]; musicSeek: number } {
  const key = !musicKey || musicKey === "none" ? null : musicKey;
  const grid = key ? BEAT_GRID[key] : undefined;

  if (!grid) {
    const dur = +(Math.min(AI_MAX_SLIDE_SEC, Math.max(AI_MIN_SLIDE_SEC, AI_TARGET_TOTAL_SEC / n)).toFixed(3));
    return { durations: Array(n).fill(dur), musicSeek: 0 };
  }

  // Music seek: phase % period gives the offset into the track so beat 0 = reel t=0.
  let seek = grid.phase % grid.period;
  if (seek < 0) seek += grid.period;

  // ── Section-based plan (Rendy-style tracks) ──────────────────────────────
  // These tracks have a PREDETERMINED editorial structure (slow intro → fast drop,
  // alternating heartbeat, etc.). We follow that structure exactly rather than
  // reacting to per-beat energy — it's how professional editors actually work.
  const sectionFn = SECTION_PLANS[key];
  if (sectionFn) {
    const durations = Array.from({ length: n }, (_, i) => {
      let beats = sectionFn(i, n);
      let dur = beats * grid.period;
      // Hard-clamp to AI limits without losing the beat rhythm
      while (dur > AI_MAX_SLIDE_SEC && beats > 1) { beats--; dur = beats * grid.period; }
      while (dur < AI_MIN_SLIDE_SEC)               { beats++; dur = beats * grid.period; }
      return +dur.toFixed(4);
    });
    const total = durations.reduce((a, b) => a + b, 0);
    console.log(`[showcase] section plan (${key}, ${n} clips): [${durations.join(", ")}]s = ${total.toFixed(2)}s total`);
    return { durations, musicSeek: +seek.toFixed(3) };
  }

  // ── Energy-reactive plan (original 4 tracks) ──────────────────────────────
  // Walk forward through the reel, sampling audio energy at each clip's start.
  const beatMap = ENERGY_BEATS[key];
  if (!beatMap) {
    const dur = +(Math.min(AI_MAX_SLIDE_SEC, Math.max(AI_MIN_SLIDE_SEC, AI_TARGET_TOTAL_SEC / n)).toFixed(3));
    return { durations: Array(n).fill(dur), musicSeek: +seek.toFixed(3) };
  }

  let reelT = 0;
  const durations: number[] = [];
  for (let i = 0; i < n; i++) {
    const musicT = reelT + seek;
    const energy = beatEnergyAt(key, musicT);

    // Map energy → beat count
    let beats = energy > ENERGY_HIGH ? beatMap.short
              : energy > ENERGY_MED  ? beatMap.medium
              :                        beatMap.long;

    let dur = beats * grid.period;
    // Clamp to AI clip limits
    while (dur > AI_MAX_SLIDE_SEC && beats > 1) { beats--; dur = beats * grid.period; }
    while (dur < AI_MIN_SLIDE_SEC)               { beats++; dur = beats * grid.period; }

    durations.push(+dur.toFixed(4));
    reelT += dur;
  }

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
const AI_CLIP_CONCURRENCY = 6;

// Even-rounded value — x264/yuv420p needs even pixel dimensions and offsets.
const even = (v: number) => Math.max(2, Math.round(v / 2) * 2);

// Build ONE slide: the full (uncropped) photo on a blurred fill of itself, plus a
// gimbal-style camera move. We never crop the photo to fill the 9:16 frame — the
// whole image is always on screen, letterboxed by a blurred, slightly darkened
// copy of itself so the clip is social-ready. The sharp foreground and the blurred
// background move by DIFFERENT amounts, which reads as real depth/parallax — the
// "shot on a gimbal" look. Moves cycle per slide: dolly-in, crab-right, dolly-out,
// crab-left.
// Rendy-matched 5-move vocabulary for the local Ken Burns fallback path.
// `moveType` is pre-computed by selectCameraMove() based on each image's
// aspect ratio — same logic as the Kling AI path.
function buildSlide(i: number, dims: { w: number; h: number }, frames: number, moveType: CameraMove): string {
  const fm1 = Math.max(1, frames - 1);
  const f = Math.min(W / dims.w, H / dims.h); // fit-whole factor
  const fw = even(dims.w * f);
  const fh = even(dims.h * f);
  const cx = even((W - fw) / 2);
  const cy = even((H - fh) / 2);
  // Slide/parallax moves inset the photo to 90% so it can travel sideways and
  // still stay fully on screen — the freed margin reveals the blurred fill.
  const f9 = f * 0.9;
  const fw9 = even(dims.w * f9);
  const fh9 = even(dims.h * f9);
  const cx9 = even((W - fw9) / 2);
  const cy9 = even((H - fh9) / 2);
  const amp = Math.max(2, cx9); // horizontal travel kept inside the margin

  // Blurred-fill background: scale to COVER the frame, blur + darken, gentle drift.
  const bgLayer = (z: string, x: string) =>
    `[${i}:v]split=2[a${i}][b${i}];` +
    `[a${i}]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},` +
    `boxblur=26:2,eq=brightness=-0.05,setsar=1,` +
    `zoompan=z='${z}':d=${frames}:x='${x}':y='ih/2-(ih/zoom/2)':s=${W}x${H}:fps=${FPS},setsar=1[bg${i}];`;

  // Ease-in-out via cosine: smooth = (1 - cos(PI * on/fm1)) / 2
  // NOTE: `on` is valid in zoompan; overlay filters require `n` instead.
  const easeExpr    = `(1-cos(3.14159265*on/${fm1}))/2`;   // zoompan variable
  const easeExprOvl = `(1-cos(3.14159265*n/${fm1}))/2`;    // overlay variable
  // Linear ease centred on 0: -1 at start → +1 at end
  const easeLinear    = `(${easeExpr}*2-1)`;
  const easeLinearOvl = `(${easeExprOvl}*2-1)`;

  // Shared fg color-grade (warm Nordic pop)
  const fgGrade = `eq=brightness=0.04:contrast=1.08:saturation=1.06:gamma_r=1.03:gamma_b=0.97`;

  // ── Push In ──────────────────────────────────────────────────────────────────
  // Camera glides forward; bg gently pulls back → strong depth sensation.
  if (moveType === "push_in") {
    const fgZ = `min(1.18,1.0+0.18*(${easeExpr}))`;
    const bgZ = `max(1.10,1.14-0.04*(${easeExpr}))`;
    return (
      bgLayer(bgZ, `iw/2-(iw/zoom/2)`) +
      `[b${i}]scale=${fw}:${fh},${fgGrade},setsar=1,` +
      `zoompan=z='${fgZ}':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${fw}x${fh}:fps=${FPS},setsar=1[fg${i}];` +
      `[bg${i}][fg${i}]overlay=x=${cx}:y=${cy},format=yuv420p,setsar=1[v${i}]`
    );
  }

  // ── Slide Right ──────────────────────────────────────────────────────────────
  // Clean lateral pan right; bg drifts slightly left (subtle parallax).
  if (moveType === "slide_right") {
    const panAmt = Math.round(amp * 1.5);
    const ovx = `min(max(${cx9}+${panAmt}*${easeLinearOvl},0),${W - fw9})`;
    const bgx = `iw/2-(iw/zoom/2)-28*${easeLinear}`;
    return (
      bgLayer(`1.06`, bgx) +
      `[b${i}]scale=${fw9}:${fh9},${fgGrade},setsar=1[fg${i}];` +
      `[bg${i}][fg${i}]overlay=x='${ovx}':y=${cy9}:eof_action=repeat:repeatlast=1,format=yuv420p,setsar=1[v${i}]`
    );
  }

  // ── Slide Left ───────────────────────────────────────────────────────────────
  // Clean lateral pan left; bg drifts slightly right (subtle parallax).
  if (moveType === "slide_left") {
    const panAmt = Math.round(amp * 1.5);
    const ovx = `min(max(${cx9}-${panAmt}*${easeLinearOvl},0),${W - fw9})`;
    const bgx = `iw/2-(iw/zoom/2)+28*${easeLinear}`;
    return (
      bgLayer(`1.06`, bgx) +
      `[b${i}]scale=${fw9}:${fh9},${fgGrade},setsar=1[fg${i}];` +
      `[bg${i}][fg${i}]overlay=x='${ovx}':y=${cy9}:eof_action=repeat:repeatlast=1,format=yuv420p,setsar=1[v${i}]`
    );
  }

  // ── Parallax Right ───────────────────────────────────────────────────────────
  // Stronger BG counter-drift (50px vs 28px) = pronounced depth separation.
  if (moveType === "parallax_right") {
    const panAmt = Math.round(amp * 1.5);
    const ovx = `min(max(${cx9}+${panAmt}*${easeLinearOvl},0),${W - fw9})`;
    const bgx = `iw/2-(iw/zoom/2)-50*${easeLinear}`;
    return (
      bgLayer(`1.08`, bgx) +
      `[b${i}]scale=${fw9}:${fh9},${fgGrade},setsar=1[fg${i}];` +
      `[bg${i}][fg${i}]overlay=x='${ovx}':y=${cy9}:eof_action=repeat:repeatlast=1,format=yuv420p,setsar=1[v${i}]`
    );
  }

  // ── Parallax Left (default) ──────────────────────────────────────────────────
  // Mirror of Parallax Right — strongest counter-drift of all moves.
  const panAmt = Math.round(amp * 1.5);
  const ovx = `min(max(${cx9}-${panAmt}*${easeLinearOvl},0),${W - fw9})`;
  const bgx = `iw/2-(iw/zoom/2)+50*${easeLinear}`;
  return (
    bgLayer(`1.08`, bgx) +
    `[b${i}]scale=${fw9}:${fh9},${fgGrade},setsar=1[fg${i}];` +
    `[bg${i}][fg${i}]overlay=x='${ovx}':y=${cy9}:eof_action=repeat:repeatlast=1,format=yuv420p,setsar=1[v${i}]`
  );
}

// ── CutStyle ──────────────────────────────────────────────────────────────────
// Bruges af brugeren til at vælge sammenklipningsstil:
//  "clean"     — ultra-korte dissolves (0.06 s) der føles som rene klip à la Rendy
//  "cinematic" — bløde dissolves (12-20% af kliplængde, maks 0.30 s), vores standard
export type CutStyle = "clean" | "cinematic";

function computeFadeDur(minDur: number, cutStyle?: CutStyle): number {
  if (cutStyle === "clean") return 0.06;
  return parseFloat(Math.min(0.30, minDur * 0.12).toFixed(3));
}

// Build chained xfade transitions between slide labels [v0]..[vN-1].
// offset for step i = sum(durations[0..i]) - (i+1)*fadeDur — keeps every
// transition starting at the END-fadeDur point of each slide in stream time.
function buildXfadeConcat(n: number, durations: number[], fadeDur: number): string {
  let cumDur = 0;
  const xfades: string[] = [];
  for (let i = 0; i < n - 1; i++) {
    const inputA = i === 0 ? `[v0]` : `[xf${i}]`;
    const inputB = `[v${i + 1}]`;
    const output = i === n - 2 ? `[vbase]` : `[xf${i + 1}]`;
    cumDur += durations[i];
    const offset = Math.max(0, cumDur - (i + 1) * fadeDur);
    xfades.push(`${inputA}${inputB}xfade=transition=fade:duration=${fadeDur.toFixed(3)}:offset=${offset.toFixed(4)}${output}`);
  }
  return xfades.join(";");
}

// Build the filter_complex graph: one gimbal slide per photo joined with smooth
// xfade crossfades. `durations[i]` is each slide's length in seconds.
// `moves[i]` is the pre-selected CameraMove for each slide (Rendy vocabulary).
function buildFilter(n: number, durations: number[], sizes: Array<{ w: number; h: number }>, moves: CameraMove[], cutStyle?: CutStyle): string {
  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    const frames = Math.max(2, Math.round(durations[i] * FPS));
    parts.push(buildSlide(i, sizes[i], frames, moves[i] ?? "push_in"));
  }

  if (n === 1) {
    parts.push(`[v0]null[vbase]`);
    return parts.join(";");
  }

  const minDur = Math.min(...durations);
  const fadeDur = cutStyle === "clean" ? 0.06 : parseFloat(Math.min(0.25, minDur * 0.2).toFixed(3));
  parts.push(buildXfadeConcat(n, durations, fadeDur));
  return parts.join(";");
}

// How many seconds to skip at the START of each Kling clip.
// Kling v1.6 Pro has a short ramp-up (~0.15s) before the camera starts moving.
// Skipping it means every cut opens with the shot already in motion.
const KLING_RAMPUP = 0.15;

// Nordic color grade for AI clips: slightly cool, airy, professional.
// gamma_r/b shift the white balance toward daylight; mild desaturation keeps
// it clean without looking over-processed.
const NORDIC_GRADE = `eq=brightness=0.04:contrast=1.06:saturation=0.92:gamma_r=0.96:gamma_g=0.98:gamma_b=1.06`;

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
  const start = KLING_RAMPUP.toFixed(4);
  const end   = (slideDur + KLING_RAMPUP).toFixed(4);
  return (
    `[${i}:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS,fps=${FPS},split=2[a${i}][b${i}];` +
    `[a${i}]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},` +
    `boxblur=26:2,eq=brightness=-0.05,setsar=1[bg${i}];` +
    `[b${i}]scale=${fw}:${fh},${NORDIC_GRADE},setsar=1[fg${i}];` +
    `[bg${i}][fg${i}]overlay=x=${cx}:y=${cy},format=yuv420p,setsar=1[v${i}]`
  );
}

// Filter graph for the AI path: one trimmed clip per slide, joined with smooth
// xfade crossfades so scene changes feel cinematic rather than abrupt.
function buildFilterVideo(n: number, durations: number[], sizes: Array<{ w: number; h: number }>, cutStyle?: CutStyle): string {
  const parts: string[] = [];
  for (let i = 0; i < n; i++) parts.push(buildSlideVideo(i, sizes[i], durations[i]));
  if (n === 1) { parts.push(`[v0]null[vbase]`); return parts.join(";"); }
  const minDur = Math.min(...durations);
  const fadeDur = computeFadeDur(minDur, cutStyle);
  parts.push(buildXfadeConcat(n, durations, fadeDur));
  return parts.join(";");
}

// Landscape output dimensions for the "Original" download variant (16:9 HD).
const WL = 1920;
const HL = 1080;

// "Clean" (no blurred fill) slide for an AI VIDEO clip — 9:16 crop-to-fill.
// Skips the Kling ramp-up, applies Nordic grade, and crop-fills the frame.
function buildSlideVideoClean(i: number, dims: { w: number; h: number }, slideDur: number): string {
  const start = KLING_RAMPUP.toFixed(4);
  const end   = (slideDur + KLING_RAMPUP).toFixed(4);
  return (
    `[${i}:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS,fps=${FPS},` +
    `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},` +
    `${NORDIC_GRADE},format=yuv420p,setsar=1[v${i}]`
  );
}

function buildFilterVideoClean(n: number, durations: number[], sizes: Array<{ w: number; h: number }>, cutStyle?: CutStyle): string {
  const parts: string[] = [];
  for (let i = 0; i < n; i++) parts.push(buildSlideVideoClean(i, sizes[i], durations[i]));
  if (n === 1) { parts.push(`[v0]null[vbase]`); return parts.join(";"); }
  const minDur = Math.min(...durations);
  const fadeDur = computeFadeDur(minDur, cutStyle);
  parts.push(buildXfadeConcat(n, durations, fadeDur));
  return parts.join(";");
}

// Landscape (1920×1080) "Original" slide for an AI VIDEO clip — crop-to-fill 16:9.
function buildSlideVideoCleanLandscape(i: number, dims: { w: number; h: number }, slideDur: number): string {
  const start = KLING_RAMPUP.toFixed(4);
  const end   = (slideDur + KLING_RAMPUP).toFixed(4);
  return (
    `[${i}:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS,fps=${FPS},` +
    `scale=${WL}:${HL}:force_original_aspect_ratio=increase,crop=${WL}:${HL},` +
    `${NORDIC_GRADE},format=yuv420p,setsar=1[v${i}]`
  );
}

function buildFilterVideoCleanLandscape(n: number, durations: number[], sizes: Array<{ w: number; h: number }>, cutStyle?: CutStyle): string {
  const parts: string[] = [];
  for (let i = 0; i < n; i++) parts.push(buildSlideVideoCleanLandscape(i, sizes[i], durations[i]));
  if (n === 1) { parts.push(`[v0]null[vbase]`); return parts.join(";"); }
  const minDur = Math.min(...durations);
  const fadeDur = computeFadeDur(minDur, cutStyle);
  parts.push(buildXfadeConcat(n, durations, fadeDur));
  return parts.join(";");
}

// "Clean" slide for a LOCAL PHOTO — crop-to-fill 9:16, Rendy 5-move vocabulary.
function buildSlideClean(i: number, dims: { w: number; h: number }, frames: number, moveType: CameraMove): string {
  const fm1 = Math.max(1, frames - 1);
  const easeExpr = `(1-cos(3.14159265*on/${fm1}))/2`;
  const easeLinear = `(${easeExpr}*2-1)`;
  const bigW = even(Math.ceil(W * 1.20));
  const bigH = even(Math.ceil(H * 1.20));
  const grade = `eq=brightness=0.04:contrast=1.08:saturation=1.06:gamma_r=1.03:gamma_b=0.97`;
  let z: string, panX: string, panY = `ih/2-(ih/zoom/2)`;
  if (moveType === "push_in")        { z = `min(1.18,1.0+0.18*(${easeExpr}))`; panX = `iw/2-(iw/zoom/2)`; }
  else if (moveType === "slide_right"){ z = `1.10`; panX = `iw/2-(iw/zoom/2)+38*${easeLinear}`; }
  else if (moveType === "slide_left") { z = `1.10`; panX = `iw/2-(iw/zoom/2)-38*${easeLinear}`; }
  else if (moveType === "parallax_right") { z = `1.12`; panX = `iw/2-(iw/zoom/2)+50*${easeLinear}`; }
  else                               { z = `1.12`; panX = `iw/2-(iw/zoom/2)-50*${easeLinear}`; } // parallax_left
  return (
    `[${i}:v]scale=${bigW}:${bigH}:force_original_aspect_ratio=increase,setsar=1,` +
    `${grade},` +
    `zoompan=z='${z}':d=${frames}:x='${panX}':y='${panY}':s=${W}x${H}:fps=${FPS},` +
    `format=yuv420p,setsar=1[v${i}]`
  );
}

function buildFilterClean(n: number, durations: number[], sizes: Array<{ w: number; h: number }>, moves: CameraMove[], cutStyle?: CutStyle): string {
  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    const frames = Math.max(2, Math.round(durations[i] * FPS));
    parts.push(buildSlideClean(i, sizes[i], frames, moves[i] ?? "push_in"));
  }
  if (n === 1) { parts.push(`[v0]null[vbase]`); return parts.join(";"); }
  const minDur = Math.min(...durations);
  const fadeDur = cutStyle === "clean" ? 0.06 : parseFloat(Math.min(0.25, minDur * 0.2).toFixed(3));
  parts.push(buildXfadeConcat(n, durations, fadeDur));
  return parts.join(";");
}

// Landscape (1920×1080) "Original" slide for a LOCAL PHOTO — crop-to-fill 16:9, Rendy 5-move vocabulary.
function buildSlideCleanLandscape(i: number, dims: { w: number; h: number }, frames: number, moveType: CameraMove): string {
  const fm1 = Math.max(1, frames - 1);
  const easeExpr = `(1-cos(3.14159265*on/${fm1}))/2`;
  const easeLinear = `(${easeExpr}*2-1)`;
  const bigW = even(Math.ceil(WL * 1.20));
  const bigH = even(Math.ceil(HL * 1.20));
  const grade = `eq=brightness=0.04:contrast=1.08:saturation=1.06:gamma_r=1.03:gamma_b=0.97`;
  let z: string, panX: string, panY = `ih/2-(ih/zoom/2)`;
  if (moveType === "push_in")        { z = `min(1.18,1.0+0.18*(${easeExpr}))`; panX = `iw/2-(iw/zoom/2)`; }
  else if (moveType === "slide_right"){ z = `1.10`; panX = `iw/2-(iw/zoom/2)+38*${easeLinear}`; }
  else if (moveType === "slide_left") { z = `1.10`; panX = `iw/2-(iw/zoom/2)-38*${easeLinear}`; }
  else if (moveType === "parallax_right") { z = `1.12`; panX = `iw/2-(iw/zoom/2)+50*${easeLinear}`; }
  else                               { z = `1.12`; panX = `iw/2-(iw/zoom/2)-50*${easeLinear}`; } // parallax_left
  return (
    `[${i}:v]scale=${bigW}:${bigH}:force_original_aspect_ratio=increase,setsar=1,` +
    `${grade},` +
    `zoompan=z='${z}':d=${frames}:x='${panX}':y='${panY}':s=${WL}x${HL}:fps=${FPS},` +
    `format=yuv420p,setsar=1[v${i}]`
  );
}

function buildFilterCleanLandscape(n: number, durations: number[], sizes: Array<{ w: number; h: number }>, moves: CameraMove[], cutStyle?: CutStyle): string {
  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    const frames = Math.max(2, Math.round(durations[i] * FPS));
    parts.push(buildSlideCleanLandscape(i, sizes[i], frames, moves[i] ?? "push_in"));
  }
  if (n === 1) { parts.push(`[v0]null[vbase]`); return parts.join(";"); }
  const minDur = Math.min(...durations);
  const fadeDur = cutStyle === "clean" ? 0.06 : parseFloat(Math.min(0.25, minDur * 0.2).toFixed(3));
  parts.push(buildXfadeConcat(n, durations, fadeDur));
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
  "Forma Estates  |  +45 70 70 70 70  |  kontakt@formaestates.com";

// White text centred inside a thin semi-transparent dark box — the pill/bar look
// seen on premium real-estate reels. `box=1` draws the background rect; `boxborderw`
// adds padding inside the box around the text.
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
    `box=1:boxcolor=black@0.50:boxborderw=14:` +
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

// Variable durations for the LOCAL (still-image / Ken Burns fallback) path.
// Uses the same beat-energy system as energyPlanAI — actual audio loudness
// determines how long each slide holds, not just its position in the reel.
function localEnergyPlan(musicKey: string | undefined, n: number): { durations: number[]; musicSeek: number } {
  const key = !musicKey || musicKey === "none" ? null : musicKey;
  const grid = key ? BEAT_GRID[key] : undefined;

  if (!grid) {
    return { durations: Array(n).fill(SILENT_SLIDE_SEC), musicSeek: 0 };
  }

  const MIN_LOCAL = 0.5;
  const MAX_LOCAL = 4.0;

  let seek = grid.phase % grid.period;
  if (seek < 0) seek += grid.period;

  // Section-based plan (same logic as AI path — Ken Burns clips follow same arc)
  const sectionFn = SECTION_PLANS[key];
  if (sectionFn) {
    const durations = Array.from({ length: n }, (_, i) => {
      let beats = sectionFn(i, n);
      let dur = beats * grid.period;
      while (dur > MAX_LOCAL && beats > 1) { beats--; dur = beats * grid.period; }
      while (dur < MIN_LOCAL)              { beats++; dur = beats * grid.period; }
      return +dur.toFixed(4);
    });
    const total = durations.reduce((a, b) => a + b, 0);
    console.log(`[showcase] local section plan (${key}, ${n} slides): [${durations.join(", ")}]s = ${total.toFixed(2)}s`);
    return { durations, musicSeek: +seek.toFixed(3) };
  }

  // Energy-reactive plan (original 4 tracks)
  const beatMap = ENERGY_BEATS[key];
  if (!beatMap) {
    return { durations: Array(n).fill(SILENT_SLIDE_SEC), musicSeek: +seek.toFixed(3) };
  }

  let reelT = 0;
  const durations: number[] = [];
  for (let i = 0; i < n; i++) {
    const energy = beatEnergyAt(key, reelT + seek);
    let beats = energy > ENERGY_HIGH ? beatMap.short
              : energy > ENERGY_MED  ? beatMap.medium
              :                        beatMap.long;
    let dur = beats * grid.period;
    while (dur > MAX_LOCAL && beats > 1) { beats--; dur = beats * grid.period; }
    while (dur < MIN_LOCAL)              { beats++; dur = beats * grid.period; }
    durations.push(+dur.toFixed(4));
    reelT += dur;
  }

  const total = durations.reduce((a, b) => a + b, 0);
  console.log(`[showcase] local energy plan (${key}, ${n} slides): [${durations.join(", ")}]s = ${total.toFixed(2)}s`);
  return { durations, musicSeek: +seek.toFixed(3) };
}

// FALLBACK (free, local): cycle the photos to fill a punchy reel and fake the
// gimbal move with split-layer zoompan on each still. Variable clip lengths
// follow the mood's energy sequence; transitions use xfade crossfades.
async function buildLocalInputs(imagePaths: string[], musicKey?: string, cutStyle?: CutStyle): Promise<RenderInputs> {
  const n = imagePaths.length;
  const { durations: baseDurations, musicSeek } = localEnergyPlan(musicKey, n);
  const avgBase = baseDurations.reduce((a, b) => a + b, 0) / n;
  const slideCount = Math.min(MAX_SLIDES, Math.max(n, Math.round(TARGET_TOTAL_SEC / avgBase)));
  const inputPaths: string[] = [];
  const durations: number[] = [];
  for (let k = 0; k < slideCount; k++) {
    inputPaths.push(imagePaths[k % n]);
    durations.push(baseDurations[k % n]);
  }
  const sizeCache = new Map<string, { w: number; h: number }>();
  const sizes: Array<{ w: number; h: number }> = [];
  for (const p of inputPaths) {
    let s = sizeCache.get(p);
    if (!s) { s = await ffprobeSize(p); sizeCache.set(p, s); }
    sizes.push(s);
  }
  // Select per-slide camera move based on image aspect ratio (Rendy approach)
  const moves: CameraMove[] = sizes.map((s, idx) =>
    selectCameraMove(s.w / s.h, idx, sizes.length)
  );
  const avgSlide = +(durations.reduce((a, b) => a + b, 0) / slideCount).toFixed(3);
  const filter = buildFilter(slideCount, durations, sizes, moves, cutStyle);
  return { inputPaths, slideCount, slideDur: avgSlide, durations, musicSeek, filter, tmpClips: [] };
}

// Thin struct holding the downloaded AI clips and their pixel sizes — the
// mood-independent part of a paid Kling generation pass. The energy plan (clip
// durations) is computed per mood in makeRenderInputsAI so the same clips are
// assembled into every mood variant without a second Kling API call.
interface AIClipData {
  clipPaths: string[];
  sizes: Array<{ w: number; h: number }>;
  durations: number[]; // actual Seedance clip lengths from ffprobe
}

// PRIMARY (paid AI): turn each photo (capped) into one real Kling 2.1 i2v clip
// with a genuine camera move, generated in PARALLEL. Returns null if EVERY clip
// failed so the caller can fall back to the free local engine.
async function buildAIClips(
  imagePaths: string[],
  outDir: string,
  droneMode: boolean,
  onProgress?: (p: ShowcaseProgress) => void,
): Promise<AIClipData | null> {
  // In drone mode: image[0] + image[1] become a SINGLE Kling start+end-frame
  // transition clip. The remaining images (2+) use normal gimbal prompts.
  // In normal mode: every image gets its own gimbal clip.
  const allPhotos = imagePaths.slice(0, MAX_AI_CLIPS);
  const dronePhotos = droneMode && allPhotos.length >= 2 ? allPhotos.slice(0, 2) : [];
  const gimbalPhotos = droneMode && allPhotos.length >= 2 ? allPhotos.slice(2) : allPhotos;
  const totalClips = (dronePhotos.length >= 2 ? 1 : 0) + gimbalPhotos.length;

  onProgress?.({ stage: "uploading", currentClip: 0, totalClips: totalClips, message: `Uploader ${allPhotos.length} billeder…` });

  // Upload all images in parallel
  const allUploads = await Promise.all(
    allPhotos.map((p) =>
      uploadToFal(p)
        .then((url) => url)
        .catch((e) => {
          console.warn("[showcase] upload failed:", e?.message || e);
          return null;
        }),
    ),
  );

  let done = 0;
  onProgress?.({ stage: "generating", currentClip: 0, totalClips: totalClips, message: `Laver AI-klip 0/${totalClips}…` });

  const clipPaths: string[] = [];

  // --- Drone transition clip (image[0] → image[1]) ---
  if (dronePhotos.length >= 2) {
    const [startUrl, endUrl] = [allUploads[0], allUploads[1]];
    if (startUrl && endUrl) {
      try {
        console.log("[showcase] generating drone transition clip (start+end frame)…");
        const { videoUrl } = await generateDroneClip(startUrl, endUrl);
        const dest = path.join(outDir, `clip-drone-${Date.now()}.mp4`);
        await downloadToFile(videoUrl, dest);
        clipPaths.push(dest);
        done++;
        onProgress?.({ stage: "generating", currentClip: done, totalClips: totalClips, message: `Laver AI-klip ${done}/${totalClips}…` });
      } catch (e: any) {
        console.warn("[showcase] drone clip failed:", e?.message || e);
        done++;
      }
    } else {
      done++;
    }
  }

  // --- Normal gimbal clips (images[2+] in drone mode, or all images in normal mode) ---
  const gimbalUploads = droneMode && allPhotos.length >= 2
    ? allUploads.slice(2)
    : allUploads;
  // gimbal clip index offset so prompt variety isn't always "slot 0"
  const idxOffset = dronePhotos.length >= 2 ? 1 : 0;

  // Pre-probe each gimbal photo's dimensions to select the best camera move
  // per image — same logic as Rendy.io's AI analysis (perspective, aspect ratio).
  const gimbalSizes = await Promise.all(
    gimbalPhotos.map((p) =>
      ffprobeSize(p).catch(() => ({ w: 1, h: 1 }))
    )
  );
  const gimbalTotal = gimbalPhotos.length;

  const gimbalClips = await mapLimit(gimbalUploads, AI_CLIP_CONCURRENCY, async (url, j) => {
    if (!url) return null;
    const i = j + idxOffset;
    const ar = gimbalSizes[j] ? gimbalSizes[j].w / gimbalSizes[j].h : 1.0;
    const move = selectCameraMove(ar, j, gimbalTotal);
    try {
      console.log(`[showcase] gimbal clip ${i} (${move}, ar=${ar.toFixed(2)})…`);
      const { videoUrl } = await generateShowcaseClip(url, move);
      const dest = path.join(
        outDir,
        `clip-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}.mp4`,
      );
      await downloadToFile(videoUrl, dest);
      done++;
      onProgress?.({ stage: "generating", currentClip: done, totalClips: totalClips, message: `Laver AI-klip ${done}/${totalClips}…` });
      return dest;
    } catch (e: any) {
      console.warn(`[showcase] gimbal clip ${i} (${move}) failed:`, e?.message || e);
      done++;
      onProgress?.({ stage: "generating", currentClip: done, totalClips: totalClips, message: `Laver AI-klip ${done}/${totalClips}… (et klip fejlede)` });
      return null;
    }
  });

  clipPaths.push(...gimbalClips.filter((c): c is string => !!c));

  if (clipPaths.length === 0) return null;

  try {
    const sizes: Array<{ w: number; h: number }> = [];
    const durations: number[] = [];
    for (const c of clipPaths) {
      sizes.push(await ffprobeSize(c));
      durations.push(await ffprobeDuration(c));
    }
    return { clipPaths, sizes, durations };
  } catch (e) {
    for (const c of clipPaths) fs.promises.unlink(c).catch(() => {});
    throw e;
  }
}

// Build RenderInputs for the AI path.
// Uses the beat-energy durations for trimming each Kling clip so cuts happen at
// the right musical moment. Raw clip lengths from ffprobe are used only as an
// upper bound — we never trim past the actual footage.
function _aiDurations(clips: AIClipData, musicKey: string): { durations: number[]; musicSeek: number } {
  const n = clips.clipPaths.length;
  const { durations: planned, musicSeek } = energyPlanAI(musicKey, n);
  // Clamp each planned duration to what's actually available (accounting for
  // the ramp-up offset so we always have enough footage).
  const durations = planned.map((d, i) => {
    const maxAvail = Math.max(0, clips.durations[i] - KLING_RAMPUP - 0.05);
    return +Math.min(d, maxAvail).toFixed(4);
  });
  return { durations, musicSeek };
}

function makeRenderInputsAI(clips: AIClipData, musicKey: string, cutStyle?: CutStyle): RenderInputs {
  const n = clips.clipPaths.length;
  const { durations, musicSeek } = _aiDurations(clips, musicKey);
  const filter = buildFilterVideo(n, durations, clips.sizes, cutStyle);
  const avgDur = +(durations.reduce((a, b) => a + b, 0) / n).toFixed(4);
  return { inputPaths: clips.clipPaths, slideCount: n, slideDur: avgDur, durations, musicSeek, filter, tmpClips: clips.clipPaths };
}

// Same as above but uses the "clean" (crop-to-fill 9:16, no blurred bg) filter.
function makeRenderInputsAIClean(clips: AIClipData, musicKey: string, cutStyle?: CutStyle): RenderInputs {
  const n = clips.clipPaths.length;
  const { durations, musicSeek } = _aiDurations(clips, musicKey);
  const filter = buildFilterVideoClean(n, durations, clips.sizes, cutStyle);
  const avgDur = +(durations.reduce((a, b) => a + b, 0) / n).toFixed(4);
  return { inputPaths: clips.clipPaths, slideCount: n, slideDur: avgDur, durations, musicSeek, filter, tmpClips: [] };
}

// Landscape (1920×1080) "Original" variant — same clips, 16:9 crop-to-fill.
function makeRenderInputsAICleanLandscape(clips: AIClipData, musicKey: string, cutStyle?: CutStyle): RenderInputs {
  const n = clips.clipPaths.length;
  const { durations, musicSeek } = _aiDurations(clips, musicKey);
  const filter = buildFilterVideoCleanLandscape(n, durations, clips.sizes, cutStyle);
  const avgDur = +(durations.reduce((a, b) => a + b, 0) / n).toFixed(4);
  return { inputPaths: clips.clipPaths, slideCount: n, slideDur: avgDur, durations, musicSeek, filter, tmpClips: [] };
}

// FALLBACK clean 9:16 version.
async function buildLocalInputsClean(imagePaths: string[], musicKey?: string, cutStyle?: CutStyle): Promise<RenderInputs> {
  const n = imagePaths.length;
  const { durations: baseDurations, musicSeek } = localEnergyPlan(musicKey, n);
  const avgBase = baseDurations.reduce((a, b) => a + b, 0) / n;
  const slideCount = Math.min(MAX_SLIDES, Math.max(n, Math.round(TARGET_TOTAL_SEC / avgBase)));
  const inputPaths: string[] = [];
  const durations: number[] = [];
  for (let k = 0; k < slideCount; k++) {
    inputPaths.push(imagePaths[k % n]);
    durations.push(baseDurations[k % n]);
  }
  const sizeCache = new Map<string, { w: number; h: number }>();
  const sizes: Array<{ w: number; h: number }> = [];
  for (const p of inputPaths) {
    let s = sizeCache.get(p);
    if (!s) { s = await ffprobeSize(p); sizeCache.set(p, s); }
    sizes.push(s);
  }
  const moves: CameraMove[] = sizes.map((s, idx) =>
    selectCameraMove(s.w / s.h, idx, sizes.length)
  );
  const avgSlide = +(durations.reduce((a, b) => a + b, 0) / slideCount).toFixed(3);
  const filter = buildFilterClean(slideCount, durations, sizes, moves, cutStyle);
  return { inputPaths, slideCount, slideDur: avgSlide, durations, musicSeek, filter, tmpClips: [] };
}

// FALLBACK landscape (1920×1080) "Original" version.
async function buildLocalInputsCleanLandscape(imagePaths: string[], musicKey?: string, cutStyle?: CutStyle): Promise<RenderInputs> {
  const n = imagePaths.length;
  const { durations: baseDurations, musicSeek } = localEnergyPlan(musicKey, n);
  const avgBase = baseDurations.reduce((a, b) => a + b, 0) / n;
  const slideCount = Math.min(MAX_SLIDES, Math.max(n, Math.round(TARGET_TOTAL_SEC / avgBase)));
  const inputPaths: string[] = [];
  const durations: number[] = [];
  for (let k = 0; k < slideCount; k++) {
    inputPaths.push(imagePaths[k % n]);
    durations.push(baseDurations[k % n]);
  }
  const sizeCache = new Map<string, { w: number; h: number }>();
  const sizes: Array<{ w: number; h: number }> = [];
  for (const p of inputPaths) {
    let s = sizeCache.get(p);
    if (!s) { s = await ffprobeSize(p); sizeCache.set(p, s); }
    sizes.push(s);
  }
  const moves: CameraMove[] = sizes.map((s, idx) =>
    selectCameraMove(s.w / s.h, idx, sizes.length)
  );
  const avgSlide = +(durations.reduce((a, b) => a + b, 0) / slideCount).toFixed(3);
  const filter = buildFilterCleanLandscape(slideCount, durations, sizes, moves, cutStyle);
  return { inputPaths, slideCount, slideDur: avgSlide, durations, musicSeek, filter, tmpClips: [] };
}

// Assemble one MP4 from pre-built render inputs. Returns the public /uploads/
// URL of the finished file. Does NOT delete tmpClips — the caller does that
// after all mood variants are done. Cleans up only its own text overlay files.
async function assembleVideo(
  inputs: RenderInputs,
  outDir: string,
  address: string | undefined,
  moodKey: string,
  startText?: string,
  endText?: string,
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

    // Drone start text: large centered text shown at the very beginning of the reel.
    const stRaw = (startText || "").trim();
    if (stRaw && videoTotal >= 2.0) {
      const stFile = path.join(outDir, `${baseName}-start.txt`);
      fs.writeFileSync(stFile, stRaw, "utf8");
      tmpFiles.push(stFile);
      const stEnd = Math.min(5.0, videoTotal);
      const stHold = Math.min(3.5, videoTotal * 0.6);
      const stSize = Math.max(30, Math.min(56, Math.floor(900 / (stRaw.length * 0.55))));
      const stAlpha = `if(lt(t,0.6),t/0.6,if(lt(t,${stHold.toFixed(2)}),1,if(lt(t,${stEnd.toFixed(2)}),(${stEnd.toFixed(2)}-t)/${Math.max(0.01, stEnd - stHold).toFixed(2)},0)))`;
      draws.unshift(
        drawCaption(stFile, stSize, "h*0.38", stAlpha, `between(t,0,${stEnd.toFixed(2)})`, FONT_BOLD),
      );
    }

    // Drone end text: large centered text shown near the end of the reel.
    const etRaw = (endText || "").trim();
    if (etRaw && videoTotal >= 3.0) {
      const etFile = path.join(outDir, `${baseName}-end.txt`);
      fs.writeFileSync(etFile, etRaw, "utf8");
      tmpFiles.push(etFile);
      const etStart = Math.max(0, videoTotal - 4.5);
      const etFadeIn = +(etStart + 0.6).toFixed(3);
      const etSize = Math.max(30, Math.min(56, Math.floor(900 / (etRaw.length * 0.55))));
      const etAlpha = `if(lt(t,${etStart.toFixed(2)}),0,if(lt(t,${etFadeIn.toFixed(2)}),(t-${etStart.toFixed(2)})/0.6,1))`;
      draws.push(
        drawCaption(etFile, etSize, "h*0.38", etAlpha, `between(t,${etStart.toFixed(2)},${videoTotal.toFixed(2)})`, FONT_BOLD),
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
    const fadeOutStart = Math.max(0.1, videoTotal - 2.5).toFixed(2);
    // Increase volume significantly, add light compression and a warm bass boost for
    // a punchy, professional sound. dynaudnorm keeps levels consistent across tracks.
    const audioChain =
      `[${slideCount}:a]volume=0.82,` +
      `acompressor=threshold=0.089:ratio=4:attack=200:release=1000:makeup=1.2,` +
      `equalizer=f=90:width_type=o:width=2:g=4,` +
      `dynaudnorm=f=150:g=15,` +
      `afade=t=in:st=0:d=1,` +
      `afade=t=out:st=${fadeOutStart}:d=2.5[aout]`;
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

  r2UploadFile(outPath).catch(() => {});
  return `/uploads/${filename}`;
}

// Four music moods rendered for every job — the AI clips are generated ONCE,
// then FFmpeg assembles a separate video per mood at zero extra AI cost.
const ALL_MOODS = ["calm", "uplifting", "modern", "tension", "every_day", "old_days", "on_my_way", "open_air", "renegade", "afterdusk"] as const;
const RENDY_MOODS = ["every_day", "old_days", "on_my_way", "open_air", "renegade", "afterdusk"] as const;
const MOOD_LABELS: Record<string, string> = {
  calm: "Rolig", uplifting: "Opløftende", modern: "Moderne", tension: "Spændt",
  every_day: "Every Day", old_days: "Old Days", on_my_way: "On My Way",
  open_air: "Open Air", renegade: "Renegade", afterdusk: "Afterdusk",
};

async function render(
  jobId: string,
  imagePaths: string[],
  outDir: string,
  address?: string,
  startText?: string,
  endText?: string,
  mood?: string,
  cutStyle?: CutStyle,
  moods?: string[],
): Promise<void> {
  // If the slot isn't free yet, tell the client we're queued so they don't
  // think it's frozen. acquireSlot resolves as soon as a slot opens up.
  if (activeRenders >= MAX_CONCURRENT) {
    setProgress(jobId, { stage: "uploading", currentClip: 0, totalClips: imagePaths.length, message: "Venter på ledig plads… (1-2 job kører allerede)" });
  }
  await acquireSlot();
  try {
    const emit = (p: ShowcaseProgress) => setProgress(jobId, p);
    emit({ stage: "uploading", currentClip: 0, totalClips: imagePaths.length, message: `Uploader ${imagePaths.length} billeder…` });

    // Drone mode: activated when the caller supplies startText or endText.
    // Image[0] and image[1] are paired as Kling start+end-frame → ONE transition
    // clip. Images[2+] use the normal interior gimbal prompts.
    const droneMode = !!(startText || endText) && imagePaths.length >= 2;

    // AI-FIRST: Use Kling image-to-video for every showcase reel when FAL_KEY is
    // available — each photo becomes a real 5-second cinematic camera-move clip.
    // Ken Burns FFmpeg is the FALLBACK only when every AI clip fails or FAL_KEY
    // is missing. Quality difference is significant: AI gives genuine gimbal moves,
    // proper depth and parallax; Ken Burns is flat zoom.
    let clipData: AIClipData | null = null;
    if (isFalConfigured()) {
      try {
        clipData = await buildAIClips(imagePaths, outDir, droneMode, emit);
      } catch (e: any) {
        console.warn("[showcase] AI path failed, falling back to local:", e?.message || e);
        clipData = null;
      }
    }
    emit({ stage: "compositing", currentClip: 0, totalClips: imagePaths.length, message: "Sammensætter video…" });

    const n = clipData ? clipData.clipPaths.length : Math.min(imagePaths.length, MAX_AI_CLIPS);
    const videoUrls: Record<string, string> = {};
    const cleanVideoUrls: Record<string, string> = {};

    // Assemble only the requested mood(s). Priority: explicit moods[] > single mood > all 4 originals.
    // For each mood, the 9:16 (postklar) and landscape (original) FFmpeg passes are independent
    // reads on the same clip files, so they run in parallel. Moods themselves are batched 2 at a
    // time — 4 concurrent FFmpeg processes max — to avoid saturating the CPU on a single job.
    const VALID_MOOD_SET = new Set(ALL_MOODS as readonly string[]);
    const moodsToRender: string[] = moods && moods.length > 0
      ? moods.filter(m => VALID_MOOD_SET.has(m))
      : mood && VALID_MOOD_SET.has(mood)
        ? [mood]
        : ["calm", "uplifting", "modern", "tension"];

    const MOOD_CONCURRENCY = moodsToRender.length > 1 ? 2 : 1;
    await mapLimit(moodsToRender, MOOD_CONCURRENCY, async (m) => {
      emit({ stage: "compositing", currentClip: n, totalClips: n, message: `Sammensætter ${MOOD_LABELS[m]}…` });
      let inputs: RenderInputs;
      let cleanInputs: RenderInputs;
      if (clipData) {
        inputs = makeRenderInputsAI(clipData, m, cutStyle);
        cleanInputs = makeRenderInputsAICleanLandscape(clipData, m, cutStyle);
      } else {
        [inputs, cleanInputs] = await Promise.all([
          buildLocalInputs(imagePaths, m, cutStyle),
          buildLocalInputsCleanLandscape(imagePaths, m, cutStyle),
        ]);
      }
      // Both variants for this mood run concurrently — they read the same clips independently.
      const [main, clean] = await Promise.all([
        assembleVideo(inputs, outDir, address, m, startText, endText),
        assembleVideo(cleanInputs, outDir, address, `${m}-clean`, startText, endText),
      ]);
      videoUrls[m] = main;
      cleanVideoUrls[m] = clean;
    });

    // Clean up downloaded AI clips — every assembled variant is now done.
    if (clipData) {
      for (const c of clipData.clipPaths) fs.promises.unlink(c).catch(() => {});
    }

    const doneLabel = moodsToRender.length === 1 ? `${MOOD_LABELS[moodsToRender[0]]} video klar!` : `${moodsToRender.length} videoer klar!`;
    emit({ stage: "complete", currentClip: n, totalClips: n, message: doneLabel, videoUrls, cleanVideoUrls });
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

// ===== CINEMATISK WALKTHROUGH VIDEO =====
// Multi-photo professional property walkthrough — same pipeline as Showcase but
// uses walkthrough-specific camera prompts (Prompt 2 aesthetic) and no drone mode.

async function buildWalkthroughClips(
  imagePaths: string[],
  outDir: string,
  onProgress?: (p: ShowcaseProgress) => void,
): Promise<AIClipData | null> {
  const allPhotos = imagePaths.slice(0, MAX_AI_CLIPS);
  const totalClips = allPhotos.length;

  onProgress?.({ stage: "uploading", currentClip: 0, totalClips, message: `Uploader ${allPhotos.length} billeder…` });

  const allUploads = await Promise.all(
    allPhotos.map((p) =>
      uploadToFal(p)
        .then((url) => url)
        .catch((e: any) => {
          console.warn("[walkthrough] upload failed:", e?.message || e);
          return null;
        }),
    ),
  );

  let done = 0;
  onProgress?.({ stage: "generating", currentClip: 0, totalClips, message: `Laver AI-klip 0/${totalClips}…` });

  const clips = await mapLimit(allUploads, AI_CLIP_CONCURRENCY, async (url, i) => {
    if (!url) return null;
    try {
      const { videoUrl } = await generateWalkthroughClip(url, i);
      const dest = path.join(outDir, `wt-clip-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}.mp4`);
      await downloadToFile(videoUrl, dest);
      done++;
      onProgress?.({ stage: "generating", currentClip: done, totalClips, message: `Laver AI-klip ${done}/${totalClips}…` });
      return dest;
    } catch (e: any) {
      console.warn(`[walkthrough] clip ${i} failed:`, e?.message || e);
      done++;
      onProgress?.({ stage: "generating", currentClip: done, totalClips, message: `Laver AI-klip ${done}/${totalClips}… (et klip fejlede)` });
      return null;
    }
  });

  const clipPaths = clips.filter((c): c is string => !!c);
  if (clipPaths.length === 0) return null;

  try {
    const sizes: Array<{ w: number; h: number }> = [];
    const durations: number[] = [];
    for (const c of clipPaths) {
      sizes.push(await ffprobeSize(c));
      durations.push(await ffprobeDuration(c));
    }
    return { clipPaths, sizes, durations };
  } catch (e) {
    for (const c of clipPaths) fs.promises.unlink(c).catch(() => {});
    throw e;
  }
}

async function renderWalkthrough(
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
        clipData = await buildWalkthroughClips(imagePaths, outDir, emit);
      } catch (e: any) {
        console.warn("[walkthrough] AI path failed, falling back to local:", e?.message || e);
        clipData = null;
      }
    }
    if (!clipData) {
      emit({ stage: "compositing", currentClip: 0, totalClips: imagePaths.length, message: "Bruger lokal motor (ingen AI)…" });
    }

    const n = clipData ? clipData.clipPaths.length : Math.min(imagePaths.length, MAX_AI_CLIPS);
    const videoUrls: Record<string, string> = {};
    const cleanVideoUrls: Record<string, string> = {};

    for (const mood of ALL_MOODS) {
      emit({ stage: "compositing", currentClip: n, totalClips: n, message: `Sammensætter ${MOOD_LABELS[mood]}…` });
      let inputs: RenderInputs;
      if (clipData) {
        inputs = makeRenderInputsAI(clipData, mood);
      } else {
        inputs = await buildLocalInputs(imagePaths, mood);
      }
      videoUrls[mood] = await assembleVideo(inputs, outDir, address, mood, undefined, undefined);

      let cleanInputs: RenderInputs;
      if (clipData) {
        cleanInputs = makeRenderInputsAICleanLandscape(clipData, mood);
      } else {
        cleanInputs = await buildLocalInputsCleanLandscape(imagePaths, mood);
      }
      cleanVideoUrls[mood] = await assembleVideo(cleanInputs, outDir, address, `${mood}-clean`, undefined, undefined);
    }

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

export function startWalkthroughVideo(
  imagePaths: string[],
  outDir: string,
  address?: string,
): string | null {
  pruneJobs();
  if (activeRenders + waiters.length >= MAX_BACKLOG) return null;
  const jobId = randomUUID();
  const totalClips = Math.min(imagePaths.length, MAX_AI_CLIPS);
  jobs.set(jobId, {
    status: "processing",
    createdAt: Date.now(),
    progress: { stage: "uploading", currentClip: 0, totalClips, message: "Starter op…" },
  });

  renderWalkthrough(jobId, imagePaths, outDir, address)
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
      for (const p of imagePaths) fs.promises.unlink(p).catch(() => {});
    });

  return jobId;
}

// Kick off an async render. Returns immediately with a jobId the client polls.
export function startShowcaseVideo(
  imagePaths: string[],
  outDir: string,
  address?: string,
  startText?: string,
  endText?: string,
  mood?: string,
  cutStyle?: CutStyle,
  moods?: string[],
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
    progress: { stage: "uploading", currentClip: 0, totalClips, message: "Klargjør job…" },
  });

  render(jobId, imagePaths, outDir, address, startText, endText, mood, cutStyle, moods)
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

// ===== FORVANDLINGSFILM =====
// 2-8 før/efter-par fra brugerens galleri → ét Seedance morph-klip pr. rum
// (samme motor som enkelt-Forvandling, 6 sek/klip) → én samlet landskabsfilm
// (1920×1080) med musik i 4 stemninger. Klippene afspilles i FULD længde —
// en forvandling må aldrig beat-trimmes midt i transformationen, så beat-
// planen fra Showcase/Walkthrough bruges bevidst IKKE her.

export interface FilmPair {
  before: string;
  after: string;
}

const FILM_CLIP_CONCURRENCY = 3; // betalte fal-kald i flight pr. job
const FILM_CLIP_DURATION = "6";  // sek pr. rum-forvandling
const FILM_MOODS = ["calm", "uplifting", "modern", "tension"];
export const MAX_FILM_PAIRS = 8;

async function buildFilmClips(
  pairs: FilmPair[],
  outDir: string,
  onProgress?: (p: ShowcaseProgress) => void,
  onClipFailed?: () => void,
): Promise<AIClipData | null> {
  const totalClips = pairs.length;
  onProgress?.({ stage: "uploading", currentClip: 0, totalClips, message: `Uploader ${totalClips * 2} billeder…` });

  let done = 0;
  onProgress?.({ stage: "generating", currentClip: 0, totalClips, message: `Forvandler rum 0/${totalClips}… (ca. 3-5 min pr. rum)` });
  const clips = await mapLimit(pairs, FILM_CLIP_CONCURRENCY, async (pair, i) => {
    try {
      const { beforeUrl, afterUrl } = await uploadVideoPairToFal(pair.before, pair.after);
      const { videoUrl } = await generateAnimationVideo(beforeUrl, afterUrl, "morph", { duration: FILM_CLIP_DURATION });
      const dest = path.join(outDir, `film-clip-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}.mp4`);
      await downloadToFile(videoUrl, dest);
      done++;
      onProgress?.({ stage: "generating", currentClip: done, totalClips, message: `Forvandler rum ${done}/${totalClips}… (ca. 3-5 min pr. rum)` });
      return dest;
    } catch (e: any) {
      console.warn(`[film] klip ${i} fejlede:`, e?.message || e);
      onClipFailed?.();
      done++;
      onProgress?.({ stage: "generating", currentClip: done, totalClips, message: `Forvandler rum ${done}/${totalClips}… (ét rum fejlede — krediten refunderes)` });
      return null;
    }
  });

  const clipPaths = clips.filter((c): c is string => !!c);
  if (clipPaths.length === 0) return null;

  try {
    const sizes: Array<{ w: number; h: number }> = [];
    const durations: number[] = [];
    for (const c of clipPaths) {
      sizes.push(await ffprobeSize(c));
      durations.push(await ffprobeDuration(c));
    }
    return { clipPaths, sizes, durations };
  } catch (e) {
    for (const c of clipPaths) fs.promises.unlink(c).catch(() => {});
    throw e;
  }
}

// Fuld-længde RenderInputs: hvert klip spiller hele sin længde (minus den
// lille ramp-up-trim som slide-byggeren altid fjerner i toppen). musicSeek=0 —
// klippene styrer rytmen, ikke musikken.
function makeRenderInputsFilm(clips: AIClipData): RenderInputs {
  const n = clips.clipPaths.length;
  const durations = clips.durations.map((d) => +Math.max(1, d - KLING_RAMPUP - 0.05).toFixed(4));
  const filter = buildFilterVideoCleanLandscape(n, durations, clips.sizes);
  const avgDur = +(durations.reduce((a, b) => a + b, 0) / n).toFixed(4);
  return { inputPaths: clips.clipPaths, slideCount: n, slideDur: avgDur, durations, musicSeek: 0, filter, tmpClips: [] };
}

// Test/debug-hook: sammensæt en film direkte fra allerede-downloadede klip
// (springer de betalte fal-kald over). Bruges af scripts/, ikke af routes.
export async function assembleFilmFromClips(
  clipPaths: string[],
  outDir: string,
  address?: string,
  mood: string = "calm",
): Promise<string> {
  const sizes: Array<{ w: number; h: number }> = [];
  const durations: number[] = [];
  for (const c of clipPaths) {
    sizes.push(await ffprobeSize(c));
    durations.push(await ffprobeDuration(c));
  }
  const inputs = makeRenderInputsFilm({ clipPaths, sizes, durations });
  return assembleVideo(inputs, outDir, address, mood, undefined, undefined);
}

async function renderTransformFilm(
  jobId: string,
  pairs: FilmPair[],
  outDir: string,
  address?: string,
  onClipFailed?: () => void,
): Promise<void> {
  if (activeRenders >= MAX_CONCURRENT) {
    setProgress(jobId, { stage: "uploading", currentClip: 0, totalClips: pairs.length, message: "Venter på ledig plads… (1-2 job kører allerede)" });
  }
  await acquireSlot();
  try {
    const emit = (p: ShowcaseProgress) => setProgress(jobId, p);
    if (!isFalConfigured()) {
      throw new Error("AI-video er ikke tilgængelig lige nu. Prøv igen senere.");
    }

    const clipData = await buildFilmClips(pairs, outDir, emit, onClipFailed);
    if (!clipData) {
      throw new Error("Ingen af rummene kunne forvandles. Kreditterne er refunderet — prøv igen.");
    }

    const n = clipData.clipPaths.length;
    try {
      const inputs = makeRenderInputsFilm(clipData);
      const videoUrls: Record<string, string> = {};
      for (const mood of FILM_MOODS) {
        emit({ stage: "compositing", currentClip: n, totalClips: n, message: `Sammensætter ${MOOD_LABELS[mood]}…` });
        videoUrls[mood] = await assembleVideo(inputs, outDir, address, mood, undefined, undefined);
      }

      const doneMsg = n < pairs.length ? `Film klar (${n} af ${pairs.length} rum lykkedes)` : "4 film klar!";
      emit({ stage: "complete", currentClip: n, totalClips: n, message: doneMsg, videoUrls });
      jobs.set(jobId, {
        status: "completed",
        videoUrls,
        createdAt: Date.now(),
        progress: { stage: "complete", currentClip: n, totalClips: n, message: doneMsg, videoUrls },
      });
    } finally {
      // Klip-filerne skal væk uanset om sammensætningen lykkedes — ellers
      // efterlader et fejlet job store mp4-temp-filer i uploads/.
      for (const c of clipData.clipPaths) fs.promises.unlink(c).catch(() => {});
    }
  } finally {
    releaseSlot();
  }
}

export function startTransformFilm(
  pairs: FilmPair[],
  outDir: string,
  address?: string,
  onClipFailed?: () => void,
  onDone?: (failed: boolean) => void,
): string | null {
  pruneJobs();
  if (activeRenders + waiters.length >= MAX_BACKLOG) return null;
  const jobId = randomUUID();
  const totalClips = Math.min(pairs.length, MAX_FILM_PAIRS);
  jobs.set(jobId, {
    status: "processing",
    createdAt: Date.now(),
    progress: { stage: "uploading", currentClip: 0, totalClips, message: "Starter op…" },
  });

  renderTransformFilm(jobId, pairs.slice(0, MAX_FILM_PAIRS), outDir, address, onClipFailed)
    .then(() => {
      // Server-side afregning ved succes — afhænger ikke af at klienten poller.
      onDone?.(false);
    })
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
      // Refundér resterende kreditter server-side, selv hvis klienten er væk.
      onDone?.(true);
    })
    .finally(() => {
      // Slet de midlertidige billed-KOPIER (aldrig originaler — ruten kopierer
      // altid galleri-filer til friske tmp-navne inden start).
      for (const p of pairs) {
        fs.promises.unlink(p.before).catch(() => {});
        fs.promises.unlink(p.after).catch(() => {});
      }
    });

  return jobId;
}
