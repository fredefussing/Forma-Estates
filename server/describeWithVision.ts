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
}

const PROMPT = `You are analyzing a cropped furniture image from an interior design photo.
Return ONLY valid JSON (no markdown, no explanation) with these exact fields:
{
  "type": "sofa|chair|bed|table|lamp|rug|cabinet|shelf|mirror|bench|other",
  "color": "brief English color description, e.g. 'light beige' or 'dark walnut brown'",
  "material": "fabric|leather|velvet|boucle|rattan|wood|metal|glass|plastic|other",
  "legs": "leg description e.g. 'light oak' or 'black metal' or null if no visible legs",
  "style": "scandinavian|modern|industrial|classic|bohemian|minimalist|luxury|rustic",
  "shape": "brief shape description e.g. '3-seat low profile sofa' or 'round dining table'"
}`;

const VISION_CACHE = new Map<string, FurnitureDescription | null>();

function cacheKey(imageUrl: string, x: number, y: number, w: number, h: number) {
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
      model: "gpt-4o",
      max_tokens: 200,
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

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      if (cacheId) VISION_CACHE.set(cacheId, null);
      return null;
    }

    const desc = JSON.parse(jsonMatch[0]) as FurnitureDescription;
    if (cacheId) VISION_CACHE.set(cacheId, desc);
    return desc;
  } catch (err: any) {
    console.error("describeFurnitureWithVision fejl:", err.message);
    if (cacheId) VISION_CACHE.set(cacheId, null);
    return null;
  }
}

export { cacheKey };
