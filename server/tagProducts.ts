import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface ProductTag {
  type: string;
  subtype: string;
  color: string;
  color_family: string;
  material: string;
  material_family: string;
  style: string;
  indoor: boolean;
  size: string;
  shape: string;
  confidence: number;
}

const COLOR_MAP: Record<string, string> = {
  "hvid": "white", "hvidt": "white", "off-white": "off_white",
  "sort": "black", "sorte": "black",
  "grå": "gray", "lysegrå": "light_gray", "mørkegrå": "dark_gray", "antracit": "anthracite",
  "beige": "beige", "sand": "beige", "ecru": "beige", "natur": "beige", "creme": "cream",
  "brun": "brown", "lysebrun": "light_brown", "mørkebrun": "dark_brown", "valnød": "walnut", "eg": "oak",
  "blå": "blue", "lyseblå": "light_blue", "mørkeblå": "dark_blue", "marine": "navy",
  "grøn": "green", "oliven": "olive", "sage": "sage",
  "gul": "yellow", "oker": "ochre",
  "rød": "red", "bordeaux": "burgundy",
  "rosa": "pink", "lyserød": "light_pink",
  "orange": "orange", "terracotta": "terracotta",
  "lilla": "purple", "lavendel": "lavender",
};

const MATERIAL_MAP: Record<string, string> = {
  "læder": "leather", "kernelæder": "leather", "kunstlæder": "faux_leather",
  "stof": "fabric", "tekstil": "fabric", "polyester": "fabric",
  "velour": "velvet", "fløjl": "velvet",
  "træ": "wood", "eg": "oak", "bøg": "beech", "fyr": "pine", "valnød": "walnut", "birk": "birch",
  "metal": "metal", "stål": "steel", "jern": "iron", "messing": "brass",
  "glas": "glass",
  "rattan": "rattan", "rotting": "rattan", "flet": "woven", "vævet": "woven",
  "boucle": "boucle", "bouclé": "boucle",
  "hør": "linen", "linen": "linen",
  "marmor": "marble", "sten": "stone",
};

const TYPE_MAP: Record<string, string> = {
  "sofa": "sofa", "sovesofa": "sofa", "chaiselong": "sofa", "hjørnesofa": "corner_sofa",
  "lænestol": "lounge_chair", "læne stol": "lounge_chair", "hvilestol": "lounge_chair",
  "spisestol": "dining_chair", "køkkenstol": "dining_chair", "barstol": "bar_stool",
  "spisebord": "dining_table", "sofabord": "coffee_table", "salongbord": "coffee_table",
  "sidebord": "side_table", "sengebord": "nightstand", "nakkebord": "nightstand",
  "reol": "shelf", "bogskab": "shelf", "vægreol": "wall_shelf",
  "skab": "cabinet", "kommode": "cabinet", "sideboard": "sideboard",
  "seng": "bed", "sengestel": "bed",
  "lampe": "lamp", "bordlampe": "table_lamp", "gulvlampe": "floor_lamp", "pendel": "pendant",
  "tæppe": "rug", "gulvtæppe": "rug", "løber": "runner",
  "plante": "plant", "potte": "plant",
  "vase": "vase", "spejl": "mirror", "ur": "clock", "pude": "pillow",
};

export async function tagProduct(imageUrl: string, name: string): Promise<ProductTag> {
  const parsedFromName = parseFromName(name);
  if (parsedFromName.confidence > 0.7) return parsedFromName;
  return await tagWithVision(imageUrl, name, parsedFromName);
}

export function parseFromName(name: string): ProductTag {
  const lower = name.toLowerCase();

  let color = "unknown";
  let colorFamily = "unknown";
  for (const [dk, en] of Object.entries(COLOR_MAP)) {
    if (lower.includes(dk)) {
      color = en;
      colorFamily = getColorFamily(en);
      break;
    }
  }

  let material = "unknown";
  let materialFamily = "unknown";
  for (const [dk, en] of Object.entries(MATERIAL_MAP)) {
    if (lower.includes(dk)) {
      material = en;
      materialFamily = getMaterialFamily(en);
      break;
    }
  }

  let type = "unknown";
  let subtype = "unknown";
  for (const [dk, en] of Object.entries(TYPE_MAP)) {
    if (lower.includes(dk)) {
      type = en;
      subtype = en;
      break;
    }
  }

  let found = 0;
  if (color !== "unknown") found++;
  if (material !== "unknown") found++;
  if (type !== "unknown") found++;

  return {
    type, subtype, color, color_family: colorFamily,
    material, material_family: materialFamily,
    style: "unknown", indoor: true, size: "medium", shape: "unknown",
    confidence: found / 3,
  };
}

