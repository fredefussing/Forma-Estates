// Additive, idempotent schema guard — runs at every server boot (dev, Replit
// and Render). Creates the newer tables/columns if they are missing so the
// Render-hosted live database stays in sync without manual SQL. NEVER drops
// or alters existing data; every statement is IF NOT EXISTS.
import { pool } from "./db";

export async function ensureSchema(): Promise<void> {
  const statements: Array<{ step: string; sql: string }> = [
    {
      step: "users.marketing_opt_out",
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_opt_out boolean NOT NULL DEFAULT false`,
    },
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
