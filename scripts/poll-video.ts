import { getAnimationVideoStatus, downloadToUploads } from "../server/fal";
import path from "path";
import fs from "fs";

const requestId = "019e6da5-2854-7240-a8e4-caf552acc61d";
const outDir = path.resolve("test-output");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

(async () => {
  for (let i = 1; i <= 60; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const s = await getAnimationVideoStatus(requestId);
    console.log(`#${i}: ${s.status}${s.error ? " — " + s.error : ""}`);
    if (s.status === "COMPLETED" && s.videoUrl) {
      console.log("URL:", s.videoUrl);
      const local = await downloadToUploads(s.videoUrl, outDir, ".mp4");
      console.log("saved:", path.join(outDir, path.basename(local)));
      return;
    }
    if (s.status === "FAILED") { console.error("FAILED:", s.error); process.exit(1); }
  }
})();
