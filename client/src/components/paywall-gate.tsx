import { Lock } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";

export function useIsSubscribed() {
  const { isAdmin, subscriptionStatus } = useAuth();
  return isAdmin || subscriptionStatus === "active";
}

export function PaywallPage({ children }: { children: React.ReactNode }) {
  const isSubscribed = useIsSubscribed();
  const [, setLocation] = useLocation();

  if (isSubscribed) return <>{children}</>;

  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: "#FAF7F2" }}>
      <div className="max-w-md w-full text-center">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"
          style={{ background: "#F0EDE7" }}
        >
          <Lock className="w-8 h-8" style={{ color: "#C8956C" }} />
        </div>
        <div
          className="text-xs font-semibold tracking-[0.2em] uppercase mb-3"
          style={{ color: "#C8956C" }}
        >
          Abonnement påkrævet
        </div>
        <h1 className="text-3xl font-light mb-4" style={{ color: "#0F1D2F" }}>
          Denne funktion kræver et aktivt abonnement
        </h1>
        <p className="text-sm mb-8" style={{ color: "#0F1D2F", opacity: 0.65 }}>
          Opgrader din konto for at få adgang til alle Forma Estates' værktøjer — AI-staging,
          3D plantegninger, branchevideoer og meget mere.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => setLocation("/pris")}
            className="px-8 py-3 rounded-xl text-sm font-semibold transition-opacity hover:opacity-85"
            style={{ background: "#C8956C", color: "white" }}
            data-testid="paywall-upgrade-btn"
          >
            Se abonnementer
          </button>
          <button
            onClick={() => setLocation("/boligpotentiale/dashboard")}
            className="px-8 py-3 rounded-xl text-sm font-semibold border transition-colors hover:bg-[#F0EDE7]"
            style={{ background: "white", color: "#0F1D2F", borderColor: "#E8E4DE" }}
            data-testid="paywall-back-btn"
          >
            Tilbage til dashboard
          </button>
        </div>
      </div>
    </div>
  );
}

export function PaywallBanner() {
  const isSubscribed = useIsSubscribed();
  const [, setLocation] = useLocation();

  if (isSubscribed) return null;

  return (
    <div
      className="w-full flex items-center justify-between gap-4 px-5 py-2.5 text-sm"
      style={{ background: "#0F1D2F", borderBottom: "1px solid rgba(200,149,108,0.25)" }}
      data-testid="paywall-banner"
    >
      <div className="flex items-center gap-2.5">
        <Lock className="w-3.5 h-3.5 shrink-0" style={{ color: "#C8956C" }} />
        <span style={{ color: "rgba(245,243,239,0.78)", fontSize: "0.8rem" }}>
          Du er på en gratis konto — alle funktioner kræver et aktivt abonnement
        </span>
      </div>
      <button
        onClick={() => setLocation("/pris")}
        className="shrink-0 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-85"
        style={{ background: "#C8956C", color: "white" }}
        data-testid="button-upgrade"
      >
        Opgrader
      </button>
    </div>
  );
}

export function PaywallAction({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const isSubscribed = useIsSubscribed();
  const [, setLocation] = useLocation();

  if (isSubscribed) return <div className={className}>{children}</div>;

  return (
    <div
      className={`relative cursor-pointer ${className ?? ""}`}
      onClick={(e) => {
        e.stopPropagation();
        setLocation("/pris");
      }}
      data-testid="paywall-action"
    >
      <div style={{ opacity: 0.4, pointerEvents: "none", userSelect: "none" }}>{children}</div>
      <div
        className="absolute inset-0 flex items-center justify-center rounded-xl"
        style={{ background: "rgba(15,29,47,0.04)" }}
      >
        <span
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm"
          style={{ background: "#0F1D2F", color: "white" }}
        >
          <Lock className="w-3.5 h-3.5" />
          Kræver abonnement
        </span>
      </div>
    </div>
  );
}
