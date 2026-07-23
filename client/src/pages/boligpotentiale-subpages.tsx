import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { usePageTitle } from "@/hooks/use-page-title";
import { Link } from "wouter";
import { ArrowLeft, Check, ArrowRight, X, ChevronLeft, ChevronRight } from "lucide-react";
import formaEstatesLogo from "@assets/forma-estates-logo.png";

const C = {
  navy: "#0F1923",
  gold: "#C9A96E",
  warm: "#F8F6F3",
  champagne: "#E8DFD0",
  white: "#FFFFFF",
  muted: "#6B7280",
  border: "#E5E1D8",
};

const SERIF = "'Playfair Display', Georgia, serif";
const SANS = "'Inter', system-ui, -apple-system, sans-serif";

function SubpageLayout({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ background: C.champagne, minHeight: "100vh", fontFamily: SANS, color: C.navy }}>
      {/* Header — simple wordmark + back link */}
      <header style={{ background: C.champagne, borderBottom: `1px solid ${C.border}` }}>
        <div className="mx-auto max-w-7xl flex items-center justify-between px-6" style={{ height: 96 }}>
          <Link href="/boligpotentiale">
            <div className="flex items-center cursor-pointer select-none" data-testid="subpage-logo">
              <img src={formaEstatesLogo} alt="Forma Estates" className="w-auto" style={{ height: 120 }} />
            </div>
          </Link>
          <Link
            href="/boligpotentiale"
            className="flex items-center gap-2 transition-colors hover:text-[color:var(--h)]"
            style={{ ['--h' as any]: C.gold, color: C.muted, fontSize: 13, fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase" }}
            data-testid="subpage-back"
          >
            <ArrowLeft className="w-4 h-4" />
            Tilbage til forsiden
          </Link>
        </div>
      </header>

      {/* Page hero — eyebrow + serif title + intro */}
      <section className="px-6 text-center" style={{ paddingTop: 96, paddingBottom: 64 }}>
        <div className="mx-auto" style={{ maxWidth: 760 }}>
          <div
            className="uppercase mb-4"
            style={{ color: C.gold, fontSize: 12, fontWeight: 600, letterSpacing: "0.32em" }}
            data-testid="subpage-eyebrow"
          >
            {eyebrow}
          </div>
          <h1
            style={{
              fontFamily: SERIF,
              color: C.navy,
              fontSize: "clamp(36px, 5vw, 56px)",
              fontWeight: 500,
              lineHeight: 1.1,
              letterSpacing: "-0.01em",
              marginBottom: 20,
            }}
            data-testid="subpage-title"
          >
            {title}
          </h1>
          <p style={{ color: C.muted, fontSize: 17, lineHeight: 1.6 }} data-testid="subpage-intro">
            {intro}
          </p>
        </div>
      </section>

      {/* Page body */}
      <main className="px-6" style={{ paddingBottom: 120 }}>
        <div className="mx-auto" style={{ maxWidth: 1184 }}>{children}</div>
      </main>

      {/* Footer */}
      <footer style={{ background: C.navy, color: C.white, padding: "48px 24px" }}>
        <div className="mx-auto max-w-7xl flex flex-col md:flex-row items-center justify-between gap-4">
          <div style={{ fontFamily: SERIF, fontSize: 14, letterSpacing: "0.32em" }}>FORMA ESTATES</div>
          <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
            © {new Date().getFullYear()} Forma Estates · CVR: 46551796 · AI-visualisering for ejendomsbranchen.
          </div>
        </div>
      </footer>
    </div>
  );
}

function ComingSoonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            background: C.white,
            border: `1px solid ${C.border}`,
            borderRadius: 14,
            aspectRatio: "4 / 3",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: C.muted,
            fontSize: 13,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
          data-testid={`subpage-placeholder-${i}`}
        >
          Indhold på vej
        </div>
      ))}
    </div>
  );
}

