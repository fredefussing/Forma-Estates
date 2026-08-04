import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, X, Trash2, ChevronDown, Mail, Check, Instagram,
  Building2, Hammer, Home, Search, Filter,
} from "lucide-react";
import { auth } from "@/lib/firebase";

// ── Auth fetch ────────────────────────────────────────────────────────────────
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

type NewLead = {
  name: string;
  category: LeadCategory;
  instagram_handle?: string;
  email?: string;
  phone?: string;
  status?: LeadStatus;
  notes?: string;
  first_contact_at?: string;
};

// ── Design tokens ─────────────────────────────────────────────────────────────
const BG_ROW = "rgba(255,255,255,0.04)";
const BG_ROW_HOVER = "rgba(255,255,255,0.07)";
const BORDER = "rgba(255,255,255,0.08)";
const TEXT_PRIMARY = "#E8E0D5";
const TEXT_MUTED = "rgba(255,255,255,0.45)";
const AMBER = "#C8956C";

const STATUS_CONFIG: Record<LeadStatus, { label: string; color: string; bg: string }> = {
  new:       { label: "Ny",        color: "rgba(255,255,255,0.85)", bg: "rgba(255,255,255,0.12)" },
  contacted: { label: "Kontaktet", color: "#4A9EFF",                bg: "rgba(74,158,255,0.15)"  },
  responded: { label: "Svaret",    color: "#4CAF7D",                bg: "rgba(76,175,125,0.15)"  },
  no:        { label: "Nej",       color: "#EF5350",                bg: "rgba(239,83,80,0.15)"   },
  won:       { label: "Vundet",    color: AMBER,                    bg: "rgba(200,149,108,0.15)" },
};

const CATEGORY_CONFIG: Record<LeadCategory, { label: string; emoji: string }> = {
  ejendomsmaegler: { label: "Ejendomsmæglere", emoji: "🏠" },
  arkitekt:        { label: "Arkitekter",       emoji: "🏗️" },
  toemrerfirma:    { label: "Tømrerfirmaer",    emoji: "🔨" },
  byggefirma:      { label: "Byggefirmaer",     emoji: "🏢" },
};

const STATUS_CYCLE: LeadStatus[] = ["new", "contacted", "responded", "no"];

// ── Helpers ───────────────────────────────────────────────────────────────────
function getUrgencyBorder(lead: Lead): string {
  if (lead.status === "no" || lead.status === "won" || lead.status === "new") return "#4B5563";
  if (!lead.follow_up_at) return "#4B5563";
  const now = new Date();
  const due = new Date(lead.follow_up_at);
  const diffMs = due.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (diffDays < 0) return "#EF5350";   // overdue → red
  if (diffDays < 2) return "#F59E0B";   // soon → amber
  return "#4CAF7D";                      // ok → green
}

function getCountdownChip(lead: Lead): { label: string; color: string; bg: string } | null {
  if (!lead.follow_up_at) return null;
  if (lead.status === "no" || lead.status === "won") return null;
  const now = new Date();
  const due = new Date(lead.follow_up_at);
  const diffMs = due.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) {
    return { label: `${Math.abs(diffDays)} dage over`, color: "#EF5350", bg: "rgba(239,83,80,0.15)" };
  }
  if (diffDays === 0) return { label: "I dag",   color: "#F59E0B", bg: "rgba(245,158,11,0.15)" };
  if (diffDays === 1) return { label: "I morgen", color: "#F59E0B", bg: "rgba(245,158,11,0.15)" };
  return { label: `om ${diffDays} dage`, color: "#4A9EFF", bg: "rgba(74,158,255,0.15)" };
}

function truncate(str: string, len: number) {
  return str.length > len ? str.slice(0, len) + "…" : str;
}

// ── Sub-components ────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: LeadStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      className="text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ color: cfg.color, background: cfg.bg }}
    >
      {cfg.label}
    </span>
  );
}

