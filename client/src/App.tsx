import { Switch, Route, useLocation } from "wouter";
import { useState, useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { SupportChat } from "@/components/support-chat";
import { PaywallPage } from "@/components/paywall-gate";
import NotFound from "@/pages/not-found";
import LandingPage from "@/pages/landing";
import DesignPage from "@/pages/home";
import AdminQuotesPage from "@/pages/admin-quotes";
import AdminDashboardPage from "@/pages/admin-dashboard";
import AIDesignAgentPage from "@/pages/ai-design-agent";
import FindStylePage from "@/pages/find-style";
import TrendingPage from "@/pages/trending";
import PricingPage from "@/pages/pricing";
import LoginPage from "@/pages/login";
import SignupPage from "@/pages/signup";
import AccountPage from "@/pages/account";
import MyDesignsPage from "@/pages/my-designs";
import AgentDesignDetailPage from "@/pages/agent-design-detail";
import KontaktPage from "@/pages/kontakt";
import PrivatlivspolitikPage from "@/pages/privatlivspolitik";
import HandelsbetingelserPage from "@/pages/handelsbetingelser";
import DesignDetailPage from "@/pages/design-detail";
import PaymentSuccessPage from "@/pages/payment-success";
import BoligpotentialeLanding from "@/pages/boligpotentiale-landing";
import BoligpotentialeDashboard from "@/pages/boligpotentiale-dashboard";
import BoligpotentialeJoinTeam from "@/pages/boligpotentiale-join-team";
import OpretTeamPage from "@/pages/opret-team";
import TrackerDashboard from "@/pages/tracker-dashboard";
import {
  EksemplerPage,
  ForEfterPage,
  PlantegningPage,
  BranchevideoPage,
  AIDesignAgentPage as AIDesignAgentSubpage,
  BoligShowcasePage,
  OmOsPage,
} from "@/pages/boligpotentiale-subpages";

// ─────────────────────────────────────────────────────────────────────
// AI Boligfremvisning er midlertidigt sat på pause. Sektionen er kun
// tilgængelig for admin-profilen; alle andre brugere ser et
// "Kommer snart"-skærmbillede. For at slå funktionen til igen for alle:
// fjern <BoligGate>-wrappers nedenfor og brug komponenterne direkte
// som før. Intet andet er rørt — 3D plantegning og øvrige features
// kører videre uafhængigt.
// ─────────────────────────────────────────────────────────────────────
function BoligComingSoon() {
  const { user } = useAuth();

  const handleLogout = async () => {
    await signOut(auth);
    window.location.href = "/login";
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: "#FAF7F2" }}>
      <div className="max-w-lg w-full text-center" data-testid="bolig-coming-soon">
        <div className="text-xs font-semibold tracking-[0.2em] uppercase mb-4" style={{ color: "#C8956C" }}>
          Forma Estates
        </div>
        <h1 className="text-4xl md:text-5xl font-light mb-6" style={{ color: "#0F1D2F" }}>
          AI Boligfremvisning
        </h1>
        <p className="text-lg mb-2" style={{ color: "#0F1D2F" }}>
          Kommer snart.
        </p>
        <p className="text-sm" style={{ color: "#0F1D2F", opacity: 0.7 }}>
          Vi finpudser de sidste detaljer. Funktionen lanceres meget snart — tak for tålmodigheden.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center mt-8">
          <a
            href="/"
            className="inline-block px-6 py-3 rounded-lg text-sm font-semibold border transition-colors"
            style={{ background: "white", color: "#0F1D2F", borderColor: "#E8E4DE" }}
            data-testid="link-back-home"
          >
            Tilbage til forsiden
          </a>
          {user && (
            <button
              onClick={handleLogout}
              className="inline-block px-6 py-3 rounded-lg text-sm font-semibold border transition-colors"
              style={{ background: "#0F1D2F", color: "white", borderColor: "#0F1D2F" }}
              data-testid="button-logout"
            >
              Log ud
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function BoligGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();
  useEffect(() => {
    if (!loading && !user) {
      setLocation("/login?redirect=/boligpotentiale/dashboard");
    }
  }, [user, loading, setLocation]);
  if (loading) {
    return <div className="min-h-screen" style={{ background: "#FAF7F2" }} />;
  }
  if (!user) {
    return null;
  }
  return <>{children}</>;
}

function TeamSetupGate({ children }: { children: React.ReactNode }) {
  const { user, loading, subscriptionStatus, isAdmin } = useAuth();
  const [checked, setChecked] = useState(false);
  const [hasTeam, setHasTeam] = useState(true);
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (loading || !user) return;
    if (isAdmin || subscriptionStatus !== "active") {
      setChecked(true);
      return;
    }
    user.getIdToken().then((token) =>
      fetch("/api/teams/mine", { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((d) => {
          setHasTeam(!!d.hasTeam);
          setChecked(true);
        })
        .catch(() => setChecked(true))
    );
  }, [user, loading, subscriptionStatus, isAdmin]);

  useEffect(() => {
    if (checked && !hasTeam) setLocation("/opret-team");
  }, [checked, hasTeam, setLocation]);

  if (!checked) return <div className="min-h-screen" style={{ background: "#FAF7F2" }} />;
  if (!hasTeam) return null;
  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/join/:code" component={BoligpotentialeJoinTeam} />
      <Route path="/boligpotentiale/join-team" component={BoligpotentialeJoinTeam} />
      <Route path="/opret-team" component={OpretTeamPage} />
      <Route path="/boligpotentiale/dashboard" component={() => <BoligGate><TeamSetupGate><BoligpotentialeDashboard /></TeamSetupGate></BoligGate>} />
      <Route path="/boligpotentiale/eksempler" component={EksemplerPage} />
      <Route path="/boligpotentiale/foer-efter" component={ForEfterPage} />
      <Route path="/boligpotentiale/3d-plantegning" component={PlantegningPage} />
      <Route path="/boligpotentiale/branchevideo" component={BranchevideoPage} />
      <Route path="/boligpotentiale/ai-design-agent" component={AIDesignAgentSubpage} />
      <Route path="/boligpotentiale/bolig-showcase" component={BoligShowcasePage} />
      <Route path="/boligpotentiale/om-os" component={OmOsPage} />
      <Route path="/kontakt" component={KontaktPage} />
      <Route path="/privatlivspolitik" component={PrivatlivspolitikPage} />
      <Route path="/handelsbetingelser" component={HandelsbetingelserPage} />
      <Route path="/boligpotentiale" component={BoligpotentialeLanding} />
      <Route path="/" component={BoligpotentialeLanding} />
      <Route path="/nordic-homebuild" component={LandingPage} />
      <Route path="/find-stil" component={FindStylePage} />
      <Route path="/trending" component={TrendingPage} />
      <Route path="/pris" component={() => { useEffect(() => { window.location.replace("/boligpotentiale#pricing"); }, []); return null; }} />
      <Route path="/log-ind" component={() => { useEffect(() => { window.location.replace("/login"); }, []); return null; }} />
      <Route path="/design/:id" component={DesignDetailPage} />
      <Route path="/design" component={DesignPage} />
      <Route path="/login" component={LoginPage} />
      <Route path="/opret" component={SignupPage} />
      <Route path="/min-konto" component={AccountPage} />
      <Route path="/mine-designs" component={MyDesignsPage} />
      <Route path="/betalt" component={PaymentSuccessPage} />
      <Route path="/admin" component={AdminDashboardPage} />
      <Route path="/admin/tracker" component={TrackerDashboard} />
      <Route path="/admin/quotes" component={AdminQuotesPage} />
      <Route path="/agent-design/:id" component={AgentDesignDetailPage} />
      <Route path="/ai-design-agent" component={AIDesignAgentPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
          <SupportChat />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
