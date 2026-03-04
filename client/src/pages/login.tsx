import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, LogIn } from "lucide-react";

export default function LoginPage() {
  const { user, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
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

  return (
    <div className="min-h-screen bg-[#f5f5f0] flex items-center justify-center px-4">
      <div className="bg-white p-8 sm:p-10 rounded-2xl shadow-lg w-full max-w-[420px]">
        <Link href="/">
          <span className="text-xl font-bold text-center block mb-6 cursor-pointer text-[#1a1a1a]" data-testid="link-logo">
            Nordic Homebuild
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
              placeholder="Dit password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5"
              data-testid="input-password"
            />
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
