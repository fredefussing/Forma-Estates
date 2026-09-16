import { useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { CheckCircle2, Clock, Facebook, Instagram, Linkedin, Loader2, Mail, MapPin, Phone } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { usePageTitle } from "@/hooks/use-page-title";
import formaEstatesLogo from "@assets/forma-estates-logo.png";

const C = {
  navy: "#0F1923",
  gold: "#C9A96E",
  goldHover: "#B8975D",
  champagne: "#E8DFD0",
  warm: "#F8F6F3",
  white: "#FFFFFF",
  text: "#26313A",
  muted: "#6B7280",
  border: "#E5E1D8",
  error: "#9B1C1C",
};

const SERIF = "'Playfair Display', Georgia, serif";
const SANS = "'Inter', system-ui, -apple-system, sans-serif";

const TOPICS = ["Demo og rundvisning", "Priser og pakker", "Samarbejde / partnerskab", "Teknisk spørgsmål", "Andet"];
const TEAM_SIZES = ["1 (selvstændig)", "2–5", "6–15", "16–50", "50+"];
const ROLES = ["Ejendomsmægler", "Indehaver / Partner", "Marketingansvarlig", "Fotograf / Stylist", "Andet"];

const nav = [
  ["Forside", "/boligpotentiale"],
  ["Priser", "/boligpotentiale#pricing"],
  ["Eksempler", "/boligpotentiale/eksempler"],
  ["Om os", "/om-os"],
  ["FAQ", "/boligpotentiale#faq"],
] as const;

const directContacts: { Icon: typeof Mail; title: string; value: ReactNode }[] = [
  { Icon: Mail, title: "E-mail", value: <a href="mailto:kontakt@formaestates.com" style={{ color: C.white, textDecoration: "none" }} data-testid="link-email">kontakt@formaestates.com</a> },
  { Icon: Phone, title: "Telefon", value: <a href="tel:+4529172732" style={{ color: C.white, textDecoration: "none" }} data-testid="link-phone">+45 29 17 27 32</a> },
  { Icon: Clock, title: "Åbningstid", value: "Man–fre · 8:00–19:00" },
  { Icon: MapPin, title: "Lokation", value: "København · Danmark" },
];

export default function KontaktPage() {
  usePageTitle("Kontakt os", "Kontakt Forma Estates — vi svarer inden for én arbejdsdag.");
  const [form, setForm] = useState({
    name: "", email: "", phone: "", company: "", role: "", teamSize: "", topic: "", message: "", consent: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (key: keyof typeof form, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));
  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!form.consent) {
      setError("Du skal acceptere, at vi må kontakte dig.");
      return;
    }
    setSubmitting(true);
    try {
      await apiRequest("POST", "/api/contact", form);
      setDone(true);
    } catch (err: any) {
      setError(err?.message?.replace(/^\d+:\s*/, "") || "Noget gik galt. Prøv igen.");
    } finally {
      setSubmitting(false);
    }
  };

  const input: CSSProperties = {
    width: "100%", padding: "13px 14px", borderRadius: 5, border: `1px solid ${C.border}`,
    background: C.white, fontSize: 14, fontFamily: SANS, color: C.text, outline: "none",
  };
  const label: CSSProperties = {
    display: "block", fontSize: 11, fontWeight: 700, letterSpacing: "0.12em",
    textTransform: "uppercase", color: C.navy, marginBottom: 8,
  };

  return (
    <div style={{ minHeight: "100dvh", background: C.warm, color: C.text, fontFamily: SANS }}>
      <header style={{ background: C.champagne, borderBottom: `1px solid ${C.border}` }}>
        <div className="mx-auto flex items-center justify-between gap-5 px-5 sm:px-6" style={{ maxWidth: 1280, minHeight: 82 }}>
          <Link href="/boligpotentiale" className="flex shrink-0 items-center" data-testid="kontakt-logo-link">
            <img src={formaEstatesLogo} alt="Forma Estates" style={{ height: 82, width: "auto" }} />
          </Link>
          <nav className="hidden items-center gap-7 md:flex" aria-label="Hovednavigation">
            {nav.map(([title, href]) => (
              <Link key={title} href={href} style={{ color: C.navy, fontSize: 12, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", textDecoration: "none" }}>
                {title}
              </Link>
            ))}
            <Link href="/kontakt" style={{ color: C.gold, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", textDecoration: "none" }}>Kontakt</Link>
          </nav>
          <div className="flex items-center gap-3 sm:gap-5">
            <Link href="/log-ind" className="hidden sm:block" style={{ color: C.navy, fontSize: 12, fontWeight: 600, textDecoration: "none" }}>Log ind</Link>
            <Link href="/opret" style={{ background: C.navy, color: C.white, padding: "11px 16px", borderRadius: 5, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", textDecoration: "none", whiteSpace: "nowrap" }}>Kom i gang</Link>
          </div>
        </div>
      </header>

      <section className="px-5 text-center sm:px-6" style={{ paddingTop: "clamp(64px, 9vw, 112px)", paddingBottom: "clamp(42px, 6vw, 70px)" }}>
        <div className="mx-auto" style={{ maxWidth: 800 }}>
          <div style={{ color: C.gold, fontSize: 11, fontWeight: 700, letterSpacing: "0.32em", textTransform: "uppercase" }}>KONTAKT OS</div>
          <h1 className="mt-4" style={{ margin: 0, color: C.navy, fontFamily: SERIF, fontSize: "clamp(38px, 6vw, 68px)", fontWeight: 500, lineHeight: 1.04, letterSpacing: "-0.035em" }}>
            Gør næste boligpræsentation skarpere.
          </h1>
          <p className="mx-auto mt-6" style={{ maxWidth: 650, color: C.muted, fontSize: 17, lineHeight: 1.7 }}>
            Fortæl os, hvad du arbejder med, så finder vi den rigtige vej videre — en demo, et tilbud til kontoret eller et konkret spørgsmål.
          </p>
        </div>
      </section>

      <main className="px-5 sm:px-6" style={{ paddingBottom: "clamp(72px, 9vw, 112px)" }}>
        <div className="mx-auto grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_340px]" style={{ maxWidth: 1120 }}>
          <motion.form
            onSubmit={onSubmit}
            initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
            style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, padding: "clamp(24px, 4vw, 44px)", boxShadow: "0 14px 34px rgba(15,25,35,0.06)" }}
            data-testid="kontakt-form"
          >
            {done ? (
              <div className="py-10 text-center" data-testid="kontakt-success">
                <div className="mx-auto mb-6 flex items-center justify-center" style={{ width: 70, height: 70, borderRadius: "50%", background: C.warm, border: `1px solid ${C.gold}` }}><CheckCircle2 style={{ color: C.gold, width: 34, height: 34 }} /></div>
                <h2 style={{ color: C.navy, fontFamily: SERIF, fontSize: 30, fontWeight: 500 }}>Tak — vi har modtaget din besked.</h2>
                <p className="mx-auto mt-4" style={{ maxWidth: 430, color: C.muted, fontSize: 15, lineHeight: 1.7 }}>Du modtager en bekræftelse på <strong style={{ color: C.navy }}>{form.email}</strong> om et øjeblik. Vi vender tilbage inden for én arbejdsdag.</p>
                <Link href="/" className="mt-8 inline-block" style={{ background: C.navy, color: C.white, padding: "13px 24px", borderRadius: 5, fontSize: 13, fontWeight: 700, textDecoration: "none" }} data-testid="kontakt-back-home">Tilbage til forsiden</Link>
              </div>
            ) : (
              <>
                <div className="mb-8 flex items-end justify-between gap-4" style={{ borderBottom: `1px solid ${C.border}`, paddingBottom: 20 }}>
                  <div><div style={{ color: C.gold, fontSize: 10, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase" }}>01 — Din henvendelse</div><h2 className="mt-2" style={{ margin: 0, color: C.navy, fontFamily: SERIF, fontSize: 28, fontWeight: 500 }}>Lad os begynde her.</h2></div>
                  <span className="hidden sm:block" style={{ color: C.muted, fontSize: 12 }}>Alle felter med * er påkrævede</span>
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div><label style={label}>Navn *</label><input style={input} value={form.name} onChange={(e) => update("name", e.target.value)} required data-testid="input-name" /></div>
                  <div><label style={label}>E-mail *</label><input style={input} type="email" value={form.email} onChange={(e) => update("email", e.target.value)} required data-testid="input-email" /></div>
                  <div><label style={label}>Telefon</label><input style={input} type="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)} data-testid="input-phone" /></div>
                  <div><label style={label}>Firma / Mæglerkæde</label><input style={input} value={form.company} onChange={(e) => update("company", e.target.value)} data-testid="input-company" /></div>
                  <div><label style={label}>Rolle</label><select style={input} value={form.role} onChange={(e) => update("role", e.target.value)} data-testid="select-role"><option value="">Vælg…</option>{ROLES.map((role) => <option key={role}>{role}</option>)}</select></div>
                  <div><label style={label}>Antal medarbejdere</label><select style={input} value={form.teamSize} onChange={(e) => update("teamSize", e.target.value)} data-testid="select-team-size"><option value="">Vælg…</option>{TEAM_SIZES.map((size) => <option key={size}>{size}</option>)}</select></div>
                </div>
                <div className="mt-6"><label style={label}>Hvad handler din henvendelse om?</label><div className="flex flex-wrap gap-2">{TOPICS.map((topic) => { const active = form.topic === topic; return <button key={topic} type="button" onClick={() => update("topic", active ? "" : topic)} style={{ padding: "9px 13px", borderRadius: 4, border: `1px solid ${active ? C.navy : C.border}`, background: active ? C.navy : C.white, color: active ? C.white : C.navy, fontSize: 12, fontWeight: 600 }} data-testid={`chip-topic-${topic}`}>{topic}</button>; })}</div></div>
                <div className="mt-6"><label style={label}>Besked *</label><textarea style={{ ...input, minHeight: 155, resize: "vertical", lineHeight: 1.6 }} placeholder="Skriv frit — hvad ønsker du hjælp til? Antal boliger, deadlines, særlige ønsker…" value={form.message} onChange={(e) => update("message", e.target.value)} required data-testid="input-message" /></div>
                <label className="mt-6 flex cursor-pointer items-start gap-3" style={{ color: C.muted, fontSize: 12, lineHeight: 1.55 }}><input type="checkbox" checked={form.consent} onChange={(e) => update("consent", e.target.checked)} style={{ marginTop: 3, accentColor: C.navy }} data-testid="checkbox-consent" /><span>Jeg accepterer, at Forma Estates må kontakte mig på de oplyste kontaktdata. Vi videregiver aldrig data til tredjepart.</span></label>
                {error && <div className="mt-4" style={{ background: "#FDECEC", border: "1px solid #F5C6C6", color: C.error, padding: "11px 14px", borderRadius: 5, fontSize: 13 }} data-testid="text-error">{error}</div>}
                <button type="submit" disabled={submitting} className="mt-7 flex w-full items-center justify-center gap-2" style={{ background: submitting ? C.goldHover : C.gold, color: C.navy, padding: "15px 24px", border: 0, borderRadius: 5, fontSize: 13, fontWeight: 700 }} data-testid="button-submit">{submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Sender…</> : "Send besked"}</button>
              </>
            )}
          </motion.form>

          <aside className="lg:sticky lg:top-6">
            <div style={{ background: C.navy, color: C.white, borderRadius: 8, padding: "28px 26px" }} data-testid="kontakt-direct-card">
              <div style={{ color: C.gold, fontSize: 10, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase" }}>Direkte kontakt</div>
              <h2 className="mt-3" style={{ fontFamily: SERIF, fontSize: 27, fontWeight: 500, lineHeight: 1.15 }}>Kontakt os direkte</h2>
              <p className="mt-3" style={{ color: "rgba(255,255,255,0.62)", fontSize: 13, lineHeight: 1.6 }}>Et konkret spørgsmål? Vi er kun en mail eller et opkald væk.</p>
              <ul className="mt-7 space-y-5" style={{ fontSize: 14 }}>
                {directContacts.map(({ Icon, title, value }) => <li key={title} className="flex items-start gap-3"><Icon style={{ color: C.gold, width: 17, height: 17, marginTop: 2, flexShrink: 0 }} /><div><div style={{ color: "rgba(255,255,255,0.45)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 3 }}>{title}</div><div>{value}</div></div></li>)}
              </ul>
              <div className="mt-7 pt-5" style={{ borderTop: "1px solid rgba(255,255,255,0.14)", color: "rgba(255,255,255,0.7)", fontSize: 12 }}>Svar: <strong style={{ color: C.white }}>inden for én arbejdsdag</strong></div>
            </div>
          </aside>
        </div>
      </main>

      <footer className="px-5 sm:px-6" style={{ background: C.navy, color: C.white, paddingTop: 58, paddingBottom: 28 }} data-testid="kontakt-footer">
        <div className="mx-auto" style={{ maxWidth: 1120 }}>
          <div className="grid grid-cols-1 gap-10 md:grid-cols-3 md:gap-16">
            <div><div className="mb-4" style={{ color: "rgba(255,255,255,0.48)", fontSize: 11, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase" }}>Produkt</div><ul className="space-y-3">{[["Sådan virker det", "/boligpotentiale#how-it-works"], ["Eksempler", "/boligpotentiale/eksempler"], ["Priser", "/boligpotentiale#pricing"]].map(([title, href]) => <li key={href}><a href={href} style={{ color: "rgba(255,255,255,0.68)", fontSize: 14, textDecoration: "none" }}>{title}</a></li>)}</ul></div>
            <div><div className="mb-4" style={{ color: "rgba(255,255,255,0.48)", fontSize: 11, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase" }}>Hjælp</div><ul className="space-y-3">{[["FAQ", "/boligpotentiale#faq"], ["Kontakt", "/kontakt"], ["Privatlivspolitik", "/privatlivspolitik"], ["Handelsbetingelser", "/handelsbetingelser"]].map(([title, href]) => <li key={href}><a href={href} style={{ color: "rgba(255,255,255,0.68)", fontSize: 14, textDecoration: "none" }}>{title}</a></li>)}</ul></div>
            <div><div className="mb-4" style={{ color: "rgba(255,255,255,0.48)", fontSize: 11, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase" }}>Kom i gang</div><Link href="/opret" className="block text-center" style={{ background: C.gold, color: C.navy, padding: "13px 20px", borderRadius: 5, fontSize: 13, fontWeight: 700, textDecoration: "none" }} data-testid="kontakt-footer-cta">Opret konto</Link></div>
          </div>
          <div className="mt-12 flex flex-col items-center justify-between gap-5 sm:flex-row" style={{ borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 24 }}>
            <span style={{ color: "rgba(255,255,255,0.42)", fontSize: 12 }}>© {new Date().getFullYear()} Forma Estates · CVR: 46551796</span>
            <div className="flex items-center gap-5" data-testid="kontakt-footer-social"><a href="https://www.linkedin.com/in/frederik-fussing-nielsen-443790264/" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" style={{ color: "rgba(255,255,255,0.55)" }}><Linkedin size={19} strokeWidth={1.5} /></a><a href="https://www.facebook.com/profile.php?id=61592681127258" target="_blank" rel="noopener noreferrer" aria-label="Facebook" style={{ color: "rgba(255,255,255,0.55)" }}><Facebook size={19} strokeWidth={1.5} /></a><a href="https://instagram.com/formaestates" target="_blank" rel="noopener noreferrer" aria-label="Instagram" style={{ color: "rgba(255,255,255,0.55)" }}><Instagram size={19} strokeWidth={1.5} /></a></div>
          </div>
        </div>
      </footer>
    </div>
  );
}