import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, X, Trash2, Mail, Search, Clock,
  MessageSquare, Phone, Send, Check,
  Building2, AlertTriangle,
} from "lucide-react";
import { auth } from "@/lib/firebase";

// ── Auth fetch ─────────────────────────────────────────────────────────────────
async function cf(url: string, opts?: RequestInit) {
  const token = await auth.currentUser?.getIdToken();
  const headers: Record<string, string> = {
    ...(opts?.body ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const res = await fetch(url, { ...opts, headers });
  if (!res.ok) {
    const txt = await res.text();
    let msg = txt;
    try { msg = JSON.parse(txt).error ?? txt; } catch {}
    throw new Error(msg);
  }
  return res.json();
}

// ── Types ─────────────────────────────────────────────────────────────────────
export type Lang = "da" | "en";
type LeadStatus   = "new" | "contacted" | "responded" | "no" | "won";
type LeadCategory = "ejendomsmaegler" | "arkitekt" | "toemrerfirma" | "byggefirma" | "fotograf";

type Lead = {
  id: number;
  name: string;
  category: LeadCategory;
  instagram_handle?: string;
  email?: string;
  phone?: string;
  status: LeadStatus;
  notes?: string;
  first_contact_at?: string;
  follow_up_at?: string;
  follow_up_1_at?: string;
  follow_up_1_done?: boolean;
  follow_up_2_at?: string;
  follow_up_2_done?: boolean;
  last_contacted_at?: string;
  created_at: string;
  updated_at: string;
};

// ── Strings dictionary ─────────────────────────────────────────────────────────
const LV = {
  da: {
    months: ["jan","feb","mar","apr","maj","jun","jul","aug","sep","okt","nov","dec"] as string[],
    fmtDate:  (day: number, mo: string) => `${day}. ${mo}`,
    fmtDT:    (day: number, mo: string, hh: string, mm: string) => `${day}. ${mo} ${hh}:${mm}`,
    // Status labels
    statusNew: "Ny", statusContacted: "Kontaktet", statusResponded: "Svaret ✅",
    statusNo: "Nej", statusWon: "Vundet",
    statusNewOpt: "Ny", statusContactedOpt: "Kontaktet", statusRespondedOpt: "Svaret",
    // Category shorts
    catAgent: "Mægler", catArchitect: "Arkitekt", catCarpenter: "Tømrer", catBuilder: "Byggefirma", catPhotographer: "Fotograf",
    // Countdown
    cdToday: "I dag!", cdTomorrow: "I morgen",
    cdInDays: (d: number) => `om ${d}d`,
    cdOverDays: (d: number) => `${d}d over`,
    // Platforms
    pPhone: "Telefon", pMetaAd: "Meta annonce", pOther: "Andet",
    // FU dots tooltip
    fuDoneLabel: "Gjort ✓", fuNoDate: "ingen dato",
    // AddLeadForm
    newLead: "✚ Nyt lead",
    nameLabel: "Navn *", namePlaceholder: "Firmanavn eller person",
    categoryLabel: "Kategori", statusLabel: "Status", viaLabel: "Skrevet via",
    contactTimeLabel: "Kontaktet tidspunkt",
    emailLabel: "Email", instagramLabel: "Instagram", phoneLabel: "Telefon",
    noteLabel: "Note (valgfri)",
    notePlaceholder: "Fx: Autosvar, virkede interesseret, send demo-link...",
    cancel: "Annuller", addLeadBtn: "Tilføj lead",
    // FURow
    markDone: "Marker som gjort", markNotDone: "Marker som ikke gjort",
    followUpN: (n: number) => `Opfølgning ${n}`,
    fu1Sub: "2-3 dage efter første kontakt",
    fu2Sub: "1 uge efter opfølgning 1",
    // EditPanel
    fuPlan: "📅 Opfølgningsplan",
    fuHint: "Maks 2-3 gange — marker af når du har gjort det",
    bothFuDone: "Begge opfølgninger er gjort. Overvej at markere leadet som",
    rejWord: "Nej", wonWord: "Vundet", orWord: "eller",
    repliedToEmail: "Svaret på mail", logReplyToggle: "Registrér svar",
    whatReply: "Hvad svarede de?",
    noThanks: "Nej tak", wantMore: "Vil se mere", testing: "Tester",
    editOther: "✏️ Andet",
    writeReply: "Skriv hvad de svarede...",
    saveBtn: "Gem",
    repliedEmailBtn: "Svaret på mail — skriv hvad de svarede",
    whatReplyFull: "📩 Hvad svarede de?",
    respondedPlaceholder: "Fx: Interesseret, vil høre mere — på ferie til aug — brug for mere tid...",
    saveReply: "Gem svar",
    quickLog: "Hurtig log",
    emailSent: "Mail sendt", dmSent: "DM sendt", called: "Ringet op",
    editNameLabel: "Navn", editCatLabel: "Kategori", editStatusLabel: "Status",
    editEmailLabel: "Email", editIgLabel: "Instagram", editPhoneLabel: "Telefon",
    firstContactLabel: "Første kontakt",
    notesLabel: "Notater / log", notesPlaceholder: "Notater, logbog...",
    deleteLead: "Slet lead", sureQ: "Sikker?", yesDelete: "Ja, slet", noBtn: "Nej",
    closeBtn: "Luk", gemBtn: "Gem",
    // Log lines (embedded in notes DB field)
    logPrefix: (line: string) => `[${line}]`,
    fuCompleted: (n: number) => `✅ Opfølgning ${n} gennemført`,
    fuUndone:    (n: number) => `↩️ Opfølgning ${n} markeret som ikke gjort`,
    logEmailSent: "📧 Mail sendt",
    logDmSent:    "💬 Instagram DM sendt",
    logCalled:    "📞 Ringet op",
    logReplied:   (label: string, note: string) => `📩 Svarede: ${label}${note}`,
    logRepliedMail: (note: string) => `📩 Svaret på mail${note}`,
    // Detect reply in notes (both langs kept for resilience)
    replyPrefix: "📩 Svarede:",
    replyRegex: /📩 (?:Svarede|Replied):\s*(.+)/,
    // LeadsView
    leadsHeader: "Leads",
    overdueLabel: (n: number) => `${n} forfaldne opfølgninger`,
    searchPlaceholder: "Søg navn, email, note…",
    addLeadTopBtn: "Tilføj lead", closTopBtn: "Luk",
    allCatTab: (n: number) => `Alle (${n})`,
    tabAll: "Alle", tabActive: "Aktive", tabResponded: "Svaret ✅",
    tabReplied: "Besvaret mail 💬", tabNo: "Nej ✗",
    searchResults: (f: number, t: number) => `${f} af ${t} resultater`,
    loading: "Henter leads…",
    errorPrefix: "Fejl:", defaultError: "Fejl",
    errorFetch: "Kunne ikke hente leads",
    emptyAll: "Ingen leads endnu — tryk Tilføj lead",
    emptyFilter: "Ingen leads matcher søgning / filter",
    // Replied-filter note pattern (checks both langs)
    hasReplied: (notes: string | undefined) =>
      !!(notes?.includes("📩 Svarede:") || notes?.includes("📩 Replied:")),
  },
  en: {
    months: ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"] as string[],
    fmtDate:  (day: number, mo: string) => `${mo} ${day}`,
    fmtDT:    (day: number, mo: string, hh: string, mm: string) => `${mo} ${day} ${hh}:${mm}`,
    statusNew: "New", statusContacted: "Contacted", statusResponded: "Responded ✅",
    statusNo: "No", statusWon: "Won",
    statusNewOpt: "New", statusContactedOpt: "Contacted", statusRespondedOpt: "Responded",
    catAgent: "Agent", catArchitect: "Architect", catCarpenter: "Carpenter", catBuilder: "Builder", catPhotographer: "Photographer",
    cdToday: "Today!", cdTomorrow: "Tomorrow",
    cdInDays: (d: number) => `in ${d}d`,
    cdOverDays: (d: number) => `${d}d overdue`,
    pPhone: "Phone", pMetaAd: "Meta ad", pOther: "Other",
    fuDoneLabel: "Done ✓", fuNoDate: "no date",
    newLead: "✚ New lead",
    nameLabel: "Name *", namePlaceholder: "Company name or person",
    categoryLabel: "Category", statusLabel: "Status", viaLabel: "Contacted via",
    contactTimeLabel: "Contact time",
    emailLabel: "Email", instagramLabel: "Instagram", phoneLabel: "Phone",
    noteLabel: "Note (optional)",
    notePlaceholder: "E.g. Auto-reply, seemed interested, send demo link...",
    cancel: "Cancel", addLeadBtn: "Add lead",
    markDone: "Mark as done", markNotDone: "Mark as not done",
    followUpN: (n: number) => `Follow-up ${n}`,
    fu1Sub: "2-3 days after first contact",
    fu2Sub: "1 week after follow-up 1",
    fuPlan: "📅 Follow-up plan",
    fuHint: "Max 2-3 times — check off when done",
    bothFuDone: "Both follow-ups done. Consider marking the lead as",
    rejWord: "No", wonWord: "Won", orWord: "or",
    repliedToEmail: "Replied to email", logReplyToggle: "Log reply",
    whatReply: "What did they reply?",
    noThanks: "No thanks", wantMore: "Want to see more", testing: "Testing",
    editOther: "✏️ Other",
    writeReply: "Write what they replied...",
    saveBtn: "Save",
    repliedEmailBtn: "Replied to email — note what they said",
    whatReplyFull: "📩 What did they reply?",
    respondedPlaceholder: "E.g. Interested, wants to hear more — on vacation until Aug — needs more time...",
    saveReply: "Save reply",
    quickLog: "Quick log",
    emailSent: "Email sent", dmSent: "DM sent", called: "Called",
    editNameLabel: "Name", editCatLabel: "Category", editStatusLabel: "Status",
    editEmailLabel: "Email", editIgLabel: "Instagram", editPhoneLabel: "Phone",
    firstContactLabel: "First contact",
    notesLabel: "Notes / log", notesPlaceholder: "Notes, log...",
    deleteLead: "Delete lead", sureQ: "Sure?", yesDelete: "Yes, delete", noBtn: "No",
    closeBtn: "Close", gemBtn: "Save",
    logPrefix: (line: string) => `[${line}]`,
    fuCompleted: (n: number) => `✅ Follow-up ${n} completed`,
    fuUndone:    (n: number) => `↩️ Follow-up ${n} marked as not done`,
    logEmailSent: "📧 Email sent",
    logDmSent:    "💬 Instagram DM sent",
    logCalled:    "📞 Called",
    logReplied:   (label: string, note: string) => `📩 Replied: ${label}${note}`,
    logRepliedMail: (note: string) => `📩 Replied to email${note}`,
    replyPrefix: "📩 Replied:",
    replyRegex: /📩 (?:Svarede|Replied):\s*(.+)/,
    leadsHeader: "Leads",
    overdueLabel: (n: number) => `${n} overdue follow-ups`,
    searchPlaceholder: "Search name, email, note…",
    addLeadTopBtn: "Add lead", closTopBtn: "Close",
    allCatTab: (n: number) => `All (${n})`,
    tabAll: "All", tabActive: "Active", tabResponded: "Responded ✅",
    tabReplied: "Replied mail 💬", tabNo: "No ✗",
    searchResults: (f: number, t: number) => `${f} of ${t} results`,
    loading: "Loading leads…",
    errorPrefix: "Error:", defaultError: "Error",
    errorFetch: "Could not load leads",
    emptyAll: "No leads yet — press Add lead",
    emptyFilter: "No leads match search / filter",
    hasReplied: (notes: string | undefined) =>
      !!(notes?.includes("📩 Svarede:") || notes?.includes("📩 Replied:")),
  },
} as const;

type S = typeof LV["da"];

// ── Design tokens ─────────────────────────────────────────────────────────────
const AMBER    = "#C8956C";
const ROW      = "#1F2E3D";
const ROW_H    = "#2A3C4F";
const BORDER   = "rgba(255,255,255,0.10)";
const TEXT     = "#E2DAD0";
const MUTED    = "#8AAABB";
const INPUT_BG = "#16253380";

function getStatusCfg(s: S): Record<LeadStatus, { label: string; fg: string; bg: string; dot: string }> {
  return {
    new:       { label: s.statusNew,       fg: "#94A3B8", bg: "#1E293B", dot: "#64748B" },
    contacted: { label: s.statusContacted, fg: "#93C5FD", bg: "#1E3A8A", dot: "#3B82F6" },
    responded: { label: s.statusResponded, fg: "#86EFAC", bg: "#14532D", dot: "#22C55E" },
    no:        { label: s.statusNo,        fg: "#FCA5A5", bg: "#7F1D1D", dot: "#EF4444" },
    won:       { label: s.statusWon,       fg: "#FDE68A", bg: "#78350F", dot: "#F59E0B" },
  };
}

function getCatCfg(s: S): Record<LeadCategory, { short: string; emoji: string; color: string }> {
  return {
    ejendomsmaegler: { short: s.catAgent,        emoji: "🏠", color: "#60A5FA" },
    arkitekt:        { short: s.catArchitect,    emoji: "🏗️", color: "#A78BFA" },
    toemrerfirma:    { short: s.catCarpenter,    emoji: "🔨", color: "#FB923C" },
    byggefirma:      { short: s.catBuilder,      emoji: "🏢", color: "#34D399" },
    fotograf:        { short: s.catPhotographer, emoji: "📷", color: "#F472B6" },
  };
}

function getPlatforms(s: S) {
  return [
    { value: "instagram",    label: "💬 Instagram DM" },
    { value: "email",        label: "📧 Email" },
    { value: "telefon",      label: `📞 ${s.pPhone}` },
    { value: "linkedin",     label: "💼 LinkedIn" },
    { value: "meta_annonce", label: `📣 ${s.pMetaAd}` },
    { value: "andet",        label: `📌 ${s.pOther}` },
  ];
}

const STATUS_CYCLE: LeadStatus[] = ["new", "contacted", "responded", "no"];

// ── Helpers ───────────────────────────────────────────────────────────────────
function nextFU(lead: Lead): { at: string; n: 1 | 2 } | null {
  if (lead.status === "no" || lead.status === "won") return null;
  if (!lead.follow_up_1_done && lead.follow_up_1_at) return { at: lead.follow_up_1_at, n: 1 };
  if (!lead.follow_up_2_done && lead.follow_up_2_at) return { at: lead.follow_up_2_at, n: 2 };
  return null;
}

function urgencyColor(lead: Lead): string {
  if (lead.status === "won") return "#22C55E";
  if (lead.status === "no") return "#2d3f54";
  const fu = nextFU(lead);
  if (!fu) return "#22C55E";
  const diff = (new Date(fu.at).getTime() - Date.now()) / 864e5;
  if (diff < 1)  return "#EF4444";
  if (diff < 2)  return "#F59E0B";
  return "#22C55E";
}

function countdown(lead: Lead, s: S): { text: string; color: string; label: string; date: string } | null {
  if (lead.status === "won" || lead.status === "no") return null;
  const fu = nextFU(lead);
  if (!fu) return null;
  const diff = (new Date(fu.at).getTime() - Date.now()) / 864e5;
  const days = Math.round(diff);
  const label = `FU${fu.n}`;
  const date  = fmtDate(fu.at, s);
  if (diff < 0)  return { text: s.cdOverDays(Math.abs(days)), color: "#EF4444", label, date };
  if (diff < 1)  return { text: s.cdToday,                    color: "#EF4444", label, date };
  if (diff < 2)  return { text: s.cdTomorrow,                 color: "#F59E0B", label, date };
  return          { text: s.cdInDays(days),                   color: "#22C55E", label, date };
}

function lastReply(lead: Lead): string | null {
  if (!lead.notes) return null;
  // Match both Danish ("📩 Svarede:") and English ("📩 Replied:") log entries
  const lines = lead.notes.split("\n").filter(l => l.includes("📩 Svarede:") || l.includes("📩 Replied:"));
  if (!lines.length) return null;
  const m = lines[lines.length - 1].match(/📩 (?:Svarede|Replied):\s*(.+)/);
  return m ? m[1].trim() : null;
}

function fuDotColor(done: boolean, at?: string): string {
  if (done) return "#22C55E";
  if (!at)  return "#3A4F64";
  const diff = (new Date(at).getTime() - Date.now()) / 864e5;
  if (diff < 1) return "#EF4444";
  if (diff < 2) return "#F59E0B";
  return "#60A5FA";
}

function mkNow(s: S): string {
  const d  = new Date();
  const mo = s.months[d.getMonth()];
  return s.fmtDT(d.getDate(), mo, String(d.getHours()).padStart(2,"0"), String(d.getMinutes()).padStart(2,"0"));
}

function toLocal(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fmtDate(iso: string | undefined, s: S): string {
  if (!iso) return "–";
  const d  = new Date(iso);
  return s.fmtDate(d.getDate(), s.months[d.getMonth()]);
}

function fmtDT(iso: string | undefined, s: S): string {
  if (!iso) return "–";
  const d  = new Date(iso);
  return s.fmtDT(d.getDate(), s.months[d.getMonth()],
    String(d.getHours()).padStart(2,"0"), String(d.getMinutes()).padStart(2,"0"));
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const inp = (extra?: React.CSSProperties): React.CSSProperties => ({
  background: INPUT_BG,
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  color: TEXT,
  padding: "7px 10px",
  fontSize: 13,
  width: "100%",
  outline: "none",
  ...extra,
});

const lbl: React.CSSProperties = {
  color: MUTED,
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.07em",
  display: "block",
  marginBottom: 4,
};

// ── StatusBadge ───────────────────────────────────────────────────────────────
function StatusBadge({ status, s }: { status: LeadStatus; s: S }) {
  const cfg = getStatusCfg(s);
  const c = cfg[status];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      background: c.bg, color: c.fg,
      fontSize: 11, fontWeight: 700,
      padding: "3px 9px", borderRadius: 99,
      whiteSpace: "nowrap",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.dot, flexShrink: 0 }} />
      {c.label}
    </span>
  );
}

// ── CategoryPill ──────────────────────────────────────────────────────────────
function CategoryPill({ cat, s }: { cat: LeadCategory; s: S }) {
  const cfg = getCatCfg(s);
  const c = cfg[cat];
  return (
    <span style={{
      fontSize: 11, fontWeight: 600,
      color: c.color, background: `${c.color}18`,
      padding: "2px 8px", borderRadius: 99,
      whiteSpace: "nowrap",
    }}>
      {c.emoji} {c.short}
    </span>
  );
}

// ── FU progress dots ──────────────────────────────────────────────────────────
function FUDots({ lead, s }: { lead: Lead; s: S }) {
  if (lead.status === "no" || lead.status === "won") return null;
  const dots = [
    { done: !!lead.follow_up_1_done, at: lead.follow_up_1_at, label: "FU1" },
    { done: !!lead.follow_up_2_done, at: lead.follow_up_2_at, label: "FU2" },
  ];
  return (
    <div style={{ display: "flex", gap: 5, alignItems: "center", paddingRight: 8, flexShrink: 0 }}>
      {dots.map(({ done, at, label }) => {
        const col = fuDotColor(done, at);
        return (
          <div key={label} title={`${label}: ${done ? s.fuDoneLabel : at ? fmtDate(at, s) : s.fuNoDate}`}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <div style={{
              width: 9, height: 9, borderRadius: "50%",
              background: done ? col : "transparent",
              border: `2px solid ${col}`,
              flexShrink: 0,
            }} />
            <span style={{ fontSize: 8, color: col, fontWeight: 700, lineHeight: 1 }}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── AddLeadForm ───────────────────────────────────────────────────────────────
function AddLeadForm({ onClose, onAdd, s }: {
  onClose: () => void;
  onAdd: (body: Record<string, string>) => void;
  s: S;
}) {
  const now = toLocal(new Date().toISOString());
  const platforms = getPlatforms(s);
  const [name, setName]         = useState("");
  const [cat, setCat]           = useState<LeadCategory>("ejendomsmaegler");
  const [status, setStatus]     = useState<LeadStatus>("contacted");
  const [platform, setPlatform] = useState("instagram");
  const catCfg = getCatCfg(s);

  function handlePlatformChange(val: string) {
    setPlatform(val);
    if (val === "meta_annonce") setStatus("responded");
    else if (platform === "meta_annonce") setStatus("contacted");
  }
  const [dtLocal, setDtLocal]   = useState(now);
  const [email, setEmail]       = useState("");
  const [ig, setIg]             = useState("");
  const [phone, setPhone]       = useState("");
  const [notes, setNotes]       = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const ts = dtLocal ? new Date(dtLocal).toISOString() : new Date().toISOString();
    const platformLabel = platforms.find(p => p.value === platform)?.label ?? platform;
    const autoNote = `[${mkNow(s)}] ${platformLabel}`;
    const finalNotes = notes.trim() ? `${autoNote}\n${notes.trim()}` : autoNote;
    const body: Record<string, string> = {
      name: name.trim(), category: cat, status, notes: finalNotes, platform,
    };
    if (dtLocal) body.first_contact_at = ts;
    if (email.trim()) body.email = email.trim();
    if (ig.trim())    body.instagram_handle = ig.trim();
    if (phone.trim()) body.phone = phone.trim();
    onAdd(body);
  }

  return (
    <form onSubmit={submit} style={{
      background: "#1A2C3D", border: `1px solid ${AMBER}60`,
      borderRadius: 10, padding: 20, marginBottom: 12,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <span style={{ color: AMBER, fontWeight: 700, fontSize: 14 }}>{s.newLead}</span>
        <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: MUTED }}>
          <X size={16} />
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div>
          <label style={lbl}>{s.nameLabel}</label>
          <input style={inp()} value={name} onChange={e => setName(e.target.value)}
            placeholder={s.namePlaceholder} autoFocus required />
        </div>
        <div>
          <label style={lbl}>{s.categoryLabel}</label>
          <select style={inp({ cursor: "pointer" })} value={cat} onChange={e => setCat(e.target.value as LeadCategory)}>
            {(Object.entries(catCfg) as [LeadCategory, typeof catCfg[LeadCategory]][]).map(([k, v]) => (
              <option key={k} value={k}>{v.emoji} {v.short}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={lbl}>{s.statusLabel}</label>
          <select style={inp({ cursor: "pointer" })} value={status} onChange={e => setStatus(e.target.value as LeadStatus)}>
            <option value="new">{s.statusNewOpt}</option>
            <option value="contacted">{s.statusContactedOpt}</option>
            <option value="responded">{s.statusRespondedOpt}</option>
          </select>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div>
          <label style={lbl}>{s.viaLabel}</label>
          <select style={inp({ cursor: "pointer" })} value={platform} onChange={e => handlePlatformChange(e.target.value)}>
            {platforms.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>{s.contactTimeLabel}</label>
          <input style={inp()} type="datetime-local" value={dtLocal} onChange={e => setDtLocal(e.target.value)} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div>
          <label style={lbl}>{s.emailLabel}</label>
          <input style={inp()} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="firma@dk.dk" />
        </div>
        <div>
          <label style={lbl}>{s.instagramLabel}</label>
          <input style={inp()} value={ig} onChange={e => setIg(e.target.value)} placeholder="@handle" />
        </div>
        <div>
          <label style={lbl}>{s.phoneLabel}</label>
          <input style={inp()} value={phone} onChange={e => setPhone(e.target.value)} placeholder="+45 12 34 56 78" />
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={lbl}>{s.noteLabel}</label>
        <textarea
          style={inp({ resize: "vertical", minHeight: 56 })}
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder={s.notePlaceholder}
        />
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={onClose} style={inp({ width: "auto", cursor: "pointer", padding: "8px 18px", color: MUTED })}>
          {s.cancel}
        </button>
        <button type="submit" style={{
          background: AMBER, border: "none", borderRadius: 6,
          color: "#0F1D2F", padding: "8px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer",
        }}>
          {s.addLeadBtn}
        </button>
      </div>
    </form>
  );
}

// ── FURow ─────────────────────────────────────────────────────────────────────
type FUUrgency = "done" | "red" | "amber" | "ok" | "none";

function fuUrgency(done: boolean, at?: string): FUUrgency {
  if (done) return "done";
  if (!at)  return "none";
  const diff = (new Date(at).getTime() - Date.now()) / 864e5;
  if (diff < 1) return "red";
  if (diff < 2) return "amber";
  return "ok";
}

const FU_BG:     Record<FUUrgency, string> = { done:"#0E2A1A", red:"#2A110E", amber:"#2A1B08", ok:"#102030", none:"#102030" };
const FU_BORDER: Record<FUUrgency, string> = { done:"rgba(34,197,94,0.35)", red:"rgba(239,68,68,0.35)", amber:"rgba(245,158,11,0.35)", ok:"rgba(255,255,255,0.18)", none:"rgba(255,255,255,0.18)" };
const FU_COL:    Record<FUUrgency, string> = { done:"#22C55E", red:"#EF4444", amber:"#F59E0B", ok:"#60A5FA", none:MUTED };

function FURow({
  n, sublabel, done, at, onToggle, onChangeAt, s,
}: {
  n: 1 | 2; sublabel: string; done: boolean; at?: string;
  onToggle: () => void; onChangeAt: (iso: string | undefined) => void; s: S;
}) {
  const urg = fuUrgency(done, at);
  const col = FU_COL[urg];

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "10px 14px", background: FU_BG[urg], borderRadius: 8,
      border: `1px solid ${FU_BORDER[urg]}`, transition: "all 0.15s",
    }}>
      <button type="button" onClick={onToggle} style={{
        width: 22, height: 22, borderRadius: 5, flexShrink: 0,
        border: `2px solid ${col}`,
        background: done ? "#22C55E22" : "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", transition: "all 0.13s",
      }} aria-label={done ? s.markNotDone : s.markDone}>
        {done && <Check size={13} color="#22C55E" />}
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          color: done ? MUTED : TEXT, fontSize: 13, fontWeight: 600,
          textDecoration: done ? "line-through" : "none",
        }}>
          {s.followUpN(n)}
        </div>
        <div style={{ color: MUTED, fontSize: 10, marginTop: 1 }}>{sublabel}</div>
      </div>

      {at && (
        <span style={{
          fontSize: 11, fontWeight: 700, color: col,
          background: `${col}18`, padding: "2px 8px", borderRadius: 99,
          whiteSpace: "nowrap", flexShrink: 0,
        }}>
          {urg === "red" && !done ? "⚠ " : ""}
          {fmtDate(at, s)}
        </span>
      )}

      <input type="date"
        style={inp({ width: 140, fontSize: 12, flexShrink: 0, padding: "5px 8px" })}
        value={at ? at.slice(0, 10) : ""}
        onChange={e => {
          if (!e.target.value) { onChangeAt(undefined); return; }
          const existing = at ? at.slice(11, 16) : "12:00";
          onChangeAt(new Date(`${e.target.value}T${existing}`).toISOString());
        }}
      />
    </div>
  );
}

// ── EditPanel ─────────────────────────────────────────────────────────────────
function EditPanel({ lead, onSave, onQuickPatch, onDelete, onClose, s }: {
  lead: Lead;
  onSave:       (fields: Record<string, unknown>) => void;
  onQuickPatch: (fields: Record<string, unknown>) => void;
  onDelete:     () => void;
  onClose:      () => void;
  s: S;
}) {
  const catCfg = getCatCfg(s);
  const statusCfg = getStatusCfg(s);

  const [name, setName]     = useState(lead.name);
  const [cat, setCat]       = useState(lead.category);
  const [status, setStatus] = useState(lead.status);
  const [email, setEmail]   = useState(lead.email ?? "");
  const [ig, setIg]         = useState(lead.instagram_handle ?? "");
  const [phone, setPhone]   = useState(lead.phone ?? "");
  const [notes, setNotes]   = useState(lead.notes ?? "");
  const [fcLocal, setFcLocal] = useState(toLocal(lead.first_contact_at));

  const [fu1At, setFu1At]     = useState<string | undefined>(lead.follow_up_1_at);
  const [fu1Done, setFu1Done] = useState(!!lead.follow_up_1_done);
  const [fu2At, setFu2At]     = useState<string | undefined>(lead.follow_up_2_at);
  const [fu2Done, setFu2Done] = useState(!!lead.follow_up_2_done);

  const [confirmDel, setCDel] = useState(false);
  const [fuBusy, setFuBusy]   = useState(false);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  function appendLog(line: string, toNotes?: string): string {
    const base = toNotes ?? notes;
    return base ? `${base}\n[${mkNow(s)}] ${line}` : `[${mkNow(s)}] ${line}`;
  }

  function appendLogState(line: string) {
    const newNotes = appendLog(line);
    setNotes(newNotes);
    setTimeout(() => {
      if (notesRef.current) {
        notesRef.current.scrollTop = notesRef.current.scrollHeight;
        notesRef.current.focus();
      }
    }, 0);
  }

  function toggleFU(n: 1 | 2) {
    if (fuBusy) return;
    setFuBusy(true);
    const currentDone = n === 1 ? fu1Done : fu2Done;
    const newDone = !currentDone;
    if (n === 1) setFu1Done(newDone);
    else         setFu2Done(newDone);
    const logLine = newDone ? s.fuCompleted(n) : s.fuUndone(n);
    const updatedNotes = appendLog(logLine);
    setNotes(updatedNotes);
    onQuickPatch({
      [`follow_up_${n}_done`]: newDone,
      notes: updatedNotes,
      ...(newDone ? { last_contacted_at: new Date().toISOString() } : {}),
    });
    setTimeout(() => setFuBusy(false), 1200);
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      name, category: cat, status,
      email: email || null,
      instagram_handle: ig || null,
      phone: phone || null,
      notes: notes || null,
      first_contact_at: fcLocal ? new Date(fcLocal).toISOString() : null,
      follow_up_1_at: fu1At ?? null, follow_up_1_done: fu1Done,
      follow_up_2_at: fu2At ?? null, follow_up_2_done: fu2Done,
    });
  }

  const [respondedOpen, setRespondedOpen]   = useState(false);
  const [respondedNote, setRespondedNote]   = useState("");
  const respondedRef = useRef<HTMLInputElement>(null);

  const [replyOpen, setReplyOpen]             = useState(false);
  const [replyOtherActive, setReplyOtherActive] = useState(false);
  const [replyOtherText, setReplyOtherText]   = useState("");
  const replyOtherRef = useRef<HTMLInputElement>(null);

  function logReply(label: string, note?: string) {
    const notePart = note?.trim() ? `: ${note.trim()}` : "";
    const line = s.logReplied(label, notePart);
    const updatedNotes = appendLog(line);
    setNotes(updatedNotes);
    const patch: Record<string, unknown> = { notes: updatedNotes };
    if (label !== s.noThanks) {
      const inTwoDays = new Date(Date.now() + 2 * 864e5).toISOString();
      if (!fu1Done) { setFu1At(inTwoDays); patch.follow_up_1_at = inTwoDays; }
      else if (!fu2Done) { setFu2At(inTwoDays); patch.follow_up_2_at = inTwoDays; }
    }
    onQuickPatch(patch);
    setReplyOpen(false);
    setReplyOtherActive(false);
    setReplyOtherText("");
  }

  function markResponded(note: string) {
    setStatus("responded");
    setRespondedOpen(false);
    setRespondedNote("");
    const notePart = note.trim() ? `: ${note.trim()}` : "";
    const line = s.logRepliedMail(notePart);
    const updatedNotes = appendLog(line);
    setNotes(updatedNotes);
    onQuickPatch({ status: "responded", notes: updatedNotes });
  }

  const logBtns = [
    { icon: <Send size={12} />,         label: s.emailSent, log: s.logEmailSent },
    { icon: <MessageSquare size={12} />, label: s.dmSent,   log: s.logDmSent },
    { icon: <Phone size={12} />,         label: s.called,   log: s.logCalled },
  ];

  const replyOpts = [
    { icon: "🙅", label: s.noThanks },
    { icon: "👀", label: s.wantMore },
    { icon: "🧪", label: s.testing },
  ];

  return (
    <form onSubmit={save} onClick={e => e.stopPropagation()} style={{
      background: "#07111A", borderTop: `2px solid ${AMBER}`, padding: "16px 18px",
    }}>
      {/* ── Follow-up plan ── */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <label style={{ ...lbl, marginBottom: 0 }}>{s.fuPlan}</label>
          <span style={{ fontSize: 10, color: MUTED, fontStyle: "italic" }}>{s.fuHint}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <FURow n={1} sublabel={s.fu1Sub} done={fu1Done} at={fu1At}
            onToggle={() => toggleFU(1)} onChangeAt={setFu1At} s={s} />
          <FURow n={2} sublabel={s.fu2Sub} done={fu2Done} at={fu2At}
            onToggle={() => toggleFU(2)} onChangeAt={setFu2At} s={s} />
        </div>

        {fu1Done && fu2Done && (
          <div style={{
            marginTop: 6, fontSize: 11, color: "#F59E0B",
            background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)",
            borderRadius: 6, padding: "6px 10px",
          }}>
            {s.bothFuDone} <strong>{s.rejWord}</strong> {s.orWord} <strong>{s.wonWord}</strong>.
          </div>
        )}

        {/* ── Replied / respond section ── */}
        {status !== "won" && (
          <div style={{ marginTop: 8 }}>
            {status === "responded" ? (
              <div>
                <button type="button"
                  onClick={() => { setReplyOpen(v => !v); setReplyOtherActive(false); }}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                    background: "#0E2A1A", border: "1px solid rgba(34,197,94,0.3)",
                    borderRadius: replyOpen ? "8px 8px 0 0" : 8, padding: "9px 14px", cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Check size={14} color="#22C55E" />
                    <span style={{ color: "#86EFAC", fontSize: 12, fontWeight: 600 }}>{s.repliedToEmail}</span>
                  </div>
                  <span style={{ color: "#4ADE80", fontSize: 11 }}>
                    {s.logReplyToggle} {replyOpen ? "▲" : "▼"}
                  </span>
                </button>

                {replyOpen && (
                  <div style={{
                    background: "#071510", border: "1px solid rgba(34,197,94,0.25)",
                    borderTop: "none", borderRadius: "0 0 8px 8px", padding: "12px 14px",
                  }}>
                    <div style={{ color: MUTED, fontSize: 11, marginBottom: 8 }}>{s.whatReply}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {replyOpts.map(opt => (
                        <button key={opt.label} type="button" onClick={() => logReply(opt.label)}
                          style={{
                            background: "#132B1E", border: "1px solid rgba(34,197,94,0.3)",
                            borderRadius: 6, color: "#86EFAC",
                            padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                          }}>
                          {opt.icon} {opt.label}
                        </button>
                      ))}
                      <button type="button"
                        onClick={() => { setReplyOtherActive(v => !v); setTimeout(() => replyOtherRef.current?.focus(), 50); }}
                        style={{
                          background: replyOtherActive ? "#132B1E" : "#102030",
                          border: `1px solid ${replyOtherActive ? "rgba(34,197,94,0.4)" : "rgba(255,255,255,0.15)"}`,
                          borderRadius: 6,
                          color: replyOtherActive ? "#86EFAC" : TEXT,
                          padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                        }}>
                        {s.editOther}
                      </button>
                    </div>

                    {replyOtherActive && (
                      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                        <input ref={replyOtherRef} style={inp({ flex: 1, fontSize: 12 })}
                          placeholder={s.writeReply}
                          value={replyOtherText}
                          onChange={e => setReplyOtherText(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter" && replyOtherText.trim()) logReply(s.pOther, replyOtherText);
                            if (e.key === "Escape") setReplyOtherActive(false);
                          }}
                        />
                        <button type="button" onClick={() => logReply(s.pOther, replyOtherText)}
                          disabled={!replyOtherText.trim()}
                          style={{
                            background: replyOtherText.trim() ? "#22C55E" : "#1A2C1A",
                            border: "none", borderRadius: 6,
                            color: replyOtherText.trim() ? "#0a1a0a" : MUTED,
                            padding: "6px 16px", fontSize: 12, fontWeight: 700,
                            cursor: replyOtherText.trim() ? "pointer" : "not-allowed",
                          }}>
                          {s.saveBtn}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : !respondedOpen ? (
              <button type="button"
                onClick={() => { setRespondedOpen(true); setTimeout(() => respondedRef.current?.focus(), 50); }}
                style={{
                  width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  background: "rgba(34,197,94,0.12)", border: "1px dashed rgba(34,197,94,0.4)",
                  borderRadius: 8, color: "#4ADE80",
                  padding: "9px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer",
                }}>
                <Check size={13} /> {s.repliedEmailBtn}
              </button>
            ) : (
              <div style={{
                background: "#0E2A1A", border: "1px solid rgba(34,197,94,0.35)",
                borderRadius: 8, padding: "10px 14px",
              }}>
                <div style={{ color: "#86EFAC", fontSize: 11, fontWeight: 700, marginBottom: 6 }}>
                  {s.whatReplyFull}
                </div>
                <input ref={respondedRef} style={inp({ marginBottom: 8, fontSize: 13 })}
                  placeholder={s.respondedPlaceholder}
                  value={respondedNote}
                  onChange={e => setRespondedNote(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") markResponded(respondedNote); if (e.key === "Escape") setRespondedOpen(false); }}
                />
                <div style={{ display: "flex", gap: 6 }}>
                  <button type="button" onClick={() => markResponded(respondedNote)}
                    style={{
                      background: "#22C55E", border: "none", borderRadius: 6,
                      color: "#0a1a0a", padding: "6px 18px", fontSize: 12, fontWeight: 700, cursor: "pointer",
                    }}>
                    {s.saveReply}
                  </button>
                  <button type="button" onClick={() => setRespondedOpen(false)}
                    style={inp({ width: "auto", padding: "6px 12px", cursor: "pointer", color: MUTED })}>
                    {s.cancel}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Quick log ── */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ ...lbl, marginBottom: 8 }}>{s.quickLog}</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {logBtns.map(b => (
            <button key={b.log} type="button" onClick={() => appendLogState(b.log)}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                background: "#1c3254", border: `1px solid ${BORDER}`,
                borderRadius: 6, color: TEXT,
                padding: "5px 12px", fontSize: 12, cursor: "pointer",
              }}>
              {b.icon} {b.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Fields row 1 ── */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div>
          <label style={lbl}>{s.editNameLabel}</label>
          <input style={inp()} value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div>
          <label style={lbl}>{s.editCatLabel}</label>
          <select style={inp({ cursor: "pointer" })} value={cat} onChange={e => setCat(e.target.value as LeadCategory)}>
            {(Object.entries(catCfg) as [LeadCategory, typeof catCfg[LeadCategory]][]).map(([k, v]) => (
              <option key={k} value={k}>{v.emoji} {v.short}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={lbl}>{s.editStatusLabel}</label>
          <select style={inp({ cursor: "pointer" })} value={status} onChange={e => setStatus(e.target.value as LeadStatus)}>
            {(Object.entries(statusCfg) as [LeadStatus, typeof statusCfg[LeadStatus]][]).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={lbl}>{s.editEmailLabel}</label>
          <input style={inp()} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="firma@dk.dk" />
        </div>
      </div>

      {/* ── Fields row 2 ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div>
          <label style={lbl}>{s.editIgLabel}</label>
          <input style={inp()} value={ig} onChange={e => setIg(e.target.value)} placeholder="@handle" />
        </div>
        <div>
          <label style={lbl}>{s.editPhoneLabel}</label>
          <input style={inp()} value={phone} onChange={e => setPhone(e.target.value)} />
        </div>
        <div>
          <label style={lbl}>{s.firstContactLabel}</label>
          <input style={inp()} type="datetime-local" value={fcLocal} onChange={e => setFcLocal(e.target.value)} />
        </div>
      </div>

      {/* ── Notes ── */}
      <div style={{ marginBottom: 14 }}>
        <label style={lbl}>{s.notesLabel}</label>
        <textarea ref={notesRef}
          style={inp({ resize: "vertical", minHeight: 80, fontFamily: "inherit" })}
          value={notes} onChange={e => setNotes(e.target.value)}
          placeholder={s.notesPlaceholder}
        />
      </div>

      {/* ── Actions ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          {!confirmDel ? (
            <button type="button" onClick={() => setCDel(true)} style={{
              display: "flex", alignItems: "center", gap: 5,
              background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)",
              borderRadius: 6, color: "#FCA5A5",
              padding: "6px 14px", fontSize: 12, cursor: "pointer",
            }}>
              <Trash2 size={13} /> {s.deleteLead}
            </button>
          ) : (
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ color: MUTED, fontSize: 12 }}>{s.sureQ}</span>
              <button type="button" onClick={onDelete} style={{
                background: "#EF4444", border: "none", borderRadius: 6,
                color: "white", padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer",
              }}>{s.yesDelete}</button>
              <button type="button" onClick={() => setCDel(false)}
                style={inp({ width: "auto", cursor: "pointer", padding: "5px 12px", color: MUTED })}>
                {s.noBtn}
              </button>
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={onClose}
            style={inp({ width: "auto", cursor: "pointer", padding: "7px 16px", color: MUTED })}>
            {s.closeBtn}
          </button>
          <button type="submit" style={{
            background: AMBER, border: "none", borderRadius: 6,
            color: "#0F1D2F", padding: "7px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer",
          }}>
            {s.gemBtn}
          </button>
        </div>
      </div>
    </form>
  );
}

// ── LeadRow ───────────────────────────────────────────────────────────────────
function LeadRow({ lead, expanded, onClick, onCycle, onSave, onQuickPatch, onDelete, onCollapse, s }: {
  lead: Lead; expanded: boolean;
  onClick: () => void; onCycle: (e: React.MouseEvent) => void;
  onSave: (f: Record<string, unknown>) => void;
  onQuickPatch: (f: Record<string, unknown>) => void;
  onDelete: () => void; onCollapse: () => void;
  s: S;
}) {
  const [hov, setHov] = useState(false);
  const urg           = urgencyColor(lead);
  const cd            = countdown(lead, s);
  const statusCfg     = getStatusCfg(s);
  const next          = STATUS_CYCLE[(STATUS_CYCLE.indexOf(lead.status) + 1) % STATUS_CYCLE.length];
  const nextCfg       = statusCfg[next];

  return (
    <div style={{
      borderRadius: 8, marginBottom: 3, overflow: "hidden",
      border: expanded ? `1px solid ${AMBER}55` : `1px solid transparent`,
    }}>
      <div onClick={onClick}
        onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
        style={{
          display: "flex", alignItems: "center", gap: 0,
          background: hov || expanded ? ROW_H : ROW,
          cursor: "pointer", transition: "background 0.12s",
          borderRadius: expanded ? "8px 8px 0 0" : 8, minHeight: 42,
        }}
      >
        <div style={{ width: 5, alignSelf: "stretch", background: urg, flexShrink: 0, borderRadius: "8px 0 0 8px" }} />

        <div style={{ padding: "8px 12px", minWidth: 0, flex: "0 0 190px" }}>
          <div style={{ color: TEXT, fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {lead.name}
          </div>
          {lead.instagram_handle && (
            <div style={{ color: MUTED, fontSize: 10 }}>@{lead.instagram_handle.replace(/^@/, "")}</div>
          )}
        </div>

        <div style={{ flex: "0 0 auto", paddingRight: 10 }}>
          <CategoryPill cat={lead.category} s={s} />
        </div>

        <div style={{ flex: "0 0 auto", paddingRight: 10 }}>
          <StatusBadge status={lead.status} s={s} />
        </div>

        <FUDots lead={lead} s={s} />

        {cd && (
          <div style={{ flex: "0 0 auto", paddingRight: 10 }}>
            <span style={{
              fontSize: 12, fontWeight: 700,
              color: cd.color, background: `${cd.color}20`,
              border: `1px solid ${cd.color}40`,
              padding: "3px 10px", borderRadius: 99,
              display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap",
            }}>
              <Clock size={11} />
              <span style={{ opacity: 0.75 }}>{cd.label}</span>
              <span>·</span>
              <span>{cd.date}</span>
              <span style={{ opacity: 0.75 }}>·</span>
              <span>{cd.text}</span>
            </span>
          </div>
        )}

        {lead.first_contact_at && (
          <div style={{ flex: "0 0 auto", paddingRight: 10 }}>
            <span style={{ color: MUTED, fontSize: 11, whiteSpace: "nowrap" }}>{fmtDT(lead.first_contact_at, s)}</span>
          </div>
        )}

        {(() => {
          const reply = lastReply(lead);
          if (!reply) return null;
          // Detect reply type from both Danish and English keywords
          const replyColor =
            (reply.startsWith("Nej tak") || reply.startsWith("No thanks"))     ? "#EF4444" :
            (reply.startsWith("Vil se mere") || reply.startsWith("Want to see")) ? "#60A5FA" :
            (reply.startsWith("Tester") || reply.startsWith("Testing"))         ? "#A78BFA" :
            "#F59E0B";
          return (
            <div style={{ flex: "0 0 auto", paddingRight: 10 }}>
              <span style={{
                fontSize: 11, fontWeight: 700,
                color: replyColor, background: `${replyColor}18`,
                border: `1px solid ${replyColor}35`,
                padding: "2px 9px", borderRadius: 99, whiteSpace: "nowrap",
                display: "inline-flex", alignItems: "center", gap: 4,
              }}>
                💬 {reply.length > 30 ? reply.slice(0, 28) + "…" : reply}
              </span>
            </div>
          );
        })()}

        {lead.email && !lastReply(lead) && (
          <a href={`mailto:${lead.email}`} onClick={e => e.stopPropagation()}
            style={{ color: "#60A5FA", fontSize: 12, textDecoration: "none", display: "flex", alignItems: "center", gap: 4, flexShrink: 0, paddingRight: 10 }}>
            <Mail size={11} />
            <span style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lead.email}</span>
          </a>
        )}

        {lead.notes && !lead.email && !lastReply(lead) && (
          <span style={{ color: MUTED, fontSize: 11, fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
            {lead.notes.replace(/\[.*?\]\s*/g, "").slice(0, 70)}
          </span>
        )}

        <div style={{ flex: 1 }} />

        <div onClick={e => e.stopPropagation()}
          style={{ display: "flex", alignItems: "center", gap: 6, paddingRight: 12, opacity: hov || expanded ? 1 : 0, transition: "opacity 0.15s", flexShrink: 0 }}>
          {lead.status !== "won" && (
            <button onClick={onCycle}
              style={{
                display: "flex", alignItems: "center", gap: 4,
                background: nextCfg.bg, border: `1px solid ${nextCfg.dot}50`,
                borderRadius: 5, color: nextCfg.fg,
                padding: "4px 9px", fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
              }}>
              → {nextCfg.label}
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <EditPanel lead={lead} onSave={onSave} onQuickPatch={onQuickPatch}
          onDelete={onDelete} onClose={onCollapse} s={s} />
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function LeadsView({ lang = "da" }: { lang?: Lang }) {
  const s   = LV[lang] as S;
  const qc  = useQueryClient();
  const catCfg = getCatCfg(s);

  const [showAdd, setShowAdd]     = useState(false);
  const [expanded, setExpanded]   = useState<number | null>(null);
  const [catFilter, setCatFilter] = useState<LeadCategory | "alle">("alle");
  const [stFilter, setStFilter]   = useState<"alle" | "aktive" | "svaret" | "besvaret" | "nej">("alle");
  const [search, setSearch]       = useState("");

  const { data: leads = [], isLoading, isError, error } = useQuery<Lead[]>({
    queryKey: ["leads"],
    queryFn: () => cf("/api/leads"),
  });

  const addM = useMutation({
    mutationFn: (body: Record<string, string>) =>
      cf("/api/leads", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leads"] }); setShowAdd(false); },
  });

  const patchM = useMutation({
    mutationFn: ({ id, fields }: { id: number; fields: Record<string, unknown> }) =>
      cf(`/api/leads/${id}`, { method: "PATCH", body: JSON.stringify(fields) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leads"] }); setExpanded(null); },
  });

  const quickM = useMutation({
    mutationFn: ({ id, fields }: { id: number; fields: Record<string, unknown> }) =>
      cf(`/api/leads/${id}`, { method: "PATCH", body: JSON.stringify(fields) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leads"] }); },
  });

  const delM = useMutation({
    mutationFn: (id: number) => cf(`/api/leads/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leads"] }); setExpanded(null); },
  });

  // ── Filters ───────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = leads.filter(l => {
      if (catFilter !== "alle" && l.category !== catFilter) return false;
      if (stFilter === "aktive"   && (l.status === "no" || l.status === "won" || l.status === "responded")) return false;
      if (stFilter === "svaret"   && l.status !== "responded") return false;
      if (stFilter === "besvaret" && !s.hasReplied(l.notes)) return false;
      if (stFilter === "nej"      && l.status !== "no") return false;
      if (q) {
        const hay = [l.name, l.email, l.instagram_handle, l.notes, l.phone].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    if (stFilter === "aktive" || stFilter === "alle") {
      list.sort((a, b) => {
        const score = (l: Lead) => {
          const fu = nextFU(l);
          if (!fu) return 1e9;
          return (new Date(fu.at).getTime() - Date.now()) / 864e5;
        };
        return score(a) - score(b);
      });
    }
    return list;
  }, [leads, catFilter, stFilter, search, s]);

  const catCounts = useMemo(() =>
    leads.reduce<Record<string, number>>((a, l) => { a[l.category] = (a[l.category] ?? 0) + 1; return a; }, {}),
  [leads]);

  const stCounts = useMemo(() => {
    const base = catFilter === "alle" ? leads : leads.filter(l => l.category === catFilter);
    return {
      alle:      base.length,
      aktive:    base.filter(l => l.status !== "no" && l.status !== "won" && l.status !== "responded").length,
      svaret:    base.filter(l => l.status === "responded").length,
      besvaret:  base.filter(l => s.hasReplied(l.notes)).length,
      nej:       base.filter(l => l.status === "no").length,
    };
  }, [leads, catFilter, s]);

  const overdue = leads.filter(l => {
    const fu = nextFU(l);
    return fu && new Date(fu.at).getTime() < Date.now();
  }).length;

  const tab = (active: boolean): React.CSSProperties => ({
    background: active ? `${AMBER}22` : "transparent",
    border: active ? `1px solid ${AMBER}55` : `1px solid transparent`,
    borderRadius: 6, cursor: "pointer",
    fontSize: 12, fontWeight: active ? 700 : 400,
    color: active ? AMBER : MUTED,
    padding: "5px 12px", whiteSpace: "nowrap", transition: "all 0.13s",
  });

  const stTabs: [typeof stFilter, string][] = [
    ["alle",      s.tabAll],
    ["aktive",    s.tabActive],
    ["svaret",    s.tabResponded],
    ["besvaret",  s.tabReplied],
    ["nej",       s.tabNo],
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexShrink: 0, flexWrap: "wrap" }}>
        <span style={{ color: TEXT, fontSize: 18, fontWeight: 800, letterSpacing: "-0.3px" }}>{s.leadsHeader}</span>
        <span style={{ background: `${AMBER}22`, color: AMBER, fontSize: 12, fontWeight: 700, padding: "2px 10px", borderRadius: 99 }}>
          {leads.length}
        </span>
        {overdue > 0 && (
          <span style={{ background: "rgba(239,68,68,0.2)", color: "#FCA5A5", fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 99, display: "flex", alignItems: "center", gap: 4 }}>
            <AlertTriangle size={11} /> {s.overdueLabel(overdue)}
          </span>
        )}

        <div style={{ position: "relative", flex: 1, minWidth: 180, maxWidth: 340 }}>
          <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: MUTED, pointerEvents: "none" }} />
          <input style={inp({ paddingLeft: 30, width: "100%" })}
            placeholder={s.searchPlaceholder}
            value={search} onChange={e => setSearch(e.target.value)} />
          {search && (
            <button onClick={() => setSearch("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: MUTED, padding: 0 }}>
              <X size={12} />
            </button>
          )}
        </div>

        <div style={{ marginLeft: "auto" }}>
          <button onClick={() => setShowAdd(v => !v)}
            style={{
              background: showAdd ? "rgba(200,149,108,0.15)" : AMBER,
              border: showAdd ? `1px solid ${AMBER}` : "none",
              borderRadius: 7, cursor: "pointer",
              color: showAdd ? AMBER : "#0F1D2F",
              padding: "8px 16px", fontSize: 13, fontWeight: 700,
              display: "flex", alignItems: "center", gap: 6,
            }}>
            {showAdd ? <X size={14} /> : <Plus size={14} />}
            {showAdd ? s.closTopBtn : s.addLeadTopBtn}
          </button>
        </div>
      </div>

      {/* ── Category tabs ── */}
      <div style={{ display: "flex", gap: 4, marginBottom: 8, flexShrink: 0, flexWrap: "wrap" }}>
        <button style={tab(catFilter === "alle")} onClick={() => setCatFilter("alle")}>
          {s.allCatTab(leads.length)}
        </button>
        {(Object.entries(catCfg) as [LeadCategory, typeof catCfg[LeadCategory]][]).map(([k, v]) => (
          <button key={k} style={tab(catFilter === k)} onClick={() => setCatFilter(k)}>
            {v.emoji} {v.short} ({catCounts[k] ?? 0})
          </button>
        ))}
      </div>

      {/* ── Status filter ── */}
      <div style={{ display: "flex", gap: 4, marginBottom: 12, flexShrink: 0, paddingBottom: 12, borderBottom: `1px solid ${BORDER}` }}>
        {stTabs.map(([v, label]) => (
          <button key={v} style={tab(stFilter === v)} onClick={() => setStFilter(v)}>
            {label} <span style={{ opacity: 0.65, fontWeight: 400 }}>({stCounts[v]})</span>
          </button>
        ))}
        {search && (
          <span style={{ color: MUTED, fontSize: 12, alignSelf: "center", marginLeft: 6 }}>
            {s.searchResults(filtered.length, leads.length)}
          </span>
        )}
      </div>

      {/* ── Add form ── */}
      {showAdd && (
        <AddLeadForm onClose={() => setShowAdd(false)} onAdd={body => addM.mutate(body)} s={s} />
      )}

      {/* ── Lead list ── */}
      <div style={{ flexGrow: 1, overflowY: "auto", paddingRight: 2 }}>
        {isLoading && (
          <div style={{ color: MUTED, fontSize: 13, padding: 24, textAlign: "center" }}>{s.loading}</div>
        )}
        {isError && (
          <div style={{ color: "#FCA5A5", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: 14, fontSize: 13 }}>
            {s.errorPrefix} {(error as Error)?.message ?? s.errorFetch}
          </div>
        )}
        {!isLoading && !isError && filtered.length === 0 && (
          <div style={{ color: MUTED, fontSize: 13, padding: 40, textAlign: "center" }}>
            {leads.length === 0 ? s.emptyAll : s.emptyFilter}
          </div>
        )}
        {filtered.map(lead => (
          <LeadRow key={lead.id} lead={lead} expanded={expanded === lead.id}
            onClick={() => setExpanded(p => p === lead.id ? null : lead.id)}
            onCycle={e => {
              e.stopPropagation();
              const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(lead.status)+1) % STATUS_CYCLE.length];
              quickM.mutate({ id: lead.id, fields: { status: next } });
            }}
            onSave={fields => patchM.mutate({ id: lead.id, fields })}
            onQuickPatch={fields => quickM.mutate({ id: lead.id, fields })}
            onDelete={() => delM.mutate(lead.id)}
            onCollapse={() => setExpanded(null)}
            s={s}
          />
        ))}
      </div>

      {/* ── Error toast ── */}
      {(addM.isError || patchM.isError || delM.isError) && (
        <div style={{ position: "fixed", bottom: 20, right: 20, background: "#EF4444", color: "white", padding: "10px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, zIndex: 9999 }}>
          {((addM.error || patchM.error || delM.error) as Error)?.message ?? s.defaultError}
        </div>
      )}
    </div>
  );
}
