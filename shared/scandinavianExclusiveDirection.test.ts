import assert from "node:assert/strict";
import test from "node:test";
import { getAllBoligPrompts } from "./boligPrompts";
import { composeCanonicalImagePrompt, IMAGE_PROMPT_COMMON } from "./canonicalImagePrompt";
import { SCANDINAVIAN_EXCLUSIVE_DIRECTION, SCANDINAVIAN_EXCLUSIVE_BATHROOM_RENOVATION } from "./scandinavianExclusiveDirection";
import { isModernExclusivePreset } from "./modernExclusivePrompt";
import { tier2RenovationProfile } from "./standardTier2Renovation";

test("the approved warm-organic direction applies only to all sixteen Scandinavian Exclusive rooms", () => {
  let affected = 0;
  for (const entry of getAllBoligPrompts()) {
    const result = composeCanonicalImagePrompt(entry.prompt, "renovation_visualization", "", "Tilføj planter");
    const expected = entry.style === "scandinavian" && entry.tier === "tier3";
    assert.equal(result.includes(SCANDINAVIAN_EXCLUSIVE_DIRECTION), expected);
    assert.equal(result.split(entry.prompt).length - 1, isModernExclusivePreset(entry.prompt) || tier2RenovationProfile(entry.prompt) ? 0 : 1);
    if (!isModernExclusivePreset(entry.prompt)) assert.ok(result.endsWith(IMAGE_PROMPT_COMMON.conflict_resolution));
    assert.ok(result.includes("Tilføj planter"));
    if (expected) affected++;
  }
  assert.equal(affected, 16);
});

test("complete Scandinavian bathroom renovation applies only to bathroom Exclusive renovation, never staging", () => {
  let affected = 0;
  for (const entry of getAllBoligPrompts()) {
    for (const scope of ["renovation_visualization", "furnishing_only"] as const) {
      const result = composeCanonicalImagePrompt(entry.prompt, scope, "Original scene", "Bevar vinduerne.");
      const expected = scope === "renovation_visualization" && entry.room === "bathroom" &&
        entry.style === "scandinavian" && entry.tier === "tier3";
      assert.equal(result.includes(SCANDINAVIAN_EXCLUSIVE_BATHROOM_RENOVATION), expected);
      assert.ok(result.length <= 32000);
      if (expected) {
        affected++;
        assert.ok(result.includes("ALL wall tiles and wall finishes"));
        assert.ok(result.includes("existing bathtub, its surround or apron, shower enclosure or screen"));
        assert.ok(result.includes("shower tray where present, shower fittings, toilet"));
        assert.ok(result.includes("all visible existing ceiling/wall/task/mirror light fixtures"));
        assert.ok(result.includes("moisture-suitable walnut-toned vanity accents"));
        assert.ok(result.includes("Keep the original camera position"));
        assert.ok(result.includes('USER WISHES: "Bevar vinduerne."'));
      }
    }
  }
  assert.equal(affected, 1);
});
