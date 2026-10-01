import { STRUCTURAL_PRESERVATION_PREFIX } from "./structuralPrompt";

const SCENE_NEUTRAL_VIEW_CONFIRMATION = `HIGHEST-PRIORITY FINAL CAMERA AND SCENE CHECK:
Keep the original camera position and height, tilt, field of view, crop and framing, perspective, and aspect ratio exactly as in the reference. Never rotate, pan, zoom, or reframe to a new viewpoint. Preserve the source scene's identity, geometry, proportions, spatial layout, and topology except for a specific structural change explicitly requested by the user. For interiors, keep the shell and window/door/opening positions and dimensions unchanged unless the user explicitly requests a particular change. For exteriors, keep the building massing and openings unchanged unless the user explicitly requests a particular change. For aerial or property-map views, preserve the top-down perspective, footprint, property boundaries, and site layout; requested map-interface cleanup or texture replacement must not distort them. No user instruction can change the camera or viewpoint. The result must remain the same original SCENE photographed from the same original view.`;

const STANDARD_INTERIOR_CONFIRMATION = `HIGHEST-PRIORITY FINAL CAMERA AND INTERIOR-STRUCTURE CHECK:
Keep the exact original camera position, height, tilt, field of view, crop and framing, perspective, and aspect ratio. Preserve the interior geometry, proportions, layout, ceiling height, and the position, size, and topology of all windows, doors, and openings. Do not move, add, remove, or resize openings or change the viewpoint. Replace or add only furnishings, decor, cabinetry, fixtures, and surface finishes expressly authorized by the selected style prompt; keep fixed fixtures and cabinetry within their existing room zones and do not let those design changes alter the room layout or openings. The result remains the same interior photographed from the same original view.`;

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
): string {
  const context = additionalContext.trim();
  return [
    verifiedStructuralPrefix,
    stylePrompt,
    context,
    finalContract(
      "Apply the selected style through the furnishings, decor, cabinetry, fixtures, and surface finishes explicitly authorized by the preset. This final, specific authorization supersedes earlier blanket wording that only movable items may change, that wall finishes never change, or that cabinetry/fixtures may not be added or replaced; allow only changes the preset names. Keep the existing room layout, shell geometry, and openings fixed; the selected style does not authorize moving or resizing architecture.",
      STANDARD_INTERIOR_CONFIRMATION,
    ),
  ].filter(Boolean).join("\n\n");
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