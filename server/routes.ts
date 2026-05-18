import type { Express, Request } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import path from "path";
import fs from "fs";
import sharp from "sharp";
import { createDesignSchema, createQuoteSchema, createSpecialRequestSchema, createQuoteRequestSchema, freeStyles } from "@shared/schema";
import { styleVocabulary } from "@shared/styleVocabulary";
import { budgetToTier } from "@shared/budgetUtils";
import { log } from "./index";
import { sendQuoteRequestEmail, sendSpecialRequestEmail, sendOrderConfirmationEmail, sendWelcomeEmail, sendAIAnalysisEmail } from "./email";
import { analyzeDesignImage } from "./ai_analyzer";
import { verifyFirebaseToken } from "./firebase-admin";
import { pool } from "./db";

const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || ".jpg";
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

const COLLOV_API_KEY = process.env.COLLOV_API_KEY;
const COLLOV_BASE = "https://api.collov.ai";



// ── Style prompts — same as May 3 setup that produced good results ────────────
function buildRedesignPrompt(roomType: string, style: string, tier?: string, includePlants = false): string {
  const validTier = (tier === "budget" || tier === "standard" || tier === "luxury") ? tier : "standard";
  const vocab = styleVocabulary[style]?.[validTier];
  const base = vocab
    ? `Completely redesign this ${roomType}. ${vocab.prompt} Replace all existing furniture and decor.`
    : `Completely redesign this ${roomType} in ${style} style. Replace all existing furniture and decor with new pieces that match the style.`;
  const plantNote = includePlants ? " Include several green indoor plants in ceramic and woven pots." : "";
  return `${base}${plantNote}`;
}

// ── Send redesign task to Collov edit/generate ────────────────────────────────
async function sendCollovTask(uploadUrl: string, roomType: string, style: string, tier?: string, includePlants = false): Promise<string> {
  const prompt = buildRedesignPrompt(roomType, style, tier, includePlants);
  const form = new FormData();
  form.append("uploadUrl", uploadUrl);
  form.append("prompt", prompt);

  console.log("=== COLLOV DEBUG ===");
  console.log("Endpoint:", "https://api.collov.ai/flair/enterpriseApi/edit/generate");
  console.log("uploadUrl:", uploadUrl);
  console.log("=== END DEBUG ===");
  log(`Collov redesign send: style=${style}, roomType=${roomType}, prompt="${prompt.slice(0, 100)}..."`);

  const res = await fetch(`${COLLOV_BASE}/flair/enterpriseApi/edit/generate`, {
    method: "POST",
    headers: { apiKey: COLLOV_API_KEY! },
    body: form,
  });
  const json = (await res.json()) as any;
  log(`Collov redesign response (HTTP ${res.status}): ${JSON.stringify(json).slice(0, 300)}`);
  if (!json.success || !json.data?.uuid) throw new Error(json.message || "Collov API returned an error");
  return json.data.uuid;
}