function CategoryBadge({ category }: { category: LeadCategory }) {
  const cfg = CATEGORY_CONFIG[category];
  return (
    <span
      className="text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ color: TEXT_MUTED, background: "rgba(255,255,255,0.06)" }}
    >
      {cfg.emoji} {cfg.label}
    </span>
  );
}

// ── Add Lead Form ─────────────────────────────────────────────────────────────
function AddLeadForm({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (lead: NewLead) => void;
}) {
  const [form, setForm] = useState<NewLead>({
    name: "",
    category: "ejendomsmaegler",
    status: "new",
  });

  function set(field: keyof NewLead, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const payload = { ...form };
    if (!payload.instagram_handle) delete payload.instagram_handle;
    if (!payload.email) delete payload.email;
    if (!payload.phone) delete payload.phone;
    if (!payload.notes) delete payload.notes;
    if (!payload.first_contact_at) {
      if (form.status === "contacted") payload.first_contact_at = new Date().toISOString();
      else delete payload.first_contact_at;
    }
    onAdd(payload);
  }

  const inputStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.06)",
    border: `1px solid ${BORDER}`,
    borderRadius: 6,
    color: TEXT_PRIMARY,
    padding: "6px 10px",
    fontSize: 13,
    width: "100%",
    outline: "none",
  };

  const labelStyle: React.CSSProperties = {
    color: TEXT_MUTED,
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    display: "block",
    marginBottom: 4,
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        background: "rgba(255,255,255,0.04)",
        border: `1px solid ${BORDER}`,
        borderRadius: 10,
        padding: "20px",
        marginBottom: 12,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <span style={{ color: TEXT_PRIMARY, fontWeight: 600, fontSize: 14 }}>Tilføj nyt lead</span>
        <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: TEXT_MUTED }}>
          <X size={16} />
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div>
          <label style={labelStyle}>Navn *</label>
          <input
            style={inputStyle}
            value={form.name}
            onChange={e => set("name", e.target.value)}
            placeholder="Firmanavn"
            required
          />
        </div>
        <div>
          <label style={labelStyle}>Kategori</label>
          <select
            style={{ ...inputStyle, cursor: "pointer" }}
            value={form.category}
            onChange={e => set("category", e.target.value)}
          >
            {Object.entries(CATEGORY_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>{v.emoji} {v.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Status</label>
          <select
            style={{ ...inputStyle, cursor: "pointer" }}
            value={form.status}
            onChange={e => set("status", e.target.value as LeadStatus)}
          >
            <option value="new">Ny</option>
            <option value="contacted">Kontaktet</option>
            <option value="responded">Svaret</option>
          </select>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div>
          <label style={labelStyle}>Instagram</label>
          <input
            style={inputStyle}
            value={form.instagram_handle ?? ""}
            onChange={e => set("instagram_handle", e.target.value)}
            placeholder="@handle"
          />
        </div>
        <div>
          <label style={labelStyle}>Email</label>
          <input
            style={inputStyle}
            type="email"
            value={form.email ?? ""}
            onChange={e => set("email", e.target.value)}
            placeholder="email@firma.dk"
          />
        </div>
        <div>
          <label style={labelStyle}>Første kontakt</label>
          <input
            style={inputStyle}
            type="date"
            value={form.first_contact_at ? form.first_contact_at.slice(0, 10) : ""}
            onChange={e => set("first_contact_at", e.target.value ? new Date(e.target.value).toISOString() : "")}
          />
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Noter</label>
        <textarea
          style={{ ...inputStyle, resize: "vertical", minHeight: 60 }}
          value={form.notes ?? ""}
          onChange={e => set("notes", e.target.value)}
          placeholder="Notater om leadet..."
        />
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: "rgba(255,255,255,0.06)",
            border: `1px solid ${BORDER}`,
            borderRadius: 6,
            color: TEXT_MUTED,
            padding: "7px 16px",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Annuller
        </button>
        <button
          type="submit"
          style={{
            background: AMBER,
            border: "none",
            borderRadius: 6,
            color: "#0F1D2F",
            padding: "7px 16px",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Tilføj
        </button>
      </div>
    </form>
  );
}

// ── Edit Panel ─────────────────────────────────────────────────────────────────
function EditPanel({
  lead,
  onSave,
  onDelete,
  onClose,
}: {
  lead: Lead;
  onSave: (fields: Partial<Lead>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<Partial<Lead>>({ ...lead });
  const [confirmDelete, setConfirmDelete] = useState(false);

  function set(field: keyof Lead, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const payload: Partial<Lead> = {};
    const fields: (keyof Lead)[] = [
      "name", "category", "status", "instagram_handle", "email",
      "phone", "notes", "first_contact_at", "follow_up_at", "last_contacted_at",
    ];
    for (const f of fields) {
      if (form[f] !== undefined) (payload as Record<string, unknown>)[f] = form[f] || null;
    }
    onSave(payload);
  }

  const inputStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.06)",
    border: `1px solid ${BORDER}`,
    borderRadius: 6,
    color: TEXT_PRIMARY,
    padding: "6px 10px",
    fontSize: 13,
    width: "100%",
    outline: "none",
  };
  const labelStyle: React.CSSProperties = {
    color: TEXT_MUTED,
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    display: "block",
    marginBottom: 4,
  };

  return (
    <form
      onSubmit={handleSave}
      style={{
        background: "rgba(255,255,255,0.03)",
        borderTop: `1px solid ${BORDER}`,
        padding: "16px 20px",
      }}
      onClick={e => e.stopPropagation()}
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 10 }}>
        <div>
          <label style={labelStyle}>Navn</label>
          <input style={inputStyle} value={form.name ?? ""} onChange={e => set("name", e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Kategori</label>
          <select
            style={{ ...inputStyle, cursor: "pointer" }}
            value={form.category ?? "ejendomsmaegler"}
            onChange={e => set("category", e.target.value)}
          >
            {Object.entries(CATEGORY_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>{v.emoji} {v.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Status</label>
          <select
            style={{ ...inputStyle, cursor: "pointer" }}
            value={form.status ?? "new"}
            onChange={e => set("status", e.target.value)}
          >
            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Instagram</label>
          <input style={inputStyle} value={form.instagram_handle ?? ""} onChange={e => set("instagram_handle", e.target.value)} placeholder="@handle" />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 10 }}>
        <div>
          <label style={labelStyle}>Email</label>
          <input style={inputStyle} type="email" value={form.email ?? ""} onChange={e => set("email", e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Telefon</label>
          <input style={inputStyle} value={form.phone ?? ""} onChange={e => set("phone", e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Første kontakt</label>
          <input
            style={inputStyle}
            type="date"
            value={form.first_contact_at ? form.first_contact_at.slice(0, 10) : ""}
            onChange={e => set("first_contact_at", e.target.value ? new Date(e.target.value).toISOString() : "")}
          />
        </div>
        <div>
          <label style={labelStyle}>Opfølgning</label>
          <input
            style={inputStyle}
            type="date"
            value={form.follow_up_at ? form.follow_up_at.slice(0, 10) : ""}
            onChange={e => set("follow_up_at", e.target.value ? new Date(e.target.value).toISOString() : "")}
          />
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Noter</label>
        <textarea
          style={{ ...inputStyle, resize: "vertical", minHeight: 60 }}
          value={form.notes ?? ""}
          onChange={e => set("notes", e.target.value)}
        />
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center" }}>
        <div>
          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              style={{
                background: "rgba(239,83,80,0.12)",
                border: "1px solid rgba(239,83,80,0.3)",
                borderRadius: 6,
                color: "#EF5350",
                padding: "6px 14px",
                fontSize: 12,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <Trash2 size={13} /> Slet lead
            </button>
          ) : (
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ color: TEXT_MUTED, fontSize: 12 }}>Er du sikker?</span>
              <button
                type="button"
                onClick={onDelete}
                style={{
                  background: "#EF5350",
                  border: "none",
                  borderRadius: 6,
                  color: "white",
                  padding: "5px 12px",
                  fontSize: 12,
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Ja, slet
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: `1px solid ${BORDER}`,
                  borderRadius: 6,
                  color: TEXT_MUTED,
                  padding: "5px 12px",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Annuller
              </button>
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.06)",
              border: `1px solid ${BORDER}`,
              borderRadius: 6,
              color: TEXT_MUTED,
              padding: "6px 14px",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Annuller
          </button>
          <button
            type="submit"
            style={{
              background: AMBER,
              border: "none",
              borderRadius: 6,
              color: "#0F1D2F",
              padding: "6px 14px",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Gem ændringer
          </button>
        </div>
      </div>
    </form>
  );
}

// ── Lead Row ──────────────────────────────────────────────────────────────────
function LeadRow({
  lead,
  expanded,
  onClick,
  onStatusCycle,
  onSave,
  onDelete,
  onCollapse,
}: {
  lead: Lead;
  expanded: boolean;
  onClick: () => void;
  onStatusCycle: (e: React.MouseEvent) => void;
  onSave: (fields: Partial<Lead>) => void;
  onDelete: () => void;
  onCollapse: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const urgencyColor = getUrgencyBorder(lead);
  const countdown = getCountdownChip(lead);
  const nextStatus = STATUS_CYCLE[(STATUS_CYCLE.indexOf(lead.status) + 1) % STATUS_CYCLE.length];

  return (
    <div
      style={{
        borderRadius: 8,
        marginBottom: 2,
        overflow: "hidden",
        border: expanded ? `1px solid ${BORDER}` : `1px solid transparent`,
      }}
    >
      <div
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 14px 10px 0",
          background: hovered || expanded ? BG_ROW_HOVER : BG_ROW,
          cursor: "pointer",
          position: "relative",
          borderRadius: expanded ? "8px 8px 0 0" : 8,
          transition: "background 0.15s",
        }}
      >
        {/* Urgency border */}
        <div style={{ width: 4, alignSelf: "stretch", background: urgencyColor, borderRadius: "4px 0 0 4px", flexShrink: 0 }} />

        {/* Name */}
        <div style={{ width: 180, flexShrink: 0 }}>
          <span style={{ color: TEXT_PRIMARY, fontWeight: 600, fontSize: 13, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {lead.name}
          </span>
          {lead.instagram_handle && (
            <span style={{ color: TEXT_MUTED, fontSize: 11, display: "flex", alignItems: "center", gap: 3 }}>
              <Instagram size={10} /> {lead.instagram_handle}
            </span>
          )}
        </div>

        {/* Category badge */}
        <div style={{ flexShrink: 0 }}>
          <CategoryBadge category={lead.category} />
        </div>

        {/* Status badge */}
        <div style={{ flexShrink: 0 }}>
          <StatusBadge status={lead.status} />
        </div>

        {/* Countdown chip */}
        {countdown && (
          <div style={{ flexShrink: 0 }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                padding: "2px 8px",
                borderRadius: 99,
                color: countdown.color,
                background: countdown.bg,
                whiteSpace: "nowrap",
              }}
            >
              {countdown.label}
            </span>
          </div>
        )}

        {/* Email */}
        {lead.email && (
          <a
            href={`mailto:${lead.email}`}
            onClick={e => e.stopPropagation()}
            style={{ color: TEXT_MUTED, fontSize: 12, textDecoration: "none", display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}
          >
            <Mail size={12} /> {lead.email}
          </a>
        )}

        {/* Notes */}
        {lead.notes && (
          <span style={{ color: TEXT_MUTED, fontSize: 12, fontStyle: "italic", flexGrow: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {truncate(lead.notes, 60)}
          </span>
        )}

        {/* Spacer */}
        <div style={{ flexGrow: 1 }} />

        {/* Actions */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            opacity: hovered || expanded ? 1 : 0,
            transition: "opacity 0.15s",
            flexShrink: 0,
          }}
          onClick={e => e.stopPropagation()}
        >
          {lead.status !== "won" && (
            <button
              onClick={onStatusCycle}
              title={`→ ${STATUS_CONFIG[nextStatus]?.label}`}
              style={{
                background: "rgba(255,255,255,0.08)",
                border: `1px solid ${BORDER}`,
                borderRadius: 5,
                color: TEXT_MUTED,
                padding: "4px 8px",
                fontSize: 11,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
                whiteSpace: "nowrap",
              }}
            >
              <ChevronDown size={11} /> {STATUS_CONFIG[nextStatus]?.label}
            </button>
          )}
          <button
            onClick={e => { e.stopPropagation(); onDelete(); }}
            style={{
              background: "rgba(239,83,80,0.1)",
              border: "1px solid rgba(239,83,80,0.2)",
              borderRadius: 5,
              color: "#EF5350",
              padding: "4px 6px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
            }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Expand panel */}
      {expanded && (
        <EditPanel
          lead={lead}
          onSave={onSave}
          onDelete={onDelete}
          onClose={onCollapse}
        />
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function LeadsView() {
  const qc = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<LeadCategory | "alle">("alle");
  const [statusFilter, setStatusFilter] = useState<"alle" | "aktive" | "svaret" | "nej">("alle");
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: leads = [], isLoading, isError, error } = useQuery<Lead[]>({
    queryKey: ["leads"],
    queryFn: () => cf("/api/leads"),
  });

  // ── Mutations ────────────────────────────────────────────────────────────────
  const addMutation = useMutation({
    mutationFn: (body: NewLead) => cf("/api/leads", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leads"] }); setShowAddForm(false); },
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, fields }: { id: number; fields: Partial<Lead> }) =>
      cf(`/api/leads/${id}`, { method: "PATCH", body: JSON.stringify(fields) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leads"] }); setExpandedId(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => cf(`/api/leads/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leads"] }); setExpandedId(null); setDeleteConfirmId(null); },
  });

  // ── Filters ──────────────────────────────────────────────────────────────────
  const filteredLeads = leads.filter(lead => {
    if (categoryFilter !== "alle" && lead.category !== categoryFilter) return false;
    if (statusFilter === "aktive" && (lead.status === "no" || lead.status === "won" || lead.status === "responded")) return false;
    if (statusFilter === "svaret" && lead.status !== "responded") return false;
    if (statusFilter === "nej" && lead.status !== "no") return false;
    return true;
  });

  // ── Category counts ───────────────────────────────────────────────────────────
  const catCounts = leads.reduce<Record<string, number>>((acc, l) => {
    acc[l.category] = (acc[l.category] ?? 0) + 1;
    return acc;
  }, {});

  // ── Handlers ─────────────────────────────────────────────────────────────────
  function handleStatusCycle(lead: Lead) {
    const idx = STATUS_CYCLE.indexOf(lead.status);
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
    patchMutation.mutate({ id: lead.id, fields: { status: next } });
  }

  function handleSave(id: number, fields: Partial<Lead>) {
    patchMutation.mutate({ id, fields });
  }

  function handleDelete(id: number) {
    deleteMutation.mutate(id);
  }

  // ── Styles ───────────────────────────────────────────────────────────────────
  const tabBase: React.CSSProperties = {
    background: "none",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 12,
    padding: "5px 12px",
    transition: "all 0.15s",
    whiteSpace: "nowrap",
  };

  function tabStyle(active: boolean): React.CSSProperties {
    return {
      ...tabBase,
      background: active ? "rgba(200,149,108,0.15)" : "transparent",
      color: active ? AMBER : TEXT_MUTED,
      fontWeight: active ? 600 : 400,
    };
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 0 16px 0",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: TEXT_PRIMARY, fontSize: 18, fontWeight: 700 }}>Leads</span>
          <span style={{
            background: "rgba(200,149,108,0.15)",
            color: AMBER,
            fontSize: 11,
            fontWeight: 600,
            padding: "2px 8px",
            borderRadius: 99,
          }}>
            {leads.length}
          </span>
        </div>
        <button
          onClick={() => setShowAddForm(v => !v)}
          style={{
            background: AMBER,
            border: "none",
            borderRadius: 7,
            color: "#0F1D2F",
            padding: "8px 16px",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Plus size={15} /> Tilføj lead
        </button>
      </div>

      {/* Category filter tabs */}
      <div style={{
        display: "flex",
        gap: 4,
        marginBottom: 8,
        flexShrink: 0,
        borderBottom: `1px solid ${BORDER}`,
        paddingBottom: 8,
        flexWrap: "wrap",
      }}>
        <button style={tabStyle(categoryFilter === "alle")} onClick={() => setCategoryFilter("alle")}>
          Alle ({leads.length})
        </button>
        {(Object.entries(CATEGORY_CONFIG) as [LeadCategory, { label: string; emoji: string }][]).map(([k, v]) => (
          <button key={k} style={tabStyle(categoryFilter === k)} onClick={() => setCategoryFilter(k)}>
            {v.emoji} {v.label} ({catCounts[k] ?? 0})
          </button>
        ))}
      </div>

      {/* Status filter row */}
      <div style={{ display: "flex", gap: 4, marginBottom: 12, flexShrink: 0 }}>
        {([
          ["alle", "Alle"],
          ["aktive", "Aktive"],
          ["svaret", "Svaret"],
          ["nej", "Nej"],
        ] as const).map(([val, label]) => (
          <button
            key={val}
            style={tabStyle(statusFilter === val)}
            onClick={() => setStatusFilter(val)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Add form */}
      {showAddForm && (
        <AddLeadForm
          onClose={() => setShowAddForm(false)}
          onAdd={fields => addMutation.mutate(fields)}
        />
      )}

      {/* Lead list */}
      <div style={{ flexGrow: 1, overflowY: "auto", paddingRight: 4 }}>
        {isLoading && (
          <div style={{ color: TEXT_MUTED, fontSize: 13, padding: 20, textAlign: "center" }}>
            Indlæser leads…
          </div>
        )}
        {isError && (
          <div style={{
            color: "#EF5350",
            fontSize: 13,
            padding: 16,
            background: "rgba(239,83,80,0.08)",
            borderRadius: 8,
            border: "1px solid rgba(239,83,80,0.2)",
          }}>
            Fejl: {(error as Error)?.message ?? "Kunne ikke hente leads"}
          </div>
        )}
        {!isLoading && !isError && filteredLeads.length === 0 && (
          <div style={{
            color: TEXT_MUTED,
            fontSize: 13,
            padding: 40,
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 10,
          }}>
            <Filter size={32} style={{ opacity: 0.3 }} />
            <span>Ingen leads matcher filteret</span>
            {leads.length === 0 && (
              <span style={{ fontSize: 12 }}>Klik "Tilføj lead" for at komme i gang</span>
            )}
          </div>
        )}
        {filteredLeads.map(lead => (
          <LeadRow
            key={lead.id}
            lead={lead}
            expanded={expandedId === lead.id}
            onClick={() => setExpandedId(prev => prev === lead.id ? null : lead.id)}
            onStatusCycle={e => { e.stopPropagation(); handleStatusCycle(lead); }}
            onSave={fields => handleSave(lead.id, fields)}
            onDelete={() => handleDelete(lead.id)}
            onCollapse={() => setExpandedId(null)}
          />
        ))}
      </div>

      {/* Mutation error toast */}
      {(addMutation.isError || patchMutation.isError || deleteMutation.isError) && (
        <div style={{
          position: "fixed",
          bottom: 20,
          right: 20,
          background: "rgba(239,83,80,0.9)",
          color: "white",
          padding: "10px 16px",
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 500,
          zIndex: 9999,
        }}>
          {((addMutation.error || patchMutation.error || deleteMutation.error) as Error)?.message ?? "Fejl"}
        </div>
      )}
    </div>
  );
}
