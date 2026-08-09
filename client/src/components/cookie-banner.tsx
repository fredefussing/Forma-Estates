import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";

// Full-width bottom bar — mounted globally in App.tsx.
// Consent stored in localStorage under "forma-cookie-consent".
export function CookieBanner() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

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

  const persist = (statistics: boolean) => {
    try {
      localStorage.setItem(
        "forma-cookie-consent",
        JSON.stringify({ necessary: true, statistics, preferences: statistics, ts: Date.now() })
      );
    } catch {}
    applyGaConsent(statistics);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 9999,
          background: "#0F1923",
          borderTop: "1px solid rgba(201,169,110,0.22)",
          boxShadow: "0 -4px 24px rgba(0,0,0,0.35)",
          fontFamily: "'Inter', system-ui, sans-serif",
        }}
        data-testid="cookie-banner"
      >
        <div
          style={{
            maxWidth: 1280,
            margin: "0 auto",
            padding: "16px 24px",
            display: "flex",
            alignItems: "center",
            gap: 20,
            flexWrap: "wrap",
          }}
        >
          {/* Text */}
          <p
            style={{
              flex: 1,
              minWidth: 220,
              color: "rgba(255,255,255,0.65)",
              fontSize: 13,
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            {t("cookie.text")}
          </p>

          {/* Buttons */}
          <div style={{ display: "flex", gap: 10, flexShrink: 0, flexWrap: "wrap" }}>
            <button
              onClick={() => persist(false)}
              style={{
                background: "transparent",
                color: "rgba(255,255,255,0.45)",
                border: "1px solid rgba(255,255,255,0.15)",
                padding: "9px 18px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.75)")}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.45)")}
              data-testid="cookie-reject"
            >
              {t("cookie.reject")}
            </button>
            <button
              onClick={() => persist(true)}
              style={{
                background: "#C1A571",
                color: "#0F1923",
                border: "none",
                padding: "9px 22px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.opacity = "0.88")}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.opacity = "1")}
              data-testid="cookie-accept-all"
            >
              {t("cookie.acceptAll")}
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
