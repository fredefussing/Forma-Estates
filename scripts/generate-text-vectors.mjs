import { CLIPTextModelWithProjection, AutoTokenizer } from "@xenova/transformers";
import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

console.log("Loading CLIP text tokenizer + model...");
const [tokenizer, model] = await Promise.all([
  AutoTokenizer.from_pretrained("Xenova/clip-vit-base-patch32"),
  CLIPTextModelWithProjection.from_pretrained("Xenova/clip-vit-base-patch32"),
]);
console.log("Model loaded.");

const { rows: [{ count }] } = await client.query(
  "SELECT COUNT(*) FROM products WHERE vector_text IS NULL"
);
console.log(`Products needing text embeddings: ${count}`);

const BATCH = 200;
let processed = 0;
let errors = 0;

async function embedText(text) {
  const inputs = await tokenizer([text], { padding: true, truncation: true });
  const { text_embeds } = await model(inputs);
  const raw = Array.from(text_embeds.data);
  const norm = Math.sqrt(raw.reduce((s, v) => s + v * v, 0));
  return norm > 0 ? raw.map(v => v / norm) : raw;
}

while (true) {
  const { rows } = await client.query(
    "SELECT id, name, name_en, tags FROM products WHERE vector_text IS NULL LIMIT $1",
    [BATCH]
  );
  if (rows.length === 0) break;

  for (const row of rows) {
    try {
      const tags = typeof row.tags === "object" ? row.tags : (row.tags ? JSON.parse(row.tags) : {});

      // Prefer English name — CLIP was trained on English
      const baseName = row.name_en || row.name;

      const parts = [baseName];
      if (tags.style && tags.style !== "unknown") parts.push(tags.style);
      if (tags.color && tags.color !== "unknown") parts.push(tags.color);
      if (tags.material && tags.material !== "unknown") parts.push(tags.material);
      if (tags.type && tags.type !== "unknown" && tags.type !== "other") parts.push(tags.type);
      const prompt = parts.join(", ");

      const normalized = await embedText(prompt);

      await client.query("UPDATE products SET vector_text=$1 WHERE id=$2", [
        JSON.stringify(normalized),
        row.id,
      ]);
      processed++;
    } catch (err) {
      errors++;
      console.error(`Error on product ${row.id}: ${err.message}`);
    }
  }

  const pct = Math.round((processed / Number(count)) * 100);
  console.log(`Progress: ${processed}/${count} (${pct}%) — errors: ${errors}`);
}

console.log(`\nDone! Processed ${processed} products (${errors} errors).`);
await client.end();
