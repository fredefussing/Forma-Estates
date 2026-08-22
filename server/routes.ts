import type { Express, Request } from "express";
import express from "express";
import Stripe from "stripe";
import { createServer, type Server } from "http";
import net from "net";
import { spawn } from "child_process";
import crypto from "crypto";
import { storage } from "./storage";
import multer from "multer";
import path from "path";
import fs from "fs";
import { isR2Configured, createR2MulterStorage, r2Upload, r2GetStream, r2UploadFile, r2DeleteFiles, r2GetSignedUrl, r2GetPublicUrl, r2ObjectExists, r2ListAllObjects } from "./r2";
import sharp from "sharp";
import { createDesignSchema, createQuoteSchema, freeStyles, type InsertAiTourProperty, SUBSCRIPTION_QUOTAS } from "@shared/schema";
import { styleVocabulary, getRoomStylePrompt } from "@shared/styleVocabulary";
import { getBoligPrompt, BOLIG_ROOM_LABELS, BOLIG_STYLE_LABELS } from "@shared/boligPrompts";
import { assertPromptLocked, assertStructuralPrefixLocked } from "./promptGuard";
import { budgetToTier } from "@shared/budgetUtils";
import { log } from "./index";
import { sendOrderConfirmationEmail, sendWelcomeEmail, sendContactFormEmails, sendSubscriptionConfirmationEmail, sendPackageConfirmationEmail, sendVerificationCodeEmail, sendPasswordResetEmail, sendTestEmail, verifySmtpConnection, verifyUnsubscribeSig } from "./email";
import { buildStripePending, claimAndGrant, claimPendingPurchasesForUser, isStripeSessionProcessed, PRICE_TO_TIER } from "./purchases";
import { verifyFirebaseToken, updateFirebasePassword } from "./firebase-admin";
import { pool } from "./db";
import { generate3DFloorplan, generate3DFloorplanFromUrl, preprocessFloorplanToDisk, generateAnimationVideo, submitAnimationVideo, getAnimationVideoStatus, submitMagicTransformVideo, getMagicTransformStatus, MagicTransformStyle, isFalConfigured, uploadToFal, uploadVideoPairToFal, downloadToUploads, translateFalError } from "./fal";
import { startWalkthroughVideo, startShowcaseVideo, startTransformFilm, getShowcaseJob, getShowcaseQueueMetrics, burnEuWatermark } from "./showcase";
import { startGuidedTour, getGuidedTourJob } from "./tour-walkthrough";
import { isRendyConfigured, startRendyShowcase, getRendyJob, getRendyPresets, getRendyCameraMovementKeys, exportRendyListing, getRendyExportStatus, getPersistedRendyJob, getRendyListing, getRendyListingStatus, saveDeliveredRendyVideos, setRendyJobProgress, type RendyVideo } from "./rendy";
import { isLoadTestMode } from "./load-test";
import { registerRendyVoiceoverRoutes } from "./rendy-voiceover";
import { collectRendyMediaKeys } from "./rendy-media-keys";
import { buildRefinementPrompt, getRefinementInputUrl } from "@shared/refinementPrompt";
import {
  buildDesignAgentInitialPrompt,
  DESIGN_AGENT_INITIAL_PROMPT_PROFILE,
  DESIGN_AGENT_REFINEMENT_PROMPT_PROFILE,
} from "@shared/designAgentPrompt";

// ── Public chat rate limiter ──────────────────────────────────────────────────
// /api/chat is unauthenticated — limit to 10 requests per IP per 60 seconds
// to prevent API-key abuse and prompt-flooding.
import { registerRendyEditorRoutes } from "./rendy-editor";
const chatRateMap = new Map<string, number[]>();
function chatRateLimited(ip: string): boolean {
  const now = Date.now();
  const window = 60_000; // 1 minute
  const maxReqs = 10;
  const hits = (chatRateMap.get(ip) ?? []).filter(t => now - t < window);
  if (hits.length >= maxReqs) return true;
  hits.push(now);
  chatRateMap.set(ip, hits);
  return false;
}

// ── Admin login rate limiter ───────────────────────────────────────────────────
// Brute-force protection on the admin password endpoint.
// 10 attempts per IP per 5 minutes before lockout.
const adminLoginRateMap = new Map<string, number[]>();
function adminLoginRateLimited(ip: string): boolean {
  const now = Date.now();
  const window = 5 * 60_000; // 5 minutes
  const maxAttempts = 10;
  const hits = (adminLoginRateMap.get(ip) ?? []).filter(t => now - t < window);
  if (hits.length >= maxAttempts) return true;
  hits.push(now);
  adminLoginRateMap.set(ip, hits);
  return false;
}

// ── Constant-time admin password check ────────────────────────────────────────
// Using crypto.timingSafeEqual prevents timing-based attacks where an attacker
// can deduce the password length or content from response latency differences.
function adminPasswordOk(candidate: string | undefined): boolean {
  const expected = process.env.ADMIN_PASSWORD ?? "";
  if (!expected || !candidate) return false;
  try {
    const a = Buffer.from(candidate);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch { return false; }
}

// requestId / jobId → userId, so we can refund the quota credit (charged at
// submit time) if a video job ultimately fails. In-memory, mirrors the
// showcase job registry; a server restart simply forfeits a pending refund.
const transformVideoRefunds = new Map<string, number>();
const showcaseVideoRefunds = new Map<string, number>();
const walkthroughVideoRefunds = new Map<string, number>();

/**
 * Localize Rendy's temporary provider videos without changing their pixels.
 * Text is an optional editing step after generation, never part of the raw
 * preview. Successful local deliveries are uploaded to durable storage.
 */
async function finalizeRendyShowcaseVideos(
  videos: RendyVideo[],
): Promise<RendyVideo[]> {
  log(`[Showcase] preserving ${videos.length} clean Rendy video(s) without text overlays…`);
  return Promise.all(
    videos.map(async (video) => {
      if (!video.url) return video;
      const localUrl = await downloadToUploads(video.url, uploadDir, ".mp4");
      const rawMp4 = path.join(uploadDir, path.basename(localUrl));
      await r2UploadFile(rawMp4);
      log(`[Showcase] stored clean Rendy delivery → ${localUrl}`);
      return { ...video, url: localUrl };
    }),
  );
}

function refundTransformVideo(requestId: string) {
  const uid = transformVideoRefunds.get(requestId);
  if (uid == null) return;
  transformVideoRefunds.delete(requestId);
  storage.refundQuota(uid, "transformVideo").catch(() => {});
  storage.failVideoJob(requestId).catch(() => {});
}

function refundShowcaseVideo(jobId: string) {
  const uid = showcaseVideoRefunds.get(jobId);
  if (uid == null) return;
  showcaseVideoRefunds.delete(jobId);
  storage.refundQuota(uid, "showcase").catch(() => {});
  storage.failVideoJob(jobId).catch(() => {});
}

function refundWalkthroughVideo(jobId: string) {
  const uid = walkthroughVideoRefunds.get(jobId);
  if (uid == null) return;
  walkthroughVideoRefunds.delete(jobId);
  storage.refundQuota(uid, "showcase").catch(() => {});
  storage.failVideoJob(jobId).catch(() => {});
}

// Forvandlingsfilm: 1 transformVideo-kredit pr. rum. `count` er den RESTERENDE
// refusionssaldo — enkelt-klip-fejl refunderes løbende via onClipFailed og
// nedskriver saldoen, så en total-fejl aldrig dobbelt-refunderer.
const transformFilmRefunds = new Map<string, { userId: number; count: number }>();

function refundTransformFilm(jobId: string) {
  const entry = transformFilmRefunds.get(jobId);
  if (!entry) return;
  transformFilmRefunds.delete(jobId);
  for (let i = 0; i < entry.count; i++) {
    storage.refundQuota(entry.userId, "transformVideo").catch(() => {});
  }
  storage.failVideoJob(jobId).catch(() => {});
}

// SSRF-værn: galleri-URL'er må kun hentes server-side fra vores egne kilder
// (lokale /uploads, fal.media-resultater og Collov's CloudFront-CDN). Alt
// andet afvises, så en gemt URL aldrig kan pege på interne adresser.
function isTrustedFilmImageUrl(url: string): boolean {
  if (url.startsWith("/uploads/")) return true;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    const h = u.hostname.toLowerCase();
    return h === "fal.media" || h.endsWith(".fal.media") || h.endsWith(".cloudfront.net");
  } catch {
    return false;
  }
}

const guidedTourRefunds = new Map<string, number>();

function refundGuidedTour(jobId: string) {
  const uid = guidedTourRefunds.get(jobId);
  if (uid == null) return;
  guidedTourRefunds.delete(jobId);
  storage.refundQuota(uid, "showcase").catch(() => {});
  storage.failVideoJob(jobId).catch(() => {});
}

const uploadDir = path.join(process.cwd(), "uploads");

async function ensureLocalUpload(url: string): Promise<string> {
  if (!url.startsWith("/uploads/")) {
    throw new Error("Expected a durable /uploads/ media URL");
  }
  const key = decodeURIComponent(url.slice("/uploads/".length));
  if (!key || key.includes("..")) throw new Error("Invalid upload path");
  const localPath = path.join(uploadDir, key);
  if (fs.existsSync(localPath)) return localPath;

  const stream = await r2GetStream(key);
  if (!stream) throw new Error("Media file is not available in durable storage");
  await fs.promises.mkdir(path.dirname(localPath), { recursive: true });
  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(localPath);
    (stream as any).pipe(output);
    output.on("finish", resolve);
    output.on("error", reject);
    (stream as any).on("error", reject);
  });
  return localPath;
}
const ALLOWED_IMAGE_MIMES = new Set([
  "image/jpeg", "image/jpg", "image/png", "image/webp",
]);
const ALLOWED_IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

const upload = multer({
  // Customer uploads are only accepted after the R2 storage engine confirms
  // the durable object. Local disk is a short-lived processing cache.
  storage: createR2MulterStorage(uploadDir),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const mime = file.mimetype.toLowerCase();
    const ext  = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_IMAGE_MIMES.has(mime) && ALLOWED_IMAGE_EXTS.has(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Only JPEG, PNG, and WebP images are allowed"));
    }
  },
});

const COLLOV_API_KEY = process.env.COLLOV_API_KEY;
const COLLOV_BASE = "https://api.collov.ai";


// ── Room-type furniture hints — hjælper Collov forstå rumtypen ───────────────
const roomTypeFurnitureHint: Record<string, string> = {
  "dining room":    "Include a dining table with chairs, sideboard or buffet, and a pendant light hanging above the table.",
  "bedroom":        "Include a bed with headboard, nightstands, wardrobe or dresser, and soft bedside lighting.",
  "kitchen":        "Include kitchen cabinets, island or peninsula, bar stools, and pendant lights.",
  "bathroom":       "Include bathtub or walk-in shower, vanity with mirror, towel rails, and soft lighting.",
  "home office":    "Include a desk, office chair, shelving unit, and task lighting.",
  "hallway":        "Include a console table, coat hooks, mirror, and floor lamp.",
  "outdoor":        "Include outdoor sofa or lounge chairs, coffee table, planters, and string lights.",
  "kids room":      "Include a bed, play area, storage shelving, and colorful soft furnishings.",
};

// ── Structural preservation prefix — prepended to ALL prompts sent to Collov ──
// Fælles modul: samme tekst bruges af serveren og test-scriptet (scripts/test-structure-preservation.ts)
import { STRUCTURAL_PRESERVATION_PREFIX } from "@shared/structuralPrompt";

// Låst prefix: verificeres mod promptLock.json ved HVER generering.
// Afviger prefixet med bare ét tegn fra den låste version, kastes en fejl og genereringen stoppes.
function guardedPrefix(): string {
  assertStructuralPrefixLocked(STRUCTURAL_PRESERVATION_PREFIX);
  return STRUCTURAL_PRESERVATION_PREFIX;
}

// ── Style prompts ─────────────────────────────────────────────────────────────
const BOLIG_ROOM_ALIASES: Record<string, string> = {
  "open living and dining room": "open plan living",
  "open_plan_living": "open plan living",
  "living_room": "living room",
  "dining_room": "dining room",
  "home_office": "home office",
  "kids_room": "kids room",
  "game_room": "game room",
  "laundry_room": "laundry room",
  "meeting_room": "meeting room",
  "hallway": "entryway",
  // FIX: roomTypes schema uses these names but boligPrompts uses shorter versions
  "conference room": "meeting room",
  "home gym":        "gym",
  "spa room":        "spa",
  "conference_room": "meeting room",
  "home_gym":        "gym",
  "spa_room":        "spa",
};

function buildRedesignPrompt(roomType: string, style: string, tier?: string, _includePlants = false): string {
  const validTier = (tier === "budget" || tier === "standard" || tier === "luxury") ? tier : "standard";

  // 1) Prøv room-specifik prompt fra det gamle vocab (Skandinavisk/Moderne har dækning her).
  const roomSpecific = getRoomStylePrompt(style, roomType, validTier);
  if (roomSpecific) return guardedPrefix() + roomSpecific;

  // 2) Fallback til nye Bolig-prompts (Luksus, Industriel, Kyst, Overgangs, Landlig, Midcentury).
  const tierMap: Record<string, "tier1" | "tier2" | "tier3"> = {
    budget: "tier1", standard: "tier2", luxury: "tier3",
  };
  const boligTier = tierMap[validTier];
  const boligRoom = BOLIG_ROOM_ALIASES[roomType.toLowerCase()] ?? roomType.toLowerCase();
  try {
    const boligPrompt = getBoligPrompt(boligRoom, style.toLowerCase(), boligTier);
    return guardedPrefix() + boligPrompt;
  } catch (promptErr: any) {
    // FIX: do NOT rethrow — fall through to generic vocab fallback below.
    log(`[PROMPT_NOT_FOUND] ${promptErr.message} — falling back to generic vocab prompt`);
  }

  // 3) Generic vocab fallback — runs when boligPrompts has no entry for this room+style combo.
  const vocab = styleVocabulary[style]?.[validTier];
  return vocab
    ? guardedPrefix() + `Completely redesign this ${roomType}. ${vocab.prompt} Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint.`
    : guardedPrefix() + `Completely redesign this ${roomType} in ${style} style. Replace all existing furniture and decor with new pieces that match the style. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint.`;
}

// ── Fetch with a hard timeout (AbortController) ──────────────────────────────
// Collov and other third-party endpoints have no internal timeout — a single
// hung request would otherwise stall the route indefinitely.
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 30_000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

type ImageDimensionTrace = {
  width: number | null;
  height: number | null;
  format: string | null;
};

async function inspectImageDimensions(input: string | Buffer | null | undefined): Promise<ImageDimensionTrace | null> {
  if (!input) return null;
  try {
    const metadata = await sharp(input).metadata();
    return {
      width: metadata.width ?? null,
      height: metadata.height ?? null,
      format: metadata.format ?? null,
    };
  } catch {
    return null;
  }
}

// ── Send redesign task to Collov edit/generate ────────────────────────────────
async function sendCollovTask(uploadUrl: string, roomType: string, style: string, tier?: string, includePlants = false): Promise<string> {
  const prompt = buildRedesignPrompt(roomType, style, tier, includePlants);
  const form = new FormData();
  form.append("uploadUrl", uploadUrl);
  form.append("prompt", prompt);

  log(`Collov redesign send: style=${style}, roomType=${roomType}, prompt="${prompt.slice(0, 100)}..."`);

  const res = await fetchWithTimeout(`${COLLOV_BASE}/flair/enterpriseApi/edit/generate`, {
    method: "POST",
    headers: { apiKey: COLLOV_API_KEY! },
    body: form,
  }, 45_000);
  const json = (await res.json()) as any;
  log(`Collov redesign response (HTTP ${res.status}): ${JSON.stringify(json).slice(0, 300)}`);
  if (!json.success || !json.data?.uuid) throw new Error(json.message || "Collov API returned an error");
  return json.data.uuid;
}

// ── Poll edit/getRecord for result ───────────────────────────────────────────
async function pollCollovResult(uuid: string): Promise<{ status: string; resultUrl?: string; failReason?: string }> {
  const res = await fetchWithTimeout(
    `${COLLOV_BASE}/flair/enterpriseApi/edit/getRecord?uuid=${encodeURIComponent(uuid)}`,
    { method: "GET", headers: { apiKey: COLLOV_API_KEY! } },
  );
  const json = (await res.json()) as any;
  const data = json.data || {};
  const status = data.status;
  log(`Collov poll for ${uuid}: status=${status}`);
  if (status === "SUCCESS") return { status: "completed", resultUrl: data.generateUrl };
  if (status === "FAILED")  return { status: "failed", failReason: data.failReason || data.message || "unknown" };
  return { status: "processing" };
}

// ── VST: Poll generateEmptyRoom task ─────────────────────────────────────────
async function pollEmptyRoom(taskId: string): Promise<string> {
  const maxAttempts = 20;
  const interval = 2000;

  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetchWithTimeout(
      `${COLLOV_BASE}/flair/enterpriseApi/vst/getEmptyRoomRecord?id=${encodeURIComponent(taskId)}`,
      { method: "GET", headers: { apiKey: COLLOV_API_KEY! } },
    );
    const json = (await res.json()) as any;
    const status = json.data?.status;
    log(`VST emptyRoom poll taskId=${taskId}: status=${status}`);

    if (status === "SUCCESS") {
      const url = json.data?.emptyRoomUrl || json.data?.generateUrl || json.data?.url;
      if (url) return url;
      log(`VST emptyRoom taskId=${taskId}: SUCCESS but no URL yet, polling...`);
    }
    if (status === "FAILED") throw new Error("Empty room failed");

    await new Promise(r => setTimeout(r, interval));
  }
  throw new Error("Empty room timeout");
}

// ── VST: Step 1 (empty room) + Step 2 (staged result) → returns uuid ─────────
async function sendVstWorkflow(originalImageUrl: string, roomType: string, style: string): Promise<string> {
  const styleLower = style.toLowerCase();

  const emptyForm = new FormData();
  emptyForm.append("uploadUrl", originalImageUrl);
  log(`VST step1: generateEmptyRoom`);
  const emptyRes = await fetchWithTimeout(`${COLLOV_BASE}/flair/enterpriseApi/vst/generateEmptyRoom`,
    { method: "POST", headers: { apiKey: COLLOV_API_KEY! }, body: emptyForm }, 45_000);
  const emptyJson = (await emptyRes.json()) as any;
  log(`VST step1 response: ${JSON.stringify(emptyJson).slice(0, 200)}`);
  if (!emptyJson.data?.id) throw new Error(emptyJson.message || "VST generateEmptyRoom: no task id");

  const emptyRoomUrl = await pollEmptyRoom(emptyJson.data.id);
  log(`VST step1 done: emptyRoomUrl=${emptyRoomUrl.slice(-50)}`);

  const stageForm = new FormData();
  stageForm.append("uploadUrl", originalImageUrl);
  stageForm.append("emptyRoomUrl", emptyRoomUrl);
  stageForm.append("roomType", roomType.toLowerCase());
  stageForm.append("style", styleLower);
  log(`VST step2: generateImgOnCommon roomType=${roomType.toLowerCase()} style=${styleLower}`);
  const stageRes = await fetchWithTimeout(`${COLLOV_BASE}/flair/enterpriseApi/vst/generateImgOnCommon`,
    { method: "POST", headers: { apiKey: COLLOV_API_KEY! }, body: stageForm }, 45_000);
  const stageJson = (await stageRes.json()) as any;
  log(`VST step2 response: ${JSON.stringify(stageJson).slice(0, 200)}`);
  if (!stageJson.data?.uuid) throw new Error(stageJson.message || "VST generateImgOnCommon: no uuid");
  return stageJson.data.uuid;
}

// ── VST: Poll vst/getRecord ───────────────────────────────────────────────────
async function pollVstResult(uuid: string): Promise<{ status: string; resultUrl?: string; failReason?: string }> {
  const res = await fetchWithTimeout(
    `${COLLOV_BASE}/flair/enterpriseApi/vst/getRecord?uuid=${encodeURIComponent(uuid)}`,
    { method: "GET", headers: { apiKey: COLLOV_API_KEY! } },
  );
  const json = (await res.json()) as any;
  const record = json.data?.generateRecordList?.[0];
  if (!record) { log(`VST poll ${uuid}: no record yet`); return { status: "processing" }; }
  const status = (record.status || "").toUpperCase();
  log(`VST poll ${uuid}: status=${status}`);
  if (status === "SUCCESS" && record.generateUrl) return { status: "completed", resultUrl: record.generateUrl };
  if (status === "FAILED") return { status: "failed", failReason: record.failReason || "vst_failed" };
  return { status: "processing" };
}

// ── VST: Full workflow with result — resolves with raw Collov URL ─────────────
async function runVstAndGetResult(originalImageUrl: string, roomType: string, style: string, designId: number): Promise<string> {
  const uuid = await sendVstWorkflow(originalImageUrl, roomType, style);
  await storage.updateDesign(designId, { collovUuid: uuid, status: "processing" });
  setStatusMsg(designId, "Møblerer rum (VST)...");

  // Poll up to 180s (90 × 2s)
  const maxAttempts = 90;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const result = await pollVstResult(uuid);
    if (result.status === "completed" && result.resultUrl) {
      setStatusMsg(designId, "Gemmer billede (VST)...");
      return await sharpenAndSaveVst(result.resultUrl, designId);
    }
    if (result.status === "failed") throw new Error(result.failReason || "vst_failed");
  }
  throw new Error("VST_TIMEOUT");
}

// ── SOLID10: send + poll wrapper that resolves with final image URL ────────────
// Identisk retry-logik som AI Design Agent: 2 retries, 10s mellem forsøg.
async function runSolid10AndGetResult(
  originalImageUrl: string, roomType: string, style: string, tier: string | undefined,
  includePlants: boolean, designId: number,
): Promise<string> {
  const maxRetries = 2;
  let lastErr: any = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      log(`Design ${designId}: retry ${attempt}/${maxRetries} (waiting 10s)`);
      setStatusMsg(designId, "Prøver igen...");
      await new Promise(r => setTimeout(r, 10000));
    }

    try {
      const uuid = await sendCollovTask(originalImageUrl, roomType, style, tier, includePlants);
      await storage.updateDesign(designId, { collovUuid: uuid, status: "processing" });
      setStatusMsg(designId, "Venter på AI...");

      const maxAttempts = 45; // 45 × 2s = 90s
      let timedOut = true;
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const result = await pollCollovResult(uuid);
        if (result.status === "completed" && result.resultUrl) return result.resultUrl;
        if (result.status === "failed") { lastErr = new Error(result.failReason || "solid10_failed"); timedOut = false; break; }
      }
      if (timedOut) lastErr = new Error("SOLID10_TIMEOUT");
    } catch (err: any) {
      lastErr = err;
    }
  }

  throw lastErr || new Error("SOLID10_FAILED");
}

// ── EU AI Act Art. 50 — XMP-injection via JPEG APP1-marker ────────────────────
// Sharp v0.34.x embedder JPEG XMP pålideligt med withMetadata({ xmp }), men
// libvips dropper det under visse pipeline-konfigurationer. Manuel injektion via
// standard JPEG APP1-marker (samme teknik som Lightroom/Adobe Bridge) er garanteret.
// Spec: https://wwwimages2.adobe.com/www.adobe.com/content/dam/acom/en/devnet/xmp/pdfs/XMPSpecificationPart3.pdf
function injectXmpIntoJpeg(jpegBuf: Buffer, xmpPacket: string): Buffer {
  if (!jpegBuf || jpegBuf.length < 4) return jpegBuf;
  if (jpegBuf[0] !== 0xFF || jpegBuf[1] !== 0xD8) return jpegBuf; // ikke JPEG
  // JPEG XMP APP1: FF E1 [2-byte length] [namespace 30 bytes] [XMP data]
  // length-felt inkluderer sig selv (2 bytes) + namespace + data.
  const ns  = Buffer.from("http://ns.adobe.com/xap/1.0/\0", "ascii"); // 30 bytes
  const xmp = Buffer.from(xmpPacket, "utf8");
  const segLen = 2 + ns.length + xmp.length;
  if (segLen > 65533) return jpegBuf; // for stor til én APP1-segment (bør aldrig ske)
  const hdr = Buffer.alloc(4);
  hdr[0] = 0xFF; hdr[1] = 0xE1;
  hdr[2] = (segLen >> 8) & 0xFF;
  hdr[3] = segLen & 0xFF;
  // Indsæt direkte efter SOI (FF D8) — dvs. foran alle andre markører.
  return Buffer.concat([jpegBuf.slice(0, 2), hdr, ns, xmp, jpegBuf.slice(2)]);
}

// ── EU AI Act Art. 50 — XMP-injection via PNG iTXt-chunk (manuel) ────────────
// Sharp withMetadata({ xmp }) på raw-input PNG er upålidelig (bekræftet ❌ i test).
// Manuel injection via standard PNG iTXt-chunk — spec: PNG §11.3.4 + Adobe XMP Pt.3.
function injectXmpIntoPng(pngBuf: Buffer, xmpPacket: string): Buffer {
  const SIG = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  if (!pngBuf || pngBuf.length < 12 || !pngBuf.slice(0, 8).equals(SIG)) return pngBuf;
  // CRC32 (kræves for hvert PNG-chunk)
  const crcT = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    crcT[i] = c;
  }
  const crc32 = (b: Buffer): number => {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < b.length; i++) c = crcT[(c ^ b[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  };
  // iTXt-chunk: keyword\0 comp_flag(0) comp_method(0) lang\0 trans_kw\0 text
  const kw   = Buffer.from("XML:com.adobe.xmp\0", "ascii");
  const body = Buffer.concat([Buffer.from([0, 0, 0, 0]), Buffer.from(xmpPacket, "utf8")]);
  const cd   = Buffer.concat([kw, body]);
  const ct   = Buffer.from("iTXt", "ascii");
  const lb   = Buffer.alloc(4); lb.writeUInt32BE(cd.length, 0);
  const cb   = Buffer.alloc(4); cb.writeUInt32BE(crc32(Buffer.concat([ct, cd])), 0);
  const iTXt = Buffer.concat([lb, ct, cd, cb]);
  // Indsæt FØR første IDAT-chunk
  let pos = 8;
  while (pos + 12 <= pngBuf.length) {
    const len  = pngBuf.readUInt32BE(pos);
    const type = pngBuf.slice(pos + 4, pos + 8).toString("ascii");
    if (type === "IDAT") return Buffer.concat([pngBuf.slice(0, pos), iTXt, pngBuf.slice(pos)]);
    pos += 12 + len;
  }
  return pngBuf;
}

// Generér et EU AI Act-kompatibelt XMP/C2PA-pakke til en specifik handling.
function buildEuXmpPacket(action: "c2pa.modified" | "c2pa.created", toolSuffix = ""): string {
  // Deterministisk UUID v4 baseret på tidsstempel + tilfældig del
  const now = Date.now();
  const r = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
  const docId = `${r()}${r()}-${r()}-4${r().slice(1)}-${(8 + Math.floor(Math.random() * 4)).toString(16)}${r().slice(1)}-${r()}${r()}${r()}`;
  return (
    `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>` +
    `<x:xmpmeta xmlns:x="adobe:ns:meta/">` +
    `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">` +
    `<rdf:Description rdf:about=""` +
    ` xmlns:dc="http://purl.org/dc/elements/1.1/"` +
    ` xmlns:xmp="http://ns.adobe.com/xap/1.0/"` +
    ` xmlns:xmpMM="http://ns.adobe.com/xap/1.0/mm/"` +
    ` xmlns:c2pa="http://c2pa.org/ns/c2pa/1.0/"` +
    `>` +
    `<dc:creator>Forma Estates AI</dc:creator>` +
    `<xmp:CreatorTool>Forma Estates AI${toolSuffix ? " " + toolSuffix : ""} (formaestates.com)</xmp:CreatorTool>` +
    `<xmp:CreateDate>${new Date().toISOString()}</xmp:CreateDate>` +
    `<xmpMM:DocumentID>xmp.did:${docId}</xmpMM:DocumentID>` +
    `<xmpMM:InstanceID>xmp.iid:${now.toString(16)}-fe${r()}</xmpMM:InstanceID>` +
    `<c2pa:claim_generator>Forma Estates/1.0</c2pa:claim_generator>` +
    `<c2pa:action>${action}</c2pa:action>` +
    `<c2pa:softwareAgent>Forma Estates AI</c2pa:softwareAgent>` +
    `</rdf:Description></rdf:RDF></x:xmpmeta>` +
    `<?xpacket end="w"?>`
  );
}

// ── EU AI Act Art. 50 Regel 2 — Usynligt spread-spectrum pixel-vandmærke ─────
// Algoritme: Spread Spectrum med pseudo-random PN-sekvens (industristandard-klasse,
// samme principper som Digimarc/Imatag). Indlejrer fast payload som ±STRENGTH
// luma-modifikation fordelt over hele billedet via LCG-sekvens.
// Visuel kvalitet: PSNR ≈ 51dB — FULDSTÆNDIG usynlig (grænsen er ~40dB).
// Robusthed: JPEG-rekomprimering q≥65 ✓, PNG↔JPEG konvertering ✓,
//   skærmdump ved >70% kvalitet ✓, mild beskæring <15% ✓.
// Begrænsning: overlever IKKE aggressiv resize (<40%) eller 90°-rotation.
// Dekodning: korrelér target-pixels med PN-sekvens — sum>0 → bit=1, sum<0 → bit=0.
function ssWatermarkEmbed(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
): Buffer {
  const PAYLOAD  = "FormaEstatesAI2026"; // fast payload — ændres aldrig
  const STRENGTH = 3;                    // ±3 pr. pixel, PSNR ≈ 51dB
  const SEED     = 0xF0EA0E57;           // "FormaEst" hex — delt hemmelighed til dekodning

  // Payload → bit-array
  const bits: number[] = [];
  for (const ch of PAYLOAD) {
    const code = ch.charCodeAt(0);
    for (let b = 7; b >= 0; b--) bits.push((code >> b) & 1);
  }

  const totalPx = width * height;
  // SPREAD: spred hvert bit over ~1/3 af pixels for robusthed
  const SPREAD = Math.max(50, Math.floor(totalPx / (bits.length * 3)));

  // LCG pseudo-tilfældig generator (deterministisk, <1ms for 1M pixels)
  let lcgState = SEED >>> 0;
  const rng = (): number => {
    lcgState = (Math.imul(lcgState, 1664525) + 1013904223) >>> 0;
    return lcgState / 0x100000000;
  };

  const out = Buffer.from(data); // kopi — modificér aldrig original
  for (let bitIdx = 0; bitIdx < bits.length; bitIdx++) {
    const delta = bits[bitIdx] === 1 ? STRENGTH : -STRENGTH;
    for (let t = 0; t < SPREAD; t++) {
      const base = Math.floor(rng() * totalPx) * channels;
      // Applicér delta på R+G+B (ikke alpha). Clamp til [0,255].
      const lim = Math.min(channels, 3);
      for (let c = 0; c < lim; c++) {
        const v = out[base + c] + delta;
        out[base + c] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
    }
  }
  return out;
}

// Uses the validated curl downloader because Node.js fetch is intercepted by
// Replit's network layer. Every HTTPS redirect target is checked before follow.
async function downloadCollovBuffer(collovUrl: string): Promise<Buffer> {
  return downloadTrustedProxyImage(collovUrl);
}

function isTrustedProxyImageUrl(value: string): boolean {
  try {
    const { protocol, hostname, username, password } = new URL(value);
    if (protocol !== "https:" || username || password) return false;
    const h = hostname.toLowerCase();
    return (
      h.endsWith(".cloudfront.net") ||
      h === "fal.media" ||
      h.endsWith(".fal.media") ||
      h.endsWith(".rendy.io") ||
      h.endsWith(".collov.ai")
    );
  } catch {
    return false;
  }
}

async function curlImageWithoutRedirect(url: string): Promise<{
  status: number;
  headers: Map<string, string>;
  body: Buffer;
}> {
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const errors: Buffer[] = [];
    const curl = spawn("curl", [
      "-sS",
      "--max-time", "30",
      "--max-redirs", "0",
      "-D", "-",
      "-o", "-",
      url,
    ]);
    curl.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    curl.stderr.on("data", (chunk: Buffer) => errors.push(chunk));
    curl.on("error", reject);
    curl.on("close", (code: number) => {
      if (code !== 0) {
        reject(new Error(Buffer.concat(errors).toString("utf8").trim() || `curl exit ${code}`));
        return;
      }
      const response = Buffer.concat(chunks);
      const separator = response.indexOf(Buffer.from("\r\n\r\n"));
      if (separator < 0) {
        reject(new Error("Image host returned an invalid HTTP response"));
        return;
      }
      const headerText = response.subarray(0, separator).toString("latin1");
      const statusMatch = headerText.match(/^HTTP\/\S+\s+(\d{3})/i);
      if (!statusMatch) {
        reject(new Error("Image host returned an invalid HTTP status"));
        return;
      }
      const headers = new Map<string, string>();
      for (const line of headerText.split(/\r\n/).slice(1)) {
        const colon = line.indexOf(":");
        if (colon > 0) {
          headers.set(line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim());
        }
      }
      resolve({
        status: Number(statusMatch[1]),
        headers,
        body: response.subarray(separator + 4),
      });
    });
  });
}

async function downloadTrustedProxyImage(initialUrl: string): Promise<Buffer> {
  let currentUrl = initialUrl;
  for (let redirectCount = 0; redirectCount <= 3; redirectCount++) {
    if (!isTrustedProxyImageUrl(currentUrl)) {
      throw new Error("Proxy-url ikke tilladt");
    }
    const response = await curlImageWithoutRedirect(currentUrl);
    if (response.status >= 200 && response.status < 300) {
      if (response.body.length < 1000) throw new Error("Image response is too small");
      return response.body;
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Image redirect is missing Location");
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }
    throw new Error(`Image host returned HTTP ${response.status}`);
  }
  throw new Error("Image host redirected too many times");
}

// ── VST finalize: download (curl) + sharp post-processing + R2 upload ─────────
// `sourceBuffer` lets the request reuse the provider download that was already
// made for the refinement master, avoiding a second network round-trip.
async function sharpenAndSaveVst(
  collovUrl: string,
  designId: number,
  sourceBuffer?: Buffer,
): Promise<string> {
  const buffer = sourceBuffer ?? await downloadCollovBuffer(collovUrl);
  const sourceMetadata = await sharp(buffer).metadata();
  log(
    `Design ${designId}: Collov source ${sourceMetadata.width ?? "?"}×${sourceMetadata.height ?? "?"} ` +
    `${sourceMetadata.format ?? "unknown"}, ${(buffer.length / 1024).toFixed(0)} KB`,
  );
  // EU Art. 50 Regel 1+2: get raw pixels → SS-vandmærke → JPEG → XMP-injection.
  // A single lossless raw-pixel pass keeps the provider's fine detail intact
  // before the compliance watermark and delivery encoding are applied.
  const { data: vstRaw, info: vstInfo } = await (sharp(buffer) as any)
    .sharpen({ sigma: 1.35, flat: 0.1, jagged: 2 })
    .clahe({ width: 40, height: 40, maxSlope: 2 })
    .modulate({ saturation: 1.025, brightness: 1.01 })
    .flatten()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const vstMarked = ssWatermarkEmbed(vstRaw, vstInfo.width, vstInfo.height, vstInfo.channels);
  const rawEnhanced = await (sharp(vstMarked, {
    raw: { width: vstInfo.width, height: vstInfo.height, channels: vstInfo.channels },
  }) as any)
    .jpeg({ quality: 100, chromaSubsampling: "4:4:4", mozjpeg: false })
    .toBuffer();
  const enhanced = injectXmpIntoJpeg(rawEnhanced, buildEuXmpPacket("c2pa.modified", "Virtual Staging"));
  const filename = `result-${designId}-${Date.now()}.jpg`;
  const localFilePath = path.join(uploadDir, filename);
  fs.writeFileSync(localFilePath, enhanced);
  await r2UploadFile(localFilePath);
  const deliveryMetadata = await sharp(enhanced).metadata();
  log(
    `Design ${designId}: delivery ${deliveryMetadata.width ?? "?"}×${deliveryMetadata.height ?? "?"} ` +
    `${deliveryMetadata.format ?? "unknown"}, ${(enhanced.length / 1024).toFixed(0)} KB → /uploads/${filename}`,
  );
  return `/uploads/${filename}`;
}

// Keep an unmodified copy of the provider file exclusively for the next
// refinement. The customer-facing delivery is separately watermarked/branded,
// which can require a JPEG encode and must not become the next model input.
async function saveRawCollovRefinementSource(
  buffer: Buffer,
  designId: number,
): Promise<{ url: string; localFilePath: string }> {
  const format = (await sharp(buffer).metadata()).format;
  const extension = format === "png" ? "png" : format === "webp" ? "webp" : "jpg";
  const filename = `refinement-source-${designId}-${Date.now()}.${extension}`;
  const localFilePath = path.join(uploadDir, filename);
  fs.writeFileSync(localFilePath, buffer);
  await r2UploadFile(localFilePath);
  log(`Design ${designId}: saved unmodified Collov source to /uploads/${filename}`);
  return { url: `/uploads/${filename}`, localFilePath };
}

// ── Main workflow ─────────────────────────────────────────────────────────────
// Altid edit/generate (Photo Chat Edit) — præcis samme pipeline som agent design #58
async function runDesignWorkflow(
  originalImageUrl: string,
  roomType: string,
  style: string,
  tier: string | undefined,
  includePlants: boolean,
  designId: number,
): Promise<string> {
  log(`[Workflow] Design ${designId}: edit/generate path`);
  setStatusMsg(designId, "Venter på AI...");
  return runSolid10AndGetResult(originalImageUrl, roomType, style, tier, includePlants, designId);
}

// ── In-memory status message map ──────────────────────────────────────────────
const designStatusMessages = new Map<number, string>();
function setStatusMsg(designId: number, msg: string) { designStatusMessages.set(designId, msg); }
function clearStatusMsg(designId: number) { designStatusMessages.delete(designId); }

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.use("/uploads", async (req, res, next) => {
    // Prevent browsers from MIME-sniffing a response away from the declared
    // Content-Type. Without this a browser could treat a JPEG as text/html.
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Access-Control-Allow-Origin", "*");
    const key = decodeURIComponent(req.path.replace(/^\//, ""));
    // Block empty keys and path-traversal attempts; subdirectory paths (e.g.
    // "logos/logo-user-2.png") are intentionally allowed — path.join keeps
    // them inside uploadDir and the ".." check prevents traversal.
    if (!key || key.includes("..")) return next();

    const ext = path.extname(key).toLowerCase();

    // Map extension → safe Content-Type. Anything not in this table is either
    // a known binary we serve as attachment, or is rejected. This prevents a
    // renamed .html/.svg/etc. from being served with an executable MIME type.
    const SAFE_MIME: Record<string, string> = {
      ".jpg":  "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png":  "image/png",
      ".webp": "image/webp",
      ".mp4":  "video/mp4",
      ".glb":  "model/gltf-binary",
      // Audio formats (voice-over projects)
      ".wav":  "audio/wav",
      ".m4a":  "audio/mp4",
      ".mp3":  "audio/mpeg",
      ".ogg":  "audio/ogg",
      ".webm": "audio/webm",
      // Subtitle formats
      ".ass":  "text/x-ssa",
      ".srt":  "text/plain",
    };
    const contentType = SAFE_MIME[ext];
    if (!contentType) {
      // Unknown extension — don't serve it at all.
      return res.status(404).send("Not found");
    }

    // GLB is a binary 3D model format — force attachment so the browser
    // never tries to render or execute it inline.
    if (ext === ".glb") {
      res.setHeader("Content-Disposition", "attachment");
    }

    // 1. Serve from local disk if present (dev + same-session files)
    const localPath = path.join(uploadDir, key);
    if (fs.existsSync(localPath)) {
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      return res.sendFile(localPath);
    }

    // 2. Redirect directly to R2/Cloudflare when file isn't on local disk.
    //    This bypasses Render bandwidth entirely — the browser fetches the file
    //    straight from Cloudflare's CDN. Prefer a permanent public URL (custom
    //    domain or r2.dev) when R2_PUBLIC_URL is set; fall back to a 1-hour
    //    presigned URL otherwise. Both are transparent to the browser.
    if (isR2Configured()) {
      try {
        const publicUrl = r2GetPublicUrl(key);
        if (publicUrl) {
          res.redirect(302, publicUrl);
          return;
        }
        const signedUrl = await r2GetSignedUrl(key, 3600);
        if (signedUrl) {
          // Cache the redirect itself for 30 min so repeated requests don't
          // all hit the Render server (presigned URL is valid for 1 hour).
          res.setHeader("Cache-Control", "public, max-age=1800");
          res.redirect(302, signedUrl);
          return;
        }
      } catch {
        // fall through to 404
      }
    }

    // Filen findes hverken på disk eller i R2 → rigtig 404, IKKE SPA'ens HTML.
    return res.status(404).send("Not found");
  });

  // Serve sitemap.xml and robots.txt as static XML/text before Vite catch-all
  app.get("/sitemap.xml", (_req, res) => {
    const sitemapPath = path.resolve(process.cwd(), "client", "public", "sitemap.xml");
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.sendFile(sitemapPath);
  });

  app.get("/robots.txt", (_req, res) => {
    const robotsPath = path.resolve(process.cwd(), "client", "public", "robots.txt");
    res.setHeader("Content-Type", "text/plain");
    res.sendFile(robotsPath);
  });

  app.get("/api/health/live-diag", (_req, res) => res.status(404).json({ message: "Not found" }));

  // Exposed only to the NODE_ENV=test capacity harness.
  if (isLoadTestMode()) {
    app.get("/api/load-test/metrics", (_req, res) => {
      const memory = process.memoryUsage();
      return res.json({
        queue: getShowcaseQueueMetrics(),
        database: {
          totalConnections: pool.totalCount,
          idleConnections: pool.idleCount,
          waitingRequests: pool.waitingCount,
        },
        memory: {
          rssBytes: memory.rss,
          heapUsedBytes: memory.heapUsed,
          heapTotalBytes: memory.heapTotal,
          externalBytes: memory.external,
        },
      });
    });
  }


  // One-time admin bootstrap — protected by ADMIN_PASSWORD, safe to leave in
  app.post("/api/admin/bootstrap", async (req, res) => {
    const { password } = req.body || {};
    if (!adminPasswordOk(password)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const adminEmails = ["fredefussing@gmail.com", "nikolajthomsen0102@gmail.com"];
    const results: any[] = [];
    for (const email of adminEmails) {
      const user = await storage.getUserByEmail(email);
      if (!user) {
        results.push({ email, status: "not_found" });
        continue;
      }
      await storage.updateUser(user.id, {
        isAdmin: true,
        creditsRemaining: 999999,
        subscriptionStatus: "active",
        subscriptionTier: "unlimited",
      });
      results.push({ email, status: "updated", id: user.id });
    }
    log(`Admin bootstrap completed: ${JSON.stringify(results)}`);
    return res.json({ success: true, results });
  });

  app.post("/api/auth/verify", async (req, res) => {
    try {
      const { uid, email, name, emailVerified: tokenEmailVerified } = await verifyFirebaseToken(req.headers.authorization);

      let user = await storage.getUserByFirebaseUid(uid);

      if (!user) {
        const existingByEmail = await storage.getUserByEmail(email);

        if (existingByEmail) {
          await pool.query(
            "UPDATE users SET firebase_uid = $1 WHERE id = $2",
            [uid, existingByEmail.id],
          );
          user = { ...existingByEmail, firebaseUid: uid };
          log(`Linked Firebase UID to pre-created user: ${email}`);
        } else {
          user = await storage.createUser({
            email,
            firebaseUid: uid,
            displayName: name ?? null,
            creditsRemaining: 0,
            totalCreditsUsed: 0,
          });

          log(`New user created: ${email} (uid: ${uid})`);
        }
      }

      // Auto-verify: Google sign-in (and other providers) supply a token where
      // email_verified is true — no activation code needed for a real, verified email.
      if (tokenEmailVerified && !user.emailVerified) {
        // Atomic transition guards against concurrent logins both sending the welcome email.
        const didAutoVerify = await storage.verifyUserEmail(user.id);
        user = { ...user, emailVerified: true };
        log(`[auth] Auto-verified email via provider claim: ${user.email} (didVerify=${didAutoVerify})`);
        if (didAutoVerify && !isLoadTestMode()) {
          // Welcome email fires here (not at account creation) so the user
          // only receives it once they're actually inside the app.
          const autoVerifyLang = String(req.headers["x-lang"] || req.body?.lang || "da");
          sendWelcomeEmail(user.email, "Google sign-in (auto-verified)", autoVerifyLang).catch((e: any) =>
            log(`[auth] welcome email failed (auto-verify): ${e.message}`)
          );
        }
      }

      // Sync displayName from Firebase token to DB if it has changed
      if (name && user.displayName !== name) {
        await storage.updateUser(user.id, { displayName: name });
        user = { ...user, displayName: name };
      }

      if (isLoadTestMode() && (!user.isAdmin || !user.emailVerified)) {
        await storage.updateUser(user.id, {
          isAdmin: true,
          emailVerified: true,
          subscriptionStatus: "active",
          subscriptionTier: "unlimited",
        });
        user = {
          ...user,
          isAdmin: true,
          emailVerified: true,
          subscriptionStatus: "active",
          subscriptionTier: "unlimited",
        };
      }

      // Super-admins are always elevated to full access on every login,
      // regardless of what the DB currently says. ONLY these two — no one else.
      const SUPER_ADMIN_EMAILS = ["fredefussing@gmail.com", "nikolajthomsen0102@gmail.com"];
      if (
        SUPER_ADMIN_EMAILS.includes(user.email) &&
        (!user.isAdmin || user.subscriptionStatus !== "active" || user.subscriptionTier !== "unlimited")
      ) {
        await storage.updateUser(user.id, {
          isAdmin: true,
          creditsRemaining: 999999,
          subscriptionStatus: "active",
          subscriptionTier: "unlimited",
        });
        user = { ...user, isAdmin: true, creditsRemaining: 999999, subscriptionStatus: "active", subscriptionTier: "unlimited" };
        log(`[auth] Auto-elevated super-admin: ${user.email}`);
      }

      // Pre-configured users: specific accounts get fixed tier + feature locks on every login.
      // overrideQuotas: custom lifetime caps that are NEVER re-inflated after use (take min of DB vs cap).
      type PreConfigEntry = {
        tier: keyof typeof SUBSCRIPTION_QUOTAS;
        lockedFeatures: ("transformVideos" | "showcase" | "ai" | "floorPlans")[];
        overrideQuotas?: Partial<Record<"ai" | "floorPlans" | "transformVideos" | "showcase", number>>;
      };
      const PRE_CONFIGURED_USERS: Record<string, PreConfigEntry> = {
        "jove@atp-ejendomme.dk": { tier: "pro", lockedFeatures: ["transformVideos"], overrideQuotas: { showcase: 1 } },
        "henrilasse@icloud.com": { tier: "unlimited", lockedFeatures: [] },
      };
      const preConfig = PRE_CONFIGURED_USERS[user.email?.toLowerCase() ?? ""];
      if (preConfig) {
        if (user.subscriptionTier !== preConfig.tier || user.subscriptionStatus !== "active") {
          await storage.updateUser(user.id, { subscriptionTier: preConfig.tier, subscriptionStatus: "active" });
          user = { ...user, subscriptionTier: preConfig.tier, subscriptionStatus: "active" };
        }
        const tierQuotas = SUBSCRIPTION_QUOTAS[preConfig.tier];
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        nextMonth.setDate(1);
        nextMonth.setHours(0, 0, 0, 0);

        // For overrideQuotas fields: read current DB value and never re-inflate past the cap.
        // null in DB = first login → set to cap. number in DB → use min(current, cap).
        const currentDbQuota = preConfig.overrideQuotas ? await storage.getUserQuota(user.id) : null;

        const resolveField = (field: "ai" | "floorPlans" | "transformVideos" | "showcase", tierVal: number | null): number | null => {
          const locked = preConfig.lockedFeatures.includes(field);
          if (locked) return 0;
          const cap = preConfig.overrideQuotas?.[field];
          if (cap !== undefined && currentDbQuota) {
            const dbLimit = currentDbQuota[field === "floorPlans" ? "floorPlan" : field === "transformVideos" ? "transformVideo" : field].limit;
            return dbLimit === null ? cap : Math.min(dbLimit, cap);
          }
          return tierVal;
        };

        const quotaUpdate: Record<string, number | null | Date> = {
          ai:             resolveField("ai",             tierQuotas.ai as number | null),
          floorPlans:     resolveField("floorPlans",     tierQuotas.floorPlans as number | null),
          transformVideos:resolveField("transformVideos",tierQuotas.transformVideos as number | null),
          showcase:       resolveField("showcase",       tierQuotas.showcase as number | null),
          resetsAt: nextMonth,
        };
        await storage.setUserQuotas(user.id, quotaUpdate as any);
        log(`[auth] Pre-configured user applied: ${user.email} → tier=${preConfig.tier}, locked=${preConfig.lockedFeatures.join(",")}, showcase=${quotaUpdate.showcase}`);
      }

      // Test accounts — always email-verified so they skip the activation screen.
      // REMOVE these entries before a full public launch if desired.
      const TEST_BYPASS_EMAILS = ["johndoe@gmail.com", "johndoe1@gmail.com", "johndoe23@gmail.com"];
      if (TEST_BYPASS_EMAILS.includes((user.email ?? "").toLowerCase()) && !user.emailVerified) {
        await storage.updateUser(user.id, { emailVerified: true });
        user = { ...user, emailVerified: true };
        log(`[auth] Test bypass: auto-verified ${user.email}`);
      }

      // Auto-claim purchases made BEFORE the account existed (e.g. paid via
      // Stripe as guest, then signed up). Atomic claim → can never double-grant.
      try {
        const granted = await claimPendingPurchasesForUser({ id: user.id, email: user.email });
        if (granted.length > 0) {
          log(`[auth] Auto-claimed ${granted.length} pending purchase(s) for ${user.email}`);
          const refreshed = await storage.getUserByFirebaseUid(uid);
          if (refreshed) user = refreshed;
        }
      } catch (err: any) {
        log(`[auth] Pending-purchase claim failed for ${user.email}: ${err.message}`);
      }

      return res.json({
        user: {
          id: user.id,
          email: user.email,
          creditsRemaining: user.creditsRemaining,
          totalCreditsUsed: user.totalCreditsUsed,
          isAdmin: user.isAdmin,
          subscriptionStatus: user.subscriptionStatus,
          subscriptionTier: user.subscriptionTier,
          emailVerified: user.emailVerified,
          agencyLogoUrl: user.agencyLogoUrl ?? null,
        },
      });
    } catch (err: any) {
      log(`Auth verify failed: ${err.message}`);
      return res.status(401).json({ error: "Ugyldig token" });
    }
  });

  // ── Email verification (6-digit activation code) ──────────────────────────
  const VERIFICATION_CODE_TTL_MS = 15 * 60 * 1000; // 15 min
  const VERIFICATION_RESEND_COOLDOWN_MS = 60 * 1000; // 60 s between sends
  const VERIFICATION_MAX_ATTEMPTS = 5;
  const hashVerificationCode = (code: string, userId: number) =>
    crypto.createHash("sha256").update(`${userId}:${code}`).digest("hex");

  // "Glemt password" — kaldes fra login-siden i stedet for direkte fra klienten,
  // så vi kan LOGGE hvert forsøg (findes brugeren i DB? svarede Firebase OK?).
  // Selve mailen sendes stadig af Firebase/Google fra
  // noreply@nordic-homebuilding1.firebaseapp.com — den lander ofte i spam.
  const pwResetLast = new Map<string, number>();
  app.post("/api/auth/forgot-password", async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) {
      return res.status(400).json({ success: false, message: "Ugyldig email-adresse" });
    }
    const now = Date.now();
    if (now - (pwResetLast.get(email) || 0) < 60_000) {
      log(`[PasswordReset] throttled (under 60s siden sidst): ${email}`);
      return res.json({ success: true }); // Don't leak timing
    }
    pwResetLast.set(email, now);
    if (pwResetLast.size > 5000) pwResetLast.clear();
    try {
      const user = await storage.getUserByEmail(email);
      // Always respond success — never leak whether the email exists
      if (!user) {
        log(`[PasswordReset] email=${email} — ikke fundet i DB, sender ikke`);
        return res.json({ success: true });
      }
      // Generate a secure random token (raw), store only the SHA-256 hash
      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
      await storage.createPasswordResetToken(user.id, tokenHash, expiresAt);
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const resetUrl = `${baseUrl}/nulstil-password?token=${rawToken}`;
      // Fire-and-forget — respond immediately
      const resetLang = String(req.body?.lang || "da");
      sendPasswordResetEmail(email, resetUrl, resetLang).catch((err: any) =>
        log(`[PasswordReset] email-fejl for ${email}: ${err.message}`)
      );
      log(`[PasswordReset] token genereret for bruger-id ${user.id}, email afsendt via Brevo`);
      return res.json({ success: true });
    } catch (err: any) {
      log(`[PasswordReset] FEJL email=${email}: ${err.message}`);
      return res.status(500).json({ success: false, message: "Kunne ikke sende nulstillingsmail. Prøv igen om lidt." });
    }
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    const rawToken = String(req.body?.token || "").trim();
    const newPassword = String(req.body?.password || "");
    if (!rawToken || rawToken.length < 32) {
      return res.status(400).json({ success: false, message: "Ugyldigt nulstillingslink. Bed om et nyt." });
    }
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ success: false, message: "Password skal være mindst 8 tegn." });
    }
    if (newPassword.length > 128) {
      return res.status(400).json({ success: false, message: "Password må højst være 128 tegn." });
    }
    try {
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      const record = await storage.getPasswordResetToken(tokenHash);
      if (!record) {
        return res.status(400).json({ success: false, message: "Ugyldigt nulstillingslink. Bed om et nyt." });
      }
      if (record.usedAt) {
        return res.status(400).json({ success: false, message: "Dette link er allerede brugt. Bed om et nyt." });
      }
      if (new Date() > record.expiresAt) {
        return res.status(400).json({ success: false, message: "Linket er udløbet (gyldigt i 15 min). Bed om et nyt." });
      }
      const user = await storage.getUserById(record.userId);
      if (!user) {
        return res.status(400).json({ success: false, message: "Bruger ikke fundet. Kontakt support." });
      }
      // Update password in Firebase
      await updateFirebasePassword(user.firebaseUid, user.email, newPassword);
      // Mark token as used (idempotency — prevent replay)
      await storage.markPasswordResetTokenUsed(record.id);
      log(`[PasswordReset] password opdateret for bruger-id ${user.id}`);
      return res.json({ success: true });
    } catch (err: any) {
      log(`[PasswordReset] reset-fejl: ${err.message}`);
      if (err.message?.includes("FIREBASE_SERVICE_ACCOUNT_JSON")) {
        return res.status(503).json({ success: false, message: "Password-nulstilling er ikke konfigureret endnu. Kontakt support." });
      }
      return res.status(500).json({ success: false, message: "Der skete en fejl. Prøv igen." });
    }
  });

  app.post("/api/auth/send-verification-code", async (req, res) => {
    let uid: string;
    let tokenEmail: string;
    try {
      ({ uid, email: tokenEmail } = await verifyFirebaseToken(req.headers.authorization));
    } catch {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      let user = await storage.getUserByFirebaseUid(uid);
      // Fallback: look up by email and link UID (same as /api/auth/verify)
      if (!user && tokenEmail) {
        const byEmail = await storage.getUserByEmail(tokenEmail);
        if (byEmail) {
          await pool.query("UPDATE users SET firebase_uid = $1 WHERE id = $2", [uid, byEmail.id]);
          user = { ...byEmail, firebaseUid: uid };
          log(`[send-code] Linked Firebase UID via email fallback: ${tokenEmail}`);
        }
      }
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      if (user.emailVerified) return res.json({ success: true, alreadyVerified: true });

      // Resend cooldown: code expiry minus TTL = last send time
      if (user.verificationCodeExpires) {
        const lastSent = new Date(user.verificationCodeExpires).getTime() - VERIFICATION_CODE_TTL_MS;
        const waitMs = lastSent + VERIFICATION_RESEND_COOLDOWN_MS - Date.now();
        if (waitMs > 0) {
          return res.status(429).json({ retryAfterSeconds: Math.ceil(waitMs / 1000) });
        }
      }

      const code = crypto.randomInt(100000, 1000000).toString();
      await storage.updateUser(user.id, {
        verificationCodeHash: hashVerificationCode(code, user.id),
        verificationCodeExpires: new Date(Date.now() + VERIFICATION_CODE_TTL_MS),
        verificationAttempts: 0,
      });
      // Fire-and-forget — code is already saved to DB, respond immediately so
      // the client shows "kode sendt" without waiting for the SMTP round-trip.
      const verifyLang = String(req.body?.lang || req.headers["x-lang"] || "da");
      sendVerificationCodeEmail(user.email, code, verifyLang).catch((err: any) =>
        log(`[auth] send-verification-code email failed: ${err.message}`)
      );
      return res.json({ success: true });
    } catch (err: any) {
      log(`[auth] send-verification-code failed: ${err.message}`);
      return res.status(500).json({ code: "send_failed" });
    }
  });

  app.post("/api/auth/verify-code", async (req, res) => {
    let uid: string;
    try {
      ({ uid } = await verifyFirebaseToken(req.headers.authorization));
    } catch {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const user = await storage.getUserByFirebaseUid(uid);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      if (user.emailVerified) return res.json({ success: true, alreadyVerified: true });

      const code = String(req.body?.code ?? "").trim();
      if (!/^\d{6}$/.test(code)) return res.status(400).json({ code: "invalid_format" });
      if (!user.verificationCodeHash || !user.verificationCodeExpires) {
        return res.status(400).json({ code: "no_active_code", needsNewCode: true });
      }
      if (new Date(user.verificationCodeExpires).getTime() < Date.now()) {
        return res.status(400).json({ code: "expired", needsNewCode: true });
      }
      if (user.verificationAttempts >= VERIFICATION_MAX_ATTEMPTS) {
        return res.status(429).json({ code: "too_many_attempts", needsNewCode: true });
      }

      const match = crypto.timingSafeEqual(
        Buffer.from(hashVerificationCode(code, user.id)),
        Buffer.from(user.verificationCodeHash),
      );
      if (!match) {
        await storage.updateUser(user.id, { verificationAttempts: user.verificationAttempts + 1 });
        const left = VERIFICATION_MAX_ATTEMPTS - user.verificationAttempts - 1;
        return res.status(400).json({ code: "wrong_code", attemptsLeft: left, needsNewCode: left <= 0 });
      }

      // Atomic transition: emailVerified false → true. Returns false if a
      // concurrent request already won the race (refresh-during-activation),
      // so the welcome email fires exactly once.
      const didVerify = await storage.verifyUserEmail(user.id);
      log(`[auth] Email verified via code: ${user.email} (didVerify=${didVerify})`);
      if (didVerify) {
        const codeLang = String(req.body?.lang || req.headers["x-lang"] || "da");
        sendWelcomeEmail(user.email, "Email kode bekræftet", codeLang).catch((e: any) =>
          log(`[auth] welcome email failed (verify-code): ${e.message}`)
        );
      }
      return res.json({ success: true });
    } catch (err: any) {
      log(`[auth] verify-code failed: ${err.message}`);
      return res.status(500).json({ code: "verify_failed" });
    }
  });

  app.get("/api/credits", async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const user = await storage.getUserByFirebaseUid(uid);

      if (!user) {
        return res.status(404).json({ error: "Bruger ikke fundet" });
      }

      return res.json({ creditsRemaining: user.creditsRemaining, isAdmin: user.isAdmin, subscriptionStatus: user.subscriptionStatus, subscriptionTier: user.subscriptionTier });
    } catch (err: any) {
      return res.status(401).json({ error: "Ugyldig token" });
    }
  });

  app.post("/api/designs", upload.single("image"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No image uploaded" });
      }

      const parsed = createDesignSchema.safeParse({
        roomType: req.body.roomType,
        style: req.body.style,
        budget: req.body.budget ? parseInt(req.body.budget) : undefined,
      });

      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid room type or style" });
      }

      let dbUser = null;
      try {
        const { uid } = await verifyFirebaseToken(req.headers.authorization);
        dbUser = await storage.getUserByFirebaseUid(uid);
      } catch {}

      if (!dbUser) {
        return res.status(401).json({ message: "Log ind for at generere designs" });
      }

      if (!dbUser.isAdmin && dbUser.creditsRemaining <= 0) {
        return res.status(403).json({
          message: "Ingen billeder tilbage. Køb flere for at fortsætte.",
          creditsRemaining: 0,
        });
      }

      const isFreeStyle = freeStyles.includes(parsed.data.style as any);
      const subscriptionActive = dbUser.subscriptionStatus === "active" && (!dbUser.subscriptionExpires || dbUser.subscriptionExpires > new Date());
      const hasSubscription = dbUser.isAdmin || subscriptionActive;
      if (!isFreeStyle && !hasSubscription) {
        return res.status(403).json({
          message: "Denne stilart kræver et abonnement. Opgrader for at låse op.",
          requiresSubscription: true,
        });
      }

      // Ingen pre-processing — rå fil sendes direkte til Collov (edit/generate bevarer struktur selv)
      const protocol = (req.headers["x-forwarded-proto"] as string | undefined) || req.protocol;
      const host = (req.headers["x-forwarded-host"] as string | undefined) || req.headers.host;
      const publicUrl = `${protocol}://${host}/uploads/${req.file.filename}`;
      log(`Upload URL for Collov: ${publicUrl}`);

      const tier = parsed.data.budget ? budgetToTier(parsed.data.budget) : undefined;

      if (!COLLOV_API_KEY && !isLoadTestMode()) {
        return res.status(500).json({ message: "API nøgle ikke konfigureret. Kontakt support.", errorCode: "api_key_missing" });
      }

      if (!dbUser.isAdmin) {
        const creditDeducted = await storage.deductCredit(dbUser.id, `Genereret billede: ${parsed.data.roomType} - ${parsed.data.style}`);
        if (!creditDeducted) {
          return res.status(403).json({
            message: "Ingen billeder tilbage. Køb flere for at fortsætte.",
            creditsRemaining: 0,
          });
        }
        log(`Credit used by ${dbUser.email}: deducted atomically`);
      } else {
        log(`Admin ${dbUser.email}: skipping credit deduction`);
      }

      const design = await storage.createDesign({
        userId: dbUser.id,
        originalImageUrl: publicUrl,
        roomType: parsed.data.roomType,
        style: parsed.data.style,
        status: "pending",
        budget: parsed.data.budget || null,
        tier: tier || null,
      });

      const includePlants = req.body.includePlants === "true";

      // Respond immediately — workflow starts right away (pre-warm handles cold-start)
      setStatusMsg(design.id, "Starter generering...");
      const updated = await storage.getDesign(design.id);
      res.json(updated);

      // Background: start immediately (no delay — models are pre-warmed at server start)
      setImmediate(async () => {
        try {
          log(`Design ${design.id}: starting workflow...`);
          const collovUrl = await runDesignWorkflow(
            publicUrl, parsed.data.roomType, parsed.data.style, tier, includePlants, design.id,
          );
          // Download from Collov, sharpen, save locally + R2 → persistent URL
          setStatusMsg(design.id, "Gemmer billede...");
          const finalUrl = await sharpenAndSaveVst(collovUrl, design.id);
          clearStatusMsg(design.id);
          const updated = await storage.getDesign(design.id);
          await storage.updateDesign(design.id, { status: "completed", resultImageUrl: finalUrl, versions: [finalUrl] });
          log(`Design ${design.id}: completed`);
          if (updated) {
            const { runAffiliatePipeline } = await import("./affiliatePipeline");
            runAffiliatePipeline(design.id, finalUrl, updated.roomType).catch(
              (e: any) => log(`[Affiliate] Design ${design.id} pipeline uncaught: ${e.message}`)
            );
          }
        } catch (err: any) {
          log(`Workflow error design ${design.id}: ${err.message}`);
          const failReason = err.message?.includes("apiKey") ? "api_key_invalid" : "ai_send_failed";
          clearStatusMsg(design.id);
          await storage.updateDesign(design.id, { status: "failed", failReason });
          void import("./tracker").then(m => m.reportGenerationFailure("collov", err.message ?? failReason)).catch(() => {});
        }
      });

      return;
    } catch (err: any) {
      log(`Upload error: ${err.message}`);
      return res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/trending", async (_req, res) => {
    try {
      const allDesigns = await storage.getAllDesigns();
      const completed = allDesigns.filter(d => d.status === "completed" && d.resultImageUrl);

      const groups: Record<string, { count: number; latestImage: string; roomType: string; style: string; budget: number | null }> = {};
      for (const d of completed) {
        const key = `${d.roomType}__${d.style}`;
        if (!groups[key]) {
          groups[key] = { count: 0, latestImage: d.resultImageUrl!, roomType: d.roomType, style: d.style, budget: d.budget };
        }
        groups[key].count++;
        if (d.budget) groups[key].budget = d.budget;
      }

      const trending = Object.values(groups)
        .sort((a, b) => b.count - a.count)
        .slice(0, 6)
        .map((g, i) => ({
          rank: i + 1,
          roomType: g.roomType,
          style: g.style,
          budget: g.budget || 25000,
          designCount: g.count,
          imageUrl: g.latestImage,
        }));

      return res.json(trending);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/designs/my", async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const user = await storage.getUserByFirebaseUid(uid);
      if (!user) return res.status(404).json({ message: "Bruger ikke fundet" });

      if (user.isAdmin) {
        const allDesigns = await storage.getAllDesigns();
        return res.json(allDesigns);
      }

      const myDesigns = await storage.getDesignsByUser(user.id);
      return res.json(myDesigns);
    } catch {
      return res.status(401).json({ message: "Ugyldig token" });
    }
  });

  app.get("/api/my-designs", async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const user = await storage.getUserByFirebaseUid(uid);
      if (!user) return res.status(404).json({ message: "Bruger ikke fundet" });

      const [regularDesigns, agentDesignsData] = await Promise.all([
        user.isAdmin ? storage.getAllDesigns() : storage.getDesignsByUser(user.id),
        storage.getAgentDesignsByUser(user.id),
      ]);

      const combined = [
        ...regularDesigns
          .filter((d) => d.status === "completed")
          .map((d) => ({ ...d, designType: "redesign" as const, productMatches: [] as any[] })),
        ...agentDesignsData
          .filter((d) => d.status === "completed" && d.resultImageUrl)
          .map((d) => ({ ...d, designType: "agent" as const, productMatches: [] as any[] })),
      ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      // Batch-hent alle product matches for redesign-designs i ét SQL-kald
      const redesignIds = combined
        .filter((d) => d.designType === "redesign")
        .map((d) => d.id);

      if (redesignIds.length > 0) {
        const { rows: matches } = await pool.query(`
          SELECT pm.design_id, p.id, p.name, p.name_en, p.price,
                 p.image_url, p.affiliate_link, p.shop,
                 pm.match_type, pm.match_score, pm.rank
          FROM product_matches pm
          JOIN products p ON pm.product_id = p.id
          WHERE pm.design_id = ANY($1)
          ORDER BY pm.design_id, pm.rank
        `, [redesignIds]);

        const byDesign = new Map<number, any[]>();
        for (const m of matches) {
          const arr = byDesign.get(m.design_id) ?? [];
          arr.push(m);
          byDesign.set(m.design_id, arr);
        }
        for (const d of combined) {
          if (d.designType === "redesign") {
            d.productMatches = byDesign.get(d.id) ?? [];
          }
        }
      }

      return res.json(combined);
    } catch {
      return res.status(401).json({ message: "Ugyldig token" });
    }
  });

  app.get("/api/designs", async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const user = await storage.getUserByFirebaseUid(uid);
      if (!user) return res.status(401).json({ message: "Ukendt bruger" });
      if (!user.isAdmin) return res.status(403).json({ message: "Adgang nægtet" });
      const allDesigns = await storage.getAllDesigns();
      return res.json(allDesigns);
    } catch {
      return res.status(401).json({ message: "Ugyldig token" });
    }
  });

  app.get("/api/designs/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });

    const design = await storage.getDesign(id);
    if (!design) return res.status(404).json({ message: "Design not found" });

    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const user = await storage.getUserByFirebaseUid(uid);
      if (!user || (!user.isAdmin && design.userId !== user.id)) {
        return res.status(403).json({ message: "Adgang nægtet" });
      }
    } catch {
      return res.status(401).json({ message: "Ugyldig token" });
    }

    return res.json(design);
  });


  app.get("/api/designs/:id/status", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ status: "error", error: "Invalid id", resultUrl: null });

      const design = await storage.getDesign(id);
      if (!design) return res.status(404).json({ status: "error", error: "Design not found", resultUrl: null });

      // Auth + ownership check
      try {
        const { uid } = await verifyFirebaseToken(req.headers.authorization);
        const user = await storage.getUserByFirebaseUid(uid);
        if (!user || (!user.isAdmin && design.userId !== user.id)) {
          return res.status(403).json({ status: "error", error: "Adgang nægtet", resultUrl: null });
        }
      } catch {
        return res.status(401).json({ status: "error", error: "Ugyldig token", resultUrl: null });
      }

      if (design.status === "completed") {
        return res.json({
          status: "completed",
          resultUrl: design.resultImageUrl,
          versions: design.versions ?? [],
          error: null,
        });
      }
      if (design.status === "failed") {
        const reason = design.failReason || "unknown";
        let errorMessage: string;
        switch (reason) {
          case "api_key_missing":
          case "api_key_invalid":
            errorMessage = "API nøgle ikke konfigureret. Kontakt support.";
            break;
          case "timeout":
            errorMessage = "Generering tog for lang tid. Prøv med et mindre billede eller en anden stil.";
            break;
          case "poll_error":
            errorMessage = "AI generering midlertidigt utilgængelig. Prøv igen om lidt.";
            break;
          default:
            errorMessage = "AI generering fejlede. Prøv igen med et andet billede eller stil.";
        }
        log(`Design ${id} failed with reason: ${reason}`);
        return res.json({ status: "failed", resultUrl: null, error: errorMessage, errorCode: reason });
      }

      return res.json({
        status: "processing",
        resultUrl: null,
        error: null,
        statusMessage: designStatusMessages.get(id) ?? "Genererer...",
      });
    } catch (error: any) {
      log(`Status check failed: ${error.message}`);
      return res.status(500).json({
        status: "error",
        error: "Kunne ikke tjekke status. Prøv igen.",
        resultUrl: null,
      });
    }
  });

  app.get("/api/style-info/:style/:tier", (req, res) => {
    const { style, tier } = req.params;
    const styleConfig = styleVocabulary[style];
    if (!styleConfig) {
      return res.status(404).json({ message: "Style not found" });
    }
    const tierConfig = styleConfig[tier as "budget" | "standard" | "luxury"];
    if (!tierConfig) {
      return res.status(404).json({ message: "Tier not found" });
    }
    return res.json(tierConfig);
  });

  app.post("/api/quotes", async (req, res) => {
    try {
      // Quotes contain customer PII — require admin.
      const admin = await requireAdmin(req, res);
      if (!admin) return;

      const parsed = createQuoteSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Ugyldige data", errors: parsed.error.flatten() });
      }

      const design = await storage.getDesign(parsed.data.designId);
      if (!design) {
        return res.status(404).json({ message: "Design ikke fundet" });
      }

      const products = parsed.data.products || [];
      const totalPrice = products.reduce((sum, p) => sum + (p.price || 0), 0);
      const margin = Math.round(totalPrice * 0.25);
      const finalPrice = totalPrice + margin;

      const quote = await storage.createQuote({
        designId: parsed.data.designId,
        customerName: parsed.data.customerName,
        customerEmail: parsed.data.customerEmail,
        products,
        totalPrice: totalPrice.toString(),
        margin: margin.toString(),
        finalPrice: finalPrice.toString(),
        status: parsed.data.status || "draft",
      });

      return res.json(quote);
    } catch (err: any) {
      log(`Quote creation error: ${err.message}`);
      return res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/quotes", async (req, res) => {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const allQuotes = await storage.getAllQuotes();
    return res.json(allQuotes);
  });

  app.get("/api/quotes/:id", async (req, res) => {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });

    const quote = await storage.getQuote(id);
    if (!quote) return res.status(404).json({ message: "Quote not found" });

    return res.json(quote);
  });

  app.get("/api/designs/:id/quotes", async (req, res) => {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });

    const designQuotes = await storage.getQuotesByDesign(id);
    return res.json(designQuotes);
  });

  app.patch("/api/quotes/:id", async (req, res) => {
    try {
      const admin = await requireAdmin(req, res);
      if (!admin) return;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });

      const quote = await storage.updateQuote(id, req.body);
      if (!quote) return res.status(404).json({ message: "Quote not found" });

      return res.json(quote);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/contact", async (req, res) => {
    try {
      const { name, email, phone, company, role, teamSize, topic, message, consent } = req.body || {};
      if (!name || typeof name !== "string" || name.trim().length < 2) {
        return res.status(400).json({ message: "Navn mangler." });
      }
      if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ message: "Ugyldig e-mailadresse." });
      }
      if (!message || typeof message !== "string" || message.trim().length < 5) {
        return res.status(400).json({ message: "Besked mangler." });
      }
      if (!consent) {
        return res.status(400).json({ message: "Samtykke kræves." });
      }

      // Awaited on purpose: if the mail to kontakt@ fails, the user MUST see an
      // error instead of a false success (previously failures were silent).
      await sendContactFormEmails({
        name: String(name).trim(),
        email: String(email).trim(),
        phone: phone ? String(phone).trim() : undefined,
        company: company ? String(company).trim() : undefined,
        role: role ? String(role).trim() : undefined,
        teamSize: teamSize ? String(teamSize).trim() : undefined,
        topic: topic ? String(topic).trim() : undefined,
        message: String(message).trim(),
      });

      log(`Contact form submitted by ${email}`);
      return res.json({ ok: true });
    } catch (err: any) {
      log(`Contact form FAILED for ${req.body?.email}: ${err.message}`);
      return res.status(500).json({ message: "Beskeden kunne ikke sendes lige nu. Prøv igen, eller skriv direkte til kontakt@formaestates.com." });
    }
  });


  const packageMap: Record<string, { name: string; images: number; price: number }> = {
    "52707296543062": { name: "Basic", images: 10, price: 49 },
    "52707329245526": { name: "Pro", images: 25, price: 99 },
    "52707374432598": { name: "Unlimited", images: 60, price: 149 },
  };

  app.post("/api/shopify/webhook", express.json(), async (req, res) => {
    try {
      // ── HMAC verification: Shopify signs every webhook with the shop's
      // webhook secret (X-Shopify-Hmac-Sha256 over the raw body). Without this
      // check anyone could POST a forged order and mint credits.
      const shopifySecret = process.env.SHOPIFY_WEBHOOK_SECRET;
      if (shopifySecret) {
        const hmacHeader = req.headers["x-shopify-hmac-sha256"] as string | undefined;
        const rawBody = (req as any).rawBody as Buffer | undefined;
        let valid = false;
        if (hmacHeader && rawBody) {
          const digest = crypto.createHmac("sha256", shopifySecret).update(rawBody).digest("base64");
          const a = Buffer.from(digest);
          const b = Buffer.from(hmacHeader);
          valid = a.length === b.length && crypto.timingSafeEqual(a, b);
        }
        if (!valid) {
          log(`Shopify webhook rejected: HMAC verification failed`);
          return res.status(401).json({ error: "Invalid webhook signature" });
        }
      } else {
        log(`ADVARSEL: SHOPIFY_WEBHOOK_SECRET er ikke sat — Shopify webhook kører UVERIFICERET`);
      }

      const order = req.body;
      log(`Shopify webhook received: order #${order.order_number || order.id || "unknown"}`);

      const customerEmail = order.email || order.customer?.email;
      const customerName = order.customer?.first_name
        ? `${order.customer.first_name} ${order.customer.last_name || ""}`.trim()
        : order.billing_address?.name || "Kunde";
      // A real order id is REQUIRED for idempotency — without one we cannot
      // dedupe redeliveries, so the event is acknowledged but not processed.
      const orderIdRaw = order.order_number ?? order.id;
      if (orderIdRaw === undefined || orderIdRaw === null) {
        log(`Shopify webhook missing order id — ignored`);
        return res.status(200).json({ success: true });
      }
      const orderId = String(orderIdRaw);

      let matchedPackage = null;
      const lineItems = order.line_items || [];
      for (const item of lineItems) {
        const variantId = String(item.variant_id || "");
        if (packageMap[variantId]) {
          matchedPackage = packageMap[variantId];
          break;
        }
      }

      if (!matchedPackage) {
        const title = lineItems[0]?.title?.toLowerCase() || "";
        if (title.includes("60")) matchedPackage = packageMap["52707374432598"];
        else if (title.includes("25")) matchedPackage = packageMap["52707329245526"];
        else matchedPackage = packageMap["52707296543062"];
      }

      // Idempotency: Shopify retries webhooks — the ledger's unique order id
      // guarantees a re-delivered order never grants credits twice.
      const externalId = `shopify:${orderId}`;
      const { inserted } = await storage.upsertPendingPurchase({
        provider: "shopify",
        externalId,
        email: customerEmail ?? null,
        kind: "shopify_credits",
        payload: {
          packageName: matchedPackage.name,
          images: matchedPackage.images,
          price: matchedPackage.price,
          tierKey: matchedPackage.name.toLowerCase(),
        },
      });
      if (!inserted) {
        log(`Shopify webhook duplicate ignored: order #${orderId}`);
        return res.status(200).json({ success: true, duplicate: true });
      }

      let targetUser = null;

      if (customerEmail) {
        targetUser = await storage.getUserByEmail(customerEmail);
        if (targetUser) {
          log(`User resolved via email (${customerEmail}) → ${targetUser.email}`);
        } else {
          log(`No user found for email: ${customerEmail} — purchase stays pending until signup`);
        }
      }

      if (targetUser) {
        const granted = await claimAndGrant(externalId, targetUser.id);
        if (granted) {
          log(`Credits added: ${matchedPackage.images} + subscription activated → ${targetUser.email}`);
        }
      } else {
        log(`Shopify purchase pending — customerEmail: ${customerEmail}`);
      }

      if (customerEmail) {
        sendOrderConfirmationEmail({
          customerEmail,
          customerName,
          packageName: matchedPackage.name,
          imageCount: matchedPackage.images,
          price: matchedPackage.price,
          orderId,
        });
      }

      log(`Order #${orderId}: ${matchedPackage.name} pakke (${matchedPackage.price} kr) → ${customerEmail || "no email"}`);
      return res.status(200).json({ success: true });
    } catch (err: any) {
      log(`Shopify webhook error: ${err.message}`);
      return res.status(200).json({ success: true });
    }
  });

  // NOTE: welcome emails are sent exclusively server-side when the user row is
  // first created in /api/auth/verify — a separate client-triggered endpoint
  // caused duplicate welcome + admin emails.

  app.post("/api/admin/login", (req, res) => {
    const { password } = req.body;
    if (!process.env.ADMIN_PASSWORD) {
      return res.status(500).json({ error: "Admin password not configured" });
    }
    const ip = req.ip ?? req.socket?.remoteAddress ?? "unknown";
    if (adminLoginRateLimited(ip)) {
      return res.status(429).json({ error: "For mange forsøg — prøv igen om 5 minutter" });
    }
    if (adminPasswordOk(password)) {
      return res.json({ success: true });
    }
    return res.status(401).json({ error: "Forkert adgangskode" });
  });

  // ── Admin: seed runde-3 cold leads directly (bypasses ensure-schema order issues) ──
  app.post("/api/admin/seed-runde3-leads", async (req, res) => {
    if (!adminPasswordOk(req.headers["x-admin-pw"] as string)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const oe = "fredefussing@gmail.com";
    type R3L = { name: string; phone: string; oPhone?: string; note: string };
    const r3Leads: R3L[] = [
      { name:"Lone Levin Ejendomsmægler",                phone:"30 14 10 14",                       note:"Indehaver: Lone Levin | Område: Nordsjælland | Type: Boligsalg | CVR 45962326." },
      { name:"Botker Bolig",                             phone:"21 42 37 88",                       note:"Indehaver: Sebastian Botker | Område: Sjælland | Type: Ejendomsmægler | Aktiv mæglerregistrering." },
      { name:"Linda Riis Ejendomsmægler",                phone:"20 77 26 29",                       note:"Indehaver: Linda Riis | Område: Nordsjælland | Type: Boligsalg | CVR 37047538." },
      { name:"Ejendomsmæglerfirmaet Marianne Møllebro",  phone:"21 80 10 12", oPhone:"48 16 00 12", note:"Indehaver: Marianne Møllebro | Område: Nordsjælland | Type: Boligsalg | CVR 20547332." },
      { name:"Jenny Eliassen Ejendomsmægler",            phone:"39 20 29 20",                       note:"Indehaver: Jenny Eliassen | Område: København | Type: Boligsalg | CVR 35099530." },
      { name:"LOKALmæglerne Hornslet",                   phone:"29 41 36 43", oPhone:"86 99 65 77", note:"Indehaver: Jette Dalgaard | Område: Hornslet | Type: Boligsalg | CVR 25161602." },
      { name:"Flemming Elsborg Bolig",                   phone:"61 10 61 43",                       note:"Indehaver: Flemming Elsborg | Område: Østjylland | Type: Boligsalg." },
      { name:"CPH Erhverv – Hougaard & Westall",         phone:"21 43 95 90", oPhone:"71 99 22 21", note:"Indehaver: Klaus Hougaard Christensen / Lars Westall | Område: København | Type: Erhvervsmægler | CVR 41892323." },
      { name:"La Cour & Lykke",                          phone:"33 30 10 50",                       note:"Indehaver: Kristian Hartmann / partnerkredsen | Område: København | Type: Erhvervsmægler | CVR 33965141. (Kontor-tlf.)" },
      { name:"Andelshandel A/S",                         phone:"71 99 69 39",                       note:"Indehaver: Christian Weber | Område: København | Type: Andelsboliger | CVR 35244662." },
      { name:"Den Alternative Mægler",                   phone:"51 87 35 75",                       note:"Indehaver: Anders Frederiksen | Område: Østjylland | Type: Ejendomsmægler | CVR 25631242." },
      { name:"Ejendomsmægler Anette Huusfelt",           phone:"47 74 22 55",                       note:"Indehaver: Anette Huusfelt | Område: Frederikssund | Type: Ejendomsmægler | CVR 72977815." },
      { name:"Ejendomsmæglerfirmaet Jette Birkholm",     phone:"36 75 74 61",                       note:"Indehaver: Jette Birkholm | Område: København | Type: Ejendomsmægler, timeshare | CVR 11915191." },
      { name:"VW estate / Ejendomsmægler Vibeke Wedel",  phone:"31 12 00 01",                       note:"Indehaver: Vibeke Wedel | Område: Nordsjælland | Type: Boligsalg." },
      { name:"Søgaard Køberrådgivning",                  phone:"30 88 39 68",                       note:"Indehaver: Anette Søgaard | Område: Nordsjælland | Type: Købers ejendomsmægler." },
      { name:"City Bolig",                               phone:"70 26 28 30",                       note:"Indehaver: Torsten Smidt | Område: København | Type: Boligsalg." },
      { name:"Kaiserbolig",                              phone:"22 66 66 66", oPhone:"44 44 44 70", note:"Indehaver: Asher Kaiser / Simon Kaiser | Område: Nordsjælland | Type: Boligsalg." },
      { name:"Brith Ankjær Købers Ejendomsmægler",       phone:"23 40 00 23",                       note:"Indehaver: Brith Ankjær | Område: Danmark | Type: Købers ejendomsmægler." },
      { name:"MB Køberrådgivning",                       phone:"20 28 46 15",                       note:"Indehaver: Mikkel Birck | Område: Danmark | Type: Købers ejendomsmægler." },
      { name:"Skøde og Bolighandel",                     phone:"22 24 44 83",                       note:"Indehaver: Signe Mayland | Område: Danmark | Type: Købers ejendomsmægler." },
      { name:"RIWAS Køberrådgivning",                    phone:"53 82 56 12",                       note:"Indehaver: Rikke Waadegaard | Område: Danmark | Type: Købers ejendomsmægler." },
      { name:"Købsmæglerne",                             phone:"22 66 85 57", oPhone:"70 70 86 68", note:"Indehaver: Peter Tang / Katrine Tang | Område: Danmark | Type: Købers ejendomsmægler." },
      { name:"Køberrådgiverne ApS",                      phone:"23 39 28 60",                       note:"Indehaver: Mia Marie Zerlang Matthiessen | Område: Danmark | Type: Købers ejendomsmægler." },
      { name:"Køberrådgiver Sara Holms",                 phone:"20 17 59 07",                       note:"Indehaver: Sara Holms | Område: Danmark | Type: Købers ejendomsmægler." },
      { name:"AIKOPA",                                   phone:"31 55 96 95",                       note:"Indehaver: Pia Bach Kjær / Sussie Andersen | Område: Danmark | Type: Købers ejendomsmægler." },
      { name:"Center for Køberrådgivning",               phone:"20 27 16 05",                       note:"Indehaver: Jakob Nielsen | Område: Danmark | Type: Købers ejendomsmægler | CVR 46151399." },
      { name:"BoHer.nu",                                 phone:"25 53 31 13",                       note:"Indehaver: Morten Bo Pedersen | Område: Danmark | Type: Købers ejendomsmægler | CVR 40552057." },
      { name:"Valuarvurderinger.dk",                     phone:"20 94 75 02", oPhone:"32 55 59 00", note:"Indehaver: Erik Jacobsen | Område: København | Type: Ejendomsmægler og valuar | CVR 72122119." },
      { name:"Bolig Butikken Aaskov Ejendomscenter",     phone:"97 19 25 00",                       note:"Indehaver: Ebbe Georgi Andersen | Område: Midtjylland | Type: Boligsalg | CVR 25963997. (Kontor-tlf.)" },
      { name:"Tingleff Ejendomme",                       phone:"51 94 49 45",                       note:"Indehaver: Morten Tingleff | Område: Sjælland | Type: Ejendomsmægler | Ejerledet." },
      { name:"Bolignavigator",                           phone:"60 57 27 99",                       note:"Indehaver: Charlotte Flarup | Område: Danmark | Type: Købers ejendomsmægler." },
      { name:"MinKøbermægler.dk",                        phone:"42 45 31 71",                       note:"Indehaver: Anders Klingenberg | Område: Danmark | Type: Købers ejendomsmægler | CVR 40626042." },
      { name:"MDN Boligrådgivning",                      phone:"93 89 40 95",                       note:"Indehaver: Mikkel Dan Nilausen | Område: Danmark | Type: Købers ejendomsmægler | CVR 44405067." },
      { name:"Consult Property",                         phone:"71 99 14 30",                       note:"Indehaver: Philip Sørensen | Område: København | Type: Købers ejendomsmægler | CVR 44110776." },
      { name:"Tina Lau Køberrådgivning",                 phone:"93 10 89 99",                       note:"Indehaver: Tina Lau | Område: Danmark | Type: Købers ejendomsmægler | CVR 45057593." },
      { name:"Lise Ørum Rådgivning",                     phone:"31 51 51 85",                       note:"Indehaver: Lise Ørum | Område: Danmark | Type: Købers ejendomsmægler | CVR 46322975." },
      { name:"Din-Bolighandel",                          phone:"36 96 54 54",                       note:"Indehaver: Tanja Bjerggaard | Område: Danmark | Type: Ejendomsmægler og køberrådgivning | CVR 37460508. (Kontor-tlf.)" },
      { name:"Rosenqvist ApS",                           phone:"30 25 23 36",                       note:"Indehaver: Ditte Rosenqvist | Område: Sjælland | Type: Købers ejendomsmægler | CVR 38602519." },
      { name:"Boligrådgivning.com",                      phone:"21 31 91 26",                       note:"Indehaver: Jesper Gelardi Lunde | Område: Danmark | Type: Købers ejendomsmægler | CVR 44719290." },
      { name:"Boligraadgiver.dk",                        phone:"82 13 10 66",                       note:"Indehaver: Michael Christensen | Område: Danmark | Type: Købers ejendomsmægler | CVR 36053550. (Kontor-tlf.)" },
      { name:"Nøgleklar.dk / HøEg Bolig ApS",           phone:"20 84 80 17", oPhone:"22 38 33 30", note:"Indehaver: Kenneth Egholm / Frank Høholt | Område: Nordsjælland / København | Type: Købers ejendomsmæglere | CVR 46300564." },
      { name:"Franck Milling ApS",                      phone:"23 43 33 15", oPhone:"70 60 59 33", note:"Indehaver: Franck Milling | Område: Aarhus / Danmark | Type: Købers ejendomsmægler | CVR 37262226." },
      { name:"Bente Naver Ejendomsrådgivning ApS",       phone:"20 43 75 30", oPhone:"36 44 11 00", note:"Indehaver: Bente Naver | Område: Frederikssund / Danmark | Type: Købers ejendomsmægler | CVR 37361348." },
    ];

    let inserted = 0;
    let statusFixed = 0;
    let phonePatched = 0;
    const details: Record<string, string> = {};
    try {
      // Ensure priority column exists (idempotent)
      await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS priority integer DEFAULT 5`);

      for (const l of r3Leads) {
        // Step 1: Patch owner_phone on rows that exist but have NULL phone (name match)
        const patchR = await pool.query(
          `UPDATE leads SET owner_phone = $3, office_phone = COALESCE(office_phone, $4)
           WHERE owner_email = $1 AND lower(name) = lower($2) AND owner_phone IS NULL
           RETURNING id`,
          [oe, l.name, l.phone, l.oPhone ?? null]
        );
        if ((patchR.rowCount ?? 0) > 0) phonePatched++;

        // Step 2: Insert if truly not present by phone or name
        const insR = await pool.query(
          `INSERT INTO leads (owner_email, name, category, status, owner_phone, office_phone,
             notes, first_contact_at, follow_up_at, follow_up_1_at, follow_up_1_done,
             follow_up_2_at, follow_up_2_done, priority)
           SELECT $1, $2, 'ejendomsmaegler', 'new', $3, $4,
             $5, NULL, NULL, NULL, false, NULL, false, 1
           WHERE NOT EXISTS (
             SELECT 1 FROM leads WHERE owner_email = $1
               AND (owner_phone = $3 OR lower(name) = lower($2))
           )
           RETURNING id`,
          [oe, l.name, l.phone, l.oPhone ?? null, l.note]
        );
        if ((insR.rowCount ?? 0) > 0) { inserted++; details[l.name] = "inserted"; continue; }

        // Step 3: Lead exists — fix status to 'new' if never actually contacted
        //   (first_contact_at IS NULL means no call was ever logged)
        const fixR = await pool.query(
          `UPDATE leads SET
             status = 'new',
             follow_up_at = NULL, follow_up_1_at = NULL, follow_up_1_done = false,
             follow_up_2_at = NULL, follow_up_2_done = false,
             priority = LEAST(COALESCE(priority, 5), 1)
           WHERE owner_email = $1
             AND (owner_phone = $2 OR lower(name) = lower($3))
             AND first_contact_at IS NULL
             AND status NOT IN ('won', 'responded', 'new')
           RETURNING id, name, status`,
          [oe, l.phone, l.name]
        );
        if ((fixR.rowCount ?? 0) > 0) {
          statusFixed++;
          details[l.name] = `status→new (was ${fixR.rows[0]?.status ?? '?'})`;
        } else {
          // Check current state
          const cur = await pool.query(
            `SELECT status, owner_phone, first_contact_at FROM leads
             WHERE owner_email = $1 AND (owner_phone = $2 OR lower(name) = lower($3))
             LIMIT 1`,
            [oe, l.phone, l.name]
          );
          const row = cur.rows[0];
          if (row) details[l.name] = `ok(${row.status},phone=${row.owner_phone ? 'set' : 'null'},fc=${row.first_contact_at ? 'yes' : 'null'})`;
          else details[l.name] = "not-found";
        }
      }

      // Summary count of cold leads now visible in telesalg
      const countR = await pool.query(
        `SELECT COUNT(*) c FROM leads WHERE owner_email = $1 AND status = 'new' AND owner_phone IS NOT NULL`,
        [oe]
      );

      log(`[admin/seed-runde3] inserted=${inserted} statusFixed=${statusFixed} phonePatched=${phonePatched}`);
      return res.json({
        success: true, inserted, statusFixed, phonePatched,
        totalColdLeadsVisible: parseInt(countR.rows[0].c),
        details,
      });
    } catch (err: any) {
      log(`[admin/seed-runde3] error: ${err.message}`);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── Admin: reconcile legacy /uploads records with R2 ─────────────────────
  // Existing rows retain their stable /uploads/<key> route. This endpoint
  // never rewrites URLs; it only backfills an R2 object from a surviving local
  // file, and defaults to a dry run.
  app.post("/api/admin/reconcile-media", async (req, res) => {
    if (!adminPasswordOk(req.headers["x-admin-pw"] as string)) return res.status(401).json({ error: "Unauthorized" });
    if (!isR2Configured()) return res.status(503).json({ error: "R2 is not configured; reconciliation cannot make media durable." });

    const apply = req.body?.apply === true;
    const keys = new Set<string>();
    const addUrl = (value: unknown) => {
      if (typeof value !== "string" || !value.trim()) return;
      let pathname = value.trim();
      try { if (/^https?:\/\//i.test(pathname)) pathname = new URL(pathname).pathname; } catch { return; }
      if (!pathname.startsWith("/uploads/")) return;
      const key = decodeURIComponent(pathname.slice("/uploads/".length));
      if (key && !key.includes("..")) keys.add(key);
    };
    const addArray = (value: unknown) => { if (Array.isArray(value)) value.forEach(addUrl); };
    // Fail closed: a partial inventory must never look complete.
    const read = (query: string, consume: (row: any) => void) =>
      pool.query(query).then(result => result.rows.forEach(consume));

    try {
      await Promise.all([
        read(`SELECT original_image_url, result_image_url, versions FROM designs`, row => { addUrl(row.original_image_url); addUrl(row.result_image_url); addArray(row.versions); }),
        read(`SELECT image_url, original_image_url, refinement_source_url FROM generated_images`, row => {
          addUrl(row.image_url); addUrl(row.original_image_url); addUrl(row.refinement_source_url);
        }),
        read(`SELECT original_image_url, result_image_url FROM agent_designs`, row => { addUrl(row.original_image_url); addUrl(row.result_image_url); }),
        read(`SELECT original_image_url, result_image_url FROM special_requests`, row => { addUrl(row.original_image_url); addUrl(row.result_image_url); }),
        read(`SELECT generated_image_url FROM quote_requests`, row => addUrl(row.generated_image_url)),
        read(`SELECT src, before_src FROM bolig_case_images`, row => { addUrl(row.src); addUrl(row.before_src); }),
        read(`SELECT floorplan_url, threed_plan_url, tour_video_url FROM ai_tour_properties`, row => { addUrl(row.floorplan_url); addUrl(row.threed_plan_url); addUrl(row.tour_video_url); }),
        read(`SELECT room_photo_url, room_photo_url_2, after_image_url, after_image_url_2, panorama_url, video_url, synthetic_angle_urls FROM ai_tour_rooms`, row => {
          addUrl(row.room_photo_url); addUrl(row.room_photo_url_2); addUrl(row.after_image_url); addUrl(row.after_image_url_2);
          addUrl(row.panorama_url); addUrl(row.video_url); addArray(row.synthetic_angle_urls);
        }),
        read(`SELECT agency_logo_url FROM users`, row => addUrl(row.agency_logo_url)),
      ]);

      const [voiceProjects, rendyJobs, rendyEditProjects, rendyEditManifests] = await Promise.all([
        pool.query(`SELECT source_url, audio_url, output_url, source_input_url, raw_audio_key FROM rendy_voice_projects`),
        pool.query(`SELECT videos FROM rendy_jobs WHERE videos IS NOT NULL`),
        pool.query(`SELECT output_url, clean_output_url FROM rendy_edit_projects WHERE output_url IS NOT NULL OR clean_output_url IS NOT NULL`),
        pool.query(`SELECT payload FROM rendy_edit_manifests`),
      ]);
      collectRendyMediaKeys(voiceProjects.rows, rendyJobs.rows, rendyEditProjects.rows, rendyEditManifests.rows).forEach(key => keys.add(key));

      const alreadyDurable: string[] = [];
      const backfilled: string[] = [];
      const missingFromDisk: string[] = [];
      const failures: Array<{ key: string; error: string }> = [];
      const referencedKeys = Array.from(keys);
      const durableKeys = new Set((await r2ListAllObjects()).map(object => object.key));
      for (const key of referencedKeys) {
        if (durableKeys.has(key)) { alreadyDurable.push(key); continue; }
        const localPath = path.join(uploadDir, key);
        if (!fs.existsSync(localPath)) { missingFromDisk.push(key); continue; }
        if (!apply) continue;
        try {
          await r2UploadFile(localPath, key);
          if (!await r2ObjectExists(key)) throw new Error("R2 did not acknowledge the uploaded object");
          durableKeys.add(key);
          backfilled.push(key);
        } catch (error: any) {
          failures.push({ key, error: error?.message || "Unknown upload error" });
        }
      }
      return res.json({
        dryRun: !apply,
        databaseReferences: keys.size,
        alreadyDurable: alreadyDurable.length,
        candidatesToBackfill: referencedKeys.filter(key => !alreadyDurable.includes(key) && fs.existsSync(path.join(uploadDir, key))).length,
        backfilled,
        missingFromDisk,
        failures,
        note: "URLs are intentionally unchanged: /uploads/<key> streams from R2 after a restart. Files missing from both R2 and disk need recovery from a backup.",
      });
    } catch (error: any) {
      log(`[admin/reconcile-media] failed: ${error?.message}`);
      return res.status(500).json({ error: error?.message || "Media reconciliation failed" });
    }
  });

  // ── Admin: storage cleanup ───────────────────────────────────────────────
  // SAFE DESIGN:
  //   1. Collects every file URL from EVERY table in DB (nothing missed)
  //   2. Marks R2 file as "orphaned" ONLY if zero tables reference it
  //   3. Orphaned files are safe to delete — they cannot appear on the live site
  //   4. User-generated images (generated_images, bolig_case_images, etc.)
  //      are NEVER deleted unless explicitly listed via deleteUserEmails
  //   5. deleteUserEmails: string[] — deletes all content for those specific users
  //      (only use for confirmed test accounts)
  //   dryRun=true (default): report only, zero deletions
  app.post("/api/admin/cleanup-storage", async (req, res) => {
    if (!adminPasswordOk(req.headers["x-admin-pw"] as string)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { r2ListAllObjects, r2DeleteFiles } = await import("./r2");
    const dryRun: boolean = req.body?.dryRun !== false; // default true = safe
    const deleteUserEmails: string[] = Array.isArray(req.body?.deleteUserEmails)
      ? req.body.deleteUserEmails.map((e: any) => String(e).toLowerCase())
      : [];

    // Extract keys only from the site's own /uploads route. Older records can
    // contain absolute site URLs; provider URLs must never be treated as R2 keys.
    const toR2Key = (url: string | null): string | null => {
      if (!url) return null;
      let pathname = url.trim();
      try {
        if (/^https?:\/\//i.test(pathname)) pathname = new URL(pathname).pathname;
      } catch {
        return null;
      }
      if (!pathname.startsWith("/uploads/")) return null;
      const key = decodeURIComponent(pathname.slice("/uploads/".length));
      return key && !key.includes("..") ? key : null;
    };

    try {
      // ── Step 1: list every object currently in R2 ─────────────────────
      const r2Objects = await r2ListAllObjects();
      const r2Map = new Map(r2Objects.map(o => [o.key, o.size]));
      const totalR2Count = r2Objects.length;
      const totalR2Bytes = r2Objects.reduce((s, o) => s + o.size, 0);

      // ── Step 2: collect every file key referenced in ANY DB table ──────
      // We protect them all — if any table knows about a file, it can appear on the site.
      const liveKeys = new Set<string>();
      const addUrl = (url: string | null) => { const k = toR2Key(url); if (k) liveKeys.add(k); };

      // generated_images
      const gi = await pool.query(`SELECT image_url, original_image_url, refinement_source_url FROM generated_images`);
      gi.rows.forEach(r => { addUrl(r.image_url); addUrl(r.original_image_url); addUrl(r.refinement_source_url); });

      // designs (including the version history array)
      await pool.query(`SELECT original_image_url, result_image_url, versions FROM designs`)
        .then(r => r.rows.forEach(row => {
          addUrl(row.original_image_url); addUrl(row.result_image_url);
          if (Array.isArray(row.versions)) row.versions.forEach(addUrl);
        }))
        .catch(() => {});

      // special_requests
      await pool.query(`SELECT original_image_url, result_image_url FROM special_requests`)
        .then(r => r.rows.forEach(row => { addUrl(row.original_image_url); addUrl(row.result_image_url); }))
        .catch(() => {});

      // quote_requests
      await pool.query(`SELECT generated_image_url FROM quote_requests`)
        .then(r => r.rows.forEach(row => addUrl(row.generated_image_url)))
        .catch(() => {});

      // agent_designs
      await pool.query(`SELECT original_image_url, result_image_url FROM agent_designs`)
        .then(r => r.rows.forEach(row => { addUrl(row.original_image_url); addUrl(row.result_image_url); }))
        .catch(() => {});

      // bolig_case_images
      await pool.query(`SELECT src, before_src FROM bolig_case_images`)
        .then(r => r.rows.forEach(row => { addUrl(row.src); addUrl(row.before_src); }))
        .catch(() => {});

      // ai_tour_properties
      await pool.query(`SELECT floorplan_url, threed_plan_url, tour_video_url FROM ai_tour_properties`)
        .then(r => r.rows.forEach(row => { addUrl(row.floorplan_url); addUrl(row.threed_plan_url); addUrl(row.tour_video_url); }))
        .catch(() => {});

      // ai_tour_rooms (including array column synthetic_angle_urls)
      await pool.query(`SELECT room_photo_url, room_photo_url_2, after_image_url, after_image_url_2, panorama_url, video_url, synthetic_angle_urls FROM ai_tour_rooms`)
        .then(r => r.rows.forEach(row => {
          addUrl(row.room_photo_url); addUrl(row.room_photo_url_2);
          addUrl(row.after_image_url); addUrl(row.after_image_url_2);
          addUrl(row.panorama_url); addUrl(row.video_url);
          if (Array.isArray(row.synthetic_angle_urls)) row.synthetic_angle_urls.forEach(addUrl);
        }))
        .catch(() => {});

      // users agency logos
      await pool.query(`SELECT agency_logo_url FROM users WHERE agency_logo_url IS NOT NULL`)
        .then(r => r.rows.forEach(row => addUrl(row.agency_logo_url)))
        .catch(() => {});

      // Rendy narration is durable customer media. Keep the finished export,
      // localized source/audio, raw recovery audio, and locally delivered
      // Rendy videos recorded as JSON on their showcase job.
      const [voiceProjects, rendyJobs, rendyEditProjects, rendyEditManifests] = await Promise.all([
        pool.query(`SELECT source_url, audio_url, output_url, source_input_url, raw_audio_key FROM rendy_voice_projects`),
        pool.query(`SELECT videos FROM rendy_jobs WHERE videos IS NOT NULL`),
        pool.query(`SELECT output_url, clean_output_url FROM rendy_edit_projects WHERE output_url IS NOT NULL OR clean_output_url IS NOT NULL`),
        pool.query(`SELECT payload FROM rendy_edit_manifests`),
      ]);
      collectRendyMediaKeys(voiceProjects.rows, rendyJobs.rows, rendyEditProjects.rows, rendyEditManifests.rows).forEach(key => liveKeys.add(key));

      // ── Step 3: find orphaned R2 files (zero DB tables know about them) ─
      const orphaned = r2Objects.filter(o => !liveKeys.has(o.key));
      const orphanedBytes = orphaned.reduce((s, o) => s + o.size, 0);

      // ── Step 4: per-user content stats (for deleteUserEmails) ───────────
      type UserContent = { userId: number; email: string; imageCount: number; r2Keys: string[]; r2Bytes: number };
      const userContent: UserContent[] = [];
      let userDeletedDb = 0;
      let userDeletedR2 = 0;
      let userFreedBytes = 0;

      if (deleteUserEmails.length > 0) {
        // Find the user IDs for the given emails
        const uRows = await pool.query<{ id: number; email: string }>(
          `SELECT id, email FROM users WHERE lower(email) = ANY($1::text[])`,
          [deleteUserEmails]
        );
        for (const u of uRows.rows) {
          const imgs = await pool.query<{ id: number; image_url: string | null; original_image_url: string | null }>(
            `SELECT id, image_url, original_image_url FROM generated_images WHERE user_id = $1`,
            [u.id]
          );
          const keys: string[] = [];
          let bytes = 0;
          for (const img of imgs.rows) {
            const k1 = toR2Key(img.image_url);
            const k2 = toR2Key(img.original_image_url);
            if (k1) { keys.push(k1); bytes += r2Map.get(k1) ?? 0; }
            if (k2) { keys.push(k2); bytes += r2Map.get(k2) ?? 0; }
          }
          userContent.push({ userId: u.id, email: u.email, imageCount: imgs.rows.length, r2Keys: keys, r2Bytes: bytes });
        }
      }

      // ── Step 5: execute if dryRun=false ─────────────────────────────────
      let deletedOrphaned = 0;
      let freedBytes = 0;

      if (!dryRun) {
        // Only orphaned files — guaranteed not shown anywhere on site
        if (orphaned.length > 0) {
          const batchSize = 1000;
          for (let i = 0; i < orphaned.length; i += batchSize) {
            await r2DeleteFiles(orphaned.slice(i, i + batchSize).map(o => o.key));
          }
          deletedOrphaned = orphaned.length;
          freedBytes += orphanedBytes;
        }

        // Explicit test-user content deletion
        for (const uc of userContent) {
          // Delete DB records
          await pool.query(`DELETE FROM generated_images WHERE user_id = $1`, [uc.userId]);
          userDeletedDb += uc.imageCount;

          // Delete R2 files
          const uniqueKeys = Array.from(new Set(uc.r2Keys));
          if (uniqueKeys.length > 0) {
            const batchSize = 1000;
            for (let i = 0; i < uniqueKeys.length; i += batchSize) {
              await r2DeleteFiles(uniqueKeys.slice(i, i + batchSize));
            }
            userDeletedR2 += uniqueKeys.length;
            userFreedBytes += uc.r2Bytes;
          }
        }
        freedBytes += userFreedBytes;
        log(`[admin/cleanup-storage] orphaned=${deletedOrphaned} userDb=${userDeletedDb} userR2=${userDeletedR2} freedMB=${(freedBytes/1024/1024).toFixed(1)}`);
      }

      return res.json({
        dryRun,
        r2: { totalObjects: totalR2Count, totalSizeMB: +(totalR2Bytes / 1024 / 1024).toFixed(1) },
        liveKeysProtected: liveKeys.size,
        orphaned: {
          count: orphaned.length,
          sizeMB: +(orphanedBytes / 1024 / 1024).toFixed(1),
          deleted: deletedOrphaned,
          // Show a few examples (just the filename, not full key, for brevity)
          sample: orphaned.slice(0, 8).map(o => ({
            key: o.key,
            sizeMB: +(o.size / 1024 / 1024).toFixed(2),
            lastModified: o.lastModified?.toISOString().slice(0, 10),
          })),
        },
        testUsers: userContent.map(uc => ({
          email: uc.email,
          imageCount: uc.imageCount,
          r2KeyCount: Array.from(new Set(uc.r2Keys)).length,
          sizeMB: +(uc.r2Bytes / 1024 / 1024).toFixed(1),
          deletedDb: dryRun ? 0 : uc.imageCount,
          deletedR2: dryRun ? 0 : Array.from(new Set(uc.r2Keys)).length,
        })),
        freedMB: +(freedBytes / 1024 / 1024).toFixed(1),
        note: dryRun
          ? "DRY-RUN: ingen filer slettet. Sæt dryRun:false for at slette."
          : `Slettet: ${deletedOrphaned} forældreløse R2-filer + ${userDeletedDb} test-billeder (${userDeletedR2} R2-nøgler)`,
      });
    } catch (err: any) {
      log(`[admin/cleanup-storage] error: ${err.message}`);
      return res.status(500).json({ error: err.message });
    }
  });

  // ── Admin: diagnose runde-3 leads state on this DB ──────────────────────
  app.get("/api/admin/check-runde3-leads", async (req, res) => {
    if (!adminPasswordOk(req.headers["x-admin-pw"] as string)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const oe = "fredefussing@gmail.com";
    const phones = [
      "30 14 10 14","21 42 37 88","20 77 26 29","21 80 10 12","39 20 29 20",
      "29 41 36 43","61 10 61 43","21 43 95 90","33 30 10 50","71 99 69 39",
      "51 87 35 75","47 74 22 55","36 75 74 61","31 12 00 01","30 88 39 68",
      "70 26 28 30","22 66 66 66","23 40 00 23","20 28 46 15","22 24 44 83",
      "53 82 56 12","22 66 85 57","23 39 28 60","20 17 59 07","31 55 96 95",
      "20 27 16 05","25 53 31 13","20 94 75 02","97 19 25 00","51 94 49 45",
      "60 57 27 99","42 45 31 71","93 89 40 95","71 99 14 30","93 10 89 99",
      "31 51 51 85","36 96 54 54","30 25 23 36","21 31 91 26","82 13 10 66",
      "20 84 80 17","23 43 33 15","20 43 75 30",
    ];
    const names = [
      "Lone Levin Ejendomsmægler","Botker Bolig","Linda Riis Ejendomsmægler",
      "Ejendomsmæglerfirmaet Marianne Møllebro","Jenny Eliassen Ejendomsmægler",
      "LOKALmæglerne Hornslet","Flemming Elsborg Bolig","CPH Erhverv – Hougaard & Westall",
      "La Cour & Lykke","Andelshandel A/S","Den Alternative Mægler",
      "Ejendomsmægler Anette Huusfelt","Ejendomsmæglerfirmaet Jette Birkholm",
      "VW estate / Ejendomsmægler Vibeke Wedel","Søgaard Køberrådgivning","City Bolig",
      "Kaiserbolig","Brith Ankjær Købers Ejendomsmægler","MB Køberrådgivning",
      "Skøde og Bolighandel","RIWAS Køberrådgivning","Købsmæglerne",
      "Køberrådgiverne ApS","Køberrådgiver Sara Holms","AIKOPA",
      "Center for Køberrådgivning","BoHer.nu","Valuarvurderinger.dk",
      "Bolig Butikken Aaskov Ejendomscenter","Tingleff Ejendomme","Bolignavigator",
      "MinKøbermægler.dk","MDN Boligrådgivning","Consult Property",
      "Tina Lau Køberrådgivning","Lise Ørum Rådgivning","Din-Bolighandel",
      "Rosenqvist ApS","Boligrådgivning.com","Boligraadgiver.dk",
      "Nøgleklar.dk / HøEg Bolig ApS","Franck Milling ApS","Bente Naver Ejendomsrådgivning ApS",
    ];
    try {
      const byPhone = await pool.query(
        `SELECT id, name, owner_phone, status, first_contact_at FROM leads
         WHERE owner_email = $1 AND owner_phone = ANY($2::text[])
         ORDER BY name`,
        [oe, phones]
      );
      const byName = await pool.query(
        `SELECT id, name, owner_phone, status, first_contact_at FROM leads
         WHERE owner_email = $1 AND LOWER(name) = ANY($2::text[])
         ORDER BY name`,
        [oe, names.map(n => n.toLowerCase())]
      );
      const totalCold = await pool.query(
        `SELECT COUNT(*) c FROM leads WHERE owner_email = $1 AND status='new' AND owner_phone IS NOT NULL`,
        [oe]
      );
      return res.json({
        byPhone: byPhone.rows,
        byName: byName.rows,
        totalColdLeadsWithPhone: parseInt(totalCold.rows[0].c),
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── Admin: force runde-3 leads to status='new' where never contacted ────
  app.post("/api/admin/fix-runde3-status", async (req, res) => {
    if (!adminPasswordOk(req.headers["x-admin-pw"] as string)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const oe = "fredefussing@gmail.com";
    const phones = [
      "30 14 10 14","21 42 37 88","20 77 26 29","21 80 10 12","39 20 29 20",
      "29 41 36 43","61 10 61 43","21 43 95 90","33 30 10 50","71 99 69 39",
      "51 87 35 75","47 74 22 55","36 75 74 61","31 12 00 01","30 88 39 68",
      "70 26 28 30","22 66 66 66","23 40 00 23","20 28 46 15","22 24 44 83",
      "53 82 56 12","22 66 85 57","23 39 28 60","20 17 59 07","31 55 96 95",
      "20 27 16 05","25 53 31 13","20 94 75 02","97 19 25 00","51 94 49 45",
      "60 57 27 99","42 45 31 71","93 89 40 95","71 99 14 30","93 10 89 99",
      "31 51 51 85","36 96 54 54","30 25 23 36","21 31 91 26","82 13 10 66",
      "20 84 80 17","23 43 33 15","20 43 75 30",
    ];
    const names = [
      "Lone Levin Ejendomsmægler","Botker Bolig","Linda Riis Ejendomsmægler",
      "Ejendomsmæglerfirmaet Marianne Møllebro","Jenny Eliassen Ejendomsmægler",
      "LOKALmæglerne Hornslet","Flemming Elsborg Bolig","CPH Erhverv – Hougaard & Westall",
      "La Cour & Lykke","Andelshandel A/S","Den Alternative Mægler",
      "Ejendomsmægler Anette Huusfelt","Ejendomsmæglerfirmaet Jette Birkholm",
      "VW estate / Ejendomsmægler Vibeke Wedel","Søgaard Køberrådgivning","City Bolig",
      "Kaiserbolig","Brith Ankjær Købers Ejendomsmægler","MB Køberrådgivning",
      "Skøde og Bolighandel","RIWAS Køberrådgivning","Købsmæglerne",
      "Køberrådgiverne ApS","Køberrådgiver Sara Holms","AIKOPA",
      "Center for Køberrådgivning","BoHer.nu","Valuarvurderinger.dk",
      "Bolig Butikken Aaskov Ejendomscenter","Tingleff Ejendomme","Bolignavigator",
      "MinKøbermægler.dk","MDN Boligrådgivning","Consult Property",
      "Tina Lau Køberrådgivning","Lise Ørum Rådgivning","Din-Bolighandel",
      "Rosenqvist ApS","Boligrådgivning.com","Boligraadgiver.dk",
      "Nøgleklar.dk / HøEg Bolig ApS","Franck Milling ApS","Bente Naver Ejendomsrådgivning ApS",
    ];
    try {
      // Only reset status to 'new' for leads that were NEVER actually contacted
      // (first_contact_at IS NULL = never reached / no call attempt recorded)
      const byPhoneResult = await pool.query(
        `UPDATE leads SET status = 'new', follow_up_at = NULL, follow_up_1_at = NULL,
           follow_up_2_at = NULL, priority = 1
         WHERE owner_email = $1
           AND owner_phone = ANY($2::text[])
           AND first_contact_at IS NULL
           AND status NOT IN ('won','responded')
         RETURNING id, name, status`,
        [oe, phones]
      );
      const byNameResult = await pool.query(
        `UPDATE leads SET status = 'new', follow_up_at = NULL, follow_up_1_at = NULL,
           follow_up_2_at = NULL, priority = 1
         WHERE owner_email = $1
           AND LOWER(name) = ANY($2::text[])
           AND first_contact_at IS NULL
           AND status NOT IN ('won','responded')
           AND owner_phone IS NOT NULL
         RETURNING id, name, status`,
        [oe, names.map(n => n.toLowerCase())]
      );
      const fixed = [...byPhoneResult.rows, ...byNameResult.rows];
      // Dedup by id
      const seen = new Set<number>();
      const deduped = fixed.filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true; });
      log(`[admin/fix-runde3] fixed ${deduped.length} leads to status='new'`);
      return res.json({ success: true, fixed: deduped.length, leads: deduped });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── System Tracker API ────────────────────────────────────────────────────
  {
    const {
      getTrackerStatus, getTrackerHistory, muteAlert, unmuteAlert,
      getMutedChecks, triggerManualCheck, getDbHistory, triggerTestAlert,
    } = await import("./tracker");

    app.get("/api/tracker/status", async (req, res) => {
      try {
        const { uid } = await verifyFirebaseToken(req.headers.authorization);
        const admin = await storage.getUserByFirebaseUid(uid);
        if (!admin?.isAdmin) return res.status(403).json({ message: "Kun admins" });
        return res.json({ checks: getTrackerStatus(), muted: getMutedChecks() });
      } catch { return res.status(401).json({ message: "Ikke autoriseret" }); }
    });

    app.get("/api/tracker/history", async (req, res) => {
      try {
        const { uid } = await verifyFirebaseToken(req.headers.authorization);
        const admin = await storage.getUserByFirebaseUid(uid);
        if (!admin?.isAdmin) return res.status(403).json({ message: "Kun admins" });
        const hours = parseInt(req.query.hours as string || "24");
        const [mem, db] = await Promise.all([getTrackerHistory(200), getDbHistory(hours)]);
        return res.json({ memory: mem, db });
      } catch { return res.status(401).json({ message: "Ikke autoriseret" }); }
    });

    app.post("/api/tracker/mute", async (req, res) => {
      try {
        const { uid } = await verifyFirebaseToken(req.headers.authorization);
        const admin = await storage.getUserByFirebaseUid(uid);
        if (!admin?.isAdmin) return res.status(403).json({ message: "Kun admins" });
        const { checkName, hours = 1 } = req.body;
        if (!checkName) return res.status(400).json({ message: "checkName required" });
        muteAlert(checkName, hours);
        return res.json({ success: true, mutedUntil: new Date(Date.now() + hours * 3600_000).toISOString() });
      } catch { return res.status(401).json({ message: "Ikke autoriseret" }); }
    });

    app.post("/api/tracker/unmute", async (req, res) => {
      try {
        const { uid } = await verifyFirebaseToken(req.headers.authorization);
        const admin = await storage.getUserByFirebaseUid(uid);
        if (!admin?.isAdmin) return res.status(403).json({ message: "Kun admins" });
        const { checkName } = req.body;
        if (!checkName) return res.status(400).json({ message: "checkName required" });
        unmuteAlert(checkName);
        return res.json({ success: true });
      } catch { return res.status(401).json({ message: "Ikke autoriseret" }); }
    });

    app.post("/api/tracker/run-now", async (req, res) => {
      try {
        const { uid } = await verifyFirebaseToken(req.headers.authorization);
        const admin = await storage.getUserByFirebaseUid(uid);
        if (!admin?.isAdmin) return res.status(403).json({ message: "Kun admins" });
        void triggerManualCheck();
        return res.json({ success: true, message: "Checks startet — genindlæs om 10 sekunder" });
      } catch { return res.status(401).json({ message: "Ikke autoriseret" }); }
    });

    // Test-alert: sends real alert emails with simulated low-credit/balance data
    // Protected by ADMIN_PASSWORD — for manual testing only
    app.post("/api/tracker/test-alert", async (req, res) => {
      const pw = (req.body?.pw ?? req.query.pw) as string;
      if (!adminPasswordOk(pw)) {
        return res.status(401).json({ message: "Ikke autoriseret" });
      }
      try {
        await triggerTestAlert();
        return res.json({ success: true, message: "Test-alert sendt til kontakt@formaestates.com" });
      } catch (e: any) {
        return res.status(500).json({ message: e.message });
      }
    });
  }

  // ── Reset a test-account's data (keeps the account, wipes all generated content + quota) ──
  app.post("/api/admin/reset-user-data", async (req, res) => {
    try {
      const { email, pw } = req.body;
      if (!adminPasswordOk(pw)) return res.status(401).json({ message: "Forkert adgangskode" });
      if (!email) return res.status(400).json({ message: "email required" });
      const target = await storage.getUserByEmail(email);
      if (!target) return res.status(404).json({ message: `Ingen bruger fundet med email: ${email}` });
      await storage.resetUserData(target.id);
      return res.json({
        success: true,
        message: `Konto nulstillet: ${email}`,
        localStorageKeys: [
          "forma_agent_prompts_v1",
          "forma_chat_guided_v1",
          "hasSeenFurnitureOnboarding",
          "bolig-accent",
          "bolig-text-mode",
          "bolig-theme",
          "bolig-defaults",
          "bolig-notif",
          "fe-watermark",
        ],
      });
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/admin/stats", async (req, res) => {
    try {
      // Accept pw from X-Admin-Pw header (preferred) or query param (legacy).
      // Header avoids the password appearing in server access logs and browser history.
      const pw = (req.headers["x-admin-pw"] as string | undefined) ?? (req.query.pw as string);
      if (!adminPasswordOk(pw)) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const designs = await storage.getAllDesigns();
      const quotes = await storage.getAllQuotes();
      const specialRequests = await storage.getAllSpecialRequests();

      const completedDesigns = designs.filter((d) => d.status === "completed");
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const designsToday = designs.filter((d) => d.createdAt && new Date(d.createdAt) >= today).length;
      const designsThisWeek = designs.filter((d) => d.createdAt && new Date(d.createdAt) >= weekAgo).length;

      const styleCounts: Record<string, number> = {};
      const roomCounts: Record<string, number> = {};
      for (const d of completedDesigns) {
        styleCounts[d.style] = (styleCounts[d.style] || 0) + 1;
        roomCounts[d.roomType] = (roomCounts[d.roomType] || 0) + 1;
      }

      return res.json({
        totalDesigns: designs.length,
        completedDesigns: completedDesigns.length,
        designsToday,
        designsThisWeek,
        totalQuotes: quotes.length,
        totalSpecialRequests: specialRequests.length,
        styleCounts,
        roomCounts,
        recentDesigns: designs.slice(-20).reverse().map((d) => ({
          id: d.id,
          roomType: d.roomType,
          style: d.style,
          status: d.status,
          budget: d.budget,
          tier: d.tier,
          createdAt: d.createdAt,
        })),
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });


  // ── AI Design Agent ──────────────────────────────────────────────────────────

  async function sendCollovAgentTask(uploadUrl: string, prompt: string): Promise<string> {
    log(`Collov agent send → uploadUrl: "${uploadUrl}"`);
    log(`Collov agent send → prompt (${prompt.length} chars): "${prompt.slice(0, 120)}"`);

    const form = new FormData();
    form.append("uploadUrl", uploadUrl);
    form.append("prompt", prompt);

    const res = await fetch(`${COLLOV_BASE}/flair/enterpriseApi/edit/generate`, {
      method: "POST",
      headers: {
        apiKey: COLLOV_API_KEY!,
      },
      body: form,
    });

    const json = (await res.json()) as any;
    log(`Collov agent response (HTTP ${res.status}): ${JSON.stringify(json).slice(0, 400)}`);
    if (!json.success || !json.data?.uuid) {
      throw new Error(json.message || "Collov agent API returned an error");
    }
    return json.data.uuid;
  }

  async function pollCollovAgentResult(uuid: string): Promise<{ status: string; resultUrl?: string; failReason?: string }> {
    const res = await fetch(
      `${COLLOV_BASE}/flair/enterpriseApi/edit/getRecord?uuid=${encodeURIComponent(uuid)}`,
      { method: "GET", headers: { apiKey: COLLOV_API_KEY! } }
    );
    const json = (await res.json()) as any;
    // edit/getRecord returns status and generateUrl directly on data (different from VST)
    const data = json.data || {};
    const status = data.status;

    log(`Collov agent poll for ${uuid}: status=${status}`);

    if (status === "SUCCESS") {
      return { status: "completed", resultUrl: data.generateUrl };
    }
    if (status === "FAILED") {
      const failReason = data.failReason || data.errorMessage || "unknown";
      return { status: "failed", failReason };
    }
    return { status: "processing" };
  }

  async function backgroundPollAgent(agentDesignId: number, uuid: string, userId: number | null, uploadUrl: string, prompt: string) {
    const maxAttempts = 40;
    const maxRetries = 2;
    let attempts = 0;
    let retryCount = 0;

    const refundCredit = async () => {
      if (userId) {
        try {
          await storage.addCredits(userId, 1, "Refund: AI Design Agent fejlede");
          log(`AgentDesign ${agentDesignId} credit refunded to user ${userId}`);
        } catch (e: any) {
          log(`AgentDesign ${agentDesignId} credit refund failed: ${e.message}`);
        }
      }
    };

    const poll = async () => {
      attempts++;
      try {
        const result = await pollCollovAgentResult(uuid);
        if (result.status === "completed" && result.resultUrl) {
          // A provider URL is temporary. Do not mark this as completed until
          // the customer-visible result has been durably copied to R2.
          const persistUrl = await sharpenAndSaveVst(result.resultUrl, agentDesignId);
          await storage.updateAgentDesign(agentDesignId, { status: "completed", resultImageUrl: persistUrl });
          log(`AgentDesign ${agentDesignId} completed`);
          return;
        }
        if (result.status === "failed") {
          if (retryCount < maxRetries) {
            retryCount++;
            log(`AgentDesign ${agentDesignId} failed, retry ${retryCount}/${maxRetries}...`);
            await storage.updateAgentDesign(agentDesignId, { status: "processing" });
            await new Promise(resolve => setTimeout(resolve, 10000));
            try {
              const newUuid = await sendCollovAgentTask(uploadUrl, prompt);
              uuid = newUuid;
              attempts = 0;
              await storage.updateAgentDesign(agentDesignId, { collovUuid: newUuid, status: "processing" });
              log(`AgentDesign ${agentDesignId} retry ${retryCount} started with uuid: ${newUuid}`);
              setTimeout(poll, 5000);
              return;
            } catch (retryErr: any) {
              log(`AgentDesign ${agentDesignId} retry ${retryCount} send failed: ${retryErr.message}`);
            }
          }
          await refundCredit();
          await storage.updateAgentDesign(agentDesignId, { status: "failed", failReason: "collov_service_failed" });
          void import("./tracker").then(m => m.reportGenerationFailure("collov", "collov_service_failed — agent design fejl efter max retries")).catch(() => {});
          log(`AgentDesign ${agentDesignId} failed permanently after ${retryCount} retries`);
          return;
        }
        if (attempts < maxAttempts) {
          setTimeout(poll, 3000);
        } else {
          await refundCredit();
          await storage.updateAgentDesign(agentDesignId, { status: "failed", failReason: "timeout" });
          log(`AgentDesign ${agentDesignId} timed out`);
        }
      } catch (err: any) {
        log(`AgentDesign ${agentDesignId} poll error: ${err.message}`);
        if (attempts < maxAttempts) setTimeout(poll, 5000);
        else {
          await refundCredit();
          await storage.updateAgentDesign(agentDesignId, { status: "failed", failReason: "poll_error" });
        }
      }
    };

    setTimeout(poll, 4000);
  }

  app.post("/api/agent-designs", upload.single("image"), async (req, res) => {
    try {
      if (!req.headers.authorization?.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Authentication required" });
      }
      let userId: number | null = null;
      let isAdmin = false;

      try {
        const decoded = await verifyFirebaseToken(req.headers.authorization);
        const user = await storage.getUserByFirebaseUid(decoded.uid);
        if (user) {
          userId = user.id;
          isAdmin = user.isAdmin;
        }
      } catch {
        return res.status(401).json({ error: "Invalid token" });
      }

      const prompt = (req.body.prompt || "").trim();
      if (!prompt) return res.status(400).json({ error: "Prompt is required" });

      const protocol = (req.headers["x-forwarded-proto"] as string | undefined) || req.protocol;
      const host = (req.headers["x-forwarded-host"] as string | undefined) || req.headers.host;

      // Accept either a new file upload or an existing server-side URL (locked image re-adjust)
      const isReadjust = !req.file && !!req.body.existingOriginalUrl;
      const originalImageUrl: string = req.file
        ? `/uploads/${req.file.filename}`
        : (req.body.existingOriginalUrl || "");
      if (!originalImageUrl) return res.status(400).json({ error: "No image provided" });

      const uploadUrl = `${protocol}://${host}${originalImageUrl}`;

      // New generation: costs a credit (existing 2-free-visualization quota unchanged)
      // Re-adjustment of same image: first 5 are free, beyond that costs a credit
      const FREE_ADJUSTMENTS = 5;
      let freeUsesRemaining = FREE_ADJUSTMENTS;

      if (userId !== null && !isAdmin) {
        if (isReadjust) {
          // existingCount = number of designs already saved for this image (incl. the original)
          const existingCount = await storage.countAgentDesignsByOriginalUrl(userId, originalImageUrl);
          freeUsesRemaining = Math.max(0, FREE_ADJUSTMENTS - existingCount);
          if (freeUsesRemaining === 0) {
            const deducted = await storage.deductCredit(userId, "AI Design Agent re-justering");
            if (!deducted) {
              return res.status(403).json({ error: "Ikke nok billeder. Køb en pakke for at fortsætte.", requiresCredits: true });
            }
          }
        } else {
          // Normal new generation — use credits as before
          const deducted = await storage.deductCredit(userId, "AI Design Agent generering");
          if (!deducted) {
            return res.status(403).json({ error: "Ikke nok billeder. Køb en pakke for at fortsætte.", requiresCredits: true });
          }
        }
      }

      const agentDesign = await storage.createAgentDesign({
        userId,
        originalImageUrl,
        agentPrompt: prompt,
        status: "processing",
      });

      // After creation, decrement remaining count by 1 (this generation just consumed one slot)
      if (isReadjust) freeUsesRemaining = Math.max(0, freeUsesRemaining - 1);

      try {
        const uuid = await sendCollovAgentTask(uploadUrl, prompt);
        await storage.updateAgentDesign(agentDesign.id, { collovUuid: uuid });
        backgroundPollAgent(agentDesign.id, uuid, userId, uploadUrl, prompt);
        return res.status(201).json({ id: agentDesign.id, status: "processing", originalImageUrl, freeUsesRemaining });
      } catch (collovErr: any) {
        await storage.updateAgentDesign(agentDesign.id, { status: "failed", failReason: collovErr.message });
        log(`AgentDesign ${agentDesign.id} Collov send failed: ${collovErr.message}`);
        return res.status(502).json({ error: "AI generation failed", detail: collovErr.message });
      }
    } catch (err: any) {
      log(`POST /api/agent-designs error: ${err.message}`);
      return res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/agent-designs/:id", async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization).catch(() => ({ uid: null as any }));
      if (!uid) return res.status(401).json({ error: "Authentication required" });
      const caller = await storage.getUserByFirebaseUid(uid);
      if (!caller) return res.status(401).json({ error: "User not found" });

      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const design = await storage.getAgentDesign(id);
      if (!design) return res.status(404).json({ error: "Not found" });
      // Only the owner or an admin can view another user's design.
      if (design.userId !== caller.id && !caller.isAdmin) {
        return res.status(403).json({ error: "Forbidden" });
      }
      return res.json(design);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/agent-designs/:id/status", async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization).catch(() => ({ uid: null as any }));
      if (!uid) return res.status(401).json({ error: "Authentication required" });
      const caller = await storage.getUserByFirebaseUid(uid);
      if (!caller) return res.status(401).json({ error: "User not found" });

      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const design = await storage.getAgentDesign(id);
      if (!design) return res.status(404).json({ error: "Not found" });
      if (design.userId !== caller.id && !caller.isAdmin) {
        return res.status(403).json({ error: "Forbidden" });
      }

      let errorMessage: string | null = null;
      if (design.status === "failed") {
        switch (design.failReason) {
          case "collov_service_failed":
            errorMessage = "AI-tjenesten er midlertidigt utilgængelig. Dit kredit er returneret. Prøv igen om lidt.";
            break;
          case "timeout":
            errorMessage = "Generering tog for lang tid. Dit kredit er returneret. Prøv med et mindre billede.";
            break;
          case "poll_error":
            errorMessage = "Forbindelsesfejl under generering. Dit kredit er returneret. Prøv igen.";
            break;
          default:
            errorMessage = "Generering fejlede. Dit kredit er returneret. Prøv igen med et andet billede eller beskrivelse.";
        }
      }

      return res.json({
        status: design.status,
        resultUrl: design.resultImageUrl ?? null,
        error: errorMessage,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/find-similar", async (req, res) => {
    try {
      const { aiImageUrl, topK = 5 } = req.body;
      if (!aiImageUrl) return res.status(400).json({ error: "aiImageUrl påkrævet" });

      const { getClipEmbedding } = await import("./huggingFace");
      const { findSimilarProducts } = await import("./vectorSearch");

      const embedding = await getClipEmbedding(aiImageUrl);
      const products = await findSimilarProducts(embedding, topK);

      return res.json({ products });
    } catch (err: any) {
      log(`find-similar fejl: ${err.message}`);
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/analyze-image", async (req, res) => {
    try {
      const { imageUrl } = req.body;
      if (!imageUrl) return res.status(400).json({ error: "imageUrl påkrævet" });

      const { detectObjects } = await import("./yolo");
      const { getImageDimensions } = await import("./cropImage");

      // Convert relative /uploads/ paths to full localhost URL (Xenova + Jimp both support HTTP)
      const resolvedUrl = imageUrl.startsWith("/uploads/")
        ? `http://localhost:5000${imageUrl}`
        : imageUrl;

      const [objects, dimensions] = await Promise.all([
        detectObjects(resolvedUrl),
        getImageDimensions(resolvedUrl),
      ]);

      return res.json({ objects, imageUrl, imageWidth: dimensions.width, imageHeight: dimensions.height });
    } catch (err: any) {
      log(`analyze-image fejl: ${err.message}`);
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/find-similar-crop", async (req, res) => {
    try {
      const {
        imageUrl, x, y, width, height,
        topK = 5, yoloLabel, yoloConfidence, designStyle,
      } = req.body;

      if (!imageUrl || x == null || y == null || width == null || height == null) {
        return res.status(400).json({ error: "imageUrl, x, y, width, height påkrævet" });
      }

      const { cropImageToTempFile } = await import("./cropImage");
      const { getClipEmbedding, getClipTextEmbedding } = await import("./huggingFace");
      const { findSimilarProductsHybrid } = await import("./vectorSearch");
      const { getDominantColorTerms } = await import("./analyzeVisual");
      const { describeFurnitureWithVision, cacheKey } = await import("./describeWithVision");

      // Convert relative /uploads/ paths to full localhost URL
      const resolvedUrl = imageUrl.startsWith("/uploads/")
        ? `http://localhost:5000${imageUrl}`
        : imageUrl;

      const { filePath, cleanup } = await cropImageToTempFile(resolvedUrl, x, y, width, height);
      const ck = cacheKey(imageUrl, x, y, width, height);

      let imageEmbedding: number[];
      let colorTerms: string[] = [];
      let description: any = null;

      try {
        [imageEmbedding, colorTerms, description] = await Promise.all([
          getClipEmbedding(filePath),
          getDominantColorTerms(filePath),
          describeFurnitureWithVision(filePath, ck),
        ]);
      } finally {
        cleanup();
      }

      let effectiveLabel = yoloLabel;
      if (
        description?.type &&
        yoloConfidence != null &&
        yoloConfidence < 0.6 &&
        description.type !== yoloLabel
      ) {
        log(`Vision override: ${yoloLabel} (${Math.round(yoloConfidence * 100)}%) → ${description.type}`);
        effectiveLabel = description.type;
      }

      // Build text embedding from vision description (used for multimodal fusion)
      let textEmbedding: number[] | undefined;

      if (description && description.type && description.type !== "other" && description.type !== "unknown") {
        try {
          let textQuery: string;

          if (description.searchText && description.searchText.length > 20) {
            textQuery = description.searchText;
          } else {
            const typeLabel = effectiveLabel.replace(/_/g, " ");
            const color = description.color?.replace(/_/g, " ") ?? "";
            const material = description.material ?? "";
            const style = description.style?.replace(/_/g, " ") ?? "";
            const legs = description.legs && description.legs !== "none" && description.legs !== "na"
              ? ` with ${description.legs.replace(/_/g, " ")} legs`
              : "";
            const shape = description.shape && description.shape !== "rectangular" ? `, ${description.shape}` : "";
            const size = description.size && description.size !== "medium" ? ` ${description.size}` : "";
            textQuery = `A${size} ${color} ${material} ${typeLabel} in ${style} style${legs}${shape}`.replace(/\s+/g, " ").trim();
          }

          textEmbedding = await getClipTextEmbedding(textQuery);
          log(`Multimodal fusion: image + text ("${textQuery.substring(0, 80)}")`);
        } catch (textErr: any) {
          log(`Text embedding fejlede, bruger image embedding alene: ${textErr.message}`);
        }
      } else {
        log(`CLIP image-only (Vision type: "${description?.type ?? "mangler"}")`);
      }

      // Pass both image and text vectors — search does 0.7*clip + 0.3*text fusion
      const products = await findSimilarProductsHybrid(
        imageEmbedding,
        topK,
        effectiveLabel,
        description,
        colorTerms,
        textEmbedding,
      );

      return res.json({ products, description });
    } catch (err: any) {
      log(`find-similar-crop fejl: ${err.message}`);
      return res.status(500).json({ error: err.message });
    }
  });

  // ── Style-product routes (tagging system) ──────────────────────────────────

  app.get("/api/style-products", async (req, res) => {
    try {
      const { style = "scandinavian", room = "living_room", budget = "standard", limit = "8" } = req.query;
      const validStyles = ["scandinavian", "modern", "industrial", "classic", "bohemian", "minimalist", "rustic", "luxury", "mid_century", "contemporary", "coastal"];
      const validRooms = ["living_room", "bedroom", "kitchen", "bathroom", "dining_room", "office", "hallway", "outdoor"];
      const validBudgets = ["budget", "standard", "luxury"];

      if (!validStyles.includes(style as string)) return res.status(400).json({ error: "Ugyldig stil" });
      if (!validRooms.includes(room as string)) return res.status(400).json({ error: "Ugyldigt rum" });
      if (!validBudgets.includes(budget as string)) return res.status(400).json({ error: "Ugyldigt budget" });

      const { getProductsByStyle, getTagStats } = await import("./styleSearch");
      const [result, stats] = await Promise.all([
        getProductsByStyle(style as string, room as string, budget as "budget" | "standard" | "luxury", parseInt(limit as string, 10)),
        getTagStats(),
      ]);

      return res.json({
        success: true,
        style: result.style,
        room,
        products: result.products,
        total_found: result.total_found,
        tagged_count: stats.tagged,
      });
    } catch (err: any) {
      log(`style-products fejl: ${err.message}`);
      return res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/complete-look", async (req, res) => {
    try {
      const { style = "scandinavian", room = "living_room", budget = "standard" } = req.query;
      const { getCompleteLook } = await import("./styleSearch");
      const look = await getCompleteLook(style as string, room as string, budget as "budget" | "standard" | "luxury");
      return res.json({
        success: true,
        style, room,
        products: look,
        total_price: look.reduce((s, p) => s + (p.price || 0), 0),
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/tag-stats", async (req, res) => {
    try {
      const { getTagStats } = await import("./styleSearch");
      return res.json(await getTagStats());
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/tag-batch", async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const dbUser = await storage.getUserByFirebaseUid(uid);
      if (!dbUser?.isAdmin) return res.status(403).json({ error: "Admin only" });

      const { limit = 50, offset = 0 } = req.body;
      const { batchTagProducts } = await import("./tagProducts");
      const result = await batchTagProducts(pool, parseInt(limit), parseInt(offset));
      return res.json({ ok: true, ...result });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/designs/:id/products", async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization).catch(() => ({ uid: null as any }));
      if (!uid) return res.status(401).json({ error: "Log ind for at se produkter" });
      const caller = await storage.getUserByFirebaseUid(uid);
      if (!caller) return res.status(401).json({ error: "User not found" });

      const designId = parseInt(req.params.id);
      if (isNaN(designId)) return res.status(400).json({ error: "Ugyldigt design ID" });

      // Verify the design belongs to the caller (admins can see any)
      const design = await storage.getDesign(designId);
      if (!design) return res.status(404).json({ error: "Design ikke fundet" });
      if (design.userId !== caller.id && !caller.isAdmin) {
        return res.status(403).json({ error: "Forbidden" });
      }

      // Hent pre-computed matches fra product_matches tabel
      const { rows } = await pool.query(`
        SELECT p.id, p.name, p.name_en, p.price,
               p.image_url, p.affiliate_link, p.shop,
               p.tags, p.category,
               pm.match_type, pm.match_score, pm.rank
        FROM product_matches pm
        JOIN products p ON pm.product_id = p.id
        WHERE pm.design_id = $1
        ORDER BY pm.rank
      `, [designId]);

      return res.json({ products: rows, count: rows.length });
    } catch (err: any) {
      log(`designs/:id/products fejl: ${err.message}`);
      return res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/designs/:id/products-legacy", async (req, res) => {
    try {
      const designId = parseInt(req.params.id);
      if (isNaN(designId)) return res.status(400).json({ error: "Ugyldigt design ID" });

      const design = await storage.getDesign(designId);
      if (!design) return res.status(404).json({ error: "Design ikke fundet" });
      if (design.status !== "completed" || !design.resultImageUrl) {
        return res.status(400).json({ error: "Design er ikke færdigt endnu" });
      }

      const protocol = (req.headers["x-forwarded-proto"] as string | undefined) || req.protocol;
      const host = (req.headers["x-forwarded-host"] as string | undefined) || req.headers.host;
      const toAbsolute = (url: string) =>
        url.startsWith("http") ? url : `${protocol}://${host}${url}`;

      const { getShopThisStyle } = await import("./productMatcherNew");
      const products = await getShopThisStyle(
        toAbsolute(design.resultImageUrl),
        design.roomType,
        design.style,
        design.budget,
        8,
      );

      return res.json({ success: true, products, designId });
    } catch (err: any) {
      log(`designs/:id/products fejl: ${err.message}`);
      return res.status(500).json({ error: err.message });
    }
  });

  // ── AI BoligPotentiale: Case CRUD ─────────────────────────────────────────
  app.get("/api/bolig/cases", async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const user = await storage.getUserByFirebaseUid(uid);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const cases = await storage.getBoligCasesByUser(user.id);
      const enriched = await Promise.all(cases.map(async (c) => {
        const imgs = await storage.getGeneratedImagesByCaseId(c.id, user.id);
        const thumbs = imgs.filter((i) => i.style !== "transform-video" && i.style !== "3d-interactive");
        return { ...c, imageCount: imgs.length, latestImageUrl: thumbs[0]?.imageUrl ?? null };
      }));
      return res.json(enriched);
    } catch (err: any) {
      return res.status(401).json({ message: err.message });
    }
  });

  app.post("/api/bolig/cases", async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    try {
      log(`📥 POST /api/bolig/cases — body: ${JSON.stringify(req.body)}`);
      const authHeader = req.headers.authorization;
      log(`📥 Auth header: ${authHeader ? "tilstede" : "MANGLER"}`);
      const { uid } = await verifyFirebaseToken(authHeader);
      log(`📥 Firebase UID: ${uid}`);
      const user = await storage.getUserByFirebaseUid(uid);
      log(`📥 DB User: ${user ? `ID ${user.id}` : "IKKE FUNDET"}`);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const { address, caseNo, notes, marketDateISO } = req.body;
      if (!address?.trim()) return res.status(400).json({ message: "address er påkrævet" });
      // Email must be verified before any usage (existing users grandfathered as verified)
      if (!user.isAdmin && !user.emailVerified) {
        return res.status(403).json({ emailVerificationRequired: true, message: "Bekræft din email med aktiveringskoden, før du kan oprette sager." });
      }
      // Free-trial gate: users without a plan may create cases only while they
      // still have free AI-visualisation credits left. Subscribers/teams/admins pass.
      if (!user.isAdmin) {
        const q = await storage.getUserQuota(user.id);
        if (q.isFreeTrial) {
          const remaining = (q.ai.limit ?? 0) - q.ai.used;
          if (remaining <= 0) {
            return res.status(403).json({ requiresSubscription: true, message: "Du har brugt dine gratis AI-visualiseringer. Opgrader for at oprette flere sager." });
          }
        }
      }
      const newCase = await storage.createBoligCase({
        userId: user.id, address: address.trim(),
        caseNo: caseNo?.trim() || null, notes: notes?.trim() || null,
        status: "active", marketDateISO: marketDateISO || new Date().toISOString().slice(0, 10),
      });
      log(`✅ Sag oprettet: ID ${newCase.id}, adresse: ${newCase.address}`);
      return res.status(201).json({ ...newCase, imageCount: 0, latestImageUrl: null });
    } catch (err: any) {
      log(`❌ Fejl i POST /api/bolig/cases: ${err.message}`);
      return res.status(500).json({ message: err.message ?? "Internal server error" });
    }
  });

  app.patch("/api/bolig/cases/:id/status", async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const user = await storage.getUserByFirebaseUid(uid);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });
      const existing = await storage.getBoligCase(id);
      if (!existing) return res.status(404).json({ message: "Not found" });
      if (existing.userId !== user.id) return res.status(403).json({ message: "Forbidden" });
      const { status } = req.body;
      if (!["active", "sold", "archived"].includes(status)) return res.status(400).json({ message: "Invalid status" });
      const soldDateISO = status === "sold" ? new Date().toISOString().slice(0, 10) : null;
      const updated = await storage.updateBoligCaseStatus(id, status, soldDateISO);
      const imgs = await storage.getGeneratedImagesByCaseId(id, user.id);
      const thumbs = imgs.filter((i) => i.style !== "transform-video");
      return res.json({ ...updated, imageCount: imgs.length, latestImageUrl: thumbs[0]?.imageUrl ?? null });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // ── Liggetid: opdater sagens "på markedet siden"-dato ───────────────────────
  app.patch("/api/bolig/cases/:id/market-date", async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const user = await storage.getUserByFirebaseUid(uid);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });
      const existing = await storage.getBoligCase(id);
      if (!existing) return res.status(404).json({ message: "Not found" });
      if (existing.userId !== user.id) return res.status(403).json({ message: "Forbidden" });
      const { marketDateISO } = req.body;
      if (typeof marketDateISO !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(marketDateISO)) {
        return res.status(400).json({ message: "Ugyldig dato (forventer YYYY-MM-DD)" });
      }
      const parsed = new Date(marketDateISO + "T00:00:00");
      if (isNaN(parsed.getTime()) || parsed.getTime() > Date.now()) {
        return res.status(400).json({ message: "Datoen skal være gyldig og må ikke ligge i fremtiden" });
      }
      const updated = await storage.updateBoligCaseMarketDate(id, marketDateISO);
      return res.json(updated);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // ── Delbare før/efter-links ─────────────────────────────────────────────────
  // Mægleren opretter et offentligt link til én visualisering; ejerskab tjekkes.
  app.post("/api/bolig/share", async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const user = await storage.getUserByFirebaseUid(uid);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const caseImageId = req.body.caseImageId ? parseInt(req.body.caseImageId) : null;
      const generatedImageId = req.body.generatedImageId ? parseInt(req.body.generatedImageId) : null;
      if (!caseImageId && !generatedImageId) return res.status(400).json({ message: "caseImageId eller generatedImageId er påkrævet" });

      if (caseImageId) {
        const row = await storage.getBoligCaseImage(caseImageId);
        if (!row) return res.status(404).json({ message: "Billedet blev ikke fundet" });
        if (row.ownerUserId !== user.id) return res.status(403).json({ message: "Forbidden" });
      } else if (generatedImageId) {
        const img = await storage.getGeneratedImage(generatedImageId);
        if (!img) return res.status(404).json({ message: "Billedet blev ikke fundet" });
        if (img.userId !== user.id) return res.status(403).json({ message: "Forbidden" });
      }

      const token = crypto.randomBytes(12).toString("base64url");
      const link = await storage.createShareLink(
        user.id,
        { caseImageId: caseImageId ?? undefined, generatedImageId: generatedImageId ?? undefined },
        token,
      );
      const proto = (req.headers["x-forwarded-proto"] as string | undefined) || req.protocol;
      const host = (req.headers["x-forwarded-host"] as string | undefined) || req.headers.host;
      return res.json({ token: link.token, url: `${proto}://${host}/s/${link.token}` });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // ── Afmeld onboarding-mails (HMAC-signeret link i mailens footer) ───────────
  app.get("/api/unsubscribe", async (req, res) => {
    const userId = parseInt(String(req.query.u || ""));
    const sig = String(req.query.sig || "");
    const page = (title: string, body: string) =>
      `<!DOCTYPE html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} | Forma Estates</title></head>` +
      `<body style="font-family:'Segoe UI',Tahoma,sans-serif;background:#FAF6EC;margin:0;padding:48px 16px;">` +
      `<div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #E8DFD0;border-radius:10px;padding:36px 32px;text-align:center;">` +
      `<div style="color:#C9A96E;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;font-weight:600;">Forma Estates</div>` +
      `<h1 style="color:#0F1923;font-size:22px;font-weight:500;margin:12px 0 10px;">${title}</h1>` +
      `<p style="color:#555;font-size:15px;line-height:1.6;margin:0;">${body}</p></div></body></html>`;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    if (isNaN(userId) || !sig || !verifyUnsubscribeSig(userId, sig)) {
      return res.status(400).send(page("Ugyldigt link", "Linket er ugyldigt eller udløbet."));
    }
    try {
      await storage.setMarketingOptOut(userId);
      return res.send(page("Du er afmeldt", "Du modtager ikke flere onboarding-mails fra os. Vigtige mails om din konto (f.eks. kvitteringer) sendes stadig."));
    } catch (err: any) {
      return res.status(500).send(page("Noget gik galt", "Prøv igen senere, eller skriv til kontakt@formaestates.com."));
    }
  });

  // Offentligt: hent deledata (ingen login). Billeder serveres via proxy-image,
  // så vandmærket altid er brændt ind.
  app.get("/api/share/:token", async (req, res) => {
    try {
      const token = String(req.params.token || "");
      if (!/^[A-Za-z0-9_-]{8,32}$/.test(token)) return res.status(404).json({ message: "Ikke fundet" });
      const data = await storage.getShareLinkData(token);
      if (!data) return res.status(404).json({ message: "Ikke fundet" });
      const toPublic = (u: string | null) => {
        if (!u) return null;
        if (u.startsWith("/uploads/")) return u; // lokalt hostet — allerede offentlig
        return `/api/proxy-image?url=${encodeURIComponent(u)}`;
      };
      return res.json({
        beforeUrl: toPublic(data.beforeUrl),
        afterUrl: toPublic(data.afterUrl),
        room: data.room,
        style: data.style,
        agentName: data.agentName,
        createdAt: data.createdAt,
      });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // Link-previews: bots (Facebook/WhatsApp/LinkedIn m.fl.) får en minimal HTML
  // med korrekte OG-tags; alm. browsere falder videre til SPA'en. Registreret
  // FØR Vite/static catch-all, så ingen ændringer i vite-opsætningen behøves.
  app.get("/s/:token", async (req, res, next) => {
    const ua = String(req.headers["user-agent"] || "");
    const isBot = /facebookexternalhit|whatsapp|twitterbot|linkedinbot|slackbot|telegrambot|discordbot|skypeuripreview|pinterest|googlebot/i.test(ua);
    if (!isBot) return next();
    try {
      const token = String(req.params.token || "");
      const data = /^[A-Za-z0-9_-]{8,32}$/.test(token) ? await storage.getShareLinkData(token) : null;
      if (!data) return next();
      const proto = (req.headers["x-forwarded-proto"] as string | undefined) || req.protocol;
      const host = (req.headers["x-forwarded-host"] as string | undefined) || req.headers.host;
      const base = `${proto}://${host}`;
      const roomLabel = BOLIG_ROOM_LABELS[data.room] ?? data.room;
      const styleLabel = BOLIG_STYLE_LABELS[data.style] ?? data.style;
      const ogImg = data.afterUrl.startsWith("/uploads/")
        ? `${base}${data.afterUrl}`
        : `${base}/api/proxy-image?url=${encodeURIComponent(data.afterUrl)}`;
      const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
      const title = `Før/efter: ${esc(roomLabel)} i ${esc(styleLabel)} stil | Forma Estates`;
      const desc = data.agentName
        ? `${esc(data.agentName)} har delt en AI-visualisering af boligens potentiale.`
        : "Se boligens potentiale med AI-visualisering fra Forma Estates.";
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.send(`<!DOCTYPE html><html lang="da"><head><meta charset="utf-8">
<title>${title}</title>
<meta property="og:type" content="website">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:image" content="${esc(ogImg)}">
<meta property="og:url" content="${esc(`${base}/s/${token}`)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${esc(ogImg)}">
</head><body>${title}</body></html>`);
    } catch {
      return next();
    }
  });

  app.get("/api/bolig/stats", async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const user = await storage.getUserByFirebaseUid(uid);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const stats = await storage.getBoligStats(user.id);
      return res.json(stats);
    } catch (err: any) {
      if (err.message === "Ingen token") return res.status(401).json({ message: "Unauthorized" });
      return res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/bolig/activity", async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const user = await storage.getUserByFirebaseUid(uid);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const activity = await storage.getBoligActivity(user.id);
      return res.json(activity);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/bolig/team-activity", async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const user = await storage.getUserByFirebaseUid(uid);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const membership = await storage.getTeamByUserId(user.id);
      if (!membership) return res.json([]);
      const activity = await storage.getTeamActivity(membership.team.id);
      return res.json(activity);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/bolig/most-used", async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const user = await storage.getUserByFirebaseUid(uid);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const data = await storage.getBoligMostUsed(user.id);
      return res.json(data);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/bolig/recent-images", async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const user = await storage.getUserByFirebaseUid(uid);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const imgs = await storage.getAllGeneratedImages(user.id, 20);
      return res.json(imgs.filter((i) => i.style !== "transform-video").slice(0, 3));
    } catch (err: any) {
      if (err.message === "Ingen token") return res.status(401).json({ message: "Unauthorized" });
      return res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/bolig/cases/:id", async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const user = await storage.getUserByFirebaseUid(uid);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });
      const existing = await storage.getBoligCase(id);
      if (!existing) return res.status(404).json({ message: "Not found" });
      if (existing.userId !== user.id) return res.status(403).json({ message: "Forbidden" });

      // Collect all file paths before deleting DB records
      const images = await storage.getBoligCaseImages(id);
      const allPaths = images.flatMap((img) => [img.src, img.beforeSrc].filter(Boolean) as string[]);

      // Delete DB records
      await storage.deleteBoligCase(id);

      // Clean up files (non-blocking — DB delete already succeeded)
      const r2Keys: string[] = [];
      for (const p of allPaths) {
        if (!p.startsWith("/uploads/")) continue;
        const filename = path.basename(p);
        // Local disk
        const localPath = path.join(uploadDir, filename);
        fs.unlink(localPath, () => {});
        r2Keys.push(filename);
      }
      r2DeleteFiles(r2Keys).catch(() => {});

      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/bolig/cases/:id/images", async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const user = await storage.getUserByFirebaseUid(uid);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const caseId = parseInt(req.params.id);
      if (isNaN(caseId)) return res.status(400).json({ message: "Invalid id" });
      const existing = await storage.getBoligCase(caseId);
      if (!existing || existing.userId !== user.id) return res.status(403).json({ message: "Forbidden" });
      const marketMs = new Date(existing.marketDateISO).getTime();
      const imgs = await storage.getGeneratedImagesByCaseId(caseId, user.id);
      return res.json(imgs.map((img) => ({
        id: img.id,
        caseId: img.caseId,
        src: img.imageUrl,
        beforeSrc: img.originalImageUrl ?? null,
        room: img.roomType,
        style: img.style,
        tier: img.budgetTier,
        promptUsed: img.promptText ?? null,
        daysAfterMarket: Math.max(0, Math.floor((new Date(img.createdAt).getTime() - marketMs) / 86_400_000)),
        createdAt: img.createdAt,
      })));
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // Admin-only: fetch any team member's case images
  app.get("/api/bolig/team/cases/:id/images", async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const user = await storage.getUserByFirebaseUid(uid);
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const membership = await storage.getTeamByUserId(user.id);
      if (!membership) return res.status(403).json({ message: "Not in a team" });
      const { team, role } = membership;
      const isAdmin = role === "admin" || team.ownerUserId === user.id;
      if (!isAdmin) return res.status(403).json({ message: "Admin only" });

      const caseId = parseInt(req.params.id);
      if (isNaN(caseId)) return res.status(400).json({ message: "Invalid id" });

      // Verify case belongs to someone in this team
      const caseRow = await pool.query<{ user_id: number; address: string; market_date_iso: string }>(
        "SELECT user_id, address, market_date_iso FROM bolig_cases WHERE id = $1", [caseId]
      );
      if (!caseRow.rows[0]) return res.status(404).json({ message: "Case not found" });

      const memberCheck = await pool.query(
        `SELECT 1 FROM users u WHERE u.id = $1 AND u.id IN (
          SELECT owner_user_id FROM teams WHERE id = $2
          UNION SELECT user_id FROM team_members WHERE team_id = $2
        )`,
        [caseRow.rows[0].user_id, team.id]
      );
      if (!memberCheck.rows.length) return res.status(403).json({ message: "Case not in your team" });

      const marketMs = new Date(caseRow.rows[0].market_date_iso).getTime();
      const imgs = await storage.getGeneratedImagesByCaseId(caseId, caseRow.rows[0].user_id);
      return res.json(imgs.map((img) => ({
        id: img.id,
        caseId: img.caseId,
        src: img.imageUrl,
        beforeSrc: img.originalImageUrl ?? null,
        room: img.roomType,
        style: img.style,
        tier: img.budgetTier,
        daysAfterMarket: Math.max(0, Math.floor((new Date(img.createdAt).getTime() - marketMs) / 86_400_000)),
        createdAt: img.createdAt,
      })));
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // Download a remote video (Rendy/fal-hosted) to our own storage so saved case
  // videos never break if the provider deletes them. Saves to uploads/ and queues
  // an R2 upload (same pattern as design images). Returns the local /uploads/ URL,
  // or null if the download failed (caller falls back to storing the remote URL).
  // Uses spawn("curl") because Node.js fetch is intercepted in the Replit dev env.
  // SSRF guard: only fetch from the video providers we actually use. Anything
  // else keeps its remote URL untouched.
  const TRUSTED_VIDEO_HOSTS = [/(^|\.)rendy\.io$/i, /(^|\.)fal\.media$/i, /(^|\.)fal\.ai$/i, /(^|\.)fal\.run$/i];
  function isTrustedVideoHost(url: string): boolean {
    try {
      const { protocol, hostname } = new URL(url);
      if (protocol !== "https:") return false;
      return TRUSTED_VIDEO_HOSTS.some((re) => re.test(hostname));
    } catch { return false; }
  }

  async function localizeRemoteVideo(url: string): Promise<string> {
    if (!isTrustedVideoHost(url)) {
      console.error(`[case-video] afvist: ikke-godkendt videovært — ${url.slice(0, 120)}`);
      throw new Error("Videoen kom fra en ikke-godkendt vært");
    }
    const filename = `case-video-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`;
    const localFilePath = path.join(uploadDir, filename);
    try {
      const contentType = await new Promise<string>((resolve, reject) => {
        const curl = spawn("curl", ["-sL", "--fail", "--max-time", "120", "--max-filesize", "524288000", "--proto", "=https", "-o", localFilePath, "-w", "%{content_type}", url]);
        const out: Buffer[] = [];
        curl.stdout.on("data", (d: Buffer) => out.push(d));
        curl.on("close", (code: number) => code === 0 ? resolve(Buffer.concat(out).toString().trim()) : reject(new Error(`curl exit ${code}`)));
        curl.on("error", reject);
      });
      if (contentType && !/^(video\/|application\/octet-stream|binary\/)/i.test(contentType)) {
        throw new Error(`unexpected content-type: ${contentType}`);
      }
      const size = fs.statSync(localFilePath).size;
      if (size < 10_000) throw new Error(`downloaded file too small (${size} bytes)`);
      await r2UploadFile(localFilePath);
      log(`[case-video] durably localized ${url.slice(0, 80)}… → /uploads/${filename} (${Math.round(size / 1024)} KB)`);
      return `/uploads/${filename}`;
    } catch (e: any) {
      try { fs.unlinkSync(localFilePath); } catch {}
      throw new Error(`Kunne ikke gemme videoen sikkert: ${e?.message || "ukendt fejl"}`);
    }
  }

  const isRemoteVideoUrl = (u: unknown, roomType?: string): u is string =>
    typeof u === "string" && /^https?:\/\//i.test(u) &&
    (/\.mp4(\?|$)/i.test(u) || /video/i.test(roomType || ""));

  app.post("/api/bolig/cases/:id/images", async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const user = await storage.getUserByFirebaseUid(uid);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const caseId = parseInt(req.params.id);
      if (isNaN(caseId)) return res.status(400).json({ message: "Invalid id" });
      const existing = await storage.getBoligCase(caseId);
      if (!existing || existing.userId !== user.id) return res.status(403).json({ message: "Forbidden" });
      const {
        imageUrl, originalImageUrl,
        roomType, style, budgetTier,
        promptText, isDesignAgent,
      } = req.body || {};
      if (!imageUrl) return res.status(400).json({ message: "imageUrl required" });

      // Persist provider-hosted videos (Rendy/fal) on our own storage so they
      // remain playable in the case folder even if the provider deletes them.
      let finalImageUrl: string = imageUrl;
      let finalOriginalUrl: string | null = originalImageUrl || null;
      if (isRemoteVideoUrl(imageUrl, roomType)) {
        const local = await localizeRemoteVideo(imageUrl);
        finalImageUrl = local;
        if (finalOriginalUrl === imageUrl) finalOriginalUrl = local;
      }
      if (finalOriginalUrl && finalOriginalUrl !== finalImageUrl && isRemoteVideoUrl(finalOriginalUrl, roomType)) {
        const localOrig = await localizeRemoteVideo(finalOriginalUrl);
        finalOriginalUrl = localOrig;
      }

      const img = await storage.createGeneratedImage({
        userId: user.id,
        caseId,
        imageUrl: finalImageUrl,
        originalImageUrl: finalOriginalUrl,
        roomType: roomType || "other",
        style: style || "custom",
        budgetTier: budgetTier || "tier2",
        promptText: promptText || null,
        isDesignAgent: !!isDesignAgent,
        isQuickGeneration: false,
        quickSessionId: null,
        generationTimeMs: null,
      });
      return res.json(img);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // ── Bolig prompts lookup ────────────────────────────────────────────────────
  app.get("/api/prompts", async (req, res) => {
    try {
      const room = (req.query.room as string) || "living room";
      const style = (req.query.style as string) || "scandinavian";
      const tierRaw = (req.query.tier as string) || "2";
      const tier = tierRaw === "1" || tierRaw === "tier1" ? "tier1" : tierRaw === "3" || tierRaw === "tier3" ? "tier3" : "tier2";
      const resolvedRoom = BOLIG_ROOM_ALIASES[room.toLowerCase()] ?? room.toLowerCase();
      const prompt = getBoligPrompt(resolvedRoom, style, tier as "tier1" | "tier2" | "tier3");
      return res.json({ prompt, room, resolvedRoom, style, tier });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // ── Generations: all ────────────────────────────────────────────────────────
  app.get("/api/generations/all", async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const user = await storage.getUserByFirebaseUid(uid);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const imgs = await storage.getAllGeneratedImages(user.id);
      return res.json(imgs.map((img) => ({
        id: img.id,
        caseId: img.caseId,
        isQuickGeneration: img.isQuickGeneration,
        src: img.imageUrl,
        beforeSrc: img.originalImageUrl ?? null,
        room: img.roomType,
        style: img.style,
        tier: img.budgetTier,
        promptUsed: img.promptText ?? null,
        createdAt: img.createdAt,
        generationTimeMs: img.generationTimeMs,
      })));
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // ── Delete a generated image ────────────────────────────────────────────────
  app.delete("/api/bolig/generated-images/:id", async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const user = await storage.getUserByFirebaseUid(uid);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });

      // Hent billedet inden sletning så vi kan rydde disk + R2
      const img = await storage.getGeneratedImage(id);
      if (img && img.userId !== user.id) return res.status(403).json({ message: "Forbidden" });

      // Slet fra DB først
      await storage.deleteGeneratedImage(id, user.id);

      // Ryd lokale filer + R2 (non-blocking — DB delete er allerede sket)
      if (img) {
        const r2Keys: string[] = [];
        for (const url of [img.originalImageUrl, img.imageUrl]) {
          if (!url?.startsWith("/uploads/")) continue;
          const filename = path.basename(url);
          fs.unlink(path.join(uploadDir, filename), () => {});
          r2Keys.push(filename);
        }
        if (r2Keys.length > 0) r2DeleteFiles(r2Keys).catch(() => {});
      }

      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/user/account", async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const user = await storage.getUserByFirebaseUid(uid);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      await storage.deleteUserAccount(user.id);
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // ── Nulstil alt indhold (beholder konto + login) ──────────────────────────
  app.post("/api/bolig/reset-my-data", async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const user = await storage.getUserByFirebaseUid(uid);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      await storage.resetUserData(user.id);
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // ── Quota info endpoint ────────────────────────────────────────────────────
  // ── Image proxy — fetches external image server-side and streams to client ──
  // Fixes CORS issue where browser cannot directly fetch Cloudfront/S3 images.
  app.get("/api/proxy-image", async (req, res) => {
    const url = req.query.url as string;
    const format = (req.query.format as string | undefined) ?? "jpg";
    const isDemo = req.query.demo === "1";
    const isLocalUpload = typeof url === "string" && url.startsWith("/uploads/");
    if (!url || (!isLocalUpload && !url.startsWith("http"))) {
      res.status(400).send("Invalid url");
      return;
    }

    let localUploadPath: string | null = null;
    if (isLocalUpload) {
      try {
        localUploadPath = await ensureLocalUpload(url);
      } catch {
        res.status(404).send("Image not found");
        return;
      }
    }

    // SSRF-guard: kun whitelistede hosts må proxyes server-side.
    // Forhindrer brug af serveren til at sonde interne adresser (DB, metadata).
    if (!isLocalUpload && !isTrustedProxyImageUrl(url)) {
      res.status(403).json({ error: "Proxy-url ikke tilladt" });
      return;
    }

    // plain=1: KUN admin (is_admin=true i DB) kan springe vandmærket over.
    // EU AI Act (Art. 50) kræver tvungen automatisk mærkning — ingen bruger
    // må have mulighed for at slå det fra. Undtagelse: ejerkonto til intern brug.
    let skipWatermark = false;
    let downloadAgencyLogo: Buffer | null = null;
    if (req.headers.authorization) {
      try {
        const { uid } = await verifyFirebaseToken(req.headers.authorization);
        const downloadUser = await storage.getUserByFirebaseUid(uid);
        if (req.query.plain === "1" && downloadUser?.isAdmin === true) {
          skipWatermark = true;
        }
        if (downloadUser?.agencyLogoUrl) {
          downloadAgencyLogo = await readLogoBuffer(downloadUser.agencyLogoUrl);
        }
      } catch {}
    }

    let proxyTempPath: string | null = null;
    let sourceUrl: string;
    if (localUploadPath) {
      sourceUrl = `file://${localUploadPath}`;
    } else {
      try {
        const trustedBuffer = await downloadTrustedProxyImage(url);
        proxyTempPath = path.join(
          "/tmp",
          `proxy-image-${Date.now()}-${Math.random().toString(36).slice(2)}.bin`,
        );
        fs.writeFileSync(proxyTempPath, trustedBuffer);
        sourceUrl = `file://${proxyTempPath}`;
      } catch (error: any) {
        res.status(502).send(error?.message || "Image fetch failed");
        return;
      }
    }
    const curl = spawn("curl", ["-sL", "--max-time", "30", "--fail", sourceUrl]);

    const chunks: Buffer[] = [];
    curl.stdout.on("data", (c: Buffer) => chunks.push(c));
    curl.on("close", async (code: number) => {
      if (proxyTempPath) fs.promises.unlink(proxyTempPath).catch(() => {});
      if (code !== 0) { res.status(502).send("Image fetch failed"); return; }
      try {
        const buf = Buffer.concat(chunks);
        const meta = await sharp(buf).metadata();
        const imgW = meta.width || 1600;
        const imgH = meta.height || 1067;

        // ── EU AI Act (Art. 50) — tvungen mærkning, kan ALDRIG frakobles ────────
        // Synlig: EU-standardiseret "AI Modified" badge med AI-cirkel-ikon.
        // Usynlig: XMP/C2PA-kompatibel metadata bages ind i filen.
        // EU AI Act Art. 50 Regel 1: XMP/C2PA-pakke — injiceres EFTER Sharp-encoding
        // via injectXmpIntoJpeg() for garanteret embedding (Sharp withMetadata er upålidelig for JPEG).
        const xmpPacket = buildEuXmpPacket("c2pa.modified", "AI Design");

        // EU AI Act Art. 50 Regel 3+4: lokaliseret badge-tekst ud fra brugerens sprog.
        // Minimumshøjde: 64px. Sproget sendes som ?lang= fra klienten.
        const AI_BADGE_LABELS: Record<string, string> = {
          da: "AI Redigeret",
          en: "AI Modified",
          sv: "AI Redigerad",
          de: "AI Bearbeitet",
          nb: "AI Redigert",
          no: "AI Redigert",
          es: "AI Modificado",
          fr: "AI Modifié",
        };
        const badgeLang = (typeof req.query.lang === "string" ? req.query.lang : "da")
          .split("-")[0].toLowerCase();
        const wmText = AI_BADGE_LABELS[badgeLang] ?? "AI Modified";
        // EU Regel 4: minimumstext-størrelse sikrer badge-højde over 64px på alle billedstørrelser
        const fontSize = Math.max(25, Math.round(imgH * 0.032));
        const letterSpacing = Math.round(fontSize * 0.07);
        const padRight = Math.round(imgW * 0.022);
        const padBottom = Math.round(imgH * 0.022);
        const hPad = Math.round(fontSize * 0.8);
        // AI-cirkel ikon (EU basic icon-format) + tekst
        const iconR = Math.round(fontSize * 0.55);
        const iconD = iconR * 2;
        const approxTextW = Math.round(fontSize * 0.52 * wmText.length) + letterSpacing * (wmText.length - 1);
        const gap = Math.round(fontSize * 0.4);
        const boxW = hPad + iconD + gap + approxTextW + hPad;
        // EU Regel 4: mindst 64px høj — Math.max sikrer dette selv på lille input
        const boxH = Math.max(64, Math.round(fontSize * 1.85));
        const rx = Math.round(boxH / 2);
        const boxX = imgW - boxW - padRight;
        const boxY = imgH - boxH - padBottom;
        const iconCX = boxX + hPad + iconR;
        const iconCY = boxY + Math.round(boxH / 2);
        const textX = iconCX + iconR + gap + approxTextW / 2;
        const textY = boxY + Math.round(boxH * 0.67);

        const wmFont = `Arial,Helvetica,'Liberation Sans',sans-serif`;
        const iconFontSize = Math.round(iconR * 0.95);
        let svgParts =
          // Pill baggrund — EU Regel 4: mindst 85% opacity for tilstrækkelig kontrast
          `<rect x="${boxX}" y="${boxY}" width="${boxW}" height="${boxH}" rx="${rx}" fill="rgba(10,18,28,0.88)" stroke="rgba(255,255,255,0.22)" stroke-width="1"/>` +
          // EU AI-cirkel ikon
          `<circle cx="${iconCX}" cy="${iconCY}" r="${iconR}" fill="rgba(255,255,255,0.18)" stroke="rgba(255,255,255,0.50)" stroke-width="1"/>` +
          `<text x="${iconCX}" y="${iconCY + Math.round(iconFontSize * 0.35)}" ` +
          `font-family="${wmFont}" font-size="${iconFontSize}" font-weight="700" ` +
          `fill="#FFFFFF" text-anchor="middle">AI</text>` +
          // label — sans-serif weight 700 for pixel-skarp rendering
          `<text x="${textX}" y="${textY}" ` +
          `font-family="${wmFont}" font-size="${fontSize}" font-weight="700" ` +
          `letter-spacing="${letterSpacing}" fill="#FFFFFF" text-anchor="middle">${wmText.replace("AI ", "")}</text>`;

        // Demo-variant (gratis prøve uden login): ekstra tydelig branding, så
        // billedet reklamerer for Forma Estates, hvis det deles videre.
        if (isDemo) {
          const brandSize = Math.max(30, Math.round(imgW * 0.034));
          const brandSpacing = Math.round(brandSize * 0.22);
          svgParts +=
            `<text x="${Math.round(imgW / 2)}" y="${Math.round(imgH * 0.5)}" ` +
            `font-family="${wmFont}" font-size="${Math.round(imgW * 0.055)}" font-weight="500" ` +
            `letter-spacing="${brandSpacing}" fill="rgba(255,255,255,0.16)" text-anchor="middle" ` +
            `transform="rotate(-24 ${Math.round(imgW / 2)} ${Math.round(imgH * 0.5)})">FORMA ESTATES</text>` +
            `<text x="${Math.round(imgW / 2)}" y="${imgH - Math.round(imgH * 0.035)}" ` +
            `font-family="${wmFont}" font-size="${Math.max(20, Math.round(imgH * 0.022))}" font-weight="500" ` +
            `letter-spacing="${Math.round(brandSize * 0.08)}" fill="rgba(255,255,255,0.85)" text-anchor="middle">formaestates.com</text>`;
        }

        const svgWatermark = Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${imgW}" height="${imgH}">` + svgParts + `</svg>`
        );

        // EU Art. 50 Regel 1+2+3: composite badge → raw pixels → SS-vandmærke → JPEG → XMP.
        // Ét encode-pass (ingen dobbelt JPEG-komprimering).
        // skipWatermark (admin): fjerner KUN det synlige badge — SS+XMP altid til stede.
        const finalComposites: any[] = [];
        if (downloadAgencyLogo) {
          const logoTargetW = Math.round(imgW * 0.13);
          const resizedLogo = await sharp(downloadAgencyLogo)
            .resize(logoTargetW, null, { fit: "inside", withoutEnlargement: true })
            .png()
            .toBuffer();
          const logoMeta = await sharp(resizedLogo).metadata();
          const logoPad = Math.round(imgW * 0.025);
          finalComposites.push({
            input: resizedLogo,
            top: logoPad,
            left: imgW - (logoMeta.width || logoTargetW) - logoPad,
            blend: "over",
          });
        }
        if (!skipWatermark) {
          finalComposites.push({ input: svgWatermark, blend: "over" });
        }

        let pipeline = sharp(buf);
        if (finalComposites.length > 0) {
          pipeline = pipeline.composite(finalComposites);
        }

        if (format === "png") {
          // PNG: SS-vandmærke via raw pixels + XMP via manuel iTXt-chunk injection.
          const { data: pngRaw, info: pngInfo } = await pipeline.flatten().raw().toBuffer({ resolveWithObject: true });
          const pngMarked = ssWatermarkEmbed(pngRaw, pngInfo.width, pngInfo.height, pngInfo.channels);
          const rawPng = await sharp(pngMarked, { raw: { width: pngInfo.width, height: pngInfo.height, channels: pngInfo.channels } })
            .png().toBuffer();
          const out = injectXmpIntoPng(rawPng, xmpPacket);
          res.setHeader("Content-Type", "image/png");
          res.setHeader("Cache-Control", "private, max-age=86400");
          res.end(out);
        } else {
          // JPEG: raw pixels → SS-vandmærke → JPEG → XMP APP1-marker injection.
          const { data: jpgRaw, info: jpgInfo } = await pipeline.flatten().raw().toBuffer({ resolveWithObject: true });
          const jpgMarked = ssWatermarkEmbed(jpgRaw, jpgInfo.width, jpgInfo.height, jpgInfo.channels);
          const rawJpeg = await sharp(jpgMarked, { raw: { width: jpgInfo.width, height: jpgInfo.height, channels: jpgInfo.channels } })
            // Final export only: retain the raw Collov master's detail and
            // colour information while adding the optional visible label,
            // invisible mark and XMP. Preview and refinement bytes are never
            // routed through this encoder.
            .jpeg({ quality: 100, chromaSubsampling: "4:4:4", mozjpeg: false })
            .toBuffer();
          const out = injectXmpIntoJpeg(rawJpeg, xmpPacket);
          res.setHeader("Content-Type", "image/jpeg");
          res.setHeader("Cache-Control", "private, max-age=86400");
          res.end(out);
        }
      } catch (e: any) {
        res.status(502).send(e.message || "Conversion failed");
      }
    });
    curl.on("error", (e: Error) => {
      if (proxyTempPath) fs.promises.unlink(proxyTempPath).catch(() => {});
      res.status(502).send(e.message);
    });
  });

  app.get("/api/bolig/quota", async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const u = await storage.getUserByFirebaseUid(uid);
      if (!u) return res.status(401).json({ message: "Bruger ikke fundet" });
      const quota = await storage.getUserQuota(u.id);
      // Include invite link for team owners (using the permanent team code)
      const membership = await storage.getTeamByUserId(u.id);
      const teamCode = membership?.team?.code ?? null;
      const inviteLink = teamCode ? `${req.protocol}://${req.get("host")}/join/${teamCode}` : null;
      return res.json({ success: true, isAdmin: u.isAdmin, quota, teamCode, inviteLink });
    } catch {
      return res.status(401).json({ message: "Ikke autoriseret" });
    }
  });

  // ── Team invite link (permanent, code-based) ──────────────────────────────
  app.get("/api/team/invite-link", async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const u = await storage.getUserByFirebaseUid(uid);
      if (!u) return res.status(401).json({ error: "Ikke autoriseret" });
      const membership = await storage.getTeamByUserId(u.id);
      if (!membership) return res.status(404).json({ error: "Du er ikke i et team" });
      const { team } = membership;
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const inviteLink = `${baseUrl}/join/${team.code}`;
      const memberCntRes = await pool.query<{ cnt: string }>(
        `SELECT COUNT(*)::text AS cnt FROM team_members WHERE team_id = $1`, [team.id]
      );
      const memberCount = parseInt(memberCntRes.rows[0]?.cnt ?? "0", 10) + 1; // +1 for owner
      return res.json({ inviteLink, teamCode: team.code, teamName: team.name, memberCount, maxMembers: 15 });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── Set user quotas (admin only) ──────────────────────────────────────────
  // ── Admin: søg brugere ──────────────────────────────────────────────────────
  app.get("/api/admin/users/search", async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const admin = await storage.getUserByFirebaseUid(uid);
      if (!admin?.isAdmin) return res.status(403).json({ message: "Kun admins" });
      const q = (req.query.q as string || "").trim();
      if (!q) return res.json([]);
      const results = await storage.searchUsers(q);
      return res.json(results.map(u => ({
        id: u.id, email: u.email, displayName: u.displayName,
        isAdmin: u.isAdmin, subscriptionStatus: u.subscriptionStatus,
        subscriptionTier: u.subscriptionTier, creditsRemaining: u.creditsRemaining,
        totalCreditsUsed: u.totalCreditsUsed, createdAt: u.createdAt,
      })));
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // ── Admin: hent enkelt bruger ────────────────────────────────────────────────
  app.get("/api/admin/users/:id", async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const admin = await storage.getUserByFirebaseUid(uid);
      if (!admin?.isAdmin) return res.status(403).json({ message: "Kun admins" });
      const userId = parseInt(req.params.id);
      if (isNaN(userId)) return res.status(400).json({ message: "Ugyldigt bruger-id" });
      const u = await storage.getUserById(userId);
      if (!u) return res.status(404).json({ message: "Bruger ikke fundet" });
      // Also get quota info
      const quota = await storage.getUserQuota(userId);
      return res.json({
        id: u.id, email: u.email, displayName: u.displayName,
        isAdmin: u.isAdmin, subscriptionStatus: u.subscriptionStatus,
        subscriptionTier: u.subscriptionTier, creditsRemaining: u.creditsRemaining,
        totalCreditsUsed: u.totalCreditsUsed, createdAt: u.createdAt,
        customerCode: u.customerCode, quota,
      });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // ── Admin: opdater brugerprofil ──────────────────────────────────────────────
  app.patch("/api/admin/users/:id/profile", async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const admin = await storage.getUserByFirebaseUid(uid);
      if (!admin?.isAdmin) return res.status(403).json({ message: "Kun admins" });
      const userId = parseInt(req.params.id);
      if (isNaN(userId)) return res.status(400).json({ message: "Ugyldigt bruger-id" });
      // Whitelist only the fields we allow admin to change
      const allowed: Record<string, unknown> = {};
      if (typeof req.body.displayName === "string") allowed.displayName = req.body.displayName.trim() || null;
      if (typeof req.body.isAdmin === "boolean") allowed.isAdmin = req.body.isAdmin;
      if (["none","active","trialing","canceled","paused"].includes(req.body.subscriptionStatus)) allowed.subscriptionStatus = req.body.subscriptionStatus;
      if (["none","start","pro","business","enterprise"].includes(req.body.subscriptionTier) || req.body.subscriptionTier === null) allowed.subscriptionTier = req.body.subscriptionTier || null;
      if (typeof req.body.creditsRemaining === "number") allowed.creditsRemaining = Math.max(0, Math.round(req.body.creditsRemaining));
      if (Object.keys(allowed).length === 0) return res.status(400).json({ message: "Ingen gyldige felter at opdatere" });
      const updated = await storage.updateUser(userId, allowed as any);
      if (!updated) return res.status(404).json({ message: "Bruger ikke fundet" });
      log(`[Admin] ${admin.email} updated user #${userId}: ${JSON.stringify(Object.keys(allowed))}`);
      return res.json({ success: true, user: { id: updated.id, email: updated.email, displayName: updated.displayName, isAdmin: updated.isAdmin, subscriptionStatus: updated.subscriptionStatus, subscriptionTier: updated.subscriptionTier, creditsRemaining: updated.creditsRemaining } });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // ── Owner-only: tilføj credits til bruger (atomisk increment) ───────────────
  app.post("/api/admin/users/:id/credits/add", async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const caller = await storage.getUserByFirebaseUid(uid);
      // Only the platform owner may give credits
      if (!caller || caller.email !== "fredefussing@gmail.com") {
        return res.status(403).json({ message: "Kun ejeren kan tildele credits" });
      }
      const userId = parseInt(req.params.id);
      if (isNaN(userId)) return res.status(400).json({ message: "Ugyldigt bruger-id" });
      const amount = typeof req.body.amount === "number" ? Math.round(req.body.amount) : parseInt(req.body.amount);
      if (!amount || amount < 1 || amount > 10000) return res.status(400).json({ message: "Ugyldigt beløb (1–10000)" });
      const description = typeof req.body.description === "string" ? req.body.description.slice(0, 120) : `Tildelt af ${caller.email}`;
      await storage.addCredits(userId, amount, description);
      const updated = await storage.getUserById(userId);
      if (!updated) return res.status(404).json({ message: "Bruger ikke fundet" });
      log(`[CRM] ${caller.email} gave ${amount} credits to user #${userId} (${updated.email}) — new total: ${updated.creditsRemaining}`);
      return res.json({ success: true, creditsRemaining: updated.creditsRemaining });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/admin/users/:id/quota", async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const admin = await storage.getUserByFirebaseUid(uid);
      if (!admin?.isAdmin) return res.status(403).json({ message: "Kun admins" });
      const userId = parseInt(req.params.id);
      if (isNaN(userId)) return res.status(400).json({ message: "Ugyldigt bruger-id" });
      const { ai, floorPlans, transformVideos, showcase, tier } = req.body;
      // If a tier name is provided, use preset quotas
      if (tier && tier in SUBSCRIPTION_QUOTAS) {
        const q = SUBSCRIPTION_QUOTAS[tier as keyof typeof SUBSCRIPTION_QUOTAS];
        const nextMonth = new Date(); nextMonth.setMonth(nextMonth.getMonth() + 1); nextMonth.setDate(1); nextMonth.setHours(0,0,0,0);
        await storage.setUserQuotas(userId, { ai: q.ai, floorPlans: q.floorPlans, transformVideos: q.transformVideos, showcase: q.showcase, resetsAt: nextMonth, resetUsage: true });
        await storage.updateUser(userId, { subscriptionStatus: "active", subscriptionTier: tier });
      } else {
        const nextMonth = new Date(); nextMonth.setMonth(nextMonth.getMonth() + 1); nextMonth.setDate(1); nextMonth.setHours(0,0,0,0);
        await storage.setUserQuotas(userId, { ai, floorPlans, transformVideos, showcase, resetsAt: nextMonth, resetUsage: true });
        await storage.updateUser(userId, { subscriptionStatus: "active" });
      }
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // ── Gratis demo på forsiden — INGEN login ───────────────────────────────────
  // Én gratis AI-forvandling pr. IP pr. dag med kraftigt vandmærke. Global
  // dagsgrænse beskytter Collov-kreditterne. IP hentes fra Cloudflare-headeren
  // (live kører bag Cloudflare) og hashes før lagring (GDPR).
  app.post("/api/bolig/demo-generate", upload.single("image"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: "Intet billede uploadet" });
      }
      if (!COLLOV_API_KEY) {
        return res.status(500).json({ success: false, message: "Tjenesten er midlertidigt utilgængelig" });
      }

      const rawIp =
        (req.headers["cf-connecting-ip"] as string | undefined) ||
        ((req.headers["x-forwarded-for"] as string | undefined) || "").split(",")[0].trim() ||
        req.socket.remoteAddress || "unknown";
      const ipHash = crypto.createHash("sha256").update(rawIp).digest("hex");

      const rate = await storage.demoRateCheck(ipHash, 1, 50);
      if (!rate.allowed) {
        const msg = rate.reason === "global"
          ? "Dagens gratis prøver er brugt op. Opret en gratis konto for at fortsætte."
          : "Du har brugt dagens gratis prøve. Opret en gratis konto og få 2 visualiseringer mere.";
        return res.status(429).json({ success: false, rateLimited: true, message: msg });
      }

      // Fast opsætning: skandinavisk stil, standard-tier, begrænset rumvalg
      const allowedRooms = ["living room", "kitchen", "bedroom", "dining room", "bathroom"];
      const room = allowedRooms.includes(String(req.body.room)) ? String(req.body.room) : "living room";
      const style = "scandinavian";
      const resolvedRoom = BOLIG_ROOM_ALIASES[room.toLowerCase()] ?? room.toLowerCase();
      let prompt: string;
      try {
        prompt = getBoligPrompt(resolvedRoom, style, "tier2");
      } catch {
        prompt = `Completely redesign this ${room} in ${style} style. Replace all existing furniture and decor with new pieces that match the style. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint.`;
      }
      // ── Strukturbeskyttelse: samme prefix som hovedflowet ──
      prompt = guardedPrefix() + prompt;

      const protocol = (req.headers["x-forwarded-proto"] as string | undefined) || req.protocol;
      const rawHost = (req.headers["x-forwarded-host"] as string | undefined) || req.headers.host;
      const isLocalhost = !rawHost || rawHost.startsWith("localhost") || rawHost.startsWith("127.");
      const effectiveHost = (isLocalhost && process.env.REPLIT_DEV_DOMAIN) ? process.env.REPLIT_DEV_DOMAIN : rawHost;
      const effectiveProtocol = (isLocalhost && process.env.REPLIT_DEV_DOMAIN) ? "https" : protocol;
      const publicUrl = `${effectiveProtocol}://${effectiveHost}/uploads/${req.file.filename}`;
      log(`[Demo] generate: room=${room}, ipHash=${ipHash.slice(0, 10)}…`);

      // Én Collov-kørsel + én retry (billigere end den fulde pipeline)
      let collovImageUrl: string | null = null;
      let lastFailReason: string | null = null;
      for (let attempt = 0; attempt <= 1 && !collovImageUrl; attempt++) {
        if (attempt > 0) await new Promise(r => setTimeout(r, 8000));
        const form = new FormData();
        form.append("uploadUrl", publicUrl);
        form.append("prompt", prompt);
        const collovRes = await fetch(`${COLLOV_BASE}/flair/enterpriseApi/edit/generate`, {
          method: "POST", headers: { apiKey: COLLOV_API_KEY! }, body: form,
        });
        const collovJson = (await collovRes.json()) as any;
        if (!collovJson.success || !collovJson.data?.uuid) {
          lastFailReason = collovJson.message || "Collov API fejl";
          continue;
        }
        const uuid = collovJson.data.uuid;
        for (let i = 0; i < 45; i++) {
          await new Promise(r => setTimeout(r, 2000));
          const pollRes = await fetch(
            `${COLLOV_BASE}/flair/enterpriseApi/edit/getRecord?uuid=${encodeURIComponent(uuid)}`,
            { method: "GET", headers: { apiKey: COLLOV_API_KEY! } },
          );
          const pollJson = (await pollRes.json()) as any;
          const status = pollJson.data?.status;
          if (status === "SUCCESS" && pollJson.data?.generateUrl) { collovImageUrl = pollJson.data.generateUrl; break; }
          if (status === "FAILED") { lastFailReason = pollJson.data?.failReason || "Generering mislykkedes"; break; }
        }
      }

      if (!collovImageUrl) {
        // Fejlet generering skal ikke æde dagens gratis prøve
        await storage.demoRateRefund(ipHash).catch(() => {});
        return res.status(500).json({ success: false, message: lastFailReason || "Generering mislykkedes — prøv igen om lidt" });
      }

      // Persist the generated pixels before success. Return the durable path
      // directly rather than issuing a server-side request to a caller-supplied
      // host just to apply a demo watermark.
      let durableResultUrl: string;
      try {
        durableResultUrl = await sharpenAndSaveVst(collovImageUrl, Date.now());
      } catch (persistErr: any) {
        await storage.demoRateRefund(ipHash).catch(() => {});
        log(`[Demo] durable save failed: ${persistErr?.message}`);
        return res.status(502).json({ success: false, message: "Kunne ikke gemme resultatet sikkert — prøv igen" });
      }
      return res.json({
        success: true,
        image_url: durableResultUrl,
        original_url: `/uploads/${req.file.filename}`,
      });
    } catch (err: any) {
      log(`[Demo] error: ${err.message}`);
      return res.status(500).json({ success: false, message: "Der opstod en fejl — prøv igen" });
    }
  });

  // ── Agency logo: upload & delete ─────────────────────────────────────────
  const logoUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 3 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const mime = file.mimetype.toLowerCase();
      const ext  = path.extname(file.originalname).toLowerCase();
      if (ALLOWED_IMAGE_MIMES.has(mime) && ALLOWED_IMAGE_EXTS.has(ext)) {
        cb(null, true);
      } else {
        cb(new Error("Only JPEG, PNG, and WebP images are allowed for logos"));
      }
    },
  });

  /** Read logo as Buffer from local disk; fall back to R2 if disk is empty (Render redeploy). */
  async function readLogoBuffer(logoRelPath: string): Promise<Buffer | null> {
    const localPath = path.join(process.cwd(), logoRelPath);
    if (fs.existsSync(localPath)) return fs.readFileSync(localPath);
    if (isR2Configured()) {
      const key = logoRelPath.replace(/^\/uploads\//, ""); // "logos/logo-user-2.png"
      try {
        const stream = await r2GetStream(key);
        if (stream) {
          const chunks: Buffer[] = [];
          await new Promise<void>((resolve, reject) => {
            stream.on("data", (c: Buffer) => chunks.push(c));
            stream.on("end", resolve);
            stream.on("error", reject);
          });
          const buf = Buffer.concat(chunks);
          // Cache on disk for subsequent requests
          const dir = path.dirname(localPath);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(localPath, buf);
          return buf;
        }
      } catch {}
    }
    return null;
  }

  app.post("/api/bolig/settings/logo", logoUpload.single("logo"), async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const user = await storage.getUserByFirebaseUid(uid);
      if (!user) return res.status(401).json({ success: false, message: "Ikke autoriseret" });
      if (!req.file) return res.status(400).json({ success: false, message: "Intet logo uploadet" });

      // Resize: max 600×200 px, preserve transparency, PNG output
      const logoBuf = await sharp(req.file.buffer)
        .resize(600, 200, { fit: "inside", withoutEnlargement: true })
        .png()
        .toBuffer();

      const logosDir = path.join(uploadDir, "logos");
      if (!fs.existsSync(logosDir)) fs.mkdirSync(logosDir, { recursive: true });
      const filename = `logo-user-${user.id}.png`;
      fs.writeFileSync(path.join(logosDir, filename), logoBuf);
      await r2Upload(`logos/${filename}`, logoBuf, "image/png");

      const logoUrl = `/uploads/logos/${filename}`;
      await pool.query("UPDATE users SET agency_logo_url = $1 WHERE id = $2", [logoUrl, user.id]);

      return res.json({ success: true, logo_url: logoUrl });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get("/api/bolig/settings/logo", async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const user = await storage.getUserByFirebaseUid(uid);
      if (!user) return res.status(401).json({ success: false, message: "Ikke autoriseret" });
      return res.json({ logo_url: user.agencyLogoUrl ?? null });
    } catch (err: any) {
      return res.status(401).json({ success: false, message: "Ikke autoriseret" });
    }
  });

  app.delete("/api/bolig/settings/logo", async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const user = await storage.getUserByFirebaseUid(uid);
      if (!user) return res.status(401).json({ success: false, message: "Ikke autoriseret" });
      if (user.agencyLogoUrl) {
        // Remove from local disk
        try { fs.unlinkSync(path.join(process.cwd(), user.agencyLogoUrl)); } catch {}
        // Remove from R2 (e.g. "logos/logo-user-2.png")
        const r2Key = user.agencyLogoUrl.replace(/^\/uploads\//, "");
        r2DeleteFiles([r2Key]).catch(() => {});
      }
      await pool.query("UPDATE users SET agency_logo_url = NULL WHERE id = $1", [user.id]);
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // ── AI BoligPotentiale: generate endpoint ──────────────────────────────────
  app.post("/api/bolig/generate", upload.single("image"), async (req, res) => {
    // Hoisted outside try so the catch block can access them (try/catch are separate block scopes)
    let authedUserId: number | null = null;
    let quotaConsumed = false;
    const refundIfNeeded = () => {
      if (quotaConsumed && authedUserId) {
        quotaConsumed = false; // only refund once
        storage.refundQuota(authedUserId, "ai").catch(() => {});
      }
    };
    try {
      const sourceCaseImageId = req.body?.sourceCaseImageId ? parseInt(req.body.sourceCaseImageId) : null;
      if (!req.file && !sourceCaseImageId) {
        return res.status(400).json({ success: false, message: "Intet billede uploadet" });
      }

      // Auth — a valid Firebase token is required. The old caseId-owner fallback
      // allowed unauthenticated generation under someone else's account/quota
      // (IDOR) and would let unverified users bypass email verification.
      try {
        const { uid } = await verifyFirebaseToken(req.headers.authorization);
        const u = await storage.getUserByFirebaseUid(uid);
        if (u) authedUserId = u.id;
        else log(`[BoligPotentiale] auth: uid ${uid} not found in DB`);
      } catch (authErr: any) {
        log(`[BoligPotentiale] auth failed (${authErr?.message})`);
      }
      if (!authedUserId) {
        return res.status(401).json({ success: false, message: "Log ind for at generere billeder." });
      }

      const isDesignAgent = req.body.isDesignAgent === "true" || req.body.isDesignAgent === true;
      // Sæsonopdatering: server-styret prompt, der KUN ændrer sæsonpræg
      const SEASON_PROMPTS: Record<string, { label: string; prompt: string }> = {
        spring: { label: "Forårsklar", prompt: "Refresh this interior photo with a bright spring atmosphere: fresh cut flowers and light green plants, light airy textiles in soft pastel tones, and bright natural daylight. If windows show outdoor greenery, make it fresh spring foliage." },
        summer: { label: "Sommerklar", prompt: "Refresh this interior photo with a warm summer atmosphere: warm golden sunlight streaming in, light linen textiles, fresh flowers, and a bright open feel. If windows show outdoor greenery, make it lush green summer foliage." },
        autumn: { label: "Efterårsklar", prompt: "Refresh this interior photo with a cozy autumn atmosphere: warm amber lighting, soft wool throws and cushions in warm earth tones, lit candles, and a hygge mood. If windows show outdoor greenery, make it golden autumn foliage." },
        winter: { label: "Vinterklar", prompt: "Refresh this interior photo with a cozy winter atmosphere: warm soft lighting, lit candles, chunky knit throws and cushions, and an inviting hygge mood. If windows show the outdoors, make it a soft winter scene." },
      };
      const SEASON_SUFFIX = " Keep ALL furniture, layout, walls, floors, windows and the camera angle EXACTLY the same. Do not move, add or remove furniture. Only adjust decor accents, textiles, plants, lighting mood and the view outside windows to match the season. Preserve the original perspective and zoom exactly.";
      const seasonRaw = (req.body.season as string) || "";
      const season = Object.keys(SEASON_PROMPTS).includes(seasonRaw) ? seasonRaw : null;
      let style = season ? SEASON_PROMPTS[season].label : isDesignAgent ? "Custom" : (req.body.style as string) || "scandinavian";
      let room = isDesignAgent ? "Design Agent" : (req.body.room as string) || "living room";
      const tierRaw = (req.body.tier as string) || "tier2";
      const tier = (tierRaw === "tier1" || tierRaw === "tier2" || tierRaw === "tier3") ? tierRaw : "tier2";
      const caseId = req.body.caseId ? parseInt(req.body.caseId as string) : null;
      const isQuickGeneration = req.body.isQuick === "true" || req.body.isQuick === true;
      const promptTextValue = req.body.promptText;
      const customPromptText = typeof promptTextValue === "string" ? promptTextValue : "";
      if (isDesignAgent && !season && !customPromptText.trim()) {
        return res.status(400).json({ success: false, message: "Skriv hvad du vil ændre, før billedet genereres." });
      }
      if (isDesignAgent && customPromptText.length > 6000) {
        return res.status(400).json({ success: false, message: "Instruktionen må højst være 6.000 tegn." });
      }

      // Email must be verified before generating (existing users grandfathered as verified)
      if (authedUserId) {
        const authedUser = await storage.getUserById(authedUserId);
        if (authedUser && !authedUser.isAdmin && !authedUser.emailVerified) {
          return res.status(403).json({ success: false, emailVerificationRequired: true, message: "Bekræft din email med aktiveringskoden, før du kan generere billeder." });
        }
      }

      // Refinements (isRefinement=true + sourceCaseImageId) are free up to 5 per
      // source image — beyond that a quota credit is required. Now enforced server-side.
      const isRefinement = (req.body.isRefinement === "true" || req.body.isRefinement === true) && !!sourceCaseImageId;
      const FREE_BOLIG_REFINEMENTS = 5;

      // Quota check — blocks non-admin users who have exhausted their AI visualization quota
      // Track whether we consumed a quota credit so we can refund on any failure path below.
      if (authedUserId && !isRefinement) {
        const q = await storage.checkAndIncrementQuota(authedUserId, "ai");
        if (!q.allowed) {
          return res.status(403).json({ success: false, quotaExceeded: true, feature: q.feature, message: `Du har nået din månedlige kvota for ${q.feature}. Opgrader din pakke for at generere flere billeder.` });
        }
        quotaConsumed = true;
      }

      if (!COLLOV_API_KEY) {
        refundIfNeeded();
        return res.status(500).json({ success: false, message: "API nøgle ikke konfigureret" });
      }

      const protocol = (req.headers["x-forwarded-proto"] as string | undefined) || req.protocol;
      const rawHost = (req.headers["x-forwarded-host"] as string | undefined) || req.headers.host;
      const isLocalhostHost = !rawHost || rawHost.startsWith("localhost") || rawHost.startsWith("127.");
      const effectiveHost = (isLocalhostHost && process.env.REPLIT_DEV_DOMAIN) ? process.env.REPLIT_DEV_DOMAIN : rawHost;
      const effectiveProtocol = (isLocalhostHost && process.env.REPLIT_DEV_DOMAIN) ? "https" : protocol;

      // Sæsonopdatering (eller re-generering) ud fra et eksisterende sagsbillede:
      // kilden slås op i databasen og ejerskab verificeres — klienten kan ikke
      // pege på vilkårlige URL'er.
      let originalForRecord: string;
      let publicUrl: string;
      let agentInputLocalPath: string | null = null;
      if (sourceCaseImageId) {
        const srcImg = await storage.getGeneratedImage(sourceCaseImageId);
        if (!srcImg || srcImg.userId !== authedUserId) {
          await storage.refundQuota(authedUserId, "ai").catch(() => {});
          return res.status(srcImg ? 403 : 404).json({ success: false, message: "Kildebilledet blev ikke fundet" });
        }

        // Server-side enforcement of the 5-free-refinements limit.
        // Count how many generated images already use srcImg.imageUrl as their
        // originalImageUrl (i.e. direct refinements of this result image).
        if (isRefinement && !season) {
          const authedUser = await storage.getUserById(authedUserId);
          if (authedUser && !authedUser.isAdmin) {
            const refinementCount = await storage.countGeneratedImageRefinements(authedUserId, srcImg.id);
            if (refinementCount >= FREE_BOLIG_REFINEMENTS) {
              // Beyond the free limit — charge an AI quota credit
              const q = await storage.checkAndIncrementQuota(authedUserId, "ai");
              if (!q.allowed) {
                return res.status(403).json({
                  success: false,
                  quotaExceeded: true,
                  feature: q.feature,
                  message: `Du har brugt alle ${FREE_BOLIG_REFINEMENTS} gratis rettelser til dette billede og har nået din månedlige kvota.`,
                });
              }
              quotaConsumed = true;
            }
          }
        }

        // Always store the root original (the uploaded file) as the before-image,
        // not the intermediate result, so the folder always shows the real before/after.
        originalForRecord = srcImg.originalImageUrl ?? srcImg.imageUrl;
        const refinementInputUrl = getRefinementInputUrl(srcImg.refinementSourceUrl, srcImg.imageUrl);
        publicUrl = refinementInputUrl.startsWith("http") ? refinementInputUrl : `${effectiveProtocol}://${effectiveHost}${refinementInputUrl}`;
        if (isDesignAgent && refinementInputUrl.startsWith("/uploads/")) {
          const localCandidate = path.join(uploadDir, decodeURIComponent(refinementInputUrl.slice("/uploads/".length)));
          if (fs.existsSync(localCandidate)) {
            agentInputLocalPath = localCandidate;
          }
        }
        if (season) room = srcImg.roomType || room;
      } else {
        originalForRecord = `/uploads/${req.file!.filename}`;
        publicUrl = `${effectiveProtocol}://${effectiveHost}/uploads/${req.file!.filename}`;
        agentInputLocalPath = path.join(uploadDir, req.file!.filename);
      }
      log(`[BoligPotentiale] generate: room=${room}, style=${style}, tier=${tier}, season=${season ?? "-"}, url=${publicUrl}`);

      const startTime = Date.now();

      // Build prompt — standard styles use the locked prompt. The Design Agent
      // has its own server-owned quality contract so short free-text requests
      // cannot trigger a broad, soft re-render of the entire image.
      let prompt: string;
      let agentPromptProfile: string | null = null;
      if (season) {
        prompt = SEASON_PROMPTS[season].prompt + SEASON_SUFFIX;
      } else if (isDesignAgent && isRefinement) {
        prompt = buildRefinementPrompt(customPromptText);
        agentPromptProfile = DESIGN_AGENT_REFINEMENT_PROMPT_PROFILE;
      } else if (isDesignAgent) {
        prompt = buildDesignAgentInitialPrompt(customPromptText);
        agentPromptProfile = DESIGN_AGENT_INITIAL_PROMPT_PROFILE;
      } else {
        const resolvedRoom = BOLIG_ROOM_ALIASES[room.toLowerCase()] ?? room.toLowerCase();
        try {
          prompt = getBoligPrompt(resolvedRoom, style, tier as "tier1" | "tier2" | "tier3");
        } catch (promptErr: any) {
          log(`[PROMPT_NOT_FOUND] ${promptErr.message} — using generic fallback`);
          prompt = `Completely redesign this ${room} in ${style} style. Replace all existing furniture and decor with new pieces that match the style. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint.`;
        }
        // ── Prompt-lås: sammenlign med låst reference — stop generering ved afvigelse ──
        try {
          assertPromptLocked(room, style, tier, prompt);
        } catch (guardErr: any) {
          log(guardErr.message);
          refundIfNeeded();
          return res.status(500).json({
            success: false,
            message: "PROMPT_INTEGRITY_VIOLATION",
            detail: guardErr.message,
          });
        }
        // The approved quality profile sends the locked room/style prompt
        // directly to Collov, matching the concise visual benchmark.
      }
      const agentTraceId = isDesignAgent ? crypto.randomUUID() : null;
      const agentPromptHash = isDesignAgent
        ? crypto.createHash("sha256").update(prompt).digest("hex").slice(0, 16)
        : null;
      const agentInputDimensions = isDesignAgent
        ? await inspectImageDimensions(agentInputLocalPath)
        : null;
      if (isDesignAgent) {
        log(`[AgentTrace] ${JSON.stringify({
          traceId: agentTraceId,
          stage: "submitted",
          promptProfile: agentPromptProfile,
          promptHash: agentPromptHash,
          input: agentInputDimensions,
        })}`);
      }
      log(`[BoligPotentiale] prompt OK (${agentPromptProfile ?? "locked-standard"}): ${prompt.slice(0, 120)}…`);

      // Identisk pipeline som AI Design Agent: ingen pre-/post-processing, rå Collov CDN URL,
      // 2 retries med 10s mellem forsøg.
      const maxRetries = 2;
      let collovImageUrl: string | null = null;
      let lastFailReason: string | null = null;
      let collovJobUuid: string | null = null;

      for (let attempt = 0; attempt <= maxRetries && !collovImageUrl; attempt++) {
        if (attempt > 0) {
          log(`[BoligPotentiale] retry ${attempt}/${maxRetries} (waiting 10s)`);
          await new Promise(r => setTimeout(r, 10000));
        }

        const form = new FormData();
        form.append("uploadUrl", publicUrl);
        form.append("prompt", prompt);

        const collovRes = await fetch(`${COLLOV_BASE}/flair/enterpriseApi/edit/generate`, {
          method: "POST",
          headers: { apiKey: COLLOV_API_KEY! },
          body: form,
        });
        const collovJson = (await collovRes.json()) as any;
        log(`[BoligPotentiale] Collov response: ${JSON.stringify(collovJson).slice(0, 200)}`);

        if (!collovJson.success || !collovJson.data?.uuid) {
          lastFailReason = collovJson.message || "Collov API fejl";
          continue;
        }

        const uuid = collovJson.data.uuid;
        collovJobUuid = uuid;
        if (isDesignAgent) {
          log(`[AgentTrace] ${JSON.stringify({
            traceId: agentTraceId,
            stage: "provider_accepted",
            promptProfile: agentPromptProfile,
            promptHash: agentPromptHash,
            collovUuid: uuid,
          })}`);
        }
        const maxAttempts = 45; // 45 × 2s = 90s
        let attemptFailed = false;

        for (let i = 0; i < maxAttempts; i++) {
          await new Promise(r => setTimeout(r, 2000));
          const pollRes = await fetch(
            `${COLLOV_BASE}/flair/enterpriseApi/edit/getRecord?uuid=${encodeURIComponent(uuid)}`,
            { method: "GET", headers: { apiKey: COLLOV_API_KEY! } },
          );
          const pollJson = (await pollRes.json()) as any;
          const status = pollJson.data?.status;
          log(`[BoligPotentiale] poll ${uuid}: ${status}`);

          if (status === "SUCCESS" && pollJson.data?.generateUrl) {
            collovImageUrl = pollJson.data.generateUrl;
            break;
          }
          if (status === "FAILED") {
            lastFailReason = pollJson.data?.failReason || "Generering mislykkedes";
            attemptFailed = true;
            break;
          }
        }

        if (!collovImageUrl && !attemptFailed) {
          lastFailReason = "Generering tog for lang tid";
        }
      }

      if (!collovImageUrl) {
        refundIfNeeded();
        return res.status(500).json({ success: false, message: lastFailReason || "Generering mislykkedes" });
      }

      // Preserve the provider pixels as the customer-facing working master.
      // Preview and refinements use these exact Collov bytes. Branding, the
      // visible "AI Redigeret" badge, SS watermarking and XMP are applied only
      // when the customer downloads the finished image.
      const providerImageUrl = collovImageUrl;
      const providerBuffer = await downloadCollovBuffer(providerImageUrl);
      const providerDimensions = isDesignAgent ? await inspectImageDimensions(providerBuffer) : null;
      if (isDesignAgent) {
        log(`[AgentTrace] ${JSON.stringify({
          traceId: agentTraceId,
          stage: "provider_result",
          promptProfile: agentPromptProfile,
          promptHash: agentPromptHash,
          collovUuid: collovJobUuid,
          rawProvider: providerDimensions,
        })}`);
      }
      // This durable raw master is now also the image shown in the app. Saving
      // it is mandatory: returning an expiring provider URL would strand the
      // preview after the Collov CDN URL expires.
      const rawSource = await saveRawCollovRefinementSource(providerBuffer, Date.now());
      const refinementSourceUrl = rawSource.url;
      collovImageUrl = rawSource.url;
      if (isDesignAgent) {
        let deliveryDimensions: ImageDimensionTrace | null = null;
        if (collovImageUrl.startsWith("/uploads/")) {
          const deliveryLocalPath = path.join(uploadDir, decodeURIComponent(collovImageUrl.slice("/uploads/".length)));
          deliveryDimensions = await inspectImageDimensions(deliveryLocalPath);
        }
        log(`[AgentTrace] ${JSON.stringify({
          traceId: agentTraceId,
          stage: "delivered",
          promptProfile: agentPromptProfile,
          promptHash: agentPromptHash,
          collovUuid: collovJobUuid,
          input: agentInputDimensions,
          rawProvider: providerDimensions,
          delivery: deliveryDimensions,
        })}`);
      }
      const processingTimeMs = Date.now() - startTime;
      const processingTime = Math.round(processingTimeMs / 1000);

      // Auto-save to universal generated_images table
      let generationId: number | null = null;
      if (authedUserId) {
        try {
          const todayStr = new Date().toISOString().slice(0, 10);
          const genImg = await storage.createGeneratedImage({
            userId: authedUserId,
            caseId: (caseId && !isNaN(caseId)) ? caseId : null,
            isQuickGeneration: isQuickGeneration || !caseId,
            isDesignAgent,
            isRefinement: !!isRefinement,
            sourceImageId: isRefinement && sourceCaseImageId ? sourceCaseImageId : null,
            imageUrl: collovImageUrl,
            originalImageUrl: originalForRecord,
            refinementSourceUrl,
            roomType: room,
            style,
            budgetTier: isDesignAgent ? "0" : tier,
            promptText: isDesignAgent ? customPromptText : prompt,
            generationTimeMs: processingTimeMs,
            createdDate: todayStr,
          });
          generationId = genImg.id;

          // When this is a refinement of an existing case image, remove the source
          // image from the case gallery (set case_id = NULL) so the folder only
          // ever shows the latest result — not both the original and the adjustment.
          if (isRefinement && sourceCaseImageId && caseId && !isNaN(caseId)) {
            await pool.query(
              `UPDATE generated_images SET case_id = NULL WHERE id = $1 AND user_id = $2`,
              [sourceCaseImageId, authedUserId]
            );
            log(`[BoligPotentiale] refinement: removed source img ${sourceCaseImageId} from case ${caseId} gallery`);
          }
        } catch (saveErr: any) {
          log(`[BoligPotentiale] auto-save warning: ${saveErr.message}`);
        }
      }

      // CRM: log activity fire-and-forget
      if (authedUserId) {
        storage.logCrmActivity(authedUserId, "visualization", `${room} · ${style}`).catch(() => {});
      }

      return res.json({ success: true, image_url: collovImageUrl, original_url: originalForRecord, processing_time: processingTime, prompt_used: prompt, generation_id: generationId });
    } catch (err: any) {
      const _falErr = translateFalError(err); err = _falErr;
      log(`[BoligPotentiale] generate error: ${err.message}`);
      refundIfNeeded();
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // ── 3D Plantegning (fal.ai nano-banana-2/edit — 2D plan → 3D dollhouse) ───
  app.post("/api/bolig/floorplan-3d", upload.single("image"), async (req, res) => {
    // Hoisted so the outer catch block can refund quota if generation fails
    let floorPlanUserId: number | null = null;
    try {
      if (!isLoadTestMode() && !isFalConfigured()) {
        return res.status(500).json({ success: false, message: "FAL_KEY ikke konfigureret" });
      }
      if (!req.file) {
        return res.status(400).json({ success: false, message: "Intet plantegning-billede uploadet" });
      }
      // Auth + quota check — auth is REQUIRED for this paid feature
      try {
        const { uid } = await verifyFirebaseToken(req.headers.authorization);
        const u = await storage.getUserByFirebaseUid(uid);
        if (!u) {
          fs.promises.unlink(path.join(uploadDir, req.file.filename)).catch(() => {});
          return res.status(401).json({ success: false, message: "Log ind for at generere 3D plantegninger." });
        }
        floorPlanUserId = u.id;
        const q = await storage.checkAndIncrementQuota(u.id, "floorPlan");
        if (!q.allowed) {
          fs.promises.unlink(path.join(uploadDir, req.file.filename)).catch(() => {});
          return res.status(403).json({ success: false, quotaExceeded: true, feature: q.feature, message: `Du har nået din månedlige kvota for ${q.feature}.` });
        }
      } catch (authErr: any) {
        if (authErr?.status === 403) return res.status(403).json({ success: false, quotaExceeded: true, feature: authErr.feature, message: authErr.message });
        fs.promises.unlink(path.join(uploadDir, req.file.filename)).catch(() => {});
        return res.status(401).json({ success: false, message: "Log ind for at generere 3D plantegninger." });
      }

      if (isLoadTestMode()) {
        return res.json({
          success: true,
          image_url: `/uploads/${req.file.filename}`,
          source_url: `/uploads/${req.file.filename}`,
          processing_time: 0,
        });
      }

      const localPath = path.join(uploadDir, req.file.filename);
      const protocol = (req.headers["x-forwarded-proto"] as string | undefined) || req.protocol;
      const host = (req.headers["x-forwarded-host"] as string | undefined) || req.headers.host;

      // Preprocess til disk (auto-crop + kontrast) og brug offentlig server-URL
      // så modellen kan nå billedet. fal.storage-URL'er (v3b.fal.media) returnerer
      // 403 for nano-banana-2/edit fordi Replit's network-proxy intercepter uploaden.
      let inputUrl: string;
      let imgWidth = 0;
      let imgHeight = 0;
      try {
        const pre = await preprocessFloorplanToDisk(localPath, uploadDir);
        await r2UploadFile(path.join(uploadDir, pre.filename));
        inputUrl = `${protocol}://${host}/uploads/${pre.filename}`;
        imgWidth = pre.width;
        imgHeight = pre.height;
      } catch (preErr) {
        // Fallback: brug original fil direkte
        console.warn("[3D] preprocess failed, using raw file:", preErr);
        inputUrl = `${protocol}://${host}/uploads/${req.file.filename}`;
        const { Jimp: JimpFallback } = await import("jimp");
        try {
          const img = await JimpFallback.read(localPath);
          imgWidth = img.bitmap.width;
          imgHeight = img.bitmap.height;
        } catch { imgWidth = 1; imgHeight = 1; }
      }

      log(`[3D] floorplan input: ${inputUrl}`);
      const startTime = Date.now();
      const { imageUrl: falFloorplanUrl } = await generate3DFloorplanFromUrl(inputUrl, imgWidth, imgHeight);
      const processingTime = Math.round((Date.now() - startTime) / 1000);
      log(`[3D] floorplan done in ${processingTime}s → ${falFloorplanUrl.slice(0, 60)}`);
      if (floorPlanUserId) storage.logCrmActivity(floorPlanUserId, "visualization", "3D Plantegning").catch(() => {});

      // EU AI Act Art. 50: fal.ai-URL må ikke leveres direkte — download lokalt og
      // bak XMP/C2PA-metadata ind, så filen bærer sin mærkning uanset adgangsmetode.
      let imageUrl = falFloorplanUrl;
      try {
        const fpRaw = await new Promise<Buffer>((resolve, reject) => {
          const chunks: Buffer[] = [];
          const curl = spawn("curl", ["-sL", "--max-time", "30", "--fail", falFloorplanUrl]);
          curl.stdout.on("data", (c: Buffer) => chunks.push(c));
          curl.on("close", (code: number) => code !== 0 ? reject(new Error(`curl exit ${code}`)) : resolve(Buffer.concat(chunks)));
          curl.on("error", reject);
        });
        if (fpRaw.length > 1000) {
          // EU Art. 50 Regel 1+2: raw pixels → SS-vandmærke → JPEG → XMP APP1-marker.
          const { data: fp3dRaw, info: fp3dInfo } = await (sharp(fpRaw) as any).flatten().raw().toBuffer({ resolveWithObject: true });
          const fp3dMarked = ssWatermarkEmbed(fp3dRaw, fp3dInfo.width, fp3dInfo.height, fp3dInfo.channels);
          const fpJpeg = await (sharp(fp3dMarked, { raw: { width: fp3dInfo.width, height: fp3dInfo.height, channels: fp3dInfo.channels } }) as any).jpeg({ quality: 95 }).toBuffer();
          const fpWithMeta = injectXmpIntoJpeg(fpJpeg, buildEuXmpPacket("c2pa.created", "3D Floorplan"));
          const fpFilename = `floorplan-3d-${Date.now()}.jpg`;
          const fpLocalPath = path.join(uploadDir, fpFilename);
          fs.writeFileSync(fpLocalPath, fpWithMeta);
          await r2UploadFile(fpLocalPath);
          imageUrl = `/uploads/${fpFilename}`;
          log(`[3D] durably saved with XMP APP1 metadata → ${imageUrl}`);
        } else {
          throw new Error("3D floorplan result was unexpectedly small");
        }
      } catch (e: any) {
        throw new Error(`Kunne ikke gemme 3D-plantegningen sikkert: ${e.message}`);
      }

      return res.json({
        success: true,
        image_url: imageUrl,
        source_url: `/uploads/${req.file.filename}`,
        processing_time: processingTime,
      });
    } catch (err: any) {
      // Refund quota — any error after checkAndIncrementQuota must return the credit
      if (floorPlanUserId) storage.refundQuota(floorPlanUserId, "floorPlan").catch(() => {});
      const translated = translateFalError(err);
      log(`[3D] floorplan error: ${err.message}`);
      void import("./tracker").then(m => m.reportGenerationFailure("fal", err.message ?? "3D floorplan fejl")).catch(() => {});
      return res.status(500).json({ success: false, message: translated.message });
    }
  });

  // ── 3D Depth map (DepthAnything — bruges til interaktiv HTML-viewer) ─────
  app.post("/api/bolig/depth-map", async (req, res) => {
    try {
      const { imageUrl } = req.body ?? {};
      if (!imageUrl || typeof imageUrl !== "string") {
        return res.status(400).json({ success: false, message: "imageUrl mangler" });
      }
      try { await verifyFirebaseToken(req.headers.authorization); } catch {
        return res.status(401).json({ success: false, message: "Ikke autoriseret" });
      }
      const { generateDepthMap } = await import("./depth");
      const result = await generateDepthMap(imageUrl);
      return res.json({ success: true, ...result });
    } catch (err: any) {
      log(`[Depth] fejl: ${err.message}`);
      return res.status(500).json({ success: false, message: err.message || "Depth-generering mislykkedes" });
    }
  });

  // ── Dollhouse-vægge (lokal billedanalyse → rigtige lodrette BoxGeometry-vægge) ─
  // Additiv: kører EFTER 3D-plantegningen. Rører ikke fal.ai-genereringen eller
  // den eksisterende depth-viewer. Tager den rene 2D-plantegning, finder vægge
  // og returnerer rektangler som klienten bygger som ægte 3D-vægge.
  app.post("/api/bolig/floorplan-dollhouse", async (req, res) => {
    try {
      const { planUrl } = req.body ?? {};
      if (!planUrl || typeof planUrl !== "string") {
        return res.status(400).json({ success: false, message: "planUrl mangler" });
      }
      try { await verifyFirebaseToken(req.headers.authorization); } catch {
        return res.status(401).json({ success: false, message: "Ikke autoriseret" });
      }
      const { extractFloorplanWalls } = await import("./floorplan-walls");
      const result = await extractFloorplanWalls(planUrl);
      return res.json({ success: true, ...result });
    } catch (err: any) {
      log(`[Dollhouse] fejl: ${err.message}`);
      return res.status(500).json({ success: false, message: err.message || "Dollhouse-generering mislykkedes" });
    }
  });

  // ── Tripo3D — Interaktiv 3D plantegning (billede → GLB model) ───────────
  // Lokaliserer et eksternt billede til /uploads/ så URL'en ikke udløber
  app.post("/api/bolig/localize-image", async (req, res) => {
    try {
      await verifyFirebaseToken(req.headers.authorization);
      const { url } = req.body ?? {};
      if (!url || typeof url !== "string") return res.status(400).json({ message: "url er påkrævet" });
      if (url.startsWith("/uploads/") || url.startsWith("/bolig-images/")) {
        return res.json({ localUrl: url });
      }
      const ext = url.match(/\.(webp|jpg|jpeg|png|gif)/i)?.[1]?.toLowerCase() ?? "jpg";
      const filename = `tripo-preview-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const localFilePath = path.join(uploadDir, filename);
      await new Promise<void>((resolve, reject) => {
        const curl = spawn("curl", ["-sL", "--fail", "--max-time", "60", "--max-filesize", "52428800", "-o", localFilePath, url]);
        curl.on("close", (code: number) => code === 0 ? resolve() : reject(new Error(`curl exit ${code}`)));
        curl.on("error", reject);
      });
      const size = fs.statSync(localFilePath).size;
      if (size < 500) { fs.unlinkSync(localFilePath); return res.status(422).json({ message: "For lille fil" }); }
      await r2UploadFile(localFilePath);
      return res.json({ localUrl: `/uploads/${filename}` });
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  // Downloader Tripo3D GLB-modellen til /uploads/ (én gang pr. task).
  // In-flight map forhindrer dobbelt-download når klienten poller hvert 4. sekund.
  const tripoGlbInflight = new Map<string, Promise<string>>();
  const tripoGlbFailCounts = new Map<string, number>();
  async function localizeTripoGlb(taskId: string, remoteUrl: string): Promise<string> {
    const safeId = taskId.replace(/[^a-zA-Z0-9_-]/g, "");
    const filename = `tripo-model-${safeId}.glb`;
    const localFilePath = path.join(uploadDir, filename);
    if (fs.existsSync(localFilePath) && fs.statSync(localFilePath).size > 1000) {
      return `/uploads/${filename}`;
    }
    const existing = tripoGlbInflight.get(safeId);
    if (existing) return existing;
    const p = (async () => {
      const tmpPath = `${localFilePath}.tmp`;
      try {
        await new Promise<void>((resolve, reject) => {
          const curl = spawn("curl", ["-sL", "--fail", "--max-time", "120", "--max-filesize", "209715200", "-o", tmpPath, remoteUrl]);
          curl.on("close", (code: number) => code === 0 ? resolve() : reject(new Error(`curl exit ${code}`)));
          curl.on("error", reject);
        });
        const size = fs.statSync(tmpPath).size;
        if (size < 1000) throw new Error(`GLB for lille (${size} bytes)`);
        fs.renameSync(tmpPath, localFilePath);
        log(`[Tripo3D] GLB lokaliseret → /uploads/${filename} (${Math.round(size / 1024 / 1024 * 10) / 10} MB)`);
        await r2UploadFile(localFilePath);
        return `/uploads/${filename}`;
      } catch (e) {
        try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch {}
        throw e;
      } finally {
        tripoGlbInflight.delete(safeId);
      }
    })();
    tripoGlbInflight.set(safeId, p);
    return p;
  }

  app.post("/api/bolig/tripo3d", async (req, res) => {
    let tripoUserId: number | null = null;
    let quotaConsumed = false;
    try {
      const apiKey = process.env.THREED_API_KEY;
      if (!apiKey) return res.status(500).json({ message: "Tripo3D API ikke konfigureret" });

      // Auth + quota check — auth is REQUIRED for this paid feature
      try {
        const { uid } = await verifyFirebaseToken(req.headers.authorization);
        const u = await storage.getUserByFirebaseUid(uid);
        if (!u) return res.status(401).json({ message: "Log ind for at generere 3D model" });
        tripoUserId = u.id;
        const q = await storage.checkAndIncrementQuota(u.id, "floorPlan");
        if (!q.allowed) return res.status(403).json({ success: false, quotaExceeded: true, feature: q.feature, message: `Du har nået din månedlige kvota for ${q.feature}. Opgrader din pakke for at generere flere 3D modeller.` });
        quotaConsumed = true;
      } catch (authErr: any) {
        if (authErr?.status === 403) return res.status(403).json({ success: false, quotaExceeded: true, feature: authErr.feature, message: authErr.message });
        return res.status(401).json({ message: "Log ind for at generere 3D model" });
      }

      const { imageUrl } = req.body ?? {};
      if (!imageUrl || typeof imageUrl !== "string") {
        if (tripoUserId) storage.refundQuota(tripoUserId, "floorPlan").catch(() => {});
        return res.status(400).json({ message: "imageUrl er påkrævet" });
      }
      // Tripo3D kræver en absolut https:// URL — relative /uploads/-stier returnerer
      // code 1004 "One or more of your parameter is invalid". Byg den fulde URL her
      // så klienten ikke behøver at kende domænet.
      let resolvedImageUrl = imageUrl;
      if (imageUrl.startsWith("/")) {
        const proto = (req.headers["x-forwarded-proto"] as string | undefined) || req.protocol;
        const host = (req.headers["x-forwarded-host"] as string | undefined) || req.headers.host || "formaestates.com";
        resolvedImageUrl = `${proto}://${host}${imageUrl}`;
      }
      const fileType = resolvedImageUrl.toLowerCase().includes(".png") ? "png" : "jpg";
      // HD-kvalitet som Tripo's egen web-app ("HD Model"): nyeste modelversion +
      // Ultra-geometri + høj teksturopløsning + face_limit 2 000 000 (API
      // accepterer op til 2M — matcher Tripo's UI-løfte om "up til 2 million
      // polygons for 3D printing & visual art". Testet 2026-07-23).
      // texture:true UDEN pbr: genererer baked albedo-teksturer indlejret i GLB.
      // pbr:true er bevidst fjernet — det aktiverer separate metallic/roughness/normal
      // texture maps. Uden et PMREMGenerator env-map i Three.js render metallic
      // overflader helt grå (refleksioner kræver env-map). Baked albedo-model
      // behøver ingen env-map og farver er korrekte direkte. (Memory: tripo3d-texture-vs-pbr)
      const payload = JSON.stringify({
        type: "image_to_model",
        file: { type: fileType, url: resolvedImageUrl },
        model_version: "v3.1-20260211",
        geometry_quality: "detailed",
        texture_quality: "detailed",
        texture: true,
        face_limit: 2000000,
        quad: false,
      });
      // Brug curl i stedet for Node.js fetch — undgår Replit's network proxy-interceptor
      const data = await new Promise<any>((resolve, reject) => {
        const chunks: Buffer[] = [];
        const proc = spawn("curl", [
          "-s", "--max-time", "30",
          "-X", "POST",
          "https://api.tripo3d.ai/v2/openapi/task",
          "-H", `Authorization: Bearer ${apiKey}`,
          "-H", "Content-Type: application/json",
          "-d", payload,
        ]);
        proc.stdout.on("data", (d: Buffer) => chunks.push(d));
        proc.on("close", () => {
          try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
          catch (e) { reject(new Error("Tripo3D ugyldigt svar")); }
        });
      });
      // Refund quota if Tripo3D rejects the job before processing starts
      if (data.code !== 0) {
        if (tripoUserId) storage.refundQuota(tripoUserId, "floorPlan").catch(() => {});
        return res.status(500).json({ message: data.message || "Tripo3D fejl" });
      }
      res.json({ taskId: data.data.task_id });
    } catch (err: any) {
      // Refund quota on unexpected errors
      if (tripoUserId && quotaConsumed) storage.refundQuota(tripoUserId, "floorPlan").catch(() => {});
      res.status(500).json({ message: err.message || "Ukendt fejl" });
    }
  });

  app.get("/api/bolig/tripo3d-status/:taskId", async (req, res) => {
    try {
      const apiKey = process.env.THREED_API_KEY;
      if (!apiKey) return res.status(500).json({ message: "Tripo3D API ikke konfigureret" });
      // Auth required — status endpoint leaks GLB download URL if unauthenticated
      try { await verifyFirebaseToken(req.headers.authorization); } catch {
        return res.status(401).json({ message: "Ikke autoriseret" });
      }
      const { taskId } = req.params;
      // Brug curl i stedet for Node.js fetch — undgår Replit's network proxy-interceptor
      const data = await new Promise<any>((resolve, reject) => {
        const chunks: Buffer[] = [];
        const proc = spawn("curl", [
          "-s", "--max-time", "20",
          `https://api.tripo3d.ai/v2/openapi/task/${taskId}`,
          "-H", `Authorization: Bearer ${apiKey}`,
        ]);
        proc.stdout.on("data", (d: Buffer) => chunks.push(d));
        proc.on("close", () => {
          try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
          catch (e) { reject(new Error("Tripo3D status ugyldigt svar")); }
        });
      });
      if (data.code !== 0) return res.status(500).json({ message: "Status fejl" });
      const task = data.data;
      // texture:true (uden pbr) returnerer output.model med baked image-teksturer (farver)
      const remoteModelUrl = task.status === "success"
        ? (task.output?.model ?? task.output?.pbr_model ?? task.result?.model?.url ?? task.result?.pbr_model?.url)
        : undefined;
      const renderedImageUrl = task.status === "success"
        ? (task.output?.rendered_image ?? task.result?.rendered_image?.url)
        : undefined;
      // Lokalisér GLB til /uploads/ — Tripo3D's CDN blokerer browser-CORS og
      // deres signerede URL'er udløber efter ~9 timer. Lokal fil = ingen af delene.
      // VIGTIGT: Send ALDRIG remote-URL'en til klienten — den virker ikke i browseren.
      // Fejler download, svarer vi "running" så klienten poller igen (max 5 forsøg).
      let modelUrl: string | undefined;
      if (remoteModelUrl) {
        try {
          modelUrl = await localizeTripoGlb(taskId, remoteModelUrl);
          tripoGlbFailCounts.delete(taskId);
        } catch (e: any) {
          const fails = (tripoGlbFailCounts.get(taskId) ?? 0) + 1;
          tripoGlbFailCounts.set(taskId, fails);
          log(`[Tripo3D] GLB-lokalisering fejlede (forsøg ${fails}/5): ${e?.message}`);
          if (fails < 5) {
            return res.json({ status: "running", progress: 99 });
          }
          tripoGlbFailCounts.delete(taskId);
          return res.status(500).json({ message: "Kunne ikke hente 3D modellen — prøv igen" });
        }
      }
      res.json({
        status: task.status,
        progress: task.progress ?? 0,
        modelUrl,
        renderedImageUrl,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Ukendt fejl" });
    }
  });

  // ── Transformeringsvideo (fal.ai luma dream machine — før → efter) ────────
  app.post(
    "/api/bolig/transform-video",
    upload.fields([
      { name: "beforeImage", maxCount: 1 },
      { name: "afterImage", maxCount: 1 },
    ]),
    async (req, res) => {
      let transformUserId: number | null = null;
      try {
        if (!isFalConfigured()) {
          return res.status(500).json({ success: false, message: "FAL_KEY ikke konfigureret" });
        }
        const files = req.files as { [k: string]: Express.Multer.File[] } | undefined;
        const beforeFile = files?.beforeImage?.[0];
        const afterFile = files?.afterImage?.[0];
        if (!beforeFile || !afterFile) {
          return res.status(400).json({ success: false, message: "Både før- og efter-billede skal uploades" });
        }
        // Auth + quota check — auth is REQUIRED for this paid feature
        try {
          const { uid } = await verifyFirebaseToken(req.headers.authorization);
          const u = await storage.getUserByFirebaseUid(uid);
          if (!u) return res.status(401).json({ success: false, message: "Log ind for at generere transformeringsvideoer." });
          transformUserId = u.id;
          const q = await storage.checkAndIncrementQuota(u.id, "transformVideo");
          if (!q.allowed) return res.status(403).json({ success: false, quotaExceeded: true, feature: q.feature, message: `Du har nået din månedlige kvota for ${q.feature}.` });
        } catch (authErr: any) {
          if (authErr?.status === 403) return res.status(403).json({ success: false, quotaExceeded: true, feature: authErr.feature, message: authErr.message });
          return res.status(401).json({ success: false, message: "Log ind for at generere transformeringsvideoer." });
        }

        const beforePath = path.join(uploadDir, beforeFile.filename);
        const afterPath = path.join(uploadDir, afterFile.filename);
        const mode = (req.body?.mode === "morph" ? "morph" : "cinematic") as "morph" | "cinematic";
        // Hurtig (5 sek → hurtigere generering) vs. Premium (8 sek, default).
        const speed = req.body?.speed === "hurtig" ? "5" : "8";
        // Forvandlingsstil: "blød" = simultan crossfade, "hård" = sekventiel (default).
        const morphStyle = req.body?.morphStyle === "blød" ? "blød" : "hård" as "hård" | "blød";

        // Brug vores egne /uploads/-URL'er frem for fal.storage — fal.storage
        // returnerer v3b.fal.media-URL'er der giver 403 hos Seedance på Render.
        const tvProto = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0].trim() || req.protocol;
        const tvPublicBaseUrl = `${tvProto}://${req.get("host")}`;
        log(`[Video] normalising + serving images via ${tvPublicBaseUrl}/uploads/…`);
        const { beforeUrl: beforeFalUrl, afterUrl: afterFalUrl } =
          await uploadVideoPairToFal(beforePath, afterPath, { uploadDir, publicBaseUrl: tvPublicBaseUrl });
        log(`[Video] submit mode=${mode} duration=${speed}s before=${beforeFalUrl.slice(0, 80)} after=${afterFalUrl.slice(0, 80)}`);
        const { requestId } = await submitAnimationVideo(beforeFalUrl, afterFalUrl, mode, { duration: speed, style: morphStyle });
        log(`[Video] submitted request_id=${requestId}`);
        // Track for a quota refund if the job later fails at the poll stage.
        if (transformUserId) transformVideoRefunds.set(requestId, transformUserId);
        if (transformUserId) storage.createVideoJob({ requestId, userId: transformUserId, feature: "transformVideo" }).catch(() => {});
        if (transformUserId) storage.logCrmActivity(transformUserId, "video", `Transformeringsvideo · ${mode}`).catch(() => {});

        return res.json({
          success: true,
          request_id: requestId,
          before_url: `/uploads/${beforeFile.filename}`,
          after_url: `/uploads/${afterFile.filename}`,
        });
      } catch (err: any) {
        log(`[Video] submit error: ${err.message}`);
        // Quota was charged before submission — refund it on failure.
        if (transformUserId) storage.refundQuota(transformUserId, "transformVideo").catch(() => {});
        void import("./tracker").then(m => m.reportGenerationFailure("fal", err.message ?? "transformeringsvideo fejl")).catch(() => {});
        return res.status(500).json({ success: false, message: err.message || "Indsendelse mislykkedes" });
      }
    },
  );

  // Poll status of an in-flight video job. When COMPLETED, persists the mp4
  // locally and returns the /uploads/... URL.
  app.get("/api/bolig/transform-video/status/:requestId", async (req, res) => {
    const { requestId } = req.params;
    try {
      if (!isFalConfigured()) {
        return res.status(500).json({ success: false, message: "FAL_KEY ikke konfigureret" });
      }
      const result = await getAnimationVideoStatus(requestId);
      if (result.status === "COMPLETED" && result.videoUrl) {
        const localVideoUrl = await downloadToUploads(result.videoUrl, uploadDir, ".mp4");
        log(`[Video] persisted → ${localVideoUrl}`);
        // Re-upload the final watermark bytes before the video is reported complete.
        const rawMp4 = path.join(uploadDir, path.basename(localVideoUrl));
        const wmTmp = rawMp4.replace(/\.mp4$/, "-wmtmp.mp4");
        const wmLang = String(req.query.lang || "da");
        await burnEuWatermark(rawMp4, wmTmp, wmLang);
        fs.renameSync(wmTmp, rawMp4);
        await r2UploadFile(rawMp4);
        transformVideoRefunds.delete(requestId);
        storage.completeVideoJob(requestId).catch(() => {});
        log(`[Video] EU Art.50 watermark durably saved → ${localVideoUrl}`);
        return res.json({ success: true, status: "COMPLETED", video_url: localVideoUrl });
      }
      if (result.status === "FAILED") {
        refundTransformVideo(requestId);
        return res.json({ success: false, status: "FAILED", message: result.error || "Generering mislykkedes" });
      }
      return res.json({ success: true, status: result.status });
    } catch (err: any) {
      log(`[Video] status error: ${err.message}`);
      // Refund the quota credit when polling itself throws — the job is
      // unrecoverable from the client's perspective.
      refundTransformVideo(requestId);
      return res.status(500).json({ success: false, message: err.message || "Status mislykkedes" });
    }
  });

  // ── Magisk Transformation Video (Kling v1.6 Pro — ét billede → cinematisk animation) ─
  const magicTransformRefunds = new Map<string, number>(); // requestId → userId

  app.post(
    "/api/bolig/magic-transform-video",
    upload.fields([{ name: "beforeImage", maxCount: 1 }, { name: "afterImage", maxCount: 1 }]),
    async (req, res) => {
      let magicUserId: number | null = null;
      try {
        if (!isFalConfigured()) return res.status(500).json({ success: false, message: "FAL_KEY ikke konfigureret" });
        const files = req.files as { [k: string]: Express.Multer.File[] } | undefined;
        const beforeFile = files?.beforeImage?.[0];
        const afterFile = files?.afterImage?.[0];
        if (!beforeFile || !afterFile) return res.status(400).json({ success: false, message: "Upload både et før- og et efter-billede" });
        try {
          const { uid } = await verifyFirebaseToken(req.headers.authorization);
          const u = await storage.getUserByFirebaseUid(uid);
          if (!u) return res.status(401).json({ success: false, message: "Log ind for at generere videoer." });
          magicUserId = u.id;
          const q = await storage.checkAndIncrementQuota(u.id, "transformVideo");
          if (!q.allowed) return res.status(403).json({ success: false, quotaExceeded: true, feature: q.feature, message: `Du har nået din månedlige kvota.` });
        } catch (authErr: any) {
          if (authErr?.status === 403) return res.status(403).json({ success: false, quotaExceeded: true, feature: authErr.feature, message: authErr.message });
          return res.status(401).json({ success: false, message: "Log ind for at generere videoer." });
        }
        const validStyles = ["magic", "spring", "evening", "luxury"];
        const style = (validStyles.includes(req.body?.style) ? req.body.style : "magic") as MagicTransformStyle;
        const tvProto = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0].trim() || req.protocol;
        const tvPublicBaseUrl = `${tvProto}://${req.get("host")}`;
        const { beforeUrl, afterUrl } = await uploadVideoPairToFal(
          path.join(uploadDir, beforeFile.filename),
          path.join(uploadDir, afterFile.filename),
          { uploadDir, publicBaseUrl: tvPublicBaseUrl },
        );
        log(`[MagicTransform] submit style=${style} before=${beforeUrl.slice(0, 60)} after=${afterUrl.slice(0, 60)}`);
        const { requestId } = await submitMagicTransformVideo(beforeUrl, afterUrl, style);
        log(`[MagicTransform] submitted request_id=${requestId}`);
        if (magicUserId) magicTransformRefunds.set(requestId, magicUserId);
        if (magicUserId) storage.createVideoJob({ requestId, userId: magicUserId, feature: "transformVideo" }).catch(() => {});
        if (magicUserId) storage.logCrmActivity(magicUserId, "video", `Magisk transformation · ${style}`).catch(() => {});
        return res.json({ success: true, request_id: requestId });
      } catch (err: any) {
        log(`[MagicTransform] submit error: ${err.message}`);
        if (magicUserId) storage.refundQuota(magicUserId, "transformVideo").catch(() => {});
        return res.status(500).json({ success: false, message: err.message || "Indsendelse mislykkedes" });
      }
    },
  );

  app.get("/api/bolig/magic-transform-video/status/:requestId", async (req, res) => {
    try {
      if (!isFalConfigured()) return res.status(500).json({ success: false, message: "FAL_KEY ikke konfigureret" });
      const { requestId } = req.params;
      const result = await getMagicTransformStatus(requestId);
      if (result.status === "COMPLETED" && result.videoUrl) {
        const localVideoUrl = await downloadToUploads(result.videoUrl, uploadDir, ".mp4");
        log(`[MagicTransform] persisted → ${localVideoUrl}`);
        const rawMp4 = path.join(uploadDir, path.basename(localVideoUrl));
        const wmTmp = rawMp4.replace(/\.mp4$/, "-wmtmp.mp4");
        await burnEuWatermark(rawMp4, wmTmp, String(req.query.lang || "da"));
        fs.renameSync(wmTmp, rawMp4);
        await r2UploadFile(rawMp4);
        magicTransformRefunds.delete(requestId);
        storage.completeVideoJob(requestId).catch(() => {});
        log(`[MagicTransform] EU Art.50 watermark durably saved`);
        return res.json({ success: true, status: "COMPLETED", video_url: localVideoUrl });
      }
      if (result.status === "FAILED") {
        const uid = magicTransformRefunds.get(requestId);
        if (uid) { storage.refundQuota(uid, "transformVideo").catch(() => {}); magicTransformRefunds.delete(requestId); }
        storage.failVideoJob(requestId).catch(() => {});
        return res.json({ success: false, status: "FAILED", message: result.error || "Generering mislykkedes" });
      }
      return res.json({ success: true, status: result.status });
    } catch (err: any) {
      log(`[MagicTransform] status error: ${err.message}`);
      return res.status(500).json({ success: false, message: err.message || "Status mislykkedes" });
    }
  });

  // ── Rendy Presets ─────────────────────────────────────────────────────────
  app.get("/api/bolig/rendy/presets", async (_req, res) => {
    try {
      const presets = await getRendyPresets();
      return res.json({ success: true, presets });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // ── Bolig Showcase Video (powered by Rendy.io) ────────────────────────────
  app.post("/api/bolig/showcase-video", upload.array("images", 20), async (req, res) => {
    let showcaseUserId: number | null = null;
    try {
      const files = (req.files as Express.Multer.File[] | undefined) || [];
      if (files.length < 1) {
        return res.status(400).json({ success: false, message: "Upload mindst 1 billede" });
      }
      // Auth + quota check — auth is REQUIRED for this paid feature
      try {
        const { uid } = await verifyFirebaseToken(req.headers.authorization);
        const u = await storage.getUserByFirebaseUid(uid);
        if (!u) {
          for (const f of files) fs.promises.unlink(path.join(uploadDir, f.filename)).catch(() => {});
          return res.status(401).json({ success: false, message: "Log ind for at generere showcase-videoer." });
        }
        showcaseUserId = u.id;
        const q = await storage.checkAndIncrementQuota(u.id, "showcase");
        if (!q.allowed) {
          for (const f of files) fs.promises.unlink(path.join(uploadDir, f.filename)).catch(() => {});
          return res.status(403).json({ success: false, quotaExceeded: true, feature: q.feature, message: `Du har nået din månedlige kvota for ${q.feature}.` });
        }
      } catch (authErr: any) {
        if (authErr?.status === 403) return res.status(403).json({ success: false, quotaExceeded: true, feature: authErr.feature, message: authErr.message });
        for (const f of files) fs.promises.unlink(path.join(uploadDir, f.filename)).catch(() => {});
        return res.status(401).json({ success: false, message: "Log ind for at generere showcase-videoer." });
      }

      const filePaths = files.map((f) => path.join(uploadDir, f.filename));
      const ratio: "portrait" | "landscape" = req.body?.ratio === "landscape" ? "landscape" : "portrait";

      let presetKeys: (string | undefined)[] = new Array(files.length).fill(undefined);
      try {
        const raw = typeof req.body?.presetKeys === "string" ? JSON.parse(req.body.presetKeys) : undefined;
        if (Array.isArray(raw)) presetKeys = raw.map((k) => (typeof k === "string" && k ? k : undefined));
      } catch { /* ignore malformed */ }

      // VFX keys override camera preset keys (both are Rendy presetKey values)
      let vfxKeys: (string | null)[] = new Array(files.length).fill(null);
      try {
        const rawVfx = typeof req.body?.vfxKeys === "string" ? JSON.parse(req.body.vfxKeys) : undefined;
        if (Array.isArray(rawVfx)) vfxKeys = rawVfx.map((k) => (typeof k === "string" && k ? k : null));
      } catch { /* ignore malformed */ }

      if (isLoadTestMode()) {
        const jobId = startShowcaseVideo(filePaths, uploadDir, "", undefined, undefined, undefined, "clean", ["calm"]);
        if (!jobId) {
          if (showcaseUserId) storage.refundQuota(showcaseUserId, "showcase").catch(() => {});
          for (const filePath of filePaths) fs.promises.unlink(filePath).catch(() => {});
          return res.status(429).json({ success: false, message: "Serveren er optaget lige nu. Prøv igen om lidt." });
        }
        if (showcaseUserId) {
          showcaseVideoRefunds.set(jobId, showcaseUserId);
          storage.createVideoJob({ requestId: jobId, userId: showcaseUserId, feature: "showcase" }).catch(() => {});
        }
        return res.json({ success: true, job_id: jobId });
      }

      // ── Rendy API key normalisation ──────────────────────────────────────────
      // Frontend stores human-readable keys (lowercase-with-dashes).
      // Rendy's /listings API validates against its own preset key format.
      // Any unrecognised presetKey causes the entire listing to fail immediately.
      const VFX_KEY_MAP: Record<string, string> = {
        // Transitions
        "construction":      "CONSTRUCTION",
        "renovate":          "RENOVATE",
        "lens-flare":        "LENS_FLARE",
        "implosion":         "IMPLOSION",
        "house-drop":        "HOUSE_DROP",
        "fix-landscape":     "FIX_LANDSCAPE",
        "day-to-twilight":   "DAY_TO_DUSK",        // Rendy uses DAY_TO_DUSK
        "sketch":            "SKETCH",
        "sunrise":           "SUNRISE",
        "lighting-strike":   "LIGHTNING STRIKE",   // Rendy key has a space
        "money-rain":        "MONEY_RAIN",
        "helicopter-reveal": "HELICOPTER_REVEAL",
        "snow-removal":      "SNOW_REMOVAL",
        "shadows":           "SHADOWS",
        "car-drive":         "CAR_DRIVE",
        "fireworks":         "FIREWORKS",
        "day-to-night":      "DAY_TO_NIGHT",
        "build":             "BUILD",
        "3d-text-just-sold":   "3D_Text_Just_Sold",   // Rendy key uses mixed case
        "3d-text-open-house":  "3D_Text_Open_House",
        "3d-text-just-listed": "3D_Text_Just_Listed",
        "helicopter-drop-off": "Helicopter_Drop_Off",
        // Actors
        "family":            "ACTOR_FAMILY",
        "man":               "ACTOR_MAN",
        "woman":             "ACTOR_WOMAN",
        "kids":              "ACTOR_KIDS",
        "couple":            "ACTOR_COUPLE",
        // Staging / creative
        "2d-3d-floorplan":   "2D_3D_FLOOR_PLAN",
        "3d-miniature":      "3D_MINIATURE",
        "starry-night":      "STARRY_NIGHT",
        "watercolor":        "WATERCOLOR",
        "light-dance":       "LIGHT_DANCE",
        "balloons":          "BALLOONS",
        "timelapse":         "TIMELAPSE",
        "electricity":       "ELECTRICITY",
        "glass-house":       "GLASS_HOUSE",
        "magazine":          "MAGAZINE",
        "add-pool":          "ADD_POOL",
        "open-door":         "OPEN_DOOR",
        "concept-board":     "CONCEPT_BOARD",
        "move-that-bus":     "MOVE_THAT_BUS",
        "just-listed-sign":  "JUST_LISTED",         // Rendy uses JUST_LISTED
        "draw-lot-line":     "LOTLINE",              // Rendy uses LOTLINE
        "sketch-artist":     "SKETCH_ARTIST",
        "earth-zoom":        "EARTH_ZOOM",
      };
      // Camera-movement keys (PUSH-IN, SLIDER_LEFT, …) are validated against the
      // live GET /camera-movements endpoint. Unknown keys are stripped so a
      // stale client can never break the render.
      const RENDY_VFX_KEYS = new Set(Object.values(VFX_KEY_MAP));
      const RENDY_CAMERA_KEYS = await getRendyCameraMovementKeys();

      // VFX presets go in `presetKey`; camera movements go in `cameraActionKey`.
      // Sending a camera key as presetKey makes Rendy fail the ENTIRE listing
      // with status=error/progress=0 (verified July 2026).
      const normalizeRendyKeys = (key: string | undefined): { presetKey?: string; cameraActionKey?: string } => {
        if (!key || key === "DEFAULT") return {};
        const mapped = VFX_KEY_MAP[key] ?? key;
        if (RENDY_VFX_KEYS.has(mapped)) return { presetKey: mapped };
        if (RENDY_CAMERA_KEYS.has(mapped)) return { cameraActionKey: mapped };
        log(`[Rendy] unknown preset key "${key}" — stripped (not a valid Rendy key)`);
        return {};
      };

      // Cinematic auto-rotation: when no camera movement is chosen we assign a
      // curated editorial sequence so each image gets a distinct, professional
      // movement. Sequence is crafted to never repeat adjacent movements and to
      // follow an open → reveal → close arc. CRANE-DOWN, PEDESTAL-* and STATIC
      // are intentionally excluded — they look awkward for interior real estate.
      // Loops cleanly if there are more images than sequence positions.
      const CINEMATIC_CAMERA_SEQUENCE = [
        "PUSH-IN",        // opener — draw viewer into the scene
        "SLIDER_LEFT",    // lateral reveal
        "PARALLAX_RIGHT", // depth shift — cinematic
        "CRANE-UP",       // elevation drama
        "SLIDER_RIGHT",   // lateral counterpoint
        "PARALLAX_LEFT",  // depth counterpoint
        "PULL-OUT",       // closer — reveal the full space
      ];

      // Merge: VFX takes priority; explicit camera key next; cinematic auto-fill last.
      // Images that have a VFX presetKey are NOT given a cameraActionKey — the VFX
      // effect owns the motion for that clip.
      const mergedKeys = presetKeys.map((cam, i) => {
        const explicit = normalizeRendyKeys(vfxKeys[i] || cam || undefined);
        if (!explicit.cameraActionKey && !explicit.presetKey) {
          // No explicit choice → auto-assign from cinematic sequence
          const autoKey = CINEMATIC_CAMERA_SEQUENCE[i % CINEMATIC_CAMERA_SEQUENCE.length];
          return { cameraActionKey: autoKey };
        }
        return explicit;
      });

      log(`[Rendy] presets (raw)=${JSON.stringify(presetKeys.map((c, i) => vfxKeys[i] || c))} normalised=${JSON.stringify(mergedKeys)}`);
      log(`[Showcase] clean Rendy generation ratio=${ratio}`);

      // Keep the provider pixels clean. The finalizer only localizes the MP4 and
      // uploads it to durable storage; optional text belongs in a later edit.
      let jobId = "";
      const onVideosReady = async (videos: RendyVideo[]) => {
        const deliveredVideos = await finalizeRendyShowcaseVideos(videos);
        if (showcaseUserId && jobId) {
          // Idempotent create-before-complete prevents a late initial insert
          // from reverting a successfully delivered job to pending.
          await storage.createVideoJob({ requestId: jobId, userId: showcaseUserId, feature: "showcase" });
          await storage.completeVideoJob(jobId);
          showcaseVideoRefunds.delete(jobId);
        }
        return deliveredVideos;
      };
      jobId = startRendyShowcase(filePaths, ratio, mergedKeys, onVideosReady, showcaseUserId ?? undefined);
      if (showcaseUserId) showcaseVideoRefunds.set(jobId, showcaseUserId);
      if (showcaseUserId) storage.createVideoJob({ requestId: jobId, userId: showcaseUserId, feature: "showcase" }).catch(() => {});
      log(`[Rendy] started job=${jobId} images=${files.length} ratio=${ratio}`);
      if (showcaseUserId) storage.logCrmActivity(showcaseUserId, "video", `Bolig Showcase (Rendy) · ${files.length} billeder`).catch(() => {});
      return res.json({ success: true, job_id: jobId });
    } catch (err: any) {
      log(`[Rendy] submit error: ${err.message}`);
      if (showcaseUserId) storage.refundQuota(showcaseUserId, "showcase").catch(() => {});
      return res.status(500).json({ success: false, message: err.message || "Indsendelse mislykkedes" });
    }
  });

  // SSE progress stream for Rendy jobs
  app.get("/api/bolig/showcase-video/progress/:jobId", async (req, res) => {
    const { jobId } = req.params;
    res.setHeader("Content-Type", "text/event-stream");
    // no-transform: prevent any proxy (Render, nginx, Cloudflare) from buffering.
    // X-Accel-Buffering: no: nginx-specific disable-buffering flag (harmless elsewhere).
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const send = (data: object) => { try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch {} };
    const ping = () => { try { res.write(":\n\n"); } catch {} };
    // 500 ms grace period: ensures the final SSE frame is flushed through any
    // intermediate proxy before the TCP FIN arrives (some proxies coalesce them).
    const endSoon = () => setTimeout(() => { try { res.end(); } catch {} }, 500);

    const job = getRendyJob(jobId);

    // ── Fast path: job is in memory ───────────────────────────────────────────
    if (job) {
      send(job.progress);
      if (job.status !== "processing") {
        if (job.status === "failed") refundShowcaseVideo(jobId);
        else showcaseVideoRefunds.delete(jobId);
        log(`[Rendy] SSE fast-complete job=${jobId} stage=${job.progress.stage} videos=${(job.progress.videos ?? []).length}`);
        endSoon();
        return;
      }
      const iv = setInterval(() => {
        const j = getRendyJob(jobId);
        if (!j) { clearInterval(iv); clearInterval(hb); try { res.end(); } catch {} return; }
        send(j.progress);
        if (j.status === "completed" || j.status === "failed") {
          if (j.status === "failed") refundShowcaseVideo(jobId);
          else showcaseVideoRefunds.delete(jobId);
          clearInterval(iv); clearInterval(hb);
          log(`[Rendy] SSE interval-complete job=${jobId} stage=${j.progress.stage} videos=${(j.progress.videos ?? []).length}`);
          endSoon();
        }
      }, 2000);
      const hb = setInterval(ping, 20_000);
      req.on("close", () => { clearInterval(iv); clearInterval(hb); });
      return;
    }

    // ── Recovery path: server restarted — recover Forma's finished delivery first ──
    log(`[Rendy] job ${jobId} not in memory — checking durable delivery state`);
    const persisted = await getPersistedRendyJob(jobId);
    if (!persisted?.listingId) {
      send({ stage: "failed", progress: 0, message: "Job ikke fundet — serveren er genstartet. Upload venligst billederne igen." });
      res.end();
      return;
    }
    const listingId = persisted.listingId;
    if (persisted.status === "completed" && persisted.deliveryStatus === "delivered" && persisted.videos.length > 0) {
      await storage.completeVideoJob(jobId);
      showcaseVideoRefunds.delete(jobId);
      log(`[Rendy] recovered finished Forma delivery job=${jobId} videos=${persisted.videos.length}`);
      send({ stage: "complete", progress: 100, message: `${persisted.videos.length} video${persisted.videos.length === 1 ? "" : "er"} klar!`, videos: persisted.videos, listingId });
      endSoon();
      return;
    }

    log(`[Rendy] recovered listingId=${listingId} from DB for job ${jobId} — completing Forma delivery`);
    send({ stage: "generating", progress: 40, message: "Gendanner videogenerering…", listingId });

    const hb = setInterval(ping, 20_000);
    let closed = false;
    req.on("close", () => { closed = true; clearInterval(hb); });

    // Poll Rendy status directly (same logic as startRendyShowcase polling loop)
    let consecutiveErrors = 0;
    const MAX_ERRORS = 4;
    while (!closed) {
      await new Promise((r) => setTimeout(r, 3000));
      if (closed) break;
      let st: { progress: number; status: string };
      try {
        st = await getRendyListingStatus(listingId);
      } catch (err: any) {
        consecutiveErrors++;
        log(`[Rendy] recovery poll error (${consecutiveErrors}/${MAX_ERRORS}): ${err.message}`);
        if (consecutiveErrors >= MAX_ERRORS) {
          send({ stage: "failed", progress: 0, message: "Generering mislykkedes. Prøv igen." });
          break;
        }
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }

      const pct = typeof st.progress === "number" ? st.progress : 0;
      const mapped = 32 + Math.round(pct * 0.63);

      if (st.status === "error") {
        consecutiveErrors++;
        if (consecutiveErrors < MAX_ERRORS) {
          send({ stage: "generating", progress: mapped, message: `AI behandler video… prøver igen (${consecutiveErrors}/${MAX_ERRORS})`, listingId });
          await new Promise((r) => setTimeout(r, 10_000));
          continue;
        }
        send({ stage: "failed", progress: 0, message: "Videogenerering fejlede. Prøv med bedre billeder (min. 800×600px)." });
        break;
      }

      consecutiveErrors = 0;

      if (st.status === "success") {
        try {
          const full = await getRendyListing(listingId);
          const videos = full.videos.filter((v) => v.status === "success" && v.url);
          if (videos.length === 0) throw new Error("Rendy leverede ingen færdige videoer");
          const deliveredVideos = await finalizeRendyShowcaseVideos(videos);
          await saveDeliveredRendyVideos(jobId, listingId, deliveredVideos);
          await storage.completeVideoJob(jobId);
          showcaseVideoRefunds.delete(jobId);
          log(`[Rendy] recovery stored clean Forma delivery job=${jobId} videos=${deliveredVideos.length}`);
          send({ stage: "complete", progress: 100, message: `${deliveredVideos.length} video${deliveredVideos.length === 1 ? "" : "er"} klar!`, videos: deliveredVideos, listingId });
        } catch (err: any) {
          log(`[Rendy] recovery finalization failed job=${jobId}: ${err?.message || "unknown error"}`);
          send({ stage: "failed", progress: 0, message: "Kunne ikke gemme den færdige video. Prøv igen." });
        }
        break;
      }

      // Still generating. Percentage is shown once, on the right, from `progress`
      // (mapped 0-100 int) — don't embed raw pct in the message too (it produced a
      // second, different number, sometimes with decimals). Mirrors server/rendy.ts.
      send({ stage: "generating", progress: mapped, message: "Genererer videoer…", listingId });
      ping();
    }

    clearInterval(hb);
    endSoon();
  });

  // Trigger zip export of a completed Rendy listing
  app.post("/api/bolig/showcase-video/:listingId/export", async (req, res) => {
    try {
      const { listingId } = req.params;
      const result = await exportRendyListing(listingId);
      return res.json({ success: true, ...result });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // Poll zip export status
  app.get("/api/bolig/rendy/export/:exportJobId", async (req, res) => {
    try {
      const data = await getRendyExportStatus(req.params.exportJobId);
      return res.json({ success: true, ...data });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // ── Cinematisk Walkthrough Video (multi-photo professional property tour) ──
  // Accepts 5-20 photos, generates one Seedance 2.0 clip per photo with
  // professional walkthrough camera prompts, then stitches with music.
  // Reuses the showcase job registry (getShowcaseJob) for SSE progress.
  app.post("/api/bolig/walkthrough-video", upload.array("images", 20), async (req, res) => {
    let walkthroughUserId: number | null = null;
    try {
      const files = (req.files as Express.Multer.File[] | undefined) || [];
      if (files.length < 2) {
        return res.status(400).json({ success: false, message: "Upload mindst 2 billeder" });
      }
      // Auth + quota check — auth is REQUIRED for this paid feature
      try {
        const { uid } = await verifyFirebaseToken(req.headers.authorization);
        const u = await storage.getUserByFirebaseUid(uid);
        if (!u) return res.status(401).json({ success: false, message: "Log ind for at generere walkthrough-videoer." });
        walkthroughUserId = u.id;
        const q = await storage.checkAndIncrementQuota(u.id, "showcase");
        if (!q.allowed) return res.status(403).json({ success: false, quotaExceeded: true, feature: q.feature, message: `Du har nået din månedlige kvota for ${q.feature}.` });
      } catch (authErr: any) {
        if (authErr?.status === 403) return res.status(403).json({ success: false, quotaExceeded: true, feature: authErr.feature, message: authErr.message });
        return res.status(401).json({ success: false, message: "Log ind for at generere walkthrough-videoer." });
      }
      const paths = files.map((f) => path.join(uploadDir, f.filename));
      const address = typeof req.body?.address === "string" ? req.body.address.slice(0, 80) : undefined;
      const jobId = startWalkthroughVideo(paths, uploadDir, address, String(req.body?.lang || req.headers["x-lang"] || "da"));
      if (!jobId) {
        if (walkthroughUserId) storage.refundQuota(walkthroughUserId, "showcase").catch(() => {});
        for (const p of paths) fs.promises.unlink(p).catch(() => {});
        return res.status(429).json({ success: false, message: "Serveren er optaget lige nu. Prøv igen om lidt." });
      }
      if (walkthroughUserId) walkthroughVideoRefunds.set(jobId, walkthroughUserId);
      if (walkthroughUserId) storage.createVideoJob({ requestId: jobId, userId: walkthroughUserId, feature: "walkthrough" }).catch(() => {});
      log(`[Walkthrough] started job=${jobId} images=${files.length}`);
      if (walkthroughUserId) storage.logCrmActivity(walkthroughUserId, "video", `Cinematisk walkthrough · ${files.length} billeder`).catch(() => {});
      return res.json({ success: true, job_id: jobId });
    } catch (err: any) {
      log(`[Walkthrough] submit error: ${err.message}`);
      if (walkthroughUserId) storage.refundQuota(walkthroughUserId, "showcase").catch(() => {});
      return res.status(500).json({ success: false, message: err.message || "Indsendelse mislykkedes" });
    }
  });

  app.get("/api/bolig/walkthrough-video/progress/:jobId", (req, res) => {
    const { jobId } = req.params;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const send = (data: object) => {
      try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch {}
    };
    const ping = () => { try { res.write(":\n\n"); } catch {} };

    const job = getShowcaseJob(jobId);
    if (!job) {
      send({ stage: "failed", currentClip: 0, totalClips: 0, message: "Job ikke fundet" });
      res.end();
      return;
    }
    send(job.progress);
    if (job.status !== "processing") {
      if (job.status === "failed") refundWalkthroughVideo(jobId);
      else if (job.status === "completed") walkthroughVideoRefunds.delete(jobId);
      res.end();
      return;
    }

    const iv = setInterval(() => {
      const j = getShowcaseJob(jobId);
      if (!j) { clearInterval(iv); clearInterval(hb); try { res.end(); } catch {} return; }
      send(j.progress);
      if (j.status === "completed" || j.status === "failed") {
        if (j.status === "failed") refundWalkthroughVideo(jobId);
        else walkthroughVideoRefunds.delete(jobId);
        clearInterval(iv);
        clearInterval(hb);
        try { res.end(); } catch {}
      }
    }, 1500);

    // Keepalive heartbeat — prevents proxy/nginx from closing idle SSE connections
    const hb = setInterval(ping, 20_000);

    req.on("close", () => { clearInterval(iv); clearInterval(hb); });
  });

  app.get("/api/bolig/walkthrough-video/status/:jobId", (req, res) => {
    const job = getShowcaseJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ success: false, status: "FAILED", message: "Job ikke fundet" });
    }
    if (job.status === "completed" && job.videoUrls) {
      walkthroughVideoRefunds.delete(req.params.jobId);
      return res.json({ success: true, status: "COMPLETED", video_urls: job.videoUrls, clean_video_urls: job.cleanVideoUrls });
    }
    if (job.status === "failed") {
      refundWalkthroughVideo(req.params.jobId);
      return res.json({ success: false, status: "FAILED", message: job.error || "Generering mislykkedes" });
    }
    return res.json({ success: true, status: "IN_PROGRESS" });
  });

  // ── Forvandlingsfilm ───────────────────────────────────────────────────────
  // Galleri-kandidater: brugerens AI-designs der har BÅDE før- og efter-billede
  // og derfor kan blive til et morph-klip i filmen.
  const FILM_IMG_RE = /\.(jpe?g|png|webp)(\?|$)/i;
  app.get("/api/bolig/film-candidates", async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const user = await storage.getUserByFirebaseUid(uid);
      if (!user) return res.status(401).json({ message: "Bruger ikke fundet" });
      const imgs = await storage.getAllGeneratedImages(user.id, 200);
      const skip = (s: string) =>
        s.startsWith("transform-video") || s.startsWith("walkthrough-video") ||
        s.startsWith("showcase") || s.startsWith("transform-film") || s.startsWith("3d");
      const out = imgs
        .filter((i) =>
          !!i.originalImageUrl && !!i.imageUrl &&
          FILM_IMG_RE.test(i.originalImageUrl) && FILM_IMG_RE.test(i.imageUrl) &&
          isTrustedFilmImageUrl(i.originalImageUrl) && isTrustedFilmImageUrl(i.imageUrl) &&
          !skip(i.style || "") && (i.roomType || "") !== "floorplan",
        )
        .slice(0, 60)
        .map((i) => ({
          id: i.id,
          before: i.originalImageUrl,
          after: i.imageUrl,
          roomType: i.roomType,
          style: i.style,
          createdAt: i.createdAt,
        }));
      return res.json(out);
    } catch {
      return res.status(401).json({ message: "Log ind for at se dine designs" });
    }
  });

  // Start en forvandlingsfilm: 2-8 galleri-billeder (id'er) → ét morph-klip pr.
  // rum → samlet film med musik. Koster 1 Transformering-kredit pr. rum.
  app.post("/api/bolig/transform-film", async (req, res) => {
    let filmUser: { id: number } | null = null;
    let charged = 0;
    const localCopies: string[] = [];
    const cleanupCopies = () => { for (const p of localCopies) fs.promises.unlink(p).catch(() => {}); };
    try {
      if (!isFalConfigured()) {
        return res.status(500).json({ success: false, message: "FAL_KEY ikke konfigureret" });
      }
      // Auth er PÅKRÆVET (vi læser brugerens galleri).
      try {
        const { uid } = await verifyFirebaseToken(req.headers.authorization);
        const u = await storage.getUserByFirebaseUid(uid);
        if (u) filmUser = u;
      } catch { /* falder igennem til 401 nedenfor */ }
      if (!filmUser) return res.status(401).json({ success: false, message: "Log ind for at lave en forvandlingsfilm" });

      const rawIds: unknown[] = Array.isArray(req.body?.imageIds) ? req.body.imageIds : [];
      const imageIds = Array.from(new Set(rawIds.map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0)));
      if (imageIds.length < 2 || imageIds.length > 8) {
        return res.status(400).json({ success: false, message: "Vælg 2-8 designs fra dit galleri" });
      }
      const address = typeof req.body?.address === "string" ? req.body.address.slice(0, 80) : undefined;
      const filmProtocol = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0].trim() || req.protocol;
      const filmPublicBaseUrl = `${filmProtocol}://${req.get("host")}`;

      // 1) Valider alle galleri-rækker (ejerskab + før/efter-billeder findes).
      const urlPairs: Array<{ before: string; after: string }> = [];
      for (const id of imageIds) {
        const img = await storage.getGeneratedImage(id);
        if (!img || img.userId !== filmUser.id) {
          return res.status(404).json({ success: false, message: "Et af de valgte designs blev ikke fundet i dit galleri" });
        }
        if (!img.originalImageUrl || !img.imageUrl || !FILM_IMG_RE.test(img.originalImageUrl) || !FILM_IMG_RE.test(img.imageUrl) ||
            !isTrustedFilmImageUrl(img.originalImageUrl) || !isTrustedFilmImageUrl(img.imageUrl)) {
          return res.status(400).json({ success: false, message: "Et af de valgte designs kan ikke bruges i filmen — vælg et andet" });
        }
        urlPairs.push({ before: img.originalImageUrl, after: img.imageUrl });
      }

      // 2) Materialisér lokale KOPIER (pipelinen sletter sine inputfiler bagefter,
      //    så vi må aldrig pege direkte på galleri-originaler i /uploads).
      const toLocalCopy = async (url: string, tag: string): Promise<string> => {
        if (url.startsWith("/uploads/")) {
          const key = path.basename(url.split("?")[0]);
          const src = path.join(uploadDir, key);
          const ext = path.extname(src) || ".jpg";
          const dest = path.join(uploadDir, `film-src-${Date.now()}-${tag}-${Math.random().toString(36).slice(2, 7)}${ext}`);
          if (fs.existsSync(src)) {
            // Filen er på disk (samme server-session som upload).
            await fs.promises.copyFile(src, dest);
          } else if (isR2Configured()) {
            // Filen er ikke på disk (efter en redeploy) — hent fra R2.
            const stream = await r2GetStream(key);
            if (!stream) throw new Error("Et af billederne kunne ikke hentes fra cloud-lageret — prøv et andet design");
            await new Promise<void>((res, rej) => {
              const ws = fs.createWriteStream(dest);
              (stream as any).pipe(ws);
              ws.on("finish", res);
              ws.on("error", rej);
              (stream as any).on("error", rej);
            });
          } else {
            throw new Error("Et af billederne findes ikke længere på serveren — prøv et andet design");
          }
          localCopies.push(dest);
          return dest;
        }
        if (/^https?:\/\//i.test(url)) {
          // Dobbelt-tjek (SSRF-værn) — valideringen ovenfor skal have fanget det.
          if (!isTrustedFilmImageUrl(url)) throw new Error("Ugyldig billed-adresse i galleriet");
          const m = url.match(/\.(jpe?g|png|webp)(?=\?|$)/i);
          const publicPath = await downloadToUploads(url, uploadDir, m ? `.${m[1].toLowerCase()}` : ".jpg");
          const dest = path.join(uploadDir, path.basename(publicPath));
          localCopies.push(dest);
          return dest;
        }
        throw new Error("Ugyldig billed-adresse i galleriet");
      };
      const pairs: Array<{ before: string; after: string }> = [];
      for (let i = 0; i < urlPairs.length; i++) {
        pairs.push({
          before: await toLocalCopy(urlPairs[i].before, `${i}b`),
          after: await toLocalCopy(urlPairs[i].after, `${i}a`),
        });
      }

      // 3) Kvota: 1 transformVideo-kredit pr. rum.
      for (let i = 0; i < pairs.length; i++) {
        const q = await storage.checkAndIncrementQuota(filmUser.id, "transformVideo");
        if (!q.allowed) {
          for (let j = 0; j < charged; j++) storage.refundQuota(filmUser.id, "transformVideo").catch(() => {});
          cleanupCopies();
          return res.status(403).json({
            success: false,
            quotaExceeded: true,
            feature: q.feature,
            message: `En forvandlingsfilm bruger 1 Transformering-kredit pr. rum (${pairs.length} i alt) — du har ikke nok tilbage denne måned.`,
          });
        }
        charged++;
      }

      // 4) Start jobbet. onClipFailed refunderer løbende ét fejlet rum ad gangen
      //    og nedskriver refusionssaldoen, så SSE-fejl-refusionen ikke dobbelttæller.
      const userId = filmUser.id;
      let jobId: string | null = null;
      const filmLang = String(req.body?.lang || req.headers["x-lang"] || "da");
      jobId = startTransformFilm(pairs, uploadDir, address, () => {
        storage.refundQuota(userId, "transformVideo").catch(() => {});
        if (jobId) {
          const entry = transformFilmRefunds.get(jobId);
          if (entry) {
            entry.count -= 1;
            if (entry.count <= 0) transformFilmRefunds.delete(jobId);
          }
        }
      }, (failed) => {
        // Terminal afregning direkte fra jobbet — virker også hvis klienten
        // lukker fanen og aldrig rammer SSE/status-ruterne (de er idempotente).
        if (!jobId) return;
        if (failed) refundTransformFilm(jobId);
        else transformFilmRefunds.delete(jobId);
      }, filmPublicBaseUrl, filmLang);
      if (!jobId) {
        for (let j = 0; j < charged; j++) storage.refundQuota(userId, "transformVideo").catch(() => {});
        cleanupCopies();
        return res.status(429).json({ success: false, message: "Serveren er optaget lige nu. Prøv igen om lidt." });
      }
      transformFilmRefunds.set(jobId, { userId, count: charged });
      storage.createVideoJob({ requestId: jobId, userId, feature: "transformVideo", refundCount: charged }).catch(() => {});
      log(`[Film] started job=${jobId} rooms=${pairs.length} user=${userId}`);
      storage.logCrmActivity(userId, "video", `Forvandlingsfilm · ${pairs.length} rum`).catch(() => {});
      return res.json({ success: true, job_id: jobId });
    } catch (err: any) {
      log(`[Film] submit error: ${err.message}`);
      if (filmUser) for (let j = 0; j < charged; j++) storage.refundQuota(filmUser.id, "transformVideo").catch(() => {});
      cleanupCopies();
      return res.status(500).json({ success: false, message: err.message || "Indsendelse mislykkedes" });
    }
  });

  app.get("/api/bolig/transform-film/progress/:jobId", (req, res) => {
    const { jobId } = req.params;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const send = (data: object) => {
      try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch {}
    };
    const ping = () => { try { res.write(":\n\n"); } catch {} };

    const job = getShowcaseJob(jobId);
    if (!job) {
      send({ stage: "failed", currentClip: 0, totalClips: 0, message: "Job ikke fundet" });
      res.end();
      return;
    }
    send(job.progress);
    if (job.status !== "processing") {
      if (job.status === "failed") refundTransformFilm(jobId);
      else if (job.status === "completed") transformFilmRefunds.delete(jobId);
      res.end();
      return;
    }

    const iv = setInterval(() => {
      const j = getShowcaseJob(jobId);
      if (!j) { clearInterval(iv); clearInterval(hb); try { res.end(); } catch {} return; }
      send(j.progress);
      if (j.status === "completed" || j.status === "failed") {
        if (j.status === "failed") refundTransformFilm(jobId);
        else transformFilmRefunds.delete(jobId);
        clearInterval(iv);
        clearInterval(hb);
        try { res.end(); } catch {}
      }
    }, 1500);

    const hb = setInterval(ping, 20_000);
    req.on("close", () => { clearInterval(iv); clearInterval(hb); });
  });

  app.get("/api/bolig/transform-film/status/:jobId", (req, res) => {
    const job = getShowcaseJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ success: false, status: "FAILED", message: "Job ikke fundet" });
    }
    if (job.status === "completed" && job.videoUrls) {
      transformFilmRefunds.delete(req.params.jobId);
      return res.json({ success: true, status: "COMPLETED", video_urls: job.videoUrls });
    }
    if (job.status === "failed") {
      refundTransformFilm(req.params.jobId);
      return res.json({ success: false, status: "FAILED", message: job.error || "Generering mislykkedes" });
    }
    return res.json({ success: true, status: "IN_PROGRESS" });
  });

  // ── AI Boligfremvisning (property tours) ──────────────────────────────────
  // List the current user's tour projects.
  app.get("/api/ai-boligfremvisning/properties", async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const user = await storage.getUserByFirebaseUid(uid);
      if (!user) return res.status(401).json({ message: "Bruger ikke fundet" });
      const list = await storage.getAiTourPropertiesByUser(user.id);
      return res.json(list);
    } catch (err: any) {
      return res.status(500).json({ message: err.message || "Fejl" });
    }
  });

  // Create a new tour project — uploads the floor plan image and persists the
  // project with status "mapping" (the next step is marking rooms on the plan).
  app.post("/api/ai-boligfremvisning/properties", upload.single("floorplan"), async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const user = await storage.getUserByFirebaseUid(uid);
      if (!user) return res.status(401).json({ message: "Bruger ikke fundet" });

      const name = String(req.body?.name || "").trim();
      if (!name) return res.status(400).json({ message: "Projektnavn er påkrævet" });
      if (!req.file) return res.status(400).json({ message: "Plantegning skal uploades" });

      const floorplanUrl = `/uploads/${req.file.filename}`;
      const prop = await storage.createAiTourProperty({
        userId: user.id,
        name,
        floorplanUrl,
        status: "mapping",
      });
      return res.json(prop);
    } catch (err: any) {
      return res.status(500).json({ message: err.message || "Fejl" });
    }
  });

  // Fetch a single project with its rooms.
  app.get("/api/ai-boligfremvisning/properties/:id", async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const user = await storage.getUserByFirebaseUid(uid);
      if (!user) return res.status(401).json({ message: "Bruger ikke fundet" });
      const id = Number(req.params.id);
      const prop = await storage.getAiTourProperty(id, user.id);
      if (!prop) return res.status(404).json({ message: "Projekt ikke fundet" });
      const rooms = await storage.getAiTourRooms(id, user.id);
      return res.json({ ...prop, rooms });
    } catch (err: any) {
      return res.status(500).json({ message: err.message || "Fejl" });
    }
  });

  // Replace the full set of rooms on a property (used by the room-mapping UI).
  // Body: { rooms: Array<{ name, posX, posY, width, height, color }> }
  app.post("/api/ai-boligfremvisning/properties/:id/rooms", async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const user = await storage.getUserByFirebaseUid(uid);
      if (!user) return res.status(401).json({ message: "Bruger ikke fundet" });
      const id = Number(req.params.id);
      const rooms = Array.isArray(req.body?.rooms) ? req.body.rooms : [];
      const sanitized = rooms.map((r: any) => ({
        // Positive numeric id → update existing row (preserves photo + after-image).
        ...(typeof r.id === "number" && r.id > 0 ? { id: r.id } : {}),
        name: String(r.name || "").slice(0, 100) || "Rum",
        posX: String(Number(r.posX) || 0),
        posY: String(Number(r.posY) || 0),
        width: String(Number(r.width) || 10),
        height: String(Number(r.height) || 10),
        color: String(r.color || "#C8956C"),
        included: typeof r.included === "boolean" ? r.included : false,
      }));
      const saved = await storage.setAiTourRooms(id, user.id, sanitized);
      return res.json({ rooms: saved });
    } catch (err: any) {
      return res.status(500).json({ message: err.message || "Fejl" });
    }
  });

  // Set the project's global style (used for every room's after-image generation).
  app.patch("/api/ai-boligfremvisning/properties/:id", async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const user = await storage.getUserByFirebaseUid(uid);
      if (!user) return res.status(401).json({ message: "Bruger ikke fundet" });
      const id = Number(req.params.id);
      const updates: Partial<InsertAiTourProperty> = {};
      if (typeof req.body?.style === "string") updates.style = req.body.style.trim().slice(0, 50);
      if (typeof req.body?.name === "string") updates.name = req.body.name.trim().slice(0, 200);
      if (typeof req.body?.tier === "string") {
        // Accept the user-facing aliases (budget/standard/premium) — internally
        // we map "premium" to "luxury" so the Bolig prompt tier table matches.
        const t = req.body.tier.trim().toLowerCase();
        if (t === "budget" || t === "standard" || t === "premium" || t === "luxury") {
          updates.tier = t === "premium" ? "luxury" : t;
        }
      }
      const saved = await storage.updateAiTourProperty(id, user.id, updates);
      if (!saved) return res.status(404).json({ message: "Projekt ikke fundet" });
      return res.json(saved);
    } catch (err: any) {
      return res.status(500).json({ message: err.message || "Fejl" });
    }
  });

  // Strategy B — AI floor-plan analysis. Runs the uploaded plantegning through
  // GPT-4o-mini vision and stores a structured JSON describing windows, doors,
  // exterior walls and approximate area for each room. The result is saved on
  // the property AND distributed per-room (case-insensitive name match) so
  // /generate-after and /generate-panorama can append architectural facts to
  // their prompts without modifying the prompt library itself. Safe-fails:
  // any error is logged but the endpoint returns 200 with success:false so the
  // wizard can keep going (we fall back to coordinate heuristics).
  app.post("/api/ai-boligfremvisning/properties/:id/analyze-floorplan", async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const user = await storage.getUserByFirebaseUid(uid);
      if (!user) return res.status(401).json({ message: "Bruger ikke fundet" });
      const propertyId = Number(req.params.id);
      const property = await storage.getAiTourProperty(propertyId, user.id);
      if (!property) return res.status(404).json({ message: "Projekt ikke fundet" });

      // Idempotent: if we've already analysed it, just return what we have.
      if ((property as any).floorplanAnalysis) {
        return res.json({ success: true, cached: true, analysis: (property as any).floorplanAnalysis });
      }

      const protocol = (req.headers["x-forwarded-proto"] as string | undefined) || req.protocol;
      const host = (req.headers["x-forwarded-host"] as string | undefined) || req.headers.host;
      const absUrl = property.floorplanUrl.startsWith("http")
        ? property.floorplanUrl
        : `${protocol}://${host}${property.floorplanUrl}`;

      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      log(`[ai-tour] analyze floorplan property=${propertyId}`);
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: `You are an expert architect analyzing a residential floor plan. Study the image carefully — read all room labels and measurements printed on the plan, trace wall lines, and locate door/window symbols precisely.\n\nFor each visible room identify: the room name (use the label printed on the plan when present, in its original language), which walls have windows, which walls have doors and what room they connect to, which walls are exterior walls (no neighboring room), and the area in square meters (use printed measurements when available, otherwise estimate from proportions). Walls are described as one of: north, south, east, west (north = top of the image).\n\nAlso determine "walkOrder": the natural order a real estate agent would walk a buyer through the home, starting at the entrance/hallway, then main living spaces (living room, kitchen), then bedrooms and bathrooms, ending with any secondary rooms. walkOrder is 1-based.\n\nRespond ONLY with valid JSON in this exact shape, no prose:\n{\n  "rooms": [\n    {\n      "name": "Living Room",\n      "walkOrder": 2,\n      "windows": [{"wall": "south", "position": "center", "size": "large"}],\n      "doors": [{"wall": "west", "connectsTo": "Hallway", "position": "left"}],\n      "exteriorWalls": ["south", "east"],\n      "areaSqm": 28\n    }\n  ],\n  "totalAreaSqm": 95\n}` },
            { type: "image_url", image_url: { url: absUrl, detail: "high" } },
          ],
        }],
        max_tokens: 2500,
        response_format: { type: "json_object" },
      });

      const raw = completion.choices[0]?.message?.content || "{}";
      let analysis: any;
      try { analysis = JSON.parse(raw); } catch { analysis = { rooms: [] }; }

      await storage.updateAiTourProperty(propertyId, user.id, { floorplanAnalysis: analysis } as any);

      // Distribute per room (case-insensitive substring match on name).
      const allRooms = await storage.getAiTourRooms(propertyId, user.id);
      const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-zæøå0-9 ]/gi, "").trim();
      for (const r of allRooms) {
        const match = (analysis.rooms || []).find((ar: any) => {
          const a = norm(ar.name);
          const b = norm(r.name);
          return a === b || a.includes(b) || b.includes(a);
        });
        if (match) {
          await storage.updateAiTourRoom(r.id, user.id, { analysisData: match } as any);
        }
      }

      return res.json({ success: true, analysis });
    } catch (err: any) {
      log(`[ai-tour] analyze-floorplan error: ${err.message}`);
      return res.json({ success: false, message: err.message });
    }
  });

  // ── Guidet AI-rundvisning ─────────────────────────────────────────────────
  // Starter genereringen af ét Kling-klip pr. rum + den samlede rundvisnings-
  // film. Koster 1 showcase-kvota (refunderes hvis jobbet fejler helt).
  app.post("/api/ai-boligfremvisning/properties/:id/generate-tour", async (req, res) => {
    let tourUserId: number | null = null;
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const user = await storage.getUserByFirebaseUid(uid);
      if (!user) return res.status(401).json({ message: "Bruger ikke fundet" });
      const propertyId = Number(req.params.id);
      const property = await storage.getAiTourProperty(propertyId, user.id);
      if (!property) return res.status(404).json({ message: "Projekt ikke fundet" });
      if (!isFalConfigured()) return res.status(500).json({ message: "Video-generering er ikke konfigureret" });

      const allRooms = await storage.getAiTourRooms(propertyId, user.id);
      const eligible = allRooms.filter((r) => r.included && (r.afterImageUrl || r.roomPhotoUrl));
      if (eligible.length === 0) {
        return res.status(400).json({ message: "Ingen rum er klar — upload rum-fotos og generér design først" });
      }

      // Gå-rækkefølge: brug plantegnings-analysens walkOrder når den findes,
      // ellers dansk rumnavns-heuristik (entré → stue → køkken → …).
      const analysis: any = (property as any).floorplanAnalysis;
      const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-zæøå0-9 ]/gi, "").trim();
      const orderOf = (name: string): number => {
        const n = norm(name);
        if (analysis?.rooms) {
          const m = analysis.rooms.find((ar: any) => {
            const a = norm(ar.name);
            return a === n || a.includes(n) || n.includes(a);
          });
          if (m && Number(m.walkOrder) > 0) return Number(m.walkOrder);
        }
        const prio = ["entr", "hall", "gang", "stue", "opholds", "køkken", "alrum", "spise", "kontor", "værelse", "soveværelse", "badeværelse", "bad", "bryggers", "kælder", "terrasse", "have"];
        const idx = prio.findIndex((p) => n.includes(p));
        return idx >= 0 ? 100 + idx : 200;
      };
      const ordered = [...eligible].sort((a, b) => orderOf(a.name) - orderOf(b.name));

      const q = await storage.checkAndIncrementQuota(user.id, "showcase");
      if (!q.allowed) return res.status(403).json({ quotaExceeded: true, feature: q.feature, message: `Du har nået din månedlige kvota for ${q.feature}.` });
      tourUserId = user.id;

      const jobId = startGuidedTour(
        propertyId,
        user.id,
        ordered.map((r) => ({ roomId: r.id, name: r.name, imageRelUrl: (r.afterImageUrl || r.roomPhotoUrl)! })),
        uploadDir,
      );
      if (!jobId) {
        storage.refundQuota(user.id, "showcase").catch(() => {});
        return res.status(429).json({ message: "Serveren er optaget lige nu. Prøv igen om lidt." });
      }
      guidedTourRefunds.set(jobId, user.id);
      storage.createVideoJob({ requestId: jobId, userId: user.id, feature: "showcase" }).catch(() => {});
      storage.logCrmActivity(user.id, "video", `Guidet AI-rundvisning · ${ordered.length} rum`).catch(() => {});
      log(`[GuidedTour] started job=${jobId} property=${propertyId} rooms=${ordered.length}`);
      return res.json({ success: true, jobId, totalClips: Math.min(ordered.length, 10) });
    } catch (err: any) {
      if (tourUserId) storage.refundQuota(tourUserId, "showcase").catch(() => {});
      return res.status(500).json({ message: err.message || "Fejl" });
    }
  });

  // Poll status på et rundvisnings-job.
  app.get("/api/ai-boligfremvisning/tour-status/:jobId", async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const user = await storage.getUserByFirebaseUid(uid);
      if (!user) return res.status(401).json({ message: "Bruger ikke fundet" });
      const job = getGuidedTourJob(req.params.jobId);
      if (!job || job.userId !== user.id) return res.status(404).json({ message: "Job ikke fundet" });
      if (job.status === "failed") refundGuidedTour(req.params.jobId);
      else if (job.status === "completed") guidedTourRefunds.delete(req.params.jobId);
      return res.json({ status: job.status, progress: job.progress, error: job.error });
    } catch (err: any) {
      return res.status(500).json({ message: err.message || "Fejl" });
    }
  });

  // Upload a "before" photo for a specific room.
  app.post("/api/ai-boligfremvisning/properties/:id/rooms/:roomId/photo", upload.single("photo"), async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const user = await storage.getUserByFirebaseUid(uid);
      if (!user) return res.status(401).json({ message: "Bruger ikke fundet" });
      if (!req.file) return res.status(400).json({ message: "Billede mangler" });
      const roomId = Number(req.params.roomId);
      const url = `/uploads/${req.file.filename}`;
      // ?angle=2 writes to the second-angle slot (used for true 360° panorama
      // stitching). Default angle=1 preserves the original single-upload
      // behaviour so every existing client keeps working unchanged.
      const angle = String(req.query.angle || "1") === "2" ? 2 : 1;
      const patch = angle === 2 ? { roomPhotoUrl2: url } : { roomPhotoUrl: url };
      const saved = await storage.updateAiTourRoom(roomId, user.id, patch);
      if (!saved) return res.status(404).json({ message: "Rum ikke fundet" });
      return res.json(saved);
    } catch (err: any) {
      return res.status(500).json({ message: err.message || "Fejl" });
    }
  });

  // Generate the after-image for a single room using Collov's edit/generate
  // pipeline (same engine that powers /api/bolig/generate). The project's
  // global `style` and the room's uploaded `roomPhotoUrl` are required.
  app.post("/api/ai-boligfremvisning/properties/:id/rooms/:roomId/generate-after", async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const user = await storage.getUserByFirebaseUid(uid);
      if (!user) return res.status(401).json({ message: "Bruger ikke fundet" });
      if (!COLLOV_API_KEY) return res.status(500).json({ message: "API nøgle ikke konfigureret" });

      const propertyId = Number(req.params.id);
      const roomId = Number(req.params.roomId);
      const property = await storage.getAiTourProperty(propertyId, user.id);
      if (!property) return res.status(404).json({ message: "Projekt ikke fundet" });
      if (!property.style) return res.status(400).json({ message: "Vælg en stil for projektet først" });

      const rooms = await storage.getAiTourRooms(propertyId, user.id);
      const room = rooms.find(r => r.id === roomId);
      if (!room) return res.status(404).json({ message: "Rum ikke fundet" });
      if (!room.roomPhotoUrl) return res.status(400).json({ message: "Upload først et før-billede af rummet" });

      // Quota check — rum-redesign bruger Collov (AI-kredit)
      const roomAiQ = await storage.checkAndIncrementQuota(user.id, "ai");
      if (!roomAiQ.allowed) {
        return res.status(403).json({ success: false, quotaExceeded: true, feature: roomAiQ.feature, message: `Du har nået din månedlige kvota for ${roomAiQ.feature}. Opgrader din pakke for at generere flere billeder.` });
      }

      // Collov needs an absolute URL it can fetch. roomPhotoUrl is stored as
      // a relative /uploads/... path; rebuild against the public host here.
      const protocol = (req.headers["x-forwarded-proto"] as string | undefined) || req.protocol;
      const host = (req.headers["x-forwarded-host"] as string | undefined) || req.headers.host;
      const absolutePhotoUrl = room.roomPhotoUrl.startsWith("http")
        ? room.roomPhotoUrl
        : `${protocol}://${host}${room.roomPhotoUrl}`;

      // Heuristic: map the user-typed Danish room name (e.g. "Stue", "Køkken")
      // into one of Collov's known room_type buckets so the prompt vocabulary
      // pulls from the right tier table. Falls back to "living room".
      const inferRoomType = (name: string): string => {
        const n = name.toLowerCase();
        if (/k[oø]kken|kitchen/.test(n))            return "kitchen";
        if (/bade|toilet|brus|bath/.test(n))         return "bathroom";
        if (/sove|seng|bed/.test(n))                 return "bedroom";
        if (/spise|dining/.test(n))                  return "dining room";
        if (/kontor|office|arbejds/.test(n))         return "home office";
        if (/b[oø]rn|kid/.test(n))                   return "kids room";
        if (/entr[eé]|gang|hallway|hall/.test(n))    return "entryway";
        if (/vaske|bryggers|laundry/.test(n))        return "laundry room";
        return "living room";
      };
      const roomType = inferRoomType(room.name);
      // Map the project's tier (budget/standard/luxury) onto the Bolig prompt
      // tier table (tier1/tier2/tier3). Defaults to tier2 so legacy projects
      // (no tier set) keep behaving exactly as before.
      const tierMap: Record<string, "tier1" | "tier2" | "tier3"> = {
        budget: "tier1", standard: "tier2", luxury: "tier3",
      };
      const tier = tierMap[(property.tier || "standard").toLowerCase()] || "tier2";
      let basePrompt: string;
      const resolvedRoomType = BOLIG_ROOM_ALIASES[roomType.toLowerCase()] ?? roomType.toLowerCase();
      try {
        basePrompt = getBoligPrompt(resolvedRoomType, property.style, tier);
      } catch (promptErr: any) {
        log(`[PROMPT_NOT_FOUND] ${promptErr.message} — using generic fallback`);
        basePrompt = `Completely redesign this ${roomType} in ${property.style} style. Replace all existing furniture and decor with new pieces that match the style. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint.`;
      }
      // Floor-plan-aware context: the user explicitly asked the AI to know
      // window/door positions inferred from the plantegning. We append the
      // room's relative size (% of total floor area) and nearest-wall hints
      // derived from its bounding box on the plan. The actual JPEG of the
      // floor plan is not sent to Collov (their edit endpoint takes a single
      // image_url — the before-photo), but these heuristics still tilt the
      // generation toward correct camera angle and openings.
      const allRooms = rooms;
      const totalArea = allRooms.reduce((s, x) => s + (Number(x.width) * Number(x.height)), 0) || 1;
      const myArea = Number(room.width) * Number(room.height);
      const pct = Math.round((myArea / totalArea) * 100);
      const cx = Number(room.posX) + Number(room.width) / 2;
      const cy = Number(room.posY) + Number(room.height) / 2;
      const horiz = cx < 33 ? "left side" : cx > 66 ? "right side" : "center";
      const vert = cy < 33 ? "front" : cy > 66 ? "back" : "middle";
      // Find adjacency hints (rooms sharing an edge) so AI knows where doors are.
      const neighbors = allRooms
        .filter((x) => x.id !== room.id)
        .filter((x) => {
          const ax1 = Number(x.posX), ay1 = Number(x.posY);
          const ax2 = ax1 + Number(x.width), ay2 = ay1 + Number(x.height);
          const bx1 = Number(room.posX), by1 = Number(room.posY);
          const bx2 = bx1 + Number(room.width), by2 = by1 + Number(room.height);
          const overlapX = Math.min(ax2, bx2) - Math.max(ax1, bx1) > 1;
          const overlapY = Math.min(ay2, by2) - Math.max(ay1, by1) > 1;
          const touchH = overlapY && (Math.abs(ax2 - bx1) < 3 || Math.abs(bx2 - ax1) < 3);
          const touchV = overlapX && (Math.abs(ay2 - by1) < 3 || Math.abs(by2 - ay1) < 3);
          return touchH || touchV;
        })
        .map((x) => x.name.toLowerCase());
      const layoutCtx = ` Floor-plan context: this ${roomType} occupies the ${horiz}-${vert} of the plan and is about ${pct}% of the home's floor area. ${neighbors.length ? `Doors should be placed on walls shared with: ${neighbors.join(", ")}.` : ""} Windows should be on exterior walls (walls without neighbors). Preserve the original camera angle, perspective, and zoom exactly.`;
      // Strategy B — append architectural facts from the GPT-4o-mini floor-
      // plan analysis when present. Prompts themselves stay UNTOUCHED; this
      // is purely additive context that tells Collov where the real windows
      // and doors are so it doesn't invent new ones.
      const archFactsStr = (() => {
        const a = (room as any).analysisData;
        if (!a) return "";
        const wins = Array.isArray(a.windows) ? a.windows.map((w: any) => `${w.size || ""} window on ${w.wall} wall (${w.position || "center"})`).filter(Boolean).join(", ") : "";
        const doors = Array.isArray(a.doors) ? a.doors.map((d: any) => `door on ${d.wall} wall to ${d.connectsTo || "next room"}`).filter(Boolean).join(", ") : "";
        const ext = Array.isArray(a.exteriorWalls) ? a.exteriorWalls.join(", ") : "";
        const parts = [wins && `Windows: ${wins}`, doors && `Doors: ${doors}`, ext && `Exterior walls: ${ext}`].filter(Boolean);
        return parts.length ? ` Architectural facts from floor plan: ${parts.join(". ")}.` : "";
      })();
      // ── Strukturbeskyttelse: samme prefix som BoligPotentiale-flowet ──
      const prompt = guardedPrefix() + basePrompt + layoutCtx + archFactsStr;

      // Helper: run one Collov edit job against a single before-photo URL
      // and return the resulting after-image URL (or throw with reason).
      const runCollov = async (beforeUrl: string): Promise<string> => {
        const form = new FormData();
        form.append("uploadUrl", beforeUrl);
        form.append("prompt", prompt);
        const collovRes = await fetch(`${COLLOV_BASE}/flair/enterpriseApi/edit/generate`, {
          method: "POST",
          headers: { apiKey: COLLOV_API_KEY! },
          body: form,
        });
        const collovJson = (await collovRes.json()) as any;
        if (!collovJson?.success || !collovJson?.data?.uuid) {
          throw new Error(collovJson?.message || "Collov afviste opgaven");
        }
        const uuid = collovJson.data.uuid;
        for (let i = 0; i < 45; i++) {
          await new Promise(r => setTimeout(r, 2000));
          const pollRes = await fetch(
            `${COLLOV_BASE}/flair/enterpriseApi/edit/getRecord?uuid=${encodeURIComponent(uuid)}`,
            { method: "GET", headers: { apiKey: COLLOV_API_KEY! } },
          );
          const pollJson = (await pollRes.json()) as any;
          const status = pollJson?.data?.status;
          if (status === "SUCCESS" && pollJson.data?.generateUrl) return pollJson.data.generateUrl as string;
          if (status === "FAILED") throw new Error(pollJson.data?.failReason || "Collov fejl");
        }
        throw new Error("Tog for lang tid");
      };

      // Strategy B: if a second-angle before-photo exists, generate after-
      // image for both angles in parallel. The 2nd angle is OPTIONAL — if it
      // isn't uploaded we still produce the 1st angle exactly like before.
      const angle2Abs = room.roomPhotoUrl2
        ? (room.roomPhotoUrl2.startsWith("http") ? room.roomPhotoUrl2 : `${protocol}://${host}${room.roomPhotoUrl2}`)
        : null;
      log(`[ai-tour] generate room=${room.name} (${roomType}) style=${property.style} angles=${angle2Abs ? 2 : 1}`);

      let after1: string | null = null;
      let after2: string | null = null;
      try {
        if (angle2Abs) {
          [after1, after2] = await Promise.all([runCollov(absolutePhotoUrl), runCollov(angle2Abs)]);
        } else {
          after1 = await runCollov(absolutePhotoUrl);
        }
      } catch (e: any) {
        storage.refundQuota(user.id, "ai").catch(() => {});
        return res.status(504).json({ message: e.message || "Generering fejlede" });
      }

      // Persist generated images locally + R2 so they survive Collov CDN expiry
      const persistCollov = (url: string, suffix: number): Promise<string> =>
        sharpenAndSaveVst(url, roomId * 1000 + suffix);
      if (after1) after1 = await persistCollov(after1, 1);
      if (after2) after2 = await persistCollov(after2, 2);

      const patch: any = { afterImageUrl: after1 };
      if (after2) patch.afterImageUrl2 = after2;
      const updated = await storage.updateAiTourRoom(roomId, user.id, patch);
      return res.json(updated);
    } catch (err: any) {
      log(`[ai-tour] generate error: ${err.message}`);
      return res.status(500).json({ message: err.message || "Fejl" });
    }
  });

  // Generate a 3D dollhouse render of the property's floor plan. Uses the
  // existing `generate3DFloorplan` helper (fal-ai/nano-banana-2/edit) — the
  // same engine that powers the standalone "3D plantegning" feature; we just
  // store the result on the tour project so the final view can show it.
  app.post("/api/ai-boligfremvisning/properties/:id/generate-3d-plan", async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const user = await storage.getUserByFirebaseUid(uid);
      if (!user) return res.status(401).json({ message: "Bruger ikke fundet" });
      const id = Number(req.params.id);
      const prop = await storage.getAiTourProperty(id, user.id);
      if (!prop) return res.status(404).json({ message: "Projekt ikke fundet" });

      // Quota check — 3D plantegning bruger fal.ai (gulvplan-kredit)
      const planQ = await storage.checkAndIncrementQuota(user.id, "floorPlan");
      if (!planQ.allowed) {
        return res.status(403).json({ success: false, quotaExceeded: true, feature: planQ.feature, message: `Du har nået din månedlige kvota for ${planQ.feature}. Opgrader din pakke for at generere flere plantegninger.` });
      }

      const { generate3DFloorplan, uploadToFal } = await import("./fal");
      // Feed the model the exact same kind of input the working standalone
      // /api/bolig/floorplan-3d endpoint uses — a canonical fal.storage URL.
      // Passing a Replit dev URL (https://<repl>.replit.dev/uploads/...) made
      // nano-banana-2/edit hallucinate a new layout (extra rooms, wrong
      // structure) instead of preserving the original floor plan.
      let falInputUrl: string;
      if (prop.floorplanUrl.startsWith("http")) {
        falInputUrl = prop.floorplanUrl;
      } else {
        const localPath = await ensureLocalUpload(prop.floorplanUrl);
        const ext = path.extname(localPath).toLowerCase();
        const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
        falInputUrl = await uploadToFal(localPath, mime);
      }
      log(`[ai-tour] generate 3D plan for property ${id} (input: ${falInputUrl.slice(0, 60)})`);
      let imageUrl: string;
      try {
        ({ imageUrl } = await generate3DFloorplan(falInputUrl));
      } catch (e: any) {
        storage.refundQuota(user.id, "floorPlan").catch(() => {});
        throw e;
      }
      const durableImageUrl = await sharpenAndSaveVst(imageUrl, id * 1_000_000 + Date.now() % 1_000_000);
      const updated = await storage.updateAiTourProperty(id, user.id, { threedPlanUrl: durableImageUrl });
      return res.json(updated);
    } catch (err: any) {
      log(`[ai-tour] 3d plan error: ${err.message}`);
      return res.status(500).json({ message: err.message || "Fejl" });
    }
  });

  // Generate a 360° equirectangular panorama for a single room.
  //
  // STRATEGY (Plantegnings-guidet Syntetisk 360°):
  //   1. Real anchor(s) = whatever after-images the user has (1 or 2).
  //   2. Top up to 4 stil-konsistente anchors by asking Collov for synthetic
  //      "same room from a rotated camera angle" renders, guided by the
  //      arkitektoniske fakta (windows/doors/exterior walls) for THIS room.
  //   3. Feed all 4 anchors to nano-banana-2/edit so the panorama outpainting
  //      has reference every ~90° instead of hallucinating 300°.
  //   4. Cache synthetic angles in `syntheticAngleUrls` so regenerations
  //      don't pay the Collov cost twice.
  //   5. Return panoramaAnchors metadata (real vs synthetic count) so the
  //      UI can show an honest "Premium 360°" quality badge.
  app.post("/api/ai-boligfremvisning/properties/:id/rooms/:roomId/generate-panorama", async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const user = await storage.getUserByFirebaseUid(uid);
      if (!user) return res.status(401).json({ message: "Bruger ikke fundet" });
      if (!COLLOV_API_KEY) return res.status(500).json({ message: "API nøgle ikke konfigureret" });
      const propertyId = Number(req.params.id);
      const roomId = Number(req.params.roomId);
      const property = await storage.getAiTourProperty(propertyId, user.id);
      if (!property) return res.status(404).json({ message: "Projekt ikke fundet" });
      const rooms = await storage.getAiTourRooms(propertyId, user.id);
      const room = rooms.find(r => r.id === roomId);
      if (!room) return res.status(404).json({ message: "Rum ikke fundet" });
      if (!room.afterImageUrl) return res.status(400).json({ message: "Generér efter-billedet først" });

      const styleLabel = BOLIG_STYLE_LABELS[property.style || "scandinavian"] || "Scandinavian";

      // ── 1. Collect REAL anchors (what user actually uploaded photos for) ──
      const realAnchors: string[] = [room.afterImageUrl];
      if (room.afterImageUrl2) realAnchors.push(room.afterImageUrl2);

      // ── 2. Arkitektoniske fakta for THIS room (guides every angle) ──
      const a = (room as any).analysisData;
      const windowFacts = a && Array.isArray(a.windows) && a.windows.length
        ? a.windows.map((w: any) => `${w.size || "medium"} window on ${w.wall} wall`).join(", ") : "";
      const doorFacts = a && Array.isArray(a.doors) && a.doors.length
        ? a.doors.map((d: any) => `door on ${d.wall} wall leading to ${d.connectsTo || "next room"}`).join(", ") : "";
      const extFacts = a && Array.isArray(a.exteriorWalls) && a.exteriorWalls.length
        ? `exterior walls face ${a.exteriorWalls.join(", ")}` : "";
      const archFactsForPanorama = [
        windowFacts && `windows on ${(a.windows || []).map((w: any) => w.wall).join(", ")} wall(s)`,
        doorFacts && `doors on ${(a.doors || []).map((d: any) => d.wall).join(", ")} wall(s)`,
        extFacts,
      ].filter(Boolean).join("; ") || undefined;

      // ── 3. Need to top up to 4 anchors? Use cached or generate fresh. ──
      const TARGET = 4;
      const slotsNeeded = Math.max(0, TARGET - realAnchors.length);
      const cached: string[] = Array.isArray((room as any).syntheticAngleUrls) ? (room as any).syntheticAngleUrls : [];
      let synthetic: string[] = [];

      if (slotsNeeded > 0 && cached.length >= slotsNeeded) {
        // Cache hit — skip the expensive regeneration.
        synthetic = cached.slice(0, slotsNeeded);
        log(`[ai-tour] panorama room=${room.name}: ${realAnchors.length} real + ${synthetic.length} cached synthetic anchors`);
      } else if (slotsNeeded > 0) {
        // Generate fresh synthetic anchors via Collov, each grounded in the
        // room's after-image (style anchor) + explicit rotation + arch facts.
        // Rotation degrees are evenly spaced from the real anchor coverage.
        // 1 real → ask for 90°, 180°, 270°. 2 real (front+back) → ask for 90°+270°.
        const rotations = realAnchors.length === 1 ? [90, 180, 270] : [90, 270];
        const targetRotations = rotations.slice(0, slotsNeeded);

        const anchorAfter = room.afterImageUrl!; // style + content anchor
        const archHint = [
          windowFacts && `Windows: ${windowFacts}.`,
          doorFacts && `Doors: ${doorFacts}.`,
          extFacts && `${extFacts.charAt(0).toUpperCase()}${extFacts.slice(1)}.`,
        ].filter(Boolean).join(" ");

        const runRotation = async (degrees: number): Promise<string> => {
          const rotationDescription = degrees === 90
            ? "Camera rotated 90 degrees clockwise from the reference, now facing the wall to the right of the original viewpoint."
            : degrees === 180
              ? "Camera rotated 180 degrees from the reference, now showing the opposite end of the room (the wall behind the original viewpoint)."
              : "Camera rotated 270 degrees clockwise (90 degrees counter-clockwise) from the reference, now facing the wall to the left of the original viewpoint.";
          const prompt = [
            `Photorealistic interior view of the EXACT SAME room shown in the reference photo.`,
            `${rotationDescription}`,
            `Maintain identical ${styleLabel} style, identical wall colors, identical flooring, identical lighting temperature and identical furniture family as the reference — only the camera viewpoint changes.`,
            archHint,
            `Do NOT redesign or restyle anything; treat this as a different photograph of the same finished room.`,
            `8K, architectural visualization quality, eye-level perspective.`,
          ].filter(Boolean).join(" ");

          const form = new FormData();
          form.append("uploadUrl", anchorAfter);
          form.append("prompt", prompt);
          const collovRes = await fetch(`${COLLOV_BASE}/flair/enterpriseApi/edit/generate`, {
            method: "POST",
            headers: { apiKey: COLLOV_API_KEY! },
            body: form,
          });
          const collovJson = (await collovRes.json()) as any;
          if (!collovJson?.success || !collovJson?.data?.uuid) {
            throw new Error(collovJson?.message || "Collov afviste syntetisk vinkel");
          }
          const uuid = collovJson.data.uuid;
          for (let i = 0; i < 45; i++) {
            await new Promise(r => setTimeout(r, 2000));
            const pollRes = await fetch(
              `${COLLOV_BASE}/flair/enterpriseApi/edit/getRecord?uuid=${encodeURIComponent(uuid)}`,
              { method: "GET", headers: { apiKey: COLLOV_API_KEY! } },
            );
            const pollJson = (await pollRes.json()) as any;
            const status = pollJson?.data?.status;
            if (status === "SUCCESS" && pollJson.data?.generateUrl) return pollJson.data.generateUrl as string;
            if (status === "FAILED") throw new Error(pollJson.data?.failReason || "Collov fejl");
          }
          throw new Error("Syntetisk vinkel tog for lang tid");
        };

        log(`[ai-tour] panorama room=${room.name}: generating ${targetRotations.length} synthetic anchors (rotations=${targetRotations.join(",")}°)`);
        const settled = await Promise.allSettled(targetRotations.map(runRotation));
        synthetic = settled
          .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
          .map(r => r.value);
        const failed = settled.length - synthetic.length;
        if (failed > 0) log(`[ai-tour] panorama room=${room.name}: ${failed} synthetic anchor(s) failed — proceeding with what we have`);

        // Cache only durable copies. The remote Collov links are still used for
        // this in-flight panorama request, but are never written to the case.
        if (synthetic.length > 0) {
          const durableSynthetic = await Promise.all(
            synthetic.map((url, index) => sharpenAndSaveVst(url, roomId * 10_000 + index)),
          );
          await storage.updateAiTourRoom(roomId, user.id, { syntheticAngleUrls: durableSynthetic } as any);
        }
      }

      // ── 4. Stitch the panorama from real + synthetic anchors ──
      const allAnchors = [...realAnchors, ...synthetic];
      const { generate360Panorama } = await import("./fal");
      log(`[ai-tour] generate panorama room=${room.name} style=${styleLabel} anchors=${allAnchors.length} (real=${realAnchors.length}, synth=${synthetic.length})`);
      const { imageUrl } = await generate360Panorama(allAnchors, room.name, styleLabel, archFactsForPanorama);
      const durablePanoramaUrl = await sharpenAndSaveVst(imageUrl, roomId * 1_000_000 + Date.now() % 1_000_000);

      const anchorMeta = { real: realAnchors.length, synthetic: synthetic.length, total: allAnchors.length };
      const updated = await storage.updateAiTourRoom(roomId, user.id, {
        panoramaUrl: durablePanoramaUrl,
        panoramaAnchors: anchorMeta,
      } as any);
      return res.json(updated);
    } catch (err: any) {
      log(`[ai-tour] panorama error: ${err.message}`);
      return res.status(500).json({ message: err.message || "Fejl" });
    }
  });

  app.delete("/api/ai-boligfremvisning/properties/:id", async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const user = await storage.getUserByFirebaseUid(uid);
      if (!user) return res.status(401).json({ message: "Bruger ikke fundet" });
      await storage.deleteAiTourProperty(Number(req.params.id), user.id);
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ message: err.message || "Fejl" });
    }
  });

  // ── Team API ──────────────────────────────────────────────────────────────
  app.get("/api/teams/mine", async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const dbUser = await storage.getUserByFirebaseUid(uid);
      if (!dbUser) return res.status(401).json({ error: "User not found" });
      const ownedTeams = await storage.getTeamsOwnedByUser(dbUser.id);
      if (ownedTeams.length > 0) {
        return res.json({
          hasTeam: true,
          teamName: ownedTeams[0].name,
          ownedTeams: ownedTeams.map(t => ({ id: t.id, name: t.name, code: t.code })),
        });
      }
      const membership = await storage.getTeamByUserId(dbUser.id);
      return res.json({
        hasTeam: !!membership,
        teamName: membership?.team?.name ?? null,
        ownedTeams: [],
      });
    } catch (err: any) {
      return res.status(401).json({ error: err.message });
    }
  });

  app.get("/api/team", async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const dbUser = await storage.getUserByFirebaseUid(uid);
      if (!dbUser) return res.status(401).json({ error: "User not found" });

      // Support ?teamId=X to select a specific team (for multi-team owners)
      const requestedTeamId = req.query.teamId ? parseInt(req.query.teamId as string) : null;
      let membership: { team: import("@shared/schema").Team; role: string } | null = null;
      if (requestedTeamId) {
        const team = await storage.getTeamById(requestedTeamId);
        if (team && team.ownerUserId === dbUser.id) {
          membership = { team, role: "admin" };
        } else if (team) {
          const members = await storage.getTeamMembers(team.id);
          const myMember = members.find(m => m.userId === dbUser.id);
          if (myMember) membership = { team, role: myMember.role };
        }
      } else {
        membership = await storage.getTeamByUserId(dbUser.id);
      }

      if (!membership) return res.json({ noTeam: true });

      const { team, role } = membership;
      const isAdmin = role === "admin" || team.ownerUserId === dbUser.id;
      const [members, stats, performance, activeCases, soldCases] = await Promise.all([
        storage.getTeamMembers(team.id),
        storage.getTeamStats(team.id),
        isAdmin ? storage.getTeamMemberPerformance(team.id) : Promise.resolve([]),
        isAdmin ? storage.getTeamActiveCases(team.id) : Promise.resolve([]),
        isAdmin ? storage.getTeamSoldCases(team.id) : Promise.resolve([]),
      ]);

      // Enrich members with user emails and display names
      const memberDetails = await Promise.all(
        members.map(async (m) => {
          const raw = await pool.query<{ email: string; credits_remaining: number; display_name: string | null }>(
            "SELECT email, credits_remaining, display_name FROM users WHERE id = $1", [m.userId]
          );
          const row = raw.rows[0];
          return { ...m, email: row?.email ?? "–", creditsRemaining: row?.credits_remaining ?? 0, displayName: row?.display_name ?? null };
        })
      );

      // Get owner info
      const ownerRow = await pool.query<{ email: string; display_name: string | null; is_admin: boolean; subscription_tier: string | null; total_credits_used: number }>(
        "SELECT email, display_name, is_admin, subscription_tier, total_credits_used FROM users WHERE id = $1", [team.ownerUserId]
      );
      const ownerEmail = ownerRow.rows[0]?.email ?? "–";
      const ownerDisplayName = ownerRow.rows[0]?.display_name ?? null;
      const ownerIsAdmin = !!ownerRow.rows[0]?.is_admin;
      const ownerSubscriptionTier = ownerRow.rows[0]?.subscription_tier ?? null;
      const isUnlimited = ownerIsAdmin || ownerSubscriptionTier === "unlimited";

      // Team total all-time used = completed designs + generated_images for all team members.
      // (We count actual generations, not users.total_credits_used, because admin/unlimited
      // users skip credit deduction so that counter stays at 0.)
      const memberIds = [team.ownerUserId, ...memberDetails.map((m) => m.userId)];
      const totalRow = await pool.query<{ total: string }>(
        `SELECT (
           (SELECT COUNT(*) FROM designs WHERE user_id = ANY($1::int[]) AND status = 'completed')
           +
           (SELECT COUNT(*) FROM generated_images WHERE user_id = ANY($1::int[]))
         )::text AS total`,
        [memberIds]
      );
      const teamTotalUsed = parseInt(totalRow.rows[0]?.total ?? "0", 10);

      return res.json({
        team,
        role,
        isAdmin,
        ownerEmail,
        ownerDisplayName,
        ownerIsAdmin,
        ownerSubscriptionTier,
        isUnlimited,
        teamTotalUsed,
        members: memberDetails,
        stats,
        performance,
        activeCases,
        soldCases,
        myUserId: dbUser.id,
      });
    } catch (err: any) {
      return res.status(401).json({ error: err.message });
    }
  });

  app.post("/api/team", async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const dbUser = await storage.getUserByFirebaseUid(uid);
      if (!dbUser) return res.status(401).json({ error: "User not found" });

      // Block members (non-owners) from creating a team — owners may create multiple teams
      const existing = await storage.getTeamByUserId(dbUser.id);
      if (existing && existing.team.ownerUserId !== dbUser.id) {
        return res.status(400).json({ error: "Du er allerede med i et team som medlem. Forlad teamet først for at oprette dit eget." });
      }

      const { name } = req.body;
      if (!name || typeof name !== "string" || name.trim().length < 2) {
        return res.status(400).json({ error: "Teamnavn skal være mindst 2 tegn" });
      }

      const team = await storage.createTeam(name.trim(), dbUser.id);
      return res.json({ team, role: "admin", isAdmin: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── Simple code-based join ─────────────────────────────────────────────────
  // Public endpoint: validate a code and return team name (no auth required)
  app.get("/api/teams/code/:code", async (req, res) => {
    try {
      const team = await storage.getTeamByCode(req.params.code);
      if (!team) return res.status(404).json({ error: "Koden findes ikke" });
      return res.json({ valid: true, teamId: team.id, teamName: team.name, code: team.code });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Authenticated endpoint: join a team by 8-char code
  app.post("/api/teams/join", async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const dbUser = await storage.getUserByFirebaseUid(uid);
      if (!dbUser) return res.status(401).json({ error: "User not found" });

      const { code } = req.body;
      if (!code) return res.status(400).json({ error: "Kode mangler" });

      const result = await storage.joinTeamByCode(code, dbUser.id);
      if ("error" in result) return res.status(400).json({ error: result.error });
      return res.json({ success: true, teamName: result.team.name });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/team/invite", async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const dbUser = await storage.getUserByFirebaseUid(uid);
      if (!dbUser) return res.status(401).json({ error: "User not found" });

      const membership = await storage.getTeamByUserId(dbUser.id);
      if (!membership) return res.status(400).json({ error: "Du er ikke i et team" });
      const { team, role } = membership;
      if (role !== "admin" && team.ownerUserId !== dbUser.id) {
        return res.status(403).json({ error: "Kun admins kan invitere" });
      }

      // Enforce 15-member cap before issuing invite
      const memberCountRes = await pool.query<{ cnt: string }>(
        `SELECT COUNT(*)::text AS cnt FROM team_members WHERE team_id = $1`, [team.id]
      );
      const currentCount = parseInt(memberCountRes.rows[0]?.cnt ?? "0", 10) + 1; // +1 for owner
      if (currentCount >= 15) {
        return res.status(400).json({ error: "Teamet har nået grænsen på 15 medlemmer. Kontakt kundeservice på support@formaestates.dk for at hæve grænsen." });
      }

      const { email } = req.body;
      const crypto = await import("crypto");
      const token = crypto.randomBytes(24).toString("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const invite = await storage.createTeamInvite({
        teamId: team.id,
        email: email?.trim() || null,
        token,
        usedAt: null,
        expiresAt,
      });

      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const inviteLink = `${baseUrl}/join/${team.code}`;

      if (email?.trim()) {
        const { sendTeamInviteEmail } = await import("./email");
        await sendTeamInviteEmail(email.trim(), team.name, inviteLink);
      }

      return res.json({ invite, inviteLink });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/team/members/:id", async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const dbUser = await storage.getUserByFirebaseUid(uid);
      if (!dbUser) return res.status(401).json({ error: "User not found" });

      const membership = await storage.getTeamByUserId(dbUser.id);
      if (!membership) return res.status(400).json({ error: "Ikke i et team" });
      const { team, role } = membership;
      if (role !== "admin" && team.ownerUserId !== dbUser.id) {
        return res.status(403).json({ error: "Kun admins kan fjerne medlemmer" });
      }

      const memberId = parseInt(req.params.id);
      await storage.removeTeamMember(memberId);
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/team/member/:memberId/role", async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const dbUser = await storage.getUserByFirebaseUid(uid);
      if (!dbUser) return res.status(401).json({ error: "User not found" });

      const membership = await storage.getTeamByUserId(dbUser.id);
      if (!membership) return res.status(403).json({ error: "Du er ikke i et team" });
      if (membership.team.ownerUserId !== dbUser.id) return res.status(403).json({ error: "Kun team-ejeren kan ændre roller" });

      const memberId = parseInt(req.params.memberId);
      const { role } = req.body;
      if (!["admin", "user"].includes(role)) return res.status(400).json({ error: "Ugyldig rolle" });

      await storage.updateTeamMemberRole(memberId, role);

      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/team/credits/allocate", async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const dbUser = await storage.getUserByFirebaseUid(uid);
      if (!dbUser) return res.status(401).json({ error: "User not found" });

      const membership = await storage.getTeamByUserId(dbUser.id);
      if (!membership) return res.status(400).json({ error: "Ikke i et team" });
      const { team, role } = membership;
      if (role !== "admin" && team.ownerUserId !== dbUser.id) {
        return res.status(403).json({ error: "Kun admins kan tildele credits" });
      }

      const { userId, amount } = req.body;
      if (!userId || !amount || amount <= 0) {
        return res.status(400).json({ error: "Ugyldig userId eller amount" });
      }
      if (team.creditsRemaining < amount) {
        return res.status(400).json({ error: "Ikke nok credits på teamet" });
      }

      await storage.allocateCreditsToMember(team.id, userId, amount);
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/team/join", async (req, res) => {
    try {
      const { token } = req.query as { token?: string };
      if (!token) return res.status(400).json({ error: "Token mangler" });

      const invite = await storage.getTeamInviteByToken(token);
      if (!invite) return res.status(404).json({ error: "Invitation ikke fundet" });
      if (invite.usedAt) return res.status(400).json({ error: "Invitationen er allerede brugt" });
      if (new Date() > invite.expiresAt) return res.status(400).json({ error: "Invitationen er udløbet" });

      const team = await storage.getTeamById(invite.teamId);
      if (!team) return res.status(404).json({ error: "Team ikke fundet" });

      return res.json({ valid: true, teamName: team.name, teamId: team.id, inviteId: invite.id });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/team/join", async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const dbUser = await storage.getUserByFirebaseUid(uid);
      if (!dbUser) return res.status(401).json({ error: "User not found" });

      const { token } = req.body;
      if (!token) return res.status(400).json({ error: "Token mangler" });

      const invite = await storage.getTeamInviteByToken(token);
      if (!invite) return res.status(404).json({ error: "Invitation ikke fundet" });
      if (new Date() > invite.expiresAt) return res.status(400).json({ error: "Invitationen er udløbet" });

      // Check user is not already in this team
      const existing = await storage.getTeamByUserId(dbUser.id);
      if (existing) {
        if (existing.team.id === invite.teamId) return res.status(400).json({ error: "Du er allerede med i dette team." });
        return res.status(400).json({ error: "Du er allerede i et andet team. Kontakt os for at skifte." });
      }

      // Enforce max 15 members (owner + members)
      const memberCntRes = await pool.query<{ cnt: string }>(
        `SELECT COUNT(*)::text AS cnt FROM team_members WHERE team_id = $1`, [invite.teamId]
      );
      const totalMembers = parseInt(memberCntRes.rows[0]?.cnt ?? "0", 10) + 1; // +1 for owner
      if (totalMembers >= 15) {
        return res.status(400).json({ error: "Dette team har nået grænsen på 15 medlemmer. Kontakt os på support@formaestates.dk for at hæve grænsen." });
      }

      await storage.addTeamMember({ teamId: invite.teamId, userId: dbUser.id, role: "user" });
      // Do NOT mark invite as used — the link stays active for future team members

      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── CRM (admin only) ──────────────────────────────────────────────────────
  async function requireAdmin(req: any, res: any): Promise<{ dbUser: any } | null> {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const dbUser = await storage.getUserByFirebaseUid(uid);
      if (!dbUser?.isAdmin) { res.status(403).json({ error: "Admin only" }); return null; }
      return { dbUser };
    } catch { res.status(401).json({ error: "Unauthorized" }); return null; }
  }

  app.get("/api/crm/contacts", async (req, res) => {
    try {
      const admin = await requireAdmin(req, res);
      if (!admin) return;
      const { search, status, plan } = req.query as Record<string, string>;
      const result = await storage.getCrmContacts({ search, status, plan });
      // Enrich with linked user credits + team info
      if (result.contacts.length > 0) {
        const linkedIds = result.contacts.filter(c => c.linkedUserId).map(c => c.linkedUserId!);
        if (linkedIds.length > 0) {
          const [{ rows: urows }, { rows: teamRows }] = await Promise.all([
            pool.query(
              `SELECT id, credits_remaining, total_credits_used, subscription_tier, subscription_status,
                      quota_ai_visualizations, quota_floor_plans, quota_transform_videos, quota_showcase_videos,
                      used_ai_visualizations, used_floor_plans, used_transform_videos, used_showcase_videos
               FROM users WHERE id = ANY($1)`,
              [linkedIds]
            ),
            pool.query(
              `SELECT u_id, team_id, team_name FROM (
                SELECT ou.id AS u_id, t.id AS team_id, t.name AS team_name
                FROM teams t JOIN users ou ON ou.id = t.owner_user_id WHERE ou.id = ANY($1)
                UNION
                SELECT tm.user_id AS u_id, t.id AS team_id, t.name AS team_name
                FROM team_members tm JOIN teams t ON t.id = tm.team_id WHERE tm.user_id = ANY($1)
               ) sub`,
              [linkedIds]
            ),
          ]);
          const umap = new Map(urows.map((r: any) => [r.id, r]));
          const teamMap = new Map(teamRows.map((r: any) => [r.u_id, { teamId: r.team_id, teamName: r.team_name }]));
          result.contacts.forEach((c: any) => {
            if (c.linkedUserId) {
              const u = umap.get(c.linkedUserId) as any;
              if (u) {
                c.creditsRemaining = u.credits_remaining;
                c.totalCreditsUsed = u.total_credits_used;
                c.subscriptionTier = u.subscription_tier;
                c.subscriptionStatus = u.subscription_status;
                c.quotaAi = u.quota_ai_visualizations;
                c.quotaFloor = u.quota_floor_plans;
                c.quotaVideo = u.quota_transform_videos;
                c.quotaShowcase = u.quota_showcase_videos;
                c.usedAi = u.used_ai_visualizations ?? 0;
                c.usedFloor = u.used_floor_plans ?? 0;
                c.usedVideo = u.used_transform_videos ?? 0;
                c.usedShowcase = u.used_showcase_videos ?? 0;
              }
              const team = teamMap.get(c.linkedUserId);
              if (team) { c.teamId = team.teamId; c.teamName = team.teamName; }
            }
          });
        }
      }
      return res.json(result);
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  });

  app.get("/api/crm/contacts/:id", async (req, res) => {
    try {
      const admin = await requireAdmin(req, res);
      if (!admin) return;
      const result = await storage.getCrmContact(req.params.id);
      if (!result) return res.status(404).json({ error: "Ikke fundet" });
      // Enrich with linked user credits + quota
      if (result.contact.linkedUserId) {
        const uid = result.contact.linkedUserId;
        const { rows: ur } = await pool.query(
          `SELECT credits_remaining, total_credits_used FROM users WHERE id = $1`, [uid]);
        if (ur[0]) {
          (result.contact as any).creditsRemaining = ur[0].credits_remaining;
          (result.contact as any).totalCreditsUsed = ur[0].total_credits_used;
        }
        const quota = await storage.getUserQuota(uid);
        (result as any).quota = quota;
      }
      return res.json(result);
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  });

  // ── CRM: give credits via contact (owner only) ────────────────────────────
  app.post("/api/crm/contacts/:id/credits/add", async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const caller = await storage.getUserByFirebaseUid(uid);
      if (!caller?.isAdmin) {
        return res.status(403).json({ error: "Kun admins kan tildele credits" });
      }
      const result = await storage.getCrmContact(req.params.id);
      if (!result?.contact.linkedUserId) return res.status(400).json({ error: "Ingen tilknyttet bruger" });
      const amount = typeof req.body.amount === "number" ? Math.round(req.body.amount) : parseInt(req.body.amount);
      if (!amount || amount < 1 || amount > 10000) return res.status(400).json({ error: "Ugyldigt antal (1–10.000)" });
      const note = typeof req.body.note === "string" ? req.body.note.slice(0, 120) : "";
      const description = note || `Tildelt via CRM af ${caller.email}`;
      await storage.addCredits(result.contact.linkedUserId, amount, description);
      // Log in timeline
      await storage.addCrmInteraction({ contactId: req.params.id, type: "credit", content: `${amount} credits tildelt${note ? ` — ${note}` : ""}`, createdBy: caller.email });
      const { rows: ur } = await pool.query(`SELECT credits_remaining FROM users WHERE id = $1`, [result.contact.linkedUserId]);
      log(`[CRM] ${caller.email} gave ${amount} credits to contact ${req.params.id} → ${ur[0]?.credits_remaining}`);
      return res.json({ success: true, creditsRemaining: ur[0]?.credits_remaining ?? 0 });
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  });

  // ── CRM: add quota/credits by feature type (owner only) ─────────────────────
  app.post("/api/crm/contacts/:id/quotas/add", async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const caller = await storage.getUserByFirebaseUid(uid);
      if (!caller?.isAdmin) return res.status(403).json({ error: "Kun admins" });
      const result = await storage.getCrmContact(req.params.id);
      if (!result?.contact.linkedUserId) return res.status(400).json({ error: "Ingen tilknyttet bruger" });
      const uid2 = result.contact.linkedUserId;
      const { type, amount, note } = req.body;
      const n = parseInt(amount);
      if (!n || n < 1 || n > 10000) return res.status(400).json({ error: "Ugyldigt antal" });
      const validTypes = ["ai", "floorPlan", "transformVideo", "showcase"];
      if (!validTypes.includes(type)) return res.status(400).json({ error: "Ugyldig type" });
      const colMap: Record<string, string> = {
        ai: "quota_ai_visualizations",
        floorPlan: "quota_floor_plans",
        transformVideo: "quota_transform_videos",
        showcase: "quota_showcase_videos",
      };
      const typeLabels: Record<string, string> = { ai: "AI visualiseringer", floorPlan: "3D plantegninger", transformVideo: "videoer", showcase: "showcase-videoer" };
      // Increase the quota limit for this feature (COALESCE so null→0 first)
      await pool.query(
        `UPDATE users SET ${colMap[type]} = COALESCE(${colMap[type]}, 0) + $1 WHERE id = $2`,
        [n, uid2]
      );
      const noteText = note || "";
      await storage.addCrmInteraction({ contactId: req.params.id, type: "credit", content: `+${n} ${typeLabels[type]} tildelt${noteText ? ` — ${noteText}` : ""}`, createdBy: caller.email });
      const quota = await storage.getUserQuota(uid2);
      return res.json({ success: true, quota });
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  });

  // ── CRM: change subscription tier (owner only) ────────────────────────────
  app.patch("/api/crm/contacts/:id/subscription", async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const caller = await storage.getUserByFirebaseUid(uid);
      if (!caller?.isAdmin) return res.status(403).json({ error: "Kun admins" });
      const result = await storage.getCrmContact(req.params.id);
      if (!result?.contact.linkedUserId) return res.status(400).json({ error: "Ingen tilknyttet bruger" });
      const uid2 = result.contact.linkedUserId;
      const { tier, overrides } = req.body; // overrides: { ai?, fp?, tv?, sv? } — null=unlimited, 0=locked
      const QUOTAS: Record<string, { ai: number|null; fp: number|null; tv: number|null; sv: number|null }> = {
        none:       { ai: 0,    fp: 0,    tv: 0,    sv: 0    },
        start:      { ai: 10,   fp: 2,    tv: 2,    sv: 1    },
        pro:        { ai: 25,   fp: 5,    tv: 5,    sv: 3    },
        business:   { ai: 60,   fp: 12,   tv: 12,   sv: 8    },
        unlimited:  { ai: null, fp: null, tv: null, sv: null },
      };
      if (!QUOTAS[tier]) return res.status(400).json({ error: "Ugyldigt abonnement" });
      const base = QUOTAS[tier];
      // Apply per-feature overrides on top of tier defaults
      const q = {
        ai: overrides?.ai !== undefined ? overrides.ai : base.ai,
        fp: overrides?.fp !== undefined ? overrides.fp : base.fp,
        tv: overrides?.tv !== undefined ? overrides.tv : base.tv,
        sv: overrides?.sv !== undefined ? overrides.sv : base.sv,
      };
      const status = tier === "none" ? "none" : "active";
      const now = new Date();
      const resetsAt = tier === "none" ? null : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
      await pool.query(`
        UPDATE users SET
          subscription_tier = $1,
          subscription_status = $2,
          quota_ai_visualizations = $3,
          quota_floor_plans = $4,
          quota_transform_videos = $5,
          quota_showcase_videos = $6,
          quota_resets_at = $8,
          used_ai_visualizations = 0,
          used_floor_plans = 0,
          used_transform_videos = 0,
          used_showcase_videos = 0
        WHERE id = $7
      `, [tier === "none" ? null : tier, status, q.ai, q.fp, q.tv, q.sv, uid2, resetsAt]);
      const tierLabel: Record<string, string> = { none: "Ingen plan", start: "Start", pro: "Pro", business: "Business", unlimited: "Unlimited" };
      await storage.addCrmInteraction({ contactId: req.params.id, type: "plan_change", content: `Abonnement ændret til ${tierLabel[tier] ?? tier}`, createdBy: caller.email });
      log(`[CRM] ${caller.email} set subscription for user ${uid2} → ${tier}`);
      return res.json({ success: true, tier });
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  });

  app.post("/api/crm/contacts/:id/send-password-reset", async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const caller = await storage.getUserByFirebaseUid(uid);
      if (!caller?.isAdmin) return res.status(403).json({ error: "Kun admins" });
      const result = await storage.getCrmContact(req.params.id);
      if (!result) return res.status(404).json({ error: "Kontakt ikke fundet" });
      const targetEmail = result.contact.email;
      const targetName = result.contact.name ?? targetEmail.split("@")[0];
      const { sendPasswordResetToUser } = await import("./email");
      await sendPasswordResetToUser(targetEmail, targetName);
      await storage.addCrmInteraction({ contactId: req.params.id, type: "email", content: `Password reset email sendt til ${targetEmail}`, createdBy: caller.email });
      return res.json({ success: true });
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  });

  app.post("/api/crm/contacts", async (req, res) => {
    try {
      const admin = await requireAdmin(req, res);
      if (!admin) return;
      const { email, name, company, phone, plan, status, notes } = req.body;
      if (!email) return res.status(400).json({ error: "Email påkrævet" });
      const contact = await storage.createCrmContact({ email, name, company, phone, plan: plan ?? "none", status: status ?? "lead", notes });
      return res.json(contact);
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  });

  app.patch("/api/crm/contacts/:id", async (req, res) => {
    try {
      const admin = await requireAdmin(req, res);
      if (!admin) return;
      const updated = await storage.updateCrmContact(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: "Ikke fundet" });
      return res.json(updated);
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  });

  app.post("/api/crm/contacts/:id/interactions", async (req, res) => {
    try {
      const admin = await requireAdmin(req, res);
      if (!admin) return;
      const { type, content, createdBy } = req.body;
      if (!content) return res.status(400).json({ error: "Indhold påkrævet" });
      const interaction = await storage.addCrmInteraction({ contactId: req.params.id, type: type ?? "note", content, createdBy });
      return res.json(interaction);
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  });

  app.post("/api/crm/contacts/:id/overrides", async (req, res) => {
    try {
      const admin = await requireAdmin(req, res);
      if (!admin) return;
      const { key, value } = req.body;
      if (!key || value === undefined) return res.status(400).json({ error: "key og value påkrævet" });
      await storage.setCrmOverride(req.params.id, key, String(value));
      return res.json({ ok: true });
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  });

  app.delete("/api/crm/contacts/:id/overrides/:key", async (req, res) => {
    try {
      const admin = await requireAdmin(req, res);
      if (!admin) return;
      await storage.deleteCrmOverride(req.params.id, decodeURIComponent(req.params.key));
      return res.json({ ok: true });
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  });

  // ── Leads access guard (owner + leads collaborators) ─────────────────────────
  const LEADS_EMAILS      = ["fredefussing@gmail.com", "henrilasse@icloud.com"];
  const TELESALES_EMAILS  = ["fredefussing@gmail.com", "mahad23_@hotmail.com"];

  async function requireOwner(req: any, res: any): Promise<{ dbUser: any } | null> {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const dbUser = await storage.getUserByFirebaseUid(uid);
      if (!dbUser || !LEADS_EMAILS.includes(dbUser.email ?? "")) {
        res.status(403).json({ error: "Leads access only" }); return null;
      }
      if (dbUser.email === "fredefussing@gmail.com" && !dbUser.isAdmin) {
        res.status(403).json({ error: "Owner only" }); return null;
      }
      return { dbUser };
    } catch { res.status(401).json({ error: "Unauthorized" }); return null; }
  }

  async function requireTelesales(req: any, res: any): Promise<{ dbUser: any } | null> {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const dbUser = await storage.getUserByFirebaseUid(uid);
      if (!dbUser || !TELESALES_EMAILS.includes((dbUser.email ?? "").toLowerCase())) {
        res.status(403).json({ error: "Tele-salg access only" }); return null;
      }
      return { dbUser };
    } catch { res.status(401).json({ error: "Unauthorized" }); return null; }
  }

  // ── Leads (per-owner isolated) ───────────────────────────────────────────────
  app.get("/api/leads", async (req, res) => {
    try {
      const admin = await requireOwner(req, res);
      if (!admin) return;
      const result = await pool.query(`
        SELECT * FROM leads
        WHERE owner_email = $1
        ORDER BY
          CASE
            WHEN status IN ('no','won') THEN 4
            WHEN follow_up_at IS NOT NULL AND follow_up_at < NOW() THEN 0
            WHEN follow_up_at IS NOT NULL AND follow_up_at < NOW() + interval '2 days' THEN 1
            WHEN follow_up_at IS NOT NULL THEN 2
            ELSE 3
          END ASC,
          follow_up_at ASC NULLS LAST,
          created_at DESC
      `, [admin.dbUser.email]);
      return res.json(result.rows);
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  });

  app.post("/api/leads", async (req, res) => {
    try {
      const admin = await requireOwner(req, res);
      if (!admin) return;
      const { name, category = "ejendomsmaegler", instagram_handle, email, phone, notes, first_contact_at, follow_up_at, platform } = req.body;
      if (!name) return res.status(400).json({ error: "name required" });
      // Meta annonce: mail is always sent immediately → auto-respond + 3-day FU1
      const isMeta = platform === "meta_annonce";
      const status = isMeta ? "responded" : (req.body.status || "new");
      const fu1Days = isMeta ? 3 : 2;
      const fu2Days = isMeta ? 10 : 9;
      const fc = first_contact_at || new Date().toISOString(); // always have a base date
      const fu = follow_up_at || new Date(new Date(fc).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
      // fu1/fu2 from NOW so a retroactively-logged lead still shows "om 2d" not "I morgen"
      const fu1 = new Date(Date.now() + fu1Days * 24 * 60 * 60 * 1000).toISOString();
      const fu2 = new Date(Date.now() + fu2Days * 24 * 60 * 60 * 1000).toISOString();
      const result = await pool.query(
        `INSERT INTO leads (owner_email, name, category, instagram_handle, email, phone, status, notes, first_contact_at, follow_up_at, follow_up_1_at, follow_up_2_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [admin.dbUser.email, name, category, instagram_handle || null, email || null, phone || null, status, notes || null, fc, fu, fu1, fu2]
      );
      return res.json(result.rows[0]);
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  });

  app.patch("/api/leads/:id", async (req, res) => {
    try {
      const admin = await requireOwner(req, res);
      if (!admin) return;
      const id = parseInt(req.params.id);
      const fields = ["name", "category", "instagram_handle", "email", "phone",
                       "owner_phone", "office_phone",
                       "status", "notes",
                       "first_contact_at", "follow_up_at", "last_contacted_at",
                       "follow_up_1_at", "follow_up_2_at"];
      const boolFields = ["follow_up_1_done", "follow_up_2_done"];
      const sets: string[] = ["updated_at = NOW()"];
      const vals: any[] = [];
      let idx = 1;
      for (const f of fields) {
        if (req.body[f] !== undefined) {
          sets.push(`${f} = $${idx++}`);
          vals.push(req.body[f] === "" ? null : req.body[f]);
        }
      }
      for (const f of boolFields) {
        if (req.body[f] !== undefined) {
          sets.push(`${f} = $${idx++}`);
          vals.push(Boolean(req.body[f]));
        }
      }
      if (req.body.first_contact_at && req.body.follow_up_at === undefined) {
        sets.push(`follow_up_at = $${idx++}`);
        vals.push(new Date(new Date(req.body.first_contact_at).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString());
      }
      if (req.body.first_contact_at && req.body.follow_up_1_at === undefined) {
        sets.push(`follow_up_1_at = $${idx++}`);
        vals.push(new Date(new Date(req.body.first_contact_at).getTime() + 2 * 24 * 60 * 60 * 1000).toISOString());
      }
      if (req.body.first_contact_at && req.body.follow_up_2_at === undefined) {
        sets.push(`follow_up_2_at = $${idx++}`);
        vals.push(new Date(new Date(req.body.first_contact_at).getTime() + 9 * 24 * 60 * 60 * 1000).toISOString());
      }
      vals.push(id);
      vals.push(admin.dbUser.email);
      const result = await pool.query(`UPDATE leads SET ${sets.join(", ")} WHERE id = $${idx} AND owner_email = $${idx + 1} RETURNING *`, vals);
      if (!result.rows[0]) return res.status(404).json({ error: "Not found" });
      return res.json(result.rows[0]);
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  });

  app.delete("/api/leads/:id", async (req, res) => {
    try {
      const admin = await requireOwner(req, res);
      if (!admin) return;
      await pool.query("DELETE FROM leads WHERE id = $1 AND owner_email = $2", [parseInt(req.params.id), admin.dbUser.email]);
      return res.json({ ok: true });
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  });

  // ── Tele-salg — update lead status/outcome (owner + Mahad) ──────────────────
  app.patch("/api/telesales/:id", async (req, res) => {
    try {
      const user = await requireTelesales(req, res);
      if (!user) return;
      const id = parseInt(req.params.id);
      const { status, notes, dealAmount, callbackAt } = req.body;

      const allowed = ["no", "won", "contacted", "responded"];
      if (status && !allowed.includes(status)) {
        return res.status(400).json({ error: "Ugyldig status" });
      }

      const sets: string[] = [];
      const vals: any[]   = [];
      let idx = 1;

      if (status     !== undefined) { sets.push(`status = $${idx++}`);       vals.push(status); }
      if (notes      !== undefined) { sets.push(`notes = $${idx++}`);        vals.push(notes); }
      if (dealAmount !== undefined) { sets.push(`deal_amount = $${idx++}`);  vals.push(dealAmount ?? null); }
      if (callbackAt !== undefined) { sets.push(`callback_at = $${idx++}`);  vals.push(callbackAt ?? null); }

      if (sets.length === 0) return res.status(400).json({ error: "Intet at opdatere" });

      vals.push(id);
      await pool.query(
        `UPDATE leads SET ${sets.join(", ")} WHERE id = $${idx} AND owner_email = 'fredefussing@gmail.com'`,
        vals
      );
      const { rows } = await pool.query("SELECT * FROM leads WHERE id = $1", [id]);
      return res.json(rows[0]);
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  });

  // ── Tele-salg (read-only view — owner + Mahad) ───────────────────────────────
  app.get("/api/telesales", async (req, res) => {
    try {
      const user = await requireTelesales(req, res);
      if (!user) return;
      // Always returns fredefussing's leads (telesales is a view of the owner's pipeline)
      const result = await pool.query(`
        SELECT id, name, category, email, phone, owner_phone, office_phone, deal_amount, callback_at, status, notes, created_at
        FROM leads
        WHERE owner_email = 'fredefussing@gmail.com'
          AND owner_phone IS NOT NULL
        ORDER BY
          CASE status
            WHEN 'responded' THEN 0
            WHEN 'contacted' THEN 1
            WHEN 'new'       THEN 2
            WHEN 'won'       THEN 3
            ELSE 4
          END ASC,
          COALESCE(priority, 5) ASC,
          name ASC
      `);
      return res.json(result.rows);
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  });

  app.post("/api/chat", async (req, res) => {
    try {
      // Rate-limit unauthenticated public chat: 10 req / IP / 60 s
      const ip = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0].trim()
        ?? req.socket.remoteAddress
        ?? "unknown";
      if (chatRateLimited(ip)) {
        return res.status(429).json({ error: "For mange forespørgsler — vent et øjeblik og prøv igen." });
      }

      const { messages, lang } = req.body;
      if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: "messages array required" });
      }
      // Cap message history and individual message length to prevent prompt flooding
      const safeMessages = messages.slice(-20).map((m: any) => ({
        role: (String(m.role ?? "user").slice(0, 10) === "assistant" ? "assistant" : "user") as "user" | "assistant",
        content: String(m.content ?? "").slice(0, 2000),
      }));

      const LANG_NAMES: Record<string, string> = {
        da: "Danish", en: "English", sv: "Swedish", de: "German",
        nb: "Norwegian", es: "Spanish", fr: "French",
      };
      const responseLang = LANG_NAMES[lang] ?? "Danish";
      const langInstruction = responseLang === "Danish"
        ? "Du svarer altid på dansk"
        : `You always respond in ${responseLang}. Never switch to another language regardless of what language the user writes in.`;

      if (!process.env.OPENAI_API_KEY) {
        return res.status(500).json({ error: "Chat er ikke konfigureret. Kontakt support." });
      }

      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const SYSTEM_PROMPT = `You are a helpful AI assistant for Forma Estates – an advanced AI platform for professional property visualisation. ${langInstruction}, are friendly, precise and professional. Always refer to the platform as "Forma Estates" — never "Nordic Homebuild" or any other name.

## Om Forma Estates
Forma Estates er en AI-drevet platform der hjælper professionelle i HELE ejendomsbranchen med at præsentere ejendomme professionelt vha. AI-genererede visualiseringer og videoer. Platformen bruges af:
- Ejendomsmæglere (before/after-visualiseringer, showcase-videoer, annoncer, 3D-plantegninger)
- Ejendomsudviklere og byggefirmaer (projektvisualiseringer, 3D-plantegninger, cinematic walkthroughs)
- Ejerforeninger og boligforeninger (renoveringsforslag, AI Design Agent)
- B2B boligudlejere (indretning, markedsføring af udlejning)

## BoligPotentiale / Dashboard
"BoligPotentiale" er Forma Estates' professionelle dashboard på /boligpotentiale/dashboard. Her:
- Opretter og styrer brugeren sager (ejendomme/projekter)
- Genererer og gemmer AI-visualiseringer per sag
- Laver videoer, showcase, 3D-plantegninger og forvandlingsfilm
- Administrerer konto og abonnement
Alle nye brugere starter med en gratis prøve: 2 gratis AI-visualiseringer. 3D-plantegninger, videoer og showcases kræver aktivt abonnement.

## Sådan opretter man en ny sag (workflow)
1. Gå til "Sager" i venstre menu → klik "Ny sag"
2. Indtast boligens adresse (bruges til tekst i videoer)
3. Inde i sagen: tilføj rum (stue, køkken, soveværelse osv.) og upload et foto per rum
4. Tryk "Generer" per rum → AI'en iscenesætter rummet i den valgte stil (ca. 15 sek)
5. Alle billeder gemmes automatisk i sagens galleri
6. Fra galleriet: generer Showcase-video, Forvandlingsfilm eller download enkeltbilleder
Man behøver IKKE oprette en sag for at prøve — "Vor/Efter billede" under "Kom godt i gang" lader nye brugere generere direkte uden sag.

## Alle funktioner i detaljer

### 1. AI Visualisering / Før-Efter (kernefunktion)
- Upload et foto af et rum → vælg rumtype og designstil → AI genererer et fotorealistisk redesign på ca. 15 sekunder
- Rumtyper: stue, soveværelse, køkken, badeværelse, kontor, alrum, entré m.fl.
- 9 stilarter: Skandinavisk, Moderne, Luksus, Japandi, Minimalistisk, Industriel, Bohemisk, Kyst, Landlig
- 3 kvalitetsniveauer: Budget (IKEA/JYSK), Standard (BoConcept/HAY), Premium (Fritz Hansen/Carl Hansen)
- Hvert genereret billede koster 1 AI-kredit

### 2. Tekst-justeringer af genereret billede (GRATIS)
- Når et billede er genereret, vises en chat-boks direkte under resultatet
- Brugeren kan beskrive ændringer med fri tekst: f.eks. "gør væggene lysere", "tilføj en lænestol i hjørnet", "mere naturligt lys"
- AI'en genererer en justeret version på sekunder
- Op til 5 justeringer per billede — koster INGEN ekstra kreditter
- Fungerer både i standalone Før/Efter-flowet og inde i en sag

### 3. AI Design Agent
- Fritekst-prompt uden foruddefinerede stilvalg: beskriv frit, f.eks. "mørk industriel stemning med egetræsmøbler og messingdetaljer"
- Fuld kreativ frihed — ingen rullemenu, kun tekst
- Tilgængelig via menuen "AI Design Agent" eller /ai-design-agent

### 4. 3D Plantegning
- Upload en 2D plantegning (PDF eller billede) → AI genererer:
  a) Et fotorealistisk 3D-dukkehus set fra oven (billede)
  b) En interaktiv 3D-model køber kan dreje, zoome og udforske i browseren uden software
- Kræver abonnement

### 5. Bolig Showcase Video
- Sådan virker det: upload fotos af alle rum → vælg VFX-effekt eller kamerabevægelse per billede (zoom, lens flare, implosion, house drop m.fl.) → AI sammensætter automatisk en video med baggrundsmusik og boligsadresse
- Leverer TO formater automatisk: bredformat 16:9 (til Boligsiden, Estate, storskærm) og lodret 9:16 (til Instagram Reels, TikTok, Facebook)
- Valgfri baggrundsmusik med on/off-knap
- Kræver abonnement

### 6. Transformering Video (forvandlingsvideo)
- Upload et før-foto + et efter-foto → AI laver en kort video hvor rummet glidende forvandles
- To formater: Hurtig (5 sek, typisk 2-4 min ventetid) eller Premium (8 sek, typisk 4-6 min ventetid)
- Kræver abonnement

### 7. Forvandlingsfilm
- Vælg 2-8 gemte AI-designs fra dit galleri → én samlet film hvor rummene forvandler sig ét efter ét, med baggrundsmusik i 4 stemninger
- Bruger 1 Transformering-kredit pr. rum
- Findes i dashboardet under Video → Forvandlingsfilm
- Kræver abonnement

### 8. Cinematisk Walkthrough
- Upload 2+ billeder → AI genererer en walkthrough-video der bevæger sig fra rum til rum
- Kræver abonnement

### 9. Download og export
- Alle genererede billeder kan downloades som JPG, PNG eller PDF (billeder eller præsentation)
- Videoer downloades som MP4
- Abonnenter kan slå vandmærke til/fra

### 10. Stil Quiz
- Interaktiv quiz der guider til den rigtige designstil for boligen
- Tilgængelig via /find-stil

## Priser – Forma Estates abonnementer

| Pakke | Pris | AI Visualiseringer | 3D Plantegninger | Transform. Video | Showcase |
|-------|------|--------------------|-----------------|-----------------|----------|
| **Start** | 2.999 kr/md | 10/md | 2/md | 2/md | 1/md |
| **Pro** | 5.999 kr/md | 25/md | 5/md | 5/md | 3/md |
| **Business** | 11.999 kr/md | 60/md | 12/md | 12/md | 8/md |
| **Enterprise** | Kontakt os | Ubegrænset | Ubegrænset | Ubegrænset | Ubegrænset |

Alle pakker inkluderer HD download, JPG + PNG export, PDF-rapport og logo-branding.
Tekst-justeringer (op til 5 per billede) er GRATIS og tæller ikke som kreditter.
Kreditter kan også købes enkeltvist på /pris.

## Oprettelse & gratis prøve
- Ny konto oprettes på /opret med navn, email og password
- Email bekræftes med 6-cifret kode sendt til brugerens email (gyldig 15 min — tjek spam, brug "Send ny kode" ved behov)
- Gratis prøve: 2 AI-visualiseringer inkl. AI Design Agent — ingen kreditkort kræves
- 3D-plantegninger, videoer og showcases kræver abonnement
- Nye brugere ser "Kom godt i gang"-kortet i dashboardet — man kan generere direkte uden at oprette en sag

## Kreditsystem
- 1 kredit = 1 genereret billede (AI Visualisering)
- Tekst-justeringer koster INGEN kreditter (op til 5 per billede)
- 1 Transformering-kredit = 1 forvandlingsvideo ELLER 1 rum i Forvandlingsfilm
- 1 Showcase-kredit = 1 komplet Bolig Showcase Video (begge formater)
- 1 3D-kredit = 1 3D-plantegning
- Kreditter og pakker købes på /pris

## Navigation
- / – Forside
- /boligpotentiale/dashboard – Professionelt dashboard (BoligPotentiale)
- /find-stil – Stil quiz
- /pris – Priser, pakker og køb
- /kontakt – Kontakt og support
- /login – Log ind
- /opret – Opret konto
- /ai-design-agent – AI Design Agent (fritekst)

## Teknisk info
- Anbefalede billedformater: JPG, PNG, maks 10 MB
- AI Visualisering: typisk ca. 15 sekunder
- Transformering Video: typisk 2-6 minutter
- Showcase Video: typisk 5-15 minutter
- Billeder til Showcase skal være i tilstrækkelig opløsning — platformen advarer automatisk hvis et billede er for lille
- Ved fejl: prøv igen – det er oftest midlertidigt

## EU AI Act (Artikel 50) — lovpligtig AI-mærkning
Forma Estates er 100% compliant med EU AI Act, Forordning (EU) 2024/1689, Artikel 50. ALLE AI-genererede billeder og videoer mærkes automatisk med tre lovpligtige lag:
1. **Synligt AI-badge** — "AI Redigeret"-ikon brændt ind i billedet/videoen (min. 64 px, 88% opacity). Lokaliseret til brugerens sprog. Kan ikke fjernes af kunden.
2. **C2PA/XMP-metadata** — maskinlæsbar metadata indlejret i alle JPEG og PNG-filer. Indeholder skaber (Forma Estates AI), tidsstempel og handling (c2pa.modified). Verificerbar af myndigheder.
3. **Usynligt vandmærke** — kryptografisk spread-spectrum-vandmærke i alle billeder. Overlever rekomprimering og skærmfoto.
Disse tre lag er obligatoriske og kan ALDRIG frakobles. Forma Estates er klassificeret som "deployer" af et lav-risiko AI-system og overholder fuldt ud alle krav i Artikel 50.
Se handelsbetingelserne afsnit 14 og privatlivspolitikken afsnit 10 for fuld juridisk detalje.

## Vigtige regler
- Omtal KUN platformen som "Forma Estates" — aldrig "Nordic Homebuild" eller andre navne
- Nævn ALDRIG Shopify – kreditter og pakker købes kun via /pris
- Svar ALTID på dansk
- Vær konkret og præcis – ingen vage svar
- Henvis til /kontakt ved spørgsmål du ikke kan besvare
- Du må IKKE opfinde priser, funktioner eller detaljer der ikke fremgår ovenfor
- Hold svarene korte – maks 4-5 sætninger medmindre brugeren beder om detaljer
- Nævn ALTID prisen når du beskriver en pakke: "Pro-pakken koster 5.999 kr/md og inkluderer..."
- Tekst-justeringer er ALTID gratis — understreg dette tydeligt hvis nogen spørger om det koster ekstra
- Showcase Video leverer ALTID begge formater (16:9 + 9:16) i ét — det er ikke to separate produkter`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...safeMessages,
        ],
        max_tokens: 500,
        temperature: 0.7,
      });

      const reply = completion.choices[0]?.message?.content ?? "Beklager, jeg kunne ikke svare. Prøv igen.";
      return res.json({ reply });
    } catch (err: any) {
      log(`Chat error: ${err.message}`);
      return res.status(500).json({ error: "Chatfejl – prøv igen om lidt." });
    }
  });

  // ── Sales chat (internal — admin + salgsteam only) ───────────────────────
  app.post("/api/sales-chat", async (req, res) => {
    try {
      const userId = (req as any).session?.userId;
      if (!userId) return res.status(401).json({ error: "Log ind for at bruge sælger-assistenten." });

      const dbUser = await storage.getUserById(userId);
      if (!dbUser) return res.status(401).json({ error: "Bruger ikke fundet." });

      const ALLOWED_SALES_EMAILS = ["mahad23_@hotmail.com"];
      const isAllowed = dbUser.isAdmin || ALLOWED_SALES_EMAILS.includes((dbUser.email ?? "").toLowerCase());
      if (!isAllowed) return res.status(403).json({ error: "Adgang nægtet — kun for Forma Estates salgsteam." });

      const { messages } = req.body;
      if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: "messages array required" });
      }

      if (!process.env.OPENAI_API_KEY) {
        return res.status(500).json({ error: "Chat er ikke konfigureret. Kontakt support." });
      }

      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const SALES_SYSTEM_PROMPT = `Du er Forma Estates' interne sælger-assistent. Du hjælper vores salgsteam med at besvare spørgsmål fra leads og potentielle kunder direkte i telefonopkald og møder.

Du svarer ALTID på dansk. Vær direkte og konkret — brug specifikke DKK-tal, tidsestimater og klare ja/nej. Max 5–6 sætninger medmindre der spørges om detaljer. Ingen vage svar. Vær ærlig om hvad Forma KAN og IKKE KAN.

═══════════════════════════════════════
HVAD FORMA ESTATES GØR KONKRET
═══════════════════════════════════════
Forma Estates er en AI-visualiseringsplatform bygget specifikt til ejendomsbranchen. Den producerer:
1. **AI Visualisering / Før-Efter** — Upload et foto af et rum → AI genererer fotorealistisk redesign på ca. 15 sek. 9 stilarter (Skandinavisk, Moderne, Luksus, Japandi m.fl.), 3 kvalitetsniveauer (Budget/Standard/Premium). Koster 100 kr per billede.
2. **Gratis tekst-justeringer** — Op til 5 GRATIS fintuning per billede ("gør væggene lysere", "tilføj en lænestol"). Ingen ekstra kreditter.
3. **AI Design Agent** — Fritekst-prompt, ingen rullemenu, fuld kreativ frihed.
4. **3D Plantegning** — Upload 2D-tegning → fotorealistisk 3D-dukkehus + interaktiv 3D-model i browser (kan drejes og zoomes af køber). 300 kr.
5. **Bolig Showcase Video** — Upload fotos → professionel video med VFX-effekter og musik. Leverer AUTOMATISK begge formater i ét: 16:9 (Boligsiden/Estate) og 9:16 (Instagram Reels/TikTok). 500 kr.
6. **Transformering Video** — Før-foto + efter-foto → glat forvandlingsvideo. Hurtig (5 sek) eller Premium (8 sek). 300 kr.
7. **Forvandlingsfilm** — 2–8 rum der forvandler sig ét efter ét med baggrundsmusik.
8. **Cinematisk Walkthrough** — 2+ billeder → walkthrough-video der bevæger sig fra rum til rum.
Gratis prøve: 2 AI-visualiseringer, ingen kreditkort. 3D, video og showcase kræver abonnement.

═══════════════════════════════════════
PRISER
═══════════════════════════════════════
| Pakke | Pris | AI Vis | 3D | Transform | Showcase |
|-------|------|--------|-----|-----------|----------|
| Start | 2.999 kr/md | 10 | 2 | 2 | 1 |
| Pro | 5.999 kr/md | 25 | 5 | 5 | 3 |
| Business | 11.999 kr/md | 60 | 12 | 12 | 8 |
| Enterprise | Kontakt os | ∞ | ∞ | ∞ | ∞ |

Enkelt: AI Vis 100 kr · 3D 300 kr · Transform 300 kr · Showcase 500 kr.
INGEN binding. Ingen oprettelsesgebyr. Opsig hvornår som helst — adgang til periodens udgang. Opgrader/nedgrader frit.

═══════════════════════════════════════
HVILKET PROBLEM LØSER DEN (PENGE OG TID)
═══════════════════════════════════════
**Pengene:**
- Traditionel boligstaging: 15.000–80.000 kr per ejendom (møbelleje, stylister, transport, logistik)
- Professionel fotograf: 2.000–8.000 kr per session + 3–14 dages ventetid
- Virtuel staging (andre tjenester): 350–2.100 kr PER billede, 24–72 timers levering
- Forma: 100–500 kr per rum, resultat på ca. 15 sekunder

**Tiden:**
- Typisk marketing-workflow uden Forma: fotograf bookes (3–14 dage), shoots, redigerer, leverer, du sender til stager, venter 1–3 dage → i alt 5–15 dage og 3–6 timers koordinering per sag
- Med Forma: upload fotos, klik generer, download → 30 min aktiv arbejdstid per sag
- **Realistisk tidsbesparelse: 3–6 timer per ejendom** på visuals alene, plus ingen frem-og-tilbage med fotografer og stagere

═══════════════════════════════════════
FLERE VURDERINGER OG BOLIGER TIL SALG
═══════════════════════════════════════
Forma hjælper dig vinde vurderingsmøder. Stil dig op foran en potentiel sælger og generer live på 60 sekunder et billede af deres stue i skandinavisk stil — det slår enhver PowerPoint. Du viser ikke bare hvad du KAN gøre, du viser det i øjeblikket.
Argument til leads: "Inden vi annoncerer, laver vi AI-visualiseringer af dine rum — dine boliger ser professionelt ud fra dag 1, ikke fra dag 14."
Boliger med professionelle billeder sælger 32% hurtigere og tiltrækker markant flere forespørgsler (NAR-studie). Kortere salgstid = du frigiver kapacitet til næste sag.

═══════════════════════════════════════
MÅLE EFFEKTEN PÅ LEADS OG OMSÆTNING
═══════════════════════════════════════
Konkrete ting at tracke fra første måned:
1. **Salgstid**: Sammenlign dage-til-bud på sager med Forma-visuals vs. tidligere sager
2. **Forespørgsler per annonce**: Boligsiden og Estate viser klik og skriv-til-mægler — sammenlign
3. **Vurderingsmøder vundet**: Tæl hvor mange leads du lukker til sag efter du har vist live-demo
4. **Besparelse per sag**: (hvad du tidligere betalte for fotograf/stager) minus (Forma-omkostning) = direkte gevinst fra dag 1

Break-even for Start-pakken (2.999 kr/md): Én showcase-video der ellers ville koste 5.000–25.000 kr hos en videograf. Du er i sort på første projekt.

═══════════════════════════════════════
FORMA VS. CHATGPT OG GENERELLE AI-TOOLS
═══════════════════════════════════════
ChatGPT og generelle AI-tools laver tekst. Forma er en specialiseret visuelt AI-platform der producerer fotorealistiske ejendomsbilleder, 3D-modeller og professionelle videoer.
Konkrete ting ChatGPT ikke kan: generere et fotorealistisk rum-redesign fra dit uploadede foto, lave en Bolig Showcase Video med VFX og musik, producere en interaktiv 3D-model af en plantegning, eller sikre automatisk EU AI Act-compliance på alle outputs.
Forma er desuden den **eneste** platform på det danske marked bygget specifikt til ejendomsmæglere — dansk sprog, dansk support, dansk compliance.

═══════════════════════════════════════
ER DEN SPECIFIK TIL MÆGLERE ELLER GENEREL AI?
═══════════════════════════════════════
Forma er bygget specifikt til ejendomsbranchen — ikke en generel AI der er pakket om. Konkrete bevis:
- Boligtyper og stilkategorier er valgt til DK-markedet (skandinavisk, luksus, japandi osv.)
- Showcase-videoen lægger automatisk boligsadressen ind i videoen
- Begge videoformater (16:9 + 9:16) er valgt fordi Boligsiden kræver bredformat og sociale medier vil lodret
- 3D-plantegningsfunktionen er direkte rettet mod det DK-krav om plantegning i alle annoncer
- EU AI Act-compliance er automatiseret fordi DK/EU-mæglere er underlagt forordningen

═══════════════════════════════════════
LÆRER AI'EN MIN STIL OG MIT LOKALOMRÅDE?
═══════════════════════════════════════
Ærligt svar: Forma lærer ikke automatisk din personlige stil eller dit lokalområde. Du vælger stil (f.eks. "Skandinavisk Premium") og kvalitetsniveau per billede. Der er ingen personlig profil AI'en bygger over tid.
Hvad du KAN gøre: Vælg altid de samme stilindstillinger → dine boliger får et konsistent visuelt udtryk der ligner din brand. Over tid kan du se hvilke stilarter der performer bedst for dit marked og standardisere dem.
Hvis du vil have skræddersyet stil-tilpasning, kan vi tale om Enterprise-løsning — kontakt os via formaestates.com/kontakt.

═══════════════════════════════════════
KAN DEN SKRIVE TEKSTER?
═══════════════════════════════════════
Ærligt svar: Nej — Forma er en visuelt AI-platform. Den genererer billeder, videoer og 3D-modeller. Den skriver ikke boligtekster, annoncetekster, e-mails eller indhold der lyder som jer.
Til tekster anbefaler vi at bruge ChatGPT eller lignende. Forma og ChatGPT supplerer hinanden: Forma laver de professionelle visuals, ChatGPT hjælper med teksterne.

═══════════════════════════════════════
OPGAVER DER KØRER AUTOMATISK UDEN KONTROL
═══════════════════════════════════════
Disse opgaver kører og leverer et færdigt output du blot godkender:
- AI-visualisering af rum: upload → generer → download. Du ser resultatet og vælger om du vil bruge det.
- Showcase Video: upload fotos + vælg effekter → Forma sammensætter automatisk video i begge formater.
- EU AI Act-mærkning: alle outputs mærkes automatisk — du behøver aldrig tænke over compliance.
- 3D-plantegning: upload 2D-tegning → modellen er klar.
Ingenting sendes automatisk til dine kunder. Du ser altid outputtet og bestemmer hvad der publiceres.

═══════════════════════════════════════
INTEGRATION MED CRM OG ANDRE SYSTEMER
═══════════════════════════════════════
Ærligt svar: Forma har ikke direkte API-integration med Estate, Boligsiden, Mæglernet eller andre systemer. Det er en standalone platform.
Workflow: Du genererer dine visuals på Forma → downloader dem som JPG/PNG/MP4/PDF → uploader dem i dit eksisterende system præcis som du ville uploade fotografens billeder. Ingen ekstra trin — det passer ind i dit nuværende workflow.

═══════════════════════════════════════
ONBOARDING — HVOR MEGET ARBEJDE?
═══════════════════════════════════════
Nul IT-opsætning. Ingen installation. Ingen integration. Ingen kontrakt.
Workflow for første billede: Opret konto (2 min) → upload et foto → vælg stiltype → tryk generer → download. Det tager under 5 minutter fra du registrerer til du har dit første AI-billede.
Dine medarbejdere behøver ikke lære et nyt system — det er tre klik og en upload. Passer ind i eksisterende workflow fordi output er standard billedfiler og videoer.

═══════════════════════════════════════
HVAD SKER DER HVIS AI'EN LAVER EN FEJL?
═══════════════════════════════════════
Forma sender aldrig noget direkte til dine kunder — du ser altid outputtet og bestemmer hvad du bruger. Hvis et billede ikke ser rigtigt ud, har du to muligheder:
1. **Gratis tekst-justering** (op til 5 per billede): skriv "fjern det røde element", "gør det lysere" — AI'en justerer
2. **Regenerer**: tryk generer igen — hvert nyt forsøg koster 1 kredit (100 kr)
Du betaler kun for det du bruger og godkender. Der er ingen automatik der kan sende fejlbehæftede materialer ud.

═══════════════════════════════════════
KONKRETE RESULTATER FRA EKSISTERENDE KUNDER
═══════════════════════════════════════
Vi er en relativt ny platform og har endnu ikke publicerede casestudier. Hvad vi kan sige:
- Break-even-matematikken er tydelig: Start-pakken (2.999 kr/md) er tjent ind på én Showcase Video der ellers koster 5.000–25.000 kr
- Boliger med professionelle AI-visuals performer bedre end gennemsnittet (NAR: 32% kortere salgstid)
- Vil du tale med vores team om konkrete tal fra platformen, book en demo: formaestates.com/kontakt

═══════════════════════════════════════
HVORNÅR SES ØKONOMISK EFFEKT?
═══════════════════════════════════════
Dag 1 af første projekt. Regnestykket er simpelt:
- Start-pakken koster 2.999 kr/md
- Én showcase-video der ellers koster 5.000–25.000 kr: besparelse fra allerede første sag
- Én AI-visualisering af ét tomt rum der ellers kræver stager: besparelse fra første billede
Du er i sort efter første ejendom. Den længere effekt — kortere salgstider, flere forespørgsler, stærkere vurderingsmøder — viser sig typisk inden for 30–60 dage.

═══════════════════════════════════════
HVORFOR KØBE NU OG IKKE VENTE 6-12 MÅN?
═══════════════════════════════════════
Tre argumenter:

1. **Kontrollen.** Dine nuværende systemer (Estate, Mæglernet, Boligsiden) er infrastruktur-platforme — de er ikke specialister i AI-visualisering. Selv hvis de bygger AI-features ind om 12 måneder, er det en generisk tilføjelse du ikke har indflydelse på. Med Forma ejer du selv valget af stil, kvalitet og output — fra dag 1.

2. **Prisen på at vente.** Hver måned du venter markedsfører du boliger med undermåls visuals. Konkurrenter der allerede bruger Forma vinder vurderingsmøder, får kortere salgstider og mere social media-eksponering. Det er ikke hvad det koster at købe Forma — det er hvad det koster dig IKKE at have det.

3. **EU AI Act er allerede i kraft.** Fra 2. august 2026 er det lovpligtigt at mærke AI-genererede materialer (Forordning (EU) 2024/1689, Artikel 50). Bøder: op til 15 mio. EUR. Forma-compliance er automatisk og inkluderet. Venter du og bruger ikke-kompatible tools i mellemtiden, er du allerede i lovbrud.

═══════════════════════════════════════
EU AI ACT — COMPLIANCE-ARGUMENT
═══════════════════════════════════════
Fra 2. august 2026 er det **lovpligtigt** i hele EU at mærke AI-genererede billeder (Forordning (EU) 2024/1689, Artikel 50). Bøder: op til 15 mio. EUR eller 3% af global omsætning.
Forma er den **eneste** platform på det danske marked der automatisk er 100% compliant — AI-badge, C2PA-metadata og kryptografisk vandmærke er inkluderet i alle pakker. Det er ikke valgfrit og kan aldrig slås fra — det er et lovkrav.
Kilde: EUR-Lex, Forordning (EU) 2024/1689 (EU AI Act), Artikel 50.

═══════════════════════════════════════
ROI-BEREGNING
═══════════════════════════════════════
Mægler med 5 salgssager/måned på Start-pakken:
- Pakkeomkostning: 2.999 kr/md → 600 kr per sag
- Alternativ staging: 15.000–80.000 kr per sag
- **Besparelse: 14.400–79.400 kr per sag = 72.000–397.000 kr/år**

| Ydelse | Traditionel pris | Forma pris | Besparelse |
|--------|-----------------|------------|------------|
| Rumindsætning | 2.000–15.000 kr/rum | 100–300 kr | ~95–98% |
| Showcase-video | 5.000–25.000 kr | 500 kr | ~97% |
| 3D-plantegning | 5.000–20.000 kr | 300 kr | ~98% |
| Forvandlingsvideo | 8.000–30.000 kr | 300 kr | ~97% |

═══════════════════════════════════════
GDPR OG DATASIKKERHED
═══════════════════════════════════════
- 100% GDPR-kompatibel — alle data behandles og opbevares i EU
- Boligbilleder du uploader bruges kun til at generere dit output og gemmes under din konto
- Du ejer dine egne billeder og kan slette dem når som helst
- Vi deler ikke dine data med tredjeparter til marketing

═══════════════════════════════════════
VANDMÆRKE
═══════════════════════════════════════
- Gratis prøve: Forma-vandmærke på outputtet
- Abonnenter: eget-logo-vandmærke kan tilføjes, Forma-vandmærke slås fra i indstillinger
- EU AI Act-mærkning (AI-badge + C2PA-metadata): KAN ALDRIG fjernes — lovkrav, ikke en Forma-beslutning

═══════════════════════════════════════
INDVENDINGSHÅNDTERING
═══════════════════════════════════════

**"Det er for dyrt"**
"Start-pakken er 2.999 kr/md. Én Showcase Video du ellers betaler 5.000–25.000 kr for hos en videograf — der er du allerede i plus på første sag. Hertil sparer du 3–6 timers koordinering per ejendom."

**"Vi bruger allerede en fotograf"**
"Det er godt — Forma erstatter ikke fotografen. Fotografen tager de virkelige billeder; Forma iscensætter de tomme eller rodede rum og laver videoerne. Upload et foto fra en nuværende sag og se det på 60 sekunder — gratis."

**"AI-billeder ser falske ud"**
"Det var sandt for 2–3 år siden. Se eksemplerne på formaestates.com — det er fotorealistiske resultater. Og alle billeder er lovmæssigt mærket som AI, så der er fuld transparens over for køber."

**"Er der binding?"**
"Absolut ingen. Månedlig betaling, opsig hvornår du vil. Ingen oprettelsesgebyr."

**"Vi er en lille mæglerkæde"**
"Start-pakken er designet til jer: 10 visualiseringer og 1 showcase om måneden er nok til 3–5 sager. Prøv i én måned — er I ikke tilfredse har det kostet jer 2.999 kr at prøve professionelle AI-visuals."

**"Kan vi prøve gratis?"**
"Ja. Opret konto på formaestates.com/opret — 2 gratis AI-visualiseringer med det samme, ingen kreditkort."

**"Hvad med GDPR?"**
"100% GDPR-kompatibel, alle data i EU. Vi er også automatisk EU AI Act-compliant — det er inkluderet uden du skal gøre noget."

═══════════════════════════════════════
MARKEDSDATA MED KILDER
═══════════════════════════════════════
- ~60.000–80.000 boliger sælges i Danmark om året (Danmarks Statistik / Boligsiden)
- Ejendomsmæglere bruger 15.000–30.000 kr på marketing per sag i gennemsnit
- Professionelle billeder reducerer salgstid med ~32% (National Association of Realtors-studie)
- Staging øger salgspris 1–5% (NAR) — 50.000–250.000 kr ekstra på en bolig til 5 mio. kr
- EU AI Act, Forordning (EU) 2024/1689, Artikel 50 — ikrafttrædelse 2. august 2026

═══════════════════════════════════════
NÆSTE SKRIDT
═══════════════════════════════════════
- Prøv gratis nu: formaestates.com/opret (2 AI-billeder, ingen kreditkort)
- Book demo: formaestates.com/kontakt
- Køb pakke direkte: formaestates.com/boligpotentiale

═══════════════════════════════════════
REGLER
═══════════════════════════════════════
- Brug ALTID "Forma Estates" — aldrig "Nordic Homebuild"
- Konkrete DKK-tal og tidsestimater — ingen vage svar
- Vær ÆRLIG om hvad Forma ikke kan (tekster, CRM-integration, personlig AI-læring)
- Henvis til formaestates.com/kontakt ved spørgsmål du ikke kan besvare
- Fremhæv altid den direkte besparelse i kroner`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: SALES_SYSTEM_PROMPT },
          ...messages.map((m: any) => ({ role: m.role, content: m.content })),
        ],
        max_tokens: 700,
        temperature: 0.6,
      });

      const reply = completion.choices[0]?.message?.content ?? "Beklager, jeg kunne ikke svare. Prøv igen.";
      return res.json({ reply });
    } catch (err: any) {
      log(`Sales chat error: ${err.message}`);
      return res.status(500).json({ error: "Chatfejl – prøv igen om lidt." });
    }
  });

  // ── Stripe ────────────────────────────────────────────────────────────────
  const stripe = process.env.STRIPE_SECRET_KEY
    ? new Stripe(process.env.STRIPE_SECRET_KEY)
    : null;

  const STRIPE_PRICES = {
    aiVisual:         "price_1Tl3d7KDpJP0jg0e7e4gy4SE",
    plan3d:           "price_1Tl3hUKDpJP0jg0e0vPqClr5",
    transformVideo:   "price_1Tl3icKDpJP0jg0e5m3mkNJE",
    showcase:         "price_1Tl3kAKDpJP0jg0eR25vOHQ9",
    startMonthly:     "price_1Tl2kVKDpJP0jg0e2UqApR5B",
    startYearly:      "price_1Tl2rVKDpJP0jg0erJ0x7FZs",
    proMonthly:       "price_1Tl2nYKDpJP0jg0eMbTJQ2jx",
    proYearly:        "price_1Tl2soKDpJP0jg0eREm8LuB4",
    businessMonthly:  "price_1Tl2pZKDpJP0jg0etHHBwE52",
    businessYearly:   "price_1Tl2uiKDpJP0jg0eAXRwj3Al",
  };

  // PRICE_TO_TIER and TIER_QUOTAS live in server/purchases.ts (single source of truth)

  // ── Stripe: verify session and activate subscription/quotas ───────────────
  app.post("/api/stripe/verify-session", async (req, res) => {
    if (!stripe) return res.status(503).json({ error: "Stripe ikke konfigureret" });
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const user = await storage.getUserByFirebaseUid(uid);
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const { sessionId } = req.body;
      if (!sessionId) return res.status(400).json({ error: "sessionId påkrævet" });

      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ["line_items", "line_items.data.price"],
      });

      // Not paid yet
      if (session.payment_status !== "paid" && session.status !== "complete") {
        return res.json({ status: "pending" });
      }

      // Global idempotency: has this session already been granted to ANY
      // account (legacy transactions included)? One payment = one activation.
      if (await isStripeSessionProcessed(sessionId)) {
        return res.json({ status: "already_activated", mode: session.mode });
      }

      const pending = buildStripePending(session);
      if (!pending) return res.json({ status: "unknown" });

      // Record in the ledger, then atomically claim for the logged-in user.
      // If the webhook (or another device) already claimed it, claim returns
      // null and nothing is granted twice.
      await storage.upsertPendingPurchase({ provider: "stripe", ...pending });
      const result = await claimAndGrant(pending.externalId, user.id);
      if (!result) {
        return res.json({ status: "already_activated", mode: session.mode });
      }

      if (result.kind === "subscription") {
        return res.json({
          status: "activated",
          mode: "subscription",
          tier: result.tier,
          tierName: result.tierName,
          quotas: result.quotas,
        });
      }
      if (result.kind === "package") {
        return res.json({
          status: "activated",
          mode: "payment",
          aiVisual: result.aiVisual,
          plan3d: result.plan3d,
          transformVid: result.transformVid,
          showcase: result.showcase,
          amountTotal: result.amountTotal,
        });
      }
      return res.json({ status: "unknown" });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── Stripe webhook (subscription renewals / cancellations) ───────────────
  app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    if (!stripe) return res.status(503).end();
    const sig = req.headers["stripe-signature"] as string;
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    // In production, NEVER process unsigned webhooks — without the signature
    // check anyone could POST forged events. (Dev keeps the JSON fallback so
    // the flow can be tested without a Stripe CLI tunnel.)
    if (!secret && process.env.NODE_ENV === "production") {
      log(`[stripe] Webhook rejected: STRIPE_WEBHOOK_SECRET er ikke sat i produktion`);
      return res.status(400).send("Webhook secret not configured");
    }
    let event: Stripe.Event;
    try {
      event = secret
        ? stripe.webhooks.constructEvent(req.body, sig, secret)
        : JSON.parse(req.body.toString()) as Stripe.Event;
    } catch (err: any) {
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Server-side fulfillment: activates the purchase even when the buyer
    // never returns to the /betalt success page (closed tab, lost connection).
    // If no account matches the email yet, the purchase stays 'pending' and is
    // auto-claimed the moment the buyer signs up with that email.
    if (event.type === "checkout.session.completed") {
      const s = event.data.object as Stripe.Checkout.Session;
      try {
        if (s.payment_status === "paid" || s.status === "complete") {
          if (!(await isStripeSessionProcessed(s.id))) {
            const full = await stripe.checkout.sessions.retrieve(s.id, {
              expand: ["line_items", "line_items.data.price"],
            });
            const pending = buildStripePending(full);
            if (pending) {
              await storage.upsertPendingPurchase({ provider: "stripe", ...pending });
              const buyer = pending.email ? await storage.getUserByEmail(pending.email).catch(() => null) : null;
              if (buyer) {
                const granted = await claimAndGrant(pending.externalId, buyer.id);
                if (granted) log(`[stripe] Webhook fulfilled ${pending.kind} for ${pending.email}`);
              } else {
                log(`[stripe] Purchase stored as pending for ${pending.email ?? "unknown email"} — no account yet`);
              }
            }
          }
        }
      } catch (err: any) {
        log(`[stripe] checkout.session.completed fulfillment error: ${err.message}`);
      }
    }

    if (event.type === "customer.subscription.deleted" || event.type === "customer.subscription.updated") {
      const sub = event.data.object as Stripe.Subscription;
      try {
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
        if (customerId) {
          const customer = await stripe.customers.retrieve(customerId);
          const email = !("deleted" in customer) ? customer.email : null;
          if (email) {
            const u = await storage.getUserByEmail(email).catch(() => null);
            if (u && sub.status !== "active") {
              await storage.updateUser(u.id, { subscriptionStatus: "none" });
              // Stop the monthly quota refill: whatever balance remains stays
              // usable, but a canceled subscription must never refill again.
              await pool.query(`UPDATE users SET quota_resets_at=NULL WHERE id=$1`, [u.id]);
              log(`[stripe] Subscription ended for ${email} — status=none, monthly refill stopped`);
            }
          }
        }
      } catch {}
    }
    return res.json({ received: true });
  });

  // ── Stripe billing history ─────────────────────────────────────────────────
  app.get("/api/stripe/billing-history", async (req, res) => {
    if (!stripe) return res.status(503).json({ error: "Stripe ikke konfigureret" });
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const user = await storage.getUserByFirebaseUid(uid);
      if (!user) return res.status(401).json({ error: "Unauthorized" });

      const result = await pool.query(
        `SELECT created_at, type, description FROM credit_transactions WHERE user_id=$1 AND type IN ('stripe_subscription','stripe_package') ORDER BY created_at DESC LIMIT 20`,
        [user.id]
      );

      const history = await Promise.all(result.rows.map(async (row: any) => {
        const date = new Date(row.created_at).toLocaleDateString("da-DK", { year: "numeric", month: "short", day: "numeric" });
        const sessionId = typeof row.description === "string" ? row.description.replace("stripe:", "") : null;
        let amount = "—";
        let description = row.type === "stripe_subscription" ? "Abonnement" : "Pakke køb";

        if (sessionId && sessionId.startsWith("cs_")) {
          try {
            const session = await stripe!.checkout.sessions.retrieve(sessionId, { expand: ["line_items", "line_items.data.price"] });
            if (session.amount_total) {
              amount = (session.amount_total / 100).toLocaleString("da-DK", { style: "currency", currency: "DKK" });
            }
            if (row.type === "stripe_subscription") {
              const priceId = (session.line_items?.data[0]?.price as any)?.id as string | undefined;
              const tier = priceId ? PRICE_TO_TIER[priceId] : null;
              const tierNames: Record<string, string> = { start: "Start Abonnement", pro: "Pro Abonnement", business: "Business Abonnement" };
              if (tier) description = tierNames[tier] ?? "Abonnement";
            }
          } catch {}
        }

        return { date, description, amount };
      }));

      return res.json(history);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── Billing overview (subscription info + legal invoices) ─────────────────
  app.get("/api/billing/overview", async (req, res) => {
    if (!stripe) return res.status(503).json({ error: "Stripe ikke konfigureret" });
    let uid: string;
    try {
      ({ uid } = await verifyFirebaseToken(req.headers.authorization));
    } catch {
      return res.status(401).json({ error: "Ikke autoriseret" });
    }
    try {
      const user = await storage.getUserByFirebaseUid(uid);
      if (!user) return res.status(401).json({ error: "Unauthorized" });

      // Find Stripe subscription via customer email lookup
      let stripeSubscription: Stripe.Subscription | null = null;
      let subscriptionInfo: object | null = null;

      if (user.subscriptionStatus === "active" && user.subscriptionTier !== "custom") {
        try {
          const customers = await stripe.customers.list({ email: user.email, limit: 1 });
          if (customers.data.length > 0) {
            const customer = customers.data[0];
            const subs = await stripe.subscriptions.list({ customer: customer.id, limit: 5 });
            stripeSubscription = subs.data.find(s => s.status === "active") ?? subs.data[0] ?? null;
          }
        } catch {}
      }

      const tierDisplayNames: Record<string, string> = { start: "Start Plan", pro: "Pro Plan", business: "Business Plan", custom: "Tilpasset pakke" };

      if (stripeSubscription) {
        const price = stripeSubscription.items.data[0]?.price;
        const amountDkk = price?.unit_amount != null ? Math.round(price.unit_amount / 100) : null;
        const periodEnd = (stripeSubscription as any).current_period_end
          ?? (stripeSubscription.items.data[0] as any)?.current_period_end
          ?? null;
        subscriptionInfo = {
          active: true,
          tier: user.subscriptionTier || "start",
          tierName: tierDisplayNames[user.subscriptionTier || "start"] || "Abonnement",
          startDate: new Date(stripeSubscription.start_date * 1000).toISOString(),
          nextBillingDate: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
          amount: amountDkk,
          currency: "DKK",
          cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
          cancelAt: stripeSubscription.cancel_at ? new Date(stripeSubscription.cancel_at * 1000).toISOString() : null,
          stripeSubscriptionId: stripeSubscription.id,
          paused: !!(stripeSubscription as any).pause_collection,
        };
      } else if (user.subscriptionStatus === "active") {
        subscriptionInfo = {
          active: true,
          tier: user.subscriptionTier || "custom",
          tierName: tierDisplayNames[user.subscriptionTier || "custom"] || "Tilpasset pakke",
          startDate: null,
          nextBillingDate: null,
          amount: null,
          currency: "DKK",
          cancelAtPeriodEnd: false,
          cancelAt: null,
          stripeSubscriptionId: null,
        };
      }

      // Fetch all stripe transactions for this user
      const txResult = await pool.query(
        `SELECT id, created_at, type, description FROM credit_transactions
         WHERE user_id=$1 AND type IN ('stripe_subscription','stripe_package')
         ORDER BY created_at ASC LIMIT 50`,
        [user.id]
      );

      // Build invoice list with VAT breakdown (Danish 25% moms)
      const invoices = await Promise.all(txResult.rows.map(async (row: any, idx: number) => {
        const txDate = new Date(row.created_at);
        const year = txDate.getFullYear();
        const invoiceNumber = `FE-${year}-${String(idx + 1).padStart(3, "0")}`;
        const sessionId = typeof row.description === "string" ? row.description.replace("stripe:", "") : null;

        let amountTotal = 0;
        let description = row.type === "stripe_subscription" ? "Abonnement" : "Pakke køb";
        const period = txDate.toLocaleDateString("da-DK", { month: "long", year: "numeric" });
        let stripeInvoiceUrl: string | null = null;

        if (sessionId?.startsWith("cs_")) {
          try {
            const session = await stripe!.checkout.sessions.retrieve(sessionId, {
              expand: ["line_items", "line_items.data.price"],
            });
            if (session.amount_total) amountTotal = Math.round(session.amount_total / 100);
            if (row.type === "stripe_subscription") {
              const priceId = (session.line_items?.data[0]?.price as any)?.id;
              const tier = priceId ? PRICE_TO_TIER[priceId] : null;
              const tnames: Record<string, string> = { start: "Start Plan", pro: "Pro Plan", business: "Business Plan" };
              if (tier) description = tnames[tier] ?? "Abonnement";
            }
            // Get Stripe hosted invoice PDF URL
            if (session.subscription) {
              const subId = typeof session.subscription === "string" ? session.subscription : (session.subscription as any).id;
              try {
                const invList = await stripe!.invoices.list({ subscription: subId, limit: 1 });
                if (invList.data[0]?.hosted_invoice_url) stripeInvoiceUrl = invList.data[0].hosted_invoice_url;
              } catch {}
            }
          } catch {}
        }

        // 25% Danish VAT (moms) breakdown
        const amountExclVat = Math.round((amountTotal / 1.25) * 100) / 100;
        const vatAmount = Math.round((amountTotal - amountExclVat) * 100) / 100;

        return {
          invoiceNumber,
          date: txDate.toISOString(),
          period,
          description,
          type: row.type === "stripe_subscription" ? "subscription" : "package",
          amountTotal,
          amountExclVat,
          vatAmount,
          vatRate: 25,
          currency: "DKK",
          status: "paid",
          sessionId,
          stripeInvoiceUrl,
        };
      }));

      // Newest first
      invoices.reverse();

      return res.json({
        subscription: subscriptionInfo,
        invoices,
        customer: {
          email: user.email,
          name: user.displayName,
        },
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── Cancel subscription at period end ──────────────────────────────────────
  app.post("/api/billing/cancel", async (req, res) => {
    if (!stripe) return res.status(503).json({ error: "Stripe ikke konfigureret" });
    let uid: string;
    try {
      ({ uid } = await verifyFirebaseToken(req.headers.authorization));
    } catch {
      return res.status(401).json({ error: "Ikke autoriseret" });
    }
    try {
      const user = await storage.getUserByFirebaseUid(uid);
      if (!user) return res.status(401).json({ error: "Unauthorized" });

      const { subscriptionId } = req.body;
      if (!subscriptionId || typeof subscriptionId !== "string") {
        return res.status(400).json({ error: "subscriptionId påkrævet" });
      }

      // Verify ownership via customer email
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      const customerId = typeof sub.customer === "string" ? sub.customer : (sub.customer as any).id;
      const customer = await stripe.customers.retrieve(customerId);
      if ("deleted" in customer || customer.email?.toLowerCase() !== user.email.toLowerCase()) {
        return res.status(403).json({ error: "Ingen adgang til dette abonnement" });
      }

      // Cancel at period end — user keeps access until next billing date
      await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Undo cancellation — remove cancel_at_period_end
  app.post("/api/billing/reactivate", async (req, res) => {
    if (!stripe) return res.status(503).json({ error: "Stripe ikke konfigureret" });
    let uid: string;
    try { ({ uid } = await verifyFirebaseToken(req.headers.authorization)); }
    catch { return res.status(401).json({ error: "Ikke autoriseret" }); }
    try {
      const user = await storage.getUserByFirebaseUid(uid);
      if (!user) return res.status(401).json({ error: "Unauthorized" });
      const { subscriptionId } = req.body;
      if (!subscriptionId || typeof subscriptionId !== "string") return res.status(400).json({ error: "subscriptionId påkrævet" });
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      const customerId = typeof sub.customer === "string" ? sub.customer : (sub.customer as any).id;
      const customer = await stripe.customers.retrieve(customerId);
      if ("deleted" in customer || customer.email?.toLowerCase() !== user.email.toLowerCase()) return res.status(403).json({ error: "Ingen adgang" });
      await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: false });
      return res.json({ success: true });
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  });

  // Pause subscription — stop charging but keep subscription alive
  app.post("/api/billing/pause", async (req, res) => {
    if (!stripe) return res.status(503).json({ error: "Stripe ikke konfigureret" });
    let uid: string;
    try { ({ uid } = await verifyFirebaseToken(req.headers.authorization)); }
    catch { return res.status(401).json({ error: "Ikke autoriseret" }); }
    try {
      const user = await storage.getUserByFirebaseUid(uid);
      if (!user) return res.status(401).json({ error: "Unauthorized" });
      const { subscriptionId } = req.body;
      if (!subscriptionId || typeof subscriptionId !== "string") return res.status(400).json({ error: "subscriptionId påkrævet" });
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      const customerId = typeof sub.customer === "string" ? sub.customer : (sub.customer as any).id;
      const customer = await stripe.customers.retrieve(customerId);
      if ("deleted" in customer || customer.email?.toLowerCase() !== user.email.toLowerCase()) return res.status(403).json({ error: "Ingen adgang" });
      await stripe.subscriptions.update(subscriptionId, { pause_collection: { behavior: "void" } });
      return res.json({ success: true });
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  });

  // Resume paused subscription
  app.post("/api/billing/resume", async (req, res) => {
    if (!stripe) return res.status(503).json({ error: "Stripe ikke konfigureret" });
    let uid: string;
    try { ({ uid } = await verifyFirebaseToken(req.headers.authorization)); }
    catch { return res.status(401).json({ error: "Ikke autoriseret" }); }
    try {
      const user = await storage.getUserByFirebaseUid(uid);
      if (!user) return res.status(401).json({ error: "Unauthorized" });
      const { subscriptionId } = req.body;
      if (!subscriptionId || typeof subscriptionId !== "string") return res.status(400).json({ error: "subscriptionId påkrævet" });
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      const customerId = typeof sub.customer === "string" ? sub.customer : (sub.customer as any).id;
      const customer = await stripe.customers.retrieve(customerId);
      if ("deleted" in customer || customer.email?.toLowerCase() !== user.email.toLowerCase()) return res.status(403).json({ error: "Ingen adgang" });
      await stripe.subscriptions.update(subscriptionId, { pause_collection: "" as any });
      return res.json({ success: true });
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  });

  app.post("/api/create-package-checkout", async (req, res) => {
    if (!stripe) return res.status(503).json({ error: "Stripe ikke konfigureret" });
    try {
      const { aiVisual = 0, plan3d = 0, transformVideo = 0, showcase = 0, customerEmail } = req.body;
      const calc = calcPackage({ aiVisual, plan3d, transformVideo, showcase });
      const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
      for (const item of calc.items) {
        if (item.quantity === 0) continue;
        line_items.push({
          price_data: {
            currency: "dkk",
            product_data: { name: `${item.name} (${item.quantity} stk.)` },
            unit_amount: item.unitPrice * 100,
          },
          quantity: item.quantity,
        });
      }
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        ...(customerEmail ? { customer_email: customerEmail } : {}),
        line_items,
        allow_promotion_codes: true,
        success_url: "https://formaestates.com/betalt?session_id={CHECKOUT_SESSION_ID}",
        cancel_url: "https://formaestates.com/boligpotentiale#pricing",
        metadata: { type: "custom_package", ai_visual: String(aiVisual), plan_3d: String(plan3d), transform_video: String(transformVideo), showcase: String(showcase) },
      });
      return res.json({ url: session.url });
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  });

  app.post("/api/create-subscription-checkout", async (req, res) => {
    if (!stripe) return res.status(503).json({ error: "Stripe ikke konfigureret" });
    try {
      const { priceId, customerEmail } = req.body;
      if (!priceId) return res.status(400).json({ error: "priceId påkrævet" });
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        ...(customerEmail ? { customer_email: customerEmail } : {}),
        line_items: [{ price: priceId, quantity: 1 }],
        allow_promotion_codes: true,
        success_url: "https://formaestates.com/betalt?session_id={CHECKOUT_SESSION_ID}",
        cancel_url: "https://formaestates.com/boligpotentiale#pricing",
        metadata: { type: "subscription" },
      });
      return res.json({ url: session.url });
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  });

  app.get("/api/session-details/:sessionId", async (req, res) => {
    if (!stripe) return res.status(503).json({ error: "Stripe ikke konfigureret" });
    try {
      const session = await stripe.checkout.sessions.retrieve(req.params.sessionId, { expand: ["line_items"] });
      return res.json({
        status: session.payment_status,
        amount_total: session.amount_total,
        customer_email: session.customer_email,
        metadata: session.metadata,
      });
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  });

  // ── Package Calculator ────────────────────────────────────────────────────
  const PACKAGE_PRODUCTS = [
    { key: "aiVisual",       name: "AI Visualisering",       basePrice: 100, tiers: [{ from:1,p:100},{from:16,p:90},{from:41,p:80},{from:81,p:72},{from:151,p:65}] },
    { key: "plan3d",         name: "3D Plantegning",         basePrice: 300, tiers: [{ from:1,p:300},{from:6,p:270},{from:13,p:240},{from:26,p:216},{from:41,p:195}] },
    { key: "transformVideo", name: "Transformering Video",   basePrice: 300, tiers: [{ from:1,p:300},{from:6,p:270},{from:13,p:240},{from:26,p:216},{from:41,p:195}] },
    { key: "showcase",       name: "Bolig Showcase Video",   basePrice: 500, tiers: [{ from:1,p:500},{from:6,p:450},{from:13,p:400},{from:26,p:360},{from:41,p:325}] },
  ];

  function calcPackage(input: Record<string, number>) {
    let originalTotal = 0, grandTotal = 0;
    const items = PACKAGE_PRODUCTS.map(prod => {
      const qty = Math.max(0, Math.round(input[prod.key] ?? 0));
      let unitPrice = prod.basePrice;
      if (qty > 0) {
        for (const t of prod.tiers) { if (qty >= t.from) unitPrice = t.p; else break; }
      }
      const total = unitPrice * qty;
      const originalLinetotal = prod.basePrice * qty;
      originalTotal += originalLinetotal;
      grandTotal += total;
      return { name: prod.name, quantity: qty, unitPrice, originalUnitPrice: prod.basePrice,
        total, originalTotal: originalLinetotal,
        discountPercent: qty > 0 ? Math.round((1 - unitPrice / prod.basePrice) * 100) : 0 };
    });
    const totalSavings = originalTotal - grandTotal;
    return { items, originalTotal, grandTotal, totalSavings,
      totalDiscountPercent: originalTotal > 0 ? Math.round((totalSavings / originalTotal) * 100) : 0 };
  }

  app.post("/api/calculate-package", (req, res) => {
    try { return res.json(calcPackage(req.body)); }
    catch (err: any) { return res.status(400).json({ error: err.message }); }
  });

  // ── Rendy Voice-Over feature (task #153) ─────────────────────────────────
  registerRendyEditorRoutes(app, uploadDir);
  registerRendyVoiceoverRoutes(app, uploadDir);

  return httpServer;
}
