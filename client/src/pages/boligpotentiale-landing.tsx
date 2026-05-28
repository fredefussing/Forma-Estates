import { useState, useEffect, useRef } from "react";
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
  warm: "#F8F6F3",
  text: "#1A1A1A",
  muted: "#6B6B6B",
  border: "#E8E8E8",
  shadowCard: "0 4px 24px rgba(15, 25, 35, 0.08)",
  shadowCardHover: "0 8px 32px rgba(15, 25, 35, 0.12)",
};

const SERIF = "'Playfair Display', Georgia, serif";
const SANS = "'Inter', system-ui, -apple-system, sans-serif";

const NAV_LINKS = [
  { label: "SÅDAN VIRKER DET", href: "#how-it-works" },
  { label: "EKSEMPLER", href: "#showcase" },
  { label: "PRISER", href: "#pricing" },
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
  { Icon: Home, title: "Realistisk AI-rendering", desc: "Bevarer rummets vægge, vinduer og lysindfald — kun indretningen ændres." },
  { Icon: Palette, title: "8 designstile", desc: "Skandinavisk, moderne, industrielt, boho, klassisk og mere." },
  { Icon: Zap, title: "Klar på under 30 sek.", desc: "Ingen ventetid. Visualiseringen er klar, mens du stadig er i rummet — hurtigere end at tage en kop kaffe." },
  { Icon: Monitor, title: "Direkte i browseren", desc: "Ingen software eller installation. Alt foregår online." },
  { Icon: Download, title: "Download i høj opløsning", desc: "Klar til brug på boligportaler, sociale medier og tryksager." },
  { Icon: MessageCircle, title: "Dansk support", desc: "Vi sidder i Danmark og besvarer dine spørgsmål på hverdage." },
];

const SHOWCASE = [
  { before: "/bolig-images/living-scandi-before.jpg", after: "/bolig-images/living-scandi-after.jpg", room: "Stue", style: "Skandinavisk" },
  { before: "/bolig-images/kitchen-before.jpg", after: "/bolig-images/kitchen-after.jpg", room: "Køkken", style: "Moderne" },
  { before: "/bolig-images/living-modern-before.jpg", after: "/bolig-images/living-modern-after.jpg", room: "Stue", style: "Moderne" },
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
    name: "Starter",
    monthly: 2499,
    features: ["25 billeder / md.", "5 designstile", "HD download", "Email support"],
    cta: "Vælg Starter",
    href: "/opret",
  },
  {
    name: "Pro",
    monthly: 4999,
    features: ["100 billeder / md.", "Alle 8 designstile", "4K download", "Prioriteret support", "Branding på billeder"],
    cta: "Vælg Pro",
    highlight: true,
    href: "/opret",
  },
  {
    name: "Business",
    monthly: 9999,
    features: ["250 billeder / md.", "Alle designstile", "4K download", "API adgang", "Hvid-label mulighed", "Dedikeret support"],
    cta: "Vælg Business",
    href: "/opret",
  },
  {
    name: "Enterprise",
    monthly: null,
    features: ["Ubegrænsede billeder", "Alle designstile + custom", "4K download", "Fuld API adgang", "Hvid-label", "Dedikeret onboarding", "SLA & dedikeret support"],
    cta: "Kontakt os",
    href: "mailto:hej@formaestates.dk",
  },
];

