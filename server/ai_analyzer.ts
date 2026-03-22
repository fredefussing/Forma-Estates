import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface RecommendedStore {
  name: string;
  reason: string;
}

export interface AnalyzedProduct {
  name: string;
  searchTerms: string;
  exactBudget: number;
  visualDescription: string;
  recommendedStores: RecommendedStore[];
}

export interface AnalysisResult {
  products: AnalyzedProduct[];
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

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Du er en dansk indretningsekspert. Analyser dette ${roomType} designet i ${style} stil.
Samlet budget: ${budget} DKK. Produktbudget (85%): ${productBudget} DKK.

Identificer ALLE synlige møbler og indretningselementer i billedet.
Fordel produktbudgetet realistisk. Beskriv hvert produkt grundigt:

For hvert produkt:
- Type (hvad er det)
- Materiale (træ, stof, metal, læder, glas)
- Farve (specifik: lys grå, mørkeblå, hvid, egetræ, sort)
- Form (rund, firkantet, aflang, lav, høj, bred, smal)
- Detaljer (gavl med/uden, knapper, bentykkelse, tekstur, mønster)
- Stil (minimalistisk, klassisk, moderne, retro, skandinavisk, luksus)

Vælg 2 butikker der passer BEDST til det specifikke produkt:
- Drømmeland: senge, boxmadrasser, tykke madrasser
- Nordic Dream: nordisk design, træ, minimalistisk, kvalitet senge
- Lightpoint: lamper, moderne, retro, gulv/bord/væg
- IKEA: alt, budget, bredt sortiment
- Bolia: luksus, læder, stue, premium møbler
- HAY: dansk design, stue/soveværelse, designikoner
- JYSK: budget, tæpper, sengetøj, basics
- ILVA: mid-range, klassisk dansk, tidløs

Svar KUN med valid JSON (ingen markdown, ingen forklaring):
{
  "products": [
    {
      "name": "Seng",
      "searchTerms": "dobbeltseng grå stof gavl med knapper lave egetræsben minimalistisk pris 6000 8000 kr",
      "exactBudget": 7000,
      "visualDescription": "Grå stofseng med høj gavl med knapper, tyk madras, lave egetræsben, minimalistisk udtryk",
      "recommendedStores": [
        {"name": "Drømmeland", "reason": "Har senge med stofgavler og tykke madrasser"},
        {"name": "IKEA", "reason": "Bredt udvalg af minimalistiske senge i grå"}
      ]
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
    max_tokens: 3000,
    response_format: { type: "json_object" },
  });

  const content = response.choices[0].message.content;
  if (!content) throw new Error("No response from OpenAI");

  const parsed = JSON.parse(content) as AnalysisResult;
  parsed.totalProductBudget = productBudget;
  parsed.profit = profit;
  return parsed;
}
