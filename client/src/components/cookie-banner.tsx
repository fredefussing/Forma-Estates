import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";

// Standalone cookie consent banner — mounted globally in App.tsx so it
// appears on every page (landing, dashboard, legal pages, etc.).
// Consent is stored in localStorage under "forma-cookie-consent".
export function CookieBanner() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
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

  const persist = (consent: {
    necessary: true;
    statistics: boolean;
    preferences: boolean;
  }) => {
    try {
      localStorage.setItem(
        "forma-cookie-consent",
        JSON.stringify({ ...consent, ts: Date.now() })
      );
    } catch {}
    applyGaConsent(consent.statistics);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[9999] px-6 py-7"
      style={{
        background: "#0F1923",
        borderTop: "1px solid rgba(193,165,113,0.25)",
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
      data-testid="cookie-banner"
    >
      <div className="mx-auto max-w-6xl grid lg:grid-cols-[1.4fr_1fr] gap-6 lg:gap-10 items-start">
        {/* Text + checkboxes */}
        <div>
          <h3
            style={{
              color: "#fff",
              fontSize: 18,
              fontWeight: 600,
              marginBottom: 8,
              letterSpacing: "-0.01em",
            }}
          >
            {t("cookie.title")}
          </h3>
          <p
            style={{
              color: "rgba(255,255,255,0.65)",
              fontSize: 13,
              lineHeight: 1.65,
              marginBottom: 16,
              maxWidth: 560,
            }}
          >
            {t("cookie.text")}
          </p>
          <div className="flex flex-wrap gap-x-7 gap-y-3">
            {/* Necessary — always on */}
            <label
              className="inline-flex items-center gap-2.5"
              style={{ color: "rgba(255,255,255,0.45)", fontSize: 13, cursor: "not-allowed" }}
            >
              <input
                type="checkbox"
                checked
                disabled
                style={{ width: 15, height: 15, accentColor: "#C1A571" }}
                data-testid="cookie-necessary"
              />
              {t("cookie.necessary")}
            </label>

            {/* Statistics */}
            <label
              className="inline-flex items-center gap-2.5"
              style={{ color: "rgba(255,255,255,0.85)", fontSize: 13, cursor: "pointer" }}
            >
              <input
                type="checkbox"
                checked={stats}
                onChange={(e) => setStats(e.target.checked)}
                style={{ width: 15, height: 15, accentColor: "#C1A571" }}
                data-testid="cookie-statistics"
              />
              {t("cookie.statistics")}
            </label>

            {/* Preferences */}
            <label
              className="inline-flex items-center gap-2.5"
              style={{ color: "rgba(255,255,255,0.85)", fontSize: 13, cursor: "pointer" }}
            >
              <input
                type="checkbox"
                checked={prefs}
                onChange={(e) => setPrefs(e.target.checked)}
                style={{ width: 15, height: 15, accentColor: "#C1A571" }}
                data-testid="cookie-preferences"
              />
              {t("cookie.preferences")}
            </label>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex flex-col sm:flex-row lg:flex-col gap-3 lg:items-stretch">
          {/* Save selection */}
          <button
            onClick={() =>
              persist({ necessary: true, statistics: stats, preferences: prefs })
            }
            style={{
              background: "#C1A571",
              color: "#0F1923",
              padding: "11px 22px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
              transition: "opacity 0.15s",
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.opacity = "0.88")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.opacity = "1")}
            data-testid="cookie-save"
          >
            {t("cookie.save")}
          </button>

          {/* Accept all */}
          <button
            onClick={() =>
              persist({ necessary: true, statistics: true, preferences: true })
            }
            style={{
              background: "transparent",
              color: "#fff",
              border: "1px solid rgba(255,255,255,0.4)",
              padding: "11px 22px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              transition: "background 0.15s, color 0.15s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "#fff";
              (e.currentTarget as HTMLElement).style.color = "#0F1923";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
              (e.currentTarget as HTMLElement).style.color = "#fff";
            }}
            data-testid="cookie-accept-all"
          >
            {t("cookie.acceptAll")}
          </button>

          {/* Reject non-essential */}
          <button
            onClick={() =>
              persist({ necessary: true, statistics: false, preferences: false })
            }
            style={{
              background: "transparent",
              color: "rgba(255,255,255,0.6)",
              border: "1px solid rgba(255,255,255,0.2)",
              padding: "11px 22px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              transition: "background 0.15s, color 0.15s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.08)";
              (e.currentTarget as HTMLElement).style.color = "#fff";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
              (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.6)";
            }}
            data-testid="cookie-reject"
          >
            {t("cookie.reject")}
          </button>
        </div>
      </div>
    </div>
  );
}
