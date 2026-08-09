import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { EnterpriseCalculator } from "@/components/enterprise-calculator";
import { TrustMarquee } from "@/components/TrustMarquee";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Menu,
  X,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Check,
  ArrowRight,
  Camera,
  SlidersHorizontal,
  Download,
  Home,
  Palette,
  Zap,
  Monitor,
  MessageCircle,
  Box,
  Video,
  Wand2,
  Facebook,
  Instagram,
  Linkedin,
  Upload,
  Globe,
} from "lucide-react";
import { setExplicitLang } from "@/i18n";
import formaEstatesLogo from "@assets/forma-estates-logo.png";
import formaEstatesMonogram from "@assets/forma-estates-monogram.png";

const C = {
  navy: "#0F1923",
  navyDeep: "#0A1219",
  gold: "#C9A96E",
  goldHover: "#B8975D",
  goldTint: "rgba(201, 169, 110, 0.10)",
  goldBorder: "rgba(201, 169, 110, 0.30)",
  white: "#FFFFFF",
  warm: "#FAF6EC",
  champagne: "#E8DFD0",
  text: "#1A1A1A",
  muted: "#6B6B6B",
  border: "#E8E8E8",
  shadowCard: "0 4px 24px rgba(15, 25, 35, 0.08)",
  shadowCardHover: "0 8px 32px rgba(15, 25, 35, 0.12)",
};

const SERIF = "'Playfair Display', Georgia, serif";
const SANS = "'Inter', system-ui, -apple-system, sans-serif";

const LANGUAGES = [
  { code: "da", flag: "🇩🇰", name: "Dansk" },
  { code: "en", flag: "🇬🇧", name: "English" },
  { code: "sv", flag: "🇸🇪", name: "Svenska" },
  { code: "de", flag: "🇩🇪", name: "Deutsch" },
  { code: "nb", flag: "🇳🇴", name: "Norsk" },
  { code: "es", flag: "🇪🇸", name: "Español" },
  { code: "fr", flag: "🇫🇷", name: "Français" },
] as const;

// Nav keys map to t('nav.xxx') inside the component
const NAV_LINKS_BASE = [
  { navKey: "home",     href: "#top" },
  { navKey: "prices",   href: "#pricing" },
  { navKey: "examples", href: "/boligpotentiale/eksempler" },
  { navKey: "about",    href: "/boligpotentiale/om-os" },
  { navKey: "faq",      href: "#faq" },
];

const HERO_PAIRS = [
  { before: "/bolig-images/living-scandi-before.jpg", after: "/bolig-images/living-scandi-after.jpg", label: "Stue · Skandinavisk" },
  { before: "/bolig-images/kitchen-before.jpg", after: "/bolig-images/kitchen-after.jpg", label: "Køkken · Moderne" },
  { before: "/bolig-images/living-modern-before.jpg", after: "/bolig-images/living-modern-after.jpg", label: "Stue · Moderne" },
];

// Base icon structures — text comes from locale files via useTranslation()
const HOW_IT_WORKS_BASE = [
  { step: "01", Icon: Camera },
  { step: "02", Icon: SlidersHorizontal },
  { step: "03", Icon: Download },
];

const FEATURES_BASE = [
  { Icon: Home },
  { Icon: Palette },
  { Icon: Box },
  { Icon: Video },
  { Icon: Wand2 },
  { Icon: Zap },
  { Icon: Monitor },
  { Icon: Download },
  { Icon: MessageCircle },
];

// Indices that have a "more" expandable section
const FEATURES_WITH_MORE = new Set([0, 2, 3, 4]);

type Plan = {
  name: string;
  monthly: number | null;
  features: string[];
  cta: string;
  highlight?: boolean;
  href: string;
};

const PRICING_BASE = [
  { name: "Start",    monthly: 2999,  highlight: false, href: "/opret" },
  { name: "Pro",      monthly: 5999,  highlight: true,  href: "/opret" },
  { name: "Business", monthly: 11999, highlight: false, href: "/opret" },
];

