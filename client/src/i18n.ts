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

// ─── One-time migration ───────────────────────────────────────────────────────
// Previous versions of i18n used `caches: ["localStorage"]`, which meant the
// LanguageDetector silently wrote the auto-detected language to localStorage on
// first visit. If that auto-detection produced "en" (e.g. before i18n was
// properly configured, or due to a Vite SSR quirk), Danish users got stuck in
// English permanently — their stored "en" took priority over navigator.language.
//
// Rule: only trust localStorage if the user EXPLICITLY chose a language via the
// language switcher (marked by `forma-lang-explicit = "1"`). Otherwise, clear
// any cached value and let navigator.language re-detect on every visit.
// The switcher must call setExplicitLang() below so the flag is preserved.
(function migrateStaleLanguageCache() {
  try {
    const cached = localStorage.getItem("forma-lang");
    const explicit = localStorage.getItem("forma-lang-explicit") === "1";
    if (cached && !explicit) {
      localStorage.removeItem("forma-lang");
    }
  } catch {
    // localStorage not available (e.g. SSR/incognito with storage blocked)
  }
})();

/** Call this (and only this) when the user explicitly picks a language in the UI. */
export function setExplicitLang(lang: string) {
  try {
    localStorage.setItem("forma-lang", lang);
    localStorage.setItem("forma-lang-explicit", "1");
  } catch {
    // ignore
  }
  i18n.changeLanguage(lang);
}

// ─── i18n init ────────────────────────────────────────────────────────────────
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
    // Fallback chain: missing key → Danish (home language of the product)
    fallbackLng: "da",
    // Strip region tags: "da-DK" → "da", "nb-NO" → "nb"
    load: "languageOnly",
    supportedLngs: ["da", "sv", "de", "nb", "en", "es", "fr"],
    nonExplicitSupportedLngs: true,
    detection: {
      // 1. localStorage  — only present when user explicitly switched (see above)
      // 2. navigator     — OS/browser language = best proxy for user locale
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "forma-lang",
      // NO automatic caching — we write to localStorage only via setExplicitLang()
      // so we never overwrite an explicit choice with an auto-detected one.
      caches: [],
    },
    interpolation: {
      escapeValue: false, // React already escapes
    },
  });

// Normalise "no" / "nn" → "nb" so Norwegian users get the right translations.
// Do this after init so the resolved language is available.
if (i18n.language?.startsWith("no") || i18n.language?.startsWith("nn")) {
  i18n.changeLanguage("nb");
}

export default i18n;
