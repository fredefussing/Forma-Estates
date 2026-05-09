import { pool } from "./db";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface MatchedProduct {
  id: number;
  name: string;
  price: number | null;
  image: string;
  shop: string;
  link: string;
  tags: Record<string, any>;
  score: number;
}

// ─── TRIN 1: Vision beskriver AI-billede ─────────────────────────────────────

export async function describeAiImage(imageUrl: string): Promise<string> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{
      role: "user",
      content: [
        {
          type: "text",
          text: `Describe this AI-generated room design. Focus on the 3-6 most visible furniture pieces and decorative objects.
For each: type, color, material, style.
Format: "Grey fabric sofa 3-seat scandinavian. Round oak coffee table. Floor lamp brass modern. Green plant in pot. White rug."`,
        },
        { type: "image_url", image_url: { url: imageUrl } },
      ],
    }],
    max_tokens: 300,
    temperature: 0.1,
  });
  return response.choices[0].message.content || "";
}

// ─── TRIN 2: Parse beskrivelse til søgeparametre ──────────────────────────────

interface ParsedDescription {
  types: string[];
  colors: string[];
  materials: string[];
  styles: string[];
  excludeTypes: string[];
}

// Type names MUST match what's stored in DB tags->>'type'
const TYPE_MAP: Record<string, RegExp> = {
  sofa:           /sofa|couch|chaise|sectional|loveseat/i,
  lounge_chair:   /lounge chair|armchair|recliner|accent chair|wingback/i,
  dining_chair:   /dining chair|side chair|kitchen chair/i,
  bar_stool:      /bar stool|counter stool/i,
  office_chair:   /office chair|desk chair/i,
  chair:          /\bchair\b/i,
  coffee_table:   /coffee table|cocktail table/i,
  dining_table:   /dining table|kitchen table|dinner table/i,
  side_table:     /side table|end table|accent table/i,
  console_table:  /console table|hallway table/i,
  desk:           /\bdesk\b|writing table|work table/i,
  table:          /\btable\b/i,
  floor_lamp:     /floor lamp/i,
  table_lamp:     /table lamp|desk lamp/i,
  pendant:        /pendant|chandelier|ceiling lamp|hanging lamp/i,
  wall_lamp:      /wall lamp|sconce/i,
  lamp:           /\blamp\b|\blight\b|\blighting\b/i,
  mirror:         /\bmirror\b/i,
  shelf:          /\bshelf\b|\bshelves\b|\bbookcase\b|\bbookshelf\b|\bshelving\b/i,
  sideboard:      /sideboard|buffet|credenza/i,
  cabinet:        /cabinet|dresser|chest|wardrobe|commode/i,
  bed:            /\bbed\b|bedframe|headboard/i,
  rug:            /\brug\b|carpet|mat\b/i,
  pillow:         /\bpillow\b|cushion/i,
  plant:          /\bplant\b|\btree\b|greenery|potted/i,
  vase:           /\bvase\b/i,
  art:            /poster|artwork|painting|print|wall art/i,
  decor:          /\bdecor\b|\bornament\b|sculpture|figurine/i,
};

// Colors stored as Danish in DB
const COLOR_MAP: Record<string, RegExp> = {
  grå:      /\bgrey\b|\bgray\b|\bcharcoal\b|\banthra/i,
  hvid:     /\bwhite\b|\boff-white\b|\bcream\b|\bivory\b|\bsnow\b/i,
  sort:     /\bblack\b|\bdark\b|\bmat black\b/i,
  beige:    /\bbeige\b|\bsand\b|\btaupe\b|\bnude\b|\becru\b|\bneutral\b/i,
  brun:     /\bbrown\b|\bwalnut\b|\bchocolate\b|\bcognac\b/i,
  blå:      /\bblue\b|\bnavy\b|\bmarine\b|\bpetrol\b|\bteal\b/i,
  grøn:     /\bgreen\b|\bolive\b|\bsage\b|\bemerald\b|\bforest\b/i,
  gul:      /\byellow\b|\bmustard\b|\bocre\b|\bgold\b|\bambient\b/i,
  rød:      /\bred\b|\brust\b|\bterracotta\b|\bburgundy\b|\bbordeaux\b/i,
  lyserød:  /\bpink\b|\brose\b|\bblush\b|\bdusky\b/i,
  lilla:    /\bpurple\b|\bviolet\b|\blavender\b|\bmauve\b/i,
};

// Materials
const MATERIAL_MAP: Record<string, RegExp> = {
  oak:      /\boak\b|\bteak\b/i,
  wood:     /\bwood\b|\bwooden\b|\bwalnut\b|\bbirch\b|\bpine\b|\bamboo\b|\brattan\b/i,
  metal:    /\bmetal\b|\bsteel\b|\biron\b|\baluminium\b|\bchrome\b/i,
  brass:    /\bbrass\b|\bcopper\b|\bgold\b/i,
  velvet:   /\bvelvet\b|\bvelour\b|\bfabric\b|\bupholstered\b/i,
  leather:  /\bleather\b|\bfaux leather\b/i,
  fabric:   /\bfabric\b|\bcloth\b|\blinen\b|\bcotton\b|\bwool\b/i,
  marble:   /\bmarble\b|\bstone\b|\bgranite\b/i,
  glass:    /\bglass\b/i,
  ceramic:  /\bceramic\b|\bporcelain\b|\bstoneware\b/i,
};

