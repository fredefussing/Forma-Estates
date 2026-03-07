import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/use-auth";
import NotFound from "@/pages/not-found";
import LandingPage from "@/pages/landing";
import DesignPage from "@/pages/home";
import AdminQuotesPage from "@/pages/admin-quotes";
import AdminDashboardPage from "@/pages/admin-dashboard";
import FindStylePage from "@/pages/find-style";
import TrendingPage from "@/pages/trending";
import PricingPage from "@/pages/pricing";
import LoginPage from "@/pages/login";
import SignupPage from "@/pages/signup";
import AccountPage from "@/pages/account";
import MyDesignsPage from "@/pages/my-designs";
import DesignDetailPage from "@/pages/design-detail";

function Router() {
  return (
    <Switch>
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
      <Route path="/admin" component={AdminDashboardPage} />
      <Route path="/admin/quotes" component={AdminQuotesPage} />
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
