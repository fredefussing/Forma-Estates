---
name: Token-scoped worker heartbeats
description: Prevent stale background workers from disabling the heartbeat of a reclaimed durable lease.
---

## Rule
Keep the in-process heartbeat registry keyed by both job identity and its active lease token. Every success, failure, and cleanup path may only clear a heartbeat when its token matches the worker's own token.

**Why:** A worker can finish after its database lease has expired and another instance has reclaimed the job. If the old worker clears a registry entry by job id alone, it stops the newer worker's heartbeat. That newer lease then expires and permits duplicate recovery work.

**How to apply:** Store `{ token, timer }` for each active job, replace/cancel only the previous local timer when a new token is successfully claimed, and route all worker cleanup through a token-matching helper. Keep database mutations conditional on the same token as well.