import sharp from "sharp";

/** Normalized original-photo bounds within a provider-supported transport canvas. */
export type ImageContentFrame = { x: number; y: number; width: number; height: number };

/** Validate raw provider pixels against the canvas we actually requested, before delivery resizing. */
export function hasRequestedImageResolution(
  width: number | undefined, height: number | undefined, requestedSize?: string,
): boolean {
  if (!width || !height || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
      width <= 0 || height <= 0) return false;
  if (!requestedSize) return width >= 1024 && height >= 640;
  const match = /^([1-9]\d*)x([1-9]\d*)$/.exec(requestedSize);
  if (!match) return false;
  const [, expectedWidth, expectedHeight] = match.map(Number);
  return Number.isSafeInteger(expectedWidth) && Number.isSafeInteger(expectedHeight) &&
    width >= expectedWidth && height >= expectedHeight;
}

export function openAIImageSize(width: number, height: number, nativeAspect = false) {
  const ratio = width / height;
  if (nativeAspect && ratio >= 1 / 3 && ratio <= 3) {
    // Sunburst supports arbitrary multiples of 16. Stay within the existing
    // standard-canvas pixel budget instead of inserting large white margins
    // around a complete photograph whose ratio differs from the old API sizes.
    const scale = Math.min(Math.sqrt(1536 * 1024 / (width * height)), 1536 / Math.max(width, height));
    const w = Math.max(512, Math.round(width * scale / 16) * 16);
    const h = Math.max(512, Math.round(height * scale / 16) * 16);
    return `${w}x${h}`;
  }
  return width > height * 1.1 ? "1536x1024" : height > width * 1.1 ? "1024x1536" : "1024x1024";
}

/** Extend around the complete photo, never crop or stretch it to an API ratio. */
export async function prepareOpenAIFramedInput(input: string | Buffer, nativeAspect = false) {
  const photo = await sharp(input).rotate()
    .resize(2048, 2048, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
  const { width, height } = await sharp(photo).metadata();
  if (!width || !height) throw new Error("Original image dimensions are unavailable.");
  const size = openAIImageSize(width, height, nativeAspect);
  const [targetWidth, targetHeight] = size.split("x").map(Number);
  const ratio = targetWidth / targetHeight;
  const canvasWidth = Math.max(width, Math.round(height * ratio));
  const canvasHeight = Math.max(height, Math.round(width / ratio));
  const left = Math.floor((canvasWidth - width) / 2);
  const top = Math.floor((canvasHeight - height) / 2);
  const buffer = await sharp(photo).extend({
    left, top, right: canvasWidth - width - left, bottom: canvasHeight - height - top,
    background: "#ffffff",
  }).png().toBuffer();
  const contentFrame: ImageContentFrame = {
    x: left / canvasWidth, y: top / canvasHeight,
    width: width / canvasWidth, height: height / canvasHeight,
  };
  return { buffer, contentFrame, size };
}

export function framePreservationInstructions(frame: ImageContentFrame) {
  const percent = (value: number) => (value * 100).toFixed(4);
  return `TRANSPORT CANVAS / STRICT ORIGINAL FRAMING:
The supplied photo is complete and may have plain white transport margins. The actual original photo rectangle is left ${percent(frame.x)}%, top ${percent(frame.y)}%, width ${percent(frame.width)}%, height ${percent(frame.height)}% of this canvas.
Return the full canvas at the requested size. Keep that photo rectangle in exactly the same position and proportions; keep transport margins plain and outside the scene. Do not treat margins as walls, ceilings or floors, and do not extend the room into them.
Edit only the actual photo rectangle according to the approved room/style/scope instructions. Preserve its ENTIRE original field of view, including all four edges and corners. No zoom, crop, tighter composition, camera movement, recentering or perspective change. Keep architectural landmarks at the same normalized positions within the photo rectangle. Furniture or finish replacement is not permission to reframe the photograph.
Only these known transport margins will be removed after generation. Do not add a border inside the photo or remove any original scene area.`;
}

export function imageContentRect(width: number, height: number, frame: ImageContentFrame) {
  if (![frame.x, frame.y, frame.width, frame.height].every(Number.isFinite) ||
      frame.x < 0 || frame.y < 0 || frame.width <= 0 || frame.height <= 0 ||
      frame.x + frame.width > 1.000001 || frame.y + frame.height > 1.000001) {
    throw new Error("Invalid original photo bounds.");
  }
  const left = Math.min(width - 1, Math.round(frame.x * width));
  const top = Math.min(height - 1, Math.round(frame.y * height));
  return {
    left, top,
    width: Math.max(1, Math.min(width - left, Math.round(frame.width * width))),
    height: Math.max(1, Math.min(height - top, Math.round(frame.height * height))),
  };
}

/** Review only the edited photo; raw padded provider bytes remain the durable master. */
export async function removeOpenAITransportMargins(input: Buffer | string, frame: ImageContentFrame) {
  const metadata = await sharp(input).metadata();
  if (!metadata.width || !metadata.height) throw new Error("Generated image dimensions are unavailable.");
  const rotated = metadata.orientation != null && metadata.orientation >= 5;
  const width = rotated ? metadata.height : metadata.width;
  const height = rotated ? metadata.width : metadata.height;
  return sharp(input).rotate().extract(imageContentRect(width, height, frame)).png().toBuffer();
}
