import fs from "fs";
import { randomUUID } from "crypto";
import { pool } from "./db";

const RENDY_BASE = "https://api.rendy.io/api/public/v1";

// ── DB-backed job registry (survives server restarts) ─────────────────────────
export async function ensureRendyJobsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rendy_jobs (
      job_id   TEXT PRIMARY KEY,
      listing_id TEXT,
      status   TEXT NOT NULL DEFAULT 'processing',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // Clean up jobs older than 24 h
  await pool.query(`DELETE FROM rendy_jobs WHERE created_at < NOW() - INTERVAL '24 hours'`);
}

async function dbUpsertJob(jobId: string, listingId?: string, status?: string) {
  try {
    await pool.query(
      `INSERT INTO rendy_jobs (job_id, listing_id, status)
       VALUES ($1, $2, $3)
       ON CONFLICT (job_id) DO UPDATE
         SET listing_id = COALESCE($2, rendy_jobs.listing_id),
             status     = COALESCE($3, rendy_jobs.status)`,
      [jobId, listingId ?? null, status ?? "processing"]
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

export async function uploadImageToRendy(filePath: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);

  // Validate file size — Rendy rejects images under ~10 KB or over ~20 MB
  if (buffer.length < 5000) throw new Error(`Billede er for lille (${Math.round(buffer.length / 1024)} KB). Brug mindst 800×600px.`);
  if (buffer.length > 20 * 1024 * 1024) throw new Error(`Billede er for stort (${Math.round(buffer.length / 1024 / 1024)} MB). Maks 20 MB.`);

  const filename = filePath.split("/").pop() || "image.jpg";
  const ext = (filename.split(".").pop() || "jpg").toLowerCase();
  const mimeMap: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg",
    png: "image/png", webp: "image/webp",
  };
  const mimetype = mimeMap[ext] || "image/jpeg";

  // Retry upload up to 3 times on transient errors
  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const form = new FormData();
      const blob = new Blob([buffer], { type: mimetype });
      form.append("image", blob, filename);
      const res = await rendyFetch("/images/upload", { method: "POST", body: form as any });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Rendy upload fejlede (${res.status}): ${errText}`);
      }
      const data = await res.json() as { url: string };
      return data.url;
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

export async function createRendyListing(
  address: string,
  ratio: "portrait" | "landscape",
  imageUrls: Array<{ url: string; presetKey?: string }>
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
  const res = await rendyFetch(`/listings/${listingId}`);
  if (!res.ok) throw new Error(`Rendy listing fejlede (${res.status})`);
  return res.json() as Promise<RendyListingFull>;
}

export async function exportRendyListing(listingId: string): Promise<{ jobId: string; downloadUrl?: string }> {
  const res = await rendyFetch(`/listings/${listingId}/export`, { method: "POST" });
  if (!res.ok) throw new Error(`Rendy export fejlede (${res.status})`);
  return res.json() as Promise<{ jobId: string; downloadUrl?: string }>;
}

export async function getRendyExportStatus(jobId: string): Promise<{ status: string; downloadUrl?: string; progress?: number; total?: number }> {
  const res = await rendyFetch(`/exports/${jobId}`);
  if (!res.ok) throw new Error(`Rendy export status fejlede (${res.status})`);
  return res.json();
}

// ── Job starter ───────────────────────────────────────────────────────────────
export function startRendyShowcase(
  filePaths: string[],
  address: string,
  ratio: "portrait" | "landscape",
  presetKeys: (string | undefined)[]
): string {
  pruneJobs();
  const jobId = randomUUID();

  jobs.set(jobId, {
    status: "processing",
    createdAt: Date.now(),
    progress: {
      stage: "uploading",
      progress: 0,
      message: `Uploader ${filePaths.length} billeder til Rendy…`,
    },
  });

  (async () => {
    try {
      // Step 1: Upload all images concurrently
      const uploadedUrls: string[] = new Array(filePaths.length);
      let uploaded = 0;

      await Promise.all(
        filePaths.map(async (fp, i) => {
          const url = await uploadImageToRendy(fp);
          uploadedUrls[i] = url;
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
        message: "Sender til Rendy og starter AI-generering…",
      });

      const imageUrls = uploadedUrls.map((url, i) => ({
        url,
        ...(presetKeys[i] && presetKeys[i] !== "DEFAULT" ? { presetKey: presetKeys[i] } : {}),
      }));

      const listingId = await createRendyListing(address || "Boligfremvisning", ratio, imageUrls);
      const cur = jobs.get(jobId)!;
      jobs.set(jobId, { ...cur, listingId });
      // Persist listingId to DB so SSE can recover after a server restart
      dbUpsertJob(jobId, listingId);

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
              jobs.set(jobId, {
                ...jobs.get(jobId)!,
                status: "completed",
                videos: successVideos,
                progress: {
                  stage: "complete",
                  progress: 100,
                  message: `${successVideos.length} video${successVideos.length === 1 ? "" : "er"} klar (${failedVideos.length} fejlede)`,
                  videos: successVideos,
                  listingId,
                },
              });
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
          message: `Genererer videoer… ${rendyPct}%`,
          listingId,
        });

        if (st.status === "success") {
          const full = await getRendyListing(listingId);
          const videos = full.videos.filter((v) => v.status === "success" && v.url);
          jobs.set(jobId, {
            ...jobs.get(jobId)!,
            status: "completed",
            videos,
            progress: {
              stage: "complete",
              progress: 100,
              message: `${videos.length} video${videos.length === 1 ? "" : "er"} klar!`,
              videos,
              listingId,
            },
          });
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
    } finally {
      for (const fp of filePaths) {
        fs.promises.unlink(fp).catch(() => {});
      }
    }
  })();

  return jobId;
}
