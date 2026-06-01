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
// zoompan jitters because it truncates the crop offset to whole pixels each
// frame. We beat this two ways: (1) crop-fill the source to 2x the final size
// and run zoompan at that 2x resolution, then (2) scale the result back down to
// 1080x1920. The downscale supersamples away the integer-pixel stepping, so the
// Ken Burns zoom is buttery smooth instead of juddering.
const SS_W = W * 2; // 2160 — supersample (working) width
const SS_H = H * 2; // 3840 — supersample (working) height

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

// "Mix" style: mostly a soft crossfade (the calm, elegant Render.ai feel) with a
// gentle directional smooth every 3rd switch for a little variation — never a
// hard cut or a flashy wipe. j is the 1-based junction index.
const SOFT_VARIATIONS = ["smoothleft", "smoothright", "smoothup"];
function pickTransition(j: number): string {
  if (j % 3 === 0) return SOFT_VARIATIONS[(Math.floor(j / 3) - 1) % SOFT_VARIATIONS.length];
  return "fade";
}

// Background music: a few pre-generated, royalty-free instrumental beds that ship
// with the app. Rendering stays $0 per video because we reuse these local files
// (no per-render AI/audio cost). Key "none" / undefined = silent.
const MUSIC_DIR = path.join(process.cwd(), "server", "music");
const MUSIC_TRACKS: Record<string, string> = {
  calm: "calm.mp3",
  uplifting: "uplifting.mp3",
  modern: "modern.mp3",
};
function resolveMusic(key?: string): string | null {
  if (!key || key === "none") return null;
  const file = MUSIC_TRACKS[key];
  if (!file) return null;
  const p = path.join(MUSIC_DIR, file);
  return fs.existsSync(p) ? p : null;
}

// Beat-synced cuts: each music bed has a steady pulse that we measured once,
// offline, with music-tempo (period = seconds per beat, phase = time of the
// first beat). At render time we lock every image switch to a whole number of
// beats so the cuts land *on* the rhythm — the AI-feeling "edited to the music"
// look — instead of a fixed, arbitrary interval. No per-render analysis cost.
const BEAT_GRID: Record<string, { period: number; phase: number }> = {
  calm: { period: 0.33, phase: 0.58 },
  uplifting: { period: 0.49, phase: 0.04 },
  modern: { period: 0.545, phase: 0.31 },
};
// Roughly how long each photo should linger; snapped to the nearest whole beat.
const TARGET_SEC = 3.0;
// No music => nothing to sync to, so fall back to this pleasant fixed pace.
const SILENT_DUR = 3.0;

// Work out the per-image duration and a small audio pre-roll so a beat coincides
// with each crossfade centre (the perceived switch sits crossfade/2 after the
// xfade offset). Returns a uniform duration because a whole number of equal
// beats already keeps every cut on the pulse.
function beatPlan(
  musicKey: string | undefined,
  crossfade: number,
): { durPerImage: number; musicSeek: number } {
  const key = !musicKey || musicKey === "none" ? null : musicKey;
  const grid = key ? BEAT_GRID[key] : undefined;
  if (!grid) return { durPerImage: SILENT_DUR, musicSeek: 0 };
  const m = Math.max(3, Math.min(16, Math.round(TARGET_SEC / grid.period)));
  const switchInterval = m * grid.period;
  // d - crossfade == switchInterval keeps each switch exactly `m` beats apart.
  const durPerImage = switchInterval + crossfade;
  let seek = (grid.phase - crossfade / 2) % grid.period;
  if (seek < 0) seek += grid.period;
  return { durPerImage, musicSeek: +seek.toFixed(3) };
}

