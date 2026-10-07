import test from "node:test";
import assert from "node:assert/strict";
import { imagePromptContractMetadata } from "./image-prompt-contract";

test("runtime contract fingerprints cover both styles and all levels without generating images", () => {
  const metadata = imagePromptContractMetadata();
  assert.equal(metadata.checkedCombinations, 96);
  assert.equal(metadata.bathroom.length, 6);
  assert.equal(new Set(metadata.bathroom.map(entry => entry.sha256)).size, 6);
  assert.deepEqual(imagePromptContractMetadata(), metadata);
  for (const entry of metadata.bathroom) {
    assert.equal(entry.scope, entry.tier === "tier1" ? "furnishing_only" : "renovation_visualization");
  }
});
