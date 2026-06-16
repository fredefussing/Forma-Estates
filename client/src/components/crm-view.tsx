import { useState, useEffect, Fragment } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Plus, Search, User, RefreshCw, ChevronRight,
  Building2, Users, Zap, Check,
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
type Contact = {
  id: string; email: string; name?: string; company?: string; phone?: string;
  plan: string; status: string; notes?: string; linkedUserId?: number;
  createdAt: string;
  // enriched
  creditsRemaining?: number; totalCreditsUsed?: number;
  subscriptionTier?: string; subscriptionStatus?: string;
  quotaAi?: number | null; quotaFloor?: number | null; quotaVideo?: number | null; quotaShowcase?: number | null;
  usedAi?: number; usedFloor?: number; usedVideo?: number; usedShowcase?: number;
  teamId?: number; teamName?: string;
};
type Interaction = { id: string; type: string; content: string; createdBy?: string; createdAt: string };
type QuotaItem = { limit: number | null; used: number };
type Quota = { ai: QuotaItem; floorPlan: QuotaItem; transformVideo: QuotaItem; showcase: QuotaItem; resetsAt: string | null };
type Detail = { contact: Contact; interactions: Interaction[]; stats: { totalGenerations: number; totalVideos: number; lastGeneratedAt: string | null }; quota?: Quota };

// ── Design tokens ─────────────────────────────────────────────────────────────
const PRIMARY = "#0ea5e9";
const STATUS: Record<string, { bg: string; text: string; label: string; dot: string }> = {
  lead:    { bg: "#EFF6FF", text: "#1D4ED8", label: "Lead",    dot: "#3B82F6" },
  trial:   { bg: "#FFF7ED", text: "#9A3412", label: "Trial",   dot: "#F97316" },
  active:  { bg: "#F0FDF4", text: "#166534", label: "Aktiv",   dot: "#22C55E" },
  churned: { bg: "#FEF2F2", text: "#991B1B", label: "Churned", dot: "#EF4444" },
};
const TIERS: { value: string; label: string; ai: number | null; fp: number | null; tv: number | null; sv: number | null }[] = [
  { value: "none",      label: "Ingen plan",  ai: 0,    fp: 0,    tv: 0,    sv: 0    },
  { value: "start",     label: "Start",       ai: 10,   fp: 2,    tv: 2,    sv: 1    },
  { value: "pro",       label: "Pro",         ai: 25,   fp: 5,    tv: 5,    sv: 3    },
  { value: "business",  label: "Business",    ai: 60,   fp: 12,   tv: 12,   sv: 8    },
  { value: "unlimited", label: "Unlimited",   ai: null, fp: null, tv: null, sv: null },
];
const QUOTA_TYPES = [
  { key: "ai",          icon: "🖼️", label: "AI Visualiseringer", qKey: "quotaAi",      uKey: "usedAi"      },
  { key: "floorPlan",   icon: "📐", label: "3D Plantegninger",   qKey: "quotaFloor",   uKey: "usedFloor"   },
  { key: "transformVideo", icon: "🎬", label: "Videoer",         qKey: "quotaVideo",   uKey: "usedVideo"   },
  { key: "showcase",    icon: "🏡", label: "Showcase",           qKey: "quotaShowcase",uKey: "usedShowcase"},
] as const;
const QUICK_CREDITS = [10, 25, 50, 100];
const TIMELINE_ICON: Record<string, string> = { note: "📝", email: "📧", credit: "💰", plan_change: "🔄", visualization: "🖼️", login: "🔑", video: "🎬" };

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (d: string) => new Date(d).toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" });
const fmtTs = (d: string) => new Date(d).toLocaleString("da-DK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function StatusDot({ s }: { s: string }) {
  return <span className="w-2 h-2 rounded-full flex-shrink-0 inline-block" style={{ background: STATUS[s]?.dot ?? "#94A3B8" }} />;
}
function Badge({ s }: { s: string }) {
  const c = STATUS[s] ?? { bg: "#F1F5F9", text: "#475569", label: s };
  return <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: c.bg, color: c.text }}>{c.label}</span>;
}