// Build the filter_complex graph: per-image zoom then a varied transition chain.
function buildFilter(n: number, durPerImage: number, crossfade: number): string {
  const frames = Math.max(2, Math.round(durPerImage * FPS));
  // Cinematic Ken Burns, clearly visible (not a static slide): a 1.06 → 1.20 move
  // that alternates zoom-IN / zoom-OUT per image, combined with a directional pan
  // that cycles right → left → up → down so consecutive photos never drift the
  // same way. Every offset is a fraction of the *live* crop margin (iw-iw/zoom),
  // so the crop can never leave the frame (no black edges, no clamp judder).
  const fm1 = Math.max(1, frames - 1);
  const Z_LO = 1.06;
  const Z_HI = 1.2;
  const zinc = ((Z_HI - Z_LO) / frames).toFixed(6);
  const SPAN = 0.85; // fraction of the available crop margin the pan travels across
  const parts: string[] = [];

  for (let i = 0; i < n; i++) {
    const zoomIn = i % 2 === 0;
    const z = zoomIn
      ? `min(${Z_LO}+${zinc}*on,${Z_HI})`
      : `max(${Z_HI}-${zinc}*on,${Z_LO})`;
    const cx = `iw/2-(iw/zoom/2)`;
    const cy = `ih/2-(ih/zoom/2)`;
    const driftX = `(on/${fm1}-0.5)*${SPAN}*(iw-iw/zoom)`;
    const driftY = `(on/${fm1}-0.5)*${SPAN}*(ih-ih/zoom)`;
    let panX = cx;
    let panY = cy;
    switch (i % 4) {
      case 0:
        panX = `${cx}+${driftX}`; // pan right
        break;
      case 1:
        panX = `${cx}-(${driftX})`; // pan left
        break;
      case 2:
        panY = `${cy}-(${driftY})`; // pan up
        break;
      case 3:
        panY = `${cy}+${driftY}`; // pan down
        break;
    }
    // Crop-fill to the 2x supersample canvas (biased DOWN so we favour the lower
    // ~60% where the furniture lives and trim excess ceiling), run zoom+pan at 2x,
    // then scale back to 1080x1920 so the integer-pixel stepping is antialiased
    // away (no judder) and the frame is full-bleed (no black bars).
    parts.push(
      `[${i}:v]scale=${SS_W}:${SS_H}:force_original_aspect_ratio=increase,` +
        `crop=${SS_W}:${SS_H}:(in_w-${SS_W})/2:(in_h-${SS_H})*0.62,` +
        `zoompan=z='${z}':d=${frames}:` +
        `x='${panX}':y='${panY}':s=${SS_W}x${SS_H}:fps=${FPS},` +
        `scale=${W}:${H}:flags=bicubic,setsar=1,format=yuv420p[v${i}]`,
    );
  }

  if (n === 1) {
    // Single image: just expose it as the output label.
    parts.push(`[v0]null[vbase]`);
    return parts.join(";");
  }

  let last = `[v0]`;
  for (let j = 1; j < n; j++) {
    const offset = (j * (durPerImage - crossfade)).toFixed(3);
    const out = j === n - 1 ? `[vbase]` : `[x${j}]`;
    const transition = pickTransition(j);
    parts.push(
      `${last}[v${j}]xfade=transition=${transition}:duration=${crossfade}:offset=${offset}${out}`,
    );
    last = `[x${j}]`;
  }
  return parts.join(";");
}

// Text overlay: a bundled bold sans-serif, plus a FIXED contact line that is the
// same on every video (the agency's details). The per-video address is optional
// and supplied by the user. Rendered with drawtext (burned in) so the clip is
// self-contained — no external player or caption track needed.
const FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
const CONTACT_TEXT =
  "Kontakt os for fremvisning\n+45 70 70 70 70\nkontakt@formaestates.dk";

// A drawtext alpha expression that fades a caption in over `f`s, holds it, then
// fades it out over `f`s within the window [s, e]. Wrapped in single quotes by the
// caller, so internal commas/colons are safe from the filtergraph parser.
function fadeAlpha(s: number, e: number, f: number): string {
  const a = s.toFixed(2);
  const b = (s + f).toFixed(2);
  const c = (e - f).toFixed(2);
  const d = e.toFixed(2);
  return `if(lt(t,${a}),0,if(lt(t,${b}),(t-${a})/${f},if(lt(t,${c}),1,if(lt(t,${d}),(${d}-t)/${f},0))))`;
}

// One white-on-shadow, semi-transparent-box, centred caption.
function drawCaption(
  file: string,
  size: number,
  y: string,
  alpha: string,
  enable: string,
  lineSpacing = 0,
): string {
  const ls = lineSpacing > 0 ? `:line_spacing=${lineSpacing}` : "";
  return (
    `drawtext=fontfile=${FONT}:textfile=${file}:expansion=none:` +
    `fontcolor=white:fontsize=${size}${ls}:` +
    `box=1:boxcolor=black@0.40:boxborderw=22:` +
    `shadowcolor=black@0.55:shadowx=2:shadowy=2:` +
    `x=(w-text_w)/2:y=${y}:alpha='${alpha}':enable='${enable}'`
  );
}

