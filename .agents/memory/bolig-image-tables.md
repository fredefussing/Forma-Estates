---
name: Bolig gallery image tables
description: Which DB table case-gallery image IDs belong to — legacy trap that 404s share/season features
---

The case gallery endpoint returns rows from `generated_images` — so any image `id` the dashboard holds is a generated_images ID.

**Rule:** Server endpoints receiving an image id from the gallery UI must look it up via `storage.getGeneratedImage(id)` and verify `img.userId === authedUserId`. The `bolig_case_images` table is legacy: nothing writes to it anymore, so `getBoligCaseImage()` lookups 404 for every real gallery image (or worse, hit a stale colliding row).

**Why:** Share-link and season-refresh features shipped wired to `getBoligCaseImage` and were dead on arrival (every click → 404); caught only in architect review. The share route accepts both `caseImageId` (legacy) and `generatedImageId` — clients must send `generatedImageId`.

**How to apply:** Any new feature that references a gallery image by id (share, regenerate, PDF, etc.) → `generatedImageId` + `getGeneratedImage` + userId ownership check.
