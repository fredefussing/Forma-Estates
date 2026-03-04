import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Lock, BarChart3, Users, Image, MessageSquare, RefreshCw, ArrowLeft } from "lucide-react";

interface AdminStats {
  totalDesigns: number;
  completedDesigns: number;
  designsToday: number;
  designsThisWeek: number;
  totalQuotes: number;
  totalSpecialRequests: number;
  styleCounts: Record<string, number>;
  roomCounts: Record<string, number>;
  recentDesigns: Array<{
    id: number;
    roomType: string;
    style: string;
    status: string;
    budget: number | null;
    tier: string | null;
    createdAt: string | null;
  }>;
}

const styleLabels: Record<string, string> = {
  scandinavian: "Skandinavisk",
  modern: "Moderne",
  luxury: "Luksus",
  industrial: "Industriel",
  coastal: "Kyst",
  transitional: "Overgangs",
  farmhouse: "Landlig",
  midcentury: "Midcentury",
};

const roomLabels: Record<string, string> = {
  "living room": "Stue",
  bedroom: "Soveværelse",
  kitchen: "Køkken",
  bathroom: "Badeværelse",
  "dining room": "Spisestue",
  "home office": "Kontor",
  "kids room": "Børneværelse",
  studio: "Studio",
  "game room": "Spillerum",
  "home gym": "Træningsrum",
  "laundry room": "Bryggers",
  "conference room": "Konferencelokale",
  "spa room": "Spa",
  outdoor: "Udendørs",
  "open living and dining room": "Åben stue/spisestue",
};

const statusLabels: Record<string, string> = {
  pending: "Venter",
  processing: "I gang",
  completed: "Færdig",
  failed: "Fejlet",
};

