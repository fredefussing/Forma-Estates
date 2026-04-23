import fs from 'fs';
import zlib from 'zlib';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Simple CSV parser that handles quoted fields
function parseCsvLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function parseHomeroomCsv() {
  console.log('Parser Homeroom CSV (gzip)...');
  const buf = fs.readFileSync('attached_assets/datafeed_2863071.csv_1776953358158.gz');
  const text = zlib.gunzipSync(buf).toString('utf8');
  const lines = text.split('\n');
  const headers = parseCsvLine(lines[0]);

  const idx = {
    name: headers.indexOf('product_name'),
    price: headers.indexOf('search_price'),
    category: headers.indexOf('category_name'),
    merchant_category: headers.indexOf('merchant_category'),
    image_url: headers.indexOf('merchant_image_url'),
    aw_image_url: headers.indexOf('aw_image_url'),
    affiliate_link: headers.indexOf('aw_deep_link'),
  };

  const products = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const fields = parseCsvLine(line);
    const rawName = fields[idx.name] || '';
    // Strip shop suffix pattern " - Category - - Homeroom"
    const name = rawName.replace(/\s+-\s+[^-]+-\s+-\s+Homeroom\s*$/, '').trim().slice(0, 254);
    if (!name) continue;

    const price = parseFloat((fields[idx.price] || '0').replace(/[^\d.]/g, '')) || 0;
    const category = (fields[idx.category] || fields[idx.merchant_category] || 'Ukendt').split('>').pop().trim().slice(0, 49);
    const image_url = fields[idx.image_url] || fields[idx.aw_image_url] || '';
    const affiliate_link = fields[idx.affiliate_link] || '';

    products.push({ name, price, category, image_url, affiliate_link, shop: 'homeroom', network: 'awin' });
  }
  console.log(`  Homeroom: ${products.length.toLocaleString('da')} produkter parsede`);
  return products;
}

function getTag(str, tag) {
  const open = '<' + tag + '>';
  const close = '</' + tag + '>';
  const start = str.indexOf(open);
  if (start === -1) return '';
  const end = str.indexOf(close, start);
  return end === -1 ? '' : str.slice(start + open.length, end).trim();
}

function parseNordicdreamXml() {
  console.log('Parser Nordicdream XML...');
  const buf = fs.readFileSync('attached_assets/produkter-partnerid56612-Nordicdream.dk_1776952644195.xml');
  const xml = buf.toString('latin1').replace(/\r\n/g, '\n');
  const parts = xml.split('<produkt>').slice(1);
  const products = [];
  for (const raw of parts) {
    const p = raw.split('</produkt>')[0];
    const name = getTag(p, 'produktnavn').slice(0, 254);
    if (!name) continue;
    const price = parseFloat(getTag(p, 'nypris')) || 0;
    const rawCat = getTag(p, 'kategorinavn') || 'Ukendt';
    const category = rawCat.replace(/_/g, ' ').split(',')[0].trim().slice(0, 49);
    const image_url = getTag(p, 'billedurl');
    const affiliate_link = getTag(p, 'vareurl').replace(/&amp;/g, '&');
    products.push({ name, price, category, image_url, affiliate_link, shop: 'nordicdream', network: 'partnerads' });
  }
  console.log(`  Nordicdream: ${products.length.toLocaleString('da')} produkter parsede`);
  return products;
}

async function insertBatch(client, products, shopName, total) {
  const BATCH_SIZE = 1000;
  let inserted = 0;
  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE);
    const values = [];
    const params = [];
    let idx = 1;
    for (const p of batch) {
      values.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`);
      params.push(p.name, p.price, p.category, p.image_url, p.affiliate_link, p.shop, p.network);
    }
    await client.query(
      `INSERT INTO products (name, price, category, image_url, affiliate_link, shop, network) VALUES ${values.join(',')}`,
      params
    );
    inserted += batch.length;
    if (inserted % 5000 === 0 || inserted === products.length) {
      console.log(`  ${shopName}: Indsat ${inserted.toLocaleString('da')} / ${total.toLocaleString('da')}...`);
    }
  }
  return inserted;
}

async function main() {
  const homeroom = parseHomeroomCsv();
  const nordicdream = parseNordicdreamXml();
  const totalNew = homeroom.length + nordicdream.length;
  console.log(`\nTotal nye produkter at indsætte: ${totalNew.toLocaleString('da')}\n`);

  const client = await pool.connect();
  try {
    console.log('Indsætter Homeroom...');
    const hInserted = await insertBatch(client, homeroom, 'Homeroom', homeroom.length);

    console.log('\nIndsætter Nordicdream...');
    const nInserted = await insertBatch(client, nordicdream, 'Nordicdream', nordicdream.length);

    console.log(`\n✓ Færdig! Indsat i alt: ${(hInserted + nInserted).toLocaleString('da')} nye produkter\n`);

    const totalRes = await client.query('SELECT COUNT(*) FROM products');
    console.log(`Grand total i databasen: ${parseInt(totalRes.rows[0].count).toLocaleString('da')} produkter`);

    const awinRes = await client.query("SELECT COUNT(*) FROM products WHERE network = 'awin'");
    console.log(`  Network = awin:       ${parseInt(awinRes.rows[0].count).toLocaleString('da')}`);

    const paRes = await client.query("SELECT COUNT(*) FROM products WHERE network = 'partnerads'");
    console.log(`  Network = partnerads: ${parseInt(paRes.rows[0].count).toLocaleString('da')}`);

    console.log('\nTop 5 kategorier (nye produkter fra denne kørsel):');
    const catsRes = await client.query(`
      SELECT category, COUNT(*) as antal
      FROM products
      WHERE shop IN ('homeroom', 'nordicdream')
      GROUP BY category
      ORDER BY antal DESC
      LIMIT 5
    `);
    for (const row of catsRes.rows) {
      console.log(`  ${row.category}: ${parseInt(row.antal).toLocaleString('da')}`);
    }

    console.log('\nAlle shops:');
    const shopsRes = await client.query(`
      SELECT shop, COUNT(*) as antal FROM products GROUP BY shop ORDER BY antal DESC
    `);
    for (const row of shopsRes.rows) {
      console.log(`  ${row.shop}: ${parseInt(row.antal).toLocaleString('da')}`);
    }

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('FEJL:', err.message);
  process.exit(1);
});
