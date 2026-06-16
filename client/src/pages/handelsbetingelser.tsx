import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import formaEstatesLogo from "@assets/forma-estates-logo.png";

const C = {
  navy: "#0F1923",
  gold: "#C9A96E",
  goldHover: "#B8985D",
  goldBorder: "rgba(201,169,110,0.45)",
  warm: "#FAF6EC",
  white: "#FFFFFF",
  text: "#1F2A37",
  muted: "#6B7280",
  border: "rgba(15,25,35,0.10)",
};
const SERIF = "'Playfair Display', Georgia, serif";
const SANS = "'Inter', system-ui, -apple-system, sans-serif";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 style={{ fontFamily: SERIF, color: C.navy, fontSize: 20, fontWeight: 600, marginBottom: 12, paddingBottom: 8, borderBottom: `1px solid ${C.border}` }}>
        {title}
      </h2>
      <div style={{ color: C.text, fontSize: 15, lineHeight: 1.75, fontFamily: SANS }}>
        {children}
      </div>
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mb-3">{children}</p>;
}

function Ul({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="mb-3 space-y-1.5 pl-5" style={{ listStyleType: "disc" }}>
      {items.map((item, i) => <li key={i}>{item}</li>)}
    </ul>
  );
}

function InfoBox({ children, variant = "gold" }: { children: React.ReactNode; variant?: "gold" | "navy" }) {
  return (
    <div className="rounded-xl p-4 mb-3" style={
      variant === "navy"
        ? { background: C.navy, color: C.white }
        : { background: "rgba(201,169,110,0.07)", border: `1px solid ${C.goldBorder}` }
    }>
      {children}
    </div>
  );
}

