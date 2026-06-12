import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { updateProfile } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { Building2, ArrowRight, CheckCircle2 } from "lucide-react";

export default function OpretTeamPage() {
  const { user, loading: authLoading, refreshCredits } = useAuth();
  const [, setLocation] = useLocation();

  const [username, setUsername] = useState(user?.displayName || "");
  const [teamName, setTeamName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (user?.displayName) setUsername(user.displayName);
  }, [user?.displayName]);

  useEffect(() => {
    if (!authLoading && !user) setLocation("/login?redirect=/opret-team");
  }, [authLoading, user, setLocation]);

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#E8DFD0" }}>
        <div className="relative w-10 h-10">
          <div className="absolute inset-0 rounded-full border-4 border-[#F0EDE7]" />
          <div className="absolute inset-0 rounded-full border-4 border-[#C8956C] border-t-transparent animate-spin" />
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!username.trim() || username.trim().length < 2) {
      setError("Brugernavn skal være mindst 2 tegn.");
      return;
    }
    if (!teamName.trim() || teamName.trim().length < 2) {
      setError("Teamnavn skal være mindst 2 tegn.");
      return;
    }

    setSaving(true);
    try {
      if (username.trim() !== user.displayName) {
        await updateProfile(user, { displayName: username.trim() });
      }

      const token = await user.getIdToken();
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: teamName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "Du er allerede i et team") {
          setLocation("/boligpotentiale/dashboard");
          return;
        }
        setError(data.error || "Noget gik galt. Prøv igen.");
        return;
      }

      await refreshCredits();
      setDone(true);
      setTimeout(() => setLocation("/boligpotentiale/dashboard"), 1200);
    } catch {
      setError("Netværksfejl. Prøv igen.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "#E8DFD0" }}>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="bg-white rounded-2xl border border-[#E8E4DE] shadow-lg p-8 w-full max-w-sm"
      >
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5"
          style={{ background: "#F0EDE7" }}
        >
          {done ? (
            <CheckCircle2 className="w-7 h-7" style={{ color: "#2D6A4F" }} />
          ) : (
            <Building2 className="w-7 h-7" style={{ color: "#C8956C" }} />
          )}
        </div>

        {done ? (
          <div className="text-center">
            <h1 className="text-xl font-bold mb-2" style={{ color: "#0F1D2F" }}>Alt er klar!</h1>
            <p className="text-sm" style={{ color: "#6B6B6B" }}>Sender dig til dashboardet…</p>
          </div>
        ) : (
          <>
            <div className="text-center mb-6">
              <div className="text-xs font-semibold tracking-[0.18em] uppercase mb-2" style={{ color: "#C8956C" }}>
                Forma Estates
              </div>
              <h1 className="text-2xl font-light mb-1" style={{ color: "#0F1D2F" }}>Opsæt dit team</h1>
              <p className="text-sm" style={{ color: "#6B6B6B" }}>
                Et hurtigt trin inden du kommer i gang.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: "#0F1D2F" }}>
                  Brugernavn
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Dit navn"
                  className="w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none transition-colors"
                  style={{ borderColor: "#D9D5CF", color: "#0F1D2F" }}
                  autoFocus
                  data-testid="input-username"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: "#0F1D2F" }}>
                  Teamnavn
                </label>
                <input
                  type="text"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="fx Firma A/S"
                  className="w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none transition-colors"
                  style={{ borderColor: "#D9D5CF", color: "#0F1D2F" }}
                  data-testid="input-team-name"
                />
              </div>

              {error && (
                <p className="text-xs text-center" style={{ color: "#C87070" }} data-testid="opret-team-error">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={saving}
                className="w-full py-3 rounded-xl font-semibold text-sm text-white flex items-center justify-center gap-2 transition-opacity hover:opacity-90 disabled:opacity-60 mt-1"
                style={{ background: "#C8956C" }}
                data-testid="button-opret-team"
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    Opretter team…
                  </>
                ) : (
                  <>
                    Opret team og gå videre <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </>
        )}
      </motion.div>
    </div>
  );
}