// Style map
const STYLE_MAP: Record<string, RegExp> = {
  scandinavian: /scandinavian|nordic|minimalist|hygge|simple|clean lines/i,
  modern:       /modern|contemporary|sleek|minimalist/i,
  industrial:   /industrial|raw|urban|factory|loft/i,
  luxury:       /luxury|premium|opulent|elegant|high-end/i,
  coastal:      /coastal|beach|nautical|seaside|airy/i,
  bohemian:     /boho|bohemian|eclectic|colorful|ethnic/i,
  midcentury:   /mid.century|retro|50s|60s|eames|organic/i,
  farmhouse:    /farmhouse|rustic|country|cottage|distressed/i,
  japandi:      /japandi|japanese|zen|wabi|minimal|natural/i,
};

// Objects that should exclude certain furniture types from results
// e.g. if image has a plant, don't show sofas labeled as plants
const EXCLUDE_MAP: Record<string, string[]> = {
  plant:  ["sofa", "bed", "table", "cabinet", "shelf", "lamp", "mirror", "rug", "chair"],
  vase:   ["sofa", "bed", "cabinet", "shelf", "lamp", "rug", "chair"],
  art:    ["sofa", "bed", "cabinet", "lamp", "rug", "chair"],
  pillow: ["table", "cabinet", "shelf", "lamp", "rug", "mirror", "plant", "vase"],
};

function parseDescription(desc: string): ParsedDescription {
  const found: ParsedDescription = {
    types: [], colors: [], materials: [], styles: [], excludeTypes: [],
  };

  for (const [type, rx] of Object.entries(TYPE_MAP)) {
    if (rx.test(desc)) found.types.push(type);
  }
  for (const [color, rx] of Object.entries(COLOR_MAP)) {
    if (rx.test(desc)) found.colors.push(color);
  }
  for (const [mat, rx] of Object.entries(MATERIAL_MAP)) {
    if (rx.test(desc)) found.materials.push(mat);
  }
  for (const [style, rx] of Object.entries(STYLE_MAP)) {
    if (rx.test(desc)) found.styles.push(style);
  }

  // Build exclusion list from detected decorative items
  const excludeSet = new Set<string>();
  for (const type of found.types) {
    const excl = EXCLUDE_MAP[type];
    if (excl) excl.forEach(e => excludeSet.add(e));
  }
  found.excludeTypes = [...excludeSet];

  return found;
}

// ─── TRIN 3: Hybrid tag-baseret søgning ──────────────────────────────────────

const PRICE_RANGES: Record<string, [number, number]> = {
  budget:   [0,     5000],
  standard: [1000, 15000],
  luxury:   [8000, 999999],
};

