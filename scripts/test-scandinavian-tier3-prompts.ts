import assert from "node:assert/strict";
import revision from "../shared/forma-prompts.json";
import { getAllBoligPrompts, getBoligPrompt } from "../shared/boligPrompts";
import { getRoomStylePrompt, styleVocabulary, type BudgetTier } from "../shared/styleVocabulary";
import { composeCanonicalImagePrompt, IMAGE_PROMPT_COMMON } from "../shared/canonicalImagePrompt";
import { assertLockFileIntegrity, assertPromptLocked } from "../server/promptGuard";
import { isModernExclusivePreset } from "../shared/modernExclusivePrompt";

assertLockFileIntegrity();
const presets = getAllBoligPrompts();
assert.equal(presets.length, 576);
assert.equal(new Set(presets.map(p => `${p.style}/${p.room}/${p.tier}`)).size, 576);
for (const entry of presets) {
  assert.ok(entry.prompt.trim());
  assert.equal(entry.prompt, revision.presets[`${entry.style}/${entry.room}/${entry.tier}` as keyof typeof revision.presets]);
  assertPromptLocked(entry.room, entry.style, entry.tier, entry.prompt);
  for (const scope of ["furnishing_only", "renovation_visualization"] as const) {
    const prompt = composeCanonicalImagePrompt(entry.prompt, scope, "Actual visible scene", "Tilføj flere planter");
    if (isModernExclusivePreset(entry.prompt)) {
      assert.ok(prompt.startsWith("TASK: WARM CONTEMPORARY MODERN — TIER 3"));
      assert.ok(prompt.includes(`SELECTED ROOM FUNCTION: ${entry.room}.`));
      assert.ok(!prompt.includes(entry.prompt), "Modern Exclusive must not contain the competing old body");
      assert.ok(prompt.includes("Camera, architecture, original light situation, permitted renovation scope and physical fit take priority."));
    } else {
      for (const block of [IMAGE_PROMPT_COMMON.image_integrity_and_realism, IMAGE_PROMPT_COMMON.edit_scopes[scope], entry.prompt, IMAGE_PROMPT_COMMON.conflict_resolution]) {
        assert.equal(prompt.split(block).length - 1, 1, `${entry.style}/${entry.room}/${entry.tier}: duplicate block`);
      }
      assert.ok(prompt.endsWith(IMAGE_PROMPT_COMMON.conflict_resolution));
    }
    assert.equal(prompt.match(/EDIT SCOPE:/g)?.length, 1);
    assert.ok(prompt.includes("Tilføj flere planter"));
    assert.ok(prompt.length <= 32000, "OpenAI GPT image edit prompt character limit");
    assert.ok(!prompt.includes("HIGHEST-PRIORITY FINAL CAMERA"));
  }
}
for (const [legacyKey, mapping] of Object.entries(revision.legacy_room_mappings)) {
  const [style, room, tier] = mapping.target_preset_key.split("/");
  const legacyTier = legacyKey.split("|").at(-1)!.trim() as BudgetTier;
  assert.equal(getRoomStylePrompt(style, room, legacyTier), getBoligPrompt(room, style, tier as "tier1" | "tier2" | "tier3"));
}
assert.equal(Object.keys(revision.legacy_room_mappings).length, 96);
for (const [key, mapping] of Object.entries(revision.legacy_general_mappings)) {
  const style = key.split("|")[1].trim();
  const tier = key.split("|")[2].trim() as BudgetTier;
  assert.equal(styleVocabulary[style][tier].prompt, revision.style_tier_prompts[mapping.target_style_tier_key as keyof typeof revision.style_tier_prompts]);
}
assert.equal(Object.keys(revision.legacy_general_mappings).length, 30);
for (const { room, tier } of Object.values(revision.legacy_fallback_mappings)) {
  assert.throws(() => getBoligPrompt(room, "unsupported-style", tier as "tier3"), /PROMPT_NOT_FOUND/);
}
for (const [alias, room] of Object.entries(revision.room_aliases)) {
  assert.equal(getBoligPrompt(alias, "modern", "tier3"), getBoligPrompt(room, "modern", "tier3"));
}
assert.throws(() => getBoligPrompt("living room", "scandinavian", "tier4" as "tier3"), /PROMPT_NOT_FOUND/);
console.log("Validated 576 exact presets, both scopes, 96 legacy room mappings, 30 general mappings, 16 rejected fallbacks, aliases and locks.");
