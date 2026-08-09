import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, X } from "lucide-react";

// Compact floating corner banner — mounted globally in App.tsx.
// Consent stored in localStorage under "forma-cookie-consent".
export function CookieBanner() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [stats, setStats] = useState(false);
  const [prefs, setPrefs] = useState(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem("forma-cookie-consent");
      if (!v) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  const applyGaConsent = (statistics: boolean) => {
    try {
      (window as any)["ga-disable-G-5BRC2FMPNT"] = !statistics;
      if (statistics && typeof (window as any).gtag === "function") {
        (window as any).gtag("event", "page_view");
      }
    } catch {}
  };

  const persist = (consent: { necessary: true; statistics: boolean; preferences: boolean }) => {
    try {
      localStorage.setItem("forma-cookie-consent", JSON.stringify({ ...consent, ts: Date.now() }));
    } catch {}
    applyGaConsent(consent.statistics);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.97 }}
        transition={{ duration: 0.28, ease: "easeOut" }}
        className="fixed z-[9999] bottom-5 right-5 left-5 sm:left-auto"
        style={{ maxWidth: 380, fontFamily: "'Inter', system-ui, sans-serif" }}
        data-testid="cookie-banner"
      >
        <div
          style={{
            background: "#0F1923",
            border: "1px solid rgba(201,169,110,0.28)",
            borderRadius: 14,
            boxShadow: "0 8px 40px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.25)",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div className="flex items-start justify-between" style={{ padding: "18px 18px 12px" }}>
            <div className="flex items-center gap-2.5">
              <span style={{ fontSize: 18 }}>🍪</span>
              <span style={{ color: "#fff", fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em" }}>
                {t("cookie.title")}
              </span>
            </div>
            <button
              onClick={() => persist({ necessary: true, statistics: false, preferences: false })}
              aria-label="Afvis og luk"
              style={{ color: "rgba(255,255,255,0.4)", background: "none", border: "none", cursor: "pointer", padding: 2, lineHeight: 1 }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.8)")}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.4)")}
              data-testid="cookie-close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body text */}
          <p style={{ color: "rgba(255,255,255,0.58)", fontSize: 12.5, lineHeight: 1.65, padding: "0 18px 14px", margin: 0 }}>
            {t("cookie.text")}
          </p>

          {/* Expandable settings */}
          <AnimatePresence initial={false}>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22 }}
                style={{ overflow: "hidden" }}
              >
                <div className="flex flex-col gap-2.5" style={{ padding: "0 18px 14px" }}>
                  <label className="inline-flex items-center gap-2.5" style={{ color: "rgba(255,255,255,0.38)", fontSize: 13, cursor: "not-allowed" }}>
                    <input type="checkbox" checked disabled style={{ width: 14, height: 14, accentColor: "#C1A571" }} data-testid="cookie-necessary" />
                    {t("cookie.necessary")}
                  </label>
                  <label className="inline-flex items-center gap-2.5" style={{ color: "rgba(255,255,255,0.82)", fontSize: 13, cursor: "pointer" }}>
                    <input type="checkbox" checked={stats} onChange={e => setStats(e.target.checked)} style={{ width: 14, height: 14, accentColor: "#C1A571" }} data-testid="cookie-statistics" />
                    {t("cookie.statistics")}
                  </label>
                  <label className="inline-flex items-center gap-2.5" style={{ color: "rgba(255,255,255,0.82)", fontSize: 13, cursor: "pointer" }}>
                    <input type="checkbox" checked={prefs} onChange={e => setPrefs(e.target.checked)} style={{ width: 14, height: 14, accentColor: "#C1A571" }} data-testid="cookie-preferences" />
                    {t("cookie.preferences")}
                  </label>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Action buttons */}
          <div style={{ padding: "0 14px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
            {/* Primary: Accept all */}
            <button
              onClick={() => persist({ necessary: true, statistics: true, preferences: true })}
              style={{
                background: "#C1A571", color: "#0F1923",
                padding: "10px 16px", borderRadius: 8,
                fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", width: "100%",
                transition: "opacity 0.15s",
              }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.opacity = "0.88")}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.opacity = "1")}
              data-testid="cookie-accept-all"
            >
              {t("cookie.acceptAll")}
            </button>

            <div className="flex gap-2">
              {/* Customize */}
              <button
                onClick={() => setExpanded(o => !o)}
                style={{
                  flex: 1, background: "transparent", color: "rgba(255,255,255,0.65)",
                  border: "1px solid rgba(255,255,255,0.18)", padding: "9px 10px",
                  borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                  transition: "border-color 0.15s, color 0.15s",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.38)"; (e.currentTarget as HTMLElement).style.color = "#fff"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.18)"; (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.65)"; }}
                data-testid="cookie-customize"
              >
                {expanded ? t("cookie.save") : "Tilpas"}
                <ChevronDown className="w-3.5 h-3.5" style={{ transform: expanded ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }} />
              </button>

              {/* Save selection (only visible when expanded) / Reject otherwise */}
              {expanded ? (
                <button
                  onClick={() => persist({ necessary: true, statistics: stats, preferences: prefs })}
                  style={{
                    flex: 1, background: "transparent", color: "#C1A571",
                    border: "1px solid rgba(201,169,110,0.45)", padding: "9px 10px",
                    borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = "rgba(201,169,110,0.1)")}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "transparent")}
                  data-testid="cookie-save"
                >
                  Gem valg
                </button>
              ) : (
                <button
                  onClick={() => persist({ necessary: true, statistics: false, preferences: false })}
                  style={{
                    flex: 1, background: "transparent", color: "rgba(255,255,255,0.45)",
                    border: "1px solid rgba(255,255,255,0.12)", padding: "9px 10px",
                    borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: "pointer",
                    transition: "color 0.15s",
                  }}
                  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.75)")}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.45)")}
                  data-testid="cookie-reject"
                >
                  {t("cookie.reject")}
                </button>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