/* ── Reusable: Before/After image pair ── */
function BeforeAfterPair({
  before,
  after,
  title,
  desc,
  testId,
}: {
  before: string;
  after: string;
  title: string;
  desc: string;
  testId: string;
}) {
  const [lightbox, setLightbox] = useState<"before" | "after" | null>(null);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
      if (e.key === "ArrowLeft") setLightbox("before");
      if (e.key === "ArrowRight") setLightbox("after");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  const onTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 40) setLightbox(dx < 0 ? "after" : "before");
    touchStartX.current = null;
  };

  return (
    <>
      <div
        style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden", boxShadow: "0 8px 32px rgba(15,25,35,0.05)" }}
        data-testid={testId}
      >
        <div className="grid grid-cols-2 gap-px" style={{ background: C.border }}>
          {(["before", "after"] as const).map((side) => (
            <div
              key={side}
              className="relative cursor-zoom-in group"
              style={{ aspectRatio: "4 / 3" }}
              onClick={() => setLightbox(side)}
            >
              <img
                src={side === "before" ? before : after}
                alt={`${title} — ${side === "before" ? "før" : "efter"}`}
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
              />
              <div
                className="absolute top-3 left-3 uppercase"
                style={{ background: side === "before" ? "rgba(15,25,35,0.78)" : C.gold, color: "#fff", padding: "5px 11px", borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: "0.18em" }}
              >
                {side === "before" ? "Før" : "Efter"}
              </div>
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ background: "rgba(15,25,35,0.18)" }}>
                <span style={{ background: "rgba(255,255,255,0.92)", color: C.navy, fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", padding: "6px 14px", borderRadius: 20, textTransform: "uppercase" }}>Forstør</span>
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding: "22px 26px 26px" }}>
          <div style={{ fontFamily: SERIF, color: C.navy, fontSize: 22, fontWeight: 500, lineHeight: 1.25, marginBottom: 6 }}>{title}</div>
          <div style={{ color: C.muted, fontSize: 14.5, lineHeight: 1.55 }}>{desc}</div>
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
          style={{ background: "rgba(10,15,22,0.95)" }}
          onClick={() => setLightbox(null)}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {/* Close */}
          <button
            className="absolute top-5 right-5 flex items-center justify-center rounded-full transition-colors"
            style={{ background: "rgba(255,255,255,0.12)", width: 44, height: 44, color: "#fff", border: "none", cursor: "pointer" }}
            onClick={(e) => { e.stopPropagation(); setLightbox(null); }}
          >
            <X className="w-5 h-5" />
          </button>

          {/* Image */}
          <div
            className="relative w-full flex items-center justify-center px-14"
            style={{ maxHeight: "80vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={lightbox === "before" ? before : after}
              alt={title}
              style={{ maxWidth: "90vw", maxHeight: "76vh", objectFit: "contain", borderRadius: 10, boxShadow: "0 24px 80px rgba(0,0,0,0.5)" }}
            />
          </div>

          {/* Toggle FØR / EFTER */}
          <div
            className="flex items-center gap-3 mt-6"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setLightbox("before")}
              style={{ padding: "8px 22px", borderRadius: 30, fontSize: 12, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", cursor: "pointer", border: "none", transition: "all 0.2s", background: lightbox === "before" ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.12)", color: lightbox === "before" ? C.navy : "rgba(255,255,255,0.7)" }}
            >
              FØR
            </button>
            <button
              onClick={() => setLightbox("after")}
              style={{ padding: "8px 22px", borderRadius: 30, fontSize: 12, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", cursor: "pointer", border: "none", transition: "all 0.2s", background: lightbox === "after" ? C.gold : "rgba(255,255,255,0.12)", color: lightbox === "after" ? "#fff" : "rgba(255,255,255,0.7)" }}
            >
              EFTER
            </button>
          </div>

          {/* Prev/Next arrows */}
          <button
            className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center justify-center rounded-full transition-colors"
            style={{ background: "rgba(255,255,255,0.12)", width: 44, height: 44, color: "#fff", border: "none", cursor: "pointer" }}
            onClick={(e) => { e.stopPropagation(); setLightbox("before"); }}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center justify-center rounded-full transition-colors"
            style={{ background: "rgba(255,255,255,0.12)", width: 44, height: 44, color: "#fff", border: "none", cursor: "pointer" }}
            onClick={(e) => { e.stopPropagation(); setLightbox("after"); }}
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginTop: 16 }}>Swipe eller brug piletasterne</p>
        </div>,
        document.body
      )}
    </>
  );
}

/* ── Reusable: feature row (3 small benefit cards) ── */
function BenefitRow({ items }: { items: { title: string; desc: string }[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-10">
      {items.map((it) => (
        <div
          key={it.title}
          style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: "22px 24px" }}
        >
          <div style={{ fontFamily: SERIF, color: C.navy, fontSize: 17, fontWeight: 600, marginBottom: 6 }}>{it.title}</div>
          <div style={{ color: C.muted, fontSize: 14, lineHeight: 1.55 }}>{it.desc}</div>
        </div>
      ))}
    </div>
  );
}

export function EksemplerPage() {
  usePageTitle("Eksempler på AI-boligvisualisering", "Se før/efter-eksempler på AI-genereret boligstyling og iscenesættelse fra Forma Estates.");
  const pairs = [
    { before: "/bolig-images/living-scandi-before.jpg", after: "/bolig-images/living-scandi-after.jpg", title: "Entre — skandinavisk", desc: "Lyse træfarver, naturlige tekstiler og dæmpet belysning." },
    { before: "/bolig-images/dining-before.jpg", after: "/bolig-images/dining-after.jpg", title: "Spisestue — skandinavisk", desc: "Rene linjer, varme træmøbler og naturligt lys." },
    { before: "/bolig-images/kitchen-before.jpg", after: "/bolig-images/kitchen-after.jpg", title: "Køkken — landlig", desc: "Træfronter, sten og naturligt lys gør rummet levende." },
    { before: "/bolig-images/demo-bathroom-before.jpg", after: "/bolig-images/demo-bathroom-after-clean.png", title: "Badeværelse — japandi", desc: "Sten, træ og papirlamper skaber ro og balance." },
    { before: "/bolig-images/facade-before.jpg", after: "/bolig-images/ai-agent-after-v2.jpg", title: "Herregård — restaureret", desc: "Forfaldent hus transformeret til præsentabelt drømmehus." },
  ];
  return (
    <SubpageLayout
      eyebrow="Eksempler"
      title="Et udvalg af boliger vi har visualiseret"
      intro="Bladr gennem ægte før/efter-cases fra danske mæglere. Hvert eksempel viser hvordan tomme rum bliver til hjem køberne kan se sig selv i."
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-7">
        {pairs.map((p, i) => (
          <BeforeAfterPair key={p.title} {...p} testId={`eksempel-pair-${i}`} />
        ))}
      </div>
    </SubpageLayout>
  );
}

