import { useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Check, ArrowRight } from "lucide-react";
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
            © {new Date().getFullYear()} Forma Estates. Visualisering for ejendomsmæglere.
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
  return (
    <div
      style={{
        background: C.white,
        border: `1px solid ${C.border}`,
        borderRadius: 16,
        overflow: "hidden",
        boxShadow: "0 8px 32px rgba(15,25,35,0.05)",
      }}
      data-testid={testId}
    >
      <div className="grid grid-cols-2 gap-px" style={{ background: C.border }}>
        <div className="relative" style={{ aspectRatio: "4 / 3" }}>
          <img src={before} alt={`${title} — før`} className="absolute inset-0 w-full h-full object-cover" />
          <div
            className="absolute top-3 left-3 uppercase"
            style={{ background: "rgba(15,25,35,0.78)", color: "#fff", padding: "5px 11px", borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: "0.18em" }}
          >
            Før
          </div>
        </div>
        <div className="relative" style={{ aspectRatio: "4 / 3" }}>
          <img src={after} alt={`${title} — efter`} className="absolute inset-0 w-full h-full object-cover" />
          <div
            className="absolute top-3 left-3 uppercase"
            style={{ background: C.gold, color: "#fff", padding: "5px 11px", borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: "0.18em" }}
          >
            Efter
          </div>
        </div>
      </div>
      <div style={{ padding: "22px 26px 26px" }}>
        <div style={{ fontFamily: SERIF, color: C.navy, fontSize: 22, fontWeight: 500, lineHeight: 1.25, marginBottom: 6 }}>{title}</div>
        <div style={{ color: C.muted, fontSize: 14.5, lineHeight: 1.55 }}>{desc}</div>
      </div>
    </div>
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
  const pairs = [
    { before: "/bolig-images/living-scandi-before.jpg", after: "/bolig-images/living-scandi-after.jpg", title: "Stue — skandinavisk", desc: "Lyse træfarver, naturlige tekstiler og dæmpet belysning." },
    { before: "/bolig-images/living-modern-before.jpg", after: "/bolig-images/living-modern-after.jpg", title: "Stue — moderne", desc: "Rene linjer, mørke accenter og statementmøbler." },
    { before: "/bolig-images/kitchen-before.jpg", after: "/bolig-images/kitchen-after.jpg", title: "Køkken — landlig", desc: "Træfronter, sten og naturligt lys gør rummet levende." },
    { before: "/bolig-images/ai-agent-before.jpg", after: "/bolig-images/ai-agent-after.jpg", title: "Loft — atelier", desc: "Originale bjælker bevaret, indretningen tilført varme." },
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
  const pairs = [
    { before: "/bolig-images/living-scandi-before.jpg", after: "/bolig-images/living-scandi-after.jpg", title: "Tom stue → skandinavisk hjem", desc: "Tomt rum forvandlet til et hyggeligt skandinavisk opholdsrum med dæmpede toner." },
    { before: "/bolig-images/living-modern-before.jpg", after: "/bolig-images/living-modern-after.jpg", title: "Tom stue → moderne look", desc: "Samme rum, samme dag — moderne indretning med fokus på linjer og lys." },
    { before: "/bolig-images/kitchen-before.jpg", after: "/bolig-images/kitchen-after.jpg", title: "Slidt køkken → frisk indretning", desc: "Iscenesat med nye farver, planter og en levende stemning." },
  ];
  return (
    <SubpageLayout
      eyebrow="Før / Efter"
      title="AI-iscenesættelse af tomme rum"
      intro="Upload et foto af et tomt rum. Få det tilbage iscenesat i den stil der passer til boligen — møbler, lys og tekstiler placeret naturligt på under 30 sekunder."
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-7">
        {pairs.map((p, i) => (
          <BeforeAfterPair key={p.title} {...p} testId={`foer-efter-pair-${i}`} />
        ))}
      </div>
      <BenefitRow
        items={[
          { title: "30 sekunder", desc: "Fra upload til færdig visualisering. Ingen ventetid, ingen fotograf." },
          { title: "Flere stilarter", desc: "Skandinavisk, moderne, klassisk — vis samme rum i flere udtryk." },
          { title: "Køberen ser sig selv", desc: "Et iscenesat rum forkorter tiden til første bud markant." },
        ]}
      />
    </SubpageLayout>
  );
}

export function PlantegningPage() {
  return (
    <SubpageLayout
      eyebrow="3D Plantegning"
      title="Lad køber gå gennem boligen før første visning"
      intro="Vi laver interaktive 3D-plantegninger der viser flowet i boligen. Køberen forstår rummene før de møder op — og kommer mere kvalificerede til fremvisning."
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-7">
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden", boxShadow: "0 8px 32px rgba(15,25,35,0.05)" }} data-testid="plantegning-2d">
          <div className="relative" style={{ aspectRatio: "4 / 3" }}>
            <img src="/bolig-images/floorplan-2d.jpg" alt="2D plantegning" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute top-3 left-3 uppercase" style={{ background: "rgba(15,25,35,0.78)", color: "#fff", padding: "5px 11px", borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: "0.18em" }}>2D</div>
          </div>
          <div style={{ padding: "22px 26px" }}>
            <div style={{ fontFamily: SERIF, color: C.navy, fontSize: 20, fontWeight: 500, marginBottom: 6 }}>Den traditionelle plantegning</div>
            <div style={{ color: C.muted, fontSize: 14.5, lineHeight: 1.55 }}>Funktionel, men svær for køberen at omsætte til en fornemmelse af boligen.</div>
          </div>
        </div>
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden", boxShadow: "0 8px 32px rgba(15,25,35,0.05)" }} data-testid="plantegning-3d">
          <div className="relative" style={{ aspectRatio: "4 / 3" }}>
            <img src="/bolig-images/floorplan-3d.jpg" alt="3D plantegning" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute top-3 left-3 uppercase" style={{ background: C.gold, color: "#fff", padding: "5px 11px", borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: "0.18em" }}>3D</div>
          </div>
          <div style={{ padding: "22px 26px" }}>
            <div style={{ fontFamily: SERIF, color: C.navy, fontSize: 20, fontWeight: 500, marginBottom: 6 }}>Den iscenesatte 3D-version</div>
            <div style={{ color: C.muted, fontSize: 14.5, lineHeight: 1.55 }}>Køberen fornemmer rumforhold, lysindfald og flow med det samme.</div>
          </div>
        </div>
      </div>
      <BenefitRow
        items={[
          { title: "Bedre fremvisninger", desc: "Køberne kommer forberedte. Færre tidsspild på rundvisninger." },
          { title: "Skiller sig ud", desc: "Få boligannoncer har 3D-plantegninger — det signalerer kvalitet." },
          { title: "Klar på 24 timer", desc: "Send os din 2D-plantegning. Vi leverer 3D-versionen næste dag." },
        ]}
      />
    </SubpageLayout>
  );
}

export function BranchevideoPage() {
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
            poster="/bolig-images/kitchen-after.jpg"
            controls
            playsInline
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
  const values = [
    {
      title: "Lokal forandring",
      desc: "Vi er danske, vi kender det danske marked, og vi udvikler specifikt til danske ejendomsmæglere — fra Københavns ejerlejligheder til provinsbyerne og landet.",
    },
    {
      title: "Innovation med mening",
      desc: "Vi tager den nyeste teknologi til os — men kun hvor den skaber reel værdi. Hvert produkt skal løse et konkret problem. Teknologi for teknologiens skyld er ikke vores vej.",
    },
    {
      title: "Tilgængelighed",
      desc: "Avanceret teknologi skal ikke være forbeholdt store kæder med dyre budgetter. Vores priser er designet til alle mæglere — fra den selvstændige til de store kæder.",
    },
    {
      title: "Kvalitet først",
      desc: "Hvert billede, hver video og hver 3D-model skal leve op til professionelle standarder. Vi går aldrig på kompromis med kvaliteten — for jeres omdømme er også vores.",
    },
    {
      title: "Mægleren i centrum",
      desc: "Vores teknologi forstærker mæglerens rolle — den erstatter den aldrig. Den personlige, lokale mægler er uundværlig. Teknologien er værktøjet, mægleren er håndværkeren.",
    },
  ];

  return (
    <SubpageLayout
      eyebrow="Om os"
      title="Hvem er vi?"
      intro="Forma Estates er et dansk teknologiselskab grundlagt i København med ét klart mål: at hjælpe lokale ejendomsmæglere med at sælge boliger hurtigere — uden at gå på kompromis med kvaliteten."
    >
      {/* Intro story */}
      <div className="mx-auto" style={{ maxWidth: 760 }}>
        <div className="space-y-5" data-testid="omos-intro">
          <p style={{ color: C.muted, fontSize: 16.5, lineHeight: 1.75 }}>
            Forma Estates er et dansk teknologiselskab grundlagt i København med et klart mål: at
            revolutionere den danske ejendomsbranche gennem kunstig intelligens. Vi udvikler
            skræddersyede værktøjer, der hjælper lokale ejendomsmæglere med at spare tid, reducere
            omkostninger og sælge boliger hurtigere — uden at gå på kompromis med kvaliteten.
          </p>
          <p style={{ color: C.muted, fontSize: 16.5, lineHeight: 1.75 }}>
            Vi tror på, at teknologi skal tjene mennesker — ikke erstatte dem. Vores produkter er
            designet til at forstærke mæglerens ekspertise, ikke erstatte den personlige rådgivning,
            der er kernen i ethvert vellykket boligsalg. Teknologien håndterer det visuelle og
            tidskrævende, så mægleren kan fokusere på det, de gør bedst: at rådgive og skabe
            relationer.
          </p>
          <p style={{ color: C.muted, fontSize: 16.5, lineHeight: 1.75 }}>
            Forma Estates er ikke en mæglerkæde — vi er jeres teknologipartner. Vi arbejder tæt sammen
            med ejendomsmæglere på tværs af Danmark for at forstå deres udfordringer og udvikle
            løsninger, der virker i praksis, ikke kun på papiret.
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
            At blive Danmarks største og mest betroede AI-platform for ejendomsmæglere — lokalt
            udviklet, globalt inspireret. Vi vil sætte standarden for, hvordan teknologi transformerer
            boligsalg i Norden, og gøre avanceret visualisering tilgængelig for enhver mægler, uanset
            størrelse eller budget.
          </p>
        </div>
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: "34px 32px" }}>
          <div className="uppercase mb-3" style={{ color: C.gold, fontSize: 11, fontWeight: 600, letterSpacing: "0.22em" }}>
            Mission
          </div>
          <p style={{ color: C.muted, fontSize: 15.5, lineHeight: 1.7 }}>
            At udvikle innovative produkter, der hjælper den lokale ejendomsmægler med at spare tid,
            sælge hurtigere og levere en overlegen købsoplevelse. Vi skaber værktøjer, der er
            intuitive, prisvenlige og designet specifikt til det danske boligmarked — så mæglere kan
            fokusere på det, de gør bedst.
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
            Vi startede med ét produkt: AI Boligvisualisering. Responsen fra mæglere var
            overvældende. Behovet var tydeligt — hurtig, professionel og prisvenlig visualisering
            uden den logistiske hovedpine ved fysisk møblering.
          </p>
          <p style={{ color: C.muted, fontSize: 16.5, lineHeight: 1.75 }}>
            Siden da har vi udvidet med tre produkter: Design Agent til præcise justeringer, 3D
            plantegning til plantegningsvisualisering, og før/efter-transformationsvideo til sociale
            medier. Hvert produkt er udviklet i tæt samarbejde med aktive ejendomsmæglere.
          </p>
          <p style={{ color: C.muted, fontSize: 16.5, lineHeight: 1.75 }}>
            I dag arbejder vi mod at dække hele Danmark — fra Skagen til Sønderborg — og drømmer om
            at gøre Forma Estates til synonymet med AI-drevet ejendomsmarkedsføring i Norden.
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
        </div>
      </div>
    </SubpageLayout>
  );
}

