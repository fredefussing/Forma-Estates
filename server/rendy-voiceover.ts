/**
 * Rendy Voice-Over Feature (Task #153)
 *
 * Post-processes a completed Rendy video with:
 *  - User-recorded/uploaded voice-over (DeepFilterNet3 + FFmpeg polish)
 *  - ElevenLabs Scribe v2 transcription → editable caption segments
 *  - Original-audio ducking via sidechain compression
 *  - ASS subtitle burn + H.264 output → R2 durable storage
 *
 * All routes are authenticated with Firebase bearer token and owner-scoped.
 * No showcase quota is consumed or refunded.
 *
 * Cross-process safety (Part B):
 *  - Atomic DB lease claims prevent duplicate workers across Render instances.
 *  - Heartbeat keeps lease alive every 60 s (5-min expiry).
 *  - Recovery poll runs at registration and every 60 s (unreffed interval).
 */

import type { Express, Request, Response, NextFunction } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import os from "os";
import { randomUUID } from "crypto";
import { spawn } from "child_process";
import { pipeline } from "stream/promises";
import { pool } from "./db";
import { verifyFirebaseToken } from "./firebase-admin";
import { storage } from "./storage";
import { r2UploadFile, r2GetSignedUrl, r2GetStream } from "./r2";
import {
  falDeepFilter,
  falScribeTranscribe,
  toScribeLanguageCode,
  type ScribeWord,
} from "./fal";
import { runFfmpegQueued } from "./showcase";
import { getRendyListing, verifyRendyOwnershipAndGetVideoUrl } from "./rendy";
import { verifyRendyEditedVideoOwnership, resolveEditSourceForVoiceover } from "./rendy-editor";
import {
  RENDY_TYPOGRAPHY_PRESETS,
  DEFAULT_CAPTION_STYLE,
  isRendyTypographyId,
  CAPTION_SIZE_MIN,
  CAPTION_SIZE_MAX,
  HEADLINE_TEXT_ASS_COLOR,
  headlineFadeDurations,
  type CaptionStyleSettings,
  type CaptionContrast,
  type CaptionPosition,
  type HeadlineSettings,
} from "../shared/rendy-text";

// ── Allowed languages ──────────────────────────────────────────────────────────
const ALLOWED_LANGUAGES = new Set(["da", "en", "de", "fr", "es", "nb", "sv"]);

// Lease TTL in milliseconds
const LEASE_TTL_MS = 5 * 60 * 1000;         // 5 minutes
const LEASE_HEARTBEAT_MS = 60 * 1000;        // renew every 60 s

// ── Types ─────────────────────────────────────────────────────────────────────

export type VoiceProjectStatus = "processing" | "review" | "exporting" | "ready" | "failed";

export interface CaptionSegment {
  id: string;
  start: number;   // seconds
  end: number;     // seconds
  text: string;
  hidden?: boolean;
}

