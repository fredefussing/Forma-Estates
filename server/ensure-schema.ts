// Additive, idempotent schema guard — runs at every server boot (dev, Replit
// and Render). Creates the newer tables/columns if they are missing so the
// Render-hosted live database stays in sync without manual SQL. NEVER drops
// or alters existing data; every statement is IF NOT EXISTS.
import { pool } from "./db";

export async function ensureSchema(): Promise<void> {
  const statements: Array<{ step: string; sql: string }> = [
    // ── users columns added after initial schema ──────────────────────────────
    {
      step: "users.marketing_opt_out",
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_opt_out boolean NOT NULL DEFAULT false`,
    },
    {
      step: "users.email_verified",
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false`,
    },
    {
      step: "users.verification_code_hash",
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_code_hash varchar(128)`,
    },
    {
      step: "users.verification_code_expires",
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_code_expires timestamp`,
    },
    {
      step: "users.verification_attempts",
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_attempts integer NOT NULL DEFAULT 0`,
    },
    {
      step: "users.quota_ai_visualizations",
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS quota_ai_visualizations integer`,
    },
    {
      step: "users.quota_floor_plans",
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS quota_floor_plans integer`,
    },
    {
      step: "users.quota_transform_videos",
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS quota_transform_videos integer`,
    },
    {
      step: "users.quota_showcase_videos",
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS quota_showcase_videos integer`,
    },
    {
      step: "users.used_ai_visualizations",
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS used_ai_visualizations integer NOT NULL DEFAULT 0`,
    },
    {
      step: "users.used_floor_plans",
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS used_floor_plans integer NOT NULL DEFAULT 0`,
    },
    {
      step: "users.used_transform_videos",
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS used_transform_videos integer NOT NULL DEFAULT 0`,
    },
    {
      step: "users.used_showcase_videos",
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS used_showcase_videos integer NOT NULL DEFAULT 0`,
    },
    {
      step: "users.quota_resets_at",
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS quota_resets_at timestamp`,
    },
    {
      step: "users.display_name",
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name text`,
    },
    {
      step: "users.customer_code",
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS customer_code varchar(32)`,
    },
    // ── share_links ───────────────────────────────────────────────────────────
    {
      step: "share_links",
      sql: `CREATE TABLE IF NOT EXISTS share_links (
        id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        token varchar(32) NOT NULL UNIQUE,
        user_id integer NOT NULL REFERENCES users(id),
        case_image_id integer REFERENCES bolig_case_images(id),
        generated_image_id integer REFERENCES generated_images(id),
        revoked boolean NOT NULL DEFAULT false,
        created_at timestamp NOT NULL DEFAULT now()
      )`,
    },
    // ── demo_generations ─────────────────────────────────────────────────────
    {
      step: "demo_generations",
      sql: `CREATE TABLE IF NOT EXISTS demo_generations (
        id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        ip_hash varchar(64) NOT NULL,
        created_date date NOT NULL DEFAULT now(),
        count integer NOT NULL DEFAULT 1
      )`,
    },
    {
      step: "demo_generations unique(ip_hash, created_date)",
      sql: `CREATE UNIQUE INDEX IF NOT EXISTS demo_generations_ip_date_uq ON demo_generations (ip_hash, created_date)`,
    },
    // ── drip_emails ───────────────────────────────────────────────────────────
    {
      step: "drip_emails",
      sql: `CREATE TABLE IF NOT EXISTS drip_emails (
        id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        user_id integer NOT NULL REFERENCES users(id),
        email_key varchar(30) NOT NULL,
        sent_at timestamp NOT NULL DEFAULT now()
      )`,
    },
    {
      step: "drip_emails unique(user_id, email_key)",
      sql: `CREATE UNIQUE INDEX IF NOT EXISTS drip_emails_user_key_uq ON drip_emails (user_id, email_key)`,
    },
    // ── ai_tour_properties ───────────────────────────────────────────────────
    {
      step: "ai_tour_properties",
      sql: `CREATE TABLE IF NOT EXISTS ai_tour_properties (
        id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        user_id integer NOT NULL REFERENCES users(id),
        address text NOT NULL,
        property_type text NOT NULL DEFAULT 'apartment',
        floorplan_url text,
        floorplan_analysis jsonb,
        style text NOT NULL DEFAULT 'modern',
        status text NOT NULL DEFAULT 'draft',
        tour_video_url text,
        tour_status varchar(20),
        created_at timestamp NOT NULL DEFAULT now()
      )`,
    },
    {
      step: "ai_tour_properties.tour_video_url",
      sql: `ALTER TABLE ai_tour_properties ADD COLUMN IF NOT EXISTS tour_video_url text`,
    },
    {
      step: "ai_tour_properties.tour_status",
      sql: `ALTER TABLE ai_tour_properties ADD COLUMN IF NOT EXISTS tour_status varchar(20)`,
    },
    {
      // Tour-jobs lever kun i hukommelsen — et serverneustart midt i en
      // generering ville ellers efterlade status "generating" for evigt og
      // låse frontendens generér-knapper.
      step: "reset stale tour_status",
      sql: `UPDATE ai_tour_properties SET tour_status = 'error' WHERE tour_status = 'generating'`,
    },
    // ── ai_tour_rooms ─────────────────────────────────────────────────────────
    {
      step: "ai_tour_rooms",
      sql: `CREATE TABLE IF NOT EXISTS ai_tour_rooms (
        id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        property_id integer NOT NULL REFERENCES ai_tour_properties(id),
        room_name text NOT NULL,
        room_type text NOT NULL DEFAULT 'living_room',
        before_image_url text,
        after_image_url text,
        panorama_url text,
        analysis_data jsonb,
        created_at timestamp NOT NULL DEFAULT now()
      )`,
    },
    // ── subscriptions ─────────────────────────────────────────────────────────
    {
      step: "subscriptions",
      sql: `CREATE TABLE IF NOT EXISTS subscriptions (
        id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        user_id integer NOT NULL REFERENCES users(id),
        plan_type text NOT NULL,
        status text NOT NULL DEFAULT 'trialing',
        stripe_subscription_id text,
        current_period_start timestamp,
        current_period_end timestamp,
        credits_per_month integer NOT NULL DEFAULT 0,
        credits_used_this_month integer NOT NULL DEFAULT 0,
        created_at timestamp NOT NULL DEFAULT now()
      )`,
    },
    // ── pending_purchases ─────────────────────────────────────────────────────
    {
      step: "pending_purchases",
      sql: `CREATE TABLE IF NOT EXISTS pending_purchases (
        id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        provider text NOT NULL,
        external_id text NOT NULL UNIQUE,
        email text,
        kind text NOT NULL,
        payload jsonb NOT NULL DEFAULT '{}',
        status text NOT NULL DEFAULT 'pending',
        claimed_by_user_id integer REFERENCES users(id),
        created_at timestamp NOT NULL DEFAULT now(),
        claimed_at timestamp
      )`,
    },
    // ── password_reset_tokens ─────────────────────────────────────────────────
    {
      step: "password_reset_tokens",
      sql: `CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        user_id integer NOT NULL REFERENCES users(id),
        token_hash varchar(128) NOT NULL UNIQUE,
        expires_at timestamp NOT NULL,
        used_at timestamp,
        created_at timestamp NOT NULL DEFAULT now()
      )`,
    },
    // ── crm_contacts ──────────────────────────────────────────────────────────
    {
      step: "crm_contacts",
      sql: `CREATE TABLE IF NOT EXISTS crm_contacts (
        id text PRIMARY KEY,
        email text NOT NULL UNIQUE,
        name text,
        company text,
        phone text,
        plan text NOT NULL DEFAULT 'none',
        status text NOT NULL DEFAULT 'lead',
        engagement_score integer NOT NULL DEFAULT 0,
        notes text,
        linked_user_id integer REFERENCES users(id),
        created_at timestamp NOT NULL DEFAULT now(),
        last_active_at timestamp
      )`,
    },
    // ── crm_activities ────────────────────────────────────────────────────────
    {
      step: "crm_activities",
      sql: `CREATE TABLE IF NOT EXISTS crm_activities (
        id text PRIMARY KEY,
        contact_id text NOT NULL REFERENCES crm_contacts(id),
        type text NOT NULL,
        description text,
        metadata text,
        created_at timestamp NOT NULL DEFAULT now()
      )`,
    },
    // ── crm_interactions ──────────────────────────────────────────────────────
    {
      step: "crm_interactions",
      sql: `CREATE TABLE IF NOT EXISTS crm_interactions (
        id text PRIMARY KEY,
        contact_id text NOT NULL REFERENCES crm_contacts(id),
        type text NOT NULL DEFAULT 'note',
        content text NOT NULL,
        created_by text,
        created_at timestamp NOT NULL DEFAULT now()
      )`,
    },
    // ── crm_user_overrides ────────────────────────────────────────────────────
    {
      step: "crm_user_overrides",
      sql: `CREATE TABLE IF NOT EXISTS crm_user_overrides (
        id text PRIMARY KEY,
        contact_id text NOT NULL REFERENCES crm_contacts(id),
        override_key text NOT NULL,
        override_value text NOT NULL,
        updated_at timestamp NOT NULL DEFAULT now()
      )`,
    },
    // ── leads ─────────────────────────────────────────────────────────────────
    {
      step: "leads",
      sql: `CREATE TABLE IF NOT EXISTS leads (
        id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        name text NOT NULL,
        category text NOT NULL DEFAULT 'ejendomsmaegler',
        instagram_handle text,
        email text,
        phone text,
        status text NOT NULL DEFAULT 'new',
        notes text,
        first_contact_at timestamp,
        follow_up_at timestamp,
        follow_up_1_at timestamp,
        follow_up_1_done boolean NOT NULL DEFAULT false,
        follow_up_2_at timestamp,
        follow_up_2_done boolean NOT NULL DEFAULT false,
        last_contacted_at timestamp,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )`,
    },
  ];

  for (const { step, sql } of statements) {
    try {
      await pool.query(sql);
    } catch (e: any) {
      console.error(`[ensure-schema] ${step} failed: ${e.message}`);
    }
  }
  console.log("[ensure-schema] additive schema check completed");
}