export async function findProductsForDesign(
  aiImageUrl: string,
  roomType: string,
  styleParam: string,
  budget: string | number | null,
  limit: number = 8,
): Promise<MatchedProduct[]> {
  const description = await describeAiImage(aiImageUrl);
  const parsed = parseDescription(description);

  console.log("[ProductMatcher] AI description:", description);
  console.log("[ProductMatcher] Parsed types:", parsed.types, "colors:", parsed.colors);

  const targetStyle = parsed.styles[0] || styleParam || "scandinavian";
  const budgetKey = typeof budget === "number"
    ? (budget < 25000 ? "budget" : budget < 80000 ? "standard" : "luxury")
    : (budget as string) || "standard";
  const [minPrice, maxPrice] = PRICE_RANGES[budgetKey] || [0, 999999];
  const midPrice = (minPrice + maxPrice) / 2;
  const priceRange = Math.max(maxPrice - minPrice, 1);

  // Build parameterized query
  const params: any[] = [targetStyle, minPrice, maxPrice, limit * 3];
  let idx = 5;

  const typeCondition = parsed.types.length > 0
    ? `AND tags->>'type' = ANY($${idx++}::text[])`
    : "";
  if (parsed.types.length > 0) params.push(parsed.types);

  const excludeCondition = parsed.excludeTypes.length > 0
    ? `AND tags->>'type' != ALL($${idx++}::text[])`
    : "";
  if (parsed.excludeTypes.length > 0) params.push(parsed.excludeTypes);

  const colorIdxStart = idx;
  const colorCondition = parsed.colors.length > 0
    ? `AND (tags->>'color' = ANY($${idx++}::text[]) OR tags->>'color_family' = ANY($${idx - 1}::text[]))`
    : "";
  if (parsed.colors.length > 0) params.push(parsed.colors);

  const matIdxStart = idx;
  const materialCondition = parsed.materials.length > 0
    ? `AND (tags->>'material' = ANY($${idx++}::text[]) OR tags->>'material_family' = ANY($${idx - 1}::text[]))`
    : "";
  if (parsed.materials.length > 0) params.push(parsed.materials);

  // Scoring: type=40, color=25, style=20, material=15
  const typeScore    = parsed.types.length > 0    ? `CASE WHEN tags->>'type' = ANY($5::text[]) THEN 40 ELSE 0 END` : "0";
  const colorScore   = parsed.colors.length > 0   ? `CASE WHEN tags->>'color' = ANY($${colorIdxStart}::text[]) THEN 25 ELSE 0 END` : "0";
  const styleScore   = `CASE WHEN tags->>'style' = $1 THEN 20 ELSE (CASE WHEN tags->>'style' = 'unknown' THEN 5 ELSE 0 END) END`;
  const matScore     = parsed.materials.length > 0 ? `CASE WHEN tags->>'material' = ANY($${matIdxStart}::text[]) THEN 15 ELSE 0 END` : "0";
  const priceScore   = `GREATEST(0, 10 - ABS(price::float - ${midPrice}) / ${priceRange} * 10)`;

  const buildSql = `
    SELECT
      id, name, price::float, image_url, shop, affiliate_link, tags,
      (${typeScore} + ${colorScore} + ${styleScore} + ${matScore} + ${priceScore}) AS score
    FROM products
    WHERE tag_processed = TRUE
      AND price >= $2 AND price <= $3
      AND tags->>'type' NOT IN ('other', 'outdoor', 'seasonal', 'lighting_accessory', 'curtain', 'mattress', 'headboard', 'bathroom_cabinet', 'tableware', 'storage')
      ${typeCondition}
      ${excludeCondition}
      ${colorCondition}
      ${materialCondition}
    ORDER BY score DESC, tag_confidence DESC
    LIMIT $4
  `;

  const { rows } = await pool.query(buildSql, params);

  // Fallback: style-only search if too few results
  if (rows.length < 4) {
    const { rows: fallback } = await pool.query(`
      SELECT id, name, price::float, image_url, shop, affiliate_link, tags,
        CASE WHEN tags->>'style' = $1 THEN 20 ELSE 5 END AS score
      FROM products
      WHERE tag_processed = TRUE
        AND price >= $2 AND price <= $3
        AND tags->>'type' NOT IN ('other', 'outdoor', 'seasonal', 'lighting_accessory', 'curtain', 'mattress', 'headboard', 'bathroom_cabinet', 'tableware', 'storage')
      ORDER BY score DESC, tag_confidence DESC, random()
      LIMIT $4
    `, [targetStyle, minPrice, maxPrice, limit]);

    return fallback.map(r => ({
      id: r.id, name: r.name, price: r.price,
      image: r.image_url, shop: r.shop, link: r.affiliate_link,
      tags: r.tags || {}, score: Number(r.score),
    }));
  }

  return rows.slice(0, limit).map(r => ({
    id: r.id, name: r.name, price: r.price,
    image: r.image_url, shop: r.shop, link: r.affiliate_link,
    tags: r.tags || {}, score: Number(r.score),
  }));
}

// ─── TRIN 4: Shop This Style (grupperet per type) ─────────────────────────────

// Priority order for room furniture types
const TYPE_PRIORITY: Record<string, string[]> = {
  "living room":   ["sofa", "lounge_chair", "coffee_table", "floor_lamp", "rug", "shelf", "side_table"],
  "bedroom":       ["bed", "nightstand", "lamp", "rug", "cabinet", "lounge_chair"],
  "kitchen":       ["dining_table", "dining_chair", "pendant", "cabinet", "shelf"],
  "dining room":   ["dining_table", "dining_chair", "pendant", "sideboard", "rug"],
  "home office":   ["desk", "office_chair", "lamp", "shelf", "cabinet"],
  "default":       ["sofa", "lounge_chair", "table", "lamp", "rug", "shelf"],
};

export async function getShopThisStyle(
  aiImageUrl: string,
  roomType: string,
  style: string,
  budget: string | number | null,
  limit: number = 8,
): Promise<MatchedProduct[]> {
  const all = await findProductsForDesign(aiImageUrl, roomType, style, budget, limit * 3);

  // Group by furniture type
  const grouped: Record<string, MatchedProduct[]> = {};
  for (const p of all) {
    const type = (p.tags?.type as string) || "other";
    if (type === "other") continue;
    if (!grouped[type]) grouped[type] = [];
    grouped[type].push(p);
  }

  // Prioritize types based on room
  const priority = TYPE_PRIORITY[roomType] || TYPE_PRIORITY["default"];
  const selected: MatchedProduct[] = [];

  // First: pick top product from each priority type
  for (const type of priority) {
    const items = grouped[type];
    if (items && items.length > 0) {
      selected.push(items[0]);
      if (selected.length >= limit) break;
    }
  }

  // Fill remaining slots with best scoring products from any type
  if (selected.length < limit) {
    const usedIds = new Set(selected.map(p => p.id));
    for (const items of Object.values(grouped)) {
      for (const item of items) {
        if (!usedIds.has(item.id)) {
          selected.push(item);
          usedIds.add(item.id);
          if (selected.length >= limit) break;
        }
      }
      if (selected.length >= limit) break;
    }
  }

  return selected.slice(0, limit);
}
