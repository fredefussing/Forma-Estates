/**
 * Forma Estates — System Tracker
 * Runs as background setInterval loops inside the Express process.
 * Completely isolated — never throws to the main process.
 */

import { pool } from "./db";

const ALERT_EMAIL = "kontakt@formaestates.com";
const COLLOV_BASE = "https://api.collov.ai";
const FAL_BASE = "https://rest.alpha.fal.ai";
const APP_SELF = process.env.PORT ? `http://localhost:${process.env.PORT}` : "http://localhost:5000";
const SITE_URL = "https://formaestates.com";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CheckStatus = "ok" | "warn" | "error";

export interface CheckResult {
  name: string;
  label: string;
  status: CheckStatus;
  message: string;
  details?: Record<string, unknown>;
  checkedAt: string;
  durationMs: number;
}

// ── In-memory state ───────────────────────────────────────────────────────────

const HISTORY_SIZE = 200;
const results = new Map<string, CheckResult>();
const history: CheckResult[] = [];
const mutedUntil = new Map<string, number>();

// alert_key → timestamp of last sent email (ms)
const alertCooldown = new Map<string, number>();
const COOLDOWN_MS = 30 * 60 * 1000;

// ── Email via Brevo REST API ──────────────────────────────────────────────────
// BREVO_SYSTEM_TRACKER er en xkeysib-nøgle — bruges direkte som api-key header

async function sendBrevoEmail(subject: string, html: string): Promise<void> {
  const key = process.env.BREVO_SYSTEM_TRACKER;
  if (!key) throw new Error("BREVO_SYSTEM_TRACKER ikke konfigureret");
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": key,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sender: { name: "Forma Estates Tracker", email: ALERT_EMAIL },
      to: [{ email: ALERT_EMAIL }],
      subject,
      htmlContent: html,
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Brevo HTTP ${res.status}: ${txt.slice(0, 300)}`);
  }
}

async function sendAlertEmail(
  subject: string,
  html: string,
  alertKey: string
): Promise<void> {
  if (!process.env.BREVO_SYSTEM_TRACKER) return;

  const now = Date.now();
  const lastSent = alertCooldown.get(alertKey) ?? 0;
  if (now - lastSent < COOLDOWN_MS) return;

  // Also check DB cooldown (survives restarts)
  try {
    const row = await pool.query<{ sent_at: Date }>(
      `SELECT sent_at FROM tracker_alert_sent WHERE alert_key = $1 ORDER BY sent_at DESC LIMIT 1`,
      [alertKey]
    );
    if (row.rows.length > 0) {
      const dbMs = new Date(row.rows[0].sent_at).getTime();
      if (now - dbMs < COOLDOWN_MS) return;
    }
  } catch {
    // DB check failed — proceed anyway
  }

  alertCooldown.set(alertKey, now);

  try {
    await sendBrevoEmail(subject, html);
    await pool.query(
      `INSERT INTO tracker_alert_sent (alert_key) VALUES ($1)`,
      [alertKey]
    );
    console.log(`[tracker] Alert sent: ${alertKey}`);
  } catch (e: any) {
    console.warn(`[tracker] Failed to send alert email: ${e.message}`);
  }
}

function alertHtml(
  emoji: string,
  color: string,
  title: string,
  rows: [string, string][]
): string {
  const now = new Date().toLocaleString("da-DK", {
    timeZone: "Europe/Copenhagen",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const tableRows = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:8px 14px;color:#777;font-size:13px;width:160px;vertical-align:top;">${k}</td>` +
        `<td style="padding:8px 14px;color:#0F1923;font-size:14px;">${v}</td></tr>`
    )
    .join("");

  return `<div style="font-family:'Segoe UI',sans-serif;max-width:600px;margin:0 auto;background:#FAF6EC;padding:28px;">
  <div style="background:#fff;border-radius:10px;overflow:hidden;border:1px solid #E8DFD0;">
    <div style="background:${color};padding:22px 28px;">
      <div style="color:rgba(255,255,255,0.7);font-size:11px;letter-spacing:0.18em;text-transform:uppercase;">Forma Estates · System Monitor</div>
      <h1 style="color:#fff;font-size:20px;margin:6px 0 0;font-weight:500;">${emoji} ${title}</h1>
    </div>
    <table style="width:100%;border-collapse:collapse;">${tableRows}</table>
    <div style="padding:14px 28px;background:#FAF6EC;border-top:1px solid #E8DFD0;color:#999;font-size:12px;">
      Forma Estates System Monitor · ${now} · <a href="${SITE_URL}/admin/tracker" style="color:#C9A96E;">Åbn dashboard</a>
    </div>
  </div></div>`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function timed<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const t0 = Date.now();
  const result = await fn();
  return { result, ms: Date.now() - t0 };
}

