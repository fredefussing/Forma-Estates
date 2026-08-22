/**
 * rendy-headline-editor.tsx
 * Focused UI for a durable headline text overlay on a post-generation video.
 * Available in both the draft edit state (before first export) and the ready
 * state (to rebuild with updated/removed headline). The parent owns state and
 * calls onApply (= startRender) when the user clicks the primary Apply button.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  Check,
  Film,
  GripHorizontal,
  Loader2,
  Minus,
  Plus,
  RotateCcw,
  Type,
  X,
} from "lucide-react";
import {
  RENDY_TYPOGRAPHY_PRESETS,
  DEFAULT_HEADLINE_SETTINGS,
  HEADLINE_SIZE_MIN,
  HEADLINE_SIZE_MAX,
  HEADLINE_POSITION_MIN,
  HEADLINE_POSITION_MAX_X,
  HEADLINE_POSITION_MAX_Y,
  HEADLINE_TEXT_COLOR,
  headlineOpacityAtTime,
  type HeadlineSettings,
  type RendyTypographyId,
} from "@shared/rendy-text";

function BrowserPortal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return <>{children}</>;
  return createPortal(children, document.body);
}

// ── @font-face injection (runs once) ─────────────────────────────────────────
const FONT_FACE_ID = "rendy-headline-fonts";
function injectFonts() {
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

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  /** Clean source delivery URL — never the burned output — so preview stays uncontaminated. */
  sourceVideoUrl: string;
  value: HeadlineSettings;
  onChange: (v: HeadlineSettings) => void;
  /** Called when user clicks the primary Apply button (= startRender in parent). */
  onApply: () => void;
  /** True while the parent render job is in flight. */
  applyBusy: boolean;
  /** Opens the editor as an immersive workspace instead of an embedded card. */
  immersive?: boolean;
  /** Lets a parent close the immersive workspace without owning editor state. */
  onRequestClose?: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function RendyHeadlineEditor({
  sourceVideoUrl,
  value,
  onChange,
  onApply,
  applyBusy,
  immersive = false,
  onRequestClose,
}: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  // Actual video intrinsic dimensions for aspect-aware container
  const [videoDims, setVideoDims] = useState<{ w: number; h: number } | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => { injectFonts(); }, []);

  const editorOpen = open || immersive;
  const closeEditor = useCallback(() => {
    setOpen(false);
    onRequestClose?.();
  }, [onRequestClose]);

  useEffect(() => {
    if (!editorOpen) {
      if (wasOpenRef.current && !immersive) openerRef.current?.focus();
      wasOpenRef.current = false;
      return;
    }
    wasOpenRef.current = true;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusableSelector =
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), video[controls], [tabindex]:not([tabindex="-1"])';
    const first = dialog.querySelector<HTMLElement>(focusableSelector);
    (first ?? dialog).focus();

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const dialogs = Array.from(
        document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]'),
      );
      if (dialogs.at(-1) !== dialog) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeEditor();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(focusableSelector),
      ).filter((element) => !element.hasAttribute("disabled"));
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const firstFocusable = focusable[0];
      const lastFocusable = focusable[focusable.length - 1];
      const focusIndex = focusable.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey && (focusIndex <= 0 || focusIndex === -1)) {
        event.preventDefault();
        lastFocusable.focus();
      } else if (!event.shiftKey && (focusIndex === -1 || document.activeElement === lastFocusable)) {
        event.preventDefault();
        firstFocusable.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [closeEditor, editorOpen, immersive]);

  const set = useCallback(
    (patch: Partial<HeadlineSettings>) => onChange({ ...value, ...patch }),
    [onChange, value],
  );

  // ── Pointer drag to reposition overlay ───────────────────────────────────
  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragging.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragging.current || !previewRef.current) return;
      const rect = previewRef.current.getBoundingClientRect();
      const nx = clamp((e.clientX - rect.left) / rect.width, HEADLINE_POSITION_MIN, HEADLINE_POSITION_MAX_X);
      const ny = clamp((e.clientY - rect.top) / rect.height, HEADLINE_POSITION_MIN, HEADLINE_POSITION_MAX_Y);
      set({ x: nx, y: ny });
    },
    [set],
  );

  const onPointerUp = useCallback(() => { dragging.current = false; }, []);

  // ── Keyboard arrow movement ───────────────────────────────────────────────
  const onDragKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const step = e.shiftKey ? 0.05 : 0.01;
      let handled = true;
      switch (e.key) {
        case "ArrowLeft":  set({ x: clamp(value.x - step, HEADLINE_POSITION_MIN, HEADLINE_POSITION_MAX_X) }); break;
        case "ArrowRight": set({ x: clamp(value.x + step, HEADLINE_POSITION_MIN, HEADLINE_POSITION_MAX_X) }); break;
        case "ArrowUp":    set({ y: clamp(value.y - step, HEADLINE_POSITION_MIN, HEADLINE_POSITION_MAX_Y) }); break;
        case "ArrowDown":  set({ y: clamp(value.y + step, HEADLINE_POSITION_MIN, HEADLINE_POSITION_MAX_Y) }); break;
        default: handled = false;
      }
      if (handled) e.preventDefault();
    },
    [set, value.x, value.y],
  );

  const overlayOpacity =
    value.enabled && value.text.trim().length > 0
      ? headlineOpacityAtTime(currentTime, value.start, value.end)
      : 0;

  const preset =
    RENDY_TYPOGRAPHY_PRESETS.find((p) => p.id === value.fontId) ?? RENDY_TYPOGRAPHY_PRESETS[0];

  const fontStyle: React.CSSProperties = {
    fontFamily: `"${preset.browserFamily}", serif`,
    fontWeight: preset.browserWeight,
    fontStyle: preset.browserStyle,
    textTransform: preset.browserCase,
    letterSpacing: `${preset.browserTracking}em`,
  };

  // Apply is disabled when headline is enabled but text is blank
  const applyDisabled = applyBusy || (value.enabled && value.text.trim().length === 0);

  // Compute aspect ratio string from loaded video dimensions, fallback to 9/16
  const aspectRatio = videoDims ? `${videoDims.w} / ${videoDims.h}` : "9 / 16";

  if (!open && !immersive) {
    return (
      <div className="mt-1">
        <button
          ref={openerRef}
          type="button"
          onClick={() => setOpen(true)}
          className="w-full min-h-11 rounded-full text-xs font-semibold border border-[#C8956C] text-[#855F45] bg-[#FFFDFC] inline-flex items-center justify-center gap-1.5"
          data-testid="button-open-headline-editor"
        >
          <Type className="w-3.5 h-3.5" />
          {t("dashboard.showcase.headline.add")}
        </button>
      </div>
    );
  }

  return (
    <BrowserPortal>
    <section
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="rendy-headline-dialog-title"
      tabIndex={-1}
      className={`${(immersive || open) ? "fixed inset-0 z-[80] overflow-y-auto bg-[#0F1D2F]/95 p-3 sm:p-6" : "mt-1 rounded-xl border border-[#DCC9B9] bg-[#FFFDFC] p-3"} space-y-3`}
    >
      <div className={(immersive || open) ? "mx-auto max-w-6xl rounded-[24px] border border-white/10 bg-[#F8F5F0] p-4 shadow-2xl sm:p-6 space-y-3" : ""}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#A36F4E]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#C8956C]" />
            Overskrift
          </div>
          <h3 id="rendy-headline-dialog-title" className="text-base font-semibold text-[#0F1D2F] sm:text-lg">
            {t("dashboard.showcase.headline.title")}
          </h3>
          <p className="text-[11px] text-[#6C6964]">
            {t("dashboard.showcase.headline.hint")}
          </p>
        </div>
        <button
          type="button"
          onClick={closeEditor}
          aria-label={t("dashboard.showcase.headline.close")}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8956C]"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Enable toggle */}
      <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(e) => set({ enabled: e.target.checked })}
          className="accent-[#C8956C]"
        />
        <span className="font-medium text-[#0F1D2F]">
          {t("dashboard.showcase.headline.enable")}
        </span>
      </label>

      {value.enabled && (
        <>
          <div className="grid gap-3 lg:grid-cols-[minmax(280px,0.75fr)_minmax(420px,1.25fr)]">
          {/* Text input */}
          <div className="lg:col-start-2">
            <label
              htmlFor="headline-text-input"
              className="block text-[11px] font-semibold text-[#0F1D2F] mb-1"
            >
              {t("dashboard.showcase.headline.textLabel")}
            </label>
            <input
              id="headline-text-input"
              type="text"
              value={value.text}
              onChange={(e) => set({ text: e.target.value })}
              maxLength={120}
              placeholder={t("dashboard.showcase.headline.placeholder")}
              className="w-full rounded-lg border border-[#E1DAD2] px-2.5 py-1.5 text-sm focus:outline-none focus:border-[#C8956C]"
              data-testid="input-headline-text"
            />
          </div>

          {/* Typography tiles */}
          <div className="lg:col-start-2">
            <p className="text-[11px] font-semibold text-[#0F1D2F] mb-1.5">
              {t("dashboard.showcase.headline.fontLabel")}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {RENDY_TYPOGRAPHY_PRESETS.map((p) => {
                const isActive = value.fontId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => set({ fontId: p.id as RendyTypographyId })}
                    aria-pressed={isActive}
                    aria-label={p.label}
                    className={`relative rounded-lg border px-2 py-2.5 text-center transition-all ${
                      isActive
                        ? "border-[#C8956C] bg-[#FDF5EE]"
                        : "border-[#E1DAD2] bg-white hover:border-[#C8956C]/50"
                    }`}
                    data-testid={`font-tile-${p.id}`}
                  >
                    {isActive && (
                      <Check className="w-3 h-3 text-[#C8956C] absolute top-1 right-1" />
                    )}
                    <span
                      className="block text-base leading-tight text-[#0F1D2F]"
                      style={{
                        fontFamily: `"${p.browserFamily}", serif`,
                        fontWeight: p.browserWeight,
                        fontStyle: p.browserStyle,
                        textTransform: p.browserCase,
                        letterSpacing: `${p.browserTracking}em`,
                      }}
                    >
                      Aa
                    </span>
                    <span className="block text-[9px] text-[#77736D] mt-0.5 truncate">
                      {p.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Size control */}
          <div className="flex items-center gap-2 lg:col-start-2">
            <span className="text-[11px] font-semibold text-[#0F1D2F] w-16 flex-shrink-0">
              {t("dashboard.showcase.headline.sizeLabel")}
            </span>
            <button
              type="button"
              onClick={() => set({ size: clamp(value.size - 0.005, HEADLINE_SIZE_MIN, HEADLINE_SIZE_MAX) })}
              aria-label={t("dashboard.showcase.headline.smaller")}
              className="min-w-11 min-h-11 rounded border border-[#E1DAD2] flex items-center justify-center flex-shrink-0"
            >
              <Minus className="w-3 h-3" />
            </button>
            <input
              type="range"
              min={HEADLINE_SIZE_MIN}
              max={HEADLINE_SIZE_MAX}
              step={0.005}
              value={value.size}
              onChange={(e) =>
                set({ size: clamp(parseFloat(e.target.value), HEADLINE_SIZE_MIN, HEADLINE_SIZE_MAX) })
              }
              className="flex-1 accent-[#C8956C]"
              aria-label={t("dashboard.showcase.headline.sizeLabel")}
            />
            <button
              type="button"
              onClick={() => set({ size: clamp(value.size + 0.005, HEADLINE_SIZE_MIN, HEADLINE_SIZE_MAX) })}
              aria-label={t("dashboard.showcase.headline.larger")}
              className="min-w-11 min-h-11 rounded border border-[#E1DAD2] flex items-center justify-center flex-shrink-0"
            >
              <Plus className="w-3 h-3" />
            </button>
            <span className="text-[10px] text-[#77736D] w-10 text-right flex-shrink-0">
              {Math.round(value.size * 100)}%
            </span>
          </div>

          {/* Start + End controls */}
          <div className="grid grid-cols-2 gap-2 lg:col-start-2">
            <div>
              <label
                htmlFor="headline-start-input"
                className="block text-[11px] font-semibold text-[#0F1D2F] mb-1"
              >
                {t("dashboard.showcase.headline.startLabel")}
              </label>
              <div className="flex items-center gap-1">
                <input
                  id="headline-start-input"
                  type="number"
                  min={0}
                  max={value.end - 0.5}
                  step={0.5}
                  value={value.start}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v)) set({ start: Math.max(0, Math.min(v, value.end - 0.5)) });
                  }}
                  className="w-full rounded border border-[#E1DAD2] px-2 py-1 text-xs focus:outline-none focus:border-[#C8956C]"
                  data-testid="input-headline-start"
                />
                <span className="text-[10px] text-[#77736D] flex-shrink-0">s</span>
              </div>
            </div>
            <div>
              <label
                htmlFor="headline-end-input"
                className="block text-[11px] font-semibold text-[#0F1D2F] mb-1"
              >
                {t("dashboard.showcase.headline.endLabel")}
              </label>
              <div className="flex items-center gap-1">
                <input
                  id="headline-end-input"
                  type="number"
                  min={value.start + 0.5}
                  step={0.5}
                  value={value.end}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v)) set({ end: Math.max(value.start + 0.5, v) });
                  }}
                  className="w-full rounded border border-[#E1DAD2] px-2 py-1 text-xs focus:outline-none focus:border-[#C8956C]"
                  data-testid="input-headline-end"
                />
                <span className="text-[10px] text-[#77736D] flex-shrink-0">s</span>
              </div>
            </div>
          </div>

          {/* Video preview with draggable overlay */}
          <div className="lg:col-start-1 lg:row-start-1 lg:row-span-5">
            <p className="text-[11px] font-semibold text-[#0F1D2F] mb-1">
              {t("dashboard.showcase.headline.positionLabel")}
              <span className="font-normal text-[#77736D] ml-1">
                {t("dashboard.showcase.headline.dragHint")}
              </span>
            </p>

            {/*
              container-type:size enables cqh/cqw units inside.
              aspect ratio is set from actual video dimensions once loaded.
              object-contain so the video never gets cropped regardless of orientation.
            */}
            <div
              ref={previewRef}
              className="relative w-full rounded-lg overflow-hidden bg-black select-none"
              style={{ aspectRatio, containerType: "size", maxHeight: "68vh" }}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              <video
                src={sourceVideoUrl}
                controls
                preload="metadata"
                playsInline
                muted
                className="absolute inset-0 w-full h-full object-contain"
                onLoadedMetadata={(e) => {
                  const v = e.target as HTMLVideoElement;
                  if (v.videoWidth && v.videoHeight) {
                    setVideoDims({ w: v.videoWidth, h: v.videoHeight });
                  }
                }}
                onTimeUpdate={(e) =>
                  setCurrentTime((e.target as HTMLVideoElement).currentTime)
                }
                data-testid="headline-preview-video"
              />

              {/* Overlay handle — positioned over the video letterbox area */}
              {value.text.trim() && (
                <div
                  className="absolute inset-0 pointer-events-none"
                >
                  <div
                    className="absolute"
                    style={{
                      left: `${value.x * 100}%`,
                      top: `${value.y * 100}%`,
                      transform: "translate(-50%, -50%)",
                      opacity: overlayOpacity,
                      transition: "opacity 80ms linear",
                      pointerEvents: "auto",
                    }}
                  >
                    <div
                      role="group"
                      tabIndex={0}
                      aria-label={t("dashboard.showcase.headline.dragLabel")}
                      aria-describedby="rendy-headline-position-help"
                      onPointerDown={onPointerDown}
                      onKeyDown={onDragKeyDown}
                      className="group cursor-grab active:cursor-grabbing touch-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C8956C] rounded"
                    >
                      {/* Font size uses cqh — container-type:size makes the
                          container height the query base, matching the backend's
                          frame-height calculation exactly. */}
                      <p
                        className="text-center"
                        style={{
                          ...fontStyle,
                          color: HEADLINE_TEXT_COLOR,
                          fontSize: `${value.size * 100}cqh`,
                          textShadow: "0 1px 6px rgba(0,0,0,0.75)",
                          whiteSpace: "pre-wrap",
                          maxWidth: "80cqw",
                          lineHeight: 1.15,
                        }}
                      >
                        {value.text}
                      </p>
                      <div className="absolute -top-5 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
                        <GripHorizontal className="w-4 h-4 text-white drop-shadow" />
                      </div>
                      <span id="rendy-headline-position-help" className="sr-only">
                        Brug piletasterne til at flytte teksten. Hold Shift nede for større trin.
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <p className="text-[10px] text-[#77736D] mt-0.5 text-right">
              x: {Math.round(value.x * 100)}% · y: {Math.round(value.y * 100)}%
            </p>
          </div>

          {/* Reset */}
          <button
            type="button"
            onClick={() => onChange({ ...DEFAULT_HEADLINE_SETTINGS, enabled: true })}
            className="inline-flex items-center gap-1.5 text-[11px] text-[#77736D] underline lg:col-start-2"
            data-testid="button-headline-reset"
          >
            <RotateCcw className="w-3 h-3" />
            {t("dashboard.showcase.headline.reset")}
          </button>
          </div>
        </>
      )}

      {/* Primary Apply action — always visible inside editor.
          Disabled when: render is busy, or headline is enabled but text is blank. */}
      <button
        type="button"
        onClick={onApply}
        disabled={applyDisabled}
        aria-disabled={applyDisabled}
        aria-label={
          value.enabled && value.text.trim().length === 0
            ? t("dashboard.showcase.headline.applyDisabledBlank")
            : applyBusy
            ? t("dashboard.showcase.headline.applying")
            : t("dashboard.showcase.headline.apply")
        }
        className="w-full min-h-11 rounded-lg bg-[#C8956C] text-white text-xs font-semibold inline-flex justify-center items-center gap-1.5 disabled:opacity-50"
        data-testid="button-headline-apply"
      >
        {applyBusy ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Film className="w-3.5 h-3.5" />
        )}
        {applyBusy
          ? t("dashboard.showcase.headline.applying")
          : t("dashboard.showcase.headline.apply")}
      </button>
      </div>
    </section>
    </BrowserPortal>
  );
}
