/**
 * shared/rendy-text.ts
 * Shared contract for Rendy durable post-generation text layers.
 * Used by both frontend (HeadlineEditor, CaptionStyleEditor) and backend (render pipeline).
 */

// ── Font files served at /fonts/ ─────────────────────────────────────────────
// CormorantGaramond-Regular.ttf
// CormorantGaramond-SemiBold.ttf
// Inter-Regular.otf
// Inter-Bold.otf

export type RendyTypographyId =
  | "cormorant-regular"
  | "cormorant-semibold"
  | "cormorant-italic"
  | "cormorant-semibold-sc"
  | "inter-regular"
  | "inter-bold"
  | "inter-regular-wide"
  | "inter-bold-wide"
  | "inter-light-caps"
  | "cormorant-display";

/** Stable ordered array of all typography preset IDs (matches RendyTypographyId union). */
export const RENDY_TYPOGRAPHY_PRESET_IDS: readonly RendyTypographyId[] = [
  "cormorant-regular",
  "cormorant-semibold",
  "cormorant-italic",
  "cormorant-semibold-sc",
  "inter-regular",
  "inter-bold",
  "inter-regular-wide",
  "inter-bold-wide",
  "inter-light-caps",
  "cormorant-display",
] as const;

const RENDY_TYPOGRAPHY_ID_SET = new Set<RendyTypographyId>(RENDY_TYPOGRAPHY_PRESET_IDS);

export function isRendyTypographyId(v: unknown): v is RendyTypographyId {
  return typeof v === "string" && RENDY_TYPOGRAPHY_ID_SET.has(v as RendyTypographyId);
}

export interface RendyTypographyPreset {
  /** Stable identifier */
  id: RendyTypographyId;
  /** Human-readable label for UI tiles */
  label: string;

  // ── Browser / CSS metadata ──────────────────────────────────────────────
  /** Font family name as declared in @font-face */
  browserFamily: string;
  /** CSS font-weight value */
  browserWeight: number | string;
  /** CSS font-style value */
  browserStyle: "normal" | "italic";
  /** CSS text-transform value */
  browserCase: "none" | "uppercase" | "lowercase" | "capitalize";
  /** CSS letter-spacing in em units */
  browserTracking: number;

  // ── ASS / FFmpeg subtitle metadata ─────────────────────────────────────
  /** Font name as embedded in the file (for ASS FontName field) */
  assFontName: string;
  /** ASS Bold flag: 0 or -1 (−1 = bold in ASS v4+) */
  assBold: 0 | -1 | 1;
  /** ASS Italic flag: 0 or -1 (−1 = italic in ASS v4+) */
  assItalic: 0 | -1 | 1;
  /** ASS uppercase applied via JS text transform? */
  assUppercase: boolean;
  /**
   * ASS Spacing field value (letter spacing in pixels at PlayRes scale).
   * 0 = default. Derived from browserTracking; added additively for ASS.
   */
  assSpacing: number;
  /** Bundled font file name relative to public/fonts/ */
  fontFile: RendyFontFile;
}

/** Bundled font file names (relative to public/fonts/). */
export type RendyFontFile =
  | "CormorantGaramond-Regular.ttf"
  | "CormorantGaramond-SemiBold.ttf"
  | "Inter-Regular.otf"
  | "Inter-Bold.otf";

