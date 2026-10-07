// Compatibility export for offline scripts, not a separate styling override.
import revision from "./forma-prompts.json";
import { getBoligPrompt } from "./boligPrompts";
export const SCANDINAVIAN_TIER3_BACKGROUND = revision.style_tier_prompts["scandinavian/tier3"];
export function buildScandinavianTier3Prompt(room?: string): string {
  return room && room !== "automatic"
    ? getBoligPrompt(room, "scandinavian", "tier3")
    : SCANDINAVIAN_TIER3_BACKGROUND;
}
