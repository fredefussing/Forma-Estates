import { useState, useEffect, useRef } from "react";
import { EnterpriseCalculator } from "@/components/enterprise-calculator";
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
} from "lucide-react";
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

const NAV_LINKS = [
  { label: "FORSIDE", href: "#top" },
  { label: "PRISER", href: "#pricing" },
  { label: "EKSEMPLER", href: "/boligpotentiale/eksempler" },
  { label: "OM OS", href: "/boligpotentiale/om-os" },
  { label: "FAQ", href: "#faq" },
];

const HERO_PAIRS = [
  { before: "/bolig-images/living-scandi-before.jpg", after: "/bolig-images/living-scandi-after.jpg", label: "Stue · Skandinavisk" },
  { before: "/bolig-images/kitchen-before.jpg", after: "/bolig-images/kitchen-after.jpg", label: "Køkken · Moderne" },
  { before: "/bolig-images/living-modern-before.jpg", after: "/bolig-images/living-modern-after.jpg", label: "Stue · Moderne" },
];

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Upload et rumfoto",
    desc: "Tag et foto af rummet med din telefon eller kamera. Ingen professionel fotografering nødvendig.",
    Icon: Camera,
  },
  {
    step: "02",
    title: "Vælg rumtype og stil",
    desc: "Angiv rumtype og vælg en af vores designstile — fra skandinavisk minimalisme til moderne luksus.",
    Icon: SlidersHorizontal,
  },
  {
    step: "03",
    title: "Download din visualisering",
    desc: "AI'en genererer dit billede på under 30 sekunder. Klar til download i fuld kvalitet.",
    Icon: Download,
  },
];

const FEATURES = [
  {
    Icon: Home,
    title: "Naturtro visualisering",
    desc: "Bevarer rummets vægge, vinduer og lysindfald — kun indretningen ændres.",
    more: "Resultatet ligner et rigtigt foto af boligen. Proportioner, perspektiv og dagslys bevares, så køberen kan se det færdige hjem for sig.",
  },
  {
    Icon: Palette,
    title: "8 designstile",
    desc: "Skandinavisk, moderne, industrielt, boho, klassisk og mere.",
  },
  {
    Icon: Box,
    title: "3D plantegning",
    desc: "Få en overskuelig 3D-plantegning, der viser rummenes indretning og flow.",
    more: "Plantegningen hjælper køberen med at forstå boligens layout og størrelsesforhold — en tydelig fordel i annoncen.",
  },
  {
    Icon: Video,
    title: "Transformationsvideo",
    desc: "En kort video, der viser rummet gå fra før til efter.",
    more: "Den lille før-/efter-video fanger opmærksomheden på boligportaler og sociale medier og gør annoncen mere levende.",
  },
  {
    Icon: Wand2,
    title: "Design Agent",
    desc: "Skriv med almindelige ord, hvad du vil ændre — så klarer vi resten.",
    more: 'Fx "skift sofaen ud med en lys linnedsofa og tilføj en stor potteplante". Du behøver ikke kende til design eller teknik.',
  },
  {
    Icon: Zap,
    title: "Klar på under 30 sek.",
    desc: "Ingen ventetid. Visualiseringen er klar, mens du stadig er i rummet.",
  },
  {
    Icon: Monitor,
    title: "Direkte i browseren",
    desc: "Ingen software eller installation. Alt foregår online.",
  },
  {
    Icon: Download,
    title: "Download i høj opløsning",
    desc: "Klar til brug på boligportaler, sociale medier og tryksager.",
  },
  {
    Icon: MessageCircle,
    title: "Dansk support",
    desc: "Vi sidder i Danmark og besvarer dine spørgsmål på hverdage.",
  },
];

type Plan = {
  name: string;
  monthly: number | null;
  features: string[];
  cta: string;
  highlight?: boolean;
  href: string;
};

const PRICING: Plan[] = [
  {
    name: "Start",
    monthly: 2999,
    features: ["10 AI Visualiseringer / md.", "2 3D Plantegninger / md.", "2 Transformationsvideoer / md.", "1 Bolig Showcase / md.", "HD 1080p · JPG + PNG", "Logo branding (til/fra)", "Standard support"],
    cta: "Vælg Start",
    href: "/opret",
  },
  {
    name: "Pro",
    monthly: 5999,
    features: ["25 AI Visualiseringer / md.", "5 3D Plantegninger / md.", "5 Transformationsvideoer / md.", "3 Bolig Showcase / md.", "4K · JPG + PNG + PDF", "Fuld branding-kontrol", "Prioriteret support"],
    cta: "Vælg Pro",
    highlight: true,
    href: "/opret",
  },
  {
    name: "Business",
    monthly: 11999,
    features: ["60 AI Visualiseringer / md.", "12 3D Plantegninger / md.", "12 Transformationsvideoer / md.", "8 Bolig Showcase / md.", "4K · JPG + PNG + PDF", "Fuld branding-kontrol", "Dedikeret support"],
    cta: "Vælg Business",
    href: "/opret",
  },
];

