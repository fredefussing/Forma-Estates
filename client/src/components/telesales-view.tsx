import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Phone, Search, PhoneCall, X, Trophy, PhoneMissed, Calendar } from "lucide-react";
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

// ── Types ──────────────────────────────────────────────────────────────────────
type TLead = {
  id: number;
  name: string;
  category: string;
  email?: string;
  owner_phone?: string;
  office_phone?: string;
  status: string;
  notes?: string;
  deal_amount?: number | null;
  callback_at?: string | null;
};

// ── Design tokens ─────────────────────────────────────────────────────────────
const NAVY    = "#0B1826";
const CARD    = "#0D1F2E";
const BORDER  = "rgba(201,164,98,0.18)";
const TEXT    = "#E2DAD0";
const MUTED   = "#8AAABB";
const AMBER   = "#C8956C";

// ── Category config ───────────────────────────────────────────────────────────
const CAT: Record<string, { label: string; color: string; emoji: string }> = {
  ejendomsmaegler: { label: "Mægler",     color: "#60A5FA", emoji: "🏠" },
  arkitekt:        { label: "Arkitekt",   color: "#A78BFA", emoji: "🏗️" },
  toemrerfirma:    { label: "Tømrer",     color: "#FB923C", emoji: "🔨" },
  byggefirma:      { label: "Byggefirma", color: "#34D399", emoji: "🏢" },
  fotograf:        { label: "Fotograf",   color: "#F472B6", emoji: "📷" },
  andet:           { label: "Andet",      color: "#94A3B8", emoji: "📌" },
};

// ── Status sections ────────────────────────────────────────────────────────────
type Sec = { key: string; label: string; color: string; statuses: string[] };
const SECTIONS: Sec[] = [
  { key: "warm",      label: "Varme leads",  color: "#22C55E", statuses: ["responded"] },
  { key: "contacted", label: "Kontaktet",    color: AMBER,     statuses: ["contacted"] },
  { key: "cold",      label: "Kolde leads",  color: "#64748B", statuses: ["new"] },
  { key: "done",      label: "Afsluttet",    color: "#EF4444", statuses: ["no", "won"] },
];

// ── Callback countdown ────────────────────────────────────────────────────────
function callbackChip(dateStr: string): { label: string; color: string; bg: string } {
  const now  = new Date();
  const cb   = new Date(dateStr);
  // Compare as calendar days in local time
  const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const cbDay  = new Date(cb.getFullYear(), cb.getMonth(), cb.getDate());
  const diff   = Math.round((cbDay.getTime() - nowDay.getTime()) / 86_400_000);

  if (diff < 0)  return { label: `Forsinket ${Math.abs(diff)} dag${Math.abs(diff) === 1 ? "" : "e"}`, color: "#FCA5A5", bg: "rgba(239,68,68,0.18)" };
  if (diff === 0) return { label: "Ring i dag!",   color: "#FCA5A5", bg: "rgba(239,68,68,0.18)" };
  if (diff === 1) return { label: "I morgen",       color: "#FBD38D", bg: "rgba(251,190,36,0.18)" };
  if (diff <= 6)  return { label: `Om ${diff} dage`, color: "#FCD34D", bg: "rgba(251,191,36,0.12)" };
  return              { label: `Om ${diff} dage`, color: MUTED,     bg: "rgba(255,255,255,0.05)" };
}

// Today as YYYY-MM-DD for min on date input
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── Phone entry ───────────────────────────────────────────────────────────────
function PhoneEntry({ label, value }: { label: string; value?: string }) {
  const clean = value?.trim();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 22 }}>
      <span style={{ fontSize: 11, color: MUTED, minWidth: 62, flexShrink: 0 }}>{label}</span>
      {clean ? (
        <a
          href={`tel:${clean.replace(/\s+/g, "")}`}
          style={{
            fontSize: 13, fontWeight: 700, color: "#7DD3FC",
            textDecoration: "none", display: "flex", alignItems: "center", gap: 5,
            transition: "color 0.15s",
          }}
          onClick={e => e.stopPropagation()}
          onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = "#BAE6FD"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = "#7DD3FC"; }}
        >
          <PhoneCall size={12} strokeWidth={2.5} />
          {clean}
        </a>
      ) : (
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.18)", fontStyle: "italic" }}>—</span>
      )}
    </div>
  );
}

