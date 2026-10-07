import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { buildFourKImageDelivery, orientedImageDimensions } from "./image-delivery";

test("portrait delivery has original format, 4K pixels, no distortion and an untouched source", async () => {
  const original = await sharp({ create: { width: 800, height: 1000, channels: 3, background: "white" } }).png().toBuffer();
  const savedOriginal = Buffer.from(original);
  const provider = await sharp({ create: { width: 1024, height: 1536, channels: 3, background: "#908070" } }).png().toBuffer();
  const delivery = await buildFourKImageDelivery(provider, original);
  const dimensions = await orientedImageDimensions(delivery.buffer);
  assert.deepEqual(dimensions, { width: 3277, height: 4096 });
  assert.ok(Math.abs(dimensions.width / dimensions.height - 0.8) < 1 / 4096);
  assert.equal(delivery.upscaled, true);
  assert.equal(delivery.croppedToOriginalFormat, true);
  assert.deepEqual(original, savedOriginal);
});

test("landscape and square deliveries use the same original-framing contract", async () => {
  for (const [width, height] of [[1200, 800], [800, 800]]) {
    const original = await sharp({ create: { width, height, channels: 3, background: "white" } }).png().toBuffer();
    const result = await buildFourKImageDelivery(original, original);
    assert.equal(Math.max(result.width, result.height), 4096);
    assert.equal(result.croppedToOriginalFormat, false);
    assert.ok(Math.abs(result.width / result.height - width / height) < 1 / result.height);
  }
});

test("source EXIF orientation is respected", async () => {
  const original = await sharp({ create: { width: 1200, height: 800, channels: 3, background: "white" } })
    .jpeg().withMetadata({ orientation: 6 }).toBuffer();
  assert.deepEqual(await orientedImageDimensions(original), { width: 800, height: 1200 });
});
