import { useState, useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, User, Shield, Check, X, ChevronRight, ArrowLeft, AlertTriangle, Crown, CreditCard, Calendar, Hash } from "lucide-react";
import { auth } from "@/lib/firebase";

// ── API helpers ───────────────────────────────────────────────────────────────
async function adminFetch(url: string, options?: RequestInit): Promise<Response> {
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

async function adminReq(method: string, url: string, data?: unknown) {
  const res = await adminFetch(url, { method, body: data ? JSON.stringify(data) : undefined });
  return res.json();
}

// ── Types ─────────────────────────────────────────────────────────────────────
type UserSummary = {
  id: number; email: string; displayName?: string; isAdmin: boolean;
  subscriptionStatus: string; subscriptionTier?: string;
  creditsRemaining: number; totalCreditsUsed: number; createdAt: string;
};

type UserDetail = UserSummary & {
  customerCode?: string;
  quota: {
    ai: { limit: number | null; used: number };
    floorPlan: { limit: number | null; used: number };
    transformVideo: { limit: number | null; used: number };
    showcase: { limit: number | null; used: number };
    resetsAt: string | null;
  };
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (d: string) => new Date(d).toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" });

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  active:   { bg: "#F0FDF4", text: "#166534", label: "Aktiv betaler" },
  trialing: { bg: "#FEF9C3", text: "#854D0E", label: "Trial" },
  none:     { bg: "#F3F4F6", text: "#6B7280", label: "Gratis" },
  canceled: { bg: "#FEF2F2", text: "#991B1B", label: "Opsagt" },
  paused:   { bg: "#FFF7ED", text: "#C2410C", label: "Sat på pause" },
};

const PLAN_LABELS: Record<string, string> = {
  none: "Ingen plan", start: "Start", pro: "Pro", business: "Business", enterprise: "Enterprise",
};

// ── Confirm dialog ────────────────────────────────────────────────────────────
function ConfirmDialog({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="rounded-2xl border p-6 w-80 shadow-xl" style={{ background: "#fff", borderColor: "#E5E2DC" }}>
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: "#C8956C" }} />
          <p className="text-sm" style={{ color: "#0F1D2F" }}>{message}</p>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-medium border transition-colors hover:bg-[#F8F6F3]"
            style={{ borderColor: "#E5E2DC", color: "#6B6B6B" }}>Annuller</button>
          <button onClick={onConfirm} className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
            style={{ background: "#C8956C" }}>Bekræft</button>
        </div>
      </div>
    </div>
  );
}

