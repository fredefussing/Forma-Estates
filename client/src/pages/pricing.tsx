import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, ArrowLeft, Check, Sparkles, Zap, Crown, Flame, User, LogIn, Building2 } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";

// ── Enterprise Custom Calculator ─────────────────────────────────────────────

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
    label: "3D Floor Plan",
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

function getUnitPrice(product: Product, qty: number): number {
  if (qty === 0) return product.basePrice;
  let price = product.tiers[0].unitPrice;
  for (const tier of product.tiers) {
    if (qty >= tier.from) price = tier.unitPrice;
    else break;
  }
  return price;
}

function getDiscountPct(product: Product, qty: number): number {
  const unit = getUnitPrice(product, qty);
  return Math.round((1 - unit / product.basePrice) * 100);
}

function EnterpriseCalculator() {
  const [quantities, setQuantities] = useState<Record<string, number>>({
    ai: 0, floor: 0, video: 0, showcase: 0,
  });

  const totalFull = ENTERPRISE_PRODUCTS.reduce((sum, p) => {
    return sum + p.basePrice * quantities[p.key];
  }, 0);

  const totalDiscounted = ENTERPRISE_PRODUCTS.reduce((sum, p) => {
    const qty = quantities[p.key];
    return sum + getUnitPrice(p, qty) * qty;
  }, 0);

  const totalSavings = totalFull - totalDiscounted;
  const overallDiscount = totalFull > 0 ? Math.round((totalSavings / totalFull) * 100) : 0;
  const hasItems = Object.values(quantities).some((q) => q > 0);

  return (
    <div className="mt-16 rounded-3xl border-2 border-border/60 bg-card p-8 md:p-10" data-testid="section-enterprise-calculator">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-8">
        <div>
          <div className="inline-flex items-center gap-2 bg-muted text-muted-foreground px-3 py-1 rounded-full text-xs font-semibold mb-3">
            <Building2 className="w-3.5 h-3.5" />
            Enterprise — byg dit eget
          </div>
          <h2 className="text-2xl font-bold tracking-tight">Sammensæt din pakke</h2>
          <p className="text-sm text-muted-foreground mt-1">Vælg antal af hver ydelse — prisen falder automatisk jo mere du bestiller.</p>
        </div>
        {overallDiscount > 0 && (
          <div className="flex-shrink-0 rounded-2xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-5 py-3 text-center">
            <div className="text-2xl font-bold text-green-700 dark:text-green-400">{overallDiscount}%</div>
            <div className="text-xs text-green-600 dark:text-green-500 font-medium">samlet rabat</div>
          </div>
        )}
      </div>

      <div className="space-y-6">
        {ENTERPRISE_PRODUCTS.map((product) => {
          const qty = quantities[product.key];
          const unitPrice = getUnitPrice(product, qty);
          const discPct = getDiscountPct(product, qty);
          const lineTotal = unitPrice * qty;

          return (
            <div key={product.key} className="rounded-xl border border-border/60 bg-background p-5" data-testid={`row-enterprise-${product.key}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold">{product.label}</span>
                  {discPct > 0 && qty > 0 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400">
                      -{discPct}%
                    </span>
                  )}
                </div>
                <div className="text-right">
                  {qty > 0 ? (
                    <div className="flex items-baseline gap-2">
                      {discPct > 0 && (
                        <span className="text-xs line-through text-muted-foreground">{(product.basePrice * qty).toLocaleString("da-DK")} kr.</span>
                      )}
                      <span className="text-base font-bold">{lineTotal.toLocaleString("da-DK")} kr.</span>
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">{product.basePrice} kr. / {product.unit}</span>
                  )}
                </div>
              </div>

              {/* Slider */}
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min={0}
                  max={product.max}
                  step={1}
                  value={qty}
                  onChange={(e) => setQuantities((prev) => ({ ...prev, [product.key]: Number(e.target.value) }))}
                  className="flex-1 h-2 rounded-full accent-foreground cursor-pointer"
                  data-testid={`slider-enterprise-${product.key}`}
                />
                <div className="flex items-center gap-1 min-w-[72px]">
                  <button
                    onClick={() => setQuantities((prev) => ({ ...prev, [product.key]: Math.max(0, qty - 1) }))}
                    className="w-6 h-6 rounded-full border border-border/80 flex items-center justify-center text-xs font-bold hover:bg-muted transition-colors"
                    data-testid={`button-enterprise-${product.key}-minus`}
                  >−</button>
                  <span className="w-8 text-center text-sm font-semibold tabular-nums">{qty}</span>
                  <button
                    onClick={() => setQuantities((prev) => ({ ...prev, [product.key]: Math.min(product.max, qty + 1) }))}
                    className="w-6 h-6 rounded-full border border-border/80 flex items-center justify-center text-xs font-bold hover:bg-muted transition-colors"
                    data-testid={`button-enterprise-${product.key}-plus`}
                  >+</button>
                </div>
              </div>

              {/* Tier hint */}
              {qty > 0 && (
                <p className="text-[11px] text-muted-foreground mt-2">
                  {unitPrice} kr. / {product.unit}
                  {discPct > 0 && ` · du sparer ${(product.basePrice - unitPrice).toLocaleString("da-DK")} kr. pr. stk.`}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div className="mt-8 rounded-2xl bg-muted/50 p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-bold">{totalDiscounted.toLocaleString("da-DK")} kr.</span>
            {totalSavings > 0 && (
              <span className="text-sm text-muted-foreground line-through">{totalFull.toLocaleString("da-DK")} kr.</span>
            )}
          </div>
          {totalSavings > 0 && (
            <p className="text-sm text-green-600 dark:text-green-400 font-medium">
              Du sparer {totalSavings.toLocaleString("da-DK")} kr. ({overallDiscount}% samlet rabat)
            </p>
          )}
          {!hasItems && (
            <p className="text-sm text-muted-foreground">Træk i sliderne ovenfor for at beregne din pris</p>
          )}
        </div>
        <Button
          size="lg"
          className="h-12 px-8 rounded-full font-semibold text-sm flex-shrink-0"
          disabled={!hasItems}
          onClick={() => {
            const lines = ENTERPRISE_PRODUCTS
              .filter((p) => quantities[p.key] > 0)
              .map((p) => `${p.label}: ${quantities[p.key]} stk. à ${getUnitPrice(p, quantities[p.key])} kr.`)
              .join("%0A");
            window.location.href = `mailto:kontakt@nordichomebuild.dk?subject=Enterprise%20tilbud&body=Hej%2C%20jeg%20er%20interesseret%20i%20f%C3%B8lgende%3A%0A${lines}%0A%0ASamlet%3A%20${totalDiscounted.toLocaleString("da-DK")}%20kr.`;
          }}
          data-testid="button-enterprise-get-quote"
        >
          Få tilbud
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}

type Plan = {
  name: string;
  key: string;
  price: string;
  period: string;
  images: string;
  icon: typeof Sparkles;
  subtitle: string;
  features: string[];
  productUrl: string | null;
  popular: boolean;
  custom?: boolean;
};

const packages: Plan[] = [
  {
    name: "Start",
    key: "starter",
    price: "2.499",
    period: "kr./ måned",
    images: "15 AI Visualiseringer / md.",
    icon: Sparkles,
    subtitle: "Til dig der vil i gang med professionelle AI-visualiseringer.",
    features: [
      "15 AI Visualiseringer / md.",
      "2 3D Floor Plans / md.",
      "1 Transformering Video / md.",
      "AI Design Agent, Før/Efter & Ejendomsrapport",
      "Adgang til nye produkter og teknologi",
    ],
    productUrl: null,
    popular: false,
  },
  {
    name: "Pro",
    key: "pro",
    price: "4.999",
    period: "kr./ måned",
    images: "35 AI Visualiseringer / md.",
    icon: Zap,
    subtitle: "Til aktive mæglere med løbende behov for professionelle visualiseringer.",
    features: [
      "35 AI Visualiseringer / md.",
      "5 3D Floor Plans / md.",
      "3 Transformering Videoer / md.",
      "AI Design Agent, Før/Efter & Ejendomsrapport",
      "Adgang til nye produkter og teknologi",
    ],
    productUrl: null,
    popular: true,
  },
  {
    name: "Business",
    key: "business",
    price: "9.999",
    period: "kr./ måned",
    images: "80 AI Visualiseringer / md.",
    icon: Crown,
    subtitle: "Til bureauer og mæglerkæder med høj volumen.",
    features: [
      "80 AI Visualiseringer / md.",
      "12 3D Floor Plans / md.",
      "8 Transformering Videoer / md.",
      "AI Design Agent, Før/Efter & Ejendomsrapport",
      "Adgang til nye produkter og teknologi",
    ],
    productUrl: null,
    popular: false,
  },
  {
    name: "Enterprise",
    key: "enterprise",
    price: "Custom",
    period: "kontakt os",
    images: "Ubegrænsede AI Visualiseringer",
    icon: Building2,
    subtitle: "Skræddersyet plan til store organisationer med særlige behov.",
    features: [
      "Ubegrænsede AI Visualiseringer",
      "Ubegrænsede 3D Floor Plans",
      "Ubegrænsede Transformering Videoer",
      "AI Design Agent, Før/Efter & Ejendomsrapport",
      "Adgang til nye produkter og teknologi",
    ],
    productUrl: null,
    popular: false,
    custom: true,
  },
];

export default function PricingPage() {
  const { user, loading, creditsRemaining } = useAuth();
  const [, setLocation] = useLocation();

  const handleBuy = (pkg: Plan) => {
    if (pkg.custom) {
      window.location.href = "mailto:kontakt@nordichomebuild.dk?subject=Enterprise%20plan%20foresp%C3%B8rgsel";
      return;
    }
    if (!user) {
      setLocation("/login?redirect=/pris");
      return;
    }
    if (pkg.productUrl) {
      window.open(pkg.productUrl, "_blank", "noopener,noreferrer");
    } else {
      window.location.href = "mailto:kontakt@nordichomebuild.dk?subject=Abonnement%3A%20" + encodeURIComponent(pkg.name);
    }
  };

  return (
    <div className="min-h-screen bg-background" data-testid="page-pricing">
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/90 backdrop-blur-lg">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-6 h-16">
          <Link href="/">
            <span className="text-lg font-semibold tracking-tight cursor-pointer" data-testid="link-logo">Nordic Homebuild</span>
          </Link>
          <nav className="flex items-center gap-6">
            <Link href="/find-stil">
              <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer" data-testid="link-find-style">Find din stil</span>
            </Link>
            <Link href="/ai-design-agent">
              <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer" data-testid="link-ai-agent">AI Design Agent</span>
            </Link>
            <Link href="/trending">
              <span className="text-sm font-medium text-orange-600 dark:text-orange-400 cursor-pointer flex items-center gap-1" data-testid="link-trending">
                <Flame className="w-3.5 h-3.5" />
                Trending
              </span>
            </Link>
            <Link href="/pris">
              <span className="text-sm font-medium text-foreground cursor-pointer" data-testid="link-pricing">Pris</span>
            </Link>
            {user && (
              <Link href="/mine-designs">
                <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer" data-testid="link-my-designs">Mine designs</span>
              </Link>
            )}
            <Link href={user ? "/min-konto" : "/login"}>
              <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer inline-flex items-center gap-1" data-testid="link-account">
                <User className="w-3.5 h-3.5" />
                {user ? "Min konto" : "Log ind"}
              </span>
            </Link>
            <Link href="/design">
              <Button size="sm" className="h-9 px-5 text-sm font-medium rounded-full" data-testid="button-header-cta">
                Prøv nu
                <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </Button>
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-12">
        <div className="mb-4">
          <Link href="/">
            <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer inline-flex items-center gap-1" data-testid="link-back">
              <ArrowLeft className="w-3.5 h-3.5" />
              Tilbage
            </span>
          </Link>
        </div>

        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 px-4 py-2 rounded-full text-sm font-medium mb-6" data-testid="text-free-note">
            <Sparkles className="w-4 h-4" />
            {user
              ? "Du har 2 billeder tilbage. Opgrader for at få flere!"
              : "Opret en konto og få 2 AI-billeder med det samme!"}
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-3" data-testid="text-title">Vælg din plan</h1>
          <p className="text-muted-foreground" data-testid="text-subtitle">Alle nye konti inkluderer 1 gratis visualisering — ingen kreditkort krævet</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-muted-foreground">Indlæser...</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6" data-testid="grid-packages">
            {packages.map((pkg, index) => {
              const Icon = pkg.icon;
              return (
                <motion.div
                  key={pkg.name}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.1 }}
                  className="relative"
                >
                  {pkg.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                      <Badge className="bg-foreground text-background px-3 py-1 text-xs font-semibold" data-testid="badge-popular">
                        Mest populær
                      </Badge>
                    </div>
                  )}
                  <div
                    className={`h-full flex flex-col bg-card rounded-2xl border-2 p-8 transition-all duration-300 hover:shadow-lg ${
                      pkg.popular
                        ? "border-foreground shadow-md"
                        : "border-border/60 hover:border-border"
                    }`}
                    data-testid={`card-package-${pkg.key}`}
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        pkg.popular ? "bg-foreground text-background" : "bg-muted"
                      }`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold" data-testid={`text-package-name-${pkg.key}`}>{pkg.name}</h3>
                        <p className="text-xs text-muted-foreground">{pkg.images}</p>
                      </div>
                    </div>

                    <div className="mb-2">
                      <span className="text-4xl font-bold" data-testid={`text-price-${pkg.key}`}>{pkg.price}</span>
                      <span className="text-muted-foreground ml-1">{pkg.period}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mb-6">{pkg.subtitle}</p>

                    <ul className="space-y-3 mb-8 flex-1">
                      {pkg.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-2.5 text-sm">
                          <Check className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>

                    <Button
                      className="w-full h-12 text-sm font-medium"
                      variant={pkg.popular ? "default" : "outline"}
                      size="lg"
                      onClick={() => handleBuy(pkg)}
                      data-testid={`button-select-${pkg.key}`}
                    >
                      {pkg.custom ? (
                        <>
                          Kontakt os
                          <ArrowRight className="w-4 h-4 ml-2" />
                        </>
                      ) : user ? (
                        <>
                          Vælg {pkg.name}
                          <ArrowRight className="w-4 h-4 ml-2" />
                        </>
                      ) : (
                        <>
                          <LogIn className="w-4 h-4 mr-2" />
                          Log ind for at købe
                        </>
                      )}
                    </Button>

                    {!user && (
                      <p className="text-xs text-center text-muted-foreground mt-3" data-testid={`text-login-hint-${pkg.key}`}>
                        <Link href="/login?redirect=/pris">
                          <span className="underline cursor-pointer font-medium">Log ind</span>
                        </Link>
                        {" "}eller{" "}
                        <Link href="/opret?redirect=/pris">
                          <span className="underline cursor-pointer font-medium">opret konto</span>
                        </Link>
                        {" "}for at købe
                      </p>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        <EnterpriseCalculator />

        <div className="mt-16 text-center" data-testid="section-faq">
          <h2 className="text-xl font-semibold mb-6">Ofte stillede spørgsmål</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left max-w-3xl mx-auto">
            <div className="bg-card rounded-xl border border-border/60 p-5">
              <h3 className="font-medium mb-2" data-testid="text-faq-1-title">Hvad er et AI-billede?</h3>
              <p className="text-sm text-muted-foreground" data-testid="text-faq-1-answer">Hvert billede er en AI-genereret redesign af dit rum. Upload et foto, vælg stil og budget, og få et nyt design på sekunder.</p>
            </div>
            <div className="bg-card rounded-xl border border-border/60 p-5">
              <h3 className="font-medium mb-2" data-testid="text-faq-2-title">Kan jeg prøve gratis?</h3>
              <p className="text-sm text-muted-foreground" data-testid="text-faq-2-answer">Ja! Du får 2 gratis billeder i Skandinavisk eller Moderne stil. Opgrader for at få adgang til alle 8 stilarter.</p>
            </div>
            <div className="bg-card rounded-xl border border-border/60 p-5">
              <h3 className="font-medium mb-2" data-testid="text-faq-3-title">Udløber mine billeder?</h3>
              <p className="text-sm text-muted-foreground" data-testid="text-faq-3-answer">Nej, dine genererede billeder gemmes og kan tilgås når som helst.</p>
            </div>
            <div className="bg-card rounded-xl border border-border/60 p-5">
              <h3 className="font-medium mb-2" data-testid="text-faq-4-title">Hvilke stilarter er inkluderet?</h3>
              <p className="text-sm text-muted-foreground" data-testid="text-faq-4-answer">Skandinavisk, Moderne, Luksus, Industriel, Kyst, Overgangs, Landlig og Midcentury — 8 stilarter i alt.</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
