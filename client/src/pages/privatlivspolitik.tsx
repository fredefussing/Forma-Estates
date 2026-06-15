import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import formaEstatesLogo from "@assets/forma-estates-logo.png";

const C = {
  navy: "#0F1923",
  gold: "#C9A96E",
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

function Ul({ items }: { items: string[] }) {
  return (
    <ul className="mb-3 space-y-1.5 pl-5" style={{ listStyleType: "disc" }}>
      {items.map((item, i) => <li key={i}>{item}</li>)}
    </ul>
  );
}

export default function PrivatlivspolitikPage() {
  return (
    <div style={{ background: C.warm, minHeight: "100vh", fontFamily: SANS }}>
      {/* Header */}
      <header className="border-b" style={{ background: C.white, borderColor: C.border }}>
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between">
          <Link href="/">
            <img src={formaEstatesLogo} alt="Forma Estates" style={{ height: 36 }} className="cursor-pointer" data-testid="privacy-logo" />
          </Link>
          <Link href="/">
            <button className="flex items-center gap-2 text-sm hover:underline" style={{ color: C.muted }} data-testid="privacy-back">
              <ArrowLeft className="w-4 h-4" /> Tilbage til forsiden
            </button>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-14">
        {/* Title */}
        <div className="mb-12">
          <div className="uppercase mb-3" style={{ color: C.gold, fontSize: 11, fontWeight: 700, letterSpacing: "0.18em" }}>
            Juridisk
          </div>
          <h1 style={{ fontFamily: SERIF, color: C.navy, fontSize: 36, fontWeight: 600, lineHeight: 1.2, marginBottom: 12 }}>
            Privatlivspolitik
          </h1>
          <p style={{ color: C.muted, fontSize: 14 }}>
            Senest opdateret: juni 2026 · Forma Estates · CVR: 46551796
          </p>
        </div>

        <div style={{ background: C.white, borderRadius: 16, padding: "40px 48px", border: `1px solid ${C.border}` }}>

          <Section title="1. Dataansvarlig">
            <P>
              Den dataansvarlige for behandlingen af dine personoplysninger er:
            </P>
            <div className="rounded-xl p-5 mb-3" style={{ background: C.warm, border: `1px solid ${C.border}` }}>
              <p className="font-semibold" style={{ color: C.navy }}>Forma Estates</p>
              <p>CVR-nr.: 46551796</p>
              <p>E-mail: <a href="mailto:kontakt@formaestates.com" className="underline" style={{ color: C.gold }}>kontakt@formaestates.com</a></p>
              <p>Telefon: <a href="tel:+4529172732" className="underline" style={{ color: C.gold }}>+45 29 17 27 32</a></p>
              <p>Hjemmeside: <a href="https://formaestates.com" className="underline" style={{ color: C.gold }}>formaestates.com</a></p>
            </div>
          </Section>

          <Section title="2. Hvilke oplysninger vi indsamler">
            <P>Vi indsamler og behandler følgende typer af personoplysninger:</P>
            <p className="font-semibold mb-1.5" style={{ color: C.navy }}>Kontooplysninger</p>
            <Ul items={[
              "E-mailadresse (bruges til login og kommunikation)",
              "Krypteret adgangskode (håndteres af Firebase Authentication — vi ser aldrig din adgangskode i klartekst)",
              "Visningsnavn (valgfrit)",
            ]} />
            <p className="font-semibold mb-1.5" style={{ color: C.navy }}>Brugsdata</p>
            <Ul items={[
              "Antal genererede AI-visualiseringer, 3D-plantegninger og videoer",
              "Uploadede ejendomsbilleder (midlertidigt lagret til AI-behandling)",
              "Sagsoplysninger du selv opretter (adresse, sagsnummer, noter)",
              "Tidspunkter for brug og funktioner du har benyttet",
            ]} />
            <p className="font-semibold mb-1.5" style={{ color: C.navy }}>Tekniske oplysninger (kun med samtykke)</p>
            <Ul items={[
              "IP-adresse (anonymiseret)",
              "Browsertype og -version",
              "Sider du besøger og tid brugt på siden (via Google Analytics 4 — kun hvis du accepterer statistik-cookies)",
            ]} />
          </Section>

          <Section title="3. Formål og retsgrundlag">
            <P>Vi behandler dine oplysninger til følgende formål:</P>
            <div className="space-y-3 mb-3">
              {[
                { purpose: "Levering af tjenesten", legal: "Opfyldelse af aftale (GDPR art. 6(1)(b))", desc: "For at du kan logge ind, gemme sager og generere AI-billeder." },
                { purpose: "Abonnements- og betalingshåndtering", legal: "Opfyldelse af aftale (GDPR art. 6(1)(b))", desc: "Registrering af dit abonnement og forbrug af din kvota." },
                { purpose: "Kommunikation", legal: "Berettiget interesse (GDPR art. 6(1)(f))", desc: "Svar på henvendelser, velkomstmail og driftsvarsler." },
                { purpose: "Statistik og forbedring", legal: "Samtykke (GDPR art. 6(1)(a))", desc: "Google Analytics 4 bruges til at forstå besøgsmønstre — kun hvis du accepterer statistik-cookies." },
              ].map(({ purpose, legal, desc }) => (
                <div key={purpose} className="rounded-lg p-4" style={{ background: C.warm, border: `1px solid ${C.border}` }}>
                  <p className="font-semibold text-sm mb-0.5" style={{ color: C.navy }}>{purpose}</p>
                  <p className="text-xs mb-1" style={{ color: C.gold }}>{legal}</p>
                  <p className="text-sm" style={{ color: C.muted }}>{desc}</p>
                </div>
              ))}
            </div>
          </Section>

          <Section title="4. Cookies">
            <P>Vi bruger cookies til at få tjenesten til at fungere og til at forstå, hvordan den bruges. Du vælger selv, hvilke cookies du accepterer, via vores cookie-banner.</P>
            <div className="overflow-x-auto mb-3">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr style={{ background: C.navy, color: C.white }}>
                    <th className="text-left px-4 py-2.5 rounded-tl-lg" style={{ fontSize: 12, fontWeight: 600 }}>Kategori</th>
                    <th className="text-left px-4 py-2.5" style={{ fontSize: 12, fontWeight: 600 }}>Cookies</th>
                    <th className="text-left px-4 py-2.5 rounded-tr-lg" style={{ fontSize: 12, fontWeight: 600 }}>Formål</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { cat: "Nødvendige", cookies: "Firebase session-cookies", purpose: "Holder dig logget ind. Kan ikke fravælges." },
                    { cat: "Nødvendige", cookies: "forma-cookie-consent", purpose: "Husker dit cookie-valg i 1 år." },
                    { cat: "Statistik", cookies: "_ga, _ga_5BRC2FMPNT", purpose: "Google Analytics 4 — anonymiseret besøgsstatistik. Kræver samtykke." },
                  ].map((r, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? C.white : C.warm }}>
                      <td className="px-4 py-3 font-medium" style={{ color: C.navy }}>{r.cat}</td>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: C.muted }}>{r.cookies}</td>
                      <td className="px-4 py-3" style={{ color: C.text }}>{r.purpose}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <P>Du kan til enhver tid trække dit samtykke til statistik-cookies tilbage ved at rydde din browsers cookies eller kontakte os.</P>
          </Section>

          <Section title="5. Deling med tredjeparter">
            <P>Vi deler kun dine oplysninger med tredjeparter, der er nødvendige for at levere vores tjeneste:</P>
            <div className="space-y-2.5 mb-3">
              {[
                { name: "Firebase (Google LLC)", role: "Autentificering og brugerkonti", region: "EU/USA · Standard contractual clauses" },
                { name: "Collov AI", role: "AI-generering af boligvisualiseringer (uploadede billeder behandles)", region: "USA · Databehandleraftale" },
                { name: "Render.com", role: "Serverhosting og database", region: "EU" },
                { name: "Brevo (Sendinblue)", role: "Transaktionelle e-mails (velkomst, kvitteringer)", region: "EU · GDPR-compliant" },
                { name: "Google Analytics 4", role: "Anonymiseret besøgsstatistik (kun med samtykke)", region: "EU/USA · Standard contractual clauses" },
              ].map(({ name, role, region }) => (
                <div key={name} className="flex items-start gap-4 p-4 rounded-lg" style={{ border: `1px solid ${C.border}`, background: C.warm }}>
                  <div className="flex-1">
                    <p className="font-semibold text-sm" style={{ color: C.navy }}>{name}</p>
                    <p className="text-sm" style={{ color: C.muted }}>{role}</p>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full flex-shrink-0" style={{ background: "rgba(201,169,110,0.12)", color: C.gold }}>{region}</span>
                </div>
              ))}
            </div>
            <P>Vi sælger aldrig dine oplysninger til tredjeparter.</P>
          </Section>

          <Section title="6. Opbevaring og sletning">
            <Ul items={[
              "Kontooplysninger: opbevares så længe din konto er aktiv. Slettes på anmodning eller efter 2 år uden aktivitet.",
              "Uploadede billeder til AI-behandling: slettes fra vores servere senest 30 dage efter upload.",
              "Genererede billeder og sager: opbevares på din konto indtil du sletter dem selv eller lukker kontoen.",
              "Betalingshistorik: opbevares i 5 år i henhold til bogføringsloven.",
              "Google Analytics-data: opbevares i 14 måneder (GA4 standard) og anonymiseres løbende.",
            ]} />
          </Section>

          <Section title="7. Dine rettigheder">
            <P>Under GDPR har du følgende rettigheder. Du kan udøve dem ved at kontakte os på <a href="mailto:kontakt@formaestates.com" className="underline" style={{ color: C.gold }}>kontakt@formaestates.com</a>:</P>
            <div className="grid sm:grid-cols-2 gap-3 mb-3">
              {[
                { right: "Indsigt", desc: "Du kan få en kopi af de oplysninger vi har om dig." },
                { right: "Berigtigelse", desc: "Du kan få rettet fejlagtige oplysninger." },
                { right: "Sletning", desc: "Du kan anmode om at få din konto og dine data slettet." },
                { right: "Dataportabilitet", desc: "Du kan få dine data udleveret i et maskinlæsbart format." },
                { right: "Indsigelse", desc: "Du kan gøre indsigelse mod behandling baseret på legitim interesse." },
                { right: "Tilbagekaldelse", desc: "Du kan til enhver tid trække et samtykke (f.eks. til cookies) tilbage." },
              ].map(({ right, desc }) => (
                <div key={right} className="p-4 rounded-lg" style={{ border: `1px solid ${C.border}`, background: C.warm }}>
                  <p className="font-semibold text-sm mb-1" style={{ color: C.navy }}>{right}</p>
                  <p className="text-sm" style={{ color: C.muted }}>{desc}</p>
                </div>
              ))}
            </div>
            <P>
              Hvis du mener, at vi behandler dine oplysninger i strid med GDPR, har du ret til at klage til{" "}
              <a href="https://www.datatilsynet.dk" target="_blank" rel="noreferrer" className="underline" style={{ color: C.gold }}>Datatilsynet</a>{" "}
              (datatilsynet.dk).
            </P>
          </Section>

          <Section title="8. Sikkerhed">
            <P>
              Vi beskytter dine oplysninger med branchestandard sikkerhedsforanstaltninger: krypteret kommunikation (HTTPS/TLS), adgangskontrol, Firebase's sikkerhedsinfrastruktur og regelmæssige gennemgange af vores databehandling.
            </P>
          </Section>

          <Section title="9. Ændringer til denne politik">
            <P>
              Vi kan opdatere denne privatlivspolitik ved ændringer i vores tjeneste eller lovgivning. Væsentlige ændringer meddeles via e-mail eller et synligt banner på hjemmesiden. Den gældende version er altid tilgængelig på <a href="https://formaestates.com/privatlivspolitik" className="underline" style={{ color: C.gold }}>formaestates.com/privatlivspolitik</a>.
            </P>
          </Section>

          <Section title="10. Kontakt">
            <P>
              Har du spørgsmål til denne politik eller til behandlingen af dine oplysninger, er du altid velkommen til at kontakte os:
            </P>
            <div className="rounded-xl p-5" style={{ background: C.navy, color: C.white }}>
              <p className="font-semibold mb-1" style={{ fontFamily: SERIF, fontSize: 16 }}>Forma Estates</p>
              <p className="text-sm mb-0.5" style={{ color: "rgba(255,255,255,0.7)" }}>CVR: 46551796</p>
              <p className="text-sm mb-0.5">
                <a href="mailto:kontakt@formaestates.com" className="hover:underline" style={{ color: C.gold }}>kontakt@formaestates.com</a>
              </p>
              <p className="text-sm">
                <a href="tel:+4529172732" className="hover:underline" style={{ color: C.gold }}>+45 29 17 27 32</a>
              </p>
            </div>
          </Section>

        </div>
      </main>

      {/* Footer */}
      <footer className="border-t py-6 px-6 text-center" style={{ borderColor: C.border }}>
        <p className="text-xs" style={{ color: C.muted }}>© {new Date().getFullYear()} Forma Estates · CVR: 46551796</p>
      </footer>
    </div>
  );
}
