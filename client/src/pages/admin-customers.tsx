import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, ArrowLeft, User, CreditCard, ShoppingBag, Lock, Calendar, Shield } from "lucide-react";

interface CustomerResult {
  id: number;
  email: string;
  customerCode: string | null;
  creditsRemaining: number;
  totalCreditsUsed: number;
  subscriptionStatus: string;
  subscriptionTier: string | null;
  isAdmin: boolean;
  createdAt: string | null;
  purchases: Array<{
    id: number;
    amount: number;
    description: string | null;
    createdAt: string | null;
  }>;
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("da-DK", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminCustomersPage() {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");

  const { data, isLoading, error } = useQuery<{ users: CustomerResult[] }>({
    queryKey: ["/api/admin/customers", query, password],
    queryFn: async () => {
      if (!query) return { users: [] };
      const res = await fetch(`/api/admin/customers?pw=${encodeURIComponent(password)}&q=${encodeURIComponent(query)}`);
      if (res.status === 401) throw new Error("Unauthorized");
      if (!res.ok) throw new Error("Server error");
      return res.json();
    },
    enabled: authed && query.length > 0,
    retry: false,
  });

  const handleLogin = async () => {
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      setAuthed(true);
    } else {
      alert("Forkert adgangskode");
    }
  };

  const handleSearch = () => {
    if (searchInput.trim()) setQuery(searchInput.trim());
  };

  if (!authed) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-foreground rounded-xl flex items-center justify-center">
              <Lock className="w-5 h-5 text-background" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">Admin — Kunder</h1>
              <p className="text-xs text-muted-foreground">Nordic Homebuild</p>
            </div>
          </div>
          <div className="space-y-3">
            <Input
              type="password"
              placeholder="Adgangskode"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              data-testid="input-admin-password"
            />
            <Button className="w-full" onClick={handleLogin} data-testid="button-admin-login">
              Log ind
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60 bg-background/90 backdrop-blur-lg sticky top-0 z-50">
        <div className="mx-auto max-w-5xl flex items-center justify-between px-6 h-16">
          <div className="flex items-center gap-4">
            <Link href="/admin">
              <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer inline-flex items-center gap-1">
                <ArrowLeft className="w-3.5 h-3.5" />
                Admin
              </span>
            </Link>
            <span className="text-muted-foreground/40">/</span>
            <span className="text-sm font-medium">Kunder</span>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/admin/quotes">
              <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">Tilbud</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight mb-1" data-testid="text-title">Kundeoversigt</h1>
          <p className="text-sm text-muted-foreground">Søg på email eller kundekode (NH-XXXXXX)</p>
        </div>

        <div className="flex gap-3 mb-8">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Søg på email eller NH-XXXXXX..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              data-testid="input-search"
            />
          </div>
          <Button onClick={handleSearch} data-testid="button-search">
            Søg
          </Button>
        </div>

        {isLoading && (
          <div className="text-center py-12 text-muted-foreground text-sm">Søger...</div>
        )}

        {error && (
          <div className="text-center py-12 text-red-500 text-sm">
            {error instanceof Error && error.message === "Unauthorized" ? "Ikke autoriseret" : "Der opstod en fejl"}
          </div>
        )}

        {!isLoading && !error && query && data?.users.length === 0 && (
          <div className="text-center py-12 text-muted-foreground text-sm">
            Ingen kunder fundet for "{query}"
          </div>
        )}

        {data?.users && data.users.length > 0 && (
          <div className="space-y-4" data-testid="list-customers">
            {data.users.map((customer) => (
              <div
                key={customer.id}
                className="bg-card border border-border/60 rounded-2xl p-6"
                data-testid={`card-customer-${customer.id}`}
              >
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-5">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <User className="w-4.5 h-4.5 text-muted-foreground" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm" data-testid={`text-email-${customer.id}`}>{customer.email}</span>
                        {customer.isAdmin && (
                          <Badge variant="secondary" className="text-xs gap-1">
                            <Shield className="w-3 h-3" />
                            Admin
                          </Badge>
                        )}
                      </div>
                      {customer.customerCode ? (
                        <div className="flex items-center gap-2 mt-1">
                          <span
                            className="font-mono text-sm font-semibold tracking-widest bg-muted px-2 py-0.5 rounded"
                            data-testid={`text-code-${customer.id}`}
                          >
                            {customer.customerCode}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground/60 mt-1">Ingen kundekode endnu</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-wrap">
                    {customer.subscriptionStatus === "active" && customer.subscriptionTier && (
                      <Badge className="capitalize" data-testid={`badge-sub-${customer.id}`}>
                        {customer.subscriptionTier === "basic" ? "Basic" :
                         customer.subscriptionTier === "pro" ? "Pro" :
                         customer.subscriptionTier === "unlimited" ? "Unlimited" :
                         customer.subscriptionTier}
                      </Badge>
                    )}
                    {customer.subscriptionStatus === "none" && (
                      <Badge variant="outline" className="text-muted-foreground">Gratis</Badge>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
                  <div className="bg-muted/50 rounded-xl p-3">
                    <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                      <CreditCard className="w-3.5 h-3.5" />
                      <span className="text-xs">Credits tilbage</span>
                    </div>
                    <span className="text-lg font-semibold" data-testid={`text-credits-${customer.id}`}>
                      {customer.isAdmin ? "∞" : customer.creditsRemaining}
                    </span>
                  </div>
                  <div className="bg-muted/50 rounded-xl p-3">
                    <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                      <ShoppingBag className="w-3.5 h-3.5" />
                      <span className="text-xs">Brugte billeder</span>
                    </div>
                    <span className="text-lg font-semibold">{customer.totalCreditsUsed}</span>
                  </div>
                  <div className="bg-muted/50 rounded-xl p-3">
                    <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                      <ShoppingBag className="w-3.5 h-3.5" />
                      <span className="text-xs">Køb i alt</span>
                    </div>
                    <span className="text-lg font-semibold">{customer.purchases.length}</span>
                  </div>
                  <div className="bg-muted/50 rounded-xl p-3">
                    <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                      <Calendar className="w-3.5 h-3.5" />
                      <span className="text-xs">Oprettet</span>
                    </div>
                    <span className="text-xs font-medium">{formatDate(customer.createdAt)}</span>
                  </div>
                </div>

                {customer.purchases.length > 0 && (
                  <div>
                    <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Ordrehistorik</h3>
                    <div className="space-y-2">
                      {customer.purchases.map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center justify-between text-sm py-2 border-b border-border/40 last:border-0"
                          data-testid={`row-purchase-${p.id}`}
                        >
                          <span className="text-muted-foreground">{p.description || "Køb"}</span>
                          <div className="flex items-center gap-4">
                            <span className="text-green-600 dark:text-green-400 font-medium">+{p.amount} billeder</span>
                            <span className="text-xs text-muted-foreground/60">{formatDate(p.createdAt)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {customer.purchases.length === 0 && (
                  <p className="text-xs text-muted-foreground/60">Ingen køb endnu</p>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
