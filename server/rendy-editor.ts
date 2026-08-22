/**
 * Durable editor for completed Rendy deliveries.
 *
 * A project owns a listing-level manifest of visually grouped, complete source
 * shots. The project stores only references/trims to immutable source videos;
 * render work is resumed from the database after a restart.
 */
import type { Express, Request } from "express";
import fs from "fs";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";
import { spawn } from "child_process";
import { pipeline } from "stream/promises";
import { pool } from "./db";
import { verifyFirebaseToken } from "./firebase-admin";
import { storage } from "./storage";
import { r2GetStream, r2UploadFile } from "./r2";
import { runFfmpegQueued, runFfmpegQueuedToBuffer } from "./showcase";
import {
  RENDY_TYPOGRAPHY_PRESETS,
  DEFAULT_HEADLINE_SETTINGS,
  isRendyTypographyId,
  HEADLINE_SIZE_MIN,
  HEADLINE_SIZE_MAX,
  HEADLINE_POSITION_MIN,
  HEADLINE_POSITION_MAX_X,
  HEADLINE_POSITION_MAX_Y,
  HEADLINE_TEXT_ASS_COLOR,
  headlineFadeDurations,
  type HeadlineSettings,
} from "../shared/rendy-text";

const LEASE_TTL_MS = 5 * 60 * 1000;
const MAX_SOURCE_BYTES = 500 * 1024 * 1024;
const MAX_SOURCE_DURATION = 30 * 60;
const SCENE_THRESHOLD = 0.32;
const MAX_SCENES_PER_DELIVERY = 40;
const SIGNATURE_WIDTH = 16;
const SIGNATURE_HEIGHT = 16;
const SIGNATURE_BYTES = SIGNATURE_WIDTH * SIGNATURE_HEIGHT;

type ProjectStatus = "preparing" | "draft" | "analyzing" | "rendering" | "ready" | "failed";
type JobStage = "prepare" | "analyze" | "render" | "headline";

interface DeliveredVideo {
  id: string;
  url: string | null;
  status?: string | null;
}

interface Signature {
  values: number[];
}

export interface RendyShotCandidate {
  id: string;
  sourceVideoId: string;
  sourceUrl: string;
  duration: number;
  safeStart: number;
  safeEnd: number;
  width: number;
  height: number;
  fps: number;
  qualityScore: number;
  motionScore: number;
  startSignature: Signature;
  midSignature: Signature;
  endSignature: Signature;
  thumbnailUrl?: string;
}

export interface RendyShot {
  id: string;
  label: string;
  duration: number;
  selectedCandidateId: string;
  candidates: RendyShotCandidate[];
}

export interface RendyShotManifest {
  version: number;
  createdAt: string;
  shots: RendyShot[];
  sourceMembership: Record<string, string[]>;
}

interface TimelineItem {
  shotId: string;
  candidateId: string;
}

interface TransitionPlan {
  type: "fade" | "dissolve";
  duration: number;
  confidence: number;
}

interface RenderClipPlan {
  shotId: string;
  candidateId: string;
  sourceUrl: string;
  sourceVideoId: string;
  start: number;
  end: number;
}

interface EditPlan {
  clips: RenderClipPlan[];
  transitions: TransitionPlan[];
  totalDuration: number;
}