function saveResult(r: CheckResult) {
  results.set(r.name, r);
  history.unshift(r);
  if (history.length > HISTORY_SIZE) history.pop();
}

async function persistLog(r: CheckResult) {
  if (r.status === "ok") return;
  try {
    await pool.query(
      `INSERT INTO tracker_logs (check_name, status, message, details) VALUES ($1, $2, $3, $4)`,
      [r.name, r.status, r.message, JSON.stringify(r.details ?? {})]
    );
  } catch {
    // never throw
  }
}

async function maybeAlert(r: CheckResult) {
  if (r.status === "ok") return;
  const muted = mutedUntil.get(r.name) ?? 0;
  if (Date.now() < muted) return;

  const emoji = r.status === "error" ? "🚨" : "⚠️";
  const color = r.status === "error" ? "#C0392B" : "#D68910";
  const subjectPrefix = r.status === "error" ? "🚨" : "⚠️";

  await sendAlertEmail(
    `${subjectPrefix} ${r.label} ${r.status === "error" ? "Fejl" : "Advarsel"} — Forma Estates`,
    alertHtml(emoji, color, `${r.label} ${r.status === "error" ? "Fejl" : "Advarsel"}`, [
      ["Check", r.label],
      ["Status", r.status.toUpperCase()],
      ["Besked", r.message],
      ["Varighed", `${r.durationMs} ms`],
      ...(r.details
        ? Object.entries(r.details).map(([k, v]) => [k, String(v)] as [string, string])
        : []),
    ]),
    `${r.name}:${r.status}`
  );
}

async function runCheck(
  name: string,
  label: string,
  fn: () => Promise<{ status: CheckStatus; message: string; details?: Record<string, unknown> }>
) {
  const t0 = Date.now();
  try {
    const { result, ms } = await timed(fn);
    const r: CheckResult = { name, label, ...result, checkedAt: new Date().toISOString(), durationMs: ms };
    saveResult(r);
    await persistLog(r);
    await maybeAlert(r);
  } catch (e: any) {
    const r: CheckResult = {
      name, label,
      status: "error",
      message: e.message ?? "Ukendt fejl",
      checkedAt: new Date().toISOString(),
      durationMs: Date.now() - t0,
    };
    saveResult(r);
    await persistLog(r);
    await maybeAlert(r);
  }
}

// ── Individual checks ─────────────────────────────────────────────────────────

async function checkDatabase() {
  const start = Date.now();
  try {
    await pool.query("SELECT 1");
  } catch (e: any) {
    return { status: "error" as CheckStatus, message: `PostgreSQL: forbindelsesfejl — ${e.message} — data kan ikke gemmes` };
  }
  const ms = Date.now() - start;
  if (ms > 3000) return { status: "error" as CheckStatus, message: `PostgreSQL: meget langsom respons (${ms}ms) — databasen er overbelastet`, details: { responstid_ms: ms } };
  if (ms > 1500) return { status: "warn" as CheckStatus, message: `PostgreSQL: langsom respons (${ms}ms) — overvåg ydeevnen`, details: { responstid_ms: ms } };
  return { status: "ok" as CheckStatus, message: `PostgreSQL: forbundet (${ms}ms)`, details: { responstid_ms: ms } };
}

