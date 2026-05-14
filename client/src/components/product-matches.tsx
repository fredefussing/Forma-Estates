import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ShoppingBag, ExternalLink, Sparkles, Sofa } from "lucide-react";

interface ProductMatch {
  id: number;
  name: string;
  name_en: string | null;
  price: string | null;
  image_url: string | null;
  affiliate_link: string | null;
  shop: string | null;
  match_type: "same_style" | "alternative";
  match_score: number;
  rank: number;
}

interface ProductMatchesProps {
  designId: number;
}

export function ProductMatches({ designId }: ProductMatchesProps) {
  const { data, isLoading } = useQuery<{ products: ProductMatch[]; count: number }>({
    queryKey: ["/api/designs", designId, "products"],
    queryFn: () => fetch(`/api/designs/${designId}/products`).then(r => r.json()),
    enabled: designId > 0,
    staleTime: 5 * 60 * 1000,
    refetchInterval: (query) => {
      const count = query.state.data?.count ?? 0;
      return count === 0 ? 8000 : false;
    },
  });

  if (isLoading) return <ProductMatchesSkeleton />;

  if (!data?.products || data.products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <Sofa className="h-9 w-9 text-stone-300 dark:text-stone-600 mb-3" />
        <p className="text-stone-400 dark:text-stone-500 text-sm">Finder matchende produkter...</p>
        <p className="text-stone-300 dark:text-stone-600 text-xs mt-1">
          Det tager et øjeblik efter billedet er genereret.
        </p>
      </div>
    );
  }

  const sameStyle = data.products.filter(p => p.match_type === "same_style");
  const alternatives = data.products.filter(p => p.match_type === "alternative");

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <ShoppingBag className="h-4 w-4 text-stone-600 dark:text-stone-400" />
        <h3 className="font-semibold text-stone-800 dark:text-stone-200 text-sm">Shop stilen</h3>
        <Badge variant="secondary" className="ml-auto text-xs">
          {data.products.length} produkter
        </Badge>
      </div>

      <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 rounded-lg p-3">
        <Sparkles className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-amber-800 dark:text-amber-300">
          <strong>Inspiration, ikke identitet.</strong> AI-genererede møbler er fiktive.
          Produkterne matcher stilen og farven — ikke 1:1 kopier.
        </p>
      </div>

      {sameStyle.length > 0 && (
        <div className="space-y-2.5">
          <h4 className="text-xs font-medium text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            I samme stil
          </h4>
          <div className="grid grid-cols-3 gap-3">
            {sameStyle.map(p => <ProductCard key={p.id} product={p} />)}
          </div>
        </div>
      )}

      {alternatives.length > 0 && (
        <div className="space-y-2.5">
          <h4 className="text-xs font-medium text-stone-500 dark:text-stone-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-stone-400" />
            Alternativ
          </h4>
          <div className="grid grid-cols-3 gap-3">
            {alternatives.map(p => <ProductCard key={p.id} product={p} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function ProductCard({ product }: { product: ProductMatch }) {
  const name = product.name_en || product.name;
  const price = product.price
    ? `${parseFloat(product.price).toLocaleString("da-DK")} DKK`
    : "Se pris";

  return (
    <Card
      className="border-stone-200 dark:border-stone-700/50 overflow-hidden hover:shadow-md transition-shadow group"
      data-testid={`card-product-${product.id}`}
    >
      <div className="aspect-square bg-stone-100 dark:bg-stone-800 relative overflow-hidden">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Sofa className="h-10 w-10 text-stone-300 dark:text-stone-600" />
          </div>
        )}
      </div>

      <CardContent className="p-2.5 space-y-1.5">
        <p
          className="text-xs font-medium text-stone-800 dark:text-stone-200 line-clamp-2 leading-snug group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors"
          data-testid={`text-product-name-${product.id}`}
        >
          {name}
        </p>

        <div className="flex items-center justify-between gap-1">
          <p className="text-xs font-semibold text-stone-900 dark:text-stone-100 tabular-nums" data-testid={`text-product-price-${product.id}`}>
            {price}
          </p>
          {product.shop && (
            <span className="text-[10px] text-stone-400 dark:text-stone-500 truncate">{product.shop}</span>
          )}
        </div>

        {product.affiliate_link ? (
          <a
            href={product.affiliate_link}
            target="_blank"
            rel="noopener noreferrer"
            className="block"
            data-testid={`link-product-${product.id}`}
          >
            <Button
              size="sm"
              variant="outline"
              className="w-full text-[11px] h-7 border-emerald-200 dark:border-emerald-800/50 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
            >
              <ExternalLink className="h-3 w-3 mr-1" />
              Se produkt
            </Button>
          </a>
        ) : (
          <Button size="sm" variant="outline" disabled className="w-full text-[11px] h-7 opacity-40">
            Intet link
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function ProductMatchesSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-4" />
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-4 w-14 ml-auto" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3].map(i => (
          <Card key={i} className="border-stone-200 dark:border-stone-700/50 overflow-hidden">
            <Skeleton className="aspect-square" />
            <CardContent className="p-2.5 space-y-1.5">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-7 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
