import { pool } from "./db";
import type { FurnitureDescription } from "./describeWithVision";
import { DANISH_SYNONYMS } from "./describeWithVision";

// ── Category mappings ─────────────────────────────────────────────────────────

const YOLO_TO_CATEGORY: Record<string, string[]> = {
  "sofa":         ["Sofaer", "Sovesofaer"],
  "couch":        ["Sofaer", "Sovesofaer"],
  // "Gulvstole" is the biggest chair category (7,256 products!) — floor/accent chairs
  "chair":        ["Stole", "Lænestole", "Gulvstole", "Spisebordsstole", "Barstole"],
  "bed":          ["Senge"],
  "dining table": ["Spiseborde"],
  "table":        ["Sofaborde", "Spiseborde", "Sideborde", "Natborde"],
  "potted plant": ["Plantekrukker"],
  // All lamp subcategories: Loftpendler (1435), Bordlamper (937), Væglamper (834),
  // Loftlamper (459), Gulvlamper (452), Hængende lamper (286), Lamper (174)
  "lamp":         ["Lamper", "Loftpendler", "Bordlamper", "Væglamper", "Loftlamper", "Gulvlamper", "Hængende lamper"],
  "tv":           ["TV-møbler"],
  "book":         ["Bogskabe", "Reoler"],
  "mirror":       ["Spejle"],
  "bench":        ["Stole", "Bænke"],
  "rug":          ["Tæpper"],
  "carpet":       ["Tæpper"],
  "cabinet":      ["Skabe", "Skænke", "Bogskabe", "Opbevaringsskabe"],
  "shelf":        ["Reoler", "Bogskabe", "Væghylder"],
};

const VISION_TYPE_TO_CATEGORY: Record<string, string[]> = {
  "lounge_chair":  ["Lænestole", "Gulvstole", "Stole"],      // Gulvstole: 7256 products!
  "dining_chair":  ["Spisebordsstole", "Stole"],
  "chair":         ["Stole", "Lænestole", "Gulvstole", "Spisebordsstole"],
  "sofa":          ["Sofaer", "Sovesofaer"],
  "coffee_table":  ["Sofaborde"],
  "side_table":    ["Sideborde", "Natborde", "Sofaborde"],
  "dining_table":  ["Spiseborde"],
  "bed":           ["Senge"],
  "nightstand":    ["Natborde", "Sideborde"],
  "lamp":          ["Lamper", "Loftpendler", "Bordlamper", "Væglamper", "Loftlamper", "Gulvlamper", "Hængende lamper"],
  // Specific lamp subtypes (vision prompt now distinguishes these)
  "floor_lamp":    ["Gulvlamper", "Lamper"],
  "table_lamp":    ["Bordlamper", "Lamper"],
  "ceiling_lamp":  ["Loftpendler", "Loftlamper", "Hængende lamper", "Lamper"],
  "wall_lamp":     ["Væglamper", "Lamper"],
  "rug":           ["Tæpper"],
  "cabinet":       ["Skabe", "Skænke", "Opbevaringsskabe", "Bogskabe"],
  "sideboard":     ["Skænke", "Skænke & sideboards"],
  "shelf":         ["Reoler", "Bogskabe", "Væghylder"],
  "mirror":        ["Spejle"],
  "bench":         ["Stole", "Bænke"],
  "table":         ["Sofaborde", "Spiseborde"],
  "wardrobe":      ["Klædeskabe", "Garderobeskabe", "Skabe"],
  "desk":          ["Skriveborde"],
};

