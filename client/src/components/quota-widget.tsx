import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { BarChart3, Sparkles, Box, Video, Film, Users, Copy, Check, Lock } from "lucide-react";

interface QuotaData {
  isAdmin: boolean;
  inviteLink: string | null;
  teamCode: string | null;
  quota: {
    ai:            { limit: number | null; used: number };
    floorPlan:     { limit: number | null; used: number };
    transformVideo:{ limit: number | null; used: number };
    showcase:      { limit: number | null; used: number };
    resetsAt:      string | null;
    teamPlan:      string | null;
    teamName:      string | null;
    memberCount:   number | null;
    maxMembers:    number | null;
    isFreeTrial?:  boolean;
  };
}

function QuotaBar({ used, limit, color = "#C8956C" }: { used: number; limit: number | null; color?: string }) {
  if (limit === null) return (
    <div className="h-1.5 rounded-full w-full" style={{ background: "rgba(200,149,108,0.15)" }}>
      <div className="h-1.5 rounded-full w-full" style={{ background: color, opacity: 0.4 }} />
    </div>
  );
  const pct = limit === 0 ? 0 : Math.min(100, (used / limit) * 100);
  const barColor = pct >= 100 ? "#EF4444" : pct >= 80 ? "#F59E0B" : color;
  return (
    <div className="h-1.5 rounded-full w-full" style={{ background: "rgba(0,0,0,0.06)" }}>
      <div className="h-1.5 rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: barColor }} />
    </div>
  );
}

const FEATURES = [
  { key: "ai",            label: "AI Visualiseringer",  icon: Sparkles },
  { key: "floorPlan",     label: "3D Plantegninger",     icon: Box },
  { key: "transformVideo",label: "Transformering Video", icon: Video },
  { key: "showcase",      label: "Bolig Showcase",       icon: Film },
] as const;

const TIER_LABELS: Record<string, string> = {
  start: "Start",
  pro: "Pro",
  business: "Business",
  unlimited: "Unlimited",
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-lg transition-all"
      style={{ background: copied ? "rgba(45,106,79,0.1)" : "rgba(200,149,108,0.1)", color: copied ? "#2D6A4F" : "#C8956C" }}
      data-testid="button-copy-invite-link"
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? "Kopieret!" : "Kopier link"}
    </button>
  );
}

// Module-level cache so newly mounted gates/widgets start from the latest
// known quota instead of flashing a "loading → locked/unlocked" transition.
// User-scoped: cache from one account is never shown for another.
let quotaCache: { uid: string; data: QuotaData } | null = null;

export function useQuotaData(): QuotaData | null {
  const { user } = useAuth();
  const [data, setData] = useState<QuotaData | null>(
    quotaCache && quotaCache.uid === user?.uid ? quotaCache.data : null
  );
  useEffect(() => {
    if (!user) { quotaCache = null; setData(null); return; }
    if (quotaCache && quotaCache.uid !== user.uid) { quotaCache = null; setData(null); }
    let cancelled = false;
    const load = async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/bolig/quota", { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const json = await res.json();
        quotaCache = { uid: user.uid, data: json };
        if (!cancelled) setData(json);
      } catch { /* ignore */ }
    };
    load();
    const interval = setInterval(load, 30_000);
    // Refetch immediately after a generation so gates/counters update without
    // waiting for the next poll.
    const onRefresh = () => { load(); };
    window.addEventListener("quota:refresh", onRefresh);
    return () => { cancelled = true; clearInterval(interval); window.removeEventListener("quota:refresh", onRefresh); };
  }, [user]);
  return data;
}