type PromptItem = { title: string; text: string };
type PromptCategory = { id: string; label: string; blurb: string; items: PromptItem[] };

const PROMPT_CATEGORIES: PromptCategory[] = [
  {
    id: "tid",
    label: "Tidspunkt på døgnet",
    blurb: "Skift lyset og stemningen alt efter tid på dagen — kun belysningen ændres.",
    items: [
      { title: "Morgen", text: "Change the time of day to early morning. Soft golden morning light through the windows. Fresh and bright. Keep all furniture and decor unchanged. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint." },
      { title: "Middag", text: "Change the time of day to bright midday. Strong natural daylight filling the room. Clear and energetic atmosphere. Keep all furniture and decor unchanged. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint." },
      { title: "Eftermiddag", text: "Change the time of day to warm afternoon. Soft warm daylight at a lower angle. Relaxed atmosphere. Keep all furniture and decor unchanged. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint." },
      { title: "Aften", text: "Change the time of day to evening. Warm ambient lighting from existing lamps. Soft glow from windows showing dusk. Cozy atmosphere. Keep all furniture and decor unchanged. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint." },
      { title: "Solnedgang", text: "Change the time of day to golden hour sunset. Warm orange and pink light flooding through the windows. Magical atmosphere. Keep all furniture and decor unchanged. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint." },
      { title: "Nat", text: "Change the time of day to night. Dark outside the windows with subtle city lights or stars. Interior warmly lit with lamps and candles. Cozy nighttime atmosphere. Keep all furniture and decor unchanged. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint." },
      { title: "Skumring", text: "Change the time of day to dusk — the blue hour. Deep blue-purple light outside, warm interior lights glowing. Serene atmosphere. Keep all furniture and decor unchanged. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint." },
    ],
  },
  {
    id: "aarstid",
    label: "Årstid",
    blurb: "Vis boligen i forskellige årstider — farvetemperatur og lys tilpasses.",
    items: [
      { title: "Forår", text: "Change the season to spring. Fresh, mild daylight with a slightly green tint. Renewing and bright atmosphere. Warmer color temperature. Keep all furniture and decor unchanged. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint." },
      { title: "Sommer", text: "Change the season to summer. Bright, warm daylight — stronger and more golden. Warm and vibrant atmosphere. Keep all furniture and decor unchanged. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint." },
      { title: "Sensommer", text: "Change the season to late summer. Warm golden light with a softer, fading quality. Relaxed end-of-summer feeling. Keep all furniture and decor unchanged. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint." },
      { title: "Efterår", text: "Change the season to autumn. Warm golden-orange light with lower angle. Richer, warmer color tones. Cozy atmosphere. Keep all furniture and decor unchanged. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint." },
      { title: "Vinter", text: "Change the season to winter. Cooler, softer daylight with a slightly blue-grey quality. Crisp and clean atmosphere. Keep all furniture and decor unchanged. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint." },
      { title: "Vinter med sne", text: "Change the season to winter with snow. Bright, white, diffused light reflecting into the room. Cool white daylight. Crisp winter atmosphere. Keep all furniture and decor unchanged. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint." },
    ],
  },
  {
    id: "aendringer",
    label: "Stemning & ændringer",
    blurb: "Små styling-greb der løfter rummet — belysning, planter, hygge og farver.",
    items: [
      { title: "Tøm lokalet", text: "Remove all freestanding furniture and decor. Show the empty room with original floors, walls, windows, and doors only. Do not add anything new. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint." },
      { title: "Tilføj ild i pejs", text: "If there is a fireplace in this room, add a warm glowing fire in it. Warm flickering firelight creating a cozy atmosphere. Keep all furniture and decor unchanged. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint." },
      { title: "Opgrader belysning", text: "Add modern table lamps and a floor lamp. Warm layered lighting. Keep all furniture in the same positions. Only change lighting. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint." },
      { title: "Tilføj planter", text: "Add 2-3 potted plants: one floor plant in a corner, one on a table, one small trailing plant. Keep all furniture and decor unchanged. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint." },
      { title: "Gør hyggelig", text: "Add soft throws on the sofa, lit candles on the table, warm cushions. Cozy hygge atmosphere. Keep all furniture unchanged. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint." },
      { title: "Lyst og luftigt", text: "Maximize natural light, sheer curtains, clean surfaces, fresh neutral palette. Keep all furniture unchanged. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint." },
      { title: "Mørkere væg", text: "Paint one wall deep forest green or charcoal grey as an accent wall. Keep all furniture and decor unchanged. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint." },
      { title: "Skift vægfarve", text: "Change wall color to warm off-white. Keep all furniture and decor unchanged. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint." },
      { title: "Nyt gulv", text: "Replace flooring with wide plank light oak hardwood. Keep all furniture and walls unchanged. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint." },
      { title: "Ryd op", text: "Clean and tidy: remove clutter, make beds, fluff pillows, organize items. Keep all furniture unchanged. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint." },
      { title: "Tilføj dekoration", text: "Add tasteful decor: a plant, books, a candle, a throw blanket, and art on the wall. Keep all furniture unchanged. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint." },
      { title: "Fjern møbler", text: "Remove all freestanding furniture. Keep decor, plants, and styling elements. Show as intentionally styled empty space. Keep walls and floors unchanged. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint." },
    ],
  },
  {
    id: "udsigter",
    label: "Udsigter",
    blurb: "Vis en attraktiv udsigt uden for vinduet — interiøret forbliver det samme.",
    items: [
      { title: "Sommerhave", text: "Show a beautiful green summer garden outside the window. Lush trees, manicured lawn. Keep all interior elements unchanged. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint." },
      { title: "Byudsigt", text: "Show a city skyline outside the window. Urban landscape with architecture. Keep all interior elements unchanged. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint." },
      { title: "Søudsigt", text: "Show a calm lake or sea view outside the window. Blue water, serene atmosphere. Keep all interior elements unchanged. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint." },
      { title: "Skovudsigt", text: "Show a dense green forest outside the window. Tall trees, peaceful atmosphere. Keep all interior elements unchanged. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint." },
      { title: "Gårdhave", text: "Show a charming Copenhagen-style courtyard outside the window. Cobblestones, green plants, classic Danish architecture. Keep all interior elements unchanged. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint." },
    ],
  },
  {
    id: "kombinationer",
    label: "Stemningsfulde kombinationer",
    blurb: "Færdige kombinationer af tid, årstid og lys til den helt rigtige stemning.",
    items: [
      { title: "Sensommeraften", text: "Late summer evening around 8 PM. Warm golden light slowly fading. Soft orange-pink glow through the windows. Warm interior lights on, cozy contrast with the fading daylight. Relaxed end-of-summer atmosphere. Keep all furniture unchanged. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint." },
      { title: "Tidlig vinteraften", text: "Early winter evening around 5 PM. Dark blue sky outside, first evening stars visible. Interior warmly lit with existing lamps and candles. Nordic hygge atmosphere. Keep all furniture unchanged. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint." },
      { title: "Forårsmorgen", text: "Fresh spring morning around 7 AM. Soft fresh light with a green-gold quality. Bright and renewing atmosphere. Gentle natural light. Keep all furniture unchanged. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint." },
      { title: "Efterårssolnedgang", text: "Autumn sunset around 6 PM. Deep orange, red and golden light flooding through the windows. Rich warm color tones. Warm and atmospheric. Keep all furniture unchanged. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint." },
      { title: "Vintermorgen med sne", text: "Winter morning around 9 AM. Bright white diffused daylight. Cool crisp atmosphere. Warm cozy interior lighting. Keep all furniture unchanged. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint." },
      { title: "Sommernat", text: "Summer night around 11 PM. Deep blue twilight sky still holding light. Warm air feeling. Interior softly lit with warm ambient lighting. Peaceful summer night. Keep all furniture unchanged. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint." },
      { title: "Regnvejrsdag", text: "Cozy rainy day. Soft grey diffused light. Muted and calm atmosphere. Warm interior lighting creating a sheltered, comfortable feeling. Keep all furniture unchanged. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint." },
      { title: "Diset eftermiddag", text: "Misty afternoon. Soft diffused light with a grey-blue quality. Muted colors. Dreamy and serene atmosphere. Keep all furniture unchanged. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint." },
    ],
  },
  {
    id: "have",
    label: "Haveforvandling",
    blurb: "Vis hvordan en tom eller vild have kan blive et præsentabelt uderum.",
    items: [
      { title: "Anlagt græsplæne", text: "Transform this outdoor space into a well-maintained garden with a manicured green lawn, simple border plants, and a clean gravel or stone path. Neat and presentable family garden. Scandinavian simplicity. Photorealistic rendering, 4K quality. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint." },
      { title: "Terrasse med fliser", text: "Add a simple stone or wooden patio area with outdoor furniture. Clean modern terrace with potted plants and soft outdoor lighting. Functional and inviting. Photorealistic rendering, 4K quality. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint." },
      { title: "Nem vedligeholdt have", text: "Transform this garden into a low-maintenance outdoor space with decorative gravel, drought-resistant plants, wooden decking area, and clean lines. Modern and practical. Photorealistic rendering, 4K quality. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint." },
      { title: "Børnevenlig have", text: "Transform this garden into a family-friendly outdoor space with a flat lawn area, simple play zone, raised garden beds, and a small patio with outdoor furniture. Safe and welcoming. Photorealistic rendering, 4K quality. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint." },
      { title: "Aftenhave med belysning", text: "Transform this garden into an evening setting. Soft outdoor lighting along paths, warm light from the house windows, cozy atmosphere. Well-maintained garden visible in the warm glow. Photorealistic rendering, 4K quality. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint." },
    ],
  },
  {
    id: "altan",
    label: "Altan & terrasse",
    blurb: "Forvandl tomme altaner og terrasser til indbydende uderum.",
    items: [
      { title: "Møbleret altan", text: "Transform this empty balcony into a furnished outdoor space. Small bistro table with two chairs, potted plants, outdoor rug, string lights. Cozy and inviting city balcony. Photorealistic rendering, 4K quality. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint." },
      { title: "Stor terrasse med lounge", text: "Transform this terrace into a modern outdoor lounge area. Quality outdoor sofa, coffee table, large planters, ambient lighting. Comfortable and stylish entertaining space. Photorealistic rendering, 4K quality. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint." },
      { title: "Altan med planter", text: "Transform this balcony into a green oasis. Multiple potted plants of varying sizes, small seating area with cushions, herb boxes on the railing. Fresh and alive. Photorealistic rendering, 4K quality. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint." },
      { title: "Morgenterrasse", text: "Transform this terrace into a morning breakfast setting. Table set for breakfast, morning light, potted plants, comfortable outdoor chairs. Fresh and inviting start to the day. Photorealistic rendering, 4K quality. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint." },
      { title: "Aftenterrasse", text: "Transform this terrace into an evening entertaining space. Warm ambient lighting, candles, comfortable seating, cozy blankets. Atmospheric and inviting. Photorealistic rendering, 4K quality. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint." },
    ],
  },
  {
    id: "facade",
    label: "Facade & indkørsel",
    blurb: "Løft førstehåndsindtrykket — facade, indkørsel og indgangsparti.",
    items: [
      { title: "Velholdt facade", text: "Transform this exterior into a well-maintained, freshly painted facade. Clean lines, modern front door, house numbers, mailbox, and welcoming entrance. Fresh and attractive curb appeal. Photorealistic rendering, 4K quality. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint." },
      { title: "Indkørsel med parkering", text: "Transform this driveway into a clean, organized parking area. Fresh gravel or paving stones, clear parking space, trimmed edges. Practical and presentable. Photorealistic rendering, 4K quality. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint." },
      { title: "Indgangsparti med lys", text: "Transform this entrance into a welcoming entryway. Modern outdoor lighting, clean path to the door, potted plants by the entrance, clean door hardware. Warm and inviting. Photorealistic rendering, 4K quality. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint." },
      { title: "Eftermiddagsfacade", text: "Transform this exterior view to a warm afternoon setting. Golden light on the facade, well-maintained garden visible, welcoming entrance. Attractive and homey. Photorealistic rendering, 4K quality. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint." },
      { title: "Aftenfacade med belysning", text: "Transform this exterior into an evening scene. Warm outdoor lighting illuminating the facade and entrance, soft glow from windows, welcoming atmosphere. Safe and attractive. Photorealistic rendering, 4K quality. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint." },
    ],
  },
  {
    id: "udvidelser",
    label: "Udvidelser & tilbygninger",
    blurb: "Vis mulige udvidelser — udestue, carport, overdækning og opbevaring.",
    items: [
      { title: "Udestue / orangeri", text: "Transform this exterior area to include a glass conservatory or orangery attached to the house. Light-filled space with plants and seating. Year-round usable. Photorealistic rendering, 4K quality. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint." },
      { title: "Overdækket terrasse", text: "Transform this terrace area into a covered patio with a roof structure. Protected outdoor seating area, usable in light rain. Practical and comfortable. Photorealistic rendering, 4K quality. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint." },
      { title: "Carport", text: "Transform this parking area into a modern carport with a clean roof structure. Practical vehicle shelter that complements the house design. Photorealistic rendering, 4K quality. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint." },
      { title: "Cykelparkering", text: "Transform this exterior area to include a practical bicycle parking area. Covered bike storage, clean design, functional. Danish lifestyle essential. Photorealistic rendering, 4K quality. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint." },
      { title: "Skur / redskabsrum", text: "Transform this exterior area to include a small garden shed or storage unit. Clean modern design, practical storage. Organized and tidy garden. Photorealistic rendering, 4K quality. Preserve the original camera angle, perspective, and zoom exactly. Do not change the viewpoint." },
    ],
  },
];