export default function HandelsbetingelserPage() {
  return (
    <div style={{ background: C.warm, minHeight: "100vh", fontFamily: SANS }}>
      <header className="border-b" style={{ background: C.white, borderColor: C.border }}>
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between">
          <Link href="/">
            <img src={formaEstatesLogo} alt="Forma Estates" style={{ height: 36 }} className="cursor-pointer" data-testid="terms-logo" />
          </Link>
          <Link href="/">
            <button className="flex items-center gap-2 text-sm hover:underline" style={{ color: C.muted }} data-testid="terms-back">
              <ArrowLeft className="w-4 h-4" /> Tilbage til forsiden
            </button>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-14">
        <div className="mb-12">
          <div className="uppercase mb-3" style={{ color: C.gold, fontSize: 11, fontWeight: 700, letterSpacing: "0.18em" }}>Juridisk</div>
          <h1 style={{ fontFamily: SERIF, color: C.navy, fontSize: 36, fontWeight: 600, lineHeight: 1.2, marginBottom: 12 }}>
            Handelsbetingelser
          </h1>
          <p style={{ color: C.muted, fontSize: 14 }}>
            Senest opdateret: juni 2026 &middot; Forma Estates &middot; CVR: 46551796
          </p>
        </div>

        <div style={{ background: C.white, borderRadius: 16, padding: "40px 48px", border: `1px solid ${C.border}` }}>

          <InfoBox>
            <p className="text-sm" style={{ color: C.text }}>
              Disse handelsbetingelser regulerer dit brug af Forma Estates' platform og tjenester. Ved at oprette en konto eller anvende tjenesten accepterer du disse betingelser. Læs dem venligst grundigt igennem.
            </p>
          </InfoBox>

          {/* 1 */}
          <Section title="1. Parterne">
            <P>Disse handelsbetingelser ("Betingelserne") er indgået mellem:</P>
            <div className="rounded-xl p-5 mb-4" style={{ background: C.warm, border: `1px solid ${C.border}` }}>
              <p className="font-semibold mb-2" style={{ color: C.navy }}>Forma Estates (Sælger / Tjenesteyder)</p>
              <div className="space-y-0.5 text-sm" style={{ color: C.text }}>
                <p>CVR-nr.: 46551796</p>
                <p>E-mail: <a href="mailto:kontakt@formaestates.com" className="underline" style={{ color: C.gold }}>kontakt@formaestates.com</a></p>
                <p>Telefon: <a href="tel:+4529172732" className="underline" style={{ color: C.gold }}>+45 29 17 27 32</a></p>
                <p>Hjemmeside: <a href="https://formaestates.com" className="underline" style={{ color: C.gold }}>formaestates.com</a></p>
              </div>
            </div>
            <P>— og dig som kunde ("Kunden"), der opretter en konto og anvender Forma Estates' platform.</P>
            <P>
              Forma Estates henvender sig primært til erhvervskunder (ejendomsmæglere, mæglerkæder og virksomheder).
              Privatpersoner ("forbrugere") kan ligeledes anvende tjenesten og er dækket af forbrugerbeskyttelseslovgivningen, herunder forbrugeraftalelovens regler om fortrydelsesret (se afsnit 8).
            </P>
          </Section>

          {/* 2 */}
          <Section title="2. Tjenestens indhold">
            <P>Forma Estates tilbyder en AI-drevet platform til boligvisualisering ("Tjenesten"), herunder:</P>
            <Ul items={[
              "AI-iscenesættelse af boligbilleder (virtuel staging) i udvalgte designstile",
              "Generering af 3D-plantegninger fra 2D-plantegningsbilleder",
              "AI-genererede transformationsvideoer (branchevideo)",
              "AI Design Agent (fritekst-baseret billedrettelse)",
              "Sagsadministration og team-/kontostyring",
            ]} />
            <P>
              Tjenesten leveres som software-as-a-service (SaaS) via <a href="https://formaestates.com" className="underline" style={{ color: C.gold }}>formaestates.com</a>.
              Der kræves en aktiv internetforbindelse og en understøttet browser for at anvende platformen.
            </P>
            <P>
              Forma Estates stræber efter høj oppetid, men garanterer ikke fejlfri eller uafbrudt adgang til tjenesten.
              Planlagt og nødvendig vedligeholdelse kan medføre kortvarig utilgængelighed. Vi varsler planlagt vedligeholdelse via e-mail eller banner på platformen i det omfang det er praktisk muligt.
            </P>
          </Section>

          {/* 3 */}
          <Section title="3. Oprettelse af konto og brug">
            <P>For at anvende Tjenesten skal du oprette en konto med en gyldig e-mailadresse og en adgangskode.</P>
            <p className="font-semibold mb-1.5" style={{ color: C.navy }}>Du forpligter dig til at:</p>
            <Ul items={[
              "Angive korrekte og fuldstændige oplysninger ved oprettelsen",
              "Holde dine loginoplysninger fortrolige og ikke dele dem med andre",
              "Straks underrette os, hvis du har mistanke om uautoriseret adgang til din konto",
              "Anvende Tjenesten i overensstemmelse med gældende lovgivning og disse Betingelser",
              "Ikke anvende Tjenesten til at generere ulovligt, stødende eller vildledende indhold",
            ]} />
            <P>
              Forma Estates forbeholder sig ret til at suspendere eller lukke konti, der misbruges, eller som anvender Tjenesten i strid med disse Betingelser eller gældende lovgivning — uden forudgående varsel i alvorlige tilfælde.
            </P>
            <P>
              Du skal være mindst 18 år gammel for at oprette en konto. Ved at acceptere disse Betingelser bekræfter du, at du er myndig.
            </P>
          </Section>

          {/* 4 */}
          <Section title="4. Abonnement, priser og betaling">
            <P>
              Forma Estates tilbyder abonnementsbaserede pakker samt engangskøb af kreditter.
              De aktuelle priser og pakkeindhold fremgår altid af prissiden på platformen.
            </P>

            <p className="font-semibold mb-2" style={{ color: C.navy }}>Abonnement</p>
            <Ul items={[
              "Abonnementer faktureres månedligt eller årligt, afhængigt af det valgte produkt, forud for den pågældende periode",
              "Betaling sker via de betalingsmetoder, der er tilgængelige på platformen",
              "Abonnementet fornyes automatisk ved udløb, medmindre det opsiges inden udløbet af den aktuelle periode (se afsnit 5)",
              "Forma Estates kan regulere priserne med 30 dages varsel via e-mail. Fortsætter du med at bruge tjenesten efter varslets udløb, accepterer du den nye pris",
            ]} />

            <p className="font-semibold mb-2" style={{ color: C.navy }}>Kreditter</p>
            <Ul items={[
              "Kreditter er éngangsbetalinger og forfaldne straks ved køb",
              "Ubrugte kreditter bortfalder ikke, men er knyttet til din konto og kan ikke overdrages eller tilbagebetales",
              "Ét genereret AI-billede forbruger 1 kredit. Forbruget af øvrige funktioner fremgår af platformen",
            ]} />

            <p className="font-semibold mb-2" style={{ color: C.navy }}>Forsinket betaling</p>
            <P>
              Ved forsinket betaling suspenderes adgang til betalte funktioner. Forma Estates forbeholder sig ret til at opkræve morarenter i henhold til rentelovens satser.
            </P>

            <InfoBox>
              <p className="text-sm" style={{ color: C.text }}>
                Alle priser er angivet i danske kroner (DKK) ekskl. moms for erhvervskunder og inkl. moms for forbrugere, medmindre andet er angivet. Momsen udgør 25 %.
              </p>
            </InfoBox>
          </Section>

          {/* 5 */}
          <Section title="5. Opsigelse og ophør">
            <p className="font-semibold mb-1.5" style={{ color: C.navy }}>Opsigelse af abonnement</p>
            <P>
              Du kan til enhver tid opsige dit abonnement. Opsigelse skal ske inden udløbet af den aktuelle abonnementsperiode for at have virkning fra næste faktureringsperiode.
              Du bevarer adgang til de betalte funktioner frem til periodens udløb. Der ydes ikke refusion for resterende del af en allerede betalt periode, medmindre andet følger af disse Betingelser eller ufravigelig lovgivning.
            </P>

            <p className="font-semibold mb-1.5" style={{ color: C.navy }}>Forma Estates' ret til at opsige</p>
            <P>
              Forma Estates kan opsige aftalen med 30 dages varsel. Er opsigelsen begrundet i Kundens misligholdelse af disse Betingelser, kan aftalen ophæves uden varsel, og der ydes ingen refusion.
            </P>

            <p className="font-semibold mb-1.5" style={{ color: C.navy }}>Konsekvenser af ophør</p>
            <P>
              Når en konto lukkes — uanset årsag — slettes den tilknyttede data i overensstemmelse med vores privatlivspolitik. Vi opbevarer dog betalingshistorik i 5 år jf. bogføringsloven § 10. Det anbefales, at du eksporterer dine data inden kontolukning.
            </P>
          </Section>

          {/* 6 */}
          <Section title="6. Immaterielle rettigheder">
            <p className="font-semibold mb-1.5" style={{ color: C.navy }}>Forma Estates' rettigheder</p>
            <P>
              Platformen, herunder software, design, API'er, AI-modeller, varemærker og alt øvrigt indhold udviklet af Forma Estates, er beskyttet af ophavsret og andre immaterielle rettigheder tilhørende Forma Estates. Du modtager en begrænset, ikke-eksklusiv, ikke-overdragelig licens til at bruge platformen i overensstemmelse med disse Betingelser.
            </P>
            <p className="font-semibold mb-1.5" style={{ color: C.navy }}>Kundens rettigheder</p>
            <P>
              Du bevarer alle rettigheder til de billeder og øvrige filer, du uploader til platformen ("Kundens Indhold"). Du giver Forma Estates en begrænset licens til at behandle Kundens Indhold med det formål at levere Tjenesten.
            </P>
            <p className="font-semibold mb-1.5" style={{ color: C.navy }}>Genererede billeder</p>
            <P>
              De AI-genererede visualiseringer, der produceres på grundlag af dit uploadede billede, tilhører dig og må frit anvendes til erhvervsmæssige formål, herunder boligsalg, markedsføring og præsentationer.
              Forma Estates forbeholder sig ret til at anvende anonymiserede og aggregerede eksempler fra platformen til markedsføring — aldrig identificerbare boliger eller kundespecifikke data uden udtrykkelig tilladelse.
            </P>
          </Section>

          {/* 7 */}
          <Section title="7. Ansvarsbegrænsning">
            <P>
              Tjenesten leveres "som beset" (<em>as is</em>). Forma Estates giver ingen garanti for, at AI-genererede resultater er fejlfrie, præcise eller egner sig til et bestemt formål.
            </P>
            <P>
              Forma Estates er ikke ansvarlig for:
            </P>
            <Ul items={[
              "Indirekte tab, driftstab, tabt fortjeneste, tabte data eller goodwill-tab",
              "Tab som følge af midlertidig utilgængelighed af platformen",
              "Tab som følge af uautoriseret adgang til din konto, der skyldes din egen forsømmelighed (fx deling af adgangskode)",
              "Indhold eller nøjagtighed af AI-genererede visualiseringer anvendt i markedsføringssammenhæng",
            ]} />
            <P>
              Forma Estates' samlede ansvar over for dig er under alle omstændigheder begrænset til det beløb, du har betalt for Tjenesten i de 3 måneder forud for den begivenhed, der giver anledning til kravet.
            </P>
            <InfoBox>
              <p className="text-sm" style={{ color: C.text }}>
                <strong>Bemærk for erhvervskunder:</strong> Ovenstående ansvarsbegrænsninger gælder fuldt ud i erhvervsforhold. For forbrugere gælder ansvarsbegrænsningerne alene i det omfang, de er forenelige med ufravigelig forbrugerbeskyttelseslovgivning.
              </p>
            </InfoBox>
          </Section>

          {/* 8 */}
          <Section title="8. Fortrydelsesret (kun forbrugere)">
            <P>
              Hvis du er forbruger (privat person), har du som udgangspunkt 14 dages fortrydelsesret fra aftalens indgåelse, jf. forbrugeraftalelovens § 18, stk. 1.
            </P>
            <div className="rounded-xl p-5 mb-4" style={{ background: "rgba(201,169,110,0.07)", border: `1px solid ${C.goldBorder}` }}>
              <p className="font-semibold text-sm mb-2" style={{ color: C.navy }}>Undtagelse — digital tjeneste med øjeblikkelig levering</p>
              <p className="text-sm" style={{ color: C.text }}>
                I henhold til forbrugeraftalelovens § 18, stk. 3, bortfalder fortrydelsesretten, hvis du udtrykkeligt anmoder om, at levering af den digitale tjeneste påbegyndes inden udløbet af fortrydelsesfristen, og samtidig anerkender, at fortrydelsesretten derved bortfalder.
              </p>
              <p className="text-sm mt-2" style={{ color: C.text }}>
                <strong>Ved aktivering af dit abonnement og/eller dit første forbrug af kreditter</strong> anses du for at have fremsat en sådan udtrykkelig anmodning og anerkendelse, idet tjenesten leveres øjeblikkeligt. Fortrydelsesretten bortfalder herved for allerede forbrugte ydelser.
              </p>
            </div>
            <P>
              Har du <strong>ikke</strong> påbegyndt brug af Tjenesten inden for de 14 dage, kan du fortryde købet ved at kontakte os på{" "}
              <a href="mailto:kontakt@formaestates.com" className="underline" style={{ color: C.gold }}>kontakt@formaestates.com</a>{" "}
              inden fortrydelsesrettens udløb. Vi behandler din anmodning og refunderer betalingen inden for 14 dage.
            </P>
            <P>
              Fortrydelsesretten gælder ikke for erhvervskunder.
            </P>
          </Section>

          {/* 9 */}
          <Section title="9. Behandling af personoplysninger">
            <P>
              Forma Estates behandler dine personoplysninger i overensstemmelse med GDPR og vores{" "}
              <Link href="/privatlivspolitik" className="underline font-medium" style={{ color: C.gold }}>
                privatlivspolitik
              </Link>
              , som beskriver hvilke oplysninger vi indsamler, til hvilke formål og dine rettigheder som registreret.
            </P>
            <P>
              Ved accept af disse Betingelser bekræfter du at have læst og forstået privatlivspolitikken.
            </P>
          </Section>

          {/* 10 */}
          <Section title="10. Acceptable use — forbudt brug">
            <P>Det er ikke tilladt at anvende Tjenesten til at:</P>
            <Ul items={[
              "Generere, distribuere eller lagre ulovligt indhold, herunder indhold der krænker tredjeparters rettigheder",
              "Forsøge at reverse-engineere, dekompilere eller på anden måde tilgå platformens underliggende kode",
              "Automatisere adgang til Tjenesten via scripts, bots eller anden automatisering udover officialt understøttede API-integrationer",
              "Omgå betalingssystemet, kvotabegrænsninger eller andre tekniske beskyttelsesforanstaltninger",
              "Videresælge eller underlicensere adgang til Tjenesten til tredjeparter",
              "Hvidvaske penge, finansiere terrorisme eller andre ulovlige aktiviteter",
            ]} />
            <P>
              Overtrædelse af disse regler kan medføre øjeblikkelig kontolukning uden refusion og kan resultere i anmeldelse til relevante myndigheder.
            </P>
          </Section>

          {/* 11 */}
          <Section title="11. Force majeure">
            <P>
              Forma Estates er ikke ansvarlig for manglende eller forsinket opfyldelse af aftalen, såfremt dette skyldes forhold uden for Forma Estates' rimelige kontrol ("Force majeure"), herunder men ikke begrænset til: naturkatastrofer, krig, terrorisme, epidemier, strømudfald, nedbrud hos tredjepartsudbydere (herunder AI-leverandører og cloud-infrastruktur) eller myndighedsindgreb.
            </P>
            <P>
              Forma Estates vil straks underrette Kunden om en force majeure-hændelse og bestræbe sig på at genoptage normal drift hurtigst muligt. Varer force majeure-situationen mere end 30 dage, kan begge parter opsige aftalen uden varsel og uden erstatningsansvar.
            </P>
          </Section>

          {/* 12 */}
          <Section title="12. Ændringer af handelsbetingelserne">
            <P>
              Forma Estates forbeholder sig ret til at ændre disse Betingelser. Væsentlige ændringer varsles via e-mail og/eller et synligt banner på platformen mindst <strong>30 dage</strong> inden de træder i kraft.
            </P>
            <P>
              Fortsætter du med at anvende Tjenesten efter ikrafttrædelsesdatoen, anses du for at have accepteret de ændrede Betingelser. Ønsker du ikke at acceptere ændringerne, kan du opsige dit abonnement inden ikrafttrædelsesdatoen uden særskilt varsel.
            </P>
            <P>
              Den til enhver tid gældende version af handelsbetingelserne er tilgængelig på{" "}
              <a href="https://formaestates.com/handelsbetingelser" className="underline" style={{ color: C.gold }}>formaestates.com/handelsbetingelser</a>.
            </P>
          </Section>

          {/* 13 */}
          <Section title="13. Lovvalg og værneting">
            <P>
              Disse Betingelser er underlagt dansk ret, og enhver tvist, som ikke kan løses i mindelighed, afgøres ved de danske domstole med <strong>Københavns Byret</strong> som aftalt værneting i første instans — medmindre ufravigelig lovgivning bestemmer andet (fx forbrugeres ret til at anlægge sag ved deres hjemting).
            </P>
            <P>
              For erhvervskunder: tvist om betalingskrav på under 100.000 kr. kan indbringes for Fogedretten.
            </P>
            <P>
              Forbrugere kan alternativt indbringe klager til{" "}
              <a href="https://www.forbrug.dk" target="_blank" rel="noreferrer" className="underline" style={{ color: C.gold }}>Center for Klageløsning</a>{" "}
              (Carl Jacobsens Vej 35, 2500 Valby · <a href="mailto:cfk@cfk.dk" className="underline" style={{ color: C.gold }}>cfk@cfk.dk</a>)
              eller via EU's online klageplatform:{" "}
              <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noreferrer" className="underline" style={{ color: C.gold }}>ec.europa.eu/consumers/odr</a>.
            </P>
          </Section>

          {/* 14 */}
          <Section title="14. Kontakt">
            <P>
              Har du spørgsmål til disse Betingelser, er du velkommen til at kontakte os:
            </P>
            <div className="rounded-xl p-5" style={{ background: C.navy, color: C.white }}>
              <p className="font-semibold mb-2" style={{ fontFamily: SERIF, fontSize: 16 }}>Forma Estates</p>
              <div className="space-y-1 text-sm">
                <p style={{ color: "rgba(255,255,255,0.7)" }}>CVR: 46551796</p>
                <p>
                  <span style={{ color: "rgba(255,255,255,0.55)" }}>E-mail: </span>
                  <a href="mailto:kontakt@formaestates.com" className="hover:underline" style={{ color: C.gold }}>
                    kontakt@formaestates.com
                  </a>
                </p>
                <p>
                  <span style={{ color: "rgba(255,255,255,0.55)" }}>Telefon: </span>
                  <a href="tel:+4529172732" className="hover:underline" style={{ color: C.gold }}>+45 29 17 27 32</a>
                </p>
                <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, marginTop: 8 }}>
                  Vi besvarer henvendelser inden for 2 hverdage.
                </p>
              </div>
            </div>
          </Section>

        </div>

        {/* Cross-links */}
        <div className="mt-8 flex flex-wrap gap-4 justify-center">
          <Link href="/privatlivspolitik" className="text-sm underline" style={{ color: C.gold }}>
            ← Privatlivspolitik
          </Link>
          <Link href="/" className="text-sm underline" style={{ color: C.muted }}>
            ← Tilbage til forsiden
          </Link>
        </div>
      </main>

      <footer className="border-t py-6 px-6 text-center" style={{ borderColor: C.border }}>
        <p className="text-xs" style={{ color: C.muted }}>
          © {new Date().getFullYear()} Forma Estates &middot; CVR: 46551796 &middot; Senest opdateret juni 2026
        </p>
      </footer>
    </div>
  );
}
