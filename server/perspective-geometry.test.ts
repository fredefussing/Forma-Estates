import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import sharp from "sharp";
import { measurePerspectiveGeometry } from "./perspective-geometry";

test("feature geometry accepts a fixed original view and rejects zoom, rotation and insufficient landmarks without an API", async () => {
  const original = await fs.readFile("attached_assets/Dated_Danish_Bathroom_Before_Renovation_1791375852763.png");
  assert.equal((await measurePerspectiveGeometry(original, original)).verified, true);
  const scaled = await sharp(original).resize(1280).modulate({ brightness: 0.99 }).png().toBuffer();
  assert.equal((await measurePerspectiveGeometry(original, scaled)).verified, true);
  const metadata = await sharp(original).metadata();
  const width = metadata.width!, height = metadata.height!;
  const zoom = await sharp(original).extract({ left: Math.round(width * 0.1), top: Math.round(height * 0.1),
    width: Math.floor(width * 0.8), height: Math.floor(height * 0.8) }).resize(width, height).png().toBuffer();
  const zoomCheck = await measurePerspectiveGeometry(original, zoom);
  assert.equal(zoomCheck.verified, false);
  assert.ok(zoomCheck.maxCornerDrift === null || zoomCheck.maxCornerDrift > 0.025);
  const rotate = await sharp(original).rotate(8, { background: "black" }).resize(width, height, { fit: "fill" }).png().toBuffer();
  assert.equal((await measurePerspectiveGeometry(original, rotate)).verified, false);
  const blank = await sharp({ create: { width, height, channels: 3, background: "white" } }).png().toBuffer();
  assert.equal((await measurePerspectiveGeometry(original, blank)).verified, false);
});

test("authorized furniture and finish replacement uses distributed structural evidence without relaxing camera limits", async () => {
  const original = await fs.readFile("client/public/bolig-images/examples-empty-room-modern.jpg");
  const renovated = await fs.readFile("server/test-fixtures/renovated-camera-locked.webp");
  const check = await measurePerspectiveGeometry(original, renovated);
  assert.equal(check.verified, true);
  assert.equal(check.featureMode, "structural_edges");
  assert.ok(check.inliers >= 12);
  assert.ok(check.maxCornerDrift! <= 0.025);
  assert.ok(check.rotationDegrees! <= 1);
  assert.ok(check.horizontalCoverage >= 0.35 && check.verticalCoverage >= 0.35);
  const zoomed = await sharp(renovated).extract({ left: 51, top: 51, width: 922, height: 922 })
    .resize(1024, 1024).png().toBuffer();
  assert.equal((await measurePerspectiveGeometry(original, zoomed)).verified, false);
  const rotated = await sharp(renovated).rotate(2, { background: "black" })
    .resize(1024, 1024, { fit: "fill" }).png().toBuffer();
  assert.equal((await measurePerspectiveGeometry(original, rotated)).verified, false);
});
