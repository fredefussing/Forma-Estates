import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const now = new Date().toLocaleString("da-DK", { timeZone: "Europe/Copenhagen" });
console.log(`Current time: ${now}`);

const { rows } = await client.query(`
  SELECT
    COUNT(*) FILTER (WHERE vector_text IS NOT NULL) AS with_text_vec,
    COUNT(*) FILTER (WHERE vector_text IS NULL)     AS without_text_vec,
    COUNT(*) FILTER (WHERE name_en IS NOT NULL)     AS with_name_en,
    COUNT(*)                                         AS total
  FROM products
`);

const r = rows[0];
console.log(`\nProduct embedding status:`);
console.log(`  Total products:       ${r.total}`);
console.log(`  name_en filled:       ${r.with_name_en}`);
console.log(`  vector_text filled:   ${r.with_text_vec}`);
console.log(`  vector_text missing:  ${r.without_text_vec}`);
console.log(`  Progress:             ${Math.round(r.with_text_vec / r.total * 100)}%`);

await client.end();
