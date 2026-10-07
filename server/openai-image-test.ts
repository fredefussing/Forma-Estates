import { spawn } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import sharp from "sharp";
import { prepareOpenAIFramedInput, framePreservationInstructions, openAIImageSize, removeOpenAITransportMargins, type ImageContentFrame } from "./openai-image-frame";

export const IMAGE_TEST_MODEL = "chatgpt-image-latest";
export const SUNBURST_IMAGE_MODEL = "gpt-image-2.5-sunburst";
export type ImageTestModel = typeof IMAGE_TEST_MODEL | typeof SUNBURST_IMAGE_MODEL;
// OpenAI API standard image/text token prices, USD per 1M tokens (2026-09-26).
// https://platform.openai.com/docs/pricing — not ChatGPT subscription pricing.
const PRICE: Record<ImageTestModel, { imageInput: number; imageOutput: number; textInput: number; textOutput: number | null }> = {
  [IMAGE_TEST_MODEL]: { imageInput: 8, imageOutput: 32, textInput: 5, textOutput: 10 },
  [SUNBURST_IMAGE_MODEL]: { imageInput: 8, imageOutput: 30, textInput: 5, textOutput: null },
};
export const IMAGE_TEST_PRICE_VERSION = "openai-api-standard-2026-10-06";

export type ImageTestMetrics = {
  provider: "openai";
  model: string;
  quality?: "high";
  providerTimeMs: number;
  attempts: number;
  usage: unknown[];
  costUsd: number | null;
  costBasis: string;
  currency: "USD";
  attemptTimings?: Array<{ attempt: number; startedAt: string; elapsedMs: number; httpStatus: number | null }>;
  reportedCostSubtotalUsd?: number;
  contentFrame?: ImageContentFrame;
};

export class ImageTestFailure extends Error {
  constructor(message: string, public readonly metrics: ImageTestMetrics) {
    super(message);
    this.name = "ImageTestFailure";
  }
}

function estimate(usage: any, model: ImageTestModel): number | null {
  const input = usage?.input_tokens_details;
  const output = usage?.output_tokens_details;
  const textOutput = model === SUNBURST_IMAGE_MODEL && output?.text_tokens == null ? 0 : output?.text_tokens;
  if (![input?.image_tokens, input?.text_tokens, output?.image_tokens, textOutput].every(Number.isFinite)) return null;
  const price = PRICE[model];
  if (price.textOutput === null && textOutput !== 0) return null;
  return (input.image_tokens * price.imageInput + input.text_tokens * price.textInput +
    output.image_tokens * price.imageOutput + textOutput * (price.textOutput ?? 0)) / 1_000_000;
}

