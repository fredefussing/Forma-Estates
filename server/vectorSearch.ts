import { pool } from "./db";
import type { FurnitureDescription } from "./describeWithVision";
import { DANISH_SYNONYMS } from "./describeWithVision";

const YOLO_TO_CATEGORY: Record<string, string[]> = {
  "sofa":         ["Sofaer", "Sovesofaer"],
  "couch":        ["Sofaer", "Sovesofaer"],
  "chair":        ["Stole", "Lænestole", "Spisebordsstole", "Gulvstole", "Barstole"],
  "bed":          ["Senge"],
  "dining table": ["Spiseborde"],
  "table":        ["Sofaborde", "Spiseborde", "Sideborde"],
  "potted plant": ["Plantekrukker"],
  "lamp":         ["Lamper"],
  "tv":           ["TV-møbler"],
  "book":         ["Bogskabe"],
  "mirror":       ["Spejle"],
  "bench":        ["Stole"],
  "rug":          ["Tæpper"],
  "carpet":       ["Tæpper"],
  "cabinet":      ["Skabe", "Skænke"],
  "shelf":        ["Reoler", "Bogskabe"],
};

const VISION_TYPE_TO_CATEGORY: Record<string, string[]> = {
  "lounge_chair": ["Lænestole", "Stole"],
  "dining_chair": ["Spisebordsstole", "Stole"],
  "chair":        ["Stole", "Lænestole", "Gulvstole", "Spisebordsstole"],
  "sofa":         ["Sofaer", "Sovesofaer"],
  "coffee_table": ["Sofaborde"],
  "side_table":   ["Sofaborde", "Sideborde", "Natborde"],
  "dining_table": ["Spiseborde"],
  "bed":          ["Senge"],
  "nightstand":   ["Natborde"],
  "lamp":         ["Lamper"],
  "rug":          ["Tæpper"],
  "cabinet":      ["Skabe", "Skænke"],
  "shelf":        ["Reoler", "Bogskabe"],
  "mirror":       ["Spejle"],
  "bench":        ["Stole"],
  "table":        ["Sofaborde", "Spiseborde"],
};

// Categories that should ALWAYS be excluded for a given furniture type
const TYPE_CATEGORY_EXCLUSIONS: Record<string, string[]> = {
  "sofa":  ["Hynder til stole", "Sofapuder", "Hyndebetræk", "Udendørs"],
  "couch": ["Hynder til stole", "Sofapuder", "Hyndebetræk", "Udendørs"],
};

// Shape → categories to EXCLUDE when shape is rectangular (no L/chaise)
const RECTANGULAR_SOFA_EXCLUSIONS = ["Hjørnesofaer", "U-sofaer", "chaiselong", "Modulsofaer"];

