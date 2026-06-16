import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Search, User, RefreshCw, Zap, MessageSquare, Check, X, ChevronRight, Building2 } from "lucide-react";
import { auth } from "@/lib/firebase";

// ── Auth fetch helper ─────────────────────────────────────────────────────────
async function cf(url: string, opts?: RequestInit) {
  const token = await auth.currentUser?.getIdToken();
  const headers: Record<string, string> = {
    ...(opts?.body ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const res = await fetch(url, { ...opts, headers });
  if (!res.ok) { const t = await res.text(); throw new Error(t); }
  return res.json();
}

// ── Types ─────────────────────────────────────────────────────────────────────
type Contact = {
  id: string; email: string; name?: string; company?: string; phone?: string;
  plan: string; status: string; notes?: string; linkedUserId?: number;
  createdAt: string; lastActiveAt?: string;
  creditsRemaining?: number; totalCreditsUsed?: number;
};
type Interaction = { id: string; contactId: string; type: string; content: string; createdBy?: string; createdAt: string };
type QuotaItem = { limit: number | null; used: number };
type Quota = { ai: QuotaItem; floorPlan: QuotaItem; transformVideo: QuotaItem; showcase: QuotaItem; resetsAt: string | null };
type Detail = {
  contact: Contact & { creditsRemaining?: number; totalCreditsUsed?: number };
  interactions: Interaction[];
  stats: { totalGenerations: number; totalVideos: number; lastGeneratedAt: string | null };
  quota?: Quota;
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (d: string) => new Date(d).toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" });
const fmtFull = (d: string) => new Date(d).toLocaleString("da-DK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const STATUS: Record<string, { bg: string; text: string; label: string; dot: string }> = {
  lead:    { bg: "#EFF6FF", text: "#1D4ED8", label: "Lead",    dot: "#3B82F6" },
  trial:   { bg: "#FFF7ED", text: "#9A3412", label: "Trial",   dot: "#F97316" },
  active:  { bg: "#F0FDF4", text: "#166534", label: "Aktiv",   dot: "#22C55E" },
  churned: { bg: "#FEF2F2", text: "#991B1B", label: "Churned", dot: "#EF4444" },
};
const PLANS = ["none","start","pro","business","enterprise"];
const PLAN_LABEL: Record<string, string> = { none: "Ingen plan", start: "Start", pro: "Pro", business: "Business", enterprise: "Enterprise" };

const QUICK = [10, 25, 50, 100];
const TIMELINE_ICONS: Record<string, string> = { note: "📝", email: "📧", credit: "💰", plan_change: "🔄", visualization: "🖼️", login: "🔑", video: "🎬" };

function StatusDot({ status }: { status: string }) {
  const s = STATUS[status] ?? { dot: "#94A3B8" };
  return <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.dot }} />;
}
function Badge({ status }: { status: string }) {
  const s = STATUS[status] ?? { bg: "#F1F5F9", text: "#475569", label: status };
  return <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: s.bg, color: s.text }}>{s.label ?? status}</span>;
}

