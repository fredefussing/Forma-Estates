import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { usePageTitle } from "@/hooks/use-page-title";
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

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-4 mb-3" style={{ background: "rgba(201,169,110,0.07)", border: `1px solid ${C.goldBorder}` }}>
      {children}
    </div>
  );
}

export default function PrivatlivspolitikPage() {
  usePageTitle("Privatlivspolitik", "Læs hvordan Forma Estates behandler og beskytter dine personoplysninger.");
  return (
    <div style={{ background: C.warm, minHeight: "100vh", fontFamily: SANS }}>
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
        <div className="mb-12">
          <div className="uppercase mb-3" style={{ color: C.gold, fontSize: 11, fontWeight: 700, letterSpacing: "0.18em" }}>Juridisk</div>
          <h1 style={{ fontFamily: SERIF, color: C.navy, fontSize: 36, fontWeight: 600, lineHeight: 1.2, marginBottom: 12 }}>
            Privatlivspolitik
          </h1>
          <p style={{ color: C.muted, fontSize: 14 }}>
            Senest opdateret: juni 2026 &middot; Forma Estates &middot; CVR: 46551796
          </p>
        </div>

        <div style={{ background: C.white, borderRadius: 16, padding: "40px 48px", border: `1px solid ${C.border}` }}>

          {/* 1 */}
          <Section title="1. Dataansvarlig">
            <P>Den dataansvarlige for behandlingen af dine personoplysninger er:</P>
            <div className="rounded-xl p-5 mb-3" style={{ background: C.warm, border: `1px solid ${C.border}` }}>
              <p className="font-semibold mb-1" style={{ color: C.navy }}>Forma Estates</p>
              <p>CVR-nr.: 46551796</p>
              <p>
                E-mail:{" "}
                <a href="mailto:kontakt@formaestates.com" className="underline" style={{ color: C.gold }}>
                  kontakt@formaestates.com
                </a>{" "}
                <span style={{ color: C.muted, fontSize: 13 }}>(alle henvendelser om personoplysninger besvares inden for 72 timer)</span>
              </p>
              <p>Telefon: <a href="tel:+4529172732" className="underline" style={{ color: C.gold }}>+45 29 17 27 32</a></p>
              <p>Hjemmeside: <a href="https://formaestates.com" className="underline" style={{ color: C.gold }}>formaestates.com</a></p>
            </div>
          </Section>

          {/* 2 */}
          <Section title="2. Hvilke oplysninger vi indsamler">
            <P>Vi indsamler og behandler følgende typer af personoplysninger:</P>
            <p className="font-semibold mb-1.5" style={{ color: C.navy }}>Kontooplysninger</p>
            <Ul items={[
              "E-mailadresse (bruges til login og kommunikation)",
              "Krypteret adgangskode (håndteres udelukkende af Firebase Authentication — vi kan ikke se din adgangskode)",
              "Visningsnavn (valgfrit)",
            ]} />
            <p className="font-semibold mb-1.5" style={{ color: C.navy }}>Brugsdata</p>
            <Ul items={[
              "Antal genererede AI-visualiseringer, 3D-plantegninger og videoer",
              "Uploadede ejendomsbilleder (lagret til AI-behandling — se afsnit 6 om opbevaring)",
              "Sagsoplysninger du selv opretter (adresse, sagsnummer, noter)",
              "Tidspunkter og funktioner du har benyttet",
            ]} />
            <p className="font-semibold mb-1.5" style={{ color: C.navy }}>Tekniske oplysninger (kun med samtykke)</p>
            <Ul items={[
              "Anonymiseret IP-adresse",
              "Browsertype og -version",
              "Sider du besøger og tid brugt på siden (Google Analytics 4 — kun ved accept af statistik-cookies)",
            ]} />
          </Section>

          {/* 3 */}
          <Section title="3. Formål og retsgrundlag">
            <P>Vi behandler dine oplysninger til følgende formål og med følgende retsgrundlag:</P>
            <div className="space-y-3 mb-3">
              {[
                {
                  purpose: "Levering af tjenesten",
                  legal: "Opfyldelse af aftale — GDPR art. 6(1)(b)",
                  desc: "Login, gemte sager og generering af AI-visualiseringer kræver behandling af din e-mail og brugsdata.",
                },
                {
                  purpose: "Abonnements- og betalingshåndtering",
                  legal: "Opfyldelse af aftale — GDPR art. 6(1)(b)",
                  desc: "Registrering af abonnement, kvotaforbrug og betalingshistorik.",
                },
                {
                  purpose: "Transaktionelle e-mails",
                  legal: "Berettiget interesse — GDPR art. 6(1)(f)",
                  desc: "Velkomstmail, ordrekvitteringer og driftsvarsler sendes via Brevo.",
                },
                {
                  purpose: "Statistik og trafikanalyse",
                  legal: "Samtykke — GDPR art. 6(1)(a)",
                  desc: "Google Analytics 4 bruges til anonymiseret besøgsstatistik. Kræver dit samtykke — du kan til enhver tid trække det tilbage.",
                },
              ].map(({ purpose, legal, desc }) => (
                <div key={purpose} className="rounded-lg p-4" style={{ background: C.warm, border: `1px solid ${C.border}` }}>
                  <p className="font-semibold text-sm mb-0.5" style={{ color: C.navy }}>{purpose}</p>
                  <p className="text-xs mb-1" style={{ color: C.gold }}>{legal}</p>
                  <p className="text-sm" style={{ color: C.muted }}>{desc}</p>
                </div>
              ))}
            </div>
          </Section>

          {/* 4 */}
          <Section title="4. Cookies og tilbagetrækning af samtykke">
            <P>
              Vi bruger cookies til at få tjenesten til at fungere og — med dit samtykke — til at forstå, hvordan den bruges.
              Du vælger selv via vores cookie-banner, hvilke cookies du accepterer.
            </P>

            <div className="overflow-x-auto mb-4">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr style={{ background: C.navy, color: C.white }}>
                    <th className="text-left px-4 py-2.5 rounded-tl-lg" style={{ fontSize: 12, fontWeight: 600 }}>Kategori</th>
                    <th className="text-left px-4 py-2.5" style={{ fontSize: 12, fontWeight: 600 }}>Cookies</th>
                    <th className="text-left px-4 py-2.5" style={{ fontSize: 12, fontWeight: 600 }}>Levetid</th>
                    <th className="text-left px-4 py-2.5 rounded-tr-lg" style={{ fontSize: 12, fontWeight: 600 }}>Formål</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { cat: "Nødvendige", cookies: "Firebase session-cookies", life: "Session / 1 år", purpose: "Holder dig logget ind. Kan ikke fravælges." },
                    { cat: "Nødvendige", cookies: "forma-cookie-consent", life: "Op til 1 år", purpose: "Husker dit cookie-valg. Kan ikke fravælges." },
                    { cat: "Statistik", cookies: "_ga", life: "2 år", purpose: "Google Analytics 4 — skelner besøgende. Kræver samtykke." },
                    { cat: "Statistik", cookies: "_ga_5BRC2FMPNT", life: "2 år", purpose: "Google Analytics 4 — sessionsstyring. Kræver samtykke." },
                  ].map((r, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? C.white : C.warm }}>
                      <td className="px-4 py-3 font-medium" style={{ color: C.navy }}>{r.cat}</td>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: C.muted }}>{r.cookies}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: C.muted }}>{r.life}</td>
                      <td className="px-4 py-3" style={{ color: C.text }}>{r.purpose}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="font-semibold mb-2" style={{ color: C.navy }}>Sådan trækker du dit samtykke tilbage</p>
            <P>Du kan til enhver tid trække dit samtykke til statistik-cookies tilbage på én af følgende måder:</P>
            <Ul items={[
              <><strong>Ryd cookies i din browser:</strong> Gå til browserindstillinger → Ryd browserdata → Sæt flueben ved "Cookies og andre webstedsdata" → Bekræft. Næste gang du besøger siden vises cookie-banneret igen.</>,
              <><strong>Slet nøglen manuelt:</strong> I browserens udviklerkonsol (F12) kan du køre <code className="px-1 py-0.5 rounded text-xs" style={{ background: C.warm }}>localStorage.removeItem('forma-cookie-consent')</code> og genindlæse siden.</>,
              <><strong>Brug privat/inkognito-tilstand:</strong> Cookies og samtykke gemmes ikke på tværs af private sessioner.</>,
              <><strong>Kontakt os:</strong> Skriv til <a href="mailto:kontakt@formaestates.com" className="underline" style={{ color: C.gold }}>kontakt@formaestates.com</a> og vi hjælper dig med at annullere samtykket.</>,
            ]} />
          </Section>

          {/* 5 */}
          <Section title="5. Databehandlere — roller og ansvar">
            <P>
              Vi har indgået databehandleraftaler (DPA) med nedenstående tredjeparter, som behandler personoplysninger på vores vegne.
              Forma Estates er dataansvarlig; de nævnte parter er databehandlere, medmindre andet er angivet.
            </P>
            <div className="space-y-3 mb-3">
              {[
                {
                  name: "Firebase Authentication (Google LLC)",
                  role: "Databehandler",
                  detail: "Håndterer login og brugerkonti. Opbevarer e-mailadresse og krypteret adgangskode. Google Cloud-databehandleraftalen (Cloud DPA) er indgået automatisk ved brug af Firebase.",
                  link: "https://firebase.google.com/support/privacy",
                  linkLabel: "Googles privatlivspolitik",
                },
                {
                  name: "Google Analytics 4 (Google LLC)",
                  role: "Databehandler (med egne formål)*",
                  detail: "Behandler anonymiseret besøgsstatistik. *Google kan bruge aggregerede data til egne formål (se Googles betingelser). IP-adresser anonymiseres før lagring. Behandling sker kun ved dit samtykke.",
                  link: "https://policies.google.com/privacy",
                  linkLabel: "Googles privatlivspolitik",
                },
                {
                  name: "Brevo (Sendinblue SAS)",
                  role: "Databehandler",
                  detail: "Sender transaktionelle e-mails (velkomst, ordrekvitteringer, driftsbeskeder). Behandler e-mailadresse og indhold af e-mails. Brevo er et fransk selskab og behandler data inden for EU.",
                  link: "https://www.brevo.com/legal/privacypolicy/",
                  linkLabel: "Brevos privatlivspolitik",
                },
                {
                  name: "Render.com",
                  role: "Databehandler (hosting)",
                  detail: "Hoster vores server og PostgreSQL-database. Alle personoplysninger i vores database (kontodata, sager, brugsdata) lagres på Render's infrastruktur. Render er SOC 2 Type II-certificeret.",
                  link: "https://render.com/privacy",
                  linkLabel: "Renders privatlivspolitik",
                },
                {
                  name: "Collov AI",
                  role: "Databehandler",
                  detail: "Modtager uploadede boligbilleder til AI-behandling (virtuel staging). Billeder sendes via Collov's API og behandles på deres servere i USA. Vi har indgået databehandleraftale med Collov.",
                  link: "https://collov.com",
                  linkLabel: "Collov AI",
                },
              ].map(({ name, role, detail, link, linkLabel }) => (
                <div key={name} className="rounded-lg p-4" style={{ border: `1px solid ${C.border}`, background: C.warm }}>
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <p className="font-semibold text-sm" style={{ color: C.navy }}>{name}</p>
                    <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0 font-medium" style={{ background: "rgba(201,169,110,0.12)", color: C.gold }}>{role}</span>
                  </div>
                  <p className="text-sm mb-1.5" style={{ color: C.muted }}>{detail}</p>
                  <a href={link} target="_blank" rel="noreferrer" className="text-xs underline" style={{ color: C.gold }}>{linkLabel} ↗</a>
                </div>
              ))}
            </div>
            <P>Vi sælger aldrig dine oplysninger til tredjeparter.</P>
          </Section>

          {/* 6 — NEW: Third-country transfers */}
          <Section title="6. Overførsel af oplysninger til tredjelande">
            <P>
              Nogle af vores databehandlere er etableret i eller behandler data i lande uden for EU/EØS (primært USA).
              Sådanne overførsler er kun lovlige, når der er et passende overførselsgrundlag jf. GDPR kapitel V.
            </P>
            <div className="space-y-3 mb-4">
              {[
                {
                  name: "Firebase Authentication & Google Analytics 4",
                  country: "USA",
                  basis: "EU–US Data Privacy Framework (DPF) og Standard Contractual Clauses (SCC)",
                  detail: "Google LLC er certificeret under EU–US Data Privacy Framework (godkendt af Europa-Kommissionen, juli 2023). Overførslen er desuden dækket af Googles Cloud Data Processing Addendum, som inkorporerer EU's standardkontraktbestemmelser (SCC, Kommissionens afgørelse 2021/914).",
                },
                {
                  name: "Collov AI",
                  country: "USA",
                  basis: "Standard Contractual Clauses (SCC)",
                  detail: "Overførslen af uploadede boligbilleder til Collov's API-servere i USA sker på grundlag af EU's standardkontraktbestemmelser (SCC). Vi har sikret, at Collov har implementeret passende tekniske og organisatoriske sikkerhedsforanstaltninger.",
                },
                {
                  name: "Render.com",
                  country: "USA (Oregon) / valgfrit EU",
                  basis: "Standard Contractual Clauses (SCC)",
                  detail: "Render.com tilbyder hosting i både USA og EU (Frankfurt). Vores primære infrastruktur kører i USA (Oregon-regionen). Overførslen er dækket af Render's DPA, som inkorporerer SCC. Vi overvejer løbende at migrere til EU-regionen.",
                },
                {
                  name: "Brevo (Sendinblue SAS)",
                  country: "EU (Frankrig)",
                  basis: "Ingen overførsel til tredjelande",
                  detail: "Brevo er et fransk selskab og behandler data inden for EU/EØS. Der sker ingen overførsel til tredjelande i forbindelse med e-mailudsendelse.",
                },
              ].map(({ name, country, basis, detail }) => (
                <div key={name} className="rounded-lg p-4" style={{ border: `1px solid ${C.border}`, background: C.warm }}>
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <p className="font-semibold text-sm" style={{ color: C.navy }}>{name}</p>
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "rgba(15,25,35,0.07)", color: C.navy }}>{country}</span>
                  </div>
                  <p className="text-xs font-semibold mb-1" style={{ color: C.gold }}>{basis}</p>
                  <p className="text-sm" style={{ color: C.muted }}>{detail}</p>
                </div>
              ))}
            </div>
            <InfoBox>
              <p className="text-sm" style={{ color: C.text }}>
                Du har ret til at anmode om en kopi af de anvendte overførselsmekanismer (fx SCC-teksten). Send en anmodning til{" "}
                <a href="mailto:kontakt@formaestates.com" className="underline" style={{ color: C.gold }}>kontakt@formaestates.com</a>.
              </p>
            </InfoBox>
          </Section>

          {/* 7 — renumbered */}
          <Section title="7. Opbevaring og sletning">
            <P>Vi opbevarer kun dine oplysninger så længe det er nødvendigt for det formål, de er indsamlet til:</P>
            <div className="space-y-2 mb-3">
              {[
                {
                  type: "Kontooplysninger (e-mail, navn)",
                  period: "Aktiv konto + 2 år efter inaktivitet",
                  note: "Slettes straks på anmodning.",
                },
                {
                  type: "Uploadede originalbilleder",
                  period: "Til servervedligeholdelse eller sletning på anmodning",
                  note: "Originalbilleder gemmes på vores server til AI-behandling. Der er ikke automatisk sletning — skriv til os, hvis du ønsker dine uploadede billeder slettet.",
                },
                {
                  type: "AI-genererede billeder og sagsdata",
                  period: "Aktiv konto",
                  note: "Slettes når du selv sletter dem eller lukker din konto.",
                },
                {
                  type: "Betalingshistorik",
                  period: "5 år",
                  note: "Krævet af bogføringsloven (§ 10).",
                },
                {
                  type: "Google Analytics-data",
                  period: "14 måneder (GA4 standard)",
                  note: "Anonymiseres løbende. Slettes automatisk af Google efter perioden.",
                },
                {
                  type: "Cookie-samtykke (localStorage)",
                  period: "Op til 1 år eller til sletning",
                  note: "Gemmes i din browser. Slettes når du rydder cookies eller trækker samtykket tilbage.",
                },
              ].map(({ type, period, note }) => (
                <div key={type} className="flex gap-4 p-3 rounded-lg" style={{ background: C.warm, border: `1px solid ${C.border}` }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold" style={{ color: C.navy }}>{type}</p>
                    <p className="text-xs mt-0.5" style={{ color: C.muted }}>{note}</p>
                  </div>
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full h-fit flex-shrink-0 mt-0.5" style={{ background: "rgba(201,169,110,0.12)", color: C.gold }}>{period}</span>
                </div>
              ))}
            </div>
          </Section>

          {/* 8 */}
          <Section title="8. Dine rettigheder">
            <P>
              Under GDPR har du følgende rettigheder. Kontakt os på{" "}
              <a href="mailto:kontakt@formaestates.com" className="underline" style={{ color: C.gold }}>kontakt@formaestates.com</a>{" "}
              for at udøve dem — vi svarer inden for 30 dage (GDPR art. 12(3)):
            </P>
            <div className="grid sm:grid-cols-2 gap-3 mb-4">
              {[
                { right: "Indsigt (art. 15)", desc: "Kopi af alle oplysninger vi behandler om dig." },
                { right: "Berigtigelse (art. 16)", desc: "Rettelse af fejlagtige eller ufuldstændige oplysninger." },
                { right: "Sletning (art. 17)", desc: "Sletning af din konto og tilknyttede data ('retten til at blive glemt')." },
                { right: "Begrænsning (art. 18)", desc: "Begrænsning af behandlingen, fx mens en indsigelse behandles." },
                { right: "Dataportabilitet (art. 20)", desc: "Dine data udleveret i maskinlæsbart format (JSON/CSV)." },
                { right: "Indsigelse (art. 21)", desc: "Indsigelse mod behandling baseret på berettiget interesse." },
                { right: "Tilbagekaldelse (art. 7(3))", desc: "Tilbagekaldelse af samtykke til statistik-cookies — se afsnit 4." },
                { right: "Klage (art. 77)", desc: "Klage til Datatilsynet — datatilsynet.dk, +45 33 19 32 00." },
              ].map(({ right, desc }) => (
                <div key={right} className="p-4 rounded-lg" style={{ border: `1px solid ${C.border}`, background: C.warm }}>
                  <p className="font-semibold text-sm mb-1" style={{ color: C.navy }}>{right}</p>
                  <p className="text-sm" style={{ color: C.muted }}>{desc}</p>
                </div>
              ))}
            </div>
            <InfoBox>
              <p className="text-sm" style={{ color: C.text }}>
                Du kan også klage direkte til{" "}
                <a href="https://www.datatilsynet.dk" target="_blank" rel="noreferrer" className="underline font-semibold" style={{ color: C.gold }}>
                  Datatilsynet
                </a>{" "}
                (Carl Jacobsens Vej 35, 2500 Valby · <a href="mailto:dt@datatilsynet.dk" className="underline" style={{ color: C.gold }}>dt@datatilsynet.dk</a>),
                hvis du mener, vi behandler dine oplysninger i strid med GDPR.
              </p>
            </InfoBox>
          </Section>

          {/* 9 */}
          <Section title="9. Sikkerhed">
            <P>
              Vi beskytter dine oplysninger med branchestandard sikkerhedsforanstaltninger:
            </P>
            <Ul items={[
              "Al kommunikation krypteres via HTTPS/TLS",
              "Adgangskoder håndteres udelukkende af Firebase Authentication (bcrypt-hashing, zero-knowledge for os)",
              "Adgangskontrol: kun autoriserede medarbejdere har adgang til produktionsdatabasen",
              "Render.com er SOC 2 Type II-certificeret",
              "Vi foretager løbende vurdering af vores databehandling og opdaterer sikkerhedsforanstaltningerne ved behov",
            ]} />
          </Section>

          {/* 10 */}
          <Section title="10. Ændringer til denne politik">
            <P>
              Vi kan opdatere denne privatlivspolitik ved ændringer i vores tjeneste eller gældende lovgivning.
              Væsentlige ændringer meddeles via e-mail eller et synligt banner på hjemmesiden mindst 14 dage inden de træder i kraft.
              Den gældende version er altid tilgængelig på{" "}
              <a href="https://formaestates.com/privatlivspolitik" className="underline" style={{ color: C.gold }}>
                formaestates.com/privatlivspolitik
              </a>.
            </P>
          </Section>

          {/* 11 */}
          <Section title="11. Kontakt">
            <P>
              Har du spørgsmål til denne politik eller til vores behandling af dine personoplysninger, kontakt os:
            </P>
            <div className="rounded-xl p-5" style={{ background: C.navy, color: C.white }}>
              <p className="font-semibold mb-2" style={{ fontFamily: SERIF, fontSize: 16 }}>Forma Estates — Dataansvarlig</p>
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
                  Vi behandler alle henvendelser vedrørende personoplysninger inden for 72 timer.
                </p>
              </div>
            </div>
          </Section>

        </div>
      </main>

      <footer className="border-t py-6 px-6 text-center" style={{ borderColor: C.border }}>
        <div className="flex justify-center gap-6 mb-3">
          <Link href="/handelsbetingelser">
            <span className="text-xs underline cursor-pointer" style={{ color: C.gold }}>Handelsbetingelser</span>
          </Link>
        </div>
        <p className="text-xs" style={{ color: C.muted }}>
          © {new Date().getFullYear()} Forma Estates &middot; CVR: 46551796 &middot;{" "}
          Senest opdateret juni 2026
        </p>
      </footer>
    </div>
  );
}
