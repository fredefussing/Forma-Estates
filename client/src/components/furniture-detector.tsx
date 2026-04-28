import { useState, useRef, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Scan, ShoppingCart, X, ExternalLink, ChevronRight } from "lucide-react";
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

interface Props {
  imageUrl: string;
}

function formatPrice(price: string) {
  const n = parseFloat(price);
  if (isNaN(n)) return price;
  return n.toLocaleString("da-DK", { style: "currency", currency: "DKK", maximumFractionDigits: 0 });
}

function formatSimilarity(s: number) {
  return `${Math.round(s * 100)}% match`;
}

const BOX_COLORS = [
  "rgba(59,130,246,0.55)",
  "rgba(16,185,129,0.55)",
  "rgba(245,158,11,0.55)",
  "rgba(239,68,68,0.55)",
  "rgba(168,85,247,0.55)",
  "rgba(236,72,153,0.55)",
];

export function FurnitureDetector({ imageUrl }: Props) {
  const { toast } = useToast();
  const imgRef = useRef<HTMLImageElement>(null);

  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeResult | null>(null);
  const [activeObject, setActiveObject] = useState<DetectedObject | null>(null);
  const [similarProducts, setSimilarProducts] = useState<SimilarProduct[] | null>(null);
  const [popupOpen, setPopupOpen] = useState(false);

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
      });
      return res.json() as Promise<{ products: SimilarProduct[] }>;
    },
    onSuccess: (data) => {
      setSimilarProducts(data.products);
    },
    onError: (err: any) => {
      toast({ title: "Fejl", description: err.message, variant: "destructive" });
    },
  });

  const handleObjectClick = useCallback((obj: DetectedObject) => {
    setActiveObject(obj);
    setSimilarProducts(null);
    setPopupOpen(true);
    cropMutation.mutate(obj);
  }, []);

  const scaleBox = (obj: DetectedObject) => {
    if (!imgRef.current || !analyzeResult) return { left: 0, top: 0, width: 0, height: 0 };
    const el = imgRef.current;
    const scaleX = el.clientWidth / analyzeResult.imageWidth;
    const scaleY = el.clientHeight / analyzeResult.imageHeight;
    return {
      left: obj.x * scaleX,
      top: obj.y * scaleY,
      width: obj.width * scaleX,
      height: obj.height * scaleY,
    };
  };

  return (
    <div>
      {!analyzeResult ? (
        <div className="flex justify-center">
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
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs tracking-widest uppercase text-muted-foreground font-medium">
              {analyzeResult.objects.length > 0
                ? `${analyzeResult.objects.length} møbel${analyzeResult.objects.length !== 1 ? "r" : ""} fundet — klik for at finde lignende`
                : "Ingen møbler registreret"}
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7"
              onClick={() => { setAnalyzeResult(null); setPopupOpen(false); }}
              data-testid="button-reset-furniture"
            >
              Nulstil
            </Button>
          </div>

          <div className="relative rounded-xl overflow-hidden border border-border/60" style={{ lineHeight: 0 }}>
            <img
              ref={imgRef}
              src={imageUrl}
              alt="AI-genereret rum"
              className="w-full block"
              data-testid="img-furniture-overlay"
            />
            {analyzeResult.objects.map((obj, idx) => {
              const box = scaleBox(obj);
              const color = BOX_COLORS[idx % BOX_COLORS.length];
              return (
                <button
                  key={idx}
                  data-testid={`zone-furniture-${idx}`}
                  onClick={() => handleObjectClick(obj)}
                  className="absolute cursor-pointer group transition-all"
                  style={{
                    left: box.left,
                    top: box.top,
                    width: box.width,
                    height: box.height,
                    border: `2px solid ${color.replace("0.55", "0.9")}`,
                    backgroundColor: color.replace("0.55", "0.12"),
                    borderRadius: 4,
                  }}
                  title={obj.labelDa}
                >
                  <span
                    className="absolute -top-6 left-0 text-white text-[10px] font-medium px-1.5 py-0.5 rounded"
                    style={{ backgroundColor: color.replace("0.55", "0.9"), whiteSpace: "nowrap" }}
                  >
                    {obj.labelDa}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {popupOpen && activeObject && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setPopupOpen(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative bg-background border border-border/60 rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
            data-testid="popup-similar-products"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-base">{activeObject.labelDa}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Lignende produkter fra danske butikker</p>
              </div>
              <button
                onClick={() => setPopupOpen(false)}
                className="rounded-full h-8 w-8 flex items-center justify-center hover:bg-muted transition-colors"
                data-testid="button-close-popup"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {cropMutation.isPending && (
              <div className="flex flex-col items-center py-8 gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Søger efter lignende produkter…</p>
              </div>
            )}

            {similarProducts && similarProducts.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">Ingen lignende produkter fundet.</p>
            )}

            {similarProducts && similarProducts.length > 0 && (
              <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                {similarProducts.map((p, i) => (
                  <a
                    key={p.id}
                    href={p.affiliate_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-2.5 rounded-xl border border-border/40 hover:border-border hover:bg-muted/40 transition-all group"
                    data-testid={`product-item-${i}`}
                  >
                    {p.image_url && (
                      <img
                        src={p.image_url}
                        alt={p.name}
                        className="w-14 h-14 object-cover rounded-lg shrink-0 bg-muted"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-snug truncate">{p.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 capitalize">{p.shop}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-sm font-semibold tabular-nums">{formatPrice(p.price)}</span>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                          {formatSimilarity(p.similarity)}
                        </Badge>
                      </div>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0 group-hover:text-foreground transition-colors" />
                  </a>
                ))}
              </div>
            )}

            <p className="text-[10px] text-muted-foreground text-center">
              Produkter fundet via billedanalyse · Priser kan variere
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
