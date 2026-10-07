import test from "node:test";
import assert from "node:assert/strict";
import { buildPrompt, roomFlowScope, roomScopeInstructions, roomReviewInstructions, ROOM_REVIEW_REQUIREMENTS } from "./room-staging";

test("review distinguishes AI layout suggestions from binding customer and fidelity requirements", () => {
  assert.ok(ROOM_REVIEW_REQUIREMENTS.includes("NOT a customer instruction"));
  assert.ok(ROOM_REVIEW_REQUIREMENTS.includes("different sofa shape"));
  assert.ok(ROOM_REVIEW_REQUIREMENTS.includes("movable chair orientation"));
  for (const requirement of ["actual user wishes", "selected edit-scope/style contract",
    "explicitly requested functional zones", "blocked circulation",
    "protected architectural or camera change", "incomplete authorized renewal"]) {
    assert.ok(ROOM_REVIEW_REQUIREMENTS.includes(requirement), requirement);
  }
});
import { getBoligPrompt } from "../shared/boligPrompts";
import { IMAGE_TEST_MODEL, SUNBURST_IMAGE_MODEL } from "./openai-image-test";
import { MODERN_EXCLUSIVE_ROOM_APPLICATIONS, MODERN_EXCLUSIVE_RENOVATION_INVENTORIES } from "../shared/modernExclusivePrompt";
import { SCANDINAVIAN_EXCLUSIVE_BATHROOM_RENOVATION } from "../shared/scandinavianExclusiveDirection";
import fs from "node:fs";
import { revisedTier2Preset } from "../shared/standardTier2Renovation";

const plan = {
  function: "living room", architecture: "Two windows, two radiators, original wood floor.",
  existingFurniture: "None", circulation: "Keep window access.", layout: "Sofa and armchair.",
  uncertainties: "No room dimensions provided.",
};
test("planned explicit room uses the approved tier direction without weakening geometry", () => {
  for (const style of ["scandinavian", "modern", "luxury", "industrial", "coastal", "bohemian", "japandi", "minimalist", "rustic"]) {
    for (const tier of ["tier1", "tier2", "tier3"] as const) {
      const prompt = buildPrompt(plan, "living room", style, "", [], tier);
      if (style === "modern" && tier === "tier3") {
        assert.ok(prompt.startsWith("TASK: WARM CONTEMPORARY MODERN — TIER 3"));
        assert.ok(prompt.includes("SELECTED ROOM FUNCTION: living room."));
        assert.ok(!prompt.includes(getBoligPrompt("living room", style, tier)));
      } else if (tier === "tier2" && ["modern", "scandinavian"].includes(style)) {
        assert.ok(prompt.includes(revisedTier2Preset(getBoligPrompt("living room", style, tier))));
      } else {
        assert.ok(prompt.includes(getBoligPrompt("living room", style, tier)));
        assert.ok(prompt.includes(`TIER: ${tier}.`));
      }
      assert.equal(prompt.includes("EDIT SCOPE: FURNISHING ONLY."),
        !(tier === "tier2" && ["modern", "scandinavian"].includes(style)));
      assert.ok(prompt.includes("Keep the original camera position"));
    }
  }
});
test("automatic room does not masquerade as a verified room-specific tier preset", () => {
  assert.ok(buildPrompt(plan, "automatic", "japandi", "", [], "tier2").includes(getBoligPrompt("living room", "japandi", "tier2")));
  assert.throws(() => buildPrompt({ ...plan, function: "unknown" }, "automatic", "japandi", "", [], "tier2"), /PROMPT_NOT_FOUND/);
});

test("Sunburst Modern Exclusive uses full renovation for every room and correction attempt", () => {
  const scope = roomFlowScope(SUNBURST_IMAGE_MODEL, "modern", "tier3");
  assert.equal(scope, "renovation_visualization");
  for (const room of Object.keys(MODERN_EXCLUSIVE_ROOM_APPLICATIONS)) {
    for (const corrections of [[], ["Old wall tiles and floor remain unchanged."]]) {
      const prompt = buildPrompt({ ...plan, function: room }, room, "modern", "Bevar vinduerne.", corrections, "tier3", scope);
      assert.ok(prompt.includes(MODERN_EXCLUSIVE_ROOM_APPLICATIONS[room]));
      assert.ok(prompt.includes(MODERN_EXCLUSIVE_RENOVATION_INVENTORIES[room]));
      assert.ok(prompt.includes("WHOLE-ROOM RENOVATION, NOT A SINGLE-ELEMENT UPDATE."));
      assert.ok(prompt.includes("SAME ROOM AND SAME VIEWPOINT, ENTIRELY REDESIGNED AUTHORIZED CONTENTS."));
      assert.ok(prompt.includes("EVERY visible authorized item"));
      assert.ok(prompt.includes("Replace all visible existing light fixtures"));
      assert.ok(prompt.includes("ceiling finish on the same plane wherever present"));
      assert.ok(prompt.includes("Keep the original camera position, height, tilt, lens perspective"));
      assert.ok(!prompt.includes("EDIT SCOPE: FURNISHING ONLY."));
      assert.ok(prompt.includes('USER WISHES: "Bevar vinduerne."'));
      assert.ok(prompt.length <= 32000);
    }
  }
  assert.ok(buildPrompt({ ...plan, function: "bathroom" }, "automatic", "modern", "", [], "tier3", scope).includes(MODERN_EXCLUSIVE_ROOM_APPLICATIONS.bathroom));
});

