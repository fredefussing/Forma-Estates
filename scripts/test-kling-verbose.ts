import { fal } from "@fal-ai/client";
import { uploadToFal } from "../server/fal";
import path from "path";

(async () => {
  const before = path.resolve("attached_assets/47662f2cd296d384852e9362d99a74e6_1779955846730.jpg");
  const after = path.resolve("attached_assets/Skærmbillede_2026-05-28_kl._10.04.03_1779955852020.png");
  const [b, a] = await Promise.all([uploadToFal(before), uploadToFal(after)]);
  console.log("before:", b);
  console.log("after :", a);

  const endpoints = [
    "fal-ai/kling-video/v1.6/pro/image-to-video",
    "fal-ai/kling-video/v1/pro/image-to-video",
    "fal-ai/kling-video/v1.6/standard/image-to-video",
    "fal-ai/kling-video/v2/master/image-to-video",
  ];
  for (const ep of endpoints) {
    console.log(`\n=== ${ep} ===`);
    try {
      const sub = await fal.queue.submit(ep, {
        input: {
          prompt: "Cinematic transformation of the kitchen from before to after.",
          image_url: b,
          tail_image_url: a,
          duration: "5",
          aspect_ratio: "16:9",
        },
      });
      console.log("submitted:", sub.request_id);
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const s: any = await fal.queue.status(ep, { requestId: sub.request_id });
        console.log("  status:", s.status);
        if (s.status !== "IN_QUEUE" && s.status !== "IN_PROGRESS") {
          try {
            const r: any = await fal.queue.result(ep, { requestId: sub.request_id });
            console.log("  result:", JSON.stringify(r).slice(0, 500));
          } catch (re: any) {
            console.log("  result-err status:", re.status, "body:", JSON.stringify(re.body));
          }
          break;
        }
      }
    } catch (e: any) {
      console.log("submit-err status:", e.status, "body:", JSON.stringify(e.body));
    }
  }
})();
