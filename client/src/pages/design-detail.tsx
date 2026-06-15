import { useEffect, useState } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { BeforeAfterSlider } from "@/components/before-after-slider";
import { Flame, ArrowLeft, Loader2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { Design } from "@shared/schema";
import { styleVocabulary, type BudgetTier } from "@shared/styleVocabulary";
import { formatDKK, getTierLabel } from "@shared/budgetUtils";

const roomTypeLabels: Record<string, string> = {
  "living room": "Stue",
  bedroom: "Soveværelse",
  kitchen: "Køkken",
  bathroom: "Badeværelse",
  "dining room": "Spisestue",
  "home office": "Hjemmekontor",
  "kids room": "Børneværelse",
  studio: "Studio",
  "game room": "Spillerum",
  "home gym": "Træningsrum",
  "laundry room": "Vaskerum",
  "conference room": "Mødelokale",
  "spa room": "Spa",
  outdoor: "Udendørs",
  "open living and dining room": "Åben stue/spisestue",
};

const styleLabels: Record<string, string> = {
  scandinavian: "Skandinavisk",
  modern: "Moderne",
  luxury: "Luksus",
  industrial: "Industriel",
  coastal: "Kyst",
  transitional: "Overgangs",
  farmhouse: "Landlig",
  midcentury: "Midcentury",
};

export default function DesignDetailPage() {
  const [match, params] = useRoute("/design/:id");
  const { user, loading: authLoading } = useAuth();
  const [design, setDesign] = useState<Design | null>(null);
  const [loading, setLoading] = useState(true);
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!authLoading && !user) {
      setLocation("/login");
    }
  }, [user, authLoading, setLocation]);

  useEffect(() => {
    const fetchDesign = async () => {
      if (!user || !params?.id) return;
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/designs/${params.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          setLocation("/mine-designs");
          return;
        }
        const data = await res.json();
        setDesign(data);
      } catch {
        setLocation("/mine-designs");
      } finally {
        setLoading(false);
      }
    };

    if (user && params?.id) fetchDesign();
  }, [user, params?.id, setLocation]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-[#f5f5f0] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!design) {
    return (
      <div className="min-h-screen bg-[#f5f5f0] flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Design ikke fundet</p>
          <Link href="/mine-designs">
            <Button variant="outline">Tilbage til dine designs</Button>
          </Link>
        </div>
      </div>
    );
  }

  const tierConfig = design.style && design.tier
    ? styleVocabulary[design.style]?.[design.tier as BudgetTier]
    : null;

  const handleDownload = async () => {
    if (!design.resultImageUrl) return;
    const fetchUrl = design.resultImageUrl.startsWith("http")
      ? `/api/proxy-image?url=${encodeURIComponent(design.resultImageUrl)}&format=jpg`
      : design.resultImageUrl;
    try {
      const response = await fetch(fetchUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nordic-homebuild-${design.roomType}-${design.style}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      window.open(design.resultImageUrl, "_blank");
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f5f0]">
      <header className="bg-white shadow-sm">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-6 h-16">
          <Link href="/">
            <span className="text-lg font-semibold tracking-tight cursor-pointer text-[#1a1a1a]" data-testid="link-logo">Forma Estates</span>
          </Link>
          <nav className="flex items-center gap-6">
            <Link href="/">
              <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer" data-testid="link-home">Forside</span>
            </Link>
            <Link href="/find-stil">
              <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer" data-testid="link-find-style">Find din stil</span>
            </Link>
            <Link href="/trending">
              <span className="text-sm text-orange-500 hover:text-orange-600 transition-colors cursor-pointer inline-flex items-center gap-1 font-medium" data-testid="link-trending">
                <Flame className="w-3.5 h-3.5" />
                Trending
              </span>
            </Link>
            <Link href="/pris">
              <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer" data-testid="link-pricing">Pris</span>
            </Link>
            <Link href="/min-konto">
              <span className="text-sm text-foreground font-medium cursor-pointer" data-testid="link-account">Min konto</span>
            </Link>
          </nav>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold tracking-tight" data-testid="text-design-title">
              {roomTypeLabels[design.roomType] || design.roomType}
              <span className="text-muted-foreground font-normal mx-2">/</span>
              <span className="text-muted-foreground font-normal">
                {styleLabels[design.style] || design.style}
              </span>
            </h1>
            {design.budget && design.tier && (
              <p className="text-sm text-muted-foreground mt-0.5" data-testid="text-budget-info">
                {formatDKK(design.budget)} · {getTierLabel(design.tier as BudgetTier)}
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-1" data-testid="text-date">
              {new Date(design.createdAt).toLocaleDateString("da-DK", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
          {design.resultImageUrl && (
            <Button variant="outline" size="sm" onClick={handleDownload} className="h-9" data-testid="button-download">
              <Download className="w-3.5 h-3.5 mr-2" /> Download
            </Button>
          )}
        </div>

        {design.status === "completed" && design.resultImageUrl ? (
          <div className="space-y-6">
            <BeforeAfterSlider
              beforeSrc={design.originalImageUrl}
              afterSrc={design.resultImageUrl}
            />

            {tierConfig && (
              <div className="border border-border/60 rounded-xl p-5 bg-white" data-testid="result-tier-info">
                <p className="text-xs tracking-widest uppercase text-muted-foreground font-medium mb-3">Anbefaling til dit budget</p>
                <p className="text-sm text-foreground/80 mb-4 leading-relaxed">{tierConfig.description}</p>
                <div className="flex flex-wrap gap-2">
                  {tierConfig.exampleRetailers.map((r) => (
                    <span key={r} className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-foreground/5 text-foreground/70 border border-border/40" data-testid={`badge-retailer-${r}`}>
                      {r}
                    </span>
                  ))}
                </div>
              </div>
            )}

          </div>
        ) : design.status === "failed" ? (
          <div className="border border-border/60 rounded-xl flex flex-col items-center justify-center py-20 bg-white">
            <h3 className="text-base font-medium mb-1.5">Generering mislykkedes</h3>
            <p className="text-sm text-muted-foreground mb-6">Dette design kunne ikke genereres.</p>
            <Link href="/design">
              <Button size="sm" data-testid="button-try-again">Prøv igen</Button>
            </Link>
          </div>
        ) : (
          <div className="border border-border/60 rounded-xl flex flex-col items-center justify-center py-20 bg-white">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mb-4" />
            <h3 className="text-base font-medium mb-1">Behandler...</h3>
            <p className="text-sm text-muted-foreground">Designet er stadig under generering.</p>
          </div>
        )}

        <Separator className="my-8 bg-border/40" />

        <Link href="/mine-designs">
          <span className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground cursor-pointer transition-colors" data-testid="link-back">
            <ArrowLeft className="w-3.5 h-3.5" />
            Tilbage til dine designs
          </span>
        </Link>
      </div>
    </div>
  );
}