export function ForEfterPage() {
  usePageTitle("Før & efter — AI-iscenesættelse", "Se hvordan AI forvandler tomme og slidte rum til indbydende boliger på få sekunder.");
  const pairs = [
    { before: "/bolig-images/demo-bathroom-before.jpg", after: "/bolig-images/demo-bathroom-after-clean.png", title: "Badeværelse → skandinavisk stil", desc: "Blå mosaikfliser forvandlet til lyst skandinavisk badeværelse med egetræ, messing og natursten." },
    { before: "/bolig-images/demo-dining-before.jpg", after: "/bolig-images/demo-dining-after.jpg", title: "Spisestue → skandinavisk stil", desc: "Mørkt og rodet rum transformeret til lyst, nordisk spisemiljø med naturlige materialer og ro." },
    { before: "/bolig-images/demo-room-before.jpg", after: "/bolig-images/demo-room-after.jpg", title: "Tomt rum → iscenesat hjem", desc: "Fra bart og tomt til et rum med liv, lys og personlighed — på få sekunder." },
  ];
  return (
    <SubpageLayout
      eyebrow="Før / Efter"
      title="AI-iscenesættelse af tomme rum"
      intro="Upload et foto af et tomt rum. Få det tilbage iscenesat i den stil der passer til boligen — møbler, lys og tekstiler placeret naturligt på under 20 sekunder."
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-7">
        {pairs.map((p, i) => (
          <BeforeAfterPair key={p.title} {...p} testId={`foer-efter-pair-${i}`} />
        ))}
      </div>
      <BenefitRow
        items={[
          { title: "20 sekunder", desc: "Fra upload til færdig visualisering. Ingen ventetid, ingen fotograf." },
          { title: "Flere stilarter", desc: "Skandinavisk, moderne, klassisk — vis samme rum i flere udtryk." },
          { title: "Køberen ser sig selv", desc: "Et iscenesat rum forkorter tiden til første bud markant." },
        ]}
      />

      {/* ── 9 stilarter guide ── */}
      <div style={{ marginTop: 72 }}>
        <div className="text-center mb-10">
          <span className="uppercase" style={{ color: C.gold, fontSize: 11, fontWeight: 600, letterSpacing: "0.32em" }}>9 tilgængelige stilarter</span>
          <h2 className="mt-3" style={{ fontFamily: SERIF, color: C.navy, fontSize: 32, fontWeight: 500, lineHeight: 1.2, letterSpacing: "-0.01em" }}>
            Find den stil der sælger boligen
          </h2>
          <p className="mt-3 mx-auto" style={{ color: C.muted, fontSize: 15.5, lineHeight: 1.65, maxWidth: 520 }}>
            Vores AI behersker ni distinkте stilarter. Upload ét foto — prøv dem alle. Vi anbefaler at starte med Skandinavisk, da efterspørgslen er størst på det danske marked.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[
            {
              label: "Skandinavisk",
              tag: "Mest populær",
              desc: "Lyst egetræ, naturlige tekstiler og dæmpet lys. Skaber den varme, hyggelige fornemmelse danske købere reagerer stærkest på. Passer til næsten alle boligtyper.",
              recommended: true,
            },
            {
              label: "Moderne",
              tag: null,
              desc: "Rene linjer, mørke accenter og statementmøbler. Fungerer særligt godt i nybyggeri og loftlejligheder med åbne planløsninger.",
            },
            {
              label: "Luksus",
              tag: null,
              desc: "Designermøbler, messing og bespoke detaljer. Ideelt til præmiumboliger og villaer, hvor prissætningen skal understøttes af visuelle signaler om kvalitet.",
            },
            {
              label: "Japandi",
              tag: null,
              desc: "Fusion af japansk zen og skandinavisk enkelhed. Stensætninger, naturmaterialer og afdæmpet palet — stærkt valg til rolige badeværelser og soverum.",
            },
            {
              label: "Minimalistisk",
              tag: null,
              desc: "Bare essentials, neutral farvepalet og bevidst negativt rum. Lader arkitekturen tale og fungerer godt, når boligens struktur er det stærkeste salgsargument.",
            },
            {
              label: "Industriel",
              tag: null,
              desc: "Eksponeret beton, stål og råt træ. Passer til loftkonversioner, townhouses og boliger med høje lofter og store vinduer.",
            },
            {
              label: "Bohemisk",
              tag: null,
              desc: "Lag på lag af tekstiler, planter og varme jordtoner. Skaber en levende, personlig stemning — effektivt til rum der ellers virker kliniske.",
            },
            {
              label: "Kyst",
              tag: null,
              desc: "Drivtømmer, hvide nuancer og maritime accenter. Naturlig kandidat til sommerhuse, strandnære lejligheder og boliger med havudsigt.",
            },
            {
              label: "Landlig",
              tag: null,
              desc: "Varmt træ, rustikke overflader og hyggelig atmosfære. Fremhæver ældre ejendommes charme og fungerer godt i landejendomme og byhuse.",
            },
          ].map((s) => (
            <div
              key={s.label}
              style={{
                background: s.recommended ? C.navy : C.white,
                border: s.recommended ? "none" : `1px solid ${C.border}`,
                borderRadius: 14,
                padding: "24px 26px 26px",
                boxShadow: s.recommended ? "0 12px 40px rgba(15,25,35,0.14)" : "0 4px 16px rgba(15,25,35,0.04)",
                position: "relative",
              }}
            >
              {s.tag && (
                <span
                  className="inline-block mb-3"
                  style={{ background: C.gold, color: "#fff", fontSize: 10, fontWeight: 700, letterSpacing: "0.18em", padding: "4px 10px", borderRadius: 4, textTransform: "uppercase" }}
                >
                  {s.tag}
                </span>
              )}
              <div style={{ fontFamily: SERIF, color: s.recommended ? "#fff" : C.navy, fontSize: 19, fontWeight: 500, marginBottom: 8 }}>
                {s.label}
              </div>
              <div style={{ color: s.recommended ? "rgba(255,255,255,0.72)" : C.muted, fontSize: 14, lineHeight: 1.6 }}>
                {s.desc}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row justify-center gap-4 mt-10">
          {[
            { tier: "Niveau 1", label: "Budget", example: "IKEA · JYSK · Jysk", desc: "Pænt og funktionelt uden at overdrive" },
            { tier: "Niveau 2", label: "Standard", example: "BoConcept · HAY · Muuto", desc: "Mellemklasse med genkendeligt dansk design" },
            { tier: "Niveau 3", label: "Premium", example: "Fritz Hansen · Carl Hansen", desc: "Designermøbler til præmiumboliger" },
          ].map((t) => (
            <div key={t.tier} className="flex-1 text-center" style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: "18px 20px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: C.gold, marginBottom: 4 }}>{t.tier}</div>
              <div style={{ fontFamily: SERIF, color: C.navy, fontSize: 17, fontWeight: 500, marginBottom: 4 }}>{t.label}</div>
              <div style={{ color: C.muted, fontSize: 12.5, marginBottom: 6 }}>{t.example}</div>
              <div style={{ color: C.muted, fontSize: 13, lineHeight: 1.5 }}>{t.desc}</div>
            </div>
          ))}
        </div>
        <p className="text-center mt-5" style={{ color: C.muted, fontSize: 13 }}>
          Alle 9 stilarter er tilgængelige på alle tre niveauer.
        </p>
      </div>
    </SubpageLayout>
  );
}

export function PlantegningPage() {
  usePageTitle("3D Plantegninger", "Forvandl 2D plantegninger til fotorealistiske 3D-visualiseringer, der hjælper købere med at forstå boligen.");
  return (
    <SubpageLayout
      eyebrow="3D Plantegning"
      title="Lad køber gå gennem boligen før første visning"
      intro="Vi laver interaktive 3D-plantegninger der viser flowet i boligen. Køberen forstår rummene før de møder op — og kommer mere kvalificerede til fremvisning."
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-7">
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden", boxShadow: "0 8px 32px rgba(15,25,35,0.05)" }} data-testid="plantegning-2d">
          <div className="relative" style={{ aspectRatio: "4 / 3" }}>
            <img src="/bolig-images/demo-floorplan-2d.png" alt="2D plantegning" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute top-3 left-3 uppercase" style={{ background: "rgba(15,25,35,0.78)", color: "#fff", padding: "5px 11px", borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: "0.18em" }}>2D</div>
          </div>
          <div style={{ padding: "22px 26px" }}>
            <div style={{ fontFamily: SERIF, color: C.navy, fontSize: 20, fontWeight: 500, marginBottom: 6 }}>Den traditionelle plantegning</div>
            <div style={{ color: C.muted, fontSize: 14.5, lineHeight: 1.55 }}>Funktionel, men svær for køberen at omsætte til en fornemmelse af boligen.</div>
          </div>
        </div>
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden", boxShadow: "0 8px 32px rgba(15,25,35,0.05)" }} data-testid="plantegning-3d">
          <div className="relative" style={{ aspectRatio: "4 / 3" }}>
            <img src="/bolig-images/demo-floorplan-3d.png" alt="3D plantegning" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute top-3 left-3 uppercase" style={{ background: C.gold, color: "#fff", padding: "5px 11px", borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: "0.18em" }}>3D</div>
          </div>
          <div style={{ padding: "22px 26px" }}>
            <div style={{ fontFamily: SERIF, color: C.navy, fontSize: 20, fontWeight: 500, marginBottom: 6 }}>Den iscenesatte 3D-version</div>
            <div style={{ color: C.muted, fontSize: 14.5, lineHeight: 1.55 }}>Køberen fornemmer rumforhold, lysindfald og flow med det samme.</div>
          </div>
        </div>
      </div>

      {/* 3D model showcase — billede venstre, tekst højre (samme bredde som de to øverste kort) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-7" data-testid="plantegning-3d-model">
        {/* Billede-halvdel */}
        <div style={{ borderRadius: 16, overflow: "hidden", boxShadow: "0 8px 32px rgba(15,25,35,0.05)" }}>
          <div className="relative w-full" style={{ aspectRatio: "4 / 3" }}>
            <img
              src="/bolig-images/3d-model-showcase.png"
              alt="Interaktiv 3D model af bolig"
              className="absolute inset-0 w-full h-full object-cover"
              style={{ objectPosition: "center center" }}
            />
            <div className="absolute top-3 left-3 uppercase" style={{ background: C.gold, color: "#fff", padding: "5px 11px", borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: "0.18em" }}>3D Model</div>
          </div>
        </div>
        {/* Tekst-halvdel */}
        <div style={{ background: "#1A2535", border: `1px solid rgba(255,255,255,0.07)`, borderRadius: 16, padding: "26px 28px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ fontFamily: SERIF, color: "#fff", fontSize: 20, fontWeight: 500, marginBottom: 10 }}>Den fulde interaktive 3D-oplevelse</div>
          <div style={{ color: "rgba(255,255,255,0.58)", fontSize: 14.5, lineHeight: 1.65 }}>
            Ud over 3D-billedet genererer Forma Estates en interaktiv 3D-model — køber kan dreje, zoome og udforske boligen fra alle vinkler direkte i browseren, helt uden software. Det giver en boligoplevelse tæt på en fysisk fremvisning, allerede fra annoncen.
          </div>
        </div>
      </div>

      <BenefitRow
        items={[
          { title: "Bedre fremvisninger", desc: "Køberne kommer forberedte. Færre tidsspild på rundvisninger." },
          { title: "Skiller sig ud", desc: "Boligannoncen får en interaktiv 3D-model køber kan udforske — langt de færreste mæglere tilbyder det." },
          { title: "Klar på få minutter", desc: "Upload din 2D-plantegning direkte i platformen — AI genererer 3D-billedet og modellen selv. Du behøver ikke sende noget til os." },
        ]}
      />
    </SubpageLayout>
  );
}

export function BranchevideoPage() {
  usePageTitle("Salgsvideoer", "AI-genererede salgsvideoer til boligannoncer — skab levende præsentationer af boligen på få minutter.");
  return (
    <SubpageLayout
      eyebrow="Branchevideo"
      title="Cinematiske videogennemgange"
      intro="Levende videoer der vækker følelser. Vi forvandler statiske billeder til en cinematisk fortælling om boligens potentiale — klar til annoncen."
    >
      {/* Featured video */}
      <div
        style={{ background: C.navy, borderRadius: 18, overflow: "hidden", boxShadow: "0 12px 40px rgba(15,25,35,0.18)" }}
        data-testid="branchevideo-featured"
      >
        <div className="relative" style={{ aspectRatio: "16 / 9" }}>
          <video
            src="/videos/transformation-kling-v16-pro.mp4"
            controls
            playsInline
            onLoadedMetadata={(e) => { e.currentTarget.currentTime = 0.5; }}
            className="absolute inset-0 w-full h-full object-cover"
          />
        </div>
        <div style={{ padding: "26px 30px 30px", color: "#fff" }}>
          <div className="uppercase mb-2" style={{ color: C.gold, fontSize: 11, fontWeight: 700, letterSpacing: "0.24em" }}>
            Kling 1.6 Pro · 1080p
          </div>
          <div style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 500, lineHeight: 1.2 }}>
            Ét stillbillede bliver til 5 sekunders levende video.
          </div>
          <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 14.5, lineHeight: 1.55, marginTop: 8 }}>
            Tilføj liv til boligannoncen uden filmhold, lys eller efterredigering. Klar til upload i sociale medier og portaler.
          </div>
        </div>
      </div>

      {/* Two example posters */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-7 mt-7">
        {[
          { src: "/bolig-images/living-scandi-after.jpg", title: "Stue — rolig pan", desc: "Langsom kamerabevægelse fra vindue mod sofagruppe." },
          { src: "/bolig-images/living-modern-after.jpg", title: "Stue — dybde-zoom", desc: "Kameraet bevæger sig ind i rummet og åbner perspektivet." },
        ].map((v, i) => (
          <div
            key={v.title}
            style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden", boxShadow: "0 8px 32px rgba(15,25,35,0.05)" }}
            data-testid={`branchevideo-example-${i}`}
          >
            <div className="relative" style={{ aspectRatio: "16 / 9" }}>
              <img src={v.src} alt={v.title} className="absolute inset-0 w-full h-full object-cover" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="rounded-full flex items-center justify-center" style={{ width: 56, height: 56, background: "rgba(255,255,255,0.92)", color: C.navy }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                </div>
              </div>
            </div>
            <div style={{ padding: "18px 22px 22px" }}>
              <div style={{ fontFamily: SERIF, color: C.navy, fontSize: 18, fontWeight: 500, marginBottom: 4 }}>{v.title}</div>
              <div style={{ color: C.muted, fontSize: 14, lineHeight: 1.55 }}>{v.desc}</div>
            </div>
          </div>
        ))}
      </div>

      <BenefitRow
        items={[
          { title: "5 sekunder · 1080p", desc: "Optimal længde til Instagram, Facebook og portalannoncer." },
          { title: "Ingen filmhold", desc: "Du sender ét billede — vi leverer videoen samme dag." },
          { title: "Mere engagement", desc: "Videoannoncer får markant flere klik end stillbilleder." },
        ]}
      />
    </SubpageLayout>
  );
}

export function OmOsPage() {
  usePageTitle("Om os", "Mød Forma Estates — vi hjælper ejendomsmæglere med AI-boligvisualisering, 3D plantegninger og salgsvideoer.");
  const values = [
    {
      title: "Lokal forandring",
      desc: "Vi er danske, vi kender det danske marked, og vi udvikler specifikt til den danske ejendomsbranche — fra Københavns ejerlejligheder og ejendomsudviklere til boligforeninger og udlejere på landet.",
    },
    {
      title: "Innovation med mening",
      desc: "Vi tager den nyeste teknologi til os — men kun hvor den skaber reel værdi. Hvert produkt skal løse et konkret problem. Teknologi for teknologiens skyld er ikke vores vej.",
    },
    {
      title: "Tilgængelighed",
      desc: "Avanceret teknologi skal ikke være forbeholdt store aktører med dyre budgetter. Vores priser er designet til alle — fra den selvstændige mægler til det store ejendomsudviklingsselskab.",
    },
    {
      title: "Kvalitet først",
      desc: "Hvert billede, hver video og hver 3D-model skal leve op til professionelle standarder. Vi går aldrig på kompromis med kvaliteten — for jeres omdømme er også vores.",
    },
    {
      title: "Mennesket i centrum",
      desc: "Vores teknologi forstærker den professionelles rolle — den erstatter den aldrig. Din ekspertise og dine kunderelationer er uundværlige. Teknologien er værktøjet, du er håndværkeren.",
    },
  ];

  return (
    <SubpageLayout
      eyebrow="Om os"
      title="Hvem er vi?"
      intro="Forma Estates er et dansk teknologiselskab grundlagt i København med ét klart mål: at hjælpe ejendomsbranchen med at præsentere ejendomme professionelt og effektivt — uden at gå på kompromis med kvaliteten."
    >
      {/* Intro story */}
      <div className="mx-auto" style={{ maxWidth: 760 }}>
        <div className="space-y-5" data-testid="omos-intro">
          <p style={{ color: C.muted, fontSize: 16.5, lineHeight: 1.75 }}>
            Vi revolutionerer den danske ejendomsbranche gennem kunstig intelligens. Vi udvikler
            skræddersyede værktøjer, der hjælper mæglere, udviklere, boligforeninger og udlejere med
            at spare tid, reducere omkostninger og præsentere ejendomme hurtigere og mere professionelt
            — uden at gå på kompromis med kvaliteten.
          </p>
          <p style={{ color: C.muted, fontSize: 16.5, lineHeight: 1.75 }}>
            Vi tror på, at teknologi skal tjene mennesker — ikke erstatte dem. Vores produkter er
            designet til at forstærke den professionelles ekspertise og frigøre tid til det, der
            virkelig betyder noget: rådgivning, relationer og de beslutninger, der kræver et
            menneskeligt øje.
          </p>
          <p style={{ color: C.muted, fontSize: 16.5, lineHeight: 1.75 }}>
            Forma Estates er jeres teknologipartner — uanset om du er selvstændig mægler, del af et
            stort ejendomsudviklingsselskab, boligforening eller B2B-udlejer. Vi arbejder tæt sammen
            med aktører på tværs af branchen for at forstå deres udfordringer og udvikle løsninger,
            der virker i praksis, ikke kun på papiret.
          </p>
        </div>
      </div>

      {/* Vision & Mission */}
      <div className="grid md:grid-cols-2 gap-6 mt-16" data-testid="omos-vision-mission">
        <div style={{ background: C.navy, borderRadius: 16, padding: "34px 32px", color: C.white }}>
          <div className="uppercase mb-3" style={{ color: C.gold, fontSize: 11, fontWeight: 600, letterSpacing: "0.22em" }}>
            Vision
          </div>
          <p style={{ color: "rgba(255,255,255,0.82)", fontSize: 15.5, lineHeight: 1.7 }}>
            At blive Danmarks største og mest betroede AI-platform for ejendomsbranchen — lokalt
            udviklet, globalt inspireret. Vi vil sætte standarden for, hvordan teknologi transformerer
            ejendomspræsentation i Norden, og gøre avanceret visualisering tilgængelig for alle
            professionelle aktører, uanset størrelse eller budget.
          </p>
        </div>
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: "34px 32px" }}>
          <div className="uppercase mb-3" style={{ color: C.gold, fontSize: 11, fontWeight: 600, letterSpacing: "0.22em" }}>
            Mission
          </div>
          <p style={{ color: C.muted, fontSize: 15.5, lineHeight: 1.7 }}>
            At udvikle innovative produkter, der hjælper professionelle i ejendomsbranchen med at spare
            tid og levere en overlegen præsentation — hvad enten formålet er salg, udlejning,
            renovering eller projekter. Vi skaber værktøjer, der er intuitive, prisvenlige og designet
            specifikt til det danske marked.
          </p>
        </div>
      </div>

      {/* Values */}
      <div className="text-center mt-20 mb-2">
        <div className="uppercase" style={{ color: C.gold, fontSize: 12, fontWeight: 600, letterSpacing: "0.32em" }}>
          Vores værdier
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mt-8" data-testid="omos-values">
        {values.map((v) => (
          <div
            key={v.title}
            style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: "26px 26px" }}
            data-testid={`omos-value-${v.title}`}
          >
            <div style={{ fontFamily: SERIF, color: C.navy, fontSize: 18, fontWeight: 600, marginBottom: 8 }}>{v.title}</div>
            <div style={{ color: C.muted, fontSize: 14.5, lineHeight: 1.6 }}>{v.desc}</div>
          </div>
        ))}
      </div>

      {/* Journey */}
      <div className="mx-auto mt-20" style={{ maxWidth: 760 }} data-testid="omos-journey">
        <div className="text-center mb-8">
          <div className="uppercase mb-3" style={{ color: C.gold, fontSize: 12, fontWeight: 600, letterSpacing: "0.32em" }}>
            Vores rejse
          </div>
          <h2 style={{ fontFamily: SERIF, color: C.navy, fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 500, lineHeight: 1.15 }}>
            Fra ét produkt til en hel platform.
          </h2>
        </div>
        <div className="space-y-5">
          <p style={{ color: C.muted, fontSize: 16.5, lineHeight: 1.75 }}>
            Forma Estates blev grundlagt i 2025 i København — midt i et boomende boligmarked og en
            teknologisk revolution. Vi så et hul i markedet: mens globale værktøjer til ejendom
            eksisterede, var ingen af dem skræddersyet til danske forhold — hverken sprogligt,
            æstetisk eller prismæssigt.
          </p>
          <p style={{ color: C.muted, fontSize: 16.5, lineHeight: 1.75 }}>
            Vi startede med ét produkt: AI Boligvisualisering. Responsen var overvældende — ikke bare
            fra mæglere, men fra udviklere, boligforeninger og udlejere. Behovet var tydeligt: hurtig,
            professionel og prisvenlig visualisering uden den logistiske hovedpine ved fysisk møblering.
          </p>
          <p style={{ color: C.muted, fontSize: 16.5, lineHeight: 1.75 }}>
            Siden da har vi udvidet med AI Design Agent til præcise justeringer, 3D plantegning,
            før/efter-transformationsvideo og cinematiske showcase-videoer til sociale medier. Hvert
            produkt er udviklet i tæt samarbejde med aktive brugere på tværs af ejendomsbranchen.
          </p>
          <p style={{ color: C.muted, fontSize: 16.5, lineHeight: 1.75 }}>
            I dag arbejder vi mod at dække hele Danmark — fra Skagen til Sønderborg — og drømmer om
            at gøre Forma Estates til synonymet med AI-drevet ejendomspræsentation i Norden.
          </p>
        </div>
        <div className="text-center mt-10">
          <Link href="/kontakt">
            <button
              className="inline-flex items-center justify-center gap-2 transition-colors"
              style={{ background: C.gold, color: C.navy, padding: "14px 28px", borderRadius: 8, fontSize: 14, fontWeight: 600 }}
              data-testid="omos-cta"
            >
              Kontakt os
              <ArrowRight className="w-4 h-4" />
            </button>
          </Link>
          <div className="mt-8" style={{ color: C.muted, fontSize: 13 }}>
            Forma Estates · CVR: 46551796 · København, Danmark
          </div>
        </div>
      </div>
    </SubpageLayout>
  );
}


