/**
 * rendy-caption-style-editor.tsx
 * Compact live-preview editor for caption typography and style settings.
 * Embedded inside the VoiceoverEditor "review" state.
 *
 * Position anchors match the ASS renderer:
 *   high   → top edge at 8 % of frame height
 *   center → vertically centred (transform translateY -50 % from 50 %)
 *   low    → bottom edge at 6 % above the frame bottom
 *
 * Font size uses value * 100 cqh so it is proportional to the preview
 * container height exactly as the backend calculates it.
 * No backdrop-filter blur — the export pipeline does not produce blur.
 */

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  RENDY_TYPOGRAPHY_PRESETS,
  DEFAULT_CAPTION_STYLE,
  CAPTION_SIZE_MIN,
  CAPTION_SIZE_MAX,
  type CaptionStyleSettings,
  type RendyTypographyId,
} from "@shared/rendy-text";

// ── @font-face injection (idempotent) ─────────────────────────────────────────
const FONT_FACE_ID = "rendy-caption-fonts";
function injectFonts() {
  if (typeof document === "undefined") return;
  if (document.getElementById(FONT_FACE_ID)) return;
  const style = document.createElement("style");
  style.id = FONT_FACE_ID;
  style.textContent = `
    @font-face {
      font-family: "CormorantGaramond";
      src: url("/fonts/CormorantGaramond-Regular.ttf") format("truetype");
      font-weight: 400;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: "CormorantGaramond";
      src: url("/fonts/CormorantGaramond-Regular.ttf") format("truetype");
      font-weight: 400;
      font-style: italic;
      font-display: swap;
    }
    @font-face {
      font-family: "CormorantGaramond";
      src: url("/fonts/CormorantGaramond-SemiBold.ttf") format("truetype");
      font-weight: 600;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: "InterDisplay";
      src: url("/fonts/Inter-Regular.otf") format("opentype");
      font-weight: 400;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: "InterDisplay";
      src: url("/fonts/Inter-Bold.otf") format("opentype");
      font-weight: 700;
      font-style: normal;
      font-display: swap;
    }
  `;
  document.head.appendChild(style);
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface Props {
  /** URL to show behind the caption preview (source or project video). */
  previewVideoUrl?: string;
  /** Sample text for the live preview. Falls back to i18n key. */
  sampleText?: string;
  value: CaptionStyleSettings;
  onChange: (v: CaptionStyleSettings) => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const CONTRAST_OPTIONS: {
  value: CaptionStyleSettings["contrast"];
  i18nKey: string;
}[] = [
  { value: "shadow",  i18nKey: "dashboard.showcase.captionStyle.shadow" },
  { value: "box",     i18nKey: "dashboard.showcase.captionStyle.box" },
  { value: "outline", i18nKey: "dashboard.showcase.captionStyle.outline" },
];

const POSITION_OPTIONS: {
  value: CaptionStyleSettings["position"];
  i18nKey: string;
}[] = [
  { value: "high",   i18nKey: "dashboard.showcase.captionStyle.high" },
  { value: "center", i18nKey: "dashboard.showcase.captionStyle.center" },
  { value: "low",    i18nKey: "dashboard.showcase.captionStyle.low" },
];

/**
 * CSS positioning for the caption overlay, matching ASS anchors:
 *   high   → top: 8%,  transform: none           (text flows down from 8%)
 *   center → top: 50%, transform: translateY(-50%) (vertically centred)
 *   low    → bottom: 6%, top: auto               (text sits 6% above bottom)
 */
function positionStyle(pos: CaptionStyleSettings["position"]): React.CSSProperties {
  if (pos === "high") {
    return { top: "8%", bottom: "auto", transform: "none" };
  }
  if (pos === "center") {
    return { top: "50%", bottom: "auto", transform: "translateY(-50%)" };
  }
  // low
  return { bottom: "6%", top: "auto", transform: "none" };
}

/**
 * Build the CSS style for the rendered caption text.
 * No backdrop-filter — the export pipeline cannot produce blur.
 * Font size uses cqh so it scales with container height exactly as the backend.
 */
function buildCaptionTextStyle(cs: CaptionStyleSettings): React.CSSProperties {
  const preset =
    RENDY_TYPOGRAPHY_PRESETS.find((p) => p.id === cs.fontId) ??
    RENDY_TYPOGRAPHY_PRESETS[4]; // inter-regular fallback

  const base: React.CSSProperties = {
    fontFamily: `"${preset.browserFamily}", sans-serif`,
    fontWeight: preset.browserWeight,
    fontStyle: preset.browserStyle,
    textTransform: preset.browserCase,
    letterSpacing: `${preset.browserTracking}em`,
    // cqh requires container-type:size on the wrapper
    fontSize: `${cs.size * 100}cqh`,
    color: "#ffffff",
    padding: "0.1em 0.4em",
    borderRadius: "2px",
    display: "inline-block",
    maxWidth: "90cqw",
    textAlign: "center",
    lineHeight: 1.3,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  };

  if (cs.contrast === "shadow") {
    base.textShadow = "0 1px 4px rgba(0,0,0,0.9), 0 0 10px rgba(0,0,0,0.7)";
  } else if (cs.contrast === "box") {
    // Solid semi-transparent box — no blur (matches export)
    base.background = "rgba(0,0,0,0.55)";
  } else {
    // outline
    base.textShadow =
      "-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000";
  }

  return base;
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

// ── Video state ───────────────────────────────────────────────────────────────
type VideoState = "idle" | "loading" | "ready" | "error";

// ── Component ─────────────────────────────────────────────────────────────────
export function RendyCaptionStyleEditor({
  previewVideoUrl,
  sampleText,
  value,
  onChange,
}: Props) {
  const { t } = useTranslation();
  // Track video intrinsic dimensions for aspect-aware container
  const [videoDims, setVideoDims] = useState<{ w: number; h: number } | null>(null);
  const [videoState, setVideoState] = useState<VideoState>("idle");
  const [retryKey, setRetryKey] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => { injectFonts(); }, []);

  // Reset video state when URL changes
  useEffect(() => {
    if (previewVideoUrl) {
      setVideoState("idle");
    }
  }, [previewVideoUrl, retryKey]);

  const set = (patch: Partial<CaptionStyleSettings>) =>
    onChange({ ...value, ...patch });

  const sample =
    sampleText ?? t("dashboard.showcase.captionStyle.sampleText");

  const aspectRatio = videoDims ? `${videoDims.w} / ${videoDims.h}` : "9 / 16";

  // Status message for aria-live region
  const videoStatusMsg =
    videoState === "loading"
      ? t("dashboard.showcase.voiceover.preparing")
      : videoState === "error"
      ? t("dashboard.showcase.voiceover.failed")
      : "";

  return (
    <div className="space-y-3 rounded-xl border border-[#DCC9B9] bg-[#FFFDFC] p-3">
      <p className="text-[11px] font-semibold text-[#0F1D2F]">
        {t("dashboard.showcase.captionStyle.title")}
      </p>

      {/* Live preview
          container-type:size → cqh/cqw units work inside.
          object-contain → never crop regardless of orientation.
          aspect ratio from actual video dimensions once loaded. */}
      <div
        className="relative w-full rounded-lg overflow-hidden bg-black"
        style={{ aspectRatio, containerType: "size", maxHeight: "220px" }}
      >
        {/* Aria-live status for screen readers */}
        <span
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        >
          {videoStatusMsg}
        </span>

        {previewVideoUrl ? (
          <>
            <video
              key={`${previewVideoUrl}-${retryKey}`}
              ref={videoRef}
              src={previewVideoUrl}
              muted
              playsInline
              loop
              autoPlay
              preload="metadata"
              className="absolute inset-0 w-full h-full object-contain"
              onLoadStart={() => setVideoState("loading")}
              onCanPlay={() => setVideoState("ready")}
              onError={() => setVideoState("error")}
              onLoadedMetadata={(e) => {
                const v = e.target as HTMLVideoElement;
                if (v.videoWidth && v.videoHeight) {
                  setVideoDims({ w: v.videoWidth, h: v.videoHeight });
                }
              }}
            />

            {/* Loading spinner — shown until canPlay */}
            {videoState === "loading" && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none">
                <svg
                  className="w-8 h-8 text-white/70 animate-spin"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12" cy="12" r="10"
                    stroke="currentColor" strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                  />
                </svg>
              </div>
            )}

            {/* Error overlay — explains the black frame and offers retry */}
            {videoState === "error" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70">
                <p className="text-[11px] text-white/80 text-center px-4">
                  {t("dashboard.showcase.voiceover.failed")}
                </p>
                <button
                  type="button"
                  onClick={() => setRetryKey((k) => k + 1)}
                  className="text-[11px] text-white underline underline-offset-2"
                >
                  {t("dashboard.showcase.voiceover.retry")}
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-b from-[#1a2a3a] to-[#0a1520]" />
        )}

        {/* Caption overlay — pointer-events off so video controls work */}
        <div
          className="absolute left-0 right-0 flex justify-center px-3"
          style={{ ...positionStyle(value.position), pointerEvents: "none" }}
        >
          <span style={buildCaptionTextStyle(value)}>{sample}</span>
        </div>
      </div>

      {/* Font selector — horizontal scroll row */}
      <div>
        <p className="text-[10px] text-[#77736D] mb-1">
          {t("dashboard.showcase.captionStyle.fontLabel")}
        </p>
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-0.5 px-0.5">
          {RENDY_TYPOGRAPHY_PRESETS.map((p) => {
            const isActive = value.fontId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => set({ fontId: p.id as RendyTypographyId })}
                aria-pressed={isActive}
                aria-label={p.label}
                className={`flex-shrink-0 rounded border px-2 py-1 text-center transition-all ${
                  isActive
                    ? "border-[#C8956C] bg-[#FDF5EE]"
                    : "border-[#E1DAD2] bg-white hover:border-[#C8956C]/50"
                }`}
              >
                <span
                  className="block text-sm leading-tight text-[#0F1D2F]"
                  style={{
                    fontFamily: `"${p.browserFamily}", serif`,
                    fontWeight: p.browserWeight,
                    fontStyle: p.browserStyle,
                    textTransform: p.browserCase,
                  }}
                >
                  Aa
                </span>
                <span className="block text-[9px] text-[#77736D] mt-0.5">
                  {p.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Size */}
      <div className="flex items-center gap-2">
        <label
          htmlFor="caption-size-range"
          className="text-[10px] text-[#77736D] w-12 flex-shrink-0"
        >
          {t("dashboard.showcase.captionStyle.sizeLabel")}
        </label>
        <input
          id="caption-size-range"
          type="range"
          min={CAPTION_SIZE_MIN}
          max={CAPTION_SIZE_MAX}
          step={0.005}
          value={value.size}
          onChange={(e) =>
            set({ size: clamp(parseFloat(e.target.value), CAPTION_SIZE_MIN, CAPTION_SIZE_MAX) })
          }
          className="flex-1 accent-[#C8956C]"
          aria-label={t("dashboard.showcase.captionStyle.sizeLabel")}
        />
        <span className="text-[10px] text-[#77736D] w-8 text-right flex-shrink-0">
          {Math.round(value.size * 100)}%
        </span>
      </div>

      {/* Contrast */}
      <div>
        <p className="text-[10px] text-[#77736D] mb-1">
          {t("dashboard.showcase.captionStyle.contrastLabel")}
        </p>
        <div className="flex gap-1.5 flex-wrap" role="group" aria-label={t("dashboard.showcase.captionStyle.contrastLabel")}>
          {CONTRAST_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => set({ contrast: opt.value })}
              aria-pressed={value.contrast === opt.value}
              className={`min-h-11 px-3 rounded text-[10px] font-semibold border transition-all ${
                value.contrast === opt.value
                  ? "border-[#C8956C] bg-[#FDF5EE] text-[#855F45]"
                  : "border-[#E1DAD2] text-[#4D4943]"
              }`}
            >
              {t(opt.i18nKey)}
            </button>
          ))}
        </div>
      </div>

      {/* Position */}
      <div>
        <p className="text-[10px] text-[#77736D] mb-1">
          {t("dashboard.showcase.captionStyle.positionLabel")}
        </p>
        <div className="flex gap-1.5 flex-wrap" role="group" aria-label={t("dashboard.showcase.captionStyle.positionLabel")}>
          {POSITION_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => set({ position: opt.value })}
              aria-pressed={value.position === opt.value}
              className={`min-h-11 px-3 rounded text-[10px] font-semibold border transition-all ${
                value.position === opt.value
                  ? "border-[#C8956C] bg-[#FDF5EE] text-[#855F45]"
                  : "border-[#E1DAD2] text-[#4D4943]"
              }`}
            >
              {t(opt.i18nKey)}
            </button>
          ))}
        </div>
      </div>

      {/* Reset */}
      <button
        type="button"
        onClick={() => onChange(DEFAULT_CAPTION_STYLE)}
        className="text-[10px] text-[#77736D] underline"
        data-testid="button-caption-style-reset"
      >
        {t("dashboard.showcase.captionStyle.reset")}
      </button>
    </div>
  );
}
