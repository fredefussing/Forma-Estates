import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { BarChart3, Sparkles, Box, Video, Film, Users, Copy, Check } from "lucide-react";

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

export function useQuotaData(): QuotaData | null {
  const { user } = useAuth();
  const [data, setData] = useState<QuotaData | null>(null);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/bolig/quota", { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch { /* ignore */ }
    };
    load();
    const interval = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [user]);
  return data;
}

export function QuotaWidget() {
  const data = useQuotaData();

  if (!data) return null;

  const { quota, isAdmin, inviteLink } = data;
  const isUnlimitedUser = isAdmin || quota.teamPlan === "unlimited";
  const planLabel = isAdmin
    ? "Admin · Ubegrænset"
    : quota.teamPlan
    ? `${TIER_LABELS[quota.teamPlan] ?? quota.teamPlan} plan`
    : null;

  const resetDate = quota.resetsAt
    ? new Date(quota.resetsAt).toLocaleDateString("da-DK", { day: "numeric", month: "long" })
    : null;

  return (
    <div className="bg-white rounded-2xl p-5 border border-[#E8E4DE] shadow-sm" data-testid="quota-widget">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="w-4 h-4" style={{ color: "#C8956C" }} />
            <h3 className="text-sm font-semibold" style={{ color: "#1A1A1A" }}>Månedlig kvota</h3>
            {planLabel && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(200,149,108,0.1)", color: "#C8956C" }}>
                {planLabel}
              </span>
            )}
          </div>
        </div>
        <div className="text-right">
          {resetDate && !isUnlimitedUser && (
            <span className="text-[11px] block" style={{ color: "#9B9690" }}>Nulstilles {resetDate}</span>
          )}
          {quota.teamName && quota.memberCount !== null && quota.maxMembers !== null && (
            <div className="flex items-center gap-1 mt-0.5 justify-end">
              <Users className="w-3 h-3" style={{ color: "#9B9690" }} />
              <span className="text-[11px]" style={{ color: "#9B9690" }}>{quota.memberCount}/{quota.maxMembers} medl.</span>
            </div>
          )}
        </div>
      </div>

      {/* Feature rows */}
      <div className="space-y-3.5">
        {FEATURES.map(({ key, label, icon: Icon }) => {
          const f = (quota as any)[key] as { limit: number | null; used: number };
          const unlimited = isUnlimitedUser || f.limit === null;
          const remaining = unlimited ? null : Math.max(0, (f.limit ?? 0) - f.used);
          const exhausted = !unlimited && remaining === 0;

          return (
            <div key={key}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <Icon className="w-3.5 h-3.5" style={{ color: exhausted ? "#EF4444" : "#9B9690" }} />
                  <span className="text-xs font-medium" style={{ color: exhausted ? "#EF4444" : "#1A1A1A" }}>{label}</span>
                </div>
                <span className="text-[11px] font-semibold" style={{ color: exhausted ? "#EF4444" : "#6B6B6B" }}>
                  {unlimited ? "Ubegrænset" : exhausted ? "Brugt op" : `${remaining} tilbage`}
                </span>
              </div>
              <QuotaBar used={f.used} limit={unlimited ? null : f.limit} color={exhausted ? "#EF4444" : "#C8956C"} />
              {!unlimited && (
                <div className="flex justify-between mt-0.5">
                  <span className="text-[10px]" style={{ color: "#B0ABA5" }}>{f.used} brugt</span>
                  <span className="text-[10px]" style={{ color: "#B0ABA5" }}>{f.limit ?? 0} i alt</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

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
