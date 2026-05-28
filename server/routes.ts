import type { Express, Request } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import path from "path";
import fs from "fs";
import sharp from "sharp";
import { createDesignSchema, createQuoteSchema, createSpecialRequestSchema, createQuoteRequestSchema, freeStyles, type InsertAiTourProperty } from "@shared/schema";
import { styleVocabulary, getRoomStylePrompt } from "@shared/styleVocabulary";
import { getBoligPrompt, BOLIG_ROOM_LABELS, BOLIG_STYLE_LABELS } from "@shared/boligPrompts";
import { budgetToTier } from "@shared/budgetUtils";
import { log } from "./index";
import { sendQuoteRequestEmail, sendSpecialRequestEmail, sendOrderConfirmationEmail, sendWelcomeEmail, sendAIAnalysisEmail, sendContactFormEmails } from "./email";
import { analyzeDesignImage } from "./ai_analyzer";
import { verifyFirebaseToken } from "./firebase-admin";
import { pool } from "./db";
import { generate3DFloorplan, generateAnimationVideo, submitAnimationVideo, getAnimationVideoStatus, isFalConfigured, uploadToFal, downloadToUploads } from "./fal";

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
};

function buildRedesignPrompt(roomType: string, style: string, tier?: string, _includePlants = false): string {
  const validTier = (tier === "budget" || tier === "standard" || tier === "luxury") ? tier : "standard";

  // 1) Prøv room-specifik prompt fra det gamle vocab (Skandinavisk/Moderne har dækning her).
  const roomSpecific = getRoomStylePrompt(style, roomType, validTier);
  if (roomSpecific) return roomSpecific;

  // 2) Fallback til nye Bolig-prompts (Luksus, Industriel, Kyst, Overgangs, Landlig, Midcentury).
  const tierMap: Record<string, "tier1" | "tier2" | "tier3"> = {
    budget: "tier1", standard: "tier2", luxury: "tier3",
  };
  const boligTier = tierMap[validTier];
  const boligRoom = BOLIG_ROOM_ALIASES[roomType.toLowerCase()] ?? roomType.toLowerCase();
  const boligPrompt = getBoligPrompt(boligRoom, style.toLowerCase(), boligTier);
  if (boligPrompt && !boligPrompt.includes(`${BOLIG_STYLE_LABELS[style.toLowerCase()] ?? style} design with appropriate furniture`)) {
    // getBoligPrompt har en generisk final fallback — kun brug den hvis vi fik en rigtig prompt.
    return boligPrompt;
  }

  // 3) Sidste udvej: generisk vocab prompt.
  const vocab = styleVocabulary[style]?.[validTier];
  return vocab
    ? `Completely redesign this ${roomType}. ${vocab.prompt}`
    : `Completely redesign this ${roomType} in ${style} style. Replace all existing furniture and decor with new pieces that match the style.`;
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
async function pollEmptyRoom(taskId: string): Promise<string> {
  const maxAttempts = 20;
  const interval = 2000;

  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(
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
  const emptyRes = await fetch(`${COLLOV_BASE}/flair/enterpriseApi/vst/generateEmptyRoom`,
    { method: "POST", headers: { apiKey: COLLOV_API_KEY! }, body: emptyForm });
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

// ── VST finalize: download + skarp post-processing ───────────────────────────
async function sharpenAndSaveVst(collovUrl: string, designId: number): Promise<string> {
  const res = await fetch(collovUrl);
  if (!res.ok) throw new Error(`VST: Failed to fetch image: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const enhanced = await sharp(buffer)
    .sharpen({ sigma: 1.0, flat: 0.5, jagged: 2 })
    .clahe({ width: 50, height: 50, maxSlope: 3 })
    .modulate({ saturation: 1.05, brightness: 1.02 })
    .jpeg({ quality: 96, mozjpeg: true })
    .toBuffer();
  const filename = `result-${designId}-${Date.now()}.jpg`;
  fs.writeFileSync(path.join(uploadDir, filename), enhanced);
  log(`Design ${designId}: VST enhanced saved → /uploads/${filename}`);
  return `/uploads/${filename}`;
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
      const { uid, email, name } = await verifyFirebaseToken(req.headers.authorization);

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

      // Sync displayName from Firebase token to DB if it has changed
      if (name && user.displayName !== name) {
        await storage.updateUser(user.id, { displayName: name });
        user = { ...user, displayName: name };
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

      // Ingen pre-processing — rå fil sendes direkte til Collov (edit/generate bevarer struktur selv)
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
      setImmediate(async () => {
        try {
          log(`Design ${design.id}: starting workflow...`);
          const finalUrl = await runDesignWorkflow(
            publicUrl, parsed.data.roomType, parsed.data.style, tier, includePlants, design.id,
          );
          // Ingen post-processing — rå Collov CDN URL gemmes direkte (samme som agent design #58)
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

      sendContactFormEmails({
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

  // ── AI BoligPotentiale: Case CRUD ─────────────────────────────────────────
  app.get("/api/bolig/cases", async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const user = await storage.getUserByFirebaseUid(uid);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const cases = await storage.getBoligCasesByUser(user.id);
      const enriched = await Promise.all(cases.map(async (c) => {
        const imgs = await storage.getGeneratedImagesByCaseId(c.id, user.id);
        const thumbs = imgs.filter((i) => i.style !== "transform-video");
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

  app.get("/api/bolig/stats", async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const user = await storage.getUserByFirebaseUid(uid);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const stats = await storage.getBoligStats(user.id);
      return res.json(stats);
    } catch (err: any) {
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
      await storage.deleteBoligCase(id);
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
      const img = await storage.createGeneratedImage({
        userId: user.id,
        caseId,
        imageUrl,
        originalImageUrl: originalImageUrl || null,
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
      const prompt = getBoligPrompt(room, style, tier as "tier1" | "tier2" | "tier3");
      return res.json({ prompt, room, style, tier });
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
      await storage.deleteGeneratedImage(id, user.id);
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // ── AI BoligPotentiale: generate endpoint ──────────────────────────────────
  app.post("/api/bolig/generate", upload.single("image"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: "Intet billede uploadet" });
      }

      // Auth — try Firebase token first, then fall back to case-owner lookup
      let authedUserId: number | null = null;
      try {
        const { uid } = await verifyFirebaseToken(req.headers.authorization);
        const u = await storage.getUserByFirebaseUid(uid);
        if (u) authedUserId = u.id;
        else log(`[BoligPotentiale] auth: uid ${uid} not found in DB`);
      } catch (authErr: any) {
        log(`[BoligPotentiale] auth fallback (${authErr?.message})`);
      }
      // Secondary fallback: if a caseId was supplied, resolve owner from the case
      if (!authedUserId && req.body.caseId) {
        const rawCid = parseInt(req.body.caseId as string);
        if (!isNaN(rawCid)) {
          const fallbackCase = await storage.getBoligCase(rawCid);
          if (fallbackCase) { authedUserId = fallbackCase.userId; log(`[BoligPotentiale] auth resolved from caseId ${rawCid} → userId ${authedUserId}`); }
        }
      }

      const isDesignAgent = req.body.isDesignAgent === "true" || req.body.isDesignAgent === true;
      const style = isDesignAgent ? "Custom" : (req.body.style as string) || "scandinavian";
      const room = isDesignAgent ? "Design Agent" : (req.body.room as string) || "living room";
      const tierRaw = (req.body.tier as string) || "tier2";
      const tier = (tierRaw === "tier1" || tierRaw === "tier2" || tierRaw === "tier3") ? tierRaw : "tier2";
      const caseId = req.body.caseId ? parseInt(req.body.caseId as string) : null;
      const isQuickGeneration = req.body.isQuick === "true" || req.body.isQuick === true;
      const customPromptText = (req.body.promptText as string) || "";

      if (!COLLOV_API_KEY) {
        return res.status(500).json({ success: false, message: "API nøgle ikke konfigureret" });
      }

      const protocol = (req.headers["x-forwarded-proto"] as string | undefined) || req.protocol;
      const host = (req.headers["x-forwarded-host"] as string | undefined) || req.headers.host;
      const publicUrl = `${protocol}://${host}/uploads/${req.file.filename}`;
      log(`[BoligPotentiale] generate: room=${room}, style=${style}, tier=${tier}, url=${publicUrl}`);

      const startTime = Date.now();

      // Build prompt — use custom text for design agent, structured prompt otherwise
      const prompt = isDesignAgent ? customPromptText : getBoligPrompt(room, style, tier as "tier1" | "tier2" | "tier3");

      // Identisk pipeline som AI Design Agent: ingen pre-/post-processing, rå Collov CDN URL,
      // 2 retries med 10s mellem forsøg.
      const maxRetries = 2;
      let collovImageUrl: string | null = null;
      let lastFailReason: string | null = null;

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
        return res.status(500).json({ success: false, message: lastFailReason || "Generering mislykkedes" });
      }

      // Ingen download eller konvertering — gem Collovs CDN URL direkte (samme som AI Design Agent).
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
            imageUrl: collovImageUrl,
            originalImageUrl: `/uploads/${req.file!.filename}`,
            roomType: room,
            style,
            budgetTier: isDesignAgent ? "0" : tier,
            promptText: isDesignAgent ? customPromptText : prompt,
            generationTimeMs: processingTimeMs,
            createdDate: todayStr,
          });
          generationId = genImg.id;
        } catch (saveErr: any) {
          log(`[BoligPotentiale] auto-save warning: ${saveErr.message}`);
        }
      }

      return res.json({ success: true, image_url: collovImageUrl, processing_time: processingTime, prompt_used: prompt, generation_id: generationId });
    } catch (err: any) {
      log(`[BoligPotentiale] generate error: ${err.message}`);
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // ── 3D Plantegning (fal.ai nano-banana-2/edit — 2D plan → 3D dollhouse) ───
  app.post("/api/bolig/floorplan-3d", upload.single("image"), async (req, res) => {
    try {
      if (!isFalConfigured()) {
        return res.status(500).json({ success: false, message: "FAL_KEY ikke konfigureret" });
      }
      if (!req.file) {
        return res.status(400).json({ success: false, message: "Intet plantegning-billede uploadet" });
      }

      const localPath = path.join(uploadDir, req.file.filename);
      log(`[3D] uploading plan to fal.storage…`);
      const falUrl = await uploadToFal(localPath, req.file.mimetype);

      log(`[3D] floorplan input: ${falUrl}`);
      const startTime = Date.now();
      const { imageUrl } = await generate3DFloorplan(falUrl);
      const processingTime = Math.round((Date.now() - startTime) / 1000);
      log(`[3D] floorplan done in ${processingTime}s → ${imageUrl.slice(0, 60)}`);
      return res.json({
        success: true,
        image_url: imageUrl,
        source_url: `/uploads/${req.file.filename}`,
        processing_time: processingTime,
      });
    } catch (err: any) {
      log(`[3D] floorplan error: ${err.message}`);
      return res.status(500).json({ success: false, message: err.message || "Generering mislykkedes" });
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

        const beforePath = path.join(uploadDir, beforeFile.filename);
        const afterPath = path.join(uploadDir, afterFile.filename);
        log(`[Video] uploading before+after to fal.storage…`);
        const [beforeFalUrl, afterFalUrl] = await Promise.all([
          uploadToFal(beforePath, beforeFile.mimetype),
          uploadToFal(afterPath, afterFile.mimetype),
        ]);

        const mode = (req.body?.mode === "morph" ? "morph" : "cinematic") as "morph" | "cinematic";
        log(`[Video] submit mode=${mode} before=${beforeFalUrl.slice(0, 60)} after=${afterFalUrl.slice(0, 60)}`);
        const { requestId } = await submitAnimationVideo(beforeFalUrl, afterFalUrl, mode);
        log(`[Video] submitted request_id=${requestId}`);

        return res.json({
          success: true,
          request_id: requestId,
          before_url: `/uploads/${beforeFile.filename}`,
          after_url: `/uploads/${afterFile.filename}`,
        });
      } catch (err: any) {
        log(`[Video] submit error: ${err.message}`);
        return res.status(500).json({ success: false, message: err.message || "Indsendelse mislykkedes" });
      }
    },
  );

  // Poll status of an in-flight video job. When COMPLETED, persists the mp4
  // locally and returns the /uploads/... URL.
  app.get("/api/bolig/transform-video/status/:requestId", async (req, res) => {
    try {
      if (!isFalConfigured()) {
        return res.status(500).json({ success: false, message: "FAL_KEY ikke konfigureret" });
      }
      const { requestId } = req.params;
      const result = await getAnimationVideoStatus(requestId);
      if (result.status === "COMPLETED" && result.videoUrl) {
        let localVideoUrl = result.videoUrl;
        try {
          localVideoUrl = await downloadToUploads(result.videoUrl, uploadDir, ".mp4");
          log(`[Video] persisted → ${localVideoUrl}`);
        } catch (e: any) {
          log(`[Video] persist failed (using fal url): ${e.message}`);
        }
        return res.json({ success: true, status: "COMPLETED", video_url: localVideoUrl });
      }
      if (result.status === "FAILED") {
        return res.json({ success: false, status: "FAILED", message: result.error || "Generering mislykkedes" });
      }
      return res.json({ success: true, status: result.status });
    } catch (err: any) {
      log(`[Video] status error: ${err.message}`);
      return res.status(500).json({ success: false, message: err.message || "Status mislykkedes" });
    }
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
        model: "gpt-4o-mini",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: `Analyze this floor plan image. For each visible room identify the room name, which walls have windows, which walls have doors and what they connect to, which walls are exterior walls (no neighboring room), and approximate area in square meters. Walls are described as one of: north, south, east, west.\n\nRespond ONLY with valid JSON in this exact shape, no prose:\n{\n  "rooms": [\n    {\n      "name": "Living Room",\n      "windows": [{"wall": "south", "position": "center", "size": "large"}],\n      "doors": [{"wall": "west", "connectsTo": "Hallway", "position": "left"}],\n      "exteriorWalls": ["south", "east"],\n      "areaSqm": 28\n    }\n  ],\n  "totalAreaSqm": 95\n}` },
            { type: "image_url", image_url: { url: absUrl } },
          ],
        }],
        max_tokens: 1500,
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
      const basePrompt = getBoligPrompt(roomType, property.style, tier);
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
      const prompt = basePrompt + layoutCtx + archFactsStr;

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
        return res.status(504).json({ message: e.message || "Generering fejlede" });
      }

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
        const localPath = path.join(uploadDir, path.basename(prop.floorplanUrl));
        const ext = path.extname(localPath).toLowerCase();
        const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
        falInputUrl = await uploadToFal(localPath, mime);
      }
      log(`[ai-tour] generate 3D plan for property ${id} (input: ${falInputUrl.slice(0, 60)})`);
      const { imageUrl } = await generate3DFloorplan(falInputUrl);
      const updated = await storage.updateAiTourProperty(id, user.id, { threedPlanUrl: imageUrl });
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

        // Cache successful synthetic angles so panorama-regenerations don't pay again.
        if (synthetic.length > 0) {
          await storage.updateAiTourRoom(roomId, user.id, { syntheticAngleUrls: synthetic } as any);
        }
      }

      // ── 4. Stitch the panorama from real + synthetic anchors ──
      const allAnchors = [...realAnchors, ...synthetic];
      const { generate360Panorama } = await import("./fal");
      log(`[ai-tour] generate panorama room=${room.name} style=${styleLabel} anchors=${allAnchors.length} (real=${realAnchors.length}, synth=${synthetic.length})`);
      const { imageUrl } = await generate360Panorama(allAnchors, room.name, styleLabel, archFactsForPanorama);

      const anchorMeta = { real: realAnchors.length, synthetic: synthetic.length, total: allAnchors.length };
      const updated = await storage.updateAiTourRoom(roomId, user.id, {
        panoramaUrl: imageUrl,
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
  app.get("/api/team", async (req, res) => {
    try {
      const { uid } = await verifyFirebaseToken(req.headers.authorization);
      const dbUser = await storage.getUserByFirebaseUid(uid);
      if (!dbUser) return res.status(401).json({ error: "User not found" });

      const membership = await storage.getTeamByUserId(dbUser.id);
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

      const existing = await storage.getTeamByUserId(dbUser.id);
      if (existing) return res.status(400).json({ error: "Du er allerede i et team" });

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
      const inviteLink = `${baseUrl}/boligpotentiale/join-team?token=${token}`;

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
      if (invite.usedAt) return res.status(400).json({ error: "Invitationen er allerede brugt" });
      if (new Date() > invite.expiresAt) return res.status(400).json({ error: "Invitationen er udløbet" });

      // Check user is not already in this team
      const existing = await storage.getTeamByUserId(dbUser.id);
      if (existing) return res.status(400).json({ error: "Du er allerede i et team" });

      await storage.addTeamMember({ teamId: invite.teamId, userId: dbUser.id, role: "user" });
      await storage.markTeamInviteUsed(invite.id);

      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  return httpServer;
}