// ── New Contact Modal ─────────────────────────────────────────────────────────
function NewContactModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ email: "", name: "", company: "", phone: "", plan: "none", status: "lead" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const save = async () => {
    if (!f.email) { setErr("Email er påkrævet"); return; }
    setSaving(true); setErr("");
    try { await cf("/api/crm/contacts", { method: "POST", body: JSON.stringify(f) }); onDone(); onClose(); }
    catch (e: any) { setErr(e.message ?? "Fejl"); setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 m-4" onClick={e => e.stopPropagation()}>
        <h2 className="text-base font-semibold mb-4" style={{ color: "#0F172A" }}>Ny kontakt</h2>
        <div className="space-y-3">
          {[["Email *","email","email"],["Navn","name","text"],["Firma","company","text"],["Telefon","phone","tel"]] .map(([lbl,key,type]) => (
            <div key={key}>
              <label className="block text-xs text-slate-500 mb-1">{lbl}</label>
              <input type={type} value={(f as any)[key]} onChange={e => setF(p => ({ ...p, [key]: e.target.value }))}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none border border-slate-200 focus:border-sky-400" />
            </div>
          ))}
          <div className="grid grid-cols-2 gap-3">
            {[["Plan","plan",PLANS.map(p => [p,PLAN_LABEL[p]])],["Status","status",[["lead","Lead"],["trial","Trial"],["active","Aktiv"],["churned","Churned"]]]] .map(([lbl,key,opts]) => (
              <div key={key as string}>
                <label className="block text-xs text-slate-500 mb-1">{lbl as string}</label>
                <select value={(f as any)[key as string]} onChange={e => setF(p => ({ ...p, [key as string]: e.target.value }))}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none border border-slate-200">
                  {(opts as [string,string][]).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
        {err && <p className="text-xs text-red-500 mt-2">{err}</p>}
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 h-9 rounded-xl text-sm border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors">Annuller</button>
          <button onClick={save} disabled={saving} className="flex-1 h-9 rounded-xl text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: "#0ea5e9" }}>{saving ? "Gemmer…" : "Opret"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Credits Panel (middle column) ─────────────────────────────────────────────
function CreditsPanel({ contact, detail, onRefresh, isOwner }: { contact: Contact; detail: Detail; onRefresh: () => void; isOwner: boolean }) {
  const [customAmt, setCustomAmt] = useState("");
  const [note, setNote] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [liveCredits, setLiveCredits] = useState(contact.creditsRemaining ?? 0);
  const [success, setSuccess] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => { setLiveCredits(contact.creditsRemaining ?? 0); }, [contact.creditsRemaining]);

  const addCredits = async (amount: number) => {
    if (!contact.linkedUserId || adding) return;
    setAdding(true); setErr("");
    try {
      const res = await cf(`/api/crm/contacts/${contact.id}/credits/add`, {
        method: "POST", body: JSON.stringify({ amount, note }),
      });
      setLiveCredits(res.creditsRemaining);
      setSuccess(amount);
      setCustomAmt(""); setNote(""); setShowAddForm(false);
      setTimeout(() => setSuccess(null), 3000);
      onRefresh();
    } catch (e: any) {
      setErr(e.message?.replace(/^\d+:\s*/, "").replace(/^\{"error":"([^"]+)"\}$/, "$1") ?? "Fejl");
      setTimeout(() => setErr(""), 4000);
    } finally { setAdding(false); }
  };

  const handleCustom = () => {
    const n = parseInt(customAmt);
    if (!n || n < 1 || n > 10000) { setErr("Angiv 1–10.000"); return; }
    addCredits(n);
  };

  const q = detail.quota;
  const creditColor = liveCredits === 0 ? "#EF4444" : liveCredits < 5 ? "#F97316" : "#16A34A";

  return (
    <div className="space-y-4">
      {/* Credits balance */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Credits</span>
          {liveCredits === 0 && (
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-600">⚠ Blokeret</span>
          )}
        </div>
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-4xl font-bold tabular-nums" style={{ color: creditColor }}>{liveCredits.toLocaleString("da-DK")}</span>
          <span className="text-sm text-slate-400">tilbage</span>
          {success !== null && <span className="text-xs font-semibold text-green-600 animate-pulse">+{success} tilføjet ✓</span>}
        </div>
        <p className="text-xs text-slate-400">{(contact.totalCreditsUsed ?? 0).toLocaleString("da-DK")} brugt i alt</p>

        {/* Quick add — only for owner */}
        {isOwner && contact.linkedUserId && (
          <div className="mt-4">
            <div className="grid grid-cols-4 gap-1.5 mb-2">
              {QUICK.map(n => (
                <button key={n} onClick={() => addCredits(n)} disabled={adding}
                  className="h-8 rounded-lg text-xs font-semibold border border-slate-200 hover:border-sky-400 hover:text-sky-600 transition-colors disabled:opacity-40"
                  style={{ background: "#F8FAFC" }} data-testid={`crm-add-credits-${n}`}>
                  +{n}
                </button>
              ))}
            </div>
            <button onClick={() => setShowAddForm(v => !v)}
              className="w-full h-9 rounded-xl text-sm font-medium text-white transition-opacity hover:opacity-90"
              style={{ background: "#0ea5e9" }} data-testid="crm-add-credits-custom">
              <Plus className="w-4 h-4 inline mr-1" />Tilføj credits
            </button>
            {showAddForm && (
              <div className="mt-3 space-y-2 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex gap-2">
                  <input type="number" min={1} max={10000} value={customAmt} onChange={e => setCustomAmt(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleCustom(); }}
                    placeholder="Antal…" className="flex-1 h-8 rounded-lg px-3 text-sm border border-slate-200 outline-none focus:border-sky-400" />
                  <button onClick={handleCustom} disabled={adding || !customAmt}
                    className="h-8 px-3 rounded-lg text-sm font-medium text-white disabled:opacity-40" style={{ background: "#0ea5e9" }}>
                    Giv
                  </button>
                </div>
                <input value={note} onChange={e => setNote(e.target.value)}
                  placeholder="Note (valgfri)…" className="w-full h-8 rounded-lg px-3 text-sm border border-slate-200 outline-none focus:border-sky-400" />
              </div>
            )}
            {err && <p className="text-xs text-red-500 mt-1">{err}</p>}
          </div>
        )}
        {!contact.linkedUserId && (
          <p className="text-xs text-slate-400 mt-3">Ingen tilknyttet brugerkonto — credits kan ikke tildeles</p>
        )}
      </div>

      {/* Quota breakdown */}
      {q && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Kvota denne måned</p>
          {([
            ["🖼️","AI Visualiseringer", q.ai],
            ["📐","3D Plantegninger", q.floorPlan],
            ["🎬","Videoer", q.transformVideo],
            ["🏡","Bolig Showcase", q.showcase],
          ] as [string, string, QuotaItem][]).map(([icon, label, qi]) => {
            const pct = qi.limit ? Math.min(100, (qi.used / qi.limit) * 100) : 0;
            const over = qi.limit !== null && qi.used >= qi.limit;
            return (
              <div key={label} className="mb-3 last:mb-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-slate-600">{icon} {label}</span>
                  <span className="text-xs font-mono text-slate-400">{qi.used}/{qi.limit ?? "∞"}</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: over ? "#EF4444" : "#0ea5e9" }} />
                </div>
              </div>
            );
          })}
          {q.resetsAt && <p className="text-[11px] text-slate-400 mt-2">Nulstilles {fmt(q.resetsAt)}</p>}
        </div>
      )}

      {/* Usage stats */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Aktivitet</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-slate-50 p-3 text-center">
            <div className="text-2xl font-bold text-slate-800">{detail.stats.totalGenerations}</div>
            <div className="text-xs text-slate-400 mt-0.5">Genereringer i alt</div>
          </div>
          <div className="rounded-xl bg-slate-50 p-3 text-center">
            <div className="text-2xl font-bold text-slate-800">{detail.stats.totalVideos}</div>
            <div className="text-xs text-slate-400 mt-0.5">Videoer i alt</div>
          </div>
        </div>
        {detail.stats.lastGeneratedAt && (
          <p className="text-xs text-slate-400 mt-3">Senest aktiv {fmt(detail.stats.lastGeneratedAt)}</p>
        )}
      </div>
    </div>
  );
}

// ── Timeline Panel (right column) ─────────────────────────────────────────────
function TimelinePanel({ contact, interactions, onRefresh }: { contact: Contact; interactions: Interaction[]; onRefresh: () => void }) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const addNote = async () => {
    if (!note.trim()) return;
    setSaving(true); setErr("");
    try {
      await cf(`/api/crm/contacts/${contact.id}/interactions`, { method: "POST", body: JSON.stringify({ type: "note", content: note.trim() }) });
      setNote(""); onRefresh();
    } catch (e: any) { setErr(e.message ?? "Fejl"); }
    setSaving(false);
  };

  const combined = [...interactions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col h-full" style={{ minHeight: "400px" }}>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Timeline</p>

      {/* Add note */}
      <div className="mb-4">
        <textarea value={note} onChange={e => setNote(e.target.value)}
          placeholder="Tilføj notat…"
          rows={2}
          className="w-full rounded-xl px-3 py-2 text-sm border border-slate-200 outline-none focus:border-sky-400 resize-none"
          onKeyDown={e => { if (e.key === "Enter" && e.ctrlKey) addNote(); }}
        />
        {err && <p className="text-xs text-red-500 mt-1">{err}</p>}
        <button onClick={addNote} disabled={saving || !note.trim()}
          className="mt-1.5 h-8 px-4 rounded-xl text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          style={{ background: "#0ea5e9" }}>
          {saving ? "Gemmer…" : "Gem notat"}
        </button>
      </div>

      {/* Entries */}
      <div className="flex-1 overflow-y-auto space-y-3">
        {combined.length === 0 && (
          <div className="text-center py-8 text-slate-400 text-sm">Ingen aktivitet endnu</div>
        )}
        {combined.map(item => (
          <div key={item.id} className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-sm flex-shrink-0 mt-0.5">
              {TIMELINE_ICONS[item.type] ?? "📌"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-slate-700 leading-relaxed">{item.content}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[11px] text-slate-400">{fmtFull(item.createdAt)}</span>
                {item.createdBy && <span className="text-[11px] text-slate-400">· {item.createdBy.split("@")[0]}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Info Panel (left column) ──────────────────────────────────────────────────
function InfoPanel({ contact, onUpdated }: { contact: Contact; onUpdated: () => void }) {
  const [form, setForm] = useState({ name: contact.name ?? "", company: contact.company ?? "", phone: contact.phone ?? "", plan: contact.plan, status: contact.status });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setForm({ name: contact.name ?? "", company: contact.company ?? "", phone: contact.phone ?? "", plan: contact.plan, status: contact.status }); }, [contact.id]);

  const save = async () => {
    setSaving(true);
    try {
      await cf(`/api/crm/contacts/${contact.id}`, { method: "PATCH", body: JSON.stringify(form) });
      setSaved(true); setTimeout(() => setSaved(false), 2000); onUpdated();
    } catch {}
    setSaving(false);
  };

  const isDirty = form.name !== (contact.name ?? "") || form.company !== (contact.company ?? "") || form.phone !== (contact.phone ?? "") || form.plan !== contact.plan || form.status !== contact.status;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      {/* Avatar + email */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0"
          style={{ background: contact.status === "active" ? "#22C55E" : contact.status === "trial" ? "#F97316" : contact.status === "lead" ? "#3B82F6" : "#94A3B8" }}>
          {(contact.name || contact.email)[0].toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-slate-900 truncate">{contact.name || <span className="text-slate-400">Intet navn</span>}</p>
          <p className="text-xs text-slate-500 truncate">{contact.email}</p>
        </div>
      </div>

      <div className="space-y-3">
        {([["Navn","name","text"],["Firma","company","text"],["Telefon","phone","tel"]] as [string,string,string][]).map(([lbl,key,type]) => (
          <div key={key}>
            <label className="block text-xs text-slate-400 mb-1">{lbl}</label>
            <input type={type} value={(form as any)[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
              className="w-full rounded-xl px-3 py-2 text-sm border border-slate-200 outline-none focus:border-sky-400" />
          </div>
        ))}

        <div>
          <label className="block text-xs text-slate-400 mb-1">Status</label>
          <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
            className="w-full rounded-xl px-3 py-2 text-sm border border-slate-200 outline-none focus:border-sky-400">
            {Object.entries(STATUS).map(([v, s]) => <option key={v} value={v}>{s.label}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1">Plan</label>
          <select value={form.plan} onChange={e => setForm(p => ({ ...p, plan: e.target.value }))}
            className="w-full rounded-xl px-3 py-2 text-sm border border-slate-200 outline-none focus:border-sky-400">
            {PLANS.map(p => <option key={p} value={p}>{PLAN_LABEL[p]}</option>)}
          </select>
        </div>

        <div className="pt-1">
          <label className="block text-xs text-slate-400 mb-1">Oprettet</label>
          <p className="text-sm text-slate-600">{fmt(contact.createdAt)}</p>
        </div>
      </div>

      {isDirty && (
        <button onClick={save} disabled={saving}
          className="mt-4 w-full h-9 rounded-xl text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: "#0ea5e9" }} data-testid="crm-save-contact">
          {saving ? "Gemmer…" : saved ? "✓ Gemt" : "Gem ændringer"}
        </button>
      )}
      {saved && !isDirty && <p className="mt-2 text-xs text-center text-green-600 font-medium">✓ Gemt</p>}
    </div>
  );
}

// ── Contact Detail ────────────────────────────────────────────────────────────
function ContactDetail({ contactId, onBack, isOwner }: { contactId: string; onBack: () => void; isOwner: boolean }) {
  const qc = useQueryClient();

  const { data, isLoading, refetch } = useQuery<Detail>({
    queryKey: ["/api/crm/contacts", contactId],
    queryFn: () => cf(`/api/crm/contacts/${contactId}`),
    refetchInterval: 15000,
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-40">
      <div className="w-5 h-5 rounded-full border-2 border-sky-200 border-t-sky-500 animate-spin" />
    </div>
  );
  if (!data) return null;

  const { contact, interactions, stats, quota } = data;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-medium mb-5 flex-shrink-0 text-sky-500 hover:text-sky-600 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Alle kontakter
      </button>

      {/* 3-column layout */}
      <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-3 gap-4 pb-4">
        {/* Col 1: Info */}
        <InfoPanel contact={contact} onUpdated={() => { refetch(); qc.invalidateQueries({ queryKey: ["/api/crm/contacts"] }); }} />

        {/* Col 2: Credits */}
        <CreditsPanel
          contact={contact}
          detail={{ contact, interactions, stats, quota }}
          onRefresh={() => refetch()}
          isOwner={isOwner}
        />

        {/* Col 3: Timeline */}
        <TimelinePanel contact={contact} interactions={interactions} onRefresh={() => refetch()} />
      </div>
    </div>
  );
}

// ── Main CRM View ─────────────────────────────────────────────────────────────
export function CrmView({ isOwner = false }: { isOwner?: boolean }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const qc = useQueryClient();

  const { data, isLoading, refetch } = useQuery<{ contacts: Contact[]; total: number }>({
    queryKey: ["/api/crm/contacts", search, filter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (filter !== "all") params.set("status", filter);
      return cf(`/api/crm/contacts?${params.toString()}`);
    },
    refetchInterval: 30000,
  });

  const contacts = data?.contacts ?? [];

  // Stats
  const stats = {
    all: contacts.length,
    lead: contacts.filter(c => c.status === "lead").length,
    trial: contacts.filter(c => c.status === "trial").length,
    active: contacts.filter(c => c.status === "active").length,
    churned: contacts.filter(c => c.status === "churned").length,
  };

  if (selectedId) {
    return (
      <ContactDetail
        contactId={selectedId}
        onBack={() => setSelectedId(null)}
        isOwner={isOwner}
      />
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {showNew && <NewContactModal onClose={() => setShowNew(false)} onDone={() => { refetch(); }} />}

      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div>
          <h2 className="text-lg font-bold text-slate-900">CRM</h2>
          <p className="text-xs text-slate-400">{data?.total ?? 0} kontakter</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} className="h-8 w-8 rounded-xl border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-colors" data-testid="crm-refresh">
            <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
          </button>
          <button onClick={() => setShowNew(true)}
            className="h-8 px-3 rounded-xl text-sm font-medium text-white flex items-center gap-1.5 transition-opacity hover:opacity-90"
            style={{ background: "#0ea5e9" }} data-testid="crm-new-contact">
            <Plus className="w-3.5 h-3.5" /> Ny kontakt
          </button>
        </div>
      </div>

      {/* Search + filter */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4 flex-shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Søg på navn, email eller firma…"
            className="w-full pl-9 pr-4 h-9 rounded-xl text-sm border border-slate-200 outline-none focus:border-sky-400"
            data-testid="crm-search" />
        </div>
        <div className="flex gap-1">
          {(["all","lead","trial","active","churned"] as const).map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className="h-9 px-3 rounded-xl text-xs font-medium transition-all"
              style={{
                background: filter === s ? "#0ea5e9" : "#F8FAFC",
                color: filter === s ? "#fff" : "#64748B",
                border: filter === s ? "none" : "1px solid #E2E8F0"
              }}
              data-testid={`crm-filter-${s}`}>
              {s === "all" ? `Alle (${stats.all})` : `${STATUS[s]?.label} (${(stats as any)[s]})`}
            </button>
          ))}
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-2 mb-4 flex-shrink-0">
        {[
          { label: "Aktive betalere", value: stats.active, color: "#22C55E", bg: "#F0FDF4" },
          { label: "Trials", value: stats.trial, color: "#F97316", bg: "#FFF7ED" },
          { label: "Leads", value: stats.lead, color: "#3B82F6", bg: "#EFF6FF" },
          { label: "Churned", value: stats.churned, color: "#EF4444", bg: "#FEF2F2" },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className="rounded-xl border border-slate-200 p-3 text-center" style={{ background: bg }}>
            <div className="text-2xl font-bold" style={{ color }}>{value}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto rounded-2xl border border-slate-200 bg-white">
        {isLoading && (
          <div className="flex items-center justify-center h-20">
            <div className="w-5 h-5 rounded-full border-2 border-sky-200 border-t-sky-500 animate-spin" />
          </div>
        )}

        {!isLoading && contacts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <User className="w-10 h-10 text-slate-200 mb-3" />
            <p className="text-sm text-slate-400">Ingen kontakter fundet</p>
          </div>
        )}

        {contacts.length > 0 && (
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: "1px solid #F1F5F9" }}>
                {["Navn / Email", "Firma", "Plan", "Status", "Credits", "Oprettet"].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{h}</th>
                ))}
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {contacts.map((c, i) => {
                const creditColor = (c.creditsRemaining ?? 0) === 0 ? "#EF4444" : (c.creditsRemaining ?? 0) < 5 ? "#F97316" : "#16A34A";
                return (
                  <tr key={c.id} onClick={() => setSelectedId(c.id)}
                    className="cursor-pointer transition-colors hover:bg-slate-50"
                    style={{ borderTop: i > 0 ? "1px solid #F8FAFC" : "none" }}
                    data-testid={`crm-row-${c.id}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                          style={{ background: c.status === "active" ? "#22C55E" : c.status === "trial" ? "#F97316" : c.status === "lead" ? "#3B82F6" : "#94A3B8" }}>
                          {(c.name || c.email)[0].toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-900 truncate max-w-[140px]">{c.name || <span className="text-slate-400">—</span>}</div>
                          <div className="text-xs text-slate-400 truncate max-w-[140px]">{c.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {c.company && <Building2 className="w-3 h-3 text-slate-400 flex-shrink-0" />}
                        <span className="text-sm text-slate-600 truncate max-w-[100px]">{c.company || <span className="text-slate-300">—</span>}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-slate-600">{PLAN_LABEL[c.plan] ?? c.plan}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <StatusDot status={c.status} />
                        <Badge status={c.status} />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {c.creditsRemaining !== undefined ? (
                        <span className="text-sm font-bold tabular-nums" style={{ color: creditColor }}>
                          {c.creditsRemaining.toLocaleString("da-DK")}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-slate-400">{fmt(c.createdAt)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <ChevronRight className="w-4 h-4 text-slate-300" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
