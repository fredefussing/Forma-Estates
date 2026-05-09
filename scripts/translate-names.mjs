import OpenAI from "openai";
import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const BATCH = 100;
const DELAY_MS = 800;

const { rows: [{ count }] } = await client.query(
  "SELECT COUNT(*) FROM products WHERE name_en IS NULL"
);
console.log(`Products needing translation: ${count}`);

let processed = 0;
let errors = 0;

async function translateText(text) {
  const res = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [{
      role: "user",
      content: `Translate the following Danish product title and descriptors into natural concise English.
Keep brand or model names unchanged.
Return only the English translation — no explanations.
Text: """${text}"""`,
    }],
    temperature: 0,
    max_tokens: 100,
  });
  return res.choices[0].message.content.trim();
}

while (true) {
  const { rows } = await client.query(
    "SELECT id, name, tags FROM products WHERE name_en IS NULL LIMIT $1",
    [BATCH]
  );
  if (rows.length === 0) break;

  for (const row of rows) {
    const tags = typeof row.tags === "object" ? row.tags : (row.tags ? JSON.parse(row.tags) : {});

    const parts = [row.name];
    if (tags.style && tags.style !== "unknown") parts.push(tags.style);
    if (tags.color && tags.color !== "unknown") parts.push(tags.color);
    if (tags.material && tags.material !== "unknown") parts.push(tags.material);
    if (tags.type && tags.type !== "unknown" && tags.type !== "other") parts.push(tags.type);
    const combo = parts.join(", ");

    try {
      const translated = await translateText(combo);
      await client.query("UPDATE products SET name_en=$1 WHERE id=$2", [translated, row.id]);
      processed++;
      if (processed % 50 === 0) {
        const pct = Math.round((processed / Number(count)) * 100);
        console.log(`Progress: ${processed}/${count} (${pct}%) — errors: ${errors}`);
      }
    } catch (err) {
      errors++;
      console.error(`Error on ${row.id} (${row.name.substring(0, 40)}): ${err.message}`);
      // Leave name_en NULL so it retries next run
    }
  }

  console.log(`Batch done (${processed} total) — waiting ${DELAY_MS}ms...`);
  await new Promise(r => setTimeout(r, DELAY_MS));
}

console.log(`\nDone! Translated ${processed} products (${errors} errors).`);
await client.end();