export const RENDY_TYPOGRAPHY_PRESETS: RendyTypographyPreset[] = [
  {
    id: "cormorant-regular",
    label: "Cormorant",
    browserFamily: "CormorantGaramond",
    browserWeight: 400,
    browserStyle: "normal",
    browserCase: "none",
    browserTracking: 0.02,
    assFontName: "Cormorant Garamond",
    assBold: 0,
    assItalic: 0,
    assUppercase: false,
    assSpacing: 1,
    fontFile: "CormorantGaramond-Regular.ttf",
  },
  {
    id: "cormorant-semibold",
    label: "Cormorant Semi",
    browserFamily: "CormorantGaramond",
    browserWeight: 600,
    browserStyle: "normal",
    browserCase: "none",
    browserTracking: 0.02,
    assFontName: "Cormorant Garamond SemiBold",
    assBold: 0,
    assItalic: 0,
    assUppercase: false,
    assSpacing: 1,
    fontFile: "CormorantGaramond-SemiBold.ttf",
  },
  {
    id: "cormorant-italic",
    label: "Cormorant Italic",
    browserFamily: "CormorantGaramond",
    browserWeight: 400,
    browserStyle: "italic",
    browserCase: "none",
    browserTracking: 0.02,
    assFontName: "Cormorant Garamond",
    assBold: 0,
    assItalic: -1,
    assUppercase: false,
    assSpacing: 1,
    fontFile: "CormorantGaramond-Regular.ttf",
  },
  {
    id: "cormorant-semibold-sc",
    label: "Cormorant Caps",
    browserFamily: "CormorantGaramond",
    browserWeight: 600,
    browserStyle: "normal",
    browserCase: "uppercase",
    browserTracking: 0.1,
    assFontName: "Cormorant Garamond SemiBold",
    assBold: 0,
    assItalic: 0,
    assUppercase: true,
    assSpacing: 4,
    fontFile: "CormorantGaramond-SemiBold.ttf",
  },
  {
    id: "inter-regular",
    label: "Inter",
    browserFamily: "InterDisplay",
    browserWeight: 400,
    browserStyle: "normal",
    browserCase: "none",
    browserTracking: 0,
    assFontName: "Inter",
    assBold: 0,
    assItalic: 0,
    assUppercase: false,
    assSpacing: 0,
    fontFile: "Inter-Regular.otf",
  },
  {
    id: "inter-bold",
    label: "Inter Bold",
    browserFamily: "InterDisplay",
    browserWeight: 700,
    browserStyle: "normal",
    browserCase: "none",
    browserTracking: -0.01,
    assFontName: "Inter",
    assBold: -1,
    assItalic: 0,
    assUppercase: false,
    assSpacing: 0,
    fontFile: "Inter-Bold.otf",
  },
  {
    id: "inter-regular-wide",
    label: "Inter Wide",
    browserFamily: "InterDisplay",
    browserWeight: 400,
    browserStyle: "normal",
    browserCase: "none",
    browserTracking: 0.06,
    assFontName: "Inter",
    assBold: 0,
    assItalic: 0,
    assUppercase: false,
    assSpacing: 3,
    fontFile: "Inter-Regular.otf",
  },
  {
    id: "inter-bold-wide",
    label: "Inter Bold Wide",
    browserFamily: "InterDisplay",
    browserWeight: 700,
    browserStyle: "normal",
    browserCase: "none",
    browserTracking: 0.06,
    assFontName: "Inter",
    assBold: -1,
    assItalic: 0,
    assUppercase: false,
    assSpacing: 3,
    fontFile: "Inter-Bold.otf",
  },
  {
    id: "inter-light-caps",
    label: "Inter Caps",
    browserFamily: "InterDisplay",
    browserWeight: 400,
    browserStyle: "normal",
    browserCase: "uppercase",
    browserTracking: 0.14,
    assFontName: "Inter",
    assBold: 0,
    assItalic: 0,
    assUppercase: true,
    assSpacing: 6,
    fontFile: "Inter-Regular.otf",
  },
  {
    id: "cormorant-display",
    label: "Cormorant Display",
    browserFamily: "CormorantGaramond",
    browserWeight: 400,
    browserStyle: "normal",
    browserCase: "uppercase",
    browserTracking: 0.16,
    assFontName: "Cormorant Garamond",
    assBold: 0,
    assItalic: 0,
    assUppercase: true,
    assSpacing: 6,
    fontFile: "CormorantGaramond-Regular.ttf",
  },
];

// ── Shared numeric bounds (used by both server validators and frontend) ───────