async function checkCollovApi() {
  const key = process.env.COLLOV_API_KEY;
  if (!key) return { status: "error" as CheckStatus, message: "COLLOV_API_KEY mangler — AI-generering virker ikke" };

  const WARN_CREDITS = 50;
  const ERROR_CREDITS = 20;

  const endpoints = [
    `${COLLOV_BASE}/flair/enterpriseApi/user/credit`,
    `${COLLOV_BASE}/flair/enterpriseApi/user/info`,
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep, {
        method: "GET",
        headers: { apiKey: key },
        signal: AbortSignal.timeout(8000),
      });
      const text = await res.text();
      let json: any;
      try { json = JSON.parse(text); } catch { json = null; }

      if (res.ok || res.status === 404) {
        const credit = json?.data?.credit ?? json?.credit ?? json?.credits ?? json?.remaining;
        if (typeof credit === "number") {
          const total = json?.data?.totalCredit ?? json?.totalCredit ?? json?.total ?? "?";
          if (credit < ERROR_CREDITS) {
            return {
              status: "error" as CheckStatus,
              message: `Collov AI: kun ${credit} credits tilbage — genopfyld NU`,
              details: { credits_tilbage: credit, total_credits: total, grænse_fejl: ERROR_CREDITS, grænse_advarsel: WARN_CREDITS },
            };
          }
          if (credit < WARN_CREDITS) {
            return {
              status: "warn" as CheckStatus,
              message: `Collov AI: ${credit} credits tilbage (under ${WARN_CREDITS} — overvej genopfyldning)`,
              details: { credits_tilbage: credit, total_credits: total, grænse_advarsel: WARN_CREDITS },
            };
          }
          return { status: "ok" as CheckStatus, message: `Collov AI: ${credit} credits tilbage`, details: { credits_tilbage: credit, total_credits: total } };
        }
        if (res.ok) return { status: "ok" as CheckStatus, message: "Collov AI API tilgængeligt" };
      }
      if (res.status === 401 || res.status === 403) {
        return { status: "error" as CheckStatus, message: `Collov AI: API-nøgle afvist (HTTP ${res.status}) — tjek COLLOV_API_KEY` };
      }
    } catch {
      // try next endpoint
    }
  }

  // Fallback ping
  try {
    const form = new FormData();
    form.append("uploadUrl", "https://example.com/test.jpg");
    const res = await fetch(`${COLLOV_BASE}/flair/enterpriseApi/vst/generateEmptyRoom`, {
      method: "POST",
      headers: { apiKey: key },
      body: form,
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok || res.status === 400 || res.status === 422) {
      return { status: "ok" as CheckStatus, message: "Collov AI API tilgængeligt (ping ok)", details: { httpStatus: res.status } };
    }
    if (res.status === 401 || res.status === 403) {
      return { status: "error" as CheckStatus, message: `Collov AI: API-nøgle afvist (HTTP ${res.status}) — tjek COLLOV_API_KEY` };
    }
    return { status: "warn" as CheckStatus, message: `Collov AI API svarede HTTP ${res.status} — mulig driftforstyrrelse`, details: { httpStatus: res.status } };
  } catch (e: any) {
    return { status: "error" as CheckStatus, message: `Collov AI ikke nåbar: ${e.message} — AI-generering er nede` };
  }
}

async function checkFalApi() {
  const key = process.env.FAL_KEY;
  if (!key) return { status: "error" as CheckStatus, message: "FAL_KEY mangler — video-generering virker ikke" };

  const WARN_BALANCE = 30;
  const ERROR_BALANCE = 10;

  // Try multiple known fal.ai billing endpoints
  const endpoints = [
    { url: "https://api.fal.ai/billing/balance", auth: `Key ${key}` },
    { url: `${FAL_BASE}/accounts/me`, auth: `Key ${key}` },
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep.url, {
        headers: { Authorization: ep.auth },
        signal: AbortSignal.timeout(8000),
      });

      if (res.ok) {
        const json = await res.json().catch(() => ({}));
        const balance =
          json?.balance ??
          json?.credits ??
          json?.remaining_credits ??
          json?.available_balance ??
          json?.data?.balance;

        if (typeof balance === "number") {
          const details: Record<string, unknown> = { saldo_usd: `$${balance.toFixed(2)}`, grænse_advarsel: `$${WARN_BALANCE}`, grænse_fejl: `$${ERROR_BALANCE}` };
          if (balance < 0) {
            return { status: "error" as CheckStatus, message: `fal.ai: NEGATIV saldo $${balance.toFixed(2)} — video-generering er spærret`, details };
          }
          if (balance < ERROR_BALANCE) {
            return { status: "error" as CheckStatus, message: `fal.ai: kun $${balance.toFixed(2)} tilbage — indsæt penge NU`, details };
          }
          if (balance < WARN_BALANCE) {
            return { status: "warn" as CheckStatus, message: `fal.ai: $${balance.toFixed(2)} tilbage (under $${WARN_BALANCE} — overvej at genopfylde)`, details };
          }
          return { status: "ok" as CheckStatus, message: `fal.ai: $${balance.toFixed(2)} tilbage`, details };
        }
        return { status: "ok" as CheckStatus, message: "fal.ai API tilgængeligt" };
      }
      if (res.status === 401 || res.status === 403) {
        return { status: "error" as CheckStatus, message: `fal.ai: API-nøgle ugyldig (HTTP ${res.status}) — tjek FAL_KEY` };
      }
    } catch {
      // try next endpoint
    }
  }

  return { status: "warn" as CheckStatus, message: "fal.ai: saldo kunne ikke hentes — API svarer ikke som forventet" };
}