// Hard category exclusions per type (applied in SQL — these never enter the candidate pool)
const TYPE_CATEGORY_EXCLUSIONS: Record<string, string[]> = {
  // Sofas: exclude cushions/pillows, outdoor sofas
  "sofa":         ["Hynder til stole", "Sofapuder", "Hyndebetræk", "Udendørs sofaer", "Enheder til udendørs"],
  "couch":        ["Hynder til stole", "Sofapuder", "Hyndebetræk", "Udendørs sofaer", "Enheder til udendørs"],
  // Beds: exclude bedding, sun loungers, mattress toppers
  "bed":          ["Sengetøj", "Solsenge", "Quilttæpper", "Sengetæpper", "Dynebetræk", "Pudebetræk"],
  // Rugs: exclude outdoor rugs, plastic rugs, bed throws
  "rug":          ["Udendørstæpper", "Plasttæpper", "Sengetæpper", "Quilttæpper"],
  // Indoor chairs: exclude garden chairs, bar stools (unless vision says otherwise)
  "lounge_chair": ["Havestole", "Udendørs", "Solsenge"],
  "dining_chair": ["Havestole", "Udendørs", "Solsenge"],
  "chair":        ["Havestole", "Udendørs", "Solsenge"],
  // Lamps: exclude outdoor lamps, lampshades only
  "lamp":         ["Udendørslamper", "Lampeskærme"],
  "floor_lamp":   ["Udendørslamper", "Lampeskærme"],
  "table_lamp":   ["Udendørslamper", "Lampeskærme"],
  "ceiling_lamp": ["Udendørslamper", "Lampeskærme"],
};

// Sofa shape exclusions: when shape=rectangular, exclude these categories in SQL
const RECTANGULAR_SOFA_EXCLUSIONS = ["Hjørnesofaer", "U-sofaer", "chaiselong", "Modulsofaer"];

// Name-level subtype exclusions (regex matched against Danish product name)
const SUBTYPE_NAME_EXCLUSIONS: Record<string, RegExp> = {
  "sofa":         /sofapuder|sofa pude|\bhynde\b|\bpuder\b(?!.*sofa)|puf\b|pouf\b/i,
  "couch":        /sofapuder|sofa pude|\bhynde\b|\bpuder\b(?!.*sofa)|puf\b|pouf\b/i,
  "bed":          /sengetøj|dynebetræk|pudebetræk|sengetæppe|quilttæppe|madrastop/i,
  "rug":          /udendørstæppe|plasttæppe|sengetæppe|quilttæppe/i,
  "lounge_chair": /barstol|havestol|udendørs/i,
  "dining_chair": /barstol|havestol|udendørs/i,
};

const OUTDOOR_TERMS = [
  "udendørs", "have", "terrasse", "solstol", "liggestol",
  "parasol", "balkon", "polyrattan",
];

const SHAPE_TERMS: Record<string, string[]> = {
  "L-shaped":    ["hjørne", "chaiselong", "l-sofa", "venstrevendt", "højrevendt", "modul"],
  "round":       ["rund", "cirkel", "cirkulær"],
  "square":      ["kvadratisk", "firkantet"],
  "rectangular": [],
  "asymmetric":  ["asymmetrisk"],
};

// ── Size signals in product names (Danish + English terms found in Danish product names) ─
// English terms like "king size", "XL" actually appear in Danish product titles
const SIZE_LARGE_TERMS = [
  // Sofas
  "3 personers", "3-personers", "tre pers", "4 personers", "4-personers",
  // General size
  "stor", "bred", "lang", "xl", "xxl", "sektions", "panorama",
  // Beds (dimensions found in product names)
  "180 x 200", "180x200", "200 x 200", "200x200", "king size", "king-size",
  // English terms appearing in Danish product names
  "large", "extra large",
];

const SIZE_SMALL_TERMS = [
  // Sofas
  "2 personers", "2-personers", "to pers", "elskovssofa", "loveseat",
  // General size
  "lille", "kompakt", "mini", "smal", "small",
  // Beds
  "90 x 200", "90x200", "120 x 200", "120x200", "single", "enkelt seng",
  // English terms in Danish names
];

