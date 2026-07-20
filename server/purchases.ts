// ── Purchase fulfillment ──────────────────────────────────────────────────────
// Single source of truth for granting paid purchases (Stripe subscriptions,
// Stripe custom packages, Shopify credit packages). All entry points — the
// /betalt success page, the Stripe webhook, the Shopify webhook and the
// auto-claim at login/signup — go through the same atomic claim + grant so a
// purchase can never be granted twice and never gets lost.
import type { PoolClient } from "pg";
import { storage } from "./storage";
import { pool } from "./db";
import type { PendingPurchase } from "@shared/schema";
import { sendSubscriptionConfirmationEmail, sendPackageConfirmationEmail } from "./email";

// Local logger — deliberately NOT imported from ./index so this module can be
// loaded standalone (tests, scripts) without booting the whole server.
function log(message: string) {
  const t = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true });
  console.log(`${t} [express] ${message}`);
}

export const PRICE_TO_TIER: Record<string, string> = {
  "price_1Tl2kVKDpJP0jg0e2UqApR5B": "start",
  "price_1Tl2rVKDpJP0jg0erJ0x7FZs": "start",
  "price_1Tl2nYKDpJP0jg0eMbTJQ2jx": "pro",
  "price_1Tl2soKDpJP0jg0eREm8LuB4": "pro",
  "price_1Tl2pZKDpJP0jg0etHHBwE52": "business",
  "price_1Tl2uiKDpJP0jg0eAXRwj3Al": "business",
};

export const TIER_QUOTAS: Record<string, { ai: number; floorPlans: number; transformVideos: number; showcase: number }> = {
  start:    { ai: 10, floorPlans: 2,  transformVideos: 2,  showcase: 1 },
  pro:      { ai: 25, floorPlans: 5,  transformVideos: 5,  showcase: 3 },
  business: { ai: 60, floorPlans: 12, transformVideos: 12, showcase: 8 },
};

export const TIER_NAMES: Record<string, string> = { start: "Start", pro: "Pro", business: "Business" };

export type GrantResult =
  | { kind: "subscription"; tier: string; tierName: string; quotas: { ai: number; floorPlans: number; transformVideos: number; showcase: number } }
  | { kind: "package"; aiVisual: number; plan3d: number; transformVid: number; showcase: number; amountTotal: number | null }
  | { kind: "shopify_credits"; packageName: string; images: number };

export function stripeExternalId(sessionId: string): string {
  return `stripe:${sessionId}`;
}