async function checkAppSelf() {
  try {
    const res = await fetch(`${APP_SELF}/api/bolig/quota`, {
      signal: AbortSignal.timeout(5000),
    });
    // 401 = app is up (no token), 200 = also fine
    if (res.status === 401 || res.status === 200) {
      return { status: "ok" as CheckStatus, message: `App kører — HTTP ${res.status}` };
    }
    return { status: "warn" as CheckStatus, message: `App returnerede HTTP ${res.status}`, details: { httpStatus: res.status } };
  } catch (e: any) {
    return { status: "error" as CheckStatus, message: `App ikke nåbar: ${e.message}` };
  }
}

async function checkSiteOnline() {
  const t0 = Date.now();
  try {
    const res = await fetch(SITE_URL, {
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });
    const ms = Date.now() - t0;
    if (res.ok || res.status === 301 || res.status === 302) {
      if (ms > 5000) return { status: "warn" as CheckStatus, message: `formaestates.com online men langsom (${ms}ms svartid)`, details: { http_status: res.status, responstid_ms: ms } };
      return { status: "ok" as CheckStatus, message: `formaestates.com online (${ms}ms)`, details: { http_status: res.status } };
    }
    return { status: "error" as CheckStatus, message: `formaestates.com returnerede HTTP ${res.status} — siden kan være nede`, details: { http_status: res.status } };
  } catch (e: any) {
    return { status: "error" as CheckStatus, message: `formaestates.com ikke nåbar: ${e.message} — siden er sandsynligvis nede` };
  }
}

