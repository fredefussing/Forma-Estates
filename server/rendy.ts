import fs from "fs";
import { randomUUID } from "crypto";
import sharp from "sharp";
import { pool } from "./db";

const RENDY_BASE = "https://api.rendy.io/api/public/v1";

// ── DB-backed job registry (survives server restarts) ─────────────────────────
export async function ensureRendyJobsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rendy_jobs (
      job_id     TEXT PRIMARY KEY,
      listing_id TEXT,
      user_id    INTEGER REFERENCES users(id),
      videos     JSONB,
      status     TEXT NOT NULL DEFAULT 'processing',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // Additive columns for pre-existing tables
  for (const col of [
    `ALTER TABLE rendy_jobs ADD COLUMN IF NOT EXISTS user_id integer REFERENCES users(id)`,
    `ALTER TABLE rendy_jobs ADD COLUMN IF NOT EXISTS videos jsonb`,
    `ALTER TABLE rendy_jobs ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'pending'`,
  ]) {
    try { await pool.query(col); } catch {}
  }
  // Only prune rows that never got a listing_id (orphaned submission attempts).
  // Completed listings with ownership/videos are retained indefinitely so the
  // voiceover service can verify ownership at any future time.
  await pool.query(`
    DELETE FROM rendy_jobs
     WHERE listing_id IS NULL
       AND created_at < NOW() - INTERVAL '24 hours'
  `);
}

async function dbUpsertJob(
  jobId: string,
  listingId?: string,
  status?: string,
  userId?: number,
  videos?: RendyVideo[],
  deliveryStatus?: "pending" | "provider" | "delivered",
) {
  try {
    await pool.query(
      `INSERT INTO rendy_jobs (job_id, listing_id, status, user_id, videos, delivery_status)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'pending'))
       ON CONFLICT (job_id) DO UPDATE
         SET listing_id = COALESCE($2, rendy_jobs.listing_id),
             status     = COALESCE($3, rendy_jobs.status),
             user_id    = COALESCE($4, rendy_jobs.user_id),
              videos     = COALESCE($5::jsonb, rendy_jobs.videos),
              delivery_status = COALESCE($6, rendy_jobs.delivery_status)`,
      [
        jobId,
        listingId ?? null,
        status ?? "processing",
        userId ?? null,
        videos ? JSON.stringify(videos) : null,
        deliveryStatus ?? null,
      ],
    );
  } catch (err: any) {
    console.error("[Rendy] dbUpsertJob failed:", err.message);
  }
}

export async function getRendyListingIdForJob(jobId: string): Promise<string | null> {
  try {
    const res = await pool.query<{ listing_id: string }>(
      `SELECT listing_id FROM rendy_jobs WHERE job_id = $1`, [jobId]
    );
    return res.rows[0]?.listing_id ?? null;
  } catch {
    return null;
  }
}

export interface PersistedRendyJob {
  listingId: string | null;
  status: "processing" | "completed" | "failed";
  videos: RendyVideo[];
  deliveryStatus: "pending" | "provider" | "delivered";
}

/**
 * Read the durable delivery state used by the SSE recovery route. A video is
 * safe to return without reprocessing only once it has reached `delivered`;
 * older rows default to pending and are completed again from the provider.
 */
export async function getPersistedRendyJob(jobId: string): Promise<PersistedRendyJob | null> {
  try {
    const res = await pool.query<{
      listing_id: string | null;
      status: PersistedRendyJob["status"];
      videos: RendyVideo[] | null;
      delivery_status: PersistedRendyJob["deliveryStatus"] | null;
    }>(
      `SELECT listing_id, status, videos, delivery_status FROM rendy_jobs WHERE job_id = $1`,
      [jobId],
    );
    const row = res.rows[0];
    if (!row) return null;
    return {
      listingId: row.listing_id,
      status: row.status,
      videos: Array.isArray(row.videos) ? row.videos : [],
      deliveryStatus: row.delivery_status ?? "pending",
    };
  } catch {
    return null;
  }
}

