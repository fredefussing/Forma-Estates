import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, X, Trash2, Mail, Search, Clock,
  MessageSquare, Phone, Send, ChevronDown,
  Building2, Check, AlertTriangle,
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
type LeadStatus = "new" | "contacted" | "responded" | "no" | "won";
type LeadCategory = "ejendomsmaegler" | "arkitekt" | "toemrerfirma" | "byggefirma";

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
  last_contacted_at?: string;
  created_at: string;
  updated_at: string;
};

// ── Design tokens ─────────────────────────────────────────────────────────────
const AMBER    = "#C8956C";
const ROW      = "#1F2E3D";
const ROW_H    = "#2A3C4F";
const BORDER   = "rgba(255,255,255,0.10)";
const TEXT     = "#E2DAD0";
const MUTED    = "#8AAABB";
const INPUT_BG = "#16253380";

const STATUS_CFG: Record<LeadStatus, { label: string; fg: string; bg: string; dot: string }> = {
  new:       { label: "Ny",        fg: "#94A3B8", bg: "#1E293B", dot: "#64748B" },
  contacted: { label: "Kontaktet", fg: "#93C5FD", bg: "#1E3A8A", dot: "#3B82F6" },
  responded: { label: "Svaret",    fg: "#86EFAC", bg: "#14532D", dot: "#22C55E" },
  no:        { label: "Nej",       fg: "#FCA5A5", bg: "#7F1D1D", dot: "#EF4444" },
  won:       { label: "Vundet",    fg: "#FDE68A", bg: "#78350F", dot: "#F59E0B" },
};

const CAT_CFG: Record<LeadCategory, { short: string; emoji: string; color: string }> = {
  ejendomsmaegler: { short: "Mægler",    emoji: "🏠", color: "#60A5FA" },
  arkitekt:        { short: "Arkitekt",  emoji: "🏗️", color: "#A78BFA" },
  toemrerfirma:    { short: "Tømrer",    emoji: "🔨", color: "#FB923C" },
  byggefirma:      { short: "Byggefirma",emoji: "🏢", color: "#34D399" },
};

const PLATFORMS = [
  { value: "instagram", label: "💬 Instagram DM" },
  { value: "email",     label: "📧 Email" },
  { value: "telefon",   label: "📞 Telefon" },
  { value: "linkedin",  label: "💼 LinkedIn" },
  { value: "andet",     label: "📌 Andet" },
];

const STATUS_CYCLE: LeadStatus[] = ["new", "contacted", "responded", "no"];

// ── Helpers ───────────────────────────────────────────────────────────────────
function urgencyColor(lead: Lead): string {
  if (lead.status === "no" || lead.status === "won") return "#2d3f54";
  if (!lead.follow_up_at) return "#2d3f54";
  const diff = (new Date(lead.follow_up_at).getTime() - Date.now()) / 864e5;
  if (diff < 0)  return "#EF4444";
  if (diff < 2)  return "#F59E0B";
  return "#22C55E";
}

function countdown(lead: Lead): { text: string; color: string } | null {
  if (!lead.follow_up_at || lead.status === "no" || lead.status === "won") return null;
  const days = Math.round((new Date(lead.follow_up_at).getTime() - Date.now()) / 864e5);
  if (days < 0)  return { text: `${Math.abs(days)}d over`,  color: "#EF4444" };
  if (days === 0) return { text: "I dag!",                   color: "#F59E0B" };
  if (days === 1) return { text: "I morgen",                 color: "#FBBF24" };
  return          { text: `om ${days}d`,                     color: "#60A5FA" };
}

