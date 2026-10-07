import test from "node:test";
import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import fs from "node:fs/promises";
import path from "node:path";
import { requestRoomVision } from "./room-vision";
import { prepareRoomPlan } from "./room-staging";

test("vision transport retries transient failures with bounded deadlines, preserves requests and cleans files", async () => {
  const originalSpawn = childProcess.spawn;
  const hadKey = !!process.env.ASTRA_API_KEY;
  if (!hadKey) process.env.ASTRA_API_KEY = "fixture-no-paid-network";
  const plan = { function: "bathroom", architecture: "Original window and finishes.",
    existingFurniture: "Original bath, shower, toilet and vanity.", circulation: "Clear centre aisle.",
    layout: "Preserve service zones.", uncertainties: "No dimensions." };
  const success = { choices: [{ message: { content: JSON.stringify(plan) } }], usage: { prompt_tokens: 100, completion_tokens: 90 } };
  type Reply = { exit?: number; status?: number; body?: unknown };
  let replies: Reply[] = [];
  let calls = 0;
  const temporaryDirs: string[] = [];
  const requests: unknown[] = [];
  childProcess.spawn = ((_command: string, args: string[]) => {
    calls++;
    assert.equal(_command, "curl");
    assert.equal(args[args.indexOf("--max-time") + 1], "60");
    assert.equal(args[args.indexOf("--connect-timeout") + 1], "10");
    assert.ok(args.includes("@-"), "authorization is supplied via stdin, never process arguments");
    const reply = replies.shift();
    assert.ok(reply, "no more than the planned number of attempts");
    const child = new EventEmitter() as any;
    child.stdin = new PassThrough();
    child.stdin.resume();
    child.stdout = new EventEmitter();
    child.kill = () => true;
    queueMicrotask(async () => {
      const input = args[args.indexOf("--data-binary") + 1].slice(1);
      const output = args[args.indexOf("-o") + 1];
      temporaryDirs.push(path.dirname(input));
      requests.push(JSON.parse(await fs.readFile(input, "utf8")));
      if (!reply.exit) {
        await fs.writeFile(output, typeof reply.body === "string" ? reply.body : JSON.stringify(reply.body ?? success));
      }
      child.stdout.emit("data", String(reply.status ?? 200));
      child.emit("close", reply.exit ?? 0);
    });
    return child;
  }) as typeof childProcess.spawn;
  syncBuiltinESMExports();
  try {
    const payload = { model: "fixture", messages: ["full prompt; keep all bytes"] };
    for (const first of [
      { exit: 28, status: 0 }, { exit: 7, status: 0 },
      { status: 503, body: "<html>gateway unavailable</html>" },
      { status: 429, body: { error: { code: "rate_limit_exceeded" } } },
    ]) {
      calls = 0;
      requests.length = 0;
      replies = [first, {}];
      const result = await requestRoomVision(payload, "analysis");
      assert.equal(calls, 2);
      assert.equal(result.attempts, 2);
      assert.deepEqual(requests, [payload, payload]);
      assert.deepEqual(result.body, success);
    }
    for (const status of [400, 401, 403]) {
      calls = 0;
      replies = [{ status, body: { error: { message: "sensitive provider text" } } }];
      await assert.rejects(requestRoomVision(payload, "analysis"), e => {
        assert.ok(e instanceof Error);
        assert.match(e.message, new RegExp(`HTTP ${status}`));
        assert.ok(!e.message.includes("sensitive"));
        return true;
      });
      assert.equal(calls, 1);
    }
    for (const code of ["credit_balance_exhausted", "insufficient_quota", "billing_hard_limit_reached"]) {
      calls = 0;
      replies = [{ status: 429, body: { error: { code } } }];
      await assert.rejects(requestRoomVision(payload, "analysis"), /ikke flere API-kreditter/);
      assert.equal(calls, 1);
    }
    calls = 0;
    replies = [{ exit: 28 }, { exit: 28 }];
    await assert.rejects(requestRoomVision(payload, "review"), /Billedkontrollen tog for lang tid efter to forsøg/);
    assert.equal(calls, 2);
    calls = 0;
    replies = [{ exit: 7 }, { exit: 7 }];
    await assert.rejects(requestRoomVision(payload, "analysis"), /forbindelsesfejl/);
    assert.equal(calls, 2);
    calls = 0;
    replies = [{ body: "invalid JSON", status: 200 }];
    await assert.rejects(requestRoomVision(payload, "analysis"), /ugyldigt svar/);
    assert.equal(calls, 1);

    // Exercise the actual original-photo planner, without generating a paid
    // image or falsely reporting retry costs as fully known.
    replies = [{ exit: 28 }, {}];
    const prepared = await prepareRoomPlan(
      "attached_assets/Dated_Danish_Bathroom_Before_Renovation_1791375852763.png",
      "bathroom", "", "renovation_visualization");
    assert.deepEqual(prepared.plan, plan);
    assert.equal(prepared.scope, "renovation_visualization");
    assert.equal(prepared.planning.attempts, 2);
    assert.equal(prepared.planning.usage, null, "timeout charges may be unreported");
    for (const dir of new Set(temporaryDirs)) {
      await assert.rejects(fs.access(dir), "temporary prompts/photos must be removed");
    }
  } finally {
    childProcess.spawn = originalSpawn;
    syncBuiltinESMExports();
    if (!hadKey) delete process.env.ASTRA_API_KEY;
  }
});
