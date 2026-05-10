import OpenAI from "openai";
import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const FETCH_BATCH = 500;   // rows fetched from DB at a time
const GPT_BATCH   = 20;    // products translated per API call
const DELAY_MS    = 200;   // pause between API calls (ms)

const { rows: [{ count }] } = await client.query(
  "SELECT COUNT(*) FROM products WHERE name_en IS NULL"
);
console.log(`Products needing translation: ${count}`);

let processed = 0;
let errors = 0;

async function translateBatch(items) {
  // items = [{ id, text }, ...]
  const numbered = items.map((it, i) => `${i + 1}. ${it.text}`).join("\n");

  const res = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [{
      role: "user",
      content: `Translate each of the following Danish product descriptions to concise natural English.
Keep brand names and model names unchanged.
Return ONLY a JSON object in this exact format: {"translations": ["...", "...", ...]}
Same order as input. No explanations.

${numbered}`,
    }],
    temperature: 0,
    max_tokens: 60 * items.length,
    response_format: { type: "json_object" },
  });

  const raw = res.choices[0].message.content.trim();
  let parsed;
  try {
    parsed = JSON.parse(raw);
    const arr = parsed.translations ?? parsed.results ?? parsed.items ?? Object.values(parsed)[0];
    if (Array.isArray(arr)) return arr;
  } catch (_) {}

  // Fallback: one call per item if JSON parsing fails
  console.warn("JSON parse failed, falling back to individual calls");
  return await Promise.all(items.map(async (it) => {
    const r = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{
        role: "user",
        content: `Translate to English (keep brand/model names): "${it.text}"\nReturn only the translation.`,
      }],
      temperature: 0,
      max_tokens: 80,
    });
    return r.choices[0].message.content.trim();
  }));
}

while (true) {
  const { rows } = await client.query(
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

  // Process in GPT_BATCH-sized chunks
  for (let i = 0; i < items.length; i += GPT_BATCH) {
    const chunk = items.slice(i, i + GPT_BATCH);
    try {
      const translations = await translateBatch(chunk);
      for (let j = 0; j < chunk.length; j++) {
        const translation = translations[j];
        if (translation && typeof translation === "string") {
          await client.query("UPDATE products SET name_en=$1 WHERE id=$2", [
            translation.trim(), chunk[j].id,
          ]);
          processed++;
        } else {
          errors++;
          console.warn(`No translation for id ${chunk[j].id}`);
        }
      }
    } catch (err) {
      if (err.status === 429) {
        // Rate limit — wait and retry once
        const wait = 15000;
        console.warn(`Rate limit hit — waiting ${wait / 1000}s before retry...`);
        await new Promise(r => setTimeout(r, wait));
        i -= GPT_BATCH; // retry this chunk
        continue;
      }
      errors++;
      console.error(`Batch error (ids ${chunk[0].id}–${chunk[chunk.length-1].id}): ${err.message}`);
    }

    const pct = Math.round((processed / Number(count)) * 100);
    if (processed % 500 === 0 || i === 0) {
      console.log(`Progress: ${processed}/${count} (${pct}%) — errors: ${errors}`);
    }
    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  console.log(`Fetch batch done (${processed} total)`);
}

console.log(`\nDone! Translated ${processed} products (${errors} errors).`);
await client.end();