// ── Poll edit/getRecord for result ───────────────────────────────────────────
async function pollCollovResult(uuid: string): Promise<{ status: string; resultUrl?: string; failReason?: string }> {
  const res = await fetch(
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
async function pollEmptyRoom(taskId: string, timeoutMs = 60_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
  while (Date.now() < deadline) {
    const res = await fetch(
      `${COLLOV_BASE}/flair/enterpriseApi/vst/getEmptyRoomRecord?id=${encodeURIComponent(taskId)}`,
      { method: "GET", headers: { apiKey: COLLOV_API_KEY! } },
    );
    const json = (await res.json()) as any;
    const data = json.data || {};
    const status = (data.status || "").toUpperCase();
    log(`VST emptyRoom poll taskId=${taskId}: status=${status}`);
    if (status === "SUCCESS" && data.generateUrl) return data.generateUrl;
    if (status === "FAILED") throw new Error(`VST emptyRoom failed: ${data.failReason || "unknown"}`);
    await delay(2000);
  }
  throw new Error("VST emptyRoom timed out");
}

// ── VST: Step 1 (empty room) + Step 2 (staged result) → returns uuid ─────────
async function sendVstWorkflow(originalImageUrl: string, roomType: string, style: string): Promise<string> {
  const emptyForm = new FormData();
  emptyForm.append("uploadUrl", originalImageUrl);
  log(`VST step1: generateEmptyRoom`);
  const emptyRes = await fetch(`${COLLOV_BASE}/flair/enterpriseApi/vst/generateEmptyRoom`,
    { method: "POST", headers: { apiKey: COLLOV_API_KEY! }, body: emptyForm });
  const emptyJson = (await emptyRes.json()) as any;
  log(`VST step1 response: ${JSON.stringify(emptyJson).slice(0, 200)}`);
  if (!emptyJson.data?.id) throw new Error(emptyJson.message || "VST generateEmptyRoom: no task id");

  const emptyRoomUrl = await pollEmptyRoom(emptyJson.data.id, 90_000);
  log(`VST step1 done: emptyRoomUrl=${emptyRoomUrl.slice(-50)}`);

  const stageForm = new FormData();
  stageForm.append("uploadUrl", originalImageUrl);
  stageForm.append("emptyRoomUrl", emptyRoomUrl);
  stageForm.append("roomType", roomType.toLowerCase());
  stageForm.append("style", style.toLowerCase());
  log(`VST step2: generateImgOnCommon roomType=${roomType} style=${style}`);
  const stageRes = await fetch(`${COLLOV_BASE}/flair/enterpriseApi/vst/generateImgOnCommon`,
    { method: "POST", headers: { apiKey: COLLOV_API_KEY! }, body: stageForm });
  const stageJson = (await stageRes.json()) as any;
  log(`VST step2 response: ${JSON.stringify(stageJson).slice(0, 200)}`);
  if (!stageJson.data?.uuid) throw new Error(stageJson.message || "VST generateImgOnCommon: no uuid");
  return stageJson.data.uuid;
}

// ── VST: Poll vst/getRecord ───────────────────────────────────────────────────
async function pollVstResult(uuid: string): Promise<{ status: string; resultUrl?: string; failReason?: string }> {
  const res = await fetch(
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

// ── VST: Full workflow with result — resolves with final image URL ─────────────
async function runVstAndGetResult(originalImageUrl: string, roomType: string, style: string, designId: number): Promise<string> {
  const uuid = await sendVstWorkflow(originalImageUrl, roomType, style);
  await storage.updateDesign(designId, { collovUuid: uuid, status: "processing" });
  setStatusMsg(designId, "Møblerer rum (VST)...");

  // Poll up to 50s (25 × 2s)
  const maxAttempts = 25;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const result = await pollVstResult(uuid);
    if (result.status === "completed" && result.resultUrl) return result.resultUrl;
    if (result.status === "failed") throw new Error(result.failReason || "vst_failed");
  }
  throw new Error("VST_TIMEOUT");
}

// ── SOLID10: send + poll wrapper that resolves with final image URL ────────────
async function runSolid10AndGetResult(
  originalImageUrl: string, roomType: string, style: string, tier: string | undefined,
  includePlants: boolean, designId: number,
): Promise<string> {
  const uuid = await sendCollovTask(originalImageUrl, roomType, style, tier, includePlants);
  await storage.updateDesign(designId, { collovUuid: uuid, status: "processing" });
  setStatusMsg(designId, "Venter på AI...");

  const maxAttempts = 45; // 45 × 2s = 90s
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const result = await pollCollovResult(uuid);
    if (result.status === "completed" && result.resultUrl) return result.resultUrl;
    if (result.status === "failed") throw new Error(result.failReason || "solid10_failed");
  }
  throw new Error("SOLID10_TIMEOUT");
}

// ── Sharp post-processing (SOLID10) ──────────────────────────────────────────
async function sharpenAndSave(collovUrl: string, designId: number): Promise<string> {
  const res = await fetch(collovUrl);
  if (!res.ok) throw new Error(`Failed to fetch Collov image: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const sharpened = await sharp(buffer)
    .sharpen({ sigma: 1.5, flat: 0.3, jagged: 3 })
    .clahe({ width: 50, height: 50, maxSlope: 3 })
    .unsharpMask({ sigma: 2, flat: 0.5, jagged: 2 } as any)
    .modulate({ saturation: 1.05, brightness: 1.02 })
    .jpeg({ quality: 95, mozjpeg: true })
    .toBuffer();
  const filename = `result-${designId}-${Date.now()}.jpg`;
  const filepath = path.join(uploadDir, filename);
  fs.writeFileSync(filepath, sharpened);
  log(`Design ${designId}: sharpened image saved → /uploads/${filename}`);
  return `/uploads/${filename}`;
}

// ── Main workflow: VST vs SOLID10 based on SOLID10_MODE env var ──────────────
// SOLID10_MODE=all   → alle stile bruger SOLID10
// SOLID10_MODE=skandi → kun scandinavian prøver VST (60s timeout → SOLID10 fallback)
// SOLID10_MODE=none  → alle stile prøver VST (60s timeout → SOLID10 fallback)
async function runDesignWorkflow(
  originalImageUrl: string,
  roomType: string,
  style: string,
  tier: string | undefined,
  includePlants: boolean,
  designId: number,
): Promise<string> {
  const mode = (process.env.SOLID10_MODE || "skandi").toLowerCase();
  const isScandi = style.toLowerCase() === "scandinavian";

  const useVst = mode === "none" || (mode === "skandi" && isScandi);

  if (!useVst) {
    log(`[Workflow] Design ${designId}: SOLID10 path (mode=${mode}, style=${style})`);
    setStatusMsg(designId, "Venter på AI...");
    return runSolid10AndGetResult(originalImageUrl, roomType, style, tier, includePlants, designId);
  }

  // VST med 60s timeout → automatisk SOLID10 fallback
  log(`[Workflow] Design ${designId}: VST path (mode=${mode}, style=${style}) — timeout 60s`);
  setStatusMsg(designId, "Genererer tomt rum (VST)...");

  try {
    const rawUrl = await Promise.race([
      runVstAndGetResult(originalImageUrl, roomType, style, designId),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("VST_TIMEOUT")), 60_000)
      ),
    ]);
    log(`[Workflow] Design ${designId}: VST succeeded`);
    return rawUrl;
  } catch (vstErr: any) {
    log(`[Workflow] Design ${designId}: VST failed (${vstErr.message}) → fallback SOLID10`);
    setStatusMsg(designId, "Venter på AI (fallback)...");
    return runSolid10AndGetResult(originalImageUrl, roomType, style, tier, includePlants, designId);
  }
}

// ── In-memory status message map ──────────────────────────────────────────────
const designStatusMessages = new Map<number, string>();
function setStatusMsg(designId: number, msg: string) { designStatusMessages.set(designId, msg); }
function clearStatusMsg(designId: number) { designStatusMessages.delete(designId); }

// ── Background poll with fast-retry (first attempt max 15 polls, then immediate retry) ──
async function backgroundPoll(
  designId: number,
  uuid: string,
  retryFn?: () => Promise<string>,
) {
  const maxAttempts = 15;   // 15 × 3s = 45s before retry fires (was 40 × 3s = 120s)
  const maxRetries = 1;
  let attempts = 0;
  let retryCount = 0;
  const pollStart = Date.now();

  const poll = async () => {
    attempts++;
    const elapsed = Math.round((Date.now() - pollStart) / 1000);
    setStatusMsg(designId, `Venter på AI... (${elapsed} sek)`);

    try {
      const result = await pollCollovResult(uuid);

      if (result.status === "completed" && result.resultUrl) {
        setStatusMsg(designId, "Efterbehandler billede...");
        let finalUrl = result.resultUrl;
        try {
          finalUrl = await sharpenAndSave(result.resultUrl, designId);
        } catch (sharpErr: any) {
          log(`Design ${designId}: sharp failed (using Collov URL) — ${sharpErr.message}`);
        }
        clearStatusMsg(designId);
        const design = await storage.getDesign(designId);
        await storage.updateDesign(designId, {
          status: "completed",
          resultImageUrl: finalUrl,
          versions: [finalUrl],
        });
        log(`Design ${designId} completed in ~${elapsed}s`);

        // Kør affiliate pipeline i baggrunden (blokerer ikke polling)
        if (design) {
          const { runAffiliatePipeline } = await import("./affiliatePipeline");
          runAffiliatePipeline(designId, finalUrl, design.roomType).catch(
            (e: any) => log(`[Affiliate] Design ${designId} pipeline uncaught: ${e.message}`)
          );
        }
        return;
      }

      if (result.status === "failed") {
        if (retryCount < maxRetries && retryFn) {
          retryCount++;
          log(`Design ${designId} failed (reason: ${result.failReason}), retry ${retryCount}/${maxRetries}...`);
          setStatusMsg(designId, "Prøver igen...");
          await storage.updateDesign(designId, { status: "processing" });
          await new Promise(resolve => setTimeout(resolve, 3000));
          try {
            const newUuid = await retryFn();
            uuid = newUuid;
            attempts = 0;
            await storage.updateDesign(designId, { collovUuid: newUuid, status: "processing" });
            log(`Design ${designId} retry ${retryCount} started with uuid: ${newUuid}`);
            setTimeout(poll, 3000);
            return;
          } catch (retryErr: any) {
            log(`Design ${designId} retry ${retryCount} send failed: ${retryErr.message}`);
          }
        }
        clearStatusMsg(designId);
        await storage.updateDesign(designId, { status: "failed", failReason: result.failReason || "ai_generation_failed" });
        log(`Design ${designId} failed permanently after ${retryCount} retries, reason: ${result.failReason}`);
        return;
      }

      if (attempts < maxAttempts) {
        setTimeout(poll, 3000);
      } else if (retryCount < maxRetries && retryFn) {
        // First attempt timed out → fire retry immediately (same as FAILED path)
        retryCount++;
        log(`Design ${designId} timed out after ${elapsed}s, firing retry ${retryCount}/${maxRetries}...`);
        setStatusMsg(designId, "Prøver igen...");
        await storage.updateDesign(designId, { status: "processing" });
        try {
          const newUuid = await retryFn();
          uuid = newUuid;
          attempts = 0;
          await storage.updateDesign(designId, { collovUuid: newUuid, status: "processing" });
          log(`Design ${designId} retry ${retryCount} started with uuid: ${newUuid}`);
          setTimeout(poll, 3000);
        } catch (retryErr: any) {
          log(`Design ${designId} retry send failed: ${retryErr.message}`);
          clearStatusMsg(designId);
          await storage.updateDesign(designId, { status: "failed", failReason: "retry_send_failed" });
        }
      } else {
        clearStatusMsg(designId);
        await storage.updateDesign(designId, { status: "failed", failReason: "timeout" });
        log(`Design ${designId} timed out after ~${elapsed}s (all retries exhausted)`);
      }
    } catch (err) {
      log(`Poll error for design ${designId}: ${err}`);
      if (attempts < maxAttempts) {
        setTimeout(poll, 5000);
      } else {
        clearStatusMsg(designId);
        await storage.updateDesign(designId, { status: "failed", failReason: "poll_error" });
      }
    }
  };

  poll();
}


export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.use("/uploads", (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    next();
  });
  app.use("/uploads", express.static(uploadDir));

  // One-time admin bootstrap — protected by ADMIN_PASSWORD, safe to leave in
  app.post("/api/admin/bootstrap", async (req, res) => {
    const { password } = req.body || {};
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
    if (!ADMIN_PASSWORD || password !== ADMIN_PASSWORD) {
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
      const { uid, email } = await verifyFirebaseToken(req.headers.authorization);

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
            creditsRemaining: 2,
            totalCreditsUsed: 0,
          });

          await storage.createCreditTransaction({
            userId: user.id,
            amount: 2,
            type: "signup_free",
            description: "2 gratis billeder ved oprettelse",
          });

          log(`New user created: ${email} (uid: ${uid}) with 2 free credits`);
        }
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
        },
      });
    } catch (err: any) {
      log(`Auth verify failed: ${err.message}`);
      return res.status(401).json({ error: "Ugyldig token" });
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

      // Always derive the public URL from the actual request headers so that
      // Collov's servers can reach the image in both dev and production.
      // REPLIT_DEV_DOMAIN / REPLIT_DOMAINS can be internal hostnames that are
      // not reachable from the public internet, so we do NOT use them here.
      const protocol = (req.headers["x-forwarded-proto"] as string | undefined) || req.protocol;
      const host = (req.headers["x-forwarded-host"] as string | undefined) || req.headers.host;
      const publicUrl = `${protocol}://${host}/uploads/${req.file.filename}`;
      log(`Upload URL for Collov: ${publicUrl}`);

      const tier = parsed.data.budget ? budgetToTier(parsed.data.budget) : undefined;

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

      if (!COLLOV_API_KEY) {
        await storage.updateDesign(design.id, { status: "failed", failReason: "api_key_missing" });
        return res.status(500).json({ message: "API nøgle ikke konfigureret. Kontakt support.", errorCode: "api_key_missing" });
      }

      const includePlants = req.body.includePlants === "true";

      // Respond immediately — workflow starts right away (pre-warm handles cold-start)
      setStatusMsg(design.id, "Starter generering...");
      const updated = await storage.getDesign(design.id);
      res.json(updated);

      // Background: start immediately (no delay — models are pre-warmed at server start)
      setTimeout(async () => {
        try {
          log(`Design ${design.id}: starting workflow...`);
          const rawImageUrl = await runDesignWorkflow(
            publicUrl, parsed.data.roomType, parsed.data.style, tier, includePlants, design.id,
          );
          setStatusMsg(design.id, "Efterbehandler billede...");
          let finalUrl = rawImageUrl;
          try {
            finalUrl = await sharpenAndSave(rawImageUrl, design.id);
          } catch (sharpErr: any) {
            log(`Design ${design.id}: sharp failed (using raw URL) — ${sharpErr.message}`);
          }
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
        }
      }, 5000);

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

  app.get("/api/designs", async (_req, res) => {
    const allDesigns = await storage.getAllDesigns();
    return res.json(allDesigns);
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

  app.get("/api/quotes", async (_req, res) => {
    const allQuotes = await storage.getAllQuotes();
    return res.json(allQuotes);
  });

  app.get("/api/quotes/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });

    const quote = await storage.getQuote(id);
    if (!quote) return res.status(404).json({ message: "Quote not found" });

    return res.json(quote);
  });

  app.get("/api/designs/:id/quotes", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });

    const designQuotes = await storage.getQuotesByDesign(id);
    return res.json(designQuotes);
  });

  app.patch("/api/quotes/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });

      const quote = await storage.updateQuote(id, req.body);
      if (!quote) return res.status(404).json({ message: "Quote not found" });

      return res.json(quote);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/special-requests", async (req, res) => {
    try {
      const parsed = createSpecialRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }

      const specialRequest = await storage.createSpecialRequest({
        designId: parsed.data.designId,
        originalImageUrl: parsed.data.originalImageUrl,
        request: parsed.data.request,
        customerEmail: parsed.data.customerEmail || null,
        price: parsed.data.price,
        status: "pending",
      });

      log(`New special request #${specialRequest.id}: "${parsed.data.request}" for design ${parsed.data.designId}`);

      sendSpecialRequestEmail({
        customerEmail: parsed.data.customerEmail,
        request: parsed.data.request,
        originalImageUrl: parsed.data.originalImageUrl,
        designId: parsed.data.designId,
        price: parsed.data.price,
      });

      return res.json(specialRequest);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/special-requests", async (_req, res) => {
    const requests = await storage.getAllSpecialRequests();
    return res.json(requests);
  });

  app.get("/api/special-requests/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });

    const request = await storage.getSpecialRequest(id);
    if (!request) return res.status(404).json({ message: "Special request not found" });

    return res.json(request);
  });

  app.patch("/api/special-requests/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });

      const request = await storage.updateSpecialRequest(id, req.body);
      if (!request) return res.status(404).json({ message: "Special request not found" });

      return res.json(request);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/analyze-design", async (req, res) => {
    try {
      const firebaseUser = await verifyFirebaseToken(req.headers.authorization);

      const { designId } = req.body;
      if (!designId) return res.status(400).json({ message: "designId required" });

      const design = await storage.getDesign(Number(designId));
      if (!design) return res.status(404).json({ message: "Design not found" });
      if (design.status !== "completed" || !design.resultImageUrl) {
        return res.status(400).json({ message: "Design not completed yet" });
      }
      if (!design.budget) return res.status(400).json({ message: "Design has no budget" });

      const dbUser = await storage.getUserByFirebaseUid(firebaseUser.uid);
      if (!dbUser) return res.status(404).json({ message: "User not found" });

      const protocol = (req.headers["x-forwarded-proto"] as string | undefined) || req.protocol;
      const host = (req.headers["x-forwarded-host"] as string | undefined) || req.headers.host;
      const toAbsolute = (url: string) =>
        url.startsWith("http") ? url : `${protocol}://${host}${url}`;

      const resultImageUrl = toAbsolute(design.resultImageUrl);
      const originalImageUrl = toAbsolute(design.originalImageUrl);

      log(`Starting AI analysis for design #${design.id}`);
      const analysis = await analyzeDesignImage(resultImageUrl, design.budget, design.roomType, design.style);

      sendAIAnalysisEmail({
        customerEmail: dbUser.email,
        designId: design.id,
        roomType: design.roomType,
        style: design.style,
        budget: design.budget,
        resultImageUrl,
        originalImageUrl,
        analysis,
      });

      return res.json({ success: true, productCount: analysis.products.length });
    } catch (err: any) {
      log(`AI analysis error: ${err.message}`);
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/quote-requests", async (req, res) => {
    try {
      const parsed = createQuoteRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }

      const quoteRequest = await storage.createQuoteRequest({
        designId: parsed.data.designId,
        customerEmail: parsed.data.customerEmail,
        notes: parsed.data.notes || null,
        generatedImageUrl: parsed.data.generatedImageUrl,
        roomType: parsed.data.roomType,
        style: parsed.data.style,
        budget: parsed.data.budget || null,
        status: "pending",
      });

      log(`New quote request #${quoteRequest.id} from ${parsed.data.customerEmail} for design ${parsed.data.designId}`);

      sendQuoteRequestEmail({
        customerEmail: parsed.data.customerEmail,
        notes: parsed.data.notes,
        roomType: parsed.data.roomType,
        style: parsed.data.style,
        budget: parsed.data.budget,
        generatedImageUrl: parsed.data.generatedImageUrl,
        designId: parsed.data.designId,
      });

      return res.json(quoteRequest);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/quote-requests", async (_req, res) => {
    const requests = await storage.getAllQuoteRequests();
    return res.json(requests);
  });

  app.get("/api/quote-requests/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });

    const request = await storage.getQuoteRequest(id);
    if (!request) return res.status(404).json({ message: "Quote request not found" });

    return res.json(request);
  });

  app.patch("/api/quote-requests/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });

      const request = await storage.updateQuoteRequest(id, req.body);
      if (!request) return res.status(404).json({ message: "Quote request not found" });

      return res.json(request);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  const packageMap: Record<string, { name: string; images: number; price: number }> = {
    "52707296543062": { name: "Basic", images: 10, price: 49 },
    "52707329245526": { name: "Pro", images: 25, price: 99 },
    "52707374432598": { name: "Unlimited", images: 60, price: 149 },
  };

  app.post("/api/shopify/webhook", express.json(), async (req, res) => {
    try {
      const order = req.body;
      log(`Shopify webhook received: order #${order.order_number || order.id || "unknown"}`);

      const customerEmail = order.email || order.customer?.email;
      const customerName = order.customer?.first_name
        ? `${order.customer.first_name} ${order.customer.last_name || ""}`.trim()
        : order.billing_address?.name || "Kunde";
      const orderId = String(order.order_number || order.id || Date.now());

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

      let targetUser = null;

      if (customerEmail) {
        targetUser = await storage.getUserByEmail(customerEmail);
        if (targetUser) {
          log(`User resolved via email (${customerEmail}) → ${targetUser.email}`);
        } else {
          log(`No user found for email: ${customerEmail}`);
        }
      }

      if (targetUser) {
        await storage.addCredits(targetUser.id, matchedPackage.images, `Købt: ${matchedPackage.name} pakke (${matchedPackage.images} billeder)`);
        const tierKey = matchedPackage.name.toLowerCase();
        await storage.activateSubscription(targetUser.id, tierKey);
        log(`Credits added: ${matchedPackage.images} + subscription activated (${tierKey}) → ${targetUser.email}`);
      } else {
        log(`Shopify purchase could not be matched to any user — customerEmail: ${customerEmail}`);
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

  app.post("/api/auth/welcome-email", async (req, res) => {
    try {
      const { email, source } = req.body;
      if (!email || typeof email !== "string") {
        return res.status(400).json({ error: "Email is required" });
      }
      sendWelcomeEmail(email, source);
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/login", (req, res) => {
    const { password } = req.body;
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminPassword) {
      return res.status(500).json({ error: "Admin password not configured" });
    }
    if (password === adminPassword) {
      return res.json({ success: true });
    }
    return res.status(401).json({ error: "Forkert adgangskode" });
  });

  app.get("/api/admin/stats", async (req, res) => {
    try {
      const pw = req.query.pw as string;
      if (pw !== process.env.ADMIN_PASSWORD) {
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
          await storage.updateAgentDesign(agentDesignId, { status: "completed", resultImageUrl: result.resultUrl });
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
          if (!isAdmin) {
            const deducted = await storage.deductCredit(user.id, "AI Design Agent generation");
            if (!deducted) {
              return res.status(403).json({ error: "Ikke nok billeder. Køb en pakke for at fortsætte.", requiresCredits: true });
            }
          }
        }
      } catch {
        return res.status(401).json({ error: "Invalid token" });
      }

      if (!req.file) return res.status(400).json({ error: "No image uploaded" });

      const prompt = (req.body.prompt || "").trim();
      if (!prompt) return res.status(400).json({ error: "Prompt is required" });

      const protocol = (req.headers["x-forwarded-proto"] as string | undefined) || req.protocol;
      const host = (req.headers["x-forwarded-host"] as string | undefined) || req.headers.host;
      const uploadUrl = `${protocol}://${host}/uploads/${req.file.filename}`;
      const originalImageUrl = `/uploads/${req.file.filename}`;

      const agentDesign = await storage.createAgentDesign({
        userId,
        originalImageUrl,
        agentPrompt: prompt,
        status: "processing",
      });

      try {
        const uuid = await sendCollovAgentTask(uploadUrl, prompt);
        await storage.updateAgentDesign(agentDesign.id, { collovUuid: uuid });
        backgroundPollAgent(agentDesign.id, uuid, userId, uploadUrl, prompt);
        return res.status(201).json({ id: agentDesign.id, status: "processing" });
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
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const design = await storage.getAgentDesign(id);
      if (!design) return res.status(404).json({ error: "Not found" });
      return res.json(design);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/agent-designs/:id/status", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const design = await storage.getAgentDesign(id);
      if (!design) return res.status(404).json({ error: "Not found" });

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
      console.error("find-similar fejl:", err.message);
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
      console.error("analyze-image fejl:", err.message);
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
        console.log(`Vision override: ${yoloLabel} (${Math.round(yoloConfidence * 100)}%) → ${description.type}`);
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
          console.log(`Multimodal fusion: image + text ("${textQuery.substring(0, 80)}")`);
        } catch (textErr: any) {
          console.warn(`Text embedding fejlede, bruger image embedding alene: ${textErr.message}`);
        }
      } else {
        console.log(`CLIP image-only (Vision type: "${description?.type ?? "mangler"}")`);
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
      console.error("find-similar-crop fejl:", err.message);
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
      const designId = parseInt(req.params.id);
      if (isNaN(designId)) return res.status(400).json({ error: "Ugyldigt design ID" });

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

  return httpServer;
}
