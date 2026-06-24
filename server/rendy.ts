import fs from "fs";
import { randomUUID } from "crypto";

const RENDY_BASE = "https://api.rendy.io/api/public/v1";

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
  const filename = filePath.split("/").pop() || "image.jpg";
  const ext = (filename.split(".").pop() || "jpg").toLowerCase();
  const mimeMap: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg",
    png: "image/png", webp: "image/webp",
  };
  const mimetype = mimeMap[ext] || "image/jpeg";

  const form = new FormData();
  const blob = new Blob([buffer], { type: mimetype });
  form.append("image", blob, filename);

  const res = await rendyFetch("/images/upload", { method: "POST", body: form as any });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Rendy upload fejlede (${res.status}): ${err}`);
  }
  const data = await res.json() as { url: string };
  return data.url;
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
  const res = await rendyFetch("/listings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, ratio, imageUrls }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Rendy listing fejlede (${res.status}): ${err}`);
  }
  const data = await res.json() as { listingId: string };
  return data.listingId;
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

      // Step 3: Poll until done
      while (true) {
        await new Promise((r) => setTimeout(r, 3000));
        const st = await getRendyListingStatus(listingId);
        const rendyPct = typeof st.progress === "number" ? st.progress : 0;
        const mapped = 32 + Math.round(rendyPct * 0.63);

        setProgress(jobId, {
          stage: "generating",
          progress: mapped,
          message: `Rendy genererer videoer… ${rendyPct}%`,
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

        if (st.status === "error") {
          throw new Error("Rendy generering fejlede på serveren");
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
