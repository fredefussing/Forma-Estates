import type { BudgetTier } from "./styleVocabulary";

export function budgetToTier(budget: number): BudgetTier {
  if (budget < 15000) return "budget";
  if (budget < 40000) return "standard";
  return "luxury";
}

export function getTierLabel(tier: BudgetTier): string {
  const labels: Record<BudgetTier, string> = {
    budget: "Budget",
    standard: "Standard",
    luxury: "Luksus",
  };
  return labels[tier];
}

export function formatDKK(amount: number): string {
  return `${amount.toLocaleString("da-DK")} kr`;
}
