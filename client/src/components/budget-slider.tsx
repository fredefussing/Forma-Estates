import { useState, useEffect } from "react";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { styleVocabulary, type BudgetTier } from "@shared/styleVocabulary";
import { budgetToTier, getTierLabel, formatDKK } from "@shared/budgetUtils";
import type { DesignStyle } from "@shared/schema";
import { Coins, TrendingUp, Crown } from "lucide-react";

interface BudgetSliderProps {
  style: DesignStyle;
  onChange: (budget: number, tier: BudgetTier) => void;
}

const tierIcons: Record<BudgetTier, typeof Coins> = {
  budget: Coins,
  standard: TrendingUp,
  luxury: Crown,
};

const tierColors: Record<BudgetTier, string> = {
  budget: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  standard: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  luxury: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
};

export function BudgetSlider({ style, onChange }: BudgetSliderProps) {
  const [budget, setBudget] = useState(25000);
  const tier = budgetToTier(budget);
  const config = styleVocabulary[style]?.[tier];
  const TierIcon = tierIcons[tier];

  useEffect(() => {
    onChange(budget, tier);
  }, [budget, tier]);

  return (
    <div className="space-y-4" data-testid="budget-slider-container">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Budget</h2>
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold tabular-nums" data-testid="text-budget-amount">
            {formatDKK(budget)}
          </span>
          <Badge className={`${tierColors[tier]} border-0`} data-testid="badge-tier">
            <TierIcon className="w-3 h-3 mr-1" />
            {getTierLabel(tier)}
          </Badge>
        </div>
      </div>

      <Slider
        value={[budget]}
        onValueChange={([val]) => setBudget(val)}
        min={5000}
        max={100000}
        step={1000}
        className="py-2"
        data-testid="slider-budget"
      />

      <div className="flex justify-between text-xs text-muted-foreground">
        <span>5.000 kr</span>
        <span>100.000 kr</span>
      </div>

      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <div className={`w-2 h-2 rounded-full ${tier === "budget" ? "bg-green-500" : "bg-muted"}`} />
        <span className="mr-2">Budget (&lt;15k)</span>
        <div className={`w-2 h-2 rounded-full ${tier === "standard" ? "bg-blue-500" : "bg-muted"}`} />
        <span className="mr-2">Standard (15-40k)</span>
        <div className={`w-2 h-2 rounded-full ${tier === "luxury" ? "bg-amber-500" : "bg-muted"}`} />
        <span>Luksus (&gt;40k)</span>
      </div>

      {config && (
        <div className="rounded-md border bg-muted/30 p-3 space-y-1.5" data-testid="tier-info">
          <p className="text-sm">{config.description}</p>
          <div className="flex flex-wrap gap-1.5">
            {config.exampleRetailers.map((r) => (
              <Badge key={r} variant="outline" className="text-xs" data-testid={`badge-retailer-${r}`}>
                {r}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
