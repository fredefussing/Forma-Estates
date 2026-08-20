---
name: MediaRecorder final chunk
description: Browser recordings need their tracks alive until MediaRecorder has emitted its final data and stop event.
---

When ending a browser `MediaRecorder` session, call `stop()` first and keep
the capture tracks alive until its `onstop` handler has received the final
`dataavailable` chunk. Only then release the microphone tracks and expose the
saved audio to the user.

**Why:** Closing a microphone stream immediately after `stop()` can race the
browser's final chunk delivery. In an end-of-video flow this makes a completed
recording appear to disappear, even though the user spoke for the whole video.

**How to apply:** Use a brief finalising state after manual stop or video
`ended`; create the audio `Blob` in `onstop`, then stop tracks. Start the
recorder immediately before starting the timed video so opening speech is
captured too. Use the video's actual `ended` event as the only automatic stop
signal—duration metadata may be short and must only drive display counters.