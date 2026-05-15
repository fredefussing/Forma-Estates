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
  tags: Record<string, any> | null;
  category: string | null;
  match_type: "same_style" | "alternative";
  match_score: number;
  rank: number;
}

interface ProductMatchesProps {
  designId: number;
}

// ── Fixed display order: type key → Danish label + emoji ─────────────────────
const TYPE_ORDER = [
  { type: "dining_chair",  label: "Spisebordsstole", icon: "🪑" },
  { type: "lounge_chair",  label: "Lænestole",       icon: "🛋️" },
  { type: "bar_stool",     label: "Barstole",         icon: "🪑" },
  { type: "office_chair",  label: "Kontorstole",      icon: "💺" },
  { type: "dining_table",  label: "Spiseborde",       icon: "🍽️" },
  { type: "coffee_table",  label: "Sofaborde",        icon: "☕" },
  { type: "side_table",    label: "Sideborde",        icon: "📦" },
  { type: "desk",          label: "Skriveborde",      icon: "📝" },
  { type: "bookshelf",     label: "Reoler",           icon: "📚" },
  { type: "cabinet",       label: "Skabe",            icon: "🚪" },
  { type: "sofa",          label: "Sofaer",           icon: "🛋️" },
  { type: "sofa_bed",      label: "Sovesofaer",       icon: "🛏️" },
  { type: "bed",           label: "Senge",            icon: "🛏️" },
  { type: "lamp",          label: "Lamper",           icon: "💡" },
  { type: "ceiling_lamp",  label: "Loftlamper",       icon: "💡" },
  { type: "table_lamp",    label: "Bordlamper",       icon: "💡" },
  { type: "floor_lamp",    label: "Gulvlamper",       icon: "💡" },
  { type: "wall_lamp",     label: "Væglamper",        icon: "💡" },
  { type: "rug",           label: "Tæpper",           icon: "🧶" },
  { type: "mirror",        label: "Spejle",           icon: "🪞" },
  { type: "curtain",       label: "Gardiner",         icon: "🪟" },
  { type: "plant",         label: "Planter",          icon: "🌿" },
  { type: "vase",          label: "Vaser",            icon: "🏺" },
  { type: "cushion",       label: "Puder",            icon: "🪶" },
  { type: "other",         label: "Andet",            icon: "📦" },
];

// ── Derive a specific TYPE_ORDER key from product tags + Danish category ──────
function inferDisplayType(tags: Record<string, any> | null, category: string | null): string {
  const base = tags?.type ?? "other";
  const cat = (category ?? "").toLowerCase();

  // Chairs — distinguish by category
  if (base === "chair" || cat.includes("stol")) {
    if (cat.includes("spisebordsst") || cat.includes("dining")) return "dining_chair";
    if (cat.includes("lænestol") || cat.includes("gulvstol") || cat.includes("lounge")) return "lounge_chair";
    if (cat.includes("barstol") || cat.includes("bar")) return "bar_stool";
    if (cat.includes("kontor") || cat.includes("office")) return "office_chair";
    return "dining_chair";
  }

  // Tables — distinguish by category
  if (base === "table" || (cat.includes("bord") && !cat.includes("bordlampe"))) {
    if (cat.includes("sofabord") || cat.includes("coffee")) return "coffee_table";
    if (cat.includes("spise") || cat.includes("dining")) return "dining_table";
    if (cat.includes("sidebord") || cat.includes("natbord")) return "side_table";
    if (cat.includes("skrivebord") || cat.includes("desk")) return "desk";
    return "coffee_table";
  }

  // Sofas
  if (base === "sofa" || cat.includes("sofa")) {
    if (cat.includes("sovesofa")) return "sofa_bed";
    return "sofa";
  }

  // Beds
  if (base === "bed" || cat.includes("seng")) return "bed";

  // Lamps — distinguish by category
  if (base === "lamp" || cat.includes("lampe") || cat.includes("lamper") || cat.includes("pendel")) {
    if (cat.includes("gulvlampe")) return "floor_lamp";
    if (cat.includes("bordlampe")) return "table_lamp";
    if (cat.includes("loftpendler") || cat.includes("hængende") || cat.includes("loftlampe")) return "ceiling_lamp";
    if (cat.includes("væglampe")) return "wall_lamp";
    return "lamp";
  }

  // Shelves / cabinets
  if (base === "cabinet" || cat.includes("skab") || cat.includes("reol") || cat.includes("skænk")) {
    if (cat.includes("reol") || cat.includes("bogskab")) return "bookshelf";
    return "cabinet";
  }

  // Rugs
  if (base === "rug" || cat.includes("tæppe")) return "rug";

  // Mirrors
  if (base === "mirror" || cat.includes("spejl")) return "mirror";

  // Curtains
  if (base === "curtain" || cat.includes("gardin")) return "curtain";

  // Plants / pots
  if (base === "plant" || cat.includes("plante") || cat.includes("krukke")) return "plant";

  // Cushions / vases / decor
  if (base === "cushion" || cat.includes("pude")) return "cushion";
  if (base === "vase" || cat.includes("vase")) return "vase";

  return "other";
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

  // Group by inferred display type
  const grouped = data.products.reduce<Record<string, ProductMatch[]>>((acc, p) => {
    const key = inferDisplayType(p.tags, p.category);
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {});

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

      {TYPE_ORDER.map(({ type, label, icon }) => {
        const items = grouped[type];
        if (!items || items.length === 0) return null;

        return (
          <div key={type} data-testid={`group-${type}`}>
            <h4 className="text-xs font-semibold text-stone-600 dark:text-stone-400 flex items-center gap-1.5 mb-2">
              <span>{icon}</span>
              {label}
              <span className="font-normal text-stone-400 dark:text-stone-500">({items.length})</span>
            </h4>
            <div className="grid grid-cols-3 gap-3">
              {items.slice(0, 3).map(p => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </div>
        );
      })}
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