// ── Language switcher (desktop nav dropdown) ──────────────────────────────────
function LanguageSwitcher({ dark = false }: { dark?: boolean }) {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const currentLang = LANGUAGES.find(l => i18n.language?.startsWith(l.code)) ?? LANGUAGES[0];

  const handleSelect = (code: string) => {
    setExplicitLang(code);
    setOpen(false);
  };

  const fg = dark ? C.white : C.navy;
  const bg = dark ? "rgba(255,255,255,0.12)" : C.warm;
  const dropBg = dark ? "#162132" : C.white;
  const dropBorder = dark ? "rgba(255,255,255,0.14)" : C.border;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Switch language"
        data-testid="lang-switcher-toggle"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          padding: "7px 11px",
          borderRadius: 7,
          border: `1px solid ${dark ? "rgba(255,255,255,0.22)" : C.border}`,
          background: "transparent",
          color: fg,
          fontSize: 12,
          fontWeight: 500,
          fontFamily: SANS,
          cursor: "pointer",
        }}
        onMouseEnter={e => { e.currentTarget.style.background = bg; }}
        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
      >
        <Globe style={{ width: 14, height: 14 }} />
        <span>{currentLang.flag} {currentLang.name}</span>
        <ChevronDown style={{ width: 12, height: 12, opacity: 0.6 }} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.13 }}
            data-testid="lang-switcher-dropdown"
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              right: 0,
              minWidth: 150,
              background: dropBg,
              border: `1px solid ${dropBorder}`,
              borderRadius: 8,
              boxShadow: "0 8px 24px rgba(15,25,35,0.14)",
              zIndex: 200,
              overflow: "hidden",
            }}
          >
            {LANGUAGES.map(l => {
              const isActive = i18n.language?.startsWith(l.code);
              return (
                <button
                  key={l.code}
                  onClick={() => handleSelect(l.code)}
                  data-testid={`lang-option-${l.code}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                    padding: "9px 14px",
                    background: "transparent",
                    border: "none",
                    color: isActive ? C.gold : (dark ? C.white : C.navy),
                    fontSize: 13,
                    fontWeight: isActive ? 600 : 400,
                    fontFamily: SANS,
                    cursor: "pointer",
                    textAlign: "left",
                    gap: 8,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = dark ? "rgba(255,255,255,0.08)" : C.warm; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                >
                  <span>{l.flag} {l.name}</span>
                  {isActive && <Check style={{ width: 13, height: 13, color: C.gold }} />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── DR1-style hero stage: auto-rotating slides w/ swipe + video ──────────────
type StageSlide =
  | {
      kind: "swipe";
      before: string;
      after: string;
      beforeLabel: string;
      afterLabel: string;
      title: string;
      caption: string;
      meta: string;
      contain?: boolean;
      bg?: string;
      objectPosition?: string;
    }
  | {
      kind: "video";
      src: string;
      poster?: string;
      title: string;
      caption: string;
      meta: string;
    };

// Media-only base (text injected inside HeroStage via useTranslation)
const STAGE_SLIDES_BASE = [
  { kind: "video" as const, src: "/cinematisk-video.mp4",               poster: "/bolig-images/video-poster.jpg" },
  { kind: "video" as const, src: "/videos/transformering-kokken.mp4",   poster: "/bolig-images/transformering-kokken-poster.jpg" },
  { kind: "video" as const, src: "/videos/magisk-transformation.mp4",   poster: "/bolig-images/stue-riviera-after.png" },
  { kind: "swipe" as const, before: "/bolig-images/dining-before-new.png",   after: "/bolig-images/dining-after-new.jpg" },
  { kind: "swipe" as const, before: "/bolig-images/facade-before-new.png",   after: "/bolig-images/facade-after-new.png", objectPosition: "center center" },
  { kind: "swipe" as const, before: "/bolig-images/floorplan-2d-new.jpg",    after: "/bolig-images/floorplan-3d-new.png", contain: true, bg: "#FFFFFF" },
];

// Pre-computed: which slide indices are video slides, in order.
// Used to map slide index → videoRefs array index.
const VIDEO_SLIDE_INDICES = STAGE_SLIDES_BASE
  .map((s, i) => (s.kind === "video" ? i : -1))
  .filter((i) => i >= 0);

function HeroStage() {
  const { t } = useTranslation();
  const slideTr = t("slides", { returnObjects: true }) as Array<{
    title: string; caption: string; meta: string; beforeLabel?: string; afterLabel?: string;
  }>;
  const STAGE_SLIDES: StageSlide[] = STAGE_SLIDES_BASE.map((s, i) => {
    const tr = slideTr[i] ?? { title: "", caption: "", meta: "" };
    if (s.kind === "video") {
      return { ...s, title: tr.title, caption: tr.caption, meta: tr.meta };
    }
    return {
      ...s,
      title: tr.title,
      caption: tr.caption,
      meta: tr.meta,
      beforeLabel: tr.beforeLabel ?? t("slider.before"),
      afterLabel: tr.afterLabel ?? t("slider.after"),
    };
  });
  const [index, setIndex] = useState(0);
  const [pos, setPos] = useState(1); // swipe split (1 = fully before, 0 = fully after)
  const rafRef = useRef<number | null>(null);
  const slideStartRef = useRef<number>(performance.now());
  // One ref per video slide — always in DOM so iOS Safari autoPlay fires on page load.
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  // After a manual click we wait this long before auto-advancing resumes.
  const AUTO_RESUME_AFTER = 7000;
  const lastInteractionRef = useRef<number>(0);

  const slide = STAGE_SLIDES[index];

  // Slide timing (ms) — 3-phase reveal: hold → sweep to 50% → pull back to 20% → full reveal → rest
  const SWIPE_LEAD  = 2500;  // hold at "før"
  const SWIPE_FWD1  = 1400;  // sweep forward to 50%
  const SWIPE_BACK  = 700;   // pull back to ~20%
  const SWIPE_FWD2  = 1600;  // sweep all the way to "efter"
  const SWIPE_REST  = 3500;  // hold at "efter"
  const SWIPE_TOTAL = SWIPE_LEAD + SWIPE_FWD1 + SWIPE_BACK + SWIPE_FWD2 + SWIPE_REST;
  const VIDEO_DURATION = 9000;

  const resetTo = (next: number) => {
    slideStartRef.current = performance.now();
    setPos(1);
    setProgress(0);
    setIndex(next);
  };
  const advance = () => resetTo((index + 1) % STAGE_SLIDES.length);
  const go = (i: number) => {
    const next = ((i % STAGE_SLIDES.length) + STAGE_SLIDES.length) % STAGE_SLIDES.length;
    lastInteractionRef.current = performance.now();
    if (next === index) {
      // Re-play the current slide cleanly.
      resetTo(next === 0 ? STAGE_SLIDES.length - 1 : next);
      resetTo(next);
      return;
    }
    resetTo(next);
  };

  // When a video slide becomes active, rewind it to 0 so it plays from the start.
  // The element is always in the DOM so .play() is already running; we just reset time.
  useEffect(() => {
    const s = STAGE_SLIDES[index];
    if (s.kind !== "video") return;
    const vidIdx = VIDEO_SLIDE_INDICES.indexOf(index);
    const v = videoRefs.current[vidIdx];
    if (v) {
      v.currentTime = 0;
      v.muted = true;
      v.play().catch(() => {});
    }
  }, [index]);

  // Animation loop
  useEffect(() => {
    const tick = (now: number) => {
      const elapsed = now - slideStartRef.current;
      const sinceInteraction = now - lastInteractionRef.current;
      const autoAdvanceAllowed = sinceInteraction > AUTO_RESUME_AFTER;

      if (slide.kind === "swipe") {
        if (elapsed < SWIPE_LEAD) {
          // Phase 0: hold at "før"
          setPos(1);
        } else if (elapsed < SWIPE_LEAD + SWIPE_FWD1) {
          // Phase 1: sweep forward 1→0.5 (ease-out — starts fast, settles at midpoint)
          const t = (elapsed - SWIPE_LEAD) / SWIPE_FWD1;
          const eased = 1 - Math.pow(1 - t, 2);
          setPos(1 - eased * 0.5);
        } else if (elapsed < SWIPE_LEAD + SWIPE_FWD1 + SWIPE_BACK) {
          // Phase 2: pull back 0.5→0.8 (ease-in-out — teases the "før" back into view)
          const t = (elapsed - SWIPE_LEAD - SWIPE_FWD1) / SWIPE_BACK;
          const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
          setPos(0.5 + eased * 0.3);
        } else if (elapsed < SWIPE_LEAD + SWIPE_FWD1 + SWIPE_BACK + SWIPE_FWD2) {
          // Phase 3: final sweep 0.8→0 (cubic ease-in-out — dramatic full reveal)
          const t = (elapsed - SWIPE_LEAD - SWIPE_FWD1 - SWIPE_BACK) / SWIPE_FWD2;
          const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
          setPos(0.8 - eased * 0.8);
        } else if (elapsed < SWIPE_TOTAL || !autoAdvanceAllowed) {
          // Phase 4: hold at "efter"
          setPos(0);
        } else {
          advance();
          return;
        }
      } else {
        if (elapsed >= VIDEO_DURATION && autoAdvanceAllowed) {
          advance();
          return;
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [index]);

  // Progress 0..1 for current slide (for thin progress bar under dots)
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    let id: number;
    const loop = () => {
      const dur = slide.kind === "swipe" ? SWIPE_TOTAL : VIDEO_DURATION;
      const e = performance.now() - slideStartRef.current;
      setProgress(Math.min(1, e / dur));
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [index]);

  const splitPct = pos * 100;

  const prevIndex = (index - 1 + STAGE_SLIDES.length) % STAGE_SLIDES.length;
  const nextIndex = (index + 1) % STAGE_SLIDES.length;
  const prevSlide = STAGE_SLIDES[prevIndex];
  const nextSlide = STAGE_SLIDES[nextIndex];
  const sidePreview = (s: StageSlide) => (s.kind === "swipe" ? s.after : (s.poster ?? ""));

  return (
    <section
      className="relative"
      style={{ background: C.navy, paddingTop: 6, paddingBottom: 8 }}
      data-testid="bolig-hero-stage"
    >
      <div className="w-full px-2 sm:px-3 lg:px-4">
        <div
          className="relative w-full flex items-stretch gap-3 sm:gap-4"
          style={{ height: "min(min(72.7vh, 820px), max(260px, calc((100vw - 32px) * 9 / 21 * 0.9860)))" }}
        >
          {/* PREV peek */}
          <button
            onClick={() => go(prevIndex)}
            aria-label={`${t("hero.prev")}: ${prevSlide.title}`}
            className="hidden md:block relative overflow-hidden transition-all duration-300 group flex-shrink-0"
            style={{
              width: "16%",
              borderRadius: 14,
              background: "#000",
              boxShadow: "0 12px 32px rgba(15,25,35,0.12)",
            }}
            data-testid="bolig-hero-peek-prev"
          >
            <img src={sidePreview(prevSlide)} alt={prevSlide.title} className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
            <div className="absolute inset-0" style={{ background: "linear-gradient(to right, rgba(15,25,35,0.55) 0%, rgba(15,25,35,0.25) 100%)" }} />
            <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4 text-left">
              <div className="uppercase mb-1" style={{ color: C.gold, fontSize: 10, fontWeight: 600, letterSpacing: "0.14em" }}>{t("hero.prev")}</div>
              <div style={{ fontFamily: SERIF, color: C.white, fontSize: 15, lineHeight: 1.25, fontWeight: 500 }}>{prevSlide.title}</div>
            </div>
            <div className="absolute top-1/2 -translate-y-1/2 right-3 flex items-center justify-center transition-opacity opacity-80 group-hover:opacity-100" style={{ width: 36, height: 36, borderRadius: 999, background: "rgba(255,255,255,0.22)", backdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,0.4)" }}>
              <ChevronLeft className="w-4 h-4" style={{ color: C.white }} />
            </div>
          </button>

          {/* CENTER stage — ALL slides permanently in DOM.
              Videos get autoPlay fired on page load so iOS Safari never blocks them.
              Visibility is controlled purely by CSS opacity + transition. */}
          <div
            className="relative flex-1"
            style={{
              borderRadius: 14,
              background: "#000",
              boxShadow: "0 24px 60px rgba(15,25,35,0.22)",
              overflow: "clip",
            }}
          >
          {STAGE_SLIDES.map((s, i) => {
            const isActive = i === index;
            const vidRefIdx = s.kind === "video" ? VIDEO_SLIDE_INDICES.indexOf(i) : -1;
            // Swipe split: use live splitPct only for the active slide;
            // inactive swipe slides park at "before" (splitPct = 100).
            const pct = (s.kind === "swipe" && isActive) ? splitPct : 100;

            return (
              <div
                key={i}
                className="absolute inset-0"
                style={{
                  opacity: isActive ? 1 : 0,
                  zIndex: isActive ? 2 : 1,
                  transition: "opacity 0.35s ease-in-out",
                  pointerEvents: isActive ? "auto" : "none",
                }}
              >
                {s.kind === "swipe" ? (
                  <div className="relative w-full h-full select-none" style={{ background: s.bg ?? "#0a1219" }}>
                    <img
                      src={s.after}
                      alt={s.afterLabel}
                      className="absolute inset-0 w-full h-full"
                      style={{ objectFit: s.contain ? "contain" : "cover", objectPosition: s.objectPosition ?? "center" }}
                    />
                    <img
                      src={s.before}
                      alt={s.beforeLabel}
                      className="absolute inset-0 w-full h-full"
                      style={{ objectFit: s.contain ? "contain" : "cover", objectPosition: s.objectPosition ?? "center", clipPath: `inset(0 ${100 - pct}% 0 0)` }}
                    />
                    <div
                      className="absolute top-0 bottom-0 flex items-center"
                      style={{ left: `${pct}%`, transform: "translateX(-50%)" }}
                    >
                      <div className="w-[2px] h-full bg-white" style={{ boxShadow: "0 0 8px rgba(255,255,255,0.6)" }} />
                      <div className="absolute w-9 h-9 rounded-full bg-white shadow-lg flex items-center justify-center">
                        <ChevronLeft className="w-3.5 h-3.5 -mr-0.5" style={{ color: C.navy }} />
                        <ChevronRight className="w-3.5 h-3.5 -ml-0.5" style={{ color: C.navy }} />
                      </div>
                    </div>
                    <div
                      className="absolute top-4 left-4 text-white text-[12px] font-semibold uppercase"
                      style={{ background: C.navy, padding: "6px 13px", borderRadius: 5, letterSpacing: "0.1em", boxShadow: "0 2px 8px rgba(0,0,0,0.22)" }}
                    >
                      {s.beforeLabel}
                    </div>
                    <div
                      className="absolute top-4 right-4 text-[12px] font-semibold uppercase"
                      style={{ background: C.gold, color: C.navy, padding: "6px 13px", borderRadius: 5, letterSpacing: "0.1em", boxShadow: "0 2px 8px rgba(0,0,0,0.18)" }}
                    >
                      {s.afterLabel}
                    </div>
                  </div>
                ) : (
                  <video
                    ref={(el) => {
                      videoRefs.current[vidRefIdx] = el;
                      if (el) {
                        // iOS: set muted property programmatically before play()
                        el.muted = true;
                        el.play().catch(() => {});
                      }
                    }}
                    src={s.src}
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="auto"
                    onLoadedData={(e) => { e.currentTarget.muted = true; e.currentTarget.play().catch(() => {}); }}
                    className="absolute inset-0 w-full h-full object-cover"
                    style={{ transform: "translateZ(0)", backfaceVisibility: "hidden", willChange: "transform" }}
                    data-testid={`bolig-hero-stage-video-${i}`}
                  />
                )}

                {/* Meta chip — bottom-right */}
                {s.meta && (
                  <div className="absolute bottom-4 right-4" style={{ zIndex: 5 }}>
                    <div style={{ background: "rgba(15,25,35,0.70)", backdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,0.14)", color: "#fff", padding: "5px 12px", borderRadius: 6, fontSize: 10, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase" }}>
                      {s.meta}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Bottom gradient — text readable, images breathe */}
          <div
            className="absolute bottom-0 left-0 right-0 pointer-events-none"
            style={{ height: "65%", background: "linear-gradient(to top, rgba(8,14,22,0.80) 0%, rgba(8,14,22,0.62) 18%, rgba(8,14,22,0.38) 42%, rgba(8,14,22,0.14) 65%, transparent 100%)", zIndex: 6 }}
          />

          {/* CTA overlay — desktop */}
          <div
            className="hidden md:flex absolute left-0 right-0 bottom-0 flex-col justify-end"
            style={{ padding: "clamp(18px, 2.5vw, 36px) clamp(20px, 3.5vw, 48px)", zIndex: 7 }}
          >
            <h1 style={{ fontFamily: SERIF, color: "#fff", fontSize: "clamp(20px, 2.4vw, 36px)", fontWeight: 500, lineHeight: 1.1, letterSpacing: "-0.02em", marginBottom: 8, textShadow: "0 1px 8px rgba(0,0,0,0.25)" }}>
              {t("hero.headline")}
            </h1>
            <p style={{ color: "rgba(255,255,255,0.80)", fontSize: "clamp(12px, 1vw, 14px)", lineHeight: 1.5, marginBottom: 14, fontFamily: SANS, maxWidth: 500 }}>
              {t("hero.subline")}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/opret"
                className="inline-flex items-center gap-2 transition-all"
                style={{ background: C.gold, color: C.navy, padding: "9px 18px", borderRadius: 7, fontSize: 12, fontWeight: 600, fontFamily: SANS, boxShadow: "0 4px 16px rgba(201,169,110,0.35)", textDecoration: "none" }}
                onMouseEnter={(e: any) => { e.currentTarget.style.background = C.goldHover; e.currentTarget.style.transform = "translateY(-1px)"; }}
                onMouseLeave={(e: any) => { e.currentTarget.style.background = C.gold; e.currentTarget.style.transform = "translateY(0)"; }}
                data-testid="bolig-hero-cta"
              >
                {t("hero.cta")} <ArrowRight className="w-3.5 h-3.5" />
              </Link>
              <Link
                href="/boligpotentiale/eksempler"
                className="inline-flex items-center gap-2 transition-all"
                style={{ background: "rgba(255,255,255,0.10)", color: "#fff", padding: "9px 18px", borderRadius: 7, fontSize: 12, fontWeight: 500, fontFamily: SANS, border: "1px solid rgba(255,255,255,0.30)", backdropFilter: "blur(6px)", textDecoration: "none" }}
                onMouseEnter={(e: any) => { e.currentTarget.style.background = "rgba(255,255,255,0.18)"; }}
                onMouseLeave={(e: any) => { e.currentTarget.style.background = "rgba(255,255,255,0.10)"; }}
                data-testid="bolig-hero-cta-secondary"
              >
                {t("hero.ctaSecondary")}
              </Link>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.50)", fontFamily: SANS }}>
                {t("hero.trial")}
              </span>
            </div>
          </div>

            {/* Mobile-only side arrows (peek panels hidden < md) */}
            <button
              onClick={() => go(index - 1)}
              aria-label={t("hero.prev")}
              className="md:hidden absolute left-3 top-1/2 -translate-y-1/2 flex items-center justify-center transition-colors hover:bg-white/30"
              style={{ width: 40, height: 40, borderRadius: 999, background: "rgba(255,255,255,0.2)", backdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,0.35)", color: C.white, zIndex: 10 }}
              data-testid="bolig-hero-prev-mobile"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => go(index + 1)}
              aria-label={t("hero.next")}
              className="md:hidden absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center transition-colors hover:bg-white/30"
              style={{ width: 40, height: 40, borderRadius: 999, background: "rgba(255,255,255,0.2)", backdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,0.35)", color: C.white, zIndex: 10 }}
              data-testid="bolig-hero-next-mobile"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* NEXT peek */}
          <button
            onClick={() => go(nextIndex)}
            aria-label={`${t("hero.next")}: ${nextSlide.title}`}
            className="hidden md:block relative overflow-hidden transition-all duration-300 group flex-shrink-0"
            style={{
              width: "16%",
              borderRadius: 14,
              background: "#000",
              boxShadow: "0 12px 32px rgba(15,25,35,0.12)",
            }}
            data-testid="bolig-hero-peek-next"
          >
            <img src={sidePreview(nextSlide)} alt={nextSlide.title} className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
            <div className="absolute inset-0" style={{ background: "linear-gradient(to left, rgba(15,25,35,0.55) 0%, rgba(15,25,35,0.25) 100%)" }} />
            <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4 text-right">
              <div className="uppercase mb-1" style={{ color: C.gold, fontSize: 10, fontWeight: 600, letterSpacing: "0.14em" }}>{t("hero.next")}</div>
              <div style={{ fontFamily: SERIF, color: C.white, fontSize: 15, lineHeight: 1.25, fontWeight: 500 }}>{nextSlide.title}</div>
            </div>
            <div className="absolute top-1/2 -translate-y-1/2 left-3 flex items-center justify-center transition-opacity opacity-80 group-hover:opacity-100" style={{ width: 36, height: 36, borderRadius: 999, background: "rgba(255,255,255,0.22)", backdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,0.4)" }}>
              <ChevronRight className="w-4 h-4" style={{ color: C.white }} />
            </div>
          </button>

        </div>

        {/* Dot indicators — gold when active, grey otherwise */}
        <div className="flex items-center justify-center gap-3" style={{ marginTop: 16 }}>
          {STAGE_SLIDES.map((s, i) => {
            const active = i === index;
            return (
              <button
                key={i}
                onClick={() => go(i)}
                className="relative overflow-hidden transition-all"
                style={{
                  height: 8,
                  width: 8,
                  borderRadius: 999,
                  background: active ? C.gold : "rgba(201,169,110,0.28)",
                }}
                aria-label={s.title}
                data-testid={`bolig-hero-indicator-${i}`}
              >
                {false && active && (
                  <div
                    className="absolute inset-y-0 left-0"
                    style={{
                      width: `${progress * 100}%`,
                      background: C.gold,
                      transition: false ? "none" : "width 80ms linear",
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* ── Headline + CTAs — below the stage, mobile only (desktop has overlay) ── */}
        <div className="md:hidden" style={{ paddingTop: 28, paddingBottom: 8, paddingLeft: "clamp(16px, 3vw, 48px)", paddingRight: "clamp(16px, 3vw, 48px)" }}>
          <div style={{ maxWidth: 600 }}>
            <p style={{ fontFamily: SERIF, color: "#fff", fontSize: "clamp(26px, 3.2vw, 44px)", fontWeight: 500, lineHeight: 1.08, letterSpacing: "-0.02em", marginBottom: 12 }}>
              {t("hero.headline")}
            </p>
            <p style={{ color: "rgba(255,255,255,0.75)", fontSize: "clamp(13px, 1.1vw, 15px)", lineHeight: 1.6, marginBottom: 22, fontFamily: SANS }}>
              {t("hero.subline")}
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <Link href="/opret">
                <button
                  className="inline-flex items-center gap-2 transition-all"
                  style={{ background: C.gold, color: C.navy, padding: "12px 24px", borderRadius: 7, fontSize: "clamp(13px, 1vw, 14px)", fontWeight: 600, fontFamily: SANS, boxShadow: "0 4px 16px rgba(201,169,110,0.35)" }}
                  onMouseEnter={e => { e.currentTarget.style.background = C.goldHover; e.currentTarget.style.transform = "translateY(-1px)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = C.gold; e.currentTarget.style.transform = "translateY(0)"; }}
                  data-testid="bolig-hero-cta-mobile"
                >
                  {t("hero.ctaMobile", "Kom i gang gratis")} <ArrowRight className="w-4 h-4" />
                </button>
              </Link>
              <Link href="/boligpotentiale/eksempler">
                <button
                  className="inline-flex items-center gap-2 transition-all"
                  style={{ background: "transparent", color: "#fff", padding: "12px 24px", borderRadius: 7, fontSize: "clamp(13px, 1vw, 14px)", fontWeight: 500, fontFamily: SANS, border: "1px solid rgba(255,255,255,0.35)" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                  data-testid="bolig-hero-cta-secondary-mobile"
                >
                  {t("hero.ctaSecondary")}
                </button>
              </Link>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.50)", fontFamily: SANS, margin: 0 }} data-testid="bolig-hero-trial-note">
                {t("hero.trial")}
              </p>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
// ── Auto-play hero slider with smooth swipe animation ─────────────────────────
function HeroSliderSection() {
  const { t } = useTranslation();
  const [pairIndex, setPairIndex] = useState(0);
  const [pos, setPos] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [manualPos, setManualPos] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const phaseRef = useRef<"show-before" | "sweep-in" | "show-after" | "sweep-out">("show-before");

  const pair = HERO_PAIRS[pairIndex];
  const displayPos = manualPos !== null ? manualPos : pos;

  useEffect(() => {
    if (dragging) return;
    phaseRef.current = "show-before";
    startTimeRef.current = performance.now();
    setPos(1);
    setManualPos(null);

    const PHASE_BEFORE = 4000;
    const PHASE_SWEEP_IN = 3000;
    const PHASE_AFTER = 4000;
    const PHASE_SWEEP_OUT = 600;

    const tick = (now: number) => {
      const elapsed = now - startTimeRef.current;
      const phase = phaseRef.current;
      if (phase === "show-before") {
        setPos(1);
        if (elapsed >= PHASE_BEFORE) { phaseRef.current = "sweep-in"; startTimeRef.current = now; }
      } else if (phase === "sweep-in") {
        const t = Math.min(elapsed / PHASE_SWEEP_IN, 1);
        const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        setPos(1 - eased);
        if (elapsed >= PHASE_SWEEP_IN) { phaseRef.current = "show-after"; startTimeRef.current = now; setPos(0); }
      } else if (phase === "show-after") {
        setPos(0);
        if (elapsed >= PHASE_AFTER) { phaseRef.current = "sweep-out"; startTimeRef.current = now; }
      } else if (phase === "sweep-out") {
        const t = Math.min(elapsed / PHASE_SWEEP_OUT, 1);
        setPos(t);
        if (elapsed >= PHASE_SWEEP_OUT) { setPairIndex((p) => (p + 1) % HERO_PAIRS.length); return; }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [pairIndex, dragging]);

  const updateManualPos = (clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    setManualPos(pct);
  };

  useEffect(() => {
    if (!dragging) { setManualPos(null); return; }
    const onMove = (e: MouseEvent | TouchEvent) => {
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      updateManualPos(clientX);
    };
    const onUp = () => setDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("touchmove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchend", onUp);
    };
  }, [dragging]);

  const splitPct = displayPos * 100;

  return (
    <div className="w-full" data-testid="bolig-hero-slider">
      <div
        ref={containerRef}
        className="relative w-full aspect-[4/3] overflow-hidden select-none cursor-col-resize"
        style={{ borderRadius: 12, boxShadow: C.shadowCard }}
        onMouseDown={(e) => { setDragging(true); updateManualPos(e.clientX); }}
        onTouchStart={(e) => { setDragging(true); updateManualPos(e.touches[0].clientX); }}
      >
        <img src={pair.after} alt="After" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 overflow-hidden" style={{ width: `${splitPct}%` }}>
          <img src={pair.before} alt="Before" className="absolute inset-0 h-full object-cover" style={{ width: `${100 / ((splitPct / 100) || 0.001)}%` }} />
        </div>
        <div className="absolute top-0 bottom-0 flex items-center" style={{ left: `${splitPct}%`, transform: "translateX(-50%)" }}>
          <div className="w-[2px] h-full bg-white/85" />
          <div className="absolute w-9 h-9 rounded-full bg-white shadow-lg flex items-center justify-center">
            <ChevronLeft className="w-3.5 h-3.5 -mr-0.5" style={{ color: C.navy }} />
            <ChevronRight className="w-3.5 h-3.5 -ml-0.5" style={{ color: C.navy }} />
          </div>
        </div>
        <div className="absolute top-3 left-3 text-white text-[11px] font-medium uppercase" style={{ background: C.navy, padding: "4px 10px", borderRadius: 4, letterSpacing: "0.1em" }}>{t("slider.before")}</div>
        <div className="absolute top-3 right-3 text-white text-[11px] font-medium uppercase" style={{ background: C.navy, padding: "4px 10px", borderRadius: 4, letterSpacing: "0.1em" }}>{t("slider.after")}</div>
        <div className="absolute bottom-3 right-3 text-white text-[10px] font-semibold" style={{ background: "rgba(0,0,0,0.52)", padding: "3px 8px", borderRadius: 4, letterSpacing: "0.08em" }}>{t("slider.aiEdited")}</div>
      </div>

      <div className="flex justify-center gap-2 mt-5">
        {HERO_PAIRS.map((_, i) => (
          <button
            key={i}
            onClick={() => { setPairIndex(i); setManualPos(null); }}
            className="h-1.5 rounded-full transition-all duration-300"
            style={{
              width: i === pairIndex ? 32 : 6,
              background: i === pairIndex ? C.gold : C.border,
            }}
            data-testid={`bolig-hero-dot-${i}`}
          />
        ))}
      </div>
      <p className="text-center text-[13px] mt-3" style={{ color: C.muted }}>{t(`heroSlider.pairs.${pairIndex}.label`)} · {t("slider.dragToCompare")}</p>
    </div>
  );
}

// ── Cookie consent banner — now in client/src/components/cookie-banner.tsx ───
// (Global version mounted in App.tsx — this local definition has been removed.)
function _CookieBannerLegacy_UNUSED() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [stats, setStats] = useState(false);
  const [prefs, setPrefs] = useState(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem("forma-cookie-consent");
      if (!v) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  const applyGaConsent = (statistics: boolean) => {
    try {
      (window as any)['ga-disable-G-5BRC2FMPNT'] = !statistics;
      if (statistics && typeof (window as any).gtag === 'function') {
        (window as any).gtag('event', 'page_view');
      }
    } catch {}
  };

  const persist = (consent: { necessary: true; statistics: boolean; preferences: boolean }) => {
    try {
      localStorage.setItem("forma-cookie-consent", JSON.stringify({ ...consent, ts: Date.now() }));
    } catch {}
    applyGaConsent(consent.statistics);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <>
      <div
        className="fixed bottom-0 left-0 right-0 z-[61] px-6 py-7"
        style={{ background: "#0F1923", borderTop: `1px solid ${C.goldBorder}`, fontFamily: SANS }}
        data-testid="bolig-cookie-banner"
      >
        <div className="mx-auto max-w-6xl grid lg:grid-cols-[1.4fr_1fr] gap-6 lg:gap-10 items-start">
          <div>
            <h3 style={{ fontFamily: SERIF, color: C.white, fontSize: 20, fontWeight: 500, marginBottom: 8 }}>
              {t("cookie.title")}
            </h3>
            <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, lineHeight: 1.6, marginBottom: 16, maxWidth: 560 }}>
              {t("cookie.text")}
            </p>
            <div className="flex flex-wrap gap-x-7 gap-y-3">
              <label className="inline-flex items-center gap-2.5" style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, cursor: "not-allowed" }}>
                <input type="checkbox" checked disabled style={{ width: 16, height: 16, accentColor: C.gold }} data-testid="bolig-cookie-necessary" />
                {t("cookie.necessary")}
              </label>
              <label className="inline-flex items-center gap-2.5" style={{ color: "rgba(255,255,255,0.85)", fontSize: 13, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={stats}
                  onChange={(e) => setStats(e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: C.gold }}
                  data-testid="bolig-cookie-statistics"
                />
                {t("cookie.statistics")}
              </label>
              <label className="inline-flex items-center gap-2.5" style={{ color: "rgba(255,255,255,0.85)", fontSize: 13, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={prefs}
                  onChange={(e) => setPrefs(e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: C.gold }}
                  data-testid="bolig-cookie-preferences"
                />
                {t("cookie.preferences")}
              </label>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row lg:flex-col gap-3 lg:items-stretch">
            <button
              onClick={() => persist({ necessary: true, statistics: stats, preferences: prefs })}
              className="transition-colors hover:bg-[color:var(--gold-h)]"
              style={{
                ['--gold-h' as any]: C.goldHover,
                background: C.gold,
                color: C.navy,
                padding: "12px 22px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
              }}
              data-testid="bolig-cookie-save"
            >
              {t("cookie.save")}
            </button>
            <button
              onClick={() => persist({ necessary: true, statistics: true, preferences: true })}
              className="transition-colors hover:bg-white hover:text-[color:var(--navy)]"
              style={{
                ['--navy' as any]: C.navy,
                background: "transparent",
                color: C.white,
                border: "1px solid rgba(255,255,255,0.5)",
                padding: "12px 22px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 500,
              }}
              data-testid="bolig-cookie-accept-all"
            >
              {t("cookie.acceptAll")}
            </button>
            <button
              onClick={() => persist({ necessary: true, statistics: false, preferences: false })}
              className="transition-colors hover:bg-white hover:text-[color:var(--navy)]"
              style={{
                ['--navy' as any]: C.navy,
                background: "transparent",
                color: C.white,
                border: "1px solid rgba(255,255,255,0.5)",
                padding: "12px 22px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 500,
              }}
              data-testid="bolig-cookie-reject"
            >
              {t("cookie.reject")}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: `1px solid ${C.border}` }} data-testid="bolig-faq-item">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between text-left gap-4"
        style={{ padding: "24px 0" }}
        data-testid="bolig-faq-toggle"
      >
        <span style={{ color: C.navy, fontWeight: 500, fontSize: 16 }}>{q}</span>
        <ChevronDown className={`w-5 h-5 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} style={{ color: C.gold }} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <p style={{ paddingBottom: 24, color: C.muted, fontSize: 15, lineHeight: 1.7 }} dangerouslySetInnerHTML={{ __html: a }} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Section overline ──────────────────────────────────────────────────────────
function Overline({ children, light = false }: { children: React.ReactNode; light?: boolean }) {
  return (
    <p
      className="mb-4 uppercase"
      style={{
        color: light ? C.gold : C.gold,
        fontSize: 12,
        fontWeight: 500,
        letterSpacing: "0.15em",
        fontFamily: SANS,
      }}
    >
      {children}
    </p>
  );
}

// ── Reusable manual swipe slider (for floorplan + AI agent sections) ─────────
function ManualSwipeSlider({
  before,
  after,
  beforeLabel,
  afterLabel,
  initial = 0.5,
  aspect = "aspect-[4/3]",
  testId,
}: {
  before: string;
  after: string;
  beforeLabel?: string;
  afterLabel?: string;
  initial?: number;
  aspect?: string;
  testId?: string;
}) {
  const { t } = useTranslation();
  const resolvedBefore = beforeLabel ?? t("slider.before");
  const resolvedAfter = afterLabel ?? t("slider.after");
  const [pos, setPos] = useState(initial);
  const [dragging, setDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const updatePos = (clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    setPos(pct);
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent | TouchEvent) => {
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      updatePos(clientX);
    };
    const onUp = () => setDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("touchmove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchend", onUp);
    };
  }, [dragging]);

  const splitPct = pos * 100;

  return (
    <div
      ref={containerRef}
      className={`relative w-full ${aspect} overflow-hidden select-none cursor-col-resize`}
      style={{ borderRadius: 12, boxShadow: C.shadowCard }}
      onMouseDown={(e) => { setDragging(true); updatePos(e.clientX); }}
      onTouchStart={(e) => { setDragging(true); updatePos(e.touches[0].clientX); }}
      data-testid={testId}
    >
      <img src={after} alt={resolvedAfter} className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 overflow-hidden" style={{ width: `${splitPct}%` }}>
        <img
          src={before}
          alt={resolvedBefore}
          className="absolute inset-0 h-full object-cover"
          style={{ width: `${100 / ((splitPct / 100) || 0.001)}%` }}
        />
      </div>
      <div className="absolute top-0 bottom-0 flex items-center" style={{ left: `${splitPct}%`, transform: "translateX(-50%)" }}>
        <div className="w-[2px] h-full bg-white/85" />
        <div className="absolute w-9 h-9 rounded-full bg-white shadow-lg flex items-center justify-center">
          <ChevronLeft className="w-3.5 h-3.5 -mr-0.5" style={{ color: C.navy }} />
          <ChevronRight className="w-3.5 h-3.5 -ml-0.5" style={{ color: C.navy }} />
        </div>
      </div>
      <div className="absolute top-3 left-3 text-white text-[11px] font-medium uppercase" style={{ background: C.navy, padding: "4px 10px", borderRadius: 4, letterSpacing: "0.1em" }}>{resolvedBefore}</div>
      <div className="absolute top-3 right-3 text-white text-[11px] font-medium uppercase" style={{ background: C.gold, color: C.navy, padding: "4px 10px", borderRadius: 4, letterSpacing: "0.1em" }}>{resolvedAfter}</div>
      <div className="absolute bottom-3 right-3 text-white text-[10px] font-semibold" style={{ background: "rgba(0,0,0,0.52)", padding: "3px 8px", borderRadius: 4, letterSpacing: "0.08em" }}>{t("slider.aiEdited")}</div>
    </div>
  );
}

function H2({ children, light = false, style }: { children: React.ReactNode; light?: boolean; style?: React.CSSProperties }) {
  return (
    <h2
      style={{
        fontFamily: SERIF,
        fontWeight: 500,
        color: light ? C.white : C.navy,
        fontSize: "clamp(28px, 4vw, 42px)",
        lineHeight: 1.2,
        letterSpacing: "-0.01em",
        ...style,
      }}
    >
      {children}
    </h2>
  );
}

const PLAN_PRICE_IDS: Record<string, { monthly: string; yearly: string }> = {
  Start:    { monthly: "price_1Tl2kVKDpJP0jg0e2UqApR5B", yearly: "price_1Tl2rVKDpJP0jg0erJ0x7FZs" },
  Pro:      { monthly: "price_1Tl2nYKDpJP0jg0eMbTJQ2jx", yearly: "price_1Tl2soKDpJP0jg0eREm8LuB4" },
  Business: { monthly: "price_1Tl2pZKDpJP0jg0etHHBwE52", yearly: "price_1Tl2uiKDpJP0jg0eAXRwj3Al" },
};

function TileWiper({ before, after, labels = ["FØR", "EFTER"] }: { before: string; after: string; labels?: [string, string] }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const delays = [2600, 1400, 2600, 1400];
    let id: ReturnType<typeof setTimeout>;
    const advance = (s: number) => {
      id = setTimeout(() => { const n = (s + 1) % 4; setStep(n); advance(n); }, delays[s]);
    };
    advance(0);
    return () => clearTimeout(id);
  }, []);
  const clip = (step === 1 || step === 2) ? "0%" : "100%";
  const animate = step === 1 || step === 3;
  return (
    <div className="absolute inset-0">
      <img src={before} alt="" className="absolute inset-0 w-full h-full object-cover" />
      <img src={after} alt="" className="absolute inset-0 w-full h-full object-cover"
        style={{ clipPath: `inset(0 ${clip} 0 0)`, transition: animate ? "clip-path 1.4s ease-in-out" : "none" }} />
      <div className="absolute bottom-3 left-3 pointer-events-none"
        style={{ background: "rgba(15,25,35,0.72)", color: "#fff", fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", padding: "4px 9px", borderRadius: 4, opacity: step === 0 ? 1 : 0, transition: "opacity 0.5s" }}>
        {labels[0]}
      </div>
      <div className="absolute bottom-3 right-3 pointer-events-none"
        style={{ background: "rgba(197,161,82,0.92)", color: "#fff", fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", padding: "4px 9px", borderRadius: 4, opacity: step === 2 ? 1 : 0, transition: "opacity 0.5s" }}>
        {labels[1]}
      </div>
    </div>
  );
}

function TileCarousel({ images }: { images: string[] }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setIdx(i => (i + 1) % images.length), 2600);
    return () => clearInterval(id);
  }, [images.length]);
  return (
    <div className="absolute inset-0">
      {images.map((src, i) => (
        <img key={src} src={src} alt="" className="absolute inset-0 w-full h-full object-cover"
          style={{ opacity: i === idx ? 1 : 0, transition: "opacity 0.9s ease-in-out" }} />
      ))}
      <div className="absolute bottom-3.5 left-0 right-0 flex justify-center gap-1.5 pointer-events-none">
        {images.map((_, i) => (
          <span key={i} style={{ display: "block", width: i === idx ? 20 : 6, height: 5, borderRadius: 3, background: i === idx ? "rgba(197,161,82,0.95)" : "rgba(255,255,255,0.55)", transition: "all 0.4s ease" }} />
        ))}
      </div>
    </div>
  );
}

export default function BoligpotentialeLanding() {
  const { t, i18n: i18nCtx } = useTranslation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeNav, setActiveNav] = useState<string>("home");
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  const [openFeature, setOpenFeature] = useState<number | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  // Build translated data arrays (re-computed on language change)
  const NAV_LINKS = NAV_LINKS_BASE.map(l => ({ ...l, label: t(`nav.${l.navKey}`) }));
  const HOW_IT_WORKS = HOW_IT_WORKS_BASE.map((s, i) => ({
    ...s,
    title: t(`howItWorks.steps.${i}.title`),
    desc: t(`howItWorks.steps.${i}.desc`),
  }));
  const FEATURES = FEATURES_BASE.map((f, i) => ({
    ...f,
    title: t(`features.items.${i}.title`),
    desc: t(`features.items.${i}.desc`),
    more: FEATURES_WITH_MORE.has(i) ? t(`features.items.${i}.more`) : undefined,
  }));
  const PRICING: Plan[] = PRICING_BASE.map(p => ({
    ...p,
    cta: t(`pricing.plans.${p.name}.cta`),
    features: t(`pricing.plans.${p.name}.features`, { returnObjects: true }) as string[],
  }));
  const FAQS = t("faq.items", { returnObjects: true }) as Array<{ q: string; a: string }>;

  const startCheckout = async (planName: string) => {
    const priceId = PLAN_PRICE_IDS[planName]?.[billing];
    if (!priceId) return;
    setCheckoutLoading(planName);
    try {
      const res = await fetch("/api/create-subscription-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId, customerEmail: "" }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else alert(t("pricing.checkoutFailed"));
    } catch {
      alert(t("pricing.checkoutFailed"));
    } finally {
      setCheckoutLoading(null);
    }
  };

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // SPA-navigation (pushState) udløser ikke browserens indbyggede anker-scroll,
  // så "Opgrader"-knapper der peger på /boligpotentiale#pricing landede bare i
  // toppen af forsiden. Scroll manuelt til hash'en når siden mounter (med
  // retries indtil sektionen er renderet) og ved efterfølgende hash-skift.
  useEffect(() => {
    let cancelled = false;
    const scrollToHash = () => {
      const id = window.location.hash.replace("#", "");
      if (!id) return;
      let attempts = 0;
      const tryScroll = () => {
        if (cancelled) return;
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        else if (attempts++ < 30) setTimeout(tryScroll, 100);
      };
      tryScroll();
    };
    scrollToHash();
    window.addEventListener("hashchange", scrollToHash);
    return () => { cancelled = true; window.removeEventListener("hashchange", scrollToHash); };
  }, []);

  const formatPrice = (monthly: number | null) => {
    if (monthly === null) return null;
    if (billing === "monthly") return monthly.toLocaleString("da-DK");
    const yearly = Math.round(monthly * 0.8);
    return yearly.toLocaleString("da-DK");
  };

  return (
    <div className="min-h-screen" style={{ background: C.champagne, color: C.text, fontFamily: SANS }}>

      {/* ── NAV ── */}
      <header
        className="relative z-30"
        style={{
          background: C.champagne,
          borderBottom: "1px solid transparent",
        }}
      >
        {/* Top utility bar — clean centered wordmark with thin underline (DR1-style) */}
        <div
          className="flex items-center justify-center relative"
          style={{ height: 32, paddingTop: 10 }}
          data-testid="bolig-nav-wordmark-bar"
        >
          <span
            className="uppercase"
            style={{
              fontFamily: SERIF,
              color: C.navy,
              fontSize: "clamp(10px, 2.8vw, 14px)",
              fontWeight: 700,
              letterSpacing: "0.42em",
              lineHeight: 1,
              paddingLeft: "0.42em",
            }}
          >
            FORMA ESTATES
          </span>
          <div
            className="absolute left-1/2 -translate-x-1/2"
            style={{ bottom: 0, width: "clamp(160px, 60vw, 280px)", height: 1, background: "#9A8F7C" }}
          />
        </div>

        <div
          className="mx-auto max-w-7xl flex items-center justify-between px-6 relative"
          style={{ height: 72, borderBottom: `1px solid ${C.border}` }}
        >
          <div className="flex items-center gap-10">
            <Link href="/boligpotentiale">
              <div className="flex items-center cursor-pointer select-none" data-testid="bolig-nav-logo">
                <img
                  src={formaEstatesLogo}
                  alt="Forma Estates"
                  className="w-auto"
                  style={{ height: "clamp(52px, 14vw, 150px)" }}
                />
              </div>
            </Link>

            <nav className="hidden md:flex items-stretch gap-7 self-stretch">
              {NAV_LINKS.map((l) => {
                const isActive = activeNav === l.navKey;
                const isInternalPage = l.href.startsWith("/");
                const content = (
                  <span className="relative inline-block group-hover:text-[color:var(--nav-hover)] transition-colors" style={{ ['--nav-hover' as any]: C.navy, paddingBottom: 6 }}>
                    {l.label}
                    <span
                      className="absolute transition-all duration-200"
                      style={{
                        left: "15%",
                        right: "15%",
                        bottom: 0,
                        height: isActive ? 2 : 0,
                        background: C.navy,
                      }}
                    />
                  </span>
                );
                const className = "group relative transition-colors flex items-center";
                const style = {
                  color: isActive ? C.navy : C.muted,
                  fontSize: 13,
                  fontWeight: isActive ? 700 : 500,
                  letterSpacing: "0.1em" as const,
                };
                if (isInternalPage) {
                  return (
                    <Link
                      key={l.navKey}
                      href={l.href}
                      onClick={() => setActiveNav(l.navKey)}
                      className={className}
                      style={style}
                      data-testid={`bolig-nav-${l.navKey}`}
                    >
                      {content}
                    </Link>
                  );
                }
                return (
                  <a
                    key={l.navKey}
                    href={l.href}
                    onClick={() => setActiveNav(l.navKey)}
                    className={className}
                    style={style}
                    data-testid={`bolig-nav-${l.navKey}`}
                  >
                    {content}
                  </a>
                );
              })}
            </nav>
          </div>

          <div className="hidden md:flex items-center gap-3">
            <LanguageSwitcher />
            <Link href="/kontakt">
              <button
                className="transition-colors hover:bg-[color:var(--bg-warm)]"
                style={{ ['--bg-warm' as any]: C.warm, padding: "10px 24px", borderRadius: 8, border: `1px solid ${C.navy}`, color: C.navy, fontSize: 13, fontWeight: 500, background: "transparent", fontFamily: SANS }}
                data-testid="bolig-nav-contact"
              >
                {t("nav.contact")}
              </button>
            </Link>
            <Link href="/login?redirect=/boligpotentiale/dashboard">
              <button
                className="transition-colors hover:bg-[color:var(--bg-warm)]"
                style={{ ['--bg-warm' as any]: C.warm, padding: "10px 24px", borderRadius: 8, border: `1px solid ${C.navy}`, color: C.navy, fontSize: 13, fontWeight: 500, background: "transparent", fontFamily: SANS }}
                data-testid="bolig-nav-login"
              >
                {t("nav.login")}
              </button>
            </Link>
            <Link href="/opret">
              <button
                className="text-white transition-colors hover:bg-[color:var(--gold-h)]"
                style={{ ['--gold-h' as any]: C.goldHover, padding: "10px 24px", borderRadius: 8, background: C.gold, fontSize: 13, fontWeight: 500, fontFamily: SANS }}
                data-testid="bolig-nav-cta"
              >
                {t("nav.getStarted")}
              </button>
            </Link>
          </div>

          <div className="md:hidden flex items-center gap-2">
            <Link href="/opret">
              <button
                style={{ background: C.gold, color: C.navy, padding: "7px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, fontFamily: SANS }}
                data-testid="bolig-mobile-nav-cta"
              >
                {t("nav.getStarted")}
              </button>
            </Link>
            <button
              className="p-2"
              onClick={() => setMobileOpen((o) => !o)}
              style={{ color: C.navy }}
              data-testid="bolig-mobile-menu-toggle"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="md:hidden px-6 py-6 flex flex-col gap-5"
              style={{ background: C.champagne, borderTop: `1px solid ${C.border}` }}
              data-testid="bolig-mobile-menu"
            >
              {NAV_LINKS.map((l) => (
                <a
                  key={l.navKey}
                  href={l.href}
                  onClick={() => setMobileOpen(false)}
                  style={{ color: C.muted, fontSize: 13, fontWeight: 500, letterSpacing: "0.12em" }}
                >
                  {l.label}
                </a>
              ))}
              {/* Mobile language switcher */}
              <div className="flex flex-wrap gap-2 pb-1">
                {LANGUAGES.map(lang => (
                  <button
                    key={lang.code}
                    onClick={() => { setExplicitLang(lang.code); setMobileOpen(false); }}
                    className="flex items-center gap-1 text-xs rounded-full px-2.5 py-1.5 border transition-colors"
                    style={{
                      background: i18nCtx.language === lang.code ? C.navy : "transparent",
                      color: i18nCtx.language === lang.code ? "white" : C.muted,
                      border: `1px solid ${i18nCtx.language === lang.code ? C.navy : C.border}`,
                      fontFamily: SANS,
                    }}
                    data-testid={`bolig-mobile-lang-${lang.code}`}
                  >
                    {lang.flag} {lang.name}
                  </button>
                ))}
              </div>
              <Link
                href="/login?redirect=/boligpotentiale/dashboard"
                className="block w-full mt-2 text-center"
                style={{ padding: "12px 24px", borderRadius: 8, border: `1px solid ${C.navy}`, color: C.navy, fontSize: 13, fontWeight: 500, background: "transparent", textDecoration: "none" }}
                data-testid="bolig-mobile-login"
              >
                {t("nav.login")}
              </Link>
              <Link
                href="/opret"
                className="block w-full text-center text-white"
                style={{ padding: "12px 24px", borderRadius: 8, background: C.gold, fontSize: 13, fontWeight: 500, textDecoration: "none" }}
                data-testid="bolig-mobile-cta"
              >
                {t("nav.getStarted")}
              </Link>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* ── HERO STAGE (DR1-style auto-rotating showcase) ── */}
      <div id="top" style={{ background: C.navy }} data-testid="bolig-hero">
        <HeroStage />

        {/* Compact scroll cue */}
        <div className="flex justify-center" style={{ paddingBottom: 8, paddingTop: 2 }}>
          <a href="#how-it-works" style={{ color: "rgba(228,203,148,0.6)" }} data-testid="bolig-hero-scroll-cue">
            <motion.div
              animate={{ y: [0, 5, 0] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
              className="flex items-center justify-center rounded-full"
              style={{ width: 24, height: 24, border: "1px solid rgba(228,203,148,0.3)" }}
            >
              <ChevronDown className="w-3 h-3" />
            </motion.div>
          </a>
        </div>
      </div>

      <TrustMarquee />

      {/* ── EU AI ACT COMPLIANCE STRIP ── */}
      <div style={{ background: "#080F1A", borderBottom: "1px solid rgba(200,149,108,0.14)", padding: "18px 24px" }}>
        <div className="mx-auto flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-10" style={{ maxWidth: 1080 }}>
          {/* Ikon + tekst */}
          <div className="flex items-start gap-4" style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              width: 36, height: 36, borderRadius: "50%", flexShrink: 0, marginTop: 1,
              background: "rgba(200,149,108,0.10)", border: "1px solid rgba(200,149,108,0.28)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
            }}>🔒</div>
            <div>
              <div style={{ color: "#C8956C", fontSize: 11, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 5, fontFamily: SANS }}>
                {t("euCompliance.title")}
              </div>
              <div style={{ color: "rgba(245,243,239,0.55)", fontSize: 12, lineHeight: 1.6, fontFamily: SANS, maxWidth: 640 }}>
                {t("euCompliance.body")}
              </div>
            </div>
          </div>
          {/* Compliance badges */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap" style={{ flexShrink: 0, paddingLeft: 52 }} >
            {[t("euCompliance.badge1"), t("euCompliance.badge2")].map((badge) => (
              <span key={badge} style={{
                background: "rgba(200,149,108,0.08)",
                border: "1px solid rgba(200,149,108,0.28)",
                borderRadius: 4,
                padding: "4px 10px",
                fontSize: 10,
                color: "#C8956C",
                fontWeight: 600,
                letterSpacing: "0.06em",
                whiteSpace: "nowrap",
                fontFamily: SANS,
              }}>{badge}</span>
            ))}
          </div>
        </div>
      </div>

      {/* ── SAVINGS NUDGE ── */}
      <div style={{ background: "#0B1929", borderBottom: "1px solid rgba(200,149,108,0.12)", padding: "8px 24px" }}>
        <div className="flex justify-center">
          <a
            href="#sammenligning"
            style={{ fontSize: 11, color: "rgba(245,243,239,0.42)", fontFamily: SANS, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}
            onMouseEnter={e => { e.currentTarget.style.color = "rgba(245,243,239,0.75)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "rgba(245,243,239,0.42)"; }}
          >
            {t("savingsNudge.text")}{" "}
            <span style={{ color: "#C8956C", textDecoration: "underline", textUnderlineOffset: "2px" }}>{t("savingsNudge.link")}</span>
          </a>
        </div>
      </div>

      {/* ── CATEGORY TABS — navy background with gold text ── */}
      <section style={{ background: C.navy, paddingTop: 10, paddingBottom: 12 }} className="px-4 sm:px-6" data-testid="bolig-category-pills">
        <div className="mx-auto" style={{ maxWidth: 1280 }}>
          <div className="flex items-center justify-start sm:justify-center gap-5 sm:gap-7 lg:gap-9 overflow-x-auto" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
            {[
              { label: t("categoryTabs.howItWorks"), href: "#how-it-works" },
              { label: t("categoryTabs.examples"), href: "/boligpotentiale/eksempler" },
              { label: t("categoryTabs.prices"), href: "#pricing" },
            ].map((p) => {
              const tabStyle = {
                color: C.gold,
                fontSize: "0.7rem",
                fontWeight: 600,
                letterSpacing: "0.14em",
                textTransform: "uppercase" as const,
                paddingBottom: 4,
                borderBottom: "1px solid transparent",
              };
              const tabClass = "transition-colors whitespace-nowrap";
              const onEnter = (e: any) => { e.currentTarget.style.color = "#E4CB94"; e.currentTarget.style.borderBottomColor = "#E4CB94"; };
              const onLeave = (e: any) => { e.currentTarget.style.color = C.gold; e.currentTarget.style.borderBottomColor = "transparent"; };
              if (p.href.startsWith("/")) {
                return (
                  <Link
                    key={p.label}
                    href={p.href}
                    className={tabClass}
                    style={tabStyle}
                    onMouseEnter={onEnter}
                    onMouseLeave={onLeave}
                    data-testid={`bolig-pill-${p.label}`}
                  >
                    {p.label}
                  </Link>
                );
              }
              return (
                <a
                  key={p.label}
                  href={p.href}
                  className={tabClass}
                  style={tabStyle}
                  onMouseEnter={onEnter}
                  onMouseLeave={onLeave}
                  data-testid={`bolig-pill-${p.label}`}
                >
                  {p.label}
                </a>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── FORVANDLINGSVIDEO ── */}
      <section style={{ background: C.navyDeep, paddingTop: "clamp(56px, 8vw, 100px)", paddingBottom: "clamp(56px, 8vw, 100px)" }} className="px-6" data-testid="bolig-transformation-video">
        <div className="mx-auto max-w-6xl">
          <div className="grid md:grid-cols-2 gap-12 lg:gap-20 items-center">
            {/* ── Text ── */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.65, ease: "easeOut" }}
            >
              <p className="uppercase mb-5" style={{ color: C.gold, fontSize: 11, fontWeight: 600, letterSpacing: "0.22em", fontFamily: SANS }}>
                {t("videoSection.overline")}
              </p>
              <h2 style={{ fontFamily: SERIF, color: C.white, fontSize: "clamp(26px, 3.8vw, 42px)", fontWeight: 500, lineHeight: 1.15, letterSpacing: "-0.01em", marginBottom: 18 }}>
                {t("videoSection.headline")}
              </h2>
              <p style={{ color: "rgba(255,255,255,0.62)", fontSize: 16, lineHeight: 1.75, marginBottom: 36, maxWidth: 440, fontFamily: SANS }}>
                {t("videoSection.subline")}
              </p>
              <Link href="/boligpotentiale/eksempler">
                <button
                  className="inline-flex items-center gap-2 transition-all"
                  style={{ background: C.gold, color: C.navy, padding: "13px 28px", borderRadius: 8, fontSize: 14, fontWeight: 600, fontFamily: SANS, boxShadow: "0 4px 18px rgba(201,169,110,0.32)" }}
                  onMouseEnter={e => { e.currentTarget.style.background = C.goldHover; e.currentTarget.style.transform = "translateY(-2px)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = C.gold; e.currentTarget.style.transform = "translateY(0)"; }}
                  data-testid="bolig-video-section-cta"
                >
                  {t("videoSection.cta")} <ArrowRight className="w-4 h-4" />
                </button>
              </Link>
            </motion.div>

            {/* ── Video — portrait 9:16 ── */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.65, delay: 0.12, ease: "easeOut" }}
              className="flex justify-center md:justify-end"
            >
              <div style={{ width: "min(320px, 100%)", position: "relative" }}>
                {/* Subtle glow behind the phone */}
                <div style={{ position: "absolute", inset: 0, borderRadius: 32, background: "radial-gradient(ellipse at center, rgba(201,169,110,0.18) 0%, transparent 70%)", transform: "scale(1.12)", pointerEvents: "none" }} />
                {/* Video container — phone-style rounded frame */}
                <div style={{ borderRadius: 28, overflow: "hidden", aspectRatio: "9 / 16", boxShadow: "0 32px 72px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.08)", position: "relative", background: "#000" }}>
                  <video
                    src="/videos/forvandling-riviera.mp4"
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="auto"
                    className="absolute inset-0 w-full h-full object-cover"
                    data-testid="bolig-transformation-video-el"
                  />
                  {/* Badge overlay at bottom */}
                  <div className="absolute bottom-5 left-1/2 -translate-x-1/2">
                    <div style={{ background: "rgba(10,18,28,0.85)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", border: "1px solid rgba(201,169,110,0.40)", padding: "8px 18px", borderRadius: 24, whiteSpace: "nowrap" }}>
                      <span style={{ color: C.gold, fontSize: 11.5, fontWeight: 700, letterSpacing: "0.06em", fontFamily: SANS }}>
                        {t("videoSection.badge")}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── HVORFOR VISUALISERING — cinematic image-led tiles ── */}
      <section style={{ background: C.warm, paddingTop: "clamp(48px, 6vw, 80px)", paddingBottom: "clamp(52px, 7vw, 96px)" }} className="px-4 sm:px-6" data-testid="bolig-why-visualisering">
        <div className="mx-auto" style={{ maxWidth: 1280 }}>
          <div className="text-center mb-14">
            <span
              className="uppercase"
              style={{ color: C.gold, fontSize: 11, fontWeight: 600, letterSpacing: "0.32em" }}
            >
              {t("why.overline")}
            </span>
            <h2
              className="mt-4"
              style={{ fontFamily: SERIF, color: C.navy, fontSize: "clamp(28px, 5vw, 42px)", fontWeight: 500, lineHeight: 1.15, letterSpacing: "-0.01em" }}
            >
              {t("why.headline")}<br />{t("why.headlineLine2")}
            </h2>
          </div>
          {(() => {
            const whyTilesTr = t("why.tiles", { returnObjects: true }) as Array<{ eyebrow: string; title: string; desc: string }>;
            const tiles = [
              {
                eyebrow: whyTilesTr[0]?.eyebrow ?? "",
                title: whyTilesTr[0]?.title ?? "",
                desc: whyTilesTr[0]?.desc ?? "",
                media: { kind: "image" as const, src: "/bolig-images/living-scandi-after.jpg" },
                href: "/boligpotentiale/foer-efter",
              },
              {
                eyebrow: whyTilesTr[1]?.eyebrow ?? "",
                title: whyTilesTr[1]?.title ?? "",
                desc: whyTilesTr[1]?.desc ?? "",
                media: { kind: "image" as const, src: "/bolig-images/floorplan-3d.jpg" },
                href: "/boligpotentiale/3d-plantegning",
              },
              {
                eyebrow: whyTilesTr[2]?.eyebrow ?? "",
                title: whyTilesTr[2]?.title ?? "",
                desc: whyTilesTr[2]?.desc ?? "",
                media: { kind: "video" as const, src: "/videos/transformation-kling-v16-pro.mp4", poster: "/bolig-images/video-poster.jpg" },
                href: "/boligpotentiale/branchevideo",
              },
              {
                eyebrow: whyTilesTr[3]?.eyebrow ?? "",
                title: whyTilesTr[3]?.title ?? "",
                desc: whyTilesTr[3]?.desc ?? "",
                media: { kind: "swipe" as const, before: "/bolig-images/ai-agent-aerial-before.png", after: "/bolig-images/ai-agent-aerial-after.jpg", beforeLabel: t("slider.before"), afterLabel: t("slider.after") },
                href: "/boligpotentiale/ai-design-agent",
              },
              {
                eyebrow: whyTilesTr[4]?.eyebrow ?? "",
                title: whyTilesTr[4]?.title ?? "",
                desc: whyTilesTr[4]?.desc ?? "",
                media: { kind: "video" as const, src: "/videos/bolig-showcase-tile.mp4", poster: "/bolig-images/showcase-tile-poster.jpg" },
                href: "/boligpotentiale/bolig-showcase",
              },
            ];
            const renderTile = (tile: typeof tiles[0]) => {
              return (
              <Link
                key={tile.eyebrow}
                href={tile.href}
                className="group cursor-pointer transition-all duration-500 hover:-translate-y-1 block"
                style={{ background: C.white, borderRadius: 18, overflow: "hidden", boxShadow: "0 10px 40px rgba(15,25,35,0.06)" }}
                data-testid={`bolig-why-tile-${tile.eyebrow}`}
              >
                <div className="relative overflow-hidden" style={{ aspectRatio: "4 / 3" }}>
                  {tile.media.kind === "video" ? (
                    <video
                      src={tile.media.src}
                      poster={tile.media.poster}
                      autoPlay
                      muted
                      loop
                      playsInline
                      onLoadedMetadata={(e) => { e.currentTarget.currentTime = 0.5; }}
                      className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                    />
                  ) : tile.media.kind === "swipe" ? (
                    // Animated Før/Efter: hover pauses at midpoint, else auto-cycles
                    <div className="absolute inset-0 select-none">
                      {/* After — base layer */}
                      <img src={tile.media.after} alt={tile.media.afterLabel ?? t("slider.after")} className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.04]" />
                      {/* Before — clipped curtain, animates via CSS */}
                      <img
                        src={tile.media.before}
                        alt={tile.media.beforeLabel ?? t("slider.before")}
                        className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                        style={{
                          clipPath: "inset(0 0% 0 0)",
                          animation: "tileSwipe 4s ease-in-out 1s infinite",
                        }}
                      />
                      {/* Labels */}
                      <div className="absolute top-4 right-4 uppercase" style={{ background: C.gold, color: C.navy, padding: "5px 11px", borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: "0.18em" }}>
                        {tile.media.afterLabel ?? t("slider.after")}
                      </div>
                      <div className="absolute top-4 left-4 uppercase" style={{ background: "rgba(15,25,35,0.75)", color: "#fff", padding: "5px 11px", borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: "0.18em" }}>
                        {tile.media.beforeLabel ?? t("slider.before")}
                      </div>
                    </div>
                  ) : (
                    <img
                      src={tile.media.src}
                      alt={tile.title}
                      className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                    />
                  )}
                  <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(15,25,35,0.35) 0%, rgba(15,25,35,0) 45%)" }} />
                  {tile.media.kind !== "swipe" && (
                    <div className="absolute top-4 left-4 uppercase" style={{ background: "rgba(255,255,255,0.92)", color: C.navy, padding: "6px 12px", borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: "0.18em" }}>
                      {tile.eyebrow}
                    </div>
                  )}
                </div>
                <div style={{ padding: "28px 30px 32px" }}>
                  <div style={{ fontFamily: SERIF, color: C.navy, fontSize: 24, fontWeight: 500, lineHeight: 1.25, marginBottom: 10, letterSpacing: "-0.005em" }}>
                    {tile.title}
                  </div>
                  <div style={{ color: C.muted, fontSize: 15, lineHeight: 1.6 }}>
                    {tile.desc}
                  </div>
                  <span
                    className="inline-flex items-center gap-1.5 mt-5 transition-all group-hover:gap-2.5"
                    style={{ color: C.navy, fontSize: 13, fontWeight: 600, letterSpacing: "0.04em" }}
                  >
                    {t("why.seeMore")}
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" style={{ color: C.gold }} />
                  </span>
                </div>
              </Link>
            );
            };
            return (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 lg:gap-8">
                  {tiles.slice(0, 3).map(renderTile)}
                </div>
                <div className="flex flex-col sm:flex-row justify-center gap-6 lg:gap-8 mt-6 lg:mt-8">
                  {tiles.slice(3).map((tile) => (
                    <div key={tile.eyebrow} className="w-full sm:w-[calc(33.333%-1rem)]">
                      {renderTile(tile)}
                    </div>
                  ))}
                </div>
              </>
            );
          })()}
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how-it-works" style={{ background: C.warm, paddingTop: "clamp(36px, 5vw, 48px)", paddingBottom: "clamp(52px, 8vw, 100px)" }} className="px-6" data-testid="bolig-how-it-works">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-14">
            <Overline>{t("howItWorks.overline")}</Overline>
            <H2>{t("howItWorks.headline")}</H2>
            <p className="mt-4 max-w-xl mx-auto" style={{ color: C.muted, fontSize: 16, lineHeight: 1.6 }}>
              {t("howItWorks.subline")}
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {HOW_IT_WORKS.map((step, i) => {
              const Icon = step.Icon;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={{ duration: 0.6, delay: i * 0.15, ease: "easeOut" }}
                  className="transition-all duration-300 hover:-translate-y-1"
                  style={{
                    background: C.white,
                    borderRadius: 8,
                    padding: "clamp(28px, 4vw, 48px) clamp(22px, 3vw, 36px)",
                    boxShadow: C.shadowCard,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.boxShadow = C.shadowCardHover)}
                  onMouseLeave={(e) => (e.currentTarget.style.boxShadow = C.shadowCard)}
                  data-testid={`bolig-step-${i}`}
                >
                  <div style={{ fontFamily: SERIF, color: C.gold, fontSize: 28, fontWeight: 500 }}>{step.step}</div>
                  <div
                    className="flex items-center justify-center mt-5"
                    style={{ width: 64, height: 64, borderRadius: "50%", border: `1px solid ${C.goldBorder}` }}
                  >
                    <Icon className="w-7 h-7" style={{ color: C.gold }} />
                  </div>
                  <h3 className="mt-5" style={{ color: C.navy, fontSize: 18, fontWeight: 600 }}>{step.title}</h3>
                  <p className="mt-2" style={{ color: C.muted, fontSize: 15, lineHeight: 1.6 }}>{step.desc}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── SÆLG HURTIGERE — STATS ── */}
      <section id="saelg-hurtigere" style={{ background: C.navy, paddingTop: "clamp(52px, 8vw, 100px)", paddingBottom: "clamp(52px, 8vw, 100px)" }} className="px-6" data-testid="bolig-stats">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-14">
            <div className="uppercase" style={{ color: C.gold, fontSize: 12, fontWeight: 600, letterSpacing: "0.18em" }}>{t("stats.overline")}</div>
            <h2 className="mt-4" style={{ fontFamily: SERIF, color: C.white, fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 500, lineHeight: 1.15, letterSpacing: "-0.01em" }}>
              {t("stats.headline")}
            </h2>
            <p className="mt-4 max-w-2xl mx-auto" style={{ color: "rgba(255,255,255,0.7)", fontSize: 16, lineHeight: 1.6 }}>
              {t("stats.subline")}
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
            {(t("stats.items", { returnObjects: true }) as Array<{ stat: string; label: string; desc: string }>).map((s, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.6, delay: i * 0.12, ease: "easeOut" }}
                className="text-center"
                style={{ padding: "8px 4px" }}
                data-testid={`bolig-stat-${i}`}
              >
                <div style={{ fontFamily: SERIF, color: C.gold, fontSize: "clamp(48px, 5.5vw, 64px)", fontWeight: 500, lineHeight: 1, letterSpacing: "-0.02em" }}>
                  {s.stat}
                </div>
                <div className="mt-3 uppercase" style={{ color: C.white, fontSize: 12, fontWeight: 600, letterSpacing: "0.14em" }}>
                  {s.label}
                </div>
                <p className="mt-4 mx-auto" style={{ color: "rgba(255,255,255,0.65)", fontSize: 14, lineHeight: 1.6, maxWidth: 240 }}>
                  {s.desc}
                </p>
              </motion.div>
            ))}
          </div>
          <div className="text-center mt-12" style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, letterSpacing: "0.04em" }}>
            {t("stats.sources")}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="px-6" style={{ background: C.warm, paddingTop: "clamp(52px, 8vw, 100px)", paddingBottom: "clamp(52px, 8vw, 100px)" }} data-testid="bolig-features">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-14">
            <Overline>{t("features.overline")}</Overline>
            <H2>{t("features.headline")}</H2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {FEATURES.map((f, i) => {
              const Icon = f.Icon;
              const isOpen = openFeature === i;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={{ duration: 0.5, delay: (i % 3) * 0.1, ease: "easeOut" }}
                  className="transition-all duration-300 hover:-translate-y-1 flex flex-col"
                  style={{
                    background: C.white,
                    borderRadius: 8,
                    padding: "clamp(20px, 4vw, 36px) clamp(16px, 3vw, 32px)",
                    boxShadow: C.shadowCard,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.boxShadow = C.shadowCardHover)}
                  onMouseLeave={(e) => (e.currentTarget.style.boxShadow = C.shadowCard)}
                  data-testid={`bolig-feature-${i}`}
                >
                  <div
                    className="flex items-center justify-center mb-5"
                    style={{ width: 48, height: 48, borderRadius: "50%", border: `1px solid ${C.goldBorder}` }}
                  >
                    <Icon className="w-5 h-5" style={{ color: C.gold }} />
                  </div>
                  <h3 style={{ color: C.navy, fontSize: 16, fontWeight: 600 }}>{f.title}</h3>
                  <p className="mt-2" style={{ color: C.muted, fontSize: 14, lineHeight: 1.6 }}>{f.desc}</p>

                  {f.more && (
                    <button
                      type="button"
                      onClick={() => setOpenFeature(isOpen ? null : i)}
                      aria-expanded={isOpen}
                      className="flex items-center gap-1.5 mt-4 transition-colors"
                      style={{ color: C.gold, fontSize: 13, fontWeight: 600, background: "none", border: "none", padding: 0, cursor: "pointer" }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = C.goldHover)}
                      onMouseLeave={(e) => (e.currentTarget.style.color = C.gold)}
                      data-testid={`bolig-feature-toggle-${i}`}
                    >
                      {isOpen ? t("features.readLess") : t("features.readMore")}
                      <ChevronDown
                        className="w-4 h-4 transition-transform duration-300"
                        style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                      />
                    </button>
                  )}

                  <AnimatePresence initial={false}>
                    {isOpen && f.more && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: "easeOut" }}
                        style={{ overflow: "hidden" }}
                      >
                        <p
                          className="mt-3 pt-3"
                          style={{ color: C.muted, fontSize: 13.5, lineHeight: 1.6, borderTop: `1px solid ${C.goldBorder}` }}
                          data-testid={`bolig-feature-more-${i}`}
                        >
                          {f.more}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── BESPARELSE SAMMENLIGNING ── */}
      <section id="sammenligning" className="px-6" style={{ background: "#0A1624", paddingTop: "clamp(52px, 8vw, 96px)", paddingBottom: "clamp(40px, 6vw, 72px)" }}>
        <div className="mx-auto max-w-4xl">
          <div className="text-center mb-10">
            <p className="text-[11px] font-semibold tracking-[0.12em] uppercase mb-3" style={{ color: "#C8956C" }}>{t("savings.overline")}</p>
            <h2 className="text-3xl sm:text-4xl font-semibold mb-4" style={{ color: "#F5F3EF", fontFamily: '"Playfair Display", Georgia, serif', letterSpacing: "-0.02em" }}>
              {t("savings.headline")}
            </h2>
            <p className="text-sm max-w-xl mx-auto" style={{ color: "rgba(245,243,239,0.55)", lineHeight: 1.7 }}>
              {t("savings.subline")}
            </p>
          </div>

          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(200,149,108,0.2)" }}>
            {/* Header */}
            <div className="grid grid-cols-3 text-[11px] font-semibold tracking-[0.1em] uppercase px-6 py-4"
              style={{ background: "rgba(200,149,108,0.12)", color: "rgba(245,243,239,0.5)", borderBottom: "1px solid rgba(200,149,108,0.15)" }}>
              <span>{t("savings.colService")}</span>
              <span className="text-center">{t("savings.colTraditional")}</span>
              <span className="text-right">{t("savings.colForma")}</span>
            </div>

            {/* Rows */}
            {(t("savings.rows", { returnObjects: true }) as Array<{ label: string; traditional: string }>).map((row, i) => (
              <div key={i} className="grid grid-cols-3 items-center px-6 py-4"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", background: i % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent" }}>
                <p className="text-sm font-medium" style={{ color: "#F5F3EF" }}>{row.label}</p>
                <p className="text-center text-sm font-medium" style={{ color: "rgba(245,243,239,0.65)" }}>{row.traditional}</p>
                <p className="text-right text-sm font-semibold" style={{ color: "#C8956C" }}>{t("savings.included")}</p>
              </div>
            ))}

            {/* Total row */}
            <div className="grid grid-cols-3 items-center px-6 py-5"
              style={{ background: "rgba(200,149,108,0.13)", borderTop: "1px solid rgba(200,149,108,0.3)" }}>
              <p className="text-sm font-bold" style={{ color: "#F5F3EF" }}>{t("savings.totalLabel")}</p>
              <p className="text-center font-bold" style={{ color: "#F5F3EF", fontSize: 15 }}>{t("savings.totalTraditional")}</p>
              <p className="text-right font-bold" style={{ color: "#C8956C" }}>{t("savings.totalForma")}</p>
            </div>
          </div>

          <p className="text-center text-[11px] mt-5" style={{ color: "rgba(245,243,239,0.3)" }}>
            {t("savings.disclaimer")}
          </p>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" className="px-6" style={{ background: C.navy, paddingTop: "clamp(52px, 8vw, 100px)", paddingBottom: "clamp(52px, 8vw, 100px)" }} data-testid="bolig-pricing">
        <div className="mx-auto max-w-7xl">
          <div className="text-center mb-10">
            <Overline light>{t("pricing.overline")}</Overline>
            <H2 light>{t("pricing.headline")}</H2>
            <p className="mt-4 max-w-2xl mx-auto" style={{ color: "rgba(255,255,255,0.65)", fontSize: 16, lineHeight: 1.6 }}>
              {t("pricing.subline")}
            </p>

            {/* Billing toggle */}
            <div className="inline-flex items-center mt-8 p-1" style={{ background: "rgba(255,255,255,0.06)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)" }}>
              <button
                onClick={() => setBilling("monthly")}
                className="transition-all"
                style={{
                  padding: "8px 18px",
                  borderRadius: 6,
                  background: billing === "monthly" ? C.gold : "transparent",
                  color: billing === "monthly" ? C.navy : "rgba(255,255,255,0.7)",
                  fontSize: 13,
                  fontWeight: 500,
                }}
                data-testid="bolig-billing-monthly"
              >
                {t("pricing.monthly")}
              </button>
              <button
                onClick={() => setBilling("yearly")}
                className="transition-all flex items-center gap-2"
                style={{
                  padding: "8px 18px",
                  borderRadius: 6,
                  background: billing === "yearly" ? C.gold : "transparent",
                  color: billing === "yearly" ? C.navy : "rgba(255,255,255,0.7)",
                  fontSize: 13,
                  fontWeight: 500,
                }}
                data-testid="bolig-billing-yearly"
              >
                {t("pricing.yearly")}
                <span
                  className="uppercase"
                  style={{
                    background: billing === "yearly" ? "rgba(15,25,35,0.18)" : C.goldTint,
                    color: billing === "yearly" ? C.navy : C.gold,
                    fontSize: 10,
                    padding: "2px 6px",
                    borderRadius: 3,
                    letterSpacing: "0.1em",
                    fontWeight: 600,
                  }}
                >
                  {t("pricing.save20")}
                </span>
              </button>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mt-12">
            {PRICING.map((plan, i) => {
              const isPro = plan.highlight;
              const price = formatPrice(plan.monthly);
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={{ duration: 0.5, delay: i * 0.08, ease: "easeOut" }}
                  className="flex flex-col relative"
                  style={{
                    background: isPro ? C.goldTint : "rgba(255,255,255,0.03)",
                    borderRadius: 8,
                    border: `1px solid ${isPro ? C.gold : "rgba(255,255,255,0.08)"}`,
                    padding: "40px 32px",
                    transform: isPro ? "scale(1.02)" : "none",
                  }}
                  data-testid={`bolig-pricing-${plan.name.toLowerCase()}`}
                >
                  {isPro && (
                    <div
                      className="absolute uppercase"
                      style={{
                        top: -12,
                        left: "50%",
                        transform: "translateX(-50%)",
                        background: C.gold,
                        color: C.navy,
                        fontSize: 11,
                        fontWeight: 600,
                        padding: "6px 16px",
                        borderRadius: 4,
                        letterSpacing: "0.12em",
                      }}
                    >
                      {t("pricing.mostPopular")}
                    </div>
                  )}
                  <div className="uppercase" style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 600, letterSpacing: "0.15em" }}>{plan.name}</div>
                  <div style={{ color: C.gold, fontSize: 12, marginTop: 6, fontWeight: 500, fontFamily: SANS }}>
                    {t(`pricing.plans.${plan.name}.fit`)}
                  </div>
                  <div className="mt-4 mb-2">
                    {price ? (
                      <>
                        {billing === "yearly" && plan.monthly !== null && (
                          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, textDecoration: "line-through", marginBottom: 2 }}>
                            {plan.monthly.toLocaleString("da-DK")} {t("pricing.perMonth")}
                          </div>
                        )}
                        <div className="flex items-end gap-2">
                          <span style={{ fontFamily: SERIF, fontWeight: 500, color: C.white, fontSize: 40, lineHeight: 1 }}>{price}</span>
                          <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 14, marginBottom: 4 }}>
                            {billing === "monthly" ? t("pricing.perMonth") : t("pricing.perMonthYearly")}
                          </span>
                        </div>
                        {billing === "yearly" && plan.monthly !== null && (
                          <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, marginTop: 4 }}>
                            {t("pricing.billedYearly", { amount: (Math.round(plan.monthly * 0.8) * 12).toLocaleString("da-DK") })}
                          </div>
                        )}
                      </>
                    ) : (
                      <span style={{ fontFamily: SERIF, fontWeight: 500, color: C.white, fontSize: 40, lineHeight: 1 }}>{t("pricing.custom")}</span>
                    )}
                  </div>
                  <ul className="space-y-3 mt-8 mb-10 flex-1">
                    {plan.features.map((f, j) => (
                      <li key={j} className="flex items-start gap-3" style={{ color: "rgba(255,255,255,0.85)", fontSize: 14 }}>
                        <Check className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: C.gold }} />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => {
                      if (plan.monthly !== null) {
                        startCheckout(plan.name);
                      } else {
                        const el = document.getElementById("enterprise-calculator");
                        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                      }
                    }}
                    disabled={checkoutLoading === plan.name}
                    className="w-full transition-colors"
                    style={{
                      padding: "12px 24px",
                      borderRadius: 8,
                      background: isPro ? C.gold : "transparent",
                      color: isPro ? C.navy : C.gold,
                      border: `1px solid ${C.gold}`,
                      fontSize: 14,
                      fontWeight: 500,
                      fontFamily: SANS,
                      opacity: checkoutLoading === plan.name ? 0.6 : 1,
                      cursor: checkoutLoading === plan.name ? "wait" : "pointer",
                    }}
                    onMouseEnter={(e) => {
                      if (checkoutLoading) return;
                      e.currentTarget.style.background = isPro ? C.goldHover : C.gold;
                      e.currentTarget.style.color = C.navy;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = isPro ? C.gold : "transparent";
                      e.currentTarget.style.color = isPro ? C.navy : C.gold;
                    }}
                    data-testid={`bolig-pricing-cta-${plan.name.toLowerCase()}`}
                  >
                    {checkoutLoading === plan.name ? t("pricing.openingStripe") : plan.cta}
                  </button>
                </motion.div>
              );
            })}
          </div>

          {/* Bridge → Enterprise */}
          <div className="relative mt-16 mb-10 flex items-center gap-4">
            <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.12)" }} />
            <div className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold uppercase tracking-widest whitespace-nowrap"
              style={{ border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)" }}>
              {t("pricing.enterprise")}
            </div>
            <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.12)" }} />
          </div>
          <div id="enterprise-calculator">
            <EnterpriseCalculator dark />
          </div>
        </div>
      </section>
      {/* ── FAQ ── */}
      <section id="faq" className="px-6" style={{ background: C.champagne, paddingTop: "clamp(52px, 8vw, 100px)", paddingBottom: "clamp(52px, 8vw, 100px)" }} data-testid="bolig-faq">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-14">
            <Overline>{t("faq.overline")}</Overline>
            <H2>{t("faq.headline")}</H2>
          </div>
          <div className="grid lg:grid-cols-[3fr_2fr] gap-12">
            <div>
              {FAQS.map((faq, i) => (
                <FaqItem key={i} q={faq.q} a={faq.a} />
              ))}
            </div>
            <aside className="hidden lg:block" data-testid="bolig-faq-info">
              <div
                style={{
                  background: C.white,
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  padding: 40,
                  boxShadow: C.shadowCard,
                }}
              >
                <h3 style={{ color: C.navy, fontSize: 20, fontWeight: 600 }}>{t("faq.sideTitle")}</h3>
                <p className="mt-3 mb-6" style={{ color: C.muted, fontSize: 15, lineHeight: 1.6 }}>
                  {t("faq.sideText")}
                </p>
                <a href="mailto:kontakt@formaestates.com">
                  <button
                    className="w-full transition-colors hover:bg-[color:var(--gold-h)]"
                    style={{
                      ['--gold-h' as any]: C.goldHover,
                      background: C.gold,
                      color: C.navy,
                      padding: "12px 24px",
                      borderRadius: 8,
                      fontSize: 14,
                      fontWeight: 600,
                      fontFamily: SANS,
                    }}
                    data-testid="bolig-faq-contact"
                  >
                    {t("faq.sideButton")}
                  </button>
                </a>
              </div>
            </aside>
          </div>
        </div>
      </section>

      {/* ── PRE-FOOTER CTA ── */}
      <section className="px-6" style={{ background: C.navy, paddingTop: "clamp(52px, 8vw, 100px)", paddingBottom: "clamp(52px, 8vw, 100px)" }} data-testid="bolig-footer-cta">
        <div className="mx-auto max-w-3xl text-center">
          <H2 light style={{ fontSize: "clamp(28px, 4vw, 42px)" }}>{t("footerCta.headline")}</H2>
          <p className="mt-5 mb-10" style={{ color: "rgba(255,255,255,0.7)", fontSize: 18, lineHeight: 1.6 }}>
            {t("footerCta.subline")}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/opret">
              <button
                className="inline-flex items-center gap-2 transition-colors hover:bg-[color:var(--gold-h)]"
                style={{
                  ['--gold-h' as any]: C.goldHover,
                  background: C.gold,
                  color: C.navy,
                  padding: "16px 32px",
                  borderRadius: 8,
                  fontSize: 15,
                  fontWeight: 600,
                  fontFamily: SANS,
                }}
                data-testid="bolig-footer-cta-button"
              >
                {t("footerCta.cta")}
                <ArrowRight className="w-4 h-4" />
              </button>
            </Link>
            <a href="#pricing">
              <button
                className="transition-colors hover:bg-white hover:text-[color:var(--navy)]"
                style={{
                  ['--navy' as any]: C.navy,
                  background: "transparent",
                  color: C.white,
                  border: "1px solid rgba(255,255,255,0.9)",
                  padding: "16px 32px",
                  borderRadius: 8,
                  fontSize: 15,
                  fontWeight: 500,
                  fontFamily: SANS,
                }}
                data-testid="bolig-footer-cta-secondary"
              >
                {t("footerCta.secondary")}
              </button>
            </a>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="px-6" style={{ background: C.navyDeep, paddingTop: 64, paddingBottom: 32 }} data-testid="bolig-footer">
        <div className="mx-auto max-w-6xl">
          <div className="grid grid-cols-1 md:grid-cols-[1.3fr_1fr_1fr_1fr] gap-10 md:gap-12 mb-12">
            <div className="text-center md:text-left">
              <img
                src={formaEstatesLogo}
                alt="Forma Estates"
                className="w-auto mx-auto md:mx-0"
                style={{ height: 56, marginBottom: 16, filter: "brightness(0) invert(1)" }}
              />
              <div
                className="uppercase"
                style={{
                  fontFamily: SERIF,
                  color: C.white,
                  fontSize: 22,
                  fontWeight: 600,
                  letterSpacing: "0.3em",
                  marginBottom: 18,
                  lineHeight: 1,
                }}
              >
                FORMA ESTATES
              </div>
              <p className="mx-auto md:mx-0 mb-5" style={{ color: "rgba(255,255,255,0.55)", fontSize: 15, lineHeight: 1.6, maxWidth: 280 }}>
                {t("footer.tagline")}
              </p>
              <div
                className="flex items-center justify-center md:justify-start"
                style={{ gap: 20 }}
                data-testid="bolig-footer-social"
              >
                <a href="https://www.linkedin.com/in/frederik-fussing-nielsen-443790264/" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" style={{ color: "rgba(255,255,255,0.45)", transition: "color 0.15s" }} onMouseEnter={e => (e.currentTarget.style.color = "#fff")} onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.45)")}>
                  <Linkedin size={22} strokeWidth={1.5} />
                </a>
                <a href="https://facebook.com/formaestates" target="_blank" rel="noopener noreferrer" aria-label="Facebook" style={{ color: "rgba(255,255,255,0.45)", transition: "color 0.15s" }} onMouseEnter={e => (e.currentTarget.style.color = "#fff")} onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.45)")}>
                  <Facebook size={22} strokeWidth={1.5} />
                </a>
                <a href="https://instagram.com/formaestates" target="_blank" rel="noopener noreferrer" aria-label="Instagram" style={{ color: "rgba(255,255,255,0.45)", transition: "color 0.15s" }} onMouseEnter={e => (e.currentTarget.style.color = "#fff")} onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.45)")}>
                  <Instagram size={22} strokeWidth={1.5} />
                </a>
              </div>
            </div>
            <div>
              <div className="uppercase mb-4" style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: 600, letterSpacing: "0.15em" }}>{t("footer.product")}</div>
              <ul className="space-y-3">
                {[
                  [t("footer.howItWorks"), "#how-it-works"],
                  [t("footer.examples"), "/boligpotentiale/eksempler"],
                  [t("footer.prices"), "#pricing"],
                ].map(([l, h]) => (
                  <li key={h}>
                    <a href={h} className="transition-colors hover:text-white" style={{ color: "rgba(255,255,255,0.65)", fontSize: 14 }}>{l}</a>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="uppercase mb-4" style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: 600, letterSpacing: "0.15em" }}>{t("footer.support")}</div>
              <ul className="space-y-3">
                {[
                  ["FAQ", "#faq"],
                  [t("footer.contact"), "mailto:kontakt@formaestates.com"],
                  [t("footer.privacy"), "/privatlivspolitik"],
                  [t("footer.terms"), "/handelsbetingelser"],
                ].map(([l, h]) => (
                  <li key={h}>
                    <a href={h} className="transition-colors hover:text-white" style={{ color: "rgba(255,255,255,0.65)", fontSize: 14 }}>{l}</a>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="uppercase mb-4" style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: 600, letterSpacing: "0.15em" }}>{t("footer.getStarted")}</div>
              <Link href="/opret">
                <button
                  className="w-full transition-colors hover:bg-[color:var(--gold-h)]"
                  style={{
                    ['--gold-h' as any]: C.goldHover,
                    background: C.gold,
                    color: C.navy,
                    padding: "12px 20px",
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                  data-testid="bolig-footer-nav-cta"
                >
                  {t("footer.createAccount")}
                </button>
              </Link>
            </div>
          </div>
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 24, marginTop: 24 }}>
            <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>
              {t("footer.copyright")}
            </span>
          </div>
        </div>
      </footer>

    </div>
  );
}
