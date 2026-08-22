---
name: Rendy thumbnail performance
description: Durable rule for fast clip libraries across both current and legacy Rendy edit manifests.
---

Clip grids and filmstrips must use durable static poster images, never one browser video decoder per candidate. If the client stops using video fallbacks, legacy manifests must first receive an asynchronous, idempotent full-frame poster backfill rather than showing permanent empty placeholders.

**Why:** A grid of source-video elements caused severe opening lag and layout shifts. Removing those elements fixed performance but exposed older manifests that predated poster generation, leaving their clip cards blank.

**How to apply:** Generate and store one small full-frame poster per candidate, deduplicate backfill work, and let the client refresh poster metadata without replacing local timeline or text edits. Keep actual source-video decoding opt-in and limited to the selected preview.