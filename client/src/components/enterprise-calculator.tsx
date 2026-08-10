import { useState, useEffect, useRef, useCallback } from "react";
import { ArrowRight, Building2, Zap, Box, Video, Home, Loader2, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";

// ── Types ─────────────────────────────────────────────────────────────────────
type ProductKey = "aiVisual" | "plan3d" | "transformVideo" | "showcase";

type CalcItem = {
  name: string;
  quantity: number;
  unitPrice: number;
  originalUnitPrice: number;
  total: number;
  originalTotal: number;
  discountPercent: number;
};

type CalcResult = {
  items: CalcItem[];
  originalTotal: number;
  grandTotal: number;
  totalSavings: number;
  totalDiscountPercent: number;
};

// ── Product definitions ────────────────────────────────────────────────────────
// "apiName" is the server-side name used in /api/calculate-package responses
// (always Danish); "labelKey" is the i18n translation key shown to the user.
const PRODUCTS: {
  key: ProductKey;
  apiName: string;
  labelKey: string;
  icon: typeof Zap;
  basePrice: number;
  max: number;
  tiers: Array<{ from: number; to: number; range: string; pct: number }>;
}[] = [
  {
    key: "aiVisual",
    apiName: "AI Visualisering",
    labelKey: "enterpriseCalc.products.aiVisual",
    icon: Zap,
    basePrice: 100,
    max: 200,
    tiers: [
      { from: 1,   to: 15,  range: "1–15",    pct: 0  },
      { from: 16,  to: 40,  range: "16–40",   pct: 10 },
      { from: 41,  to: 80,  range: "41–80",   pct: 20 },
      { from: 81,  to: 150, range: "81–150",  pct: 28 },
      { from: 151, to: 200, range: "151–200", pct: 35 },
    ],
  },
  {
    key: "plan3d",
    apiName: "3D Plantegning",
    labelKey: "enterpriseCalc.products.plan3d",
    icon: Box,
    basePrice: 300,
    max: 60,
    tiers: [
      { from: 1,  to: 5,  range: "1–5",   pct: 0  },
      { from: 6,  to: 12, range: "6–12",  pct: 10 },
      { from: 13, to: 25, range: "13–25", pct: 20 },
      { from: 26, to: 40, range: "26–40", pct: 28 },
      { from: 41, to: 60, range: "41–60", pct: 35 },
    ],
  },
  {
    key: "transformVideo",
    apiName: "Transformering Video",
    labelKey: "enterpriseCalc.products.transformVideo",
    icon: Video,
    basePrice: 300,
    max: 60,
    tiers: [
      { from: 1,  to: 5,  range: "1–5",   pct: 0  },
      { from: 6,  to: 12, range: "6–12",  pct: 10 },
      { from: 13, to: 25, range: "13–25", pct: 20 },
      { from: 26, to: 40, range: "26–40", pct: 28 },
      { from: 41, to: 60, range: "41–60", pct: 35 },
    ],
  },
  {
    key: "showcase",
    apiName: "Bolig Showcase Video",
    labelKey: "enterpriseCalc.products.showcase",
    icon: Home,
    basePrice: 500,
    max: 60,
    tiers: [
      { from: 1,  to: 5,  range: "1–5",   pct: 0  },
      { from: 6,  to: 12, range: "6–12",  pct: 10 },
      { from: 13, to: 25, range: "13–25", pct: 20 },
      { from: 26, to: 40, range: "26–40", pct: 28 },
      { from: 41, to: 60, range: "41–60", pct: 35 },
    ],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  n.toLocaleString("da-DK", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

function getCurrentTierIdx(product: typeof PRODUCTS[0], qty: number) {
  if (qty === 0) return -1;
  let idx = 0;
  for (let i = 0; i < product.tiers.length; i++) {
    if (qty >= product.tiers[i].from) idx = i;
    else break;
  }
  return idx;
}

function getNextTierInfo(product: typeof PRODUCTS[0], qty: number) {
  const idx = getCurrentTierIdx(product, qty);
  const next = product.tiers[idx + 1];
  if (!next) return null;
  return { stksLeft: next.from - qty, nextPct: next.pct };
}

// ── AnimatedNumber ─────────────────────────────────────────────────────────────
function AnimatedNumber({ value, suffix = "" }: { value: number; suffix?: string }) {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);

  useEffect(() => {
    if (prev.current === value) return;
    const start = prev.current;
    const end = value;
    const duration = 280;
    const startTime = performance.now();
    const step = (now: number) => {
      const p = Math.min((now - startTime) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(start + (end - start) * ease));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    prev.current = value;
  }, [value]);

  return <span>{fmt(display)}{suffix}</span>;
}

// ── ProductRow ────────────────────────────────────────────────────────────────
function ProductRow({
  product,
  qty,
  item,
  onQtyChange,
}: {
  product: typeof PRODUCTS[0];
  qty: number;
  item: CalcItem | undefined;
  onQtyChange: (key: ProductKey, val: number) => void;
}) {
  const { t } = useTranslation();
  const Icon = product.icon;
  const tierIdx = getCurrentTierIdx(product, qty);
  const nextTier = getNextTierInfo(product, qty);
  const discPct = item?.discountPercent ?? 0;
  const unitPrice = item?.unitPrice ?? product.basePrice;
  const lineTotal = item?.total ?? 0;
  const origLineTotal = item?.originalTotal ?? 0;
  const saving = origLineTotal - lineTotal;
  const unit = t("enterpriseCalc.unit");

  return (
    <div
      className="rounded-2xl p-5 sm:p-6 transition-all"
      style={{
        background: qty > 0 ? "rgba(201,169,110,0.06)" : "rgba(255,255,255,0.03)",
        border: qty > 0 ? "1px solid rgba(201,169,110,0.2)" : "1px solid rgba(255,255,255,0.07)",
      }}
      data-testid={`row-enterprise-${product.key}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: qty > 0 ? "rgba(201,169,110,0.2)" : "rgba(255,255,255,0.07)" }}
          >
            <Icon className="w-4 h-4" style={{ color: qty > 0 ? "#c9a96e" : "rgba(255,255,255,0.4)" }} />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{t(product.labelKey)}</p>
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
              {t("enterpriseCalc.base", { price: fmt(product.basePrice) })}
            </p>
          </div>
        </div>

        {/* Price block */}
        <div className="text-right flex-shrink-0">
          {qty > 0 ? (
            <>
              {discPct > 0 && (
                <p className="text-xs line-through" style={{ color: "#64748b" }}>
                  {fmt(origLineTotal)} kr.
                </p>
              )}
              <p className="text-lg font-bold text-white">
                <AnimatedNumber value={lineTotal} /> kr.
              </p>
              {discPct > 0 && (
                <span
                  className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full mt-0.5"
                  style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.25)" }}
                >
                  −{discPct}%
                </span>
              )}
            </>
          ) : (
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.35)" }}>
              {fmt(product.basePrice)} kr./{unit}
            </p>
          )}
        </div>
      </div>

      {/* Tier badges */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {product.tiers.map((tier, i) => {
          const active = i === tierIdx;
          const passed = i < tierIdx;
          return (
            <span
              key={i}
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full transition-all"
              style={{
                background: active
                  ? "rgba(34,197,94,0.18)"
                  : passed
                  ? "rgba(34,197,94,0.08)"
                  : "rgba(255,255,255,0.05)",
                color: active ? "#22c55e" : passed ? "rgba(34,197,94,0.6)" : "rgba(255,255,255,0.3)",
                border: active ? "1px solid rgba(34,197,94,0.35)" : "1px solid transparent",
              }}
            >
              {tier.pct > 0 ? `−${tier.pct}%` : "0%"} · {tier.range} {unit}
            </span>
          );
        })}
      </div>

      {/* Slider + counter */}
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={product.max}
          step={1}
          value={qty}
          onChange={(e) => onQtyChange(product.key, Number(e.target.value))}
          className="flex-1 cursor-pointer appearance-none"
          style={{
            height: 6,
            borderRadius: 999,
            outline: "none",
            background: `linear-gradient(to right, #c9a96e 0%, #c9a96e ${(qty / product.max) * 100}%, rgba(255,255,255,0.15) ${(qty / product.max) * 100}%, rgba(255,255,255,0.15) 100%)`,
          }}
          data-testid={`slider-enterprise-${product.key}`}
        />
        <style>{`
          input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%; background: #c9a96e; cursor: pointer; box-shadow: 0 0 0 3px rgba(201,169,110,0.25); }
          input[type=range]::-moz-range-thumb { width: 16px; height: 16px; border-radius: 50%; background: #c9a96e; cursor: pointer; border: none; box-shadow: 0 0 0 3px rgba(201,169,110,0.25); }
          input[type=range]::-webkit-slider-runnable-track { border-radius: 999px; }
          input[type=range]::-moz-range-track { border-radius: 999px; }
        `}</style>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => onQtyChange(product.key, Math.max(0, qty - 1))}
            className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold transition-colors hover:bg-white/10"
            style={{ border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.7)" }}
            data-testid={`button-enterprise-${product.key}-minus`}
          >−</button>
          <span
            className="w-10 text-center text-sm font-bold tabular-nums"
            style={{ color: qty > 0 ? "#c9a96e" : "rgba(255,255,255,0.4)" }}
          >
            {qty}
          </span>
          <button
            onClick={() => onQtyChange(product.key, Math.min(product.max, qty + 1))}
            className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold transition-colors hover:bg-white/10"
            style={{ border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.7)" }}
            data-testid={`button-enterprise-${product.key}-plus`}
          >+</button>
        </div>
      </div>

      {/* Per-unit detail + next tier nudge */}
      {qty > 0 && (
        <div className="mt-3 flex items-center justify-between">
          <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>
            {fmt(unitPrice)} kr./{unit}
            {discPct > 0 && (
              <span style={{ color: "#22c55e" }}>
                {" "}{t("enterpriseCalc.savePerUnit", { amount: fmt(product.basePrice - unitPrice) })}
              </span>
            )}
          </p>
          {nextTier && (
            <p className="text-[11px]" style={{ color: "#c9a96e" }}>
              {t("enterpriseCalc.nextTier", { count: nextTier.stksLeft, pct: nextTier.nextPct })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
type Props = { dark?: boolean };

export function EnterpriseCalculator({ dark: _dark = true }: Props) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const [quantities, setQuantities] = useState<Record<ProductKey, number>>({
    aiVisual: 0, plan3d: 0, transformVideo: 0, showcase: 0,
  });
  const [result, setResult] = useState<CalcResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasItems = Object.values(quantities).some((q) => q > 0);

  const fetchCalc = useCallback(async (qty: Record<ProductKey, number>) => {
    setLoading(true);
    try {
      const res = await fetch("/api/calculate-package", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(qty),
      });
      if (res.ok) setResult(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  const handleQtyChange = (key: ProductKey, val: number) => {
    const next = { ...quantities, [key]: val };
    setQuantities(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchCalc(next), 200);
  };

  useEffect(() => {
    fetchCalc(quantities);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  const grandTotal = result?.grandTotal ?? 0;
  const origTotal = result?.originalTotal ?? 0;
  const savings = result?.totalSavings ?? 0;
  const discountPct = result?.totalDiscountPercent ?? 0;

  const handleCheckout = async () => {
    if (!hasItems || checkoutLoading) return;
    if (!user) {
      // Not logged in — save intent and send to login first
      sessionStorage.setItem("forma_checkout_intent", JSON.stringify({ type: "package", quantities }));
      setLocation(`/login?redirect=${encodeURIComponent("/boligpotentiale#enterprise-calculator")}`);
      return;
    }
    setCheckoutError(null);
    setCheckoutLoading(true);
    try {
      const res = await fetch("/api/create-package-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...quantities, customerEmail: user.email }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else throw new Error(data.error ?? t("enterpriseCalc.unknownError"));
    } catch (e: any) {
      setCheckoutError(t("enterpriseCalc.checkoutFailed", { error: e.message }));
    } finally {
      setCheckoutLoading(false);
    }
  };

  // After login redirect back: auto-trigger package checkout if intent is stored
  useEffect(() => {
    if (!user) return;
    const raw = sessionStorage.getItem("forma_checkout_intent");
    if (!raw) return;
    try {
      const intent = JSON.parse(raw);
      if (intent.type !== "package" || !intent.quantities) return;
      sessionStorage.removeItem("forma_checkout_intent");
      const qty: Record<ProductKey, number> = { aiVisual: 0, plan3d: 0, transformVideo: 0, showcase: 0, ...intent.quantities };
      setQuantities(qty);
      setCheckoutLoading(true);
      fetch("/api/create-package-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...qty, customerEmail: user.email }),
      })
        .then(r => r.json())
        .then(data => { if (data.url) window.location.href = data.url; })
        .catch(() => {})
        .finally(() => setCheckoutLoading(false));
    } catch { /* ignore malformed intent */ }
  }, [user]);

  return (
    <div
      className="rounded-3xl overflow-hidden"
      style={{ background: "#0F1923", border: "1px solid rgba(201,169,110,0.15)" }}
      data-testid="section-enterprise-calculator"
    >
      {/* Top bar */}
      <div
        className="px-6 sm:px-10 py-5 flex items-center justify-between"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(201,169,110,0.15)" }}
          >
            <Building2 className="w-4 h-4" style={{ color: "#c9a96e" }} />
          </div>
          <div>
            <p className="text-xs font-semibold" style={{ color: "#c9a96e", letterSpacing: "0.08em" }}>
              ENTERPRISE
            </p>
            <p className="text-sm font-bold text-white leading-tight">{t("enterpriseCalc.title")}</p>
          </div>
          <span
            className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full flex-shrink-0"
            style={{ background: "rgba(34,197,94,0.12)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.25)" }}
            data-testid="badge-one-time-payment"
          >
            <ShieldCheck className="w-3 h-3" />
            {t("enterpriseCalc.oneTimePayment")}
          </span>
        </div>

        {/* Live discount badge */}
        <div
          className="flex-shrink-0 rounded-2xl px-4 py-2 text-center transition-all"
          style={{
            background: discountPct > 0 ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.05)",
            border: `1px solid ${discountPct > 0 ? "rgba(34,197,94,0.3)" : "rgba(255,255,255,0.08)"}`,
            opacity: loading ? 0.7 : 1,
          }}
        >
          <p
            className="text-2xl font-black leading-none"
            style={{ color: discountPct > 0 ? "#22c55e" : "rgba(255,255,255,0.2)" }}
          >
            {discountPct > 0 ? `${discountPct}%` : "0%"}
          </p>
          <p className="text-[10px] font-semibold mt-0.5" style={{ color: discountPct > 0 ? "#22c55e" : "rgba(255,255,255,0.2)" }}>
            {t("enterpriseCalc.totalDiscount")}
          </p>
        </div>
      </div>

      {/* Subtitle */}
      <div className="px-6 sm:px-10 pt-5 pb-2">
        <p className="text-sm" style={{ color: "rgba(255,255,255,0.45)" }}>
          {t("enterpriseCalc.subtitle")}
        </p>
      </div>

      {/* Product rows */}
      <div className="px-6 sm:px-10 py-4 space-y-3">
        {PRODUCTS.map((product) => (
          <ProductRow
            key={product.key}
            product={product}
            qty={quantities[product.key]}
            item={result?.items.find((i) => i.name === product.apiName)}
            onQtyChange={handleQtyChange}
          />
        ))}
      </div>

      {/* Summary */}
      <div
        className="mx-6 sm:mx-10 mb-6 sm:mb-10 rounded-2xl p-6"
        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
          <div>
            {hasItems ? (
              <>
                <div className="flex items-baseline gap-3">
                  <span className="text-3xl font-black text-white">
                    <AnimatedNumber value={grandTotal} /> kr.
                  </span>
                  {savings > 0 && (
                    <span className="text-base line-through" style={{ color: "#64748b" }}>
                      {fmt(origTotal)} kr.
                    </span>
                  )}
                </div>
                {savings > 0 && (
                  <p className="text-sm font-semibold mt-1" style={{ color: "#22c55e" }}>
                    {t("enterpriseCalc.youSave", { amount: fmt(savings), pct: discountPct })}
                  </p>
                )}
                {savings === 0 && (
                  <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>
                    {t("enterpriseCalc.addMoreDiscount")}
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="text-3xl font-black" style={{ color: "rgba(255,255,255,0.15)" }}>0 kr.</p>
                <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>
                  {t("enterpriseCalc.dragSliders")}
                </p>
              </>
            )}
          </div>

          <div className="flex flex-col items-end gap-1.5">
            <button
              onClick={handleCheckout}
              disabled={!hasItems || checkoutLoading}
              className="flex-shrink-0 h-12 px-7 rounded-full font-semibold text-sm inline-flex items-center gap-2 transition-all"
              style={{
                background: hasItems ? "#c9a96e" : "rgba(255,255,255,0.08)",
                color: hasItems ? "#0F1923" : "rgba(255,255,255,0.2)",
                cursor: hasItems && !checkoutLoading ? "pointer" : "default",
                opacity: checkoutLoading ? 0.7 : 1,
              }}
              data-testid="button-enterprise-get-quote"
            >
              {checkoutLoading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> {t("enterpriseCalc.loadingCheckout")}</>
              ) : (
                <>{t("enterpriseCalc.payOnce")} <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
            <p className="text-[10px] text-center" style={{ color: "rgba(255,255,255,0.3)" }}>
              {t("enterpriseCalc.noSubscription")}
            </p>
          </div>
        </div>

        {/* Checkout error */}
        {checkoutError && (
          <div
            className="mt-4 p-3 rounded-xl text-xs"
            style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171" }}
            data-testid="text-enterprise-checkout-error"
          >
            {checkoutError}
          </div>
        )}

        {/* Line items breakdown when active */}
        {hasItems && result && (
          <div
            className="mt-5 pt-5 space-y-2"
            style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}
          >
            {result.items.filter((i) => i.quantity > 0).map((item) => {
              const productMatch = PRODUCTS.find((p) => p.apiName === item.name);
              const displayName = productMatch ? t(productMatch.labelKey) : item.name;
              return (
                <div key={item.name} className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>
                    {displayName} × {item.quantity}
                  </span>
                  <div className="flex items-center gap-2">
                    {item.discountPercent > 0 && (
                      <span className="text-xs line-through" style={{ color: "#64748b" }}>
                        {fmt(item.originalTotal)} kr.
                      </span>
                    )}
                    <span className="text-xs font-semibold text-white">{fmt(item.total)} kr.</span>
                  </div>
                </div>
              );
            })}
            {savings > 0 && (
              <div className="flex items-center justify-between pt-1" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                <span className="text-xs font-semibold" style={{ color: "#22c55e" }}>
                  {t("enterpriseCalc.totalDiscountLabel")}
                </span>
                <span className="text-xs font-bold" style={{ color: "#22c55e" }}>−{fmt(savings)} kr.</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
