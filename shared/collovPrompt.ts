import { STRUCTURAL_PRESERVATION_PREFIX } from "./structuralPrompt";
import { composeCanonicalImagePrompt, type ImageEditScope } from "./canonicalImagePrompt";

const SCENE_NEUTRAL_VIEW_CONFIRMATION = `HIGHEST-PRIORITY FINAL CAMERA AND SCENE CHECK:
Keep the original camera position and height, tilt, field of view, crop and framing, perspective, and aspect ratio exactly as in the reference. Never rotate, pan, zoom, or reframe to a new viewpoint. Preserve the source scene's identity, geometry, proportions, spatial layout, and topology except for a specific structural change explicitly requested by the user. For interiors, keep the shell and window/door/opening positions and dimensions unchanged unless the user explicitly requests a particular change. For exteriors, keep the building massing and openings unchanged unless the user explicitly requests a particular change. For aerial or property-map views, preserve the top-down perspective, footprint, property boundaries, and site layout; requested map-interface cleanup or texture replacement must not distort them. No user instruction can change the camera or viewpoint. The result must remain the same original SCENE photographed from the same original view.`;

const SEASONAL_INTERIOR_CONFIRMATION = `HIGHEST-PRIORITY FINAL CAMERA AND SEASONAL-STRUCTURE CHECK:
Keep the exact original camera position, height, tilt, field of view, crop and framing, perspective, and aspect ratio. Preserve the interior geometry, proportions, layout, walls, floors, windows, doors, and all architectural features. Do not move, add, or remove furniture or change the viewpoint. The result remains the same interior photographed from the same original view.`;

function finalContract(changeScope: string, confirmation = SCENE_NEUTRAL_VIEW_CONFIRMATION): string {
  return `${changeScope}\n\n${confirmation}`;
}

export function buildViewpointPriorityConfirmation(changeScope: string): string {
  return finalContract(changeScope);
}

/**
 * Assemble the exact prompt sent for standard Collov virtual-staging edits.
 * Callers must pass the result of their structural-prefix integrity check.
 */
export function buildStandardCollovPrompt(
  stylePrompt: string,
  verifiedStructuralPrefix: string,
  additionalContext = "",
  scope: ImageEditScope = "renovation_visualization",
  wishes = "",
): string {
  // Keep the legacy guard at call sites, not its contradictory text in migrated calls.
  if (verifiedStructuralPrefix !== STRUCTURAL_PRESERVATION_PREFIX) throw new Error("Unverified structural prefix");
  return composeCanonicalImagePrompt(stylePrompt, scope, additionalContext, wishes);
}

/** Assemble the season-specific edit, which intentionally has narrower changes than staging. */
export function buildSeasonalCollovPrompt(seasonPrompt: string, seasonRules: string): string {
  return [
    seasonPrompt.trim(),
    seasonRules.trim(),
    finalContract(
      "For this seasonal update, keep all existing furniture, layout, walls, floors, windows, doors, and architectural features unchanged. Only adjust seasonal decor accents, textiles, plants, lighting mood, and the view outside the windows.",
      SEASONAL_INTERIOR_CONFIRMATION,
    ),
  ].filter(Boolean).join("\n\n");
}

/** Re-export the source constant for offline assembly tests and callers that need it. */
export { STRUCTURAL_PRESERVATION_PREFIX };