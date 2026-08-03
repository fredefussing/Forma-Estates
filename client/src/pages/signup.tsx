import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { usePageTitle } from "@/hooks/use-page-title";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, UserPlus, Eye, EyeOff } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function SignupPage() {
  const { t } = useTranslation();
  usePageTitle("Opret konto", "Opret en gratis konto hos Forma Estates og få 2 gratis AI-boligvisualiseringer — intet kreditkort.");
  const { user, loading: authLoading, emailVerified, isAdmin } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [, setLocation] = useLocation();

  const redirect = new URLSearchParams(window.location.search).get("redirect") || "/boligpotentiale/dashboard";
  const prefillEmail = new URLSearchParams(window.location.search).get("email") || "";

  useEffect(() => {
    if (prefillEmail && !email) setEmail(prefillEmail);
  }, [prefillEmail]);

  useEffect(() => {
    if (!authLoading && user && (emailVerified === true || isAdmin)) {
      setLocation(redirect);
    }
    if (!authLoading && user && emailVerified === false && !isAdmin) {
      setLocation(`/verificer-email?redirect=${encodeURIComponent(redirect)}`);
    }
  }, [user, authLoading, emailVerified, isAdmin, setLocation, redirect]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!displayName.trim() || displayName.trim().length < 2) {
      setError(t("signupPage.errors.nameTooShort"));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("signupPage.errors.passwordMismatch"));
      return;
    }

    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(userCredential.user, { displayName: displayName.trim() });
      setSuccess(t("signupPage.success"));
      setTimeout(() => {
        setLocation(`/verificer-email?redirect=${encodeURIComponent(redirect)}`);
      }, 1200);
    } catch (err: any) {
      if (err.code === "auth/email-already-in-use") {
        setError(t("signupPage.errors.emailInUse"));
      } else if (err.code === "auth/invalid-email") {
        setError(t("signupPage.errors.invalidEmail"));
      } else if (err.code === "auth/weak-password") {
        setError(t("signupPage.errors.weakPassword"));
      } else {
        setError(t("signupPage.errors.generic"));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f5f0] flex items-center justify-center px-4">
      <div className="bg-white p-8 sm:p-10 rounded-2xl shadow-lg w-full max-w-[420px]">
        <Link href="/">
          <span className="text-xl font-bold text-center block mb-6 cursor-pointer text-[#1a1a1a]" data-testid="link-logo">
            Forma Estates
          </span>
        </Link>

        <h1 className="text-2xl font-bold text-center mb-1" data-testid="text-title">{t("signupPage.title")}</h1>
        <p className="text-center text-muted-foreground mb-8" data-testid="text-subtitle">{t("signupPage.subtitle")}</p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <Label htmlFor="displayName">{t("signupPage.name")}</Label>
            <Input
              id="displayName"
              type="text"
              required
              placeholder={t("signupPage.namePlaceholder")}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1.5"
              data-testid="input-display-name"
            />
          </div>
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
            <Label htmlFor="password">Password</Label>
            <div className="relative mt-1.5">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                required
                placeholder={t("signupPage.passwordPlaceholder")}
                autoComplete="new-password"
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pr-10"
                data-testid="input-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showPassword ? "Hide password" : "Show password"}
                data-testid="button-toggle-password"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <Label htmlFor="confirmPassword">{t("signupPage.confirmPassword")}</Label>
            <div className="relative mt-1.5">
              <Input
                id="confirmPassword"
                type={showPassword ? "text" : "password"}
                required
                placeholder={t("signupPage.confirmPasswordPlaceholder")}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="pr-10"
                data-testid="input-confirm-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showPassword ? "Hide password" : "Show password"}
                data-testid="button-toggle-confirm-password"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <Button type="submit" className="w-full h-12 text-base" disabled={loading} data-testid="button-signup">
            <UserPlus className="w-4 h-4 mr-2" />
            {loading ? t("signupPage.creating") : t("signupPage.createButton")}
          </Button>

          {error && (
            <p className="text-destructive text-sm text-center" data-testid="text-error">{error}</p>
          )}
          {success && (
            <p className="text-green-600 text-sm text-center" data-testid="text-success">{success}</p>
          )}
        </form>

        <p className="text-center mt-6 text-sm text-muted-foreground">
          {t("signupPage.hasAccount")}{" "}
          <Link href="/login">
            <span className="text-[#1a1a1a] underline cursor-pointer font-medium" data-testid="link-login">{t("signupPage.login")}</span>
          </Link>
        </p>

        <Link href="/">
          <span className="flex items-center justify-center gap-1.5 mt-4 text-sm text-muted-foreground hover:text-foreground cursor-pointer transition-colors" data-testid="link-back">
            <ArrowLeft className="w-3.5 h-3.5" />
            {t("signupPage.backToFront")}
          </span>
        </Link>
      </div>
    </div>
  );
}
