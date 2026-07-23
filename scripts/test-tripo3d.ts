#!/usr/bin/env tsx
/**
 * Test fuld Tripo3D-flow:
 *   1) Kald /api/bolig/floorplan-3d (fal.ai nano-banana-2/edit → 3D billede)
 *   2) Send 3D billede til Tripo3D → 3D model
 *   3) Poll og print model GLB-URL
 *
 * Kør: npx tsx scripts/test-tripo3d.ts
 */
import { spawn } from "child_process";

const THREED_API_KEY = process.env.THREED_API_KEY;
const REPLIT_DOMAIN = (process.env.REPLIT_DOMAINS ?? "").split(",")[0].trim();

if (!THREED_API_KEY) { console.error("❌  THREED_API_KEY mangler"); process.exit(1); }
if (!REPLIT_DOMAIN) { console.error("❌  REPLIT_DOMAINS mangler"); process.exit(1); }

const imagePath = "/home/runner/workspace/public/bolig-images/test-floorplan-2d.jpg";

function curlJson(args: string[]): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const proc = spawn("curl", ["-s", "--max-time", "180", ...args]);
    proc.stdout.on("data", (d: Buffer) => chunks.push(d));
    proc.stderr.on("data", (d: Buffer) => process.stderr.write(d));
    proc.on("close", (code: number) => {
      const text = Buffer.concat(chunks).toString().trim();
      if (!text) return reject(new Error(`Tomt curl-svar (exit ${code})`));
      try { resolve(JSON.parse(text)); }
      catch { reject(new Error(`Ugyldigt JSON (exit ${code}): ${text.slice(0, 300)}`)); }
    });
  });
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log("\n════════ Tripo3D Fuld Flowtest ════════");
  console.log(`Replit domain: ${REPLIT_DOMAIN}\n`);

  // ── Trin 1: fal.ai 3D plantegningsbillede via server-endpoint ─────────────
  console.log("▶  Trin 1/3: Genererer 3D plantegningsbillede (60-120 sek)…");
  console.log("   (kalder /api/bolig/floorplan-3d med Replit public URL)\n");

  const gen = await curlJson([
    "-X", "POST",
    "http://localhost:5000/api/bolig/floorplan-3d",
    "-H", "x-forwarded-proto: https",
    "-H", `x-forwarded-host: ${REPLIT_DOMAIN}`,
    "-F", `image=@${imagePath}`,
  ]);

  console.log("   Server-svar:", JSON.stringify(gen).slice(0, 300));
  if (!gen.success || !gen.image_url) {
    throw new Error(`fal.ai trin fejlede: ${JSON.stringify(gen)}`);
  }
  const image3dUrl: string = gen.image_url;
  console.log(`   ✓ 3D billede URL: ${image3dUrl.slice(0, 90)}`);
  console.log(`   (genereret på ${gen.processing_time ?? "?"}s)\n`);

  // ── Trin 2: Tripo3D → interaktiv 3D model ─────────────────────────────────
  console.log("▶  Trin 2/3: Sender til Tripo3D image_to_model…");
  const fileType = image3dUrl.toLowerCase().includes(".png") ? "png" : "jpg";
  const tripoPayload = JSON.stringify({
    type: "image_to_model",
    file: { type: fileType, url: image3dUrl },
    texture: true,
    pbr: true,
  });

  const tripoRes = await curlJson([
    "-X", "POST",
    "https://api.tripo3d.ai/v2/openapi/task",
    "-H", `Authorization: Bearer ${THREED_API_KEY}`,
    "-H", "Content-Type: application/json",
    "-d", tripoPayload,
  ]);

  console.log("   Tripo3D svar:", JSON.stringify(tripoRes).slice(0, 200));
  if (tripoRes?.code !== 0) throw new Error(`Tripo3D fejl: ${JSON.stringify(tripoRes)}`);
  const taskId: string = tripoRes.data.task_id;
  console.log(`   ✓ Task ID: ${taskId}\n`);

  // ── Trin 3: Poll Tripo3D ────────────────────────────────────────────────────
  console.log("▶  Trin 3/3: Poller Tripo3D (1-3 min)…");
  for (let i = 0; i < 90; i++) {
    await sleep(5000);
    const st = await curlJson([
      `https://api.tripo3d.ai/v2/openapi/task/${taskId}`,
      "-H", `Authorization: Bearer ${THREED_API_KEY}`,
    ]);
    const d = st?.data;
    if (!d) { process.stdout.write(`   [${i+1}] Ugyldigt svar\r`); continue; }

    process.stdout.write(`   [${i+1}] ${d.status}  ${d.progress ?? 0}%        \r`);

    if (d.status === "success") {
      const glbUrl = d.output?.pbr_model ?? d.output?.model ?? d.result?.pbr_model?.url;
      const previewUrl = d.output?.rendered_image ?? d.result?.rendered_image?.url;
      console.log("\n");
      console.log("════════════════════════════════════════");
      console.log("✅  3D MODEL KLAR!");
      console.log("════════════════════════════════════════");
      console.log("GLB model URL  :", glbUrl ?? "(ingen)");
      console.log("Preview billede:", previewUrl ?? "(ingen)");
      console.log("════════════════════════════════════════\n");
      return;
    } else if (d.status === "failed" || d.status === "cancelled") {
      throw new Error(`Tripo3D mislykkedes: ${JSON.stringify(d)}`);
    }
  }

  console.error("\n⏰  Timeout: ingen svar inden 7.5 minutter");
  process.exit(1);
}

main().catch(e => {
  console.error("\n❌  FEJL:", e.message);
  process.exit(1);
});
