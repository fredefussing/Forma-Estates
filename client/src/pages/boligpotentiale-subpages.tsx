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

export function AIDesignAgentPage() {
  return (
    <SubpageLayout
      eyebrow="AI Design Agent"
      title="Beskriv ændringen — vi laver den"
      intro="Skriv hvad du vil ændre i et rum, så genererer agenten det. Skift gulv, farve, møbler eller stemning med en sætning."
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
            "Skift den blå sofa ud med en lys, naturlig linnedsofa. Tilføj et lavt egetræsbord, en stor potteplante i hjørnet og et uldtæppe i sand. Behold væggene og lyset som det er."
          </div>
          <div className="uppercase mb-2" style={{ color: C.muted, fontSize: 11, fontWeight: 600, letterSpacing: "0.12em" }}>
            Eksempler du kan prøve
          </div>
          <ul className="space-y-2 mb-6">
            {[
              "Fjern den røde sofa og indsæt en grå sektionssofa",
              "Skift gulvet til lyst egetræ og væggene til kalkmaling",
              "Lav hele rummet om til japandi-stil",
              "Tilføj plantekrukker, bøger og et stort kunstværk over sofaen",
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
          before="/bolig-images/ai-agent-before.jpg"
          after="/bolig-images/ai-agent-after.jpg"
          title="“Tilføj varmere belysning og lyse træmøbler”"
          desc="Et eksempel på hvad agenten kan, fra ét enkelt promptkrav."
          testId="agent-pair-0"
        />
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
