import { useEffect, useState } from "react";
import { Lock, ArrowRight } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useQuotaData } from "@/components/quota-widget";

const SUPER_ADMIN_EMAILS = ["fredefussing@gmail.com", "nikolajthomsen0102@gmail.com"];

export function useIsSubscribed() {
  const { isAdmin, subscriptionStatus, user } = useAuth();
  const isSuperAdmin = SUPER_ADMIN_EMAILS.includes((user?.email ?? "").toLowerCase());
  return isSuperAdmin || isAdmin || subscriptionStatus === "active";
}

// Free-trial users get a small AI allowance (see FREE_TRIAL_QUOTAS on the
// server). Returns true while they still have trial generations left,
// false when they don't, and null while quota data is still loading —
// callers render a neutral state instead of flashing a lock. The server
// enforces the real limit regardless.
export function useHasFreeTrialCredits(): boolean | null {
  const quotaData = useQuotaData();
  if (quotaData == null) return null;
  if (quotaData.isAdmin) return true;
  const ai = quotaData.quota.ai;
  if (ai.limit === null) return true;
  return ai.limit - ai.used > 0;
}

// Wraps useHasFreeTrialCredits with a deadline: if quota data still hasn't
// arrived after a few seconds (network error, etc.) we fail CLOSED (false)
// instead of leaving the UI in a blank/neutral state forever.
function useFreeTrialGateState(): boolean | null {
  const raw = useHasFreeTrialCredits();
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (raw !== null) { setTimedOut(false); return; }
    const t = setTimeout(() => setTimedOut(true), 4000);
    return () => clearTimeout(t);
  }, [raw]);
  if (raw !== null) return raw;
  return timedOut ? false : null;
}

const EXAMPLE_PAIRS = [
  { before: "/bolig-images/living-scandi-before.jpg", after: "/bolig-images/living-scandi-after.jpg", label: "Stue · Skandinavisk" },
  { before: "/bolig-images/kitchen-before.jpg", after: "/bolig-images/kitchen-after.jpg", label: "Køkken · Moderne" },
  { before: "/bolig-images/bathroom-before.jpg", after: "/bolig-images/bathroom-after.jpg", label: "Badeværelse · Moderne" },
];

export function PaywallPage({ children, allowFreeTrial = false }: { children: React.ReactNode; allowFreeTrial?: boolean }) {
  const isSubscribed = useIsSubscribed();
  const hasFreeTrialCredits = useFreeTrialGateState();
  const [, setLocation] = useLocation();

  if (isSubscribed || (allowFreeTrial && hasFreeTrialCredits === true)) return <>{children}</>;

  // Quota still loading → neutral blank state instead of flashing the paywall
  if (allowFreeTrial && hasFreeTrialCredits === null) {
    return <div className="min-h-[80vh]" style={{ background: "#FAF7F2" }} />;
  }

  return (
    <div className="min-h-[80vh] flex flex-col items-center px-4 pt-10 pb-16" style={{ background: "#FAF7F2" }}>
      {/* Lock + CTA */}
      <div className="max-w-md w-full text-center mb-10">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5"
          style={{ background: "#F0EDE7" }}
        >
          <Lock className="w-7 h-7" style={{ color: "#C8956C" }} />
        </div>
        <div className="text-[11px] font-bold tracking-[0.2em] uppercase mb-3" style={{ color: "#C8956C" }}>
          Abonnement påkrævet
        </div>
        <h1 className="text-2xl font-semibold mb-3" style={{ color: "#0F1D2F", letterSpacing: "-0.02em" }}>
          Lås op for alle AI-værktøjer
        </h1>
        <p className="text-sm mb-7 leading-relaxed" style={{ color: "#6B6B6B" }}>
          Få adgang til AI-staging, 3D plantegninger, transformeringsvideoer, showcase-videoer og meget mere — og sælg boliger hurtigere.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => setLocation("/boligpotentiale#pricing")}
            className="inline-flex items-center justify-center gap-2 px-8 py-3 rounded-xl text-sm font-semibold transition-opacity hover:opacity-85"
            style={{ background: "#C8956C", color: "white" }}
            data-testid="paywall-upgrade-btn"
          >
            Se abonnementer <ArrowRight className="w-4 h-4" />
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

      {/* Example images */}
      <div className="w-full max-w-2xl">
        <p className="text-[11px] font-bold tracking-[0.12em] uppercase text-center mb-4" style={{ color: "#9B9690" }}>
          Eksempler på hvad du får adgang til
        </p>
        <div className="grid grid-cols-3 gap-3 mb-4">
          {EXAMPLE_PAIRS.map((p) => (
            <div key={p.label} className="rounded-2xl overflow-hidden border border-[#E8E4DE] bg-white shadow-sm">
              <div className="grid grid-cols-2">
                <img src={p.before} alt="Før" className="w-full object-cover" style={{ aspectRatio: "1/1" }} />
                <img src={p.after} alt="Efter" className="w-full object-cover" style={{ aspectRatio: "1/1" }} />
              </div>
              <div className="px-3 py-2 text-center">
                <span className="text-[11px] font-medium" style={{ color: "#9B9690" }}>{p.label}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl overflow-hidden border border-[#E8E4DE] bg-white shadow-sm">
            <div className="grid grid-cols-2">
              <img src="/bolig-images/floorplan-2d.jpg" alt="2D" className="w-full object-cover" style={{ aspectRatio: "1/1" }} />
              <img src="/bolig-images/floorplan-3d.jpg" alt="3D" className="w-full object-cover" style={{ aspectRatio: "1/1" }} />
            </div>
            <div className="px-3 py-2 text-center">
              <span className="text-[11px] font-medium" style={{ color: "#9B9690" }}>3D plantegning · AI-genereret</span>
            </div>
          </div>
          <div className="rounded-2xl overflow-hidden border border-[#E8E4DE] bg-white shadow-sm">
            <div className="grid grid-cols-3 gap-0.5 bg-[#E8E4DE]">
              <img src="/bolig-images/facade-after.jpg" alt="Facade" className="w-full object-cover" style={{ aspectRatio: "9/16" }} />
              <img src="/bolig-images/living-modern-after.jpg" alt="Stue" className="w-full object-cover" style={{ aspectRatio: "9/16" }} />
              <img src="/bolig-images/dining-after.jpg" alt="Spisestue" className="w-full object-cover" style={{ aspectRatio: "9/16" }} />
            </div>
            <div className="px-3 py-2 text-center">
              <span className="text-[11px] font-medium" style={{ color: "#9B9690" }}>Bolig showcase · 9:16 video</span>
            </div>
          </div>
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
        onClick={() => setLocation("/boligpotentiale#pricing")}
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
  allowFreeTrial = false,
}: {
  children: React.ReactNode;
  className?: string;
  allowFreeTrial?: boolean;
}) {
  const isSubscribed = useIsSubscribed();
  const hasFreeTrialCredits = useFreeTrialGateState();
  const [, setLocation] = useLocation();

  if (isSubscribed || (allowFreeTrial && hasFreeTrialCredits === true)) return <div className={className}>{children}</div>;

  // Quota still loading → show the content dimmed, without the lock badge,
  // so free-trial users never see "Kræver abonnement" flash for a split second.
  if (allowFreeTrial && hasFreeTrialCredits === null) {
    return (
      <div className={className}>
        <div style={{ opacity: 0.4, pointerEvents: "none", userSelect: "none" }}>{children}</div>
      </div>
    );
  }

  return (
    <div
      className={`relative cursor-pointer ${className ?? ""}`}
      onClick={(e) => {
        e.stopPropagation();
        setLocation("/boligpotentiale#pricing");
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
