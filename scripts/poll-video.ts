import { fal } from "@fal-ai/client";
import fs from "fs";
import path from "path";

const ep = "fal-ai/kling-video/v1.6/pro/image-to-video";
const requestId = "019e6db1-4abe-76e0-8bea-74cafcf84ee8";

(async () => {
  const s: any = await fal.queue.status(ep, { requestId });
  console.log("status:", s.status);
  if (s.status === "COMPLETED" || s.status === "IN_PROGRESS" || s.status === "IN_QUEUE") {
    if (s.status !== "COMPLETED") { console.log("not done yet"); return; }
  }
  const r: any = await fal.queue.result(ep, { requestId });
  const url = r.data?.video?.url;
  console.log("video URL:", url);
  if (!url) return;
  const resp = await fetch(url);
  const buf = Buffer.from(await resp.arrayBuffer());
  const out = path.resolve("test-output/kling-v16-pro.mp4");
  fs.writeFileSync(out, buf);
  console.log("saved:", out);
})();
