import { useState, useRef, useCallback, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Loader2, Scan, ShoppingCart, X, ArrowRight, Package } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface DetectedObject {
  label: string;
  labelDa: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

interface SimilarProduct {
  id: number;
  name: string;
  price: string;
  image_url: string;
  affiliate_link: string;
  shop: string;
  similarity: number;
}

interface AnalyzeResult {
  objects: DetectedObject[];
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
}

interface ShopResult {
  obj: DetectedObject;
  products: SimilarProduct[];
}

interface Props {
  imageUrl: string;
  autoRun?: boolean;
  designStyle?: string;
}

function formatPrice(price: string) {
  const n = parseFloat(price);
  if (isNaN(n)) return price;
  return n.toLocaleString("da-DK", { style: "currency", currency: "DKK", maximumFractionDigits: 0 });
}

function isTouchDevice() {
  return typeof window !== "undefined" && ("ontouchstart" in window || navigator.maxTouchPoints > 0);
}

function getBudgetProduct(products: SimilarProduct[]): SimilarProduct | null {
  if (!products.length) return null;
  return [...products].sort((a, b) => parseFloat(a.price) - parseFloat(b.price))[0];
}

function danishFurnitureTitle(obj: DetectedObject): string {
  const map: Record<string, string> = {
    "sofa": "Sofaen",
    "couch": "Sofaen",
    "chair": "Stolen",
    "bed": "Sengen",
    "dining table": "Spisebordet",
    "table": "Bordet",
    "potted plant": "Planten",
    "lamp": "Lampen",
    "tv": "TV'et",
    "mirror": "Spejlet",
    "bench": "Bænken",
    "clock": "Uret",
    "vase": "Vasen",
  };
  return (map[obj.label.toLowerCase()] ?? obj.labelDa) + " i dit design";
}

function ProductCard({
  product,
  badge,
}: {
  product: SimilarProduct;
  badge: "BEST" | "SIMILAR" | "BUDGET";
}) {
  const badgeStyle =
    badge === "BUDGET"
      ? "bg-green-100 text-green-800"
      : badge === "BEST"
        ? "bg-black text-white"
        : "bg-gray-100 text-gray-700";

  const badgeLabel =
    badge === "BEST" ? "Bedst match" : badge === "SIMILAR" ? "Lignende" : "Budget";

  return (
    <a
      href={product.affiliate_link}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col rounded-xl border border-border/40 overflow-hidden hover:border-border hover:shadow-md transition-all bg-white"
      data-testid={`shop-card-${badge.toLowerCase()}-${product.id}`}
    >
      <div className="relative aspect-square overflow-hidden bg-gray-100">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={(e) => {
              (e.target as HTMLImageElement).parentElement!.classList.add("hidden");
            }}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-300">
            <Package className="w-8 h-8" />
          </div>
        )}
        <span
          className={`absolute top-2 left-2 text-[10px] font-semibold px-2 py-0.5 rounded ${badgeStyle}`}
        >
          {badgeLabel}
        </span>
      </div>
      <div className="p-2.5 flex flex-col gap-1 flex-1">
        <p className="text-xs font-medium text-gray-900 line-clamp-2 leading-tight">
          {product.name}
        </p>
        <p className="text-[10px] text-gray-400 capitalize">{product.shop}</p>
        <div className="flex items-center justify-between mt-auto pt-1">
          <span className="text-sm font-bold tabular-nums text-gray-900">
            {formatPrice(product.price)}
          </span>
          <span className="text-[10px] text-gray-500 group-hover:text-gray-900 flex items-center gap-0.5 transition-colors">
            Shop <ArrowRight className="w-2.5 h-2.5" />
          </span>
        </div>
      </div>
    </a>
  );
}