const FAQS = [
  {
    q: "Hvad er Forma Estates?",
    a: "Forma Estates er et værktøj, der bruger kunstig intelligens til at omdesigne rum på fotos. Du uploader et billede, vælger en stil, og AI'en genererer et realistisk bud på, hvordan rummet kan se ud med ny indretning.",
  },
  {
    q: "Hvad får jeg gratis, og hvad koster det?",
    a: "Når du opretter en konto, får du 1 gratis visualisering — ingen kreditkort krævet. Herefter kan du vælge en af vores abonnementsplaner fra 2.999 kr./md.",
  },
  {
    q: "Hvilke filformater kan jeg uploade?",
    a: "Vi understøtter JPG og PNG. For bedste resultat bør billedet minimum være 800×600 pixels og taget i godt lys.",
  },
  {
    q: "Kan jeg bruge billederne i mine boligannoncer?",
    a: "Ja. Alle genererede visualiseringer kan downloades og bruges frit i dine annoncer, på sociale medier og i trykte materialer. Vi anbefaler at markere billeder som AI-genererede i overensstemmelse med branchens retningslinjer.",
  },
  {
    q: "Bevarer AI'en rummets struktur?",
    a: "Ja. Vægge, vinduer, gulv og rummets proportioner forbliver uændrede. Kun møbler, belysning og overflader skiftes ud, så resultatet ser realistisk ud.",
  },
  {
    q: "Er mine billeder fortrolige?",
    a: "Ja. Uploadede billeder bruges udelukkende til at generere din visualisering og deles ikke med tredjepart.",
  },
];

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

const STAGE_SLIDES: StageSlide[] = [
  {
    kind: "swipe",
    before: "/bolig-images/facade-before.jpg",
    after: "/bolig-images/facade-after.jpg",
    beforeLabel: "Før",
    afterLabel: "Efter",
    title: "Før & efter",
    caption: "Upload et foto — AI'en transformerer ejendommen på under 30 sekunder.",
    meta: "Facade · AI Design Agent",
  },
  {
    kind: "swipe",
    before: "/bolig-images/floorplan-2d.jpg",
    after: "/bolig-images/floorplan-3d.jpg",
    beforeLabel: "2D plan",
    afterLabel: "3D",
    title: "3D Plantegning",
    caption: "Fra flad plantegning til levende 3D-rum, køberen kan fornemme.",
    meta: "Stand-in eksempel",
    contain: true,
    bg: "#F0EDE8",
  },
  {
    kind: "video",
    src: "/videos/transformation-kling-v16-pro.mp4",
    poster: "/bolig-images/video-poster.jpg",
    title: "Cinematisk video",
    caption: "Ét stillbillede bliver til 5 sekunders levende video — klar til annoncen.",
    meta: "",
  },
  {
    kind: "swipe",
    before: "/bolig-images/dining-before.jpg",
    after: "/bolig-images/dining-after.jpg",
    beforeLabel: "Før",
    afterLabel: "Efter",
    title: "Før & efter",
    caption: "Upload et rumfoto — AI'en redesigner indretningen på under 30 sekunder.",
    meta: "Spisestue · Skandinavisk",
  },
];

