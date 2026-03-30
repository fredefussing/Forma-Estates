import OpenAI from "openai";
import { searchProductsByCategory, PRODUCT_CATEGORIES, type GoogleLensMatch } from "./google_lens";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface RecommendedStore {
  name: string;
  reason: string;
}

export interface OpenAIDetail {
  searchTerms: string;
  visualDescription: string;
  recommendedStores: RecommendedStore[];
  visible: boolean; // Whether AI detected this category in the image
}

export interface CombinedProduct {
  categoryId: string;
  categoryName: string;
  targetBudget: number;
  googleLens: GoogleLensMatch | null;
  openAI: OpenAIDetail | null;
}

export interface AnalysisResult {
  products: CombinedProduct[];
  totalProductBudget: number;
  profit: number;
  googleLensCount: number;
}

// Keep these for backward compat with email.ts (legacy types no longer used in new flow)
export type HybridProduct = never;

async function analyzeWithOpenAI(
  imageUrl: string,
  budget: number,
  roomType: string,
  style: string
): Promise<Map<string, OpenAIDetail>> {
  const productBudget = Math.round(budget * 0.85);

  const categoryList = PRODUCT_CATEGORIES.map((c) =>
    `- id: "${c.id}", name: "${c.name}", target: ${Math.round(productBudget * c.budgetShare)} DKK`
  ).join("\n");

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Du er dansk indretningsekspert. Analyser dette ${roomType} i ${style} stil.
Samlet budget: ${budget} DKK. Produktbudget (85%): ${productBudget} DKK.

For HVER af følgende kategorier — beskriv hvad du ser i billedet (eller marker den som ikke synlig):

${categoryList}

For hvert produkt:
- Præcis beskrivelse: materiale, farve, form, stil
- Søgeord til danske butikker (specifikke)
- 2 anbefalet butikker der passer bedst

Butikker: IKEA, Bolia, HAY, JYSK, ILVA, Bahne, Menu, Nordic Dream, Drømmeland, Lightpoint, Sengeeksperten, BoConcept

Svar KUN med valid JSON:
{
  "products": {
    "sofa": { "visible": true, "searchTerms": "3-pers sofa lys grå stof egetræsben minimalistisk", "visualDescription": "Lys grå 3-personers sofa med lavt egetræsben og stofpolstring", "recommendedStores": [{"name":"Bolia","reason":"Nordisk design og stof sofaer"},{"name":"IKEA","reason":"Stort udvalg af minimalistiske sofaer"}] },
    "bord": { "visible": true, "searchTerms": "sofabord egetræ rund 80cm", "visualDescription": "Rundt sofabord i egetræ, lav", "recommendedStores": [{"name":"HAY","reason":"Dansk design sofaborde"},{"name":"ILVA","reason":"Klassiske borde"}] },
    "lampe": { "visible": false, "searchTerms": "", "visualDescription": "", "recommendedStores": [] },
    "opbevaring": { "visible": false, "searchTerms": "", "visualDescription": "", "recommendedStores": [] },
    "tæppe": { "visible": true, "searchTerms": "gulvtæppe uld grå 200x300", "visualDescription": "Stort gråt uldtæppe", "recommendedStores": [{"name":"JYSK","reason":"Stort udvalg af tæpper"},{"name":"IKEA","reason":"Budget tæpper"}] },
    "accessories": { "visible": true, "searchTerms": "lysestager keramik vase hvid", "visualDescription": "Hvide keramiske vaser og lysestager", "recommendedStores": [{"name":"Bahne","reason":"Dansk design accessories"},{"name":"HAY","reason":"Moderne pyntegenstande"}] }
  }
}`,
          },
          {
            type: "image_url",
            image_url: { url: imageUrl, detail: "high" },
          },
        ],
      },
    ],
    max_tokens: 2000,
    response_format: { type: "json_object" },
  });

  const content = response.choices[0].message.content;
  if (!content) throw new Error("No response from OpenAI");

  const parsed = JSON.parse(content);
  const productsObj: Record<string, any> = parsed.products ?? {};

  const result = new Map<string, OpenAIDetail>();
  for (const cat of PRODUCT_CATEGORIES) {
    const entry = productsObj[cat.id];
    if (entry) {
      result.set(cat.id, {
        visible: entry.visible ?? true,
        searchTerms: entry.searchTerms ?? "",
        visualDescription: entry.visualDescription ?? "",
        recommendedStores: entry.recommendedStores ?? [],
      });
    }
  }
  return result;
}

export async function analyzeDesignImage(
  imageUrl: string,
  budget: number,
  roomType: string,
  style: string
): Promise<AnalysisResult> {
  const productBudget = Math.round(budget * 0.85);
  const profit = budget - productBudget;

  console.log(`[AI Analyzer] Starting hybrid analysis — budget: ${budget} DKK`);

  // Run Google Lens and OpenAI in parallel
  const [googleLensMap, openAIMap] = await Promise.all([
    searchProductsByCategory(imageUrl, budget),
    analyzeWithOpenAI(imageUrl, budget, roomType, style).catch((err) => {
      console.error("[AI Analyzer] OpenAI failed:", err.message);
      return new Map<string, OpenAIDetail>();
    }),
  ]);

  let googleLensCount = 0;

  const products: CombinedProduct[] = PRODUCT_CATEGORIES.map((cat) => {
    const targetBudget = Math.round(productBudget * cat.budgetShare);
    const gl = googleLensMap.get(cat.id) ?? null;
    const ai = openAIMap.get(cat.id) ?? null;

    if (gl) googleLensCount++;

    return {
      categoryId: cat.id,
      categoryName: cat.name,
      targetBudget,
      googleLens: gl,
      openAI: ai,
    };
  });

  console.log(
    `[AI Analyzer] Done — GL matches: ${googleLensCount}/${PRODUCT_CATEGORIES.length}, OpenAI categories: ${openAIMap.size}`
  );

  // Calculate actual total from GL prices where available, otherwise use target
  const totalProductBudget = products.reduce((sum, p) => {
    return sum + (p.googleLens ? p.googleLens.price : p.targetBudget);
  }, 0);

  return {
    products,
    totalProductBudget: Math.round(totalProductBudget),
    profit,
    googleLensCount,
  };
}
