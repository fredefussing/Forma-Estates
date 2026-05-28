import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
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

export function EksemplerPage() {
  return (
    <SubpageLayout
      eyebrow="Eksempler"
      title="Et udvalg af boliger vi har visualiseret"
      intro="Bladr gennem ægte før/efter-cases fra danske mæglere. Hvert eksempel viser hvordan tomme rum bliver til hjem køberne kan se sig selv i."
    >
      <ComingSoonGrid count={9} />
    </SubpageLayout>
  );
}

export function ForEfterPage() {
  return (
    <SubpageLayout
      eyebrow="Før / Efter"
      title="AI-iscenesættelse af tomme rum"
      intro="Upload et foto af et tomt rum. Få det tilbage iscenesat i den stil der passer til boligen — møbler, lys og tekstiler placeret naturligt."
    >
      <ComingSoonGrid count={6} />
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
      <ComingSoonGrid count={6} />
    </SubpageLayout>
  );
}

export function BranchevideoPage() {
  return (
    <SubpageLayout
      eyebrow="Branchevideo"
      title="Cinematiske videogennemgange"
      intro="Levende videoer der vækker følelser. Vi forvandler statiske billeder til en cinematisk fortælling om boligens potentiale."
    >
      <ComingSoonGrid count={6} />
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
      <ComingSoonGrid count={6} />
    </SubpageLayout>
  );
}
