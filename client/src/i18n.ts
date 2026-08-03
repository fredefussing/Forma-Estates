import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import da from "./locales/da.json";
import sv from "./locales/sv.json";
import de from "./locales/de.json";
import nb from "./locales/nb.json";
import en from "./locales/en.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";

// ─── One-time migration ────────────────────────────────────────────────────────
// Previous versions used `caches: ["localStorage"]`, which silently wrote the
// auto-detected language to localStorage. If that produced "en" before i18n was
// properly configured, Danish users got stuck in English. Clear any cached value
// that wasn't set explicitly by the user (marked by forma-lang-explicit = "1").
(function migrateStaleLanguageCache() {
  try {
    const cached = localStorage.getItem("forma-lang");
    const explicit = localStorage.getItem("forma-lang-explicit") === "1";
    if (cached && !explicit) {
      localStorage.removeItem("forma-lang");
    }
  } catch {
    /* localStorage blocked (e.g. incognito strict mode) */
  }
})();

/**
 * Call this (and ONLY this) when the user explicitly picks a language in the UI.
 * Sets the explicit flag so the migration code won't clear it.
 */
export function setExplicitLang(lang: string) {
  try {
    localStorage.setItem("forma-lang", lang);
    localStorage.setItem("forma-lang-explicit", "1");
  } catch {
    /* ignore */
  }
  i18n.changeLanguage(lang);
}

// ─── i18n init ────────────────────────────────────────────────────────────────
// Detection order:
//   1. localStorage  — only present when user explicitly switched (see above)
//   2. cookie        — "fe-locale" cookie set by the Express server from the
//                      OS-accurate Accept-Language header (works even when the
//                      browser UI language differs from the OS language)
//   3. navigator     — browser JS language (fallback; may differ from OS)
//
// We do NOT cache back to localStorage automatically (caches:[]) — that's what
// caused stale "en" values to get stuck for Danish users in the first place.
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      da: { translation: da },
      sv: { translation: sv },
      de: { translation: de },
      nb: { translation: nb },
      en: { translation: en },
      es: { translation: es },
      fr: { translation: fr },
    },
    fallbackLng: "da",
    load: "languageOnly",          // "da-DK" → "da", "nb-NO" → "nb"
    supportedLngs: ["da", "sv", "de", "nb", "en", "es", "fr"],
    nonExplicitSupportedLngs: true,
    detection: {
      order: ["localStorage", "cookie", "navigator"],
      lookupLocalStorage: "forma-lang",
      lookupCookie: "fe-locale",
      caches: [], // never auto-write — only setExplicitLang() writes
    },
    interpolation: {
      escapeValue: false,
    },
  });

// Normalise "no" / "nn" → "nb" for Norwegian users
if (i18n.language?.startsWith("no") || i18n.language?.startsWith("nn")) {
  i18n.changeLanguage("nb");
}

export default i18n;
