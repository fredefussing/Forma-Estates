import fs from "node:fs/promises";
import path from "node:path";
import { r2GetStream } from "./r2";
import { downloadTrustedProxyImage } from "./services/collov-generation";

/** Only call after verifying ownership of the persisted image, never with a browser URL. */
export async function loadOwnedOpenAIImage(sourceUrl: string, uploadDir: string): Promise<Buffer> {
  if (!sourceUrl.startsWith("/uploads/")) return downloadTrustedProxyImage(sourceUrl);
  const filename = decodeURIComponent(sourceUrl.slice("/uploads/".length));
  if (!filename || path.basename(filename) !== filename || filename.includes("\0") || filename.includes("\\")) {
    throw new Error("Invalid stored image path");
  }
  try {
    return await fs.readFile(path.join(uploadDir, filename));
  } catch (error: any) {
    if (error.code !== "ENOENT") throw error;
  }
  const stream = await r2GetStream(filename);
  if (!stream) throw new Error("Source image is unavailable");
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > 15_000_000) {
      stream.destroy();
      throw new Error("Source image exceeds size limit");
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}