// ── Flash helper ──────────────────────────────────────────────────────────────
function useFlash() {
  const [msg, setMsg] = useState<string | null>(null);
  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 2500); };
  return { msg, flash };
}

// ── New Contact Modal ─────────────────────────────────────────────────────────
function NewContactModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ email: "", name: "", company: "", phone: "", plan: "none", status: "lead" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const save = async () => {
    if (!f.email) { setErr("Email påkrævet"); return; }
    setSaving(true); setErr("");
    try { await cf("/api/crm/contacts", { method: "POST", body: JSON.stringify(f) }); onDone(); onClose(); }
    catch (e: any) { setErr(e.message); setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 m-4" onClick={e => e.stopPropagation()}>
        <h2 className="text-base font-semibold mb-4 text-slate-900">Ny kontakt</h2>
        <div className="space-y-3">
          {[["Email *","email","email"],["Navn","name","text"],["Firma","company","text"],["Telefon","phone","tel"]].map(([l,k,t]) => (
            <div key={k}><label className="block text-xs text-slate-400 mb-1">{l}</label>
              <input type={t} value={(f as any)[k]} onChange={e => setF(p => ({ ...p, [k]: e.target.value }))}
                className="w-full rounded-xl px-3 py-2 text-sm border border-slate-200 outline-none focus:border-sky-400" /></div>
          ))}
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs text-slate-400 mb-1">Status</label>
              <select value={f.status} onChange={e => setF(p => ({ ...p, status: e.target.value }))}
                className="w-full rounded-xl px-3 py-2 text-sm border border-slate-200 outline-none">
                {Object.entries(STATUS).map(([v, s]) => <option key={v} value={v}>{s.label}</option>)}</select></div>
            <div><label className="block text-xs text-slate-400 mb-1">Plan (CRM)</label>
              <select value={f.plan} onChange={e => setF(p => ({ ...p, plan: e.target.value }))}
                className="w-full rounded-xl px-3 py-2 text-sm border border-slate-200 outline-none">
                {TIERS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
          </div>
        </div>
        {err && <p className="text-xs text-red-500 mt-2">{err}</p>}
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 h-9 rounded-xl text-sm border border-slate-200 text-slate-500 hover:bg-slate-50">Annuller</button>
          <button onClick={save} disabled={saving} className="flex-1 h-9 rounded-xl text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            style={{ background: PRIMARY }}>{saving ? "Gemmer…" : "Opret"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Subscription Panel ────────────────────────────────────────────────────────
function SubscriptionPanel({ contact, isOwner, onRefresh }: { contact: Contact; isOwner: boolean; onRefresh: () => void }) {
  const [tier, setTier] = useState(contact.subscriptionTier ?? "none");
  const [saving, setSaving] = useState(false);
  const { msg, flash } = useFlash();
  const [err, setErr] = useState("");

  useEffect(() => { setTier(contact.subscriptionTier ?? "none"); }, [contact.subscriptionTier]);

  const apply = async () => {
    setSaving(true); setErr("");
    try {
      await cf(`/api/crm/contacts/${contact.id}/subscription`, { method: "PATCH", body: JSON.stringify({ tier }) });
      flash(`✓ Abonnement sat til ${TIERS.find(t => t.value === tier)?.label}`);
      onRefresh();
    } catch (e: any) { setErr(e.message); }
    setSaving(false);
  };

  const current = TIERS.find(t => t.value === (contact.subscriptionTier ?? "none"));
  const selected = TIERS.find(t => t.value === tier);
  const changed = tier !== (contact.subscriptionTier ?? "none");

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Abonnement</p>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-slate-500">Nuværende:</span>
        <span className="text-sm font-semibold text-slate-800">{current?.label ?? "Ingen"}</span>
        {contact.subscriptionStatus === "active" && (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-50 text-green-700 font-semibold">Aktiv</span>
        )}
      </div>

      {isOwner ? (
        <div className="space-y-2">
          <div className="grid grid-cols-1 gap-1">
            {TIERS.map(t => (
              <button key={t.value} onClick={() => setTier(t.value)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-left transition-all"
                style={{
                  background: tier === t.value ? `${PRIMARY}15` : "#F8FAFC",
                  border: tier === t.value ? `1.5px solid ${PRIMARY}` : "1.5px solid #E2E8F0",
                  color: tier === t.value ? PRIMARY : "#374151",
                }}>
                <span className="w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center"
                  style={{ borderColor: tier === t.value ? PRIMARY : "#CBD5E1", background: tier === t.value ? PRIMARY : "transparent" }}>
                  {tier === t.value && <Check className="w-2.5 h-2.5 text-white" />}
                </span>
                <span className="font-medium flex-1">{t.label}</span>
                <span className="text-[11px] text-slate-400">
                  {t.ai === null ? "∞ alt" : `${t.ai} AI · ${t.fp} 3D · ${t.tv} video`}
                </span>
              </button>
            ))}
          </div>
          {err && <p className="text-xs text-red-500">{err}</p>}
          {msg && <p className="text-xs text-green-600 font-medium">{msg}</p>}
          {changed && (
            <button onClick={apply} disabled={saving}
              className="w-full h-9 rounded-xl text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 mt-1"
              style={{ background: PRIMARY }} data-testid="crm-apply-subscription">
              {saving ? "Anvender…" : `Anvend ${selected?.label}`}
            </button>
          )}
        </div>
      ) : (
        <p className="text-sm text-slate-500">{current?.label ?? "Ingen plan"}</p>
      )}
    </div>
  );
}

// ── Quota Row ─────────────────────────────────────────────────────────────────
function QuotaRow({ contactId, icon, label, typeKey, limit, used, isOwner, onRefresh }: {
  contactId: string; icon: string; label: string; typeKey: string;
  limit: number | null; used: number; isOwner: boolean; onRefresh: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const { msg, flash } = useFlash();
  const [err, setErr] = useState("");

  const pct = limit !== null && limit > 0 ? Math.min(100, (used / limit) * 100) : limit === null ? 30 : 100;
  const over = limit !== null && used >= limit;
  const barColor = over ? "#EF4444" : PRIMARY;

  const add = async () => {
    const n = parseInt(input);
    if (!n || n < 1) { setErr("Angiv antal"); return; }
    setSaving(true); setErr("");
    try {
      await cf(`/api/crm/contacts/${contactId}/quotas/add`, { method: "POST", body: JSON.stringify({ type: typeKey, amount: n }) });
      flash(`+${n} tilføjet`);
      setInput(""); setAdding(false); onRefresh();
    } catch (e: any) { setErr(e.message); }
    setSaving(false);
  };

  return (
    <div className="mb-3 last:mb-0">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-slate-700">{icon} {label}</span>
        <div className="flex items-center gap-2">
          {msg && <span className="text-[11px] text-green-600 font-semibold">{msg}</span>}
          <span className="text-xs font-mono text-slate-500">{used}<span className="text-slate-300">/</span>{limit === null ? "∞" : limit}</span>
          {isOwner && !adding && (
            <button onClick={() => setAdding(true)}
              className="text-[11px] px-2 py-0.5 rounded-lg font-semibold text-sky-500 hover:bg-sky-50 border border-sky-200 transition-colors"
              data-testid={`crm-add-quota-${typeKey}`}>
              +Tilføj
            </button>
          )}
        </div>
      </div>
      {limit !== null && (
        <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
        </div>
      )}
      {limit === null && <p className="text-[11px] text-slate-400">Ubegrænset</p>}
      {adding && (
        <div className="mt-2 flex items-center gap-2">
          <input type="number" min={1} value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") add(); if (e.key === "Escape") { setAdding(false); setInput(""); } }}
            placeholder="Antal…" autoFocus
            className="flex-1 h-7 rounded-lg px-2 text-xs border border-slate-200 outline-none focus:border-sky-400" />
          <button onClick={add} disabled={saving || !input}
            className="h-7 px-3 rounded-lg text-xs font-medium text-white disabled:opacity-40"
            style={{ background: PRIMARY }}>Tilføj</button>
          <button onClick={() => { setAdding(false); setInput(""); }}
            className="h-7 px-2 rounded-lg text-xs text-slate-400 hover:text-slate-600">✕</button>
        </div>
      )}
      {err && <p className="text-[11px] text-red-500 mt-0.5">{err}</p>}
    </div>
  );
}

// ── Credits Panel ─────────────────────────────────────────────────────────────
function CreditsPanel({ contact, detail, isOwner, onRefresh }: { contact: Contact; detail: Detail; isOwner: boolean; onRefresh: () => void }) {
  const [liveCredits, setLiveCredits] = useState(contact.creditsRemaining ?? 0);
  const [customAmt, setCustomAmt] = useState("");
  const [note, setNote] = useState("");
  const [adding, setAdding] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const { msg: creditMsg, flash: flashCredit } = useFlash();
  const [err, setErr] = useState("");

  useEffect(() => { setLiveCredits(contact.creditsRemaining ?? 0); }, [contact.creditsRemaining]);

  const addAiCredits = async (n: number) => {
    if (adding) return;
    setAdding(true); setErr("");
    try {
      const r = await cf(`/api/crm/contacts/${contact.id}/credits/add`, { method: "POST", body: JSON.stringify({ amount: n, note }) });
      setLiveCredits(r.creditsRemaining);
      flashCredit(`+${n} AI credits tilføjet`);
      setCustomAmt(""); setNote(""); setShowForm(false); onRefresh();
    } catch (e: any) { setErr(e.message); setTimeout(() => setErr(""), 4000); }
    setAdding(false);
  };

  const handleCustom = () => {
    const n = parseInt(customAmt);
    if (!n || n < 1 || n > 10000) { setErr("Angiv 1–10.000"); return; }
    addAiCredits(n);
  };

  const creditColor = liveCredits === 0 ? "#EF4444" : liveCredits < 5 ? "#F97316" : "#16A34A";
  const q = detail.quota;

  return (
    <div className="space-y-4">
      {/* AI Credits (general balance) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">AI Credits (saldo)</p>
          {liveCredits === 0 && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-600">⚠ Blokeret</span>}
        </div>
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-4xl font-bold tabular-nums" style={{ color: creditColor }}>{liveCredits.toLocaleString("da-DK")}</span>
          <span className="text-sm text-slate-400">tilbage</span>
          {creditMsg && <span className="text-xs font-semibold text-green-600 animate-pulse">{creditMsg}</span>}
        </div>
        <p className="text-xs text-slate-400">{(contact.totalCreditsUsed ?? 0).toLocaleString("da-DK")} brugt i alt</p>

        {isOwner && contact.linkedUserId && (
          <div className="mt-4">
            <div className="grid grid-cols-4 gap-1.5 mb-2">
              {QUICK_CREDITS.map(n => (
                <button key={n} onClick={() => addAiCredits(n)} disabled={adding}
                  className="h-8 rounded-lg text-xs font-semibold border border-slate-200 hover:border-sky-400 hover:text-sky-600 transition-colors disabled:opacity-40"
                  style={{ background: "#F8FAFC" }} data-testid={`crm-add-credits-${n}`}>
                  +{n}
                </button>
              ))}
            </div>
            <button onClick={() => setShowForm(v => !v)}
              className="w-full h-9 rounded-xl text-sm font-medium text-white hover:opacity-90"
              style={{ background: PRIMARY }}>
              <Plus className="w-4 h-4 inline mr-1" />Brugerdefineret antal
            </button>
            {showForm && (
              <div className="mt-3 space-y-2 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex gap-2">
                  <input type="number" min={1} max={10000} value={customAmt} onChange={e => setCustomAmt(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleCustom(); }}
                    placeholder="Antal…" className="flex-1 h-8 rounded-lg px-3 text-sm border border-slate-200 outline-none focus:border-sky-400" />
                  <button onClick={handleCustom} disabled={adding || !customAmt}
                    className="h-8 px-3 rounded-lg text-sm font-medium text-white disabled:opacity-40" style={{ background: PRIMARY }}>Giv</button>
                </div>
                <input value={note} onChange={e => setNote(e.target.value)}
                  placeholder="Note (valgfri)…" className="w-full h-8 rounded-lg px-3 text-sm border border-slate-200 outline-none focus:border-sky-400" />
              </div>
            )}
            {err && <p className="text-xs text-red-500 mt-1">{err}</p>}
          </div>
        )}
        {!contact.linkedUserId && <p className="text-xs text-slate-400 mt-3 italic">Ingen tilknyttet konto</p>}
      </div>

      {/* Per-type monthly quota */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Månedlig kvota</p>
        {contact.linkedUserId ? (
          QUOTA_TYPES.map(({ key, icon, label, qKey, uKey }) => {
            const limit = contact[qKey] !== undefined ? contact[qKey] as number | null : (q ? (q as any)[key === "ai" ? "ai" : key === "floorPlan" ? "floorPlan" : key === "transformVideo" ? "transformVideo" : "showcase"]?.limit ?? null : null);
            const used = (contact[uKey] as number | undefined) ?? (q ? (q as any)[key === "ai" ? "ai" : key === "floorPlan" ? "floorPlan" : key === "transformVideo" ? "transformVideo" : "showcase"]?.used ?? 0 : 0);
            return (
              <QuotaRow key={key} contactId={contact.id} icon={icon} label={label}
                typeKey={key} limit={limit} used={used} isOwner={isOwner} onRefresh={onRefresh} />
            );
          })
        ) : (
          <p className="text-xs text-slate-400 italic">Ingen tilknyttet konto — kvota ikke tilgængelig</p>
        )}
        {q?.resetsAt && <p className="text-[11px] text-slate-400 mt-3">Nulstilles {fmt(q.resetsAt)}</p>}
      </div>

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
        {detail.stats.lastGeneratedAt && <p className="text-xs text-slate-400 mt-3">Senest aktiv {fmt(detail.stats.lastGeneratedAt)}</p>}
      </div>
    </div>
  );
}

// ── Timeline Panel ────────────────────────────────────────────────────────────
function TimelinePanel({ contact, interactions, onRefresh }: { contact: Contact; interactions: Interaction[]; onRefresh: () => void }) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const addNote = async () => {
    if (!note.trim()) return;
    setSaving(true);
    try { await cf(`/api/crm/contacts/${contact.id}/interactions`, { method: "POST", body: JSON.stringify({ type: "note", content: note.trim() }) }); setNote(""); onRefresh(); }
    catch {}
    setSaving(false);
  };
  const sorted = [...interactions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col" style={{ minHeight: "400px" }}>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Timeline</p>
      <div className="mb-4">
        <textarea value={note} onChange={e => setNote(e.target.value)}
          placeholder="Tilføj notat…" rows={2}
          className="w-full rounded-xl px-3 py-2 text-sm border border-slate-200 outline-none focus:border-sky-400 resize-none"
          onKeyDown={e => { if (e.key === "Enter" && e.ctrlKey) addNote(); }} />
        <button onClick={addNote} disabled={saving || !note.trim()}
          className="mt-1.5 h-8 px-4 rounded-xl text-xs font-medium text-white hover:opacity-90 disabled:opacity-40"
          style={{ background: PRIMARY }}>{saving ? "Gemmer…" : "Gem notat"}</button>
      </div>
      <div className="flex-1 overflow-y-auto space-y-3">
        {sorted.length === 0 && <div className="text-center py-8 text-slate-400 text-sm">Ingen aktivitet endnu</div>}
        {sorted.map(item => (
          <div key={item.id} className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-sm flex-shrink-0 mt-0.5">
              {TIMELINE_ICON[item.type] ?? "📌"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-slate-700 leading-relaxed">{item.content}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[11px] text-slate-400">{fmtTs(item.createdAt)}</span>
                {item.createdBy && <span className="text-[11px] text-slate-400">· {item.createdBy.split("@")[0]}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Info Panel ────────────────────────────────────────────────────────────────
function InfoPanel({ contact, onUpdated }: { contact: Contact; onUpdated: () => void }) {
  const [form, setForm] = useState({ name: contact.name ?? "", company: contact.company ?? "", phone: contact.phone ?? "", status: contact.status });
  const [saving, setSaving] = useState(false);
  const { msg, flash } = useFlash();
  useEffect(() => { setForm({ name: contact.name ?? "", company: contact.company ?? "", phone: contact.phone ?? "", status: contact.status }); }, [contact.id]);
  const isDirty = form.name !== (contact.name ?? "") || form.company !== (contact.company ?? "") || form.phone !== (contact.phone ?? "") || form.status !== contact.status;
  const save = async () => {
    setSaving(true);
    try { await cf(`/api/crm/contacts/${contact.id}`, { method: "PATCH", body: JSON.stringify(form) }); flash("✓ Gemt"); onUpdated(); }
    catch {}
    setSaving(false);
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0"
          style={{ background: STATUS[contact.status]?.dot ?? "#94A3B8" }}>
          {(contact.name || contact.email)[0].toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-slate-900 truncate">{contact.name || <span className="text-slate-400 font-normal">Intet navn</span>}</p>
          <p className="text-xs text-slate-500 truncate">{contact.email}</p>
          {contact.teamName && <p className="text-xs text-sky-500 mt-0.5"><Users className="w-3 h-3 inline mr-0.5" />{contact.teamName}</p>}
        </div>
      </div>
      <div className="space-y-3">
        {([["Navn","name","text"],["Firma","company","text"],["Telefon","phone","tel"]] as [string,string,string][]).map(([l,k,t]) => (
          <div key={k}><label className="block text-xs text-slate-400 mb-1">{l}</label>
            <input type={t} value={(form as any)[k]} onChange={e => setForm(p => ({ ...p, [k]: e.target.value }))}
              className="w-full rounded-xl px-3 py-2 text-sm border border-slate-200 outline-none focus:border-sky-400" /></div>
        ))}
        <div><label className="block text-xs text-slate-400 mb-1">Status (CRM)</label>
          <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
            className="w-full rounded-xl px-3 py-2 text-sm border border-slate-200 outline-none focus:border-sky-400">
            {Object.entries(STATUS).map(([v, s]) => <option key={v} value={v}>{s.label}</option>)}</select></div>
        <div><label className="block text-xs text-slate-400 mb-1">Oprettet</label>
          <p className="text-sm text-slate-600">{fmt(contact.createdAt)}</p></div>
      </div>
      {isDirty && (
        <button onClick={save} disabled={saving}
          className="mt-4 w-full h-9 rounded-xl text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          style={{ background: PRIMARY }}>{saving ? "Gemmer…" : "Gem ændringer"}</button>
      )}
      {msg && !isDirty && <p className="mt-2 text-xs text-center text-green-600 font-medium">{msg}</p>}
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
  if (isLoading) return <div className="flex items-center justify-center h-40"><div className="w-5 h-5 rounded-full border-2 border-sky-200 border-t-sky-500 animate-spin" /></div>;
  if (!data) return null;
  const refresh = () => { refetch(); qc.invalidateQueries({ queryKey: ["/api/crm/contacts"] }); };
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-medium mb-5 flex-shrink-0 text-sky-500 hover:text-sky-600">
        <ArrowLeft className="w-4 h-4" /> Alle kontakter
      </button>
      <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-4 gap-4 pb-4">
        {/* Col 1: Info + Subscription */}
        <div className="lg:col-span-1 space-y-4">
          <InfoPanel contact={data.contact} onUpdated={refresh} />
          <SubscriptionPanel contact={data.contact} isOwner={isOwner} onRefresh={refresh} />
        </div>
        {/* Col 2: Credits + Quota */}
        <div className="lg:col-span-1">
          <CreditsPanel contact={data.contact} detail={data} isOwner={isOwner} onRefresh={refresh} />
        </div>
        {/* Col 3: Timeline */}
        <div className="lg:col-span-2">
          <TimelinePanel contact={data.contact} interactions={data.interactions} onRefresh={refresh} />
        </div>
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
      const p = new URLSearchParams();
      if (search.trim()) p.set("search", search.trim());
      if (filter !== "all") p.set("status", filter);
      return cf(`/api/crm/contacts?${p}`);
    },
    refetchInterval: 30000,
  });

  const contacts = data?.contacts ?? [];

  // Group by team
  type Group = { teamId: number | null; teamName: string | null; contacts: Contact[] };
  const grouped: Group[] = [];
  const teamMap = new Map<number | null, Group>();
  contacts.forEach(c => {
    const key = c.teamId ?? null;
    if (!teamMap.has(key)) {
      const g: Group = { teamId: key, teamName: c.teamName ?? null, contacts: [] };
      teamMap.set(key, g);
      grouped.push(g);
    }
    teamMap.get(key)!.contacts.push(c);
  });
  // Sort: teams first (alphabetically), no-team last
  grouped.sort((a, b) => {
    if (!a.teamName && b.teamName) return 1;
    if (a.teamName && !b.teamName) return -1;
    return (a.teamName ?? "").localeCompare(b.teamName ?? "", "da");
  });

  const stats = {
    all: contacts.length,
    lead: contacts.filter(c => c.status === "lead").length,
    trial: contacts.filter(c => c.status === "trial").length,
    active: contacts.filter(c => c.status === "active").length,
    churned: contacts.filter(c => c.status === "churned").length,
  };

  if (selectedId) return <ContactDetail contactId={selectedId} onBack={() => setSelectedId(null)} isOwner={isOwner} />;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {showNew && <NewContactModal onClose={() => setShowNew(false)} onDone={() => { refetch(); qc.invalidateQueries({ queryKey: ["/api/crm/contacts"] }); }} />}

      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div>
          <h2 className="text-lg font-bold text-slate-900">CRM</h2>
          <p className="text-xs text-slate-400">{data?.total ?? 0} kontakter</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} className="h-8 w-8 rounded-xl border border-slate-200 flex items-center justify-center hover:bg-slate-50" data-testid="crm-refresh">
            <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
          </button>
          <button onClick={() => setShowNew(true)}
            className="h-8 px-3 rounded-xl text-sm font-medium text-white flex items-center gap-1.5 hover:opacity-90"
            style={{ background: PRIMARY }} data-testid="crm-new-contact">
            <Plus className="w-3.5 h-3.5" /> Ny kontakt
          </button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-2 mb-4 flex-shrink-0">
        {[
          { label: "Aktive", value: stats.active, color: "#16A34A", bg: "#F0FDF4" },
          { label: "Trials", value: stats.trial,  color: "#EA580C", bg: "#FFF7ED" },
          { label: "Leads",  value: stats.lead,   color: "#1D4ED8", bg: "#EFF6FF" },
          { label: "Churned",value: stats.churned,color: "#DC2626", bg: "#FEF2F2" },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className="rounded-xl border border-slate-200 p-3 text-center cursor-pointer hover:shadow-sm transition-shadow"
            style={{ background: bg }} onClick={() => setFilter(label === "Aktive" ? "active" : label === "Trials" ? "trial" : label === "Leads" ? "lead" : "churned")}>
            <div className="text-2xl font-bold" style={{ color }}>{value}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Search + filter */}
      <div className="flex flex-col sm:flex-row gap-2 mb-3 flex-shrink-0">
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
                background: filter === s ? PRIMARY : "#F8FAFC",
                color: filter === s ? "#fff" : "#64748B",
                border: filter === s ? "none" : "1px solid #E2E8F0",
              }}
              data-testid={`crm-filter-${s}`}>
              {s === "all" ? `Alle (${stats.all})` : `${STATUS[s]?.label} (${(stats as any)[s]})`}
            </button>
          ))}
        </div>
      </div>

      {/* Table grouped by team */}
      <div className="flex-1 overflow-y-auto rounded-2xl border border-slate-200 bg-white">
        {isLoading && <div className="flex items-center justify-center h-20"><div className="w-5 h-5 rounded-full border-2 border-sky-200 border-t-sky-500 animate-spin" /></div>}
        {!isLoading && contacts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <User className="w-10 h-10 text-slate-200 mb-3" /><p className="text-sm text-slate-400">Ingen kontakter fundet</p>
          </div>
        )}
        {contacts.length > 0 && (
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: "1px solid #F1F5F9" }}>
                {["Navn / Email","Firma","Abonnement","Status","AI Credits","Kvota","Oprettet"].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{h}</th>
                ))}
                <th className="w-6" />
              </tr>
            </thead>
            <tbody>
              {grouped.map(group => (
                <Fragment key={group.teamId ?? "no-team"}>
                  {/* Team header row */}
                  {group.teamName && (
                    <tr style={{ background: "#F8FAFC", borderTop: "1px solid #F1F5F9" }}>
                      <td colSpan={8} className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <Users className="w-3.5 h-3.5 text-sky-400" />
                          <span className="text-xs font-semibold text-sky-600">{group.teamName}</span>
                          <span className="text-[11px] text-slate-400">— {group.contacts.length} bruger{group.contacts.length !== 1 ? "e" : ""}</span>
                        </div>
                      </td>
                    </tr>
                  )}
                  {group.contacts.map((c, i) => {
                    const creditColor = (c.creditsRemaining ?? 0) === 0 ? "#EF4444" : (c.creditsRemaining ?? 0) < 5 ? "#F97316" : "#16A34A";
                    const tier = TIERS.find(t => t.value === (c.subscriptionTier ?? "none"));
                    const isUnlimitedPlan = c.subscriptionTier === "unlimited" || c.plan === "unlimited";
                    const fmtQ = (v: number | null | undefined) =>
                      v === undefined ? "—" : v === null ? (isUnlimitedPlan ? "∞" : "0") : String(v);
                    const quotaSummary = c.quotaAi !== undefined
                      ? `${fmtQ(c.quotaAi)} · ${fmtQ(c.quotaFloor)} · ${fmtQ(c.quotaVideo)}`
                      : "—";
                    return (
                      <tr key={c.id} onClick={() => setSelectedId(c.id)}
                        className="cursor-pointer transition-colors hover:bg-slate-50"
                        style={{ borderTop: i > 0 || group.teamName ? "1px solid #F8FAFC" : "none" }}
                        data-testid={`crm-row-${c.id}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                              style={{ background: STATUS[c.status]?.dot ?? "#94A3B8" }}>
                              {(c.name || c.email)[0].toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-slate-900 truncate max-w-[130px]">{c.name || <span className="text-slate-400 font-normal">—</span>}</div>
                              <div className="text-xs text-slate-400 truncate max-w-[130px]">{c.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-slate-600 truncate max-w-[90px] block">{c.company || <span className="text-slate-300">—</span>}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-medium" style={{ color: c.subscriptionTier && c.subscriptionTier !== "none" ? PRIMARY : "#94A3B8" }}>
                            {tier?.label ?? "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <StatusDot s={c.status} />
                            <Badge s={c.status} />
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {c.creditsRemaining !== undefined
                            ? <span className="text-sm font-bold tabular-nums" style={{ color: creditColor }}>{c.creditsRemaining.toLocaleString("da-DK")}</span>
                            : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-slate-500 font-mono">{quotaSummary}</span>
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
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