export function BoligShowcasePage() {
  usePageTitle("Bolig-showcase", "Se eksempler på komplette AI-producerede bolig-showcases med billeder og video fra Forma Estates.");
  const showcaseVideoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = showcaseVideoRef.current;
    if (!v) return;
    v.muted = true;
    v.play().catch(() => {});
  }, []);
  const examples = [
    {
      src: "/bolig-images/living-scandi-after.jpg",
      title: "Stue — skandinavisk",
      desc: "Lyst egetræ, uldtæppe og stearinlys gør det tomt rum til et hjem køber kan se sig selv i.",
    },
    {
      src: "/bolig-images/living-modern-after.jpg",
      title: "Stue — moderne",
      desc: "Rene linjer og mørke accenter fremhæver rummets arkitektur og størrelse.",
    },
    {
      src: "/bolig-images/kitchen-after.jpg",
      title: "Køkken — landlig",
      desc: "Træfronter og naturligt lys giver køkkenet liv og varme.",
    },
    {
      src: "/bolig-images/demo-bathroom-after-clean.png",
      title: "Badeværelse — japandi",
      desc: "Sten, træ og dæmpet palet skaber ro og balance.",
    },
  ];

  return (
    <SubpageLayout
      eyebrow="Bolig Showcase"
      title="Vis boligens fulde potentiale"
      intro="Præsentér alle rum i deres bedste lys med professionelle AI-visualiseringer — klar til annoncen, sociale medier og fremvisning. Vi dækker hele boligen på én gang."
    >
      {/* Featured vertical video */}
      <div className="flex flex-col items-center mb-14" data-testid="showcase-featured-video">
        <div className="uppercase mb-4" style={{ color: C.gold, fontSize: 11, fontWeight: 600, letterSpacing: "0.32em", textAlign: "center" }}>
          Eksempel på en færdig showcase
        </div>
        <div className="relative rounded-2xl overflow-hidden" style={{ width: "min(300px, 90%)", aspectRatio: "9/16", boxShadow: "0 24px 60px rgba(15,25,35,0.18)" }}>
          <video
            ref={showcaseVideoRef}
            src="/videos/bolig-showcase-v1.mp4"
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            className="absolute inset-0 w-full h-full object-cover"
            data-testid="showcase-video"
          />
          <div className="absolute top-3 right-3 flex items-center gap-1.5 pointer-events-none"
            style={{ background: "rgba(15,25,35,0.72)", color: "#fff", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", padding: "4px 9px", borderRadius: 4 }}>
            <svg width="8" height="13" viewBox="0 0 8 13" fill="none"><rect x="0.5" y="0.5" width="7" height="12" rx="1.5" stroke="white" strokeWidth="1"/><rect x="2" y="10" width="4" height="1" rx="0.5" fill="white"/></svg>
            LODRET VIDEO
          </div>
        </div>
        <p className="mt-4 text-center" style={{ color: C.muted, fontSize: 14, maxWidth: 300, lineHeight: 1.6 }}>
          Lodret format — klar til Instagram Reels, TikTok og Facebook
        </p>
      </div>

      {/* Grid af eksempler */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-7" data-testid="showcase-grid">
        {examples.map((ex, i) => (
          <div
            key={ex.title}
            style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden", boxShadow: "0 8px 32px rgba(15,25,35,0.05)" }}
            data-testid={`showcase-example-${i}`}
          >
            <div className="relative" style={{ aspectRatio: "4 / 3" }}>
              <img
                src={ex.src}
                alt={ex.title}
                className="absolute inset-0 w-full h-full object-cover"
              />
              <div
                className="absolute top-3 left-3 uppercase"
                style={{ background: C.gold, color: "#fff", padding: "5px 11px", borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: "0.18em" }}
              >
                AI Visualisering
              </div>
            </div>
            <div style={{ padding: "22px 26px 26px" }}>
              <div style={{ fontFamily: SERIF, color: C.navy, fontSize: 20, fontWeight: 500, lineHeight: 1.25, marginBottom: 6 }}>{ex.title}</div>
              <div style={{ color: C.muted, fontSize: 14.5, lineHeight: 1.55 }}>{ex.desc}</div>
            </div>
          </div>
        ))}
      </div>

      <BenefitRow
        items={[
          { title: "Hele boligen dækket", desc: "Stue, køkken, soveværelse, badeværelse — alle rum iscenesat i én leverance." },
          { title: "Klar til annoncen", desc: "Høj opløsning, klar til Boligsiden, Estate og sociale medier uden ekstra redigering." },
          { title: "Hurtig leverance", desc: "Fra upload til komplet showcase på under én time — ingen fotograf, ingen ventetid." },
        ]}
      />

      {/* Hvad er inkluderet */}
      <div style={{ marginTop: 72 }}>
        <div className="text-center mb-10">
          <span className="uppercase" style={{ color: C.gold, fontSize: 11, fontWeight: 600, letterSpacing: "0.32em" }}>Hvad er inkluderet</span>
          <h2 className="mt-3" style={{ fontFamily: SERIF, color: C.navy, fontSize: 32, fontWeight: 500, lineHeight: 1.2 }}>
            Alt hvad du behøver til en komplet boligpræsentation
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {[
            { label: "AI-iscenesættelse", desc: "Hvert rum transformeres til en stilfuld visualisering i den valgte designstil." },
            { label: "9 stilarter", desc: "Skandinavisk, moderne, luksus, japandi, minimalistisk og flere — vælg den der passer til boligen." },
            { label: "3 kvalitetsniveauer", desc: "Budget (IKEA/JYSK), Standard (BoConcept/HAY) eller Premium (Fritz Hansen/Carl Hansen)." },
            { label: "HD billeder", desc: "Leveres i høj opløsning — klar til print, digital annoncering og sociale medier." },
          ].map((item) => (
            <div
              key={item.label}
              style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: "24px 26px" }}
            >
              <div style={{ fontFamily: SERIF, color: C.navy, fontSize: 18, fontWeight: 500, marginBottom: 6 }}>{item.label}</div>
              <div style={{ color: C.muted, fontSize: 14, lineHeight: 1.6 }}>{item.desc}</div>
            </div>
          ))}
        </div>
        <div className="text-center mt-10">
          <Link href="/opret">
            <button
              className="inline-flex items-center justify-center gap-2 transition-colors"
              style={{ background: C.gold, color: C.navy, padding: "14px 28px", borderRadius: 8, fontSize: 14, fontWeight: 600 }}
              data-testid="showcase-cta"
            >
              Kom i gang gratis
              <ArrowRight className="w-4 h-4" />
            </button>
          </Link>
        </div>
      </div>
    </SubpageLayout>
  );
}

