---
name: Dashboard E2E authentication
description: Reliable authentication and cleanup for read-only development dashboard browser checks.
---

Do not assume the `ADMIN_PASSWORD` environment secret authenticates the known Firebase admin email in the development app.

**Why:** An authenticated dashboard test on 2026-09-16 confirmed that combination is rejected by Firebase even though the secret exists. Repeating it blocks visual validation and risks prompting unnecessary credential changes.

**How to apply:** For development-only read-only dashboard checks, create a unique temporary signup, set only that new row's email-verification flag in the development database, avoid paid or customer-data mutations, then delete the account through the app and confirm its development row is gone.