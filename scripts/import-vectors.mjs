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

  const rl = readline.createInterface({
    input: fs.createReadStream(filepath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  const batch = [];
  let lineNum = 0;
  let imported = 0;
  let skipped = 0;

  const BATCH_SIZE = 500;

  async function flushBatch() {
    if (batch.length === 0) return;
    // Build a multi-row UPDATE using a VALUES list
    const values = [];
    const params = [];
    let idx = 1;
    for (const { id, vec } of batch) {
      values.push(`($${idx++}::int, $${idx++}::float8[])`);
      params.push(id, vec);
    }
    await client.query(
      `UPDATE products SET vector_embedding = v.vec
       FROM (VALUES ${values.join(',')}) AS v(id, vec)
       WHERE products.id = v.id`,
      params
    );
    imported += batch.length;
    batch.length = 0;
    process.stdout.write(`\r  Opdateret: ${imported.toLocaleString('da')} rækker...`);
  }

  for await (const line of rl) {
    lineNum++;
    if (lineNum === 1) continue; // skip header

    const commaIdx = line.indexOf(',');
    if (commaIdx === -1) { skipped++; continue; }

    const id = parseInt(line.slice(0, commaIdx).trim());
    const vecStr = line.slice(commaIdx + 1).trim();

    if (isNaN(id) || !vecStr) { skipped++; continue; }

    // Accept both {a,b,c} and [a,b,c] and plain a,b,c after the first comma
    // PostgreSQL array format: {0.1,0.2,...}
    // Python list format written as string: [0.1, 0.2, ...] or 0.1,0.2,...
    let vec;
    if (vecStr.startsWith('{')) {
      // Already PostgreSQL format — pass as string
      vec = vecStr;
    } else if (vecStr.startsWith('[')) {
      // JSON array → convert to PG array string
      vec = '{' + vecStr.slice(1, -1) + '}';
    } else {
      // Raw comma-separated floats
      vec = '{' + vecStr + '}';
    }

    batch.push({ id, vec });

    if (batch.length >= BATCH_SIZE) {
      await flushBatch();
    }
  }

  await flushBatch();
  process.stdout.write('\n');

  console.log(`  ✓ Færdig: ${imported.toLocaleString('da')} opdateret, ${skipped} sprunget over`);

  // Slet filen efter succesfuld import
  fs.unlinkSync(filepath);
  console.log(`  ✓ Slettet: ${filename}`);

  return imported;
}

async function main() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const files = fs.readdirSync(DATA_DIR)
    .filter(f => f.endsWith('.csv'))
    .sort()
    .map(f => path.join(DATA_DIR, f));

  if (files.length === 0) {
    console.log('Ingen CSV-filer fundet i ./data/');
    console.log('Læg vectors_part_X_of_20.csv filer i ./data/ mappen og kør scriptet igen.');
    await pool.end();
    return;
  }

  console.log(`Fandt ${files.length} fil(er) at importere:`);
  files.forEach(f => console.log('  ' + path.basename(f)));

  const client = await pool.connect();
  let totalImported = 0;
  const startTime = Date.now();

  try {
    for (const filepath of files) {
      const count = await importFile(filepath, client);
      totalImported += count;
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n====================================`);
    console.log(`✓ Alt importeret: ${totalImported.toLocaleString('da')} produkter opdateret`);
    console.log(`  Tid: ${elapsed} sekunder`);

    // Status
    const res = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE vector_embedding IS NOT NULL) as med_vector,
        COUNT(*) FILTER (WHERE vector_embedding IS NULL) as uden_vector,
        COUNT(*) as total
      FROM products
    `);
    const r = res.rows[0];
    console.log(`\nStatus i databasen:`);
    console.log(`  Med vector:    ${parseInt(r.med_vector).toLocaleString('da')}`);
    console.log(`  Uden vector:   ${parseInt(r.uden_vector).toLocaleString('da')}`);
    console.log(`  Total:         ${parseInt(r.total).toLocaleString('da')}`);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('FEJL:', err.message);
  process.exit(1);
});
