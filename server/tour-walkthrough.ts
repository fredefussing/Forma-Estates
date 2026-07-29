// ── Guidet AI-rundvisning (AI Boligfremvisning) ─────────────────────────────
// Genererer ét Kling-klip pr. rum (landscape 16:9) og klipper dem sammen til
// én samlet rundvisningsfilm. Per-rum klip gemmes på aiTourRooms.videoUrl
// (interaktiv viser), den samlede film på aiTourProperties.tourVideoUrl.
//
// Leaf-modul: må ALDRIG importere ./index (booter Express). Bruger console.log.

import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { randomUUID } from "crypto";
import { storage } from "./storage";
import { uploadToFal, generateGuidedTourClip, downloadToFile, isFalConfigured } from "./fal";
import { isR2Configured, r2GetStream, r2UploadFile } from "./r2";

export interface TourProgress {
  stage: "preparing" | "generating" | "compositing" | "complete" | "failed";
  currentClip: number;
  totalClips: number;
  message: string;
  tourVideoUrl?: string;
}

interface TourJob {
  status: "processing" | "completed" | "failed";
  propertyId: number;
  userId: number;
  createdAt: number;
  progress: TourProgress;
  error?: string;
}

const jobs = new Map<string, TourJob>();

export function getGuidedTourJob(id: string): TourJob | undefined {
  return jobs.get(id);
}

function setProgress(jobId: string, p: TourProgress) {
  const job = jobs.get(jobId);
  if (job) jobs.set(jobId, { ...job, progress: p });
}

function pruneJobs() {
  // Ryd kun afsluttede jobs — et kørende job kan sagtens vente >1 time i køen
  // (MAX_CONCURRENT=1) og må aldrig slettes mens klienten stadig poller det.
  const cutoff = Date.now() - 4 * 60 * 60 * 1000;
  const stale: string[] = [];
  jobs.forEach((job, id) => {
    if (job.status !== "processing" && job.createdAt < cutoff) stale.push(id);
  });
  stale.forEach((id) => jobs.delete(id));
}

// Render-slot gating (memory: al betalt fal.ai-generering skal bag en slot).
const MAX_CONCURRENT = 1;
const MAX_BACKLOG = 6;
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
  if (next) next();
  else activeRenders = Math.max(0, activeRenders - 1);
}

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

// Sørg for at en /uploads/<fil> findes lokalt — hent fra R2 hvis disken er
// blank (Render har flygtig disk; R2 er source-of-truth i produktion).
async function ensureLocalFile(relUrl: string, uploadDir: string): Promise<string | null> {
  const base = path.basename(relUrl.split("?")[0]);
  const localPath = path.join(uploadDir, base);
  if (fs.existsSync(localPath)) return localPath;
  if (!isR2Configured()) return null;
  try {
    const stream = await r2GetStream(base);
    if (!stream) return null;
    await new Promise<void>((resolve, reject) => {
      const out = fs.createWriteStream(localPath);
      stream.pipe(out);
      out.on("finish", () => resolve());
      out.on("error", reject);
      stream.on("error", reject);
    });
    return localPath;
  } catch (e: any) {
    console.warn(`[GuidedTour] R2 fetch failed for ${base}:`, e?.message || e);
    return null;
  }
}

export interface TourRoomInput {
  roomId: number;
  name: string;
  imageRelUrl: string; // /uploads/... (after-billede foretrækkes, ellers før-foto)
}

const MAX_TOUR_ROOMS = 10;