interface ProjectRow {
  id: string;
  user_id: number;
  listing_id: string;
  source_video_id: string;
  manifest_revision: number | null;
  timeline: TimelineItem[] | null;
  analysis_plan: EditPlan | null;
  headline: HeadlineSettings | null;
  status: ProjectStatus;
  job_stage: JobStage | null;
  output_url: string | null;
  /** Clean assembled output before headline burn (private — not exposed in public API). */
  clean_output_url: string | null;
  error: string | null;
  lease_token: string | null;
  lease_expires_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

type MediaInfo = { duration: number; width: number; height: number; fps: number; bitrate: number; hasAudio: boolean };
const activeLeases = new Map<string, { token: string; timer: ReturnType<typeof setInterval> }>();

function finite(value: unknown, fallback = 0): number {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function parseFps(raw: unknown): number {
  const [a, b] = String(raw ?? "").split("/").map(Number);
  return a > 0 && b > 0 ? a / b : finite(a, 30);
}

function toPublicManifest(manifest: RendyShotManifest | null) {
  return manifest;
}

function toPublicProject(row: ProjectRow, manifest: RendyShotManifest | null) {
  return {
    id: row.id,
    listingId: row.listing_id,
    sourceVideoId: row.source_video_id,
    manifestRevision: row.manifest_revision,
    manifest: toPublicManifest(manifest),
    timeline: row.timeline ?? [],
    headline: row.headline ?? DEFAULT_HEADLINE_SETTINGS,
    status: row.status,
    outputUrl: row.output_url,
    // Clean assembled master (pre-headline). Exposed only via owner-scoped
    // responses so the client can preview / compose without the burned headline.
    cleanOutputUrl: row.clean_output_url,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function ensureRendyEditorTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rendy_edit_manifests (
      listing_id  text PRIMARY KEY,
      user_id     integer NOT NULL REFERENCES users(id),
      revision    integer NOT NULL DEFAULT 1,
      payload     jsonb NOT NULL,
      created_at  timestamptz NOT NULL DEFAULT NOW(),
      updated_at  timestamptz NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rendy_edit_projects (
      id                text PRIMARY KEY,
      user_id           integer NOT NULL REFERENCES users(id),
      listing_id        text NOT NULL,
      source_video_id   text NOT NULL,
      manifest_revision integer,
      timeline          jsonb NOT NULL DEFAULT '[]'::jsonb,
      analysis_plan     jsonb,
      status            text NOT NULL DEFAULT 'preparing',
      job_stage         text,
      output_url        text,
      error             text,
      lease_token       text,
      lease_expires_at  timestamptz,
      created_at        timestamptz NOT NULL DEFAULT NOW(),
      updated_at        timestamptz NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS rendy_edit_projects_owner_idx ON rendy_edit_projects (user_id, listing_id, created_at DESC)`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS rendy_edit_projects_source_unique_idx ON rendy_edit_projects (user_id, listing_id, source_video_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS rendy_edit_projects_recovery_idx ON rendy_edit_projects (lease_expires_at) WHERE status IN ('preparing', 'analyzing', 'rendering')`);
  // Additive: headline text layer (nullable jsonb — null = disabled/default)
  await pool.query(`ALTER TABLE rendy_edit_projects ADD COLUMN IF NOT EXISTS headline jsonb`);
  // Additive: clean assembled output before headline burn (private, used by voiceover layer)
  await pool.query(`ALTER TABLE rendy_edit_projects ADD COLUMN IF NOT EXISTS clean_output_url text`);
}

async function requireUser(req: Request): Promise<{ userId: number }> {
  try {
    const { uid } = await verifyFirebaseToken(req.headers.authorization);
    const user = await storage.getUserByFirebaseUid(uid);
    if (!user) throw new Error("Brugeren blev ikke fundet");
    return { userId: user.id };
  } catch {
    throw Object.assign(new Error("Log ind for at redigere videoen"), { status: 401 });
  }
}

async function getOwnedDeliveryVideos(listingId: string, userId: number): Promise<DeliveredVideo[]> {
  const result = await pool.query<{ user_id: number; videos: DeliveredVideo[] | null }>(
    `SELECT user_id, videos FROM rendy_jobs WHERE listing_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [listingId],
  );
  const row = result.rows[0];
  if (!row || row.user_id !== userId) throw Object.assign(new Error("Du ejer ikke denne Rendy-levering"), { status: 404 });
  const videos = (row.videos ?? []).filter((video): video is DeliveredVideo =>
    !!video && typeof video.id === "string" && typeof video.url === "string" && video.url.length > 0,
  );
  if (!videos.length) throw Object.assign(new Error("Der er endnu ingen færdige videoer at redigere"), { status: 409 });
  return videos;
}

async function getManifest(listingId: string, userId: number, revision?: number | null): Promise<{ manifest: RendyShotManifest; revision: number } | null> {
  const revisionClause = revision == null ? "" : " AND revision = $3";
  const values: unknown[] = [listingId, userId];
  if (revision != null) values.push(revision);
  const result = await pool.query<{ payload: RendyShotManifest; revision: number }>(
    `SELECT payload, revision FROM rendy_edit_manifests WHERE listing_id = $1 AND user_id = $2${revisionClause}`,
    values,
  );
  const row = result.rows[0];
  return row ? { manifest: row.payload, revision: row.revision } : null;
}

async function getProject(id: string, userId?: number): Promise<ProjectRow | null> {
  const values: unknown[] = [id];
  const where = userId == null ? "id = $1" : "id = $1 AND user_id = $2";
  if (userId != null) values.push(userId);
  const result = await pool.query<ProjectRow>(`SELECT * FROM rendy_edit_projects WHERE ${where}`, values);
  return result.rows[0] ?? null;
}

async function manifestForProject(project: ProjectRow): Promise<RendyShotManifest | null> {
  const result = await getManifest(project.listing_id, project.user_id, project.manifest_revision);
  return result?.manifest ?? null;
}

function localKey(url: string): string | null {
  if (!url.startsWith("/uploads/")) return null;
  const key = decodeURIComponent(url.slice("/uploads/".length));
  return key && !key.includes("..") ? key : null;
}

function safeRemoteUrl(url: string): URL {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || !parsed.hostname || parsed.hostname === "localhost") {
    throw new Error("Den gemte videokilde er ikke en sikker HTTPS-URL");
  }
  const host = parsed.hostname.toLowerCase();
  if (/^(127\.|0\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) || host === "::1") {
    throw new Error("Den gemte videokilde peger på et privat netværk");
  }
  return parsed;
}

async function downloadWithCurl(url: string, destination: string): Promise<void> {
  safeRemoteUrl(url);
  await new Promise<void>((resolve, reject) => {
    const proc = spawn("curl", [
      "--location", "--silent", "--show-error", "--fail",
      "--proto", "=https", "--connect-timeout", "15", "--max-time", "300",
      "--max-filesize", String(MAX_SOURCE_BYTES), "--output", destination, url,
    ]);
    let stderr = "";
    proc.stderr.on("data", (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-1600); });
    proc.on("error", reject);
    proc.on("close", code => code === 0 ? resolve() : reject(new Error(`Kunde ikke hente videokilden (${stderr || `curl ${code}`})`)));
  });
}

async function materializeSource(sourceUrl: string, tempPath: string): Promise<void> {
  const key = localKey(sourceUrl);
  if (key) {
    const stream = await r2GetStream(key);
    if (!stream) throw new Error("Den gemte videokilde findes ikke længere i R2");
    await pipeline(stream, fs.createWriteStream(tempPath));
    return;
  }
  await downloadWithCurl(sourceUrl, tempPath);
}

export async function probeVideo(filePath: string): Promise<MediaInfo> {
  const output = await new Promise<string>((resolve, reject) => {
    const proc = spawn("ffprobe", [
      "-v", "error", "-show_entries",
      "format=duration,bit_rate:stream=codec_type,width,height,avg_frame_rate,bit_rate,duration",
      "-of", "json", filePath,
    ]);
    let out = "";
    let err = "";
    proc.stdout.on("data", d => { out += d.toString(); });
    proc.stderr.on("data", d => { err += d.toString(); });
    proc.on("error", reject);
    proc.on("close", code => code === 0 ? resolve(out) : reject(new Error(`Kunne ikke måle videofilen: ${err.slice(-500)}`)));
  });
  const data = JSON.parse(output) as { format?: Record<string, unknown>; streams?: Array<Record<string, unknown>> };
  const video = data.streams?.find(stream => stream.codec_type === "video");
  if (!video) throw new Error("Videofilen indeholder ingen videostrøm");
  const formatDuration = finite(data.format?.duration);
  const videoDuration = finite(video.duration);
  // Containers often inherit their duration from a slightly longer audio track.
  // Scene sampling must never seek beyond the final decodable video frame.
  const duration = videoDuration > 0 && formatDuration > 0
    ? Math.min(videoDuration, formatDuration)
    : videoDuration || formatDuration;
  if (!duration || duration > MAX_SOURCE_DURATION) throw new Error("Videolængden er uden for det tilladte interval");
  return {
    duration,
    width: finite(video.width),
    height: finite(video.height),
    fps: parseFps(video.avg_frame_rate),
    bitrate: finite(video.bit_rate, finite(data.format?.bit_rate)),
    hasAudio: data.streams?.some(stream => stream.codec_type === "audio") ?? false,
  };
}

async function sceneBoundaries(filePath: string, duration: number): Promise<number[]> {
  const result = await new Promise<string>((resolve) => {
    const proc = spawn("ffmpeg", [
      "-hide_banner", "-i", filePath,
      "-vf", `select='gt(scene,${SCENE_THRESHOLD})',showinfo`,
      "-an", "-f", "null", "-",
    ]);
    let stderr = "";
    proc.stderr.on("data", chunk => { stderr = (stderr + chunk.toString()).slice(-200_000); });
    proc.on("close", () => resolve(stderr));
    proc.on("error", () => resolve(""));
  });
  const points = [0];
  const matcher = /pts_time:([0-9.]+)/g;
  let match: RegExpExecArray | null;
  while ((match = matcher.exec(result))) {
    const point = finite(match[1]);
    if (point > 0.65 && duration - point > 0.65 && point - points[points.length - 1] > 0.65) points.push(point);
    if (points.length >= MAX_SCENES_PER_DELIVERY) break;
  }
  points.push(duration);
  return points;
}

async function rawSignatureFrame(filePath: string, at: number): Promise<Buffer> {
  // A short input seek keeps long videos fast; the output seek then decodes
  // accurately from the nearby keyframe instead of trusting a fast seek alone.
  const coarseSeek = Math.max(0, at - 2);
  const accurateSeek = at - coarseSeek;
  return runFfmpegQueuedToBuffer([
    "-hide_banner", "-loglevel", "error",
    "-ss", coarseSeek.toFixed(3), "-i", filePath,
    "-ss", accurateSeek.toFixed(3),
    "-map", "0:v:0", "-frames:v", "1",
    "-vf", `scale=${SIGNATURE_WIDTH}:${SIGNATURE_HEIGHT}:flags=area,format=gray`,
    "-an", "-sn", "-dn",
    "-f", "rawvideo", "-pix_fmt", "gray", "pipe:1",
  ], SIGNATURE_BYTES, 30_000);
}

async function createCandidateThumbnail(
  filePath: string,
  at: number,
  duration: number,
  fps: number,
  listingId: string,
  candidateId: string,
  tempDir: string,
): Promise<string | undefined> {
  const endMargin = Math.max(0.12, 3 / Math.max(1, fps));
  const safeAt = Math.min(Math.max(0, at), Math.max(0, duration - endMargin));
  const coarseSeek = Math.max(0, safeAt - 2);
  const accurateSeek = safeAt - coarseSeek;
  const safeListingId = listingId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const key = `rendy-edit-thumb-${safeListingId}-${candidateId}.jpg`;
  const outputPath = path.join(tempDir, key);

  try {
    await runFfmpegQueued([
      "-y", "-hide_banner", "-loglevel", "error",
      "-ss", coarseSeek.toFixed(3), "-i", filePath,
      "-ss", accurateSeek.toFixed(3),
      "-map", "0:v:0", "-frames:v", "1",
      "-vf", "scale=320:180:force_original_aspect_ratio=increase,crop=320:180",
      "-q:v", "4",
      outputPath,
    ]);
    await r2UploadFile(outputPath, key);
    return `/uploads/${key}`;
  } catch (error) {
    console.warn(
      `[rendy-edit] Could not create thumbnail for ${candidateId}:`,
      error instanceof Error ? error.message : error,
    );
    return undefined;
  } finally {
    fs.promises.unlink(outputPath).catch(() => {});
  }
}

export async function signatureForFrame(
  filePath: string,
  at: number,
  duration: number,
  fps: number,
): Promise<Signature> {
  // Keep extracted pixels in memory. Clamp against the video stream (not the
  // possibly longer audio/container duration) and retry slightly earlier when a
  // VFR/edit-list source has no decodable frame at the requested timestamp.
  const endMargin = Math.max(0.12, 3 / Math.max(1, fps));
  const latestSafeTime = Math.max(0, duration - endMargin);
  const requested = Math.min(Math.max(0, at), latestSafeTime);
  const attempts = Array.from(new Set([
    requested,
    Math.max(0, requested - 0.15),
    Math.max(0, requested - 0.5),
    Math.min(latestSafeTime, 0.05),
  ].map(value => value.toFixed(3)))).map(Number);

  for (const attempt of attempts) {
    const data = await rawSignatureFrame(filePath, attempt);
    if (data.length === SIGNATURE_BYTES) {
      return { values: Array.from(data.values(), value => value / 255) };
    }
  }

  throw new Error("En videoramme kunne ikke læses. Prøv igen, eller vælg en anden Rendy-video.");
}

function signatureDistance(a: Signature, b: Signature): number {
  if (!a.values.length || a.values.length !== b.values.length) return 1;
  return a.values.reduce((sum, value, index) => sum + Math.abs(value - b.values[index]), 0) / a.values.length;
}

function candidateSimilarity(a: RendyShotCandidate, b: RendyShotCandidate): number {
  const endpoint = Math.max(
    signatureDistance(a.startSignature, b.startSignature),
    signatureDistance(a.endSignature, b.endSignature),
  );
  const midpoint = signatureDistance(a.midSignature, b.midSignature);
  const motionDifference = Math.abs(a.motionScore - b.motionScore);
  // Scene grouping must prefer a false split over a false merge. A shared
  // doorway, fade-to-black, or exterior frame is not enough to prove two
  // complete actions are the same shot; both ends, a representative middle
  // frame, and motion character must agree.
  return Math.max(endpoint, midpoint, motionDifference * 0.8);
}

async function candidatesForVideo(video: DeliveredVideo, listingId: string, tempDir: string): Promise<RendyShotCandidate[]> {
  if (!video.url) return [];
  const inputPath = path.join(tempDir, `${video.id.replace(/[^a-zA-Z0-9_-]/g, "_")}-${randomUUID()}.mp4`);
  try {
    await materializeSource(video.url, inputPath);
    // A delivery that fell back to the Rendy CDN is copied unchanged to durable
    // storage before we reference it from a resumable project. This is a source
    // archive, not a replacement of the customer's original Rendy delivery.
    const archivedUrl = localKey(video.url)
      ? video.url
      : `/uploads/rendy-edit-source-${listingId.replace(/[^a-zA-Z0-9_-]/g, "_")}-${video.id.replace(/[^a-zA-Z0-9_-]/g, "_")}.mp4`;
    if (!localKey(video.url)) {
      await r2UploadFile(inputPath, archivedUrl.slice("/uploads/".length));
    }
    const info = await probeVideo(inputPath);
    const boundaries = await sceneBoundaries(inputPath, info.duration);
    const candidates: RendyShotCandidate[] = [];
    for (let index = 0; index < boundaries.length - 1; index++) {
      const safeStart = boundaries[index];
      const safeEnd = boundaries[index + 1];
      const duration = safeEnd - safeStart;
      if (duration < 0.65) continue;
      const [startSignature, midSignature, endSignature] = await Promise.all([
        signatureForFrame(inputPath, safeStart + Math.min(0.10, duration * 0.08), info.duration, info.fps),
        signatureForFrame(inputPath, safeStart + duration / 2, info.duration, info.fps),
        signatureForFrame(inputPath, safeEnd - Math.min(0.10, duration * 0.08), info.duration, info.fps),
      ]);
      const motionScore = signatureDistance(startSignature, endSignature);
      const candidateId = randomUUID();
      const thumbnailUrl = await createCandidateThumbnail(
        inputPath,
        safeStart + duration / 2,
        info.duration,
        info.fps,
        listingId,
        candidateId,
        tempDir,
      );
      candidates.push({
        id: candidateId,
        sourceVideoId: video.id,
        sourceUrl: archivedUrl,
        duration,
        safeStart,
        safeEnd,
        width: info.width,
        height: info.height,
        fps: info.fps,
        qualityScore: info.width * info.height + Math.min(info.bitrate, 25_000_000) / 10 + Math.min(duration, 30),
        motionScore, midSignature,
        startSignature,
        endSignature,
        thumbnailUrl,
      });
    }
    // A difficult source can have no detected scene boundary. Treat its full,
    // complete delivery as one shot rather than inventing a partial segment.
    if (!candidates.length) {
      const [startSignature, midSignature, endSignature] = await Promise.all([
        signatureForFrame(inputPath, 0.05, info.duration, info.fps),
        signatureForFrame(inputPath, info.duration / 2, info.duration, info.fps),
        signatureForFrame(inputPath, Math.max(0.05, info.duration - 0.05), info.duration, info.fps),
      ]);
      const candidateId = randomUUID();
      const thumbnailUrl = await createCandidateThumbnail(
        inputPath,
        info.duration / 2,
        info.duration,
        info.fps,
        listingId,
        candidateId,
        tempDir,
      );
      candidates.push({
        id: candidateId, sourceVideoId: video.id, sourceUrl: archivedUrl, duration: info.duration,
        safeStart: 0, safeEnd: info.duration, width: info.width, height: info.height, fps: info.fps,
        qualityScore: info.width * info.height + Math.min(info.bitrate, 25_000_000) / 10,
        motionScore: signatureDistance(startSignature, endSignature), startSignature, midSignature, endSignature,
        thumbnailUrl,
      });
    }
    return candidates;
  } finally {
    fs.promises.unlink(inputPath).catch(() => {});
  }
}

async function buildManifest(videos: DeliveredVideo[], listingId: string): Promise<RendyShotManifest> {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "rendy-edit-manifest-"));
  try {
    const candidatesByVideo = new Map<string, RendyShotCandidate[]>();
    for (const video of videos) candidatesByVideo.set(video.id, await candidatesForVideo(video, listingId, tempDir));
    const groups: RendyShotCandidate[][] = [];
    for (const candidate of Array.from(candidatesByVideo.values()).flat()) {
      const group = groups.find(existing => candidateSimilarity(existing[0], candidate) <= 0.12);
      if (group) group.push(candidate);
      else groups.push([candidate]);
    }
    const shots = groups.map((candidates, index): RendyShot => {
      const ordered = [...candidates].sort((a, b) => b.qualityScore - a.qualityScore);
      const selected = ordered[0];
      return {
        id: `shot-${index + 1}-${selected.id.slice(0, 8)}`,
        label: `Klip ${index + 1}`,
        duration: selected.safeEnd - selected.safeStart,
        selectedCandidateId: selected.id,
        candidates: ordered,
      };
    });
    const sourceMembership: Record<string, string[]> = {};
    for (const [videoId, candidates] of Array.from(candidatesByVideo.entries())) {
      const memberships = candidates
        .sort((a, b) => a.safeStart - b.safeStart)
        .map(candidate => shots.find(shot => shot.candidates.some(item => item.id === candidate.id))?.id)
        .filter((id): id is string => !!id);
      sourceMembership[videoId] = memberships.filter((id, index) => memberships.indexOf(id) === index);
    }
    return { version: 1, createdAt: new Date().toISOString(), shots, sourceMembership };
  } finally {
    fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

function timelineForSource(manifest: RendyShotManifest, sourceVideoId: string): TimelineItem[] {
  return (manifest.sourceMembership[sourceVideoId] ?? []).flatMap(shotId => {
    const shot = manifest.shots.find(item => item.id === shotId);
    const sourceCandidate = shot?.candidates.find(candidate => candidate.sourceVideoId === sourceVideoId);
    return shot && sourceCandidate ? [{ shotId, candidateId: sourceCandidate.id }] : [];
  });
}

/**
 * Strictly validate an inbound headline object from a PATCH request body.
 * Returns a sanitised HeadlineSettings or throws a 400 error.
 * Accepts null/undefined to mean "clear to default (disabled)".
 */
function validateHeadline(raw: unknown): HeadlineSettings | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw Object.assign(new Error("headline skal være et objekt"), { status: 400 });
  }
  const h = raw as Record<string, unknown>;

  const enabled = h.enabled;
  if (typeof enabled !== "boolean") {
    throw Object.assign(new Error("headline.enabled skal være boolean"), { status: 400 });
  }

  const text = h.text;
  if (typeof text !== "string") {
    throw Object.assign(new Error("headline.text skal være en tekststreng"), { status: 400 });
  }
  if (text.length > 120) {
    throw Object.assign(new Error("headline.text må højst have 120 tegn"), { status: 400 });
  }

  const fontId = h.fontId;
  if (!isRendyTypographyId(fontId)) {
    throw Object.assign(new Error("headline.fontId er ikke et gyldigt skrifttype-id"), { status: 400 });
  }

  const size = Number(h.size);
  if (!Number.isFinite(size) || size < HEADLINE_SIZE_MIN || size > HEADLINE_SIZE_MAX) {
    throw Object.assign(new Error(`headline.size skal være et tal mellem ${HEADLINE_SIZE_MIN} og ${HEADLINE_SIZE_MAX}`), { status: 400 });
  }

  const x = Number(h.x);
  if (!Number.isFinite(x) || x < HEADLINE_POSITION_MIN || x > HEADLINE_POSITION_MAX_X) {
    throw Object.assign(new Error(`headline.x skal være et tal i sikker zone [${HEADLINE_POSITION_MIN}, ${HEADLINE_POSITION_MAX_X}]`), { status: 400 });
  }

  const y = Number(h.y);
  if (!Number.isFinite(y) || y < HEADLINE_POSITION_MIN || y > HEADLINE_POSITION_MAX_Y) {
    throw Object.assign(new Error(`headline.y skal være et tal i sikker zone [${HEADLINE_POSITION_MIN}, ${HEADLINE_POSITION_MAX_Y}]`), { status: 400 });
  }

  const start = Number(h.start);
  if (!Number.isFinite(start) || start < 0 || start > 1800) {
    throw Object.assign(new Error("headline.start skal være et tal i [0, 1800]"), { status: 400 });
  }

  const end = Number(h.end);
  if (!Number.isFinite(end) || end <= start || end > 1800) {
    throw Object.assign(new Error("headline.end skal være et tal i (start, 1800]"), { status: 400 });
  }

  return { enabled, text: text.trim(), fontId, size, x, y, start, end };
}

function validateTimeline(manifest: RendyShotManifest, timeline: unknown): TimelineItem[] {
  if (!Array.isArray(timeline) || !timeline.length) throw Object.assign(new Error("Vælg mindst ét komplet klip til videoen"), { status: 400 });
  if (timeline.length > manifest.shots.length) throw Object.assign(new Error("Tidslinjen indeholder for mange klip"), { status: 400 });
  const seen = new Set<string>();
  return timeline.map((item, index) => {
    if (!item || typeof item !== "object") throw Object.assign(new Error(`Klip ${index + 1} er ugyldigt`), { status: 400 });
    const { shotId, candidateId } = item as Record<string, unknown>;
    if (typeof shotId !== "string" || typeof candidateId !== "string" || seen.has(shotId)) {
      throw Object.assign(new Error("Et klip kan kun forekomme én gang i tidslinjen"), { status: 400 });
    }
    const shot = manifest.shots.find(value => value.id === shotId);
    if (!shot?.candidates.some(candidate => candidate.id === candidateId)) {
      throw Object.assign(new Error("Den valgte variant findes ikke i klipbiblioteket"), { status: 400 });
    }
    seen.add(shotId);
    return { shotId, candidateId };
  });
}

export function transitionDurationForClips(fromDuration: number, toDuration: number): number {
  return Math.max(
    0.12,
    Math.min(0.42, fromDuration * 0.18, toDuration * 0.18),
  );
}

export function renderBoundsForCandidate(
  safeStart: number,
  safeEnd: number,
  motionScore: number,
): { start: number; end: number } {
  const duration = safeEnd - safeStart;
  const handle = motionScore < 0.035 ? Math.min(0.08, duration * 0.025) : 0;
  const start = safeStart + handle;
  const end = safeEnd - handle;
  // candidatesForVideo accepts complete scenes from 0.65s. Keep a defensive
  // floor below that contract, while still leaving ample room for a 0.12s
  // crossfade and several frames on each side at 30fps.
  if (end - start < 0.5) {
    throw new Error("Klippet er for kort til en sikker overgang");
  }
  return { start, end };
}

function makeEditPlan(manifest: RendyShotManifest, timeline: TimelineItem[]): EditPlan {
  const clips = timeline.map(item => {
    const candidate = manifest.shots.find(shot => shot.id === item.shotId)?.candidates.find(value => value.id === item.candidateId);
    if (!candidate) throw new Error("Et valgt klip findes ikke længere");
    // Moving shots retain their natural beginning and ending. Static scenes may
    // lose a tiny encoder settle frame; moving action is never trimmed away.
    const { start, end } = renderBoundsForCandidate(
      candidate.safeStart,
      candidate.safeEnd,
      candidate.motionScore,
    );
    return { shotId: item.shotId, candidateId: candidate.id, sourceUrl: candidate.sourceUrl, sourceVideoId: candidate.sourceVideoId, start, end };
  });
  const transitions: TransitionPlan[] = [];
  for (let index = 0; index < clips.length - 1; index++) {
    const from = manifest.shots.find(shot => shot.id === clips[index].shotId)?.candidates.find(candidate => candidate.id === clips[index].candidateId)!;
    const to = manifest.shots.find(shot => shot.id === clips[index + 1].shotId)?.candidates.find(candidate => candidate.id === clips[index + 1].candidateId)!;
    const visualDifference = signatureDistance(from.endSignature, to.startSignature);
    // Short complete scenes are common in Rendy deliveries. A brief dissolve is
    // safe and looks better than rejecting an otherwise valid timeline.
    const duration = transitionDurationForClips(
      clips[index].end - clips[index].start,
      clips[index + 1].end - clips[index + 1].start,
    );
    transitions.push({
      type: visualDifference > 0.38 ? "fade" : "dissolve",
      duration,
      confidence: Math.max(0, Math.min(1, 1 - visualDifference * 0.65)),
    });
  }
  const totalDuration = clips.reduce((sum, clip) => sum + clip.end - clip.start, 0) - transitions.reduce((sum, transition) => sum + transition.duration, 0);
  return { clips, transitions, totalDuration };
}

async function claimLease(id: string, status: ProjectStatus, stage: JobStage): Promise<string | null> {
  const token = randomUUID();
  const expires = new Date(Date.now() + LEASE_TTL_MS);
  const result = await pool.query<{ id: string }>(
    `UPDATE rendy_edit_projects
        SET status = $1, job_stage = $2, lease_token = $3, lease_expires_at = $4, error = NULL, updated_at = NOW()
      WHERE id = $5
        AND (lease_token IS NULL OR lease_expires_at IS NULL OR lease_expires_at < NOW())
      RETURNING id`,
    [status, stage, token, expires, id],
  );
  if (!result.rows[0]) return null;
  const previous = activeLeases.get(id);
  if (previous) clearInterval(previous.timer);
  const timer = setInterval(() => {
    pool.query(
      `UPDATE rendy_edit_projects SET lease_expires_at = $1, updated_at = NOW() WHERE id = $2 AND lease_token = $3`,
      [new Date(Date.now() + LEASE_TTL_MS), id, token],
    ).catch(() => {});
  }, 60_000);
  activeLeases.set(id, { token, timer });
  return token;
}

function clearOwnedHeartbeat(id: string, token: string) {
  const entry = activeLeases.get(id);
  if (!entry || entry.token !== token) return;
  clearInterval(entry.timer);
  activeLeases.delete(id);
}

async function releaseLease(id: string, token: string) {
  clearOwnedHeartbeat(id, token);
  await pool.query(`UPDATE rendy_edit_projects SET lease_token = NULL, lease_expires_at = NULL, updated_at = NOW() WHERE id = $1 AND lease_token = $2`, [id, token]);
}

async function hasLease(id: string, token: string): Promise<boolean> {
  const result = await pool.query<{ id: string }>(
    `SELECT id FROM rendy_edit_projects WHERE id = $1 AND lease_token = $2`,
    [id, token],
  );
  return !!result.rows[0];
}

async function failProject(id: string, token: string, error: unknown) {
  const message = error instanceof Error ? error.message : "Den AI-redigerede video kunne ikke færdiggøres";
  await pool.query(
    `UPDATE rendy_edit_projects
        SET status = 'failed', error = $1, lease_token = NULL, lease_expires_at = NULL, updated_at = NOW()
      WHERE id = $2 AND lease_token = $3`,
    [message.slice(0, 500), id, token],
  );
  clearOwnedHeartbeat(id, token);
}

async function runPreparation(id: string, token: string) {
  try {
    const project = await getProject(id);
    if (!project) throw new Error("Redigeringsprojektet findes ikke");
    const existing = await getManifest(project.listing_id, project.user_id);
    let manifest = existing?.manifest;
    let revision = existing?.revision;
    if (!manifest || revision == null) {
      const videos = await getOwnedDeliveryVideos(project.listing_id, project.user_id);
      const generated = await buildManifest(videos, project.listing_id);
      if (!await hasLease(id, token)) return;
      // A listing manifest is immutable once published. Concurrent preparation
      // can waste local analysis work, but never replace candidates used by an
      // existing customer project.
      await pool.query(
        `INSERT INTO rendy_edit_manifests (listing_id, user_id, revision, payload)
         VALUES ($1, $2, 1, $3::jsonb)
         ON CONFLICT (listing_id) DO NOTHING`,
        [project.listing_id, project.user_id, JSON.stringify(generated)],
      );
      const persisted = await getManifest(project.listing_id, project.user_id);
      if (!persisted) throw new Error("Klipbiblioteket kunne ikke gemmes");
      manifest = persisted.manifest;
      revision = persisted.revision;
    }
    const timeline = timelineForSource(manifest, project.source_video_id);
    if (!timeline.length) throw new Error("Startvideoens klip kunne ikke matches til det analyserede bibliotek");
    await pool.query(
      `UPDATE rendy_edit_projects
          SET manifest_revision = $1, timeline = $2::jsonb, analysis_plan = NULL, status = 'draft',
              job_stage = NULL, error = NULL, lease_token = NULL, lease_expires_at = NULL, updated_at = NOW()
        WHERE id = $3 AND lease_token = $4`,
      [revision, JSON.stringify(timeline), id, token],
    );
    clearOwnedHeartbeat(id, token);
  } catch (error) {
    await failProject(id, token, error);
  }
}

async function normaliseClip(sourcePath: string, outputPath: string, clip: RenderClipPlan, targetW: number, targetH: number, hasAudio: boolean) {
  const duration = clip.end - clip.start;
  const videoFilter = `scale=${targetW}:${targetH}:force_original_aspect_ratio=decrease,pad=${targetW}:${targetH}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=30,format=yuv420p`;
  if (hasAudio) {
    await runFfmpegQueued([
      "-y", "-ss", clip.start.toFixed(3), "-t", duration.toFixed(3), "-i", sourcePath,
      "-vf", videoFilter, "-map", "0:v:0", "-map", "0:a:0?", "-c:v", "libx264", "-preset", "medium",
      "-crf", "20", "-c:a", "aac", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", outputPath,
    ]);
    return;
  }
  await runFfmpegQueued([
    "-y", "-ss", clip.start.toFixed(3), "-t", duration.toFixed(3), "-i", sourcePath,
    "-f", "lavfi", "-t", duration.toFixed(3), "-i", "anullsrc=r=48000:cl=stereo",
    "-vf", videoFilter, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "libx264", "-preset", "medium",
    "-crf", "20", "-c:a", "aac", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", outputPath,
  ]);
}

function finalRenderArgs(normalizedPaths: string[], outputPath: string, plan: EditPlan): string[] {
  const args = ["-y", ...normalizedPaths.flatMap(file => ["-i", file])];
  if (normalizedPaths.length === 1) return [...args, "-c", "copy", outputPath];
  let filter = "";
  let videoLabel = "[0:v]";
  let audioLabel = "[0:a]";
  let elapsed = plan.clips[0].end - plan.clips[0].start;
  for (let index = 0; index < plan.transitions.length; index++) {
    const transition = plan.transitions[index];
    const vOut = index === plan.transitions.length - 1 ? "[vout]" : `[v${index}]`;
    const aOut = index === plan.transitions.length - 1 ? "[aout]" : `[a${index}]`;
    const offset = Math.max(0, elapsed - transition.duration);
    filter += `${videoLabel}[${index + 1}:v]xfade=transition=${transition.type}:duration=${transition.duration.toFixed(3)}:offset=${offset.toFixed(3)}${vOut};`;
    filter += `${audioLabel}[${index + 1}:a]acrossfade=d=${transition.duration.toFixed(3)}:c1=tri:c2=tri${aOut};`;
    videoLabel = vOut;
    audioLabel = aOut;
    elapsed += plan.clips[index + 1].end - plan.clips[index + 1].start - transition.duration;
  }
  return [...args, "-filter_complex", filter.slice(0, -1), "-map", "[vout]", "-map", "[aout]", "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-c:a", "aac", "-movflags", "+faststart", outputPath];
}

// ── ASS headline builder ──────────────────────────────────────────────────────

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
 * Build an ASS file for a single headline text layer.
 * x/y are normalised [0,1] fractions of frame dimensions.
 * size is a fraction of frame height (e.g. 0.08 = 8 % of H).
 * Timing is clipped to [0, outputDuration].
 */
export function buildAssHeadline(hl: HeadlineSettings, targetW: number, targetH: number, outputDuration: number): string {
  const preset = RENDY_TYPOGRAPHY_PRESETS.find(p => p.id === hl.fontId) ?? RENDY_TYPOGRAPHY_PRESETS[1];
  const fontSize = Math.round(hl.size * targetH);
  // ASS alignment=5 = center-middle; we use absolute position override {\pos(x,y)}
  const posX = Math.round(hl.x * targetW);
  const posY = Math.round(hl.y * targetH);
  const start = Math.max(0, Math.min(hl.start, outputDuration));
  const end = Math.max(start + 0.04, Math.min(hl.end, outputDuration));
  const { fadeInSeconds, fadeOutSeconds } = headlineFadeDurations(start, end);
  const fadeInMs = Math.round(fadeInSeconds * 1000);
  const fadeOutMs = Math.round(fadeOutSeconds * 1000);

  // Uppercase transform must be applied in JS since ASS has no text-transform
  const displayText = preset.assUppercase
    ? hl.text.toUpperCase()
    : hl.text;

  const header =
    "[Script Info]\n" +
    "ScriptType: v4.00+\n" +
    `PlayResX: ${targetW}\n` +
    `PlayResY: ${targetH}\n` +
    "ScaledBorderAndShadow: yes\n\n" +
    "[V4+ Styles]\n" +
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n" +
    // Warm white, no outline, soft drop shadow, center-aligned
    `Style: Headline,${preset.assFontName},${fontSize},${HEADLINE_TEXT_ASS_COLOR},&H000000FF,&H00110F0C,&H88080604,${preset.assBold},${preset.assItalic},0,0,100,100,${preset.assSpacing},0,1,0,0.65,5,0,0,0,1\n\n` +
    "[Events]\n" +
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n";

  const posTag = `{\\pos(${posX},${posY})\\fad(${fadeInMs},${fadeOutMs})}`;
  const text = posTag + sanitizeAssText(displayText);
  const event = `Dialogue: 0,${secondsToAssTime(start)},${secondsToAssTime(end)},Headline,,0,0,0,,${text}`;
  return header + event + "\n";
}

async function runRender(id: string, token: string, uploadDir: string) {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "rendy-edit-render-"));
  try {
    const project = await getProject(id);
    if (!project?.analysis_plan) throw new Error("Redigeringsanalysen mangler. Start analysen igen.");
    const plan = project.analysis_plan;
    const sourcePaths: string[] = [];
    const normalized: string[] = [];
    const candidateMeta = new Map<string, MediaInfo>();
    for (let index = 0; index < plan.clips.length; index++) {
      const clip = plan.clips[index];
      const source = path.join(tempDir, `source-${index}.mp4`);
      await materializeSource(clip.sourceUrl, source);
      sourcePaths.push(source);
      candidateMeta.set(clip.candidateId, await probeVideo(source));
    }
    const first = candidateMeta.get(plan.clips[0].candidateId)!;
    const portrait = first.height > first.width;
    const targetW = portrait ? 1080 : 1920;
    const targetH = portrait ? 1920 : 1080;
    for (let index = 0; index < plan.clips.length; index++) {
      const output = path.join(tempDir, `clip-${index}.mp4`);
      await normaliseClip(sourcePaths[index], output, plan.clips[index], targetW, targetH, candidateMeta.get(plan.clips[index].candidateId)?.hasAudio ?? false);
      normalized.push(output);
    }
    await pool.query(`UPDATE rendy_edit_projects SET status = 'rendering', job_stage = 'render', updated_at = NOW() WHERE id = $1 AND lease_token = $2`, [id, token]);

    const ts = Date.now();
    // The clean assembled output (no headline burn) is always produced.
    // It is stored durably so that a voiceover layer can source clean frames
    // and burn headline + captions in a single pass without re-encoding a
    // headline-burned file.
    const cleanName = `rendy-edit-clean-${id}-${ts}.mp4`;
    const cleanPath = path.join(tempDir, cleanName);
    await runFfmpegQueued(finalRenderArgs(normalized, cleanPath, plan));
    await r2UploadFile(cleanPath, cleanName);
    const cleanUrl = `/uploads/${cleanName}`;

    // Determine whether a headline overlay is needed
    const headline = project.headline;
    const wantHeadline = headline && headline.enabled && headline.text.trim().length > 0;

    let outputUrl: string;
    if (wantHeadline) {
      // Burn headline onto the clean assembled output
      const headlineName = `rendy-edit-${id}-${ts}.mp4`;
      const headlinePath = path.join(uploadDir, headlineName);
      const assPath = path.join(tempDir, "headline.ass");
      const fontsDir = path.join(process.cwd(), "public", "fonts");
      const escapeAssFilterPath = (v: string) =>
        v.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
      fs.writeFileSync(assPath, buildAssHeadline(headline, targetW, targetH, plan.totalDuration), "utf8");
      await runFfmpegQueued([
        "-y", "-i", cleanPath,
        "-vf", `ass='${escapeAssFilterPath(assPath)}':fontsdir='${escapeAssFilterPath(fontsDir)}'`,
        "-c:v", "libx264", "-preset", "medium", "-crf", "20",
        "-c:a", "copy",
        "-movflags", "+faststart",
        headlinePath,
      ]);
      await r2UploadFile(headlinePath, headlineName);
      outputUrl = `/uploads/${headlineName}`;
      fs.promises.unlink(headlinePath).catch(() => {});
    } else {
      // No headline: the public output IS the clean output — no duplicate upload
      outputUrl = cleanUrl;
    }

    await pool.query(
      `UPDATE rendy_edit_projects
          SET status = 'ready',
              output_url = $1,
              clean_output_url = $2,
              error = NULL,
              lease_token = NULL,
              lease_expires_at = NULL,
              updated_at = NOW()
        WHERE id = $3 AND lease_token = $4`,
      [outputUrl, cleanUrl, id, token],
    );
    clearOwnedHeartbeat(id, token);
  } catch (error) {
    await failProject(id, token, error);
  } finally {
    fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function runAnalysisAndRender(id: string, token: string, uploadDir: string) {
  try {
    const project = await getProject(id);
    if (!project) throw new Error("Redigeringsprojektet findes ikke");
    const manifest = await manifestForProject(project);
    if (!manifest) throw new Error("Klipbiblioteket mangler. Prøv igen.");
    const timeline = validateTimeline(manifest, project.timeline ?? []);
    const plan = makeEditPlan(manifest, timeline);
    await pool.query(
      `UPDATE rendy_edit_projects SET analysis_plan = $1::jsonb, status = 'rendering', job_stage = 'render', updated_at = NOW() WHERE id = $2 AND lease_token = $3`,
      [JSON.stringify(plan), id, token],
    );
    await runRender(id, token, uploadDir);
  } catch (error) {
    await failProject(id, token, error);
  }
}

// ── Direct headline overlay (single text pass over an existing clean master) ──

/**
 * Build ffmpeg args that burn a single headline ASS layer onto an already
 * assembled clean master in ONE pass. Video is re-encoded (text burn requires
 * it); any existing audio stream is copied verbatim so the master's audio is
 * preserved. Pure helper — exported for focused testing.
 *
 * @param inputPath  Path to the clean master MP4 (never a headline-burned file).
 * @param assPath    Path to the ASS script produced by buildAssHeadline.
 * @param fontsDir   Directory containing bundled fonts.
 * @param outputPath Destination for the new immutable output MP4.
 * @param hasAudio   Whether the clean master carries an audio stream.
 */
export function buildHeadlineOverlayArgs(
  inputPath: string,
  assPath: string,
  fontsDir: string,
  outputPath: string,
  hasAudio: boolean,
): string[] {
  const escapeAssFilterPath = (v: string) =>
    v.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
  const args = [
    "-y", "-i", inputPath,
    "-vf", `ass='${escapeAssFilterPath(assPath)}':fontsdir='${escapeAssFilterPath(fontsDir)}'`,
    "-map", "0:v:0",
  ];
  if (hasAudio) {
    args.push("-map", "0:a:0?", "-c:a", "copy");
  } else {
    args.push("-an");
  }
  args.push(
    "-c:v", "libx264", "-preset", "medium", "-crf", "20",
    "-movflags", "+faststart",
    outputPath,
  );
  return args;
}

/**
 * Direct ready-headline apply worker.
 *
 * Renders a NEW immutable output MP4 by burning the persisted headline onto the
 * durable clean master, then atomically swaps output_url on success. It never
 * rebuilds clips, never touches clean_output_url, and never uses an already
 * headline-burned output as the clean source.
 *
 * The previous output_url stays live until the new render succeeds, so a
 * failure leaves the project retryable with its prior output intact.
 */
async function runHeadlineApply(id: string, token: string, uploadDir: string) {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "rendy-edit-headline-"));
  try {
    const project = await getProject(id);
    if (!project) throw new Error("Redigeringsprojektet findes ikke");

    const headline = project.headline;
    const wantHeadline = !!(headline && headline.enabled && headline.text.trim().length > 0);

    // Resolve the clean master. Prefer the durable clean_output_url. Legacy rows
    // rendered before clean_output_url existed predate headlines entirely, so
    // their output_url is guaranteed un-burned and is a safe fallback. Once a
    // headline has been applied the row always has clean_output_url set, so we
    // never fall back to a possibly-burned output_url in that case.
    const cleanUrl = project.clean_output_url ?? project.output_url;
    if (!cleanUrl) throw new Error("Der findes ingen ren video at lægge overskrift på");

    if (!wantHeadline) {
      // Disabled/blank: no FFmpeg. Point the public output back at the clean
      // master and mark ready. clean_output_url is left intact.
      await pool.query(
        `UPDATE rendy_edit_projects
            SET status = 'ready',
                output_url = $1,
                clean_output_url = COALESCE(clean_output_url, $1),
                job_stage = NULL,
                error = NULL,
                lease_token = NULL,
                lease_expires_at = NULL,
                updated_at = NOW()
          WHERE id = $2 AND lease_token = $3`,
        [cleanUrl, id, token],
      );
      clearOwnedHeartbeat(id, token);
      return;
    }

    // Materialize the persisted clean master and probe its exact geometry.
    const cleanPath = path.join(tempDir, "clean.mp4");
    await materializeSource(cleanUrl, cleanPath);
    const info = await probeVideo(cleanPath);
    if (!info.width || !info.height || !info.duration) {
      throw new Error("Den rene video kunne ikke måles korrekt");
    }

    // Build the ASS script clipped to the clean master's exact duration.
    const assPath = path.join(tempDir, "headline.ass");
    const fontsDir = path.join(process.cwd(), "public", "fonts");
    fs.writeFileSync(assPath, buildAssHeadline(headline!, info.width, info.height, info.duration), "utf8");

    const outputName = `rendy-edit-${id}-${Date.now()}.mp4`;
    const outputPath = path.join(uploadDir, outputName);
    await runFfmpegQueued(
      buildHeadlineOverlayArgs(cleanPath, assPath, fontsDir, outputPath, info.hasAudio),
    );
    await r2UploadFile(outputPath, outputName);
    const newOutputUrl = `/uploads/${outputName}`;

    // Atomically swap output_url. clean_output_url is deliberately untouched.
    await pool.query(
      `UPDATE rendy_edit_projects
          SET status = 'ready',
              output_url = $1,
              clean_output_url = COALESCE(clean_output_url, $2),
              job_stage = NULL,
              error = NULL,
              lease_token = NULL,
              lease_expires_at = NULL,
              updated_at = NOW()
        WHERE id = $3 AND lease_token = $4`,
      [newOutputUrl, cleanUrl, id, token],
    );
    fs.promises.unlink(outputPath).catch(() => {});
    clearOwnedHeartbeat(id, token);
  } catch (error) {
    // Failure keeps the prior output_url and the clean master untouched, and
    // the row remains retryable (status=failed, job_stage=headline preserved by
    // failProject leaving job_stage alone).
    await failProject(id, token, error);
  } finally {
    fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function startProjectWork(project: ProjectRow, stage: JobStage, uploadDir: string) {
  const status: ProjectStatus =
    stage === "prepare" ? "preparing" :
    stage === "headline" || stage === "render" ? "rendering" :
    "analyzing";
  const token = await claimLease(project.id, status, stage);
  if (!token) return;
  if (stage === "prepare") void runPreparation(project.id, token);
  else if (stage === "analyze") void runAnalysisAndRender(project.id, token, uploadDir);
  else if (stage === "headline") void runHeadlineApply(project.id, token, uploadDir);
  else void runRender(project.id, token, uploadDir);
}

export async function verifyRendyEditedVideoOwnership(
  listingId: string,
  sourceVideoId: string,
  userId: number,
): Promise<string | null> {
  if (!sourceVideoId.startsWith("edit:")) return null;
  const id = sourceVideoId.slice("edit:".length);
  if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error("Ugyldigt redigeret video-id");
  const result = await pool.query<{ output_url: string | null }>(
    `SELECT output_url FROM rendy_edit_projects
      WHERE id = $1 AND listing_id = $2 AND user_id = $3 AND status = 'ready'`,
    [id, listingId, userId],
  );
  const outputUrl = result.rows[0]?.output_url;
  if (!outputUrl) throw new Error("Den redigerede video er ikke klar");
  return outputUrl;
}

export function isLegacyShortTransitionError(error: string | null | undefined): boolean {
  return !!error?.includes("To naboklip er for korte til en sikker overgang");
}

/**
 * Resolve an edit:<id> source for a voiceover project.
 *
 * Returns:
 *  - `sourceUrl`: the clean assembled output (no headline burn) if available,
 *    otherwise the regular output_url. Voiceover burns headline + captions in
 *    a single pass rather than re-encoding an already-burned file.
 *  - `headlineSnapshot`: the stored HeadlineSettings from the edit project, or
 *    null if there is no active headline. The snapshot is captured at voiceover
 *    creation time so later edits to the edit project don't mutate running exports.
 *
 * Throws if the edit project is not found, not owned, or not ready.
 */
export async function resolveEditSourceForVoiceover(
  listingId: string,
  sourceVideoId: string,
  userId: number,
): Promise<{ sourceUrl: string; headlineSnapshot: HeadlineSettings | null } | null> {
  if (!sourceVideoId.startsWith("edit:")) return null;
  const id = sourceVideoId.slice("edit:".length);
  if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error("Ugyldigt redigeret video-id");
  const result = await pool.query<{ output_url: string | null; clean_output_url: string | null; headline: HeadlineSettings | null }>(
    `SELECT output_url, clean_output_url, headline FROM rendy_edit_projects
      WHERE id = $1 AND listing_id = $2 AND user_id = $3 AND status = 'ready'`,
    [id, listingId, userId],
  );
  const row = result.rows[0];
  if (!row?.output_url) throw new Error("Den redigerede video er ikke klar");

  // Prefer the clean URL (pre-headline) so voiceover can burn both layers together.
  // Fall back to output_url for projects rendered before clean_output_url was added.
  const sourceUrl = row.clean_output_url ?? row.output_url;

  // Only snapshot the headline if it is active and has non-blank text
  const hl = row.headline;
  const headlineSnapshot = hl && hl.enabled && hl.text.trim().length > 0 ? hl : null;

  return { sourceUrl, headlineSnapshot };
}

async function recoverProjects(uploadDir: string) {
  const result = await pool.query<ProjectRow>(
    `SELECT * FROM rendy_edit_projects
      WHERE status IN ('preparing', 'analyzing', 'rendering')
        AND (lease_token IS NULL OR lease_expires_at IS NULL OR lease_expires_at < NOW())`,
  );
  for (const project of result.rows) {
    const stage = project.job_stage ?? (project.status === "preparing" ? "prepare" : project.status === "rendering" ? "render" : "analyze");
    await startProjectWork(project, stage, uploadDir);
  }
}

export function registerRendyEditorRoutes(app: Express, uploadDir: string) {
  // Resume work only after all routes have registered and the additive schema
  // guard has run. This is deliberately idempotent across multiple instances.
  setTimeout(() => recoverProjects(uploadDir).catch(error => console.error("[RendyEditor] recovery:", error)), 1_000).unref();
  setInterval(() => recoverProjects(uploadDir).catch(error => console.error("[RendyEditor] recovery:", error)), 60_000).unref();

  app.post("/api/bolig/rendy/edit-projects", async (req, res) => {
    try {
      const { userId } = await requireUser(req);
      const { listingId, sourceVideoId } = req.body ?? {};
      if (typeof listingId !== "string" || typeof sourceVideoId !== "string" || listingId.length > 200 || sourceVideoId.length > 200) {
        return res.status(400).json({ success: false, message: "Mangler gyldig listing- eller videoidentifikation" });
      }
      const videos = await getOwnedDeliveryVideos(listingId, userId);
      if (!videos.some(video => video.id === sourceVideoId)) return res.status(400).json({ success: false, message: "Startvideoen tilhører ikke denne levering" });
      const existingResult = await pool.query<ProjectRow>(
        `SELECT * FROM rendy_edit_projects WHERE user_id = $1 AND listing_id = $2 AND source_video_id = $3 ORDER BY updated_at DESC LIMIT 1`,
        [userId, listingId, sourceVideoId],
      );
      let project = existingResult.rows[0];
      if (!project) {
        const cached = await getManifest(listingId, userId);
        const id = randomUUID();
        const timeline = cached ? timelineForSource(cached.manifest, sourceVideoId) : [];
        const insert = await pool.query<ProjectRow>(
          `INSERT INTO rendy_edit_projects (id, user_id, listing_id, source_video_id, manifest_revision, timeline, status, job_stage)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
           ON CONFLICT (user_id, listing_id, source_video_id) DO UPDATE
             SET updated_at = NOW()
           RETURNING *`,
          [id, userId, listingId, sourceVideoId, cached?.revision ?? null, JSON.stringify(timeline), cached ? "draft" : "preparing", cached ? null : "prepare"],
        );
        project = insert.rows[0];
        if (!cached && project.status === "preparing" && project.manifest_revision == null) {
          await startProjectWork(project, "prepare", uploadDir);
        }
      }
      // Projects that failed only because of the former overly strict
      // short-transition threshold can be reopened directly. The timeline is
      // still intact, and the current planner now supports those clips safely.
      if (
        project.status === "failed" &&
        isLegacyShortTransitionError(project.error)
      ) {
        const reopened = await pool.query<ProjectRow>(
          `UPDATE rendy_edit_projects
              SET status = 'draft',
                  job_stage = NULL,
                  analysis_plan = NULL,
                  error = NULL,
                  lease_token = NULL,
                  lease_expires_at = NULL,
                  updated_at = NOW()
            WHERE id = $1 AND user_id = $2
            RETURNING *`,
          [project.id, userId],
        );
        project = reopened.rows[0] ?? project;
      }
      const manifest = await manifestForProject(project);
      return res.json({ success: true, project: toPublicProject(project, manifest) });
    } catch (error: any) {
      return res.status(error?.status ?? 500).json({ success: false, message: error?.message ?? "Kunne ikke åbne videoredigeringen" });
    }
  });

  app.get("/api/bolig/rendy/edit-projects/:id", async (req, res) => {
    try {
      const { userId } = await requireUser(req);
      const project = await getProject(req.params.id, userId);
      if (!project) return res.status(404).json({ success: false, message: "Redigeringsprojektet blev ikke fundet" });
      return res.json({ success: true, project: toPublicProject(project, await manifestForProject(project)) });
    } catch (error: any) {
      return res.status(error?.status ?? 500).json({ success: false, message: error?.message ?? "Kunne ikke hente redigeringsprojektet" });
    }
  });

  app.patch("/api/bolig/rendy/edit-projects/:id", async (req, res) => {
    try {
      const { userId } = await requireUser(req);
      const project = await getProject(req.params.id, userId);
      if (!project) return res.status(404).json({ success: false, message: "Redigeringsprojektet blev ikke fundet" });
      if (!["draft", "ready", "failed"].includes(project.status)) return res.status(409).json({ success: false, message: "Videoen behandles allerede og kan ikke ændres endnu" });
      const manifest = await manifestForProject(project);
      if (!manifest) return res.status(409).json({ success: false, message: "Klipbiblioteket er ikke klar endnu" });
      const timeline = validateTimeline(manifest, req.body?.timeline);
      // headline is optional — omit key to keep existing; send null to reset to default
      let headlineJson: string | null;
      if (!("headline" in (req.body ?? {}))) {
        // Key not present: preserve current headline from DB
        headlineJson = project.headline != null ? JSON.stringify(project.headline) : null;
      } else {
        const validated = validateHeadline(req.body.headline);
        headlineJson = validated != null ? JSON.stringify(validated) : null;
      }
      const updated = await pool.query<ProjectRow>(
        `UPDATE rendy_edit_projects
            SET timeline = $1::jsonb,
                headline = $4::jsonb,
                analysis_plan = NULL,
                output_url = NULL,
                clean_output_url = NULL,
                status = 'draft',
                job_stage = NULL,
                error = NULL,
                updated_at = NOW()
          WHERE id = $2 AND user_id = $3 RETURNING *`,
        [JSON.stringify(timeline), project.id, userId, headlineJson],
      );
      return res.json({ success: true, project: toPublicProject(updated.rows[0], manifest) });
    } catch (error: any) {
      return res.status(error?.status ?? 400).json({ success: false, message: error?.message ?? "Kunne ikke gemme tidslinjen" });
    }
  });

  app.post("/api/bolig/rendy/edit-projects/:id/render", async (req, res) => {
    try {
      const { userId } = await requireUser(req);
      const project = await getProject(req.params.id, userId);
      if (!project) return res.status(404).json({ success: false, message: "Redigeringsprojektet blev ikke fundet" });
      if (["preparing", "analyzing", "rendering"].includes(project.status)) return res.json({ success: true, project: toPublicProject(project, await manifestForProject(project)) });
      const manifest = await manifestForProject(project);
      if (!manifest) return res.status(409).json({ success: false, message: "Klipbiblioteket er ikke klar endnu" });
      validateTimeline(manifest, project.timeline ?? []);
      await startProjectWork(project, "analyze", uploadDir);
      const updated = await getProject(project.id, userId);
      return res.json({ success: true, project: toPublicProject(updated!, manifest) });
    } catch (error: any) {
      return res.status(error?.status ?? 500).json({ success: false, message: error?.message ?? "Kunne ikke starte AI-redigeringen" });
    }
  });

  // Direct ready-headline apply. Burns/updates the headline layer on the
  // durable clean master WITHOUT rebuilding clips or touching the timeline or
  // clean master. Intended for a project that is already `ready` (a rendered
  // clean master exists); also tolerates `failed`/`draft` when a clean master
  // is present so a stuck project can still (re)apply a headline.
  app.post("/api/bolig/rendy/edit-projects/:id/apply-headline", async (req, res) => {
    try {
      const { userId } = await requireUser(req);
      const project = await getProject(req.params.id, userId);
      if (!project) return res.status(404).json({ success: false, message: "Redigeringsprojektet blev ikke fundet" });
      if (["preparing", "analyzing", "rendering"].includes(project.status)) {
        return res.status(409).json({ success: false, message: "Videoen behandles allerede — vent til den er klar" });
      }
      // A clean master must exist to overlay onto. Legacy `ready` rows without a
      // clean_output_url predate headlines and carry an un-burned output_url,
      // which runHeadlineApply safely uses as the clean source.
      const cleanSource = project.clean_output_url ?? project.output_url;
      if (!cleanSource) {
        return res.status(409).json({ success: false, message: "Der findes endnu ingen færdig video at lægge overskrift på" });
      }

      // Validate strictly via the shared validator. null → reset to default (disabled).
      const validated = validateHeadline(req.body?.headline);
      const headlineJson = validated != null ? JSON.stringify(validated) : null;

      // Persist the headline setting only. Deliberately does NOT touch timeline,
      // analysis_plan, clean_output_url, or output_url (the previous output stays
      // live until the new render succeeds).
      await pool.query(
        `UPDATE rendy_edit_projects
            SET headline = $1::jsonb, updated_at = NOW()
          WHERE id = $2 AND user_id = $3`,
        [headlineJson, project.id, userId],
      );

      const refreshed = await getProject(project.id, userId);
      await startProjectWork(refreshed!, "headline", uploadDir);
      const updated = await getProject(project.id, userId);
      return res.json({ success: true, project: toPublicProject(updated!, await manifestForProject(updated!)) });
    } catch (error: any) {
      return res.status(error?.status ?? 400).json({ success: false, message: error?.message ?? "Kunne ikke anvende overskriften" });
    }
  });

  app.post("/api/bolig/rendy/edit-projects/:id/retry", async (req, res) => {
    try {
      const { userId } = await requireUser(req);
      const project = await getProject(req.params.id, userId);
      if (!project) return res.status(404).json({ success: false, message: "Redigeringsprojektet blev ikke fundet" });
      if (project.status !== "failed") return res.status(409).json({ success: false, message: "Kun mislykkede redigeringer kan genstartes" });
      const stage = project.job_stage ?? (await manifestForProject(project) ? "analyze" : "prepare");
      await startProjectWork(project, stage, uploadDir);
      const updated = await getProject(project.id, userId);
      return res.json({ success: true, project: toPublicProject(updated!, await manifestForProject(updated!)) });
    } catch (error: any) {
      return res.status(error?.status ?? 500).json({ success: false, message: error?.message ?? "Kunne ikke genstarte AI-redigeringen" });
    }
  });
}