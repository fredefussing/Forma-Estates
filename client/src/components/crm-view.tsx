import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Plus, Search, User, Calendar, ChevronRight,
  MessageSquare, Activity, Trash2, Check, X, ChevronDown, Building2,
  Shield, Users, RefreshCw,
} from "lucide-react";
import { auth } from "@/lib/firebase";

async function crmFetch(url: string, options?: RequestInit): Promise<Response> {
  const token = await auth.currentUser?.getIdToken();
  const headers: Record<string, string> = {
    ...(options?.body ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  return res;
}

async function crmReq(method: string, url: string, data?: unknown): Promise<any> {
  const res = await crmFetch(url, { method, body: data ? JSON.stringify(data) : undefined });
  return res.json();
}

// ── Types ─────────────────────────────────────────────────────────────────────
type Contact = {
  id: string; email: string; name?: string; company?: string; phone?: string;
  plan: string; status: string; engagementScore: number; notes?: string;
  linkedUserId?: number; createdAt: string; lastActiveAt?: string;
};
type Activity = { id: string; contactId: string; type: string; description?: string; metadata?: string; createdAt: string };
type Interaction = { id: string; contactId: string; type: string; content: string; createdBy?: string; createdAt: string };
type Override = { id: string; contactId: string; overrideKey: string; overrideValue: string; updatedAt: string };
type CompanyGroup = { company: string | null; contacts: Contact[] };

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (d: string) => new Date(d).toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" });
const fmtShort = (d: string) => new Date(d).toLocaleDateString("da-DK", { day: "numeric", month: "short" });

const STATUS: Record<string, { bg: string; text: string; label: string }> = {
  lead:    { bg: "#EFF6FF", text: "#1D4ED8", label: "Lead" },
  trial:   { bg: "#FEF9C3", text: "#854D0E", label: "Trial" },
  active:  { bg: "#F0FDF4", text: "#166534", label: "Aktiv" },
  churned: { bg: "#FEF2F2", text: "#991B1B", label: "Churned" },
};
const PLAN: Record<string, { bg: string; text: string }> = {
  none:     { bg: "#F3F4F6", text: "#6B7280" },
  start:    { bg: "#EFF6FF", text: "#1D4ED8" },
  pro:      { bg: "#F5F3FF", text: "#6D28D9" },
  business: { bg: "#FFF7ED", text: "#C2410C" },
  enterprise: { bg: "#FDF4FF", text: "#7C3AED" },
};
const ACT_ICON: Record<string, string> = {
  visualization: "🖼️", login: "🔑", download: "⬇️", video: "🎬",
  upgrade: "📈", note: "📝", email: "📧", call: "📞", support: "🛠️",
};

function StatusBadge({ status }: { status: string }) {
  const c = STATUS[status] ?? { bg: "#F3F4F6", text: "#374151", label: status };
  return <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: c.bg, color: c.text }}>{c.label ?? status}</span>;
}
function PlanBadge({ plan }: { plan: string }) {
  const c = PLAN[plan] ?? { bg: "#F3F4F6", text: "#374151" };
  return <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize" style={{ background: c.bg, color: c.text }}>{plan === "none" ? "Ingen plan" : plan}</span>;
}

function groupByCompany(contacts: Contact[]): CompanyGroup[] {
  const map = new Map<string, Contact[]>();
  for (const c of contacts) {
    const key = c.company ?? "__none__";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(c);
  }
  const groups: CompanyGroup[] = [];
  map.forEach((cs, key) => groups.push({ company: key === "__none__" ? null : key, contacts: cs }));
  groups.sort((a, b) => {
    if (!a.company) return 1;
    if (!b.company) return -1;
    return a.company.localeCompare(b.company, "da");
  });
  return groups;
}

