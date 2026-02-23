import { useState, useEffect } from "react";
import { Slider } from "@/components/ui/slider";
import { styleVocabulary, type BudgetTier } from "@shared/styleVocabulary";
import { budgetToTier, getTierLabel, formatDKK } from "@shared/budgetUtils";
import type { DesignStyle } from "@shared/schema";

interface BudgetSliderProps {
  style: DesignStyle;
  onChange: (budget: number, tier: BudgetTier) => void;
}

const tierDotColor: Record<BudgetTier, string> = {
  budget: "bg-emerald-500",
  standard: "bg-foreground",
  luxury: "bg-amber-500",
};

export function BudgetSlider({ style, onChange }: BudgetSliderProps) {
  const [budget, setBudget] = useState(25000);
  const tier = budgetToTier(budget);
  const config = styleVocabulary[style]?.[tier];

  useEffect(() => {
    onChange(budget, tier);
  }, [budget, tier]);

  return (
    <div className="space-y-5" data-testid="budget-slider-container">
      <div className="flex items-baseline justify-between">
        <p className="text-xs tracking-widest uppercase text-muted-foreground font-medium">Budget</p>
        <div className="flex items-center gap-3">
          <span className="text-2xl font-semibold tabular-nums tracking-tight" data-testid="text-budget-amount">
            {formatDKK(budget)}
          </span>
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border border-border/40 bg-foreground/5`} data-testid="badge-tier">
            <span className={`w-1.5 h-1.5 rounded-full ${tierDotColor[tier]}`} />
            {getTierLabel(tier)}
          </span>
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

      <div className="flex justify-between text-[11px] text-muted-foreground/60">
        <span>5.000 kr</span>
        <span>100.000 kr</span>
      </div>

      <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${tier === "budget" ? "bg-emerald-500" : "bg-border"}`} />
          <span>Budget</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${tier === "standard" ? "bg-foreground" : "bg-border"}`} />
          <span>Standard</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${tier === "luxury" ? "bg-amber-500" : "bg-border"}`} />
          <span>Luksus</span>
        </div>
      </div>

      {config && (
        <div className="rounded-lg border border-border/40 bg-card/50 p-4 space-y-2.5" data-testid="tier-info">
          <p className="text-sm text-foreground/80 leading-relaxed">{config.description}</p>
          <div className="flex flex-wrap gap-1.5">
            {config.exampleRetailers.map((r) => (
              <span key={r} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-foreground/5 text-foreground/60 border border-border/30" data-testid={`badge-retailer-${r}`}>
                {r}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
