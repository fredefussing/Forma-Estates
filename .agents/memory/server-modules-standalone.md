---
name: Server modules must not import ./index
description: Importing anything from server/index.ts boots the Express server — breaks test scripts with EADDRINUSE.
---

Rule: never import `log` (or anything) from `server/index.ts` in modules that tests or scripts may load (`server/email.ts`, `server/purchases.ts`, etc.). Define a small local logger instead.

**Why:** `server/index.ts` starts listening on port 5000 at import time. A tsx test script that transitively imports it crashes mid-run with EADDRINUSE against the running dev server. This bit the purchase-flow test suite (July 2026).

**How to apply:** When writing standalone scripts under `scripts/` that import server modules, check the import chain for `./index`. `server/routes.ts` may import it (only loaded by the server); shared/leaf modules may not. Also: disable outgoing mail in test scripts with `process.env.SMTP_PASSWORD = ""` before dynamic imports.
