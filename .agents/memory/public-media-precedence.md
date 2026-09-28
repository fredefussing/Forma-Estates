---
name: Public media precedence
description: Why matching client-side image files can still render as mismatched before/after pairs
---

The app serves assets from the project's top-level `public/` before assets from `client/public/`. A URL shared by both directories displays the top-level file, even when frontend source and a visual inspection of `client/public/` suggest a different image.

**Why:** A facade comparison appeared to show the same house when its `client/public/` files were inspected, but the running site displayed two unrelated buildings because the top-level files had the same URL names.

**How to apply:** For public-media regressions, inspect the bytes returned by the running app and compare them with both directories. Prefer unique URL filenames for intentional examples, or remove collisions after checking all consumers; do not assume the Vite root decides the winning asset.