import test from "node:test";
import assert from "node:assert/strict";
import { getAllBoligPrompts, getBoligPrompt } from "./boligPrompts";
import { composeCanonicalImagePrompt, IMAGE_PROMPT_COMMON } from "./canonicalImagePrompt";
import { buildModernExclusivePrompt, MODERN_EXCLUSIVE_TEMPLATE, MODERN_EXCLUSIVE_ROOM_APPLICATIONS, MODERN_EXCLUSIVE_RENOVATION_INVENTORIES } from "./modernExclusivePrompt";
import { selectedExclusiveDirection, selectedScandinavianBathroomRenovation } from "./scandinavianExclusiveDirection";
import { assertLockFileIntegrity } from "../server/promptGuard";
import { buildValidatedStandardImagePrompt } from "../server/standardImagePrompt";

test("kitchen is the requested graphite-led replacement, not a competing appended style", () => {
  assertLockFileIntegrity();
  const old = getBoligPrompt("kitchen", "modern", "tier3");
  const prompt = buildValidatedStandardImagePrompt("kitchen", "modern", "tier3");
  assert.ok(prompt.startsWith("TASK: WARM CONTEMPORARY MODERN — TIER 3"));
  assert.ok(prompt.includes("SELECTED ROOM FUNCTION: kitchen."));
  assert.ok(prompt.includes(MODERN_EXCLUSIVE_ROOM_APPLICATIONS.kitchen));
  assert.ok(prompt.includes("MATTE GRAPHITE AS THE MAIN ARCHITECTURAL CONTRAST."));
  assert.ok(prompt.includes("WALNUT AS A SELECTIVE WARM ACCENT."));
  assert.ok(prompt.includes("WARM LIGHT STONE AND SOFT MINERAL NEUTRALS."));
  assert.ok(prompt.includes("Do not merely recolour the old furnishing scheme"));
  assert.ok(!prompt.includes(old));
  assert.ok(!prompt.includes("STYLE: Moderne (modern)."));
  assert.ok(!prompt.includes("For a bathroom:"));
  // Outside the selected application and request-specific section, preserve the
  // uploaded source verbatim, including its complete camera/material/finish text.
  const sourceStart = MODERN_EXCLUSIVE_TEMPLATE.indexOf("ROOM-APPROPRIATE APPLICATION");
  const sourceEnd = MODERN_EXCLUSIVE_TEMPLATE.indexOf("TIER 3: VISIBLE DESIGN RESOLUTION");
  assert.ok(prompt.startsWith(MODERN_EXCLUSIVE_TEMPLATE.slice(0, sourceStart)));
  const sourceTail = MODERN_EXCLUSIVE_TEMPLATE.slice(sourceEnd);
  assert.ok(prompt.includes(sourceTail.split("\n\nREFERENCE AND PRIORITY")[0]));
  assert.ok(prompt.endsWith(sourceTail.slice(sourceTail.indexOf("REFERENCE AND PRIORITY"))));
});

test("all sixteen modern Exclusive rooms get their own application and the same material hierarchy", () => {
  const entries = getAllBoligPrompts().filter(p => p.style === "modern" && p.tier === "tier3");
  assert.equal(entries.length, 16);
  assert.deepEqual(Object.keys(MODERN_EXCLUSIVE_ROOM_APPLICATIONS).sort(), entries.map(p => p.room).sort());
  const wishes = 'Bevar vinduerne. Tilføj planter og detaljer; "varmt", ikke orange.';
  for (const entry of entries) {
    const prompt = buildValidatedStandardImagePrompt(entry.room, entry.style, entry.tier, wishes);
    assert.ok(prompt.includes(`SELECTED ROOM FUNCTION: ${entry.room}.`));
    assert.ok(prompt.includes(MODERN_EXCLUSIVE_ROOM_APPLICATIONS[entry.room]));
    assert.ok(prompt.includes(`USER WISHES: ${JSON.stringify(wishes)}`));
    assert.equal(prompt.match(/ROOM-APPROPRIATE APPLICATION/g)?.length, 1);
    assert.equal(prompt.match(/EDIT SCOPE:/g)?.length, 1);
    assert.ok(prompt.includes("Keep the original camera position, height, tilt, lens perspective"));
    assert.ok(prompt.includes("Do not darken the whole photograph"));
    assert.ok(prompt.includes("approximately 2700–3000 K"));
    assert.ok(prompt.length <= 32000);
    if (entry.room !== "kitchen") {
      assert.ok(!prompt.includes(MODERN_EXCLUSIVE_ROOM_APPLICATIONS.kitchen));
      assert.ok(!prompt.includes("Replace dated small decorative backsplash tiles"));
    }
  }
});

test("all other styles and levels preserve their exact previous assembled prompt", () => {
  let unchanged = 0;
  for (const entry of getAllBoligPrompts()) {
    if (entry.style === "modern" && entry.tier === "tier3") continue;
    if (entry.tier === "tier2" && ["modern", "scandinavian"].includes(entry.style)) continue;
    for (const scope of ["renovation_visualization", "furnishing_only"] as const) {
      const before = [
        IMAGE_PROMPT_COMMON.image_integrity_and_realism,
        IMAGE_PROMPT_COMMON.edit_scopes[scope],
        entry.prompt,
        selectedExclusiveDirection(entry.prompt),
        selectedScandinavianBathroomRenovation(entry.prompt, scope),
        "OBSERVED SCENE CONTEXT: Original camera",
        'USER WISHES: "Tilføj planter"',
        "STYLE REFERENCE: No separate style reference is supplied; use the written style definition.",
        IMAGE_PROMPT_COMMON.conflict_resolution,
      ].filter(Boolean).join("\n\n");
      assert.equal(composeCanonicalImagePrompt(entry.prompt, scope, "Original camera", "Tilføj planter"), before);
    }
    unchanged++;
  }
  assert.equal(unchanged, 528);
});

