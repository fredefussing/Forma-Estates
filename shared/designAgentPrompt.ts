import { buildViewpointPriorityConfirmation } from "./collovPrompt";

// This profile edits the supplied image in place and supports interiors,
// exteriors, and aerial/site-map imagery without assuming a particular scene.
export const DESIGN_AGENT_INITIAL_PROMPT_PROFILE = "design-agent-scene-neutral-fixed-view-v3";
export const DESIGN_AGENT_REFINEMENT_PROMPT_PROFILE = "design-agent-refinement-scene-neutral-v3";

const DESIGN_AGENT_DETAIL_CONTRACT = `Edit the supplied reference image in place; do not generate a different scene or assume that the image is an interior. Preserve the source scene's identity whether it shows an interior, building exterior, or aerial/site-map view. Make only the scene-appropriate changes explicitly requested by the user, which may include furnishings, fixtures, cabinetry, surface materials or finishes, exterior details, or map-interface cleanup and texture replacement. Keep unrequested scene content unchanged and do not invent unrelated structures or features. Render the requested edits with sharp, realistic, high-detail photographic quality appropriate to the source image.

--- BEGIN USER REQUEST ---
`;

export function buildDesignAgentInitialPrompt(userRequest: string): string {
  return DESIGN_AGENT_DETAIL_CONTRACT +
    userRequest.trim().replace(/--- END USER REQUEST ---/gi, "— END USER REQUEST —") +
    "\n--- END USER REQUEST ---\n\n" +
    buildViewpointPriorityConfirmation(
      "Apply only the explicit, scene-appropriate changes requested by the user; requested surface, fixture, exterior-detail, or map cleanup/texture edits are allowed. Do not invent a different scene or make unrelated changes.",
    );
}