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
  refreshCredits: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({ user: null, loading: true, creditsRemaining: null, isAdmin: false, subscriptionStatus: "none", subscriptionTier: null, refreshCredits: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [creditsRemaining, setCreditsRemaining] = useState<number | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState("none");
  const [subscriptionTier, setSubscriptionTier] = useState<string | null>(null);

  const verifyWithBackend = useCallback(async (firebaseUser: User) => {
    try {
      const token = await firebaseUser.getIdToken(true);
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setCreditsRemaining(data.user.creditsRemaining);
        setIsAdmin(data.user.isAdmin || false);
        setSubscriptionStatus(data.user.subscriptionStatus || "none");
        setSubscriptionTier(data.user.subscriptionTier || null);
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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        verifyWithBackend(firebaseUser);
      } else {
        setCreditsRemaining(null);
        setIsAdmin(false);
        setSubscriptionStatus("none");
        setSubscriptionTier(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, [verifyWithBackend]);

  return (
    <AuthContext.Provider value={{ user, loading, creditsRemaining, isAdmin, subscriptionStatus, subscriptionTier, refreshCredits }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