// Name-level subtype exclusions: regex per type
const SUBTYPE_NAME_EXCLUSIONS: Record<string, RegExp> = {
  "sofa":  /sofapuder|sofa pude|\bhynde\b|\bpuder\b(?!.*sofa)|puf\b|pouf\b|fodskammel(?!.*sofa)/i,
  "couch": /sofapuder|sofa pude|\bhynde\b|\bpuder\b(?!.*sofa)|puf\b|pouf\b/i,
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

// Size signals in product names
const SIZE_LARGE_TERMS = ["3 personers", "3-personers", "tre pers", "4 personers", "stor", "bred", "lang", "xl", "xxl", "sektions", "panorama"];
const SIZE_SMALL_TERMS = ["2 personers", "2-personers", "to pers", "elskovssofa", "loveseat", "lille", "kompakt", "mini", "smal", "small"];

const COLOR_TONE_MAP: Record<string, string[]> = {
  light_oak:   ["eg", "lys eg", "natur eg", "hvidpigmenteret eg", "eg finér", "birk", "ask", "lys træ"],
  warm_oak:    ["eg", "egetræ", "varm eg", "honning eg", "oljet eg"],
  honey_pine:  ["fyr", "fyrretræ", "honning fyr", "lys fyr", "pine"],
  light_birch: ["birk", "birkefinér", "lys birk", "hvid birk"],
  light_brown: ["lysebrun", "eg", "oak", "træ", "natur"],
  dark_walnut: ["valnød", "walnut", "mørk valnød", "mørk eg", "mørkebrun"],
  dark_brown:  ["mørkebrun", "valnød", "brun", "walnut", "espresso", "mokka"],
  espresso:    ["espresso", "mokka", "mørk brun", "mørkebrun"],
  black:       ["sort", "sorte"],
  white:       ["hvid", "hvidt", "off-white", "hvid-"],
  cream:       ["creme", "ecru", "beige", "sandfarvet", "cremefarvet"],
  beige:       ["beige", "natur", "sand", "creme", "ecru", "sandfarvet"],
  warm_grey:   ["grå", "gråbrun", "greige", "varm grå", "taupe"],
  cool_grey:   ["lysegrå", "antracit", "koksgrå", "mørkegrå"],
  gray:        ["grå", "lysegrå", "mørkegrå", "antracit"],
  grey:        ["grå", "lysegrå", "mørkegrå", "antracit"],
  natural:     ["natur", "eg", "naturlig", "ubehandlet"],
  blue:        ["blå", "lyseblå", "mørkeblå", "navy"],
  navy:        ["navy", "mørkeblå", "marineblå"],
  green:       ["grøn", "oliven", "sage", "mosgrøn"],
  olive:       ["oliven", "olivengrøn"],
  "light beige": ["beige", "natur", "sand", "creme"],
  "dark walnut": ["valnød", "walnut", "mørkebrun"],
};

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

// Returns category exclusion terms based on type, shape, and size
function getCategoryExclusions(
  description: FurnitureDescription | null,
  yoloLabel: string,
): string[] {
  const type = (description?.type ?? yoloLabel).toLowerCase();
  const exclusions: string[] = [...(TYPE_CATEGORY_EXCLUSIONS[type] ?? [])];

  // For sofas: exclude corner/sectional categories when shape is rectangular
  if ((type === "sofa" || yoloLabel === "sofa" || yoloLabel === "couch") && description) {
    if (description.shape === "rectangular" || description.shape === "other") {
      exclusions.push(...RECTANGULAR_SOFA_EXCLUSIONS);
    }
    // Exclude wrong-size sofa categories
    if (description.size === "small") {
      exclusions.push("3-pers", "U-sofaer", "Hjørnesofaer");
    } else if (description.size === "large") {
      exclusions.push("2-pers. sofaer");
    }
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

  // Hard exclusions: categories that must never match
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

  // ── Dual-vector fusion when text vector is provided ───────────────────────────
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
          clip_sim_raw: clipSim,
          text_sim_raw: textSim,
        };
      });

      merged.sort((a, b) => b.clip_similarity - a.clip_similarity);

      if (merged.length >= 10) {
        console.log(`Fusion (CLIP+text): ${merged.length} kandidater (text: ${textResult.rows.length})`);
        return merged.slice(0, limit);
      }
    }
  }

  // ── Single-vector (CLIP image only) ───────────────────────────────────────────
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

  // ── Reduced fallback: try with only first/primary category keyword ─────────────
  if (categoryKeywords.length > 1) {
    console.log(`Kun ${result.rows.length} kandidater — prøver med primær kategori kun`);
    const { clause: reducedClause, params: reducedFilterParams } = buildFilterClause(
      [categoryKeywords[0]], isIndoor, 3, categoryExclusions
    );
    const reducedParams: any[] = [clipVectorParam, limit, ...reducedFilterParams];
    const reducedSQL = `
      SELECT p.id, p.name, p.price, p.image_url, p.affiliate_link, p.shop, p.category,
             1 - (p.vector_clip <=> $1::vector(512)) AS clip_similarity
      FROM products p
      WHERE p.vector_clip IS NOT NULL ${reducedClause}
      ORDER BY p.vector_clip <=> $1::vector(512)
      LIMIT $2
    `;
    const reducedResult = await pool.query(reducedSQL, reducedParams);
    if (reducedResult.rows.length >= 10) {
      console.log(`Primær kategori fallback: ${reducedResult.rows.length} kandidater`);
      return reducedResult.rows;
    }
  }

  // ── Broad fallback: no category filter, outdoor filter + exclusions only ──────
  console.log(`Kun ${result.rows.length} kandidater med kategorifilter — prøver uden kategori`);
  const { clause: broadClause, params: broadFilterParams } = buildFilterClause(
    [], isIndoor, 3, categoryExclusions
  );
  const broadParams: any[] = [clipVectorParam, limit, ...broadFilterParams];

  const broadSQL = `
    SELECT p.id, p.name, p.price, p.image_url, p.affiliate_link, p.shop, p.category,
           1 - (p.vector_clip <=> $1::vector(512)) AS clip_similarity
    FROM products p
    WHERE p.vector_clip IS NOT NULL ${broadClause}
    ORDER BY p.vector_clip <=> $1::vector(512)
    LIMIT $2
  `;

  const broadResult = await pool.query(broadSQL, broadParams);
  console.log(`Bred fallback: ${broadResult.rows.length} kandidater`);
  return broadResult.rows;
}

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
  const hasPrimaryMatch = primaryTerms.some((t) => name.includes(t.toLowerCase()));
  if (hasPrimaryMatch) return 1;

  const secondaryMatches = uniqueTerms.slice(4).filter((t) => name.includes(t.toLowerCase())).length;
  return Math.min(secondaryMatches * 0.4, 0.6);
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

  // For rectangular: penalize if product name has L-shaped signals
  if (shapeKey === "rectangular" || shapeKey === "other") {
    const lShapeTerms = SHAPE_TERMS["L-shaped"] ?? [];
    if (lShapeTerms.some((t) => name.includes(t.toLowerCase()))) {
      return -1.0; // This is a corner/chaise sofa but we want a straight one
    }
    return 0;
  }

  const terms = SHAPE_TERMS[shapeKey] ?? DANISH_SYNONYMS[shapeKey] ?? [];
  if (terms.length === 0) return 0;

  return terms.some((t) => name.includes(t.toLowerCase())) ? 1 : 0;
}

