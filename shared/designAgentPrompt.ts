// The approved visual benchmark uses a direct, concise furnishing prompt.
// Keep the Agent equally direct while retaining its free-form user request.
export const DESIGN_AGENT_INITIAL_PROMPT_PROFILE = "design-agent-direct-quality-v1";
export const DESIGN_AGENT_REFINEMENT_PROMPT_PROFILE = "design-agent-refinement-v1";

const DESIGN_AGENT_DETAIL_CONTRACT = `Completely redesign this interior according to the user's request. Create a coherent, thoughtfully designed furnishing scheme with quality craftsmanship and realistic materials. Render visible wood grain, fabric weave, rug fibres, leather texture, stone and marble veining, metal finish, glass reflections, and natural shadow detail with photographic clarity. Keep the result sharp, natural, warm, and highly detailed. Replace existing furniture and decor as needed. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint.

User request: `;

export function buildDesignAgentInitialPrompt(userRequest: string): string {
  return DESIGN_AGENT_DETAIL_CONTRACT + userRequest.trim();
}