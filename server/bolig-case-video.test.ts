/**
 * No-provider regression tests for deterministic case-video localization identity.
 * Run with: npx tsx server/bolig-case-video.test.ts
 */

import { localizedBoligCaseVideoFilename } from "./bolig-case-video";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(`✗ ${message}`);
  console.log(`✓ ${message}`);
}

const sourceUrl = "https://fal.media/output/example.mp4?token=signed";
const retryFilename = localizedBoligCaseVideoFilename(7, 12, sourceUrl);
assert(
  retryFilename === localizedBoligCaseVideoFilename(7, 12, sourceUrl),
  "identical remote source retries resolve to the same localized filename",
);
assert(
  retryFilename !== localizedBoligCaseVideoFilename(8, 12, sourceUrl),
  "localized identity is isolated by user",
);
assert(
  retryFilename !== localizedBoligCaseVideoFilename(7, 13, sourceUrl),
  "localized identity is isolated by case",
);
assert(
  retryFilename !== localizedBoligCaseVideoFilename(7, 12, `${sourceUrl}&v=2`),
  "different original media URLs receive distinct localized filenames",
);