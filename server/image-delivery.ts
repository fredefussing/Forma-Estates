import sharp from "sharp";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { r2UploadFile } from "./r2";
import { imageContentRect, type ImageContentFrame } from "./openai-image-frame";

const FOUR_K_LONG_EDGE = 4096;
const MAX_PIXELS = 64_000_000;

/** EXIF-aware dimensions describe what the browser displays, not the encoded axes. */
export async function orientedImageDimensions(input: Buffer | string) {
  const metadata = await sharp(input, { limitInputPixels: MAX_PIXELS }).metadata();
  if (!metadata.width || !metadata.height) throw new Error("Image dimensions are unavailable");
  const rotated = metadata.orientation != null && metadata.orientation >= 5;
  return rotated
    ? { width: metadata.height, height: metadata.width }
    : { width: metadata.width, height: metadata.height };
}

/** Framed Sunburst outputs lose only known transport margins, not room content. */
export async function buildFourKImageDelivery(provider: Buffer, original: Buffer | string, contentFrame?: ImageContentFrame) {
  const source = await orientedImageDimensions(original);
  const native = await orientedImageDimensions(provider);
  const scale = FOUR_K_LONG_EDGE / Math.max(source.width, source.height);
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const image = sharp(provider, { limitInputPixels: MAX_PIXELS }).rotate();
  const content = contentFrame ? imageContentRect(native.width, native.height, contentFrame) : null;
  if (content) image.extract(content);
  const buffer = await image
    .resize(width, height, { fit: "cover", position: "centre", kernel: "lanczos3" })
    .jpeg({ quality: 96, chromaSubsampling: "4:4:4", progressive: true })
    .toBuffer();
  return {
    buffer,
    width,
    height,
    nativeWidth: native.width,
    nativeHeight: native.height,
    upscaled: width > native.width || height > native.height,
    croppedToOriginalFormat: Math.abs((content?.width ?? native.width) / (content?.height ?? native.height) - source.width / source.height) > 0.001,
    transportMarginsRemoved: !!contentFrame && (contentFrame.width < 1 || contentFrame.height < 1),
  };
}

/** Delivery files are not raw refinement masters and have their own neutral names. */
export async function persistFourKImageDelivery(buffer: Buffer, uploadDir: string) {
  const filename = `image-4k-${randomUUID()}.jpg`;
  const localFilePath = path.join(uploadDir, filename);
  await fs.writeFile(localFilePath, buffer);
  await r2UploadFile(localFilePath);
  return { url: `/uploads/${filename}`, localFilePath };
}
