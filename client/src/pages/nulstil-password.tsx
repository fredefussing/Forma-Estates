import { useState } from "react";
import { Link, useLocation } from "wouter";
import { usePageTitle } from "@/hooks/use-page-title";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Eye, EyeOff, CheckCircle } from "lucide-react";

export default function NulstilPasswordPage() {
  usePageTitle("Nulstil password", "Opret et nyt password til din Forma Estates-konto.");
  const [, setLocation] = useLocation();

  const token = new URLSearchParams(window.location.search).get("token") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  if (!token) {
    return (
      <div className="min-h-screen bg-[#f5f5f0] flex items-center justify-center px-4">
        <div className="bg-white p-8 sm:p-10 rounded-2xl shadow-lg w-full max-w-[420px] text-center">
          <Link href="/">
            <span className="text-xl font-bold block mb-6 cursor-pointer text-[#1a1a1a]">Forma Estates</span>
          </Link>
          <p className="text-destructive font-medium mb-2">Ugyldigt link</p>
          <p className="text-sm text-muted-foreground mb-6">
            Dette nulstillingslink er ugyldigt eller mangler. Bed om et nyt link fra login-siden.
          </p>
          <Button className="w-full h-11" onClick={() => setLocation("/login")}>
            Gå til log ind
          </Button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-[#f5f5f0] flex items-center justify-center px-4">
        <div className="bg-white p-8 sm:p-10 rounded-2xl shadow-lg w-full max-w-[420px] text-center">
          <Link href="/">
            <span className="text-xl font-bold block mb-6 cursor-pointer text-[#1a1a1a]">Forma Estates</span>
          </Link>
          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-6 h-6 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Password opdateret</h1>
          <p className="text-sm text-muted-foreground mb-8">
            Dit password er nu ændret. Log ind med dit nye password.
          </p>
          <Button className="w-full h-12 text-base" onClick={() => setLocation("/login")}>
            Gå til log ind
          </Button>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password skal være mindst 8 tegn.");
      return;
    }
    if (password !== confirm) {
      setError("De to passwords matcher ikke.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setError(data.message || "Der skete en fejl. Prøv igen.");
      } else {
        setSuccess(true);
      }
    } catch {
      setError("Kunne ikke forbinde til serveren. Tjek din internetforbindelse.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f5f0] flex items-center justify-center px-4">
      <div className="bg-white p-8 sm:p-10 rounded-2xl shadow-lg w-full max-w-[420px]">
        <Link href="/">
          <span className="text-xl font-bold text-center block mb-6 cursor-pointer text-[#1a1a1a]">
            Forma Estates
          </span>
        </Link>

        <h1 className="text-2xl font-bold text-center mb-1">Nulstil password</h1>
        <p className="text-center text-muted-foreground mb-8">Vælg et nyt password til din konto</p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <Label htmlFor="password">Nyt password</Label>
            <div className="relative mt-1.5">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                required
                placeholder="Mindst 8 tegn"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pr-10"
                data-testid="input-new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showPassword ? "Skjul password" : "Vis password"}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <Label htmlFor="confirm">Bekræft nyt password</Label>
            <div className="relative mt-1.5">
              <Input
                id="confirm"
                type={showConfirm ? "text" : "password"}
                required
                placeholder="Gentag password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="pr-10"
                data-testid="input-confirm-password"
              />
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showConfirm ? "Skjul password" : "Vis password"}
              >
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            className="w-full h-12 text-base"
            disabled={loading}
            data-testid="button-reset-password"
          >
            {loading ? "Gemmer..." : "Gem nyt password"}
          </Button>

          {error && (
            <p className="text-destructive text-sm text-center" data-testid="text-error">
              {error}
            </p>
          )}
        </form>

        <Link href="/login">
          <span className="flex items-center justify-center gap-1.5 mt-6 text-sm text-muted-foreground hover:text-foreground cursor-pointer transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            Tilbage til log ind
          </span>
        </Link>
      </div>
    </div>
  );
}
