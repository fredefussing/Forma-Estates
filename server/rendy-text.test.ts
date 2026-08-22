/**
 * Smoke tests for Rendy text layer validation and ASS render argument safety.
 * Run with: npx tsx server/rendy-text.test.ts
 *
 * No database, no external services — pure logic tests only.
 */

import {
  RENDY_TYPOGRAPHY_PRESETS,
  RENDY_TYPOGRAPHY_PRESET_IDS,
  DEFAULT_HEADLINE_SETTINGS,
  DEFAULT_CAPTION_STYLE,
  isRendyTypographyId,
  HEADLINE_SIZE_MIN,
  HEADLINE_SIZE_MAX,
  HEADLINE_POSITION_MIN,
  HEADLINE_POSITION_MAX_X,
  HEADLINE_POSITION_MAX_Y,
  CAPTION_SIZE_MIN,
  CAPTION_SIZE_MAX,
  HEADLINE_TEXT_ASS_COLOR,
  headlineOpacityAtTime,
} from "../shared/rendy-text";
import { buildCombinedAss } from "./rendy-voiceover";
import type { CaptionSegment } from "./rendy-voiceover";
import {
  buildAssHeadline,
  buildCleanEditRenderArgs,
  buildHeadlineOverlayArgs,
  cleanEditDuration,
  isLegacyShortTransitionError,
  renderBoundsForCandidate,
  transitionDurationForClips,
} from "./rendy-editor";

// ── Minimal test harness ──────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ ${message}`);
    failed++;
  }
}

function assertThrows(fn: () => unknown, substring: string, label: string): void {
  try {
    fn();
    console.error(`  ✗ ${label} — expected throw but did not throw`);
    failed++;
  } catch (e: any) {
    if (typeof e?.message === "string" && e.message.includes(substring)) {
      console.log(`  ✓ ${label}`);
      passed++;
    } else {
      console.error(`  ✗ ${label} — threw but message "${e?.message}" did not include "${substring}"`);
      failed++;
    }
  }
}

// ── Import private helpers via re-export trick ────────────────────────────────
// We test the pure logic helpers by re-implementing a minimal version here,
// validating the shared contract rather than the server internals (which have
// DB dependencies). The actual server code is covered by TypeScript type-checking.

// ── Shared contract tests ─────────────────────────────────────────────────────

console.log("\n[1] RENDY_TYPOGRAPHY_PRESETS contract");
assert(RENDY_TYPOGRAPHY_PRESETS.length === 10, "exactly 10 presets");
for (const preset of RENDY_TYPOGRAPHY_PRESETS) {
  assert(typeof preset.id === "string" && preset.id.length > 0, `preset ${preset.id}: has id`);
  assert(typeof preset.assFontName === "string" && preset.assFontName.length > 0, `preset ${preset.id}: has assFontName`);
  assert(typeof preset.assSpacing === "number" && preset.assSpacing >= 0, `preset ${preset.id}: assSpacing >= 0`);
  assert(typeof preset.fontFile === "string" && preset.fontFile.length > 0, `preset ${preset.id}: has fontFile`);
  assert(
    preset.fontFile === "CormorantGaramond-Regular.ttf" ||
    preset.fontFile === "CormorantGaramond-SemiBold.ttf" ||
    preset.fontFile === "Inter-Regular.otf" ||
    preset.fontFile === "Inter-Bold.otf",
    `preset ${preset.id}: fontFile is a bundled font`
  );
  assert(preset.assBold === 0 || preset.assBold === -1 || preset.assBold === 1, `preset ${preset.id}: assBold valid`);
  assert(preset.assItalic === 0 || preset.assItalic === -1 || preset.assItalic === 1, `preset ${preset.id}: assItalic valid`);
}

console.log("\n[2] isRendyTypographyId guard");
assert(isRendyTypographyId("cormorant-regular"), "cormorant-regular is valid");
assert(isRendyTypographyId("inter-bold"), "inter-bold is valid");
assert(!isRendyTypographyId("comic-sans"), "comic-sans is not valid");
assert(!isRendyTypographyId(""), "empty string is not valid");
assert(!isRendyTypographyId(null), "null is not valid");
assert(!isRendyTypographyId(42), "number is not valid");
assert(!isRendyTypographyId(undefined), "undefined is not valid");
// All IDs in the union must resolve
for (const id of RENDY_TYPOGRAPHY_PRESET_IDS) {
  assert(isRendyTypographyId(id), `RENDY_TYPOGRAPHY_PRESET_IDS member "${id}" resolves`);
}