// ── Color term map: English vision color → Danish product name terms ──────────
// IMPORTANT: Scoring checks DANISH product names — so all terms must be Danish
const COLOR_TONE_MAP: Record<string, string[]> = {
  light_oak:     ["eg", "lys eg", "natur eg", "hvidpigmenteret eg", "eg finér", "birk", "ask", "lys træ"],
  warm_oak:      ["eg", "egetræ", "varm eg", "honning eg", "oljet eg"],
  honey_pine:    ["fyr", "fyrretræ", "honning fyr", "lys fyr", "pine"],
  light_birch:   ["birk", "birkefinér", "lys birk", "hvid birk"],
  light_brown:   ["lysebrun", "eg", "oak", "træ", "natur"],
  dark_walnut:   ["valnød", "walnut", "mørk valnød", "mørk eg", "mørkebrun"],
  dark_brown:    ["mørkebrun", "valnød", "brun", "walnut", "espresso", "mokka"],
  espresso:      ["espresso", "mokka", "mørk brun", "mørkebrun"],
  black:         ["sort", "sorte"],
  white:         ["hvid", "hvidt", "off-white", "hvid-"],
  cream:         ["creme", "ecru", "beige", "sandfarvet", "cremefarvet"],
  beige:         ["beige", "natur", "sand", "creme", "ecru", "sandfarvet"],
  warm_grey:     ["grå", "gråbrun", "greige", "varm grå", "taupe"],
  cool_grey:     ["lysegrå", "antracit", "koksgrå", "mørkegrå"],
  gray:          ["grå", "lysegrå", "mørkegrå", "antracit"],
  grey:          ["grå", "lysegrå", "mørkegrå", "antracit"],
  natural:       ["natur", "eg", "naturlig", "ubehandlet", "natur eg"],
  blue:          ["blå", "lyseblå", "mørkeblå", "navy"],
  navy:          ["navy", "mørkeblå", "marineblå"],
  green:         ["grøn", "oliven", "sage", "mosgrøn"],
  olive:         ["oliven", "olivengrøn"],
  pink:          ["lyserød", "rosa"],
  yellow:        ["gul"],
  orange:        ["orange"],
  "light beige": ["beige", "natur", "sand", "creme"],
  "dark walnut": ["valnød", "walnut", "mørkebrun"],
  rattan:        ["rattan", "rotting", "flet"],
};

// ── Helper functions ──────────────────────────────────────────────────────────

function getCategoryKeywords(
  description: FurnitureDescription | null,
  yoloLabel: string,
): string[] {
  const effectiveType = description?.type ?? yoloLabel;
  return (
    VISION_TYPE_TO_CATEGORY[effectiveType.toLowerCase()] ??
    YOLO_TO_CATEGORY[effectiveType.toLowerCase()] ??
    []
  );
}

function getCategoryExclusions(
  description: FurnitureDescription | null,
  yoloLabel: string,
): string[] {
  const type = (description?.type ?? yoloLabel).toLowerCase();
  const exclusions: string[] = [...(TYPE_CATEGORY_EXCLUSIONS[type] ?? [])];

  // Sofa shape-based exclusions
  if (type === "sofa" || yoloLabel === "sofa" || yoloLabel === "couch") {
    if (description?.shape === "rectangular" || description?.shape === "other") {
      exclusions.push(...RECTANGULAR_SOFA_EXCLUSIONS);
    }
    if (description?.size === "small") exclusions.push("3-pers", "U-sofaer", "Hjørnesofaer");
    if (description?.size === "large") exclusions.push("2-pers. sofaer");
  }

  return exclusions;
}

function buildFilterClause(
  categoryKeywords: string[],
  isIndoor: boolean,
  startIdx: number,
  categoryExclusions: string[] = [],
): { clause: string; params: any[] } {
  const params: any[] = [];
  const conditions: string[] = [];
  let idx = startIdx;

  if (categoryKeywords.length > 0) {
    const catConds = categoryKeywords.map(() => `p.category ILIKE $${idx++}`).join(" OR ");
    conditions.push(`(${catConds})`);
    categoryKeywords.forEach((k) => params.push(`%${k}%`));
  }

  if (categoryExclusions.length > 0) {
    const exclConds = categoryExclusions.map(() => `p.category NOT ILIKE $${idx++}`).join(" AND ");
    conditions.push(`(${exclConds})`);
    categoryExclusions.forEach((k) => params.push(`%${k}%`));
  }

  if (isIndoor) {
    const outdoorConds = OUTDOOR_TERMS.map(() => `p.name NOT ILIKE $${idx++}`).join(" AND ");
    conditions.push(`(${outdoorConds})`);
    OUTDOOR_TERMS.forEach((t) => params.push(`%${t}%`));
  }

  return {
    clause: conditions.length > 0 ? `AND ${conditions.join(" AND ")}` : "",
    params,
  };
}

