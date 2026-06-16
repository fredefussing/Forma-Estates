---
name: Floorplan wall detection (dollhouse viewer)
description: How to detect walls from a 2D floorplan raster for the BoxGeometry dollhouse viewer; why Otsu+absolute-minArea failed.
---

# Detecting walls from a 2D floorplan image

Pipeline that works for clean Danish estate floorplans (thin grey wall lines on white paper):
downsample (~300px max) → grayscale → threshold **relative to paper-white** (bright percentile ~0.9, threshold ≈ paperWhite × 0.86) → **dilate 3×3** to bridge broken/thin lines into one network → **keep large connected components** (drop components < ~20% of the largest) → greedy-mesh into axis-aligned rectangles.

**Why:** the first attempt used Otsu threshold + an *absolute* min-area component filter. It only caught the darkest pixels (one bold outer wall + saturated bathroom fixtures) and the ~180-cell min-area deleted every thin grey wall segment that wasn't part of one huge blob. Thin light-grey walls need a paper-white-relative threshold, and a *relative* (ratio-of-largest) component filter — not absolute area — is what cleanly drops the compass rose, dimension text and furniture icons while keeping the whole wall network.

**How to apply:** validate detection by tinting the returned rects red over the source plan and eyeballing it (overlay test) — coverage ~5–6% on a clean plan is healthy; ~1% means the threshold/min-area killed the grey walls. Dense apartments over-fill (furniture touching walls joins the main component) — acceptable for v1, would need semantic separation to fix.
