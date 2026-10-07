import { getBoligPrompt, normalizeBoligRoom, type BoligTier } from "../shared/boligPrompts";
import { buildStandardCollovPrompt, STRUCTURAL_PRESERVATION_PREFIX } from "../shared/collovPrompt";
import { assertPromptLocked, assertStructuralPrefixLocked } from "./promptGuard";

/** Verify the immutable preset first; append request-specific wishes afterwards. */
export function buildValidatedStandardImagePrompt(
  room: string,
  style: string,
  tier: BoligTier,
  wishes = "",
): string {
  const normalizedRoom = normalizeBoligRoom(room);
  const preset = getBoligPrompt(normalizedRoom, style, tier);
  assertPromptLocked(normalizedRoom, style, tier, preset);
  assertStructuralPrefixLocked(STRUCTURAL_PRESERVATION_PREFIX);
  return buildStandardCollovPrompt(
    preset, STRUCTURAL_PRESERVATION_PREFIX, "", "renovation_visualization", wishes,
  );
}
