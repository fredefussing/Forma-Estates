import { uploadToFal, submitAnimationVideo } from "../server/fal";
import path from "path";
(async () => {
  const before = path.resolve("attached_assets/47662f2cd296d384852e9362d99a74e6_1779957540664.jpg");
  const after = path.resolve("attached_assets/Skærmbillede_2026-05-28_kl._10.04.03_1779957547095.png");
  const [b, a] = await Promise.all([uploadToFal(before), uploadToFal(after)]);
  console.log("before:", b);
  console.log("after :", a);
  const { requestId } = await submitAnimationVideo(b, a, "morph");
  console.log("REQUEST_ID:", requestId);
})();
