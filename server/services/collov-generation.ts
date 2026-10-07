import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import sharp from "sharp";
import { r2UploadFile } from "../r2";

const COLLOV_BASE = "https://api.collov.ai";
const MAX_SUBMIT_RETRIES = 2;
const MAX_POLL_ATTEMPTS = 45;
const POLL_INTERVAL_MS = 2_000;
const RETRY_INTERVAL_MS = 10_000;

export interface CollovGenerationResult {
  providerUrl: string;
  jobUuid: string;
  masterBuffer: Buffer;
  masterUrl: string;
  masterLocalPath: string;
}

export interface CollovGenerationOptions {
  uploadUrl: string;
  prompt: string;
  designId: number;
  uploadDir?: string;
  maxSubmitRetries?: number;
  pollAttempts?: number;
  pollIntervalMs?: number;
  retryIntervalMs?: number;
  fetcher?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  logger?: (message: string) => void;
  onJobAccepted?: (uuid: string) => void;
  stopOnCreditExhaustion?: boolean;
}

export class CollovCreditsExhaustedError extends Error {
  constructor() {
    super("Collov credits appear to be exhausted; generation is blocked for review.");
    this.name = "CollovCreditsExhaustedError";
  }
}

function providerReportsCreditExhaustion(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const response = value as Record<string, any>;
  const details = [response.code, response.errorCode, response.message,
    response.error?.code, response.error?.message, response.data?.failReason, response.data?.message]
    .filter((part): part is string => typeof part === "string")
    .join(" ")
    .toLowerCase();
  return /credit|insufficient balance|low balance|quota exhausted/.test(details);
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function isTrustedProxyImageUrl(value: string): boolean {
  try {
    const { protocol, hostname, username, password } = new URL(value);
    if (protocol !== "https:" || username || password) return false;
    const h = hostname.toLowerCase();
    return (
      h.endsWith(".cloudfront.net") ||
      h === "fal.media" ||
      h.endsWith(".fal.media") ||
      h.endsWith(".rendy.io") ||
      h.endsWith(".collov.ai") ||
      h === "tripo3d.ai" ||
      h.endsWith(".tripo3d.ai")
    );
  } catch {
    return false;
  }
}

async function curlImageWithoutRedirect(url: string): Promise<{
  status: number;
  headers: Map<string, string>;
  body: Buffer;
}> {
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const errors: Buffer[] = [];
    const curl = spawn("curl", [
      "-sS",
      "--max-time", "30",
      "--max-redirs", "0",
      "--max-filesize", "52428800",
      "--proto", "=https",
      "-D", "-",
      "-o", "-",
      url,
    ]);
    curl.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    curl.stderr.on("data", (chunk: Buffer) => errors.push(chunk));
    curl.on("error", reject);
    curl.on("close", (code: number) => {
      if (code !== 0) {
        reject(new Error(Buffer.concat(errors).toString("utf8").trim() || `curl exit ${code}`));
        return;
      }
      const response = Buffer.concat(chunks);
      const separator = response.indexOf(Buffer.from("\r\n\r\n"));
      if (separator < 0) {
        reject(new Error("Image host returned an invalid HTTP response"));
        return;
      }
      const headerText = response.subarray(0, separator).toString("latin1");
      const statusMatch = headerText.match(/^HTTP\/\S+\s+(\d{3})/i);
      if (!statusMatch) {
        reject(new Error("Image host returned an invalid HTTP status"));
        return;
      }
      const headers = new Map<string, string>();
      for (const line of headerText.split(/\r\n/).slice(1)) {
        const colon = line.indexOf(":");
        if (colon > 0) {
          headers.set(line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim());
        }
      }
      resolve({
        status: Number(statusMatch[1]),
        headers,
        body: response.subarray(separator + 4),
      });
    });
  });
}

/**
 * Download an image only from the same trusted provider/CDN hosts used by the
 * existing route. Redirects are validated individually and bounded.
 */
export async function downloadTrustedProxyImage(initialUrl: string): Promise<Buffer> {
  let currentUrl = initialUrl;
  for (let redirectCount = 0; redirectCount <= 3; redirectCount++) {
    if (!isTrustedProxyImageUrl(currentUrl)) throw new Error("Proxy-url ikke tilladt");
    const response = await curlImageWithoutRedirect(currentUrl);
    if (response.status >= 200 && response.status < 300) {
      if (response.body.length < 1000) throw new Error("Image response is too small");
      return response.body;
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Image redirect is missing Location");
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }
    throw new Error(`Image host returned HTTP ${response.status}`);
  }
  throw new Error("Image host redirected too many times");
}

export async function downloadCollovBuffer(collovUrl: string): Promise<Buffer> {
  return downloadTrustedProxyImage(collovUrl);
}

/**
 * Persist the untouched provider bytes. This is shared by the existing customer
 * route and the demo worker; callers must not expose success before it resolves.
 */
