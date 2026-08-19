import { Check, ChevronDown, Crown, Info, Sparkles, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import "./_group.css";

type CurrencyCode = "DKK" | "EUR" | "NOK" | "CHF" | "SEK" | "USD";

const currencies: Record<CurrencyCode, { name: string; symbol: string; rate: number; locale: string }> = {
  DKK: { name: "Danish krone", symbol: "kr.", rate: 1, locale: "da-DK" },
  EUR: { name: "Euro", symbol: "€", rate: 0.134, locale: "de-DE" },
  NOK: { name: "Norwegian krone", symbol: "kr", rate: 1.55, locale: "nb-NO" },
  CHF: { name: "Swiss franc", symbol: "CHF", rate: 0.128, locale: "de-CH" },
  SEK: { name: "Swedish krona", symbol: "kr", rate: 1.51, locale: "sv-SE" },
  USD: { name: "US dollar", symbol: "$", rate: 0.146, locale: "en-US" },
};

const packages = [
  {
    name: "Start",
    monthlyDkk: 2999,
    allowance: "10 AI Visualiseringer / md.",
    description: "Til dig der vil i gang med professionelle AI-visualiseringer.",
    icon: Sparkles,
    features: ["2 3D Plantegninger / md.", "2 Transformering Videoer / md.", "1 Bolig Showcase / md.", "HD 1080p download"],
  },
  {
    name: "Pro",
    monthlyDkk: 5999,
    allowance: "25 AI Visualiseringer / md.",
    description: "Til aktive professionelle med løbende behov for professionelle visualiseringer.",
    icon: Zap,
    popular: true,
    features: ["5 3D Plantegninger / md.", "5 Transformering Videoer / md.", "3 Bolig Showcase / md.", "4K download"],
  },
  {
    name: "Business",
    monthlyDkk: 11999,
    allowance: "60 AI Visualiseringer / md.",
    description: "Til virksomheder og teams med høj volumen og komplekse projekter.",
    icon: Crown,
    features: ["12 3D Plantegninger / md.", "12 Transformering Videoer / md.", "8 Bolig Showcase / md.", "Dedikeret support"],
  },
];

function formatPrice(dkk: number, currency: CurrencyCode) {
  const config = currencies[currency];
  const converted = dkk * config.rate;
  const rounded = currency === "DKK" ? Math.round(converted) : Math.round(converted * 100) / 100;
  const value = new Intl.NumberFormat(config.locale, {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: currency === "DKK" ? 0 : 2,
    maximumFractionDigits: currency === "DKK" ? 0 : 2,
  }).format(rounded);
  return currency === "CHF" ? `${value}` : value;
}

export function CurrencySelector() {
  const [period, setPeriod] = useState<"monthly" | "yearly">("monthly");
  const [currency, setCurrency] = useState<CurrencyCode>("DKK");
  const [showCurrencies, setShowCurrencies] = useState(false);
  const config = currencies[currency];

  const subtitle = useMemo(
    () => period === "yearly" ? "Årsabonnement — betal årligt og spar 20%" : "Fleksibel betaling måned for måned",
    [period],
  );

  return (
    <div className="forma-pricing px-7 py-10 sm:px-12">
      <div className="mx-auto max-w-5xl">
        <div className="mb-11 text-center">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-stone-500">Forma Estates</p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Vælg din plan</h1>
          <p className="mt-3 text-sm text-stone-500">Vælg den plan der passer til dit behov og kom i gang med det samme</p>

          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <div className="inline-flex items-center gap-1 rounded-full border border-stone-200 bg-stone-100 p-1" aria-label="Faktureringsperiode">
              <button onClick={() => setPeriod("monthly")} className={`rounded-full px-5 py-2 text-sm font-semibold transition ${period === "monthly" ? "bg-white text-stone-950 shadow-sm" : "text-stone-500 hover:text-stone-950"}`}>Månedlig</button>
              <button onClick={() => setPeriod("yearly")} className={`rounded-full px-5 py-2 text-sm font-semibold transition ${period === "yearly" ? "bg-white text-stone-950 shadow-sm" : "text-stone-500 hover:text-stone-950"}`}>Årlig <span className="font-bold text-emerald-600">–20%</span></button>
            </div>

            <div className="relative">
              <button onClick={() => setShowCurrencies((visible) => !visible)} className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-800 shadow-sm transition hover:border-stone-400" aria-expanded={showCurrencies}>
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-stone-100 px-1 text-[10px] font-bold text-stone-600">{currency}</span>
                <span>{config.symbol}</span>
                <ChevronDown size={15} className={`transition ${showCurrencies ? "rotate-180" : ""}`} />
              </button>
              {showCurrencies && (
                <div className="absolute right-0 z-10 mt-2 w-64 overflow-hidden rounded-2xl border border-stone-200 bg-white p-1.5 text-left shadow-xl">
                  <p className="px-3 pb-1.5 pt-2 text-[11px] font-bold uppercase tracking-[0.12em] text-stone-400">Vis priser i</p>
                  {(Object.keys(currencies) as CurrencyCode[]).map((code) => (
                    <button key={code} onClick={() => { setCurrency(code); setShowCurrencies(false); }} className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm transition ${currency === code ? "bg-stone-100 text-stone-950" : "text-stone-600 hover:bg-stone-50"}`}>
                      <span className="flex items-center gap-3"><span className="grid h-7 w-9 place-items-center rounded-md bg-stone-100 text-[10px] font-bold text-stone-600">{code}</span><span>{currencies[code].name}</span></span>
                      {currency === code && <Check size={16} className="text-emerald-600" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-stone-500"><Info size={13} /><span>{subtitle}. Priser vises vejledende i {config.name.toLowerCase()}.</span></div>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          {packages.map((pkg) => {
            const Icon = pkg.icon;
            const amount = period === "yearly" ? Math.round(pkg.monthlyDkk * 0.8) : pkg.monthlyDkk;
            const annualTotal = amount * 12;
            return (
              <div key={pkg.name} className={`relative flex min-h-[468px] flex-col rounded-2xl border-2 bg-[hsl(var(--card))] p-7 transition ${pkg.popular ? "border-stone-900 shadow-md" : "border-stone-200 hover:border-stone-300"}`}>
                {pkg.popular && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-stone-900 px-3 py-1 text-xs font-semibold text-white">Mest populær</span>}
                <div className="mb-5 flex items-center gap-3">
                  <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${pkg.popular ? "bg-stone-900 text-white" : "bg-stone-200 text-stone-800"}`}><Icon size={19} /></span>
                  <div>
                    <h2 className="font-semibold">{pkg.name}</h2>
                    <p className="text-xs text-stone-500">{pkg.allowance}</p>
                  </div>
                </div>
                <div>
                  <span className="text-3xl font-bold tracking-tight sm:text-4xl">{formatPrice(amount, currency)}</span>
                  <span className="ml-1 text-sm text-stone-500">/ måned</span>
                  {period === "yearly" && <span className="ml-2 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">SPAR 20%</span>}
                  {period === "yearly" && <p className="mt-1 text-xs text-stone-500">faktureres {formatPrice(annualTotal, currency)} årligt</p>}
                </div>
                <p className="mt-2 min-h-12 text-sm leading-5 text-stone-500">{pkg.description}</p>
                <ul className="mt-6 flex-1 space-y-3 text-sm">
                  {pkg.features.map((feature) => <li key={feature} className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-emerald-600" /><span>{feature}</span></li>)}
                </ul>
                <button className={`mt-7 h-11 rounded-lg text-sm font-semibold transition ${pkg.popular ? "bg-stone-900 text-white hover:bg-stone-800" : "border border-stone-300 bg-white text-stone-900 hover:bg-stone-50"}`}>Vælg {pkg.name}</button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}