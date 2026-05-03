import { useState, useEffect } from "react";
import { ShoppingBag, ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface StyleProduct {
  id: number;
  name: string;
  image_url: string;
  affiliate_link: string;
  price: number | null;
  shop: string;
  tags: Record<string, any>;
  tag_confidence: number;
  match_score: number;
}

interface Props {
  style: string;
  roomType: string;
  budget?: "budget" | "standard" | "luxury";
}

const ROOM_LABELS: Record<string, string> = {
  living_room: "Stue", bedroom: "Soveværelse", kitchen: "Køkken",
  bathroom: "Badeværelse", dining_room: "Spisestue", office: "Kontor", hallway: "Entré",
};

const STYLE_LABELS: Record<string, string> = {
  scandinavian: "Skandinavisk", modern: "Moderne", industrial: "Industrielt",
  classic: "Klassisk", bohemian: "Boheme", minimalist: "Minimalistisk",
  rustic: "Rustik", luxury: "Luksus", mid_century: "Mid-century", contemporary: "Nutidig",
};

const BUDGET_LABELS = { budget: "Budget", standard: "Standard", luxury: "Luksus" };

function formatPrice(price: number | null) {
  if (price == null) return null;
  return price.toLocaleString("da-DK") + " kr";
}

export function ShopThisStyle({ style, roomType, budget = "standard" }: Props) {
  const [products, setProducts] = useState<StyleProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeBudget, setActiveBudget] = useState(budget);
  const [taggedCount, setTaggedCount] = useState<number | null>(null);

  useEffect(() => {
    fetchProducts(activeBudget);
  }, [style, roomType, activeBudget]);

  async function fetchProducts(b: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/style-products?style=${style}&room=${roomType}&budget=${b}&limit=8`);
      const data = await res.json();
      if (data.success) {
        setProducts(data.products || []);
        setTaggedCount(data.tagged_count ?? null);
        if ((data.products || []).length === 0) setError("Ingen produkter fundet endnu — tag-systemet er under opbygning");
      } else {
        setError(data.error || "Ingen produkter fundet");
      }
    } catch {
      setError("Kunne ikke hente produkter");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="mt-6 space-y-4" data-testid="shop-style-loading">
        <div className="flex items-center gap-2 mb-4">
          <ShoppingBag className="w-4 h-4 text-muted-foreground" />
          <Skeleton className="h-5 w-40" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-xl overflow-hidden border border-border/40">
              <Skeleton className="aspect-square w-full" />
              <div className="p-3 space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error && products.length === 0) {
    return (
      <div className="mt-6 border border-border/40 rounded-xl p-6 text-center bg-muted/20" data-testid="shop-style-empty">
        <ShoppingBag className="w-8 h-8 mx-auto mb-3 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">{error}</p>
        {taggedCount !== null && (
          <p className="text-xs text-muted-foreground/60 mt-1">{taggedCount.toLocaleString("da-DK")} produkter er tagget indtil videre</p>
        )}
        <Button variant="ghost" size="sm" onClick={() => fetchProducts(activeBudget)} className="mt-3 text-xs gap-1.5">
          <RefreshCw className="w-3 h-3" /> Prøv igen
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4" data-testid="shop-style-section">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <ShoppingBag className="w-4 h-4 text-muted-foreground" />
          <div>
            <h3 className="text-sm font-medium" data-testid="shop-style-title">
              Shop dette look
            </h3>
            <p className="text-xs text-muted-foreground">
              {STYLE_LABELS[style] || style} · {ROOM_LABELS[roomType] || roomType}
              {products.length > 0 && ` · ${products.length} produkter`}
            </p>
          </div>
        </div>

        <div className="flex bg-muted rounded-lg p-0.5 gap-0.5">
          {(["budget", "standard", "luxury"] as const).map((b) => (
            <button
              key={b}
              onClick={() => setActiveBudget(b)}
              data-testid={`button-budget-${b}`}
              className={`px-2.5 py-1 text-xs rounded-md transition-all ${
                activeBudget === b
                  ? "bg-background text-foreground shadow-sm font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {BUDGET_LABELS[b]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {products.map((product, index) => (
          <a
            key={product.id}
            href={product.affiliate_link}
            target="_blank"
            rel="noopener noreferrer"
            data-testid={`shop-card-style-${product.id}`}
            className="group flex flex-col rounded-xl border border-border/40 overflow-hidden hover:border-border hover:shadow-md transition-all bg-card"
          >
            <div className="relative aspect-square overflow-hidden bg-muted">
              {product.image_url ? (
                <img
                  src={product.image_url}
                  alt={product.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground/20">
                  <ShoppingBag className="w-8 h-8" />
                </div>
              )}
              <div className="absolute top-2 left-2">
                <span className="bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded font-medium">
                  #{index + 1}
                </span>
              </div>
              {product.tags?.type && product.tags.type !== "unknown" && (
                <div className="absolute bottom-2 left-2">
                  <span className="bg-white/90 dark:bg-black/70 text-foreground text-[9px] px-1.5 py-0.5 rounded capitalize">
                    {product.tags.type.replace(/_/g, " ")}
                  </span>
                </div>
              )}
            </div>

            <div className="p-2.5 flex flex-col flex-1">
              <p className="text-xs text-foreground line-clamp-2 leading-snug flex-1 group-hover:text-primary transition-colors">
                {product.name}
              </p>
              {product.price != null && (
                <p className="text-sm font-semibold mt-1.5 tabular-nums">
                  {formatPrice(product.price)}
                </p>
              )}
              <div className="flex items-center gap-1 mt-1.5 text-[10px] text-muted-foreground">
                <ExternalLink className="w-2.5 h-2.5" />
                <span>{product.shop || "Se produkt"}</span>
              </div>
            </div>
          </a>
        ))}
      </div>

      <p className="text-[10px] text-muted-foreground/50 text-center">
        Affiliate links — du støtter os når du handler via disse links
      </p>
    </div>
  );
}
