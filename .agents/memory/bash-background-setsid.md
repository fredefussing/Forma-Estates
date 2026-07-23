---
name: Background processes in bash tool need setsid
description: How to launch long-running background jobs from the bash tool without them being killed
---

Plain `nohup cmd &` launched from the bash tool dies when the command returns — the whole process group is killed. Use `(setsid nohup cmd > log 2>&1 &)` instead; setsid-detached processes survive across bash invocations, and `/tmp` persists too.

**Why:** A 5-way parallel Collov generation script silently vanished (no log file, no process) when launched with plain nohup; relaunching with setsid worked.

**How to apply:** Any job longer than the 120s bash timeout: launch with setsid into a log file, then poll the log in later commands. Also: `pkill -f "pattern"` matches the current shell's own command line if the pattern appears literally in it — bracket a character (`pkill -f "sleep 30[0]"`) to avoid killing yourself.
