---
name: Frame-accurate preview clip cuts
description: Why derived preview clips must use FFmpeg output-seek, and how to audit scene identity with contact sheets
---

# Frame-accurate preview clip cuts

Rule: when deriving short scene clips/posters from a source video, always place `-ss` AFTER `-i` (output-seek). Input fast-seek (`-ss` before `-i`) snaps to the previous keyframe, so a clip labeled "Dining room" can visibly start in the previous scene (e.g. the home office) even though the timestamp metadata is correct.

**Why:** In the Rendy editor sandbox, clip 04 ("Dining room") visually opened on the home-office scene because of keyframe-snapped seeks; labels and code were right, the pixels were wrong. A code review flagged it as mislabeled assets — the real cause was the seek mode.

**How to apply:**
- Derive both the .webm clip and its poster jpg with `-i src -ss start -t dur` (accurate, slower) — never fast-seek for scene-boundary-sensitive cuts.
- Verify scene identity visually, not by metadata: build a 1 fps contact sheet with burned-in `%{pts\:hms}` timestamps (`fps=1,scale=…,drawtext,tile=CxR`) to pick exact scene boundaries, then a first+last-frame grid of every rendered clip to confirm no clip starts or ends in the wrong room.
- ffmpeg `tile` takes ONE input stream; to grid separate images use hstack/vstack chains instead.