/** Minimum headline font size as a fraction of frame height. */
export const HEADLINE_SIZE_MIN = 0.03;
/** Maximum headline font size as a fraction of frame height. */
export const HEADLINE_SIZE_MAX = 0.18;
/** Minimum safe-zone position (applied to both x and y). */
export const HEADLINE_POSITION_MIN = 0.05;
/** Minimum safe-zone x position — alias for HEADLINE_POSITION_MIN (kept for frontend compat). */
export const HEADLINE_POSITION_MIN_X = HEADLINE_POSITION_MIN;
/** Minimum safe-zone y position — alias for HEADLINE_POSITION_MIN (kept for frontend compat). */
export const HEADLINE_POSITION_MIN_Y = HEADLINE_POSITION_MIN;
/** Maximum safe-zone x position (horizontal). */
export const HEADLINE_POSITION_MAX_X = 0.95;
/** Maximum safe-zone y position (vertical). */
export const HEADLINE_POSITION_MAX_Y = 0.92;
/** Browser preview colour for durable Rendy headlines. */
export const HEADLINE_TEXT_COLOR = "#F1EEE6";
/** The same RGB colour encoded as ASS &HAABBGGRR. */
export const HEADLINE_TEXT_ASS_COLOR = "&H00E6EEF1";
/** Headline entrance fade used in both browser preview and ASS export. */
export const HEADLINE_FADE_IN_SECONDS = 0.18;
/** Headline exit fade used in both browser preview and ASS export. */
export const HEADLINE_FADE_OUT_SECONDS = 0.35;
/** Minimum caption font size as a fraction of frame height. */
export const CAPTION_SIZE_MIN = 0.03;
/** Maximum caption font size as a fraction of frame height. */
export const CAPTION_SIZE_MAX = 0.10;

// ── Headline ──────────────────────────────────────────────────────────────────

export interface HeadlineSettings {
  enabled: boolean;
  text: string;
  fontId: RendyTypographyId;
  /** Font size as fraction of frame height, e.g. 0.08 = 8% */
  size: number;
  /** Normalized horizontal position [0..1] */
  x: number;
  /** Normalized vertical position [0..1] */
  y: number;
  /** Headline in-time (seconds from video start) */
  start: number;
  /** Headline out-time (seconds from video start) */
  end: number;
}

export function headlineFadeDurations(start: number, end: number): {
  fadeInSeconds: number;
  fadeOutSeconds: number;
} {
  const visibleDuration = Math.max(0, end - start);
  const fadeInSeconds = Math.min(HEADLINE_FADE_IN_SECONDS, visibleDuration * 0.3);
  const fadeOutSeconds = Math.min(
    HEADLINE_FADE_OUT_SECONDS,
    Math.max(0, visibleDuration - fadeInSeconds) * 0.7,
  );
  return { fadeInSeconds, fadeOutSeconds };
}

/** Exact preview opacity for the fade that is burned into the exported video. */
export function headlineOpacityAtTime(
  currentTime: number,
  start: number,
  end: number,
): number {
  if (currentTime < start || currentTime >= end || end <= start) return 0;
  const { fadeInSeconds, fadeOutSeconds } = headlineFadeDurations(start, end);
  const fadeInOpacity =
    fadeInSeconds > 0 ? Math.min(1, (currentTime - start) / fadeInSeconds) : 1;
  const fadeOutOpacity =
    fadeOutSeconds > 0 ? Math.min(1, (end - currentTime) / fadeOutSeconds) : 1;
  return Math.max(0, Math.min(1, fadeInOpacity, fadeOutOpacity));
}

export const DEFAULT_HEADLINE_SETTINGS: HeadlineSettings = {
  enabled: false,
  text: "",
  fontId: "cormorant-regular",
  size: 0.08,
  x: 0.5,
  y: 0.18,
  start: 0,
  end: 4,
};

// ── Caption style ─────────────────────────────────────────────────────────────

export type CaptionContrast = "shadow" | "box" | "outline";
export type CaptionPosition = "high" | "center" | "low";

export interface CaptionStyleSettings {
  fontId: RendyTypographyId;
  /** Caption font size as fraction of frame height */
  size: number;
  /** Visual contrast mode */
  contrast: CaptionContrast;
  /** Vertical position preference */
  position: CaptionPosition;
}

export const DEFAULT_CAPTION_STYLE: CaptionStyleSettings = {
  fontId: "inter-regular",
  size: 0.045,
  contrast: "shadow",
  position: "low",
};