async function render(
  jobId: string,
  imagePaths: string[],
  outDir: string,
  musicKey?: string,
  address?: string,
): Promise<void> {
  // "Mix" pacing: a soft 0.8s crossfade so most switches melt into the next image
  // (the calm, elegant feel) while the per-junction variation stays gentle.
  const crossfade = 0.8;
  // Lock the per-image duration to the chosen track's pulse so cuts land on the
  // beat. Silent videos use a fixed pleasant pace.
  const { durPerImage, musicSeek } = beatPlan(musicKey, crossfade);
  const n = imagePaths.length;
  const filter = buildFilter(n, durPerImage, crossfade);
  const filename = `showcase-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`;
  const outPath = path.join(outDir, filename);

  // Total video length after the chained crossfades overlap each junction.
  const videoTotal = n * durPerImage - (n - 1) * crossfade;
  const musicPath = resolveMusic(musicKey);

  const args: string[] = ["-y"];
  for (const p of imagePaths) {
    args.push("-i", p);
  }

  // Burn in the captions: the fixed contact line (every video) low on the frame
  // for the last ~5s, and the optional per-video address high on the frame for the
  // first ~5s. drawtext reads each string from a temp file (textfile=) so user
  // text needs no fragile filtergraph escaping. Falls back to a passthrough if the
  // bundled font is somehow missing.
  const tmpFiles: string[] = [];
  let overlayChain = `;[vbase]null[vout]`;
  if (fs.existsSync(FONT)) {
    const baseName = filename.replace(/\.mp4$/, "");
    const draws: string[] = [];
    const contactFile = path.join(outDir, `${baseName}-contact.txt`);
    fs.writeFileSync(contactFile, CONTACT_TEXT, "utf8");
    tmpFiles.push(contactFile);
    const cs = Math.max(0, videoTotal - 5);
    draws.push(
      drawCaption(contactFile, 46, "h-text_h-200", fadeAlpha(cs, videoTotal, 1), `between(t,${cs.toFixed(2)},${videoTotal.toFixed(2)})`, 16),
    );
    const addr = (address || "").trim();
    if (addr) {
      const addrFile = path.join(outDir, `${baseName}-addr.txt`);
      fs.writeFileSync(addrFile, addr, "utf8");
      tmpFiles.push(addrFile);
      const ae = Math.min(5, videoTotal);
      // drawtext can't auto-wrap, so size the font to fit the address on one line
      // inside the ~1000px usable width (DejaVu Bold ≈ 0.6·fontsize per glyph).
      const addrSize = Math.max(28, Math.min(56, Math.floor(1000 / (addr.length * 0.6))));
      draws.unshift(
        drawCaption(addrFile, addrSize, "300", fadeAlpha(0, ae, 1), `between(t,0,${ae.toFixed(2)})`),
      );
    }
    overlayChain = `;[vbase]${draws.join(",")}[vout]`;
  }

  let finalFilter = filter + overlayChain;
  if (musicPath) {
    // Loop the bed to cover the whole video, drop it to a tasteful background
    // level, and fade in/out so it never starts or ends abruptly. The `-ss`
    // pre-roll aligns the track's pulse with the crossfade centres so the cuts
    // fall on the beat.
    args.push("-stream_loop", "-1");
    if (musicSeek > 0) args.push("-ss", String(musicSeek));
    args.push("-i", musicPath);
    const fadeOutStart = Math.max(0.1, videoTotal - 3).toFixed(2);
    const audioChain =
      `[${n}:a]volume=0.32,afade=t=in:st=0:d=2,` +
      `afade=t=out:st=${fadeOutStart}:d=3[aout]`;
    finalFilter = `${finalFilter};${audioChain}`;
  }

  args.push("-filter_complex", finalFilter, "-map", "[vout]");
  if (musicPath) {
    args.push("-map", "[aout]");
  }
  args.push(
    "-r",
    String(FPS),
    // Constant frame rate is the key to smooth fullscreen playback on phones —
    // any variable-frame-rate output stutters in mobile players. Pair it with a
    // high-quality, bitrate-capped x264 encode so motion stays clean without
    // runaway file sizes, and faststart so it streams instantly on the web.
    "-fps_mode",
    "cfr",
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "18",
    "-pix_fmt",
    "yuv420p",
    "-profile:v",
    "high",
    "-level",
    "4.1",
    "-maxrate",
    "12M",
    "-bufsize",
    "24M",
    "-movflags",
    "+faststart",
  );
  if (musicPath) {
    // The music bed is looped infinitely, so cap the output at the exact video
    // length. `-shortest` deadlocks/fails with an endlessly looped audio input,
    // whereas an explicit `-t` ends cleanly.
    args.push("-c:a", "aac", "-b:a", "160k", "-t", videoTotal.toFixed(2));
  } else {
    args.push("-an");
  }
  args.push(outPath);

  await acquireSlot();
  try {
    await runFfmpeg(args);
  } finally {
    releaseSlot();
    for (const f of tmpFiles) fs.promises.unlink(f).catch(() => {});
  }
  jobs.set(jobId, { status: "completed", videoUrl: `/uploads/${filename}`, createdAt: Date.now() });
}

// Kick off an async render. Returns immediately with a jobId the client polls.
export function startShowcaseVideo(
  imagePaths: string[],
  outDir: string,
  musicKey?: string,
  address?: string,
): string | null {
  pruneJobs();
  // Backpressure: refuse new work when the box is already saturated so we fail
  // fast with a clear message instead of piling up FFmpeg processes.
  if (activeRenders + waiters.length >= MAX_BACKLOG) {
    return null;
  }
  const jobId = randomUUID();
  jobs.set(jobId, { status: "processing", createdAt: Date.now() });

  render(jobId, imagePaths, outDir, musicKey, address)
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
