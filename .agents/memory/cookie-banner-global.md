---
name: Cookie banner is global
description: Where the GDPR cookie consent banner lives and how it is wired
---

## Rule
There is exactly one CookieBanner — mounted in `App.tsx` inside `<TooltipProvider>` alongside `<Toaster />`. It is a standalone component, not embedded in any page.

## Why
Previously it was only rendered inside the landing page component, so dashboard and other routes had no cookie consent. GDPR requires it on every page.

## How to apply
- Component: `client/src/components/cookie-banner.tsx` — no dependency on landing-page constants (C, SERIF, SANS)
- Consent stored in `localStorage` under key `"forma-cookie-consent"` as JSON `{necessary, statistics, preferences, ts}`
- All 7 locale files already have `cookie.*` keys: `title, text, necessary, statistics, preferences, save, acceptAll, reject`
- GA consent is applied by toggling `window["ga-disable-G-5BRC2FMPNT"]`
- The landing page (`boligpotentiale-landing.tsx`) no longer mounts its own `<CookieBanner />`
