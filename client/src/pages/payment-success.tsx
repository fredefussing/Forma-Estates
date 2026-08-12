import { useEffect, useState, useRef } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle, Loader2, RefreshCw, ArrowRight, Sparkles,
  Zap, Crown, Package, Image, Box, Video, Home, LogIn, UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { queryClient } from "@/lib/queryClient";

type VerifyResult =
  | { status: "pending" }
  | { status: "already_activated"; mode: string }
  | { status: "activated"; mode: "subscription"; tier: string; tierName: string; quotas: { ai: number; floorPlans: number; transformVideos: number; showcase: number } }
  | { status: "activated"; mode: "payment"; aiVisual: number; plan3d: number; transformVid: number; showcase: number; amountTotal: number | null };

type SessionInfo = {
  status: string;
  amount_total: number | null;
  customer_email: string | null;
  metadata: Record<string, string> | null;
  mode?: string;
};

const TIER_ICON: Record<string, typeof Sparkles> = { start: Sparkles, pro: Zap, business: Crown };
const TIER_COLOR: Record<string, string> = { start: "#6366F1", pro: "#0F1923", business: "#c9a96e" };

function PlanCard({ result }: { result: VerifyResult }) {
  if (result.status !== "activated") return null;

  if (result.mode === "subscription") {
    const Icon = TIER_ICON[result.tier] ?? Sparkles;
    const color = TIER_COLOR[result.tier] ?? "#6366F1";
    const q = result.quotas;
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
        className="bg-card border border-border rounded-2xl p-6 mb-6 text-left">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: color + "18" }}>
            <Icon className="w-5 h-5" style={{ color }} />
          </div>
          <div>
            <div className="font-semibold text-sm" style={{ color }}>{result.tierName} Plan aktiv</div>
            <div className="text-xs text-muted-foreground">Kvote nulstilles om 30 dage</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: Image, label: "AI Visualiseringer", val: q.ai },
            { icon: Box, label: "3D Plantegninger", val: q.floorPlans },
            { icon: Video, label: "Transformering Videoer", val: q.transformVideos },
            { icon: Home, label: "Bolig Showcase", val: q.showcase },
          ].map(({ icon: I, label, val }) => (
            <div key={label} className="flex items-center gap-2 bg-muted/50 rounded-xl px-3 py-2.5">
              <I className="w-4 h-4 text-muted-foreground shrink-0" />
              <div>
                <div className="text-xs text-muted-foreground leading-tight">{label}</div>
                <div className="text-sm font-semibold">{val} / md.</div>
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    );
  }

  if (result.mode === "payment") {
    const items = [
      { icon: Image, label: "AI Visualiseringer", val: result.aiVisual },
      { icon: Box, label: "3D Plantegninger", val: result.plan3d },
      { icon: Video, label: "Transformering Videoer", val: result.transformVid },
      { icon: Home, label: "Bolig Showcase", val: result.showcase },
    ].filter(i => i.val > 0);
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
        className="bg-card border border-border rounded-2xl p-6 mb-6 text-left">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-amber-50 dark:bg-amber-900/20">
            <Package className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <div className="font-semibold text-sm text-amber-700 dark:text-amber-400">Tilpasset pakke</div>
            {result.amountTotal !== null && (
              <div className="text-xs text-muted-foreground">
                {(result.amountTotal / 100).toLocaleString("da-DK", { style: "currency", currency: "DKK" })} betalt
              </div>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {items.map(({ icon: I, label, val }) => (
            <div key={label} className="flex items-center gap-2 bg-muted/50 rounded-xl px-3 py-2.5">
              <I className="w-4 h-4 text-muted-foreground shrink-0" />
              <div>
                <div className="text-xs text-muted-foreground leading-tight">{label}</div>
                <div className="text-sm font-semibold">+{val} stk.</div>
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    );
  }
  return null;
}

export default function PaymentSuccessPage() {
  const [, setLocation] = useLocation();
  const { user, loading: authLoading, refreshCredits } = useAuth();
  const [phase, setPhase] = useState<"loading" | "guest" | "success" | "already" | "timeout" | "no_session">("loading");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [guestSession, setGuestSession] = useState<SessionInfo | null>(null);
  const [dots, setDots] = useState(".");
  const attemptRef = useRef(0);
  const maxAttempts = 12;
  const sessionId = new URLSearchParams(window.location.search).get("session_id");

  useEffect(() => {
    const id = setInterval(() => setDots(d => d.length >= 3 ? "." : d + "."), 500);
    return () => clearInterval(id);
  }, []);

  // Fetch session info for guests (no auth needed)
  useEffect(() => {
    if (!sessionId) { setPhase("no_session"); return; }
    if (authLoading) return;

    if (!user) {
      // Guest: fetch public session info to show what they bought
      fetch(`/api/session-details/${sessionId}`)
        .then(r => r.json())
        .then((data: SessionInfo) => {
          if (data.status === "paid" || data.status === "complete") {
            setGuestSession(data);
            setPhase("guest");
          } else if (data.status === "unpaid") {
            setPhase("timeout");
          } else {
            setGuestSession(data);
            setPhase("guest");
          }
        })
        .catch(() => setPhase("guest"));
      return;
    }

    // Logged-in user: verify session and activate subscription
    const verify = async () => {
      if (attemptRef.current >= maxAttempts) { setPhase("timeout"); return; }
      attemptRef.current++;
      try {
        const token = await user.getIdToken(true);
        const res = await fetch("/api/stripe/verify-session", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ sessionId }),
        });
        const data: VerifyResult = await res.json();

        if (data.status === "pending") {
          setTimeout(verify, 2500);
          return;
        }
        setResult(data);
        if (data.status === "already_activated") {
          setPhase("already");
        } else if (data.status === "activated") {
          setPhase("success");
          await refreshCredits();
          queryClient.invalidateQueries({ queryKey: ["/api/bolig/quota"] });
          setTimeout(() => setLocation("/boligpotentiale/dashboard"), 4500);
        } else {
          setPhase("timeout");
        }
      } catch {
        setTimeout(verify, 3000);
      }
    };

    verify();
  }, [user, authLoading, sessionId, refreshCredits, setLocation]);

  const loginUrl = `/login?redirect=${encodeURIComponent(`/betalt?session_id=${sessionId}`)}`;
  const signupUrl = `/opret?redirect=${encodeURIComponent(`/betalt?session_id=${sessionId}`)}&email=${encodeURIComponent(guestSession?.customer_email ?? "")}`;

  return (
    <div className="min-h-screen bg-background flex flex-col" data-testid="page-payment-success">
      <header className="border-b border-border/60 bg-background/90 backdrop-blur-lg">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-6 h-16">
          <Link href="/">
            <span className="text-lg font-semibold tracking-tight cursor-pointer" data-testid="link-logo">Forma Estates</span>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="max-w-md w-full text-center">
          <AnimatePresence mode="wait">

            {/* ── LOADING ── */}
            {phase === "loading" && (
              <motion.div key="loading" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
                  <Loader2 className="w-9 h-9 text-muted-foreground animate-spin" />
                </div>
                <h1 className="text-2xl font-semibold tracking-tight mb-3" data-testid="text-waiting-title">
                  Bekræfter betaling{dots}
                </h1>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Vi verificerer din betaling hos Stripe og aktiverer din konto.
                </p>
              </motion.div>
            )}

            {/* ── GUEST: betaling ok men ikke logget ind ── */}
            {phase === "guest" && (
              <motion.div key="guest" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }}>
                <motion.div
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  className="w-20 h-20 rounded-full bg-green-50 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-6"
                >
                  <CheckCircle className="w-10 h-10 text-green-500" />
                </motion.div>

                <h1 className="text-2xl font-semibold tracking-tight mb-2" data-testid="text-guest-title">
                  Betaling gennemført!
                </h1>
                <p className="text-muted-foreground mb-6 text-sm leading-relaxed">
                  {guestSession?.customer_email
                    ? <>Betaling bekræftet for <strong>{guestSession.customer_email}</strong>.<br /></>
                    : null}
                  Opret din konto eller log ind for at aktivere dit abonnement og komme i gang.
                </p>

                {/* Payment summary */}
                {guestSession?.amount_total && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                    className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4 mb-6 text-left">
                    <div className="flex items-center gap-2 text-green-700 dark:text-green-400 text-sm font-medium">
                      <CheckCircle className="w-4 h-4 shrink-0" />
                      <span>
                        {(guestSession.amount_total / 100).toLocaleString("da-DK", { style: "currency", currency: "DKK" })} betalt og bekræftet
                      </span>
                    </div>
                  </motion.div>
                )}

                <div className="flex flex-col gap-3 mb-6">
                  <Button
                    className="w-full h-12 text-sm font-medium rounded-full"
                    onClick={() => setLocation(signupUrl)}
                    data-testid="button-create-account"
                  >
                    <UserPlus className="w-4 h-4 mr-2" />
                    Opret konto og aktivér abonnement
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full h-12 text-sm rounded-full"
                    onClick={() => setLocation(loginUrl)}
                    data-testid="button-login"
                  >
                    <LogIn className="w-4 h-4 mr-2" />
                    Jeg har allerede en konto
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground/60">
                  Din betaling er registreret og vil blive knyttet til din konto ved login.
                </p>
              </motion.div>
            )}

            {/* ── SUCCESS (logget ind) ── */}
            {phase === "success" && (
              <motion.div key="success" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.45 }}>
                <motion.div
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  className="w-20 h-20 rounded-full bg-green-50 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-6"
                >
                  <CheckCircle className="w-10 h-10 text-green-500" />
                </motion.div>
                <h1 className="text-2xl font-semibold tracking-tight mb-2" data-testid="text-success-title">
                  Konto aktiveret!
                </h1>
                <p className="text-muted-foreground mb-6 text-sm">
                  Dit abonnement er nu aktivt. Du omdirigeres til dashboardet om et øjeblik.
                </p>

                {result && <PlanCard result={result} />}

                <div className="bg-muted/50 rounded-xl p-5 mb-6 text-left space-y-3">
                  <div className="flex items-center gap-3 text-sm">
                    <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                    <span>Betaling bekræftet</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                    <span>Abonnement aktiveret</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Loader2 className="w-4 h-4 text-muted-foreground animate-spin shrink-0" />
                    <span className="text-muted-foreground">Omdirigerer til dashboard{dots}</span>
                  </div>
                </div>

                <Button
                  className="w-full h-12 text-sm font-medium rounded-full"
                  onClick={() => setLocation("/boligpotentiale/dashboard")}
                  data-testid="button-go-to-dashboard"
                >
                  Gå til dashboard nu
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </motion.div>
            )}

            {/* ── ALREADY ACTIVATED ── */}
            {phase === "already" && (
              <motion.div key="already" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
                <div className="w-20 h-20 rounded-full bg-green-50 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-6">
                  <CheckCircle className="w-10 h-10 text-green-500" />
                </div>
                <h1 className="text-2xl font-semibold tracking-tight mb-2">Din konto er aktiv</h1>
                <p className="text-muted-foreground mb-6 text-sm">
                  Denne betaling er allerede registreret på din konto.
                </p>
                <Button
                  className="w-full h-12 text-sm font-medium rounded-full"
                  onClick={() => setLocation("/boligpotentiale/dashboard")}
                  data-testid="button-go-to-dashboard-already"
                >
                  Gå til dashboard
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </motion.div>
            )}

            {/* ── NO SESSION ── */}
            {phase === "no_session" && (
              <motion.div key="no_session" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
                <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
                  <Sparkles className="w-9 h-9 text-muted-foreground" />
                </div>
                <h1 className="text-2xl font-semibold tracking-tight mb-2">Ingen betaling fundet</h1>
                <p className="text-muted-foreground mb-6 text-sm">
                  Gå til prissiden for at vælge et abonnement.
                </p>
                <Button
                  className="w-full h-12 text-sm font-medium rounded-full"
                  onClick={() => setLocation("/pris")}
                  data-testid="button-go-to-pricing"
                >
                  Se abonnementer
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </motion.div>
            )}

            {/* ── TIMEOUT ── */}
            {phase === "timeout" && (
              <motion.div key="timeout" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
                <div className="w-20 h-20 rounded-full bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center mx-auto mb-6">
                  <RefreshCw className="w-9 h-9 text-amber-500" />
                </div>
                <h1 className="text-2xl font-semibold tracking-tight mb-3" data-testid="text-timeout-title">
                  Det tager lidt tid
                </h1>
                <p className="text-muted-foreground mb-8 text-sm leading-relaxed">
                  Din betaling er registreret hos Stripe, men bekræftelsen forsinkes.<br />
                  Prøv igen om et øjeblik.
                </p>
                <div className="flex flex-col gap-3">
                  <Button
                    className="w-full h-12 text-sm font-medium rounded-full"
                    onClick={() => { attemptRef.current = 0; setPhase("loading"); }}
                    data-testid="button-manual-refresh"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Prøv igen
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full h-12 text-sm rounded-full"
                    onClick={() => setLocation("/boligpotentiale/dashboard")}
                    data-testid="button-go-to-dashboard-timeout"
                  >
                    Gå til dashboard alligevel
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground/60 mt-6">
                  Kontakt os på kontakt@formaestates.com hvis din konto ikke er aktiv inden for 10 minutter.
                </p>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