// ── User Detail Panel ─────────────────────────────────────────────────────────
function UserDetailPanel({ userId, onBack }: { userId: number; onBack: () => void }) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [editName, setEditName] = useState<string | null>(null);
  const [editCredits, setEditCredits] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const { data: u, isLoading } = useQuery<UserDetail>({
    queryKey: ["/api/admin/users", userId],
    queryFn: async () => (await adminFetch(`/api/admin/users/${userId}`)).json(),
  });

  const patch = useMutation({
    mutationFn: (updates: Record<string, unknown>) => adminReq("PATCH", `/api/admin/users/${userId}/profile`, updates),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["/api/admin/users", userId] });
      qc.invalidateQueries({ queryKey: ["/api/admin/users/search"] });
      const key = Object.keys(vars)[0];
      setSaved(key);
      setTimeout(() => setSaved(null), 2000);
      setEditName(null);
      setEditCredits(null);
    },
  });

  const requireConfirm = (message: string, action: () => void) => setConfirm({ message, onConfirm: action });

  if (isLoading) return (
    <div className="flex items-center justify-center h-40">
      <div className="text-sm" style={{ color: "#9CA3AF" }}>Indlæser bruger…</div>
    </div>
  );
  if (!u) return null;

  const sc = STATUS_COLORS[u.subscriptionStatus] ?? STATUS_COLORS.none;

  return (
    <div className="h-full flex flex-col overflow-y-auto">
      {confirm && <ConfirmDialog message={confirm.message} onConfirm={() => { confirm.onConfirm(); setConfirm(null); }} onCancel={() => setConfirm(null)} />}

      <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-medium mb-5 flex-shrink-0" style={{ color: "#C8956C" }}>
        <ArrowLeft className="w-4 h-4" /> Alle brugere
      </button>

      {/* Header card */}
      <div className="rounded-2xl border p-5 mb-4" style={{ borderColor: "#E5E2DC", background: "#fff" }}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0"
            style={{ background: u.isAdmin ? "#C8956C" : u.subscriptionStatus === "active" ? "#16A34A" : "#6B7280" }}>
            {u.isAdmin ? <Crown className="w-5 h-5" /> : (u.displayName || u.email)[0].toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold truncate" style={{ color: "#0F1D2F" }}>{u.displayName || <span style={{ color: "#9CA3AF" }}>Intet navn</span>}</div>
            <div className="text-xs truncate" style={{ color: "#6B6B6B" }}>{u.email}</div>
            <div className="flex items-center gap-2 mt-1">
              {u.isAdmin && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "#FFF7ED", color: "#C2410C" }}>
                  <Crown className="w-2.5 h-2.5" /> ADMIN
                </span>
              )}
              <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: sc.bg, color: sc.text }}>
                {sc.label}
              </span>
            </div>
          </div>
        </div>

        {/* Read-only info */}
        <div className="space-y-2 text-xs" style={{ color: "#6B6B6B" }}>
          <div className="flex items-center gap-2"><Hash className="w-3 h-3" /> Bruger-ID: <span className="font-mono font-medium" style={{ color: "#0F1D2F" }}>#{u.id}</span></div>
          {u.customerCode && <div className="flex items-center gap-2"><Hash className="w-3 h-3" /> Kundekode: <span className="font-mono font-medium" style={{ color: "#0F1D2F" }}>{u.customerCode}</span></div>}
          <div className="flex items-center gap-2"><Calendar className="w-3 h-3" /> Oprettet: <span style={{ color: "#0F1D2F" }}>{fmt(u.createdAt)}</span></div>
          <div className="flex items-center gap-2"><CreditCard className="w-3 h-3" /> Credits: <span style={{ color: "#0F1D2F" }}>{u.creditsRemaining} tilbage / {u.totalCreditsUsed} brugt</span></div>
        </div>
      </div>

      {/* Editable fields */}
      <div className="rounded-2xl border p-5 mb-4 space-y-5" style={{ borderColor: "#E5E2DC", background: "#fff" }}>
        <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#9CA3AF" }}>Rediger profil</div>

        {/* Display name */}
        <div>
          <label className="text-[11px] font-medium uppercase tracking-wide block mb-1" style={{ color: "#9CA3AF" }}>Navn</label>
          {editName !== null ? (
            <div className="flex gap-2">
              <input value={editName} onChange={e => setEditName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") patch.mutate({ displayName: editName }); if (e.key === "Escape") setEditName(null); }}
                autoFocus className="flex-1 rounded-lg px-3 py-1.5 text-sm outline-none"
                style={{ border: "1px solid #C8956C" }} placeholder="Skriv navn…" data-testid="input-user-displayname" />
              <button onClick={() => patch.mutate({ displayName: editName })}
                className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#F0FDF4" }}>
                <Check className="w-3.5 h-3.5" style={{ color: "#16A34A" }} />
              </button>
              <button onClick={() => setEditName(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#FEF2F2" }}>
                <X className="w-3.5 h-3.5" style={{ color: "#DC2626" }} />
              </button>
            </div>
          ) : (
            <div onClick={() => setEditName(u.displayName ?? "")} className="cursor-pointer rounded-lg px-3 py-1.5 text-sm hover:bg-[#F8F6F3] transition-colors"
              style={{ color: u.displayName ? "#0F1D2F" : "#9CA3AF", border: "1px solid #E5E2DC" }} data-testid="field-user-displayname">
              {u.displayName || "Klik for at sætte navn…"}
              {saved === "displayName" && <span className="ml-2 text-[10px] font-semibold" style={{ color: "#16A34A" }}>✓ Gemt</span>}
            </div>
          )}
        </div>

        {/* Plan */}
        <div>
          <label className="text-[11px] font-medium uppercase tracking-wide block mb-1" style={{ color: "#9CA3AF" }}>Abonnement plan</label>
          <select value={u.subscriptionTier ?? "none"}
            onChange={e => patch.mutate({ subscriptionTier: e.target.value === "none" ? null : e.target.value })}
            className="w-full rounded-lg px-3 py-1.5 text-sm outline-none" style={{ border: "1px solid #E5E2DC" }}
            data-testid="select-user-plan">
            {Object.entries(PLAN_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          {saved === "subscriptionTier" && <p className="text-[10px] mt-1 font-semibold" style={{ color: "#16A34A" }}>✓ Gemt</p>}
        </div>

        {/* Status */}
        <div>
          <label className="text-[11px] font-medium uppercase tracking-wide block mb-1" style={{ color: "#9CA3AF" }}>Betalingsstatus</label>
          <select value={u.subscriptionStatus}
            onChange={e => {
              const newStatus = e.target.value;
              if (newStatus === "active") {
                requireConfirm(`Aktiver betaling for ${u.email}? Dette markerer dem som betalende kunder.`,
                  () => patch.mutate({ subscriptionStatus: newStatus }));
              } else {
                patch.mutate({ subscriptionStatus: newStatus });
              }
            }}
            className="w-full rounded-lg px-3 py-1.5 text-sm outline-none" style={{ border: "1px solid #E5E2DC" }}
            data-testid="select-user-status">
            <option value="none">Gratis (ingen abonnement)</option>
            <option value="active">Aktiv betaler</option>
            <option value="trialing">Trial</option>
            <option value="canceled">Opsagt</option>
            <option value="paused">Sat på pause</option>
          </select>
          {saved === "subscriptionStatus" && <p className="text-[10px] mt-1 font-semibold" style={{ color: "#16A34A" }}>✓ Gemt</p>}
        </div>

        {/* Credits */}
        <div>
          <label className="text-[11px] font-medium uppercase tracking-wide block mb-1" style={{ color: "#9CA3AF" }}>Credits (direkte)</label>
          {editCredits !== null ? (
            <div className="flex gap-2">
              <input type="number" value={editCredits} onChange={e => setEditCredits(e.target.value)} min={0} max={9999}
                onKeyDown={e => { if (e.key === "Enter" && editCredits !== null) patch.mutate({ creditsRemaining: parseInt(editCredits) }); if (e.key === "Escape") setEditCredits(null); }}
                autoFocus className="flex-1 rounded-lg px-3 py-1.5 text-sm outline-none"
                style={{ border: "1px solid #C8956C" }} data-testid="input-user-credits" />
              <button onClick={() => editCredits !== null && patch.mutate({ creditsRemaining: parseInt(editCredits) })}
                className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#F0FDF4" }}>
                <Check className="w-3.5 h-3.5" style={{ color: "#16A34A" }} />
              </button>
              <button onClick={() => setEditCredits(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#FEF2F2" }}>
                <X className="w-3.5 h-3.5" style={{ color: "#DC2626" }} />
              </button>
            </div>
          ) : (
            <div onClick={() => setEditCredits(String(u.creditsRemaining))} className="cursor-pointer rounded-lg px-3 py-1.5 text-sm hover:bg-[#F8F6F3] transition-colors"
              style={{ color: "#0F1D2F", border: "1px solid #E5E2DC" }} data-testid="field-user-credits">
              {u.creditsRemaining} credits
              {saved === "creditsRemaining" && <span className="ml-2 text-[10px] font-semibold" style={{ color: "#16A34A" }}>✓ Gemt</span>}
            </div>
          )}
        </div>

        {/* Admin toggle */}
        <div className="pt-3" style={{ borderTop: "1px solid #F0EDE7" }}>
          <label className="text-[11px] font-medium uppercase tracking-wide block mb-2" style={{ color: "#9CA3AF" }}>Admin-rettigheder</label>
          <button
            onClick={() => {
              if (u.isAdmin) {
                requireConfirm(`Fjern admin-rettigheder fra ${u.email}? De vil ikke længere kunne tilgå admin-funktioner.`,
                  () => patch.mutate({ isAdmin: false }));
              } else {
                requireConfirm(`Giv ${u.email} fulde admin-rettigheder? De vil have adgang til CRM, brugerstyring og alle admin-funktioner.`,
                  () => patch.mutate({ isAdmin: true }));
              }
            }}
            className="flex items-center gap-3 w-full rounded-xl px-4 py-3 transition-colors hover:opacity-90"
            style={{ background: u.isAdmin ? "#FFF7ED" : "#F8F6F3", border: `1px solid ${u.isAdmin ? "#FED7AA" : "#E5E2DC"}` }}
            data-testid="button-toggle-admin">
            <Crown className="w-4 h-4 flex-shrink-0" style={{ color: u.isAdmin ? "#C2410C" : "#9CA3AF" }} />
            <div className="flex-1 text-left">
              <div className="text-sm font-medium" style={{ color: u.isAdmin ? "#9A3412" : "#374151" }}>
                {u.isAdmin ? "Er admin — Klik for at fjerne" : "Ikke admin — Klik for at give adgang"}
              </div>
              <div className="text-[10px]" style={{ color: "#9CA3AF" }}>Giver adgang til CRM, brugerstyring og adminpanel</div>
            </div>
            <div className="w-10 h-5 rounded-full flex items-center transition-colors" style={{ background: u.isAdmin ? "#C8956C" : "#D1D5DB" }}>
              <div className="w-4 h-4 rounded-full bg-white shadow-sm transition-transform" style={{ transform: u.isAdmin ? "translateX(22px)" : "translateX(2px)" }} />
            </div>
          </button>
          {saved === "isAdmin" && <p className="text-[10px] mt-1.5 font-semibold" style={{ color: "#16A34A" }}>✓ Admin-status gemt</p>}
        </div>
      </div>

      {/* Quota overview */}
      {u.quota && (
        <div className="rounded-2xl border p-4" style={{ borderColor: "#E5E2DC", background: "#fff" }}>
          <div className="text-[11px] font-semibold uppercase tracking-wide mb-3" style={{ color: "#9CA3AF" }}>Kvota denne måned</div>
          <div className="space-y-2">
            {([
              ["🖼️", "AI Visuals", u.quota.ai],
              ["📐", "Plantegninger", u.quota.floorPlan],
              ["🎬", "Transform Video", u.quota.transformVideo],
              ["🎥", "Showcase Video", u.quota.showcase],
            ] as [string, string, { limit: number | null; used: number }][]).map(([icon, label, q]) => (
              <div key={label} className="flex items-center gap-3">
                <span className="text-sm w-5">{icon}</span>
                <span className="text-xs flex-1" style={{ color: "#6B6B6B" }}>{label}</span>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: "#E5E2DC" }}>
                    <div className="h-full rounded-full" style={{
                      width: q.limit ? `${Math.min(100, (q.used / q.limit) * 100)}%` : "0%",
                      background: q.limit && q.used >= q.limit ? "#DC2626" : "#C8956C"
                    }} />
                  </div>
                  <span className="text-[10px] font-mono" style={{ color: "#9CA3AF" }}>
                    {q.used}/{q.limit ?? "∞"}
                  </span>
                </div>
              </div>
            ))}
          </div>
          {u.quota.resetsAt && (
            <p className="text-[10px] mt-3" style={{ color: "#B0ABA5" }}>Nulstilles {fmt(u.quota.resetsAt)}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main UserManagerView ──────────────────────────────────────────────────────
export function UserManagerView() {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [results, setResults] = useState<UserSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!q) { setResults([]); setSearchError(null); return; }

    timerRef.current = setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();
      setIsLoading(true);
      setSearchError(null);
      try {
        const token = await auth.currentUser?.getIdToken(true);
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await fetch(`/api/admin/users/search?q=${encodeURIComponent(q)}`, {
          headers,
          signal: abortRef.current.signal,
        });
        if (!res.ok) {
          const text = await res.text();
          setSearchError(`${res.status}: ${text}`);
          setResults([]);
        } else {
          const data = await res.json();
          setResults(data);
        }
      } catch (err: any) {
        if (err.name !== "AbortError") setSearchError(err.message);
      } finally {
        setIsLoading(false);
      }
    }, 350);

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query]);

  if (selectedId !== null) {
    return <UserDetailPanel userId={selectedId} onBack={() => setSelectedId(null)} />;
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="mb-5 flex-shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <Shield className="w-4 h-4" style={{ color: "#C8956C" }} />
          <h2 className="text-lg font-bold" style={{ color: "#0F1D2F" }}>Brugerstyring</h2>
        </div>
        <p className="text-xs" style={{ color: "#9CA3AF" }}>Søg efter en bruger via email eller navn for at redigere deres profil</p>
      </div>

      {/* Search */}
      <div className="relative mb-4 flex-shrink-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "#9CA3AF" }} />
        <input
          value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Søg på email eller navn…"
          className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none"
          style={{ border: "1px solid #E5E2DC", background: "#fff" }}
          autoFocus data-testid="input-user-search"
        />
        {isLoading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 animate-spin"
            style={{ borderColor: "#E5E2DC", borderTopColor: "#C8956C" }} />
        )}
      </div>

      {/* Error */}
      {searchError && (
        <div className="rounded-2xl border p-4 mb-2 flex items-start gap-2" style={{ borderColor: "#FCA5A5", background: "#FEF2F2" }}>
          <span className="text-xs font-medium" style={{ color: "#991B1B" }}>
            Fejl: {searchError}
          </span>
        </div>
      )}

      {/* Results */}
      {query.trim() && !isLoading && !searchError && results.length === 0 && (
        <div className="rounded-2xl border p-8 text-center" style={{ borderColor: "#E5E2DC", background: "#fff" }}>
          <User className="w-8 h-8 mx-auto mb-2" style={{ color: "#D1CEC9" }} />
          <p className="text-sm" style={{ color: "#9CA3AF" }}>Ingen brugere fundet for "{query.trim()}"</p>
        </div>
      )}

      {results.length > 0 && (
        <div className="rounded-2xl border overflow-hidden flex-1 overflow-y-auto" style={{ borderColor: "#E5E2DC" }}>
          {results.map((u, i) => {
            const sc = STATUS_COLORS[u.subscriptionStatus] ?? STATUS_COLORS.none;
            return (
              <button key={u.id} onClick={() => setSelectedId(u.id)} className="w-full text-left transition-colors hover:bg-[#F8F6F3]"
                style={{ borderTop: i > 0 ? "1px solid #F0EDE7" : "none", display: "block" }}
                data-testid={`user-row-${u.id}`}>
                <div className="px-4 py-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                    style={{ background: u.isAdmin ? "#C8956C" : u.subscriptionStatus === "active" ? "#16A34A" : "#6B7280" }}>
                    {u.isAdmin ? <Crown className="w-4 h-4" /> : (u.displayName || u.email)[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate" style={{ color: "#0F1D2F" }}>
                        {u.displayName || <span style={{ color: "#9CA3AF" }}>Intet navn</span>}
                      </span>
                      {u.isAdmin && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
                          style={{ background: "#FFF7ED", color: "#C2410C" }}>ADMIN</span>
                      )}
                    </div>
                    <div className="text-xs truncate" style={{ color: "#6B6B6B" }}>{u.email}</div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: sc.bg, color: sc.text }}>
                      {sc.label}
                    </span>
                    {u.subscriptionTier && u.subscriptionTier !== "none" && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                        style={{ background: "#EFF6FF", color: "#1D4ED8" }}>
                        {PLAN_LABELS[u.subscriptionTier] ?? u.subscriptionTier}
                      </span>
                    )}
                    <ChevronRight className="w-4 h-4" style={{ color: "#D1CEC9" }} />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {!query.trim() && (
        <div className="rounded-2xl border p-8 text-center" style={{ borderColor: "#E5E2DC", background: "#fff" }}>
          <Search className="w-8 h-8 mx-auto mb-2" style={{ color: "#D1CEC9" }} />
          <p className="text-sm font-medium mb-1" style={{ color: "#0F1D2F" }}>Find en bruger</p>
          <p className="text-xs" style={{ color: "#9CA3AF" }}>Skriv en email eller del af et navn for at søge</p>
        </div>
      )}
    </div>
  );
}