test("furnishing-only preserves fixed elements and never inherits renovation permissions", () => {
  for (const room of Object.keys(MODERN_EXCLUSIVE_ROOM_APPLICATIONS)) {
    const preset = getBoligPrompt(room, "modern", "tier3");
    const prompt = composeCanonicalImagePrompt(preset, "furnishing_only", "Actual scene", "", true);
    assert.ok(prompt.includes(IMAGE_PROMPT_COMMON.edit_scopes.furnishing_only));
    assert.ok(!prompt.includes("EDIT SCOPE: SURFACE AND FITTING RENOVATION"));
    assert.ok(!prompt.includes("Renew visible wall finishes"));
    assert.ok(!prompt.includes("WHOLE-ROOM RENOVATION, NOT A SINGLE-ELEMENT UPDATE."));
    assert.ok(!prompt.includes("WHOLE-ROOM CHECKLIST FOR"));
    assert.ok(!prompt.includes("SAME ROOM AND SAME VIEWPOINT, ENTIRELY REDESIGNED AUTHORIZED CONTENTS."));
    assert.ok(!prompt.includes("Replace all visible existing light fixtures"));
    assert.ok(!prompt.includes("after a cohesive premium renovation"));
    assert.ok(prompt.includes("Preserve all existing fixed finishes"));
    assert.ok(prompt.includes("Do not replace fixed decorative lighting or install concealed lighting."));
    assert.ok(prompt.includes("A separate style-reference image is supplied"));
    assert.equal(prompt.match(/EDIT SCOPE:/g)?.length, 1);
  }
});

test("kitchen requires new refrigerator and oven, not a recolour or a dated-model fallback", () => {
  const prompt = buildValidatedStandardImagePrompt("kitchen", "modern", "tier3");
  assert.ok(prompt.includes("Replace the existing refrigerator and oven"));
  assert.ok(prompt.includes("do not merely tint their old doors or preserve dated models"));
  assert.ok(prompt.includes("Keep each appliance in its existing position and footprint"));
  assert.ok(prompt.includes("do not retain the old appliance as a fallback"));
});

test("bathroom renews all visible finishes and existing fixtures, not just the vanity", () => {
  const prompt = buildValidatedStandardImagePrompt("bathroom", "modern", "tier3");
  for (const instruction of [
    "redesign the entire visible bathroom, not only the basin or vanity",
    "Replace the visible floor finish and wall tiles or wall finishes",
    "Replace the existing bathtub, shower enclosure or screen, shower fittings, toilet and taps wherever present",
    "do not preserve a dated bath or shower merely because its location must stay the same",
    "Preserve the count and functions",
  ]) assert.ok(prompt.includes(instruction), instruction);
});

test("whole-room renewal is explicit for all sixteen rooms, with no extra functions or lost retain wishes", () => {
  const rooms = Object.keys(MODERN_EXCLUSIVE_ROOM_APPLICATIONS);
  assert.deepEqual(Object.keys(MODERN_EXCLUSIVE_RENOVATION_INVENTORIES).sort(), rooms.sort());
  for (const room of rooms) {
    const prompt = buildValidatedStandardImagePrompt(room, "modern", "tier3", "Bevar det eksisterende gulv.");
    assert.ok(prompt.includes("WHOLE-ROOM RENOVATION, NOT A SINGLE-ELEMENT UPDATE."));
    assert.ok(prompt.includes("SAME ROOM AND SAME VIEWPOINT, ENTIRELY REDESIGNED AUTHORIZED CONTENTS."));
    assert.ok(prompt.includes("ceiling finish on the same plane wherever present"));
    assert.ok(prompt.includes("Replace all visible existing light fixtures"));
    assert.ok(prompt.includes("ceiling lights, pendants, wall lamps, task lights, mirror lighting and movable lamps"));
    assert.ok(prompt.includes("Keep fixed mounting points and electrical zones"));
    assert.ok(prompt.includes(`WHOLE-ROOM CHECKLIST FOR ${room}: ${MODERN_EXCLUSIVE_RENOVATION_INVENTORIES[room]}`));
    assert.ok(prompt.includes("unless the user explicitly asks to retain it"));
    assert.ok(prompt.includes("do not add missing functions or quantities"));
    assert.ok(prompt.includes('USER WISHES: "Bevar det eksisterende gulv."'));
  }
});

test("unsupported room cannot silently use another room application", () => {
  assert.throws(() => buildModernExclusivePrompt("ROOM FUNCTION: invented room.", "renovation_visualization"), /Missing approved/);
  assert.throws(() => buildModernExclusivePrompt("ROOM FUNCTION: constructor.", "renovation_visualization"), /Missing approved/);
  assert.ok(Object.isFrozen(MODERN_EXCLUSIVE_ROOM_APPLICATIONS));
});
