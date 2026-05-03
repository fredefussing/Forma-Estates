import { pool } from "./db";
import type { FurnitureDescription } from "./describeWithVision";
import { DANISH_SYNONYMS } from "./describeWithVision";

const YOLO_TO_CATEGORY: Record<string, string[]> = {
  "sofa":         ["Sofaer"],
  "couch":        ["Sofaer"],
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
  "sofa":         ["Sofaer"],
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

const OUTDOOR_TERMS = [
  "udendørs", "have", "terrasse", "solstol", "liggestol",
  "parasol", "balkon", "polyrattan",
];

const SHAPE_TERMS: Record<string, string[]> = {
  "L-shaped":    ["hjørne", "chaiselong", "l-sofa", "venstrevendt", "højrevendt"],
  "round":       ["rund", "cirkel", "cirkulær"],
  "square":      ["kvadratisk", "firkantet"],
  "rectangular": [],
  "asymmetric":  ["asymmetrisk"],
};

const SIZE_LARGE_TERMS = ["stor", "bred", "lang", "xl", "xxl", "hjørne", "sektions", "panorama"];
const SIZE_SMALL_TERMS = ["lille", "kompakt", "mini", "smal", "small"];

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
  cream:       ["creme", "ecru", "beige"],
  beige:       ["beige", "natur", "sand", "creme", "ecru"],
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

async function getRelaxedCandidates(
  vectorParam: string,
  description: FurnitureDescription | null,
  yoloLabel: string,
  limit: number,
): Promise<any[]> {
  const categoryKeywords = getCategoryKeywords(description, yoloLabel);
  const isIndoor = description ? description.indoor !== false : true;

  const params: any[] = [vectorParam, limit];
  let idx = 3;

  const conditions: string[] = ["p.vector_clip IS NOT NULL"];

  if (categoryKeywords.length > 0) {
    const catConds = categoryKeywords.map(() => `p.category ILIKE $${idx++}`).join(" OR ");
    conditions.push(`(${catConds})`);
    categoryKeywords.forEach((k) => params.push(`%${k}%`));
  }

  if (isIndoor) {
    const outdoorConds = OUTDOOR_TERMS.map(() => `p.name NOT ILIKE $${idx++}`).join(" AND ");
    conditions.push(`(${outdoorConds})`);
    OUTDOOR_TERMS.forEach((t) => params.push(`%${t}%`));
  }

  const sql = `
    SELECT p.id, p.name, p.price, p.image_url, p.affiliate_link, p.shop, p.category,
           1 - (p.vector_clip <=> $1::vector(512)) AS clip_similarity
    FROM products p
    WHERE ${conditions.join(" AND ")}
    ORDER BY p.vector_clip <=> $1::vector(512)
    LIMIT $2
  `;

  const result = await pool.query(sql, params);

  if (result.rows.length >= 10) {
    console.log(`Relaxed kandidater: ${result.rows.length} (kategori+outdoor filter)`);
    return result.rows;
  }

  console.log(`Kun ${result.rows.length} kandidater med kategorifilter — prøver uden kategori`);
  const broadParams = [vectorParam, limit];
  let broadIdx = 3;
  const broadConditions = ["p.vector_clip IS NOT NULL"];

  if (isIndoor) {
    const outdoorConds = OUTDOOR_TERMS.map(() => `p.name NOT ILIKE $${broadIdx++}`).join(" AND ");
    broadConditions.push(`(${outdoorConds})`);
    OUTDOOR_TERMS.forEach((t) => broadParams.push(`%${t}%`));
  }

  const broadSQL = `
    SELECT p.id, p.name, p.price, p.image_url, p.affiliate_link, p.shop, p.category,
           1 - (p.vector_clip <=> $1::vector(512)) AS clip_similarity
    FROM products p
    WHERE ${broadConditions.join(" AND ")}
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

  const primaryTerms = uniqueTerms.slice(0, 3);
  const hasPrimaryMatch = primaryTerms.some((t) => name.includes(t.toLowerCase()));
  if (hasPrimaryMatch) return 1;

  const secondaryMatches = uniqueTerms.slice(3).filter((t) => name.includes(t.toLowerCase())).length;
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
  if (!description?.shape || description.shape === "rectangular" || description.shape === "other") {
    return 0;
  }

  const name = productName.toLowerCase();
  const shapeKey = description.shape as string;
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
    if (hasSmallSignal) return -0.5;
    return hasLargeSignal ? 1 : 0;
  }

  if (description.size === "small") {
    const hasSmallSignal = SIZE_SMALL_TERMS.some((t) => name.includes(t));
    const hasLargeSignal = SIZE_LARGE_TERMS.some((t) => name.includes(t));
    if (hasLargeSignal) return -0.5;
    return hasSmallSignal ? 1 : 0;
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
) {
  const vectorParam = JSON.stringify(queryVector);
  const label = yoloLabel ?? "";
  const desc = description ?? null;

  const candidates = await getRelaxedCandidates(vectorParam, desc, label, 200);

  const scored = candidates.map((row) => {
    const clipScore = parseFloat(row.clip_similarity);
    const categoryScore = scoreCategoryMatch(row.category ?? "", desc, label);
    const colorScore = scoreColorMatch(row.name, desc, colorTerms);
    const materialScore = scoreMaterialMatch(row.name, desc);
    const shapeScore = scoreShapeMatch(row.name, desc);
    const sizeScore = scoreSizeMatch(row.name, desc);

    const finalScore =
      0.40 * clipScore +
      0.25 * categoryScore +
      0.10 * colorScore +
      0.05 * materialScore +
      0.10 * shapeScore +
      0.10 * Math.max(0, sizeScore);

    const sizeBoost = sizeScore < 0 ? sizeScore * 0.05 : 0;

    return {
      ...row,
      finalScore: Math.max(0, finalScore + sizeBoost),
      clipScore,
      categoryScore,
      colorScore,
      materialScore,
      shapeScore,
      sizeScore,
    };
  });

  scored.sort((a, b) => b.finalScore - a.finalScore);

  const deduped = deduplicateByName(scored);
  const top = deduped.slice(0, topK + 2);

  console.log(
    `Top 3 scores: ${top
      .slice(0, 3)
      .map(
        (p) =>
          `"${p.name.substring(0, 28)}" clip=${p.clipScore.toFixed(2)} cat=${p.categoryScore} col=${p.colorScore.toFixed(2)} mat=${p.materialScore.toFixed(2)} shp=${p.shapeScore.toFixed(2)} sz=${p.sizeScore.toFixed(2)} → ${p.finalScore.toFixed(2)}`,
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