const FAQS = [
  {
    q: "Hvad er Forma Estates?",
    a: "Forma Estates er et værktøj, der bruger kunstig intelligens til at omdesigne rum på fotos. Du uploader et billede, vælger en stil, og AI'en genererer et realistisk bud på, hvordan rummet kan se ud med ny indretning.",
  },
  {
    q: "Hvad får jeg gratis, og hvad koster det?",
    a: "Når du opretter en konto, får du 1 gratis visualisering — ingen kreditkort krævet. Herefter kan du vælge en af vores abonnementsplaner fra 2.499 kr./md.",
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
        className="fixed inset-0 z-[60]"
        style={{ background: "rgba(15,25,35,0.4)" }}
        data-testid="bolig-cookie-overlay"
      />
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
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");

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
    <div className="min-h-screen" style={{ background: C.white, color: C.text, fontFamily: SANS }}>

      {/* ── NAV ── */}
      <header
        className="fixed top-0 left-0 right-0 z-50 transition-all duration-200"
        style={{
          background: scrolled ? "rgba(255,255,255,0.85)" : C.white,
          backdropFilter: scrolled ? "blur(12px)" : "none",
          borderBottom: scrolled ? `1px solid ${C.border}` : "1px solid transparent",
        }}
      >
        <div className="mx-auto max-w-6xl flex items-center justify-between px-6 h-20">
          <Link href="/boligpotentiale">
            <div className="flex items-center gap-3 cursor-pointer select-none" data-testid="bolig-nav-logo">
              <img
                src={formaEstatesLogo}
                alt="Forma Estates"
                className="w-auto"
                style={{ height: 42 }}
              />
              <span
                className="hidden md:block uppercase"
                style={{
                  fontFamily: SERIF,
                  color: C.navy,
                  fontSize: 20,
                  fontWeight: 600,
                  letterSpacing: "0.25em",
                  lineHeight: 1,
                }}
              >
                FORMA ESTATES
              </span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-9">
            {NAV_LINKS.map((l) => (
              <a
                key={l.label}
                href={l.href}
                className="group relative transition-colors"
                style={{ color: C.muted, fontSize: 12, fontWeight: 500, letterSpacing: "0.1em" }}
                data-testid={`bolig-nav-${l.label}`}
              >
                <span className="group-hover:text-[color:var(--nav-hover)] transition-colors" style={{ ['--nav-hover' as any]: C.navy }}>{l.label}</span>
                <span className="absolute -bottom-1.5 left-0 h-[2px] w-0 group-hover:w-full transition-all duration-300" style={{ background: C.gold }} />
              </a>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3">
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
              style={{ background: C.white, borderTop: `1px solid ${C.border}` }}
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

      {/* ── HERO ── */}
      <section className="pt-20" data-testid="bolig-hero">
        <div className="mx-auto max-w-6xl px-6" style={{ paddingTop: 100, paddingBottom: 100 }}>
          <div className="grid lg:grid-cols-[55fr_45fr] gap-14 lg:gap-16 items-center">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.7, ease: "easeOut" }}>
              <div
                className="inline-flex items-center uppercase mb-7"
                style={{
                  color: C.gold,
                  background: C.goldTint,
                  borderRadius: 4,
                  padding: "6px 14px",
                  fontSize: 12,
                  fontWeight: 500,
                  letterSpacing: "0.15em",
                }}
              >
                AI-drevet boligvisualisering
              </div>
              <h1
                className="mb-6"
                style={{
                  color: C.navy,
                  fontFamily: SERIF,
                  fontWeight: 500,
                  fontSize: "clamp(36px, 5.4vw, 56px)",
                  lineHeight: 1.15,
                  letterSpacing: "-0.015em",
                }}
              >
                Vis boligens fulde potentiale på{" "}
                <span style={{ color: C.gold, fontStyle: "italic" }}>30 sekunder</span>
              </h1>
              <p className="mb-9" style={{ color: C.muted, fontSize: 18, lineHeight: 1.6, maxWidth: 480 }}>
                Upload et foto af et rum. Få et professionelt redesign klar til din annonce — på under 30 sekunder, til en brøkdel af prisen.
              </p>
              <Link href="/opret">
                <button
                  className="inline-flex items-center gap-2 text-white transition-colors hover:bg-[color:var(--gold-h)]"
                  style={{
                    ['--gold-h' as any]: C.goldHover,
                    background: C.gold,
                    padding: "16px 32px",
                    borderRadius: 8,
                    fontSize: 15,
                    fontWeight: 500,
                    fontFamily: SANS,
                  }}
                  data-testid="bolig-hero-cta-primary"
                >
                  Prøv gratis — 1 billede inkl.
                  <ArrowRight className="w-4 h-4" />
                </button>
              </Link>
              <p className="mt-3" style={{ color: C.muted, fontSize: 13 }}>
                Kom i gang gratis på 30 sekunder
              </p>
            </motion.div>

            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.7, delay: 0.12, ease: "easeOut" }}>
              <HeroSliderSection />
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how-it-works" style={{ background: C.warm, paddingTop: 100, paddingBottom: 100 }} className="px-6" data-testid="bolig-how-it-works">
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

      {/* ── SHOWCASE ── */}
      <section id="showcase" className="px-6" style={{ background: C.white, paddingTop: 100, paddingBottom: 100 }} data-testid="bolig-showcase">
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-14">
            <Overline>Eksempler</Overline>
            <H2>Se forvandlingen.</H2>
            <p className="mt-4" style={{ color: C.muted, fontSize: 16 }}>
              Ægte resultater — genereret med vores AI fra almindelige rumfotos.
            </p>
          </div>

          <div className="space-y-16">
            {SHOWCASE.map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.6, delay: i * 0.1, ease: "easeOut" }}
                data-testid={`bolig-showcase-item-${i}`}
              >
                <div className="mb-4" style={{ color: C.gold, fontSize: 13, fontWeight: 500 }}>
                  0{i + 1} · {item.room} · {item.style}
                </div>
                <div className="grid sm:grid-cols-2 gap-6">
                  <div>
                    <div className="overflow-hidden" style={{ borderRadius: 8, boxShadow: C.shadowCard }}>
                      <img src={item.before} alt={`${item.room} før`} className="w-full aspect-[4/3] object-cover" data-testid={`bolig-showcase-before-${i}`} />
                    </div>
                    <p className="text-center mt-3 uppercase" style={{ color: C.muted, fontSize: 12, letterSpacing: "0.12em" }}>Før</p>
                  </div>
                  <div>
                    <div className="overflow-hidden" style={{ borderRadius: 8, boxShadow: C.shadowCard }}>
                      <img src={item.after} alt={`${item.room} efter`} className="w-full aspect-[4/3] object-cover" data-testid={`bolig-showcase-after-${i}`} />
                    </div>
                    <p className="text-center mt-3 uppercase" style={{ color: C.gold, fontSize: 12, letterSpacing: "0.12em" }}>Efter — AI redesign</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="text-center mt-16">
            <Link href="/opret">
              <button
                className="inline-flex items-center gap-2 transition-colors hover:bg-[color:var(--navy)] hover:text-white"
                style={{
                  ['--navy' as any]: C.navy,
                  border: `1px solid ${C.navy}`,
                  color: C.navy,
                  background: "transparent",
                  padding: "14px 28px",
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 500,
                }}
                data-testid="bolig-showcase-cta"
              >
                Prøv selv gratis
                <ArrowRight className="w-4 h-4" />
              </button>
            </Link>
            <p className="mt-3" style={{ color: C.muted, fontSize: 13 }}>1 gratis visualisering ved oprettelse</p>
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
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={{ duration: 0.5, delay: (i % 3) * 0.1, ease: "easeOut" }}
                  className="transition-all duration-300 hover:-translate-y-1"
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

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mt-12">
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
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="px-6" style={{ background: C.white, paddingTop: 100, paddingBottom: 100 }} data-testid="bolig-faq">
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
                <a href="mailto:hej@formaestates.dk">
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
                style={{ gap: 20, color: "#6B6B6B", cursor: "default" }}
                data-testid="bolig-footer-social"
                aria-hidden="true"
              >
                <Linkedin size={22} strokeWidth={1.5} />
                <Facebook size={22} strokeWidth={1.5} />
                <Instagram size={22} strokeWidth={1.5} />
              </div>
            </div>
            <div>
              <div className="uppercase mb-4" style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: 600, letterSpacing: "0.15em" }}>Produkt</div>
              <ul className="space-y-3">
                {[["Sådan virker det", "#how-it-works"], ["Eksempler", "#showcase"], ["Priser", "#pricing"]].map(([l, h]) => (
                  <li key={l}>
                    <a href={h} className="transition-colors hover:text-white" style={{ color: "rgba(255,255,255,0.65)", fontSize: 14 }}>{l}</a>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="uppercase mb-4" style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: 600, letterSpacing: "0.15em" }}>Support</div>
              <ul className="space-y-3">
                {[["FAQ", "#faq"], ["Kontakt", "mailto:hej@formaestates.dk"], ["Privatlivspolitik", "#"]].map(([l, h]) => (
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
