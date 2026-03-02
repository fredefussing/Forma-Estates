import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Flame, LogOut, Palette, CreditCard } from "lucide-react";

export default function AccountPage() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!loading && !user) {
      setLocation("/login");
    }
  }, [user, loading, setLocation]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setLocation("/login");
    } catch (error) {
      console.error("Logout fejl:", error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f5f0] flex items-center justify-center">
        <div className="text-muted-foreground">Indlæser...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f0]">
      <header className="bg-white shadow-sm">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-6 h-16">
          <Link href="/">
            <span className="text-lg font-semibold tracking-tight cursor-pointer text-[#1a1a1a]" data-testid="link-logo">Nordic Homebuilding</span>
          </Link>
          <nav className="flex items-center gap-6">
            <Link href="/">
              <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer" data-testid="link-home">Forside</span>
            </Link>
            <Link href="/find-stil">
              <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer" data-testid="link-find-style">Find din stil</span>
            </Link>
            <Link href="/trending">
              <span className="text-sm text-orange-500 hover:text-orange-600 transition-colors cursor-pointer inline-flex items-center gap-1 font-medium" data-testid="link-trending">
                <Flame className="w-3.5 h-3.5" />
                Trending
              </span>
            </Link>
            <Link href="/pris">
              <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer" data-testid="link-pricing">Pris</span>
            </Link>
            <Link href="/min-konto">
              <span className="text-sm text-foreground font-medium cursor-pointer" data-testid="link-account">Min konto</span>
            </Link>
          </nav>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-12">
        {user ? (
          <div className="bg-white rounded-2xl p-8 shadow-lg">
            <h1 className="text-2xl font-bold mb-1" data-testid="text-title">Min konto</h1>
            <p className="text-muted-foreground mb-8" data-testid="text-email">{user.email}</p>

            <div className="bg-[#f0f0f0] rounded-xl p-6 mb-8 text-center">
              <div className="text-5xl font-bold text-[#1a1a1a] mb-1" data-testid="text-credits">2</div>
              <div className="text-muted-foreground" data-testid="text-credits-label">billeder tilbage</div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link href="/find-stil">
                <Button className="h-11 px-6" data-testid="button-new-design">
                  <Palette className="w-4 h-4 mr-2" />
                  Lav nyt design
                </Button>
              </Link>
              <Link href="/pris">
                <Button variant="outline" className="h-11 px-6" data-testid="button-buy-credits">
                  <CreditCard className="w-4 h-4 mr-2" />
                  Køb flere billeder
                </Button>
              </Link>
              <Button variant="outline" onClick={handleLogout} className="h-11 px-6" data-testid="button-logout">
                <LogOut className="w-4 h-4 mr-2" />
                Log ud
              </Button>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-8 shadow-lg text-center">
            <h1 className="text-2xl font-bold mb-2" data-testid="text-title">Du er ikke logget ind</h1>
            <p className="text-muted-foreground mb-6" data-testid="text-subtitle">Log ind for at se dine billeder og kreditter.</p>
            <div className="flex justify-center gap-3">
              <Link href="/login">
                <Button className="h-11 px-6" data-testid="button-login">Log ind</Button>
              </Link>
              <Link href="/opret">
                <Button variant="outline" className="h-11 px-6" data-testid="button-signup">Opret bruger</Button>
              </Link>
            </div>
          </div>
        )}

        <Link href="/">
          <span className="flex items-center justify-center gap-1.5 mt-6 text-sm text-muted-foreground hover:text-foreground cursor-pointer transition-colors" data-testid="link-back">
            <ArrowLeft className="w-3.5 h-3.5" />
            Tilbage til forsiden
          </span>
        </Link>
      </div>
    </div>
  );
}
