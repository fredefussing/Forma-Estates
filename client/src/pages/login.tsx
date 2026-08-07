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
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";

export default function LoginPage() {
  const { t } = useTranslation();
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
        setError(t("loginPage.errors.userNotFound"));
      } else if (err.code === "auth/wrong-password") {
        setError(t("loginPage.errors.wrongPassword"));
      } else if (err.code === "auth/invalid-credential") {
        setError(t("loginPage.errors.invalidCredential"));
      } else if (err.code === "auth/too-many-requests") {
        setError(t("loginPage.errors.tooManyRequests"));
      } else {
        setError(t("loginPage.errors.generic"));
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
      const r = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resetEmail.trim(), lang: i18n.language }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.success) {
        throw new Error(j.message || t("loginPage.errors.generic"));
      }
      setResetSent(true);
    } catch (err: any) {
      setResetError(err.message || t("loginPage.errors.generic"));
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

          <h1 className="text-2xl font-bold text-center mb-1" data-testid="text-title">{t("loginPage.reset.title")}</h1>
          <p className="text-center text-muted-foreground mb-8" data-testid="text-subtitle">{t("loginPage.reset.subtitle")}</p>

          {resetSent ? (
            <div className="text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm text-muted-foreground">{t("loginPage.reset.sentPre")} <strong>{resetEmail}</strong>.</p>
              <p className="text-xs text-muted-foreground">{t("loginPage.reset.spamNote")}</p>
              <button
                onClick={() => { setResetMode(false); setResetSent(false); setResetEmail(""); }}
                className="text-sm text-[#1a1a1a] underline"
                data-testid="link-back-to-login"
              >
                {t("loginPage.reset.backToLogin")}
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
                  placeholder={t("loginPage.emailPlaceholder")}
                  autoComplete="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  className="mt-1.5"
                  data-testid="input-reset-email"
                />
              </div>
              <Button type="submit" className="w-full h-12 text-base" disabled={resetLoading} data-testid="button-send-reset">
                {resetLoading ? t("loginPage.reset.sending") : t("loginPage.reset.sendButton")}
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
              {t("loginPage.reset.backToLogin")}
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

        <h1 className="text-2xl font-bold text-center mb-1" data-testid="text-title">{t("loginPage.title")}</h1>
        <p className="text-center text-muted-foreground mb-8" data-testid="text-subtitle">{t("loginPage.subtitle")}</p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              placeholder={t("loginPage.emailPlaceholder")}
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
                {t("loginPage.forgotPassword")}
              </button>
            </div>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                required
                placeholder={t("loginPage.passwordPlaceholder")}
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
                aria-label={showPassword ? t("loginPage.hidePassword") : t("loginPage.showPassword")}
                data-testid="button-toggle-password"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <Button type="submit" className="w-full h-12 text-base" disabled={loading} data-testid="button-login">
            <LogIn className="w-4 h-4 mr-2" />
            {loading ? t("loginPage.loggingIn") : t("loginPage.loginButton")}
          </Button>

          {error && (
            <p className="text-destructive text-sm text-center" data-testid="text-error">{error}</p>
          )}
        </form>

        <p className="text-center mt-6 text-sm text-muted-foreground">
          {t("loginPage.noAccount")}{" "}
          <Link href="/opret">
            <span className="text-[#1a1a1a] underline cursor-pointer font-medium" data-testid="link-signup">{t("loginPage.createAccount")}</span>
          </Link>
        </p>

        <Link href="/">
          <span className="flex items-center justify-center gap-1.5 mt-4 text-sm text-muted-foreground hover:text-foreground cursor-pointer transition-colors" data-testid="link-back">
            <ArrowLeft className="w-3.5 h-3.5" />
            {t("loginPage.backToFront")}
          </span>
        </Link>
      </div>
    </div>
  );
}
