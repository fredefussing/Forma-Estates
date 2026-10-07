import revision from "./forma-prompts.json";
import { selectedExclusiveDirection, selectedScandinavianBathroomRenovation } from "./scandinavianExclusiveDirection";
import { buildModernExclusivePrompt, isModernExclusivePreset } from "./modernExclusivePrompt";
import { revisedTier2Preset, tier2RenovationScope } from "./standardTier2Renovation";

export type ImageEditScope = "furnishing_only" | "renovation_visualization";
export const IMAGE_PROMPT_COMMON = revision.common;

/** A–F contract: one integrity block, one scope, one exact preset, real context, wishes, conflicts. */
export function composeCanonicalImagePrompt(
  preset: string,
  scope: ImageEditScope,
  context = "",
  wishes = "",
  hasStyleReference = false,
): string {
  if (!preset.trim()) throw new Error("Missing canonical image preset");
  if (isModernExclusivePreset(preset)) {
    return buildModernExclusivePrompt(preset, scope, context, wishes, hasStyleReference);
  }
  const tier2Scope = tier2RenovationScope(preset);
  if (tier2Scope) scope = "renovation_visualization";
  return [
    IMAGE_PROMPT_COMMON.image_integrity_and_realism,
    tier2Scope || IMAGE_PROMPT_COMMON.edit_scopes[scope],
    revisedTier2Preset(preset),
    selectedExclusiveDirection(preset),
    selectedScandinavianBathroomRenovation(preset, scope),
    context.trim() ? `OBSERVED SCENE CONTEXT: ${context.trim()}` : "",
    wishes.trim() ? `USER WISHES: ${JSON.stringify(wishes.trim())}` : "",
    hasStyleReference
      ? "STYLE REFERENCE: A separate style-reference image is supplied; use its style, not its geometry."
      : "STYLE REFERENCE: No separate style reference is supplied; use the written style definition.",
    IMAGE_PROMPT_COMMON.conflict_resolution,
  ].filter(Boolean).join("\n\n");
}
