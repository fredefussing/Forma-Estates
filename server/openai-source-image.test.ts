import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadOwnedOpenAIImage } from "./openai-source-image";

test("owned refinement master loads losslessly and rejects traversal before any external download", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "forma-owned-master-test-"));
  const bytes = Buffer.from("synthetic-master-fixture");
  try {
    await fs.writeFile(path.join(dir, "master.png"), bytes);
    assert.deepEqual(await loadOwnedOpenAIImage("/uploads/master.png", dir), bytes);
    for (const url of ["/uploads/../private.png", "/uploads/%2e%2e%2fprivate.png", "/uploads/a%5cb.png", "/uploads/a%00.png"]) {
      await assert.rejects(loadOwnedOpenAIImage(url, dir), /Invalid stored image path/);
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