function dkNow(): string {
  const d = new Date();
  const mo = ["jan","feb","mar","apr","maj","jun","jul","aug","sep","okt","nov","dec"][d.getMonth()];
  return `${d.getDate()}. ${mo} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

function toLocal(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fmtDT(iso?: string): string {
  if (!iso) return "–";
  const d = new Date(iso);
  const mo = ["jan","feb","mar","apr","maj","jun","jul","aug","sep","okt","nov","dec"][d.getMonth()];
  return `${d.getDate()}. ${mo} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

// shared input/label styles
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
function StatusBadge({ status }: { status: LeadStatus }) {
  const c = STATUS_CFG[status];
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
function CategoryPill({ cat }: { cat: LeadCategory }) {
  const c = CAT_CFG[cat];
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

// ── AddLeadForm ───────────────────────────────────────────────────────────────
function AddLeadForm({ onClose, onAdd }: {
  onClose: () => void;
  onAdd: (body: Record<string, string>) => void;
}) {
  const now = toLocal(new Date().toISOString());
  const [name, setName]         = useState("");
  const [cat, setCat]           = useState<LeadCategory>("ejendomsmaegler");
  const [status, setStatus]     = useState<LeadStatus>("contacted");
  const [platform, setPlatform] = useState("instagram");
  const [dtLocal, setDtLocal]   = useState(now);
  const [email, setEmail]       = useState("");
  const [ig, setIg]             = useState("");
  const [phone, setPhone]       = useState("");
  const [notes, setNotes]       = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const ts = dtLocal ? new Date(dtLocal).toISOString() : new Date().toISOString();
    const platformLabel = PLATFORMS.find(p => p.value === platform)?.label ?? platform;
    const autoNote = `[${dkNow()}] ${platformLabel}`;
    const finalNotes = notes.trim() ? `${autoNote}\n${notes.trim()}` : autoNote;
    const body: Record<string, string> = {
      name: name.trim(),
      category: cat,
      status,
      notes: finalNotes,
    };
    if (dtLocal) body.first_contact_at = ts;
    if (email.trim()) body.email = email.trim();
    if (ig.trim())    body.instagram_handle = ig.trim();
    if (phone.trim()) body.phone = phone.trim();
    onAdd(body);
  }

  return (
    <form onSubmit={submit} style={{
      background: "#1A2C3D",
      border: `1px solid ${AMBER}60`,
      borderRadius: 10,
      padding: 20,
      marginBottom: 12,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <span style={{ color: AMBER, fontWeight: 700, fontSize: 14 }}>✚ Nyt lead</span>
        <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: MUTED }}>
          <X size={16} />
        </button>
      </div>

      {/* Row 1: Navn, Kategori, Status */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div>
          <label style={lbl}>Navn *</label>
          <input style={inp()} value={name} onChange={e => setName(e.target.value)} placeholder="Firmanavn eller person" autoFocus required />
        </div>
        <div>
          <label style={lbl}>Kategori</label>
          <select style={inp({ cursor: "pointer" })} value={cat} onChange={e => setCat(e.target.value as LeadCategory)}>
            {(Object.entries(CAT_CFG) as [LeadCategory, typeof CAT_CFG[LeadCategory]][]).map(([k, v]) => (
              <option key={k} value={k}>{v.emoji} {v.short}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={lbl}>Status</label>
          <select style={inp({ cursor: "pointer" })} value={status} onChange={e => setStatus(e.target.value as LeadStatus)}>
            <option value="new">Ny</option>
            <option value="contacted">Kontaktet</option>
            <option value="responded">Svaret</option>
          </select>
        </div>
      </div>

      {/* Row 2: Kanal + Tidspunkt */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div>
          <label style={lbl}>Skrevet via</label>
          <select style={inp({ cursor: "pointer" })} value={platform} onChange={e => setPlatform(e.target.value)}>
            {PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Kontaktet tidspunkt</label>
          <input
            style={inp()}
            type="datetime-local"
            value={dtLocal}
            onChange={e => setDtLocal(e.target.value)}
          />
        </div>
      </div>

      {/* Row 3: Email, Instagram, Telefon */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div>
          <label style={lbl}>Email</label>
          <input style={inp()} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="firma@dk.dk" />
        </div>
        <div>
          <label style={lbl}>Instagram</label>
          <input style={inp()} value={ig} onChange={e => setIg(e.target.value)} placeholder="@handle" />
        </div>
        <div>
          <label style={lbl}>Telefon</label>
          <input style={inp()} value={phone} onChange={e => setPhone(e.target.value)} placeholder="+45 12 34 56 78" />
        </div>
      </div>

      {/* Notes */}
      <div style={{ marginBottom: 14 }}>
        <label style={lbl}>Note (valgfri)</label>
        <textarea
          style={inp({ resize: "vertical", minHeight: 56 })}
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Fx: Autosvar, virkede interesseret, send demo-link..."
        />
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={onClose} style={inp({ width: "auto", cursor: "pointer", padding: "8px 18px", color: MUTED })}>
          Annuller
        </button>
        <button type="submit" style={{
          background: AMBER, border: "none", borderRadius: 6,
          color: "#0F1D2F", padding: "8px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer",
        }}>
          Tilføj lead
        </button>
      </div>
    </form>
  );
}

// ── EditPanel ─────────────────────────────────────────────────────────────────
function EditPanel({ lead, onSave, onDelete, onClose }: {
  lead: Lead;
  onSave: (fields: Record<string, string | null>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [name, setName]         = useState(lead.name);
  const [cat, setCat]           = useState(lead.category);
  const [status, setStatus]     = useState(lead.status);
  const [email, setEmail]       = useState(lead.email ?? "");
  const [ig, setIg]             = useState(lead.instagram_handle ?? "");
  const [phone, setPhone]       = useState(lead.phone ?? "");
  const [notes, setNotes]       = useState(lead.notes ?? "");
  const [fcLocal, setFcLocal]   = useState(toLocal(lead.first_contact_at));
  const [fuLocal, setFuLocal]   = useState(toLocal(lead.follow_up_at));
  const [confirmDel, setCDel]   = useState(false);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  function appendLog(line: string) {
    const newNotes = notes ? `${notes}\n[${dkNow()}] ${line}` : `[${dkNow()}] ${line}`;
    setNotes(newNotes);
    setTimeout(() => {
      if (notesRef.current) {
        notesRef.current.scrollTop = notesRef.current.scrollHeight;
        notesRef.current.focus();
      }
    }, 0);
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    const fields: Record<string, string | null> = {
      name, category: cat, status,
      email: email || null,
      instagram_handle: ig || null,
      phone: phone || null,
      notes: notes || null,
      first_contact_at: fcLocal ? new Date(fcLocal).toISOString() : null,
      follow_up_at: fuLocal ? new Date(fuLocal).toISOString() : null,
    };
    onSave(fields);
  }

  const logBtns = [
    { icon: <Send size={12} />,        label: "Mail sendt",    log: "📧 Mail sendt" },
    { icon: <MessageSquare size={12}/>, label: "DM sendt",     log: "💬 Instagram DM sendt" },
    { icon: <Phone size={12} />,        label: "Ringet op",    log: "📞 Ringet op" },
    { icon: <Check size={12} />,        label: "Opfølgning",   log: "✅ Opfølgning gennemført" },
  ];

  return (
    <form onSubmit={save} onClick={e => e.stopPropagation()} style={{
      background: "#17263480",
      borderTop: `2px solid ${AMBER}`,
      padding: "16px 18px",
    }}>

      {/* Quick log buttons */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ ...lbl, marginBottom: 8 }}>Hurtig log</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {logBtns.map(b => (
            <button
              key={b.log}
              type="button"
              onClick={() => appendLog(b.log)}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                background: "#1c3254", border: `1px solid ${BORDER}`,
                borderRadius: 6, color: TEXT,
                padding: "5px 12px", fontSize: 12, cursor: "pointer",
              }}
            >
              {b.icon} {b.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid row 1 */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div>
          <label style={lbl}>Navn</label>
          <input style={inp()} value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div>
          <label style={lbl}>Kategori</label>
          <select style={inp({ cursor: "pointer" })} value={cat} onChange={e => setCat(e.target.value as LeadCategory)}>
            {(Object.entries(CAT_CFG) as [LeadCategory, typeof CAT_CFG[LeadCategory]][]).map(([k, v]) => (
              <option key={k} value={k}>{v.emoji} {v.short}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={lbl}>Status</label>
          <select style={inp({ cursor: "pointer" })} value={status} onChange={e => setStatus(e.target.value as LeadStatus)}>
            {(Object.entries(STATUS_CFG) as [LeadStatus, typeof STATUS_CFG[LeadStatus]][]).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={lbl}>Email</label>
          <input style={inp()} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="firma@dk.dk" />
        </div>
      </div>

      {/* Grid row 2 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div>
          <label style={lbl}>Instagram</label>
          <input style={inp()} value={ig} onChange={e => setIg(e.target.value)} placeholder="@handle" />
        </div>
        <div>
          <label style={lbl}>Telefon</label>
          <input style={inp()} value={phone} onChange={e => setPhone(e.target.value)} />
        </div>
        <div>
          <label style={lbl}>Første kontakt</label>
          <input style={inp()} type="datetime-local" value={fcLocal} onChange={e => setFcLocal(e.target.value)} />
        </div>
        <div>
          <label style={lbl}>Opfølgning</label>
          <input style={inp()} type="datetime-local" value={fuLocal} onChange={e => setFuLocal(e.target.value)} />
        </div>
      </div>

      {/* Notes */}
      <div style={{ marginBottom: 14 }}>
        <label style={lbl}>Notater / log</label>
        <textarea
          ref={notesRef}
          style={inp({ resize: "vertical", minHeight: 80, fontFamily: "inherit" })}
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Notater, logbog..."
        />
      </div>

      {/* Actions */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          {!confirmDel ? (
            <button type="button" onClick={() => setCDel(true)} style={{
              display: "flex", alignItems: "center", gap: 5,
              background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)",
              borderRadius: 6, color: "#FCA5A5",
              padding: "6px 14px", fontSize: 12, cursor: "pointer",
            }}>
              <Trash2 size={13} /> Slet lead
            </button>
          ) : (
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ color: MUTED, fontSize: 12 }}>Sikker?</span>
              <button type="button" onClick={onDelete} style={{
                background: "#EF4444", border: "none", borderRadius: 6,
                color: "white", padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer",
              }}>Ja, slet</button>
              <button type="button" onClick={() => setCDel(false)} style={inp({ width: "auto", cursor: "pointer", padding: "5px 12px", color: MUTED })}>
                Nej
              </button>
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={onClose} style={inp({ width: "auto", cursor: "pointer", padding: "7px 16px", color: MUTED })}>
            Luk
          </button>
          <button type="submit" style={{
            background: AMBER, border: "none", borderRadius: 6,
            color: "#0F1D2F", padding: "7px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer",
          }}>
            Gem
          </button>
        </div>
      </div>
    </form>
  );
}

// ── LeadRow ───────────────────────────────────────────────────────────────────
function LeadRow({ lead, expanded, onClick, onCycle, onSave, onDelete, onCollapse }: {
  lead: Lead;
  expanded: boolean;
  onClick: () => void;
  onCycle: (e: React.MouseEvent) => void;
  onSave: (f: Record<string, string | null>) => void;
  onDelete: () => void;
  onCollapse: () => void;
}) {
  const [hov, setHov] = useState(false);
  const urg    = urgencyColor(lead);
  const cd     = countdown(lead);
  const next   = STATUS_CYCLE[(STATUS_CYCLE.indexOf(lead.status) + 1) % STATUS_CYCLE.length];
  const nextCfg = STATUS_CFG[next];

  return (
    <div style={{
      borderRadius: 8, marginBottom: 3, overflow: "hidden",
      border: expanded ? `1px solid ${AMBER}55` : `1px solid transparent`,
    }}>
      <div
        onClick={onClick}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={{
          display: "flex", alignItems: "center", gap: 0,
          background: hov || expanded ? ROW_H : ROW,
          cursor: "pointer",
          transition: "background 0.12s",
          borderRadius: expanded ? "8px 8px 0 0" : 8,
          minHeight: 42,
        }}
      >
        {/* Urgency stripe */}
        <div style={{ width: 5, alignSelf: "stretch", background: urg, flexShrink: 0, borderRadius: "8px 0 0 8px" }} />

        {/* Name */}
        <div style={{ padding: "8px 12px", minWidth: 0, flex: "0 0 190px" }}>
          <div style={{ color: TEXT, fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {lead.name}
          </div>
          {lead.instagram_handle && (
            <div style={{ color: MUTED, fontSize: 10 }}>@{lead.instagram_handle.replace(/^@/, "")}</div>
          )}
        </div>

        {/* Category */}
        <div style={{ flex: "0 0 auto", paddingRight: 10 }}>
          <CategoryPill cat={lead.category} />
        </div>

        {/* Status */}
        <div style={{ flex: "0 0 auto", paddingRight: 10 }}>
          <StatusBadge status={lead.status} />
        </div>

        {/* Countdown */}
        {cd && (
          <div style={{ flex: "0 0 auto", paddingRight: 10 }}>
            <span style={{
              fontSize: 11, fontWeight: 700,
              color: cd.color, background: `${cd.color}22`,
              padding: "2px 8px", borderRadius: 99,
              display: "flex", alignItems: "center", gap: 4,
              whiteSpace: "nowrap",
            }}>
              <Clock size={10} /> {cd.text}
            </span>
          </div>
        )}

        {/* First contact */}
        {lead.first_contact_at && (
          <div style={{ flex: "0 0 auto", paddingRight: 10 }}>
            <span style={{ color: MUTED, fontSize: 11, whiteSpace: "nowrap" }}>{fmtDT(lead.first_contact_at)}</span>
          </div>
        )}

        {/* Email */}
        {lead.email && (
          <a
            href={`mailto:${lead.email}`}
            onClick={e => e.stopPropagation()}
            style={{ color: "#60A5FA", fontSize: 12, textDecoration: "none", display: "flex", alignItems: "center", gap: 4, flexShrink: 0, paddingRight: 10 }}
          >
            <Mail size={11} />
            <span style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lead.email}</span>
          </a>
        )}

        {/* Notes preview */}
        {lead.notes && !lead.email && (
          <span style={{ color: MUTED, fontSize: 11, fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
            {lead.notes.replace(/\[.*?\]\s*/g, "").slice(0, 70)}
          </span>
        )}

        <div style={{ flex: 1 }} />

        {/* Hover actions */}
        <div
          onClick={e => e.stopPropagation()}
          style={{ display: "flex", alignItems: "center", gap: 6, paddingRight: 12, opacity: hov || expanded ? 1 : 0, transition: "opacity 0.15s", flexShrink: 0 }}
        >
          {lead.status !== "won" && (
            <button
              onClick={onCycle}
              style={{
                display: "flex", alignItems: "center", gap: 4,
                background: nextCfg.bg, border: `1px solid ${nextCfg.dot}50`,
                borderRadius: 5, color: nextCfg.fg,
                padding: "4px 9px", fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              → {nextCfg.label}
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <EditPanel lead={lead} onSave={onSave} onDelete={onDelete} onClose={onCollapse} />
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function LeadsView() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd]     = useState(false);
  const [expanded, setExpanded]   = useState<number | null>(null);
  const [catFilter, setCatFilter] = useState<LeadCategory | "alle">("alle");
  const [stFilter, setStFilter]   = useState<"alle" | "aktive" | "svaret" | "nej">("alle");
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
    mutationFn: ({ id, fields }: { id: number; fields: Record<string, string | null> }) =>
      cf(`/api/leads/${id}`, { method: "PATCH", body: JSON.stringify(fields) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leads"] }); setExpanded(null); },
  });

  const delM = useMutation({
    mutationFn: (id: number) => cf(`/api/leads/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leads"] }); setExpanded(null); },
  });

  // ── Filter + search ───────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter(l => {
      if (catFilter !== "alle" && l.category !== catFilter) return false;
      if (stFilter === "aktive"  && (l.status === "no" || l.status === "won" || l.status === "responded")) return false;
      if (stFilter === "svaret"  && l.status !== "responded") return false;
      if (stFilter === "nej"     && l.status !== "no")        return false;
      if (q) {
        const hay = [l.name, l.email, l.instagram_handle, l.notes, l.phone].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [leads, catFilter, stFilter, search]);

  const catCounts = useMemo(() =>
    leads.reduce<Record<string, number>>((a, l) => { a[l.category] = (a[l.category] ?? 0) + 1; return a; }, {}),
  [leads]);

  const overdue = leads.filter(l =>
    l.follow_up_at && l.status !== "no" && l.status !== "won" &&
    new Date(l.follow_up_at).getTime() < Date.now()
  ).length;

  // ── Tab style ─────────────────────────────────────────────────────────────
  const tab = (active: boolean): React.CSSProperties => ({
    background: active ? `${AMBER}22` : "transparent",
    border: active ? `1px solid ${AMBER}55` : `1px solid transparent`,
    borderRadius: 6, cursor: "pointer",
    fontSize: 12, fontWeight: active ? 700 : 400,
    color: active ? AMBER : MUTED,
    padding: "5px 12px", whiteSpace: "nowrap", transition: "all 0.13s",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexShrink: 0, flexWrap: "wrap" }}>
        <span style={{ color: TEXT, fontSize: 18, fontWeight: 800, letterSpacing: "-0.3px" }}>Leads</span>
        <span style={{ background: `${AMBER}22`, color: AMBER, fontSize: 12, fontWeight: 700, padding: "2px 10px", borderRadius: 99 }}>
          {leads.length}
        </span>
        {overdue > 0 && (
          <span style={{ background: "rgba(239,68,68,0.2)", color: "#FCA5A5", fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 99, display: "flex", alignItems: "center", gap: 4 }}>
            <AlertTriangle size={11} /> {overdue} forfaldne
          </span>
        )}

        {/* Search */}
        <div style={{ position: "relative", flex: 1, minWidth: 180, maxWidth: 340 }}>
          <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: MUTED, pointerEvents: "none" }} />
          <input
            style={inp({ paddingLeft: 30, width: "100%" })}
            placeholder="Søg navn, email, note…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: MUTED, padding: 0 }}>
              <X size={12} />
            </button>
          )}
        </div>

        <div style={{ marginLeft: "auto" }}>
          <button
            onClick={() => setShowAdd(v => !v)}
            style={{
              background: showAdd ? "rgba(200,149,108,0.15)" : AMBER,
              border: showAdd ? `1px solid ${AMBER}` : "none",
              borderRadius: 7, cursor: "pointer",
              color: showAdd ? AMBER : "#0F1D2F",
              padding: "8px 16px", fontSize: 13, fontWeight: 700,
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            {showAdd ? <X size={14} /> : <Plus size={14} />}
            {showAdd ? "Luk" : "Tilføj lead"}
          </button>
        </div>
      </div>

      {/* ── Category tabs ── */}
      <div style={{ display: "flex", gap: 4, marginBottom: 8, flexShrink: 0, flexWrap: "wrap" }}>
        <button style={tab(catFilter === "alle")} onClick={() => setCatFilter("alle")}>
          Alle ({leads.length})
        </button>
        {(Object.entries(CAT_CFG) as [LeadCategory, typeof CAT_CFG[LeadCategory]][]).map(([k, v]) => (
          <button key={k} style={tab(catFilter === k)} onClick={() => setCatFilter(k)}>
            {v.emoji} {v.short} ({catCounts[k] ?? 0})
          </button>
        ))}
      </div>

      {/* ── Status filter ── */}
      <div style={{ display: "flex", gap: 4, marginBottom: 12, flexShrink: 0, paddingBottom: 12, borderBottom: `1px solid ${BORDER}` }}>
        {([ ["alle","Alle"], ["aktive","Aktive"], ["svaret","Svaret ✅"], ["nej","Nej ✗"] ] as const).map(([v, l]) => (
          <button key={v} style={tab(stFilter === v)} onClick={() => setStFilter(v)}>{l}</button>
        ))}
        {search && (
          <span style={{ color: MUTED, fontSize: 12, alignSelf: "center", marginLeft: 6 }}>
            {filtered.length} af {leads.length} resultater
          </span>
        )}
      </div>

      {/* ── Add form ── */}
      {showAdd && (
        <AddLeadForm onClose={() => setShowAdd(false)} onAdd={body => addM.mutate(body)} />
      )}

      {/* ── Lead list ── */}
      <div style={{ flexGrow: 1, overflowY: "auto", paddingRight: 2 }}>
        {isLoading && (
          <div style={{ color: MUTED, fontSize: 13, padding: 24, textAlign: "center" }}>Henter leads…</div>
        )}
        {isError && (
          <div style={{ color: "#FCA5A5", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: 14, fontSize: 13 }}>
            Fejl: {(error as Error)?.message ?? "Kunne ikke hente leads"}
          </div>
        )}
        {!isLoading && !isError && filtered.length === 0 && (
          <div style={{ color: MUTED, fontSize: 13, padding: 40, textAlign: "center" }}>
            {leads.length === 0 ? "Ingen leads endnu — tryk Tilføj lead" : "Ingen leads matcher søgning / filter"}
          </div>
        )}
        {filtered.map(lead => (
          <LeadRow
            key={lead.id}
            lead={lead}
            expanded={expanded === lead.id}
            onClick={() => setExpanded(p => p === lead.id ? null : lead.id)}
            onCycle={e => { e.stopPropagation(); const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(lead.status)+1)%STATUS_CYCLE.length]; patchM.mutate({ id: lead.id, fields: { status: next } }); }}
            onSave={fields => patchM.mutate({ id: lead.id, fields })}
            onDelete={() => delM.mutate(lead.id)}
            onCollapse={() => setExpanded(null)}
          />
        ))}
      </div>

      {/* ── Error toast ── */}
      {(addM.isError || patchM.isError || delM.isError) && (
        <div style={{ position: "fixed", bottom: 20, right: 20, background: "#EF4444", color: "white", padding: "10px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, zIndex: 9999 }}>
          {((addM.error || patchM.error || delM.error) as Error)?.message ?? "Fejl"}
        </div>
      )}
    </div>
  );
}
