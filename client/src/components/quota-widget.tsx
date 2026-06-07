import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { BarChart3, Sparkles, Box, Video, Film } from "lucide-react";

interface QuotaData {
  isAdmin: boolean;
  quota: {
    ai:            { limit: number | null; used: number };
    floorPlan:     { limit: number | null; used: number };
    transformVideo:{ limit: number | null; used: number };
    showcase:      { limit: number | null; used: number };
    resetsAt:      string | null;
  };
}

function QuotaBar({ used, limit, color = "#C8956C" }: { used: number; limit: number | null; color?: string }) {
  if (limit === null) return (
    <div className="h-1.5 rounded-full w-full" style={{ background: "rgba(200,149,108,0.25)" }}>
      <div className="h-1.5 rounded-full w-full" style={{ background: color, opacity: 0.5 }} />
    </div>
  );
  const pct = limit === 0 ? 0 : Math.min(100, (used / limit) * 100);
  const barColor = pct >= 100 ? "#EF4444" : pct >= 80 ? "#F59E0B" : color;
  return (
    <div className="h-1.5 rounded-full w-full" style={{ background: "rgba(0,0,0,0.08)" }}>
      <div className="h-1.5 rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: barColor }} />
    </div>
  );
}

const FEATURES = [
  { key: "ai",            label: "AI Visualiseringer",  icon: Sparkles },
  { key: "floorPlan",     label: "3D Floor Plans",      icon: Box },
  { key: "transformVideo",label: "Transformering Video", icon: Video },
  { key: "showcase",      label: "Bolig Showcase",       icon: Film },
] as const;

export function QuotaWidget() {
  const { user } = useAuth();

  const { data } = useQuery<QuotaData>({
    queryKey: ["/api/bolig/quota"],
    queryFn: async () => {
      if (!user) throw new Error("No user");
      const token = await user.getIdToken();
      const res = await fetch("/api/bolig/quota", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!user,
    refetchInterval: 30_000,
  });

  if (!data) return null;

  const resetDate = data.quota.resetsAt
    ? new Date(data.quota.resetsAt).toLocaleDateString("da-DK", { day: "numeric", month: "long" })
    : null;

  return (
    <div className="bg-white rounded-2xl p-5 border border-[#E8E4DE] shadow-sm" data-testid="quota-widget">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4" style={{ color: "#C8956C" }} />
          <h3 className="text-sm font-semibold" style={{ color: "#1A1A1A" }}>Månedlig kvota</h3>
        </div>
        {resetDate && (
          <span className="text-[11px]" style={{ color: "#9B9690" }}>Nulstilles {resetDate}</span>
        )}
        {data.isAdmin && (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(200,149,108,0.12)", color: "#C8956C" }}>Admin</span>
        )}
      </div>

      <div className="space-y-3.5">
        {FEATURES.map(({ key, label, icon: Icon }) => {
          const f = data.quota[key as keyof typeof data.quota] as { limit: number | null; used: number };
          const isUnlimited = data.isAdmin || f.limit === null;
          const remaining = isUnlimited ? null : Math.max(0, (f.limit ?? 0) - f.used);
          const exhausted = !isUnlimited && remaining === 0;

          return (
            <div key={key}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <Icon className="w-3.5 h-3.5" style={{ color: exhausted ? "#EF4444" : "#9B9690" }} />
                  <span className="text-xs font-medium" style={{ color: exhausted ? "#EF4444" : "#1A1A1A" }}>{label}</span>
                </div>
                <span className="text-[11px] font-semibold" style={{ color: exhausted ? "#EF4444" : "#6B6B6B" }}>
                  {isUnlimited ? "Ubegrænset" : exhausted ? "Brugt op" : `${remaining} tilbage`}
                </span>
              </div>
              <QuotaBar
                used={f.used}
                limit={isUnlimited ? null : f.limit}
                color={exhausted ? "#EF4444" : "#C8956C"}
              />
              {!isUnlimited && (
                <div className="flex justify-between mt-0.5">
                  <span className="text-[10px]" style={{ color: "#B0ABA5" }}>{f.used} brugt</span>
                  <span className="text-[10px]" style={{ color: "#B0ABA5" }}>{f.limit ?? 0} i alt</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