export async function saveRawCollovRefinementSource(
  buffer: Buffer,
  designId: number,
  uploadDir = path.join(process.cwd(), "uploads"),
  logger: (message: string) => void = console.log,
): Promise<{ url: string; localFilePath: string }> {
  const format = (await sharp(buffer).metadata()).format;
  const extension = format === "png" ? "png" : format === "webp" ? "webp" : "jpg";
  const filename = `refinement-source-${designId}-${Date.now()}.${extension}`;
  const localFilePath = path.join(uploadDir, filename);
  fs.writeFileSync(localFilePath, buffer);
  await r2UploadFile(localFilePath);
  logger(`Design ${designId}: saved unmodified Collov source to /uploads/${filename}`);
  return { url: `/uploads/${filename}`, localFilePath };
}

/**
 * Run the existing Collov edit/generate flow with its customer-route retry
 * budget (initial submit + two bounded retries), then persist the raw master.
 * Retry behavior intentionally matches /api/bolig/generate.
 */
export async function generateAndPersistCollovMaster(
  options: CollovGenerationOptions,
): Promise<CollovGenerationResult> {
  const apiKey = process.env.COLLOV_API_KEY;
  if (!apiKey) throw new Error("API nøgle ikke konfigureret");
  const fetcher = options.fetcher ?? fetch;
  const wait = options.sleep ?? sleep;
  const logger = options.logger ?? console.log;
  const maxSubmitRetries = options.maxSubmitRetries ?? MAX_SUBMIT_RETRIES;
  const pollAttempts = options.pollAttempts ?? MAX_POLL_ATTEMPTS;
  const pollIntervalMs = options.pollIntervalMs ?? POLL_INTERVAL_MS;
  const retryIntervalMs = options.retryIntervalMs ?? RETRY_INTERVAL_MS;
  if (!Number.isInteger(maxSubmitRetries) || maxSubmitRetries < 0 || maxSubmitRetries > 2) {
    throw new Error("Collov technical retries must be between 0 and 2.");
  }

  let providerUrl: string | null = null;
  let lastFailure: string | null = null;
  let acceptedUuid: string | null = null;

  for (let attempt = 0; attempt <= maxSubmitRetries && !providerUrl; attempt++) {
    if (attempt > 0) {
      logger(`[Collov] retry ${attempt}/${maxSubmitRetries} (waiting ${retryIntervalMs}ms)`);
      await wait(retryIntervalMs);
    }
    const form = new FormData();
    form.append("uploadUrl", options.uploadUrl);
    form.append("prompt", options.prompt);
    const submit = await fetcher(`${COLLOV_BASE}/flair/enterpriseApi/edit/generate`, {
      method: "POST",
      headers: { apiKey },
      body: form,
    });
    const submitJson = await submit.json() as any;
    logger(`[Collov] response: ${JSON.stringify(submitJson).slice(0, 200)}`);
    if (!submitJson.success || !submitJson.data?.uuid) {
      if (options.stopOnCreditExhaustion && providerReportsCreditExhaustion(submitJson)) {
        throw new CollovCreditsExhaustedError();
      }
      lastFailure = submitJson.message || "Collov API fejl";
      continue;
    }

    const uuid = String(submitJson.data.uuid);
    acceptedUuid = uuid;
    options.onJobAccepted?.(uuid);
    let failed = false;
    for (let poll = 0; poll < pollAttempts; poll++) {
      await wait(pollIntervalMs);
      const response = await fetcher(
        `${COLLOV_BASE}/flair/enterpriseApi/edit/getRecord?uuid=${encodeURIComponent(uuid)}`,
        { method: "GET", headers: { apiKey } },
      );
      const pollJson = await response.json() as any;
      const status = pollJson.data?.status;
      logger(`[Collov] poll ${uuid}: ${status}`);
      if (status === "SUCCESS" && pollJson.data?.generateUrl) {
        providerUrl = pollJson.data.generateUrl;
        break;
      }
      if (status === "FAILED") {
        if (options.stopOnCreditExhaustion && providerReportsCreditExhaustion(pollJson)) {
          throw new CollovCreditsExhaustedError();
        }
        lastFailure = pollJson.data?.failReason || "Generering mislykkedes";
        failed = true;
        break;
      }
    }
    if (!providerUrl && !failed) lastFailure = "Generering tog for lang tid";
  }

  if (!providerUrl || !acceptedUuid) throw new Error(lastFailure || "Generering mislykkedes");
  const masterBuffer = await downloadCollovBuffer(providerUrl);
  const rawMaster = await saveRawCollovRefinementSource(
    masterBuffer,
    options.designId,
    options.uploadDir,
    logger,
  );
  return {
    providerUrl,
    jobUuid: acceptedUuid,
    masterBuffer,
    masterUrl: rawMaster.url,
    masterLocalPath: rawMaster.localFilePath,
  };
}

/** Shared with existing route URL validation for image proxy endpoints. */
export { isTrustedProxyImageUrl };