function ShopSection({ result }: { result: ShopResult }) {
  const { obj, products } = result;
  if (!products.length) return null;

  const best = products[0];
  const similar = products.find((p) => p.id !== best.id) ?? null;
  const budget = getBudgetProduct(products);
  const budgetCard = budget && budget.id !== best.id ? budget : similar && similar.id !== best.id ? null : null;

  const cards: { product: SimilarProduct; badge: "BEST" | "SIMILAR" | "BUDGET" }[] = [
    { product: best, badge: "BEST" },
  ];
  if (similar && similar.id !== best.id) cards.push({ product: similar, badge: "SIMILAR" });
  if (budget && budget.id !== best.id && budget.id !== similar?.id)
    cards.push({ product: budget, badge: "BUDGET" });
  if (cards.length === 1 && similar) cards.push({ product: similar, badge: "SIMILAR" });

  const displayCards = cards.slice(0, 3);

  return (
    <div className="space-y-3" data-testid={`shop-section-${obj.label}`}>
      <div className="flex items-center gap-2">
        <ShoppingCart className="w-3.5 h-3.5 text-muted-foreground" />
        <p className="text-xs tracking-widest uppercase text-muted-foreground font-medium">
          {danishFurnitureTitle(obj)}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        {displayCards.map(({ product, badge }) => (
          <ProductCard key={`${badge}-${product.id}`} product={product} badge={badge} />
        ))}
      </div>
    </div>
  );
}

