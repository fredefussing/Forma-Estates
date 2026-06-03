import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, ArrowLeft, Check, Sparkles, Zap, Crown, Flame, User, LogIn, Building2 } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { EnterpriseCalculator } from "@/components/enterprise-calculator";

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
    price: "2.999",
    period: "kr./ måned",
    images: "10 AI Visualiseringer / md.",
    icon: Sparkles,
    subtitle: "Til dig der vil i gang med professionelle AI-visualiseringer.",
    features: [
      "10 AI Visualiseringer / md.",
      "2 3D Floor Plans / md.",
      "2 Transformering Videoer / md.",
      "1 Bolig Showcase / md.",
      "HD 1080p download",
      "JPG + PNG eksport",
      "Logo branding (til/fra)",
      "Standard support",
    ],
    productUrl: null,
    popular: false,
  },
  {
    name: "Pro",
    key: "pro",
    price: "5.999",
    period: "kr./ måned",
    images: "25 AI Visualiseringer / md.",
    icon: Zap,
    subtitle: "Til aktive mæglere med løbende behov for professionelle visualiseringer.",
    features: [
      "25 AI Visualiseringer / md.",
      "5 3D Floor Plans / md.",
      "5 Transformering Videoer / md.",
      "3 Bolig Showcase / md.",
      "4K download",
      "JPG + PNG + PDF eksport",
      "Fuld branding-kontrol",
      "Prioriteret support",
    ],
    productUrl: null,
    popular: true,
  },
  {
    name: "Business",
    key: "business",
    price: "11.999",
    period: "kr./ måned",
    images: "60 AI Visualiseringer / md.",
    icon: Crown,
    subtitle: "Til bureauer og mæglerkæder med høj volumen.",
    features: [
      "60 AI Visualiseringer / md.",
      "12 3D Floor Plans / md.",
      "12 Transformering Videoer / md.",
      "8 Bolig Showcase / md.",
      "4K download",
      "JPG + PNG + PDF eksport",
      "Fuld branding-kontrol",
      "Dedikeret support",
    ],
    productUrl: null,
    popular: false,
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

        {/* Bridge → Enterprise */}
        <div className="relative mt-16 mb-10 flex items-center gap-4" data-testid="divider-enterprise">
          <div className="flex-1 h-px bg-border/60" />
          <div className="flex items-center gap-2 px-4 py-2 rounded-full border border-border/60 bg-muted/40 text-xs font-semibold text-muted-foreground uppercase tracking-widest whitespace-nowrap">
            <Building2 className="w-3.5 h-3.5" />
            Enterprise — byg din plan
          </div>
          <div className="flex-1 h-px bg-border/60" />
        </div>

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
