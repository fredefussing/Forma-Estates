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
    const data: Uint8ClampedArray = depth.data;

    const Jimp = (await import("jimp")).default;
    const depthImg = new Jimp(w, h);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const channels = depth.channels ?? 1;
        const v = channels === 1 ? data[idx] : data[idx * channels];
        const color = Jimp.rgbaToInt(v, v, v, 255);
        depthImg.setPixelColor(color, x, y);
      }
    }

    const depthBuffer = await depthImg.getBufferAsync(Jimp.MIME_PNG);
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
