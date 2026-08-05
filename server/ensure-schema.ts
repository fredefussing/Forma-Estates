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
    // ── Seed dev leads into Render DB (only runs when leads table is empty) ──
    {
      step: "seed leads from dev",
      sql: `INSERT INTO leads (name,category,instagram_handle,email,phone,status,notes,first_contact_at,follow_up_at,follow_up_1_at,follow_up_1_done,follow_up_2_at,follow_up_2_done,last_contacted_at,created_at,updated_at)
        SELECT name,category,instagram_handle,email,phone,status,notes,first_contact_at,follow_up_at,follow_up_1_at,follow_up_1_done,follow_up_2_at,follow_up_2_done,last_contacted_at,created_at,updated_at FROM (VALUES
            ('NONBO & ELAND','ejendomsmaegler',NULL,'emilie@nonbo-eland.dk',NULL,'responded','Svaret – sendt mail til Emilie om Forma
[4. aug 16:56] ✅ Opfølgning 1 gennemført','2026-07-30 14:06:00+00','2026-08-06 14:06:00+00','2026-08-01 14:06:00',true,'2026-08-11 12:00:00',false,'2026-08-04 14:56:41.419+00','2026-08-04 13:48:58.213503+00','2026-08-04 14:56:46.619258+00'),
            ('Estate Lyngby Virum','ejendomsmaegler',NULL,'efs@estate.dk',NULL,'responded','Svaret – sendt mail til Emil om Forma','2026-08-03 10:39:00+00','2026-08-10 10:39:00+00','2026-08-06 12:00:00',false,'2026-08-13 12:00:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('EstateBoligVejle','ejendomsmaegler',NULL,NULL,NULL,'responded','Svaret – holder ferie. Send mail igen om en uge','2026-08-03 10:39:00+00','2026-08-10 10:00:00+00','2026-08-06 12:00:00',false,'2026-08-13 12:00:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Thomas Blues Aaby','byggefirma',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 19:32:00+00','2026-08-06 19:32:00+00','2026-08-01 19:32:00',false,'2026-08-08 19:32:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('OdsherredMægleren ApS','ejendomsmaegler',NULL,'tina@odsherredmaegleren.dk',NULL,'responded','Svaret – sendt mail til Tina om Forma
[4. aug 16:55] ✅ Opfølgning 1 gennemført','2026-07-30 14:00:00+00','2026-08-06 14:00:00+00','2026-08-01 14:00:00',true,'2026-08-11 12:00:00',false,'2026-08-04 14:55:20.969+00','2026-08-04 13:48:58.213503+00','2026-08-04 14:55:26.578319+00'),
            ('Ole Lindgreen & Partner','ejendomsmaegler',NULL,'philip@ole-lindgreen.dk',NULL,'responded','Svaret – ønsker at se mere. Opfølgning aftalt 5. august
[4. aug 16:50] ✅ Opfølgning 1 gennemført
[4. aug 16:50] ✅ Opfølgning 1 gennemført','2026-07-30 13:56:00+00','2026-08-06 13:56:00+00','2026-08-01 13:56:00',true,'2026-08-11 12:00:00',false,'2026-08-04 14:50:49.833+00','2026-08-04 13:48:58.213503+00','2026-08-04 14:50:57.89492+00'),
            ('RESTATO','ejendomsmaegler',NULL,'ac@restato.dk',NULL,'responded','Svaret – sendt mail til Ann-Christine om Forma
[4. aug 16:53] ✅ Opfølgning 1 gennemført','2026-07-30 13:42:00+00','2026-08-06 13:42:00+00','2026-08-01 13:42:00',true,'2026-08-11 12:00:00',false,'2026-08-04 14:53:12.536+00','2026-08-04 13:48:58.213503+00','2026-08-04 14:53:17.869982+00'),
            ('agriteam_varde','ejendomsmaegler',NULL,'lm@agriteam.dk',NULL,'responded','Svaret – sendt mail med Forma
[4. aug 16:54] ✅ Opfølgning 1 gennemført','2026-07-30 13:06:00+00','2026-08-06 13:06:00+00','2026-08-01 13:06:00',true,'2026-08-11 12:00:00',false,'2026-08-04 14:54:40.482+00','2026-08-04 13:48:58.213503+00','2026-08-04 14:54:45.040517+00'),
            ('Estate Concept','ejendomsmaegler',NULL,'kontakt@estateconcept.dk',NULL,'responded','Svaret – sendt mail om Forma
[4. aug 16:57] ✅ Opfølgning 1 gennemført','2026-07-31 13:08:00+00','2026-08-07 13:08:00+00','2026-08-02 13:08:00',true,'2026-08-11 12:00:00',false,'2026-08-04 14:57:36.767+00','2026-08-04 13:48:58.213503+00','2026-08-04 14:57:42.677517+00'),
            ('Irving Jensen and Co','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 12:20:00+00','2026-08-06 12:20:00+00','2026-08-01 12:20:00',false,'2026-08-08 12:20:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Aars Mægleren','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 13:02:00+00','2026-08-06 13:02:00+00','2026-08-01 13:02:00',false,'2026-08-08 13:02:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Wullf & Partnere','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 13:05:00+00','2026-08-06 13:05:00+00','2026-08-01 13:05:00',false,'2026-08-08 13:05:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('1:1 Landskab','arkitekt',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 18:16:00+00','2026-08-06 18:16:00+00','2026-08-01 18:16:00',false,'2026-08-08 18:16:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Ejendomsmægler Anita Jaeger','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 13:09:00+00','2026-08-06 13:09:00+00','2026-08-01 13:09:00',false,'2026-08-08 13:09:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Winther Ejendomme','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 13:11:00+00','2026-08-06 13:11:00+00','2026-08-01 13:11:00',false,'2026-08-08 13:11:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Klein Adamsen Bedre Boligsalg','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 13:16:00+00','2026-08-06 13:16:00+00','2026-08-01 13:16:00',false,'2026-08-08 13:16:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Werner Boliger','ejendomsmaegler',NULL,NULL,NULL,'contacted','Autosvar – ingen mail endnu','2026-07-30 13:16:00+00','2026-08-06 13:16:00+00','2026-08-01 13:16:00',false,'2026-08-08 13:16:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Brechmann Bolig','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 13:20:00+00','2026-08-06 13:20:00+00','2026-08-01 13:20:00',false,'2026-08-08 13:20:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Bernstorff Estate','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 13:22:00+00','2026-08-06 13:22:00+00','2026-08-01 13:22:00',false,'2026-08-08 13:22:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Vejlemægleren','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 13:22:00+00','2026-08-06 13:22:00+00','2026-08-01 13:22:00',false,'2026-08-08 13:22:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Thoustrup & Præstegaard','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 13:28:00+00','2026-08-06 13:28:00+00','2026-08-01 13:28:00',false,'2026-08-08 13:28:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Bjørn & Byskov Ejendomsmægler','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 13:32:00+00','2026-08-06 13:32:00+00','2026-08-01 13:32:00',false,'2026-08-08 13:32:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Thomas Risager A/S','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 13:31:00+00','2026-08-06 13:31:00+00','2026-08-01 13:31:00',false,'2026-08-08 13:31:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('bogodtmaegleren','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 13:36:00+00','2026-08-06 13:36:00+00','2026-08-01 13:36:00',false,'2026-08-08 13:36:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Storm & Dubourg I/S','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 13:33:00+00','2026-08-06 13:33:00+00','2026-08-01 13:33:00',false,'2026-08-08 13:33:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('SkagenBolig I/S','ejendomsmaegler',NULL,NULL,NULL,'contacted','Autosvar – ingen mail endnu','2026-07-30 13:35:00+00','2026-08-06 13:35:00+00','2026-08-01 13:35:00',false,'2026-08-08 13:35:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('BOLIG by K','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 13:39:00+00','2026-08-06 13:39:00+00','2026-08-01 13:39:00',false,'2026-08-08 13:39:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Boligmatch','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 13:41:00+00','2026-08-06 13:41:00+00','2026-08-01 13:41:00',false,'2026-08-08 13:41:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Signature Homes ApS','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 13:39:00+00','2026-08-06 13:39:00+00','2026-08-01 13:39:00',false,'2026-08-08 13:39:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Brix Westergaard A/S','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 13:47:00+00','2026-08-06 13:47:00+00','2026-08-01 13:47:00',false,'2026-08-08 13:47:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Fisker & Liljengren','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 13:47:00+00','2026-08-06 13:47:00+00','2026-08-01 13:47:00',false,'2026-08-08 13:47:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Byens Boligpartner','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 13:49:00+00','2026-08-06 13:49:00+00','2026-08-01 13:49:00',false,'2026-08-08 13:49:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Peter Hoe Ejendomme','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 13:48:00+00','2026-08-06 13:48:00+00','2026-08-01 13:48:00',false,'2026-08-08 13:48:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Mi Casa Real Estate','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 13:54:00+00','2026-08-06 13:54:00+00','2026-08-01 13:54:00',false,'2026-08-08 13:54:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Peter Due Bolig','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 13:50:00+00','2026-08-06 13:50:00+00','2026-08-01 13:50:00',false,'2026-08-08 13:50:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('BORG & HEILESEN','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 13:58:00+00','2026-08-06 13:58:00+00','2026-08-01 13:58:00',false,'2026-08-08 13:58:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Dahl Gray','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 13:59:00+00','2026-08-06 13:59:00+00','2026-08-01 13:59:00',false,'2026-08-08 13:59:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Nordbo','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 14:05:00+00','2026-08-06 14:05:00+00','2026-08-01 14:05:00',false,'2026-08-08 14:05:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('DanskeBolig','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 14:00:00+00','2026-08-06 14:00:00+00','2026-08-01 14:00:00',false,'2026-08-08 14:00:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Ebeltoft-Mols Mæglerne','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 14:07:00+00','2026-08-06 14:07:00+00','2026-08-01 14:07:00',false,'2026-08-08 14:07:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Tom Pedersen','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 14:23:00+00','2026-08-06 14:23:00+00','2026-08-01 14:23:00',false,'2026-08-08 14:23:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Mæglerfirmaet FUR-SALLING-VESTHIMMERLAND','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 14:26:00+00','2026-08-06 14:26:00+00','2026-08-01 14:26:00',false,'2026-08-08 14:26:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Ejendomsmægler Sofie Find','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 14:27:00+00','2026-08-06 14:27:00+00','2026-08-01 14:27:00',false,'2026-08-08 14:27:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Meng Bolig & Erhverv','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 14:29:00+00','2026-08-06 14:29:00+00','2026-08-01 14:29:00',false,'2026-08-08 14:29:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Löwe Bruun Bornholm','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 14:30:00+00','2026-08-06 14:30:00+00','2026-08-01 14:30:00',false,'2026-08-08 14:30:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Ejendomsmæglerfirmaet Mathias Mendel','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 14:34:00+00','2026-08-06 14:34:00+00','2026-08-01 14:34:00',false,'2026-08-08 14:34:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('LONE LEVIN Ejendom','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 14:36:00+00','2026-08-06 14:36:00+00','2026-08-01 14:36:00',false,'2026-08-08 14:36:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Ejendomsmægler Tanja Mathiesen','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 14:37:00+00','2026-08-06 14:37:00+00','2026-08-01 14:37:00',false,'2026-08-08 14:37:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('LobergBolig ApS','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 14:38:00+00','2026-08-06 14:38:00+00','2026-08-01 14:38:00',false,'2026-08-08 14:38:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Ejenholm Bolig og Erhverv','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 14:38:00+00','2026-08-06 14:38:00+00','2026-08-01 14:38:00',false,'2026-08-08 14:38:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Ekman Bolig Roskilde','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 14:40:00+00','2026-08-06 14:40:00+00','2026-08-01 14:40:00',false,'2026-08-08 14:40:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Linda Riis Ejendoms','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 14:40:00+00','2026-08-06 14:40:00+00','2026-08-01 14:40:00',false,'2026-08-08 14:40:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Ekman Bolig CPH','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 15:28:00+00','2026-08-06 15:28:00+00','2026-08-01 15:28:00',false,'2026-08-08 15:28:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('EP Bolig Agedrup','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 15:30:00+00','2026-08-06 15:30:00+00','2026-08-01 15:30:00',false,'2026-08-08 15:30:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('EP Bolig Kerteminde','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 15:31:00+00','2026-08-06 15:31:00+00','2026-08-01 15:31:00',false,'2026-08-08 15:31:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Forland & Kruse Boligkøberrådgivning','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 15:32:00+00','2026-08-06 15:32:00+00','2026-08-01 15:32:00',false,'2026-08-08 15:32:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Fredericia Mægleren','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 15:36:00+00','2026-08-06 15:36:00+00','2026-08-01 15:36:00',false,'2026-08-08 15:36:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('gitte_gronlund_ejendomsmaegler','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 15:40:00+00','2026-08-06 15:40:00+00','2026-08-01 15:40:00',false,'2026-08-08 15:40:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Grønne Silkeborgs Mæglere','ejendomsmaegler',NULL,'cb@clausgroenne.dk',NULL,'responded','Svaret – sendt mail til Christian om Forma
[4. aug 18:10] 📩 Svarede: Tester','2026-07-30 15:41:00+00','2026-08-06 15:41:00+00','2026-08-01 15:41:00',true,'2026-08-06 16:26:55.150996',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 16:10:47.05491+00'),
            ('Hedegaard Madsen','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 15:45:00+00','2026-08-06 15:45:00+00','2026-08-01 15:45:00',false,'2026-08-08 15:45:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Helle Gade','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 15:46:00+00','2026-08-06 15:46:00+00','2026-08-01 15:46:00',false,'2026-08-08 15:46:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('LangelandsMægleren','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 15:47:00+00','2026-08-06 15:47:00+00','2026-08-01 15:47:00',false,'2026-08-08 15:47:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('HENRIK','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 15:48:00+00','2026-08-06 15:48:00+00','2026-08-01 15:48:00',false,'2026-08-08 15:48:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Landbrugsmæglerne','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 15:48:00+00','2026-08-06 15:48:00+00','2026-08-01 15:48:00',false,'2026-08-08 15:48:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('KEC Bolig','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 16:05:00+00','2026-08-06 16:05:00+00','2026-08-01 16:05:00',false,'2026-08-08 16:05:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('John Ole Hansen','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 16:06:00+00','2026-08-06 16:06:00+00','2026-08-01 16:06:00',false,'2026-08-08 16:06:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('KCO Bolig','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 16:06:00+00','2026-08-06 16:06:00+00','2026-08-01 16:06:00',false,'2026-08-08 16:06:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('EjendomsmæglerKompagniet EMK','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 17:42:00+00','2026-08-06 17:42:00+00','2026-08-01 17:42:00',false,'2026-08-08 17:42:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Alecsander Delfs','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 17:44:00+00','2026-08-06 17:44:00+00','2026-08-01 17:44:00',false,'2026-08-08 17:44:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Mæglerfirmaet Henrik Ejby','ejendomsmaegler',NULL,NULL,NULL,'contacted','Autosvar – ingen mail endnu','2026-07-30 19:27:00+00','2026-08-06 19:27:00+00','2026-08-01 19:27:00',false,'2026-08-08 19:27:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('BoligOne Stine Kronvold','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 21:00:00+00','2026-08-06 21:00:00+00','2026-08-01 21:00:00',false,'2026-08-08 21:00:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Brædstrup, Tørring & Jelling','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-31 12:50:00+00','2026-08-07 12:50:00+00','2026-08-02 12:50:00',false,'2026-08-09 12:50:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Nybolig Galten-Skovby-Harlev','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-31 12:50:00+00','2026-08-07 12:50:00+00','2026-08-02 12:50:00',false,'2026-08-09 12:50:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Nybolig Herning','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-31 12:55:00+00','2026-08-07 12:55:00+00','2026-08-02 12:55:00',false,'2026-08-09 12:55:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Nybolig Ikast','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-31 12:57:00+00','2026-08-07 12:57:00+00','2026-08-02 12:57:00',false,'2026-08-09 12:57:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Nybolig Kjellerup','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-31 12:57:00+00','2026-08-07 12:57:00+00','2026-08-02 12:57:00',false,'2026-08-09 12:57:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Nybolig Svendborg','ejendomsmaegler',NULL,NULL,NULL,'contacted','Autosvar – ingen mail','2026-07-31 12:59:00+00','2026-08-07 12:59:00+00','2026-08-02 12:59:00',false,'2026-08-09 12:59:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Nybolig Odense','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-31 13:00:00+00','2026-08-07 13:00:00+00','2026-08-02 13:00:00',false,'2026-08-09 13:00:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Nybolig v. Jan Milvertz','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-31 13:00:00+00','2026-08-07 13:00:00+00','2026-08-02 13:00:00',false,'2026-08-09 13:00:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('de Klauman','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-31 13:01:00+00','2026-08-07 13:01:00+00','2026-08-02 13:01:00',false,'2026-08-09 13:01:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Nybolig Skjern & Tarm','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-31 13:07:00+00','2026-08-07 13:07:00+00','2026-08-02 13:07:00',false,'2026-08-09 13:07:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('danbolig Vordingborg','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-31 13:11:00+00','2026-08-07 13:11:00+00','2026-08-02 13:11:00',false,'2026-08-09 13:11:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Nybolig Fjord & Skov Vejen','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-31 13:12:00+00','2026-08-07 13:12:00+00','2026-08-02 13:12:00',false,'2026-08-09 13:12:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Ejendomsmæglerfirmaet Mogens Hansen','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-31 13:13:00+00','2026-08-07 13:13:00+00','2026-08-02 13:13:00',false,'2026-08-09 13:13:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Nybolig Holte-Vedbæk-Skodsborg-Nærum','ejendomsmaegler',NULL,NULL,NULL,'contacted','Autosvar – ingen mail','2026-07-31 13:14:00+00','2026-08-07 13:14:00+00','2026-08-02 13:14:00',false,'2026-08-09 13:14:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Jesper Mandrup','ejendomsmaegler',NULL,NULL,NULL,'no','Svaret på Insta – takkede pænt nej tak','2026-07-31 13:15:00+00','2026-08-07 13:15:00+00','2026-08-02 13:15:00',false,'2026-08-09 13:15:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Alexander Holm Hvidovre','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-31 13:20:00+00','2026-08-07 13:20:00+00','2026-08-02 13:20:00',false,'2026-08-09 13:20:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Færch Bolig','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-31 13:21:00+00','2026-08-07 13:21:00+00','2026-08-02 13:21:00',false,'2026-08-09 13:21:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Thobo-Carlsen & Partnere','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-31 13:23:00+00','2026-08-07 13:23:00+00','2026-08-02 13:23:00',false,'2026-08-09 13:23:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Nybolig Hillerød','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-31 13:27:00+00','2026-08-07 13:27:00+00','2026-08-02 13:27:00',false,'2026-08-09 13:27:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('ejendrøm Vejen','ejendomsmaegler',NULL,NULL,NULL,'contacted','Autosvar – ingen mail','2026-07-31 13:28:00+00','2026-08-07 13:28:00+00','2026-08-02 13:28:00',false,'2026-08-09 13:28:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('ejendrøm Blåvand','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-31 13:29:00+00','2026-08-07 13:29:00+00','2026-08-02 13:29:00',false,'2026-08-09 13:29:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Ejendrøm Bramming','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-31 13:30:00+00','2026-08-07 13:30:00+00','2026-08-02 13:30:00',false,'2026-08-09 13:30:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Nybolig Aarhus C Bruuns Bro','ejendomsmaegler',NULL,NULL,NULL,'contacted','Autosvar – ingen mail','2026-07-31 13:30:00+00','2026-08-07 13:30:00+00','2026-08-02 13:30:00',false,'2026-08-09 13:30:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Ejendrøm Esbjerg','ejendomsmaegler',NULL,NULL,NULL,'contacted','Autosvar – ingen mail','2026-07-31 13:37:00+00','2026-08-07 13:37:00+00','2026-08-02 13:37:00',false,'2026-08-09 13:37:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Nybolig Silkeborg v. Jesper Lyngsø','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-31 13:31:00+00','2026-08-07 13:31:00+00','2026-08-02 13:31:00',false,'2026-08-09 13:31:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Nybolig Esbjerg','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-31 13:31:00+00','2026-08-07 13:31:00+00','2026-08-02 13:31:00',false,'2026-08-09 13:31:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Nybolig Haslev','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-31 13:31:00+00','2026-08-07 13:31:00+00','2026-08-02 13:31:00',false,'2026-08-09 13:31:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('ejendrøm Varde','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-31 13:31:00+00','2026-08-07 13:31:00+00','2026-08-02 13:31:00',false,'2026-08-09 13:31:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Nybolig Slagelse','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-31 13:45:00+00','2026-08-07 13:45:00+00','2026-08-02 13:45:00',false,'2026-08-09 13:45:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Nybolig Thisted','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-31 13:49:00+00','2026-08-07 13:49:00+00','2026-08-02 13:49:00',false,'2026-08-09 13:49:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Nybolig Amager','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-07-31 13:51:00+00','2026-08-07 13:51:00+00','2026-08-02 13:51:00',false,'2026-08-09 13:51:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('EDC Poul Erik Bech Amagerbro','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-08-03 10:30:00+00','2026-08-10 10:30:00+00','2026-08-05 10:30:00',false,'2026-08-12 10:30:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('EDC Poul Erik Bech Aarhus C','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-08-03 10:30:00+00','2026-08-10 10:30:00+00','2026-08-05 10:30:00',false,'2026-08-12 10:30:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('EDC Poul Erik Bech Frederiksberg','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-08-03 10:30:00+00','2026-08-10 10:30:00+00','2026-08-05 10:30:00',false,'2026-08-12 10:30:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('EDC Poul Erik Bech Jyllinge','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-08-03 10:30:00+00','2026-08-10 10:30:00+00','2026-08-05 10:30:00',false,'2026-08-12 10:30:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('EDC PEB Nørrebro/Nordvest','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-08-03 10:39:00+00','2026-08-10 10:39:00+00','2026-08-05 10:39:00',false,'2026-08-12 10:39:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('EDC Poul Erik Bech Risskov','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-08-03 10:39:00+00','2026-08-10 10:39:00+00','2026-08-05 10:39:00',false,'2026-08-12 10:39:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('EDC Poul Erik Bech Rødovre','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-08-03 10:39:00+00','2026-08-10 10:39:00+00','2026-08-05 10:39:00',false,'2026-08-12 10:39:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('EDC BornholmerBo','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-08-03 10:39:00+00','2026-08-10 10:39:00+00','2026-08-05 10:39:00',false,'2026-08-12 10:39:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('EDC Poul Erik Bech Silkeborg','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-08-03 10:39:00+00','2026-08-10 10:39:00+00','2026-08-05 10:39:00',false,'2026-08-12 10:39:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('EDC Poul Erik Bech Vordingborg','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-08-03 10:39:00+00','2026-08-10 10:39:00+00','2026-08-05 10:39:00',false,'2026-08-12 10:39:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Estate Frederiksberg C','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-08-03 10:39:00+00','2026-08-10 10:39:00+00','2026-08-05 10:39:00',false,'2026-08-12 10:39:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Estate Hillerød','ejendomsmaegler',NULL,NULL,NULL,'contacted','Autosvar – ingen mail','2026-08-03 10:39:00+00','2026-08-10 10:39:00+00','2026-08-05 10:39:00',false,'2026-08-12 10:39:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Estate Hellerup Charlottenlund Klampenborg','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-08-03 10:39:00+00','2026-08-10 10:39:00+00','2026-08-05 10:39:00',false,'2026-08-12 10:39:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('danboligGive','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-08-03 10:39:00+00','2026-08-10 10:39:00+00','2026-08-05 10:39:00',false,'2026-08-12 10:39:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('danbolig Søborg og Bagsværd','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-08-03 10:39:00+00','2026-08-10 10:39:00+00','2026-08-05 10:39:00',false,'2026-08-12 10:39:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('danbolig Herning','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-08-03 11:11:00+00','2026-08-10 11:11:00+00','2026-08-05 11:11:00',false,'2026-08-12 11:11:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('danbolig Esbjerg','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-08-03 11:11:00+00','2026-08-10 11:11:00+00','2026-08-05 11:11:00',false,'2026-08-12 11:11:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('danbolig Viborg','ejendomsmaegler',NULL,NULL,NULL,'contacted','Autosvar – ingen mail','2026-08-03 11:11:00+00','2026-08-10 11:11:00+00','2026-08-05 11:11:00',false,'2026-08-12 11:11:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('danbolig Odense C & Kerteminde','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-08-03 11:11:00+00','2026-08-10 11:11:00+00','2026-08-05 11:11:00',false,'2026-08-12 11:11:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('danbolig Stenløse','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-08-03 11:16:00+00','2026-08-10 11:16:00+00','2026-08-05 11:16:00',false,'2026-08-12 11:16:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('danbolig Frederiksværk','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-08-03 11:16:00+00','2026-08-10 11:16:00+00','2026-08-05 11:16:00',false,'2026-08-12 11:16:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Lintrup & Norgart A/S','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-08-03 11:16:00+00','2026-08-10 11:16:00+00','2026-08-05 11:16:00',false,'2026-08-12 11:16:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('danbolig Korsør/Skælskør','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-08-03 11:25:00+00','2026-08-10 11:25:00+00','2026-08-05 11:25:00',false,'2026-08-12 11:25:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('danbolig Vanløse','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-08-03 11:25:00+00','2026-08-10 11:25:00+00','2026-08-05 11:25:00',false,'2026-08-12 11:25:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Askholm.com','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-08-03 11:57:00+00','2026-08-10 11:57:00+00','2026-08-05 11:57:00',false,'2026-08-12 11:57:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Estate Gentofte','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-08-03 12:05:00+00','2026-08-10 12:05:00+00','2026-08-05 12:05:00',false,'2026-08-12 12:05:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Estate Aalborg','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-08-03 12:05:00+00','2026-08-10 12:05:00+00','2026-08-05 12:05:00',false,'2026-08-12 12:05:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Estate Roskilde & Hornsherred','ejendomsmaegler',NULL,NULL,NULL,'contacted','Autosvar – ingen mail','2026-08-03 12:05:00+00','2026-08-10 12:05:00+00','2026-08-05 12:05:00',false,'2026-08-12 12:05:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Estate Horsens Michael Jessen','ejendomsmaegler',NULL,NULL,NULL,'no','Svaret på Insta – takkede pænt nej tak','2026-08-03 12:05:00+00','2026-08-10 12:05:00+00','2026-08-05 12:05:00',false,'2026-08-12 12:05:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Estate Randers','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-08-03 12:05:00+00','2026-08-10 12:05:00+00','2026-08-05 12:05:00',false,'2026-08-12 12:05:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Estate Kjeld Faaborg Gråsten','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-08-03 12:05:00+00','2026-08-10 12:05:00+00','2026-08-05 12:05:00',false,'2026-08-12 12:05:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Estate Køge','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-08-03 12:05:00+00','2026-08-10 12:05:00+00','2026-08-05 12:05:00',false,'2026-08-12 12:05:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Estate Kalundborg','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-08-03 12:19:00+00','2026-08-10 12:19:00+00','2026-08-05 12:19:00',false,'2026-08-12 12:19:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('&Living Charlottenlund Hellerup','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-08-03 12:19:00+00','2026-08-10 12:19:00+00','2026-08-05 12:19:00',false,'2026-08-12 12:19:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('&LIVING AARHUS ØSTJYLLAND','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-08-03 12:19:00+00','2026-08-10 12:19:00+00','2026-08-05 12:19:00',false,'2026-08-12 12:19:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('&Living Østerbro København','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-08-03 12:19:00+00','2026-08-10 12:19:00+00','2026-08-05 12:19:00',false,'2026-08-12 12:19:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Ejendomsmægler Frederiksberg &LIVING','ejendomsmaegler',NULL,NULL,NULL,'contacted',NULL,'2026-08-03 12:19:00+00','2026-08-10 12:19:00+00','2026-08-05 12:19:00',false,'2026-08-12 12:19:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('ak83 Arkitekter','arkitekt',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 18:16:00+00','2026-08-06 18:16:00+00','2026-08-01 18:16:00',false,'2026-08-08 18:16:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('AART ARCHITECTS','arkitekt',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 18:16:00+00','2026-08-06 18:16:00+00','2026-08-01 18:16:00',false,'2026-08-08 18:16:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('os_arkitekter','arkitekt',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 18:17:00+00','2026-08-06 18:17:00+00','2026-08-01 18:17:00',false,'2026-08-08 18:17:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Pålsson Arkitekter','arkitekt',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 18:29:00+00','2026-08-06 18:29:00+00','2026-08-01 18:29:00',false,'2026-08-08 18:29:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('TegnestuenFEM','arkitekt',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 18:29:00+00','2026-08-06 18:29:00+00','2026-08-01 18:29:00',false,'2026-08-08 18:29:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Rønnow Arkitekter','arkitekt',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 18:30:00+00','2026-08-06 18:30:00+00','2026-08-01 18:30:00',false,'2026-08-08 18:30:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Samuel Architects','arkitekt',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 18:30:00+00','2026-08-06 18:30:00+00','2026-08-01 18:30:00',false,'2026-08-08 18:30:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('2r Arkitekter','arkitekt',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 18:32:00+00','2026-08-06 18:32:00+00','2026-08-01 18:32:00',false,'2026-08-08 18:32:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('A1 Tegnestue','arkitekt',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 18:32:00+00','2026-08-06 18:32:00+00','2026-08-01 18:32:00',false,'2026-08-08 18:32:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('ag5','arkitekt',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 18:35:00+00','2026-08-06 18:35:00+00','2026-08-01 18:35:00',false,'2026-08-08 18:35:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Arkitektfirma Hune & Elkjær','arkitekt',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 18:37:00+00','2026-08-06 18:37:00+00','2026-08-01 18:37:00',false,'2026-08-08 18:37:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('ardess_','arkitekt',NULL,NULL,NULL,'contacted','Sendt over story','2026-07-30 18:37:00+00','2026-08-06 18:37:00+00','2026-08-01 18:37:00',false,'2026-08-08 18:37:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Alex Poulsen Arkitekter A/S','arkitekt',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 18:37:00+00','2026-08-06 18:37:00+00','2026-08-01 18:37:00',false,'2026-08-08 18:37:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('BBP Arkitekter','arkitekt',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 18:39:00+00','2026-08-06 18:39:00+00','2026-08-01 18:39:00',false,'2026-08-08 18:39:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Kjaer & Richter','arkitekt',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 18:41:00+00','2026-08-06 18:41:00+00','2026-08-01 18:41:00',false,'2026-08-08 18:41:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('arkitektfirmaet_vest','arkitekt',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 18:42:00+00','2026-08-06 18:42:00+00','2026-08-01 18:42:00',false,'2026-08-08 18:42:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Berg Arkitekter Nordsjælland','arkitekt',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 18:41:00+00','2026-08-06 18:41:00+00','2026-08-01 18:41:00',false,'2026-08-08 18:41:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('BIOSIS','arkitekt',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 18:41:00+00','2026-08-06 18:41:00+00','2026-08-01 18:41:00',false,'2026-08-08 18:41:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('cco_architects','arkitekt',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 18:42:00+00','2026-08-06 18:42:00+00','2026-08-01 18:42:00',false,'2026-08-08 18:42:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Bjerg Arkitektur','arkitekt',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 18:43:00+00','2026-08-06 18:43:00+00','2026-08-01 18:43:00',false,'2026-08-08 18:43:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Birch & Rasmussen','arkitekt',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 18:43:00+00','2026-08-06 18:43:00+00','2026-08-01 18:43:00',false,'2026-08-08 18:43:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('BRIXVAL','arkitekt',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 18:43:00+00','2026-08-06 18:43:00+00','2026-08-01 18:43:00',false,'2026-08-08 18:43:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Cornelius Vöge','arkitekt',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 18:44:00+00','2026-08-06 18:44:00+00','2026-08-01 18:44:00',false,'2026-08-08 18:44:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Pia Dyrendahl Staven','arkitekt',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 18:46:00+00','2026-08-06 18:46:00+00','2026-08-01 18:46:00',false,'2026-08-08 18:46:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('creo Arkitekter A/S','arkitekt',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 18:47:00+00','2026-08-06 18:47:00+00','2026-08-01 18:47:00',false,'2026-08-08 18:47:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Fogh & Følner Arkitekter','arkitekt',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 18:49:00+00','2026-08-06 18:49:00+00','2026-08-01 18:49:00',false,'2026-08-08 18:49:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Gottlieb Paludan Architects','arkitekt',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 18:49:00+00','2026-08-06 18:49:00+00','2026-08-01 18:49:00',false,'2026-08-08 18:49:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Juul Frost Arkitekter','arkitekt',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 18:50:00+00','2026-08-06 18:50:00+00','2026-08-01 18:50:00',false,'2026-08-08 18:50:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('KRADS','arkitekt',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 18:50:00+00','2026-08-06 18:50:00+00','2026-08-01 18:50:00',false,'2026-08-08 18:50:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Danielsen Spaceplanning','arkitekt',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 18:51:00+00','2026-08-06 18:51:00+00','2026-08-01 18:51:00',false,'2026-08-08 18:51:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('N+P ARKITEKTUR','arkitekt',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 18:52:00+00','2026-08-06 18:52:00+00','2026-08-01 18:52:00',false,'2026-08-08 18:52:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Sjæl Arkitekter ApS','arkitekt',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 18:50:00+00','2026-08-06 18:50:00+00','2026-08-01 18:50:00',false,'2026-08-08 18:50:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Monitz Architecture Studio','arkitekt',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 18:55:00+00','2026-08-06 18:55:00+00','2026-08-01 18:55:00',false,'2026-08-08 18:55:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Novaform','arkitekt',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 18:55:00+00','2026-08-06 18:55:00+00','2026-08-01 18:55:00',false,'2026-08-08 18:55:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Nøhr & Sigsgaard','arkitekt',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 18:55:00+00','2026-08-06 18:55:00+00','2026-08-01 18:55:00',false,'2026-08-08 18:55:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('ESJA Architecture','arkitekt',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 19:00:00+00','2026-08-06 19:00:00+00','2026-08-01 19:00:00',false,'2026-08-08 19:00:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Nydan-Huse','byggefirma',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 17:58:00+00','2026-08-06 17:58:00+00','2026-08-01 17:58:00',false,'2026-08-08 17:58:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Stensbo Huse ApS','byggefirma',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 18:00:00+00','2026-08-06 18:00:00+00','2026-08-01 18:00:00',false,'2026-08-08 18:00:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Trelleborg','byggefirma',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 18:02:00+00','2026-08-06 18:02:00+00','2026-08-01 18:02:00',false,'2026-08-08 18:02:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('HC Tømrer','toemrerfirma',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 18:03:00+00','2026-08-06 18:03:00+00','2026-08-01 18:03:00',false,'2026-08-08 18:03:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Siesing Totalbyg','byggefirma',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 18:05:00+00','2026-08-06 18:05:00+00','2026-08-01 18:05:00',false,'2026-08-08 18:05:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('3T Totalbyggeri ApS','byggefirma',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 18:05:00+00','2026-08-06 18:05:00+00','2026-08-01 18:05:00',false,'2026-08-08 18:05:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Tømrerfirmaet O.G','toemrerfirma',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 18:15:00+00','2026-08-06 18:15:00+00','2026-08-01 18:15:00',false,'2026-08-08 18:15:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Tømrerfirmaet Andreas Madsen','toemrerfirma',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 18:17:00+00','2026-08-06 18:17:00+00','2026-08-01 18:17:00',false,'2026-08-08 18:17:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Tømrerfirmaet Lindinger ApS','toemrerfirma',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 18:20:00+00','2026-08-06 18:20:00+00','2026-08-01 18:20:00',false,'2026-08-08 18:20:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Tømrerfirmaet S.M Bang ApS','toemrerfirma',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 18:20:00+00','2026-08-06 18:20:00+00','2026-08-01 18:20:00',false,'2026-08-08 18:20:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Tømrerfirmaet MDM ApS','toemrerfirma',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 18:21:00+00','2026-08-06 18:21:00+00','2026-08-01 18:21:00',false,'2026-08-08 18:21:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Lezibo Tømrer & Snedker ApS','toemrerfirma',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 19:30:00+00','2026-08-06 19:30:00+00','2026-08-01 19:30:00',false,'2026-08-08 19:30:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Damgaard Byg v. Mads Carøe','byggefirma',NULL,NULL,NULL,'contacted',NULL,'2026-07-30 19:32:00+00','2026-08-06 19:32:00+00','2026-08-01 19:32:00',false,'2026-08-08 19:32:00',false,NULL,'2026-08-04 13:48:58.213503+00','2026-08-04 13:48:58.213503+00'),
            ('Jørgen','ejendomsmaegler',NULL,'Jl@imaegler.dk',NULL,'responded','[4. aug 17:44] 📣 Meta annonce','2026-08-04 15:39:00+00','2026-08-11 15:39:00+00','2026-08-07 12:00:00',false,'2026-08-14 12:00:00',false,NULL,'2026-08-04 15:44:06.2541+00','2026-08-04 15:44:38.385921+00'),
            ('Nicolai, hyllen & Co','ejendomsmaegler',NULL,'nhm@hyllenogco.dk',NULL,'responded','[4. aug 18:35] 💬 Instagram DM','2026-08-04 16:35:00+00','2026-08-11 16:35:00+00','2026-08-06 16:39:29.323262',false,'2026-08-13 16:39:29.323262',false,NULL,'2026-08-04 16:35:55.776152+00','2026-08-04 16:35:55.776152+00'),
            ('Sofie Grip','ejendomsmaegler',NULL,'sofiegrip@hotmail.com',NULL,'responded','[5. aug 09:28] 💬 Instagram DM','2026-08-05 07:28:00+00','2026-08-12 07:28:00+00','2026-08-07 07:28:00',false,'2026-08-14 07:28:00',false,NULL,'2026-08-05 07:28:48.092623+00','2026-08-05 07:28:48.092623+00')
        ) AS t(name,category,instagram_handle,email,phone,status,notes,first_contact_at,follow_up_at,follow_up_1_at,follow_up_1_done,follow_up_2_at,follow_up_2_done,last_contacted_at,created_at,updated_at)
        WHERE NOT EXISTS (SELECT 1 FROM leads LIMIT 1)`,
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
