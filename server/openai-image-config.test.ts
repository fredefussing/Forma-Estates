import test from "node:test";
import assert from "node:assert/strict";
import { getOpenAIImageApiKey, getOpenAIImageAvailability } from "./openai-image-config";

test("image editing and vision use only the approved ASTRA credential, never another OpenAI account", () => {
  assert.equal(getOpenAIImageApiKey({ ASTRA_API_KEY: "fixture-preferred", OPENAI_API_KEY: "fixture-standard" }), "fixture-preferred");
  assert.equal(getOpenAIImageApiKey({ OPENAI_API_KEY: "fixture-standard" }), undefined);
  assert.equal(getOpenAIImageApiKey({ ASTRA_API_KEY: "  ", OPENAI_API_KEY: " fixture-standard " }), undefined);
  assert.equal(getOpenAIImageApiKey({ ASTRA_API_KEY: " fixture-preferred " }), "fixture-preferred");
  assert.equal(getOpenAIImageApiKey({}), undefined);
  assert.equal(getOpenAIImageApiKey({ ASTRA_API_KEY: " ", OPENAI_API_KEY: "" }), undefined);
});

test("customer availability distinguishes configuration failure from explicit operational pause", () => {
  assert.deepEqual(getOpenAIImageAvailability(false, {}), {
    enabled: false, roomFlowAvailable: false, credentialSource: null, availabilityReason: "missing_api_key",
  });
  for (const isAdmin of [false, true]) {
    assert.deepEqual(getOpenAIImageAvailability(isAdmin, { OPENAI_API_KEY: "fixture", OPENAI_IMAGE_TEST_ENABLED: "1" }), {
      enabled: false, roomFlowAvailable: false, credentialSource: null, availabilityReason: "missing_api_key",
    });
  }
  for (const env of [{ ASTRA_API_KEY: "fixture" }, { ASTRA_API_KEY: "fixture", OPENAI_API_KEY: "different-fixture" }]) {
    assert.deepEqual(getOpenAIImageAvailability(false, env), {
      enabled: false, roomFlowAvailable: true, credentialSource: "ASTRA_API_KEY", availabilityReason: "available",
    });
    assert.deepEqual(getOpenAIImageAvailability(false, { ...env, OPENAI_ROOM_FLOW_ENABLED: "0" }), {
      enabled: false, roomFlowAvailable: false, credentialSource: "ASTRA_API_KEY", availabilityReason: "paused",
    });
    assert.equal(getOpenAIImageAvailability(false, { ...env, OPENAI_IMAGE_TEST_ENABLED: "1", OPENAI_ROOM_FLOW_ENABLED: "0" }).roomFlowAvailable, false);
    assert.equal(getOpenAIImageAvailability(true, { ...env, OPENAI_IMAGE_TEST_ENABLED: "1", OPENAI_ROOM_FLOW_ENABLED: "0" }).roomFlowAvailable, true);
    assert.ok(!JSON.stringify(getOpenAIImageAvailability(false, env)).includes("fixture"));
  }
});
