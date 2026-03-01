import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, ArrowLeft, Check, Sparkles, Zap, Crown, Flame } from "lucide-react";
import { motion } from "framer-motion";

const packages = [
  {
    name: "Basic",
    price: 49,
    images: 10,
    icon: Sparkles,
    features: [
      "10 AI-billeder",
      "Alle 8 stilarter",
      "Alle 15 rum",
      "Alle 3 budget-niveauer",
    ],
    shopifyUrl: "https://ej8jeq-rs.myshopify.com/cart/10220649021782:1",
    popular: false,
  },
  {
    name: "Pro",
    price: 99,
    images: 25,
    icon: Zap,
    features: [
      "25 AI-billeder",
      "Alle 8 stilarter",
      "Alle 15 rum",
      "Alle 3 budget-niveauer",
      "Hurtigere generering",
    ],
    shopifyUrl: "https://ej8jeq-rs.myshopify.com/cart/10220626149718:1",
    popular: true,
  },
  {
    name: "Unlimited",
    price: 199,
    images: 60,
    icon: Crown,
    features: [
      "60 AI-billeder",
      "Alle 8 stilarter",
      "Alle 15 rum",
      "Alle 3 budget-niveauer",
      "Hurtigere generering",
      "Prioriteret support",
    ],
    shopifyUrl: "https://ej8jeq-rs.myshopify.com/cart/10220614877526:1",
    popular: false,
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-background" data-testid="page-pricing">
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/90 backdrop-blur-lg">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-6 h-16">
          <Link href="/">
            <span className="text-lg font-semibold tracking-tight cursor-pointer" data-testid="link-logo">Nordic Sketch</span>
          </Link>
          <nav className="flex items-center gap-6">
            <Link href="/find-stil">
              <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer" data-testid="link-find-style">Find din stil</span>
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
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-4" data-testid="text-title">Vælg din pakke</h1>
          <div className="inline-flex items-center gap-2 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 px-4 py-2 rounded-full text-sm font-medium" data-testid="text-free-trial">
            <Sparkles className="w-4 h-4" />
            Start gratis: 2 billeder i Skandinavisk eller Moderne stil. Opgrader for at låse op for alle stilarter!
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6" data-testid="grid-packages">
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
                  data-testid={`card-package-${pkg.name.toLowerCase()}`}
                >
                  <div className="flex items-center gap-3 mb-6">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      pkg.popular ? "bg-foreground text-background" : "bg-muted"
                    }`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold" data-testid={`text-package-name-${pkg.name.toLowerCase()}`}>{pkg.name}</h3>
                      <p className="text-xs text-muted-foreground">{pkg.images} billeder</p>
                    </div>
                  </div>

                  <div className="mb-6">
                    <span className="text-4xl font-bold" data-testid={`text-price-${pkg.name.toLowerCase()}`}>{pkg.price}</span>
                    <span className="text-muted-foreground ml-1">kr</span>
                  </div>

                  <ul className="space-y-3 mb-8 flex-1">
                    {pkg.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2.5 text-sm">
                        <Check className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <a href={pkg.shopifyUrl} target="_blank" rel="noopener noreferrer">
                    <Button
                      className={`w-full h-12 text-sm font-medium ${
                        pkg.popular ? "" : "variant-outline"
                      }`}
                      variant={pkg.popular ? "default" : "outline"}
                      size="lg"
                      data-testid={`button-select-${pkg.name.toLowerCase()}`}
                    >
                      Vælg {pkg.name}
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </a>
                </div>
              </motion.div>
            );
          })}
        </div>

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
              <p className="text-sm text-muted-foreground" data-testid="text-faq-4-answer">Skandinavisk, Moderne, Luksus, Industriel, Kyst, Overgangs, Landlig og Badboy — 8 stilarter i alt.</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
