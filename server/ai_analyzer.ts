import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface OpenAIProduct {
  name: string;
  searchTerms: string;
  exactBudget: number;
  visualDescription: string;
  recommendedStores: string[];
}

export interface AnalysisResult {
  products: OpenAIProduct[];
  totalProductBudget: number;
  profit: number;
}

export async function analyzeDesignImage(
  imageUrl: string,
  budget: number,
  roomType: string,
  style: string
): Promise<AnalysisResult> {
  const productBudget = Math.round(budget * 0.85);
  const profit = budget - productBudget;

  console.log(`[AI Analyzer] Analyzing image — budget: ${budget} DKK`);

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Analyser dette ${roomType} i ${style} stil.

Samlet budget: ${budget} DKK. Produktbudget (85%): ${productBudget} DKK.

Find de 4-6 vigtigste møbler/produkter i billedet, start med det dyreste.

For hvert produkt, lav en KORT, PRÆCIS dansk søgetekst:
- Max 4-5 ord
- Type + materiale + farve
- Ingen pris, ingen "moderne" eller "skandinavisk" medmindre absolut nødvendigt

Eksempel GODT: "hjørnesofa grå stof metal"
Eksempel DÅRLIGT: "stor hjørnesofa grå stof metal ramme moderne skandinavisk 15000 kr"

Vælg 2 butikker der passer bedst til produktet:
- Store møbler (sofa, seng, skab): IKEA, Bolia, ILVA
- Små møbler (bord, stol, puf): IKEA, HAY
- Lamper: Lightpoint, IKEA
- Tæpper: JYSK, IKEA
- Accessories/pyntedetaljer: HAY, Bahne

Fordel ${productBudget} DKK realistisk på produkterne.

Svar KUN med valid JSON:
{
  "products": [
    {
      "name": "Hjørnesofa",
      "searchTerms": "hjørnesofa grå stof metal",
      "exactBudget": 15000,
      "visualDescription": "Grå stof med metalramme, minimalistisk udtryk",
      "recommendedStores": ["IKEA", "Bolia"]
    }
  ],
  "totalProductBudget": ${productBudget},
  "profit": ${profit}
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
  const products: OpenAIProduct[] = (parsed.products ?? []).map((p: any) => ({
    name: p.name ?? "Produkt",
    searchTerms: p.searchTerms ?? "",
    exactBudget: p.exactBudget ?? 0,
    visualDescription: p.visualDescription ?? "",
    recommendedStores: p.recommendedStores ?? [],
  }));

  console.log(`[AI Analyzer] Found ${products.length} products`);

  return {
    products,
    totalProductBudget: parsed.totalProductBudget ?? productBudget,
    profit: parsed.profit ?? profit,
  };
}