test("scope rollout preserves other models, styles and lower tiers", () => {
  for (const model of [IMAGE_TEST_MODEL, SUNBURST_IMAGE_MODEL]) {
    for (const style of ["modern", "scandinavian", "luxury", "industrial", "coastal", "bohemian", "japandi", "minimalist", "rustic"]) {
      for (const tier of ["tier1", "tier2", "tier3"] as const) {
        for (const room of Object.keys(MODERN_EXCLUSIVE_ROOM_APPLICATIONS)) {
          assert.equal(roomFlowScope(model, style, tier, room),
            tier === "tier2" && ["modern", "scandinavian"].includes(style) ||
            model === SUNBURST_IMAGE_MODEL && tier === "tier3" &&
              (style === "modern" || style === "scandinavian" && room === "bathroom")
              ? "renovation_visualization" : "furnishing_only");
        }
      }
    }
  }
});

test("Sunburst Scandinavian Exclusive bathroom renews the whole room without Modern palette in review", () => {
  const scope = roomFlowScope(SUNBURST_IMAGE_MODEL, "scandinavian", "tier3", "bathroom");
  assert.equal(scope, "renovation_visualization");
  assert.equal(roomFlowScope(SUNBURST_IMAGE_MODEL, " Scandinavian ", "tier3", " Bathroom "), scope);
  for (const correction of [[], ["Original blue wall tiles, floor, bathtub and shower remain."]]) {
    const prompt = buildPrompt({ ...plan, function: "bathroom" }, "bathroom", "scandinavian", "", correction, "tier3", scope);
    assert.ok(prompt.includes(SCANDINAVIAN_EXCLUSIVE_BATHROOM_RENOVATION));
    assert.ok(!prompt.includes("EDIT SCOPE: FURNISHING ONLY."));
    assert.ok(!prompt.includes("TASK: WARM CONTEMPORARY MODERN"));
  }
  const review = roomReviewInstructions(scope, "scandinavian");
  assert.ok(review.includes("warm organic Scandinavian Exclusive"));
  assert.ok(review.includes("retaining the old patterned bathroom tiles, floor, bath and shower"));
  assert.ok(!review.includes("graphite/selective-walnut"));
  assert.ok(!review.includes("preserve fixed fittings"));
  assert.ok(review.includes("Fail for zoom, tighter crop, lost original scene area at any edge"));
});

test("planning and review permit replacements and reject the reported incomplete bathroom", () => {
  const scope = roomFlowScope(SUNBURST_IMAGE_MODEL, "modern", "tier3");
  assert.ok(roomScopeInstructions(scope).includes("old appearance is NOT protected architecture"));
  assert.ok(roomReviewInstructions(scope).includes("retaining the old patterned bathroom tiles, floor, bath and shower"));
  assert.ok(roomScopeInstructions(scope).includes("all existing ceiling lights, pendants, wall lamps"));
  assert.ok(roomScopeInstructions(scope).includes("Do not retain an item merely because it already fits"));
  assert.ok(roomReviewInstructions(scope).includes("Inspect each visible authorized category"));
  assert.ok(roomReviewInstructions(scope).includes("furniture schemes or lamps"));
  assert.ok(!roomReviewInstructions(scope).includes("preserve fixed fittings"));
  assert.ok(roomReviewInstructions("furnishing_only").includes("preserve fixed fittings"));
});

test("approved Sunburst stays high quality and alternate model controls remain administrator-only", () => {
  const source = fs.readFileSync("server/room-staging.ts", "utf8");
  assert.ok(source.includes('tier, scope), imageModel, "high")'));
  const routes = fs.readFileSync("server/routes.ts", "utf8");
  assert.ok(routes.includes("selectImageProvider({"));
  assert.ok(routes.includes('prompt, imageModel as ImageTestModel, "high"'));
  assert.ok(routes.includes("?.isAdmin === true"));
  const ui = fs.readFileSync("client/src/pages/boligpotentiale-dashboard.tsx", "utf8");
  assert.ok(ui.includes("if (!data?.enabled)"));
  assert.ok(ui.includes('fd.append("imageModel", "gpt-image-2.5-sunburst")'));
  assert.equal((ui.match(/useState<ImageProviderChoice>\("sunburst"\)/g) ?? []).length, 2);
  assert.equal(ui.includes('setImageProvider("openai")'), false, "availability must not downgrade ordinary customers");
});
