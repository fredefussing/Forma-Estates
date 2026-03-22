import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface AnalyzedProduct {
  name: string;
  description: string;
  estimatedPrice: number;
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
Fordel produktbudgetet realistisk mellem produkterne.
Svar KUN med valid JSON i dette format (ingen markdown, ingen forklaring):
{
  "products": [
    {"name": "Sofa", "description": "3-personers i grå stof, nordisk design", "estimatedPrice": 8000},
    {"name": "Sofabord", "description": "Rundt i eg med sort metalstel", "estimatedPrice": 2500}
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

  const parsed = JSON.parse(content) as AnalysisResult;
  parsed.totalProductBudget = productBudget;
  parsed.profit = profit;
  return parsed;
}