export function QuotaWidget() {
  const data = useQuotaData();

  if (!data) return null;

  const { quota, isAdmin, inviteLink } = data;
  const isUnlimitedUser = isAdmin || quota.teamPlan === "unlimited";
  const isFreeTrial = !!quota.isFreeTrial && !isAdmin;
  const planLabel = isAdmin
    ? "Admin · Ubegrænset"
    : quota.teamPlan
    ? `${TIER_LABELS[quota.teamPlan] ?? quota.teamPlan} plan`
    : null;

  const resetsAtDate = quota.resetsAt ? new Date(quota.resetsAt) : null;
  const resetDate = resetsAtDate
    ? resetsAtDate.toLocaleDateString("da-DK", { day: "numeric", month: "long" })
    : null;
  const daysRemaining = resetsAtDate
    ? Math.max(0, Math.ceil((resetsAtDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  return (
    <div className="bg-white rounded-2xl p-5 border border-[#E8E4DE] shadow-sm" data-testid="quota-widget">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="w-4 h-4" style={{ color: "#C8956C" }} />
            <h3 className="text-sm font-semibold" style={{ color: "#1A1A1A" }}>{isFreeTrial ? "Gratis prøve" : "Månedlig kvota"}</h3>
            {isFreeTrial ? (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(200,149,108,0.12)", color: "#C8956C" }}>
                Gratis
              </span>
            ) : planLabel && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(200,149,108,0.1)", color: "#C8956C" }}>
                {planLabel}
              </span>
            )}
          </div>
        </div>
        <div className="text-right">
          {quota.teamName && quota.memberCount !== null && quota.maxMembers !== null && (
            <div className="flex items-center gap-1 mb-1 justify-end">
              <Users className="w-3 h-3" style={{ color: "#9B9690" }} />
              <span className="text-[11px]" style={{ color: "#9B9690" }}>{quota.memberCount}/{quota.maxMembers} medl.</span>
            </div>
          )}
        </div>
      </div>

      {/* Reset countdown — prominent pill */}
      {resetDate && !isUnlimitedUser && daysRemaining !== null && (
        <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-xl" style={{ background: daysRemaining <= 5 ? "rgba(239,68,68,0.06)" : "rgba(200,149,108,0.07)" }}>
          <div className="flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0" style={{ background: daysRemaining <= 5 ? "rgba(239,68,68,0.12)" : "rgba(200,149,108,0.12)" }}>
            <span className="text-sm font-bold" style={{ color: daysRemaining <= 5 ? "#EF4444" : "#C8956C" }}>{daysRemaining}</span>
          </div>
          <div>
            <p className="text-xs font-semibold leading-tight" style={{ color: daysRemaining <= 5 ? "#EF4444" : "#1A1A1A" }}>
              {daysRemaining === 1 ? "1 dag tilbage" : `${daysRemaining} dage tilbage`}
            </p>
            <p className="text-[11px] leading-tight" style={{ color: "#9B9690" }}>Kvota nulstilles {resetDate}</p>
          </div>
        </div>
      )}

      {/* Feature rows */}
      <div className="space-y-3.5">
        {FEATURES.map(({ key, label, icon: Icon }) => {
          const f = (quota as any)[key] as { limit: number | null; used: number };
          const unlimited = isUnlimitedUser || f.limit === null;
          // "locked" = free-trial user, feature not part of the trial (limit 0).
          const locked = isFreeTrial && !unlimited && (f.limit ?? 0) === 0;
          const remaining = unlimited ? null : Math.max(0, (f.limit ?? 0) - f.used);
          const danger = !unlimited && !locked && remaining === 0;

          return (
            <div key={key}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  {locked
                    ? <Lock className="w-3.5 h-3.5" style={{ color: "#B0ABA5" }} />
                    : <Icon className="w-3.5 h-3.5" style={{ color: danger ? "#EF4444" : "#9B9690" }} />}
                  <span className="text-xs font-medium" style={{ color: danger ? "#EF4444" : locked ? "#9B9690" : "#1A1A1A" }}>{label}</span>
                </div>
                <span className="text-[11px] font-semibold" style={{ color: danger ? "#EF4444" : locked ? "#B0ABA5" : "#6B6B6B" }}>
                  {unlimited ? "Ubegrænset" : locked ? "Kun i pakker" : danger ? "Brugt op" : `${remaining} tilbage`}
                </span>
              </div>
              <QuotaBar used={locked ? 0 : f.used} limit={unlimited ? null : (locked ? 0 : f.limit)} color={danger ? "#EF4444" : "#C8956C"} />
              {!unlimited && !locked && (
                <div className="flex justify-between mt-0.5">
                  <span className="text-[10px]" style={{ color: "#B0ABA5" }}>{f.used} brugt</span>
                  <span className="text-[10px]" style={{ color: "#B0ABA5" }}>{f.limit ?? 0} i alt</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Free-trial upgrade CTA */}
      {isFreeTrial && (
        <div className="mt-4 pt-4 border-t border-[#F0EDE8]">
          <p className="text-[11px] leading-relaxed mb-2.5" style={{ color: "#6B6B6B" }}>
            Du er på en gratis prøve med {quota.ai.limit ?? 2} AI-visualiseringer. Opgradér for at låse 3D-plantegninger, videoer og mere op.
          </p>
          <a
            href="/pris"
            data-testid="link-upgrade-quota"
            className="inline-flex items-center justify-center gap-1.5 w-full px-4 py-2 rounded-full text-xs font-semibold text-white transition-all hover:opacity-90"
            style={{ background: "#C8956C" }}
          >
            Opgradér nu →
          </a>
        </div>
      )}

      {/* Invite link — only for team owners */}
      {inviteLink && (
        <div className="mt-4 pt-4 border-t border-[#F0EDE8]">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" style={{ color: "#C8956C" }} />
              <span className="text-xs font-semibold" style={{ color: "#1A1A1A" }}>Team invite-link</span>
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ background: "rgba(200,149,108,0.1)", color: "#C8956C" }}>Max 15 medl.</span>
            </div>
            <CopyButton text={inviteLink} />
          </div>
          <p className="text-[11px] leading-relaxed" style={{ color: "#9B9690" }}>
            Del med kolleger — gratis adgang under dit team. Mere end 15?{" "}
            <a href="mailto:support@formaestates.dk" className="underline" style={{ color: "#C8956C" }}>Skriv til support</a>
            {" "}og vi fikser det.
          </p>
        </div>
      )}
    </div>
  );
}

// ── QuotaGate ────────────────────────────────────────────────────────────────
// Wraps a generate button — shows a lock banner when the user's quota is
// exhausted (used >= limit) or when they have no plan (limit=0).
const QUOTA_GATE_LABELS: Record<string, string> = {
  ai: "AI-visualiseringer",
  floorPlan: "3D-plantegninger",
  transformVideo: "transformeringsvideoer",
  showcase: "showcase-videoer",
};

export function QuotaGate({
  feature,
  children,
}: {
  feature: "ai" | "floorPlan" | "transformVideo" | "showcase";
  children: React.ReactNode;
}) {
  const data = useQuotaData();
  if (!data) return <>{children}</>;
  const { isAdmin, quota } = data;
  if (isAdmin) return <>{children}</>;

  const f = quota[feature];
  const exhausted = f.limit !== null && f.used >= f.limit;
  if (!exhausted) return <>{children}</>;

  const isFreeTrial = !!quota.isFreeTrial;
  // Feature the free plan never included (limit 0) vs. an allowance that ran out.
  const locked = (f.limit ?? 0) === 0;

  const title = locked
    ? `${QUOTA_GATE_LABELS[feature]} kræver et abonnement`
    : isFreeTrial
    ? `Du har brugt dine ${f.limit} gratis AI-visualiseringer`
    : `Alle dine ${QUOTA_GATE_LABELS[feature]} er brugt op`;

  const subtitle = locked
    ? "Lås denne funktion op ved at vælge en pakke"
    : isFreeTrial
    ? "Opgradér for at fortsætte — og lås alle funktioner op"
    : "Opgradér din pakke for at generere flere";

  return (
    <div className="w-full rounded-2xl border border-amber-200 bg-amber-50 p-5 flex flex-col items-center gap-3 text-center" data-testid={`quota-gate-${feature}`}>
      <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
        <Lock className="w-5 h-5 text-amber-600" />
      </div>
      <div>
        <p className="text-sm font-semibold text-amber-900">{title}</p>
        <p className="text-xs text-amber-700 mt-1">{subtitle}</p>
      </div>
      <a
        href="/pris"
        data-testid={`button-upgrade-${feature}`}
        className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full text-sm font-semibold text-white transition-all hover:opacity-90"
        style={{ background: "#C8956C" }}
      >
        Opgradér nu →
      </a>
    </div>
  );
}
