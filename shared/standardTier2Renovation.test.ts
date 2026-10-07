import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { getAllBoligPrompts, getBoligPrompt } from "./boligPrompts";
import { composeCanonicalImagePrompt } from "./canonicalImagePrompt";
import { revisedTier2Preset, tier2RenovationScope, STANDARD_TIER2_REVISION } from "./standardTier2Renovation";
import { buildValidatedStandardImagePrompt } from "../server/standardImagePrompt";
import { assertLockFileIntegrity } from "../server/promptGuard";
import { buildPrompt, roomFlowScope, roomReviewInstructions } from "../server/room-staging";
import { IMAGE_TEST_MODEL, SUNBURST_IMAGE_MODEL } from "../server/openai-image-test";

const targets = getAllBoligPrompts().filter(p => p.tier === "tier2" && ["modern", "scandinavian"].includes(p.style));
const plan = { function: "bathroom", architecture: "Original windows and old finishes.",
  existingFurniture: "Original visible fittings.", circulation: "Keep the aisle clear.",
  layout: "Functions stay in original service zones.", uncertainties: "No dimensions." };

test("all 32 room/style choices use the appropriate complete standard renovation", () => {
  assert.equal(targets.length, 32);
  for (const p of targets) {
    const updated = revisedTier2Preset(p.prompt);
    const originalStyle = p.prompt.match(/STYLE: [\s\S]*?(?=\n\nTIER:)/)?.[0];
    assert.ok(originalStyle);
    assert.ok(updated.includes(originalStyle), `${p.style}/${p.room}: STYLE unchanged`);
    assert.ok(updated.endsWith(p.prompt.slice(p.prompt.indexOf("Apply fixed-finish"))));
    for (const model of [IMAGE_TEST_MODEL, SUNBURST_IMAGE_MODEL]) {
      assert.equal(roomFlowScope(model, p.style, p.tier, p.room), "renovation_visualization");
    }
    for (const scope of ["furnishing_only", "renovation_visualization"] as const) {
      const full = composeCanonicalImagePrompt(p.prompt, scope, "Visible original scene", "Bevar vinduerne.");
      assert.ok(full.includes(updated));
      assert.ok(full.includes(tier2RenovationScope(p.prompt)));
      assert.ok(!full.includes("EDIT SCOPE: FURNISHING ONLY."));
      assert.ok(full.includes("All common geometry, lighting, access and photographic-quality rules"));
      assert.ok(full.includes('USER WISHES: "Bevar vinduerne."'));
      assert.ok(full.length < 32000);
      if (p.room !== "bathroom") {
        assert.ok(!full.includes("standard everyday bathroom"));
        assert.ok(!full.includes("Renew the bathroom's visible"));
        assert.ok(!full.includes("a simple moisture-suitable vanity"));
      }
    }
    const standard = buildValidatedStandardImagePrompt(p.room, p.style, p.tier, "Bevar vinduerne.");
    const planned = buildPrompt({ ...plan, function: p.room }, p.room, p.style, "Bevar vinduerne.",
      ["Original finishes remain."], p.tier, "furnishing_only");
    assert.ok(standard.includes(updated));
    assert.ok(planned.includes(updated));
    assert.ok(planned.includes("OBSERVED FEATURES (old finishes and equipment are not retain instructions)"));
    assert.ok(planned.includes("Previous candidate issues: Original finishes remain."));
    assert.ok(!planned.includes("EDIT SCOPE: FURNISHING ONLY."));
  }
});

test("bathroom replacements match the user's attached wording exactly", () => {
  const submitted = fs.readFileSync("attached_assets/Pasted-Tier-2-skal-her-v-re-en-komplet-enkel-renovering-nye-ov_1791377942433.txt", "utf8");
  const blocks = submitted.split("\n").filter(line =>
    /^(EDIT SCOPE:|TIER:|ROOM-SPECIFIC TIER DETAIL:|VISIBLE STYLE-SPECIFIC SPECIFICATION:|STYLE APPLIED TO THIS ROOM:)/.test(line));
  assert.equal(blocks.length, 7);
  for (const style of ["scandinavian", "modern"]) {
    const prompt = composeCanonicalImagePrompt(getBoligPrompt("bathroom", style, "tier2"), "furnishing_only");
    for (const block of blocks.slice(0, 3)) assert.ok(prompt.includes(block));
    for (const block of blocks.slice(style === "scandinavian" ? 3 : 5, style === "scandinavian" ? 5 : 7)) {
      assert.ok(prompt.includes(block));
    }
  }
});

test("other levels/styles are not revised; legacy room aliases and automatic room selection work", () => {
  for (const p of getAllBoligPrompts().filter(p => !(p.tier === "tier2" && ["modern", "scandinavian"].includes(p.style)))) {
    assert.equal(revisedTier2Preset(p.prompt), p.prompt);
    assert.equal(tier2RenovationScope(p.prompt), "");
  }
  assert.ok(buildValidatedStandardImagePrompt("hallway", "modern", "tier2").includes("entire visible entryway"));
  assert.ok(buildPrompt(plan, "automatic", "scandinavian", "", [], "tier2").includes(STANDARD_TIER2_REVISION.bathroom.scope));
  assert.throws(() => tier2RenovationScope("ROOM FUNCTION: constructor.\nSTYLE: Moderne (modern).\nTIER: tier2."), /Missing tier2/);
  assertLockFileIntegrity();
});

test("tier2 review checks standard materials, never Exclusive material expectations", () => {
  for (const style of ["modern", "scandinavian"]) {
    const review = roomReviewInstructions("renovation_visualization", style, "tier2");
    assert.ok(review.includes("standard everyday"));
    assert.ok(review.includes("retaining the old patterned bathroom tiles, floor, bath and shower"));
    assert.ok(!review.includes("Scandinavian Exclusive"));
    assert.ok(!review.includes("graphite/selective-walnut"));
  }
});
