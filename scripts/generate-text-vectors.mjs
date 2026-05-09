import { pipeline } from "@xenova/transformers";
import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

console.log("Loading CLIP text encoder...");
const encoder = await pipeline("feature-extraction", "Xenova/clip-vit-base-patch32");
console.log("Model loaded. Starting text embedding generation...");

const { rows: [{ count }] } = await client.query(
  "SELECT COUNT(*) FROM products WHERE vector_text IS NULL"
);
console.log(`Products needing text embeddings: ${count}`);

const BATCH = 200;
let processed = 0;
let errors = 0;

while (true) {
  const { rows } = await client.query(
    "SELECT id, name, tags FROM products WHERE vector_text IS NULL LIMIT $1",
    [BATCH]
  );
  if (rows.length === 0) break;

  for (const row of rows) {
    try {
      const tags = typeof row.tags === "object" ? row.tags : (row.tags ? JSON.parse(row.tags) : {});

      const parts = [row.name];
      if (tags.style && tags.style !== "unknown") parts.push(tags.style);
      if (tags.color && tags.color !== "unknown") parts.push(tags.color);
      if (tags.material && tags.material !== "unknown") parts.push(tags.material);
      if (tags.type && tags.type !== "unknown" && tags.type !== "other") parts.push(tags.type);
      const prompt = parts.join(", ");

      const out = await encoder(prompt, { pooling: "mean", normalize: false });
      const vec = Array.from(out.data);

      // L2 normalize
      const norm = Math.hypot(...vec);
      const normalized = norm > 0 ? vec.map(v => v / norm) : vec;

      await client.query("UPDATE products SET vector_text=$1 WHERE id=$2", [
        JSON.stringify(normalized),
        row.id,
      ]);
      processed++;
    } catch (err) {
      errors++;
      console.error(`Error on product ${row.id}: ${err.message}`);
      // Mark as processed with null to skip on retry (or leave null to retry)
    }
  }

  const pct = Math.round((processed / Number(count)) * 100);
  console.log(`Progress: ${processed}/${count} (${pct}%) — errors: ${errors}`);
}

console.log(`\n Done! Processed ${processed} products (${errors} errors).`);
await client.end();
