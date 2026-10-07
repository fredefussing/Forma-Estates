import test from "node:test";
import assert from "node:assert/strict";
import { canUseOpenAIImageRequest, isOpenAIRefinementSource, getOpenAIRefinementModel, selectImageProvider, isSunburstRolloutEnabled } from "./openai-refinement-policy";

const initial = {
  keyConfigured: true, rolloutEnabled: false, adminTestAllowed: true,
  hasUpload: true, hasSource: false, isRefinement: false,
  sourceIsOpenAI: false, isDesignAgent: false, hasSeason: false,
};
test("initial room/style/tier image is authorized only for tester or explicit rollout", () => {
  assert.equal(canUseOpenAIImageRequest(initial), true);
  assert.equal(canUseOpenAIImageRequest({ ...initial, adminTestAllowed: false }), false);
  assert.equal(canUseOpenAIImageRequest({ ...initial, adminTestAllowed: false, rolloutEnabled: true }), true);
  assert.equal(canUseOpenAIImageRequest({ ...initial, keyConfigured: false }), false);
  assert.equal(canUseOpenAIImageRequest({ ...initial, isDesignAgent: true }), true);
});
test("refinement follows the saved OpenAI provider, including the existing design-agent-shaped UI request", () => {
  const refinement = { ...initial, hasUpload: false, hasSource: true, isRefinement: true, sourceIsOpenAI: true, isDesignAgent: true };
  assert.equal(canUseOpenAIImageRequest(refinement), true);
  assert.equal(canUseOpenAIImageRequest({ ...refinement, sourceIsOpenAI: false }), false);
  assert.equal(canUseOpenAIImageRequest({ ...refinement, isRefinement: false }), false);
  assert.equal(canUseOpenAIImageRequest({ ...refinement, hasSeason: true }), true);
  assert.equal(canUseOpenAIImageRequest({ ...refinement, adminTestAllowed: false }), false);
  assert.equal(isOpenAIRefinementSource({ provider: "openai" }), true);
  for (const metrics of [null, {}, { provider: "collov" }, "openai"]) assert.equal(isOpenAIRefinementSource(metrics), false);
});

test("approved Sunburst rollout covers rooms, DesignAgent and seasons without changing historical refinement models", () => {
  assert.equal(isSunburstRolloutEnabled(undefined), true);
  assert.equal(isSunburstRolloutEnabled("1"), true);
  assert.equal(isSunburstRolloutEnabled("0"), false);
  const request = {
    rolloutEnabled: true, adminTestAllowed: false, requestedProvider: undefined, requestedModel: undefined,
    roomFlowRequested: false, hasSource: false, sourceIsOpenAI: false, isRefinement: false,
    isDesignAgent: false, hasSeason: false,
  };
  const room = selectImageProvider(request);
  assert.equal(room.openaiRequested, true);
  assert.equal(room.plannedRoomFlow, true);
  assert.equal(room.imageModel, "gpt-image-2.5-sunburst");
  const agent = selectImageProvider({ ...request, isDesignAgent: true });
  assert.equal(agent.openaiRequested, true);
  assert.equal(agent.plannedRoomFlow, false);
  assert.equal(agent.imageModel, room.imageModel);
  for (const sourceIsOpenAI of [false, true]) {
    const season = selectImageProvider({ ...request, hasSource: true, hasSeason: true, sourceIsOpenAI });
    assert.equal(season.sourceEdit, true);
    assert.equal(season.plannedRoomFlow, false);
    assert.equal(season.imageModel, room.imageModel);
    assert.equal(canUseOpenAIImageRequest({ ...initial, hasSource: true, hasUpload: false, hasSeason: true, sourceIsOpenAI }), true);
  }
  assert.equal(selectImageProvider({ ...request, hasSource: true, isRefinement: true }).openaiRequested, false);
  assert.equal(selectImageProvider({ ...request, requestedProvider: "collov" }).openaiRequested, true);
  assert.equal(selectImageProvider({ ...request, requestedModel: "wrong-model" }).imageModel, room.imageModel);
  assert.equal(selectImageProvider({ ...request, adminTestAllowed: true, requestedProvider: "collov" }).openaiRequested, false);
  assert.equal(selectImageProvider({ ...request, rolloutEnabled: false }).openaiRequested, false);
  assert.equal(canUseOpenAIImageRequest({ ...initial, hasSeason: true }), false, "a season requires an owned persisted source");
});

test("refinement preserves the clean master's model instead of defaulting Sunburst to another provider model", () => {
  for (const model of ["chatgpt-image-latest", "gpt-image-2.5-sunburst"]) {
    assert.equal(getOpenAIRefinementModel({ provider: "openai", model }), model);
  }
  for (const metrics of [null, {}, { provider: "openai" }, { model: "unknown-model" }]) {
    assert.throws(() => getOpenAIRefinementModel(metrics), /model kunne ikke bekræftes/);
  }
});