interface VoiceProjectRow {
  id: number;
  user_id: number;
  listing_id: string;
  source_video_id: string;
  status: VoiceProjectStatus;
  language: string;
  segments: CaptionSegment[] | null;
  subtitles_enabled: boolean;
  caption_style: CaptionStyleSettings | null;
  /** Snapshot of edit project's HeadlineSettings at creation time; null for non-edit sources. */
  headline_snapshot: HeadlineSettings | null;
  source_url: string | null;
  audio_url: string | null;
  output_url: string | null;
  source_input_url: string | null;
  raw_audio_key: string | null;
  error: string | null;
  completed_at: Date | null;
  lease_token: string | null;
  lease_expires_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function toPublicProject(row: VoiceProjectRow) {
  return {
    id: row.id,
    listingId: row.listing_id,
    sourceVideoId: row.source_video_id,
    status: row.status,
    language: row.language,
    segments: row.segments ?? [],
    subtitlesEnabled: row.subtitles_enabled,
    captionStyle: row.caption_style ?? DEFAULT_CAPTION_STYLE,
    sourceUrl: row.source_url,
    sourceInputUrl: row.source_input_url,
    audioUrl: row.audio_url,
    outputUrl: row.output_url,
    error: row.error,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Lease registry (in-process) ───────────────────────────────────────────────
// Maps project id → { token, heartbeat interval id }.
// Only the owning instance populates this map.

interface LeaseEntry {
  token: string;
  heartbeat: ReturnType<typeof setInterval>;
}
const _leases = new Map<number, LeaseEntry>();

/**
 * Atomically claim a processing lease on a project row.
 *
 * For preparation start (new rows): claims status='processing' with
 *   null or expired lease.
 * For export start: atomically transitions status='review' → 'exporting'
 *   and claims the lease in one UPDATE … WHERE … RETURNING.
 * For retry (failed → processing): same atomic WHERE.
 *
 * Returns the lease token if claimed, null if another worker holds it.
 */
async function claimLease(
  id: number,
  userId: number,
  expectedStatus: VoiceProjectStatus,
  newStatus: VoiceProjectStatus,
): Promise<string | null> {
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + LEASE_TTL_MS);

  // Claim condition:
  //   - row owned by this user
  //   - current status matches expectedStatus
  //   - lease is NULL or already expired
  const res = await pool.query<{ id: number }>(
    `UPDATE rendy_voice_projects
        SET status           = $1,
            lease_token      = $2,
            lease_expires_at = $3,
            updated_at       = NOW()
      WHERE id        = $4
        AND user_id   = $5
        AND status    = $6
        AND (lease_token IS NULL OR lease_expires_at IS NULL OR lease_expires_at < NOW())
      RETURNING id`,
    [newStatus, token, expiresAt, id, userId, expectedStatus],
  );

  if (!res.rows[0]) return null; // another worker already holds it

  startHeartbeat(id, token);
  return token;
}

/**
 * Claim a preparation lease on a row that is already in 'processing' status
 * (used by recovery — does not change status, just refreshes the lease).
 */
async function claimActiveLease(
  id: number,
  expectedStatus: "processing" | "exporting",
): Promise<string | null> {
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + LEASE_TTL_MS);

  const res = await pool.query<{ id: number }>(
    `UPDATE rendy_voice_projects
        SET lease_token      = $1,
            lease_expires_at = $2,
            updated_at       = NOW()
      WHERE id     = $3
        AND status = $4
        AND (lease_token IS NULL OR lease_expires_at IS NULL OR lease_expires_at < NOW())
      RETURNING id`,
    [token, expiresAt, id, expectedStatus],
  );

  if (!res.rows[0]) return null;

  startHeartbeat(id, token);
  return token;
}

function startHeartbeat(id: number, token: string) {
  // Cancel any previous heartbeat for this id first
  const existing = _leases.get(id);
  if (existing) {
    clearInterval(existing.heartbeat);
    _leases.delete(id);
  }

  const hb = setInterval(async () => {
    const entry = _leases.get(id);
    if (!entry || entry.token !== token) {
      clearInterval(hb);
      return;
    }
    const expiresAt = new Date(Date.now() + LEASE_TTL_MS);
    try {
      await pool.query(
        `UPDATE rendy_voice_projects
            SET lease_expires_at = $1, updated_at = NOW()
          WHERE id = $2 AND lease_token = $3`,
        [expiresAt, id, token],
      );
    } catch (e: any) {
      console.error(`[VoiceProject ${id}] heartbeat failed:`, e.message);
    }
  }, LEASE_HEARTBEAT_MS);

  // Don't hold the Node.js event loop open just for heartbeats
  if (hb.unref) hb.unref();

  _leases.set(id, { token, heartbeat: hb });
}

async function releaseJob(id: number, token: string): Promise<void> {
  const entry = _leases.get(id);
  if (entry?.token === token) {
    clearInterval(entry.heartbeat);
    _leases.delete(id);
  }
  // Clear the DB lease only if we still own it (avoids clearing a freshly reclaimed lease)
  try {
    await pool.query(
      `UPDATE rendy_voice_projects
          SET lease_token = NULL, lease_expires_at = NULL, updated_at = NOW()
        WHERE id = $1 AND lease_token = $2`,
      [id, token],
    );
  } catch { /* best-effort */ }
}

// ── DB helpers ─────────────────────────────────────────────────────────────────

async function dbGetProject(id: number): Promise<VoiceProjectRow | null> {
  const res = await pool.query<VoiceProjectRow>(
    `SELECT * FROM rendy_voice_projects WHERE id = $1`, [id]
  );
  return res.rows[0] ?? null;
}

async function dbGetProjectOwned(id: number, userId: number): Promise<VoiceProjectRow | null> {
  const res = await pool.query<VoiceProjectRow>(
    `SELECT * FROM rendy_voice_projects WHERE id = $1 AND user_id = $2`, [id, userId]
  );
  return res.rows[0] ?? null;
}

type DbUpdateFields = Partial<{
  status: VoiceProjectStatus;
  segments: CaptionSegment[];
  subtitles_enabled: boolean;
  source_url: string;
  audio_url: string;
  output_url: string;
  source_input_url: string;
  raw_audio_key: string;
  error: string | null;
  completed_at: Date | null;
}>;

async function dbUpdate(id: number, fields: DbUpdateFields): Promise<void> {
  const sets: string[] = ["updated_at = NOW()"];
  const vals: unknown[] = [];
  let i = 1;
  for (const [k, v] of Object.entries(fields)) {
    sets.push(`${k} = $${i++}`);
    vals.push(k === "segments" ? JSON.stringify(v) : v);
  }
  vals.push(id);
  await pool.query(
    `UPDATE rendy_voice_projects SET ${sets.join(", ")} WHERE id = $${i}`,
    vals
  );
}

async function dbUpdateWithLease(
  id: number,
  leaseToken: string,
  fields: DbUpdateFields,
): Promise<void> {
  const entries = Object.entries(fields);
  if (!entries.length) return;
  const sets: string[] = [];
  const vals: unknown[] = [];
  entries.forEach(([key, value], i) => {
    sets.push(`${key} = $${i + 1}`);
    vals.push(key === "segments" ? JSON.stringify(value) : value);
  });
  vals.push(id, leaseToken);
  const result = await pool.query(
    `UPDATE rendy_voice_projects
        SET ${sets.join(", ")}, updated_at = NOW()
      WHERE id = $${vals.length - 1} AND lease_token = $${vals.length}`,
    vals,
  );
  if (result.rowCount !== 1) {
    throw new Error("Voice-over-jobbet mistede sin behandlingslås");
  }
}

function normaliseForComparison(u: string): string {
  try {
    const parsed = new URL(u);
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return u;
  }
}
/**
 * Resolve an edit:<id> source for creation of a new voice project.
 * Returns { validatedUrl, headlineSnapshot } where validatedUrl is the clean
 * assembled URL (pre-headline burn) if available, falling back to output_url.
 * Throws if ownership fails or URL does not match the stored output.
 */
async function resolveEditSource(
  rawUrl: string,
  listingId: string,
  videoId: string,
  userId: number,
): Promise<{ validatedUrl: string; headlineSnapshot: HeadlineSettings | null }> {
  const result = await resolveEditSourceForVoiceover(listingId, videoId, userId);
  if (!result) throw new Error("Ikke et redigeret video-id");
  // The client sends the output_url it knows about; the clean URL may differ.
  // Accept if raw matches either the public output_url OR the clean_output_url.
  const { sourceUrl, headlineSnapshot } = result;
  const rawNorm = normaliseForComparison(rawUrl);
  // Also fetch output_url for the compatibility check
  const outputUrl = await verifyRendyEditedVideoOwnership(listingId, videoId, userId);
  if (
    outputUrl && rawNorm !== normaliseForComparison(outputUrl) &&
    rawNorm !== normaliseForComparison(sourceUrl)
  ) {
    throw new Error("Kilde-URL matcher ikke den færdige redigerede video");
  }
  return { validatedUrl: sourceUrl, headlineSnapshot };
}

async function resolveSourceUrl(
  rawUrl: string,
  listingId: string,
  videoId: string,
  userId: number,
): Promise<string> {
  // Edited videos are durable assets owned by a specific Rendy edit project.
  // They are intentionally resolved before the provider-delivery check because
  // their id is not present in rendy_jobs.videos.
  if (videoId.startsWith("edit:")) {
    const { validatedUrl } = await resolveEditSource(rawUrl, listingId, videoId, userId);
    return validatedUrl;
  }
  // ── 1. Verify ownership and get stored delivered URL ──────────────────────
  const { deliveredUrl, isLegacy } = await verifyRendyOwnershipAndGetVideoUrl(
    listingId, videoId, userId,
  );

  const normalise = normaliseForComparison;

  // ── 2. Non-legacy: stored delivered URL is ground truth ───────────────────
  if (!isLegacy && deliveredUrl) {
    if (rawUrl.startsWith("/uploads/")) {
      // Validate key is safe, then compare to stored delivered URL
      const key = decodeURIComponent(rawUrl.slice("/uploads/".length));
      if (!key || key.includes("..")) throw new Error("Invalid /uploads path");
      // The stored delivered URL may itself be a /uploads/ URL (localized by overlay burn)
      if (normalise(rawUrl) !== normalise(deliveredUrl)) {
        throw new Error("Kilde-URL matcher ikke den leverede video for dette videoId");
      }
      return rawUrl;
    }
    let parsed: URL;
    try { parsed = new URL(rawUrl); } catch { throw new Error("Ugyldig kilde-URL"); }
    if (parsed.protocol !== "https:") throw new Error("Kilde-URL skal bruge HTTPS");
    if (normalise(rawUrl) !== normalise(deliveredUrl)) {
      throw new Error("Kilde-URL matcher ikke den leverede video for dette videoId");
    }
    return rawUrl;
  }

  // ── 3. Legacy owned row: /uploads/ not accepted; HTTPS must match live API ─
  if (rawUrl.startsWith("/uploads/")) {
    throw new Error(
      "Kilde-URL som /uploads/ kræver nyere leveringsdata. Brug den originale HTTPS CDN-URL."
    );
  }

  let parsed: URL;
  try { parsed = new URL(rawUrl); } catch { throw new Error("Ugyldig kilde-URL"); }
  if (parsed.protocol !== "https:") throw new Error("Kilde-URL skal bruge HTTPS");

  // Live Rendy API lookup for legacy verification — already has 15 s timeout
  const listing = await getRendyListing(listingId);
  const video = listing.videos.find((v) => v.id === videoId);
  if (!video) throw new Error(`Video ${videoId} ikke fundet i listing ${listingId}`);
  if (!video.url) throw new Error(`Video ${videoId} har endnu ingen URL`);
  if (normalise(rawUrl) !== normalise(video.url)) {
    throw new Error("Kilde-URL matcher ikke den forventede Rendy-video-URL");
  }
  return rawUrl;
}

// ── curl-based download ───────────────────────────────────────────────────────

async function curlDownload(url: string, destPath: string, maxBytes = 500 * 1024 * 1024): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn("curl", [
      "-L", "--silent", "--fail",
      "--connect-timeout", "15",
      "--max-time", "300",
      "--max-filesize", String(maxBytes),
      "-o", destPath,
      url,
    ]);
    let stderr = "";
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString().slice(0, 2000); });
    proc.on("error", reject);
    proc.on("close", (code: number | null) => {
      if (code === 0) resolve();
      else reject(new Error(`curl exited ${code}: ${stderr.slice(0, 300)}`));
    });
  });
}

// Restore a /uploads/<key> file to a local path via R2 stream.
async function restoreFromR2(key: string, destPath: string): Promise<void> {
  const stream = await r2GetStream(key);
  if (!stream) throw new Error(`R2 object not found: ${key}`);
  await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
  await pipeline(stream as any, fs.createWriteStream(destPath));
}

// Ensure a /uploads/<key> URL is present on local filesystem.
async function ensureLocal(
  uploadsUrl: string,
  uploadDir: string,
  stamp: string,
  ext: string,
): Promise<{ localPath: string; isTmp: boolean }> {
  if (!uploadsUrl.startsWith("/uploads/")) throw new Error(`Expected /uploads/ URL: ${uploadsUrl}`);
  const key = decodeURIComponent(uploadsUrl.slice("/uploads/".length));
  if (!key || key.includes("..")) throw new Error("Invalid /uploads key");

  const candidate = path.join(uploadDir, path.basename(key));
  if (fs.existsSync(candidate)) return { localPath: candidate, isTmp: false };

  const tmpPath = path.join(os.tmpdir(), `rvp-restore-${stamp}${ext}`);
  await restoreFromR2(key, tmpPath);
  return { localPath: tmpPath, isTmp: true };
}

// ── ffprobe helpers ───────────────────────────────────────────────────────────

