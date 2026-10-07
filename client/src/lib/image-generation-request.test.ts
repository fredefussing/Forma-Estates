import test from "node:test";
import assert from "node:assert/strict";
import { readImageResponse, requestImageGeneration } from "./image-generation-request";

test("HTML gateway/SPA replies and malformed JSON never reach Response.json in any image flow", async () => {
  for (const status of [200, 404, 502, 503, 504]) {
    await assert.rejects(readImageResponse(new Response("<!DOCTYPE html><html>Gateway error</html>", { status })),
      error => error instanceof Error && !/Unexpected token|DOCTYPE|json.*Response/i.test(error.message));
  }
  await assert.rejects(readImageResponse(new Response("{broken")));
  assert.deepEqual(await readImageResponse(new Response('{"success":false,"message":"Quota exceeded"}')),
    { success: false, message: "Quota exceeded" });
});

test("pending and temporary HTML status replies recover with one paid POST, then deliver the final JSON or terminal error", async () => {
  const originalFetch = globalThis.fetch, timer = globalThis.setTimeout;
  globalThis.setTimeout = ((callback: () => void) => { queueMicrotask(callback); return 0; }) as any;
  try {
    for (const terminal of [200, 500]) {
      let posts = 0, polls = 0;
      globalThis.fetch = async (input, init) => {
        if (init?.method === "POST") {
          posts++;
          assert.equal((init.body as FormData).get("async"), "true");
          assert.equal((init.headers as Record<string, string>).Authorization, "Bearer fixture");
          return new Response('{"success":true,"request_id":"image-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"}', { status: 202 });
        }
        assert.match(String(input), /\/api\/bolig\/generate\/jobs\/image-/);
        polls++;
        if (polls === 1) return new Response("<!DOCTYPE html>Unavailable", { status: 504 });
        if (polls === 2) return new Response('{"success":true,"status":"pending"}', { status: 202 });
        return new Response(JSON.stringify(terminal === 200
          ? { success: true, image_url: "/uploads/fixture.jpg", generation_id: 5 }
          : { success: false, message: "Billedkontrollen fandt problemer" }), { status: terminal });
      };
      const response = await requestImageGeneration(new FormData(), "fixture");
      assert.equal(posts, 1); assert.equal(polls, 3); assert.equal(response.status, terminal);
      assert.equal((await response.json()).success, terminal === 200);
    }
  } finally { globalThis.fetch = originalFetch; globalThis.setTimeout = timer; }
});