// Has this Stripe session already been granted (via the ledger OR the legacy
// credit_transactions rows written before pending_purchases existed)?
// Checked across ALL users so one paid session can never activate two accounts.
export async function isStripeSessionProcessed(sessionId: string): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1 FROM credit_transactions WHERE description=$1 LIMIT 1`,
    [stripeExternalId(sessionId)]
  );
  return (r.rowCount ?? 0) > 0;
}

// Build a pending-purchase record from a (fully expanded) Stripe checkout
// session. Returns null for unknown session modes.
export function buildStripePending(session: any): { externalId: string; email: string | null; kind: "subscription" | "package"; payload: Record<string, unknown> } | null {
  const email: string | null = session.customer_details?.email ?? session.customer_email ?? null;
  if (session.mode === "subscription") {
    const priceId: string | undefined = session.line_items?.data?.[0]?.price?.id;
    const tier = (priceId && PRICE_TO_TIER[priceId]) || "start";
    return {
      externalId: stripeExternalId(session.id),
      email,
      kind: "subscription",
      payload: { tier, amountTotal: session.amount_total ?? null },
    };
  }
  if (session.mode === "payment") {
    const m = session.metadata ?? {};
    const int = (v: unknown) => parseInt(String(v ?? "0"), 10) || 0;
    return {
      externalId: stripeExternalId(session.id),
      email,
      kind: "package",
      payload: {
        aiVisual: int(m.ai_visual),
        plan3d: int(m.plan_3d),
        transformVideo: int(m.transform_video),
        showcase: int(m.showcase),
        amountTotal: session.amount_total ?? null,
      },
    };
  }
  return null;
}

// Apply a claimed purchase inside an OPEN transaction. Every quota/credit/
// ledger write goes through the same client, so any failure rolls EVERYTHING
// back — including the claim itself — leaving the purchase safely pending
// and re-claimable. Emails/logs are returned as an afterCommit callback so
// side effects only fire once the transaction is durable.
async function grantPurchaseTx(client: PoolClient, userId: number, purchase: PendingPurchase): Promise<{ grant: GrantResult; afterCommit: () => void }> {
  const payload: any = purchase.payload ?? {};
  const ures = await client.query(
    `SELECT email, subscription_status, subscription_tier,
            quota_ai_visualizations, quota_floor_plans, quota_transform_videos, quota_showcase_videos
     FROM users WHERE id=$1 FOR UPDATE`,
    [userId]
  );
  const u = ures.rows[0];
  if (!u) throw new Error(`grantPurchase: user ${userId} not found`);

  if (purchase.kind === "subscription") {
    const tier: string = payload.tier in TIER_QUOTAS ? payload.tier : "start";
    const quotas = TIER_QUOTAS[tier];
    const resetsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    // Fresh subscription period: set exactly the tier's quotas and clear usage.
    await client.query(
      `UPDATE users SET subscription_status='active', subscription_tier=$2,
              quota_ai_visualizations=$3, quota_floor_plans=$4, quota_transform_videos=$5, quota_showcase_videos=$6,
              used_ai_visualizations=0, used_floor_plans=0, used_transform_videos=0, used_showcase_videos=0,
              quota_resets_at=$7
       WHERE id=$1`,
      [userId, tier, quotas.ai, quotas.floorPlans, quotas.transformVideos, quotas.showcase, resetsAt]
    );
    await client.query(
      `INSERT INTO credit_transactions(user_id, amount, type, description) VALUES($1, 0, 'stripe_subscription', $2)`,
      [userId, purchase.externalId]
    );
    const tierName = TIER_NAMES[tier] ?? tier;
    const customerEmail: string = purchase.email ?? u.email ?? "";
    return {
      grant: { kind: "subscription", tier, tierName, quotas },
      afterCommit: () => {
        log(`[purchases] Subscription '${tier}' granted to user ${userId} (${purchase.externalId})`);
        if (customerEmail) sendSubscriptionConfirmationEmail({ customerEmail, tierName, quotas }).catch(() => {});
      },
    };
  }

  if (purchase.kind === "package") {
    const aiVisual: number = payload.aiVisual ?? 0;
    const plan3d: number = payload.plan3d ?? 0;
    const transformVid: number = payload.transformVideo ?? 0;
    const showcase: number = payload.showcase ?? 0;

    // One-time package: purchased amounts are added ON TOP of whatever the user
    // has, and — critically — WITHOUT setting a reset date. A one-time purchase
    // must never renew monthly; the monthly reset SQL carries unused top-ups
    // over and only re-fills the subscription tier's own base allowance.
    await client.query(
      `UPDATE users SET
              quota_ai_visualizations  = COALESCE(quota_ai_visualizations, 0) + $2,
              quota_floor_plans        = COALESCE(quota_floor_plans, 0) + $3,
              quota_transform_videos   = COALESCE(quota_transform_videos, 0) + $4,
              quota_showcase_videos    = COALESCE(quota_showcase_videos, 0) + $5
       WHERE id=$1`,
      [userId, aiVisual, plan3d, transformVid, showcase]
    );

    // Only mark the account as 'custom' when there is no real subscription —
    // a Pro subscriber buying a top-up must stay Pro.
    const hasRealSubscription = u.subscription_status === "active" && u.subscription_tier && (u.subscription_tier in TIER_QUOTAS || u.subscription_tier === "unlimited");
    if (!hasRealSubscription) {
      await client.query(
        `UPDATE users SET subscription_status='active', subscription_tier='custom' WHERE id=$1`,
        [userId]
      );
    }

    await client.query(
      `INSERT INTO credit_transactions(user_id, amount, type, description) VALUES($1, 0, 'stripe_package', $2)`,
      [userId, purchase.externalId]
    );

    const customerEmail: string = purchase.email ?? u.email ?? "";
    const amountTotal: number | null = payload.amountTotal ?? null;
    return {
      grant: { kind: "package", aiVisual, plan3d, transformVid, showcase, amountTotal },
      afterCommit: () => {
        log(`[purchases] Package granted to user ${userId}: ai+${aiVisual}, 3d+${plan3d}, video+${transformVid}, showcase+${showcase} (${purchase.externalId})`);
        if (customerEmail) {
          const items = [
            { name: "AI Visualisering", quantity: aiVisual, unitPrice: 100, total: aiVisual * 100 },
            { name: "3D Plantegning", quantity: plan3d, unitPrice: 300, total: plan3d * 300 },
            { name: "Transformering Video", quantity: transformVid, unitPrice: 300, total: transformVid * 300 },
            { name: "Bolig Showcase Video", quantity: showcase, unitPrice: 500, total: showcase * 500 },
          ];
          const grandTotal = Math.round((amountTotal ?? 0) / 100);
          const sessionId = purchase.externalId.replace("stripe:", "");
          sendPackageConfirmationEmail({ customerEmail, items, grandTotal, sessionId }).catch(() => {});
        }
      },
    };
  }

  if (purchase.kind === "shopify_credits") {
    const images: number = payload.images ?? 0;
    const packageName: string = payload.packageName ?? "Ukendt";
    const tierKey: string = payload.tierKey ?? packageName.toLowerCase();
    await client.query(
      `UPDATE users SET credits_remaining = credits_remaining + $2,
              subscription_status='active', subscription_tier=$3
       WHERE id=$1`,
      [userId, images, tierKey]
    );
    await client.query(
      `INSERT INTO credit_transactions(user_id, amount, type, description) VALUES($1, $2, 'purchase', $3)`,
      [userId, images, `Købt: ${packageName} pakke (${images} billeder) [${purchase.externalId}]`]
    );
    return {
      grant: { kind: "shopify_credits", packageName, images },
      afterCommit: () => {
        log(`[purchases] Shopify credits granted to user ${userId}: ${images} (${purchase.externalId})`);
      },
    };
  }

  throw new Error(`grantPurchase: unknown purchase kind '${purchase.kind}'`);
}

// Atomically claim a purchase for a user and grant it — claim, grant and
// ledger insert all commit (or roll back) as ONE transaction. Returns null
// when the purchase was already claimed (by this or any other account).
// Concurrent callers block on the claimed row's lock and lose cleanly.
export async function claimAndGrant(externalId: string, userId: number): Promise<GrantResult | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const claimRes = await client.query(
      `UPDATE pending_purchases
       SET status='claimed', claimed_by_user_id=$2, claimed_at=NOW()
       WHERE external_id=$1 AND status='pending'
       RETURNING id, provider, external_id AS "externalId", email, kind, payload, status,
                 claimed_by_user_id AS "claimedByUserId", created_at AS "createdAt", claimed_at AS "claimedAt"`,
      [externalId, userId]
    );
    if ((claimRes.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return null;
    }
    const purchase = claimRes.rows[0] as PendingPurchase;
    const { grant, afterCommit } = await grantPurchaseTx(client, userId, purchase);
    await client.query("COMMIT");
    afterCommit();
    return grant;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// Claim every pending purchase matching this user's email — called at
// login/signup so purchases made BEFORE the account existed are activated
// automatically the moment the account is created.
export async function claimPendingPurchasesForUser(user: { id: number; email: string }): Promise<GrantResult[]> {
  if (!user.email) return [];
  const rows = await storage.getPendingPurchasesByEmail(user.email);
  const results: GrantResult[] = [];
  for (const row of rows) {
    try {
      const r = await claimAndGrant(row.externalId, user.id);
      if (r) results.push(r);
    } catch (err: any) {
      log(`[purchases] Failed to claim ${row.externalId} for user ${user.id}: ${err.message}`);
    }
  }
  return results;
}
