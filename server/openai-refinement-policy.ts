import { IMAGE_TEST_MODEL, SUNBURST_IMAGE_MODEL, type ImageTestModel } from "./openai-image-test";

/** A refinement must not silently switch the clean master's image model. */
export function getOpenAIRefinementModel(metrics: unknown): ImageTestModel {
  const model = metrics && typeof metrics === "object" ? (metrics as { model?: unknown }).model : undefined;
  if (model === IMAGE_TEST_MODEL || model === SUNBURST_IMAGE_MODEL) return model;
  throw new Error("Det oprindelige billedes model kunne ikke bekræftes. Billedet er ikke justeret.");
}

export function isOpenAIRefinementSource(metrics: unknown): boolean {
  return !!metrics && typeof metrics === "object" && (metrics as { provider?: unknown }).provider === "openai";
}

/** The approved rollout defaults on; "0" is an explicit operational pause. */
export function isSunburstRolloutEnabled(setting: string | undefined): boolean {
  return setting !== "0";
}

export function selectImageProvider(input: {
  rolloutEnabled: boolean;
  adminTestAllowed: boolean;
  requestedProvider: unknown;
  requestedModel: unknown;
  roomFlowRequested: boolean;
  hasSource: boolean;
  sourceIsOpenAI: boolean;
  isRefinement: boolean;
  isDesignAgent: boolean;
  hasSeason: boolean;
}) {
  // Historical Collov refinement chains remain on their original engine.
  const legacyRefinement = input.hasSource && input.isRefinement && !input.sourceIsOpenAI && !input.hasSeason;
  const explicitCollov = input.adminTestAllowed && input.requestedProvider === "collov";
  const explicitTest = input.adminTestAllowed && (input.requestedProvider === "openai" || input.roomFlowRequested);
  const openaiRequested = !explicitCollov && !legacyRefinement &&
    (input.rolloutEnabled || input.sourceIsOpenAI || explicitTest);
  const legacyTest = explicitTest && input.requestedProvider === "openai" && !input.roomFlowRequested;
  return {
    openaiRequested,
    plannedRoomFlow: openaiRequested && !input.hasSource && !input.isDesignAgent && !input.hasSeason && !legacyTest,
    sourceEdit: openaiRequested && input.hasSource,
    imageModel: input.adminTestAllowed && typeof input.requestedModel === "string"
      ? input.requestedModel : legacyTest ? IMAGE_TEST_MODEL : SUNBURST_IMAGE_MODEL,
  };
}

export function canUseOpenAIImageRequest(input: {
  keyConfigured: boolean;
  rolloutEnabled: boolean;
  adminTestAllowed: boolean;
  hasUpload: boolean;
  hasSource: boolean;
  isRefinement: boolean;
  sourceIsOpenAI: boolean;
  isDesignAgent: boolean;
  hasSeason: boolean;
}): boolean {
  if (!input.keyConfigured || (!input.rolloutEnabled && !input.adminTestAllowed)) return false;
  if (input.hasSource) return input.hasSeason || (input.isRefinement && input.sourceIsOpenAI);
  return input.hasUpload && !input.isRefinement && !input.hasSeason;
}
