---
name: Voice-over final audio tail
description: Preserve narration through the visual end when the source video's audio track is shorter.
---

When combining source-video audio with a voice-over, mix to the longest input
and explicitly trim the final mix to the video duration. Do not make the
source-audio bed the duration authority.

**Why:** A video container can have frames after its embedded audio ends.
Choosing the source bed as the mix duration silently cuts the narrator at that
earlier audio boundary, commonly leaving the last seconds of video silent.

**How to apply:** Pad/trim narration to the probed video duration, use the
longest audio input for the mix, then apply a final trim to the video duration.
Verify with a fixture where the source bed ends before the video.