// Use curl here because Node's outbound HTTP is intercepted in this environment.
// Response is never streamed to a browser or logged. A timeout covers transfer too.
async function editOnce(imagePath: string, prompt: string, model: ImageTestModel, quality?: "high"): Promise<{ status: number; body: any }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "forma-image-test-"));
  const responsePath = path.join(dir, "response.json");
  try {
    const { width = 0, height = 0 } = await sharp(imagePath).metadata();
    const size = openAIImageSize(width, height);
    // -F parses semicolons as field options and silently truncates literal prompts.
    // --form-string preserves the full prompt (including semicolons and newlines).
    const args = ["--silent", "--show-error", "--max-time", "125", "--max-filesize", "20000000",
      "-o", responsePath, "-w", "%{http_code}", "https://api.openai.com/v1/images/edits",
       "-H", "@-", "-F", `model=${model}`, "--form-string", `prompt=${prompt}`, "-F", `size=${size}`,
      "-F", `image=@${imagePath};type=image/png`];
    if (quality) args.push("-F", `quality=${quality}`);
    const status = await new Promise<number>((resolve, reject) => {
      const child = spawn("curl", args, { stdio: ["pipe", "pipe", "ignore"] });
      child.stdin.end(`Authorization: Bearer ${process.env.ASTRA_API_KEY}\n`);
      let code = "";
      child.stdout.on("data", chunk => { code += chunk.toString(); });
      child.on("error", reject);
      child.on("close", exit => exit === 0 ? resolve(Number(code)) : reject(new Error("OpenAI image request timed out or failed.")));
    });
    const stat = await fs.stat(responsePath);
    if (stat.size > 20_000_000) throw new Error("OpenAI image response exceeds size limit.");
    return { status, body: JSON.parse(await fs.readFile(responsePath, "utf8")) };
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

export async function runOpenAIImageTest(
  inputPath: string | Buffer, prompt: string, model: ImageTestModel = IMAGE_TEST_MODEL, quality?: "high",
  existingContentFrame?: ImageContentFrame,
): Promise<{ buffer: Buffer; metrics: ImageTestMetrics; contentFrame?: ImageContentFrame }> {
  // Published edits API limit; reject instead of truncating the approved contract.
  if (!prompt.trim() || Array.from(prompt).length > 32_000) throw new Error("OpenAI image prompt exceeds the supported character limit.");
  if (!process.env.ASTRA_API_KEY) throw new Error("OpenAI image test key is not configured.");
  // A retained master may already contain transport margins. Remove only those
  // known margins before framing again, preventing compounded padding on refinements.
  const photoInput = existingContentFrame ? await removeOpenAITransportMargins(inputPath, existingContentFrame) : inputPath;
  const framed = model === SUNBURST_IMAGE_MODEL || existingContentFrame
    ? await prepareOpenAIFramedInput(photoInput) : null;
  const converted = framed?.buffer ?? await sharp(inputPath).rotate().resize(2048, 2048, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
  const providerPrompt = framed ? `${prompt}\n\n${framePreservationInstructions(framed.contentFrame)}` : prompt;
  if (Array.from(providerPrompt).length > 32_000) throw new Error("OpenAI image prompt exceeds the supported character limit.");
  if (converted.length > 15_000_000) throw new Error("Input image is too large for the OpenAI image test.");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "forma-image-input-"));
  const imagePath = path.join(dir, "input.png");
  const started = Date.now();
  const usages: unknown[] = [];
  let attempts = 0;
  const attemptTimings: NonNullable<ImageTestMetrics["attemptTimings"]> = [];
  const snapshotMetrics = (): ImageTestMetrics => {
    const costs = usages.map(usage => estimate(usage, model));
    const knownCosts = costs.filter((cost): cost is number => cost !== null);
    const costUsd = costs.every((cost): cost is number => cost !== null) && attempts === usages.length
      ? costs.reduce((a, b) => a + b, 0) : null;
    return {
      provider: "openai", model, quality, providerTimeMs: Date.now() - started,
      attempts, usage: usages, costUsd, attemptTimings,
      contentFrame: framed?.contentFrame,
      reportedCostSubtotalUsd: knownCosts.reduce((a, b) => a + b, 0),
      costBasis: costUsd === null ? "Unavailable: one or more attempts did not report usage; known subtotal does not include unreported charges" :
        `Estimate from reported tokens × ${model} API standard rates (${IMAGE_TEST_PRICE_VERSION}; image input $${PRICE[model].imageInput}/M, image output $${PRICE[model].imageOutput}/M, text input $${PRICE[model].textInput}/M${PRICE[model].textOutput === null ? ", no billed text output" : `, text output $${PRICE[model].textOutput}/M`}). Not an invoice. Cached-token discounts are not applied.`,
      currency: "USD",
    };
  };
  try {
    await fs.writeFile(imagePath, converted);
    for (let i = 0; i < 2; i++) {
      attempts++;
      const attemptStarted = Date.now();
      let result: { status: number; body: any };
      try {
        result = await editOnce(imagePath, providerPrompt, model, quality);
      } catch (error) {
        attemptTimings.push({ attempt: attempts, startedAt: new Date(attemptStarted).toISOString(), elapsedMs: Date.now() - attemptStarted, httpStatus: null });
        if (i === 0) continue;
        throw error;
      }
      attemptTimings.push({ attempt: attempts, startedAt: new Date(attemptStarted).toISOString(), elapsedMs: Date.now() - attemptStarted, httpStatus: result.status });
      if (result.body?.usage) usages.push(result.body.usage);
      if (result.status === 200 && typeof result.body?.data?.[0]?.b64_json === "string") {
        const buffer = Buffer.from(result.body.data[0].b64_json, "base64");
        const dimensions = await sharp(buffer).metadata();
        if (buffer.length > 15_000_000 || buffer.length < 100 || !dimensions.width || !dimensions.height) {
          throw new Error("OpenAI returned an invalid or oversized image.");
        }
        if (framed) {
          const [canvasWidth, canvasHeight] = framed.size.split("x").map(Number);
          if (Math.abs(dimensions.width / dimensions.height - canvasWidth / canvasHeight) > 0.002) {
            throw new Error("OpenAI changed the requested canvas format. The image was not cropped or saved.");
          }
        }
        return { buffer, metrics: snapshotMetrics(), contentFrame: framed?.contentFrame };
      }
      // Do not leak raw provider errors, prompts, or image payloads.
      if (result.status === 401 || result.status === 403) throw new Error("OpenAI image edit access denied for this key.");
      if (result.status === 400 || result.status === 422) throw new Error("OpenAI rejected the image edit input or model.");
      if (result.status === 402 || result.body?.error?.code === "billing_hard_limit_reached") throw new Error("OpenAI image billing is unavailable.");
      if (result.status === 429 && (result.body?.error?.code === "credit_balance_exhausted" ||
        result.body?.error?.code === "insufficient_quota")) {
        throw new Error("OpenAI API credits are exhausted; image edit cannot run.");
      }
      if (i === 0 && (result.status === 429 || result.status >= 500)) continue;
      throw new Error(`OpenAI image edit failed (HTTP ${result.status}).`);
    }
    throw new Error("OpenAI image edit failed.");
  } catch (error) {
    throw new ImageTestFailure(error instanceof Error ? error.message : "OpenAI image edit failed.", snapshotMetrics());
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}