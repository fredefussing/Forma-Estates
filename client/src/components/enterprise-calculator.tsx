import { useState } from "react";
import { ArrowRight, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Product = {
  key: string;
  label: string;
  basePrice: number;
  max: number;
  unit: string;
  tiers: Array<{ from: number; unitPrice: number }>;
};

const ENTERPRISE_PRODUCTS: Product[] = [
  {
    key: "ai",
    label: "AI Visualisering",
    basePrice: 100,
    max: 200,
    unit: "stk.",
    tiers: [
      { from: 1,   unitPrice: 100 },
      { from: 16,  unitPrice: 90  },
      { from: 41,  unitPrice: 80  },
      { from: 81,  unitPrice: 72  },
      { from: 151, unitPrice: 65  },
    ],
  },
  {
    key: "floor",
    label: "3D Plantegning",
    basePrice: 300,
    max: 60,
    unit: "stk.",
    tiers: [
      { from: 1,  unitPrice: 300 },
      { from: 6,  unitPrice: 270 },
      { from: 13, unitPrice: 240 },
      { from: 26, unitPrice: 216 },
      { from: 41, unitPrice: 195 },
    ],
  },
  {
    key: "video",
    label: "Transformering Video",
    basePrice: 300,
    max: 50,
    unit: "stk.",
    tiers: [
      { from: 1,  unitPrice: 300 },
      { from: 4,  unitPrice: 270 },
      { from: 9,  unitPrice: 240 },
      { from: 19, unitPrice: 216 },
      { from: 31, unitPrice: 195 },
    ],
  },
  {
    key: "showcase",
    label: "Bolig Showcase Video",
    basePrice: 500,
    max: 30,
    unit: "stk.",
    tiers: [
      { from: 1,  unitPrice: 500 },
      { from: 4,  unitPrice: 450 },
      { from: 9,  unitPrice: 400 },
      { from: 16, unitPrice: 360 },
      { from: 26, unitPrice: 325 },
    ],
  },
];

export function getUnitPrice(product: Product, qty: number): number {
  if (qty === 0) return product.basePrice;
  let price = product.tiers[0].unitPrice;
  for (const tier of product.tiers) {
    if (qty >= tier.from) price = tier.unitPrice;
    else break;
  }
  return price;
}

function getDiscountPct(product: Product, qty: number): number {
  return Math.round((1 - getUnitPrice(product, qty) / product.basePrice) * 100);
}

type Props = {
  dark?: boolean;
};

export function EnterpriseCalculator({ dark = false }: Props) {
  const [quantities, setQuantities] = useState<Record<string, number>>({
    ai: 0, floor: 0, video: 0, showcase: 0,
  });

  const totalFull = ENTERPRISE_PRODUCTS.reduce((sum, p) => sum + p.basePrice * quantities[p.key], 0);
  const totalDiscounted = ENTERPRISE_PRODUCTS.reduce((sum, p) => sum + getUnitPrice(p, quantities[p.key]) * quantities[p.key], 0);
  const totalSavings = totalFull - totalDiscounted;
  const overallDiscount = totalFull > 0 ? Math.round((totalSavings / totalFull) * 100) : 0;
  const hasItems = Object.values(quantities).some((q) => q > 0);

  const bg = dark ? "rgba(255,255,255,0.04)" : "white";
  const border = dark ? "rgba(255,255,255,0.1)" : "#E8E4DE";
  const text = dark ? "rgba(255,255,255,0.9)" : "#0F1D2F";
  const muted = dark ? "rgba(255,255,255,0.5)" : "#6B6B6B";
  const rowBg = dark ? "rgba(255,255,255,0.04)" : "#F8F6F3";
  const rowBorder = dark ? "rgba(255,255,255,0.08)" : "#E8E4DE";
  const summaryBg = dark ? "rgba(255,255,255,0.06)" : "#F8F6F3";

  return (
    <div
      className="rounded-3xl border p-5 sm:p-8 md:p-10"
      style={{ background: bg, borderColor: border }}
      data-testid="section-enterprise-calculator"
    >
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-8">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold mb-3"
            style={{ background: dark ? "rgba(200,149,108,0.2)" : "#F3EDE6", color: "#C8956C" }}>
            <Building2 className="w-3.5 h-3.5" />
            Enterprise — byg dit eget
          </div>
          <h2 className="text-2xl font-bold tracking-tight" style={{ color: text }}>Sammensæt din pakke</h2>
          <p className="text-sm mt-1" style={{ color: muted }}>Vælg antal af hver ydelse — prisen falder automatisk jo mere du bestiller.</p>
        </div>
        {overallDiscount > 0 && (
          <div className="flex-shrink-0 rounded-2xl px-5 py-3 text-center"
            style={{ background: dark ? "rgba(34,197,94,0.15)" : "#F0FDF4", border: `1px solid ${dark ? "rgba(34,197,94,0.25)" : "#BBF7D0"}` }}>
            <div className="text-2xl font-bold" style={{ color: "#16A34A" }}>{overallDiscount}%</div>
            <div className="text-xs font-medium" style={{ color: "#16A34A" }}>samlet rabat</div>
          </div>
        )}
      </div>

      {/* Product rows */}
      <div className="space-y-4">
        {ENTERPRISE_PRODUCTS.map((product) => {
          const qty = quantities[product.key];
          const unitPrice = getUnitPrice(product, qty);
          const discPct = getDiscountPct(product, qty);
          const lineTotal = unitPrice * qty;

          return (
            <div key={product.key} className="rounded-xl p-5"
              style={{ background: rowBg, border: `1px solid ${rowBorder}` }}
              data-testid={`row-enterprise-${product.key}`}>

              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold" style={{ color: text }}>{product.label}</span>
                  {discPct > 0 && qty > 0 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: dark ? "rgba(34,197,94,0.2)" : "#DCFCE7", color: "#16A34A" }}>
                      -{discPct}%
                    </span>
                  )}
                </div>
                <div className="text-right">
                  {qty > 0 ? (
                    <div className="flex items-baseline gap-2">
                      {discPct > 0 && (
                        <span className="text-xs line-through" style={{ color: muted }}>
                          {(product.basePrice * qty).toLocaleString("da-DK")} kr.
                        </span>
                      )}
                      <span className="text-base font-bold" style={{ color: text }}>
                        {lineTotal.toLocaleString("da-DK")} kr.
                      </span>
                    </div>
                  ) : (
                    <span className="text-sm" style={{ color: muted }}>{product.basePrice} kr. / {product.unit}</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min={0}
                  max={product.max}
                  step={1}
                  value={qty}
                  onChange={(e) => setQuantities((prev) => ({ ...prev, [product.key]: Number(e.target.value) }))}
                  className="flex-1 h-2 rounded-full cursor-pointer"
                  style={{ accentColor: "#C8956C" }}
                  data-testid={`slider-enterprise-${product.key}`}
                />
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => setQuantities((prev) => ({ ...prev, [product.key]: Math.max(0, qty - 1) }))}
                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors"
                    style={{ border: `1px solid ${border}`, color: text, background: "transparent" }}
                    data-testid={`button-enterprise-${product.key}-minus`}
                  >−</button>
                  <span className="w-8 text-center text-sm font-semibold tabular-nums" style={{ color: text }}>{qty}</span>
                  <button
                    onClick={() => setQuantities((prev) => ({ ...prev, [product.key]: Math.min(product.max, qty + 1) }))}
                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors"
                    style={{ border: `1px solid ${border}`, color: text, background: "transparent" }}
                    data-testid={`button-enterprise-${product.key}-plus`}
                  >+</button>
                </div>
              </div>

              {qty > 0 && (
                <p className="text-[11px] mt-2" style={{ color: muted }}>
                  {unitPrice} kr. / {product.unit}
                  {discPct > 0 && ` · du sparer ${(product.basePrice - unitPrice).toLocaleString("da-DK")} kr. pr. stk.`}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div className="mt-8 rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6"
        style={{ background: summaryBg, border: `1px solid ${rowBorder}` }}>
        <div className="space-y-1">
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-bold" style={{ color: text }}>
              {totalDiscounted.toLocaleString("da-DK")} kr.
            </span>
            {totalSavings > 0 && (
              <span className="text-sm line-through" style={{ color: muted }}>
                {totalFull.toLocaleString("da-DK")} kr.
              </span>
            )}
          </div>
          {totalSavings > 0 && (
            <p className="text-sm font-medium" style={{ color: "#16A34A" }}>
              Du sparer {totalSavings.toLocaleString("da-DK")} kr. ({overallDiscount}% samlet rabat)
            </p>
          )}
          {!hasItems && (
            <p className="text-sm" style={{ color: muted }}>Træk i sliderne ovenfor for at beregne din pris</p>
          )}
        </div>
        <button
          disabled={!hasItems}
          onClick={() => {
            const lines = ENTERPRISE_PRODUCTS
              .filter((p) => quantities[p.key] > 0)
              .map((p) => `${p.label}: ${quantities[p.key]} stk. à ${getUnitPrice(p, quantities[p.key])} kr.`)
              .join("%0A");
            window.location.href = `mailto:kontakt@formaestates.com?subject=Enterprise%20tilbud&body=Hej%2C%20jeg%20er%20interesseret%20i%20f%C3%B8lgende%3A%0A${lines}%0A%0ASamlet%3A%20${totalDiscounted.toLocaleString("da-DK")}%20kr.`;
          }}
          className="flex-shrink-0 h-12 px-8 rounded-full font-semibold text-sm inline-flex items-center gap-2 transition-opacity disabled:opacity-40"
          style={{ background: "#C8956C", color: "#fff" }}
          data-testid="button-enterprise-get-quote"
        >
          Få tilbud
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