// ── New Contact Modal ──────────────────────────────────────────────────────────
function NewContactModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ email: "", name: "", company: "", phone: "", plan: "none", status: "lead" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    if (!form.email) { setErr("Email er påkrævet"); return; }
    setSaving(true); setErr("");
    try {
      await crmReq("POST", "/api/crm/contacts", form);
      onCreated(); onClose();
    } catch (e: any) { setErr(e.message ?? "Fejl"); setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-7 m-4" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-5" style={{ color: "#0F1D2F" }}>Ny kontakt</h2>
        <div className="space-y-3">
          {[["Email *", "email", "email"], ["Navn", "name", "text"], ["Firma", "company", "text"], ["Telefon", "phone", "tel"]].map(([label, key, type]) => (
            <div key={key}>
              <label className="block text-xs font-medium mb-1" style={{ color: "#6B6B6B" }}>{label}</label>
              <input type={type} value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={{ border: "1px solid #E5E2DC", color: "#0F1D2F" }} />
            </div>
          ))}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "#6B6B6B" }}>Plan</label>
              <select value={form.plan} onChange={e => setForm(f => ({ ...f, plan: e.target.value }))}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={{ border: "1px solid #E5E2DC" }}>
                {["none","start","pro","business","enterprise"].map(p => <option key={p} value={p}>{p === "none" ? "Ingen plan" : p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "#6B6B6B" }}>Status</label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={{ border: "1px solid #E5E2DC" }}>
                {["lead","trial","active","churned"].map(s => <option key={s} value={s}>{STATUS[s]?.label ?? s}</option>)}
              </select>
            </div>
          </div>
        </div>
        {err && <p className="text-xs text-red-600 mt-3">{err}</p>}
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 h-10 rounded-xl text-sm font-medium" style={{ border: "1px solid #E5E2DC", color: "#6B6B6B" }}>Annuller</button>
          <button onClick={save} disabled={saving} className="flex-1 h-10 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: "#C8956C" }}>{saving ? "Gemmer…" : "Opret kontakt"}</button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Company Group Row ──────────────────────────────────────────────────────────
function CompanyFolder({ group, defaultOpen, onSelect }: { group: CompanyGroup; defaultOpen: boolean; onSelect: (id: string) => void }) {
  const [open, setOpen] = useState(defaultOpen);
  const activeCount = group.contacts.filter(c => c.status === "active").length;
  const trialCount = group.contacts.filter(c => c.status === "trial").length;

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "#E5E2DC" }}>
      {/* Folder header */}
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[#F8F6F3]"
        style={{ background: open ? "#F8F6F3" : "#fff" }}
        data-testid={`crm-company-${group.company ?? "ingen-firma"}`}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: group.company ? "rgba(200,149,108,0.15)" : "#F3F4F6" }}>
          {group.company ? <Building2 className="w-4 h-4" style={{ color: "#C8956C" }} /> : <User className="w-4 h-4" style={{ color: "#9CA3AF" }} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm" style={{ color: "#0F1D2F" }}>
            {group.company ?? "Ingen firma"}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs" style={{ color: "#9CA3AF" }}>
              <Users className="w-3 h-3 inline mr-0.5" />{group.contacts.length} bruger{group.contacts.length !== 1 ? "e" : ""}
            </span>
            {activeCount > 0 && <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "#F0FDF4", color: "#166534" }}>{activeCount} aktiv{activeCount !== 1 ? "e" : ""}</span>}
            {trialCount > 0 && <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "#FEF9C3", color: "#854D0E" }}>{trialCount} trial</span>}
          </div>
        </div>
        <ChevronDown className="w-4 h-4 flex-shrink-0 transition-transform" style={{ color: "#9CA3AF", transform: open ? "rotate(180deg)" : "rotate(0deg)" }} />
      </button>

      {/* Member rows */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }}>
            <div style={{ borderTop: "1px solid #F0EDE7" }}>
              {group.contacts.map((c, i) => (
                <button key={c.id} onClick={() => onSelect(c.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#F8F6F3]"
                  style={{ borderTop: i > 0 ? "1px solid #F8F6F3" : "none" }}
                  data-testid={`crm-contact-row-${c.id}`}>
                  {/* Avatar */}
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                    style={{ background: c.status === "active" ? "#16A34A" : c.status === "trial" ? "#CA8A04" : "#9CA3AF" }}>
                    {(c.name || c.email)[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate" style={{ color: "#0F1D2F" }}>
                      {c.name || <span style={{ color: "#9CA3AF" }}>—</span>}
                    </div>
                    <div className="text-xs truncate" style={{ color: "#9CA3AF" }}>{c.email}</div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <PlanBadge plan={c.plan} />
                    <StatusBadge status={c.status} />
                  </div>
                  <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: "#D1CEC9" }} />
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Contact List ───────────────────────────────────────────────────────────────
function ContactList({ onSelect }: { onSelect: (id: string) => void }) {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPlan, setFilterPlan] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [viewMode, setViewMode] = useState<"firma" | "liste">("firma");
  const qc = useQueryClient();

  const { data, isLoading, refetch, isFetching } = useQuery<{ contacts: Contact[]; total: number }>({
    queryKey: ["/api/crm/contacts", search, filterStatus, filterPlan],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (filterStatus) params.set("status", filterStatus);
      if (filterPlan) params.set("plan", filterPlan);
      return crmFetch(`/api/crm/contacts?${params}`).then(r => r.json());
    },
    enabled: !!auth.currentUser,
    staleTime: 0,
    retry: 1,
  });

  const contacts = data?.contacts ?? [];
  const groups = groupByCompany(contacts);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between mb-5 flex-shrink-0">
        <div>
          <h2 className="text-xl font-bold" style={{ color: "#0F1D2F" }}>CRM — Kontakter</h2>
          <p className="text-sm mt-0.5" style={{ color: "#6B6B6B" }}>
            {data?.total ?? 0} kontakter · {groups.filter(g => g.company).length} firmaer
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} disabled={isFetching}
            className="h-9 w-9 rounded-xl flex items-center justify-center transition-all hover:opacity-80 disabled:opacity-40"
            style={{ border: "1px solid #E5E2DC" }} title="Synkroniser brugere">
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} style={{ color: "#6B6B6B" }} />
          </button>
          <button onClick={() => setShowNew(true)} className="h-9 px-4 rounded-xl text-sm font-semibold text-white flex items-center gap-2"
            style={{ background: "#C8956C" }} data-testid="crm-new-contact">
            <Plus className="w-4 h-4" /> Ny kontakt
          </button>
        </div>
      </div>

      {/* Filters + view toggle */}
      <div className="flex gap-2 mb-4 flex-shrink-0 flex-wrap">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "#6B6B6B" }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Søg navn, email, firma…"
            className="w-full pl-9 pr-3 py-2 rounded-lg text-sm outline-none" style={{ border: "1px solid #E5E2DC", color: "#0F1D2F" }}
            data-testid="crm-search" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="rounded-lg px-3 py-2 text-sm outline-none" style={{ border: "1px solid #E5E2DC" }}>
          <option value="">Alle status</option>
          <option value="lead">Lead</option>
          <option value="trial">Trial</option>
          <option value="active">Aktiv</option>
          <option value="churned">Churned</option>
        </select>
        <select value={filterPlan} onChange={e => setFilterPlan(e.target.value)}
          className="rounded-lg px-3 py-2 text-sm outline-none" style={{ border: "1px solid #E5E2DC" }}>
          <option value="">Alle planer</option>
          <option value="none">Ingen plan</option>
          <option value="start">Start</option>
          <option value="pro">Pro</option>
          <option value="business">Business</option>
          <option value="enterprise">Enterprise</option>
        </select>
        {/* View toggle */}
        <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid #E5E2DC" }}>
          {(["firma","liste"] as const).map(v => (
            <button key={v} onClick={() => setViewMode(v)}
              className="px-3 py-2 text-xs font-medium transition-all"
              style={{ background: viewMode === v ? "#0F1D2F" : "#fff", color: viewMode === v ? "#fff" : "#6B6B6B" }}>
              {v === "firma" ? "🏢 Firma" : "📋 Liste"}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-sm" style={{ color: "#6B6B6B" }}>
            <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Synkroniserer brugere…
          </div>
        ) : contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <User className="w-8 h-8" style={{ color: "#D1CEC9" }} />
            <p className="text-sm" style={{ color: "#6B6B6B" }}>Ingen kontakter fundet</p>
          </div>
        ) : viewMode === "firma" ? (
          <div className="space-y-3 pb-4">
            {groups.map((group, i) => (
              <CompanyFolder key={group.company ?? "__none__"} group={group} defaultOpen={i === 0} onSelect={onSelect} />
            ))}
          </div>
        ) : (
          /* Flat list */
          <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "#E5E2DC" }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "#F8F6F3", borderBottom: "1px solid #E5E2DC" }}>
                  {["Navn / Email", "Firma", "Plan", "Status", "Score", "Aktiv"].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold" style={{ color: "#6B6B6B" }}>{h}</th>
                  ))}
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {contacts.map((c, i) => (
                  <tr key={c.id} onClick={() => onSelect(c.id)} className="cursor-pointer transition-colors hover:bg-[#F8F6F3]"
                    style={{ borderTop: i > 0 ? "1px solid #F0EDE7" : "none" }} data-testid={`crm-contact-row-${c.id}`}>
                    <td className="px-4 py-3">
                      <div className="font-medium" style={{ color: "#0F1D2F" }}>{c.name || <span style={{ color: "#9CA3AF" }}>—</span>}</div>
                      <div className="text-xs" style={{ color: "#6B6B6B" }}>{c.email}</div>
                    </td>
                    <td className="px-4 py-3 text-sm" style={{ color: "#6B6B6B" }}>{c.company || "—"}</td>
                    <td className="px-4 py-3"><PlanBadge plan={c.plan} /></td>
                    <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-14 h-1.5 rounded-full overflow-hidden" style={{ background: "#E5E2DC" }}>
                          <div className="h-full rounded-full" style={{ width: `${Math.min(c.engagementScore, 100)}%`, background: "#C8956C" }} />
                        </div>
                        <span className="text-xs" style={{ color: "#6B6B6B" }}>{c.engagementScore}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: "#6B6B6B" }}>{c.lastActiveAt ? fmtShort(c.lastActiveAt) : "—"}</td>
                    <td className="px-4 py-3"><ChevronRight className="w-4 h-4" style={{ color: "#D1CEC9" }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showNew && <NewContactModal onClose={() => setShowNew(false)} onCreated={() => qc.invalidateQueries({ queryKey: ["/api/crm/contacts"] })} />}
      </AnimatePresence>
    </div>
  );
}

