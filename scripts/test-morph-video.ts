import { uploadToFal, submitAnimationVideo, getAnimationVideoStatus, downloadToUploads } from "../server/fal";
import path from "path";
import fs from "fs";

(async () => {
  const before = path.resolve("attached_assets/47662f2cd296d384852e9362d99a74e6_1779957540664.jpg");
  const after = path.resolve("attached_assets/Skærmbillede_2026-05-28_kl._10.04.03_1779957547095.png");

  console.log("uploading…");
  const [b, a] = await Promise.all([uploadToFal(before), uploadToFal(after)]);
  console.log("before:", b);
  console.log("after :", a);

  console.log("submitting MORPH…");
  const { requestId } = await submitAnimationVideo(b, a, "morph");
  console.log("request_id:", requestId);

  const outDir = path.resolve("test-output");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

  for (let i = 1; i <= 80; i++) {
    await new Promise((r) => setTimeout(r, 8000));
    const s = await getAnimationVideoStatus(requestId);
    console.log(`#${i}: ${s.status}${s.error ? " — " + s.error : ""}`);
    if (s.status === "COMPLETED" && s.videoUrl) {
      const local = await downloadToUploads(s.videoUrl, outDir, ".mp4");
      const full = path.resolve(outDir, path.basename(local));
      const finalPath = path.join(outDir, "morph-test.mp4");
      fs.renameSync(full, finalPath);
      console.log("saved:", finalPath);
      return;
    }
    if (s.status === "FAILED") { console.error("FAILED:", s.error); process.exit(1); }
  }
})();
