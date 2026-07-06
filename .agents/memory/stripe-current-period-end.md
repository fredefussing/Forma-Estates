---
name: Stripe current_period_end moved to item level
description: Stripe SDK v22 / API 2025+ removed current_period_end from the top-level Subscription; read it defensively or the billing endpoint throws.
---

In Stripe API version 2025-03-31 (basil) and later — which the Node SDK v22 types target — `current_period_start`/`current_period_end` were **removed from the top-level Subscription object** and now live on each subscription **item** (`subscription.items.data[0].current_period_end`).

**Symptom:** `new Date(sub.current_period_end * 1000).toISOString()` throws `RangeError: Invalid time value` because the field is `undefined` → `new Date(NaN)`. If that's inside an endpoint's try/catch it silently returns 500 (e.g. `/api/billing/overview` `nextBillingDate`).

**Why:** `new Stripe(key)` is constructed without a pinned `apiVersion`, so the actual shape depends on the account's default API version — a field that "works" on one account can be undefined on another.

**How to apply:** Read it with a fallback chain and null-guard before building a date:
```ts
const periodEnd = (sub as any).current_period_end
  ?? (sub.items.data[0] as any)?.current_period_end
  ?? null;
nextBillingDate: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
```
`start_date`, `cancel_at`, `cancel_at_period_end` remain top-level in all versions.
