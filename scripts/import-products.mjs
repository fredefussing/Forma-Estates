import fs from 'fs';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function getTag(str, tag) {
  const open = '<' + tag + '>';
  const close = '</' + tag + '>';
  const start = str.indexOf(open);
  if (start === -1) return '';
  const end = str.indexOf(close, start);
  return end === -1 ? '' : str.slice(start + open.length, end).trim();
}

function parseXmlFeed(filepath, shopName) {
  const buf = fs.readFileSync(filepath);
  const xml = buf.toString('latin1').replace(/\r\n/g, '\n');
  const parts = xml.split('<produkt>').slice(1);
  const products = [];
  for (const raw of parts) {
    const p = raw.split('</produkt>')[0];
    const name = getTag(p, 'produktnavn').slice(0, 254);
    const price = parseFloat(getTag(p, 'nypris')) || 0;
    const rawCat = getTag(p, 'kategorinavn') || 'Ukendt';
    const category = rawCat.split(',')[0].trim().slice(0, 49);
    const image_url = getTag(p, 'billedurl');
    const affiliate_link = getTag(p, 'vareurl');
    if (name) {
      products.push({ name, price, category, image_url, affiliate_link, shop: shopName });
    }
  }
  return products;
}

const FEEDS = [
  ['attached_assets/produkter-partnerid56612-Sofa.dk_1776700630532.xml', 'sofa-dk'],
  ['attached_assets/produkter-partnerid56612-Møbelringen_1776629056729.xml', 'moebelringen'],
  ['attached_assets/produkter-partnerid56612-Møbelringen_(1)_1776698330829.xml', 'moebelringen'],
  ['attached_assets/produkter-partnerid56612-Sengefabrikken.dk_1776700811559.xml', 'sengefabrikken'],
  ['attached_assets/produkter-partnerid56612-Storage_And_Shelves_1776700877333.xml', 'storage-and-shelves'],
  ['attached_assets/produkter-partnerid56612-Ro_Collection_1776700933133.xml', 'ro-collection'],
  ['attached_assets/produkter-partnerid56612-Plankoa_1776700985109.xml', 'plankoa'],
  ['attached_assets/produkter-partnerid56612-Organic_Sleep_1776701024052.xml', 'organic-sleep'],
  ['attached_assets/produkter-partnerid56612-DesignShoppen_1776701067917.xml', 'designshoppen'],
  ['attached_assets/produkter-partnerid56612-3-nordic_(1)_1776701185644.xml', '3-nordic'],
  ['attached_assets/produkter-partnerid56612-Boboonline.dk_1776701250519.xml', 'boboonline'],
  ['attached_assets/produkter-partnerid56612-BoligRetning_(1)_1776701330282.xml', 'boligretning'],
];

async function main() {
  const client = await pool.connect();

  try {
    console.log('Opretter tabel products...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        price DECIMAL(10,2),
        category VARCHAR(50),
        image_url TEXT,
        affiliate_link TEXT,
        shop VARCHAR(50),
        network VARCHAR(20) DEFAULT 'partnerads',
        vector_embedding FLOAT[],
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`TRUNCATE TABLE products RESTART IDENTITY`);
    console.log('Tabel klar (truncated).\n');

    console.log('Parser XML-feeds...');
    let allProducts = [];
    for (const [filepath, shop] of FEEDS) {
      const products = parseXmlFeed(filepath, shop);
      console.log(`  ${shop}: ${products.length.toLocaleString('da')} produkter`);
      allProducts = allProducts.concat(products);
    }
    console.log(`\nTotal parsede produkter: ${allProducts.length.toLocaleString('da')}\n`);

    const BATCH_SIZE = 1000;
    let inserted = 0;

    console.log('Indsætter i databasen...');
    for (let i = 0; i < allProducts.length; i += BATCH_SIZE) {
      const batch = allProducts.slice(i, i + BATCH_SIZE);

      const values = [];
      const params = [];
      let paramIdx = 1;

      for (const p of batch) {
        values.push(`($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`);
        params.push(p.name, p.price, p.category, p.image_url, p.affiliate_link, p.shop);
      }

      await client.query(
        `INSERT INTO products (name, price, category, image_url, affiliate_link, shop) VALUES ${values.join(',')}`,
        params
      );

      inserted += batch.length;
      if (inserted % 10000 === 0 || inserted === allProducts.length) {
        console.log(`  Indsat ${inserted.toLocaleString('da')} / ${allProducts.length.toLocaleString('da')}...`);
      }
    }

    console.log('\n✓ Import færdig!\n');

    const countRes = await client.query('SELECT COUNT(*) FROM products');
    console.log(`Total i databasen: ${parseInt(countRes.rows[0].count).toLocaleString('da')} produkter`);

    console.log('\nTop 5 shops:');
    const shopsRes = await client.query(`
      SELECT shop, COUNT(*) as antal
      FROM products
      GROUP BY shop
      ORDER BY antal DESC
      LIMIT 5
    `);
    for (const row of shopsRes.rows) {
      console.log(`  ${row.shop}: ${parseInt(row.antal).toLocaleString('da')}`);
    }

    console.log('\nTop 5 kategorier:');
    const catsRes = await client.query(`
      SELECT category, COUNT(*) as antal
      FROM products
      GROUP BY category
      ORDER BY antal DESC
      LIMIT 5
    `);
    for (const row of catsRes.rows) {
      console.log(`  ${row.category}: ${parseInt(row.antal).toLocaleString('da')}`);
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
