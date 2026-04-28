import OpenAI from "openai";
import { readFileSync } from "fs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface FurnitureDescription {
  type: string;
  color: string;
  material: string;
  legs: string | null;
  style: string;
  shape: string;
  indoor: boolean;
}

export const DANISH_SYNONYMS: Record<string, string[]> = {
  lounge_chair:  ["lænestol", "læne stol"],
  dining_chair:  ["spisestol", "køkkenstol", "spisebordsstol"],
  chair:         ["stol", "lænestol", "spisestol"],
  sofa:          ["sofa", "sovesofa"],
  coffee_table:  ["sofabord", "salongbord"],
  side_table:    ["sidebord", "sengebord"],
  dining_table:  ["spisebord"],
  rug:           ["tæppe", "gulvtæppe", "løber"],
  lamp:          ["lampe", "bordlampe", "gulvlampe", "pendel"],
  shelf:         ["hylde", "reol", "vægreol"],
  cabinet:       ["skab", "kommode", "sideboard", "skænk"],
  bed:           ["seng", "sengestel"],
  nightstand:    ["sengebord", "nakkebord"],
  mirror:        ["spejl"],
  table:         ["bord", "sofabord", "spisebord"],
  bench:         ["bænk", "skammel"],

  beige:         ["beige", "natur", "sand", "creme", "ecru", "lysebrun"],
  white:         ["hvid", "hvidt", "off-white"],
  cream:         ["creme", "ecru", "beige"],
  light_brown:   ["lysebrun", "eg", "oak", "træ", "natur"],
  dark_brown:    ["mørkebrun", "valnød", "brun", "walnut"],
  black:         ["sort", "sorte"],
  gray:          ["grå", "lysegrå", "mørkegrå"],
  grey:          ["grå", "lysegrå", "mørkegrå"],
  blue:          ["blå", "lyseblå", "mørkeblå", "navy"],
  green:         ["grøn", "oliven", "sage"],
  natural:       ["natur", "eg", "naturlig"],
  "light beige": ["beige", "natur", "sand", "creme"],
  "dark walnut":  ["valnød", "walnut", "mørkebrun"],

  woven:    ["flet", "flettet", "rattan", "rotting", "vævet", "kurv"],
  rattan:   ["rattan", "rotting", "flet", "flettet"],
  leather:  ["læder", "skind", "kernelæder"],
  fabric:   ["stof", "tekstil", "polyester"],
  velvet:   ["velour", "fløjl"],
  wood:     ["træ", "eg", "bøg", "fyr", "massivt"],
  metal:    ["metal", "stål", "jern", "messing"],
  glass:    ["glas"],
  boucle:   ["boucle", "bouclé", "loop"],
  linen:    ["hør", "linen", "lin"],

  scandinavian: ["skandinavisk", "nordisk", "dansk", "minimalistisk"],
  modern:       ["moderne"],
  minimalist:   ["minimalistisk", "enkel", "simpel"],
  rustic:       ["rustik", "landlig"],
  industrial:   ["industrielt", "råt"],
  bohemian:     ["boheme", "boho"],
  classic:      ["klassisk", "tidløs"],
  luxury:       ["eksklusiv", "luksus"],
  mid_century:  ["retro", "vintage"],
};

const PROMPT = `You are analyzing a cropped furniture image from an interior design photo.
Return ONLY valid JSON (no markdown, no explanation) with these exact fields:
{
  "type": "lounge_chair|dining_chair|sofa|coffee_table|side_table|dining_table|rug|lamp|shelf|cabinet|bed|nightstand|mirror|bench|other",
  "color": "beige|white|cream|light_brown|dark_brown|black|gray|blue|green|yellow|pink|orange|natural|light beige|dark walnut",
  "material": "woven|rattan|fabric|leather|velvet|wood|metal|glass|boucle|linen|plastic|other",
  "legs": "oak|metal|none|other",
  "style": "scandinavian|modern|minimalist|rustic|industrial|bohemian|classic|mid_century|luxury",
  "shape": "brief shape e.g. '3-seat sofa' or 'round table'",
  "indoor": true or false
}

CRITICAL RULES:
- "woven"/"rattan" = braided/wicker material (rattan, cane, wicker, basket weave)
- "beige"/"light beige" = sand, cream, natural, ecru — NOT brown
- "indoor": false ONLY for obvious outdoor furniture (sun loungers, garden chairs, parasols)
- If wood frame + woven seat/back = use "rattan" or "woven"
- Choose most specific type (lounge_chair over chair)`;

const VISION_CACHE = new Map<string, FurnitureDescription | null>();

export function cacheKey(imageUrl: string, x: number, y: number, w: number, h: number) {
  return `${imageUrl}:${x}:${y}:${w}:${h}`;
}

export async function describeFurnitureWithVision(
  imageFilePath: string,
  cacheId?: string,
): Promise<FurnitureDescription | null> {
  if (cacheId && VISION_CACHE.has(cacheId)) {
    return VISION_CACHE.get(cacheId)!;
  }

  try {
    const imageBuffer = readFileSync(imageFilePath);
    const base64 = imageBuffer.toString("base64");

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 200,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64}`,
                detail: "low",
              },
            },
            { type: "text", text: PROMPT },
          ],
        },
      ],
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) {
      if (cacheId) VISION_CACHE.set(cacheId, null);
      return null;
    }

    const desc = JSON.parse(content) as FurnitureDescription;
    if (desc.indoor === undefined) desc.indoor = true;
    if (cacheId) VISION_CACHE.set(cacheId, desc);
    return desc;
  } catch (err: any) {
    console.error("describeFurnitureWithVision fejl:", err.message);
    if (cacheId) VISION_CACHE.set(cacheId, null);
    return null;
  }
}