// Begrænset fan-out (memory: bound per-job fan-out) — 2 klip ad gangen.
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function renderTour(
  jobId: string,
  propertyId: number,
  userId: number,
  rooms: TourRoomInput[],
  uploadDir: string,
): Promise<void> {
  await acquireSlot();
  const tempClips: string[] = [];
  try {
    const total = rooms.length;
    setProgress(jobId, { stage: "preparing", currentClip: 0, totalClips: total, message: "Forbereder billeder…" });

    // 1) Upload rum-billeder til fal
    const uploads = await mapLimit(rooms, 3, async (room) => {
      const local = await ensureLocalFile(room.imageRelUrl, uploadDir);
      if (!local) return null;
      try {
        return await uploadToFal(local);
      } catch (e: any) {
        console.warn(`[GuidedTour] upload failed (${room.name}):`, e?.message || e);
        return null;
      }
    });

    if (!uploads.some((u) => u)) throw new Error("Ingen rum-billeder kunne klargøres");

    // 2) Generér ét Kling-klip pr. rum (bundet fan-out = 2)
    let done = 0;
    setProgress(jobId, { stage: "generating", currentClip: 0, totalClips: total, message: `Laver rundvisningsklip 0/${total}…` });

    const clipPaths = await mapLimit(rooms, 2, async (room, i) => {
      const falUrl = uploads[i];
      if (!falUrl) { done++; return null; }
      try {
        const { videoUrl } = await generateGuidedTourClip(falUrl, room.name, i);
        const base = `tour-clip-${propertyId}-${room.roomId}-${Date.now()}.mp4`;
        const dest = path.join(uploadDir, base);
        await downloadToFile(videoUrl, dest);
        tempClips.push(dest);
        // Persistér klippet på rummet med det samme, så den interaktive viser
        // kan afspille færdige rum mens resten stadig genereres.
        if (isR2Configured()) {
          try { await r2UploadFile(dest); fs.promises.unlink(dest).catch(() => {}); }
          catch (e: any) { console.warn(`[GuidedTour] R2 upload fejlede for ${base}:`, e?.message); }
        }
        await storage.updateAiTourRoom(room.roomId, userId, { videoUrl: `/uploads/${base}` } as any);
        done++;
        setProgress(jobId, { stage: "generating", currentClip: done, totalClips: total, message: `Laver rundvisningsklip ${done}/${total}…` });
        return dest;
      } catch (e: any) {
        console.warn(`[GuidedTour] clip failed (${room.name}):`, e?.message || e);
        done++;
        setProgress(jobId, { stage: "generating", currentClip: done, totalClips: total, message: `Laver rundvisningsklip ${done}/${total}… (et klip fejlede)` });
        return null;
      }
    });

    const okClips = clipPaths.filter((c): c is string => !!c);
    if (okClips.length === 0) throw new Error("Ingen klip kunne genereres — prøv igen");

    // 3) Sammenklip til én samlet film (1080p, 30fps, uden lyd)
    setProgress(jobId, { stage: "compositing", currentClip: total, totalClips: total, message: "Sammensætter den samlede film…" });

    const finalBase = `tour-final-${propertyId}-${Date.now()}.mp4`;
    const finalPath = path.join(uploadDir, finalBase);

    const inputs: string[] = [];
    okClips.forEach((c) => inputs.push("-i", c));
    const norm = okClips
      .map((_, i) => `[${i}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[v${i}]`)
      .join(";");
    const concatIn = okClips.map((_, i) => `[v${i}]`).join("");
    const filter = `${norm};${concatIn}concat=n=${okClips.length}:v=1:a=0[out]`;

    await runFfmpeg([
      "-y",
      ...inputs,
      "-filter_complex", filter,
      "-map", "[out]",
      "-c:v", "libx264",
      "-preset", "medium",
      "-crf", "20",
      "-movflags", "+faststart",
      finalPath,
    ]);

    if (isR2Configured()) {
      try { await r2UploadFile(finalPath); fs.promises.unlink(finalPath).catch(() => {}); }
      catch (e: any) { console.warn(`[GuidedTour] R2 upload fejlede for ${finalBase}:`, e?.message); }
    }
    const tourVideoUrl = `/uploads/${finalBase}`;
    await storage.updateAiTourProperty(propertyId, userId, { tourVideoUrl, tourStatus: "done" } as any);

    setProgress(jobId, { stage: "complete", currentClip: total, totalClips: total, message: "Rundvisningen er klar!", tourVideoUrl });
    const job = jobs.get(jobId);
    if (job) jobs.set(jobId, { ...job, status: "completed", progress: { stage: "complete", currentClip: total, totalClips: total, message: "Rundvisningen er klar!", tourVideoUrl } });
    console.log(`[GuidedTour] property=${propertyId} done — ${okClips.length}/${total} klip`);
  } finally {
    releaseSlot();
  }
}

// Starter et async rundvisnings-job. Returnerer jobId (poll via getGuidedTourJob)
// eller null hvis backloggen er fuld.
export function startGuidedTour(
  propertyId: number,
  userId: number,
  rooms: TourRoomInput[],
  uploadDir: string,
): string | null {
  pruneJobs();
  if (!isFalConfigured()) return null;
  if (activeRenders + waiters.length >= MAX_BACKLOG) return null;

  const limited = rooms.slice(0, MAX_TOUR_ROOMS);
  const jobId = randomUUID();
  jobs.set(jobId, {
    status: "processing",
    propertyId,
    userId,
    createdAt: Date.now(),
    progress: { stage: "preparing", currentClip: 0, totalClips: limited.length, message: "Starter op…" },
  });

  storage.updateAiTourProperty(propertyId, userId, { tourStatus: "generating" } as any).catch(() => {});

  renderTour(jobId, propertyId, userId, limited, uploadDir).catch(async (err: any) => {
    const cur = jobs.get(jobId);
    jobs.set(jobId, {
      status: "failed",
      propertyId,
      userId,
      error: err?.message || "Generering mislykkedes",
      createdAt: Date.now(),
      progress: {
        stage: "failed",
        currentClip: cur?.progress?.currentClip ?? 0,
        totalClips: cur?.progress?.totalClips ?? limited.length,
        message: err?.message || "Generering mislykkedes",
      },
    });
    await storage.updateAiTourProperty(propertyId, userId, { tourStatus: "error" } as any).catch(() => {});
  });

  return jobId;
}
