import { uploadToFal, submitAnimationVideo, getAnimationVideoStatus, downloadToUploads, isFalConfigured } from "../server/fal";
import path from "path";
import fs from "fs";

async function main() {
  if (!isFalConfigured()) { console.error("FAL_KEY not configured"); process.exit(1); }

  const before = path.resolve("attached_assets/47662f2cd296d384852e9362d99a74e6_1779955846730.jpg");
  const after = path.resolve("attached_assets/Skærmbillede_2026-05-28_kl._10.04.03_1779955852020.png");

  console.log("[test] uploading (with resize)…");
  const [beforeUrl, afterUrl] = await Promise.all([
    uploadToFal(before, "image/jpeg"),
    uploadToFal(after, "image/png"),
  ]);
  console.log("[test] before:", beforeUrl);
  console.log("[test] after :", afterUrl);

  console.log("[test] submitting…");
  const { requestId } = await submitAnimationVideo(beforeUrl, afterUrl);
  console.log("[test] request_id:", requestId);

  const outDir = path.resolve("test-output");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

  for (let i = 1; i <= 90; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const s = await getAnimationVideoStatus(requestId);
    console.log(`[test] #${i}: ${s.status}${s.error ? " — " + s.error : ""}`);
    if (s.status === "COMPLETED" && s.videoUrl) {
      console.log("[test] video URL:", s.videoUrl);
      const local = await downloadToUploads(s.videoUrl, outDir, ".mp4");
      console.log("[test] saved:", path.join(outDir, path.basename(local)));
      return;
    }
    if (s.status === "FAILED") { console.error("[test] FAILED:", s.error); process.exit(1); }
  }
  console.error("[test] timeout"); process.exit(1);
}

main().catch((e) => { console.error("[fatal]", e); process.exit(1); });
