import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getOpenAIImageApiKey } from "./openai-image-config";

export type RoomVisionStage = "analysis" | "review";
const TIMEOUT_SECONDS = 60;
const CONNECT_TIMEOUT_SECONDS = 10;
const MAX_ATTEMPTS = 2;
const MAX_RESPONSE_BYTES = 500_000;
const TRANSIENT_CURL_EXITS = new Set([5, 6, 7, 18, 28, 35, 52, 55, 56]);

async function attempt(input: string, output: string) {
  await fs.rm(output, { force: true });
  return new Promise<{ status: number; exitCode: number }>((resolve, reject) => {
    const child = spawn("curl", ["--silent", "--show-error", "--connect-timeout", String(CONNECT_TIMEOUT_SECONDS),
      "--max-time", String(TIMEOUT_SECONDS), "--max-filesize", String(MAX_RESPONSE_BYTES),
      "-o", output, "-w", "%{http_code}", "https://api.openai.com/v1/chat/completions",
      "-H", "@-", "-H", "Content-Type: application/json", "--data-binary", `@${input}`],
    { stdio: ["pipe", "pipe", "ignore"] });
    let settled = false;
    let code = "";
    const finish = (exitCode: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ status: Number(code), exitCode });
    };
    // A process-level deadline also covers an unexpectedly stuck curl process.
    const timer = setTimeout(() => { child.kill("SIGKILL"); finish(28); }, (TIMEOUT_SECONDS + 5) * 1000);
    child.stdout.on("data", chunk => { if (code.length < 12) code += chunk.toString(); });
    child.stdin.on("error", () => {}); // close/error handler owns failed transfers
    child.on("error", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error("Billedanalysens forbindelse kunne ikke startes."));
    });
    child.on("close", exit => finish(exit ?? -1));
    child.stdin.end(`Authorization: Bearer ${getOpenAIImageApiKey()}\n`);
  });
}

/** Retry only transient analysis/review failures; never retry billing or auth. */
export async function requestRoomVision(payload: unknown, stage: RoomVisionStage) {
  if (!getOpenAIImageApiKey()) throw new Error("OpenAI er ikke konfigureret til billedanalyse.");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "forma-room-vision-"));
  const input = path.join(dir, "request.json");
  const output = path.join(dir, "response.json");
  const started = Date.now();
  const label = stage === "analysis" ? "Rumanalysen" : "Billedkontrollen";
  try {
    await fs.writeFile(input, JSON.stringify(payload));
    for (let n = 1; n <= MAX_ATTEMPTS; n++) {
      const attemptStarted = Date.now();
      const { status, exitCode } = await attempt(input, output);
      let body: any;
      if (exitCode === 0) {
        const stat = await fs.stat(output);
        if (stat.size > MAX_RESPONSE_BYTES) throw new Error(`${label} svarede med for mange data.`);
        const raw = await fs.readFile(output, "utf8");
        try { body = JSON.parse(raw); } catch {
          // A gateway's non-JSON 5xx/429 response is still eligible for retry.
          if (status === 200) throw new Error(`${label} returnerede et ugyldigt svar.`);
        }
        const errorCode = body?.error?.code;
        if (status === 429 && ["credit_balance_exhausted", "insufficient_quota", "billing_hard_limit_reached"].includes(errorCode)) {
          throw new Error("OpenAI-kontoen har ikke flere API-kreditter. Billedkvoten bliver refunderet.");
        }
        if (status === 200) return { body, attempts: n, elapsedMs: Date.now() - started };
      }
      const transient = exitCode !== 0
        ? TRANSIENT_CURL_EXITS.has(exitCode)
        : status === 429 || status >= 500 && status <= 599;
      const retrying = transient && n < MAX_ATTEMPTS;
      // No prompts, source photos, credentials or provider error text in logs.
      console.warn("[room-vision] request failed", JSON.stringify({
        stage, attempt: n, exitCode, httpStatus: status || null, elapsedMs: Date.now() - attemptStarted, retrying,
      }));
      if (retrying) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }
      if (exitCode === 28) throw new Error(`${label} tog for lang tid efter to forsøg. Din billedkvote bliver refunderet.`);
      if (exitCode !== 0) throw new Error(`${label} kunne ikke gennemføres på grund af en forbindelsesfejl. Prøv igen om lidt.`);
      throw new Error(`${label} kunne ikke gennemføres (HTTP ${status}).`);
    }
    throw new Error(`${label} kunne ikke gennemføres.`);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
