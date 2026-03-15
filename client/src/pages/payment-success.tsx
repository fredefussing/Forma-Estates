import { useEffect, useState, useRef } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, Loader2, RefreshCw, ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";

type PollState = "waiting" | "success" | "timeout";

export default function PaymentSuccessPage() {
  const [, setLocation] = useLocation();
  const { user, refreshCredits } = useAuth();
  const [pollState, setPollState] = useState<PollState>("waiting");
  const [currentCredits, setCurrentCredits] = useState<number | null>(null);
  const [addedCredits, setAddedCredits] = useState<number | null>(null);
  const [dots, setDots] = useState(".");
  const baselineRef = useRef<number | null>(null);
  const attemptsRef = useRef(0);
  const maxAttempts = 20;

  useEffect(() => {
    const stored = localStorage.getItem("pendingPurchase");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.baselineCredits !== undefined) {
          baselineRef.current = parsed.baselineCredits;
        }
      } catch {}
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setDots(d => d.length >= 3 ? "." : d + ".");
    }, 500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!user) return;

    const poll = async () => {
      if (attemptsRef.current >= maxAttempts) {
        setPollState("timeout");
        return;
      }
      attemptsRef.current++;

      try {
        const token = await user.getIdToken(true);
        const res = await fetch("/api/credits", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json();
        const credits: number = data.creditsRemaining;
        const subActive: boolean = data.subscriptionStatus === "active";

        setCurrentCredits(credits);

        const baseline = baselineRef.current;
        const creditsIncreased = baseline !== null ? credits > baseline : subActive;
        const justActivated = subActive;

        if (creditsIncreased || justActivated) {
          if (baseline !== null && credits > baseline) {
            setAddedCredits(credits - baseline);
          }
          await refreshCredits();
          localStorage.removeItem("pendingPurchase");
          setPollState("success");
          setTimeout(() => setLocation("/design"), 3500);
        }
      } catch {}
    };

    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [user, setLocation, refreshCredits]);

  const handleManualRefresh = async () => {
    if (!user) return;
    attemptsRef.current = 0;
    setPollState("waiting");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col" data-testid="page-payment-success">
      <header className="border-b border-border/60 bg-background/90 backdrop-blur-lg">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-6 h-16">
          <Link href="/">
            <span className="text-lg font-semibold tracking-tight cursor-pointer" data-testid="link-logo">Nordic Homebuild</span>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-20">
        <div className="max-w-md w-full text-center">
          <AnimatePresence mode="wait">
            {pollState === "waiting" && (
              <motion.div
                key="waiting"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.4 }}
              >
                <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
                  <Loader2 className="w-9 h-9 text-muted-foreground animate-spin" />
                </div>
                <h1 className="text-2xl font-semibold tracking-tight mb-3" data-testid="text-waiting-title">
                  Behandler din betaling{dots}
                </h1>
                <p className="text-muted-foreground mb-8 text-sm leading-relaxed">
                  Vi venter på bekræftelse fra Shopify.<br />
                  Dette tager normalt 5–15 sekunder.
                </p>

                <div className="bg-muted/50 rounded-xl p-5 mb-8 text-left space-y-3">
                  <div className="flex items-center gap-3 text-sm">
                    <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                    <span>Betaling modtaget af Shopify</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Loader2 className="w-4 h-4 text-muted-foreground animate-spin shrink-0" />
                    <span className="text-muted-foreground">Tilføjer credits til din konto{dots}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground/60">
                    <div className="w-4 h-4 rounded-full border border-border shrink-0" />
                    <span>Omdirigerer til designværktøjet</span>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground/60">
                  Luk ikke dette vindue. Siden opdateres automatisk.
                </p>
              </motion.div>
            )}

            {pollState === "success" && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              >
                <motion.div
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  className="w-20 h-20 rounded-full bg-green-50 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-6"
                >
                  <CheckCircle className="w-10 h-10 text-green-500" />
                </motion.div>

                <h1 className="text-2xl font-semibold tracking-tight mb-2" data-testid="text-success-title">
                  Betaling modtaget!
                </h1>
                {addedCredits !== null && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="inline-flex items-center gap-2 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 px-4 py-2 rounded-full text-sm font-medium mb-4 mt-2"
                    data-testid="text-credits-added"
                  >
                    <Sparkles className="w-4 h-4" />
                    +{addedCredits} billeder tilføjet til din konto
                  </motion.div>
                )}
                <p className="text-muted-foreground mb-8 text-sm">
                  Alle 8 stilarter er nu tilgængelige. Du omdirigeres automatisk om et øjeblik.
                </p>

                <div className="bg-muted/50 rounded-xl p-5 mb-8 text-left space-y-3">
                  <div className="flex items-center gap-3 text-sm">
                    <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                    <span>Betaling modtaget</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                    <span>Credits tilføjet til din konto</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Loader2 className="w-4 h-4 text-muted-foreground animate-spin shrink-0" />
                    <span className="text-muted-foreground">Omdirigerer til designværktøjet{dots}</span>
                  </div>
                </div>

                <Button
                  className="w-full h-12 text-sm font-medium rounded-full"
                  onClick={() => setLocation("/design")}
                  data-testid="button-go-to-design"
                >
                  Start dit design nu
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </motion.div>
            )}

            {pollState === "timeout" && (
              <motion.div
                key="timeout"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
              >
                <div className="w-20 h-20 rounded-full bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center mx-auto mb-6">
                  <RefreshCw className="w-9 h-9 text-amber-500" />
                </div>
                <h1 className="text-2xl font-semibold tracking-tight mb-3" data-testid="text-timeout-title">
                  Det tager lidt tid
                </h1>
                <p className="text-muted-foreground mb-8 text-sm leading-relaxed">
                  Din betaling er registreret. Credits tilføjes inden for få minutter.<br />
                  Prøv at opdatere manuelt, eller tjek "Min konto" om lidt.
                </p>

                <div className="flex flex-col gap-3">
                  <Button
                    className="w-full h-12 text-sm font-medium rounded-full"
                    onClick={handleManualRefresh}
                    data-testid="button-manual-refresh"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Tjek igen
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full h-12 text-sm rounded-full"
                    onClick={() => setLocation("/design")}
                    data-testid="button-go-to-design-timeout"
                  >
                    Gå til designværktøjet
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground/60 mt-6">
                  Kontakt os på kontakt@nordic-homebuild.com hvis du stadig mangler credits efter 10 minutter.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
