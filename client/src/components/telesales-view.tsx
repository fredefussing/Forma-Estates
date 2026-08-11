import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Phone, Search, PhoneCall } from "lucide-react";
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
function LeadCard({ lead }: { lead: TLead }) {
  const cat = CAT[lead.category] ?? CAT.andet;
  const hasPhones = lead.owner_phone || lead.office_phone;

  return (
    <div style={{
      background: CARD,
      border: `1px solid ${BORDER}`,
      borderRadius: 10,
      padding: "12px 14px",
      marginBottom: 8,
      transition: "border-color 0.15s",
    }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(201,164,98,0.4)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = BORDER; }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: hasPhones ? 8 : 0 }}>
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

      {hasPhones && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <PhoneEntry label="Indehaver" value={lead.owner_phone} />
          <PhoneEntry label="Kontor"    value={lead.office_phone} />
        </div>
      )}

      {!hasPhones && (
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 6 }}>
          <Phone size={11} color={MUTED} />
          <span style={{ fontSize: 11, color: MUTED, fontStyle: "italic" }}>Ingen numre registreret endnu</span>
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function TelesalesView() {
  const [search, setSearch]         = useState("");
  const [activeKey, setActiveKey]   = useState<string | null>(null);

  const { data: leads = [], isLoading, isError } = useQuery<TLead[]>({
    queryKey: ["telesales"],
    queryFn: () => cf("/api/telesales"),
  });

  const q = search.trim().toLowerCase();

  const bySection = useMemo(() => {
    return SECTIONS.reduce<Record<string, TLead[]>>((acc, sec) => {
      let list = leads.filter(l => sec.statuses.includes(l.status));
      if (q) list = list.filter(l =>
        [l.name, l.owner_phone ?? "", l.office_phone ?? "", l.email ?? ""]
          .join(" ").toLowerCase().includes(q)
      );
      acc[sec.key] = list;
      return acc;
    }, {});
  }, [leads, q]);

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
              <div style={{ fontSize: 11, color: MUTED }}>{totalActive} aktive leads</div>
            </div>
          </div>

          {/* Category filter tabs */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {SECTIONS.map(sec => {
              const count = bySection[sec.key]?.length ?? 0;
              const active = activeKey === sec.key;
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
                  }}
                >
                  {sec.label}
                  <span style={{ marginLeft: 5, opacity: 0.75, fontWeight: 400 }}>({count})</span>
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
          return (
            <div key={sec.key} style={{ marginBottom: 28 }}>
              {/* Section header */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: sec.color, display: "inline-block", flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: sec.color }}>{sec.label}</span>
                <span style={{ fontSize: 12, color: MUTED }}>({list.length})</span>
                <div style={{ flex: 1, height: 1, background: `${sec.color}20`, marginLeft: 4 }} />
              </div>

              {list.length === 0 ? (
                <div style={{ fontSize: 12, color: MUTED, padding: "6px 2px", fontStyle: "italic" }}>
                  {q ? "Ingen resultater matcher søgningen" : "Ingen leads i denne kategori endnu"}
                </div>
              ) : (
                list.map(l => <LeadCard key={l.id} lead={l} />)
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