/** Persist the exact delivery URLs only after post-processing has completed. */
export async function saveDeliveredRendyVideos(
  jobId: string,
  listingId: string,
  videos: RendyVideo[],
): Promise<void> {
  await dbUpsertJob(jobId, listingId, "completed", undefined, videos, "delivered");
}

/**
 * Verify that userId owns the Rendy listing that contains videoId, and return
 * the exact delivered video URL stored in rendy_jobs.videos for that videoId.
 *
 * For legacy rows that have listing_id but no videos JSON yet, returns null so
 * the caller can fall back to a live Rendy API lookup (which must still match
 * the provider URL exactly; arbitrary /uploads URLs are not accepted in that path).
 *
 * Throws if the user does not own the listing.
 */
export async function verifyRendyOwnershipAndGetVideoUrl(
  listingId: string,
  videoId: string,
  userId: number,
): Promise<{ deliveredUrl: string | null; isLegacy: boolean }> {
  const res = await pool.query<{ user_id: number | null; videos: RendyVideo[] | null }>(
    `SELECT user_id, videos FROM rendy_jobs WHERE listing_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [listingId],
  );
  const row = res.rows[0];
  if (!row) throw new Error(`Listing ${listingId} ikke fundet i job-registret`);
  // A listing without a persisted owner cannot be proven safe. The additive
  // backfill covers old rows that have a matching video_jobs record; any row
  // still left NULL must fail closed rather than becoming globally accessible.
  if (row.user_id !== userId) {
    throw new Error("Du ejer ikke denne Rendy-video");
  }

  const videos = row.videos as RendyVideo[] | null;
  if (!videos || videos.length === 0) {
    // Legacy row — no stored videos JSON yet
    return { deliveredUrl: null, isLegacy: true };
  }
  const video = videos.find((v) => v.id === videoId);
  if (!video) throw new Error(`Video ${videoId} ikke fundet i den gemte levering`);
  if (!video.url) throw new Error(`Video ${videoId} har ingen gemt URL`);
  return { deliveredUrl: video.url, isLegacy: false };
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface RendyPreset {
  key: string;
  name: string | null;
  description: string | null;
  sampleVideoUrl: string | null;
  goodImageExampleUrl: string | null;
  badImageExampleUrl: string | null;
  iconUrl: string | null;
  order: number;
}

export interface RendyVideo {
  id: string;
  url: string | null;
  templateId: string;
  status: "rendering" | "success" | "error" | null;
  progress: number;
  createdAt: string;
  updatedAt: string;
  clips: string[];
}

export interface RendyListingFull {
  listing: {
    id: string;
    address: string;
    ratio: string;
    status: "generating" | "success" | "error" | "regenerating" | null;
    progress: number;
    thumbnailUrl: string | null;
    createdAt: string;
    updatedAt: string;
  };
  videos: RendyVideo[];
}

export type RendyJobStage = "uploading" | "generating" | "complete" | "failed";

export interface RendyJobProgress {
  stage: RendyJobStage;
  progress: number;
  message: string;
  videos?: RendyVideo[];
  listingId?: string;
}

interface RendyJob {
  status: "processing" | "completed" | "failed";
  listingId?: string;
  videos?: RendyVideo[];
  error?: string;
  createdAt: number;
  progress: RendyJobProgress;
}

// ── Job registry ──────────────────────────────────────────────────────────────
const jobs = new Map<string, RendyJob>();

export function getRendyJob(id: string): RendyJob | undefined {
  return jobs.get(id);
}

function setProgress(jobId: string, p: RendyJobProgress) {
  const job = jobs.get(jobId);
  if (job) jobs.set(jobId, { ...job, progress: p });
}

/** Allow routes.ts to update progress during post-processing (e.g. EU badge watermarking). */
export function setRendyJobProgress(jobId: string, p: RendyJobProgress) {
  setProgress(jobId, p);
}

function pruneJobs() {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  jobs.forEach((job, id) => {
    if (job.createdAt < cutoff) jobs.delete(id);
  });
}

// ── API helpers ───────────────────────────────────────────────────────────────
function getKey(): string {
  const key = process.env.RENDY_API_KEY;
  if (!key) throw new Error("RENDY_API_KEY ikke konfigureret");
  return key;
}

export function isRendyConfigured(): boolean {
  return !!process.env.RENDY_API_KEY;
}

async function rendyFetch(path: string, opts: RequestInit = {}): Promise<Response> {
  const key = getKey();
  const headers: Record<string, string> = { "x-api-key": key };
  if (opts.headers) {
    Object.assign(headers, opts.headers);
  }
  return fetch(`${RENDY_BASE}${path}`, { ...opts, headers });
}

export interface RendyUploadedImage {
  url: string;
  width: number;
  height: number;
}

export async function uploadImageToRendy(filePath: string): Promise<RendyUploadedImage> {
  const original = fs.readFileSync(filePath);
  if (original.length > 40 * 1024 * 1024) throw new Error(`Billede er for stort (${Math.round(original.length / 1024 / 1024)} MB). Maks 40 MB.`);

  // Normalise to REAL JPEG bytes before upload. Browser uploads are often
  // WebP/PNG with a .jpeg filename — Rendy's upload endpoint accepts those,
  // but the video engine then fails the whole listing with progress=0.
  // Also EXIF-rotate and upscale below Rendy's 800×600 minimum.
  let data: Buffer;
  let width: number;
  let height: number;
  try {
    let out = await sharp(original, { failOn: "none" })
      .rotate()
      .jpeg({ quality: 92 })
      .toBuffer({ resolveWithObject: true });
    if (out.info.width < 800 || out.info.height < 600) {
      out = await sharp(out.data)
        .resize(800, 600, { fit: "outside" })
        .jpeg({ quality: 92 })
        .toBuffer({ resolveWithObject: true });
    }
    if (out.data.length > 20 * 1024 * 1024) {
      out = await sharp(out.data)
        .resize(3840, 3840, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer({ resolveWithObject: true });
    }
    data = out.data;
    width = out.info.width;
    height = out.info.height;
  } catch (err: any) {
    console.error("[Rendy] billede kunne ikke konverteres til JPEG:", err.message);
    throw new Error("Billedet kunne ikke læses som et gyldigt billede. Prøv at gemme det som JPEG og upload igen.");
  }

  if (data.length < 5000) throw new Error(`Billede er for lille (${Math.round(data.length / 1024)} KB). Brug mindst 800×600px.`);

  const base = (filePath.split("/").pop() || "image").replace(/\.[^.]*$/, "");
  const filename = `${base}.jpg`;

  // Retry upload up to 3 times on transient errors
  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const form = new FormData();
      const blob = new Blob([data], { type: "image/jpeg" });
      form.append("image", blob, filename);
      const res = await rendyFetch("/images/upload", { method: "POST", body: form as any });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Rendy upload fejlede (${res.status}): ${errText}`);
      }
      const resp = await res.json() as { url: string };
      return { url: resp.url, width, height };
    } catch (err: any) {
      lastErr = err;
      console.error(`[Rendy] upload forsøg ${attempt}/3 fejlede:`, err.message);
      if (attempt < 3) await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  throw lastErr!;
}

