import assert from "node:assert/strict";
import {
  REFINEMENT_PRESERVATION_PREFIX,
  buildCumulativeRefinementRequest,
  buildRefinementPrompt,
  getRefinementInputUrl,
} from "../shared/refinementPrompt";

const requestedChange = "Replace only the dining chairs with light oak chairs.";
const prompt = buildRefinementPrompt(requestedChange);

assert.ok(prompt.startsWith(REFINEMENT_PRESERVATION_PREFIX));
assert.ok(prompt.includes(`--- BEGIN USER REQUEST ---\n${requestedChange}`));
assert.ok(prompt.endsWith("\n--- END USER REQUEST ---"));
assert.match(prompt, /NOT a new image generation/i);
assert.match(prompt, /Do not crop, zoom, pan, tilt, reframe, or reduce the image resolution/i);
assert.match(prompt, /no blur, haze, smudging/i);

assert.equal(
  getRefinementInputUrl("/uploads/refinement-source-1.jpg", "/uploads/result-1.jpg"),
  "/uploads/refinement-source-1.jpg",
);
assert.equal(
  getRefinementInputUrl(null, "/uploads/result-1.jpg"),
  "/uploads/result-1.jpg",
);

const cumulative = buildCumulativeRefinementRequest(
  ["Replace the sofa with a blue sofa.", "Add an oak coffee table."],
  "Make the sofa red instead.",
);
assert.match(cumulative, /^Apply all requested adjustments below to the clean master image\./);
assert.match(cumulative, /1\. Replace the sofa with a blue sofa\./);
assert.match(cumulative, /2\. Add an oak coffee table\./);
assert.match(cumulative, /3\. Make the sofa red instead\./);
assert.match(cumulative, /newest instruction wins/i);
assert.equal(
  buildCumulativeRefinementRequest([], "  Add one lamp.  "),
  "Add one lamp.",
);

console.log("✓ Refinement quality prompt and raw-source selection are locked.");