import revision from "./forma-prompts.json";
import metadata from "./styleMetadata.json";
import { getBoligPrompt, type BoligTier } from "./boligPrompts";

export type BudgetTier = "budget" | "standard" | "luxury";
export interface TierConfig {
  prompt: string;
  description: string;
  exampleRetailers: string[];
}
export type StyleVocabulary = Record<string, Record<BudgetTier, TierConfig>>;
export const styleVocabulary: StyleVocabulary = {};
for (const [style, tiers] of Object.entries(metadata)) {
  const configs = {} as Record<BudgetTier, TierConfig>;
  for (const tier of Object.keys(tiers) as BudgetTier[]) {
    const canonicalTier = revision.tier_aliases[tier];
    configs[tier] = {
      ...tiers[tier],
      prompt: (revision.style_tier_prompts as Record<string, string>)[`${style}/${canonicalTier}`],
    };
    if (!configs[tier].prompt) throw new Error(`Unsupported legacy style/tier: ${style}/${tier}`);
  }
  styleVocabulary[style] = configs;
}

export const roomStylePrompts: Record<string, Record<string, Record<BudgetTier, string>>> = {};
for (const [legacyKey, mapping] of Object.entries(revision.legacy_room_mappings)) {
  const [style, room, tier] = mapping.target_preset_key.split("/");
  const legacyTier = legacyKey.split("|").at(-1)!.trim() as BudgetTier;
  roomStylePrompts[style] ??= {};
  roomStylePrompts[style][room] ??= {} as Record<BudgetTier, string>;
  roomStylePrompts[style][room][legacyTier] = getBoligPrompt(room, style, tier as BoligTier);
}

export function getRoomStylePrompt(style: string, roomType: string, tier: BudgetTier): string | null {
  return getBoligPrompt(roomType, style, revision.tier_aliases[tier] as BoligTier);
}