function HeroStage() {
  const [index, setIndex] = useState(0);
  const [pos, setPos] = useState(1); // swipe split (1 = fully before, 0 = fully after)
  const rafRef = useRef<number | null>(null);
  const slideStartRef = useRef<number>(performance.now());
  const videoRef = useRef<HTMLVideoElement>(null);
  // After a manual click we wait this long before auto-advancing resumes.
  const AUTO_RESUME_AFTER = 7000;
  const lastInteractionRef = useRef<number>(0);

  const slide = STAGE_SLIDES[index];

  // Slide timing (ms)
  // 1.2s lead-in on "før", slow 3.8s wipe to "efter", then 4s rest before next slide.
  const SWIPE_BEFORE = 1200;
  const SWIPE_IN = 3800;
  const SWIPE_AFTER = 4000;
  const SWIPE_TOTAL = SWIPE_BEFORE + SWIPE_IN + SWIPE_AFTER;
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

  // Side-effects on slide change (video restart only — pos/timer already reset above)
  useEffect(() => {
    if (slide.kind === "video" && videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
    }
  }, [index]);

  // Animation loop
  useEffect(() => {
    const tick = (now: number) => {
      const elapsed = now - slideStartRef.current;
      const sinceInteraction = now - lastInteractionRef.current;
      const autoAdvanceAllowed = sinceInteraction > AUTO_RESUME_AFTER;

      if (slide.kind === "swipe") {
        if (elapsed < SWIPE_BEFORE) {
          setPos(1);
        } else if (elapsed < SWIPE_BEFORE + SWIPE_IN) {
          const t = (elapsed - SWIPE_BEFORE) / SWIPE_IN;
          const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
          setPos(1 - eased);
        } else if (elapsed < SWIPE_TOTAL || !autoAdvanceAllowed) {
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
  const sidePreview = (s: StageSlide) => (s.kind === "swipe" ? s.after : s.poster || "");

  return (
    <section
      className="relative"
      style={{ background: C.navy, paddingTop: 6, paddingBottom: 8 }}
      data-testid="bolig-hero-stage"
    >
      <div className="w-full px-2 sm:px-3 lg:px-4">
        <div
          className="relative w-full flex items-stretch gap-3 sm:gap-4"
          style={{ height: "min(72.7vh, calc((100vw - 32px) * 9 / 21 * 0.9860))" }}
        >
          {/* PREV peek */}
          <button
            onClick={() => go(prevIndex)}
            aria-label={`Forrige: ${prevSlide.title}`}
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
              <div className="uppercase mb-1" style={{ color: C.gold, fontSize: 10, fontWeight: 600, letterSpacing: "0.14em" }}>Forrige</div>
              <div style={{ fontFamily: SERIF, color: C.white, fontSize: 15, lineHeight: 1.25, fontWeight: 500 }}>{prevSlide.title}</div>
            </div>
            <div className="absolute top-1/2 -translate-y-1/2 right-3 flex items-center justify-center transition-opacity opacity-80 group-hover:opacity-100" style={{ width: 36, height: 36, borderRadius: 999, background: "rgba(255,255,255,0.22)", backdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,0.4)" }}>
              <ChevronLeft className="w-4 h-4" style={{ color: C.white }} />
            </div>
          </button>

          {/* CENTER stage */}
          <div
            className="relative flex-1"
            style={{
              borderRadius: 14,
              background: "#000",
              boxShadow: "0 24px 60px rgba(15,25,35,0.22)",
              overflow: "clip",
            }}
          >
          <AnimatePresence mode="wait">
            <motion.div
              key={index}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0"
            >
              {slide.kind === "swipe" ? (
                <div className="relative w-full h-full select-none" style={{ background: slide.bg ?? "#0a1219" }}>
                  {/* After image — fills frame */}
                  <img
                    src={slide.after}
                    alt={slide.afterLabel}
                    className="absolute inset-0 w-full h-full"
                    style={{ objectFit: "cover", objectPosition: slide.objectPosition ?? "center" }}
                  />
                  {/* Before image — same cover, curtain-clipped from the right so it slides cleanly without distorting */}
                  <img
                    src={slide.before}
                    alt={slide.beforeLabel}
                    className="absolute inset-0 w-full h-full"
                    style={{ objectFit: "cover", objectPosition: slide.objectPosition ?? "center", clipPath: `inset(0 ${100 - splitPct}% 0 0)` }}
                  />
                  <div
                    className="absolute top-0 bottom-0 flex items-center"
                    style={{ left: `${splitPct}%`, transform: "translateX(-50%)" }}
                  >
                    <div className="w-[2px] h-full bg-white/85" />
                    <div className="absolute w-9 h-9 rounded-full bg-white shadow-lg flex items-center justify-center">
                      <ChevronLeft className="w-3.5 h-3.5 -mr-0.5" style={{ color: C.navy }} />
                      <ChevronRight className="w-3.5 h-3.5 -ml-0.5" style={{ color: C.navy }} />
                    </div>
                  </div>
                  <div
                    className="absolute top-4 left-4 text-white text-[12px] font-semibold uppercase"
                    style={{
                      background: C.navy,
                      padding: "6px 13px",
                      borderRadius: 5,
                      letterSpacing: "0.1em",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.22)",
                    }}
                  >
                    {slide.beforeLabel}
                  </div>
                  <div
                    className="absolute top-4 right-4 text-[12px] font-semibold uppercase"
                    style={{
                      background: C.gold,
                      color: C.navy,
                      padding: "6px 13px",
                      borderRadius: 5,
                      letterSpacing: "0.1em",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
                    }}
                  >
                    {slide.afterLabel}
                  </div>
                </div>
              ) : (
                <video
                  ref={videoRef}
                  src={slide.src}
                  poster={(slide as any).poster}
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="auto"
                  onCanPlay={(e) => { e.currentTarget.play().catch(() => {}); }}
                  onLoadedMetadata={(e) => { e.currentTarget.play().catch(() => {}); }}
                  className="absolute inset-0 w-full h-full object-cover"
                  data-testid="bolig-hero-stage-video"
                />
              )}

              {/* Slide meta chip — fades with slide */}
              <div className="absolute top-4 left-4" style={{ zIndex: 5 }}>
                <div style={{ background: "rgba(15,25,35,0.70)", backdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,0.14)", color: "#fff", padding: "5px 12px", borderRadius: 6, fontSize: 10, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase" }}>
                  {slide.meta}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Bottom gradient */}
          <div className="absolute bottom-0 left-0 right-0 pointer-events-none" style={{ height: "38%", background: "linear-gradient(to top, rgba(10,18,25,0.88) 0%, rgba(10,18,25,0.60) 35%, rgba(10,18,25,0.18) 70%, transparent 100%)", zIndex: 6 }} />

          {/* Headline + CTAs */}
          <div className="absolute left-0 right-0" style={{ bottom: "clamp(14px, 2vw, 28px)", paddingLeft: "clamp(20px, 3.5vw, 48px)", paddingRight: "clamp(20px, 3.5vw, 48px)", zIndex: 7 }}>
            <div style={{ maxWidth: "min(560px, 60%)" }}>
              <h1 style={{ fontFamily: SERIF, color: "#fff", fontSize: "clamp(22px, 3vw, 42px)", fontWeight: 500, lineHeight: 1.08, letterSpacing: "-0.02em", marginBottom: 8, textShadow: "0 1px 12px rgba(0,0,0,0.3)" }}>
                Sæt scenen.<br />Sælg hurtigere.
              </h1>
              <p style={{ color: "rgba(255,255,255,0.82)", fontSize: "clamp(11px, 1vw, 13px)", lineHeight: 1.5, marginBottom: 14, fontFamily: SANS, textShadow: "0 1px 6px rgba(0,0,0,0.4)" }}>
                Upload et rumfoto — salgsklar visualisering på{" "}
                <span style={{ color: C.gold }}>under 30 sekunder</span>.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Link href="/opret">
                  <button
                    className="inline-flex items-center gap-2 transition-all"
                    style={{ background: C.gold, color: C.navy, padding: "9px 18px", borderRadius: 7, fontSize: 12, fontWeight: 600, fontFamily: SANS, boxShadow: "0 4px 16px rgba(201,169,110,0.35)" }}
                    onMouseEnter={e => { e.currentTarget.style.background = C.goldHover; e.currentTarget.style.transform = "translateY(-1px)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = C.gold; e.currentTarget.style.transform = "translateY(0)"; }}
                    data-testid="bolig-hero-cta"
                  >
                    Kom i gang gratis <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </Link>
                <Link href="/boligpotentiale/eksempler">
                  <button
                    className="inline-flex items-center gap-2 transition-all"
                    style={{ background: "rgba(255,255,255,0.10)", color: "#fff", padding: "9px 18px", borderRadius: 7, fontSize: 12, fontWeight: 500, fontFamily: SANS, border: "1px solid rgba(255,255,255,0.30)", backdropFilter: "blur(6px)" }}
                    onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.18)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.10)"; }}
                    data-testid="bolig-hero-cta-secondary"
                  >
                    Se eksempler
                  </button>
                </Link>
              </div>
            </div>
          </div>

            {/* Mobile-only side arrows (peek panels hidden < md) */}
            <button
              onClick={() => go(index - 1)}
              aria-label="Forrige"
              className="md:hidden absolute left-3 top-1/2 -translate-y-1/2 flex items-center justify-center transition-colors hover:bg-white/30"
              style={{ width: 40, height: 40, borderRadius: 999, background: "rgba(255,255,255,0.2)", backdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,0.35)", color: C.white, zIndex: 10 }}
              data-testid="bolig-hero-prev-mobile"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => go(index + 1)}
              aria-label="Næste"
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
            aria-label={`Næste: ${nextSlide.title}`}
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
              <div className="uppercase mb-1" style={{ color: C.gold, fontSize: 10, fontWeight: 600, letterSpacing: "0.14em" }}>Næste</div>
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
      </div>
    </section>
  );
}

// ── Auto-play hero slider with smooth swipe animation ─────────────────────────
function HeroSliderSection() {
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
        <div className="absolute top-3 left-3 text-white text-[11px] font-medium uppercase" style={{ background: C.navy, padding: "4px 10px", borderRadius: 4, letterSpacing: "0.1em" }}>Før</div>
        <div className="absolute top-3 right-3 text-white text-[11px] font-medium uppercase" style={{ background: C.navy, padding: "4px 10px", borderRadius: 4, letterSpacing: "0.1em" }}>Efter</div>
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
      <p className="text-center text-[13px] mt-3" style={{ color: C.muted }}>{pair.label} · Træk for at sammenligne</p>
    </div>
  );
}

// ── Cookie consent banner ────────────────────────────────────────────────────
function CookieBanner() {
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

  const persist = (consent: { necessary: true; statistics: boolean; preferences: boolean }) => {
    try {
      localStorage.setItem("forma-cookie-consent", JSON.stringify({ ...consent, ts: Date.now() }));
    } catch {}
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
              Vi bruger cookies
            </h3>
            <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, lineHeight: 1.6, marginBottom: 16, maxWidth: 560 }}>
              Vi bruger cookies til at få vores side til at fungere, måle trafik og huske dine præferencer. Du vælger selv, hvad du accepterer.
            </p>
            <div className="flex flex-wrap gap-x-7 gap-y-3">
              <label className="inline-flex items-center gap-2.5" style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, cursor: "not-allowed" }}>
                <input type="checkbox" checked disabled style={{ width: 16, height: 16, accentColor: C.gold }} data-testid="bolig-cookie-necessary" />
                Nødvendige (altid aktiv)
              </label>
              <label className="inline-flex items-center gap-2.5" style={{ color: "rgba(255,255,255,0.85)", fontSize: 13, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={stats}
                  onChange={(e) => setStats(e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: C.gold }}
                  data-testid="bolig-cookie-statistics"
                />
                Statistik
              </label>
              <label className="inline-flex items-center gap-2.5" style={{ color: "rgba(255,255,255,0.85)", fontSize: 13, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={prefs}
                  onChange={(e) => setPrefs(e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: C.gold }}
                  data-testid="bolig-cookie-preferences"
                />
                Præferencer
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
              Gem valg
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
              Accepter alle
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
              Afvis valgfrie
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
            <p style={{ paddingBottom: 24, color: C.muted, fontSize: 15, lineHeight: 1.7 }}>{a}</p>
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
  beforeLabel = "Før",
  afterLabel = "Efter",
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
      <img src={after} alt={afterLabel} className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 overflow-hidden" style={{ width: `${splitPct}%` }}>
        <img
          src={before}
          alt={beforeLabel}
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
      <div className="absolute top-3 left-3 text-white text-[11px] font-medium uppercase" style={{ background: C.navy, padding: "4px 10px", borderRadius: 4, letterSpacing: "0.1em" }}>{beforeLabel}</div>
      <div className="absolute top-3 right-3 text-white text-[11px] font-medium uppercase" style={{ background: C.gold, color: C.navy, padding: "4px 10px", borderRadius: 4, letterSpacing: "0.1em" }}>{afterLabel}</div>
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

export default function BoligpotentialeLanding() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeNav, setActiveNav] = useState<string>("FORSIDE");
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  const [openFeature, setOpenFeature] = useState<number | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
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
          className="hidden md:flex items-center justify-center relative"
          style={{ height: 32, paddingTop: 10 }}
          data-testid="bolig-nav-wordmark-bar"
        >
          <span
            className="uppercase"
            style={{
              fontFamily: SERIF,
              color: C.navy,
              fontSize: 14,
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
            style={{ bottom: 0, width: 280, height: 1, background: "#9A8F7C" }}
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
                  style={{ height: 150 }}
                />
              </div>
            </Link>

            <nav className="hidden md:flex items-stretch gap-7 self-stretch">
              {NAV_LINKS.map((l) => {
                const isActive = activeNav === l.label;
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
                      key={l.label}
                      href={l.href}
                      onClick={() => setActiveNav(l.label)}
                      className={className}
                      style={style}
                      data-testid={`bolig-nav-${l.label}`}
                    >
                      {content}
                    </Link>
                  );
                }
                return (
                  <a
                    key={l.label}
                    href={l.href}
                    onClick={() => setActiveNav(l.label)}
                    className={className}
                    style={style}
                    data-testid={`bolig-nav-${l.label}`}
                  >
                    {content}
                  </a>
                );
              })}
            </nav>
          </div>

          <div className="hidden md:flex items-center gap-3">
            <Link href="/kontakt">
              <button
                className="transition-colors hover:bg-[color:var(--bg-warm)]"
                style={{ ['--bg-warm' as any]: C.warm, padding: "10px 24px", borderRadius: 8, border: `1px solid ${C.navy}`, color: C.navy, fontSize: 13, fontWeight: 500, background: "transparent", fontFamily: SANS }}
                data-testid="bolig-nav-contact"
              >
                Kontakt os
              </button>
            </Link>
            <Link href="/login?redirect=/boligpotentiale/dashboard">
              <button
                className="transition-colors hover:bg-[color:var(--bg-warm)]"
                style={{ ['--bg-warm' as any]: C.warm, padding: "10px 24px", borderRadius: 8, border: `1px solid ${C.navy}`, color: C.navy, fontSize: 13, fontWeight: 500, background: "transparent", fontFamily: SANS }}
                data-testid="bolig-nav-login"
              >
                Log ind
              </button>
            </Link>
            <Link href="/opret">
              <button
                className="text-white transition-colors hover:bg-[color:var(--gold-h)]"
                style={{ ['--gold-h' as any]: C.goldHover, padding: "10px 24px", borderRadius: 8, background: C.gold, fontSize: 13, fontWeight: 500, fontFamily: SANS }}
                data-testid="bolig-nav-cta"
              >
                Kom i gang
              </button>
            </Link>
          </div>

          <button
            className="md:hidden p-2"
            onClick={() => setMobileOpen((o) => !o)}
            style={{ color: C.navy }}
            data-testid="bolig-mobile-menu-toggle"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
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
                  key={l.label}
                  href={l.href}
                  onClick={() => setMobileOpen(false)}
                  style={{ color: C.muted, fontSize: 13, fontWeight: 500, letterSpacing: "0.12em" }}
                >
                  {l.label}
                </a>
              ))}
              <Link href="/login?redirect=/boligpotentiale/dashboard">
                <button className="w-full mt-2" style={{ padding: "12px 24px", borderRadius: 8, border: `1px solid ${C.navy}`, color: C.navy, fontSize: 13, fontWeight: 500, background: "transparent" }} data-testid="bolig-mobile-login">
                  Log ind
                </button>
              </Link>
              <Link href="/opret">
                <button className="w-full text-white" style={{ padding: "12px 24px", borderRadius: 8, background: C.gold, fontSize: 13, fontWeight: 500 }} data-testid="bolig-mobile-cta">
                  Kom i gang
                </button>
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

      {/* ── CATEGORY TABS — navy background with gold text ── */}
      <section style={{ background: C.navy, paddingTop: 10, paddingBottom: 12 }} className="px-4 sm:px-6" data-testid="bolig-category-pills">
        <div className="mx-auto" style={{ maxWidth: 1280 }}>
          <div className="flex items-center justify-center gap-7 lg:gap-9 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            {[
              { label: "Sådan virker det", href: "#how-it-works" },
              { label: "Eksempler", href: "/boligpotentiale/eksempler" },
              { label: "Priser", href: "#pricing" },
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

      {/* ── HVORFOR VISUALISERING — cinematic image-led tiles ── */}
      <section style={{ background: C.warm, paddingTop: 80, paddingBottom: 96 }} className="px-4 sm:px-6" data-testid="bolig-why-visualisering">
        <div className="mx-auto" style={{ maxWidth: 1280 }}>
          <div className="text-center mb-14">
            <span
              className="uppercase"
              style={{ color: C.gold, fontSize: 11, fontWeight: 600, letterSpacing: "0.32em" }}
            >
              Hvorfor visualisering
            </span>
            <h2
              className="mt-4"
              style={{ fontFamily: SERIF, color: C.navy, fontSize: 42, fontWeight: 500, lineHeight: 1.15, letterSpacing: "-0.01em" }}
            >
              Vis potentialet.<br />Ikke det tomme rum.
            </h2>
          </div>
          {(() => {
            const tiles = [
              {
                eyebrow: "Før / Efter",
                title: "AI-iscenesættelse",
                desc: "Et tomt rum bliver til et hjem på sekunder.",
                media: { kind: "image" as const, src: "/bolig-images/living-scandi-after.jpg" },
                href: "/boligpotentiale/foer-efter",
              },
              {
                eyebrow: "3D Plantegning",
                title: "Forstå flowet",
                desc: "Lad køber gå gennem rummet før første visning.",
                media: { kind: "image" as const, src: "/bolig-images/floorplan-3d.jpg" },
                href: "/boligpotentiale/3d-plantegning",
              },
              {
                eyebrow: "Branchevideo",
                title: "Cinematisk fortælling",
                desc: "Vækk følelser med en levende videogennemgang.",
                media: { kind: "video" as const, src: "/videos/transformation-kling-v16-pro.mp4", poster: "/bolig-images/video-poster.jpg" },
                href: "/boligpotentiale/branchevideo",
              },
              {
                eyebrow: "AI Design Agent",
                title: "Beskriv din vision",
                desc: "Fortæl AI'en hvad du ønsker — den omsætter det til et færdigt design.",
                media: { kind: "image" as const, src: "/bolig-images/ai-agent-after.jpg" },
                href: "/boligpotentiale/dashboard",
              },
              {
                eyebrow: "Bolig Showcase",
                title: "Vis potentialet",
                desc: "Præsentér boligens fulde potentiale med professionelle visualiseringer.",
                media: { kind: "image" as const, src: "/bolig-images/living-modern-after.jpg" },
                href: "/boligpotentiale/dashboard",
              },
            ];
            const renderTile = (t: typeof tiles[0]) => (
              <Link
                key={t.eyebrow}
                href={t.href}
                className="group cursor-pointer transition-all duration-500 hover:-translate-y-1 block"
                style={{ background: C.white, borderRadius: 18, overflow: "hidden", boxShadow: "0 10px 40px rgba(15,25,35,0.06)" }}
                data-testid={`bolig-why-tile-${t.eyebrow}`}
              >
                <div className="relative overflow-hidden" style={{ aspectRatio: "4 / 3" }}>
                  {t.media.kind === "video" ? (
                    <video
                      src={t.media.src}
                      autoPlay
                      muted
                      loop
                      playsInline
                      onLoadedMetadata={(e) => { e.currentTarget.currentTime = 0.5; }}
                      className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                    />
                  ) : (
                    <img
                      src={t.media.src}
                      alt={t.title}
                      className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                    />
                  )}
                  <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(15,25,35,0.35) 0%, rgba(15,25,35,0) 45%)" }} />
                  <div className="absolute top-4 left-4 uppercase" style={{ background: "rgba(255,255,255,0.92)", color: C.navy, padding: "6px 12px", borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: "0.18em" }}>
                    {t.eyebrow}
                  </div>
                </div>
                <div style={{ padding: "28px 30px 32px" }}>
                  <div style={{ fontFamily: SERIF, color: C.navy, fontSize: 24, fontWeight: 500, lineHeight: 1.25, marginBottom: 10, letterSpacing: "-0.005em" }}>
                    {t.title}
                  </div>
                  <div style={{ color: C.muted, fontSize: 15, lineHeight: 1.6 }}>
                    {t.desc}
                  </div>
                  <span
                    className="inline-flex items-center gap-1.5 mt-5 transition-all group-hover:gap-2.5"
                    style={{ color: C.navy, fontSize: 13, fontWeight: 600, letterSpacing: "0.04em" }}
                  >
                    Se mere
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" style={{ color: C.gold }} />
                  </span>
                </div>
              </Link>
            );
            return (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 lg:gap-8">
                  {tiles.slice(0, 3).map(renderTile)}
                </div>
                <div className="flex flex-col sm:flex-row justify-center gap-6 lg:gap-8 mt-6 lg:mt-8">
                  {tiles.slice(3).map((t) => (
                    <div key={t.eyebrow} className="w-full sm:w-[calc(33.333%-1rem)]">
                      {renderTile(t)}
                    </div>
                  ))}
                </div>
              </>
            );
          })()}
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how-it-works" style={{ background: C.warm, paddingTop: 48, paddingBottom: 100 }} className="px-6" data-testid="bolig-how-it-works">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-14">
            <Overline>Sådan virker det</Overline>
            <H2>Tre trin. Under ét minut.</H2>
            <p className="mt-4 max-w-xl mx-auto" style={{ color: C.muted, fontSize: 16, lineHeight: 1.6 }}>
              Ingen software, ingen teknisk viden — bare et foto og et klik.
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
                    padding: "48px 36px",
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
      <section id="saelg-hurtigere" style={{ background: C.navy, paddingTop: 100, paddingBottom: 100 }} className="px-6" data-testid="bolig-stats">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-14">
            <div className="uppercase" style={{ color: C.gold, fontSize: 12, fontWeight: 600, letterSpacing: "0.18em" }}>Sælg hurtigere</div>
            <h2 className="mt-4" style={{ fontFamily: SERIF, color: C.white, fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 500, lineHeight: 1.15, letterSpacing: "-0.01em" }}>
              Tallene taler for sig selv.
            </h2>
            <p className="mt-4 max-w-2xl mx-auto" style={{ color: "rgba(255,255,255,0.7)", fontSize: 16, lineHeight: 1.6 }}>
              Boliger med professionel visualisering sælges hurtigere, til højere priser og tiltrækker flere visninger online.
            </p>
          </div>
          <div className="grid md:grid-cols-4 gap-8">
            {[
              { stat: "73%", label: "hurtigere salg", desc: "Iscenesatte boliger sælges i gennemsnit 73% hurtigere end ikke-iscenesatte." },
              { stat: "+8%", label: "højere salgspris", desc: "Køberne byder typisk 1–8% mere for en bolig, der er visualiseret professionelt." },
              { stat: "3×", label: "flere visninger online", desc: "Annoncer med staging-billeder får op til tre gange så mange klik på portalerne." },
              { stat: "95%", label: "af køberne søger online", desc: "Førstehåndsindtrykket skabes på skærmen — ikke ved fremvisningen." },
            ].map((s, i) => (
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
            Kilder: NAR Profile of Home Staging 2023 · RESA · Boligsiden markedsdata · ROOMAGEN · Capitalize Home
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="px-6" style={{ background: C.warm, paddingTop: 100, paddingBottom: 100 }} data-testid="bolig-features">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-14">
            <Overline>Funktioner</Overline>
            <H2>Alt hvad du behøver.</H2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
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
                    padding: "36px 32px",
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
                      {isOpen ? "Vis mindre" : "Læs mere"}
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

      {/* ── PRICING ── */}
      <section id="pricing" className="px-6" style={{ background: C.navy, paddingTop: 100, paddingBottom: 100 }} data-testid="bolig-pricing">
        <div className="mx-auto max-w-7xl">
          <div className="text-center mb-10">
            <Overline light>Priser</Overline>
            <H2 light>Vælg din plan.</H2>
            <p className="mt-4 max-w-2xl mx-auto" style={{ color: "rgba(255,255,255,0.65)", fontSize: 16, lineHeight: 1.6 }}>
              Alle nye konti inkluderer <span style={{ color: C.white, fontWeight: 600 }}>1 gratis visualisering</span> — ingen kreditkort krævet.
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
                Månedlig
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
                Årlig
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
                  Spar 20%
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
                      Mest populær
                    </div>
                  )}
                  <div className="uppercase" style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 600, letterSpacing: "0.15em" }}>{plan.name}</div>
                  <div className="mt-4 mb-2">
                    {price ? (
                      <>
                        {billing === "yearly" && plan.monthly !== null && (
                          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, textDecoration: "line-through", marginBottom: 2 }}>
                            {plan.monthly.toLocaleString("da-DK")} kr./md.
                          </div>
                        )}
                        <div className="flex items-end gap-2">
                          <span style={{ fontFamily: SERIF, fontWeight: 500, color: C.white, fontSize: 40, lineHeight: 1 }}>{price}</span>
                          <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 14, marginBottom: 4 }}>
                            kr./{billing === "monthly" ? "md." : "md., årligt"}
                          </span>
                        </div>
                      </>
                    ) : (
                      <span style={{ fontFamily: SERIF, fontWeight: 500, color: C.white, fontSize: 40, lineHeight: 1 }}>Custom</span>
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
                  <Link href={plan.href}>
                    <button
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
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = isPro ? C.goldHover : C.gold;
                        e.currentTarget.style.color = C.navy;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = isPro ? C.gold : "transparent";
                        e.currentTarget.style.color = isPro ? C.navy : C.gold;
                      }}
                      data-testid={`bolig-pricing-cta-${plan.name.toLowerCase()}`}
                    >
                      {plan.cta}
                    </button>
                  </Link>
                </motion.div>
              );
            })}
          </div>

          {/* Bridge → Enterprise */}
          <div className="relative mt-16 mb-10 flex items-center gap-4">
            <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.12)" }} />
            <div className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold uppercase tracking-widest whitespace-nowrap"
              style={{ border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)" }}>
              Enterprise — byg din plan
            </div>
            <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.12)" }} />
          </div>
          <EnterpriseCalculator dark />
        </div>
      </section>
      {/* ── FAQ ── */}
      <section id="faq" className="px-6" style={{ background: C.champagne, paddingTop: 100, paddingBottom: 100 }} data-testid="bolig-faq">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-14">
            <Overline>FAQ</Overline>
            <H2>Ofte stillede spørgsmål.</H2>
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
                <h3 style={{ color: C.navy, fontSize: 20, fontWeight: 600 }}>Står du med spørgsmål?</h3>
                <p className="mt-3 mb-6" style={{ color: C.muted, fontSize: 15, lineHeight: 1.6 }}>
                  Vi sidder klar til at hjælpe dig. Send os en besked, så vender vi tilbage inden for 24 timer.
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
                    Skriv til os
                  </button>
                </a>
              </div>
            </aside>
          </div>
        </div>
      </section>

      {/* ── PRE-FOOTER CTA ── */}
      <section className="px-6" style={{ background: C.navy, paddingTop: 100, paddingBottom: 100 }} data-testid="bolig-footer-cta">
        <div className="mx-auto max-w-3xl text-center">
          <H2 light style={{ fontSize: "clamp(28px, 4vw, 42px)" }}>Klar til at vise boligens potentiale?</H2>
          <p className="mt-5 mb-10" style={{ color: "rgba(255,255,255,0.7)", fontSize: 18, lineHeight: 1.6 }}>
            Opret en konto på 2 minutter — ingen kreditkort nødvendigt.
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
                Opret konto gratis
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
                Se priser
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
                AI-drevet boligvisualisering til ejendomsmæglere i Danmark.
              </p>
              <div
                className="flex items-center justify-center md:justify-start"
                style={{ gap: 20 }}
                data-testid="bolig-footer-social"
              >
                <a href="https://linkedin.com/company/formaestates" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" style={{ color: "rgba(255,255,255,0.45)", transition: "color 0.15s" }} onMouseEnter={e => (e.currentTarget.style.color = "#fff")} onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.45)")}>
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
              <div className="uppercase mb-4" style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: 600, letterSpacing: "0.15em" }}>Produkt</div>
              <ul className="space-y-3">
                {[["Sådan virker det", "#how-it-works"], ["Eksempler", "/boligpotentiale/eksempler"], ["Priser", "#pricing"]].map(([l, h]) => (
                  <li key={l}>
                    <a href={h} className="transition-colors hover:text-white" style={{ color: "rgba(255,255,255,0.65)", fontSize: 14 }}>{l}</a>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="uppercase mb-4" style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: 600, letterSpacing: "0.15em" }}>Support</div>
              <ul className="space-y-3">
                {[["FAQ", "#faq"], ["Kontakt", "mailto:kontakt@formaestates.com"], ["Privatlivspolitik", "#"]].map(([l, h]) => (
                  <li key={l}>
                    <a href={h} className="transition-colors hover:text-white" style={{ color: "rgba(255,255,255,0.65)", fontSize: 14 }}>{l}</a>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="uppercase mb-4" style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: 600, letterSpacing: "0.15em" }}>Kom i gang</div>
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
                  Opret konto gratis
                </button>
              </Link>
            </div>
          </div>
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 24, marginTop: 24 }}>
            <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>
              © 2026 Forma Estates · Danskudviklet og bygget i Danmark · All rights reserved
            </span>
          </div>
        </div>
      </footer>

      <CookieBanner />
    </div>
  );
}
