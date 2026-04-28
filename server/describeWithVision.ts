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
  size: "small" | "medium" | "large";
  openness: "open" | "closed" | "mixed" | "na";
  indoor: boolean;
  searchText: string;
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
  light_oak:     ["eg", "lys eg", "natural oak", "natur eg", "hvidpigmenteret eg", "eg finér", "birk", "ask", "lys træ"],
  warm_oak:      ["eg", "egetræ", "varm eg", "honning eg", "oljet eg", "honey oak"],
  honey_pine:    ["fyr", "fyrretræ", "honning fyr", "lys fyr", "pine"],
  light_birch:   ["birk", "birkefinér", "lys birk", "hvid birk"],
  light_brown:   ["lysebrun", "eg", "oak", "træ", "natur"],
  dark_walnut:   ["valnød", "walnut", "mørk valnød", "mørk eg", "mørkebrun"],
  dark_brown:    ["mørkebrun", "valnød", "brun", "walnut", "espresso", "mokka"],
  espresso:      ["espresso", "mokka", "mørk brun", "mørkebrun"],
  black:         ["sort", "sorte"],
  warm_grey:     ["grå", "gråbrun", "greige", "varm grå", "taupe"],
  cool_grey:     ["lysegrå", "antracit", "koksgrå", "mørkegrå"],
  gray:          ["grå", "lysegrå", "mørkegrå", "antracit"],
  grey:          ["grå", "lysegrå", "mørkegrå", "antracit"],
  blue:          ["blå", "lyseblå", "mørkeblå", "navy"],
  navy:          ["navy", "mørkeblå", "marineblå"],
  green:         ["grøn", "oliven", "sage", "mosgrøn"],
  olive:         ["oliven", "olivengrøn", "army grøn"],
  natural:       ["natur", "eg", "naturlig", "ubehandlet"],
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

  "L-shaped":    ["hjørne", "chaiselong", "l-sofa", "venstrevendt", "højrevendt"],
  round:         ["rund", "cirkel", "cirkulær"],
  square:        ["kvadratisk", "firkantet"],
  large:         ["stor", "xl", "xxl", "bred", "lang", "høj"],
  small:         ["lille", "kompakt", "mini", "small", "smal"],
  open:          ["åben", "åbne hylder", "open back"],
  closed:        ["lukket", "med låger", "med dør"],
};

const PROMPT = `You are analyzing a cropped furniture image from an interior design photo.
Return ONLY valid JSON (no markdown, no explanation) with these exact fields:
{
  "type": "lounge_chair|dining_chair|sofa|coffee_table|side_table|dining_table|rug|lamp|shelf|cabinet|bed|nightstand|mirror|bench|other",
  "color": "white|cream|light_oak|warm_oak|honey_pine|light_birch|light_brown|dark_walnut|dark_brown|espresso|black|warm_grey|cool_grey|gray|blue|navy|green|olive|natural|beige|yellow|pink|orange",
  "material": "woven|rattan|fabric|leather|velvet|wood|metal|glass|boucle|linen|plastic|other",
  "legs": "tapered_wood|straight_wood|metal|hairpin|sled|no_legs|other",
  "style": "scandinavian|modern|minimalist|rustic|industrial|bohemian|classic|mid_century|luxury",
  "shape": "rectangular|square|L-shaped|round|asymmetric|other",
  "size": "small|medium|large",
  "openness": "open|closed|mixed|na",
  "indoor": true or false,
  "searchText": "One detailed English sentence (max 40 words) describing the furniture for product matching — include exact color tone, material texture, leg style, shape, proportions, and any distinctive features that distinguish it from similar items."
}

CRITICAL RULES:
- color: Use specific tone — not just "brown". "light_oak" = pale natural wood. "dark_walnut" = deep brown wood. "warm_oak" = medium honey-toned wood. "espresso" = very dark brown. "warm_grey" = beige-grey mix. "cool_grey" = blue-grey.
- "woven"/"rattan" = braided/wicker material
- shape: "L-shaped" for corner sofas or chaise sections
- size: "small" = compact/petite. "large" = oversized/sectional. "medium" = standard
- openness: "open" = visible shelves no doors. "closed" = doors/drawers cover contents. "na" = not storage furniture
- "indoor": false ONLY for obvious outdoor furniture
- searchText: focus on visual characteristics that distinguish this from similar furniture. Be specific about color tone and proportions.`;

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
      max_tokens: 300,
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
    if (!desc.size) desc.size = "medium";
    if (!desc.openness) desc.openness = "na";
    if (!desc.searchText) {
      desc.searchText = `A ${desc.color} ${desc.material} ${desc.type} in ${desc.style} style`;
    }

    if (cacheId) VISION_CACHE.set(cacheId, desc);
    return desc;
  } catch (err: any) {
    console.error("describeFurnitureWithVision fejl:", err.message);
    if (cacheId) VISION_CACHE.set(cacheId, null);
    return null;
  }
}