async function tagWithVision(imageUrl: string, name: string, fallback: ProductTag): Promise<ProductTag> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{
        role: "user",
        content: [
          {
            type: "text",
            text: `Analyze this furniture product. Product name: "${name}"

Return ONLY JSON:
{
  "type": "sofa|lounge_chair|dining_chair|bar_stool|dining_table|coffee_table|side_table|nightstand|bed|lamp|rug|shelf|cabinet|sideboard|plant|mirror|clock|pillow|vase|decor",
  "subtype": "specific type in English",
  "color": "exact color name in English",
  "color_family": "neutral|warm|cool|dark|light|white|black|pastel|earth",
  "material": "exact material in English",
  "material_family": "wood|metal|fabric|leather|glass|plastic|natural|stone|mixed",
  "style": "scandinavian|modern|industrial|classic|bohemian|minimalist|rustic|luxury|mid_century|contemporary",
  "indoor": true,
  "size": "small|medium|large|xl",
  "shape": "rectangular|square|round|oval|l_shaped|irregular|linear",
  "confidence": 0.0-1.0
}
Rules: scandinavian = light wood, clean lines, natural materials. indoor: false ONLY for obvious outdoor furniture.`,
          },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      }],
      response_format: { type: "json_object" },
      max_tokens: 300,
      temperature: 0.1,
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    return {
      type: result.type || fallback.type,
      subtype: result.subtype || fallback.subtype,
      color: result.color || fallback.color,
      color_family: result.color_family || fallback.color_family,
      material: result.material || fallback.material,
      material_family: result.material_family || fallback.material_family,
      style: result.style || fallback.style,
      indoor: result.indoor !== undefined ? result.indoor : fallback.indoor,
      size: result.size || fallback.size,
      shape: result.shape || fallback.shape,
      confidence: result.confidence || 0.5,
    };
  } catch (e) {
    console.error("Vision tagging failed:", e);
    return { ...fallback, confidence: fallback.confidence * 0.7 };
  }
}

function getColorFamily(color: string): string {
  const families: Record<string, string> = {
    white: "light", off_white: "light", cream: "light", beige: "neutral",
    light_gray: "light", gray: "neutral", dark_gray: "dark", anthracite: "dark",
    black: "dark", light_brown: "warm", brown: "warm", dark_brown: "dark",
    walnut: "warm", oak: "warm", light_blue: "cool", blue: "cool", navy: "dark",
    green: "cool", olive: "warm", sage: "cool", yellow: "warm", ochre: "warm",
    red: "warm", burgundy: "dark", light_pink: "pastel", pink: "pastel",
    orange: "warm", terracotta: "earth", purple: "cool", lavender: "pastel",
  };
  return families[color] || "neutral";
}

function getMaterialFamily(material: string): string {
  const families: Record<string, string> = {
    leather: "leather", faux_leather: "leather", fabric: "fabric",
    polyester: "fabric", velvet: "fabric", wood: "wood", oak: "wood",
    beech: "wood", pine: "wood", walnut: "wood", birch: "wood",
    metal: "metal", steel: "metal", iron: "metal", brass: "metal",
    glass: "glass", rattan: "natural", woven: "natural",
    boucle: "fabric", linen: "fabric", marble: "stone", stone: "stone",
  };
  return families[material] || "mixed";
}

export async function batchTagProducts(
  pool: any,
  limit: number = 100,
  offset: number = 0,
): Promise<{ success: number; failed: number; total: number }> {
  const result = await pool.query(
    `SELECT id, name, image_url FROM products
     WHERE (tag_processed = FALSE OR tag_processed IS NULL)
       AND image_url IS NOT NULL AND image_url != ''
     ORDER BY price DESC NULLS LAST
     LIMIT $1 OFFSET $2`,
    [limit, offset],
  );

  let success = 0;
  let failed = 0;

  for (const p of result.rows) {
    try {
      await new Promise((r) => setTimeout(r, 1500));
      const tag = await tagProduct(p.image_url, p.name);
      await pool.query(
        `UPDATE products SET tags = $1, tag_confidence = $2, tag_processed = TRUE, tag_processed_at = NOW() WHERE id = $3`,
        [JSON.stringify(tag), tag.confidence, p.id],
      );
      success++;
    } catch (e) {
      failed++;
      console.error(`Failed to tag product ${p.id}:`, e);
      await pool.query(
        `UPDATE products SET tag_processed = TRUE, tag_processed_at = NOW() WHERE id = $1`,
        [p.id],
      );
    }
  }

  return { success, failed, total: result.rows.length };
}
