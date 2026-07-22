import "dotenv/config";
import path from "path";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { startTracker } from "./tracker";
import { startDripScheduler } from "./drip";
import { storage } from "./storage";
import { ensureRendyJobsTable } from "./rendy";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: "25mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Ensure both super-admin accounts always have full access on every deploy,
  // even if the production DB was reset or bootstrapped without them.
  // ONLY these two accounts — no one else.
  const SUPER_ADMIN_EMAILS = ["fredefussing@gmail.com", "nikolajthomsen0102@gmail.com"];
  for (const email of SUPER_ADMIN_EMAILS) {
    try {
      const user = await storage.getUserByEmail(email);
      if (user && (!user.isAdmin || user.subscriptionStatus !== "active" || user.subscriptionTier !== "unlimited")) {
        await storage.updateUser(user.id, {
          isAdmin: true,
          creditsRemaining: 999999,
          subscriptionStatus: "active",
          subscriptionTier: "unlimited",
        });
        console.log(`[init] Elevated ${email} to super-admin`);
      }
    } catch { /* non-fatal — will be fixed on next login via /api/auth/verify */ }
  }

  // Ensure Rendy job tracking table exists (survives server restarts)
  try { await ensureRendyJobsTable(); } catch (e: any) { console.error("[init] ensureRendyJobsTable:", e.message); }

  // Additive schema guard: creates newer tables/columns if missing (also on Render)
  try {
    const { ensureSchema } = await import("./ensure-schema");
    await ensureSchema();
  } catch (e: any) { console.error("[init] ensureSchema:", e.message); }

  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // Serve public/ directory (videos, images, etc.) before Vite/SPA fallback
  app.use(express.static(path.join(process.cwd(), "public")));

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
    },
    () => {
      log(`serving on port ${port}`);

      // Start system tracker (isolated background loops)
      setTimeout(() => startTracker(), 5000);

      // Onboarding-drip: dagligt sweep for dag-2/dag-5 mails
      startDripScheduler();

      // Pre-warm Collov GPU models 10s after start
      setTimeout(async () => {
        try {
          log("[Pre-warm] Warming Collov models...");
          const form = new FormData();
          form.append("uploadUrl", "https://example.com/dummy.jpg");
          await fetch("https://api.collov.ai/flair/enterpriseApi/vst/generateEmptyRoom", {
            method: "POST",
            headers: { apiKey: process.env.COLLOV_API_KEY || "" },
            body: form,
          });
          log("[Pre-warm] Done");
        } catch {
          log("[Pre-warm] Done (expected error)");
        }
      }, 10_000);
    },
  );
})();
