import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  creditsRemaining: number | null;
  isAdmin: boolean;
  subscriptionStatus: string;
  subscriptionTier: string | null;
  emailVerified: boolean | null;
  refreshCredits: () => Promise<void>;
  refreshVerification: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({ user: null, loading: true, creditsRemaining: null, isAdmin: false, subscriptionStatus: "none", subscriptionTier: null, emailVerified: null, refreshCredits: async () => {}, refreshVerification: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [creditsRemaining, setCreditsRemaining] = useState<number | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState("none");
  const [subscriptionTier, setSubscriptionTier] = useState<string | null>(null);
  const [emailVerified, setEmailVerified] = useState<boolean | null>(null);

  const verifyWithBackend = useCallback(async (firebaseUser: User) => {
    try {
      // Use cached token first (getIdToken without true) — force-refresh can fail silently
      const token = await firebaseUser.getIdToken();
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "x-lang": localStorage.getItem("forma-lang") || "da",
        },
      });
      if (res.ok) {
        const data = await res.json();
        setCreditsRemaining(data.user.creditsRemaining);
        setIsAdmin(data.user.isAdmin || false);
        setSubscriptionStatus(data.user.subscriptionStatus || "none");
        setSubscriptionTier(data.user.subscriptionTier || null);
        setEmailVerified(data.user.emailVerified === true);
      } else {
        // If verify fails, retry once with a fresh token
        const freshToken = await firebaseUser.getIdToken(true);
        const retry = await fetch("/api/auth/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${freshToken}`, "x-lang": localStorage.getItem("forma-lang") || "da" },
        });
        if (retry.ok) {
          const data = await retry.json();
          setCreditsRemaining(data.user.creditsRemaining);
          setIsAdmin(data.user.isAdmin || false);
          setSubscriptionStatus(data.user.subscriptionStatus || "none");
          setSubscriptionTier(data.user.subscriptionTier || null);
          setEmailVerified(data.user.emailVerified === true);
        }
      }
    } catch {}
  }, []);

  const refreshCredits = useCallback(async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/credits", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCreditsRemaining(data.creditsRemaining);
        if (data.isAdmin !== undefined) setIsAdmin(data.isAdmin);
        setSubscriptionStatus(data.subscriptionStatus || "none");
        setSubscriptionTier(data.subscriptionTier || null);
      }
    } catch {}
  }, [user]);

  const refreshVerification = useCallback(async () => {
    if (auth.currentUser) await verifyWithBackend(auth.currentUser);
  }, [verifyWithBackend]);

  useEffect(() => {
    let pollInterval: ReturnType<typeof setInterval> | null = null;

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        verifyWithBackend(firebaseUser);
        // Poll credits every 60s so live CRM credit grants appear on dashboard
        if (pollInterval) clearInterval(pollInterval);
        pollInterval = setInterval(async () => {
          try {
            const token = await firebaseUser.getIdToken();
            const res = await fetch("/api/credits", { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) {
              const data = await res.json();
              setCreditsRemaining(data.creditsRemaining);
              if (data.isAdmin !== undefined) setIsAdmin(data.isAdmin);
              setSubscriptionStatus(data.subscriptionStatus || "none");
              setSubscriptionTier(data.subscriptionTier || null);
            }
          } catch {}
        }, 60000);
      } else {
        setCreditsRemaining(null);
        setIsAdmin(false);
        setSubscriptionStatus("none");
        setSubscriptionTier(null);
        setEmailVerified(null);
        if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
      }
      setLoading(false);
    });

    return () => {
      unsubscribe();
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [verifyWithBackend]);

  return (
    <AuthContext.Provider value={{ user, loading, creditsRemaining, isAdmin, subscriptionStatus, subscriptionTier, emailVerified, refreshCredits, refreshVerification }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
