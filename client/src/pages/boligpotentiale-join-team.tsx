import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { Users, CheckCircle2, AlertCircle, ArrowRight } from "lucide-react";

export default function BoligpotentialeJoinTeam() {
  const [, setLocation] = useLocation();
  const params = useParams<{ code: string }>();
  const queryCode = new URLSearchParams(window.location.search).get("code") ?? "";
  const code = (params.code ?? queryCode ?? "").toUpperCase();
  const { user, loading: authLoading } = useAuth();
  const [status, setStatus] = useState<"loading" | "valid" | "joining" | "done" | "error">("loading");
  const [teamName, setTeamName] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!code) { setStatus("error"); setErrorMsg("Invite-kode mangler i linket."); return; }
    fetch(`/api/teams/code/${encodeURIComponent(code)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.valid) { setTeamName(d.teamName); setStatus("valid"); }
        else { setStatus("error"); setErrorMsg(d.error ?? "Ugyldig invite-kode."); }
      })
      .catch(() => { setStatus("error"); setErrorMsg("Netværksfejl. Prøv igen."); });
  }, [code]);

  const handleJoin = async () => {
    if (!user) {
      localStorage.setItem("pendingTeamCode", code);
      setLocation(`/opret?redirect=${encodeURIComponent(`/join/${code}`)}`);
      return;
    }
    setStatus("joining");
    try {
      const t = await user.getIdToken();
      const r = await fetch("/api/teams/join", {
        method: "POST",
        headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const d = await r.json();
      if (d.success) { setStatus("done"); }
      else { setStatus("error"); setErrorMsg(d.error ?? "Noget gik galt."); }
    } catch {
      setStatus("error"); setErrorMsg("Netværksfejl. Prøv igen.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "#E8DFD0" }}>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        className="bg-white rounded-2xl border border-[#E8E4DE] shadow-lg p-8 w-full max-w-sm text-center">

        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5" style={{ background: "#F0EDE7" }}>
          {status === "done" ? (
            <CheckCircle2 className="w-7 h-7" style={{ color: "#2D6A4F" }} />
          ) : status === "error" ? (
            <AlertCircle className="w-7 h-7" style={{ color: "#C87070" }} />
          ) : (
            <Users className="w-7 h-7" style={{ color: "#C8956C" }} />
          )}
        </div>

        {status === "loading" && (
          <>
            <div className="relative w-8 h-8 mx-auto mb-4">
              <div className="absolute inset-0 rounded-full border-4 border-[#F0EDE7]" />
              <div className="absolute inset-0 rounded-full border-4 border-[#C8956C] border-t-transparent animate-spin" />
            </div>
            <p className="text-sm" style={{ color: "#6B6B6B" }}>Tjekker invite-kode…</p>
          </>
        )}

        {status === "valid" && (
          <>
            <div className="mb-1 text-xs font-mono font-semibold tracking-widest px-3 py-1 rounded-lg inline-block" style={{ background: "#F0EDE7", color: "#C8956C" }}>{code}</div>
            <h1 className="text-xl font-bold mt-3 mb-2" style={{ color: "#0F1D2F" }}>Du er inviteret!</h1>
            <p className="text-sm mb-6" style={{ color: "#6B6B6B" }}>
              Tilslut dig teamet <strong style={{ color: "#1A1A1A" }}>"{teamName}"</strong> på Forma Estates.
            </p>
            {authLoading ? (
              <div className="relative w-8 h-8 mx-auto">
                <div className="absolute inset-0 rounded-full border-4 border-[#F0EDE7]" />
                <div className="absolute inset-0 rounded-full border-4 border-[#C8956C] border-t-transparent animate-spin" />
              </div>
            ) : !user ? (
              <>
                <p className="text-xs mb-4" style={{ color: "#9B9690" }}>Du skal logge ind eller oprette en konto for at tilslutte dig.</p>
                <button
                  onClick={handleJoin}
                  className="w-full py-3 rounded-xl font-semibold text-sm text-white transition-all hover:opacity-90 mb-2"
                  style={{ background: "#C8956C" }}
                  data-testid="join-team-signup-btn">
                  Opret konto & tilslut
                </button>
                <button
                  onClick={() => { localStorage.setItem("pendingTeamCode", code); setLocation(`/login?redirect=${encodeURIComponent(`/join/${code}`)}`); }}
                  className="w-full py-3 rounded-xl font-semibold text-sm border transition-all hover:bg-[#F5F3EF]"
                  style={{ borderColor: "#D9D5CF", color: "#1A1A1A" }}>
                  Log ind
                </button>
              </>
            ) : (
              <button
                onClick={handleJoin}
                className="w-full py-3 rounded-xl font-semibold text-sm text-white transition-all hover:opacity-90 flex items-center justify-center gap-2"
                style={{ background: "#C8956C" }}
                data-testid="join-team-accept-btn">
                Tilslut team <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </>
        )}

        {status === "joining" && (
          <>
            <h1 className="text-xl font-bold mb-4" style={{ color: "#0F1D2F" }}>Tilslutter dig…</h1>
            <div className="relative w-8 h-8 mx-auto">
              <div className="absolute inset-0 rounded-full border-4 border-[#F0EDE7]" />
              <div className="absolute inset-0 rounded-full border-4 border-[#C8956C] border-t-transparent animate-spin" />
            </div>
          </>
        )}

        {status === "done" && (
          <>
            <h1 className="text-xl font-bold mb-2" style={{ color: "#0F1D2F" }}>Velkommen til teamet!</h1>
            <p className="text-sm mb-6" style={{ color: "#6B6B6B" }}>Du er nu en del af <strong style={{ color: "#1A1A1A" }}>"{teamName}"</strong>.</p>
            <button
              onClick={() => setLocation("/boligpotentiale/dashboard")}
              className="w-full py-3 rounded-xl font-semibold text-sm text-white transition-all hover:opacity-90 flex items-center justify-center gap-2"
              style={{ background: "#C8956C" }}
              data-testid="join-team-go-dashboard">
              Gå til dashboard <ArrowRight className="w-4 h-4" />
            </button>
          </>
        )}

        {status === "error" && (
          <>
            <h1 className="text-xl font-bold mb-2" style={{ color: "#0F1D2F" }}>Ugyldig kode</h1>
            <p className="text-sm mb-6" style={{ color: "#6B6B6B" }}>{errorMsg}</p>
            <button
              onClick={() => setLocation("/boligpotentiale/dashboard")}
              className="w-full py-3 rounded-xl font-semibold text-sm border transition-all hover:bg-[#F5F3EF]"
              style={{ borderColor: "#D9D5CF", color: "#1A1A1A" }}
              data-testid="join-team-back-btn">
              Gå til dashboard
            </button>
          </>
        )}
      </motion.div>
    </div>
  );
}
