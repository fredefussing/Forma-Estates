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
    {
      step: "users.agency_logo_url",
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS agency_logo_url text`,
    },
    // ── generated_images columns added after initial schema ───────────────────
    {
      step: "generated_images.is_refinement",
      sql: `ALTER TABLE generated_images ADD COLUMN IF NOT EXISTS is_refinement boolean NOT NULL DEFAULT false`,
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
        owner_email text NOT NULL DEFAULT 'fredefussing@gmail.com',
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

  // ── One-time: add owner_email to existing leads table and backfill ──────────
  try {
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS owner_email text DEFAULT 'fredefussing@gmail.com'`);
    await pool.query(`UPDATE leads SET owner_email = 'fredefussing@gmail.com' WHERE owner_email IS NULL`);
  } catch { /* column already exists and fully populated — safe to ignore */ }

  // ── One-time: add telesales phone + deal fields ──────────────────────────────
  try {
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS owner_phone text`);
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS office_phone text`);
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS deal_amount integer`);
  } catch { /* columns already exist */ }
  // callback_at in its own block so it is never silently skipped
  try {
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS callback_at timestamp with time zone`);
  } catch { /* column already exists */ }
  // priority: 1=solo/bedst, 2=small independent, 3=network/medium, 4=chain/worst
  try {
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS priority integer DEFAULT 5`);
  } catch { /* column already exists */ }

  // ── One-time: mark follow-up 1 done for all leads reached 5. aug ──────────
  try {
    await pool.query(`
      DO $f1update$
      BEGIN
        IF EXISTS (SELECT 1 FROM leads WHERE name='Werner Boliger' AND status='contacted' AND follow_up_1_done=false) THEN
          UPDATE leads SET
            follow_up_1_done=true,
            follow_up_2_at='2026-08-12 10:00:00+00',
            notes=COALESCE(notes || chr(10), '') || '[5. aug] ✅ Opfølgning 1 gennemført - 💬 Instagram DM',
            updated_at=NOW()
          WHERE name IN (
            '2r Arkitekter','3T Totalbyggeri ApS','A1 Tegnestue','Aars Mægleren','Alecsander Delfs',
            'Alexander Holm Hvidovre','danbolig Esbjerg','danbolig Frederiksværk','danboligGive',
            'danbolig Herning','danbolig Odense C & Kerteminde','danbolig Søborg og Bagsværd',
            'danbolig Stenløse','danbolig Vanløse','danbolig Viborg','danbolig Vordingborg',
            'EDC BornholmerBo','EDC PEB Nørrebro/Nordvest','EDC Poul Erik Bech Aarhus C',
            'EDC Poul Erik Bech Amagerbro','EDC Poul Erik Bech Frederiksberg',
            'EDC Poul Erik Bech Jyllinge','EDC Poul Erik Bech Risskov','EDC Poul Erik Bech Rødovre',
            'EDC Poul Erik Bech Silkeborg','EDC Poul Erik Bech Vordingborg',
            'Ejendomsmæglerfirmaet Mogens Hansen','EjendomsmæglerKompagniet EMK',
            'Ejendrøm Bramming','Ejendrøm Esbjerg','ejendrøm Varde','ejendrøm Vejen',
            'Estate Frederiksberg C','Estate Hellerup Charlottenlund Klampenborg','Estate Hillerød',
            'Færch Bolig','Fisker & Liljengren','KEC Bolig','Landbrugsmæglerne','LangelandsMægleren',
            'Lintrup & Norgart A/S','LONE LEVIN Ejendom','Löwe Bruun Bornholm',
            'Mæglerfirmaet FUR-SALLING-VESTHIMMERLAND','Meng Bolig & Erhverv',
            'Nybolig Amager','Nybolig Esbjerg','Nybolig Fjord & Skov Vejen','Nybolig Haslev',
            'Nybolig Herning','Nybolig Hillerød','Nybolig Holte-Vedbæk-Skodsborg-Nærum',
            'Nybolig Ikast','Nybolig Silkeborg v. Jesper Lyngsø','Nybolig Skjern & Tarm',
            'Nybolig Slagelse','Nybolig Svendborg','Nybolig Thisted','Nybolig v. Jan Milvertz',
            'Nydan-Huse','Peter Due Bolig','Peter Hoe Ejendomme','Siesing Totalbyg',
            'Signature Homes ApS','Stensbo Huse ApS','Storm & Dubourg I/S','TegnestuenFEM',
            'Thobo-Carlsen & Partnere','Thomas Risager A/S','Thoustrup & Præstegaard','Tom Pedersen',
            'Tømrerfirmaet Andreas Madsen','Tømrerfirmaet Lindinger ApS','Tømrerfirmaet MDM ApS',
            'Tømrerfirmaet O.G','Tømrerfirmaet S.M Bang ApS','Trelleborg',
            'Vejlemægleren','Winther Ejendomme','Wullf & Partnere'
          ) AND follow_up_1_done=false;

          UPDATE leads SET
            status='responded', follow_up_1_done=true,
            follow_up_2_at='2026-08-12 10:00:00+00',
            notes=COALESCE(notes || chr(10), '') || '[5. aug] ✅ Opfølgning 1 gennemført - 💬 Instagram DM - Aftale! 🙌',
            updated_at=NOW()
          WHERE name='Werner Boliger' AND follow_up_1_done=false;

          UPDATE leads SET
            status='no',
            notes=COALESCE(notes || chr(10), '') || '[5. aug] ❌ Takket nej',
            updated_at=NOW()
          WHERE name IN ('BoligOne Stine Kronvold','Nybolig Aarhus C Bruuns Bro','Linda Riis Ejendoms');
        END IF;
      END $f1update$
    `);
  } catch(e: any) { console.error('[ensure-schema] f1update:', e.message); }
  // ── end one-time f1 update ─────────────────────────────────────────────────

  // ── One-time: mark f1 done for leads contacted 30-31 jul with overdue FU1 ──
  // Uses date range so it works regardless of name encoding or missing IDs.
  try {
    await pool.query(`
      UPDATE leads SET
        follow_up_1_done=true,
        follow_up_2_at='2026-08-12 10:00:00+00',
        notes=COALESCE(notes || chr(10), '') || '[5. aug] ✅ Opfølgning 1 gennemført - 💬 Instagram DM',
        updated_at=NOW()
      WHERE follow_up_1_done=false
        AND follow_up_1_at IS NOT NULL
        AND follow_up_1_at < '2026-08-04 00:00:00+00'
        AND first_contact_at >= '2026-07-30 00:00:00+00'
        AND first_contact_at < '2026-08-01 00:00:00+00'
        AND status NOT IN ('no','won')
    `);
  } catch(e: any) { console.error('[ensure-schema] f1ark-daterange:', e.message); }
  // ── end one-time architect f1 update ─────────────────────────────────────

  // ── One-time: insert leads added after the bulk migration ─────────────────
  const missingLeads = [
    { name: 'Nielsen Boliger', category: 'ejendomsmaegler', email: null,
      status: 'responded', notes: '[5. aug 10:22] Instagram DM',
      first_contact_at: '2026-08-05T08:21:00Z', follow_up_at: '2026-08-12T08:21:00Z',
      follow_up_1_at: '2026-08-07T08:21:00Z', follow_up_2_at: '2026-08-14T08:21:00Z',
      created_at: '2026-08-05T08:22:16.938Z', updated_at: '2026-08-05T08:22:16.938Z' },
  ];
  for (const r of missingLeads) {
    try {
      await pool.query(
        `INSERT INTO leads (name,category,email,status,notes,first_contact_at,follow_up_at,
          follow_up_1_at,follow_up_1_done,follow_up_2_at,follow_up_2_done,created_at,updated_at)
         SELECT $1,$2,$3,$4,$5,$6,$7,$8,false,$9,false,$10,$11
         WHERE NOT EXISTS (SELECT 1 FROM leads WHERE name=$1)`,
        [r.name, r.category, r.email, r.status, r.notes,
         r.first_contact_at, r.follow_up_at, r.follow_up_1_at, r.follow_up_2_at,
         r.created_at, r.updated_at]
      );
    } catch(e: any) { console.error(`[ensure-schema] seed lead ${r.name}: ${e.message}`); }
  }
  // ─────────────────────────────────────────────────────────────────────────

  // ── One-time: add/update 4 warm telesales leads (aug 2026) ──────────────────
  const warmLeads: Array<{ name: string; email: string; phone: string; officePhone?: string; namePattern: string }> = [
    { name: 'Mæglerfirmaet Henrik Ejby',      email: 'henrik@henrikejby.dk',   phone: '20 83 63 28', officePhone: '71 99 47 60', namePattern: '%ejby%' },
    { name: 'iMægler',                         email: 'jl@imaegler.dk',          phone: '28 25 98 89', officePhone: '52 88 88 52', namePattern: '%imægler%' },
    { name: 'Min Bolighandel Lolland-Falster', email: 'aida@minbolighandel.dk',  phone: '29 13 16 52', namePattern: '%lolland%' },
    { name: 'RobinHus',                        email: 'nmi@robinhus.dk',         phone: '53 80 22 99', namePattern: '%robinhus%' },
  ];
  for (const l of warmLeads) {
    try {
      // Match by email, name pattern, OR existing phone (prevents duplicate when contact exists under a different name)
      const upd = await pool.query(
        `UPDATE leads SET owner_phone=$1, office_phone=COALESCE($2, office_phone), email=COALESCE(email,$3), status='responded'
         WHERE owner_email='fredefussing@gmail.com'
           AND (lower(email)=lower($3) OR lower(name) LIKE $4 OR owner_phone=$1)`,
        [l.phone, l.officePhone ?? null, l.email, l.namePattern]
      );
      if ((upd.rowCount ?? 0) === 0) {
        // Only insert if no lead with the same phone or name pattern exists
        await pool.query(
          `INSERT INTO leads (name, email, category, status, owner_phone, office_phone, owner_email)
           SELECT $1,$2,'ejendomsmaegler','responded',$3,$4,'fredefussing@gmail.com'
           WHERE NOT EXISTS (
             SELECT 1 FROM leads
             WHERE owner_email='fredefussing@gmail.com'
               AND (lower(name) LIKE $5 OR owner_phone=$3)
           )`,
          [l.name, l.email, l.phone, l.officePhone ?? null, l.namePattern]
        );
      }
    } catch(e: any) { console.error(`[ensure-schema] warm lead ${l.name}: ${e.message}`); }
  }
  // ─────────────────────────────────────────────────────────────────────────

  // ── One-time: fix wrong phone numbers in telesales leads (11. aug 2026) ───
  // Guard: Andersen & Godrim still has the old (swapped) owner_phone
  try {
    const guard = await pool.query(
      `SELECT 1 FROM leads WHERE owner_email='fredefussing@gmail.com' AND name='Andersen & Godrim' AND owner_phone='30 50 30 29'`
    );
    if ((guard.rowCount ?? 0) > 0) {
      // Andersen & Godrim: indehaver Holger Andersen is owner, Henrik Godrim is partner, correct office
      await pool.query(`UPDATE leads SET owner_phone='51 41 91 01', office_phone='40 14 01 01',
        notes=COALESCE(notes||chr(10),'') || '[11. aug] Indehaver Holger Andersen: 51 41 91 01 · Partner Henrik Godrim: 30 50 30 29 · Kontor: 40 14 01 01'
        WHERE owner_email='fredefussing@gmail.com' AND name='Andersen & Godrim'`);

      // Nielsen Boliger: rename if still called Mads Werner Bolig, fix phone
      await pool.query(`UPDATE leads SET name='Nielsen Boliger', email=null, owner_phone=null, office_phone='41 30 20 60',
        notes=COALESCE(notes||chr(10),'') || '[11. aug] Kontor/virksomhedsnummer: 41 30 20 60. Indehaver: Cecilie Nielsen.'
        WHERE owner_email='fredefussing@gmail.com'
          AND (name='Mads Werner Bolig' OR (lower(name) LIKE '%nielsen%bolig%' AND owner_phone='71 74 17 00'))`);

      // Nybolig Thisted: indehaver Søren Giessing, old number didn't exist
      await pool.query(`UPDATE leads SET owner_phone='40 32 48 31',
        notes=COALESCE(notes||chr(10),'') || '[11. aug] Indehaver Søren Giessing: 40 32 48 31 · Medindehaver Mikael Bach Henriksen: 21 23 82 02 · Kontor: 97 92 22 88'
        WHERE owner_email='fredefussing@gmail.com' AND lower(name) LIKE '%nybolig thisted%'`);

      // RobinHus: Maiken Kierkegaard, not Nathalie Middelboe
      await pool.query(`UPDATE leads SET owner_phone='53 80 22 99',
        notes=COALESCE(notes||chr(10),'') || '[11. aug] Maiken Kierkegaard (ejendomsmægler MDE): 53 80 22 99 · Nathalie Middelboe: 51 19 67 77'
        WHERE owner_email='fredefussing@gmail.com' AND lower(name) LIKE '%robinhus%'`);

      // eurodan-huse: Christina is marketing contact, real switchboard as office
      await pool.query(`UPDATE leads SET owner_phone='79 23 66 05', office_phone='70 23 73 88',
        notes=COALESCE(notes||chr(10),'') || '[11. aug] Christina Dalsbæk Falk Sørensen (marketing): 79 23 66 05 · Adm. dir. Thomas Dahl: 79 23 66 66 · Hovednummer: 70 23 73 88'
        WHERE owner_email='fredefussing@gmail.com' AND lower(name) LIKE '%eurodan%'`);

      // HENRIK: delete duplicate of Mæglerfirmaet Henrik Ejby
      await pool.query(`DELETE FROM leads WHERE owner_email='fredefussing@gmail.com' AND name='HENRIK' AND owner_phone IS NULL`);

      console.log('[ensure-schema] phone-fix: 6 telesales corrections applied');
    }
  } catch(e: any) { console.error('[ensure-schema] phone-fix:', e.message); }
  // ─────────────────────────────────────────────────────────────────────────

  // ── One-time: add phones to 2 warm leads missing owner_phone (aug 2026) ──
  // Guard: Werner Boliger still has no owner_phone
  try {
    const gWarm = await pool.query(
      `SELECT 1 FROM leads WHERE owner_email='fredefussing@gmail.com' AND lower(name) LIKE '%werner boliger%' AND owner_phone IS NULL`
    );
    if ((gWarm.rowCount ?? 0) > 0) {
      const oe = 'fredefussing@gmail.com';
      // Werner Boliger: Mads Werner, indehaver
      await pool.query(
        `UPDATE leads SET owner_phone='71 74 17 00',
           notes=COALESCE(notes||chr(10),'')||'[11. aug] Mads Werner, indehaver og ejendomsmægler MDE: 71 74 17 00'
         WHERE owner_email=$1 AND lower(name) LIKE '%werner boliger%' AND owner_phone IS NULL`,
        [oe]
      );
      // Grønne Silkeborgs Mæglere: two indehavere + stifter Claus Grønne
      await pool.query(
        `UPDATE leads SET owner_phone='24 91 64 44',
           notes=COALESCE(notes||chr(10),'')||'[11. aug] Christoffer Andersen, indehaver: 24 91 64 44 · Christian Bundgaard, medindehaver: 30 66 63 44 · Claus Grønne, stifter: 40 59 64 44'
         WHERE owner_email=$1 AND lower(name) LIKE '%silkeborg%' AND owner_phone IS NULL`,
        [oe]
      );
      console.log('[ensure-schema] warm-phone-fix: Werner Boliger + Grønne Silkeborgs Mæglere phones added');
    }
  } catch(e: any) { console.error('[ensure-schema] warm-phone-fix:', e.message); }
  // ─────────────────────────────────────────────────────────────────────────

  // ── Deep-clean: add phones to all old null-phone leads + fix wrong Silkeborg phones ──
  // Fully idempotent: UPDATEs only WHERE owner_phone IS NULL (or WHERE phone='wrong-value').
  try {
    const oe = 'fredefussing@gmail.com';
    // Leads that existed with NULL owner_phone, blocking their telesales insert.
    // Pattern: LIKE match with leading/trailing % added automatically unless % already present.
    const nullPhoneFixes: Array<{ match: string; phone: string; officePhone?: string; note: string }> = [
      // ── 15 leads from 100-batch that blocked inserts via name-duplicate ──
      { match:'peter hoe ejendomme',         phone:'70 22 75 00', note:'Peter Hoe, indehaver. Specialejendomme og liebhaver.' },
      { match:'nordbo',                       phone:'24 21 80 07', note:'Carsten Nordbo, indehaver.' },
      { match:'danskebolig',                  phone:'20 65 27 57', officePhone:'56 71 30 40', note:'Nanna Søndergaard, indehaver. Direkte: 20 65 27 57. Kontor (Faxe): 56 71 30 40.' },
      { match:'fur%salling%vesthimmerland',   phone:'26 80 85 27', note:'Sussie Renee Gerd Sørensen, indehaver.' },
      { match:'meng bolig%erhverv',           phone:'52 14 88 00', note:'Jens-Erik Meng, indehaver.' },
      { match:'fredericia mægleren',          phone:'24 81 63 41', note:'Lars-Bo Ottesen, ejer/direktør.' },
      { match:'hedegaard madsen',             phone:'98 96 01 01', note:'Heine Bøgeskov Madsen, ejendomsmægler/medejer. NB: 98 96 01 01 er virksomhedens fællesnummer – bed om Heine.' },
      { match:'langelandsmægleren',           phone:'61 26 67 77', note:'Carsten Sørensen, indehaver.' },
      { match:'landbrugsmæglerne',            phone:'40 57 51 07', officePhone:'86 24 40 00', note:'Christian Schulin-Zeuthen, indehaver. Direkte: 40 57 51 07. Hovednummer: 86 24 40 00.' },
      { match:'kec bolig',                    phone:'23 95 25 03', officePhone:'98 25 53 00', note:'Knud Erik Christiansen, ejendomsmægler (bed om Knud Erik). Direkte: 23 95 25 03. Kontor: 98 25 53 00.' },
      { match:'john ole hansen',              phone:'21 49 38 81', officePhone:'54 85 11 99', note:'Ring til Lasse Øster Dalsgaard (indehaver/valuar): 21 49 38 81. Kontor: 54 85 11 99. NB: John Ole Hansen-materialet er forældet.' },
      { match:'kco bolig',                    phone:'39 61 61 62', note:'Kim Søndergård, ejer. NB: 39 61 61 62 er virksomhedens hovednummer – bed om Kim.' },
      { match:'alecsander delfs',             phone:'31 19 15 15', note:'Alecsander Delfs, ejer/direktør. Liebhaverprofil, stærk Instagram.' },
      { match:'færch bolig',                  phone:'30 89 80 67', note:'Jørgen Færch, indehaver.' },
      { match:'thobo%carlsen%partner',        phone:'66 13 92 00', note:'Lars Bjørk, direktør. Veletableret Odense-mægler – ring og bed om Lars.' },
      // ── Leads from 101-150 batch that already exist with NULL phone ──
      { match:'helle gade',                   phone:'87 10 41 00', note:'Helle Gade Pedersen, direktør. Kontor: 87 10 41 00. NB: 22 41 71 28 er ikke bekræftet – undlad det direkte nummer.' },
      { match:'mogens hansen',                phone:'44 22 33 11', note:'Mogens Hansen, ejer/direktør. Nyere selvstændig forretning på Sydkysten.' },
      { match:'nybolig herning',              phone:'70 25 40 50', note:'Henrik Buur, indehaver.' },
      { match:'nybolig hillerød',             phone:'53 35 76 93', note:'Sofia Hammargren Damgaard, medejer. Aktiv butik med tre indehavere.' },
      { match:'nybolig esbjerg',              phone:'23 80 98 05', note:'Jan L. Madsen, medejer. God volumen og direkte ejertelefon.' },
      { match:'nybolig haslev',               phone:'40 38 85 80', officePhone:'56 31 22 86', note:'Jakob Harder, indehaver: 40 38 85 80. Søren Jagd Lauritsen: 61 20 00 23. Kontor: 56 31 22 86. NB: 56 31 55 00 er forkert.' },
      { match:'nybolig slagelse',             phone:'40 20 80 28', officePhone:'58 53 30 30', note:'Peter Valentin, indehaver: 40 20 80 28. Lars Bryde Nielsen: 24 87 19 09. Kenneth Andersen: 30 73 89 50. Kontor: 58 53 30 30. NB: 58 50 30 30 er forkert.' },
      { match:'nybolig amager',               phone:'31 64 20 00', officePhone:'70 60 27 00', note:'Leutrim Rusiti, indehaver: 31 64 20 00. Caspar Nielsen: 50 46 48 17. Kontor: 70 60 27 00. NB: 32 59 13 00 er forkert.' },
      { match:'nybolig odense',               phone:'26 29 48 84', note:'Bahadir Demirhan, medejer. Flere butikker, lejligheder og projektsalg.' },
      { match:'nybolig svendborg',            phone:'62 26 35 65', note:'Thomas M. Thomsen, ejer/direktør. Flere butikker og betydelig boligproduktion.' },
      { match:'nybolig%jan milvertz',         phone:'55 72 00 72', officePhone:'59 51 48 00', note:'Jan Milvertz, indehaver. Næstved: 55 72 00 72. Kalundborg: 59 51 48 00. Direkte mobil ikke bekræftet.' },
      { match:'nybolig%fjord%skov%vejen',     phone:'21 78 88 66', officePhone:'75 36 20 00', note:'Tina Fjord, medejer: 21 78 88 66. Lars-Rune Skov: 29 45 73 68. Kontor: 75 36 20 00. NB: 75 36 29 66 er forkert.' },
      { match:'edc bornholmerbo',             phone:'56 95 56 83', note:'Dan Dellgren og Kurt Brandt Mortensen, ejerkreds. Kontor: 56 95 56 83. NB: 56 95 02 00 er forkert.' },
      { match:'estate frederiksberg c',       phone:'33 25 23 11', note:'Mads Mygind, indehaver. Kontor: 33 25 23 11.' },
      { match:'estate hillerød',              phone:'44 12 52 00', officePhone:'48 25 19 00', note:'Jakob Nissen: 44 12 52 00. Kristian Monrad Aagaard: 48 80 52 00. Kontor: 48 25 19 00.' },
      { match:'estate gentofte',              phone:'20 25 95 10', note:'Samareh Bahari Hansen, indehaver.' },
      { match:'estate roskilde%',             phone:'46 40 48 00', note:'Ebbe Nygaard, indehaver. Michelle Larsen er også indehaver. Kontor: 46 40 48 00.' },
      { match:'estate køge',                  phone:'23 39 46 45', note:'Simone Dalsgaard, medejer. Aktiv butik med høj boligvolumen.' },
      { match:'nydan%huse',                   phone:'23 26 67 44', note:'Kasper Larsen, direktør. Fritidshuse er oplagte til AI-billeder, 3D og video.' },
      { match:'stensbo huse%',               phone:'51 53 13 37', officePhone:'27 11 83 30', note:'Thomas Andersen (medejer): 51 53 13 37. Kristian Lund (medejer): 27 11 83 30. NB: 75 36 29 66 er forkert.' },
      { match:'siesing totalbyg',             phone:'52 24 55 58', note:'Nikolaj Siesing, stifter/direktør. Meget aktive på sociale medier; sælg video og før/efter.' },
    ];
    for (const f of nullPhoneFixes) {
      const pat = f.match.includes('%') ? f.match : `%${f.match}%`;
      await pool.query(
        `UPDATE leads
           SET owner_phone = $1,
               office_phone = COALESCE(office_phone, $2),
               status = 'contacted',
               notes = COALESCE(notes || chr(10), '') || $3
         WHERE owner_email = $4
           AND lower(name) LIKE $5
           AND owner_phone IS NULL`,
        [f.phone, f.officePhone ?? null, '[11. aug] ' + f.note, oe, pat]
      );
    }
    // Fix: Nybolig Silkeborg v. Jesper Lyngsø got wrong phone 24 91 64 44 from broad %silkeborg% pattern
    await pool.query(
      `UPDATE leads
         SET owner_phone = '40 21 76 40',
             office_phone = '86 82 66 00',
             notes = COALESCE(notes || chr(10), '') ||
               '[11. aug] Jesper Lyngsø, indehaver: 40 21 76 40. Kontor: 86 82 66 00. NB: 24 91 64 44 var fejlagtigt tilknyttet.'
       WHERE owner_email = $1
         AND lower(name) LIKE '%nybolig%silkeborg%'
         AND owner_phone = '24 91 64 44'`,
      [oe]
    );
    // Fix: EDC Poul Erik Bech Silkeborg got wrong phone from same pattern – clear it (not a telesales lead)
    await pool.query(
      `UPDATE leads SET owner_phone = NULL
       WHERE owner_email = $1
         AND lower(name) LIKE '%edc%silkeborg%'
         AND owner_phone = '24 91 64 44'`,
      [oe]
    );
    console.log('[ensure-schema] deep-clean: null-phone leads updated + Silkeborg phones fixed');
  } catch(e: any) { console.error('[ensure-schema] deep-clean:', e.message); }
  // ─────────────────────────────────────────────────────────────────────────

  // ── Add phones to 26 existing contacted leads + insert 24 new (idempotent per lead) ──
  try {
    {
      const oe = 'fredefussing@gmail.com';

      // Part 1: add owner_phone to existing leads (only if currently null)
      const phoneUpdates: Array<{ pattern: string; phone: string; note: string; officePhone?: string }> = [
        { pattern:'%bjørn%byskov%',     phone:'20 54 29 29', note:'Christian Byskov, medejer' },
        { pattern:'%bernstorff estate%',phone:'40 53 78 08', note:'Helene Bernstorff Sørensen, stifter og indehaver' },
        { pattern:'%borg%heilesen%',     phone:'20 60 15 02', note:'Claus Borg, ejer' },
        { pattern:'%skagenbolig%',       phone:'42 90 99 19', note:'Christian Strøm, indehaver' },
        { pattern:'%boligmatch%',        phone:'61 55 59 54', note:'Rasmus Kirkeby, ejer/direktør' },
        { pattern:'%fisker%liljengren%', phone:'88 82 66 30', note:'Regine Ørholt Liljengren, direktør. NB: 88 82 66 30 er firmaets fælles hovednummer – ikke personlig mobil.' },
        { pattern:'%brechmann%',         phone:'30 14 13 14', note:'Benedikte Brechmann, stifter og indehaver' },
        { pattern:'%storm%dubourg%',     phone:'40 31 13 80', note:'Jens Storm, indehaver' },
        { pattern:'%ekman bolig%',       phone:'40 79 10 33', note:'Lars Ekman, indehaver' },
        { pattern:'%&living frederiksberg%', phone:'20 47 25 66', note:'Sole Seibæk, indehaver' },
        { pattern:'%vejlemægleren%',     phone:'60 22 57 14', note:'Tobias Meng, indehaver' },
        { pattern:'%anita j%ger%',       phone:'30 60 66 04', note:'Anita Jæger, indehaver' },
        { pattern:'%thoustrup%præstegaard%', phone:'52 39 76 63', note:'Anja Præstegaard Hansen, medejer' },
        { pattern:'%ejenholm%',          phone:'54 58 05 55', note:'Claus Aagaard Holm, indehaver' },
        { pattern:'%mathias mendel%',    phone:'30 22 50 20', note:'Mathias Mendel, partner, cand.jur. og ejendomsmægler' },
        { pattern:'%tanja mathiesen%',   phone:'24 64 64 55', note:'Tanja Mathiesen, indehaver' },
        { pattern:'%aars mægleren%',     phone:'51 24 12 76', note:'Kristian Thomsen, indehaver' },
        { pattern:'%sofie find%',        phone:'20 76 74 49', note:'Sofie Find, indehaver' },
        { pattern:'%thomas risager%',    phone:'20 42 88 40', note:'Thomas Dietz Risager, ejer' },
        { pattern:'%ebeltoft%mols%',     phone:'86 34 43 00', note:'Maria Louise Madsen, indehaver' },
        { pattern:'%bolig by k%',        phone:'20 24 27 72', note:'Karsten Sønderhøj, indehaver' },
        { pattern:'%byens boligpartner%',phone:'22 42 25 65', note:'Anders Oechsler, medejer' },
        { pattern:'%wul%partnere%',      phone:'30 21 44 01', note:'Frederik Gottenborg, partner' },
        { pattern:'%klein%adamsen%',     phone:'50 57 09 29', note:'Anders Klein Hansen, ejer. NB: 21 28 46 63 tilhører Mette Lilli Adamsen (medejer).' },
        { pattern:'%lobergbolig%',       phone:'29 61 76 27', note:'Hanna Loberg, indehaver' },
        { pattern:'%peter due bolig%',   phone:'57 83 22 88', note:'Peter Due, indehaver' },
      ];
      for (const u of phoneUpdates) {
        await pool.query(
          `UPDATE leads SET owner_phone=$1, status='contacted', notes=COALESCE(notes||chr(10),'')||$2
           WHERE owner_email=$3 AND lower(name) LIKE $4 AND owner_phone IS NULL`,
          [u.phone, '[11. aug] ' + u.note, oe, u.pattern]
        );
      }

      // Also fix status for any matching leads that already have a phone (idempotent)
      for (const u of phoneUpdates) {
        await pool.query(
          `UPDATE leads SET status='contacted'
           WHERE owner_email=$1 AND lower(name) LIKE $2 AND status='new' AND owner_phone IS NOT NULL`,
          [oe, u.pattern]
        );
      }

      // Part 2: insert 24 new contacted leads
      const now50 = '2026-08-11T08:00:00Z';
      const fu50  = '2026-08-18T08:00:00Z';
      const fu150 = '2026-08-13T08:00:00Z';
      const fu250 = '2026-08-20T08:00:00Z';
      const newLeads50: Array<{ name: string; phone: string; officePhone?: string; note: string }> = [
        { name:'Sweet-Homes',             phone:'53 76 24 64', note:'Maria Schlichting, indehaver' },
        { name:'Benzon Ejendomsmægler',   phone:'27 84 54 40', note:'Mia Benzon, medejer og markedsføringsansvarlig' },
        { name:'Adam Schnack',            phone:'26 23 42 23', note:'Adam Schnack, ansvarlig indehaver' },
        { name:'ELBÆKS',                  phone:'70 20 11 18', note:'Lars Elbæk, indehaver/ejendomsmægler' },
        { name:'Peter Warming',           phone:'30 50 60 00', note:'Peter Warming, indehaver' },
        { name:'Habitat',                 phone:'20 95 60 99', note:'Josefine Ræder, indehaver' },
        { name:'CarlssonLiving',          phone:'28 30 03 23', note:'Daniel Carlsson, indehaver' },
        { name:'Unni Estates',            phone:'70 50 52 50', note:'Caroline Thode Borch, direktør' },
        { name:'Fantastic Frank Copenhagen', phone:'53 82 02 33', officePhone:'39 63 99 99',
          note:'Jens Peter Friis (direkte): 53 82 02 33. Michael Faurholdt Friis (direkte): 53 60 99 68. Kontor: 39 63 99 99. NB: Mark Teddy Petersen er ikke længere aktuel ejer.' },
        { name:'LILIENHOFF',              phone:'70 22 12 35', note:'Peter Milton, indehaver og adm. direktør – bed om Peter Milton.' },
        { name:'Næstved Mægleren',        phone:'51 22 53 22', note:'Anders J. Jørgensen, indehaver' },
        { name:'HUSMadsen',               phone:'61 43 31 41', note:'Susan Madsen, indehaver' },
        { name:'Min Bolighandel Øresund', phone:'31 10 39 58', note:'Susanne Søgaard, indehaver' },
        { name:'Wilstrup Bolig',          phone:'81 81 67 67', note:'Kasper Wilstrup, indehaver' },
        { name:'EsbjergMægleren',         phone:'73 70 65 59', note:'Lykke Schmidt, indehaver' },
        { name:'GistrupMægleren',         phone:'61 15 15 13', note:'Torben Svendsen, indehaver' },
        { name:'VorBolig',                phone:'55 35 00 00', note:'Flemming F. Bentzon, indehaver' },
        { name:'CD Bolig',                phone:'86 68 20 35', note:'Johnny Thougaard, indehaver' },
        { name:'Karhof Bolig & Erhverv',  phone:'29 34 34 34', note:'Nicolai Elkjær Karhof, ejer og direktør' },
        { name:'Litza Bolig',             phone:'21 36 30 80',
          note:'NB: 21 36 30 80 er registreret ved Helle Friis (ejendomsmægler, ansvarlig leder). Charlott Litza Friis Larsen er stifter/historisk tilknyttet – bed IKKE om Charlott uden ny bekræftelse.' },
        { name:'Anja Hensberg',           phone:'60 15 07 30', note:'Anja Hensberg, indehaver' },
        { name:'Lilian Drikkjær',         phone:'60 78 88 87', note:'Lilian Drikkjær, indehaver' },
        { name:'Jakob Munk-Petersen',     phone:'61 27 36 87', note:'Jakob Munk-Petersen, indehaver' },
        { name:'Land & Bolig',            phone:'21 22 10 82', note:'Anne Klee, indehaver' },
      ];
      for (const l of newLeads50) {
        await pool.query(
          `INSERT INTO leads (owner_email,name,category,status,owner_phone,office_phone,notes,
             first_contact_at,follow_up_at,follow_up_1_at,follow_up_1_done,follow_up_2_at,follow_up_2_done)
           SELECT $1,$2,'ejendomsmaegler','contacted',$3,$4,$5,$6,$7,$8,false,$9,false
           WHERE NOT EXISTS (
             SELECT 1 FROM leads WHERE owner_email=$1 AND (lower(name)=lower($2) OR owner_phone=$3)
           )`,
          [oe, l.name, l.phone, l.officePhone ?? null, '[11. aug] ' + l.note,
           now50, fu50, fu150, fu250]
        );
      }
      console.log('[ensure-schema] 50-leads batch: phones + inserts applied');
    }
  } catch(e: any) { console.error('[ensure-schema] 50-leads batch:', e.message); }
  // ─────────────────────────────────────────────────────────────────────────

  // ── Insert contacted leads 51–100 (idempotent per lead via WHERE NOT EXISTS) ──
  try {
    {
      const oe  = 'fredefussing@gmail.com';
      const now = '2026-08-11T08:00:00Z';
      const fu  = '2026-08-18T08:00:00Z';
      const fu1 = '2026-08-13T08:00:00Z';
      const fu2 = '2026-08-20T08:00:00Z';
      type L = { name: string; phone: string; officePhone?: string; note: string };
      const leads100: L[] = [
        // 51 – 75
        { name:'Dit & Mit Frederiksberg',        phone:'33 26 33 00',
          note:'Gitte Grønlund, indehaver. NB: 33 26 33 00 er kontorets fællesnummer, ikke bekræftet direkte mobil. Ca. 4 medarbejdere.' },
        { name:'John Ole Hansen',                phone:'21 49 38 81', officePhone:'54 85 11 99',
          note:'Ring til Lasse Øster Dalsgaard (indehaver/valuar): 21 49 38 81. Kontor: 54 85 11 99. NB: John Ole Hansen-materialet er forældet.' },
        { name:'GUNDE & GUNDE',                  phone:'91 55 05 55',
          note:'Kenn Gundesen, ejer/mægler. Familievirksomhed, København og Næstved.' },
        { name:'BoGodt Mægleren',                phone:'81 72 88 82',
          note:'Camilla Andersen Bojsen, medejer.' },
        { name:'Hansen & Thoft',                 phone:'40 99 90 09',
          note:'Henrik Hansen, medejer.' },
        { name:'Vogel & Vandel',                 phone:'53 58 50 22',
          note:'Alexander Vogel, indehaver. Moderne københavnsk profil.' },
        { name:'Boligbutikken',                  phone:'40 34 11 90',
          note:'Tobias Edlev Nielsen, indehaver. Stort team, 1.000+ salg. Vis især video.' },
        { name:'Gentofte Ejendomshandel',        phone:'81 73 00 30',
          note:'Kristjan Thor Markersen, indehaver.' },
        { name:'Hjem til dig',                   phone:'40 14 06 46',
          note:'Helle Lynge, medejer: 40 14 06 46. Alternativt Natasja: 40 14 22 87.' },
        { name:'Hovmand & Partner',              phone:'27 28 55 00',
          note:'Morten Hovmand, indehaver. Selvstændig Gentofte-mægler.' },
        { name:'Renny Clemmensen',               phone:'29 27 02 00',
          note:'Renny Clemmensen, indehaver.' },
        { name:'KCO Bolig',                      phone:'39 61 61 62',
          note:'Kim Søndergård, ejer. NB: 39 61 61 62 er virksomhedens hovednummer – bed om Kim.' },
        { name:'EP Bolig',                       phone:'61 16 96 16',
          note:'Mads Packness, medejer.' },
        { name:'DanskeBolig',                    phone:'20 65 27 57', officePhone:'56 71 30 40',
          note:'Nanna Søndergaard, indehaver. Direkte: 20 65 27 57. Kontor (Faxe): 56 71 30 40.' },
        // #65 Grønne Silkeborgs Mæglere — allerede varmt lead, springes over
        { name:'Ejendomsmæglerfirmaet Riishøj',  phone:'40 45 58 41',
          note:'Peder Riishøj, indehaver. Lystejendomme og boliger.' },
        { name:'Hedegaard Madsen',               phone:'98 96 01 01',
          note:'Heine Bøgeskov Madsen, ejendomsmægler/medejer. NB: 98 96 01 01 er fællesnummer, ikke personlig direkte. Titel er ejendomsmægler – ikke adm. direktør.' },
        { name:'Mæglerringen Tom Pedersen',      phone:'21 82 42 32',
          note:'Tom Pedersen, indehaver. Flere afdelinger.' },
        { name:'Alecsander Delfs',               phone:'31 19 15 15',
          note:'Alecsander Delfs, ejer/direktør. Liebhaverprofil, stærk Instagram.' },
        { name:'Camilla Lindhard',               phone:'22 85 95 95',
          note:'Camilla Lindhard, ejer. Boutique i København.' },
        { name:'Mæglerfirmaet Fur-Salling-Vesthimmerland', phone:'26 80 85 27',
          note:'Sussie Renee Gerd Sørensen, indehaver.' },
        { name:'Meng Bolig & Erhverv',           phone:'52 14 88 00',
          note:'Jens-Erik Meng, indehaver.' },
        { name:'NordBo',                         phone:'24 21 80 07',
          note:'Carsten Nordbo, indehaver.' },
        { name:'LangelandsMægleren',             phone:'61 26 67 77',
          note:'Carsten Sørensen, indehaver.' },
        { name:'Casa Mi',                        phone:'82 30 27 00',
          note:'Ole Kielmann Hansen, indehaver. Amager.' },
        // 76 – 100
        { name:'DIT HJEM',                       phone:'25 26 16 16',
          note:'Camilla Stisager, medejer.' },
        { name:'EjendomsmæglerKompagniet',       phone:'31 41 43 53',
          note:'Thomas Munch, direktør/medejer. Ring til hovednummeret og bed om Thomas.' },
        { name:'Fredericia Mægleren',            phone:'24 81 63 41',
          note:'Lars-Bo Ottesen, ejer/direktør.' },
        { name:'KEC Bolig',                      phone:'23 95 25 03', officePhone:'98 25 53 00',
          note:'Knud Erik Christiansen, ejendomsmægler (bed om Knud Erik). Direkte: 23 95 25 03. Kontor: 98 25 53 00. NB: titel "indehaver" ikke fuldt dokumenteret.' },
        { name:'Peter Hoe Ejendomme',            phone:'70 22 75 00',
          note:'Peter Hoe, indehaver. Specialejendomme og liebhaver.' },
        { name:'Min Bolighandel Aarhus',         phone:'24 25 07 84', officePhone:'86 10 11 99',
          note:'Mads Edvard Nielsen, direktør: 24 25 07 84. Kontor: 86 10 11 99.' },
        { name:'NordfynBo',                      phone:'22 84 44 99',
          note:'Marie Louise Pedersen, indehaver.' },
        { name:'Thobo-Carlsen & Partnere',       phone:'66 13 92 00',
          note:'Lars Bjørk, direktør. Veletableret Odense-mægler – ring og bed om Lars.' },
        { name:'Færch Bolig',                    phone:'30 89 80 67',
          note:'Jørgen Færch, indehaver.' },
        { name:'AFBolig',                        phone:'40 25 44 80',
          note:'Allan Folmer, indehaver. Uafhængig Køge-mægler med fokus på markedsføring.' },
        { name:'OL-Bolig',                       phone:'28 15 54 54',
          note:'Judith Mørch-Pedersen eller Camilla Lohse, direktører: 28 15 54 54.' },
        { name:'Bo Basic',                       phone:'26 14 48 91',
          note:'Mick Ottendahl, ejendomsmægler. NB: beslutningskompetence uafklaret – afklar ved opkald. Tal evt. med Maj om marketing.' },
        { name:'Arboehus',                       phone:'30 50 34 22',
          note:'Dennis Studsgaard Arboe, ejer.' },
        { name:'Byens Mæglere Hjørring',         phone:'98 92 48 66',
          note:'Frank Michael Elefsen, stifter/direktør.' },
        { name:'Landbrugsmæglerne',              phone:'40 57 51 07', officePhone:'86 24 40 00',
          note:'Christian Schulin-Zeuthen, indehaver. Direkte: 40 57 51 07. Hovednummer: 86 24 40 00.' },
        { name:'Signature Homes',                phone:'70 60 44 55',
          note:'Bed om direktøren/indehaveren: 70 60 44 55.' },
        { name:'Lykkebo',                        phone:'70 60 20 50',
          note:'Bed om Rasmus Haukrogh eller direktionen. Over 1.000 lejemål – forvent længere beslutningsproces.' },
        { name:'Mæglerhuset',                    phone:'22 84 64 00',
          note:'Maria Vammen, marketing (primær): 22 84 64 00. Emilie Munkholm (tekst/indhold): 22 52 06 00. 15+ butikker – central godkendelse kræves.' },
        { name:'Milton Huse',                    phone:'48 88 16 46',
          note:'Theresa Schrøder, marketingchef.' },
        { name:'Hybel',                          phone:'48 88 00 05',
          note:'Henrik Bornø, salgs- og marketingdirektør.' },
        { name:'Estate Aarhus C',                phone:'61 69 14 11',
          note:'Thomas Grau-Hansen, indehaver. Kædens rammer kan begrænse beslutning.' },
        { name:'home Hørsholm-Rungsted',         phone:'49 21 49 21',
          note:'Andreas Rosenkilde Løgstrup, indehaver. Kontor: 49 21 49 21 (bed om Andreas). NB: 21 71 22 00 er forældet.' },
        { name:'home Køge',                      phone:'30 80 70 30',
          note:'Rasmus Mørch, indehaver. Mulig central godkendelse.' },
        { name:'home Holbæk & Kirke Hyllinge',  phone:'59 43 59 59', officePhone:'46 40 00 84',
          note:'Frederik Erland, indehaver. Holbæk: 59 43 59 59. Kirke Hyllinge: 46 40 00 84. NB: 51 18 43 00 er forældet.' },
        { name:'home Næstved',                   phone:'55 77 41 00',
          note:'Rikke Nissen, indehaver. Kontor: 55 77 41 00 (bed om Rikke). NB: 26 18 73 44 ikke dokumenteret i aktuel kilde.' },
      ];
      for (const l of leads100) {
        await pool.query(
          `INSERT INTO leads (owner_email,name,category,status,owner_phone,office_phone,notes,
             first_contact_at,follow_up_at,follow_up_1_at,follow_up_1_done,follow_up_2_at,follow_up_2_done)
           SELECT $1,$2,'ejendomsmaegler','contacted',$3,$4,$5,$6,$7,$8,false,$9,false
           WHERE NOT EXISTS (
             SELECT 1 FROM leads WHERE owner_email=$1 AND (lower(name)=lower($2) OR owner_phone=$3)
           )`,
          [oe, l.name, l.phone, l.officePhone ?? null, '[11. aug] ' + l.note,
           now, fu, fu1, fu2]
        );
      }
      console.log('[ensure-schema] 100-leads batch: 49 leads inserted');
    }
  } catch(e: any) { console.error('[ensure-schema] 100-leads batch:', e.message); }
  // ─────────────────────────────────────────────────────────────────────────

  // ── Insert contacted leads 101–150 (11. aug 2026, corrections applied) ───
  // Idempotent: deep-clean above already added phones to existing leads,
  // so WHERE NOT EXISTS (name OR phone) safely skips those and inserts only truly new ones.
  try {
    const oe  = 'fredefussing@gmail.com';
    const now = '2026-08-11T08:00:00Z';
    const fu  = '2026-08-18T08:00:00Z';
    const fu1 = '2026-08-13T08:00:00Z';
    const fu2 = '2026-08-20T08:00:00Z';
    type L = { name: string; phone: string; officePhone?: string; note: string };
    const leads150: L[] = [
      // 101 – skips 114 (3T Totalbyggeri, ubekræftet nummer) og 136 (Ejendrøm, ingen nummer) og 147 (Estate Randers, ophørt/fusioneret)
      { name:'Helle Gade',                       phone:'87 10 41 00',
        note:'Helle Gade Pedersen, direktør. Kontor: 87 10 41 00. NB: 22 41 71 28 er ikke bekræftet – undlad det direkte nummer.' },
      { name:'Nikolai Vlasman',                  phone:'44 12 21 21',
        note:'Nikolai Vlasman, indehaver. Premiumprofil, selvstændig og aktiv boligproduktion.' },
      { name:'Hinnerskov Ejendomme',             phone:'31 52 00 78',
        note:'Jan Højer Hinnerskov, ejer. Liebhaveri, projektsalg og erhverv passer godt til visualisering.' },
      { name:'Villadsen Ejendomshandel',         phone:'98 20 40 35',
        note:'Søren Villadsen, indehaver. Selvstændig og kort vej til beslutning.' },
      { name:'Ejendomsmæglerfirmaet Mogens Hansen', phone:'44 22 33 11',
        note:'Mogens Hansen, ejer/direktør. Nyere selvstændig forretning på Sydkysten.' },
      { name:'Niels Thorsen – Bedre Bolig Salg', phone:'27 57 05 43',
        note:'Niels Thorsen, ejer. Uafhængig og direkte ejer, men mindre volumen.' },
      { name:'danbolig Gentofte – Frederik Fausing', phone:'40 52 06 10',
        note:'Frederik S. Fausing, medejer. Medejer af flere attraktive butikker.' },
      { name:'Kvadrat Bolig & Erhverv',          phone:'33 11 40 20',
        note:'Kim Borch er ejer (ophørte som direktør 23. jun 2026). Christian Sachs Borch er aktuel direktør. Ring til 33 11 40 20 og bed om Kim Borch (ejer) eller Christian Sachs Borch (direktør).' },
      { name:'Nydan-Huse',                       phone:'23 26 67 44',
        note:'Kasper Larsen, direktør. Fritidshuse er oplagte til AI-billeder, 3D og video.' },
      { name:'Stensbo Huse',                     phone:'51 53 13 37', officePhone:'27 11 83 30',
        note:'Thomas Andersen (medejer): 51 53 13 37. Kristian Lund (medejer): 27 11 83 30. NB: 75 36 29 66 er forkert nummer.' },
      { name:'Trelleborg Huse',                  phone:'61 35 44 45',
        note:'Claus Funch Pedersen, salg Sjælland. Type- og fritidshuse har et stort visuelt behov.' },
      { name:'Arensbach Entreprise',             phone:'28 83 65 11',
        note:'Ask Arensbach, ejer/direktør. Ombygning og renovering – før/efter-video er relevant.' },
      { name:'Siesing Totalbyg',                 phone:'52 24 55 58',
        note:'Nikolaj Siesing, stifter/direktør. Meget aktive på sociale medier; sælg video og før/efter.' },
      // 114 3T Totalbyggeri: ubekræftet nummer – springes over
      { name:'home Slagelse',                    phone:'20 45 49 90',
        note:'Steen Grosen, indehaver. Lokal ejer, del af home.' },
      { name:'home Svendborg',                   phone:'60 91 80 10',
        note:'Mark Mahler, indehaver. Relevant volumen, mulig central godkendelse.' },
      { name:'home Odense',                      phone:'40 84 50 91',
        note:'Henrik Christoffersen, medejer. Flere butikker og stort potentiale pr. aftale.' },
      { name:'home Silkeborg',                   phone:'61 39 88 12',
        note:'Kristian Brusgaard-Sørensen, medejer. Aktiv butik og direkte ejertelefon.' },
      { name:'home Middelfart',                  phone:'64 41 80 90',
        note:'Nikolaj Klinge, indehaver. Hovednummer; bed om Nikolaj.' },
      { name:'home Skanderborg',                 phone:'25 34 80 04',
        note:'Carsten Andersen, indehaver. Dækker Skanderborg/Ry/Hørning.' },
      { name:'home Virum',                       phone:'45 93 24 44',
        note:'Lone Bøegh Henriksen, indehaver. Dækker Virum/Kongens Lyngby/Holte – tre leads samlet til ét opkald.' },
      { name:'home Hedehusene',                  phone:'31 21 83 32', officePhone:'36 14 10 40',
        note:'Jan Isaksen, indehaver: 31 21 83 32. Kontor: 36 14 10 40. NB: 46 56 83 00 er forkert/forældet.' },
      { name:'Nybolig Herning',                  phone:'70 25 40 50',
        note:'Henrik Buur, indehaver. Stor lokal aktivitet og relevant volumen.' },
      { name:'Nybolig Ikast og Kjellerup',       phone:'51 35 07 61',
        note:'Joachim Glerup Verwold, medejer. To butikker samlet, fordi ejergruppen overlapper.' },
      { name:'Nybolig Svendborg',                phone:'62 26 35 65',
        note:'Thomas M. Thomsen, ejer/direktør. Flere butikker og betydelig boligproduktion.' },
      { name:'Nybolig Odense',                   phone:'26 29 48 84',
        note:'Bahadir Demirhan, medejer. Flere butikker, lejligheder og projektsalg.' },
      { name:'Nybolig Hillerød',                 phone:'53 35 76 93',
        note:'Sofia Hammargren Damgaard, medejer. Aktiv butik med tre indehavere.' },
      { name:'Nybolig Esbjerg',                  phone:'23 80 98 05',
        note:'Jan L. Madsen, medejer. God volumen og direkte ejertelefon.' },
      { name:'Nybolig Skjern og Tarm',           phone:'23 71 01 32',
        note:'Louise Graakjær, medejer. Flere butikker samlet under samme ejergruppe.' },
      { name:'Nybolig Silkeborg – Jesper Lyngsø',phone:'40 21 76 40', officePhone:'86 82 66 00',
        note:'Jesper Lyngsø, indehaver: 40 21 76 40. Kontor: 86 82 66 00. NB: 86 82 50 00 er forkert.' },
      { name:'Nybolig Haslev',                   phone:'40 38 85 80', officePhone:'56 31 22 86',
        note:'Jakob Harder, indehaver: 40 38 85 80. Søren Jagd Lauritsen: 61 20 00 23. Kontor: 56 31 22 86. NB: 56 31 55 00 er forkert.' },
      { name:'Nybolig Slagelse',                 phone:'40 20 80 28', officePhone:'58 53 30 30',
        note:'Peter Valentin, indehaver: 40 20 80 28. Lars Bryde Nielsen: 24 87 19 09. Kenneth Andersen: 30 73 89 50. Kontor: 58 53 30 30. NB: 58 50 30 30 er forkert.' },
      { name:'Nybolig Amager',                   phone:'31 64 20 00', officePhone:'70 60 27 00',
        note:'Leutrim Rusiti, indehaver: 31 64 20 00. Caspar Nielsen: 50 46 48 17. Kontor: 70 60 27 00. NB: 32 59 13 00 er forkert.' },
      { name:'Nybolig Fjord & Skov Vejen',       phone:'21 78 88 66', officePhone:'75 36 20 00',
        note:'Tina Fjord, medejer: 21 78 88 66. Lars-Rune Skov: 29 45 73 68. Kontor: 75 36 20 00. NB: 75 36 29 66 er forkert.' },
      { name:'Nybolig v. Jan Milvertz',          phone:'55 72 00 72', officePhone:'59 51 48 00',
        note:'Jan Milvertz, indehaver. Næstved: 55 72 00 72. Kalundborg: 59 51 48 00. Direkte mobil ikke bekræftet.' },
      // 136 Ejendrøm: ingen direkte nummer – springes over
      { name:'EDC BornholmerBo',                 phone:'56 95 56 83',
        note:'Dan Dellgren og Kurt Brandt Mortensen, ejerkreds. Kontor: 56 95 56 83. NB: 56 95 02 00 er forkert.' },
      { name:'Estate Hillerød',                  phone:'44 12 52 00', officePhone:'48 25 19 00',
        note:'Jakob Nissen: 44 12 52 00. Kristian Monrad Aagaard: 48 80 52 00. Kontor: 48 25 19 00.' },
      { name:'Estate Hellerup',                  phone:'39 40 21 22',
        note:'Peter Holm, indehaver. Dækker Hellerup, Charlottenlund og Klampenborg. Kontor: 39 40 21 22.' },
      { name:'Estate Frederiksberg C',           phone:'33 25 23 11',
        note:'Mads Mygind, indehaver. Kontor: 33 25 23 11.' },
      { name:'&LIVING Østerbro',                 phone:'40 58 28 29',
        note:'Annette Schat-Holm, indehaver. Visuelt premiumområde og direkte indehavertelefon.' },
      { name:'&LIVING Aarhus',                   phone:'66 46 79 96',
        note:'Thomas Bo Jensen, medejer. Moderne profil og direkte beslutningstager.' },
      { name:'Estate Ringsted',                  phone:'57 61 20 00',
        note:'Peter Dinesen, indehaver. Høj lokal salgsaktivitet; bed om Peter.' },
      { name:'Estate Roskilde & Hornsherred',    phone:'46 40 48 00',
        note:'Ebbe Nygaard, indehaver (NB: ikke Ebbe Nygaard Nielsen). Michelle Larsen er også indehaver. Kontor: 46 40 48 00.' },
      { name:'Estate Køge',                      phone:'23 39 46 45',
        note:'Simone Dalsgaard, medejer. Aktiv butik med høj boligvolumen.' },
      { name:'Estate Gentofte',                  phone:'20 25 95 10',
        note:'Samareh Bahari Hansen, indehaver. Direkte ejer og attraktivt liebhavermarked.' },
      // 147 Estate Randers: fusioneret ind i Nybolig Bjørn & Ankersen – springes over
      { name:'Estate Birkerød',                  phone:'23 39 34 60', officePhone:'33 14 34 60',
        note:'Elizabeth Skau-Andersen, indehaver: 23 39 34 60. Kontor: 33 14 34 60.' },
      { name:'Estate Hvidovre',                  phone:'30 27 87 55', officePhone:'36 47 48 11',
        note:'Jesper Glerup, indehaver: 30 27 87 55. Kontor: 36 47 48 11.' },
      { name:'Estate Sydhavnen',                 phone:'23 23 49 00', officePhone:'33 31 24 50',
        note:'Maria Bøttcher Krolack, indehaver/direktør: 23 23 49 00. Kontor: 33 31 24 50.' },
    ];
    for (const l of leads150) {
      await pool.query(
        `INSERT INTO leads (owner_email, name, category, status, owner_phone, office_phone, notes,
           first_contact_at, follow_up_at, follow_up_1_at, follow_up_1_done, follow_up_2_at, follow_up_2_done)
         SELECT $1, $2, 'ejendomsmaegler', 'contacted', $3, $4, $5, $6, $7, $8, false, $9, false
         WHERE NOT EXISTS (
           SELECT 1 FROM leads WHERE owner_email = $1
             AND (lower(name) = lower($2) OR owner_phone = $3)
         )`,
        [oe, l.name, l.phone, l.officePhone ?? null, '[11. aug] ' + l.note,
         now, fu, fu1, fu2]
      );
    }
    console.log('[ensure-schema] 150-leads batch: 47 leads inserted/upserted');
  } catch(e: any) { console.error('[ensure-schema] 150-leads batch:', e.message); }
  // ─────────────────────────────────────────────────────────────────────────

  // ── MASTER SYNC: guarantee ALL 147 telesales contacted leads are visible ──
  // Strategy: (1) UPDATE by EXACT name if owner_phone IS NULL (catches name-matched old leads)
  //           (2) INSERT if no lead with this PHONE exists (catch-all for truly missing leads)
  // Runs every boot. Completely idempotent. No LIKE guessing.
  try {
    const oe  = 'fredefussing@gmail.com';
    const ts  = '2026-08-11T08:00:00Z';
    const fu  = '2026-08-18T08:00:00Z';
    const fu1 = '2026-08-13T08:00:00Z';
    const fu2 = '2026-08-20T08:00:00Z';
    type M = { name: string; phone: string; oPhone?: string };
    const master: M[] = [
      { name:'&LIVING Aarhus',                        phone:'66 46 79 96' },
      { name:'&LIVING Østerbro',                       phone:'40 58 28 29' },
      { name:'AFBolig',                                phone:'40 25 44 80' },
      { name:'Aars Mægleren',                          phone:'51 24 12 76' },
      { name:'Adam Schnack',                           phone:'26 23 42 23' },
      { name:'Alecsander Delfs',                       phone:'31 19 15 15' },
      { name:'Anja Hensberg',                          phone:'60 15 07 30' },
      { name:'Arboehus',                               phone:'30 50 34 22' },
      { name:'Arensbach Entreprise',                   phone:'28 83 65 11' },
      { name:'BOLIG by K',                             phone:'20 24 27 72' },
      { name:'BORG & HEILESEN',                        phone:'20 60 15 02' },
      { name:'Benzon Ejendomsmægler',                  phone:'27 84 54 40' },
      { name:'Bernstorff Estate',                      phone:'40 53 78 08' },
      { name:'Bjørn & Byskov Ejendomsmægler',          phone:'20 54 29 29' },
      { name:'Bo Basic',                               phone:'26 14 48 91' },
      { name:'BoGodt Mægleren',                        phone:'81 72 88 82' },
      { name:'Boligbutikken',                          phone:'40 34 11 90' },
      { name:'Boligmatch',                             phone:'61 55 59 54' },
      { name:'Brechmann Bolig',                        phone:'30 14 13 14' },
      { name:'Byens Boligpartner',                     phone:'22 42 25 65' },
      { name:'Byens Mæglere Hjørring',                 phone:'98 92 48 66' },
      { name:'CD Bolig',                               phone:'86 68 20 35' },
      { name:'Camilla Lindhard',                       phone:'22 85 95 95' },
      { name:'CarlssonLiving',                         phone:'28 30 03 23' },
      { name:'Casa Mi',                                phone:'82 30 27 00' },
      { name:'DIT HJEM',                               phone:'25 26 16 16' },
      { name:'DanskeBolig',                            phone:'20 65 27 57', oPhone:'56 71 30 40' },
      { name:'Dit & Mit Frederiksberg',                phone:'33 26 33 00' },
      { name:'EDC BornholmerBo',                       phone:'56 95 56 83' },
      { name:'ELBÆKS',                                 phone:'70 20 11 18' },
      { name:'EP Bolig',                               phone:'61 16 96 16' },
      { name:'Ebeltoft-Mols Mæglerne',                 phone:'86 34 43 00' },
      { name:'Ejendomsmægler Anita Jaeger',            phone:'30 60 66 04' },
      { name:'Ejendomsmægler Frederiksberg &LIVING',   phone:'20 47 25 66' },
      { name:'Ejendomsmægler Sofie Find',              phone:'20 76 74 49' },
      { name:'Ejendomsmægler Tanja Mathiesen',         phone:'24 64 64 55' },
      { name:'EjendomsmæglerKompagniet',               phone:'31 41 43 53' },
      { name:'Ejendomsmæglerfirmaet Mathias Mendel',   phone:'30 22 50 20' },
      { name:'Ejendomsmæglerfirmaet Mogens Hansen',    phone:'44 22 33 11' },
      { name:'Ejendomsmæglerfirmaet Riishøj',          phone:'40 45 58 41' },
      { name:'Ejenholm Bolig og Erhverv',              phone:'54 58 05 55' },
      { name:'Ekman Bolig CPH',                        phone:'40 79 10 33' },
      { name:'EsbjergMægleren',                        phone:'73 70 65 59' },
      { name:'Estate Aarhus C',                        phone:'61 69 14 11' },
      { name:'Estate Birkerød',                        phone:'23 39 34 60', oPhone:'33 14 34 60' },
      { name:'Estate Frederiksberg C',                 phone:'33 25 23 11' },
      { name:'Estate Gentofte',                        phone:'20 25 95 10' },
      { name:'Estate Hellerup',                        phone:'39 40 21 22' },
      { name:'Estate Hillerød',                        phone:'44 12 52 00', oPhone:'48 25 19 00' },
      { name:'Estate Hvidovre',                        phone:'30 27 87 55', oPhone:'36 47 48 11' },
      { name:'Estate Køge',                            phone:'23 39 46 45' },
      { name:'Estate Ringsted',                        phone:'57 61 20 00' },
      { name:'Estate Roskilde & Hornsherred',          phone:'46 40 48 00' },
      { name:'Estate Sydhavnen',                       phone:'23 23 49 00', oPhone:'33 31 24 50' },
      { name:'Fantastic Frank Copenhagen',             phone:'53 82 02 33', oPhone:'39 63 99 99' },
      { name:'Fisker & Liljengren',                    phone:'88 82 66 30' },
      { name:'Fredericia Mægleren',                    phone:'24 81 63 41' },
      { name:'Færch Bolig',                            phone:'30 89 80 67' },
      { name:'GUNDE & GUNDE',                          phone:'91 55 05 55' },
      { name:'Gentofte Ejendomshandel',                phone:'81 73 00 30' },
      { name:'GistrupMægleren',                        phone:'61 15 15 13' },
      { name:'HUSMadsen',                              phone:'61 43 31 41' },
      { name:'Habitat',                                phone:'20 95 60 99' },
      { name:'Hansen & Thoft',                         phone:'40 99 90 09' },
      { name:'Hedegaard Madsen',                       phone:'98 96 01 01' },
      { name:'Helle Gade',                             phone:'87 10 41 00' },
      { name:'Hinnerskov Ejendomme',                   phone:'31 52 00 78' },
      { name:'Hjem til dig',                           phone:'40 14 06 46' },
      { name:'Hovmand & Partner',                      phone:'27 28 55 00' },
      { name:'Hybel',                                  phone:'48 88 00 05' },
      { name:'Jakob Munk-Petersen',                    phone:'61 27 36 87' },
      { name:'John Ole Hansen',                        phone:'21 49 38 81', oPhone:'54 85 11 99' },
      { name:'KCO Bolig',                              phone:'39 61 61 62' },
      { name:'KEC Bolig',                              phone:'23 95 25 03', oPhone:'98 25 53 00' },
      { name:'Karhof Bolig & Erhverv',                 phone:'29 34 34 34' },
      { name:'Klein Adamsen Bedre Boligsalg',          phone:'50 57 09 29' },
      { name:'Kvadrat Bolig & Erhverv',                phone:'33 11 40 20' },
      { name:'LILIENHOFF',                             phone:'70 22 12 35' },
      { name:'Land & Bolig',                           phone:'21 22 10 82' },
      { name:'Landbrugsmæglerne',                      phone:'40 57 51 07', oPhone:'86 24 40 00' },
      { name:'LangelandsMægleren',                     phone:'61 26 67 77' },
      { name:'Lilian Drikkjær',                        phone:'60 78 88 87' },
      { name:'Litza Bolig',                            phone:'21 36 30 80' },
      { name:'LobergBolig ApS',                        phone:'29 61 76 27' },
      { name:'Lykkebo',                                phone:'70 60 20 50' },
      { name:'Meng Bolig & Erhverv',                   phone:'52 14 88 00' },
      { name:'Milton Huse',                            phone:'48 88 16 46' },
      { name:'Min Bolighandel Aarhus',                 phone:'24 25 07 84', oPhone:'86 10 11 99' },
      { name:'Min Bolighandel Øresund',                phone:'31 10 39 58' },
      { name:'Mæglerfirmaet FUR-SALLING-VESTHIMMERLAND', phone:'26 80 85 27' },
      { name:'Mæglerhuset',                            phone:'22 84 64 00' },
      { name:'Mæglerringen Tom Pedersen',              phone:'21 82 42 32' },
      { name:'Niels Thorsen – Bedre Bolig Salg',       phone:'27 57 05 43' },
      { name:'Nikolai Vlasman',                        phone:'44 12 21 21' },
      { name:'Nordbo',                                 phone:'24 21 80 07' },
      { name:'NordfynBo',                              phone:'22 84 44 99' },
      { name:'Nybolig Amager',                         phone:'31 64 20 00', oPhone:'70 60 27 00' },
      { name:'Nybolig Esbjerg',                        phone:'23 80 98 05' },
      { name:'Nybolig Fjord & Skov Vejen',             phone:'21 78 88 66', oPhone:'75 36 20 00' },
      { name:'Nybolig Haslev',                         phone:'40 38 85 80', oPhone:'56 31 22 86' },
      { name:'Nybolig Herning',                        phone:'70 25 40 50' },
      { name:'Nybolig Hillerød',                       phone:'53 35 76 93' },
      { name:'Nybolig Ikast og Kjellerup',             phone:'51 35 07 61' },
      { name:'Nybolig Silkeborg v. Jesper Lyngsø',     phone:'40 21 76 40', oPhone:'86 82 66 00' },
      { name:'Nybolig Skjern og Tarm',                 phone:'23 71 01 32' },
      { name:'Nybolig Slagelse',                       phone:'40 20 80 28', oPhone:'58 53 30 30' },
      { name:'Nybolig Svendborg',                      phone:'62 26 35 65' },
      { name:'Nybolig v. Jan Milvertz',                phone:'55 72 00 72', oPhone:'59 51 48 00' },
      { name:'Nydan-Huse',                             phone:'23 26 67 44' },
      { name:'Næstved Mægleren',                       phone:'51 22 53 22' },
      { name:'OL-Bolig',                               phone:'28 15 54 54' },
      { name:'Peter Due Bolig',                        phone:'57 83 22 88' },
      { name:'Peter Hoe Ejendomme',                    phone:'70 22 75 00' },
      { name:'Peter Warming',                          phone:'30 50 60 00' },
      { name:'Renny Clemmensen',                       phone:'29 27 02 00' },
      { name:'Siesing Totalbyg',                       phone:'52 24 55 58' },
      { name:'Signature Homes',                        phone:'70 60 44 55' },
      { name:'SkagenBolig I/S',                        phone:'42 90 99 19' },
      { name:'Stensbo Huse ApS',                       phone:'51 53 13 37', oPhone:'27 11 83 30' },
      { name:'Storm & Dubourg I/S',                    phone:'40 31 13 80' },
      { name:'Sweet-Homes',                            phone:'53 76 24 64' },
      { name:'Thobo-Carlsen & Partnere',               phone:'66 13 92 00' },
      { name:'Thomas Risager A/S',                     phone:'20 42 88 40' },
      { name:'Thoustrup & Præstegaard',                phone:'52 39 76 63' },
      { name:'Trelleborg Huse',                        phone:'61 35 44 45' },
      { name:'Unni Estates',                           phone:'70 50 52 50' },
      { name:'Vejlemægleren',                          phone:'60 22 57 14' },
      { name:'Villadsen Ejendomshandel',               phone:'98 20 40 35' },
      { name:'Vogel & Vandel',                         phone:'53 58 50 22' },
      { name:'VorBolig',                               phone:'55 35 00 00' },
      { name:'Wilstrup Bolig',                         phone:'81 81 67 67' },
      { name:'Wullf & Partnere',                       phone:'30 21 44 01' },
      { name:'danbolig Gentofte – Frederik Fausing',   phone:'40 52 06 10' },
      { name:'home Hedehusene',                        phone:'31 21 83 32', oPhone:'36 14 10 40' },
      { name:'home Holbæk & Kirke Hyllinge',           phone:'59 43 59 59', oPhone:'46 40 00 84' },
      { name:'home Hørsholm-Rungsted',                 phone:'49 21 49 21' },
      { name:'home Køge',                              phone:'30 80 70 30' },
      { name:'home Middelfart',                        phone:'64 41 80 90' },
      { name:'home Næstved',                           phone:'55 77 41 00' },
      { name:'home Odense',                            phone:'40 84 50 91' },
      { name:'home Silkeborg',                         phone:'61 39 88 12' },
      { name:'home Skanderborg',                       phone:'25 34 80 04' },
      { name:'home Slagelse',                          phone:'20 45 49 90' },
      { name:'home Svendborg',                         phone:'60 91 80 10' },
      { name:'home Virum',                             phone:'45 93 24 44' },
    ];
    for (const m of master) {
      // Step 1: Update existing lead by EXACT name if it has NULL owner_phone
      await pool.query(
        `UPDATE leads
           SET owner_phone = $1,
               office_phone = COALESCE(office_phone, $2),
               status = 'contacted'
         WHERE owner_email = $3
           AND lower(name) = lower($4)
           AND owner_phone IS NULL`,
        [m.phone, m.oPhone ?? null, oe, m.name]
      );
      // Step 2: Insert fresh if NO lead with this phone exists yet (phone-only uniqueness)
      await pool.query(
        `INSERT INTO leads (owner_email, name, category, status, owner_phone, office_phone,
           notes, first_contact_at, follow_up_at, follow_up_1_at, follow_up_1_done,
           follow_up_2_at, follow_up_2_done)
         SELECT $1, $2, 'ejendomsmaegler', 'contacted', $3, $4,
           '[master] ' || $2, $5, $6, $7, false, $8, false
         WHERE NOT EXISTS (
           SELECT 1 FROM leads WHERE owner_email = $1 AND owner_phone = $3
         )`,
        [oe, m.name, m.phone, m.oPhone ?? null, ts, fu, fu1, fu2]
      );
    }
    console.log('[ensure-schema] master-sync: all 147 telesales leads guaranteed visible');
  } catch(e: any) { console.error('[ensure-schema] master-sync:', e.message); }
  // ─────────────────────────────────────────────────────────────────────────

  // ── Set priority on existing master leads (chain brands get priority 4) ──
  try {
    const oe = 'fredefussing@gmail.com';
    // Priority 4: big chains (home, estate, Nybolig, danbolig, EDC, RealMæglerne, Min Bolighandel)
    await pool.query(`
      UPDATE leads SET priority = 4
      WHERE owner_email = $1
        AND (priority IS NULL OR priority = 5)
        AND (
          name ILIKE 'home %' OR name ILIKE 'Estate %' OR
          name ILIKE 'Nybolig %' OR name ILIKE 'danbolig %' OR
          name ILIKE 'EDC %' OR name ILIKE 'RealMæglerne%' OR
          name ILIKE 'Min Bolighandel%'
        )
    `, [oe]);
    // Priority 3: remaining leads still at default get priority 2 (independent)
    await pool.query(`
      UPDATE leads SET priority = 2
      WHERE owner_email = $1 AND (priority IS NULL OR priority = 5)
    `, [oe]);
    console.log('[ensure-schema] priority-init: existing leads prioritized');
  } catch(e: any) { console.error('[ensure-schema] priority-init:', e.message); }

  // ── Batch 151–250: new leads ranked by type ───────────────────────────────
  try {
    const oe  = 'fredefussing@gmail.com';
    const ts  = '2026-08-11T09:00:00Z';
    const fu  = '2026-08-18T09:00:00Z';
    const fu1 = '2026-08-13T09:00:00Z';
    const fu2 = '2026-08-20T09:00:00Z';
    type NL = { name: string; phone: string; note: string; priority: number };
    const newLeads: NL[] = [
      // ── 151–190: Solo/ejerledede – priority 1 (bedst) ──────────────────────
      { name:'Ejendomsmægler Jes Carlsen',                      phone:'29 70 59 46', note:'Ring til: Jes Carlsen, indehaver. Meget stærk – solo/ejerledet og direkte mobil.',                           priority:1 },
      { name:'Amager Bolig – Dragør',                           phone:'42 42 90 90', note:'Ring til: Preben eller Christian Larsen, indehavere. Meget stærk – selvstændigt ejerteam.',                  priority:1 },
      { name:'Ejendomsmægler Mike Andersen',                    phone:'22 77 22 20', note:'Ring til: Mike Andersen, indehaver. Meget stærk – ejerens direkte nummer.',                                  priority:1 },
      { name:'Lindbergs Ejendomshandel',                        phone:'25 15 89 17', note:'Ring til: Gert Lindberg, indehaver. Meget stærk – lille selvstændig forretning.',                            priority:1 },
      { name:'Bedre Bolig Salg – Sif Bjerregaard',              phone:'24 43 90 03', note:'Ring til: Sif Bjerregaard, indehaver. Meget stærk – solo og direkte mobil.',                                 priority:1 },
      { name:'Bedre Bolig Salg – Anne-Marie Eybye',             phone:'23 64 85 29', note:'Ring til: Anne-Marie Eybye, indehaver. Meget stærk – solo og direkte mobil.',                                priority:1 },
      { name:'Bolig- og Erhvervsmægler Jakob Duemose',          phone:'70 22 80 52', note:'Ring til: Jakob Duemose, indehaver. Meget stærk – ejerledet; bolig og erhverv.',                             priority:1 },
      { name:'Din Boligmægler',                                 phone:'20 84 84 35', note:'Ring til: Lisa Carlsson, indehaver. Meget stærk – direkte ejertelefon.',                                     priority:1 },
      { name:'Lene Juul',                                       phone:'40 45 05 68', note:'Ring til: Lene Juul, indehaver. Meget stærk – selvstændig og direkte beslutningstager.',                      priority:1 },
      { name:'HansenBolig',                                     phone:'40 45 20 16', note:'Ring til: Tove Hansen, indehaver. Meget stærk – ejerledet og direkte nummer.',                               priority:1 },
      { name:'Helle Jønch',                                     phone:'26 27 20 97', note:'Ring til: Helle Jønch, indehaver. Meget stærk – solo og direkte mobil.',                                     priority:1 },
      { name:'Spaabæk RealEstate',                              phone:'20 10 00 10', note:'Ring til: Bed om indehaveren. Meget stærk – uafhængigt, stifterledet firma.',                                 priority:1 },
      { name:'Freck Bolig',                                     phone:'24 22 02 12', note:'Ring til: Louise Freck, indehaver. Meget stærk – direkte mobil til ejer.',                                   priority:1 },
      { name:'Mæglerhuset Nørresundby',                         phone:'50 92 99 29', note:'Ring til: Mads Sørensen eller Thomas Skifter Andersen, indehavere. Stærk – lokalt ejerteam.',                priority:1 },
      { name:'Wiborg + Partnere',                               phone:'70 22 82 52', note:'Ring til: Erik Wiborg, stifter. Meget stærk – 100 % uafhængigt, stifterledet firma.',                        priority:1 },
      { name:'Mæglerfirmaet Asger Larsen – Allan Kristensen',   phone:'98 67 81 32', note:'Ring til: Allan Kristensen, indehaver. Stærk – selvstændig med tydelig ejer.',                              priority:1 },
      { name:'Helge Smidt',                                     phone:'98 43 55 00', note:'Ring til: Helge Smidt, indehaver. Stærk – personbåret, lokalt firma.',                                       priority:1 },
      { name:'KNBOLIG',                                         phone:'28 29 95 38', note:'Ring til: Kristina Nørremark, indehaver. Stærk – direkte mobil og kort beslutningsvej.',                     priority:1 },
      { name:'Frank Risgaard Lauritzen',                        phone:'74 75 26 27', note:'Ring til: Frank Risgaard Lauritzen, indehaver. Stærk – selvstændig og personbåret.',                         priority:1 },
      { name:'Niels Henrik Billund',                            phone:'75 93 45 45', note:'Ring til: Niels Henrik Billund, indehaver. Stærk – ejerens eget navn og kort beslutningsvej.',               priority:1 },
      { name:'Bernd Mittelsdorf',                               phone:'62 80 03 00', note:'Ring til: Bernd Mittelsdorf, indehaver. Stærk – selvstændig lokal mægler.',                                  priority:1 },
      { name:'Augustinus Erhverv',                              phone:'30 20 69 16', note:'Ring til: Carsten Augustinus, indehaver. Stærk – direkte ejertelefon; erhvervssegment.',                     priority:1 },
      { name:'Ejendomsmæglerfirmaet Eckhardt',                  phone:'66 10 11 00', note:'Ring til: Nicky Eckhardt, indehaver. Stærk – familie-/ejerledet og lokalt.',                                 priority:1 },
      { name:'Toxen-Worm',                                      phone:'62 62 38 00', note:'Ring til: Anette Lander, indehaver/ejendomsmægler. Stærk – selvstændigt mæglerfirma.',                       priority:1 },
      { name:'Øbolig',                                          phone:'20 21 02 69', note:'Ring til: Rino Jenssen, indehaver. Stærk – direkte mobil og lokalt fokus.',                                  priority:1 },
      { name:'Algot Ejendomsmæglere',                           phone:'59 18 69 18', note:'Ring til: Bed om indehaveren. Stærk – uafhængig og lokalt ejerledet.',                                       priority:1 },
      { name:'BoligNøglen Stenløse',                            phone:'71 99 09 09', note:'Ring til: Arne Nørgaard Christiansen, indehaver. Stærk – lille selvstændig forretning.',                     priority:1 },
      { name:'Boligsælgeren Jyllinge',                          phone:'46 78 88 44', note:'Ring til: Palle Støvring, indehaver. Stærk – personbåret lokalt firma.',                                     priority:1 },
      { name:'Ejendomsfirmaet Vestsjælland',                    phone:'24 45 24 23', note:'Ring til: Steen Nordrum Blæsbjerg, indehaver. Stærk – direkte ejertelefon.',                                 priority:1 },
      { name:'Lynge Jensen',                                    phone:'55 99 14 44', note:'Ring til: Lynge Jensen, indehaver. Stærk – lille, selvstændigt firma.',                                      priority:1 },
      { name:'Multibolig.dk',                                   phone:'40 92 25 21', note:'Ring til: Claus Dueholm, ejendomsmægler. Stærk – direkte mobil og kort beslutningsvej.',                     priority:1 },
      { name:'Frølich Bolig – Jægerspris',                      phone:'42 95 67 34', note:'Ring til: Peter Frølich, daglig leder. Stærk – lille, personbåret forretning.',                              priority:1 },
      { name:'BoligBolig.dk',                                   phone:'27 20 21 60', note:'Ring til: Matthias Ohm Krøyer, indehaver. Stærk – uafhængigt ejerledet firma.',                              priority:1 },
      { name:'Hoyer',                                           phone:'27 12 21 99', note:'Ring til: Bed om indehaveren. Stærk – lille selvstændig mægler/valuar.',                                     priority:1 },
      { name:'CVB Boligrådgivning',                             phone:'30 80 50 31', note:'Ring til: Bed om indehaveren. Stærk – specialiseret og kort beslutningsvej.',                                 priority:1 },
      { name:'Mæglercompagniet',                                phone:'53 89 29 20', note:'Ring til: Bed om indehaveren. Stærk – lille uafhængig profil.',                                              priority:1 },
      { name:'Rønne Ejendomshandel',                            phone:'56 95 68 86', note:'Ring til: Bed om indehaveren. Stærk – selvstændigt, lokalt firma.',                                          priority:1 },
      { name:'Thomas Jørgensen',                                phone:'70 26 60 00', note:'Ring til: Thomas Jørgensen, indehaver. Stærk – personbåret firma.',                                          priority:1 },
      { name:'Vestmægler',                                      phone:'22 33 23 20', note:'Ring til: Zahide Tanirli Kayaalp, indehaver. Stærk – mindre, lokalt mæglerfirma.',                           priority:1 },
      { name:'MæglerTeam Erhverv',                              phone:'21 43 10 80', note:'Ring til: Laila Semelin, indehaver. Stærk – ejerledet specialist med direkte mobil.',                        priority:1 },
      // ── 191–220: Små uafhængige teams – priority 2 ─────────────────────────
      { name:'Din Mægler Aalborg',                              phone:'50 80 90 60', note:'Ring til: Rasmus Lund Christensen, indehaver. God – lokal, selvstændig forretning.',                         priority:2 },
      { name:'Jysk Mægler Aalborg',                             phone:'39 39 90 00', note:'Ring til: Bed om indehaveren. God – lokalt team med kortere vej end landskæder.',                            priority:2 },
      { name:'Mit Hus – mægleren',                              phone:'22 32 61 55', note:'Ring til: Bed om indehaveren. God – mindre selvstændigt firma.',                                             priority:2 },
      { name:'Aarhus Mæglerne',                                 phone:'70 70 79 61', note:'Ring til: Bed om ejer/partner. God – lokalt partnerdrevet firma.',                                           priority:2 },
      { name:'BoligOne Mogens Kragh',                           phone:'97 42 12 52', note:'Ring til: Mogens Kragh, indehaver. God – lokal ejer.',                                                       priority:2 },
      { name:'Ejendomscentret Brædstrup',                       phone:'24 28 55 99', note:'Ring til: Bed om indehaveren. God – mindre lokalt firma.',                                                   priority:2 },
      { name:'Ejendomsmæglerfirmaet Berg Halager',              phone:'86 10 10 10', note:'Ring til: Bed om en partner. God – partnerdrevet og uafhængigt.',                                            priority:2 },
      { name:'Gravelstone.dk',                                  phone:'86 12 21 00', note:'Ring til: Bed om indehaveren. God – mindre selvstændigt team.',                                              priority:2 },
      { name:'Agerbæk Ejendomshandel',                          phone:'75 19 62 62', note:'Ring til: Bed om indehaveren. God – selvstændig lokal forretning.',                                          priority:2 },
      { name:'Als Mægleren',                                    phone:'74 43 41 10', note:'Ring til: Peter Kistrup, indehaver. God – lokal ejerledet virksomhed.',                                      priority:2 },
      { name:'Blåvand Mægleren',                                phone:'23 28 23 24', note:'Ring til: Claus Lützen, indehaver. God – direkte ejer, stærkt fritidsboligmarked.',                          priority:2 },
      { name:'Cibo Ejendomskontor',                             phone:'75 18 16 55', note:'Ring til: Poul Madsen, indehaver. God – selvstændigt, lokalt kontor.',                                       priority:2 },
      { name:'Mæglerhuset Kokborg & Co.',                       phone:'75 53 90 33', note:'Ring til: Niels Kokborg, indehaver. God – ejerledet lokalt mæglerhus.',                                      priority:2 },
      { name:'Mikkelsens Ejendomskontor',                       phone:'74 83 12 80', note:'Ring til: Bed om indehaveren. God – mindre selvstændigt kontor.',                                            priority:2 },
      { name:'Ribe Mæglerne',                                   phone:'51 15 15 32', note:'Ring til: Bed om indehaveren. God – lokalt team og geografisk fokus.',                                       priority:2 },
      { name:'FynskeBoliger',                                   phone:'44 41 29 45', note:'Ring til: Bed om indehaveren. God – regionalt, selvstændigt firma.',                                         priority:2 },
      { name:'Mæglerringen Odense',                             phone:'66 13 26 13', note:'Ring til: Karen Friis, lokal indehaver. God – lokalt ejerledet kontor.',                                     priority:2 },
      { name:'Casa Bolig',                                      phone:'53 18 43 00', note:'Ring til: Bed om indehaveren. God – lille selvstændigt firma.',                                              priority:2 },
      { name:'Ejendomsmæglerhuset Køge – Det lille hvide hus',  phone:'71 99 46 00', note:'Ring til: Bed om indehaveren. God – lille lokalt mæglerhus.',                                               priority:2 },
      { name:'Erhvervsmægleren',                                phone:'56 63 43 00', note:'Ring til: Bed om indehaveren. God – uafhængig specialist.',                                                  priority:2 },
      { name:'Herbst Thoregaard Boligsalg',                     phone:'47 36 00 25', note:'Ring til: Bed om en partner. God – mindre partnerdrevet firma.',                                             priority:2 },
      { name:'Jeres Mægler Albertslund',                        phone:'27 21 62 66', note:'Ring til: Bed om indehaveren. God – lokal og direkte kontaktvej.',                                           priority:2 },
      { name:'NærMæglerne',                                     phone:'24 84 81 91', note:'Ring til: Bed om indehaveren. God – mindre selvstændigt team.',                                              priority:2 },
      { name:'PerfectMægler & PerfectWork',                     phone:'21 48 88 29', note:'Ring til: Jeanette Holst Gohn, indehaver. God – lille, ejerledet profil.',                                  priority:2 },
      { name:'Roeds Ejendomsmæglerfirma',                       phone:'46 75 77 15', note:'Ring til: Bed om indehaveren. God – selvstændigt lokalfirma.',                                              priority:2 },
      { name:'Sommerhus-Mægleren',                              phone:'28 43 86 00', note:'Ring til: Carina Gade, indehaver. God – visuelt stærkt fritidsboligsegment.',                                priority:2 },
      { name:'Bolighandel.nu',                                  phone:'29 37 81 81', note:'Ring til: Susanne Skouenborg, ejendomsmægler. God – uafhængig, digital profil.',                             priority:2 },
      { name:'BoligNu.com',                                     phone:'72 17 00 10', note:'Ring til: Bed om indehaveren. God – mindre selvstændigt brand.',                                             priority:2 },
      { name:'Dansk Ejendoms Consult',                          phone:'39 29 29 97', note:'Ring til: Bed om indehaveren. God – uafhængigt rådgivnings-/mæglerfirma.',                                   priority:2 },
      { name:'DomusConnect',                                    phone:'77 30 10 09', note:'Ring til: Bed om indehaveren. God – mindre, selvstændigt team.',                                             priority:2 },
      // ── 221–239: Større teams og netværkskontorer – priority 3 ─────────────
      { name:'Ejendomsmæglerfirmaet Ole Sauer',                 phone:'44 66 15 15', note:'Ring til: Ole Sauer, indehaver. God/mellem – ejerledet, men ring via kontoret.',                            priority:3 },
      { name:'ejendomsmæglergruppen',                           phone:'82 82 28 82', note:'Ring til: Bed om ejer/daglig leder. God/mellem – større team.',                                             priority:3 },
      { name:'Hornbæk Bolig',                                   phone:'60 25 53 26', note:'Ring til: Bed om indehaveren. God/mellem – lokalt premium-/fritidsboligmarked.',                            priority:3 },
      { name:'Lokal Mægleren',                                  phone:'44 98 98 98', note:'Ring til: Bed om indehaveren. God/mellem – lokalt team.',                                                   priority:3 },
      { name:'Ejendomsjuristerne',                              phone:'39 29 49 70', note:'Ring til: Bed om ejer/daglig leder. Mellem – relevant rådgiver.',                                           priority:3 },
      { name:'Ejendomsmæglerfirmaet Ege – Lejre',               phone:'70 29 90 90', note:'Ring til: Bed om indehaveren/daglig leder. Mellem – to lokale butikker.',                                   priority:3 },
      { name:'Min Bolighandel Holstebro',                       phone:'52 58 15 82', note:'Ring til: Anne Dorte Linnebjerg, lokal indehaver. Mellem – netværkstilknytning.',                           priority:3 },
      { name:'Min Bolighandel Horsens',                         phone:'22 14 40 30', note:'Ring til: Peter Jakobsen, lokal indehaver. Mellem – lokal beslutningstager i netværk.',                     priority:3 },
      { name:'Min Bolighandel Kolding',                         phone:'60 52 64 72', note:'Ring til: Bed om lokal indehaver. Mellem – lokalt kontor, fælles koncept.',                                 priority:3 },
      { name:'Min Bolighandel Vejle-Hedensted',                 phone:'27 60 90 32', note:'Ring til: Bed om lokal indehaver. Mellem – lokalt kontor, fælles koncept.',                                 priority:3 },
      { name:'Min Bolighandel Faaborg-Midtfyn',                 phone:'71 78 06 55', note:'Ring til: Lars Tribler, lokal indehaver. Mellem – lokal ejer i mindre kæde.',                               priority:3 },
      { name:'Min Bolighandel Nordfyn',                         phone:'42 68 56 16', note:'Ring til: Peter Kej, lokal indehaver. Mellem – lokal ejer i mindre kæde.',                                  priority:3 },
      { name:'Min Bolighandel Sønderborg & omegn',              phone:'24 25 36 07', note:'Ring til: Michelle Damm, indehaver. Mellem – direkte ejer i netværkskontor.',                               priority:3 },
      { name:'Min Bolighandel Amager',                          phone:'50 90 12 45', note:'Ring til: Nicolas Morille, lokal indehaver. Mellem – lokal ejer, netværkstilknytning.',                     priority:3 },
      { name:'Min Bolighandel Bagsværd, Søborg & Kgs. Lyngby',  phone:'42 48 49 48', note:'Ring til: Anne-Mette Skak Hansen, lokal indehaver. Mellem – flere områder.',                               priority:3 },
      { name:'Min Bolighandel Ballerup & Egedal',               phone:'40 30 40 75', note:'Ring til: Erik Berg, lokal mægler. Mellem – lokalt kontor i netværk.',                                     priority:3 },
      { name:'Min Bolighandel Brønshøj, Herlev & Skovlunde',    phone:'81 59 58 57', note:'Ring til: Michele Møller, lokal indehaver. Mellem – fælles koncept.',                                      priority:3 },
      { name:'Min Bolighandel City',                            phone:'51 33 40 60', note:'Ring til: Simon Christensen, indehaver. Mellem – bymarked, netværksrammer.',                                priority:3 },
      { name:'Min Bolighandel Fjordlandet & Sejerø',            phone:'20 74 75 40', note:'Ring til: Rebecca Lundbech, lokal indehaver. Mellem – ø-/fritidsboligmarked.',                              priority:3 },
      // ── 240–250: Franchisekontorer i større kæde – priority 4 (sidst) ──────
      { name:'RealMæglerne Jesper Faurholm',                    phone:'40 22 81 00', note:'Ring til: Jesper Faurholm, indehaver. Kæde, men stærk – direkte ejertelefon.',                              priority:4 },
      { name:'RealMæglerne Gurli Hansen',                       phone:'56 95 77 95', note:'Ring til: Gurli Hansen, indehaver. Kæde – tydelig lokal ejer; mulig central godkendelse.',                  priority:4 },
      { name:'RealMæglerne Vesterbro',                          phone:'72 31 22 00', note:'Ring til: Bed om lokal indehaver. Kæde – lokalt kontor med aktivt bymarked.',                               priority:4 },
      { name:'RealMæglerne Birkerød & Holte',                   phone:'23 44 01 02', note:'Ring til: Bed om lokal indehaver. Kæde – lokalt kontor; længere beslutningsvej.',                           priority:4 },
      { name:'RealMæglerne City',                               phone:'32 83 06 00', note:'Ring til: Bed om lokal indehaver. Kæde – attraktivt marked, central ramme.',                                priority:4 },
      { name:'RealMæglerne Gribskov',                           phone:'48 30 05 85', note:'Ring til: Bed om lokal indehaver. Kæde – villa-/fritidsboliger.',                                           priority:4 },
      { name:'RealMæglerne Kokkedal-Nivå',                      phone:'49 18 11 00', note:'Ring til: Bed om lokal indehaver. Kæde – aktivt lokalt team, lang vej til nyt setup.',                      priority:4 },
      { name:'RealMæglerne Stenløse',                           phone:'21 48 06 18', note:'Ring til: Bed om lokal indehaver. Kæde – lokalt selvstændigt kontor.',                                      priority:4 },
      { name:'RealMæglerne Søborg & Dyssegård',                 phone:'39 40 01 00', note:'Ring til: Bed om Andersen eller Christiansen. Kæde – lokalt ejerteam, fælles koncept.',                     priority:4 },
      { name:'RealMæglerne Valby',                              phone:'70 22 89 10', note:'Ring til: Bed om lokal indehaver. Kæde – god boligvolumen, længere beslutningsvej.',                        priority:4 },
      { name:'RealMæglerne Vallensbæk',                         phone:'72 13 72 00', note:'Ring til: Bed om lokal indehaver. Kæde – relevant lokalt kontor.',                                          priority:4 },
    ];
    for (const l of newLeads) {
      // Update existing if phone matches (idempotent)
      await pool.query(
        `UPDATE leads
           SET priority = $1
         WHERE owner_email = $2 AND owner_phone = $3`,
        [l.priority, oe, l.phone]
      );
      // Insert if no lead with this phone exists
      await pool.query(
        `INSERT INTO leads (owner_email, name, category, status, owner_phone,
           notes, first_contact_at, follow_up_at, follow_up_1_at, follow_up_1_done,
           follow_up_2_at, follow_up_2_done, priority)
         SELECT $1, $2, 'ejendomsmaegler', 'contacted', $3,
           '[11. aug] ' || $4, $5, $6, $7, false, $8, false, $9
         WHERE NOT EXISTS (
           SELECT 1 FROM leads WHERE owner_email = $1 AND owner_phone = $3
         )`,
        [oe, l.name, l.phone, l.note, ts, fu, fu1, fu2, l.priority]
      );
    }
    console.log('[ensure-schema] leads-151-250: 100 new leads inserted/updated');
  } catch(e: any) { console.error('[ensure-schema] leads-151-250:', e.message); }

  // ── generated_images columns added after initial schema ──────────────────
  {
    const cols = [
      { step: "generated_images.source_image_id", sql: `ALTER TABLE generated_images ADD COLUMN IF NOT EXISTS source_image_id integer` },
      { step: "generated_images.refinement_source_url", sql: `ALTER TABLE generated_images ADD COLUMN IF NOT EXISTS refinement_source_url text` },
    ];
    for (const { step, sql } of cols) {
      try { await pool.query(sql); } catch (e: any) { console.error(`[ensure-schema] ${step}: ${e.message}`); }
    }
  }

  // ── video_jobs table (may be missing in older prod DBs) ───────────────────
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS video_jobs (
      id serial PRIMARY KEY,
      request_id text NOT NULL UNIQUE,
      user_id integer NOT NULL,
      feature text NOT NULL,
      status text NOT NULL DEFAULT 'pending',
      refund_count integer NOT NULL DEFAULT 0,
      created_at timestamp DEFAULT now()
    )`);
  } catch (e: any) { console.error(`[ensure-schema] video_jobs table: ${e.message}`); }

  // ── Always: promote leads that have ACTUALLY been contacted (first_contact_at set) ──
  // Guard: only promote when first_contact_at IS NOT NULL so cold leads (never contacted)
  // keep status='new' and appear in the "kolde leads" section of the telesales view.
  try {
    const r = await pool.query(
      `UPDATE leads SET status='contacted'
       WHERE owner_email='fredefussing@gmail.com'
         AND status='new'
         AND owner_phone IS NOT NULL
         AND first_contact_at IS NOT NULL`
    );
    if ((r.rowCount ?? 0) > 0)
      console.log(`[ensure-schema] status-fix: ${r.rowCount} leads promoted new→contacted`);
  } catch(e: any) { console.error('[ensure-schema] status-fix:', e.message); }

  // ── 50 selvstændige ejendomsmægler-leads (17. aug 2026) — kolde (aldrig kontaktet) ──
  // Kilde: "50 aktive, små og selvstændige ejendomsmægler-leads" (Excel-fil, alle Høj sikkerhed).
  // Indsættes med status='new' og first_contact_at=NULL så de forbliver i "kolde leads".
  try {
    const oe = 'fredefussing@gmail.com';
    const coldLeads: Array<{ name: string; phone: string; officePhone?: string; note: string }> = [
      { name:'iMægler.dk',                             phone:'28 25 98 89', officePhone:'52 88 88 52', note:'Ring til: Jørgen Larsen, indehaver. Selvstændig – Bolig, Sydsjælland.' },
      { name:'Blomstrøm Bolig',                        phone:'28 60 28 61', officePhone:'64 41 10 10', note:'Ring til: Jesper Blomstrøm, indehaver. Selvstændig – Bolig, 5500 Middelfart.' },
      { name:'ASK Ejendomsmægler',                     phone:'22 46 56 09', note:'Ring til: Anette Skaarup, indehaver. Selvstændig – Bolig, 4000 Roskilde.' },
      { name:'Et Nyt Hjem',                            phone:'30 30 88 88', officePhone:'30 30 55 55', note:'Ring til: Michael Mønster / Susanne Axelsen, indehavere. Selvstændig – Bolig, Nordsjælland. Alt. tlf.: 42 46 47 48.' },
      { name:'Ankersø Bolig ApS',                      phone:'21 42 32 33', officePhone:'70 60 80 62', note:'Ring til: Dennis Ankersø Jensen, indehaver. Selvstændig – Bolig og projektsalg, 8541 Skødstrup.' },
      { name:'Favoritbolig',                           phone:'42 43 80 30', officePhone:'88 44 44 07', note:'Ring til: Emil Bjørn Møller / Erland Virenfeldt, indehavere. Selvstændig – Bolig, 8600 Silkeborg. Alt. tlf.: 29 49 80 70.' },
      { name:'MARCO Ejendomsmægler ApS',               phone:'53 83 00 07', officePhone:'53 63 93 02', note:'Ring til: Marco Kluge Jønsson, indehaver. Selvstændig – Bolig og liebhaver, 1256 København K.' },
      { name:'LIVINGDAY',                              phone:'26 83 08 83', officePhone:'76 40 02 82', note:'Ring til: Manja Mikeli Wohlert Conrad, indehaver. Selvstændig – Bolig, 7100 Vejle.' },
      { name:'Samsø Mægleren',                         phone:'70 60 50 33', note:'Ring til: Lone Leth Skyldal, indehaver. Selvstændig – Bolig, 8305 Samsø. (Hovednummer – ingen direkte mobil fundet.)' },
      { name:'Skuffesag',                              phone:'24 47 57 90', note:'Ring til: Rune Julius, indehaver. Selvstændig – Diskret boligsalg (off-market), København.' },
      { name:'Westring Estate',                        phone:'23 83 95 68', officePhone:'70 23 95 68', note:'Ring til: Anni Birgitte Westring, indehaver. Selvstændig – Bolig og liebhaver, Nordsjælland.' },
      { name:'Heideby Estate',                         phone:'24 24 98 98', note:'Ring til: Laura Heideby, indehaver. Selvstændig – Erhverv, 4000 Roskilde. Erhvervsmægler.' },
      { name:'Wennemoes Bolig',                        phone:'24 60 45 14', note:'Ring til: Torben Wennemoes, indehaver. Selvstændig – Bolig, 4000 Roskilde.' },
      { name:'Birgitte Krohn',                         phone:'48 39 39 39', note:'Ring til: Birgitte Krohn, indehaver. Selvstændig – Bolig, 3230 Græsted. (Hovednummer – ingen direkte mobil fundet.)' },
      { name:'INOVA Roskilde',                         phone:'24 44 64 26', officePhone:'20 51 95 19', note:'Ring til: Frederik Gregers Dannisgård Larnæs, indehaver. Selvstændig – Bolig og køberrådgivning, 4000 Roskilde.' },
      { name:'Moestrup Bolig A/S',                     phone:'21 25 03 04', officePhone:'45 93 08 93', note:'Ring til: Ole Moestrup, indehaver. Selvstændig – Bolig, Nordsjælland.' },
      { name:'Ejendomsmægler Find Christensen / Mithus', phone:'22 32 61 55', note:'Ring til: Find Christensen, indehaver. Selvstændig – Bolig, 9940 Læsø. Ø-mægler.' },
      { name:'Ejendomsmægler Peter Blom',              phone:'20 16 41 22', officePhone:'75 91 11 22', note:'Ring til: Peter Blom, indehaver. Selvstændig – Bolig, 6094 Hejls.' },
      { name:'GROVE & GROVE',                          phone:'26 14 57 90', officePhone:'86 10 88 88', note:'Ring til: Hanne Grove Alexandrakis / Mette Grove Elbæk, indehavere. Selvstændig – Bolig, 2880 Bagsværd.' },
      { name:'Byens Mægler Svenstrup',                 phone:'21 18 50 10', officePhone:'98 38 21 20', note:'Ring til: Morten Koch, indehaver. Selvstændig – Bolig, 9230 Svenstrup J.' },
      { name:'BoligKolding',                           phone:'75 52 24 24', note:'Ring til: Erik Steenholdt, indehaver. Selvstændig – Bolig og erhverv, 6000 Kolding. (Hovednummer – ingen direkte mobil fundet.)' },
      { name:'Thorkild Kristensen',                    phone:'96 31 60 00', note:'Ring til: Thorkild Kristensen, indehaver. Selvstændig – Bolig og projekt, Aalborg/Himmerland. To lokale kontorer.' },
      { name:'SKAGEN Mægleren / Calundan',             phone:'40 73 39 20', officePhone:'98 43 43 00', note:'Ring til: Jens Jørgen Calundan, indehaver. Selvstændig – Bolig, 9990 Skagen. To lokale butikker.' },
      { name:'Hesel Erhverv',                          phone:'75 84 01 23', note:'Ring til: Kim Hesel, indehaver. Selvstændig – Erhverv, 7100 Vejle. Erhvervsmægler.' },
      { name:'Asger Olsen A/S',                        phone:'20 20 00 88', officePhone:'62 25 40 88', note:'Ring til: Asger Olsen, indehaver. Selvstændig – Landbrug og liebhaver, Sydfyn.' },
      { name:'FREJS Landbrug & Projektudvikling',      phone:'60 23 59 01', note:'Ring til: Finn Pedersen / Josefine Grønvaldt, indehavere. Selvstændig – Landbrug og projektudvikling, Jylland. Alt. tlf.: 60 23 59 02.' },
      { name:'KUNLejligheder',                         phone:'28 40 25 55', officePhone:'39 30 30 19', note:'Ring til: Nina Flindt Bendixen / Marianne Zwiebler Hansen, indehavere. Selvstændig – Ejerlejligheder (niche), 2920 Charlottenlund. Alt. tlf.: 25 97 97 97.' },
      { name:'Ejendomsmægler Allan Honnens',           phone:'21 22 19 19', note:'Ring til: Allan Honnens, indehaver. Selvstændig – Bolig, 6230 Rødekro.' },
      { name:'Lützau',                                 phone:'60 14 63 35', officePhone:'39 63 63 35', note:'Ring til: Kristian Lützau, indehaver. Selvstændig – Bolig og liebhaver, 2930 Klampenborg.' },
      { name:'Kim Folsted Ejendomsmægler',             phone:'21 79 53 50', note:'Ring til: Kim Folsted, indehaver. Selvstændig – Bolig, 1817 Frederiksberg C.' },
      { name:'Silja Normann Gade',                     phone:'51 46 96 16', note:'Ring til: Silja Normann Gade, indehaver. Selvstændig – Bolig, 3210 Vejby.' },
      { name:'Dansk Boligformidling',                  phone:'20 26 43 64', officePhone:'70 15 90 07', note:'Ring til: Peter Wolff Sander, indehaver. Selvstændig – Bolig, 2900 Hellerup.' },
      { name:'DK-Estate Erhvervsmægler',               phone:'30 15 29 99', officePhone:'70 60 29 99', note:'Ring til: Nicolas Lund Madsen, indehaver. Selvstændig – Erhverv, Sjælland. Erhvervsmægler.' },
      { name:'SØBOE Ejendomme',                        phone:'40 40 01 44', note:'Ring til: Thomas Søboe, indehaver. Selvstændig – Bolig, 2920 Charlottenlund.' },
      { name:'TD mægler ApS',                          phone:'92 15 65 35', officePhone:'70 23 73 88', note:'Ring til: Trine Appel, indehaver. Selvstændig – Bolig, Nordsjælland.' },
      { name:'Beboli',                                 phone:'24 24 65 07', note:'Ring til: Henrik Simonsen, indehaver. Selvstændig – Bolig, 5863 Ferritslev Fyn.' },
      { name:'BilligtHus Mægler ApS',                 phone:'24 90 99 98', officePhone:'70 66 61 11', note:'Ring til: Jesper Struckmann, indehaver. Selvstændig – Bolig, Roskilde/landsdækkende niche.' },
      { name:'Familiemægleren',                        phone:'55 29 05 10', note:'Ring til: Kasper Koldkjær Skov Hindborg, indehaver. Selvstændig – Bolig, Sydsjælland.' },
      { name:'PROAD | Property Advisers',              phone:'28 40 05 22', officePhone:'70 20 30 19', note:'Ring til: Torben Lund, indehaver. Selvstændig – Erhverv/investering/valuar, 2000 Frederiksberg. Erhvervsmægler.' },
      { name:'Falch Erhverv ApS',                     phone:'20 64 39 06', officePhone:'93 90 40 55', note:'Ring til: Steffen Falch, indehaver. Selvstændig – Erhverv, 1959 Frederiksberg C. Erhvervsmægler.' },
      { name:'NEXT ADDRESS ApS',                       phone:'60 57 21 99', officePhone:'39 39 90 00', note:'Ring til: Kenneth Laustsen, indehaver. Selvstændig – Bolig og køberrådgivning, 9000 Aalborg.' },
      { name:'Lokalt Liebhaveri ApS',                  phone:'24 91 48 97', officePhone:'70 27 11 11', note:'Ring til: Jesper Holm / Christian Schjøth / Henrik Kliver, partnere. Selvstændig – Bolig og liebhaver, 8000 Aarhus C. Alt. tlf.: 52 19 48 98 / 22 33 06 68.' },
      { name:'Bundgaard Bolig & Rådgivning',           phone:'60 61 37 11', note:'Ring til: Henrik Michael Kvist Bundgaard, indehaver. Selvstændig – Bolig og rådgivning, 9574 Bælum.' },
      { name:'Nemeth & Juhl',                          phone:'42 91 08 81', officePhone:'31 42 75 75', note:'Ring til: Nanna Frederikke Juhl / Frederik Nemeth Thurøe, ejere. Selvstændig – Bolig og liebhaver, 1306 København K. Alt. tlf.: 53 63 12 25.' },
      { name:'Haraldsted',                             phone:'20 14 39 56', note:'Ring til: Torben Haraldsted, indehaver. Selvstændig – Liebhaver og villa, 2900 Hellerup.' },
      { name:'Tristad',                                phone:'93 92 02 82', officePhone:'93 92 02 73', note:'Ring til: Emil Møller Hauser / Martin Becker Overgaard, ejere. Selvstændig – Erhverv og investering, København. Erhvervsmægler. Alt. tlf.: 93 92 02 81.' },
      { name:'KM Erhverv',                             phone:'42 21 79 09', note:'Ring til: Kent Møller, indehaver. Selvstændig – Erhverv, 7100 Vejle. Erhvervsmægler.' },
      { name:'Pernille Sams Ejendomsmæglerfirma ApS',  phone:'48 21 91 21', note:'Ring til: Pernille Merete Sams, indehaver. Selvstændig – Liebhaver og landejendomme, 3400 Hillerød.' },
      { name:'Byens Bolig',                            phone:'29 21 00 82', officePhone:'53 52 66 00', note:'Ring til: Jonas Jakob Lisberg Lehmann, indehaver. Selvstændig – Bolig og liebhaver, 2900 Hellerup. (Ikke samme firma som Byens Boligpartner.)' },
      { name:'nor:estate',                             phone:'53 80 27 21', note:'Ring til: Ali Kahbazy, indehaver. Selvstændig – Bolig, 1466 København K.' },
    ];
    let inserted = 0;
    for (const l of coldLeads) {
      const r = await pool.query(
        `INSERT INTO leads (owner_email, name, category, status, owner_phone, office_phone,
           notes, first_contact_at, follow_up_at, follow_up_1_at, follow_up_1_done,
           follow_up_2_at, follow_up_2_done, priority)
         SELECT $1, $2, 'ejendomsmaegler', 'new', $3, $4,
           $5, NULL, NULL, NULL, false, NULL, false, 1
         WHERE NOT EXISTS (
           SELECT 1 FROM leads WHERE owner_email = $1 AND owner_phone = $3
         )`,
        [oe, l.name, l.phone, l.officePhone ?? null, l.note]
      );
      if ((r.rowCount ?? 0) > 0) inserted++;
    }
    if (inserted > 0) console.log(`[ensure-schema] cold-leads-50: ${inserted} nye selvstændige leads indsat`);
  } catch(e: any) { console.error('[ensure-schema] cold-leads-50:', e.message); }

  // ── Runde 3: 43 selvstændige mæglere (17. aug 2026) — kolde leads ─────────────
  // Kilde: "50 nye selvstændige ejendomsmæglere – runde 3" (Excel, kontrolleret 17.08.2026).
  // status='new', first_contact_at=NULL → forbliver i "kolde leads" i telesales.
  // For leads uden direkte mobilnr. bruges kontor-tlf. som owner_phone.
  try {
    const oe = 'fredefussing@gmail.com';
    type R3L = { name: string; phone: string; oPhone?: string; note: string };
    const r3Leads: R3L[] = [
      { name:'Lone Levin Ejendomsmægler',                phone:'30 14 10 14',                       note:'Indehaver: Lone Levin | Område: Nordsjælland | Type: Boligsalg | CVR 45962326.' },
      { name:'Botker Bolig',                             phone:'21 42 37 88',                       note:'Indehaver: Sebastian Botker | Område: Sjælland | Type: Ejendomsmægler | Aktiv mæglerregistrering.' },
      { name:'Linda Riis Ejendomsmægler',                phone:'20 77 26 29',                       note:'Indehaver: Linda Riis | Område: Nordsjælland | Type: Boligsalg | CVR 37047538.' },
      { name:'Ejendomsmæglerfirmaet Marianne Møllebro',  phone:'21 80 10 12', oPhone:'48 16 00 12', note:'Indehaver: Marianne Møllebro | Område: Nordsjælland | Type: Boligsalg | CVR 20547332.' },
      { name:'Jenny Eliassen Ejendomsmægler',            phone:'39 20 29 20',                       note:'Indehaver: Jenny Eliassen | Område: København | Type: Boligsalg | CVR 35099530.' },
      { name:'LOKALmæglerne Hornslet',                   phone:'29 41 36 43', oPhone:'86 99 65 77', note:'Indehaver: Jette Dalgaard | Område: Hornslet | Type: Boligsalg | CVR 25161602.' },
      { name:'Flemming Elsborg Bolig',                   phone:'61 10 61 43',                       note:'Indehaver: Flemming Elsborg | Område: Østjylland | Type: Boligsalg.' },
      { name:'CPH Erhverv – Hougaard & Westall',         phone:'21 43 95 90', oPhone:'71 99 22 21', note:'Indehaver: Klaus Hougaard Christensen / Lars Westall | Område: København | Type: Erhvervsmægler | CVR 41892323.' },
      { name:'La Cour & Lykke',                          phone:'33 30 10 50',                       note:'Indehaver: Kristian Hartmann / partnerkredsen | Område: København | Type: Erhvervsmægler | CVR 33965141. (Kontor-tlf.)' },
      { name:'Andelshandel A/S',                         phone:'71 99 69 39',                       note:'Indehaver: Christian Weber | Område: København | Type: Andelsboliger | CVR 35244662.' },
      { name:'Den Alternative Mægler',                   phone:'51 87 35 75',                       note:'Indehaver: Anders Frederiksen | Område: Østjylland | Type: Ejendomsmægler | CVR 25631242.' },
      { name:'Ejendomsmægler Anette Huusfelt',           phone:'47 74 22 55',                       note:'Indehaver: Anette Huusfelt | Område: Frederikssund | Type: Ejendomsmægler | CVR 72977815.' },
      { name:'Ejendomsmæglerfirmaet Jette Birkholm',     phone:'36 75 74 61',                       note:'Indehaver: Jette Birkholm | Område: København | Type: Ejendomsmægler, timeshare | CVR 11915191.' },
      { name:'VW estate / Ejendomsmægler Vibeke Wedel',  phone:'31 12 00 01',                       note:'Indehaver: Vibeke Wedel | Område: Nordsjælland | Type: Boligsalg.' },
      { name:'Søgaard Køberrådgivning',                  phone:'30 88 39 68',                       note:'Indehaver: Anette Søgaard | Område: Nordsjælland | Type: Købers ejendomsmægler.' },
      { name:'City Bolig',                               phone:'70 26 28 30',                       note:'Indehaver: Torsten Smidt | Område: København | Type: Boligsalg.' },
      { name:'Kaiserbolig',                              phone:'22 66 66 66', oPhone:'44 44 44 70', note:'Indehaver: Asher Kaiser / Simon Kaiser | Område: Nordsjælland | Type: Boligsalg.' },
      { name:'Brith Ankjær Købers Ejendomsmægler',       phone:'23 40 00 23',                       note:'Indehaver: Brith Ankjær | Område: Danmark | Type: Købers ejendomsmægler.' },
      { name:'MB Køberrådgivning',                       phone:'20 28 46 15',                       note:'Indehaver: Mikkel Birck | Område: Danmark | Type: Købers ejendomsmægler.' },
      { name:'Skøde og Bolighandel',                     phone:'22 24 44 83',                       note:'Indehaver: Signe Mayland | Område: Danmark | Type: Købers ejendomsmægler.' },
      { name:'RIWAS Køberrådgivning',                    phone:'53 82 56 12',                       note:'Indehaver: Rikke Waadegaard | Område: Danmark | Type: Købers ejendomsmægler.' },
      { name:'Købsmæglerne',                             phone:'22 66 85 57', oPhone:'70 70 86 68', note:'Indehaver: Peter Tang / Katrine Tang | Område: Danmark | Type: Købers ejendomsmægler.' },
      { name:'Køberrådgiverne ApS',                      phone:'23 39 28 60',                       note:'Indehaver: Mia Marie Zerlang Matthiessen | Område: Danmark | Type: Købers ejendomsmægler.' },
      { name:'Køberrådgiver Sara Holms',                 phone:'20 17 59 07',                       note:'Indehaver: Sara Holms | Område: Danmark | Type: Købers ejendomsmægler.' },
      { name:'AIKOPA',                                   phone:'31 55 96 95',                       note:'Indehaver: Pia Bach Kjær / Sussie Andersen | Område: Danmark | Type: Købers ejendomsmægler.' },
      { name:'Center for Køberrådgivning',               phone:'20 27 16 05',                       note:'Indehaver: Jakob Nielsen | Område: Danmark | Type: Købers ejendomsmægler | CVR 46151399.' },
      { name:'BoHer.nu',                                 phone:'25 53 31 13',                       note:'Indehaver: Morten Bo Pedersen | Område: Danmark | Type: Købers ejendomsmægler | CVR 40552057.' },
      { name:'Valuarvurderinger.dk',                     phone:'20 94 75 02', oPhone:'32 55 59 00', note:'Indehaver: Erik Jacobsen | Område: København | Type: Ejendomsmægler og valuar | CVR 72122119.' },
      { name:'Bolig Butikken Aaskov Ejendomscenter',     phone:'97 19 25 00',                       note:'Indehaver: Ebbe Georgi Andersen | Område: Midtjylland | Type: Boligsalg | CVR 25963997. (Kontor-tlf.)' },
      { name:'Tingleff Ejendomme',                       phone:'51 94 49 45',                       note:'Indehaver: Morten Tingleff | Område: Sjælland | Type: Ejendomsmægler | Ejerledet.' },
      { name:'Bolignavigator',                           phone:'60 57 27 99',                       note:'Indehaver: Charlotte Flarup | Område: Danmark | Type: Købers ejendomsmægler.' },
      { name:'MinKøbermægler.dk',                        phone:'42 45 31 71',                       note:'Indehaver: Anders Klingenberg | Område: Danmark | Type: Købers ejendomsmægler | CVR 40626042.' },
      { name:'MDN Boligrådgivning',                      phone:'93 89 40 95',                       note:'Indehaver: Mikkel Dan Nilausen | Område: Danmark | Type: Købers ejendomsmægler | CVR 44405067.' },
      { name:'Consult Property',                         phone:'71 99 14 30',                       note:'Indehaver: Philip Sørensen | Område: København | Type: Købers ejendomsmægler | CVR 44110776.' },
      { name:'Tina Lau Køberrådgivning',                 phone:'93 10 89 99',                       note:'Indehaver: Tina Lau | Område: Danmark | Type: Købers ejendomsmægler | CVR 45057593.' },
      { name:'Lise Ørum Rådgivning',                     phone:'31 51 51 85',                       note:'Indehaver: Lise Ørum | Område: Danmark | Type: Købers ejendomsmægler | CVR 46322975.' },
      { name:'Din-Bolighandel',                          phone:'36 96 54 54',                       note:'Indehaver: Tanja Bjerggaard | Område: Danmark | Type: Ejendomsmægler og køberrådgivning | CVR 37460508. (Kontor-tlf.)' },
      { name:'Rosenqvist ApS',                           phone:'30 25 23 36',                       note:'Indehaver: Ditte Rosenqvist | Område: Sjælland | Type: Købers ejendomsmægler | CVR 38602519.' },
      { name:'Boligrådgivning.com',                      phone:'21 31 91 26',                       note:'Indehaver: Jesper Gelardi Lunde | Område: Danmark | Type: Købers ejendomsmægler | CVR 44719290.' },
      { name:'Boligraadgiver.dk',                        phone:'82 13 10 66',                       note:'Indehaver: Michael Christensen | Område: Danmark | Type: Købers ejendomsmægler | CVR 36053550. (Kontor-tlf.)' },
      { name:'Nøgleklar.dk / HøEg Bolig ApS',           phone:'20 84 80 17', oPhone:'22 38 33 30', note:'Indehaver: Kenneth Egholm / Frank Høholt | Område: Nordsjælland / København | Type: Købers ejendomsmæglere | CVR 46300564.' },
      { name:'Franck Milling ApS',                      phone:'23 43 33 15', oPhone:'70 60 59 33', note:'Indehaver: Franck Milling | Område: Aarhus / Danmark | Type: Købers ejendomsmægler | CVR 37262226.' },
      { name:'Bente Naver Ejendomsrådgivning ApS',       phone:'20 43 75 30', oPhone:'36 44 11 00', note:'Indehaver: Bente Naver | Område: Frederikssund / Danmark | Type: Købers ejendomsmægler | CVR 37361348.' },
    ];
    let inserted = 0;
    for (const l of r3Leads) {
      // Also patch owner_phone on existing dev-inserted rows that have NULL owner_phone
      await pool.query(
        `UPDATE leads SET owner_phone = $3, office_phone = COALESCE(office_phone, $4)
         WHERE owner_email = $1 AND lower(name) = lower($2) AND owner_phone IS NULL`,
        [oe, l.name, l.phone, l.oPhone ?? null]
      );
      const r = await pool.query(
        `INSERT INTO leads (owner_email, name, category, status, owner_phone, office_phone,
           notes, first_contact_at, follow_up_at, follow_up_1_at, follow_up_1_done,
           follow_up_2_at, follow_up_2_done, priority)
         SELECT $1, $2, 'ejendomsmaegler', 'new', $3, $4,
           $5, NULL, NULL, NULL, false, NULL, false, 1
         WHERE NOT EXISTS (
           SELECT 1 FROM leads WHERE owner_email = $1
             AND (owner_phone = $3 OR lower(name) = lower($2))
         )`,
        [oe, l.name, l.phone, l.oPhone ?? null, l.note]
      );
      if ((r.rowCount ?? 0) > 0) inserted++;
    }
    if (inserted > 0) console.log(`[ensure-schema] cold-leads-runde3: ${inserted} nye leads indsat`);
  } catch(e: any) { console.error('[ensure-schema] cold-leads-runde3:', e.message); }

  // ── rendy_jobs: add user_id and videos columns (ownership + delivered URL store) ──
  try {
    await pool.query(`ALTER TABLE rendy_jobs ADD COLUMN IF NOT EXISTS user_id integer REFERENCES users(id)`);
    await pool.query(`ALTER TABLE rendy_jobs ADD COLUMN IF NOT EXISTS videos jsonb`);
    // Best-effort backfill user_id from video_jobs where request_id matches job_id
    await pool.query(`
      UPDATE rendy_jobs rj
         SET user_id = vj.user_id
        FROM video_jobs vj
       WHERE vj.request_id = rj.job_id
         AND rj.user_id IS NULL
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS rendy_jobs_user_id_idx ON rendy_jobs (user_id)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS rendy_jobs_listing_id_idx ON rendy_jobs (listing_id)
    `);
  } catch (e: any) {
    console.error(`[ensure-schema] rendy_jobs columns: ${e.message}`);
  }

  // ── rendy_voice_projects table ────────────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS rendy_voice_projects (
        id                serial PRIMARY KEY,
        user_id           integer NOT NULL REFERENCES users(id),
        listing_id        text NOT NULL,
        source_video_id   text NOT NULL,
        source_edit_revision integer,
        status            text NOT NULL DEFAULT 'processing',
        language          text NOT NULL DEFAULT 'da',
        segments          jsonb,
        subtitles_enabled boolean NOT NULL DEFAULT true,
        source_url        text,
        audio_url         text,
        output_url        text,
        source_input_url  text,
        raw_audio_key     text,
        error             text,
        completed_at      timestamptz,
        lease_token       text,
        lease_expires_at  timestamptz,
        created_at        timestamptz NOT NULL DEFAULT NOW(),
        updated_at        timestamptz NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS rendy_voice_projects_user_id_idx
        ON rendy_voice_projects (user_id)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS rendy_voice_projects_listing_video_idx
        ON rendy_voice_projects (listing_id, source_video_id)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS rendy_voice_projects_lease_idx
        ON rendy_voice_projects (lease_expires_at)
        WHERE status IN ('processing', 'exporting')
    `);
    // Additive columns for pre-existing tables (idempotent)
    for (const col of [
      `ALTER TABLE rendy_voice_projects ADD COLUMN IF NOT EXISTS source_input_url text`,
      `ALTER TABLE rendy_voice_projects ADD COLUMN IF NOT EXISTS raw_audio_key text`,
      `ALTER TABLE rendy_voice_projects ADD COLUMN IF NOT EXISTS completed_at timestamptz`,
      `ALTER TABLE rendy_voice_projects ADD COLUMN IF NOT EXISTS lease_token text`,
      `ALTER TABLE rendy_voice_projects ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz`,
      // Exact rendy_edit_projects.output_revision used to create this narration.
      `ALTER TABLE rendy_voice_projects ADD COLUMN IF NOT EXISTS source_edit_revision integer`,
      // Caption style settings (nullable jsonb — null means use DEFAULT_CAPTION_STYLE)
      `ALTER TABLE rendy_voice_projects ADD COLUMN IF NOT EXISTS caption_style jsonb`,
    ]) {
      await pool.query(col);
    }
  } catch (e: any) {
    console.error(`[ensure-schema] rendy_voice_projects: ${e.message}`);
  }

  // ── rendy_edit_projects: output layers + durable render progress ──────────────
  try {
    await pool.query(
      `ALTER TABLE rendy_edit_projects ADD COLUMN IF NOT EXISTS headline jsonb`,
    );
    await pool.query(
      `ALTER TABLE rendy_edit_projects ADD COLUMN IF NOT EXISTS clean_output_url text`,
    );
    await pool.query(
      `ALTER TABLE rendy_edit_projects ADD COLUMN IF NOT EXISTS progress jsonb`,
    );
    await pool.query(
      `ALTER TABLE rendy_edit_projects ADD COLUMN IF NOT EXISTS progress_attempt integer NOT NULL DEFAULT 0`,
    );
  } catch (e: any) {
    console.error(`[ensure-schema] rendy_edit_projects additive columns: ${e.message}`);
  }

  // ── rendy_voice_projects: headline_snapshot ───────────────────────────────────
  try {
    await pool.query(
      `ALTER TABLE rendy_voice_projects ADD COLUMN IF NOT EXISTS headline_snapshot jsonb`,
    );
  } catch (e: any) {
    console.error(`[ensure-schema] rendy_voice_projects.headline_snapshot: ${e.message}`);
  }

  for (const { step, sql } of statements) {
    try {
      await pool.query(sql);
    } catch (e: any) {
      console.error(`[ensure-schema] ${step} failed: ${e.message}`);
    }
  }
  console.log("[ensure-schema] additive schema check completed");
}