async function getRelaxedCandidates(
  clipVectorParam: string,
  description: FurnitureDescription | null,
  yoloLabel: string,
  limit: number,
  textVectorParam?: string,
): Promise<any[]> {
  const categoryKeywords = getCategoryKeywords(description, yoloLabel);
  const categoryExclusions = getCategoryExclusions(description, yoloLabel);
  const isIndoor = description ? description.indoor !== false : true;

  // ── Dual-vector fusion (CLIP image + text embedding) ─────────────────────────
  // NOTE: text embedding compares English searchText → English name_en (both English ✅)
  if (textVectorParam) {
    const { rows: textRows } = await pool.query(
      "SELECT COUNT(*) FROM products WHERE vector_text IS NOT NULL LIMIT 1"
    );
    const hasTextVectors = parseInt(textRows[0].count, 10) > 0;

    if (hasTextVectors) {
      const { clause: filterClause, params: filterParams } = buildFilterClause(
        categoryKeywords, isIndoor, 3, categoryExclusions
      );

      const clipParams = [clipVectorParam, limit * 2, ...filterParams];
      const textParams = [textVectorParam, limit * 2, ...filterParams];

      const clipSQL = `
        SELECT p.id, p.name, p.price, p.image_url, p.affiliate_link, p.shop, p.category,
               1 - (p.vector_clip <=> $1::vector(512)) AS clip_sim
        FROM products p
        WHERE p.vector_clip IS NOT NULL ${filterClause}
        ORDER BY p.vector_clip <=> $1::vector(512)
        LIMIT $2
      `;

      const textSQL = `
        SELECT p.id,
               1 - (p.vector_text <=> $1::vector(512)) AS text_sim
        FROM products p
        WHERE p.vector_text IS NOT NULL ${filterClause}
        ORDER BY p.vector_text <=> $1::vector(512)
        LIMIT $2
      `;

      const [clipResult, textResult] = await Promise.all([
        pool.query(clipSQL, clipParams),
        pool.query(textSQL, textParams),
      ]);

      const textMap = new Map<number, number>();
      for (const r of textResult.rows) textMap.set(r.id, parseFloat(r.text_sim));

      const merged = clipResult.rows.map((r) => {
        const clipSim = parseFloat(r.clip_sim);
        const textSim = textMap.get(r.id) ?? clipSim * 0.6;
        return {
          ...r,
          clip_similarity: 0.7 * clipSim + 0.3 * textSim,
        };
      });

      merged.sort((a, b) => b.clip_similarity - a.clip_similarity);

      if (merged.length >= 10) {
        console.log(`Fusion CLIP+text: ${merged.length} kandidater`);
        return merged.slice(0, limit);
      }
    }
  }

  // ── CLIP image only ───────────────────────────────────────────────────────────
  const { clause: filterClause, params: filterParams } = buildFilterClause(
    categoryKeywords, isIndoor, 3, categoryExclusions
  );

  const params: any[] = [clipVectorParam, limit, ...filterParams];
  const sql = `
    SELECT p.id, p.name, p.price, p.image_url, p.affiliate_link, p.shop, p.category,
           1 - (p.vector_clip <=> $1::vector(512)) AS clip_similarity
    FROM products p
    WHERE p.vector_clip IS NOT NULL ${filterClause}
    ORDER BY p.vector_clip <=> $1::vector(512)
    LIMIT $2
  `;

  const result = await pool.query(sql, params);
  if (result.rows.length >= 10) {
    console.log(`CLIP-only: ${result.rows.length} kandidater`);
    return result.rows;
  }

  // ── Fallback: primary category keyword only ───────────────────────────────────
  if (categoryKeywords.length > 1) {
    console.log(`${result.rows.length} kandidater — fallback primær kategori`);
    const { clause: c2, params: p2 } = buildFilterClause([categoryKeywords[0]], isIndoor, 3, categoryExclusions);
    const r2 = await pool.query(
      `SELECT p.id, p.name, p.price, p.image_url, p.affiliate_link, p.shop, p.category,
              1 - (p.vector_clip <=> $1::vector(512)) AS clip_similarity
       FROM products p WHERE p.vector_clip IS NOT NULL ${c2}
       ORDER BY p.vector_clip <=> $1::vector(512) LIMIT $2`,
      [clipVectorParam, limit, ...p2]
    );
    if (r2.rows.length >= 10) {
      console.log(`Primær kategori fallback: ${r2.rows.length} kandidater`);
      return r2.rows;
    }
  }

  // ── Last resort: no category, exclusions only ─────────────────────────────────
  console.log(`${result.rows.length} kandidater — bred fallback (ingen kategori)`);
  const { clause: bc, params: bp } = buildFilterClause([], isIndoor, 3, categoryExclusions);
  const br = await pool.query(
    `SELECT p.id, p.name, p.price, p.image_url, p.affiliate_link, p.shop, p.category,
            1 - (p.vector_clip <=> $1::vector(512)) AS clip_similarity
     FROM products p WHERE p.vector_clip IS NOT NULL ${bc}
     ORDER BY p.vector_clip <=> $1::vector(512) LIMIT $2`,
    [clipVectorParam, limit, ...bp]
  );
  console.log(`Bred fallback: ${br.rows.length} kandidater`);
  return br.rows;
}

