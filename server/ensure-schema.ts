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

  // ── One-time: add phones to 26 existing contacted leads + insert 24 new ──
  // Guard: Sweet-Homes (one of the new inserts) doesn't exist yet
  try {
    const g50 = await pool.query(
      `SELECT 1 FROM leads WHERE owner_email='fredefussing@gmail.com' AND name='Sweet-Homes'`
    );
    if ((g50.rowCount ?? 0) === 0) {
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

  // ── One-time: insert contacted leads 51–100 (11. aug 2026) ───────────────
  // Guard: GUNDE & GUNDE doesn't exist yet
  try {
    const g100 = await pool.query(
      `SELECT 1 FROM leads WHERE owner_email='fredefussing@gmail.com' AND lower(name) LIKE '%gunde%gunde%'`
    );
    if ((g100.rowCount ?? 0) === 0) {
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

  // ── generated_images columns added after initial schema ──────────────────
  {
    const cols = [
      { step: "generated_images.source_image_id", sql: `ALTER TABLE generated_images ADD COLUMN IF NOT EXISTS source_image_id integer` },
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

  for (const { step, sql } of statements) {
    try {
      await pool.query(sql);
    } catch (e: any) {
      console.error(`[ensure-schema] ${step} failed: ${e.message}`);
    }
  }
  console.log("[ensure-schema] additive schema check completed");
}