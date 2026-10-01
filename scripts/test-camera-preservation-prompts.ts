import assert from "node:assert/strict";
import fs from "node:fs";
import {
  buildSeasonalCollovPrompt,
  buildStandardCollovPrompt,
  STRUCTURAL_PRESERVATION_PREFIX,
} from "../shared/collovPrompt";
import { getBoligPrompt } from "../shared/boligPrompts";
import { buildDesignAgentInitialPrompt } from "../shared/designAgentPrompt";
import {
  buildCumulativeRefinementRequest,
  buildRefinementPrompt,
  getRefinementInputUrl,
} from "../shared/refinementPrompt";
import { assertLockFileIntegrity, assertPromptLocked, assertStructuralPrefixLocked } from "../server/promptGuard";

function assertSceneNeutralCameraContractIsFinal(prompt: string): void {
  assert.match(prompt, /camera position and height, tilt, field of view, crop and framing, perspective, and aspect ratio exactly/i);
  assert.match(prompt, /No user instruction can change the camera or viewpoint/i);
  assert.match(prompt, /For aerial or property-map views, preserve the top-down perspective, footprint, property boundaries, and site layout/i);
  assert.ok(prompt.endsWith("The result must remain the same original SCENE photographed from the same original view."));
  const finalRulesStart = prompt.lastIndexOf("HIGHEST-PRIORITY FINAL CAMERA AND SCENE CHECK:");
  assert.ok(finalRulesStart >= 0);
  const requestEnd = prompt.lastIndexOf("--- END USER REQUEST ---");
  if (requestEnd >= 0) assert.ok(finalRulesStart > requestEnd);
}

// The unchanged locked style text is wrapped by a checked structural prefix;
// explicit preset finishes/fixtures take precedence over blanket legacy rules.
assertLockFileIntegrity();
assertStructuralPrefixLocked(STRUCTURAL_PRESERVATION_PREFIX);
const lockedStylePrompt = getBoligPrompt("bathroom", "scandinavian", "tier2");
assertPromptLocked("bathroom", "scandinavian", "tier2", lockedStylePrompt);
const standardPrompt = buildStandardCollovPrompt(lockedStylePrompt, STRUCTURAL_PRESERVATION_PREFIX);
assert.ok(standardPrompt.startsWith(STRUCTURAL_PRESERVATION_PREFIX));
assert.ok(standardPrompt.includes(lockedStylePrompt));
assert.match(standardPrompt, /HIGHEST-PRIORITY FINAL CAMERA AND INTERIOR-STRUCTURE CHECK/);
assert.match(standardPrompt, /position, size, and topology of all windows, doors, and openings/);
assert.match(standardPrompt, /explicitly authorized by the preset/i);
assert.match(standardPrompt, /supersedes earlier blanket wording that only movable items may change, that wall finishes never change, or that cabinetry\/fixtures may not be added or replaced/i);
assert.match(standardPrompt, /wall tiles, and floor tiles are fully replaceable design elements/i);
assert.ok(standardPrompt.endsWith("The result remains the same interior photographed from the same original view."));

// The Agent supports explicit scene-appropriate requests for house exteriors
// and aerial map cleanup without assuming a room/furniture scene.
const exteriorRequest = "Repaint the existing house siding and replace its front door; keep the roofline and all window openings in place.";
const exteriorAgentPrompt = buildDesignAgentInitialPrompt(exteriorRequest);
assert.match(exteriorAgentPrompt, /^Edit the supplied reference image in place;/);
assert.ok(exteriorAgentPrompt.includes(`--- BEGIN USER REQUEST ---\n${exteriorRequest}\n--- END USER REQUEST ---`));
assertSceneNeutralCameraContractIsFinal(exteriorAgentPrompt);
assert.match(exteriorAgentPrompt, /For exteriors, keep the building massing and openings unchanged unless the user explicitly requests a particular change/i);
assert.ok(exteriorAgentPrompt.lastIndexOf("HIGHEST-PRIORITY FINAL CAMERA AND SCENE CHECK:") > exteriorAgentPrompt.indexOf(exteriorRequest));

