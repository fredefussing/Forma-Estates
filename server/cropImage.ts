import { Jimp, JimpMime } from "jimp";
import { writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

const PAD_PERCENT = 0.15;

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

  const padX = Math.round(w * PAD_PERCENT);
  const padY = Math.round(h * PAD_PERCENT);

  const safeX = Math.max(0, Math.min(Math.round(x - padX), imgW - 1));
  const safeY = Math.max(0, Math.min(Math.round(y - padY), imgH - 1));
  const rawW = Math.round(w + padX * 2);
  const rawH = Math.round(h + padY * 2);
  const safeW = Math.max(1, Math.min(rawW, imgW - safeX));
  const safeH = Math.max(1, Math.min(rawH, imgH - safeY));

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