async function probeHasAudio(videoPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const proc = spawn("ffprobe", [
      "-v", "error",
      "-select_streams", "a",
      "-show_entries", "stream=codec_type",
      "-of", "csv=p=0",
      videoPath,
    ]);
    let out = "";
    proc.stdout.on("data", (d: Buffer) => { out += d.toString(); });
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => { proc.kill("SIGKILL"); finish(false); }, 30_000);
    proc.on("close", () => finish(out.trim().length > 0));
    proc.on("error", () => finish(false));
  });
}

async function probeDuration(videoPath: string): Promise<number | null> {
  return new Promise((resolve) => {
    let settled = false;
    const proc = spawn("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "csv=p=0",
      videoPath,
    ]);
    let out = "";
    proc.stdout.on("data", (d: Buffer) => { out += d.toString(); });
    const finish = (value: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => { proc.kill("SIGKILL"); finish(null); }, 30_000);
    proc.on("close", () => {
      const n = parseFloat(out.trim());
      finish(isFinite(n) && n > 0 ? n : null);
    });
    proc.on("error", () => finish(null));
  });
}

/** Probe actual width and height of the first video stream. Returns null on failure. */
async function probeVideoDimensions(videoPath: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    let settled = false;
    const proc = spawn("ffprobe", [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=width,height",
      "-of", "csv=p=0",
      videoPath,
    ]);
    let out = "";
    const finish = (value: { width: number; height: number } | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    proc.stdout.on("data", (d: Buffer) => { out += d.toString(); });
    const timer = setTimeout(() => { proc.kill("SIGKILL"); finish(null); }, 30_000);
    proc.on("close", () => {
      const parts = out.trim().split(",");
      const w = parseInt(parts[0], 10);
      const h = parseInt(parts[1], 10);
      finish(isFinite(w) && w > 0 && isFinite(h) && h > 0 ? { width: w, height: h } : null);
    });
    proc.on("error", () => finish(null));
  });
}

// ── ASS subtitle builder ───────────────────────────────────────────────────────

