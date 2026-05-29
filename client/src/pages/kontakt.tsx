import { useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, Mail, Phone, MapPin, Clock, CheckCircle2, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import formaEstatesLogo from "@assets/forma-estates-logo.png";

const C = {
  navy: "#0F1923",
  gold: "#C9A96E",
  goldHover: "#B8985D",
  goldBorder: "rgba(201,169,110,0.45)",
  champagne: "#E8DFD0",
  warm: "#FAF6EC",
  white: "#FFFFFF",
  text: "#1F2A37",
  muted: "#6B7280",
  border: "rgba(15,25,35,0.12)",
};
const SERIF = "'Playfair Display', Georgia, serif";
const SANS = "'Inter', system-ui, -apple-system, sans-serif";

const TOPICS = [
  "Demo og rundvisning",
  "Priser og pakker",
  "Samarbejde / partnerskab",
  "Teknisk spørgsmål",
  "Andet",
];

const TEAM_SIZES = ["1 (selvstændig)", "2–5", "6–15", "16–50", "50+"];

const ROLES = [
  "Ejendomsmægler",
  "Indehaver / Partner",
  "Marketingansvarlig",
  "Fotograf / Stylist",
  "Andet",
];

export default function KontaktPage() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    role: "",
    teamSize: "",
    topic: "",
    message: "",
    consent: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.consent) { setError("Du skal acceptere, at vi må kontakte dig."); return; }
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

  const input: React.CSSProperties = {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 8,
    border: `1px solid ${C.border}`,
    background: C.white,
    fontSize: 14,
    fontFamily: SANS,
    color: C.text,
    outline: "none",
  };

  const label: React.CSSProperties = {
    display: "block",
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: C.navy,
    marginBottom: 8,
  };

  return (
    <div style={{ minHeight: "100vh", background: C.warm, fontFamily: SANS, color: C.text }}>
      {/* Header */}
      <header style={{ background: C.champagne, borderBottom: `1px solid ${C.border}` }}>
        <div className="mx-auto flex items-center justify-between px-6" style={{ maxWidth: 1280, height: 110 }}>
          <Link href="/" data-testid="kontakt-logo-link">
            <img src={formaEstatesLogo} alt="Forma Estates" className="w-auto cursor-pointer" style={{ height: 92 }} />
          </Link>
          <Link href="/" data-testid="kontakt-back">
            <button
              className="flex items-center gap-2 transition-colors"
              style={{ padding: "10px 20px", borderRadius: 8, border: `1px solid ${C.navy}`, color: C.navy, fontSize: 13, fontWeight: 500, background: "transparent" }}
            >
              <ArrowLeft className="w-4 h-4" /> Tilbage til forsiden
            </button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section style={{ background: C.warm, paddingTop: 64, paddingBottom: 24 }} className="px-6">
        <div className="mx-auto" style={{ maxWidth: 1080 }}>
          <div className="uppercase" style={{ color: C.gold, fontSize: 12, fontWeight: 600, letterSpacing: "0.18em" }}>Kontakt os</div>
          <h1 className="mt-3" style={{ fontFamily: SERIF, color: C.navy, fontSize: "clamp(34px, 5vw, 54px)", fontWeight: 500, lineHeight: 1.1, letterSpacing: "-0.01em" }}>
            Lad os tale om jeres næste salg.
          </h1>
          <p className="mt-4" style={{ color: C.muted, fontSize: 17, lineHeight: 1.6, maxWidth: 640 }}>
            Skriv hvad du har på hjerte — om det er en demo, et tilbud til kontoret, eller bare et godt spørgsmål. Vi vender tilbage inden for én arbejdsdag.
          </p>
        </div>
      </section>

      {/* Body grid */}
      <section style={{ paddingTop: 36, paddingBottom: 96 }} className="px-6">
        <div className="mx-auto grid lg:grid-cols-[1fr_360px] gap-10" style={{ maxWidth: 1080 }}>
          {/* Form card */}
          <motion.form
            onSubmit={onSubmit}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 32, boxShadow: "0 12px 36px -18px rgba(15,25,35,0.18)" }}
            data-testid="kontakt-form"
          >
            {done ? (
              <div className="text-center py-10" data-testid="kontakt-success">
                <div className="inline-flex items-center justify-center mb-5" style={{ width: 72, height: 72, borderRadius: "50%", background: C.warm, border: `1px solid ${C.goldBorder}` }}>
                  <CheckCircle2 className="w-9 h-9" style={{ color: C.gold }} />
                </div>
                <h2 style={{ fontFamily: SERIF, color: C.navy, fontSize: 28, fontWeight: 500 }}>Tak — vi har modtaget din besked.</h2>
                <p className="mt-3 mx-auto" style={{ color: C.muted, fontSize: 15, lineHeight: 1.6, maxWidth: 420 }}>
                  Du modtager en bekræftelse på <strong style={{ color: C.navy }}>{form.email}</strong> om et øjeblik. Vi vender tilbage inden for én arbejdsdag.
                </p>
                <Link href="/">
                  <button
                    type="button"
                    className="mt-8"
                    style={{ padding: "12px 26px", borderRadius: 8, background: C.navy, color: C.white, fontSize: 13, fontWeight: 600 }}
                    data-testid="kontakt-back-home"
                  >
                    Tilbage til forsiden
                  </button>
                </Link>
              </div>
            ) : (
              <>
                <div className="grid sm:grid-cols-2 gap-5">
                  <div>
                    <label style={label}>Navn *</label>
                    <input style={input} value={form.name} onChange={(e) => update("name", e.target.value)} required data-testid="input-name" />
                  </div>
                  <div>
                    <label style={label}>E-mail *</label>
                    <input style={input} type="email" value={form.email} onChange={(e) => update("email", e.target.value)} required data-testid="input-email" />
                  </div>
                  <div>
                    <label style={label}>Telefon</label>
                    <input style={input} type="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)} data-testid="input-phone" />
                  </div>
                  <div>
                    <label style={label}>Firma / Mæglerkæde</label>
                    <input style={input} value={form.company} onChange={(e) => update("company", e.target.value)} data-testid="input-company" />
                  </div>
                  <div>
                    <label style={label}>Rolle</label>
                    <select style={input} value={form.role} onChange={(e) => update("role", e.target.value)} data-testid="select-role">
                      <option value="">Vælg…</option>
                      {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={label}>Antal medarbejdere</label>
                    <select style={input} value={form.teamSize} onChange={(e) => update("teamSize", e.target.value)} data-testid="select-team-size">
                      <option value="">Vælg…</option>
                      {TEAM_SIZES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>

                <div className="mt-5">
                  <label style={label}>Hvad handler din henvendelse om?</label>
                  <div className="flex flex-wrap gap-2">
                    {TOPICS.map((t) => {
                      const active = form.topic === t;
                      return (
                        <button
                          type="button"
                          key={t}
                          onClick={() => update("topic", active ? "" : t)}
                          style={{
                            padding: "8px 14px",
                            borderRadius: 999,
                            border: `1px solid ${active ? C.navy : C.border}`,
                            background: active ? C.navy : C.white,
                            color: active ? C.white : C.navy,
                            fontSize: 13,
                            fontWeight: 500,
                            transition: "all 0.15s",
                          }}
                          data-testid={`chip-topic-${t}`}
                        >
                          {t}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-5">
                  <label style={label}>Besked *</label>
                  <textarea
                    style={{ ...input, minHeight: 160, resize: "vertical", lineHeight: 1.55 }}
                    placeholder="Skriv frit — hvad ønsker du hjælp til? Antal boliger, deadlines, særlige ønsker…"
                    value={form.message}
                    onChange={(e) => update("message", e.target.value)}
                    required
                    data-testid="input-message"
                  />
                </div>

                <label className="mt-5 flex items-start gap-3 cursor-pointer" style={{ color: C.muted, fontSize: 13, lineHeight: 1.5 }}>
                  <input
                    type="checkbox"
                    checked={form.consent}
                    onChange={(e) => update("consent", e.target.checked)}
                    style={{ marginTop: 3, accentColor: C.navy }}
                    data-testid="checkbox-consent"
                  />
                  <span>Jeg accepterer, at Forma Estates må kontakte mig på de oplyste kontaktdata. Vi videregiver aldrig data til tredjepart.</span>
                </label>

                {error && (
                  <div className="mt-4" style={{ background: "#FDECEC", border: "1px solid #F5C6C6", color: "#9B1C1C", padding: "10px 14px", borderRadius: 8, fontSize: 13 }} data-testid="text-error">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="mt-6 w-full flex items-center justify-center gap-2 transition-colors hover:bg-[color:var(--gold-h)]"
                  style={{ ['--gold-h' as any]: C.goldHover, background: C.gold, color: C.navy, padding: "14px 28px", borderRadius: 8, fontSize: 14, fontWeight: 600, opacity: submitting ? 0.7 : 1 }}
                  data-testid="button-submit"
                >
                  {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Sender…</> : "Send besked"}
                </button>
              </>
            )}
          </motion.form>

          {/* Side panel */}
          <aside className="space-y-6">
            <div style={{ background: C.navy, color: C.white, borderRadius: 12, padding: 28 }}>
              <div className="uppercase" style={{ color: C.gold, fontSize: 11, fontWeight: 600, letterSpacing: "0.18em" }}>Direkte kontakt</div>
              <h3 className="mt-2" style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 500 }}>Vi er klar til at hjælpe.</h3>
              <ul className="mt-5 space-y-4" style={{ fontSize: 14 }}>
                <li className="flex items-start gap-3">
                  <Mail className="w-4 h-4 mt-1" style={{ color: C.gold }} />
                  <div>
                    <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>E-mail</div>
                    <a href="mailto:kontakt@formaestates.dk" className="hover:underline" style={{ color: C.white }} data-testid="link-email">kontakt@formaestates.dk</a>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <Phone className="w-4 h-4 mt-1" style={{ color: C.gold }} />
                  <div>
                    <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>Telefon</div>
                    <a href="tel:+4570707070" className="hover:underline" style={{ color: C.white }} data-testid="link-phone">+45 70 70 70 70</a>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <Clock className="w-4 h-4 mt-1" style={{ color: C.gold }} />
                  <div>
                    <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>Åbningstid</div>
                    <div>Man–fre · 8:00–19:00</div>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <MapPin className="w-4 h-4 mt-1" style={{ color: C.gold }} />
                  <div>
                    <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>Lokation</div>
                    <div>København · Danmark</div>
                  </div>
                </li>
              </ul>
            </div>

            <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24 }}>
              <h4 style={{ fontFamily: SERIF, color: C.navy, fontSize: 18, fontWeight: 500 }}>Svartider</h4>
              <p className="mt-2" style={{ color: C.muted, fontSize: 13, lineHeight: 1.6 }}>
                Vi besvarer alle henvendelser inden for <strong style={{ color: C.navy }}>én arbejdsdag</strong>. Demoaftaler bookes typisk samme uge.
              </p>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