// ── Contact Detail ─────────────────────────────────────────────────────────────
function ContactDetail({ contactId, onBack }: { contactId: string; onBack: () => void }) {
  const [newNote, setNewNote] = useState("");
  const [noteType, setNoteType] = useState("note");
  const [editField, setEditField] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");
  const [overrideKey, setOverrideKey] = useState("");
  const [overrideVal, setOverrideVal] = useState("");
  const [activeTab, setActiveTab] = useState<"timeline" | "overrides">("timeline");
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<{ contact: Contact; activities: Activity[]; interactions: Interaction[]; overrides: Override[] }>({
    queryKey: ["/api/crm/contacts", contactId],
    queryFn: () => crmFetch(`/api/crm/contacts/${contactId}`).then(r => r.json()),
  });

  const addNote = useMutation({
    mutationFn: () => crmReq("POST", `/api/crm/contacts/${contactId}/interactions`, { type: noteType, content: newNote, createdBy: "Admin" }),
    onSuccess: () => { setNewNote(""); qc.invalidateQueries({ queryKey: ["/api/crm/contacts", contactId] }); },
  });

  const updateContact = useMutation({
    mutationFn: (updates: Partial<Contact>) => crmReq("PATCH", `/api/crm/contacts/${contactId}`, updates),
    onSuccess: () => { setEditField(null); qc.invalidateQueries({ queryKey: ["/api/crm/contacts", contactId] }); qc.invalidateQueries({ queryKey: ["/api/crm/contacts"] }); },
  });

  const saveOverride = useMutation({
    mutationFn: () => crmReq("POST", `/api/crm/contacts/${contactId}/overrides`, { key: overrideKey, value: overrideVal }),
    onSuccess: () => { setOverrideKey(""); setOverrideVal(""); qc.invalidateQueries({ queryKey: ["/api/crm/contacts", contactId] }); },
  });

  const deleteOverride = useMutation({
    mutationFn: (key: string) => crmReq("DELETE", `/api/crm/contacts/${contactId}/overrides/${encodeURIComponent(key)}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/crm/contacts", contactId] }),
  });

  if (isLoading) return <div className="flex items-center justify-center h-40 text-sm" style={{ color: "#6B6B6B" }}>Indlæser…</div>;
  if (!data) return null;

  const { contact: c, activities, interactions, overrides } = data;
  const timeline = [...activities, ...interactions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const counts = {
    visualizations: activities.filter(a => a.type === "visualization").length,
    videos: activities.filter(a => a.type === "video").length,
    logins: activities.filter(a => a.type === "login").length,
    downloads: activities.filter(a => a.type === "download").length,
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center gap-4 mb-5 flex-shrink-0">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-medium" style={{ color: "#C8956C" }}>
          <ArrowLeft className="w-4 h-4" /> Alle kontakter
        </button>
        {c.company && (
          <span className="text-sm" style={{ color: "#9CA3AF" }}>
            / <Building2 className="w-3.5 h-3.5 inline mr-1" />{c.company}
          </span>
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-6 flex-1 overflow-hidden min-h-0">
        {/* LEFT: contact card */}
        <div className="w-full lg:w-72 flex-shrink-0 space-y-4 overflow-y-auto">
          <div className="rounded-2xl border p-5" style={{ borderColor: "#E5E2DC", background: "#fff" }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0"
                style={{ background: c.status === "active" ? "#16A34A" : c.status === "trial" ? "#CA8A04" : "#C8956C" }}>
                {(c.name || c.email)[0].toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="font-semibold truncate" style={{ color: "#0F1D2F" }}>{c.name || c.email}</div>
                <div className="text-xs truncate" style={{ color: "#6B6B6B" }}>{c.email}</div>
                {c.company && <div className="text-xs mt-0.5 font-medium" style={{ color: "#C8956C" }}>{c.company}</div>}
              </div>
            </div>

            <div className="flex gap-2 mb-5">
              <PlanBadge plan={c.plan} />
              <StatusBadge status={c.status} />
            </div>

            {([
              ["name", "Navn", c.name, "text"],
              ["company", "Firma", c.company, "text"],
              ["phone", "Telefon", c.phone, "tel"],
            ] as [string, string, string | undefined, string][]).map(([field, label, val]) => (
              <div key={field} className="mb-3">
                <label className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "#9CA3AF" }}>{label}</label>
                {editField === field ? (
                  <div className="flex gap-1 mt-1">
                    <input value={editVal} onChange={e => setEditVal(e.target.value)} autoFocus
                      className="flex-1 rounded-lg px-2 py-1 text-sm outline-none" style={{ border: "1px solid #C8956C" }} />
                    <button onClick={() => updateContact.mutate({ [field]: editVal } as any)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "#F0FDF4" }}>
                      <Check className="w-3.5 h-3.5" style={{ color: "#16A34A" }} />
                    </button>
                    <button onClick={() => setEditField(null)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "#FEF2F2" }}>
                      <X className="w-3.5 h-3.5" style={{ color: "#DC2626" }} />
                    </button>
                  </div>
                ) : (
                  <div onClick={() => { setEditField(field); setEditVal(val ?? ""); }}
                    className="mt-0.5 text-sm cursor-pointer rounded px-1 py-0.5 hover:bg-[#F8F6F3] transition-colors" style={{ color: val ? "#0F1D2F" : "#9CA3AF" }}>
                    {val || "Klik for at redigere…"}
                  </div>
                )}
              </div>
            ))}

            <div className="grid grid-cols-2 gap-2 mt-4">
              <div>
                <label className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "#9CA3AF" }}>Plan</label>
                <select value={c.plan} onChange={e => updateContact.mutate({ plan: e.target.value })}
                  className="w-full mt-0.5 rounded-lg px-2 py-1.5 text-xs outline-none" style={{ border: "1px solid #E5E2DC" }}>
                  {["none","start","pro","business","enterprise"].map(p => <option key={p} value={p}>{p === "none" ? "Ingen plan" : p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "#9CA3AF" }}>Status</label>
                <select value={c.status} onChange={e => updateContact.mutate({ status: e.target.value })}
                  className="w-full mt-0.5 rounded-lg px-2 py-1.5 text-xs outline-none" style={{ border: "1px solid #E5E2DC" }}>
                  {["lead","trial","active","churned"].map(s => <option key={s} value={s}>{STATUS[s]?.label ?? s}</option>)}
                </select>
              </div>
            </div>

            <div className="mt-4 pt-4" style={{ borderTop: "1px solid #F0EDE7" }}>
              <label className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "#9CA3AF" }}>Engagement score</label>
              <div className="mt-1 flex items-center gap-3">
                <input type="range" min={0} max={100} value={c.engagementScore}
                  onChange={e => updateContact.mutate({ engagementScore: Number(e.target.value) })}
                  className="flex-1 h-1.5 rounded-full cursor-pointer" style={{ accentColor: "#C8956C" }} />
                <span className="text-sm font-semibold w-8 text-right" style={{ color: "#0F1D2F" }}>{c.engagementScore}</span>
              </div>
            </div>

            <div className="mt-4 pt-4 text-xs space-y-1" style={{ borderTop: "1px solid #F0EDE7", color: "#9CA3AF" }}>
              <div className="flex items-center gap-1.5"><Calendar className="w-3 h-3" /> Oprettet {fmt(c.createdAt)}</div>
              {c.lastActiveAt && <div className="flex items-center gap-1.5"><Activity className="w-3 h-3" /> Aktiv {fmt(c.lastActiveAt)}</div>}
              {c.linkedUserId && <div className="flex items-center gap-1.5"><Shield className="w-3 h-3" /> Bruger-ID #{c.linkedUserId}</div>}
            </div>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-2">
            {[["🖼️", "Billeder", counts.visualizations], ["🎬", "Videoer", counts.videos], ["🔑", "Logins", counts.logins], ["⬇️", "Downloads", counts.downloads]].map(([icon, label, val]) => (
              <div key={label as string} className="rounded-xl border p-3 text-center" style={{ borderColor: "#E5E2DC", background: "#fff" }}>
                <div className="text-xl">{icon}</div>
                <div className="text-lg font-bold mt-0.5" style={{ color: "#0F1D2F" }}>{val}</div>
                <div className="text-[11px]" style={{ color: "#9CA3AF" }}>{label}</div>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border p-4" style={{ borderColor: "#E5E2DC", background: "#fff" }}>
            <label className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "#9CA3AF" }}>Interne noter</label>
            <textarea rows={4} defaultValue={c.notes ?? ""} placeholder="Fri tekst til dig selv…"
              onBlur={e => { if (e.target.value !== (c.notes ?? "")) updateContact.mutate({ notes: e.target.value }); }}
              className="mt-1 w-full text-sm rounded-lg px-3 py-2 outline-none resize-none" style={{ border: "1px solid #E5E2DC", color: "#0F1D2F" }} />
          </div>
        </div>

        {/* RIGHT: tabs */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <div className="flex gap-1 mb-4 flex-shrink-0">
            {([["timeline", "📋 Timeline"], ["overrides", "⚙️ Bruger-overrides"]] as [string, string][]).map(([key, label]) => (
              <button key={key} onClick={() => setActiveTab(key as any)}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
                style={{ background: activeTab === key ? "#0F1D2F" : "transparent", color: activeTab === key ? "#fff" : "#6B6B6B" }}>
                {label}
              </button>
            ))}
          </div>

          {activeTab === "timeline" && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex gap-2 mb-4 flex-shrink-0">
                <select value={noteType} onChange={e => setNoteType(e.target.value)}
                  className="rounded-lg px-2 py-2 text-sm outline-none" style={{ border: "1px solid #E5E2DC" }}>
                  <option value="note">📝 Notat</option>
                  <option value="call">📞 Opkald</option>
                  <option value="email">📧 Email</option>
                  <option value="support">🛠️ Support</option>
                </select>
                <input value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Skriv notat, opkald, samtale…"
                  onKeyDown={e => { if (e.key === "Enter" && newNote.trim()) addNote.mutate(); }}
                  className="flex-1 rounded-lg px-3 py-2 text-sm outline-none" style={{ border: "1px solid #E5E2DC", color: "#0F1D2F" }}
                  data-testid="crm-note-input" />
                <button onClick={() => { if (newNote.trim()) addNote.mutate(); }} disabled={!newNote.trim() || addNote.isPending}
                  className="h-10 px-4 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                  style={{ background: "#C8956C" }} data-testid="crm-add-note">
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {timeline.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 gap-2">
                    <MessageSquare className="w-8 h-8" style={{ color: "#D1CEC9" }} />
                    <p className="text-sm" style={{ color: "#6B6B6B" }}>Ingen aktivitet endnu</p>
                  </div>
                ) : timeline.map(item => (
                  <div key={item.id} className="flex gap-3 rounded-xl px-4 py-3 text-sm" style={{ background: "#F8F6F3" }}>
                    <span className="text-base flex-shrink-0">{ACT_ICON[item.type] ?? "•"}</span>
                    <div className="flex-1 min-w-0">
                      <div style={{ color: "#0F1D2F" }}>{(item as any).content || (item as any).description || item.type}</div>
                      {"createdBy" in item && (item as Interaction).createdBy && (
                        <div className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>af {(item as Interaction).createdBy}</div>
                      )}
                    </div>
                    <span className="text-xs flex-shrink-0 self-start mt-0.5" style={{ color: "#9CA3AF" }}>{fmtShort(item.createdAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "overrides" && (
            <div className="flex-1 overflow-y-auto">
              <div className="rounded-2xl border p-5 mb-4" style={{ borderColor: "#E5E2DC", background: "#fff" }}>
                <p className="text-sm mb-4" style={{ color: "#6B6B6B" }}>
                  Tilføj nøgle/værdi-par der kun gælder for <strong>{c.name || c.email}</strong>.
                </p>
                <div className="flex gap-2 mb-4">
                  <input value={overrideKey} onChange={e => setOverrideKey(e.target.value)} placeholder="nøgle (fx layout_mode)"
                    className="flex-1 rounded-lg px-3 py-2 text-sm outline-none font-mono" style={{ border: "1px solid #E5E2DC" }} />
                  <input value={overrideVal} onChange={e => setOverrideVal(e.target.value)} placeholder="værdi (fx compact)"
                    className="flex-1 rounded-lg px-3 py-2 text-sm outline-none" style={{ border: "1px solid #E5E2DC" }} />
                  <button onClick={() => { if (overrideKey.trim() && overrideVal.trim()) saveOverride.mutate(); }}
                    disabled={!overrideKey.trim() || !overrideVal.trim() || saveOverride.isPending}
                    className="h-10 px-4 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                    style={{ background: "#0F1D2F" }} data-testid="crm-save-override">
                    Gem
                  </button>
                </div>
                <div className="space-y-2">
                  {overrides.length === 0 ? (
                    <p className="text-sm text-center py-4" style={{ color: "#9CA3AF" }}>Ingen overrides endnu</p>
                  ) : overrides.map(ov => (
                    <div key={ov.id} className="flex items-center gap-3 rounded-xl px-4 py-2.5" style={{ background: "#F8F6F3" }}>
                      <code className="text-xs font-mono flex-1" style={{ color: "#0F1D2F" }}>{ov.overrideKey}</code>
                      <span className="text-xs px-2 py-0.5 rounded" style={{ background: "#E5E2DC", color: "#0F1D2F" }}>{ov.overrideValue}</span>
                      <span className="text-[11px]" style={{ color: "#9CA3AF" }}>{fmtShort(ov.updatedAt)}</span>
                      <button onClick={() => deleteOverride.mutate(ov.overrideKey)}
                        className="w-6 h-6 rounded flex items-center justify-center hover:bg-red-50 transition-colors"
                        data-testid={`crm-delete-override-${ov.overrideKey}`}>
                        <Trash2 className="w-3.5 h-3.5" style={{ color: "#EF4444" }} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Export ────────────────────────────────────────────────────────────────
export function CrmView() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div className="h-full">
      <AnimatePresence mode="wait">
        {selectedId ? (
          <motion.div key="detail" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.18 }} className="h-full">
            <ContactDetail contactId={selectedId} onBack={() => setSelectedId(null)} />
          </motion.div>
        ) : (
          <motion.div key="list" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} transition={{ duration: 0.18 }} className="h-full">
            <ContactList onSelect={setSelectedId} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
