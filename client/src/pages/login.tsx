import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { usePageTitle } from "@/hooks/use-page-title";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, LogIn, Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  usePageTitle("Log ind", "Log ind på din Forma Estates-konto og fortsæt arbejdet med dine boligvisualiseringer.");
  const { user, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [, setLocation] = useLocation();

  const [resetMode, setResetMode] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState("");

  const redirect = new URLSearchParams(window.location.search).get("redirect") || "/boligpotentiale/dashboard";

  useEffect(() => {
    if (!authLoading && user) {
      setLocation(redirect);
    }
  }, [user, authLoading, setLocation, redirect]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email, password);
      setLocation(redirect);
    } catch (err: any) {
      if (err.code === "auth/user-not-found") {
        setError("Bruger ikke fundet. Tjek email eller opret konto.");
      } else if (err.code === "auth/wrong-password") {
        setError("Forkert password. Prøv igen.");
      } else if (err.code === "auth/invalid-credential") {
        setError("Forkert email eller password. Prøv igen.");
      } else if (err.code === "auth/too-many-requests") {
        setError("For mange forsøg. Prøv igen senere.");
      } else {
        setError("Der skete en fejl. Prøv igen.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError("");
    setResetLoading(true);
    try {
      // Går via vores egen server, så hvert forsøg logges (fejlsøgning af
      // "mailen kommer aldrig"-sager). Selve mailen sendes af Firebase.
      const r = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resetEmail.trim() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.success) {
        throw new Error(j.message || "Der skete en fejl. Prøv igen.");
      }
      setResetSent(true);
    } catch (err: any) {
      setResetError(err.message || "Der skete en fejl. Prøv igen.");
    } finally {
      setResetLoading(false);
    }
  };

  if (resetMode) {
    return (
      <div className="min-h-screen bg-[#f5f5f0] flex items-center justify-center px-4">
        <div className="bg-white p-8 sm:p-10 rounded-2xl shadow-lg w-full max-w-[420px]">
          <Link href="/">
            <span className="text-xl font-bold text-center block mb-6 cursor-pointer text-[#1a1a1a]" data-testid="link-logo">
              Forma Estates
            </span>
          </Link>

          <h1 className="text-2xl font-bold text-center mb-1" data-testid="text-title">Nulstil password</h1>
          <p className="text-center text-muted-foreground mb-8" data-testid="text-subtitle">Vi sender dig et link til at oprette nyt password</p>

          {resetSent ? (
            <div className="text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm text-muted-foreground">Vi har sendt et nulstillingslink til <strong>{resetEmail}</strong>.</p>
              <p className="text-xs text-muted-foreground">Mailen kommer fra <strong>kontakt@formaestates.com</strong> — tjek evt. din spam-mappe hvis den ikke dukker op inden for et par minutter.</p>
              <button
                onClick={() => { setResetMode(false); setResetSent(false); setResetEmail(""); }}
                className="text-sm text-[#1a1a1a] underline"
                data-testid="link-back-to-login"
              >
                Tilbage til log ind
              </button>
            </div>
          ) : (
            <form onSubmit={handlePasswordReset} className="space-y-5">
              <div>
                <Label htmlFor="reset-email">Email</Label>
                <Input
                  id="reset-email"
                  type="email"
                  required
                  placeholder="din@email.dk"
                  autoComplete="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  className="mt-1.5"
                  data-testid="input-reset-email"
                />
              </div>

              <Button type="submit" className="w-full h-12 text-base" disabled={resetLoading} data-testid="button-send-reset">
                {resetLoading ? "Sender..." : "Send nulstillingslink"}
              </Button>

              {resetError && (
                <p className="text-destructive text-sm text-center" data-testid="text-reset-error">{resetError}</p>
              )}
            </form>
          )}

          {!resetSent && (
            <button
              onClick={() => setResetMode(false)}
              className="flex items-center justify-center gap-1.5 mt-6 text-sm text-muted-foreground hover:text-foreground cursor-pointer transition-colors w-full"
              data-testid="link-back-to-login-bottom"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Tilbage til log ind
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f0] flex items-center justify-center px-4">
      <div className="bg-white p-8 sm:p-10 rounded-2xl shadow-lg w-full max-w-[420px]">
        <Link href="/">
          <span className="text-xl font-bold text-center block mb-6 cursor-pointer text-[#1a1a1a]" data-testid="link-logo">
            Forma Estates
          </span>
        </Link>

        <h1 className="text-2xl font-bold text-center mb-1" data-testid="text-title">Log ind</h1>
        <p className="text-center text-muted-foreground mb-8" data-testid="text-subtitle">Få adgang til dine AI-billeder</p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              placeholder="din@email.dk"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5"
              data-testid="input-email"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label htmlFor="password">Password</Label>
              <button
                type="button"
                onClick={() => { setResetMode(true); setResetEmail(email); }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors underline"
                data-testid="link-forgot-password"
              >
                Glemt password?
              </button>
            </div>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                required
                placeholder="Dit password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pr-10"
                data-testid="input-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showPassword ? "Skjul password" : "Vis password"}
                data-testid="button-toggle-password"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <Button type="submit" className="w-full h-12 text-base" disabled={loading} data-testid="button-login">
            <LogIn className="w-4 h-4 mr-2" />
            {loading ? "Logger ind..." : "Log ind"}
          </Button>

          {error && (
            <p className="text-destructive text-sm text-center" data-testid="text-error">{error}</p>
          )}
        </form>

        <p className="text-center mt-6 text-sm text-muted-foreground">
          Har du ikke en konto?{" "}
          <Link href="/opret">
            <span className="text-[#1a1a1a] underline cursor-pointer font-medium" data-testid="link-signup">Opret bruger</span>
          </Link>
        </p>

        <Link href="/">
          <span className="flex items-center justify-center gap-1.5 mt-4 text-sm text-muted-foreground hover:text-foreground cursor-pointer transition-colors" data-testid="link-back">
            <ArrowLeft className="w-3.5 h-3.5" />
            Tilbage til forsiden
          </span>
        </Link>
      </div>
    </div>
  );
}
