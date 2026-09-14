---
name: Selective frame interpolation
description: Rules for preserving hard cuts and avoiding ghosting when converting edited footage to a higher frame rate.
---

Split the source at every known hard cut before motion interpolation; do not rely on the interpolator's scene-change detector to protect clip boundaries. In fast pans with overlapping geometry, keep the 60 fps container but repeat original frames instead of synthesizing intermediate frames.

**Why:** Scene-change detection can still create a blended frame across a hard cut, while high-motion interiors can produce doubled window frames, furniture, and transparent-looking objects.

**How to apply:** Build each original clip as an independent filter branch, apply interpolation only to visually safe branches or intervals, then concatenate the processed branches. Inspect consecutive frames around every cut and every interval switched to frame repetition.