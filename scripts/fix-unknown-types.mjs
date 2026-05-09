#!/usr/bin/env node
import pg from "pg";
import { config } from "dotenv";
config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const TYPE_RULES = [
  [/hjørnesofa/i,                                                             "corner_sofa"],
  [/sofa|chaiselong|sovesofa|\b[23][- ]?pers\b/i,                            "sofa"],
  [/lænestol|hvilestol|armstol|lounge.?chair/i,                               "lounge_chair"],
  [/spisebordsstol|køkkenstol|spisestol/i,                                    "dining_chair"],
  [/barstol/i,                                                                "bar_stool"],
  [/kontorstol/i,                                                             "office_chair"],
  [/\bstol\b/i,                                                               "chair"],
  [/sengebord|natbord|nakkebord/i,                                            "nightstand"],
  [/sofabord|salongbord/i,                                                    "coffee_table"],
  [/sidebord|bakkebord/i,                                                     "side_table"],
  [/konsolbord/i,                                                             "console_table"],
  [/skrivebord|arbejdsbord/i,                                                 "desk"],
  [/spisebord|køkkenbord/i,                                                   "dining_table"],
  [/\bbord\b/i,                                                               "table"],
  [/gulvlampe/i,                                                              "floor_lamp"],
  [/bordlampe/i,                                                              "table_lamp"],
  [/pendel|loftlampe/i,                                                       "pendant"],
  [/væglampe/i,                                                               "wall_lamp"],
  [/lampe|lygte/i,                                                            "lamp"],
  [/spejl/i,                                                                  "mirror"],
  [/bogreol|reolsystem|vægreol|\breol\b|\bhylde\b/i,                         "shelf"],
  [/sideboard|skænk|anretter/i,                                               "sideboard"],
  [/kommode|chiffonier/i,                                                     "cabinet"],
  [/garderobeskab|skoskab|vitrineskab|\bskab\b/i,                             "cabinet"],
  [/\bseng\b|sengestel|\bgavl\b|daybed/i,                                     "bed"],
  [/gulvtæppe|løber|kelim|\btæppe\b/i,                                        "rug"],
  [/\bpude\b|hynde/i,                                                         "pillow"],
  [/\bvase\b|krukke/i,                                                        "vase"],
  [/urtepotte|\bpotte\b|\bplante\b|\bblomst\b/i,                              "plant"],
  [/skulptur|figur|statue|dekoration|\bdekor\b|\bskål\b|\bfad\b/i,            "decor"],
  [/\bur\b|\bvægur\b/i,                                                       "clock"],
];

function guessType(name) {
  for (const [regex, type] of TYPE_RULES) {
    if (regex.test(name)) return type;
  }
  return null;
}

async function main() {
  const { rows: [{ count }] } = await pool.query(
    `SELECT COUNT(*) FROM products WHERE tag_processed=TRUE AND tags->>'type'='unknown'`
  );
  console.log(`Produkter med ukendt type: ${count}`);

  let fixed = 0, fallback = 0;
  const BATCH = 5000;

  while (true) {
    const { rows } = await pool.query(
      `SELECT id, name FROM products WHERE tag_processed=TRUE AND tags->>'type'='unknown' LIMIT $1`,
      [BATCH]
    );
    if (rows.length === 0) break;

    const resolved = [];
    const unresolved = [];

    for (const p of rows) {
      const type = guessType(p.name);
      if (type) resolved.push({ id: p.id, type });
      else unresolved.push(p.id);
    }

    if (resolved.length > 0) {
      const cases = resolved.map(u => `WHEN id=${u.id} THEN '${u.type}'`).join(" ");
      const ids   = resolved.map(u => u.id);
      await pool.query(`
        UPDATE products
        SET tags = jsonb_set(
              jsonb_set(tags, '{type}',    to_jsonb(CASE ${cases} END)),
              '{subtype}', to_jsonb(CASE ${cases} END)
            ),
            tag_processed_at = NOW()
        WHERE id = ANY($1::int[])
      `, [ids]);
      fixed += resolved.length;
    }

    if (unresolved.length > 0) {
      await pool.query(
        `UPDATE products SET tags = jsonb_set(tags, '{type}', '"other"'), tag_processed_at=NOW() WHERE id=ANY($1::int[])`,
        [unresolved]
      );
      fallback += unresolved.length;
    }

    console.log(`  Batch: +${resolved.length} fixet, +${unresolved.length} → "other" | Total fixet: ${fixed}`);
  }

  console.log(`\nFærdig! ${fixed} fixet, ${fallback} sat til "other"`);

  const { rows: types } = await pool.query(
    `SELECT tags->>'type' as type, COUNT(*)::int as count
     FROM products WHERE tag_processed=TRUE
     GROUP BY tags->>'type' ORDER BY count DESC LIMIT 20`
  );
  console.log("\nType-fordeling nu:");
  types.forEach(t => console.log(`  ${t.type}: ${t.count}`));

  await pool.end();
}

main().catch(e => { console.error(e); pool.end().finally(() => process.exit(1)); });
