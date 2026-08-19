import { Check, Crown, Sparkles, Zap } from "lucide-react";
import "./_group.css";

const packages = [
  {
    name: "Start",
    price: "2.999",
    description: "Til dig der vil i gang med professionelle AI-visualiseringer.",
    allowance: "10 AI Visualiseringer / md.",
    icon: Sparkles,
    features: ["2 3D Plantegninger / md.", "2 Transformering Videoer / md.", "1 Bolig Showcase / md.", "HD 1080p download"],
  },
  {
    name: "Pro",
    price: "5.999",
    description: "Til aktive professionelle med løbende behov for professionelle visualiseringer.",
    allowance: "25 AI Visualiseringer / md.",
    icon: Zap,
    popular: true,
    features: ["5 3D Plantegninger / md.", "5 Transformering Videoer / md.", "3 Bolig Showcase / md.", "4K download"],
  },
  {
    name: "Business",
    price: "11.999",
    description: "Til virksomheder og teams med høj volumen og komplekse projekter.",
    allowance: "60 AI Visualiseringer / md.",
    icon: Crown,
    features: ["12 3D Plantegninger / md.", "12 Transformering Videoer / md.", "8 Bolig Showcase / md.", "Dedikeret support"],
  },
];

export function Current() {
  return (
    <div className="forma-pricing px-7 py-10 sm:px-12">
      <div className="mx-auto max-w-5xl">
        <div className="mb-12 text-center">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-stone-500">Forma Estates</p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Vælg din plan</h1>
          <p className="mt-3 text-sm text-stone-500">Vælg den plan der passer til dit behov og kom i gang med det samme</p>
          <div className="mt-7 inline-flex items-center gap-1 rounded-full border border-stone-200 bg-stone-100 p-1">
            <button className="rounded-full bg-white px-5 py-2 text-sm font-semibold shadow-sm">Månedlig</button>
            <button className="rounded-full px-5 py-2 text-sm font-medium text-stone-500">Årlig <span className="font-semibold text-emerald-600">–20%</span></button>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          {packages.map((pkg) => {
            const Icon = pkg.icon;
            return (
              <div key={pkg.name} className={`relative flex min-h-[448px] flex-col rounded-2xl border-2 bg-[hsl(var(--card))] p-7 ${pkg.popular ? "border-stone-900 shadow-md" : "border-stone-200"}`}>
                {pkg.popular && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-stone-900 px-3 py-1 text-xs font-semibold text-white">Mest populær</span>}
                <div className="mb-5 flex items-center gap-3">
                  <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${pkg.popular ? "bg-stone-900 text-white" : "bg-stone-200 text-stone-800"}`}><Icon size={19} /></span>
                  <div>
                    <h2 className="font-semibold">{pkg.name}</h2>
                    <p className="text-xs text-stone-500">{pkg.allowance}</p>
                  </div>
                </div>
                <div>
                  <span className="text-4xl font-bold tracking-tight">{pkg.price}</span><span className="ml-1 text-sm text-stone-500">kr./ måned</span>
                </div>
                <p className="mt-2 min-h-12 text-sm leading-5 text-stone-500">{pkg.description}</p>
                <ul className="mt-6 flex-1 space-y-3 text-sm">
                  {pkg.features.map((feature) => <li key={feature} className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-emerald-600" /><span>{feature}</span></li>)}
                </ul>
                <button className={`mt-7 h-11 rounded-lg text-sm font-semibold ${pkg.popular ? "bg-stone-900 text-white" : "border border-stone-300 bg-white text-stone-900"}`}>Vælg {pkg.name}</button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}