export function FurnitureDetector({ imageUrl, autoRun = false, designStyle }: Props) {
  const { toast } = useToast();
  const imgRef = useRef<HTMLImageElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef<number>(0);

  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeResult | null>(null);
  const [activeObject, setActiveObject] = useState<DetectedObject | null>(null);
  const [similarProducts, setSimilarProducts] = useState<SimilarProduct[] | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [imageHovered, setImageHovered] = useState(false);
  const [tooltipIdx, setTooltipIdx] = useState<number | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [hasClicked, setHasClicked] = useState(false);
  const isTouch = isTouchDevice();

  const [shopResults, setShopResults] = useState<ShopResult[] | null>(null);
  const [shopLoading, setShopLoading] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("hasSeenFurnitureOnboarding")) {
      setShowOnboarding(true);
    }
  }, []);

  useEffect(() => {
    if (showOnboarding && analyzeResult) {
      const t = setTimeout(() => {
        setShowOnboarding(false);
        localStorage.setItem("hasSeenFurnitureOnboarding", "true");
      }, 5000);
      return () => clearTimeout(t);
    }
  }, [showOnboarding, analyzeResult]);

  const dismissOnboarding = useCallback(() => {
    setShowOnboarding(false);
    localStorage.setItem("hasSeenFurnitureOnboarding", "true");
  }, []);

  useEffect(() => {
    if (!autoRun || !imageUrl) return;

    let cancelled = false;
    setShopLoading(true);
    setShopResults(null);

    const run = async () => {
      try {
        const res = await apiRequest("POST", "/api/analyze-image", { imageUrl });
        const data: AnalyzeResult = await res.json();
        if (cancelled || !data.objects.length) {
          setShopLoading(false);
          if (!cancelled) setShopResults([]);
          return;
        }

        const productPromises = data.objects.map(async (obj) => {
          try {
            const r = await apiRequest("POST", "/api/find-similar-crop", {
              imageUrl,
              x: obj.x,
              y: obj.y,
              width: obj.width,
              height: obj.height,
              topK: 5,
              yoloLabel: obj.label,
              designStyle,
            });
            const d = await r.json();
            return { obj, products: (d.products ?? []) as SimilarProduct[] };
          } catch {
            return { obj, products: [] as SimilarProduct[] };
          }
        });

        const results = await Promise.all(productPromises);
        if (!cancelled) {
          setShopResults(results.filter((r) => r.products.length > 0));
        }
      } catch (err: any) {
        if (!cancelled) toast({ description: "Produktsøgning fejlede.", variant: "destructive" });
      } finally {
        if (!cancelled) setShopLoading(false);
      }
    };

    run();
    return () => { cancelled = true; };
  }, [imageUrl, autoRun]);

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/analyze-image", { imageUrl });
      return res.json() as Promise<AnalyzeResult>;
    },
    onSuccess: (data) => {
      setAnalyzeResult(data);
      if (data.objects.length === 0) {
        toast({ description: "Ingen møbler fundet i billedet." });
      }
    },
    onError: (err: any) => {
      toast({ title: "Fejl", description: err.message, variant: "destructive" });
    },
  });

  const cropMutation = useMutation({
    mutationFn: async (obj: DetectedObject) => {
      const res = await apiRequest("POST", "/api/find-similar-crop", {
        imageUrl,
        x: obj.x,
        y: obj.y,
        width: obj.width,
        height: obj.height,
        topK: 5,
        yoloLabel: obj.label,
        designStyle,
      });
      return res.json() as Promise<{ products: SimilarProduct[] }>;
    },
    onSuccess: (data) => setSimilarProducts(data.products),
    onError: (err: any) => {
      toast({ title: "Fejl", description: err.message, variant: "destructive" });
    },
  });

  const handleDotClick = useCallback(
    (obj: DetectedObject) => {
      dismissOnboarding();
      setHasClicked(true);
      setActiveObject(obj);
      setSimilarProducts(null);
      setPanelOpen(true);
      cropMutation.mutate(obj);
    },
    [dismissOnboarding],
  );

  const scaleDot = (obj: DetectedObject) => {
    if (!imgRef.current || !analyzeResult) return { left: 0, top: 0 };
    const el = imgRef.current;
    const scaleX = el.clientWidth / analyzeResult.imageWidth;
    const scaleY = el.clientHeight / analyzeResult.imageHeight;
    return {
      left: (obj.x + obj.width / 2) * scaleX,
      top: (obj.y + obj.height / 2) * scaleY,
    };
  };

  const dotsVisible = isTouch || imageHovered;

  const bestMatch = similarProducts?.[0] ?? null;
  const similar = similarProducts?.slice(1, 3) ?? [];
  const budgetProduct = similarProducts ? getBudgetProduct(similarProducts) : null;

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.changedTouches[0].clientY - touchStartY.current > 60) setPanelOpen(false);
  };

  if (autoRun) {
    if (shopLoading) {
      return (
        <div className="border border-border/40 rounded-xl p-5 bg-card/20">
          <div className="flex items-center gap-3 mb-4">
            <ShoppingCart className="w-4 h-4 text-muted-foreground" />
            <p className="text-xs tracking-widest uppercase text-muted-foreground font-medium">
              Shop dit design
            </p>
          </div>
          <div className="flex flex-col items-center py-8 gap-3 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <p className="text-sm">Finder møbler og lignende produkter…</p>
          </div>
        </div>
      );
    }

    if (!shopResults || shopResults.length === 0) return null;

    return (
      <div className="border border-border/40 rounded-xl p-5 bg-card/20 space-y-6" data-testid="shop-design-section">
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-4 h-4 text-muted-foreground" />
          <p className="text-xs tracking-widest uppercase text-muted-foreground font-medium">
            Shop dit design
          </p>
        </div>
        {shopResults.map((result, i) => (
          <ShopSection key={`${result.obj.label}-${i}`} result={result} />
        ))}
        <p className="text-[10px] text-muted-foreground text-center">
          Produkter fundet via billedanalyse · Priser kan variere · Affiliate links
        </p>
      </div>
    );
  }

  return (
    <div>
      {!analyzeResult ? (
        <div className="flex flex-col items-center gap-2">
          {!localStorage.getItem("hasSeenFurnitureOnboarding") && (
            <p className="text-sm text-gray-500 text-center">
              💡 Klik på de hvide prikker for at shoppe lignende møbler
            </p>
          )}
          <Button
            variant="outline"
            className="gap-2 h-10"
            onClick={() => analyzeMutation.mutate()}
            disabled={analyzeMutation.isPending}
            data-testid="button-analyze-furniture"
          >
            {analyzeMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Scan className="w-4 h-4" />
            )}
            {analyzeMutation.isPending ? "Analyserer møbler…" : "Find lignende møbler"}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs tracking-widest uppercase text-muted-foreground font-medium">
              {analyzeResult.objects.length > 0
                ? isTouch
                  ? "Tryk på de hvide prikker for at shoppe møblerne"
                  : "Hold musen over billedet og klik på en prik for at shoppe"
                : "Ingen møbler registreret"}
            </p>
            <button
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => { setAnalyzeResult(null); setPanelOpen(false); }}
              data-testid="button-reset-furniture"
            >
              Nulstil
            </button>
          </div>

          {showOnboarding && (
            <p
              className="text-sm text-gray-500 text-center py-1 animate-pulse cursor-pointer"
              onClick={dismissOnboarding}
              data-testid="text-onboarding-hint"
            >
              💡 Klik på de hvide prikker for at shoppe lignende møbler
            </p>
          )}

          <div
            className="relative rounded-xl overflow-hidden border border-border/60 cursor-pointer"
            style={{ lineHeight: 0 }}
            onMouseEnter={() => setImageHovered(true)}
            onMouseLeave={() => { setImageHovered(false); setTooltipIdx(null); }}
            data-testid="container-furniture-overlay"
          >
            <img
              ref={imgRef}
              src={imageUrl}
              alt="AI-genereret rum"
              className="w-full block"
              data-testid="img-furniture-overlay"
            />
            {analyzeResult.objects.map((obj, idx) => {
              const dot = scaleDot(obj);
              return (
                <div
                  key={idx}
                  data-testid={`dot-furniture-${idx}`}
                  className="absolute"
                  style={{
                    left: dot.left,
                    top: dot.top,
                    transform: "translate(-50%, -50%)",
                    zIndex: 10,
                    opacity: dotsVisible ? 1 : 0,
                    transition: "opacity 0.3s ease",
                  }}
                  onMouseEnter={() => setTooltipIdx(idx)}
                  onMouseLeave={() => setTooltipIdx(null)}
                  onClick={() => handleDotClick(obj)}
                >
                  <div
                    className="flex items-center justify-center rounded-full bg-white shadow-md border border-black/10"
                    style={{
                      width: 28,
                      height: 28,
                      animation:
                        dotsVisible && !hasClicked
                          ? "pulse 2s cubic-bezier(0.4,0,0.6,1) infinite"
                          : "none",
                    }}
                  >
                    <ShoppingCart className="w-3.5 h-3.5 text-gray-800" />
                  </div>
                  {tooltipIdx === idx && (
                    <div
                      className="absolute left-1/2 -translate-x-1/2 -top-9 bg-black/80 text-white px-2 py-1 rounded text-xs whitespace-nowrap pointer-events-none"
                      style={{ zIndex: 20 }}
                    >
                      {obj.labelDa} — Klik for at shoppe
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {panelOpen && activeObject && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={() => setPanelOpen(false)}
          />
          <div
            ref={panelRef}
            className="fixed z-50 bg-white shadow-2xl overflow-y-auto
              bottom-0 left-0 right-0 rounded-t-2xl max-h-[92vh]
              sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:max-w-2xl sm:w-full sm:max-h-[85vh]"
            style={{ padding: 24 }}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            data-testid="panel-similar-products"
          >
            <div className="sm:hidden flex justify-center mb-3">
              <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>

            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-xs tracking-widest uppercase text-gray-400 font-medium">
                  {activeObject.labelDa}
                </p>
                <p className="text-sm text-gray-500 mt-0.5">Lignende produkter fra danske butikker</p>
              </div>
              <button
                onClick={() => setPanelOpen(false)}
                className="rounded-full h-8 w-8 flex items-center justify-center hover:bg-gray-100 transition-colors text-gray-500"
                data-testid="button-close-panel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {cropMutation.isPending && (
              <div className="flex flex-col items-center py-12 gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                <p className="text-sm text-gray-500">Søger efter lignende produkter…</p>
              </div>
            )}

            {similarProducts && similarProducts.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-8">Ingen lignende produkter fundet.</p>
            )}

            {bestMatch && (
              <div className="space-y-4">
                <div>
                  <p className="text-[10px] tracking-widest uppercase text-gray-400 font-semibold mb-3">Best Match</p>
                  <a
                    href={bestMatch.affiliate_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex gap-4 group"
                    data-testid="product-best-match"
                  >
                    <div className="w-36 h-28 shrink-0 rounded-xl overflow-hidden bg-gray-100">
                      {bestMatch.image_url && (
                        <img
                          src={bestMatch.image_url}
                          alt={bestMatch.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      )}
                    </div>
                    <div className="flex flex-col justify-between flex-1 min-w-0 py-1">
                      <div>
                        <p className="font-semibold text-base leading-snug line-clamp-2 text-gray-900">{bestMatch.name}</p>
                        <p className="text-sm text-gray-500 mt-1 capitalize">{bestMatch.shop}</p>
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <p className="text-xl font-bold tabular-nums text-gray-900">{formatPrice(bestMatch.price)}</p>
                        <span className="inline-flex items-center gap-1.5 bg-black text-white text-sm px-4 py-2 rounded-lg font-medium">
                          Shop nu <ArrowRight className="w-3.5 h-3.5" />
                        </span>
                      </div>
                    </div>
                  </a>
                </div>

                {(similar.length > 0 || budgetProduct) && (
                  <div className="border-t border-gray-100 pt-4">
                    <div className="grid grid-cols-2 gap-3">
                      {similar.slice(0, 2).map((p, i) => (
                        <a
                          key={p.id}
                          href={p.affiliate_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group"
                          data-testid={`product-similar-${i}`}
                        >
                          <div className="w-full aspect-[4/3] rounded-xl overflow-hidden bg-gray-100 mb-2">
                            {p.image_url && (
                              <img
                                src={p.image_url}
                                alt={p.name}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                              />
                            )}
                          </div>
                          <p className="text-sm font-medium text-gray-900 line-clamp-2 leading-snug">{p.name}</p>
                          <p className="text-sm font-semibold tabular-nums text-gray-700 mt-1">{formatPrice(p.price)}</p>
                          <div className="flex items-center justify-between mt-1.5">
                            <span className="text-[10px] text-gray-400 capitalize">{p.shop}</span>
                            <span className="text-xs text-gray-500 group-hover:text-gray-900 flex items-center gap-0.5 transition-colors">
                              Se <ArrowRight className="w-2.5 h-2.5" />
                            </span>
                          </div>
                          <p className="text-[10px] text-gray-400 mt-0.5">Ligner mest</p>
                        </a>
                      ))}

                      {budgetProduct && budgetProduct.id !== bestMatch.id && (
                        <a
                          href={budgetProduct.affiliate_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group"
                          data-testid="product-budget"
                        >
                          <div className="w-full aspect-[4/3] rounded-xl overflow-hidden bg-gray-100 mb-2 relative">
                            {budgetProduct.image_url && (
                              <img
                                src={budgetProduct.image_url}
                                alt={budgetProduct.name}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                              />
                            )}
                            <span className="absolute top-2 left-2 bg-green-100 text-green-800 text-[10px] font-semibold px-2 py-0.5 rounded">
                              Budget
                            </span>
                          </div>
                          <p className="text-sm font-medium text-gray-900 line-clamp-2 leading-snug">{budgetProduct.name}</p>
                          <p className="text-sm font-semibold tabular-nums text-gray-700 mt-1">{formatPrice(budgetProduct.price)}</p>
                          <div className="flex items-center justify-between mt-1.5">
                            <span className="text-[10px] text-gray-400 capitalize">{budgetProduct.shop}</span>
                            <span className="text-xs text-gray-500 group-hover:text-gray-900 flex items-center gap-0.5 transition-colors">
                              Se <ArrowRight className="w-2.5 h-2.5" />
                            </span>
                          </div>
                          <p className="text-[10px] text-gray-400 mt-0.5">Budget valg</p>
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            <p className="text-[10px] text-gray-400 text-center mt-4">
              Produkter fundet via billedanalyse · Priser kan variere
            </p>
          </div>
        </>
      )}
    </div>
  );
}
