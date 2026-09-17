---
name: Dashboard preview pinning
description: Why always-visible dashboard previews use measured fixed positioning instead of native sticky.
---

For an always-visible preview inside the authenticated dashboard, use desktop-only measured pinning: keep the panel in normal flow until it reaches the fixed header, then fix it using the placeholder column's measured left position and width.

**Why:** Native `position: sticky` computed as `sticky` with the correct top offset but still moved as a static element in the dashboard's nested layout. Multiple changes to top offsets, motion transforms, overflow behavior, Tailwind utilities, and direct CSS did not alter the measured scroll position.

**How to apply:** Preserve a layout placeholder, recompute geometry on resize, add passive scroll handling, pin below the fixed header only at desktop widths, and remove listeners and pinned state when the flow unmounts.