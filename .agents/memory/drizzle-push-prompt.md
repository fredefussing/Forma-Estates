---
name: drizzle-kit push interactive rename prompt
description: How to bypass drizzle-kit push's blocking "create or rename" prompt when adding new tables.
---
When adding a brand-new Postgres table whose name happens to look similar to existing tables, `drizzle-kit push --force` will stop on an interactive arrow-key prompt ("Is X created or renamed from another table?"). Piping newlines into stdin does NOT advance it — the prompt requires a real TTY.

**How to apply:** Skip the push entirely and apply the table directly with `psql "$DATABASE_URL" -c "CREATE TABLE IF NOT EXISTS ... ;"`. Mirror the exact column types/defaults from the Drizzle schema so the next push (if ever run) sees no drift.

**Why:** The bash tool has no TTY; the prompt eats CPU and never completes. Direct DDL is faster and unambiguous.
