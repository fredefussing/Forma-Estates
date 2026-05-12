import OpenAI from "openai";
import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const FETCH_BATCH = 2500;  // rows fetched from DB at a time
const GPT_BATCH   = 50;    // products per API call
const CONCURRENT  = 3;     // parallel API calls at once
const DELAY_MS    = 700;   // ms between rounds — keeps us at ~250 RPM (well under 500 RPM limit)

const { rows: [{ count }] } = await pool.query(
  "SELECT COUNT(*) FROM products WHERE name_en IS NULL"
);
console.log(`Products needing translation: ${count}`);

let processed = 0;
let errors = 0;
const startTime = Date.now();

async function translateChunk(items) {
  const numbered = items.map((it, i) => `${i + 1}. ${it.text}`).join("\n");
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{
      role: "user",
      content: `Translate each Danish product description to concise natural English. Keep brand/model names unchanged.
Return ONLY valid JSON in this exact format: {"translations": ["...", "...", ...]} — same order, no explanations.

${numbered}`,
    }],
    temperature: 0,
    max_tokens: 50 * items.length,
    response_format: { type: "json_object" },
  });

  const raw = res.choices[0].message.content.trim();
  const parsed = JSON.parse(raw);
  const arr = parsed.translations ?? parsed.results ?? parsed.items ?? Object.values(parsed)[0];
  if (!Array.isArray(arr)) throw new Error("No array in response");
  return arr;
}

async function processChunk(items, attempt = 0) {
  try {
    const translations = await translateChunk(items);
    await Promise.all(items.map(async (item, j) => {
      const t = translations[j];
      if (t && typeof t === "string") {
        await pool.query("UPDATE products SET name_en=$1 WHERE id=$2", [t.trim(), item.id]);
        processed++;
      } else {
        errors++;
      }
    }));
  } catch (err) {
    if (err.status === 429 && attempt < 5) {
      // Parse retry-after from error message (e.g. "try again in 8.5s")
      const match = err.message?.match(/try again in (\d+\.?\d*)s/i);
      const retryAfter = match ? Math.ceil(parseFloat(match[1]) * 1000) : (2 ** attempt) * 3000;
      // Add jitter so parallel retries don't hit at the same time
      const jitter = Math.random() * 1000;
      const wait = retryAfter + jitter;
      process.stdout.write(`\n  Rate limit — waiting ${(wait / 1000).toFixed(1)}s (attempt ${attempt + 1})...`);
      await new Promise(r => setTimeout(r, wait));
      return processChunk(items, attempt + 1);
    }
    errors += items.length;
    console.error(`\nChunk error (${items.length} items): ${err.message}`);
  }
}

while (true) {
  const { rows } = await pool.query(
    "SELECT id, name, tags FROM products WHERE name_en IS NULL LIMIT $1",
    [FETCH_BATCH]
  );
  if (rows.length === 0) break;

  // Build text combos
  const items = rows.map(row => {
    const tags = typeof row.tags === "object" ? row.tags : (row.tags ? JSON.parse(row.tags) : {});
    const parts = [row.name];
    if (tags.style    && tags.style    !== "unknown") parts.push(tags.style);
    if (tags.color    && tags.color    !== "unknown") parts.push(tags.color);
    if (tags.material && tags.material !== "unknown") parts.push(tags.material);
    if (tags.type     && tags.type     !== "unknown" && tags.type !== "other") parts.push(tags.type);
    return { id: row.id, text: parts.join(", ") };
  });

  // Split into GPT_BATCH-sized chunks
  const chunks = [];
  for (let i = 0; i < items.length; i += GPT_BATCH) {
    chunks.push(items.slice(i, i + GPT_BATCH));
  }

  // Process CONCURRENT chunks at a time
  for (let i = 0; i < chunks.length; i += CONCURRENT) {
    const batch = chunks.slice(i, i + CONCURRENT);
    await Promise.all(batch.map(processChunk));

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const rate = processed / (elapsed / 60);
    const remaining = Number(count) - processed;
    const eta = rate > 0 ? Math.round(remaining / rate) : "?";
    process.stdout.write(
      `\r${processed}/${count} (${Math.round(processed / Number(count) * 100)}%) — ${Math.round(rate)}/min — ETA: ${eta} min — errors: ${errors}  `
    );

    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  console.log(`\nFetch batch done (${processed} total)`);
}

console.log(`\n\nDone! Translated ${processed} products in ${((Date.now() - startTime) / 60000).toFixed(1)} min (${errors} errors).`);
await pool.end();
