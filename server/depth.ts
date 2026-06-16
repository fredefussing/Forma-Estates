import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import os from "os";

const execFileAsync = promisify(execFile);

let depthPipeline: any = null;

async function getDepthPipeline() {
  if (!depthPipeline) {
    const { pipeline, env } = await import("@xenova/transformers");
    env.cacheDir = path.join(os.homedir(), ".cache", "xenova");
    depthPipeline = await pipeline("depth-estimation", "Xenova/depth-anything-small-hf");
  }
  return depthPipeline;
}

async function fetchImageToTempFile(imageUrl: string): Promise<string> {
  const tmpPath = path.join(os.tmpdir(), `depth-input-${Date.now()}.jpg`);
  await execFileAsync("curl", ["-sL", "--max-time", "30", "-o", tmpPath, imageUrl]);
  return tmpPath;
}

export async function generateDepthMap(imageUrl: string): Promise<{
  depthBase64: string;
  imageBase64: string;
  width: number;
  height: number;
}> {
  const tmpInput = await fetchImageToTempFile(imageUrl);

  try {
    const estimator = await getDepthPipeline();
    const result = await estimator(tmpInput);
    const { depth } = result;

    const w: number = depth.width;
    const h: number = depth.height;
    const srcData: Uint8ClampedArray = depth.data;
    const channels: number = depth.channels ?? 1;

    // Normaliser dybdeværdierne til fuld 0–255 range for et renere relief.
    let min = 255;
    let max = 0;
    for (let i = 0; i < w * h; i++) {
      const v = channels === 1 ? srcData[i] : srcData[i * channels];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const range = Math.max(1, max - min);

    // Use Jimp v1 API: Jimp.fromBitmap or create via constructor
    const { Jimp, rgbaToInt } = await import("jimp");
    const depthImg = new Jimp({ width: w, height: h });
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const raw =
          channels === 1 ? srcData[y * w + x] : srcData[(y * w + x) * channels];
        const v = Math.round(((raw - min) / range) * 255);
        depthImg.setPixelColor(rgbaToInt(v, v, v, 255), x, y);
      }
    }
    // Glat dybdekortet, så væg-/møbelkanter bliver bløde ramper i stedet for
    // skarpe lodrette spring, der ellers river den displacede geometri i stykker.
    depthImg.blur(3);
    const depthBuffer = await depthImg.getBuffer("image/png");
    const imageBuffer = fs.readFileSync(tmpInput);

    return {
      depthBase64: depthBuffer.toString("base64"),
      imageBase64: imageBuffer.toString("base64"),
      width: w,
      height: h,
    };
  } finally {
    fs.unlink(tmpInput, () => {});
  }
}
