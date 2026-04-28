import { Jimp, JimpMime } from "jimp";
import { writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

export async function cropImageToTempFile(
  imageUrl: string,
  x: number,
  y: number,
  w: number,
  h: number,
): Promise<{ filePath: string; cleanup: () => void }> {
  const image = await Jimp.read(imageUrl);

  const imgW = image.width;
  const imgH = image.height;

  const safeX = Math.max(0, Math.min(Math.round(x), imgW - 1));
  const safeY = Math.max(0, Math.min(Math.round(y), imgH - 1));
  const safeW = Math.max(1, Math.min(Math.round(w), imgW - safeX));
  const safeH = Math.max(1, Math.min(Math.round(h), imgH - safeY));

  const cropped = image.crop({ x: safeX, y: safeY, w: safeW, h: safeH });
  const buffer = await cropped.getBuffer(JimpMime.jpeg);

  const filePath = join(tmpdir(), `crop_${randomUUID()}.jpg`);
  writeFileSync(filePath, buffer);

  return {
    filePath,
    cleanup: () => { try { unlinkSync(filePath); } catch { } },
  };
}

export async function getImageDimensions(imageUrl: string): Promise<{ width: number; height: number }> {
  const image = await Jimp.read(imageUrl);
  return { width: image.width, height: image.height };
}
