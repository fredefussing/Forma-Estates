import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { ImageGenerationJobs, type ImageJobResult } from "./image-generation-jobs";
import { buildValidatedStandardImagePrompt } from "./standardImagePrompt";
import { type BoligTier } from "../shared/boligPrompts";
import revision from "../shared/forma-prompts.json";

const turn = () => new Promise(resolve => setImmediate(resolve));
test("long image work returns a job immediately; repeated polls never repeat paid generation and are owner-scoped", async () => {
  let finish!: (result: ImageJobResult) => void;
  const delayed = new Promise<ImageJobResult>(resolve => { finish = resolve; });
  const registered: unknown[][] = [], settled: unknown[][] = [];
  let runs = 0;
  const jobs = new ImageGenerationJobs({
    register: async (...args) => { registered.push(args); },
    settle: async (...args) => { settled.push(args); },
  });
  const id = await jobs.start(10, 1, async () => { runs++; return delayed; });
  assert.match(id, /^image-/);
  await turn();
  for (let i = 0; i < 50; i++) assert.equal(jobs.get(id, 10)?.state, "pending");
  assert.equal(jobs.get(id, 11), undefined);
  assert.equal(runs, 1);
  finish({ status: 200, body: { success: true, generation_id: 123, image_url: "/uploads/result.jpg" } });
  await turn(); await turn();
  assert.equal(jobs.get(id, 10)?.result?.body.generation_id, 123);
  assert.deepEqual(registered, [[id, 10, 1]]);
  assert.deepEqual(settled, [[id, true]]);
});

test("registration errors do not start paid work; free refinements and failed jobs retain correct settlement", async () => {
  let called = false;
  const failing = new ImageGenerationJobs({ register: async () => { throw new Error("DB unavailable"); }, settle: async () => {} });
  await assert.rejects(failing.start(10, 1, async () => { called = true; return { status: 200, body: {} }; }));
  await turn();
  assert.equal(called, false);
  let refundCount: number | undefined, success: boolean | undefined;
  const jobs = new ImageGenerationJobs({
    register: async (_id, _user, count) => { refundCount = count; },
    settle: async (_id, ok) => { success = ok; },
  });
  const id = await jobs.start(10, 0, async () => ({ status: 500, body: { success: false, message: "Perspective not verified" } }));
  await turn(); await turn();
  assert.equal(refundCount, 0);
  assert.equal(success, false);
  assert.equal(jobs.get(id, 10)?.result?.status, 500);
});

test("all seven image UI paths share polling; every approved room/style/tier prompt is valid", async () => {
  const page = await fs.readFile("client/src/pages/boligpotentiale-dashboard.tsx", "utf8");
  assert.equal((page.match(/await requestImageGeneration\(fd, token\)/g) ?? []).length, 7);
  assert.equal(page.includes('fetch("/api/bolig/generate"'), false);
  const styles = new Set<string>(), rooms = new Set<string>();
  for (const key of Object.keys(revision.presets)) {
    const [style, room, tier] = key.split("/");
    styles.add(style); rooms.add(room);
    assert.ok(buildValidatedStandardImagePrompt(room, style, tier as BoligTier).length > 0, key);
  }
  assert.equal(styles.size, 12);
  assert.equal(rooms.size, 16);
});