async function checkFirebaseConfig() {
  const required = [
    "FIREBASE_PROJECT_ID",
    "FIREBASE_PRIVATE_KEY",
    "FIREBASE_CLIENT_EMAIL",
  ];
  const missing = required.filter((v) => !process.env[v]);
  if (missing.length === required.length) {
    return { status: "error" as CheckStatus, message: `Firebase: ALLE env-variabler mangler — login virker ikke`, details: { mangler: missing.join(", ") } };
  }
  if (missing.length > 0) {
    return { status: "warn" as CheckStatus, message: `Firebase: ${missing.length} env-variabel(er) mangler: ${missing.join(", ")}`, details: { mangler: missing.join(", ") } };
  }
  return { status: "ok" as CheckStatus, message: "Firebase: alle env-variabler konfigureret" };
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

let started = false;

export function startTracker() {
  if (started) return;
  started = true;

  console.log("[tracker] Starting system tracker...");

  // Run all checks immediately on startup
  void runAll();

  // Credit checks every 5 minutes
  setInterval(() => {
    void runCheck("collov_api", "Collov AI", checkCollovApi);
    void runCheck("fal_api", "fal.ai", checkFalApi);
  }, 5 * 60 * 1000);

  // Host flow checks every 2 minutes
  setInterval(() => {
    void runCheck("db_health", "PostgreSQL", checkDatabase);
    void runCheck("app_self", "App Server", checkAppSelf);
    void runCheck("site_online", "formaestates.com", checkSiteOnline);
  }, 2 * 60 * 1000);

  // Firebase & misc every 15 minutes
  setInterval(() => {
    void runCheck("firebase_config", "Firebase", checkFirebaseConfig);
  }, 15 * 60 * 1000);

  // Daily summary at 08:00 Copenhagen time
  scheduleDailySummary();

  // Cleanup old DB logs every 24h (keep 30 days)
  setInterval(async () => {
    try {
      await pool.query(`DELETE FROM tracker_logs WHERE checked_at < NOW() - INTERVAL '30 days'`);
      await pool.query(`DELETE FROM tracker_alert_sent WHERE sent_at < NOW() - INTERVAL '30 days'`);
    } catch { /* silent */ }
  }, 24 * 60 * 60 * 1000);

  console.log("[tracker] System tracker running.");
}

async function runAll() {
  await Promise.allSettled([
    runCheck("db_health", "PostgreSQL", checkDatabase),
    runCheck("collov_api", "Collov AI", checkCollovApi),
    runCheck("fal_api", "fal.ai", checkFalApi),
    runCheck("app_self", "App Server", checkAppSelf),
    runCheck("site_online", "formaestates.com", checkSiteOnline),
    runCheck("firebase_config", "Firebase", checkFirebaseConfig),
  ]);
}

function scheduleDailySummary() {
  function msUntilNext8() {
    const now = new Date();
    const next = new Date();
    next.setHours(8, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next.getTime() - now.getTime();
  }

  setTimeout(async () => {
    await sendDailySummary();
    setInterval(sendDailySummary, 24 * 60 * 60 * 1000);
  }, msUntilNext8());
}

async function sendDailySummary() {
  if (!process.env.BREVO_SYSTEM_TRACKER) return;
  try {
    const allResults = Array.from(results.values());
    const errors = allResults.filter((r) => r.status === "error");
    const warns = allResults.filter((r) => r.status === "warn");
    const ok = allResults.filter((r) => r.status === "ok");

    const rows = allResults
      .map((r) => {
        const icon = r.status === "ok" ? "🟢" : r.status === "warn" ? "🟡" : "🔴";
        return `<tr>
          <td style="padding:8px 14px;font-size:13px;color:#777;">${icon} ${r.label}</td>
          <td style="padding:8px 14px;font-size:13px;color:#0F1923;">${r.message}</td>
          <td style="padding:8px 14px;font-size:12px;color:#999;">${r.durationMs}ms</td>
        </tr>`;
      })
      .join("");

    const statusLine =
      errors.length > 0
        ? `🔴 ${errors.length} fejl`
        : warns.length > 0
        ? `🟡 ${warns.length} advarsler`
        : `🟢 Alt OK`;

    const html = `<div style="font-family:'Segoe UI',sans-serif;max-width:600px;margin:0 auto;background:#FAF6EC;padding:28px;">
  <div style="background:#fff;border-radius:10px;overflow:hidden;border:1px solid #E8DFD0;">
    <div style="background:#0F1923;padding:22px 28px;">
      <div style="color:rgba(255,255,255,0.6);font-size:11px;letter-spacing:0.18em;text-transform:uppercase;">Forma Estates · Daglig Status</div>
      <h1 style="color:#fff;font-size:20px;margin:6px 0 0;font-weight:500;">📊 ${statusLine} — ${new Date().toLocaleDateString("da-DK", { day: "numeric", month: "long" })}</h1>
    </div>
    <table style="width:100%;border-collapse:collapse;">${rows}</table>
    <div style="padding:14px 28px;background:#FAF6EC;border-top:1px solid #E8DFD0;color:#999;font-size:12px;">
      ${ok.length} OK · ${warns.length} advarsler · ${errors.length} fejl · 
      <a href="${SITE_URL}/admin/tracker" style="color:#C9A96E;">Åbn live dashboard</a>
    </div>
  </div></div>`;

    await sendBrevoEmail(`📊 Daglig System Status — ${statusLine}`, html);
    console.log("[tracker] Daily summary sent");
  } catch (e: any) {
    console.warn("[tracker] Failed to send daily summary:", e.message);
  }
}

// ── Public API (used by routes) ───────────────────────────────────────────────

export function getTrackerStatus(): CheckResult[] {
  return Array.from(results.values());
}

export function getTrackerHistory(limit = 100): CheckResult[] {
  return history.slice(0, limit);
}

export function muteAlert(checkName: string, hours = 1) {
  mutedUntil.set(checkName, Date.now() + hours * 60 * 60 * 1000);
}

export function unmuteAlert(checkName: string) {
  mutedUntil.delete(checkName);
}

export function getMutedChecks(): string[] {
  const now = Date.now();
  return Array.from(mutedUntil.entries())
    .filter(([, until]) => until > now)
    .map(([name]) => name);
}

export async function triggerManualCheck(): Promise<void> {
  await runAll();
}

export async function getDbHistory(hours = 24): Promise<Array<{
  id: number; check_name: string; status: string; message: string; checked_at: string;
}>> {
  try {
    const res = await pool.query(
      `SELECT id, check_name, status, message, checked_at FROM tracker_logs
       WHERE checked_at > NOW() - ($1 * INTERVAL '1 hour')
       ORDER BY checked_at DESC LIMIT 500`,
      [hours]
    );
    return res.rows;
  } catch {
    return [];
  }
}