const aerialRequest = "Remove map labels and UI, replace the road and grass textures, but keep the top-down view, building footprint, site layout, and property boundary.";
const aerialAgentPrompt = buildDesignAgentInitialPrompt(aerialRequest);
assert.ok(aerialAgentPrompt.includes(aerialRequest));
assertSceneNeutralCameraContractIsFinal(aerialAgentPrompt);
assert.match(aerialAgentPrompt, /requested map-interface cleanup or texture replacement must not distort them/i);
assert.match(aerialAgentPrompt, /Preserve the source scene's identity whether it shows an interior, building exterior, or aerial\/site-map view/i);

const cumulativeRequest = buildCumulativeRefinementRequest(
  ["Add a floor lamp."],
  "Remove map UI and replace the map surface texture; change to an angled camera view.",
);
const refinementPrompt = buildRefinementPrompt(cumulativeRequest);
assert.match(refinementPrompt, /PRECISION IMAGE REFINEMENT MODE/);
assert.ok(refinementPrompt.includes(cumulativeRequest));
assertSceneNeutralCameraContractIsFinal(refinementPrompt);
assert.equal(
  getRefinementInputUrl("/uploads/raw-provider-master.png", "/uploads/processed-delivery.jpg"),
  "/uploads/raw-provider-master.png",
);
assert.match(refinementPrompt, /Apply only the explicitly requested refinement/i);
assert.match(refinementPrompt, /preserve the top-down perspective, footprint, property boundaries, and site layout/i);

const seasonalPrompt = buildSeasonalCollovPrompt(
  "Refresh with spring flowers and bright daylight; update the view beyond the windows to spring foliage.",
  "Do not move, add or remove furniture.",
);
assert.ok(seasonalPrompt.includes("spring flowers"));
assert.match(seasonalPrompt, /Do not move, add or remove furniture/);
assert.match(seasonalPrompt, /Only adjust seasonal decor accents, textiles, plants, lighting mood, and the view outside the windows/i);
assert.match(seasonalPrompt, /HIGHEST-PRIORITY FINAL CAMERA AND SEASONAL-STRUCTURE CHECK/);
assert.ok(seasonalPrompt.endsWith("The result remains the same interior photographed from the same original view."));
assert.ok(!seasonalPrompt.startsWith(STRUCTURAL_PRESERVATION_PREFIX));

// Ensure provider routes use the tested assemblers and that refinement still
// selects/replays from the raw root master rather than a delivered derivative.
const routes = fs.readFileSync(new URL("../server/routes.ts", import.meta.url), "utf8");
assert.match(routes, /buildStandardCollovPrompt\([^;]*guardedPrefix\(\)/);
assert.match(routes, /buildSeasonalCollovPrompt\(SEASON_PROMPTS\[season\]\.prompt, SEASON_SUFFIX\)/);
assert.match(routes, /buildDesignAgentInitialPrompt\(userRequest\)/);
assert.match(routes, /getRefinementInputUrl\(refinementBase\.refinementSourceUrl, refinementBase\.imageUrl\)/);
assert.match(routes, /buildCumulativeRefinementRequest\(priorRefinementRequests, customPromptText\)/);
assert.match(routes, /while \(cursor\.isRefinement && cursor\.sourceImageId && !visited\.has\(cursor\.id\)\)/);
assert.match(routes, /const refinementInputUrl = getRefinementInputUrl\(refinementBase\.refinementSourceUrl, refinementBase\.imageUrl\)/);
assert.match(routes, /form\.append\("prompt", prompt\)/);

console.log("✓ Collov prompts preserve camera/viewpoint across interiors, exteriors, aerial maps, refinements, and seasonal edits.");