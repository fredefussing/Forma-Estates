import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import path from "path";
import fs from "fs";
import { createDesignSchema, createQuoteSchema, createSpecialRequestSchema, createQuoteRequestSchema } from "@shared/schema";
import { styleVocabulary } from "@shared/styleVocabulary";
import { budgetToTier } from "@shared/budgetUtils";
import { log } from "./index";
import { sendQuoteRequestEmail, sendSpecialRequestEmail, sendOrderConfirmationEmail, sendWelcomeEmail } from "./email";

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
  badboy: "industrial",
};

const redesignRoomTypes = new Set(["kitchen", "bathroom"]);

async function sendCollovTask(uploadUrl: string, roomType: string, style: string, budgetPrompt?: string): Promise<string> {
  const collovStyle = collovStyleMap[style] || "modern";
  const collovType = redesignRoomTypes.has(roomType) ? "redesign" : "virtual_staging";

  const form = new FormData();
  form.append("uploadUrl", uploadUrl);
  form.append("roomType", roomType);
  form.append("style", collovStyle);
  form.append("type", collovType);
  if (budgetPrompt) {
    form.append("prompt", budgetPrompt.replace(/\n/g, ' '));
  }

  log(`Collov send: style=${style} → collovStyle=${collovStyle}, roomType=${roomType}, type=${collovType}, prompt=${budgetPrompt?.substring(0, 150) || "none"}`);

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
        await storage.updateDesign(designId, { status: "failed" });
        log(`Design ${designId} failed permanently after ${retryCount} retries`);
        return;
      }
      if (attempts < maxAttempts) {
        setTimeout(poll, 3000);
      } else {
        await storage.updateDesign(designId, { status: "failed" });
        log(`Design ${designId} timed out after ~${elapsed}s`);
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

      const replitDomain = process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS;
      let publicUrl: string;
      if (replitDomain) {
        publicUrl = `https://${replitDomain}/uploads/${req.file.filename}`;
      } else {
        const protocol = req.headers["x-forwarded-proto"] || req.protocol;
        const host = req.headers["x-forwarded-host"] || req.headers.host;
        publicUrl = `${protocol}://${host}/uploads/${req.file.filename}`;
      }

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
          budgetPrompt = `Transform this ${parsed.data.roomType} to ${parsed.data.style} style. ${tierConfig.prompt} Maintain exact room structure, windows, doors. NO layout changes. Photorealistic, high quality.`;
        }
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
        await storage.updateDesign(design.id, { status: "failed" });
        return res.status(500).json({ message: `AI processing failed: ${err.message}` });
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
    "10220649021782": { name: "Basic", images: 10, price: 49 },
    "10220626149718": { name: "Pro", images: 25, price: 99 },
    "10220614877526": { name: "Unlimited", images: 60, price: 199 },
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
        if (title.includes("unlimited")) matchedPackage = packageMap["10220614877526"];
        else if (title.includes("pro")) matchedPackage = packageMap["10220626149718"];
        else matchedPackage = packageMap["10220649021782"];
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

  return httpServer;
}