export default function AdminDashboardPage() {
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [authError, setAuthError] = useState("");
  const [storedPassword, setStoredPassword] = useState("");

  const { data: stats, isLoading, refetch } = useQuery<AdminStats>({
    queryKey: ["/api/admin/stats", storedPassword],
    queryFn: async () => {
      const res = await fetch(`/api/admin/stats?pw=${encodeURIComponent(storedPassword)}`);
      if (!res.ok) throw new Error("Unauthorized");
      return res.json();
    },
    enabled: authenticated,
  });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        setAuthenticated(true);
        setStoredPassword(password);
      } else {
        setAuthError("Forkert adgangskode");
      }
    } catch {
      setAuthError("Der skete en fejl. Prøv igen.");
    }
  };

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-[#f5f5f0] flex items-center justify-center px-4">
        <div className="bg-white p-10 rounded-2xl shadow-lg w-full max-w-[400px] text-center">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-6">
            <Lock className="w-8 h-8 text-gray-500" />
          </div>
          <h1 className="text-2xl font-bold mb-2" data-testid="text-admin-title">Admin</h1>
          <p className="text-muted-foreground mb-6" data-testid="text-admin-subtitle">Indtast adgangskode for at se statistik</p>
          <form onSubmit={handleLogin} className="space-y-4">
            <Input
              type="password"
              placeholder="Adgangskode"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 text-base"
              data-testid="input-admin-password"
            />
            <Button type="submit" className="w-full h-12 text-base" data-testid="button-admin-login">
              Log ind
            </Button>
            {authError && (
              <p className="text-destructive text-sm" data-testid="text-admin-error">{authError}</p>
            )}
          </form>
          <Link href="/">
            <span className="flex items-center justify-center gap-1.5 mt-6 text-sm text-muted-foreground hover:text-foreground cursor-pointer transition-colors" data-testid="link-back">
              <ArrowLeft className="w-3.5 h-3.5" />
              Tilbage til forsiden
            </span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f0] p-6 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-dashboard-title">
            <BarChart3 className="w-6 h-6" />
            Nordic Homebuild Dashboard
          </h1>
          <Button variant="outline" onClick={() => refetch()} className="gap-2" data-testid="button-refresh">
            <RefreshCw className="w-4 h-4" />
            Opdater
          </Button>
        </div>

        {isLoading ? (
          <div className="text-center py-20 text-muted-foreground">Indlæser data...</div>
        ) : stats ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <StatCard
                icon={<Image className="w-5 h-5" />}
                value={stats.totalDesigns}
                label="Totale designs"
                sub={`${stats.completedDesigns} færdige`}
                testId="stat-total-designs"
              />
              <StatCard
                icon={<Users className="w-5 h-5" />}
                value={stats.designsToday}
                label="Designs i dag"
                sub="Seneste 24 timer"
                testId="stat-designs-today"
              />
              <StatCard
                icon={<BarChart3 className="w-5 h-5" />}
                value={stats.designsThisWeek}
                label="Designs denne uge"
                sub="Seneste 7 dage"
                testId="stat-designs-week"
              />
              <StatCard
                icon={<MessageSquare className="w-5 h-5" />}
                value={stats.totalQuotes + stats.totalSpecialRequests}
                label="Forespørgsler"
                sub={`${stats.totalQuotes} tilbud, ${stats.totalSpecialRequests} manuelle`}
                testId="stat-requests"
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              <div className="bg-white rounded-2xl p-6 shadow-sm">
                <h2 className="font-semibold mb-4" data-testid="text-style-stats-title">Populære stilarter</h2>
                <div className="space-y-3">
                  {Object.entries(stats.styleCounts)
                    .sort(([, a], [, b]) => b - a)
                    .map(([style, count]) => (
                      <div key={style} className="flex items-center justify-between">
                        <span className="text-sm">{styleLabels[style] || style}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-32 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[#1a1a1a] rounded-full"
                              style={{ width: `${(count / stats.completedDesigns) * 100}%` }}
                            />
                          </div>
                          <span className="text-sm text-muted-foreground w-8 text-right">{count}</span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              <div className="bg-white rounded-2xl p-6 shadow-sm">
                <h2 className="font-semibold mb-4" data-testid="text-room-stats-title">Populære rum</h2>
                <div className="space-y-3">
                  {Object.entries(stats.roomCounts)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 8)
                    .map(([room, count]) => (
                      <div key={room} className="flex items-center justify-between">
                        <span className="text-sm">{roomLabels[room] || room}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-32 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[#1a1a1a] rounded-full"
                              style={{ width: `${(count / stats.completedDesigns) * 100}%` }}
                            />
                          </div>
                          <span className="text-sm text-muted-foreground w-8 text-right">{count}</span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="p-6 border-b">
                <h2 className="font-semibold" data-testid="text-recent-designs-title">Seneste designs</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-[#1a1a1a] text-white text-sm">
                      <th className="px-4 py-3 text-left font-medium">ID</th>
                      <th className="px-4 py-3 text-left font-medium">Rum</th>
                      <th className="px-4 py-3 text-left font-medium">Stil</th>
                      <th className="px-4 py-3 text-left font-medium">Status</th>
                      <th className="px-4 py-3 text-left font-medium">Budget</th>
                      <th className="px-4 py-3 text-left font-medium">Tier</th>
                      <th className="px-4 py-3 text-left font-medium">Dato</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recentDesigns.map((d) => (
                      <tr key={d.id} className="border-b last:border-0 hover:bg-gray-50 text-sm">
                        <td className="px-4 py-3 font-mono">#{d.id}</td>
                        <td className="px-4 py-3">{roomLabels[d.roomType] || d.roomType}</td>
                        <td className="px-4 py-3">{styleLabels[d.style] || d.style}</td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={d.status === "completed" ? "default" : d.status === "failed" ? "destructive" : "secondary"}
                            className="text-xs"
                          >
                            {statusLabels[d.status] || d.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          {d.budget ? `${d.budget.toLocaleString("da-DK")} kr` : "—"}
                        </td>
                        <td className="px-4 py-3 capitalize">{d.tier || "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {d.createdAt ? new Date(d.createdAt).toLocaleDateString("da-DK") : "—"}
                        </td>
                      </tr>
                    ))}
                    {stats.recentDesigns.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                          Ingen designs endnu
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function StatCard({ icon, value, label, sub, testId }: {
  icon: React.ReactNode;
  value: number;
  label: string;
  sub: string;
  testId: string;
}) {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm" data-testid={testId}>
      <div className="flex items-center gap-3 mb-3 text-muted-foreground">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <div className="text-3xl font-bold text-[#1a1a1a]">{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{sub}</div>
    </div>
  );
}