// ── Scoring functions ─────────────────────────────────────────────────────────
// All scoring checks DANISH product names (p.name) — correct since DB names are Danish

function scoreCategoryMatch(
  productCategory: string,
  description: FurnitureDescription | null,
  yoloLabel: string,
): number {
  const keywords = getCategoryKeywords(description, yoloLabel);
  if (keywords.length === 0) return 0;
  const cat = productCategory.toLowerCase();
  return keywords.some((k) => cat.includes(k.toLowerCase())) ? 1 : 0;
}

function scoreColorMatch(
  productName: string,
  description: FurnitureDescription | null,
  colorTerms: string[],
): number {
  const name = productName.toLowerCase();
  const terms: string[] = [];

  if (description?.color) {
    const colorKey = description.color.toLowerCase().replace(/\s+/g, "_");
    const toneTerms = COLOR_TONE_MAP[colorKey] ?? COLOR_TONE_MAP[description.color.toLowerCase()];
    if (toneTerms) {
      terms.push(...toneTerms);
    } else {
      const da = DANISH_SYNONYMS[colorKey] ?? DANISH_SYNONYMS[description.color.toLowerCase()];
      if (da) terms.push(...da);
    }
  }
  terms.push(...colorTerms);

  if (terms.length === 0) return 0;
  const uniqueTerms = Array.from(new Set(terms));
  const primaryTerms = uniqueTerms.slice(0, 4);
  if (primaryTerms.some((t) => name.includes(t.toLowerCase()))) return 1;
  const secondary = uniqueTerms.slice(4).filter((t) => name.includes(t.toLowerCase())).length;
  return Math.min(secondary * 0.4, 0.6);
}

function scoreMaterialMatch(
  productName: string,
  description: FurnitureDescription | null,
): number {
  if (!description?.material) return 0;
  const matDa = DANISH_SYNONYMS[description.material.toLowerCase()];
  if (!matDa) return 0;
  const name = productName.toLowerCase();
  const matches = matDa.filter((t) => name.includes(t.toLowerCase())).length;
  return Math.min(matches / Math.max(1, matDa.length) * 3, 1);
}

function scoreShapeMatch(
  productName: string,
  description: FurnitureDescription | null,
): number {
  if (!description?.shape) return 0;
  const name = productName.toLowerCase();
  const shapeKey = description.shape as string;

  // Penalty: rectangular search but product is L-shaped/corner
  if (shapeKey === "rectangular" || shapeKey === "other") {
    const lTerms = SHAPE_TERMS["L-shaped"] ?? [];
    return lTerms.some((t) => name.includes(t.toLowerCase())) ? -1.0 : 0;
  }

  const terms = SHAPE_TERMS[shapeKey] ?? DANISH_SYNONYMS[shapeKey] ?? [];
  return terms.some((t) => name.includes(t.toLowerCase())) ? 1 : 0;
}

function scoreSizeMatch(
  productName: string,
  description: FurnitureDescription | null,
): number {
  if (!description?.size || description.size === "medium") return 0;
  const name = productName.toLowerCase();

  if (description.size === "large") {
    const large = SIZE_LARGE_TERMS.some((t) => name.includes(t));
    const small = SIZE_SMALL_TERMS.some((t) => name.includes(t));
    if (small) return -1.5;
    return large ? 0.8 : 0;
  }

  if (description.size === "small") {
    const small = SIZE_SMALL_TERMS.some((t) => name.includes(t));
    const large = SIZE_LARGE_TERMS.some((t) => name.includes(t));
    if (large) return -1.5;
    return small ? 0.8 : 0;
  }

  return 0;
}

