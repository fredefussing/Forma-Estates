import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MailCheck, ArrowLeft } from "lucide-react";

export default function VerifyEmailPage() {
  const { user, loading: authLoading, emailVerified, refreshVerification } = useAuth();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const sentRef = useRef(false);
  const leavingRef = useRef(false);
  const [, setLocation] = useLocation();

  const redirect = new URLSearchParams(window.location.search).get("redirect") || "/boligpotentiale/dashboard";

  // Not logged in → login. Already verified → onwards.
  useEffect(() => {
    if (leavingRef.current) return;
    if (!authLoading && !user) setLocation("/login?redirect=/boligpotentiale/dashboard");
    if (!authLoading && user && emailVerified === true) setLocation(redirect);
  }, [user, authLoading, emailVerified, setLocation, redirect]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const sendCode = async (isResend: boolean) => {
    if (!user) return;
    setError("");
    try {
      const token = await user.getIdToken();
      const lang = localStorage.getItem("forma-lang") || undefined;
      const res = await fetch("/api/auth/send-verification-code", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ lang }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        if (data.alreadyVerified) {
          await refreshVerification();
          setLocation(redirect);
          return;
        }
        setInfo(isResend ? "Ny kode sendt! Tjek din indbakke." : "");
        setResendCooldown(60);
      } else if (res.status === 429 && data.retryAfterSeconds) {
        setResendCooldown(data.retryAfterSeconds);
        if (isResend) setError(data.message || "Vent et øjeblik før du beder om en ny kode.");
      } else {
        setError(data.message || "Kunne ikke sende koden. Prøv igen.");
      }
    } catch {
      setError("Kunne ikke sende koden. Tjek din forbindelse og prøv igen.");
    }
  };

  // Send the first code automatically when the page loads
  useEffect(() => {
    if (user && emailVerified === false && !sentRef.current) {
      sentRef.current = true;
      sendCode(false);
    }
  }, [user, emailVerified]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || verifying) return;
    setError("");
    setInfo("");
    setVerifying(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setInfo("Email bekræftet! Sender dig videre...");
        await refreshVerification();
        setLocation(redirect);
      } else {
        setError(data.message || "Forkert kode. Prøv igen.");
        if (data.needsNewCode) setCode("");
      }
    } catch {
      setError("Der skete en fejl. Prøv igen.");
    } finally {
      setVerifying(false);
    }
  };

  if (authLoading || !user) {
    return <div className="min-h-screen" style={{ background: "#f5f5f0" }} />;
  }

  return (
    <div className="min-h-screen bg-[#f5f5f0] flex items-center justify-center px-4">
      <div className="bg-white p-8 sm:p-10 rounded-2xl shadow-lg w-full max-w-[420px]">
        <Link href="/">
          <span className="text-xl font-bold text-center block mb-6 cursor-pointer text-[#1a1a1a]" data-testid="link-logo">
            Forma Estates
          </span>
        </Link>

        <div className="flex justify-center mb-4">
          <div className="w-12 h-12 rounded-full bg-[#f5f5f0] flex items-center justify-center">
            <MailCheck className="w-6 h-6 text-[#C8956C]" />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-center mb-1" data-testid="text-title">Bekræft din email</h1>
        <p className="text-center text-muted-foreground mb-8" data-testid="text-subtitle">
          Vi har sendt en 6-cifret kode til <strong className="text-foreground">{user.email}</strong>. Indtast den her for at aktivere din konto.
        </p>

        <form onSubmit={handleVerify} className="space-y-5">
          <Input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="text-center text-2xl tracking-[0.5em] h-14 font-semibold"
            data-testid="input-verification-code"
          />

          <Button type="submit" className="w-full h-12 text-base" disabled={verifying || code.length !== 6} data-testid="button-verify-code">
            {verifying ? "Bekræfter..." : "Bekræft kode"}
          </Button>

          {error && <p className="text-destructive text-sm text-center" data-testid="text-error">{error}</p>}
          {info && <p className="text-green-600 text-sm text-center" data-testid="text-info">{info}</p>}
        </form>

        <p className="text-center mt-6 text-sm text-muted-foreground">
          Fik du ikke koden?{" "}
          {resendCooldown > 0 ? (
            <span data-testid="text-resend-cooldown">Send igen om {resendCooldown} sek.</span>
          ) : (
            <button
              type="button"
              onClick={() => sendCode(true)}
              className="text-[#1a1a1a] underline cursor-pointer font-medium"
              data-testid="button-resend-code"
            >
              Send ny kode
            </button>
          )}
        </p>
        <p className="text-center mt-2 text-xs text-muted-foreground">Tjek også din spam-mappe. Koden er gyldig i 15 minutter.</p>

        <button
          type="button"
          onClick={async () => {
            leavingRef.current = true;
            try { await signOut(auth); } catch {}
            setLocation("/opret");
          }}
          className="flex items-center justify-center gap-1.5 mt-5 w-full text-sm text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
          data-testid="button-back-to-signup"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Tilbage til opret (skrev du forkert email?)
        </button>
      </div>
    </div>
  );
}