function scoreSizeMatch(
  productName: string,
  description: FurnitureDescription | null,
): number {
  if (!description?.size || description.size === "medium") return 0;

  const name = productName.toLowerCase();

  if (description.size === "large") {
    const hasLargeSignal = SIZE_LARGE_TERMS.some((t) => name.includes(t));
    const hasSmallSignal = SIZE_SMALL_TERMS.some((t) => name.includes(t));
    if (hasSmallSignal) return -1.5; // Strong penalty: 2-seater when large needed
    return hasLargeSignal ? 0.8 : 0;
  }

  if (description.size === "small") {
    const hasSmallSignal = SIZE_SMALL_TERMS.some((t) => name.includes(t));
    const hasLargeSignal = SIZE_LARGE_TERMS.some((t) => name.includes(t));
    if (hasLargeSignal) return -1.5; // Strong penalty: 3-seater when small needed
    return hasSmallSignal ? 0.8 : 0;
  }

  return 0;
}

// Hard exclusion: returns a large negative number for clear type mismatches
function scoreSubtypeExclusion(
  productName: string,
  yoloLabel: string,
  description: FurnitureDescription | null,
): number {
  const name = productName.toLowerCase();
  const type = (description?.type ?? yoloLabel).toLowerCase();

  const exclusionRegex = SUBTYPE_NAME_EXCLUSIONS[type] ?? SUBTYPE_NAME_EXCLUSIONS[yoloLabel.toLowerCase()];
  if (exclusionRegex && exclusionRegex.test(name)) {
    return -2.0; // Effectively removes from results
  }

  return 0;
}

function deduplicateByName(scored: any[]): any[] {
  const seen = new Set<string>();
  const result: any[] = [];

  for (const p of scored) {
    const baseName = p.name
      .replace(/\s*-\s*[^-]+(\/.*)?$/, "")
      .replace(/\d+\s*x\s*\d+(\s*cm)?/gi, "")
      .replace(/\d+\s*cm/gi, "")
      .trim()
      .toLowerCase();

    if (!seen.has(baseName)) {
      seen.add(baseName);
      result.push(p);
    }
  }

  return result;
}

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
    const clipScore = parseFloat(row.clip_similarity);
    const categoryScore = scoreCategoryMatch(row.category ?? "", desc, label);
    const colorScore = scoreColorMatch(row.name, desc, colorTerms);
    const materialScore = scoreMaterialMatch(row.name, desc);
    const shapeScore = scoreShapeMatch(row.name, desc);
    const sizeScore = scoreSizeMatch(row.name, desc);
    const subtypeScore = scoreSubtypeExclusion(row.name, label, desc);

    // Base score: CLIP visual + category + color (most important for visual match)
    const baseScore =
      0.35 * clipScore +
      0.18 * categoryScore +
      0.22 * colorScore +       // Color is critical — was 10%, now 22%
      0.08 * materialScore;

    // Penalties for wrong shape/size (applied as direct deductions)
    const shapePenalty = shapeScore < 0 ? shapeScore * 0.20 : shapeScore * 0.07;
    const sizePenalty  = sizeScore  < 0 ? sizeScore  * 0.15 : sizeScore  * 0.10;

    const finalScore = Math.max(-1, baseScore + shapePenalty + sizePenalty + subtypeScore);

    return {
      ...row,
      finalScore,
      clipScore,
      categoryScore,
      colorScore,
      materialScore,
      shapeScore,
      sizeScore,
      subtypeScore,
    };
  });

  scored.sort((a, b) => b.finalScore - a.finalScore);

  const deduped = deduplicateByName(scored);
  const top = deduped.filter((p) => p.finalScore > 0).slice(0, topK + 2);

  console.log(
    `Top 3 scores: ${top
      .slice(0, 3)
      .map(
        (p) =>
          `"${p.name.substring(0, 28)}" clip=${p.clipScore.toFixed(2)} cat=${p.categoryScore} col=${p.colorScore.toFixed(2)} mat=${p.materialScore.toFixed(2)} shp=${p.shapeScore.toFixed(2)} sz=${p.sizeScore.toFixed(2)} → ${p.finalScore.toFixed(3)}`,
      )
      .join(" | ")}`,
  );

  return top.map((p) => ({
    id: p.id,
    name: p.name,
    price: p.price,
    image_url: p.image_url,
    affiliate_link: p.affiliate_link,
    shop: p.shop,
    similarity: p.finalScore,
  }));
}

export async function findSimilarProducts(
  queryVector: number[],
  topK: number = 5,
  yoloLabel?: string,
) {
  return findSimilarProductsHybrid(queryVector, topK, yoloLabel, null, []);
}
