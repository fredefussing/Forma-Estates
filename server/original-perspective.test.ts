import test from "node:test";
import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import fs from "node:fs/promises";
import sharp from "sharp";
import { verifyOriginalPerspective, canReusePerspectiveCheck, OriginalPerspectiveError, ORIGINAL_PERSPECTIVE_INSTRUCTIONS } from "./original-perspective";

test("original perspective gate fails closed and receives the real before-photo, not an intermediate edit", async () => {
  const originalSpawn = childProcess.spawn;
  const hadKey = !!process.env.ASTRA_API_KEY;
  if (!hadKey) process.env.ASTRA_API_KEY = "fixture-with-no-network";
  const original = await fs.readFile("attached_assets/Dated_Danish_Bathroom_Before_Renovation_1791375852763.png");
  const candidate = await sharp(original).resize(1280, 1600).modulate({ brightness: 0.99 }).png().toBuffer();
  const encode = async (buffer: Buffer) => `data:image/jpeg;base64,${(await sharp(buffer).rotate()
    .resize(1280, 1280, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer()).toString("base64")}`;
  const expectedOriginal = await encode(original), expectedCandidate = await encode(candidate);
  let calls = 0;
  let response: any = { sameCamera: true, sameFraming: true, sameGeometry: true, verifiable: true, issues: [] };
  let failFirst = false;
  let resolveDispute = false;
  childProcess.spawn = ((_command: string, args: string[]) => {
    calls++;
    const child = new EventEmitter() as any;
    child.stdin = new PassThrough();
    child.stdin.resume();
    child.stdout = new EventEmitter();
    child.kill = () => true;
    queueMicrotask(async () => {
      const payload = JSON.parse(await fs.readFile(args[args.indexOf("--data-binary") + 1].slice(1), "utf8"));
      const content = payload.messages[1].content;
      assert.ok(content[0].text.includes("FIRST image is the original uploaded photograph"));
      assert.ok(content[0].text.includes(ORIGINAL_PERSPECTIVE_INSTRUCTIONS));
      assert.equal(content[1].image_url.url, expectedOriginal, "real upload is first");
      assert.equal(content[2].image_url.url, expectedCandidate, "candidate is second");
      if (failFirst) {
        failFirst = false;
        child.stdout.emit("data", "000");
        child.emit("close", 28);
      } else {
        await fs.writeFile(args[args.indexOf("-o") + 1], JSON.stringify({
          choices: [{ message: { content: JSON.stringify(resolveDispute && content[0].text.includes("DISPUTED VISUAL REVIEW")
            ? { sameCamera: true, sameFraming: true, sameGeometry: true, verifiable: true, issues: [] } : response) } }],
          usage: { prompt_tokens: 1000, completion_tokens: 100, prompt_tokens_details: { cached_tokens: 200 } },
        }));
        child.stdout.emit("data", "200");
        child.emit("close", 0);
      }
    });
    return child;
  }) as typeof childProcess.spawn;
  syncBuiltinESMExports();
  try {
    const result = await verifyOriginalPerspective(original, candidate);
    assert.equal(result.costUsd, 0.0005);
    assert.equal(canReusePerspectiveCheck(result, original, candidate), true);
    assert.equal(canReusePerspectiveCheck(result, candidate, candidate), false, "a generated result is not the original reference");
    assert.equal(canReusePerspectiveCheck(result, original, original), false, "review must apply to the exact candidate");
    for (const key of ["sameCamera", "sameFraming", "sameGeometry", "verifiable"]) {
      response[key] = false;
      await assert.rejects(verifyOriginalPerspective(original, candidate), OriginalPerspectiveError);
      response[key] = true;
    }
    response.issues = ["Shifted window corners"];
    await assert.rejects(verifyOriginalPerspective(original, candidate), OriginalPerspectiveError);
    response.issues = [];
    response.sameCamera = "true";
    await assert.rejects(verifyOriginalPerspective(original, candidate), OriginalPerspectiveError);
    response.sameCamera = true;
    response.sameFraming = false;
    response.issues = ["More scene visible on left"];
    resolveDispute = true;
    const resolved = await verifyOriginalPerspective(original, candidate);
    assert.equal(resolved.sameFraming, true);
    assert.equal(resolved.reviewHistory?.length, 2);
    assert.equal(resolved.reviewHistory?.[0].sameFraming, false);
    assert.equal(resolved.costUsd, 0.001);
    assert.equal(resolved.attempts, 2);
    resolveDispute = false;
    response.sameFraming = true;
    response.issues = [];
    failFirst = true;
    assert.equal((await verifyOriginalPerspective(original, candidate)).costUsd, null);
    const callsBefore = calls;
    const croppedFormat = await sharp(candidate).resize(1280, 800).png().toBuffer();
    await assert.rejects(verifyOriginalPerspective(original, croppedFormat), OriginalPerspectiveError);
    assert.equal(calls, callsBefore, "aspect mismatch is rejected without a paid analysis");
  } finally {
    childProcess.spawn = originalSpawn;
    syncBuiltinESMExports();
    if (!hadKey) delete process.env.ASTRA_API_KEY;
  }
});

test("every main image path preserves the original record but uses prompt-only camera guidance", () => {
  const routes = requireText("server/routes.ts");
  const endpoint = routes.slice(routes.indexOf('app.post("/api/bolig/generate"'));
  assert.ok(!endpoint.includes("verifyOriginalPerspective("));
  assert.ok(!requireText("server/room-staging.ts").includes("verifyOriginalPerspective("));
  assert.ok(requireText("server/room-staging.ts").includes('cameraPreservationMode: "prompt_only"'));
  assert.ok(endpoint.includes("originalForRecord = rootOriginalUrl"));
  assert.ok(!endpoint.includes("originalForRecord = refinementBase.originalImageUrl ?? srcImg.originalImageUrl ?? refinementBase.imageUrl"));
  assert.ok(endpoint.includes("if (!rootOriginalUrl)"));
  assert.ok(endpoint.includes('prompt += `\\n\\n${ORIGINAL_PERSPECTIVE_INSTRUCTIONS}`'));
});

import fsSync from "node:fs";
function requireText(file: string) { return fsSync.readFileSync(file, "utf8"); }