// ── Lead card ─────────────────────────────────────────────────────────────────
function LeadCard({
  lead,
  onAction,
  onCallback,
}: {
  lead: TLead;
  onAction: (id: number, action: "no" | "missed" | "won", amount?: number) => void;
  onCallback: (id: number, date: string | null) => void;
}) {
  const [showWon,      setShowWon]      = useState(false);
  const [amount,       setAmount]       = useState("");
  const [showCalendar, setShowCalendar] = useState(false);
  const [pickedDate,   setPickedDate]   = useState("");

  const cat      = CAT[lead.category] ?? CAT.andet;
  const hasPhones = lead.owner_phone || lead.office_phone;
  const isDone   = lead.status === "no" || lead.status === "won";

  function submitWon() {
    const kr = parseInt(amount.replace(/\D/g, ""), 10);
    onAction(lead.id, "won", isNaN(kr) ? undefined : kr);
    setShowWon(false);
    setAmount("");
  }

  function submitCallback() {
    if (!pickedDate) return;
    onCallback(lead.id, pickedDate);
    setShowCalendar(false);
    setPickedDate("");
  }

  const chip = lead.callback_at ? callbackChip(lead.callback_at) : null;

  return (
    <div style={{
      background: CARD,
      border: `1px solid ${chip ? "rgba(251,191,36,0.35)" : BORDER}`,
      borderRadius: 10,
      padding: "12px 14px",
      marginBottom: 8,
      transition: "border-color 0.15s",
    }}
      onMouseEnter={e => { if (!chip) (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(201,164,98,0.4)"; }}
      onMouseLeave={e => { if (!chip) (e.currentTarget as HTMLDivElement).style.borderColor = BORDER; }}
    >
      {/* Name + badge */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: hasPhones ? 6 : 4 }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: TEXT, flex: 1, marginRight: 8 }}>
          {lead.name}
        </span>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99, flexShrink: 0,
          background: `${cat.color}20`, color: cat.color, border: `1px solid ${cat.color}30`,
        }}>
          {cat.emoji} {cat.label}
        </span>
      </div>

      {/* Callback countdown pill */}
      {chip && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 5,
            background: chip.bg, border: `1px solid ${chip.color}44`,
            borderRadius: 99, padding: "3px 9px",
          }}>
            <Calendar size={11} color={chip.color} strokeWidth={2.5} />
            <span style={{ fontSize: 11, fontWeight: 700, color: chip.color }}>{chip.label}</span>
          </div>
          {/* Clear callback */}
          <button
            onClick={() => onCallback(lead.id, null)}
            title="Fjern ring-tilbage dato"
            style={{
              background: "none", border: "none", cursor: "pointer", padding: 2,
              color: MUTED, display: "flex", alignItems: "center",
            }}
          >
            <X size={11} />
          </button>
        </div>
      )}

      {/* Phone numbers */}
      {hasPhones && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: isDone ? 0 : 10 }}>
          <PhoneEntry label="Indehaver" value={lead.owner_phone} />
          <PhoneEntry label="Kontor"    value={lead.office_phone} />
        </div>
      )}
      {!hasPhones && !isDone && (
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 10 }}>
          <Phone size={11} color={MUTED} />
          <span style={{ fontSize: 11, color: MUTED, fontStyle: "italic" }}>Ingen numre registreret endnu</span>
        </div>
      )}

      {/* Won: show deal amount */}
      {lead.status === "won" && lead.deal_amount != null && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
          <Trophy size={12} color="#FBBF24" />
          <span style={{ fontSize: 13, fontWeight: 700, color: "#FBBF24" }}>
            {lead.deal_amount.toLocaleString("da-DK")} kr.
          </span>
        </div>
      )}

      {/* No: show rejection label */}
      {lead.status === "no" && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
          <X size={12} color="#EF4444" />
          <span style={{ fontSize: 11, color: "#EF4444", fontStyle: "italic" }}>Ikke interesseret</span>
        </div>
      )}

      {/* ── Action buttons (active leads only) ── */}
      {!isDone && !showWon && !showCalendar && (
        <div style={{ display: "flex", gap: 6 }}>
          {/* Ikke svar */}
          <button
            onClick={() => onAction(lead.id, "missed")}
            title="Log opkald – ikke svar"
            style={{
              flex: 1, padding: "5px 0", borderRadius: 6, fontSize: 11, fontWeight: 600,
              cursor: "pointer", border: "1px solid rgba(148,163,184,0.3)",
              background: "rgba(148,163,184,0.07)", color: MUTED,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
              transition: "all 0.15s",
            }}
            onMouseEnter={e => {
              const b = e.currentTarget as HTMLButtonElement;
              b.style.background = "rgba(148,163,184,0.15)";
              b.style.color = TEXT;
            }}
            onMouseLeave={e => {
              const b = e.currentTarget as HTMLButtonElement;
              b.style.background = "rgba(148,163,184,0.07)";
              b.style.color = MUTED;
            }}
          >
            <PhoneMissed size={11} strokeWidth={2.5} />
            Ikke svar
          </button>

          {/* Ring tilbage */}
          <button
            onClick={() => { setShowCalendar(true); setPickedDate(todayStr()); }}
            title="Sæt dato for ring-tilbage"
            style={{
              flex: 1, padding: "5px 0", borderRadius: 6, fontSize: 11, fontWeight: 600,
              cursor: "pointer", border: "1px solid rgba(96,165,250,0.3)",
              background: chip ? "rgba(96,165,250,0.12)" : "rgba(96,165,250,0.07)", color: "#93C5FD",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
              transition: "all 0.15s",
            }}
            onMouseEnter={e => {
              const b = e.currentTarget as HTMLButtonElement;
              b.style.background = "rgba(96,165,250,0.18)";
              b.style.borderColor = "rgba(96,165,250,0.5)";
            }}
            onMouseLeave={e => {
              const b = e.currentTarget as HTMLButtonElement;
              b.style.background = chip ? "rgba(96,165,250,0.12)" : "rgba(96,165,250,0.07)";
              b.style.borderColor = "rgba(96,165,250,0.3)";
            }}
          >
            <Calendar size={11} strokeWidth={2.5} />
            Ring tilbage
          </button>

          {/* Nej */}
          <button
            onClick={() => onAction(lead.id, "no")}
            title="Marker som ikke interesseret"
            style={{
              flex: 1, padding: "5px 0", borderRadius: 6, fontSize: 11, fontWeight: 600,
              cursor: "pointer", border: "1px solid rgba(239,68,68,0.3)",
              background: "rgba(239,68,68,0.07)", color: "#FCA5A5",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
              transition: "all 0.15s",
            }}
            onMouseEnter={e => {
              const b = e.currentTarget as HTMLButtonElement;
              b.style.background = "rgba(239,68,68,0.18)";
              b.style.borderColor = "rgba(239,68,68,0.5)";
            }}
            onMouseLeave={e => {
              const b = e.currentTarget as HTMLButtonElement;
              b.style.background = "rgba(239,68,68,0.07)";
              b.style.borderColor = "rgba(239,68,68,0.3)";
            }}
          >
            <X size={11} strokeWidth={2.5} />
            Nej
          </button>

          {/* Vundet */}
          <button
            onClick={() => setShowWon(true)}
            title="Marker som vundet"
            style={{
              flex: 1, padding: "5px 0", borderRadius: 6, fontSize: 11, fontWeight: 600,
              cursor: "pointer", border: "1px solid rgba(251,191,36,0.3)",
              background: "rgba(251,191,36,0.07)", color: "#FBBF24",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
              transition: "all 0.15s",
            }}
            onMouseEnter={e => {
              const b = e.currentTarget as HTMLButtonElement;
              b.style.background = "rgba(251,191,36,0.18)";
              b.style.borderColor = "rgba(251,191,36,0.5)";
            }}
            onMouseLeave={e => {
              const b = e.currentTarget as HTMLButtonElement;
              b.style.background = "rgba(251,191,36,0.07)";
              b.style.borderColor = "rgba(251,191,36,0.3)";
            }}
          >
            <Trophy size={11} strokeWidth={2.5} />
            Vundet
          </button>
        </div>
      )}

      {/* ── Ring tilbage date picker ── */}
      {showCalendar && (
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input
            autoFocus
            type="date"
            min={todayStr()}
            value={pickedDate}
            onChange={e => setPickedDate(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") submitCallback(); if (e.key === "Escape") { setShowCalendar(false); setPickedDate(""); } }}
            style={{
              flex: 1, boxSizing: "border-box",
              background: "rgba(96,165,250,0.07)", border: "1px solid rgba(96,165,250,0.4)",
              borderRadius: 6, padding: "5px 10px",
              color: "#93C5FD", fontSize: 12, outline: "none", fontWeight: 600,
              colorScheme: "dark",
            }}
          />
          <button
            onClick={submitCallback}
            style={{
              padding: "5px 12px", borderRadius: 6, fontSize: 11, fontWeight: 700,
              cursor: "pointer", border: "1px solid rgba(96,165,250,0.5)",
              background: "rgba(96,165,250,0.18)", color: "#93C5FD",
            }}
          >
            Gem
          </button>
          <button
            onClick={() => { setShowCalendar(false); setPickedDate(""); }}
            style={{
              padding: "5px 8px", borderRadius: 6, fontSize: 11,
              cursor: "pointer", border: "1px solid rgba(255,255,255,0.1)",
              background: "transparent", color: MUTED,
            }}
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* ── Vundet amount input ── */}
      {showWon && (
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <div style={{ position: "relative", flex: 1 }}>
            <input
              autoFocus
              type="text"
              inputMode="numeric"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") submitWon(); if (e.key === "Escape") { setShowWon(false); setAmount(""); } }}
              placeholder="Beløb i kr."
              style={{
                width: "100%", boxSizing: "border-box",
                background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.4)",
                borderRadius: 6, padding: "5px 36px 5px 10px",
                color: "#FBBF24", fontSize: 12, outline: "none",
                fontWeight: 600,
              }}
            />
            <span style={{
              position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
              fontSize: 10, color: "rgba(251,191,36,0.5)", pointerEvents: "none",
            }}>kr.</span>
          </div>
          <button
            onClick={submitWon}
            style={{
              padding: "5px 12px", borderRadius: 6, fontSize: 11, fontWeight: 700,
              cursor: "pointer", border: "1px solid rgba(251,191,36,0.5)",
              background: "rgba(251,191,36,0.18)", color: "#FBBF24",
            }}
          >
            Gem
          </button>
          <button
            onClick={() => { setShowWon(false); setAmount(""); }}
            style={{
              padding: "5px 8px", borderRadius: 6, fontSize: 11,
              cursor: "pointer", border: "1px solid rgba(255,255,255,0.1)",
              background: "transparent", color: MUTED,
            }}
          >
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function TelesalesView() {
  const [search, setSearch]       = useState("");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const queryClient               = useQueryClient();

  const { data: leads = [], isLoading, isError } = useQuery<TLead[]>({
    queryKey: ["telesales"],
    queryFn:  () => cf("/api/telesales"),
  });

  const mutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      cf(`/api/telesales/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["telesales"] }),
  });

  function handleAction(id: number, action: "no" | "missed" | "won", amount?: number) {
    const lead = leads.find(l => l.id === id);
    const now  = new Date().toLocaleString("da-DK", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

    if (action === "no") {
      mutation.mutate({ id, body: { status: "no" } });

    } else if (action === "missed") {
      const prev  = lead?.notes?.trim() ?? "";
      const entry = `📞 ${now} — ikke svar`;
      const notes = prev ? `${prev}\n${entry}` : entry;
      mutation.mutate({ id, body: { notes } });

    } else if (action === "won") {
      const body: Record<string, unknown> = { status: "won" };
      if (amount != null) body.dealAmount = amount;
      mutation.mutate({ id, body });
    }
  }

  function handleCallback(id: number, date: string | null) {
    mutation.mutate({ id, body: { callbackAt: date } });
  }

  const q = search.trim().toLowerCase();

  // Sort: within each section, leads with callback_at come first (earliest first → overdue at top),
  // then the rest sorted alphabetically.
  function sortLeads(list: TLead[]): TLead[] {
    return [...list].sort((a, b) => {
      const aHas = a.callback_at != null;
      const bHas = b.callback_at != null;
      if (aHas && bHas) return new Date(a.callback_at!).getTime() - new Date(b.callback_at!).getTime();
      if (aHas) return -1;
      if (bHas) return 1;
      return a.name.localeCompare(b.name, "da");
    });
  }

  const bySection = useMemo(() => {
    return SECTIONS.reduce<Record<string, TLead[]>>((acc, sec) => {
      let list = leads.filter(l => sec.statuses.includes(l.status));
      if (q) list = list.filter(l =>
        [l.name, l.owner_phone ?? "", l.office_phone ?? "", l.email ?? ""]
          .join(" ").toLowerCase().includes(q)
      );
      acc[sec.key] = sortLeads(list);
      return acc;
    }, {});
  }, [leads, q]);

  // Count pending callbacks across all active sections
  const pendingCallbacks = useMemo(() => {
    return ["warm", "contacted", "cold"].reduce((sum, key) => {
      return sum + (bySection[key]?.filter(l => l.callback_at != null).length ?? 0);
    }, 0);
  }, [bySection]);

  const totalActive = (bySection.warm?.length ?? 0) + (bySection.contacted?.length ?? 0) + (bySection.cold?.length ?? 0);

  if (isLoading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: MUTED, fontSize: 14 }}>
      Henter leads…
    </div>
  );

  if (isError) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#FCA5A5", fontSize: 14 }}>
      Kunne ikke hente data. Tjek forbindelsen og prøv igen.
    </div>
  );

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: NAVY, overflow: "hidden" }}>

      {/* ── Header ── */}
      <div style={{ padding: "16px 20px 14px", borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 8, background: `${AMBER}18`,
              border: `1px solid ${AMBER}35`, display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Phone size={16} color={AMBER} />
            </div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, color: TEXT }}>Tele-salg</div>
              <div style={{ fontSize: 11, color: MUTED, display: "flex", alignItems: "center", gap: 8 }}>
                <span>{totalActive} aktive leads</span>
                {pendingCallbacks > 0 && (
                  <>
                    <span style={{ color: "rgba(255,255,255,0.2)" }}>·</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 4, color: "#93C5FD" }}>
                      <Calendar size={10} />
                      {pendingCallbacks} ring-tilbage
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Category filter tabs */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {SECTIONS.map(sec => {
              const count  = bySection[sec.key]?.length ?? 0;
              const active = activeKey === sec.key;
              const cbCount = bySection[sec.key]?.filter(l => l.callback_at != null).length ?? 0;
              return (
                <button
                  key={sec.key}
                  onClick={() => setActiveKey(active ? null : sec.key)}
                  style={{
                    padding: "4px 10px", borderRadius: 99, fontSize: 11, fontWeight: 600,
                    cursor: "pointer", transition: "all 0.15s",
                    background: active ? `${sec.color}22` : "rgba(255,255,255,0.04)",
                    border: `1px solid ${active ? sec.color + "55" : "rgba(255,255,255,0.1)"}`,
                    color: active ? sec.color : MUTED,
                    position: "relative",
                  }}
                >
                  {sec.label}
                  <span style={{ marginLeft: 5, opacity: 0.75, fontWeight: 400 }}>({count})</span>
                  {cbCount > 0 && (
                    <span style={{
                      marginLeft: 5, fontSize: 9, fontWeight: 700,
                      background: "rgba(96,165,250,0.25)", color: "#93C5FD",
                      borderRadius: 99, padding: "1px 5px",
                    }}>
                      📅{cbCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Search */}
        <div style={{ position: "relative" }}>
          <Search size={13} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: MUTED, pointerEvents: "none" }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Søg navn, nummer eller email…"
            style={{
              width: "100%", boxSizing: "border-box",
              background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`,
              borderRadius: 8, padding: "8px 12px 8px 32px",
              color: TEXT, fontSize: 13, outline: "none",
              transition: "border-color 0.15s",
            }}
            onFocus={e => { (e.target as HTMLInputElement).style.borderColor = `${AMBER}55`; }}
            onBlur={e => { (e.target as HTMLInputElement).style.borderColor = BORDER; }}
          />
        </div>
      </div>

      {/* ── Sections ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", scrollbarWidth: "thin", scrollbarColor: "rgba(201,164,98,0.2) transparent" }}>
        {SECTIONS.filter(sec => !activeKey || sec.key === activeKey).map(sec => {
          const list = bySection[sec.key] ?? [];
          const cbInSection = list.filter(l => l.callback_at != null).length;
          return (
            <div key={sec.key} style={{ marginBottom: 28 }}>
              {/* Section header */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: sec.color, display: "inline-block", flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: sec.color }}>{sec.label}</span>
                <span style={{ fontSize: 12, color: MUTED }}>({list.length})</span>
                {cbInSection > 0 && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 99,
                    background: "rgba(96,165,250,0.15)", color: "#93C5FD",
                    border: "1px solid rgba(96,165,250,0.25)",
                    display: "flex", alignItems: "center", gap: 4,
                  }}>
                    <Calendar size={9} />
                    {cbInSection} ring-tilbage
                  </span>
                )}
                <div style={{ flex: 1, height: 1, background: `${sec.color}20`, marginLeft: 4 }} />
              </div>

              {list.length === 0 ? (
                <div style={{ fontSize: 12, color: MUTED, padding: "6px 2px", fontStyle: "italic" }}>
                  {q ? "Ingen resultater matcher søgningen" : "Ingen leads i denne kategori endnu"}
                </div>
              ) : (
                list.map(l => (
                  <LeadCard
                    key={l.id}
                    lead={l}
                    onAction={handleAction}
                    onCallback={handleCallback}
                  />
                ))
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