function secondsToAssTime(s: number): string {
  const totalCentiseconds = Math.max(0, Math.round(s * 100));
  const h = Math.floor(totalCentiseconds / 360_000);
  const m = Math.floor((totalCentiseconds % 360_000) / 6_000);
  const sec = Math.floor((totalCentiseconds % 6_000) / 100);
  const frac = totalCentiseconds % 100;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(frac).padStart(2, "0")}`;
}

function sanitizeAssText(raw: string): string {
  return raw
    .replace(/\{[^}]*\}/g, "")
    .replace(/[{}]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\N");
}

/**
 * Build an ASS subtitle file using actual video dimensions and the user's
 * chosen caption style preset. Never uses hardcoded dimensions.
 *
 * @param segments   Active caption segments (not hidden, non-empty text).
 * @param style      Caption style settings (font, size, contrast, position).
 * @param videoW     Actual target video width in pixels.
 * @param videoH     Actual target video height in pixels.
 */
function buildAssSubtitles(
  segments: CaptionSegment[],
  style: CaptionStyleSettings,
  videoW: number,
  videoH: number,
): string {
  const preset = RENDY_TYPOGRAPHY_PRESETS.find(p => p.id === style.fontId) ?? RENDY_TYPOGRAPHY_PRESETS[1];
  const fontSize = Math.round(style.size * videoH);

  // Vertical placement — margin from bottom (or top for "high")
  // ASS alignment: 2 = bottom-center, 8 = top-center, 5 = center-middle
  let alignment: number;
  let marginV: number;
  switch (style.position) {
    case "high":
      alignment = 8;  // top-center
      marginV = Math.round(videoH * 0.08);
      break;
    case "center":
      alignment = 5;  // middle-center
      marginV = 0;
      break;
    case "low":
    default:
      alignment = 2;  // bottom-center
      marginV = Math.round(videoH * 0.06);
      break;
  }

  const marginH = Math.round(videoW * 0.05);

  // Contrast treatment — maps to ASS BorderStyle + Outline + Shadow + BackColour
  let borderStyle: number;
  let outline: number;
  let shadow: number;
  let backColour: string;

  switch (style.contrast as CaptionContrast) {
    case "box":
      // Solid opaque box background
      borderStyle = 3;
      outline = 0;
      shadow = 0;
      backColour = "&H99080604";
      break;
    case "outline":
      // Hard outline, no shadow, transparent background
      borderStyle = 1;
      outline = 2;
      shadow = 0;
      backColour = "&H00000000";
      break;
    case "shadow":
    default:
      // Soft drop shadow, no outline
      borderStyle = 1;
      outline = 0;
      shadow = Math.max(1, Math.round(fontSize * 0.04));
      backColour = "&H88080604";
      break;
  }

  const header =
    "[Script Info]\n" +
    "ScriptType: v4.00+\n" +
    `PlayResX: ${videoW}\n` +
    `PlayResY: ${videoH}\n` +
    "ScaledBorderAndShadow: yes\n\n" +
    "[V4+ Styles]\n" +
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n" +
    `Style: Caption,${preset.assFontName},${fontSize},&H00F1EEE6,&H000000FF,&H00110F0C,${backColour},${preset.assBold},${preset.assItalic},0,0,100,100,${preset.assSpacing},0,${borderStyle},${outline},${shadow},${alignment},${marginH},${marginH},${marginV},1\n\n` +
    "[Events]\n" +
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n";

  const events = segments
    .filter((s) => !s.hidden && s.text.trim())
    .map((s) => {
      const text = sanitizeAssText(s.text);
      return `Dialogue: 0,${secondsToAssTime(s.start)},${secondsToAssTime(s.end)},Caption,,0,0,0,,${text}`;
    })
    .join("\n");

  return header + events + "\n";
}

/**
 * Build a single combined ASS script that may contain both:
 *   - A `Caption` style + events (from subtitle segments)
 *   - A `Headline` style + event (from an edit-project headline snapshot)
 *
 * Having one script and one `-vf ass=...` filter is more reliable than chaining
 * two separate ass filters, and avoids double-encoding.
 *
 * @param segments       Caption segments to render (filtered: not hidden, non-empty).
 * @param captionStyle   Caption style settings.
 * @param headline       Headline snapshot from the edit project, or null.
 * @param videoW         Video width in pixels.
 * @param videoH         Video height in pixels.
 * @param sourceDuration Video duration in seconds — used to clip headline timing.
 */
export function buildCombinedAss(
  segments: CaptionSegment[],
  captionStyle: CaptionStyleSettings,
  headline: HeadlineSettings | null,
  videoW: number,
  videoH: number,
  sourceDuration: number,
): string {
  // ── Caption style params ─────────────────────────────────────────────────────
  const captionPreset = RENDY_TYPOGRAPHY_PRESETS.find(p => p.id === captionStyle.fontId) ?? RENDY_TYPOGRAPHY_PRESETS[1];
  const captionFontSize = Math.round(captionStyle.size * videoH);

  let capAlignment: number;
  let capMarginV: number;
  switch (captionStyle.position) {
    case "high":   capAlignment = 8; capMarginV = Math.round(videoH * 0.08); break;
    case "center": capAlignment = 5; capMarginV = 0; break;
    case "low":
    default:       capAlignment = 2; capMarginV = Math.round(videoH * 0.06); break;
  }
  const capMarginH = Math.round(videoW * 0.05);

  let capBorderStyle: number;
  let capOutline: number;
  let capShadow: number;
  let capBackColour: string;
  switch (captionStyle.contrast as CaptionContrast) {
    case "box":
      capBorderStyle = 3; capOutline = 0; capShadow = 0; capBackColour = "&H99080604"; break;
    case "outline":
      capBorderStyle = 1; capOutline = 2; capShadow = 0; capBackColour = "&H00000000"; break;
    case "shadow":
    default:
      capBorderStyle = 1; capOutline = 0;
      capShadow = Math.max(1, Math.round(captionFontSize * 0.04));
      capBackColour = "&H88080604"; break;
  }

  const capStyleLine = `Style: Caption,${captionPreset.assFontName},${captionFontSize},&H00F1EEE6,&H000000FF,&H00110F0C,${capBackColour},${captionPreset.assBold},${captionPreset.assItalic},0,0,100,100,${captionPreset.assSpacing},0,${capBorderStyle},${capOutline},${capShadow},${capAlignment},${capMarginH},${capMarginH},${capMarginV},1`;

  // ── Headline style params ────────────────────────────────────────────────────
  let hlStyleLine = "";
  let hlEvent = "";
  const wantHeadline = headline && headline.enabled && headline.text.trim().length > 0;
  if (wantHeadline && headline) {
    const hlPreset = RENDY_TYPOGRAPHY_PRESETS.find(p => p.id === headline.fontId) ?? RENDY_TYPOGRAPHY_PRESETS[1];
    const hlFontSize = Math.round(headline.size * videoH);
    const hlStart = Math.max(0, Math.min(headline.start, sourceDuration));
    const hlEnd   = Math.max(hlStart + 0.04, Math.min(headline.end, sourceDuration));
    const { fadeInSeconds, fadeOutSeconds } = headlineFadeDurations(hlStart, hlEnd);
    const fadeInMs = Math.round(fadeInSeconds * 1000);
    const fadeOutMs = Math.round(fadeOutSeconds * 1000);
    const hlPosX  = Math.round(headline.x * videoW);
    const hlPosY  = Math.round(headline.y * videoH);
    const displayText = hlPreset.assUppercase ? headline.text.toUpperCase() : headline.text;
    hlStyleLine = `\nStyle: Headline,${hlPreset.assFontName},${hlFontSize},${HEADLINE_TEXT_ASS_COLOR},&H000000FF,&H00110F0C,&H88080604,${hlPreset.assBold},${hlPreset.assItalic},0,0,100,100,${hlPreset.assSpacing},0,1,0,0.65,5,0,0,0,1`;
    hlEvent = `\nDialogue: 1,${secondsToAssTime(hlStart)},${secondsToAssTime(hlEnd)},Headline,,0,0,0,,{\\pos(${hlPosX},${hlPosY})\\fad(${fadeInMs},${fadeOutMs})}${sanitizeAssText(displayText)}`;
  }

  // ── Assemble script ──────────────────────────────────────────────────────────
  const script =
    "[Script Info]\n" +
    "ScriptType: v4.00+\n" +
    `PlayResX: ${videoW}\n` +
    `PlayResY: ${videoH}\n` +
    "ScaledBorderAndShadow: yes\n\n" +
    "[V4+ Styles]\n" +
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n" +
    capStyleLine +
    hlStyleLine +
    "\n\n[Events]\n" +
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n";

  const captionEvents = segments
    .filter(s => !s.hidden && s.text.trim())
    .map(s => `Dialogue: 0,${secondsToAssTime(s.start)},${secondsToAssTime(s.end)},Caption,,0,0,0,,${sanitizeAssText(s.text)}`)
    .join("\n");

  return script + captionEvents + hlEvent + "\n";
}

// ── Caption segment grouper ───────────────────────────────────────────────────

const MAX_WORDS_PER_SEGMENT = 6;
const PAUSE_THRESHOLD_S = 0.42;

function groupWordsToSegments(words: ScribeWord[]): CaptionSegment[] {
  const textWords = words.filter(
    (w) => w.type === "word" && w.text.trim() &&
           Number.isFinite(w.start) && Number.isFinite(w.end) &&
           w.start >= 0 && w.end > w.start,
  );
  const segments: CaptionSegment[] = [];
  let buf: ScribeWord[] = [];

  const flush = () => {
    if (!buf.length) return;
    segments.push({
      id: randomUUID(),
      start: buf[0].start,
      end: buf[buf.length - 1].end,
      text: buf.map((w) => w.text).join(" "),
    });
    buf = [];
  };

  for (let i = 0; i < textWords.length; i++) {
    const w = textWords[i];
    const prev = textWords[i - 1];
    const pauseBreak = prev != null && w.start - prev.end > PAUSE_THRESHOLD_S;
    const lengthBreak = buf.length >= MAX_WORDS_PER_SEGMENT;
    if ((pauseBreak || lengthBreak) && buf.length) flush();
    buf.push(w);
  }
  flush();
  return segments;
}

// ── Voice preparation pipeline ────────────────────────────────────────────────

async function runPreparation(
  projectId: number,
  leaseToken: string,
  rawAudioPath: string,
  rawAudioExt: string,
  validatedSourceUrl: string,
  language: string,
  uploadDir: string,
): Promise<void> {
  const tmpFiles: string[] = [];

  try {
    // ── 1. Localise source video ───────────────────────────────────────────────
    let sourceUploadsUrl: string;

    if (validatedSourceUrl.startsWith("/uploads/")) {
      sourceUploadsUrl = validatedSourceUrl;
      // Validate it exists (restore from R2 if needed) before paying for audio work
      const restored = await ensureLocal(
        validatedSourceUrl, uploadDir,
        `${projectId}-${Date.now()}-source-check`, ".mp4",
      );
      if (restored.isTmp) tmpFiles.push(restored.localPath);

      const [srcDur, audDur] = await Promise.all([
        probeDuration(restored.localPath),
        probeDuration(rawAudioPath),
      ]);
      if (!srcDur) throw new Error("Source video duration could not be determined");
      if (!audDur) throw new Error("Voice-over audio duration could not be determined");
      if (srcDur > 30 * 60 || audDur > 30 * 60) throw new Error("Voice-over projects cannot exceed 30 minutes");
    } else {
      const stamp = `${Date.now()}-${randomUUID().slice(0, 8)}`;
      const localName = `rvp-src-${projectId}-${stamp}.mp4`;
      const localPath = path.join(uploadDir, localName);
      tmpFiles.push(localPath);
      await curlDownload(validatedSourceUrl, localPath, 500 * 1024 * 1024);

      const [srcDur, audDur] = await Promise.all([
        probeDuration(localPath),
        probeDuration(rawAudioPath),
      ]);
      if (!srcDur) throw new Error("Source video duration could not be determined");
      if (!audDur) throw new Error("Voice-over audio duration could not be determined");
      if (srcDur > 30 * 60 || audDur > 30 * 60) throw new Error("Voice-over projects cannot exceed 30 minutes");

      await r2UploadFile(localPath, localName);
      sourceUploadsUrl = `/uploads/${localName}`;
    }

    await dbUpdateWithLease(projectId, leaseToken, { source_url: sourceUploadsUrl });

    // ── 2. Convert voice audio to WAV ─────────────────────────────────────────
    const stamp = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    let wavPath: string;

    if (rawAudioExt === ".wav") {
      wavPath = rawAudioPath;
    } else {
      wavPath = path.join(os.tmpdir(), `rvp-voice-${stamp}.wav`);
      tmpFiles.push(wavPath);
      await runFfmpegQueued(["-y", "-i", rawAudioPath, "-ar", "48000", "-ac", "1", wavPath]);
    }

    // ── 3. Upload WAV to R2, get signed URL ───────────────────────────────────
    const wavKey = `rvp-wav-${projectId}-${stamp}.wav`;
    await r2UploadFile(wavPath, wavKey);
    const wavSignedUrl = await r2GetSignedUrl(wavKey, 3600);
    if (!wavSignedUrl) throw new Error("Cannot get signed URL for voice audio");

    // ── 4. DeepFilterNet3 noise reduction ─────────────────────────────────────
    let cleanedAudioUrl: string;
    try {
      cleanedAudioUrl = await falDeepFilter(wavSignedUrl, "wav");
    } catch (err: any) {
      console.error(`[VoiceProject ${projectId}] DeepFilter failed (continuing without): ${err.message}`);
      cleanedAudioUrl = wavSignedUrl;
    }

    // ── 5. Polish audio while Scribe transcribes the cleaned source ────────────
    // Scribe does not need to wait for the local mastering pass or a second R2
    // upload. Starting it from the cleaned provider URL saves that serial wait
    // while keeping the transcription on the noise-reduced signal.
    const langCode = toScribeLanguageCode(language);
    const transcription = falScribeTranscribe(cleanedAudioUrl, langCode)
      .then((result) => ({ result } as const))
      .catch((error: unknown) => ({ error } as const));

    const cleanedLocalPath = path.join(os.tmpdir(), `rvp-clean-${stamp}.wav`);
    tmpFiles.push(cleanedLocalPath);
    await curlDownload(cleanedAudioUrl, cleanedLocalPath, 100 * 1024 * 1024);

    const polishedName = `rvp-polished-${projectId}-${stamp}.wav`;
    const polishedPath = path.join(uploadDir, polishedName);
    tmpFiles.push(polishedPath);

    await runFfmpegQueued([
      "-y", "-i", cleanedLocalPath,
      "-af",
      "highpass=f=80," +
      "acompressor=threshold=-18dB:ratio=4:attack=5:release=100:makeup=2dB," +
      "loudnorm=I=-16:TP=-1.5:LRA=11," +
      "alimiter=level_in=1:level_out=1:limit=0.95:attack=5:release=50",
      "-ar", "48000", "-ac", "1",
      polishedPath,
    ]);

    await r2UploadFile(polishedPath, polishedName);
    const audioUrl = `/uploads/${polishedName}`;
    await dbUpdateWithLease(projectId, leaseToken, { audio_url: audioUrl });

    // ── 6. Collect transcription started in parallel above ─────────────────────
    const transcriptionResult = await transcription;
    if ("error" in transcriptionResult) throw transcriptionResult.error;
    const segments = groupWordsToSegments(transcriptionResult.result.words);

    // ── 7. Persist status=review (clears lease atomically) ────────────────────
    await pool.query(
      `UPDATE rendy_voice_projects
          SET status           = 'review',
              segments         = $1,
              error            = NULL,
              lease_token      = NULL,
              lease_expires_at = NULL,
              updated_at       = NOW()
        WHERE id = $2 AND lease_token = $3`,
      [JSON.stringify(segments), projectId, leaseToken],
    );

    console.log(`[VoiceProject ${projectId}] preparation complete — ${segments.length} segments`);
  } catch (err: any) {
    console.error(`[VoiceProject ${projectId}] preparation failed: ${err.message}`);
    await pool.query(
      `UPDATE rendy_voice_projects
          SET status           = 'failed',
              error            = $1,
              lease_token      = NULL,
              lease_expires_at = NULL,
              updated_at       = NOW()
        WHERE id = $2 AND lease_token = $3`,
      [(err.message ?? "Unknown error").slice(0, 500), projectId, leaseToken],
    ).catch(() => {});
  } finally {
    for (const f of tmpFiles) fs.promises.unlink(f).catch(() => {});
    fs.promises.unlink(rawAudioPath).catch(() => {});
    await releaseJob(projectId, leaseToken);
  }
}

// ── Export pipeline ───────────────────────────────────────────────────────────

async function runExport(projectId: number, leaseToken: string, uploadDir: string): Promise<void> {
  const tmpFiles: string[] = [];

  try {
    const project = await dbGetProject(projectId);
    if (!project) throw new Error("Project not found");

    const { source_url, audio_url, segments, subtitles_enabled } = project;
    if (!source_url) throw new Error("No source video URL");
    if (!audio_url) throw new Error("No audio URL");

    const stamp = `${Date.now()}-${randomUUID().slice(0, 8)}`;

    const { localPath: srcVideoPath, isTmp: srcTmp } = await ensureLocal(
      source_url, uploadDir, `${stamp}-src`, ".mp4"
    );
    if (srcTmp) tmpFiles.push(srcVideoPath);

    const { localPath: audioPath, isTmp: audioTmp } = await ensureLocal(
      audio_url, uploadDir, `${stamp}-audio`, ".wav"
    );
    if (audioTmp) tmpFiles.push(audioPath);

    const [hasSourceAudio, sourceDuration, videoDims] = await Promise.all([
      probeHasAudio(srcVideoPath),
      probeDuration(srcVideoPath),
      probeVideoDimensions(srcVideoPath),
    ]);
    if (!sourceDuration) throw new Error("Source video duration could not be determined");

    // Resolve caption style — use stored style or fall back to default
    const captionStyle: CaptionStyleSettings = project.caption_style ?? DEFAULT_CAPTION_STYLE;
    // Use actual probed dimensions; fall back to portrait 1080×1920 if probe fails
    const videoW = videoDims?.width ?? 1080;
    const videoH = videoDims?.height ?? 1920;

    // The headline snapshot is stored at voice project creation from the edit project.
    // It is null for non-edit sources or when the edit project had no active headline.
    const headlineSnapshot = project.headline_snapshot ?? null;

    // Build a single combined ASS script for both captions and headline (if any).
    // Using one script + one ass= filter avoids re-encoding the video twice.
    let assPath: string | null = null;
    const enabledSegments = (segments ?? []).filter((s: CaptionSegment) => !s.hidden && s.text.trim());
    const wantCaptions = subtitles_enabled && enabledSegments.length > 0;
    const wantHeadline = headlineSnapshot && headlineSnapshot.enabled && headlineSnapshot.text.trim().length > 0;
    if (wantCaptions || wantHeadline) {
      assPath = path.join(os.tmpdir(), `rvp-subs-${stamp}.ass`);
      tmpFiles.push(assPath);
      fs.writeFileSync(
        assPath,
        buildCombinedAss(
          wantCaptions ? enabledSegments : [],
          captionStyle,
          wantHeadline ? headlineSnapshot! : null,
          videoW,
          videoH,
          sourceDuration,
        ),
        "utf8",
      );
    }

    const outputName = `rvp-output-${projectId}-${stamp}.mp4`;
    const outputPath = path.join(uploadDir, outputName);
    tmpFiles.push(outputPath);

    const ffArgs = buildRendyVoiceoverExportArgs(
      srcVideoPath, audioPath, outputPath, assPath, hasSourceAudio, sourceDuration,
    );
    await runFfmpegQueued(ffArgs);

    await r2UploadFile(outputPath, outputName);
    const outputUrl = `/uploads/${outputName}`;

    // Persist status=ready, clear lease atomically
    await pool.query(
      `UPDATE rendy_voice_projects
          SET status           = 'ready',
              output_url       = $1,
              error            = NULL,
              completed_at     = NOW(),
              lease_token      = NULL,
              lease_expires_at = NULL,
              updated_at       = NOW()
        WHERE id = $2 AND lease_token = $3`,
      [outputUrl, projectId, leaseToken],
    );

    console.log(`[VoiceProject ${projectId}] export complete → ${outputUrl}`);
  } catch (err: any) {
    console.error(`[VoiceProject ${projectId}] export failed: ${err.message}`);
    await pool.query(
      `UPDATE rendy_voice_projects
          SET status           = 'failed',
              error            = $1,
              lease_token      = NULL,
              lease_expires_at = NULL,
              updated_at       = NOW()
        WHERE id = $2 AND lease_token = $3`,
      [(err.message ?? "Unknown error").slice(0, 500), projectId, leaseToken],
    ).catch(() => {});
  } finally {
    for (const f of tmpFiles) fs.promises.unlink(f).catch(() => {});
    await releaseJob(projectId, leaseToken);
  }
}

// ── FFmpeg export argument builder (exported for smoke testing) ───────────────

export function buildRendyVoiceoverExportArgs(
  srcVideo: string,
  voiceAudio: string,
  output: string,
  assPath: string | null,
  hasSourceAudio: boolean,
  sourceDuration: number,
): string[] {
  const args: string[] = ["-y", "-i", srcVideo, "-i", voiceAudio];

  const escapeAssFilterPath = (value: string) =>
    value.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
  const assFilter = assPath
    ? `ass='${escapeAssFilterPath(assPath)}':fontsdir='${escapeAssFilterPath(path.join(process.cwd(), "public", "fonts"))}'`
    : null;

  const durStr = sourceDuration.toFixed(3);

  let filterComplex: string;
  let audioMap: string;

  if (hasSourceAudio) {
    const padAndSplitVoice =
      `[1:a]apad,atrim=duration=${durStr},` +
      "asplit=2[voice_sidechain][voice_mix]";

    const scFilter =
      `[0:a:0][voice_sidechain]sidechaincompress=` +
      `threshold=0.015:ratio=8:attack=10:release=500:` +
      `level_sc=0.9:makeup=1[bed_ducked]`;

    const mixFilter =
      // The source audio stream may end a little before its video stream.
      // The voice is padded to the video duration, so use the longest input to
      // preserve narration through the final frame instead of cutting it with
      // the shorter original-audio bed.
      `[bed_ducked][voice_mix]amix=inputs=2:duration=longest:weights=1 1,` +
      `atrim=duration=${durStr},` +
      `alimiter=level_in=1:level_out=1:limit=0.95:attack=5:release=50[aout]`;

    filterComplex = [padAndSplitVoice, scFilter, mixFilter].join(";");
    audioMap = "[aout]";
  } else {
    const padVoice =
      `[1:a]loudnorm=I=-14:TP=-1:LRA=7,apad,atrim=duration=${durStr},` +
      `alimiter=level_in=1:level_out=1:limit=0.95:attack=5:release=50[aout]`;
    filterComplex = padVoice;
    audioMap = "[aout]";
  }

  args.push("-filter_complex", filterComplex);
  args.push("-map", "0:v:0");
  if (assFilter) args.push("-vf", assFilter);
  args.push("-map", audioMap);
  args.push("-t", durStr);

  args.push(
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-preset", "fast",
    "-crf", "20",
    "-c:a", "aac",
    "-b:a", "128k",
    "-movflags", "+faststart",
    output,
  );

  return args;
}

// ── Retry transcription only ──────────────────────────────────────────────────

async function retryTranscription(
  projectId: number,
  leaseToken: string,
  audioUrl: string,
  language: string,
): Promise<void> {
  try {
    const key = decodeURIComponent(audioUrl.slice("/uploads/".length));
    const signedUrl = await r2GetSignedUrl(key, 3600);
    if (!signedUrl) throw new Error("Cannot get signed URL for polished audio");

    const langCode = toScribeLanguageCode(language);
    const scribeResult = await falScribeTranscribe(signedUrl, langCode);
    const segments = groupWordsToSegments(scribeResult.words);

    await pool.query(
      `UPDATE rendy_voice_projects
          SET status           = 'review',
              segments         = $1,
              error            = NULL,
              lease_token      = NULL,
              lease_expires_at = NULL,
              updated_at       = NOW()
        WHERE id = $2 AND lease_token = $3`,
      [JSON.stringify(segments), projectId, leaseToken],
    );
    console.log(`[VoiceProject ${projectId}] retryTranscription complete — ${segments.length} segments`);
  } catch (err: any) {
    console.error(`[VoiceProject ${projectId}] retryTranscription failed:`, err.message);
    await pool.query(
      `UPDATE rendy_voice_projects
          SET status           = 'failed',
              error            = $1,
              lease_token      = NULL,
              lease_expires_at = NULL,
              updated_at       = NOW()
        WHERE id = $2 AND lease_token = $3`,
      [(err.message ?? "Unknown error").slice(0, 500), projectId, leaseToken],
    ).catch(() => {});
  } finally {
    await releaseJob(projectId, leaseToken);
  }
}

// ── Resume from raw R2 audio ──────────────────────────────────────────────────

async function resumeFromRawAudio(
  projectId: number,
  leaseToken: string,
  rawAudioKey: string,
  sourceInputUrl: string,
  language: string,
  uploadDir: string,
): Promise<void> {
  const stamp = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const ext = path.extname(rawAudioKey).toLowerCase() || ".wav";
  const localPath = path.join(os.tmpdir(), `rvp-resume-${projectId}-${stamp}${ext}`);

  try {
    await restoreFromR2(rawAudioKey, localPath);
    // runPreparation handles its own lease release in finally
    await runPreparation(projectId, leaseToken, localPath, ext, sourceInputUrl, language, uploadDir);
  } catch (err: any) {
    fs.promises.unlink(localPath).catch(() => {});
    console.error(`[VoiceProject ${projectId}] resumeFromRawAudio failed:`, err.message);
    await pool.query(
      `UPDATE rendy_voice_projects
          SET status = 'failed', error = $1,
              lease_token = NULL, lease_expires_at = NULL, updated_at = NOW()
        WHERE id = $2 AND lease_token = $3`,
      [(err.message ?? "Unknown error").slice(0, 500), projectId, leaseToken],
    ).catch(() => {});
    await releaseJob(projectId, leaseToken);
  }
}

// ── Multer: audio uploads (max 50 MB, auth before parsing) ────────────────────

const ALLOWED_AUDIO_MIMES = new Set([
  "audio/wav", "audio/wave", "audio/x-wav",
  "audio/mpeg", "audio/mp3",
  "audio/mp4", "audio/x-m4a",
  "audio/ogg", "audio/webm",
  "audio/aac",
]);
const ALLOWED_AUDIO_EXTS = new Set([".wav", ".mp3", ".m4a", ".ogg", ".webm", ".aac"]);

function createAudioMulter(uploadDir: string) {
  return multer({
    storage: multer.diskStorage({
      destination: uploadDir,
      filename: (_req, _file, cb) => {
        cb(null, `rvp-upload-${Date.now()}-${randomUUID().slice(0, 8)}`);
      },
    }),
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const mime = file.mimetype.toLowerCase();
      const ext = path.extname(file.originalname).toLowerCase();
      if (ALLOWED_AUDIO_MIMES.has(mime) || ALLOWED_AUDIO_EXTS.has(ext)) {
        cb(null, true);
      } else {
        cb(new Error("Kun almindelige lydformater er tilladt (.wav, .mp3, .m4a, .ogg, .webm, .aac)"));
      }
    },
  });
}

// ── Stranded project recovery (runs at start + periodically) ──────────────────

async function recoverStrandedProjects(uploadDir: string): Promise<void> {
  try {
    // Select rows in active states whose lease has expired (or was never set)
    const res = await pool.query<VoiceProjectRow>(
      `SELECT * FROM rendy_voice_projects
        WHERE status IN ('processing', 'exporting')
          AND (lease_token IS NULL OR lease_expires_at IS NULL OR lease_expires_at < NOW())`,
    );
    if (res.rows.length === 0) return;
    console.log(`[VoiceProject] recovering ${res.rows.length} stranded project(s)`);

    for (const row of res.rows) {
      if (row.status === "exporting" && row.source_url && row.audio_url) {
        const token = await claimActiveLease(row.id, "exporting");
        if (!token) continue; // another instance claimed it
        runExport(row.id, token, uploadDir).catch((e) =>
          console.error(`[VoiceProject ${row.id}] recovery export crash:`, e)
        );
        continue;
      }

      if (row.status === "processing") {
        if (row.audio_url) {
          const token = await claimActiveLease(row.id, "processing");
          if (!token) continue;
          retryTranscription(row.id, token, row.audio_url, row.language).catch((e) =>
            console.error(`[VoiceProject ${row.id}] recovery transcription crash:`, e)
          );
          continue;
        }
        if (row.raw_audio_key && row.source_input_url) {
          const token = await claimActiveLease(row.id, "processing");
          if (!token) continue;
          resumeFromRawAudio(row.id, token, row.raw_audio_key, row.source_input_url, row.language, uploadDir).catch((e) =>
            console.error(`[VoiceProject ${row.id}] recovery resume crash:`, e)
          );
          continue;
        }
        // No recoverable audio — mark failed (no lease needed, just a plain update)
        await pool.query(
          `UPDATE rendy_voice_projects
              SET status = 'failed', error = $1, lease_token = NULL, lease_expires_at = NULL, updated_at = NOW()
            WHERE id = $2 AND (lease_expires_at IS NULL OR lease_expires_at < NOW())`,
          ["Server genstartet uden gendannelig lyddata — upload lydfilen igen", row.id],
        ).catch(() => {});
        continue;
      }

      // Exporting but missing source/audio
      await pool.query(
        `UPDATE rendy_voice_projects
            SET status = 'failed', error = $1, lease_token = NULL, lease_expires_at = NULL, updated_at = NOW()
          WHERE id = $2 AND (lease_expires_at IS NULL OR lease_expires_at < NOW())`,
        ["Server genstartet under eksport — prøv igen", row.id],
      ).catch(() => {});
    }
  } catch (e: any) {
    console.error("[VoiceProject] recovery query failed:", e.message);
  }
}

// ── Route registration ─────────────────────────────────────────────────────────

export function registerRendyVoiceoverRoutes(app: Express, uploadDir: string) {
  const audioUpload = createAudioMulter(uploadDir);

  async function requireUser(req: Request): Promise<{ userId: number }> {
    let uid: string;
    try {
      ({ uid } = await verifyFirebaseToken(req.headers.authorization));
    } catch {
      throw Object.assign(new Error("Ikke autoriseret"), { status: 401 });
    }
    const u = await storage.getUserByFirebaseUid(uid);
    if (!u) throw Object.assign(new Error("Bruger ikke fundet"), { status: 401 });
    return { userId: u.id };
  }

  function authMiddleware(req: Request, res: Response, next: NextFunction) {
    requireUser(req).then(({ userId }) => {
      (req as any).resolvedUserId = userId;
      next();
    }).catch((err) => {
      res.status(401).json({ success: false, message: err.message ?? "Ikke autoriseret" });
    });
  }

  // ── POST /api/bolig/rendy/voice-projects ──────────────────────────────────
  app.post(
    "/api/bolig/rendy/voice-projects",
    authMiddleware,
    audioUpload.single("audio"),
    async (req: Request, res: Response) => {
      let uploadedPath: string | undefined;
      let claimedProjectId: number | undefined;
      let claimedToken: string | undefined;
      try {
        const userId = (req as any).resolvedUserId as number;
        const file = req.file;
        if (!file) return res.status(400).json({ success: false, message: "Ingen lydfil uploadet" });
        uploadedPath = file.path;

        const { sourceVideoUrl, sourceVideoId, listingId, language } = req.body as Record<string, string>;
        if (!sourceVideoUrl || !sourceVideoId || !listingId) {
          await fs.promises.unlink(uploadedPath).catch(() => {});
          uploadedPath = undefined;
          return res.status(400).json({ success: false, message: "Mangler sourceVideoUrl, sourceVideoId eller listingId" });
        }

        const rawLang = (language ?? "da").toLowerCase().trim();
        const lang = ALLOWED_LANGUAGES.has(rawLang) ? rawLang : "da";

        let validatedUrl: string;
        let headlineSnapshot: HeadlineSettings | null = null;
        try {
          if (sourceVideoId.startsWith("edit:")) {
            // For edit sources, resolve the clean assembled URL and snapshot the headline
            // at creation time so later edits to the edit project don't affect this export.
            const editResult = await resolveEditSource(sourceVideoUrl, listingId, sourceVideoId, userId);
            validatedUrl = editResult.validatedUrl;
            headlineSnapshot = editResult.headlineSnapshot;
          } else {
            validatedUrl = await resolveSourceUrl(sourceVideoUrl, listingId, sourceVideoId, userId);
          }
        } catch (err: any) {
          await fs.promises.unlink(uploadedPath).catch(() => {});
          uploadedPath = undefined;
          return res.status(400).json({ success: false, message: err.message });
        }

        const origExt = path.extname(file.originalname ?? "").toLowerCase() || ".wav";
        const withExt = uploadedPath + origExt;
        fs.renameSync(uploadedPath, withExt);
        uploadedPath = withExt;

        // Insert with a pre-claimed lease so we atomically own it before background work starts
        const token = randomUUID();
        claimedToken = token;
        const expiresAt = new Date(Date.now() + LEASE_TTL_MS);
        const insertRes = await pool.query<{ id: number }>(
          `INSERT INTO rendy_voice_projects
             (user_id, listing_id, source_video_id, status, language, source_input_url,
              headline_snapshot, lease_token, lease_expires_at)
           VALUES ($1, $2, $3, 'processing', $4, $5, $6::jsonb, $7, $8)
           RETURNING id`,
          [userId, listingId, sourceVideoId, lang, validatedUrl,
           headlineSnapshot != null ? JSON.stringify(headlineSnapshot) : null,
           token, expiresAt],
        );
        const projectId = insertRes.rows[0].id;
        claimedProjectId = projectId;

        // Start heartbeat for the new row
        startHeartbeat(projectId, token);

        // Upload raw audio to R2, persist key — respond only after this succeeds
        const rawAudioKey = `rvp-raw-${projectId}-${Date.now()}${origExt}`;
        await r2UploadFile(withExt, rawAudioKey);
        await dbUpdateWithLease(projectId, token, { raw_audio_key: rawAudioKey });

        const project = await dbGetProject(projectId);
        if (!project) throw new Error("Voice-over-projektet kunne ikke indlæses efter oprettelse");

        // Fire-and-forget preparation — token is already registered in heartbeat
        runPreparation(projectId, token, withExt, origExt, validatedUrl, lang, uploadDir)
          .catch((e) => console.error(`[VoiceProject ${projectId}] prep crash:`, e));

        uploadedPath = undefined;
        claimedProjectId = undefined;
        claimedToken = undefined;
        return res.json({ success: true, project: toPublicProject(project) });
      } catch (err: any) {
        if (uploadedPath) fs.promises.unlink(uploadedPath).catch(() => {});
        if (claimedProjectId != null && claimedToken) {
          await pool.query(
            `UPDATE rendy_voice_projects
                SET status = 'failed', error = $1,
                    lease_token = NULL, lease_expires_at = NULL, updated_at = NOW()
              WHERE id = $2 AND lease_token = $3`,
            [(err.message ?? "Unknown error").slice(0, 500), claimedProjectId, claimedToken],
          ).catch(() => {});
          await releaseJob(claimedProjectId, claimedToken);
        }
        if (err?.status === 401) return res.status(401).json({ success: false, message: err.message });
        console.error("[VoiceProject] POST error:", err.message);
        return res.status(500).json({ success: false, message: err.message });
      }
    },
  );

  // ── GET /api/bolig/rendy/voice-projects/by-video ─────────────────────────
  app.get("/api/bolig/rendy/voice-projects/by-video", async (req: Request, res: Response) => {
    try {
      const { userId } = await requireUser(req);
      const { listingId, videoId } = req.query as Record<string, string>;
      if (!listingId || !videoId) {
        return res.status(400).json({ success: false, message: "Mangler listingId eller videoId" });
      }
      const result = await pool.query<VoiceProjectRow>(
        `SELECT * FROM rendy_voice_projects
         WHERE user_id = $1 AND listing_id = $2 AND source_video_id = $3
         ORDER BY created_at DESC LIMIT 1`,
        [userId, listingId, videoId],
      );
      const project = result.rows[0] ?? null;
      return res.json({ success: true, project: project ? toPublicProject(project) : null });
    } catch (err: any) {
      if (err?.status === 401) return res.status(401).json({ success: false, message: err.message });
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // ── GET /api/bolig/rendy/voice-projects/recent ───────────────────────────
  app.get("/api/bolig/rendy/voice-projects/recent", async (req: Request, res: Response) => {
    try {
      const { userId } = await requireUser(req);
      const result = await pool.query<VoiceProjectRow>(
        `SELECT * FROM rendy_voice_projects
         WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
        [userId],
      );
      return res.json({ success: true, projects: result.rows.map(toPublicProject) });
    } catch (err: any) {
      if (err?.status === 401) return res.status(401).json({ success: false, message: err.message });
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // ── GET /api/bolig/rendy/voice-projects/:id ──────────────────────────────
  app.get("/api/bolig/rendy/voice-projects/:id", async (req: Request, res: Response) => {
    try {
      const { userId } = await requireUser(req);
      const id = parseInt(req.params["id"] as string, 10);
      if (!id) return res.status(400).json({ success: false, message: "Ugyldigt projekt-id" });
      const project = await dbGetProjectOwned(id, userId);
      if (!project) return res.status(404).json({ success: false, message: "Projekt ikke fundet" });
      return res.json({ success: true, project: toPublicProject(project) });
    } catch (err: any) {
      if (err?.status === 401) return res.status(401).json({ success: false, message: err.message });
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // ── PATCH /api/bolig/rendy/voice-projects/:id ────────────────────────────
  app.patch("/api/bolig/rendy/voice-projects/:id", async (req: Request, res: Response) => {
    try {
      const { userId } = await requireUser(req);
      const id = parseInt(req.params["id"] as string, 10);
      if (!id) return res.status(400).json({ success: false, message: "Ugyldigt projekt-id" });

      const project = await dbGetProjectOwned(id, userId);
      if (!project) return res.status(404).json({ success: false, message: "Projekt ikke fundet" });
      if (project.status !== "review") {
        return res.status(409).json({ success: false, message: "Segmenter kan kun redigeres i review-tilstand" });
      }

      const { segments, subtitlesEnabled, captionStyle } = req.body;

      let validatedSegments: CaptionSegment[] | undefined;
      if (segments !== undefined) {
        if (!Array.isArray(segments)) {
          return res.status(400).json({ success: false, message: "segments skal være et array" });
        }
        if (segments.length > 250) {
          return res.status(400).json({ success: false, message: "Maks 250 segmenter tilladt" });
        }
        validatedSegments = segments.map((s: unknown, i: number) => {
          const seg = s as Record<string, unknown>;
          if (typeof seg.id !== "string" || seg.id.length > 100) {
            throw Object.assign(new Error(`segment[${i}].id ugyldigt`), { status: 400 });
          }
          if (typeof seg.start !== "number" || typeof seg.end !== "number" ||
              !isFinite(seg.start) || !isFinite(seg.end)) {
            throw Object.assign(new Error(`segment[${i}] tidsstempel er ikke finite`), { status: 400 });
          }
          const MAX_END = 30 * 60;
          if (seg.start < 0 || seg.end <= seg.start || seg.end > MAX_END) {
            throw Object.assign(new Error(`segment[${i}] tidsstempel ude af interval (0 ≤ start < end ≤ 1800)`), { status: 400 });
          }
          if (typeof seg.text !== "string") {
            throw Object.assign(new Error(`segment[${i}].text mangler`), { status: 400 });
          }
          return {
            id: seg.id,
            start: seg.start,
            end: seg.end,
            text: seg.text.trim().slice(0, 240),
            hidden: !!seg.hidden,
          } as CaptionSegment;
        });
      }

      // Validate captionStyle if provided
      let validatedCaptionStyle: CaptionStyleSettings | null | undefined;
      if (captionStyle !== undefined) {
        if (captionStyle === null) {
          validatedCaptionStyle = null; // reset to default
        } else if (typeof captionStyle !== "object" || Array.isArray(captionStyle)) {
          return res.status(400).json({ success: false, message: "captionStyle skal være et objekt" });
        } else {
          const cs = captionStyle as Record<string, unknown>;

          if (!isRendyTypographyId(cs.fontId)) {
            return res.status(400).json({ success: false, message: "captionStyle.fontId er ikke et gyldigt skrifttype-id" });
          }
          const size = Number(cs.size);
          if (!Number.isFinite(size) || size < CAPTION_SIZE_MIN || size > CAPTION_SIZE_MAX) {
            return res.status(400).json({ success: false, message: `captionStyle.size skal være et tal mellem ${CAPTION_SIZE_MIN} og ${CAPTION_SIZE_MAX}` });
          }
          const VALID_CONTRASTS: CaptionContrast[] = ["shadow", "box", "outline"];
          if (!VALID_CONTRASTS.includes(cs.contrast as CaptionContrast)) {
            return res.status(400).json({ success: false, message: "captionStyle.contrast skal være 'shadow', 'box' eller 'outline'" });
          }
          const VALID_POSITIONS: CaptionPosition[] = ["high", "center", "low"];
          if (!VALID_POSITIONS.includes(cs.position as CaptionPosition)) {
            return res.status(400).json({ success: false, message: "captionStyle.position skal være 'high', 'center' eller 'low'" });
          }
          validatedCaptionStyle = {
            fontId: cs.fontId,
            size,
            contrast: cs.contrast as CaptionContrast,
            position: cs.position as CaptionPosition,
          };
        }
      }

      const updatedResult = await pool.query<VoiceProjectRow>(
        `UPDATE rendy_voice_projects
            SET segments = CASE
                  WHEN $1::jsonb IS NULL THEN segments
                  ELSE $1::jsonb
                END,
                subtitles_enabled = COALESCE($2::boolean, subtitles_enabled),
                caption_style = CASE
                  WHEN $5::text = '__omit__' THEN caption_style
                  ELSE $5::jsonb
                END,
                updated_at = NOW()
          WHERE id = $3 AND user_id = $4 AND status = 'review'
          RETURNING *`,
        [
          validatedSegments === undefined ? null : JSON.stringify(validatedSegments),
          typeof subtitlesEnabled === "boolean" ? subtitlesEnabled : null,
          id,
          userId,
          validatedCaptionStyle === undefined ? "__omit__" : JSON.stringify(validatedCaptionStyle),
        ],
      );
      const updated = updatedResult.rows[0];
      if (!updated) {
        return res.status(409).json({
          success: false,
          message: "Projektet skiftede status, før ændringerne kunne gemmes",
        });
      }
      return res.json({ success: true, project: toPublicProject(updated) });
    } catch (err: any) {
      if (err?.status === 401) return res.status(401).json({ success: false, message: err.message });
      return res.status(400).json({ success: false, message: err.message });
    }
  });

  // ── POST /api/bolig/rendy/voice-projects/:id/export ─────────────────────
  app.post("/api/bolig/rendy/voice-projects/:id/export", async (req: Request, res: Response) => {
    try {
      const { userId } = await requireUser(req);
      const id = parseInt(req.params["id"] as string, 10);
      if (!id) return res.status(400).json({ success: false, message: "Ugyldigt projekt-id" });

      const project = await dbGetProjectOwned(id, userId);
      if (!project) return res.status(404).json({ success: false, message: "Projekt ikke fundet" });

      if (project.status === "processing") {
        return res.status(409).json({ success: false, message: "Projektet er stadig under forberedelse" });
      }
      if (project.status === "failed") {
        return res.status(409).json({ success: false, message: "Projektet fejlede — brug /retry først" });
      }
      if (project.status === "exporting" || project.status === "ready") {
        return res.json({ success: true, project: toPublicProject(project) });
      }

      // Atomically transition review → exporting and claim lease
      const token = await claimLease(id, userId, "review", "exporting");
      if (!token) {
        // Another worker already claimed it — return current state
        const current = await dbGetProjectOwned(id, userId);
        return res.json({ success: true, project: toPublicProject(current!) });
      }

      runExport(id, token, uploadDir).catch((e) =>
        console.error(`[VoiceProject ${id}] export crash:`, e)
      );

      const updated = await dbGetProjectOwned(id, userId);
      return res.json({ success: true, project: toPublicProject(updated!) });
    } catch (err: any) {
      if (err?.status === 401) return res.status(401).json({ success: false, message: err.message });
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // ── POST /api/bolig/rendy/voice-projects/:id/retry ──────────────────────
  app.post("/api/bolig/rendy/voice-projects/:id/retry", async (req: Request, res: Response) => {
    try {
      const { userId } = await requireUser(req);
      const id = parseInt(req.params["id"] as string, 10);
      if (!id) return res.status(400).json({ success: false, message: "Ugyldigt projekt-id" });

      const project = await dbGetProjectOwned(id, userId);
      if (!project) return res.status(404).json({ success: false, message: "Projekt ikke fundet" });
      if (project.status !== "failed") {
        return res.status(409).json({ success: false, message: "Kun mislykkede projekter kan genstarte" });
      }

      // If segments + audio_url exist → export previously failed; restore review atomically
      if (project.segments && (project.segments as CaptionSegment[]).length > 0 && project.audio_url) {
        const res2 = await pool.query<{ id: number }>(
          `UPDATE rendy_voice_projects
              SET status = 'review', error = NULL, updated_at = NOW()
            WHERE id = $1 AND user_id = $2 AND status = 'failed'
            RETURNING id`,
          [id, userId],
        );
        if (!res2.rows[0]) {
          const cur = await dbGetProjectOwned(id, userId);
          return res.json({ success: true, project: toPublicProject(cur!) });
        }
        const updated = await dbGetProjectOwned(id, userId);
        return res.json({ success: true, project: toPublicProject(updated!) });
      }

      // audio_url set → retry transcription atomically (failed → processing + lease)
      if (project.audio_url) {
        const token = await claimLease(id, userId, "failed", "processing");
        if (!token) {
          const cur = await dbGetProjectOwned(id, userId);
          return res.json({ success: true, project: toPublicProject(cur!) });
        }
        retryTranscription(id, token, project.audio_url, project.language).catch((e) =>
          console.error(`[VoiceProject ${id}] retry crash:`, e)
        );
        const updated = await dbGetProjectOwned(id, userId);
        return res.json({ success: true, project: toPublicProject(updated!) });
      }

      // raw_audio_key set → resume from raw audio atomically (failed → processing + lease)
      if (project.raw_audio_key && project.source_input_url) {
        const token = await claimLease(id, userId, "failed", "processing");
        if (!token) {
          const cur = await dbGetProjectOwned(id, userId);
          return res.json({ success: true, project: toPublicProject(cur!) });
        }
        resumeFromRawAudio(id, token, project.raw_audio_key, project.source_input_url, project.language, uploadDir)
          .catch((e) => console.error(`[VoiceProject ${id}] resume crash:`, e));
        const updated = await dbGetProjectOwned(id, userId);
        return res.json({ success: true, project: toPublicProject(updated!) });
      }

      return res.status(422).json({ success: false, message: "Ingen gendannelig lyddata — upload lydfilen igen" });
    } catch (err: any) {
      if (err?.status === 401) return res.status(401).json({ success: false, message: err.message });
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // ── Recovery: run at registration + every 60 s (unreffed) ────────────────
  recoverStrandedProjects(uploadDir).catch((e) =>
    console.error("[VoiceProject] recovery error:", e)
  );

  const recoveryInterval = setInterval(
    () => recoverStrandedProjects(uploadDir).catch((e) =>
      console.error("[VoiceProject] periodic recovery error:", e)
    ),
    LEASE_HEARTBEAT_MS,
  );
  if (recoveryInterval.unref) recoveryInterval.unref();
}
