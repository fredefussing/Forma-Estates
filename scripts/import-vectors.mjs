import fs from 'fs';
import path from 'path';
import readline from 'readline';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const DATA_DIR = './data';

async function importFile(filepath, client) {
  const filename = path.basename(filepath);
  const stat = fs.statSync(filepath);
  console.log(`\n→ Importerer: ${filename} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);

  // Create temp table for this import (no ON COMMIT DELETE ROWS — we use explicit transaction)
  await client.query(`DROP TABLE IF EXISTS tmp_vectors`);
  await client.query(`
    CREATE TEMP TABLE tmp_vectors (
      id INTEGER,
      vec TEXT
    )
  `);

  const rl = readline.createInterface({
    input: fs.createReadStream(filepath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  let lineNum = 0;
  let skipped = 0;
  let batchIds = [];
  let batchVecs = [];
  const BATCH_SIZE = 200;
  let totalInserted = 0;

  async function flushToTemp() {
    if (batchIds.length === 0) return;
    const values = batchIds.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(',');
    const params = [];
    for (let i = 0; i < batchIds.length; i++) {
      params.push(batchIds[i], batchVecs[i]);
    }
    await client.query(`INSERT INTO tmp_vectors (id, vec) VALUES ${values}`, params);
    totalInserted += batchIds.length;
    batchIds = [];
    batchVecs = [];
    process.stdout.write(`\r  Indlæst: ${totalInserted.toLocaleString('da')} rækker...`);
  }

  for await (const line of rl) {
    lineNum++;
    if (lineNum === 1) continue; // skip header

    const commaIdx = line.indexOf(',');
    if (commaIdx === -1) { skipped++; continue; }

    const id = parseInt(line.slice(0, commaIdx).trim());
    const vecStr = line.slice(commaIdx + 1).trim();
    if (isNaN(id) || !vecStr) { skipped++; continue; }

    // Strip CSV double-quotes if present: "{...}" → {...}
    let vecClean = vecStr;
    if (vecClean.startsWith('"') && vecClean.endsWith('"')) {
      vecClean = vecClean.slice(1, -1);
    }

    // Normalize to {a,b,c} format
    let vec;
    if (vecClean.startsWith('{')) {
      vec = vecClean;
    } else if (vecClean.startsWith('[')) {
      vec = '{' + vecClean.slice(1, -1) + '}';
    } else {
      vec = '{' + vecClean + '}';
    }

    batchIds.push(id);
    batchVecs.push(vec);

    if (batchIds.length >= BATCH_SIZE) {
      await flushToTemp();
    }
  }
  await flushToTemp();
  process.stdout.write('\n');

  console.log(`  Indlæst ${totalInserted.toLocaleString('da')} rækker i temp-tabel, ${skipped} sprunget over`);
  console.log(`  Opdaterer products tabel...`);

  // Bulk UPDATE via JOIN on temp table
  const result = await client.query(`
    UPDATE products p
    SET vector_embedding = t.vec::float8[]
    FROM tmp_vectors t
    WHERE p.id = t.id
  `);

  console.log(`  ✓ Opdaterede ${result.rowCount.toLocaleString('da')} produkter`);

  fs.unlinkSync(filepath);
  console.log(`  ✓ Slettet: ${filename}`);

  return result.rowCount;
}

async function main() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const files = fs.readdirSync(DATA_DIR)
    .filter(f => f.endsWith('.csv'))
    .sort()
    .map(f => path.join(DATA_DIR, f));

  if (files.length === 0) {
    console.log('Ingen CSV-filer fundet i ./data/');
    console.log('Læg vectors_part_X_of_20.csv i ./data/ og kør scriptet igen.');
    await pool.end();
    return;
  }

  console.log(`Fandt ${files.length} fil(er):`);
  files.forEach(f => console.log('  ' + path.basename(f)));

  const client = await pool.connect();
  let totalUpdated = 0;
  const startTime = Date.now();

  try {
    for (const filepath of files) {
      const count = await importFile(filepath, client);
      totalUpdated += count;
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n====================================`);
    console.log(`✓ Færdig: ${totalUpdated.toLocaleString('da')} produkter opdateret på ${elapsed}s`);

    const res = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE vector_embedding IS NOT NULL) as med,
        COUNT(*) FILTER (WHERE vector_embedding IS NULL) as uden,
        COUNT(*) as total
      FROM products
    `);
    const r = res.rows[0];
    console.log(`\nDatabase status:`);
    console.log(`  Med vector:  ${parseInt(r.med).toLocaleString('da')} / ${parseInt(r.total).toLocaleString('da')}`);
    console.log(`  Uden vector: ${parseInt(r.uden).toLocaleString('da')}`);
    const pct = (parseInt(r.med) / parseInt(r.total) * 100).toFixed(1);
    console.log(`  Fremskridt:  ${pct}%`);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('\nFEJL:', err.message);
  console.error(err.stack);
  process.exit(1);
});
