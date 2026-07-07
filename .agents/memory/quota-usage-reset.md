---
name: Quota usage-counter reset must be opt-in
description: Why setUserQuotas must NOT reset used_* based on resetsAt; it is a shared mutator hit by login, top-up, and activation.
---

`storage.setUserQuotas()` is a single shared mutator called from several very
different flows: per-login reconfig (`/api/auth/verify` pre-configured users),
one-time Stripe package top-ups (`mode="payment"`), admin tier assignment, and
genuine subscription activation.

**Rule:** zeroing the `used_*` counters must be an explicit opt-in flag
(`resetUsage: true`) passed only by the plan-activation call sites — NEVER tied
to the presence of `resetsAt`.

**Why:** an earlier implementation reset `used_*` whenever `resetsAt` was set.
Because every one of those flows passes a `resetsAt`, it silently: (1) reset
lifetime override caps on every login (defeating a per-account showcase cap of 1
→ effectively unlimited), and (2) handed back already-spent quota on every
one-time top-up (revenue bug — buy 1 showcase, get your 3 spent AI gens back).

**How to apply:** when adding a new `setUserQuotas` caller, decide deliberately
whether it starts a fresh billing period. Only then pass `resetUsage: true`.
Top-ups and login reconfig must preserve `used_*`.