// Hard exclusion: pillows, bedding, outdoor products that sneaked through
function scoreSubtypeExclusion(
  productName: string,
  yoloLabel: string,
  description: FurnitureDescription | null,
): number {
  const name = productName.toLowerCase();
  const type = (description?.type ?? yoloLabel).toLowerCase();
  const regex = SUBTYPE_NAME_EXCLUSIONS[type] ?? SUBTYPE_NAME_EXCLUSIONS[yoloLabel.toLowerCase()];
  return regex && regex.test(name) ? -2.0 : 0;
}

function deduplicateByName(scored: any[]): any[] {
  const seen = new Set<string>();
  const result: any[] = [];
  for (const p of scored) {
    const base = p.name
      .replace(/\s*-\s*[^-]+(\/.*)?$/, "")
      .replace(/\d+\s*x\s*\d+(\s*cm)?/gi, "")
      .replace(/\d+\s*cm/gi, "")
      .trim()
      .toLowerCase();
    if (!seen.has(base)) { seen.add(base); result.push(p); }
  }
  return result;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function findSimilarProductsHybrid(
  queryVector: number[],
  topK: number = 5,
  yoloLabel?: string,
  description?: FurnitureDescription | null,
  colorTerms: string[] = [],
  textVector?: number[],
) {
  const vectorParam = JSON.stringify(queryVector);
  const textVectorParam = textVector ? JSON.stringify(textVector) : undefined;
  const label = yoloLabel ?? "";
  const desc = description ?? null;

  const candidates = await getRelaxedCandidates(vectorParam, desc, label, 200, textVectorParam);

  const scored = candidates.map((row) => {
    const clipScore    = parseFloat(row.clip_similarity);
    const categoryScore = scoreCategoryMatch(row.category ?? "", desc, label);
    const colorScore   = scoreColorMatch(row.name, desc, colorTerms);
    const materialScore = scoreMaterialMatch(row.name, desc);
    const shapeScore   = scoreShapeMatch(row.name, desc);
    const sizeScore    = scoreSizeMatch(row.name, desc);
    const subtypeScore = scoreSubtypeExclusion(row.name, label, desc);

    // Weights: CLIP visual 35%, category 18%, color 22% (critical!), material 8%
    const base =
      0.35 * clipScore +
      0.18 * categoryScore +
      0.22 * colorScore +
      0.08 * materialScore;

    // Shape/size as bonuses (+) or penalties (-)
    const shapePenalty = shapeScore < 0 ? shapeScore * 0.20 : shapeScore * 0.07;
    const sizePenalty  = sizeScore  < 0 ? sizeScore  * 0.15 : sizeScore  * 0.10;

    const finalScore = Math.max(-1, base + shapePenalty + sizePenalty + subtypeScore);

    return { ...row, finalScore, clipScore, categoryScore, colorScore, materialScore, shapeScore, sizeScore, subtypeScore };
  });

  scored.sort((a, b) => b.finalScore - a.finalScore);
  const deduped = deduplicateByName(scored);
  const top = deduped.filter((p) => p.finalScore > 0).slice(0, topK + 2);

  console.log(
    `Top 3: ${top.slice(0, 3).map((p) =>
      `"${p.name.substring(0, 26)}" clip=${p.clipScore.toFixed(2)} col=${p.colorScore.toFixed(2)} sz=${p.sizeScore.toFixed(2)} → ${p.finalScore.toFixed(3)}`
    ).join(" | ")}`
  );

  return top.map((p) => ({
    id: p.id, name: p.name, price: p.price,
    image_url: p.image_url, affiliate_link: p.affiliate_link,
    shop: p.shop, similarity: p.finalScore,
  }));
}

export async function findSimilarProducts(
  queryVector: number[],
  topK: number = 5,
  yoloLabel?: string,
) {
  return findSimilarProductsHybrid(queryVector, topK, yoloLabel, null, []);
}
