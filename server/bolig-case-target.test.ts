/**
 * Cheap regression coverage for case-target validation used before generation.
 * Run with: npx tsx server/bolig-case-target.test.ts
 */

import { resolveBoligCaseTarget } from "./bolig-case-target";
import type { BoligCase } from "@shared/schema";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(`✗ ${message}`);
  console.log(`✓ ${message}`);
}

const ownedCase = { id: 12, userId: 7 } as BoligCase;
let lookupCount = 0;
const getCase = async (id: number) => {
  lookupCount++;
  return id === ownedCase.id ? ownedCase : undefined;
};

const missing = await resolveBoligCaseTarget(undefined, 7, getCase);
assert(missing.kind === "unassigned", "an omitted case target remains optional");
assert(lookupCount === 0, "an omitted target does not query case storage");

for (const invalid of ["", "0", "-1", "1.5", "12abc", "9007199254740992", 0, -2, 1.5]) {
  const result = await resolveBoligCaseTarget(invalid, 7, getCase);
  assert(result.kind === "invalid", `rejects invalid case id ${JSON.stringify(invalid)}`);
}
assert(lookupCount === 0, "invalid ids are rejected before case lookup");

assert(
  (await resolveBoligCaseTarget("999", 7, getCase)).kind === "not-found",
  "returns not-found for a missing case",
);
assert(
  (await resolveBoligCaseTarget(12, 8, getCase)).kind === "forbidden",
  "returns forbidden for a case owned by another user",
);
const valid = await resolveBoligCaseTarget("12", 7, getCase);
assert(valid.kind === "valid" && valid.caseId === 12, "accepts an existing case owned by the user");