export function AIDesignAgentPage() {
  usePageTitle("AI Design Agent", "Beskriv ændringer med dine egne ord — AI Design Agenten redigerer boligbilleder efter dine ønsker.");
  return (
    <SubpageLayout
      eyebrow="AI Design Agent"
      title="Beskriv det — agenten laver det"
      intro="Ingen begrænsninger. Skriv præcis hvad du vil ændre — møbler, lys, vejr, farver, sæson, mennesker, biler, himmel, stemning. Agenten forstår naturligt sprog og leverer resultatet direkte."
    >
      <div className="grid lg:grid-cols-2 gap-7 items-center">
        <div
          className="flex flex-col"
          style={{ background: C.white, borderRadius: 16, padding: "32px 28px", border: `1px solid ${C.border}`, boxShadow: "0 8px 32px rgba(15,25,35,0.05)" }}
          data-testid="agent-prompt-card"
        >
          <div className="uppercase mb-3" style={{ color: C.gold, fontSize: 11, fontWeight: 600, letterSpacing: "0.12em" }}>
            Din prompt
          </div>
          <div
            className="mb-5"
            style={{ background: C.warm, border: `1px solid ${C.border}`, borderRadius: 8, padding: "18px", minHeight: 130, color: C.navy, fontSize: 15, lineHeight: 1.6, fontFamily: SANS }}
            data-testid="agent-prompt-example"
          >
            "Renover dette forfaldne hus og bring det til sit fulde potentiale. Ny belægning på indkørslen, frisk hvid maling på facaden, ryd haven og tilføj blomsterbed langs muren. Bevar husets karakter og den blå dør."
          </div>
          <div className="uppercase mb-2" style={{ color: C.muted, fontSize: 11, fontWeight: 600, letterSpacing: "0.12em" }}>
            Eksempler du kan prøve
          </div>
          <ul className="space-y-2 mb-6">
            {[
              "Ryd haven og tilføj et velplejet blomsterbed langs indgangen",
              "Skift belægningen til lyse betonfliser og grus",
              "Giv facaden frisk hvid maling og reparer revnerne",
              "Tilføj udebelysning, en ny postkasse og en ren indkørsel",
            ].map((ex, i) => (
              <li key={i} className="flex items-start gap-2" style={{ color: C.muted, fontSize: 14, lineHeight: 1.5 }}>
                <Check className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: C.gold }} />
                <span>{ex}</span>
              </li>
            ))}
          </ul>
          <Link href="/opret">
            <button
              className="w-full inline-flex items-center justify-center gap-2 transition-colors"
              style={{ background: C.gold, color: C.navy, padding: "14px 24px", borderRadius: 8, fontSize: 14, fontWeight: 600 }}
              data-testid="agent-prompt-cta"
            >
              Prøv AI Design Agent
              <ArrowRight className="w-4 h-4" />
            </button>
          </Link>
        </div>
        <BeforeAfterPair
          before="/bolig-images/facade-before.jpg"
          after="/bolig-images/ai-agent-after-v2.jpg"
          title="“Renover facaden, ny belægning og ryd haven”"
          desc="Et eksempel på hvad agenten kan, fra ét enkelt promptkrav."
          testId="agent-pair-0"
        />
      </div>
      <BenefitRow
        items={[
          { title: "Frit sprog", desc: "Beskriv ændringen som du ville beskrive den til en designer." },
          { title: "Ingen begrænsninger", desc: "Skift indretning, vejr, lys, årstid, biler i indkørslen, mennesker i haven — alt hvad du kan beskrive, kan agenten ændre." },
          { title: "Iterér til det sidder", desc: "Send flere prompts på samme billede. Finpuds detaljer trin for trin indtil resultatet er præcis som du vil have det." },
        ]}
      />
    </SubpageLayout>
  );
}
