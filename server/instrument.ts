import * as Sentry from "@sentry/node";

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    sendDefaultPii: false,
    tracesSampleRate: 0.2,
  });
  console.log("[sentry] Backend error tracking aktiv");
} else {
  console.log("[sentry] SENTRY_DSN ikke sat — fejltracking deaktiveret");
}
