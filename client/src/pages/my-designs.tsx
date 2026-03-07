import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Flame, ArrowLeft, Loader2, Palette, Image } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Design } from "@shared/schema";

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

const tierLabels: Record<string, string> = {
  budget: "Budget",
  standard: "Standard",
  luxury: "Luksus",
};

function formatDKK(amount: number): string {
  return amount.toLocaleString("da-DK") + " kr";
}

export default function MyDesignsPage() {
  const { user, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [designs, setDesigns] = useState<Design[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      setLocation("/login");
    }
  }, [user, authLoading, setLocation]);

  useEffect(() => {
    const fetchMyDesigns = async () => {
      if (!user) return;
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/designs/my", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setDesigns(data);
        }
      } catch (err) {
        console.error("Fejl ved hentning af designs:", err);
      } finally {
        setLoading(false);
      }
    };

    if (user) fetchMyDesigns();
  }, [user]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-[#f5f5f0] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const completedDesigns = designs.filter((d) => d.status === "completed");

  return (
    <div className="min-h-screen bg-[#f5f5f0]">
      <header className="bg-white shadow-sm">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-6 h-16">
          <Link href="/">
            <span className="text-lg font-semibold tracking-tight cursor-pointer text-[#1a1a1a]" data-testid="link-logo">Nordic Homebuild</span>
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

      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-title">Dine designs</h1>
            <p className="text-muted-foreground mt-1" data-testid="text-count">
              {completedDesigns.length} {completedDesigns.length === 1 ? "design" : "designs"}
            </p>
          </div>
          <Link href="/design">
            <Button className="h-11 px-6" data-testid="button-new-design">
              <Palette className="w-4 h-4 mr-2" />
              Lav nyt design
            </Button>
          </Link>
        </div>

        {completedDesigns.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 shadow-sm text-center">
            <Image className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2" data-testid="text-empty-title">Ingen designs endnu</h2>
            <p className="text-muted-foreground mb-6" data-testid="text-empty-desc">Du har ikke lavet nogen designs endnu. Start med at uploade et billede af dit rum.</p>
            <Link href="/design">
              <Button data-testid="button-start-design">Start dit første design</Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {completedDesigns.map((design) => (
              <Link key={design.id} href={`/design/${design.id}`}>
                <div className="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow cursor-pointer border border-border/40" data-testid={`card-design-${design.id}`}>
                  <div className="relative">
                    <img
                      src={design.resultImageUrl || design.originalImageUrl}
                      alt={`${design.roomType} - ${design.style}`}
                      className="w-full h-52 object-cover"
                      data-testid={`img-design-${design.id}`}
                    />
                  </div>
                  <div className="p-4">
                    <p className="font-semibold text-sm" data-testid={`text-design-info-${design.id}`}>
                      {roomTypeLabels[design.roomType] || design.roomType}
                      <span className="text-muted-foreground font-normal"> · </span>
                      {styleLabels[design.style] || design.style}
                    </p>
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-xs text-muted-foreground" data-testid={`text-design-date-${design.id}`}>
                        {new Date(design.createdAt).toLocaleDateString("da-DK", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </p>
                      {design.budget && design.tier && (
                        <p className="text-xs text-muted-foreground" data-testid={`text-design-budget-${design.id}`}>
                          {formatDKK(design.budget)} · {tierLabels[design.tier] || design.tier}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        <Link href="/min-konto">
          <span className="flex items-center justify-center gap-1.5 mt-8 text-sm text-muted-foreground hover:text-foreground cursor-pointer transition-colors" data-testid="link-back">
            <ArrowLeft className="w-3.5 h-3.5" />
            Tilbage til min konto
          </span>
        </Link>
      </div>
    </div>
  );
}
