import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, UserPlus } from "lucide-react";

export default function SignupPage() {
  const { user, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [, setLocation] = useLocation();

  const redirect = new URLSearchParams(window.location.search).get("redirect") || "/min-konto";

  useEffect(() => {
    if (!authLoading && user) {
      setLocation(redirect);
    }
  }, [user, authLoading, setLocation, redirect]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (password !== confirmPassword) {
      setError("Passwords matcher ikke. Prøv igen.");
      return;
    }

    setLoading(true);

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      fetch("/api/auth/welcome-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userCredential.user.email }),
      }).catch(() => {});
      setSuccess("Bruger oprettet! Sender dig videre...");
      setTimeout(() => {
        setLocation(redirect);
      }, 1500);
    } catch (err: any) {
      if (err.code === "auth/email-already-in-use") {
        setError("Email er allerede i brug. Prøv at logge ind.");
      } else if (err.code === "auth/invalid-email") {
        setError("Ugyldig email. Tjek at du har skrevet rigtigt.");
      } else if (err.code === "auth/weak-password") {
        setError("Password er for svagt. Brug mindst 6 tegn.");
      } else {
        setError("Der skete en fejl. Prøv igen.");
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
            Nordic Homebuild
          </span>
        </Link>

        <h1 className="text-2xl font-bold text-center mb-1" data-testid="text-title">Opret bruger</h1>
        <p className="text-center text-muted-foreground mb-8" data-testid="text-subtitle">Start med 2 gratis AI-billeder</p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              placeholder="din@email.dk"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5"
              data-testid="input-email"
            />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              required
              placeholder="Min. 6 tegn"
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5"
              data-testid="input-password"
            />
          </div>
          <div>
            <Label htmlFor="confirmPassword">Gentag password</Label>
            <Input
              id="confirmPassword"
              type="password"
              required
              placeholder="Gentag password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mt-1.5"
              data-testid="input-confirm-password"
            />
          </div>

          <Button type="submit" className="w-full h-12 text-base" disabled={loading} data-testid="button-signup">
            <UserPlus className="w-4 h-4 mr-2" />
            {loading ? "Opretter..." : "Opret bruger"}
          </Button>

          {error && (
            <p className="text-destructive text-sm text-center" data-testid="text-error">{error}</p>
          )}
          {success && (
            <p className="text-green-600 text-sm text-center" data-testid="text-success">{success}</p>
          )}
        </form>

        <p className="text-center mt-6 text-sm text-muted-foreground">
          Har du allerede en konto?{" "}
          <Link href="/login">
            <span className="text-[#1a1a1a] underline cursor-pointer font-medium" data-testid="link-login">Log ind</span>
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
