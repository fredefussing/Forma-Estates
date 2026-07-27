---
name: Dashboard banner pointer-interception
description: Why elements rendered between the dashboard header and main flex container are visible but unclickable
---

The bolig dashboard layout renders top-strip content (e.g. the paywall banner) in a wrapper with `pt-20 md:pt-32`, immediately followed by the main flex container using `-mt-20 md:-mt-32 pt-20 md:pt-32`. The negative margin makes the sibling's **transparent padding overlap the strip exactly**, so the strip is visible but receives no pointer events — normal AND force clicks silently do nothing (Playwright hit-testing routes to the covering div).

**Why:** Discovered 2026-07-27 when the banner's buttons did nothing in e2e tests; the old "Opgrader" button had been silently dead for the same reason.

**How to apply:** Any interactive element placed in that strip needs `relative z-10` **on the element itself** (header is `z-40 fixed`, safe). Do NOT z-lift the padded wrapper — its transparent `pl-56`/`pt-32` padding would then block clicks on the fixed sidebar ("Ny sag" button) and header. Symptom to recognize: "button visible but click does nothing, even force-click".
