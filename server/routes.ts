import type { Express, Request } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import path from "path";
import fs from "fs";
import { createDesignSchema, createQuoteSchema, createSpecialRequestSchema, createQuoteRequestSchema, freeStyles } from "@shared/schema";
import { styleVocabulary } from "@shared/styleVocabulary";
import { budgetToTier } from "@shared/budgetUtils";
import { log } from "./index";
import { sendQuoteRequestEmail, sendSpecialRequestEmail, sendOrderConfirmationEmail, sendWelcomeEmail, sendAIAnalysisEmail } from "./email";
import { analyzeDesignImage } from "./ai_analyzer";
import { verifyFirebaseToken } from "./firebase-admin";

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

const collovStyleMap: Record<string, string> = {
  scandinavian: "scandinavian",
  modern: "modern",
  luxury: "luxury",
  industrial: "industrial",
  coastal: "coastal",
  transitional: "transitional",
  farmhouse: "farmhouse",
  midcentury: "midcentury",
};

const redesignRoomTypes = new Set(["kitchen", "bathroom"]);

async function sendCollovTask(uploadUrl: string, roomType: string, style: string, budgetPrompt?: string): Promise<string> {
  const collovStyle = collovStyleMap[style] || "modern";
  const collovType = redesignRoomTypes.has(roomType) ? "redesign" : "virtual_staging";

  const form = new FormData();
  form.append("uploadUrl", uploadUrl);
  form.append("roomType", roomType);
  form.append("style", collovStyle);

  log(`Collov send: style=${style} → collovStyle=${collovStyle}, roomType=${roomType} (no type, no prompt — original config)`);

  const res = await fetch(`${COLLOV_BASE}/flair/enterpriseApi/vst/generateImgOnCommon`, {
    method: "POST",
    headers: {
      apiKey: COLLOV_API_KEY!,
    },
    body: form,
  });

  const json = (await res.json()) as any;
  if (!json.success || !json.data?.uuid) {
    log(`Collov API error response: ${JSON.stringify(json)}`);
    throw new Error(json.message || "Collov API returned an error");
  }

  return json.data.uuid;
}

async function pollCollovResult(uuid: string): Promise<{ status: string; resultUrl?: string; failReason?: string }> {
  const res = await fetch(
    `${COLLOV_BASE}/flair/enterpriseApi/vst/getRecord?uuid=${encodeURIComponent(uuid)}`,
    {
      method: "GET",
      headers: {
        apiKey: COLLOV_API_KEY!,
      },
    }
  );

  const json = (await res.json()) as any;
  const data = json.data || {};
  const record = data.generateRecordList?.[0] || {};
  const status = record.status || data.status;

  log(`Collov poll for ${uuid}: status=${status}, raw=${JSON.stringify(json).slice(0, 500)}`);

  if (status === "SUCCESS") {
    const resultUrl = record.generateUrl || data.aiGenerateRecord?.generateUrl;
    return { status: "completed", resultUrl };
  }
  if (status === "FAILED") {
    const failReason = record.failReason || record.errorMessage || record.message || "unknown";
    log(`Collov FAILED reason: ${failReason}, full record: ${JSON.stringify(record).slice(0, 300)}`);
    return { status: "failed", failReason };
  }

  return { status: "processing" };
}

async function backgroundPoll(designId: number, uuid: string, retryFn?: () => Promise<string>) {
  const maxAttempts = 40;
  const maxRetries = 1;
  let attempts = 0;
  let retryCount = 0;

  const poll = async () => {
    attempts++;
    const elapsed = attempts * 3;
    try {
      const result = await pollCollovResult(uuid);
      if (result.status === "completed" && result.resultUrl) {
        await storage.updateDesign(designId, {
          status: "completed",
          resultImageUrl: result.resultUrl,
        });
        log(`Design ${designId} completed in ~${elapsed}s`);
        return;
      }
      if (result.status === "failed") {
        if (retryCount < maxRetries && retryFn) {
          retryCount++;
          log(`Design ${designId} failed (reason: ${result.failReason}), retry ${retryCount}/${maxRetries}...`);
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
        await storage.updateDesign(designId, { status: "failed", failReason: result.failReason || "ai_generation_failed" });
        log(`Design ${designId} failed permanently after ${retryCount} retries, reason: ${result.failReason}`);
        return;
      }
      if (attempts < maxAttempts) {
        setTimeout(poll, 3000);
      } else {
        await storage.updateDesign(designId, { status: "failed", failReason: "timeout" });
        log(`Design ${designId} timed out after ~${elapsed}s`);
      }
    } catch (err) {
      log(`Poll error for design ${designId}: ${err}`);
      if (attempts < maxAttempts) {
        setTimeout(poll, 5000);
      } else {
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

      let budgetPrompt: string | undefined;

      if (tier && styleVocabulary[parsed.data.style]?.[tier]) {
        const tierConfig = styleVocabulary[parsed.data.style][tier];

        budgetPrompt = `${parsed.data.roomType} ${parsed.data.style}`;
      }

      try {
        const uuid = await sendCollovTask(publicUrl, parsed.data.roomType, parsed.data.style, budgetPrompt);
        await storage.updateDesign(design.id, { collovUuid: uuid, status: "processing" });

        const retryFn = () => sendCollovTask(publicUrl, parsed.data.roomType, parsed.data.style, budgetPrompt);
        backgroundPoll(design.id, uuid, retryFn);

        const updated = await storage.getDesign(design.id);
        return res.json(updated);
      } catch (err: any) {
        log(`Collov API error: ${err.message}`);
        const failReason = err.message?.includes("apiKey") ? "api_key_invalid" : "ai_send_failed";
        await storage.updateDesign(design.id, { status: "failed", failReason });
        return res.status(500).json({ message: `AI generering fejlede: ${err.message}`, errorCode: failReason });
      }
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
        return res.json({ status: "completed", resultUrl: design.resultImageUrl, error: null });
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
      const firebaseUser = await verifyFirebaseToken(req);
      if (!firebaseUser) return res.status(401).json({ message: "Unauthorized" });

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
      const imageUrl = design.resultImageUrl.startsWith("http")
        ? design.resultImageUrl
        : `${protocol}://${host}${design.resultImageUrl}`;

      log(`Starting AI analysis for design #${design.id} (${design.resultImageUrl})`);
      const analysis = await analyzeDesignImage(imageUrl, design.budget, design.roomType, design.style);

      sendAIAnalysisEmail({
        customerEmail: dbUser.email,
        designId: design.id,
        roomType: design.roomType,
        style: design.style,
        budget: design.budget,
        resultImageUrl: imageUrl,
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

  return httpServer;
}