export async function getRendyPresets(): Promise<RendyPreset[]> {
  const res = await rendyFetch("/presets");
  if (!res.ok) throw new Error(`Rendy presets fejlede (${res.status})`);
  const data = await res.json() as { presets: RendyPreset[] };
  return data.presets ?? [];
}

// Camera movement keys verified against GET /camera-movements (July 2026).
// Used as fallback if the live endpoint is unreachable.
const FALLBACK_CAMERA_MOVEMENT_KEYS = [
  "SLIDER_LEFT", "SLIDER_RIGHT", "PARALLAX_LEFT", "PARALLAX_RIGHT",
  "PUSH-IN", "CRANE-DOWN", "CRANE-UP", "PEDESTAL-DOWN", "PEDESTAL-UP",
  "PULL-OUT", "STATIC",
];

let cameraKeysCache: { keys: Set<string>; fetchedAt: number } | null = null;

/** Live list of valid camera-movement keys (cached 6 h, falls back to the verified hardcoded list). */
export async function getRendyCameraMovementKeys(): Promise<Set<string>> {
  if (cameraKeysCache && Date.now() - cameraKeysCache.fetchedAt < 6 * 60 * 60 * 1000) {
    return cameraKeysCache.keys;
  }
  try {
    const res = await rendyFetch("/camera-movements", { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = await res.json() as { cameraMovements?: Array<{ key: string }> };
      const keys = new Set((data.cameraMovements ?? []).map((m) => m.key).filter(Boolean));
      if (keys.size > 0) {
        cameraKeysCache = { keys, fetchedAt: Date.now() };
        return keys;
      }
    }
  } catch (err: any) {
    console.error("[Rendy] camera-movements fetch fejlede:", err.message);
  }
  // Cache the fallback briefly (5 min) so a down endpoint isn't re-fetched on every submit
  const fallback = new Set(FALLBACK_CAMERA_MOVEMENT_KEYS);
  cameraKeysCache = { keys: fallback, fetchedAt: Date.now() - 6 * 60 * 60 * 1000 + 5 * 60 * 1000 };
  return fallback;
}

export async function createRendyListing(
  address: string,
  ratio: "portrait" | "landscape",
  imageUrls: Array<{ url: string; presetKey?: string; cameraActionKey?: string; originalImageWidth?: number; originalImageHeight?: number }>
): Promise<string> {
  const requestBody = { address, ratio, imageUrls };
  console.log("[Rendy] createListing request:", JSON.stringify(requestBody));
  const res = await rendyFetch("/listings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });
  const responseText = await res.text().catch(() => "");
  console.log(`[Rendy] createListing response (${res.status}):`, responseText.slice(0, 500));
  if (!res.ok) {
    throw new Error(`Rendy listing fejlede (${res.status}): ${responseText}`);
  }
  let data: any;
  try { data = JSON.parse(responseText); } catch { throw new Error("Rendy listing: ugyldigt JSON svar"); }
  // Rendy may return { listingId } or { id }
  const listingId = data.listingId || data.id;
  if (!listingId) throw new Error(`Rendy listing: intet listingId i svar: ${responseText.slice(0, 200)}`);
  return listingId;
}

export async function getRendyListingStatus(listingId: string): Promise<{ progress: number; status: string }> {
  const res = await rendyFetch(`/listings/${listingId}/status`);
  if (!res.ok) throw new Error(`Rendy status fejlede (${res.status})`);
  return res.json() as Promise<{ progress: number; status: string }>;
}

export async function getRendyListing(listingId: string): Promise<RendyListingFull> {
  const res = await rendyFetch(`/listings/${listingId}`, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Rendy listing fejlede (${res.status})`);
  return res.json() as Promise<RendyListingFull>;
}

export async function exportRendyListing(listingId: string): Promise<{ jobId: string; downloadUrl?: string }> {
  const res = await rendyFetch(`/listings/${listingId}/export`, { method: "POST", signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Rendy export fejlede (${res.status})`);
  return res.json() as Promise<{ jobId: string; downloadUrl?: string }>;
}

export async function getRendyExportStatus(jobId: string): Promise<{ status: string; downloadUrl?: string; progress?: number; total?: number }> {
  const res = await rendyFetch(`/exports/${jobId}`, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Rendy export status fejlede (${res.status})`);
  return res.json();
}

// ── Job starter ───────────────────────────────────────────────────────────────
export interface RendyImageKeys {
  presetKey?: string;
  cameraActionKey?: string;
}

export function startRendyShowcase(
  filePaths: string[],
  address: string,
  ratio: "portrait" | "landscape",
  imageKeys: RendyImageKeys[],
  /** Optional post-processor: download Rendy CDN videos and burn EU AI Act badge */
  onVideosReady?: (videos: RendyVideo[]) => Promise<RendyVideo[]>,
  /** Authenticated DB user id — stored so voiceover can verify ownership later */
  userId?: number,
): string {
  pruneJobs();
  const jobId = randomUUID();

  jobs.set(jobId, {
    status: "processing",
    createdAt: Date.now(),
    progress: {
      stage: "uploading",
      progress: 0,
      message: `Uploader ${filePaths.length} billeder…`,
    },
  });

  (async () => {
    try {
      // Gem job_id i DB STRAKS — inden uploads starter — så SSE-recovery
      // altid kan finde jobbet selvom serveren genstarter undervejs.
      await dbUpsertJob(jobId, undefined, "processing", userId);

      // Step 1: Upload all images concurrently
      const uploadedImages: RendyUploadedImage[] = new Array(filePaths.length);
      let uploaded = 0;

      await Promise.all(
        filePaths.map(async (fp, i) => {
          const img = await uploadImageToRendy(fp);
          uploadedImages[i] = img;
          uploaded++;
          setProgress(jobId, {
            stage: "uploading",
            progress: Math.round((uploaded / filePaths.length) * 30),
            message: `Uploader billeder… ${uploaded}/${filePaths.length}`,
          });
        })
      );

      // Step 2: Create listing
      setProgress(jobId, {
        stage: "generating",
        progress: 32,
        message: "Starter AI-generering…",
      });

      const imageUrls = uploadedImages.map((img, i) => ({
        url: img.url,
        originalImageWidth: img.width,
        originalImageHeight: img.height,
        ...(imageKeys[i]?.presetKey ? { presetKey: imageKeys[i].presetKey } : {}),
        ...(imageKeys[i]?.cameraActionKey ? { cameraActionKey: imageKeys[i].cameraActionKey } : {}),
      }));

      const listingId = await createRendyListing(address || "Boligfremvisning", ratio, imageUrls);
      const cur = jobs.get(jobId)!;
      jobs.set(jobId, { ...cur, listingId });
      // Gem listingId med await — ingen vindue hvor listing er skabt men ikke i DB
      await dbUpsertJob(jobId, listingId);

      // Step 3: Poll until done — with retry on transient Rendy errors
      let consecutiveErrors = 0;
      const MAX_CONSECUTIVE_ERRORS = 4; // 4 × 10 s = 40 s grace window
      while (true) {
        await new Promise((r) => setTimeout(r, 3000));

        let st: { progress: number; status: string };
        try {
          st = await getRendyListingStatus(listingId);
        } catch (pollErr: any) {
          // Network hiccup polling the status endpoint — retry silently
          consecutiveErrors++;
          console.error(`[Rendy] status poll fejlede (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):`, pollErr.message);
          if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) throw pollErr;
          await new Promise((r) => setTimeout(r, 5000));
          continue;
        }

        const rendyPct = typeof st.progress === "number" ? st.progress : 0;
        const mapped = 32 + Math.round(rendyPct * 0.63);

        if (st.status === "error") {
          consecutiveErrors++;
          console.error(`[Rendy] listing ${listingId} rapporterede error (forsøg ${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}), progress=${rendyPct}`);

          if (consecutiveErrors < MAX_CONSECUTIVE_ERRORS) {
            // Rendy sometimes flips to "error" transiently — wait and re-check
            setProgress(jobId, {
              stage: "generating",
              progress: mapped,
              message: `AI behandler video… prøver igen (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS})`,
              listingId,
            });
            await new Promise((r) => setTimeout(r, 10_000));
            continue;
          }

          // Still failing after grace window — fetch full listing for details and give up
          let detail = "";
          try {
            const full = await getRendyListing(listingId);
            const failedVideos = full.videos.filter((v) => v.status === "error");
            const successVideos = full.videos.filter((v) => v.status === "success" && v.url);
            console.error(`[Rendy] listing ${listingId} permanent fejl – listing:`, JSON.stringify(full.listing), `failed=${failedVideos.length} success=${successVideos.length}`);
            if (failedVideos.length) detail = ` (${failedVideos.length} af ${full.videos.length} videoer fejlede)`;
            // If some videos actually succeeded, return those instead of failing completely
            if (successVideos.length > 0) {
              console.error(`[Rendy] returnerer ${successVideos.length} succesfulde videoer trods delfejl`);
              let finalVideos = successVideos;
                if (onVideosReady) {
                  const fallback = new Promise<RendyVideo[]>((_, reject) =>
                    setTimeout(() => reject(new Error("Efterbehandling af videoerne tog for lang tid")), 120_000)
                  );
                  // Never deliver the provider video when Forma's finalization
                  // fails or times out: it is missing the required overlay.
                  finalVideos = await Promise.race([onVideosReady(successVideos), fallback]);
                }
              jobs.set(jobId, {
                ...jobs.get(jobId)!,
                status: "completed",
                videos: finalVideos,
                progress: {
                  stage: "complete",
                  progress: 100,
                  message: `${finalVideos.length} video${finalVideos.length === 1 ? "" : "er"} klar (${failedVideos.length} fejlede)`,
                  videos: finalVideos,
                  listingId,
                },
              });
                await dbUpsertJob(jobId, listingId, "completed", userId, finalVideos, onVideosReady ? "delivered" : "provider");
              return;
            }
          } catch (detailErr) {
            console.error(`[Rendy] kunne ikke hente listing detaljer:`, detailErr);
          }
          throw new Error(`Videogenerering fejlede${detail}. Prøv med bedre billeder (min. 800×600px, god belysning).`);
        }

        // Successful status poll — reset error counter
        consecutiveErrors = 0;

        setProgress(jobId, {
          stage: "generating",
          progress: mapped,
          // Percentage is shown once, on the right, from `progress` (mapped 0-100
          // int). Don't embed rendyPct here too — it produced a second, different
          // number (and sometimes decimals) next to the bar.
          message: "Genererer videoer…",
          listingId,
        });

        if (st.status === "success") {
          const full = await getRendyListing(listingId);
          const videos = full.videos.filter((v) => v.status === "success" && v.url);
          if (videos.length === 0) {
            // Rendy said "success" but every individual video failed — treat as error
            throw new Error(`Videogenerering fejlede — 0 ud af ${full.videos.length} videoer lykkedes. Prøv med bedre billeder (min. 800×600px, god belysning).`);
          }
          // Burn the required Forma delivery treatment before returning URLs.
          // A provider CDN URL is not an acceptable fallback because it lacks the
          // address text / EU badge promised in the finished delivery.
          let finalVideos = videos;
          if (onVideosReady) {
            const fallback = new Promise<RendyVideo[]>((_, reject) =>
              setTimeout(() => reject(new Error("Efterbehandling af videoerne tog for lang tid")), 120_000)
            );
            finalVideos = await Promise.race([onVideosReady(videos), fallback]);
          }
          jobs.set(jobId, {
            ...jobs.get(jobId)!,
            status: "completed",
            videos: finalVideos,
            progress: {
              stage: "complete",
              progress: 100,
              message: `${finalVideos.length} video${finalVideos.length === 1 ? "" : "er"} klar!`,
              videos: finalVideos,
              listingId,
            },
          });
          await dbUpsertJob(jobId, listingId, "completed", userId, finalVideos, onVideosReady ? "delivered" : "provider");
          return;
        }
      }
    } catch (err: any) {
      const msg = err?.message || "Generering fejlede";
      jobs.set(jobId, {
        ...jobs.get(jobId)!,
        status: "failed",
        error: msg,
        progress: { stage: "failed", progress: 0, message: msg },
      });
      await dbUpsertJob(jobId, undefined, "failed", userId);
    } finally {
      for (const fp of filePaths) {
        fs.promises.unlink(fp).catch(() => {});
      }
    }
  })();

  return jobId;
}
