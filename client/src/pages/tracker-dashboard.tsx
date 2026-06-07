import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { auth } from "@/lib/firebase";
import { RefreshCw, BellOff, Bell, Play, Clock, CheckCircle, AlertTriangle, XCircle, ChevronDown, ChevronRight } from "lucide-react";

interface CheckResult {
  name: string;
  label: string;
  status: "ok" | "warn" | "error";
  message: string;
  details?: Record<string, unknown>;
  checkedAt: string;
  durationMs: number;
}

interface DbLog {
  id: number;
  check_name: string;
  status: string;
  message: string;
  checked_at: string;
}

function statusColor(s: string) {
  if (s === "ok") return { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", dot: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-700" };
  if (s === "warn") return { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", dot: "bg-amber-400", badge: "bg-amber-100 text-amber-700" };
  return { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", dot: "bg-red-500", badge: "bg-red-100 text-red-700" };
}

function StatusDot({ status, pulse }: { status: string; pulse?: boolean }) {
  const c = statusColor(status);
  return (
    <span className="relative inline-flex h-3 w-3">
      {pulse && status !== "ok" && (
        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${c.dot} opacity-60`} />
      )}
      <span className={`relative inline-flex rounded-full h-3 w-3 ${c.dot}`} />
    </span>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "ok") return <CheckCircle className="w-4 h-4 text-emerald-500" />;
  if (status === "warn") return <AlertTriangle className="w-4 h-4 text-amber-500" />;
  return <XCircle className="w-4 h-4 text-red-500" />;
}

function CheckCard({
  check, muted, onMute, onUnmute,
}: {
  check: CheckResult; muted: boolean;
  onMute: (name: string) => void; onUnmute: (name: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const c = statusColor(check.status);
  const ago = Math.round((Date.now() - new Date(check.checkedAt).getTime()) / 1000);
  const agoStr = ago < 60 ? `${ago}s siden` : `${Math.round(ago / 60)}m siden`;

  return (
    <div className={`rounded-xl border ${c.border} ${c.bg} p-4 transition-all`}>
      <div className="flex items-start gap-3">
        <StatusDot status={check.status} pulse />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-[#0F1923] text-sm">{check.label}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.badge}`}>
              {check.status.toUpperCase()}
            </span>
            {muted && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">
                MUTED 1H
              </span>
            )}
          </div>
          <p className="text-sm text-slate-600 mt-1 leading-snug">{check.message}</p>
          <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
            <span><Clock className="w-3 h-3 inline mr-1" />{agoStr}</span>
            <span>{check.durationMs}ms</span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {check.details && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1.5 rounded-lg hover:bg-white/60 text-slate-400 transition-colors"
              title="Vis detaljer"
            >
              {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          )}
          <button
            onClick={() => muted ? onUnmute(check.name) : onMute(check.name)}
            className="p-1.5 rounded-lg hover:bg-white/60 text-slate-400 transition-colors"
            title={muted ? "Slå alarmer til igen" : "Slå alarmer fra i 1 time"}
          >
            {muted ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
          </button>
        </div>
      </div>
      {expanded && check.details && (
        <div className="mt-3 pt-3 border-t border-white/50">
          <pre className="text-xs text-slate-600 bg-white/50 rounded-lg p-3 overflow-x-auto">
            {JSON.stringify(check.details, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function FlowNode({
  label, status, subtitle,
}: { label: string; status?: string; subtitle?: string }) {
  const s = status ?? "ok";
  const c = statusColor(s);
  return (
    <div className={`flex flex-col items-center gap-1`}>
      <div className={`rounded-lg border ${c.border} ${c.bg} px-3 py-2 text-center min-w-[80px]`}>
        <StatusDot status={s} />
        <div className={`text-xs font-semibold mt-1 ${c.text}`}>{label}</div>
        {subtitle && <div className="text-xs text-slate-400 mt-0.5">{subtitle}</div>}
      </div>
    </div>
  );
}

function FlowArrow() {
  return <div className="text-slate-300 text-lg font-light select-none mt-1">→</div>;
}

export default function TrackerDashboard() {
  const { user } = useAuth();
  const [checks, setChecks] = useState<CheckResult[]>([]);
  const [muted, setMuted] = useState<string[]>([]);
  const [dbLogs, setDbLogs] = useState<DbLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [runningNow, setRunningNow] = useState(false);
  const [countdown, setCountdown] = useState(30);

  async function getToken() {
    if (!auth.currentUser) return "";
    return auth.currentUser.getIdToken(true);
  }

  const fetchStatus = useCallback(async () => {
    try {
      const token = await getToken();
      const [statusRes, historyRes] = await Promise.all([
        fetch("/api/tracker/status", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/tracker/history?hours=24", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (statusRes.ok) {
        const data = await statusRes.json();
        setChecks(data.checks ?? []);
        setMuted(data.muted ?? []);
      }
      if (historyRes.ok) {
        const data = await historyRes.json();
        setDbLogs(data.db ?? []);
      }
      setLastRefresh(new Date());
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Auto-refresh every 30s with countdown
  useEffect(() => {
    setCountdown(30);
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          fetchStatus();
          return 30;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  async function handleMute(checkName: string) {
    const token = await getToken();
    await fetch("/api/tracker/mute", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ checkName, hours: 1 }),
    });
    fetchStatus();
  }

  async function handleUnmute(checkName: string) {
    const token = await getToken();
    await fetch("/api/tracker/unmute", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ checkName }),
    });
    fetchStatus();
  }

  async function handleRunNow() {
    setRunningNow(true);
    const token = await getToken();
    await fetch("/api/tracker/run-now", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });
    await new Promise((r) => setTimeout(r, 8000));
    await fetchStatus();
    setRunningNow(false);
  }

  const errors = checks.filter((c) => c.status === "error");
  const warns = checks.filter((c) => c.status === "warn");
  const ok = checks.filter((c) => c.status === "ok");

  const overallStatus =
    errors.length > 0 ? "error" : warns.length > 0 ? "warn" : "ok";

  const flowMap: Record<string, string> = {};
  checks.forEach((c) => { flowMap[c.name] = c.status; });

  if (!user) {
    return (
      <div className="min-h-screen bg-[#FAF6EC] flex items-center justify-center">
        <div className="text-center">
          <p className="text-[#0F1923] font-semibold mb-2">Log ind for at se systemtracker</p>
          <a href="/login" className="text-[#C9A96E] underline text-sm">Log ind</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF6EC]">
      {/* Header */}
      <div className="bg-[#0F1923] border-b border-white/10 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <StatusDot status={overallStatus} pulse />
            <div>
              <div className="text-[#C9A96E] text-xs tracking-widest uppercase font-semibold">Forma Estates</div>
              <h1 className="text-white font-semibold text-lg leading-tight">System Tracker</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {lastRefresh && (
              <span className="text-slate-400 text-xs hidden sm:block">
                Opdateret {lastRefresh.toLocaleTimeString("da-DK")} · næste om {countdown}s
              </span>
            )}
            <button
              onClick={handleRunNow}
              disabled={runningNow}
              className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white text-sm px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              <Play className={`w-3.5 h-3.5 ${runningNow ? "animate-pulse" : ""}`} />
              {runningNow ? "Checker..." : "Kør nu"}
            </button>
            <button
              onClick={() => { setLoading(true); fetchStatus(); }}
              className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white text-sm px-3 py-1.5 rounded-lg transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Opdater
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

        {/* Summary bar */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "OK", count: ok.length, status: "ok" },
            { label: "Advarsler", count: warns.length, status: "warn" },
            { label: "Fejl", count: errors.length, status: "error" },
          ].map((s) => {
            const c = statusColor(s.status);
            return (
              <div key={s.label} className={`rounded-xl border ${c.border} ${c.bg} p-4 text-center`}>
                <div className={`text-2xl font-bold ${c.text}`}>{s.count}</div>
                <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
              </div>
            );
          })}
        </div>

        {/* Host flow visualization */}
        <div className="bg-white rounded-2xl border border-[#E8DFD0] p-5">
          <h2 className="text-sm font-semibold text-[#0F1923] mb-4">Host Flow</h2>
          <div className="overflow-x-auto">
            <div className="flex items-start gap-2 min-w-max pb-2">
              <FlowNode label="DNS" status={flowMap["site_online"]} subtitle="GoDaddy" />
              <FlowArrow />
              <FlowNode label="CDN/SSL" status={flowMap["site_online"]} subtitle="Cloudflare" />
              <FlowArrow />
              <FlowNode label="App" status={flowMap["app_self"]} subtitle="Express" />
              <FlowArrow />
              <FlowNode label="Firebase" status={flowMap["firebase_config"]} subtitle="Auth" />
              <FlowArrow />
              <FlowNode label="PostgreSQL" status={flowMap["db_health"]} subtitle="Database" />
              <FlowArrow />
              <FlowNode label="Collov AI" status={flowMap["collov_api"]} subtitle="Billeder" />
              <FlowArrow />
              <FlowNode label="fal.ai" status={flowMap["fal_api"]} subtitle="Video/3D" />
            </div>
          </div>
        </div>

        {/* Check cards */}
        <div>
          <h2 className="text-sm font-semibold text-[#0F1923] mb-3">Live Checks</h2>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-20 rounded-xl bg-white/60 border border-[#E8DFD0] animate-pulse" />
              ))}
            </div>
          ) : checks.length === 0 ? (
            <div className="rounded-xl bg-white border border-[#E8DFD0] p-8 text-center text-slate-400 text-sm">
              Tracker ikke startet endnu — vent 10 sekunder og opdater
            </div>
          ) : (
            <div className="space-y-3">
              {/* Errors first, then warns, then ok */}
              {[...errors, ...warns, ...ok].map((check) => (
                <CheckCard
                  key={check.name}
                  check={check}
                  muted={muted.includes(check.name)}
                  onMute={handleMute}
                  onUnmute={handleUnmute}
                />
              ))}
            </div>
          )}
        </div>

        {/* DB History — errors/warns from last 24h */}
        {dbLogs.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-[#0F1923] mb-3">Fejlhistorik (24h)</h2>
            <div className="bg-white rounded-2xl border border-[#E8DFD0] divide-y divide-[#F0EBE1]">
              {dbLogs.slice(0, 50).map((log) => {
                const c = statusColor(log.status);
                const ts = new Date(log.checked_at).toLocaleString("da-DK", {
                  timeZone: "Europe/Copenhagen",
                  day: "numeric", month: "short",
                  hour: "2-digit", minute: "2-digit",
                });
                return (
                  <div key={log.id} className="flex items-center gap-3 px-4 py-3">
                    <StatusIcon status={log.status} />
                    <div className="flex-1 min-w-0">
                      <span className={`text-xs font-semibold ${c.text} mr-2`}>{log.check_name}</span>
                      <span className="text-sm text-slate-600 truncate">{log.message}</span>
                    </div>
                    <span className="text-xs text-slate-400 shrink-0">{ts}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Info footer */}
        <div className="bg-white rounded-2xl border border-[#E8DFD0] p-4 text-xs text-slate-400 space-y-1">
          <div className="font-medium text-slate-500 mb-2">Schedule</div>
          <div>🔁 Credit checks (Collov AI, fal.ai) — hvert <strong>5. minut</strong></div>
          <div>🔁 Host flow checks (DB, App, Site) — hvert <strong>2. minut</strong></div>
          <div>🔁 Deep health check (Firebase) — hvert <strong>15. minut</strong></div>
          <div>📧 Email alert rate limit — max <strong>1 per 30 min</strong> for samme fejl</div>
          <div>📊 Daglig opsummeringsmail — kl. <strong>08:00</strong></div>
          <div>🗄️ Logretention — <strong>30 dage</strong> i database</div>
        </div>
      </div>
    </div>
  );
}
