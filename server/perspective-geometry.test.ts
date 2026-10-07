import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import sharp from "sharp";
import { measurePerspectiveGeometry } from "./perspective-geometry";

test("distributed structural verification survives texture replacement and still rejects zoom and skew", async () => {
  const pattern = Array.from({ length: 70 }, (_, i) =>
    `<rect x="${10 + i % 5 * 28}" y="${70 + Math.floor(i / 5) * 40}" width="16" height="22" fill="${i % 2 ? "#101010" : "#707070"}"/>`).join("");
  const stable = [360, 530, 710].flatMap(x => [130, 330, 600].map(y =>
    `<rect x="${x}" y="${y}" width="28" height="28" fill="#e4e4e4"/>`)).join("");
  const picture = (renovated: boolean) => sharp(Buffer.from(`<svg width="800" height="1000">
    <rect width="800" height="1000" fill="#ececec"/>${pattern}${stable}
    <rect x="200" y="780" width="550" height="180" fill="${renovated ? "#c8b69c" : "#29497b"}"/>
    ${renovated ? "" : Array.from({ length: 15 }, (_, i) => `<path d="M${210 + i * 35} 780v180" stroke="white" stroke-width="3"/>`).join("")}
    </svg>`)).png().toBuffer();
  const original = await picture(false), edited = await picture(true);
  const check = await measurePerspectiveGeometry(original, edited);
  assert.equal(check.verified, true);
  assert.ok(["structural_edges", "tracked_corners"].includes(check.featureMode!));
  assert.ok(check.inliers >= 12 && check.maxCornerDrift! <= 0.025 && check.rotationDegrees! <= 1);
  assert.ok(check.horizontalCoverage >= 0.35 && check.verticalCoverage >= 0.35);
  const zoom = await sharp(edited).extract({ left: 40, top: 50, width: 720, height: 900 }).resize(800, 1000).png().toBuffer();
  assert.equal((await measurePerspectiveGeometry(original, zoom)).verified, false);
  const skew = await sharp(edited).affine([[1, 0.12], [0, 1]]).resize(800, 1000, { fit: "fill" }).png().toBuffer();
  assert.equal((await measurePerspectiveGeometry(original, skew)).verified, false);
});

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
