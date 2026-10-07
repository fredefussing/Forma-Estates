import test from "node:test";
import assert from "node:assert/strict";
import { getOpenAIImageApiKey, getOpenAIImageAvailability } from "./openai-image-config";

test("image editing and vision share credential aliases without changing provider or model", () => {
  assert.equal(getOpenAIImageApiKey({ ASTRA_API_KEY: "fixture-preferred", OPENAI_API_KEY: "fixture-standard" }), "fixture-preferred");
  assert.equal(getOpenAIImageApiKey({ OPENAI_API_KEY: "fixture-standard" }), "fixture-standard");
  assert.equal(getOpenAIImageApiKey({ ASTRA_API_KEY: "  ", OPENAI_API_KEY: " fixture-standard " }), "fixture-standard");
  assert.equal(getOpenAIImageApiKey({}), undefined);
  assert.equal(getOpenAIImageApiKey({ ASTRA_API_KEY: " ", OPENAI_API_KEY: "" }), undefined);
});

test("customer availability distinguishes configuration failure from explicit operational pause", () => {
  assert.deepEqual(getOpenAIImageAvailability(false, {}), {
    enabled: false, roomFlowAvailable: false, availabilityReason: "missing_api_key",
  });
  for (const env of [{ ASTRA_API_KEY: "fixture" }, { OPENAI_API_KEY: "fixture" }]) {
    assert.deepEqual(getOpenAIImageAvailability(false, env), {
      enabled: false, roomFlowAvailable: true, availabilityReason: "available",
    });
    assert.deepEqual(getOpenAIImageAvailability(false, { ...env, OPENAI_ROOM_FLOW_ENABLED: "0" }), {
      enabled: false, roomFlowAvailable: false, availabilityReason: "paused",
    });
    assert.equal(getOpenAIImageAvailability(false, { ...env, OPENAI_IMAGE_TEST_ENABLED: "1", OPENAI_ROOM_FLOW_ENABLED: "0" }).roomFlowAvailable, false);
    assert.equal(getOpenAIImageAvailability(true, { ...env, OPENAI_IMAGE_TEST_ENABLED: "1", OPENAI_ROOM_FLOW_ENABLED: "0" }).roomFlowAvailable, true);
    assert.ok(!JSON.stringify(getOpenAIImageAvailability(false, env)).includes("fixture"));
  }
});
