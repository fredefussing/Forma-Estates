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

// Country-code → i18next language mapping.
// navigator.language returns tags like "sv-SE", "de-AT", "nb-NO", "es-ES", "fr-FR".
// The LanguageDetector uses the first segment automatically (e.g. "sv", "de", "nb", "es", "fr").
// We map: da → Danish, sv → Swedish, de → German, nb/no/nn → Norwegian,
//         es → Spanish, fr → French, * → English.

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
    // Map "no" and "nn" (Nynorsk) to the "nb" resource
    load: "languageOnly",
    supportedLngs: ["da", "sv", "de", "nb", "en", "es", "fr"],
    nonExplicitSupportedLngs: true,
    detection: {
      // 1. Check localStorage (returning visitors keep their detected language)
      // 2. Use navigator.language (OS/browser language = best proxy for "which country")
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "forma-lang",
      caches: ["localStorage"],
    },
    interpolation: {
      escapeValue: false, // React already escapes
    },
  });

// Normalise "no" → "nb" so Norwegian users get the right translations
if (i18n.language?.startsWith("no") || i18n.language?.startsWith("nn")) {
  i18n.changeLanguage("nb");
}

export default i18n;
