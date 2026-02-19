import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import path from "path";
import fs from "fs";
import { createDesignSchema } from "@shared/schema";
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

async function sendCollovTask(uploadUrl: string, roomType: string, style: string): Promise<string> {
  const FormData = (await import("form-data")).default;
  const fetch = (await import("node-fetch")).default;

  const form = new FormData();
  form.append("uploadUrl", uploadUrl);
  form.append("roomType", roomType);
  form.append("style", style);

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
  const status = data.status;

  if (status === "SUCCESS") {
    return { status: "completed", resultUrl: data.aiGenerateRecord?.generateUrl };
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
      });

      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid room type or style" });
      }

      const protocol = req.headers["x-forwarded-proto"] || req.protocol;
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      const publicUrl = `${protocol}://${host}/uploads/${req.file.filename}`;

      const design = await storage.createDesign({
        originalImageUrl: publicUrl,
        roomType: parsed.data.roomType,
        style: parsed.data.style,
        status: "pending",
      });

      if (!COLLOV_API_KEY) {
        await storage.updateDesign(design.id, { status: "failed" });
        return res.status(500).json({ message: "COLLOV_API_KEY not configured" });
      }

      try {
        const uuid = await sendCollovTask(publicUrl, parsed.data.roomType, parsed.data.style);
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
      const record = json.data || {};

      if (record.status === "FAILED") {
        await storage.updateDesign(id, { status: "failed" });
        return res.json({
          status: "failed",
          error: record.errorMessage || "Generering fejlede. Prøv et andet billede eller stil.",
          resultUrl: null,
        });
      }

      if (record.status === "SUCCESS") {
        const resultUrl = record.aiGenerateRecord?.generateUrl;
        await storage.updateDesign(id, { status: "completed", resultImageUrl: resultUrl });
        return res.json({ status: "completed", resultUrl, error: null });
      }

      return res.json({
        status: (record.status || "processing").toLowerCase(),
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

  return httpServer;
}
