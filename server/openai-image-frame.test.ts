import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { prepareOpenAIFramedInput, removeOpenAITransportMargins, imageContentRect, framePreservationInstructions, openAIImageSize, hasRequestedImageResolution } from "./openai-image-frame";
import { buildFourKImageDelivery } from "./image-delivery";

test("resolution gate accepts the requested canvas in every supported orientation", () => {
  for (const [width, height] of [[941, 1672], [1672, 941], [800, 800], [800, 1000], [1200, 400], [400, 1200], [2000, 200]]) {
    for (const native of [true, false]) {
      const size = openAIImageSize(width, height, native);
      const [w, h] = size.split("x").map(Number);
      assert.equal(hasRequestedImageResolution(w, h, size), true, size);
      assert.equal(hasRequestedImageResolution(w - 1, h, size), false);
      assert.equal(hasRequestedImageResolution(w, h - 1, size), false);
      assert.equal(hasRequestedImageResolution(w / 2, h / 2, size), false);
    }
  }
  assert.equal(openAIImageSize(941, 1672, true), "864x1536");
  assert.equal(hasRequestedImageResolution(864, 1536, "864x1536"), true);
  assert.equal(hasRequestedImageResolution(1536, 864, "864x1536"), false);
});

test("resolution gate rejects invalid metadata and preserves unframed legacy requirements", () => {
  for (const value of [undefined, 0, -1, NaN, Infinity, 0.5]) {
    assert.equal(hasRequestedImageResolution(value, 1536, "864x1536"), false);
    assert.equal(hasRequestedImageResolution(864, value, "864x1536"), false);
  }
  for (const size of ["auto", "0x0", "864x", "-864x1536"]) {
    assert.equal(hasRequestedImageResolution(864, 1536, size), false);
  }
  assert.equal(hasRequestedImageResolution(1024, 640), true);
  assert.equal(hasRequestedImageResolution(1023, 640), false);
  assert.equal(hasRequestedImageResolution(1024, 639), false);
});

async function cornerPhoto(width: number, height: number) {
  return sharp(Buffer.from(`<svg width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="#808080"/>
    <rect x="0" y="0" width="80" height="80" fill="#ff0000"/>
    <rect x="${width - 80}" y="0" width="80" height="80" fill="#00ff00"/>
    <rect x="0" y="${height - 80}" width="80" height="80" fill="#0000ff"/>
    <rect x="${width - 80}" y="${height - 80}" width="80" height="80" fill="#ffff00"/>
  </svg>`)).png().toBuffer();
}

test("Sunburst native-aspect canvas preserves every original pixel and uses only tiny rounding margins", async () => {
  for (const [width, height] of [[1122, 1402], [800, 1000], [1000, 800], [1600, 900], [900, 1600], [800, 800], [1200, 400], [400, 1200]]) {
    const photo = await cornerPhoto(width, height);
    const framed = await prepareOpenAIFramedInput(photo, true);
    const [w, h] = framed.size.split("x").map(Number);
    assert.equal(w % 16, 0);
    assert.equal(h % 16, 0);
    assert.ok(w / h >= 1 / 3 && w / h <= 3);
    assert.ok(Math.abs(w / h - width / height) < 0.02);
    assert.ok(framed.contentFrame.width > 0.98 && framed.contentFrame.height > 0.98);
    const restored = await removeOpenAITransportMargins(framed.buffer, framed.contentFrame);
    assert.deepEqual(await sharp(restored).raw().toBuffer(), await sharp(photo).raw().toBuffer());
  }
  assert.equal(openAIImageSize(800, 1000), "1024x1536", "other models keep their supported sizes");
  assert.equal(openAIImageSize(2000, 200, true), "1536x1024", "extreme ratios use safe known margins");
});

test("supported transport canvas keeps the complete photo pixel-identical at every aspect ratio", async () => {
  for (const [width, height] of [[800, 1000], [1000, 800], [1600, 900], [900, 1600], [800, 800], [1200, 400], [400, 1200]]) {
    const original = await cornerPhoto(width, height);
    const saved = Buffer.from(original);
    const framed = await prepareOpenAIFramedInput(original);
    const restored = await removeOpenAITransportMargins(framed.buffer, framed.contentFrame);
    const originalPixels = await sharp(original).raw().toBuffer();
    assert.deepEqual(await sharp(restored).raw().toBuffer(), originalPixels);
    assert.deepEqual(original, saved);
    assert.ok(framePreservationInstructions(framed.contentFrame).includes("No zoom, crop, tighter composition"));
  }
});

test("4K delivery removes only transport margins and retains all four original corner landmarks", async () => {
  for (const [width, height] of [[800, 1000], [1000, 800], [1600, 900]]) {
    const original = await cornerPhoto(width, height);
    const framed = await prepareOpenAIFramedInput(original);
    const [providerWidth, providerHeight] = framed.size.split("x").map(Number);
    const provider = await sharp(framed.buffer).resize(providerWidth, providerHeight).png().toBuffer();
    const master = Buffer.from(provider);
    const delivered = await buildFourKImageDelivery(provider, original, framed.contentFrame);
    const { data, info } = await sharp(delivered.buffer).raw().toBuffer({ resolveWithObject: true });
    const expected = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0]];
    const corners = [[20, 20], [info.width - 21, 20], [20, info.height - 21], [info.width - 21, info.height - 21]];
    for (let i = 0; i < corners.length; i++) {
      const [x, y] = corners[i];
      const offset = (y * info.width + x) * info.channels;
      for (let channel = 0; channel < 3; channel++) {
        assert.ok(Math.abs(data[offset + channel] - expected[i][channel]) < 10, `Lost corner ${i}`);
      }
    }
    assert.equal(Math.max(info.width, info.height), 4096);
    assert.ok(Math.abs(info.width / info.height - width / height) < 1 / info.height);
    assert.equal(delivered.transportMarginsRemoved, true);
    assert.deepEqual(provider, master, "raw refinement master must remain untouched");
  }
});

test("EXIF rotation and repeated master refinement do not add cropping or compound margins", async () => {
  const exif = await sharp({ create: { width: 1000, height: 800, channels: 3, background: "red" } })
    .jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const initial = await prepareOpenAIFramedInput(exif);
  const photo = await removeOpenAITransportMargins(initial.buffer, initial.contentFrame);
  assert.deepEqual((await sharp(photo).metadata()).width, 800);
  assert.deepEqual((await sharp(photo).metadata()).height, 1000);
  const repeated = await prepareOpenAIFramedInput(photo);
  assert.deepEqual(repeated.contentFrame, initial.contentFrame);
  assert.deepEqual(await sharp(repeated.buffer).raw().toBuffer(), await sharp(initial.buffer).raw().toBuffer());
  assert.throws(() => imageContentRect(1024, 1536, { x: -1, y: 0, width: 1, height: 1 }), /Invalid/);
});
