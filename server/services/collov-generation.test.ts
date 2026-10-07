import assert from "node:assert/strict";
import test from "node:test";
import {
  CollovCreditsExhaustedError,
  generateAndPersistCollovMaster,
} from "./collov-generation";

test("active Collov generation uses bounded retries and does not choose OpenAI", async () => {
  const previousKey = process.env.COLLOV_API_KEY;
  process.env.COLLOV_API_KEY = "test-only";
  let submits = 0;
  let waits = 0;
  try {
    await assert.rejects(
      generateAndPersistCollovMaster({
        uploadUrl: "https://photos.example.test/original.jpg",
        prompt: "locked prompt",
        designId: 1,
        fetcher: async () => {
          submits++;
          return new Response(JSON.stringify({ success: false, message: "temporarily unavailable" }));
        },
        sleep: async () => { waits++; },
        logger: () => {},
      }),
      /temporarily unavailable/,
    );
    assert.equal(submits, 3, "initial submit plus exactly two technical retries");
    assert.equal(waits, 2);
  } finally {
    if (previousKey === undefined) delete process.env.COLLOV_API_KEY;
    else process.env.COLLOV_API_KEY = previousKey;
  }
});

test("demo mode stops on explicit Collov credit exhaustion without retry", async () => {
  const previousKey = process.env.COLLOV_API_KEY;
  process.env.COLLOV_API_KEY = "test-only";
  let submits = 0;
  try {
    await assert.rejects(
      generateAndPersistCollovMaster({
        uploadUrl: "https://photos.example.test/original.jpg",
        prompt: "locked prompt",
        designId: 1,
        stopOnCreditExhaustion: true,
        fetcher: async () => {
          submits++;
          return new Response(JSON.stringify({
            success: false,
            code: "CREDIT_BALANCE_EXHAUSTED",
            message: "credits exhausted",
          }));
        },
        sleep: async () => {},
        logger: () => {},
      }),
      CollovCreditsExhaustedError,
    );
    assert.equal(submits, 1);
  } finally {
    if (previousKey === undefined) delete process.env.COLLOV_API_KEY;
    else process.env.COLLOV_API_KEY = previousKey;
  }
});