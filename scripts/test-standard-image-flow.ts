import assert from "node:assert/strict";
import fs from "node:fs";
import { getAllBoligPrompts, getBoligPrompt, normalizeBoligRoom } from "../shared/boligPrompts";
import { IMAGE_PROMPT_COMMON } from "../shared/canonicalImagePrompt";
import { assertLockFileIntegrity, assertPromptLocked } from "../server/promptGuard";
import { buildValidatedStandardImagePrompt } from "../server/standardImagePrompt";

assertLockFileIntegrity();
const wishes = "det skal være en skandinavisk moderne køkken, med planter også og fede detaljer som gør dette køkken unikt";
const source = fs.readFileSync("client/src/pages/boligpotentiale-dashboard.tsx", "utf8");
function choices(name: string) {
  const match = source.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\n\\];`));
  assert.ok(match, `Missing ${name} choices`);
  return Array.from(match[1].matchAll(/value: "([^"]+)"/g), match => match[1]);
}
const rooms = choices("ROOM_TYPES");
const styles = choices("STYLES");
assert.equal(rooms.length, 16);
assert.equal(styles.length, 9);
let verified = 0;
for (const room of rooms) {
  for (const style of styles) {
    const outputs = new Set<string>();
    for (const tier of ["tier1", "tier2", "tier3"] as const) {
      const preset = getBoligPrompt(room, style, tier);
      const prompt = buildValidatedStandardImagePrompt(room, style, tier, wishes);
      const modernExclusive = style === "modern" && tier === "tier3";
      assert.equal(prompt.split(preset).length - 1, modernExclusive ? 0 : 1, "Old Modern Exclusive body must be replaced; other locked bodies stay byte-identical");
      assert.ok(prompt.includes(`USER WISHES: ${JSON.stringify(wishes)}`), "Complete wishes must reach provider");
      assert.ok(prompt.includes(modernExclusive ? "FIXED CAMERA, ARCHITECTURE AND DAYLIGHT" : IMAGE_PROMPT_COMMON.image_integrity_and_realism));
      assert.equal(prompt.match(/EDIT SCOPE:/g)?.length, 1);
      assert.ok(modernExclusive
        ? prompt.endsWith("The premium tier changes design specification and detailing; image resolution is controlled separately.")
        : prompt.endsWith(IMAGE_PROMPT_COMMON.conflict_resolution));
      outputs.add(prompt);
      verified++;
    }
    assert.equal(outputs.size, 3, "Each level must produce a distinct prompt");
  }
}
for (const alias of ["hallway", "conference_room", "home_gym", "spa_room", "open_plan_living", "living_room", " Kitchen "]) {
  assert.equal(
    buildValidatedStandardImagePrompt(alias, " Scandinavian ", "tier3", wishes),
    buildValidatedStandardImagePrompt(normalizeBoligRoom(alias), "scandinavian", "tier3", wishes),
  );
}
const preset = getBoligPrompt("kitchen", "scandinavian", "tier2");
const savedError = console.error;
try {
  console.error = () => {};
  assert.throws(() => assertPromptLocked("kitchen", "scandinavian", "tier2", `${preset}\nmodified`));
} finally {
  console.error = savedError;
}
assert.throws(() => buildValidatedStandardImagePrompt("unsupported-room", "scandinavian", "tier2"), /PROMPT_NOT_FOUND/);
assert.throws(() => buildValidatedStandardImagePrompt("kitchen", "unsupported-style", "tier2"), /PROMPT_NOT_FOUND/);
assert.equal(getAllBoligPrompts().length, 576);
console.log(`Validated all ${verified} customer room/style/level combinations, complete kitchen wishes, legacy aliases and fail-closed guards. No provider calls.`);
