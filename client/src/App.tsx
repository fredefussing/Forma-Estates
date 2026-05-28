import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
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
import DesignDetailPage from "@/pages/design-detail";
import PaymentSuccessPage from "@/pages/payment-success";
import BoligpotentialeLanding from "@/pages/boligpotentiale-landing";
import BoligpotentialeDashboard from "@/pages/boligpotentiale-dashboard";
import BoligpotentialeJoinTeam from "@/pages/boligpotentiale-join-team";

// ─────────────────────────────────────────────────────────────────────
// AI Boligfremvisning er midlertidigt sat på pause. Sektionen er kun
// tilgængelig for admin-profilen; alle andre brugere ser et
// "Kommer snart"-skærmbillede. For at slå funktionen til igen for alle:
// fjern <BoligGate>-wrappers nedenfor og brug komponenterne direkte
// som før. Intet andet er rørt — 3D plantegning og øvrige features
// kører videre uafhængigt.
// ─────────────────────────────────────────────────────────────────────
function BoligComingSoon() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: "#FAF7F2" }}>
      <div className="max-w-lg w-full text-center" data-testid="bolig-coming-soon">
        <div className="text-xs font-semibold tracking-[0.2em] uppercase mb-4" style={{ color: "#C8956C" }}>
          Nordic Homebuild
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
        <a
          href="/"
          className="inline-block mt-8 px-6 py-3 rounded-lg text-sm font-semibold border transition-colors"
          style={{ background: "white", color: "#0F1D2F", borderColor: "#E8E4DE" }}
          data-testid="link-back-home"
        >
          Tilbage til forsiden
        </a>
      </div>
    </div>
  );
}

function BoligGate({ children }: { children: React.ReactNode }) {
  const { isAdmin, loading } = useAuth();
  if (loading) {
    return <div className="min-h-screen" style={{ background: "#FAF7F2" }} />;
  }
  if (!isAdmin) return <BoligComingSoon />;
  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/join/:code">
        <BoligGate><BoligpotentialeJoinTeam /></BoligGate>
      </Route>
      <Route path="/boligpotentiale/join-team">
        <BoligGate><BoligpotentialeJoinTeam /></BoligGate>
      </Route>
      <Route path="/boligpotentiale/dashboard">
        <BoligGate><BoligpotentialeDashboard /></BoligGate>
      </Route>
      <Route path="/boligpotentiale">
        <BoligGate><BoligpotentialeLanding /></BoligGate>
      </Route>
      <Route path="/" component={LandingPage} />
      <Route path="/find-stil" component={FindStylePage} />
      <Route path="/trending" component={TrendingPage} />
      <Route path="/pris" component={PricingPage} />
      <Route path="/design/:id" component={DesignDetailPage} />
      <Route path="/design" component={DesignPage} />
      <Route path="/login" component={LoginPage} />
      <Route path="/opret" component={SignupPage} />
      <Route path="/min-konto" component={AccountPage} />
      <Route path="/mine-designs" component={MyDesignsPage} />
      <Route path="/betalt" component={PaymentSuccessPage} />
      <Route path="/admin" component={AdminDashboardPage} />
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
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