console.log("\n[3] DEFAULT_HEADLINE_SETTINGS shape");
assert(DEFAULT_HEADLINE_SETTINGS.enabled === false, "default headline disabled");
assert(DEFAULT_HEADLINE_SETTINGS.text === "", "default headline text empty");
assert(isRendyTypographyId(DEFAULT_HEADLINE_SETTINGS.fontId), "default headline fontId is valid");
assert(DEFAULT_HEADLINE_SETTINGS.size >= 0.03 && DEFAULT_HEADLINE_SETTINGS.size <= 0.18, "default headline size in range");
assert(DEFAULT_HEADLINE_SETTINGS.x >= 0.05 && DEFAULT_HEADLINE_SETTINGS.x <= 0.95, "default headline x in safe zone");
assert(DEFAULT_HEADLINE_SETTINGS.y >= 0.05 && DEFAULT_HEADLINE_SETTINGS.y <= 0.92, "default headline y in safe zone");
assert(DEFAULT_HEADLINE_SETTINGS.start === 0, "default headline start = 0");
assert(DEFAULT_HEADLINE_SETTINGS.end === 4, "default headline end = 4");
assert(DEFAULT_HEADLINE_SETTINGS.end > DEFAULT_HEADLINE_SETTINGS.start, "default end > start");

console.log("\n[4] DEFAULT_CAPTION_STYLE shape");
assert(isRendyTypographyId(DEFAULT_CAPTION_STYLE.fontId), "default caption fontId is valid");
assert(DEFAULT_CAPTION_STYLE.size >= 0.03 && DEFAULT_CAPTION_STYLE.size <= 0.10, "default caption size in range");
assert(
  DEFAULT_CAPTION_STYLE.contrast === "shadow" || DEFAULT_CAPTION_STYLE.contrast === "box" || DEFAULT_CAPTION_STYLE.contrast === "outline",
  "default caption contrast is valid"
);
assert(
  DEFAULT_CAPTION_STYLE.position === "high" || DEFAULT_CAPTION_STYLE.position === "center" || DEFAULT_CAPTION_STYLE.position === "low",
  "default caption position is valid"
);

