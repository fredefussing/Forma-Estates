import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import path from "path";
import fs from "fs";
import { createDesignSchema, createQuoteSchema, createSpecialRequestSchema } from "@shared/schema";
import { styleVocabulary } from "@shared/styleVocabulary";
import { budgetToTier } from "@shared/budgetUtils";
import { log } from "./index";

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
  badboy: "modern",
};

async function sendCollovTask(uploadUrl: string, roomType: string, style: string, budgetPrompt?: string): Promise<string> {
  const FormData = (await import("form-data")).default;
  const fetch = (await import("node-fetch")).default;

  const collovStyle = collovStyleMap[style] || "modern";

  const form = new FormData();
  form.append("uploadUrl", uploadUrl);
  form.append("roomType", roomType);
  form.append("style", collovStyle);
  if (budgetPrompt) {
    form.append("prompt", budgetPrompt);
  }

  log(`Collov send: style=${style} → collovStyle=${collovStyle}, roomType=${roomType}, prompt=${budgetPrompt?.substring(0, 150) || "none"}`);

  const res = await fetch(`${COLLOV_BASE}/flair/enterpriseApi/vst/generateImgOnCommon`, {
    method: "POST",
    headers: {
      apiKey: COLLOV_API_KEY!,
      ...form.getHeaders(),
    },
    body: form,
  });

  const json = (await res.json()) as any;
  if (!json.success || !json.data?.uuid) {
    throw new Error(json.message || "Collov API returned an error");
  }

  return json.data.uuid;
}

async function pollCollovResult(uuid: string): Promise<{ status: string; resultUrl?: string }> {
  const fetch = (await import("node-fetch")).default;

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
    return { status: "failed" };
  }

  return { status: "processing" };
}

async function backgroundPoll(designId: number, uuid: string) {
  const maxAttempts = 60;
  let attempts = 0;

  const poll = async () => {
    attempts++;
    try {
      const result = await pollCollovResult(uuid);
      if (result.status === "completed" && result.resultUrl) {
        await storage.updateDesign(designId, {
          status: "completed",
          resultImageUrl: result.resultUrl,
        });
        log(`Design ${designId} completed`);
        return;
      }
      if (result.status === "failed") {
        await storage.updateDesign(designId, { status: "failed" });
        log(`Design ${designId} failed`);
        return;
      }
      if (attempts < maxAttempts) {
        setTimeout(poll, 3000);
      } else {
        await storage.updateDesign(designId, { status: "failed" });
        log(`Design ${designId} timed out`);
      }
    } catch (err) {
      log(`Poll error for design ${designId}: ${err}`);
      if (attempts < maxAttempts) {
        setTimeout(poll, 5000);
      } else {
        await storage.updateDesign(designId, { status: "failed" });
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

      const protocol = req.headers["x-forwarded-proto"] || req.protocol;
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      const publicUrl = `${protocol}://${host}/uploads/${req.file.filename}`;

      const tier = parsed.data.budget ? budgetToTier(parsed.data.budget) : undefined;

      const design = await storage.createDesign({
        originalImageUrl: publicUrl,
        roomType: parsed.data.roomType,
        style: parsed.data.style,
        status: "pending",
        budget: parsed.data.budget || null,
        tier: tier || null,
      });

      if (!COLLOV_API_KEY) {
        await storage.updateDesign(design.id, { status: "failed" });
        return res.status(500).json({ message: "COLLOV_API_KEY not configured" });
      }

      let budgetPrompt: string | undefined;

      if (tier && styleVocabulary[parsed.data.style]?.[tier]) {
        const tierConfig = styleVocabulary[parsed.data.style][tier];

        if (parsed.data.style === "badboy") {
          budgetPrompt = `DARK MASCULINE LUXURY STYLE: MATTE BLACK WALLS, leather, chrome, moody lighting, NO WHITE WALLS, NO LIGHT WOOD, NO SCANDINAVIAN ELEMENTS. ${tierConfig.prompt} CRITICAL: This must be dark masculine style ONLY. DO NOT use scandinavian elements. DO NOT default to white walls. MATTE BLACK WALLS mandatory, dark charcoal surfaces, NO light colors. Transform this ${parsed.data.roomType}. Maintain exact room structure, windows, doors. Photorealistic, high quality.`;
        } else {
          budgetPrompt = `Transform this ${parsed.data.roomType} to ${parsed.data.style} style.\n${tierConfig.prompt}\n\nMaintain exact room structure, windows, doors. NO layout changes. Photorealistic, high quality.`;
        }
      }

      try {
        const uuid = await sendCollovTask(publicUrl, parsed.data.roomType, parsed.data.style, budgetPrompt);
        await storage.updateDesign(design.id, { collovUuid: uuid, status: "processing" });
        backgroundPoll(design.id, uuid);

        const updated = await storage.getDesign(design.id);
        return res.json(updated);
      } catch (err: any) {
        log(`Collov API error: ${err.message}`);
        await storage.updateDesign(design.id, { status: "failed" });
        return res.status(500).json({ message: `AI processing failed: ${err.message}` });
      }
    } catch (err: any) {
      log(`Upload error: ${err.message}`);
      return res.status(500).json({ message: err.message });
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
        return res.json({ status: "failed", resultUrl: null, error: "Generering fejlede. Prøv et andet billede eller stil." });
      }

      if (!design.collovUuid) {
        return res.json({ status: design.status, resultUrl: null, error: null });
      }

      const fetch = (await import("node-fetch")).default;
      const collovRes = await fetch(
        `${COLLOV_BASE}/flair/enterpriseApi/vst/getRecord?uuid=${encodeURIComponent(design.collovUuid)}`,
        { headers: { apiKey: COLLOV_API_KEY! } }
      );
      const json = (await collovRes.json()) as any;
      const data = json.data || {};
      const genRecord = data.generateRecordList?.[0] || {};
      const recordStatus = genRecord.status || data.status;

      log(`Status check for design ${id}: collov status=${recordStatus}`);

      if (recordStatus === "FAILED") {
        await storage.updateDesign(id, { status: "failed" });
        return res.json({
          status: "failed",
          error: "Generering fejlede. Prøv et andet billede eller stil.",
          resultUrl: null,
        });
      }

      if (recordStatus === "SUCCESS") {
        const resultUrl = genRecord.generateUrl || data.aiGenerateRecord?.generateUrl;
        await storage.updateDesign(id, { status: "completed", resultImageUrl: resultUrl });
        return res.json({ status: "completed", resultUrl, error: null });
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

  return httpServer;
}
