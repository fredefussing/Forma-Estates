import test from "node:test";
import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import sharp from "sharp";
import { runOpenAIImageTest, ImageTestFailure, SUNBURST_IMAGE_MODEL } from "./openai-image-test";

test("image transport preserves multipart prompt bytes and returns measured image/usage without paid calls", async () => {
  const originalSpawn = childProcess.spawn;
  const png = await sharp({ create: { width: 128, height: 128, channels: 3, background: "green" } }).png().toBuffer();
  const prompt = "Full prompt; semicolons must survive.\nTilføj flere planter.";
  let calls = 0;
  let status = 200;
  let framedRequest = false;
  let expectedCanvas = [800, 1200];
  let wrongOutputRatio = false;
  childProcess.spawn = ((_command: string, args: string[]) => {
    calls++;
    const sentPrompt = args[args.indexOf("--form-string") + 1];
    if (framedRequest) {
      assert.ok(sentPrompt.startsWith(`prompt=${prompt}\n\nTRANSPORT CANVAS`));
      assert.ok(sentPrompt.includes("Preserve its ENTIRE original field of view"));
      assert.ok(args.includes(`model=${SUNBURST_IMAGE_MODEL}`));
      assert.ok(args.includes("size=1024x1536"));
    } else {
      assert.equal(sentPrompt, `prompt=${prompt}`);
      assert.ok(args.includes("model=chatgpt-image-latest"));
    }
    assert.ok(args.includes("quality=high"));
    assert.ok(args.includes("--max-time"));
    const child = new EventEmitter() as any;
    child.stdin = { end() {} }; // Never inspect or retain credentials.
    child.stdout = new EventEmitter();
    setImmediate(async () => {
      let responseImage = png;
      if (framedRequest) {
        const imageArg = args.find(arg => arg.startsWith("image=@"))!;
        const supplied = await fs.readFile(imageArg.slice("image=@".length).split(";")[0]);
        const dimensions = await sharp(supplied).metadata();
        assert.deepEqual([dimensions.width, dimensions.height], expectedCanvas);
        responseImage = await sharp(supplied).resize(1024, wrongOutputRatio ? 1024 : 1536, { fit: "fill" }).png().toBuffer();
      }
      const body = status === 200
        ? { data: [{ b64_json: responseImage.toString("base64") }], usage: {
            input_tokens_details: { image_tokens: 323, text_tokens: 1829 },
            output_tokens_details: { image_tokens: 6240, text_tokens: 1816 },
          } }
        : { error: { message: "sensitive input must never escape" } };
      await fs.writeFile(args[args.indexOf("-o") + 1], JSON.stringify(body));
      child.stdout.emit("data", String(status));
      child.emit("close", 0);
    });
    return child;
  }) as typeof childProcess.spawn;
  syncBuiltinESMExports();
  const hadConfiguredKey = !!process.env.ASTRA_API_KEY;
  if (!hadConfiguredKey) process.env.ASTRA_API_KEY = "test-fixture-no-network";
  try {
    const result = await runOpenAIImageTest(png, prompt, undefined, "high");
    assert.deepEqual(result.buffer, png);
    assert.equal(result.metrics.attempts, 1);
    assert.equal(result.metrics.quality, "high");
    assert.equal(result.metrics.costUsd, 0.229569);
    assert.equal(result.metrics.currency, "USD");
    assert.match(result.metrics.costBasis, /Not an invoice/);
    status = 403;
    await assert.rejects(runOpenAIImageTest(png, prompt, undefined, "high"), error => {
      assert.ok(error instanceof ImageTestFailure);
      assert.equal(error.metrics.attempts, 1);
      assert.equal(error.metrics.costUsd, null);
      assert.ok(!error.message.includes("sensitive"));
      return true;
    });
    assert.equal(calls, 2);
    await assert.rejects(runOpenAIImageTest(png, "x".repeat(32001)), /character limit/);
    assert.equal(calls, 2, "oversized prompt must not reach the provider");
    status = 200;
    framedRequest = true;
    const portrait = await sharp({ create: { width: 800, height: 1000, channels: 3, background: "green" } }).png().toBuffer();
    const framedResult = await runOpenAIImageTest(portrait, prompt, SUNBURST_IMAGE_MODEL, "high");
    assert.equal(framedResult.contentFrame?.height, 1000 / 1200);
    assert.deepEqual(framedResult.metrics.contentFrame, framedResult.contentFrame);
    assert.deepEqual([ (await sharp(framedResult.buffer).metadata()).width, (await sharp(framedResult.buffer).metadata()).height ], [1024, 1536]);
    await assert.rejects(runOpenAIImageTest(portrait, "x".repeat(31999), SUNBURST_IMAGE_MODEL, "high"), /character limit/);
    assert.equal(calls, 3, "full framing suffix is checked before any paid request");
    expectedCanvas = [1024, 1536];
    const refined = await runOpenAIImageTest(framedResult.buffer, prompt, SUNBURST_IMAGE_MODEL, "high", framedResult.contentFrame);
    assert.deepEqual(refined.contentFrame, framedResult.contentFrame, "known margins must not compound on refinements");
    expectedCanvas = [800, 1200];
    wrongOutputRatio = true;
    await assert.rejects(runOpenAIImageTest(portrait, prompt, SUNBURST_IMAGE_MODEL, "high"), /changed the requested canvas format/);
    assert.equal(calls, 5);
  } finally {
    if (!hadConfiguredKey) delete process.env.ASTRA_API_KEY;
    childProcess.spawn = originalSpawn;
    syncBuiltinESMExports();
  }
});