console.log("\n[5] ASS time formatter (inline)");
function secondsToAssTime(s: number): string {
  const totalCentiseconds = Math.max(0, Math.round(s * 100));
  const h = Math.floor(totalCentiseconds / 360_000);
  const m = Math.floor((totalCentiseconds % 360_000) / 6_000);
  const sec = Math.floor((totalCentiseconds % 6_000) / 100);
  const frac = totalCentiseconds % 100;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(frac).padStart(2, "0")}`;
}
assert(secondsToAssTime(0) === "0:00:00.00", "0s → 0:00:00.00");
assert(secondsToAssTime(1.5) === "0:00:01.50", "1.5s → 0:00:01.50");
assert(secondsToAssTime(61.04) === "0:01:01.04", "61.04s → 0:01:01.04");
assert(secondsToAssTime(-5) === "0:00:00.00", "negative clamped to 0");
assert(secondsToAssTime(3600) === "1:00:00.00", "3600s → 1:00:00.00");

console.log("\n[6] Headline validation logic (inline mirror)");
const VALID_IDS = new Set(RENDY_TYPOGRAPHY_PRESET_IDS as readonly string[]);

function validateHeadline(raw: unknown): boolean {
  if (raw === null || raw === undefined) return true; // null = clear to default
  if (typeof raw !== "object" || Array.isArray(raw)) throw new Error("not an object");
  const h = raw as Record<string, unknown>;
  if (typeof h.enabled !== "boolean") throw new Error("enabled not boolean");
  if (typeof h.text !== "string") throw new Error("text not string");
  if ((h.text as string).length > 120) throw new Error("text too long");
  if (!VALID_IDS.has(h.fontId as string)) throw new Error("invalid fontId");
  const size = Number(h.size);
  if (!isFinite(size) || size < 0.03 || size > 0.18) throw new Error("size out of range");
  const x = Number(h.x);
  if (!isFinite(x) || x < 0.05 || x > 0.95) throw new Error("x out of safe zone");
  const y = Number(h.y);
  if (!isFinite(y) || y < 0.05 || y > 0.92) throw new Error("y out of safe zone");
  const start = Number(h.start);
  if (!isFinite(start) || start < 0 || start > 1800) throw new Error("start out of range");
  const end = Number(h.end);
  if (!isFinite(end) || end <= start || end > 1800) throw new Error("end invalid");
  return true;
}

assert(validateHeadline(null) === true, "null headline accepted (clear to default)");
assert(validateHeadline(undefined) === true, "undefined headline accepted");
assert(validateHeadline({ enabled: true, text: "Hello", fontId: "inter-bold", size: 0.08, x: 0.5, y: 0.18, start: 0, end: 4 }) === true, "valid headline accepted");
assertThrows(() => validateHeadline("string"), "not an object", "string headline rejected");
assertThrows(() => validateHeadline({ enabled: "yes", text: "", fontId: "inter-bold", size: 0.08, x: 0.5, y: 0.18, start: 0, end: 4 }), "enabled not boolean", "non-boolean enabled rejected");
assertThrows(() => validateHeadline({ enabled: true, text: "x".repeat(121), fontId: "inter-bold", size: 0.08, x: 0.5, y: 0.18, start: 0, end: 4 }), "text too long", "121-char text rejected");
assertThrows(() => validateHeadline({ enabled: true, text: "", fontId: "comic-sans", size: 0.08, x: 0.5, y: 0.18, start: 0, end: 4 }), "invalid fontId", "non-allowlisted font rejected");
assertThrows(() => validateHeadline({ enabled: true, text: "", fontId: "inter-bold", size: 0.02, x: 0.5, y: 0.18, start: 0, end: 4 }), "size out of range", "size 0.02 rejected");
assertThrows(() => validateHeadline({ enabled: true, text: "", fontId: "inter-bold", size: 0.19, x: 0.5, y: 0.18, start: 0, end: 4 }), "size out of range", "size 0.19 rejected");
assertThrows(() => validateHeadline({ enabled: true, text: "", fontId: "inter-bold", size: 0.08, x: 0.04, y: 0.18, start: 0, end: 4 }), "x out of safe zone", "x=0.04 rejected (outside safe zone)");
assertThrows(() => validateHeadline({ enabled: true, text: "", fontId: "inter-bold", size: 0.08, x: 0.5, y: 0.93, start: 0, end: 4 }), "y out of safe zone", "y=0.93 rejected (outside safe zone)");
assertThrows(() => validateHeadline({ enabled: true, text: "", fontId: "inter-bold", size: 0.08, x: 0.5, y: 0.18, start: 0, end: 0 }), "end invalid", "end=start rejected");
assertThrows(() => validateHeadline({ enabled: true, text: "", fontId: "inter-bold", size: 0.08, x: 0.5, y: 0.18, start: 5, end: 3 }), "end invalid", "end < start rejected");
assertThrows(() => validateHeadline({ enabled: true, text: "", fontId: "inter-bold", size: 0.08, x: 0.5, y: 0.18, start: 0, end: 1801 }), "end invalid", "end > 1800 rejected");
assertThrows(() => validateHeadline({ enabled: true, text: "", fontId: "inter-bold", size: NaN, x: 0.5, y: 0.18, start: 0, end: 4 }), "size out of range", "NaN size rejected");

console.log("\n[7] Caption style validation logic (inline mirror)");
function validateCaptionStyle(raw: unknown): boolean {
  if (raw === null || raw === undefined) return true;
  if (typeof raw !== "object" || Array.isArray(raw)) throw new Error("not an object");
  const cs = raw as Record<string, unknown>;
  if (!VALID_IDS.has(cs.fontId as string)) throw new Error("invalid fontId");
  const size = Number(cs.size);
  if (!isFinite(size) || size < 0.03 || size > 0.10) throw new Error("size out of range");
  if (!["shadow", "box", "outline"].includes(cs.contrast as string)) throw new Error("invalid contrast");
  if (!["high", "center", "low"].includes(cs.position as string)) throw new Error("invalid position");
  return true;
}

assert(validateCaptionStyle(null) === true, "null captionStyle accepted (reset to default)");
assert(validateCaptionStyle({ fontId: "inter-regular", size: 0.04, contrast: "shadow", position: "low" }) === true, "valid caption style accepted");
assertThrows(() => validateCaptionStyle({ fontId: "comic-sans", size: 0.04, contrast: "shadow", position: "low" }), "invalid fontId", "non-allowlisted font rejected");
assertThrows(() => validateCaptionStyle({ fontId: "inter-regular", size: 0.11, contrast: "shadow", position: "low" }), "size out of range", "size 0.11 rejected for caption");
assertThrows(() => validateCaptionStyle({ fontId: "inter-regular", size: 0.04, contrast: "glow", position: "low" }), "invalid contrast", "'glow' contrast rejected");
assertThrows(() => validateCaptionStyle({ fontId: "inter-regular", size: 0.04, contrast: "shadow", position: "floating" }), "invalid position", "'floating' position rejected");

console.log("\n[8] Numeric bounds constants");
assert(HEADLINE_SIZE_MIN === 0.03, `HEADLINE_SIZE_MIN = 0.03 (got ${HEADLINE_SIZE_MIN})`);
assert(HEADLINE_SIZE_MAX === 0.18, `HEADLINE_SIZE_MAX = 0.18 (got ${HEADLINE_SIZE_MAX})`);
assert(HEADLINE_POSITION_MIN === 0.05, `HEADLINE_POSITION_MIN = 0.05 (got ${HEADLINE_POSITION_MIN})`);
assert(HEADLINE_POSITION_MAX_X === 0.95, `HEADLINE_POSITION_MAX_X = 0.95 (got ${HEADLINE_POSITION_MAX_X})`);
assert(HEADLINE_POSITION_MAX_Y === 0.92, `HEADLINE_POSITION_MAX_Y = 0.92 (got ${HEADLINE_POSITION_MAX_Y})`);
assert(CAPTION_SIZE_MIN === 0.03, `CAPTION_SIZE_MIN = 0.03 (got ${CAPTION_SIZE_MIN})`);
assert(CAPTION_SIZE_MAX === 0.10, `CAPTION_SIZE_MAX = 0.10 (got ${CAPTION_SIZE_MAX})`);
// Bounds are internally consistent
assert(HEADLINE_SIZE_MIN < HEADLINE_SIZE_MAX, "HEADLINE_SIZE_MIN < HEADLINE_SIZE_MAX");
assert(CAPTION_SIZE_MIN < CAPTION_SIZE_MAX, "CAPTION_SIZE_MIN < CAPTION_SIZE_MAX");
assert(HEADLINE_POSITION_MIN < HEADLINE_POSITION_MAX_X, "HEADLINE_POSITION_MIN < HEADLINE_POSITION_MAX_X");
assert(HEADLINE_POSITION_MIN < HEADLINE_POSITION_MAX_Y, "HEADLINE_POSITION_MIN < HEADLINE_POSITION_MAX_Y");
// Default values must lie within bounds
assert(
  DEFAULT_HEADLINE_SETTINGS.size >= HEADLINE_SIZE_MIN && DEFAULT_HEADLINE_SETTINGS.size <= HEADLINE_SIZE_MAX,
  `DEFAULT_HEADLINE_SETTINGS.size in [${HEADLINE_SIZE_MIN}, ${HEADLINE_SIZE_MAX}]`,
);
assert(
  DEFAULT_HEADLINE_SETTINGS.x >= HEADLINE_POSITION_MIN && DEFAULT_HEADLINE_SETTINGS.x <= HEADLINE_POSITION_MAX_X,
  `DEFAULT_HEADLINE_SETTINGS.x in [${HEADLINE_POSITION_MIN}, ${HEADLINE_POSITION_MAX_X}]`,
);
assert(
  DEFAULT_HEADLINE_SETTINGS.y >= HEADLINE_POSITION_MIN && DEFAULT_HEADLINE_SETTINGS.y <= HEADLINE_POSITION_MAX_Y,
  `DEFAULT_HEADLINE_SETTINGS.y in [${HEADLINE_POSITION_MIN}, ${HEADLINE_POSITION_MAX_Y}]`,
);
assert(
  DEFAULT_CAPTION_STYLE.size >= CAPTION_SIZE_MIN && DEFAULT_CAPTION_STYLE.size <= CAPTION_SIZE_MAX,
  `DEFAULT_CAPTION_STYLE.size in [${CAPTION_SIZE_MIN}, ${CAPTION_SIZE_MAX}]`,
);

console.log("\n[9] buildCombinedAss — structure and timing");

const testSegments: CaptionSegment[] = [
  { id: "s1", start: 1.0, end: 3.0, text: "Hello world" },
  { id: "s2", start: 5.0, end: 7.0, text: "Goodbye world" },
];
const testCaptionStyle = DEFAULT_CAPTION_STYLE;
const testW = 1080;
const testH = 1920;
const testDuration = 10.0;

// Case 1: captions only, no headline
{
  const ass = buildCombinedAss(testSegments, testCaptionStyle, null, testW, testH, testDuration);
  assert(ass.includes("[Script Info]"), "ass: has [Script Info]");
  assert(ass.includes("PlayResX: 1080"), "ass: correct PlayResX");
  assert(ass.includes("PlayResY: 1920"), "ass: correct PlayResY");
  assert(ass.includes("Style: Caption,"), "ass: has Caption style");
  assert(!ass.includes("Style: Headline,"), "ass (no headline): no Headline style");
  assert(ass.includes("Hello world"), "ass: contains segment text");
  assert(ass.includes("Goodbye world"), "ass: contains second segment text");
}

// Case 2: headline only, no captions
{
  const hl = { enabled: true, text: "Beautiful home", fontId: "inter-bold" as const, size: 0.08, x: 0.5, y: 0.18, start: 0, end: 4 };
  const ass = buildCombinedAss([], testCaptionStyle, hl, testW, testH, testDuration);
  assert(ass.includes("Style: Caption,"), "ass: has Caption style even with no segments");
  assert(ass.includes("Style: Headline,"), "ass (headline): has Headline style");
  assert(ass.includes("Beautiful home"), "ass: contains headline text");
  assert(ass.includes("BEAUTIFUL HOME") || ass.includes("Beautiful home"), "ass: headline text present");
}

// Case 3: both captions and headline
{
  const hl = { enabled: true, text: "Dream home", fontId: "cormorant-regular" as const, size: 0.10, x: 0.5, y: 0.15, start: 0, end: 5 };
  const ass = buildCombinedAss(testSegments, testCaptionStyle, hl, testW, testH, testDuration);
  assert(ass.includes("Style: Caption,"), "combined: Caption style present");
  assert(ass.includes("Style: Headline,"), "combined: Headline style present");
  assert(ass.includes("Hello world"), "combined: caption text present");
  assert(ass.includes("Dream home") || ass.includes("DREAM HOME"), "combined: headline text present");
  // Exactly one [Script Info] header
  assert((ass.match(/\[Script Info\]/g) ?? []).length === 1, "combined: exactly one [Script Info]");
  // Exactly one [V4+ Styles] section
  assert((ass.match(/\[V4\+ Styles\]/g) ?? []).length === 1, "combined: exactly one [V4+ Styles]");
  // Exactly one [Events] section
  assert((ass.match(/\[Events\]/g) ?? []).length === 1, "combined: exactly one [Events]");
}

// Case 4: timing clipped to sourceDuration
{
  const shortDuration = 3.0;
  const hl = { enabled: true, text: "Clipped", fontId: "inter-bold" as const, size: 0.08, x: 0.5, y: 0.18, start: 0, end: 10.0 };
  const ass = buildCombinedAss([], testCaptionStyle, hl, testW, testH, shortDuration);
  // The headline end (10.0) must be clipped to shortDuration (3.0)
  assert(ass.includes("Headline"), "clipped: headline style present");
  // The headline event end time corresponds to ≤ 3.0 s
  // secondsToAssTime(3.0) = "0:00:03.00"
  assert(ass.includes("0:00:03.00"), "clipped: headline end clipped to source duration 3.0s");
  assert(!ass.includes("0:00:10.00"), "clipped: headline end not at original 10.0s");
}

// Case 5: disabled headline (wantHeadline=false) → no Headline style
{
  const hl = { enabled: false, text: "Hidden", fontId: "inter-bold" as const, size: 0.08, x: 0.5, y: 0.18, start: 0, end: 4 };
  const ass = buildCombinedAss(testSegments, testCaptionStyle, hl, testW, testH, testDuration);
  assert(!ass.includes("Style: Headline,"), "disabled headline: no Headline style in output");
}

// Case 6: hidden segments are excluded
{
  const mixedSegments: CaptionSegment[] = [
    { id: "s1", start: 1, end: 2, text: "Visible", hidden: false },
    { id: "s2", start: 3, end: 4, text: "HiddenText", hidden: true },
  ];
  const ass = buildCombinedAss(mixedSegments, testCaptionStyle, null, testW, testH, testDuration);
  assert(ass.includes("Visible"), "hidden filter: visible segment included");
  assert(!ass.includes("HiddenText"), "hidden filter: hidden segment excluded");
}

console.log("\n[10] buildHeadlineOverlayArgs — direct overlay ffmpeg args");

// Case 1: with audio — copies audio, single input, one video encode pass
{
  const args = buildHeadlineOverlayArgs("/tmp/clean.mp4", "/tmp/h.ass", "/fonts", "/tmp/out.mp4", true);
  const idxI = args.indexOf("-i");
  assert(idxI >= 0 && args[idxI + 1] === "/tmp/clean.mp4", "overlay(audio): input is the clean master");
  // Exactly one input (no re-concat, no second file)
  assert(args.filter(a => a === "-i").length === 1, "overlay(audio): exactly one input");
  assert(args.includes("-vf"), "overlay(audio): has a -vf ass filter");
  const vf = args[args.indexOf("-vf") + 1];
  assert(vf.includes("ass=") && vf.includes("fontsdir="), "overlay(audio): vf uses ass + fontsdir");
  assert(vf.includes("/tmp/h.ass"), "overlay(audio): vf references the ass path");
  assert(args.includes("-c:a") && args[args.indexOf("-c:a") + 1] === "copy", "overlay(audio): audio copied verbatim");
  assert(args.includes("-map") && args.includes("0:a:0?"), "overlay(audio): maps optional source audio");
  assert(args.includes("-c:v") && args[args.indexOf("-c:v") + 1] === "libx264", "overlay(audio): single libx264 video encode");
  assert(args[args.length - 1] === "/tmp/out.mp4", "overlay(audio): output path is last arg");
  assert(!args.includes("-an"), "overlay(audio): does NOT drop audio");
}

console.log("\n[11] Headline preview/export fidelity");
{
  assert(headlineOpacityAtTime(-0.1, 0, 4) === 0, "preview: hidden before start");
  assert(headlineOpacityAtTime(0, 0, 4) === 0, "preview: fade starts fully transparent");
  assert(headlineOpacityAtTime(1, 0, 4) === 1, "preview: fully visible after fade-in");
  assert(headlineOpacityAtTime(4, 0, 4) === 0, "preview: fully transparent at end");
  assert(headlineOpacityAtTime(5, 0, 4) === 0, "preview: remains hidden after end");

  const hl = {
    enabled: true,
    text: "Samme udtryk",
    fontId: "cormorant-regular" as const,
    size: 0.08,
    x: 0.5,
    y: 0.18,
    start: 0,
    end: 4,
  };
  const ass = buildAssHeadline(hl, testW, testH, testDuration);
  assert(ass.includes(HEADLINE_TEXT_ASS_COLOR), "export: uses shared warm-white headline colour");
  assert(ass.includes("\\fad(180,350)"), "export: includes the shared full fade-in/out");
  const combined = buildCombinedAss([], testCaptionStyle, hl, testW, testH, testDuration);
  assert(combined.includes(HEADLINE_TEXT_ASS_COLOR), "voice-over export: keeps the same headline colour");
  assert(combined.includes("\\fad(180,350)"), "voice-over export: keeps the same headline fade");
  assert(
    transitionDurationForClips(0.85, 0.85) >= 0.12 &&
      transitionDurationForClips(0.85, 0.85) < 0.18,
    "timeline: short valid neighbouring clips receive a safe brief transition",
  );
  assert(
    transitionDurationForClips(3, 4) === 0.42,
    "timeline: longer clips keep the polished maximum transition",
  );
  const movingBounds = renderBoundsForCandidate(1, 1.65, 0.1);
  assert(
    Math.abs(movingBounds.end - movingBounds.start - 0.65) < 0.0001,
    "timeline: a complete 0.65s moving scene remains renderable",
  );
  const staticBounds = renderBoundsForCandidate(1, 1.65, 0.01);
  assert(
    staticBounds.end - staticBounds.start > 0.6,
    "timeline: a complete 0.65s static scene remains renderable after settle trim",
  );
  assert(
    isLegacyShortTransitionError(
      "To naboklip er for korte til en sikker overgang. Vælg en længere variant eller fjern et klip.",
    ),
    "legacy project: former adjacent-clip error is recognised for safe reopening",
  );
  assert(
    !isLegacyShortTransitionError("En videoramme kunne ikke læses"),
    "legacy project: unrelated failures are never reopened automatically",
  );
}

console.log("\n[12] Clean Edit picture cuts and continuous source audio");
{
  const cleanPlan = {
    clips: [
      {
        shotId: "shot-1",
        candidateId: "candidate-1",
        sourceUrl: "/uploads/one.mp4",
        sourceVideoId: "source-1",
        start: 0,
        end: 1.2,
      },
      {
        shotId: "shot-2",
        candidateId: "candidate-2",
        sourceUrl: "/uploads/two.mp4",
        sourceVideoId: "source-2",
        start: 0.2,
        end: 1.2,
      },
    ],
    transitions: [
      { type: "cut" as const, duration: 0, confidence: 1 },
    ],
    // A stale pre-clean-cut plan may still contain the formerly overlapped
    // duration. The new renderer must derive duration from clip bounds.
    totalDuration: 2.08,
  };
  assert(
    Math.abs(cleanEditDuration(cleanPlan) - 2.2) < 0.0001,
    "edit duration: derives exact clean-cut picture length from clip bounds",
  );
  assert(
    Math.abs(cleanEditDuration({
      ...cleanPlan,
      clips: [
        { ...cleanPlan.clips[0], end: 0.7 },
        { ...cleanPlan.clips[1], start: 0, end: 0.65 },
      ],
    }) - (41 / 30)) < 0.0001,
    "edit duration: quantizes non-frame-aligned clips to the emitted 30-fps frame clock",
  );
  const args = buildCleanEditRenderArgs(
    ["/tmp/clip-1.mp4", "/tmp/clip-2.mp4"],
    "/tmp/selected-source.mp4",
    true,
    0.4,
    "/tmp/clean-output.mp4",
    cleanPlan,
  );
  const filter = args[args.indexOf("-filter_complex") + 1];
  assert(args.filter((arg) => arg === "-i").length === 3, "clean edit: two picture inputs plus one selected audio source");
  assert(filter.includes("aloop=loop=-1:size=19200"), "clean edit: decoded selected music loops sample-precisely");
  assert(!args.includes("-stream_loop"), "clean edit: avoids MP4/AAC loop priming gaps");
  assert(filter.includes("concat=n=2:v=1:a=0"), "clean edit: picture clips use frame-accurate hard concat");
  assert(!filter.includes("xfade"), "clean edit: no smeared automatic picture crossfade");
  assert(!filter.includes("acrossfade"), "clean edit: clip audio is never crossfaded");
  assert(filter.includes("[2:a]"), "clean edit: audio comes only from the selected source input");
  assert(filter.includes("atrim=duration=2.200"), "clean edit: continuous audio ends with the exact picture duration");
  assert(args.includes("[aout]"), "clean edit: maps the continuous selected-source audio bed");

  const silentArgs = buildCleanEditRenderArgs(
    ["/tmp/clip-1.mp4"],
    "/tmp/selected-source.mp4",
    false,
    0,
    "/tmp/silent-output.mp4",
    { ...cleanPlan, clips: cleanPlan.clips.slice(0, 1), transitions: [], totalDuration: 1.2 },
  );
  assert(silentArgs.includes("anullsrc=r=48000:cl=stereo"), "clean edit: source without audio gets deterministic silence");
  assert(!silentArgs.includes("-stream_loop"), "clean edit: silent source is not pointlessly looped");
}

// Case 2: without audio — drops audio (-an), no -c:a copy
{
  const args = buildHeadlineOverlayArgs("/tmp/clean.mp4", "/tmp/h.ass", "/fonts", "/tmp/out.mp4", false);
  assert(args.includes("-an"), "overlay(no audio): uses -an");
  assert(!args.includes("-c:a"), "overlay(no audio): no -c:a copy");
  assert(args.filter(a => a === "-i").length === 1, "overlay(no audio): exactly one input");
  assert(args.includes("-c:v") && args[args.indexOf("-c:v") + 1] === "libx264", "overlay(no audio): single libx264 encode");
}

// Case 3: special characters in paths are escaped for the ass filter
{
  const args = buildHeadlineOverlayArgs("/tmp/it's clean.mp4", "/tmp/a:b.ass", "/fonts:dir", "/tmp/out.mp4", true);
  const vf = args[args.indexOf("-vf") + 1];
  // Colons and single quotes inside the filter value must be backslash-escaped
  assert(vf.includes("a\\:b.ass"), "overlay(escape): colon in ass path escaped");
  assert(vf.includes("/fonts\\:dir"), "overlay(escape): colon in fonts dir escaped");
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(48)}`);
console.log(`Tests: ${passed + failed} total, ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