export function AIDesignAgentPage() {
  const [prompt, setPrompt] = useState("");
  const [activeCat, setActiveCat] = useState(PROMPT_CATEGORIES[0].id);
  const [justAdded, setJustAdded] = useState<string | null>(null);

  const category = PROMPT_CATEGORIES.find((c) => c.id === activeCat) ?? PROMPT_CATEGORIES[0];
  const wordCount = prompt.trim() ? prompt.trim().split(/\s+/).length : 0;

  const handlePick = (item: PromptItem) => {
    setPrompt((prev) => (prev.trim() ? `${prev.trim()} ${item.text}` : item.text));
    setJustAdded(item.title);
    window.setTimeout(() => setJustAdded((t) => (t === item.title ? null : t)), 1600);
  };

  return (
    <SubpageLayout
      eyebrow="AI Design Agent"
      title="Beskriv ændringen — vi laver den"
      intro="Skriv hvad du vil ændre i et rum, eller vælg en færdig idé fra biblioteket nedenfor. Skift tid på døgnet, årstid, lys, have og meget mere — direkte fra ét billede."
    >
      <div className="grid lg:grid-cols-2 gap-7 items-stretch">
        {/* Prompt text field */}
        <div
          className="flex flex-col"
          style={{ background: C.white, borderRadius: 16, padding: "32px 28px", border: `1px solid ${C.border}`, boxShadow: "0 8px 32px rgba(15,25,35,0.05)" }}
          data-testid="agent-prompt-card"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="uppercase" style={{ color: C.gold, fontSize: 11, fontWeight: 600, letterSpacing: "0.12em" }}>
              Din prompt
            </div>
            {prompt && (
              <button
                type="button"
                onClick={() => setPrompt("")}
                style={{ color: C.muted, fontSize: 12, fontWeight: 500, background: "none", border: "none", cursor: "pointer" }}
                data-testid="agent-prompt-clear"
              >
                Ryd
              </button>
            )}
          </div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Skriv din egen beskrivelse her — eller klik på en idé fra biblioteket, så lægger den sig automatisk ind i feltet."
            className="flex-1 w-full resize-y"
            style={{
              background: C.warm,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              padding: "16px 18px",
              minHeight: 240,
              color: C.navy,
              fontSize: 15,
              lineHeight: 1.65,
              fontFamily: SANS,
            }}
            aria-label="Din prompt"
            data-testid="agent-prompt-input"
          />
          <div className="flex items-center justify-between mt-2" style={{ fontSize: 12, color: C.muted }}>
            <span data-testid="agent-word-count">{wordCount} ord</span>
            <span>Plads til 500–1000 ord</span>
          </div>
          <Link href="/opret">
            <button
              className="w-full inline-flex items-center justify-center gap-2 transition-colors mt-5"
              style={{ background: C.gold, color: C.navy, padding: "14px 24px", borderRadius: 8, fontSize: 14, fontWeight: 600 }}
              data-testid="agent-prompt-cta"
            >
              Prøv AI Design Agent
              <ArrowRight className="w-4 h-4" />
            </button>
          </Link>
        </div>

        <BeforeAfterPair
          before="/bolig-images/ai-agent-before.jpg"
          after="/bolig-images/ai-agent-after.jpg"
          title="“Tilføj varmere belysning og lyse træmøbler”"
          desc="Et eksempel på hvad agenten kan, fra ét enkelt promptkrav."
          testId="agent-pair-0"
        />
      </div>

      {/* ── Prompt library ── */}
      <div className="mt-20" data-testid="agent-prompt-library">
        <div className="text-center mb-8">
          <div className="uppercase mb-3" style={{ color: C.gold, fontSize: 12, fontWeight: 600, letterSpacing: "0.32em" }}>
            Promptbibliotek
          </div>
          <h2 style={{ fontFamily: SERIF, color: C.navy, fontSize: "clamp(26px, 4vw, 38px)", fontWeight: 500, lineHeight: 1.15, marginBottom: 12 }}>
            Færdige idéer — klar til ét klik.
          </h2>
          <p className="mx-auto" style={{ maxWidth: 620, color: C.muted, fontSize: 16, lineHeight: 1.6 }}>
            Vælg en kategori, og klik på en idé. Den lægger sig automatisk ind i tekstfeltet ovenfor, så du nemt kan tilpasse den bagefter.
          </p>
        </div>

        {/* Category tabs */}
        <div className="flex flex-wrap justify-center gap-2.5 mb-9" data-testid="agent-category-tabs">
          {PROMPT_CATEGORIES.map((c) => {
            const isActive = c.id === activeCat;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setActiveCat(c.id)}
                className="transition-colors"
                style={{
                  background: isActive ? C.navy : C.white,
                  color: isActive ? C.white : C.navy,
                  border: `1px solid ${isActive ? C.navy : C.border}`,
                  borderRadius: 999,
                  padding: "9px 18px",
                  fontSize: 13.5,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
                data-testid={`agent-category-${c.id}`}
              >
                {c.label}
              </button>
            );
          })}
        </div>

        {/* Active category blurb */}
        <p className="text-center mx-auto mb-7" style={{ maxWidth: 560, color: C.muted, fontSize: 15, lineHeight: 1.55 }} data-testid="agent-category-blurb">
          {category.blurb}
        </p>

        {/* Prompt cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {category.items.map((item) => {
            const added = justAdded === item.title;
            return (
              <button
                key={item.title}
                type="button"
                onClick={() => handlePick(item)}
                className="text-left transition-all duration-200 hover:-translate-y-0.5"
                style={{
                  background: C.white,
                  border: `1px solid ${added ? C.gold : C.border}`,
                  borderRadius: 14,
                  padding: "20px 22px",
                  cursor: "pointer",
                  boxShadow: added ? "0 6px 24px rgba(201,169,110,0.22)" : "0 2px 12px rgba(15,25,35,0.04)",
                }}
                data-testid={`agent-prompt-${item.title}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div style={{ fontFamily: SERIF, color: C.navy, fontSize: 17, fontWeight: 600 }}>{item.title}</div>
                  {added ? (
                    <span className="inline-flex items-center gap-1" style={{ color: C.gold, fontSize: 12, fontWeight: 600 }}>
                      <Check className="w-3.5 h-3.5" /> Tilføjet
                    </span>
                  ) : (
                    <ArrowRight className="w-4 h-4" style={{ color: C.gold }} />
                  )}
                </div>
                <p style={{ color: C.muted, fontSize: 13.5, lineHeight: 1.5 }}>{item.text}</p>
              </button>
            );
          })}
        </div>
      </div>

      <BenefitRow
        items={[
          { title: "Frit sprog", desc: "Beskriv ændringen som du ville beskrive den til en designer." },
          { title: "Bevarer rummet", desc: "Vægge, vinduer og struktur forbliver intakte — kun indretningen ændres." },
          { title: "Iterér frit", desc: "Send flere prompts på samme billede indtil resultatet sidder." },
        ]}
      />
    </SubpageLayout>
  );
}
