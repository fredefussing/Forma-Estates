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
import { assertLockFileIntegrity } from "./promptGuard";
import { isLoadTestMode } from "./load-test";

const app = express();
const httpServer = createServer(app);

// Trust Render's reverse proxy so req.protocol returns "https" and
// req.get("host") returns the public domain (formaestates.com).
// Without this, password-reset links and invite links would be sent
// as http:// instead of https://.
app.set("trust proxy", 1);

// Hide the Express fingerprint — removes the "X-Powered-By: Express" header
// that otherwise advertises the server technology to potential attackers.
app.disable("x-powered-by");

// ─── Security headers ─────────────────────────────────────────────────────────
// Applied to every response before routes/static handlers run.
app.use((_req: express.Request, res: express.Response, next: express.NextFunction) => {
  const isProd = process.env.NODE_ENV === "production";

  // HSTS — only on HTTPS (production). Tells browsers to always use HTTPS
  // for the next 2 years. "preload" opts into the browser preload list.
  if (isProd) {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload",
    );
  }

  // Clickjacking protection — prevents our pages being embedded in foreign iframes.
  // SAMEORIGIN allows our own pages to iframe each other (e.g. payment flows).
  res.setHeader("X-Frame-Options", "SAMEORIGIN");

  // MIME-sniffing prevention — browsers must respect the declared Content-Type.
  // (Also set specifically on /uploads responses.)
  res.setHeader("X-Content-Type-Options", "nosniff");

  // Referrer control — sends origin only, strips path on cross-origin navigations.
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  // Content Security Policy ─────────────────────────────────────────────────
  // Notes:
  //  • script-src has NO 'unsafe-inline': GA initialisation lives in the
  //    external /analytics.js file. The JSON-LD block in index.html is a
  //    non-executable data block and is not affected by script-src.
  //  • 'unsafe-inline' in style-src is required because React renders many
  //    style={{...}} props as inline style attributes at runtime.
  //  • All image/media sources use 'https:' so generated images from fal.ai,
  //    Collov CDN, and R2 are covered without enumerating every subdomain.
  //  • connect-src lists every external API the frontend SDK calls directly;
  //    server-proxied calls (fal.ai, Collov, Brevo) go through /api/* and are
  //    covered by 'self'.
  //  • In development a Vite HMR websocket runs on the same origin; the
  //    ws: wildcard below only applies when NODE_ENV !== production.
  const connectSrc = [
    "'self'",
    // Firebase Auth SDK
    "https://identitytoolkit.googleapis.com",
    "https://securetoken.googleapis.com",
    "https://www.googleapis.com",
    "https://firebaseinstallations.googleapis.com",
    // Google Analytics
    "https://www.google-analytics.com",
    "https://analytics.google.com",
    "https://www.googletagmanager.com",
    "https://region1.google-analytics.com",
    // Stripe
    "https://api.stripe.com",
    "https://checkout.stripe.com",
    "https://m.stripe.com",
    // Vite HMR (dev only)
    ...(isProd ? [] : ["ws:", "wss:"]),
  ];

  const csp = [
    "default-src 'self'",
    // Dev only: Vite's @vitejs/plugin-react injects one inline "react-refresh
    // preamble" script into index.html. Allow exactly that script by hash so
    // dev works without 'unsafe-inline'. Not present (and not needed) in prod.
    `script-src 'self' https://www.googletagmanager.com https://www.google-analytics.com https://js.stripe.com${isProd ? "" : " 'sha256-Z2/iFzh9VMlVkEOar1f/oSHWwQk3ve1qk/C2WdsC4Xk='"}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    `connect-src ${connectSrc.join(" ")}`,
    // Stripe and future payment iframes
    "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
    // No plugins (<object>, <embed>, <applet>)
    "object-src 'none'",
    // Prevent <base href> injection attacks
    "base-uri 'self'",
    // Only allow form submissions to our own server and Stripe checkout
    "form-action 'self' https://checkout.stripe.com",
    // Prevent this page from being embedded by foreign origins (mirrors XFO above)
    "frame-ancestors 'self'",
  ].join("; ");

  res.setHeader("Content-Security-Policy", csp);

  next();
});

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

// ─── Locale cookie from Accept-Language ───────────────────────────────────────
// navigator.language in the browser reflects the browser's own UI language list
// (e.g. Chrome stays English even if macOS is Danish). Accept-Language is set by
// the OS for every HTTP request and is therefore always accurate. We surface it
// as an httpOnly:false cookie (fe-locale) so the client i18n module can read it
// synchronously — without a fetch round-trip — before the first render.
app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
  const accept = req.headers["accept-language"] ?? "";
  const supported = ["da", "sv", "de", "nb", "en", "es", "fr"];
  const langMap: Record<string, string> = { no: "nb", nn: "nb" };
  const detected =
    accept
      .split(",")
      .map(p => {
        const base = p.trim().split(";")[0].split("-")[0].toLowerCase();
        return langMap[base] ?? base;
      })
      .find(l => supported.includes(l)) ?? "da";
  res.cookie("fe-locale", detected, {
    maxAge: 365 * 24 * 60 * 60 * 1000,
    httpOnly: false,
    sameSite: "lax",
    // Secure flag required in production so browsers only send the cookie
    // over HTTPS — fixes the Observatory "Cookies" test failure.
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  next();
});

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

  // ── PROMPT LOCK INTEGRITY — must pass before any route is registered ──────
  // Verifies SHA-256 of shared/promptLock.json matches the hardcoded value in
  // server/promptGuard.ts. If the lock file has been modified without updating
  // the checksum constant, the server refuses to start.
  assertLockFileIntegrity();

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

      // The capacity harness runs fully local and must not mutate/refund
      // background production work or call external providers.
      if (!isLoadTestMode()) {
        // On boot: refund any video jobs that were still 'pending' from before the
        // last restart (in-memory maps were cleared; DB is the source of truth).
        storage.getStuckVideoJobs(30 * 60 * 1000).then(async (stuck) => {
          if (stuck.length > 0) log(`[Boot] Refunding ${stuck.length} stuck video job(s) from previous boot`);
          for (const job of stuck) {
            for (let i = 0; i < job.refundCount; i++) {
              await storage.refundQuota(job.userId, job.feature as any).catch(() => {});
            }
            await storage.failVideoJob(job.requestId).catch(() => {});
          }
        }).catch(() => {});

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
      }
    },
  );
})();
