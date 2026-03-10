import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, ArrowLeft, Flame, Eye, Sparkles, User } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";

import trendingImg1 from "@assets/Skærmbillede_2026-03-10_kl._19.47.14_1773168437268.png";
import trendingImg2 from "@assets/Skærmbillede_2026-03-10_kl._19.47.25_1773168447874.png";
import trendingImg3 from "@assets/Skærmbillede_2026-03-10_kl._19.47.39_1773168463231.png";

const trendingItems = [
  {
    rank: 1,
    roomType: "living room",
    style: "scandinavian",
    budget: 35000,
    designCount: 24,
    imageUrl: trendingImg1,
    title: "Lys & luftig stue",
    description: "Hvide vægge, egetræ og hyggelige tekstiler skaber det perfekte hjem",
    roomLabel: "Stue",
    styleLabel: "Skandinavisk",
    roomEmoji: "🛋️",
    styleEmoji: "❄️",
  },
  {
    rank: 2,
    roomType: "bedroom",
    style: "coastal",
    budget: 28000,
    designCount: 18,
    imageUrl: trendingImg2,
    title: "Kyst-soveværelse",
    description: "Afslappet kyststil med lyse farver, naturlige materialer og havfølelse",
    roomLabel: "Soveværelse",
    styleLabel: "Kyst",
    roomEmoji: "🛏️",
    styleEmoji: "🌊",
  },
  {
    rank: 3,
    roomType: "bedroom",
    style: "modern",
    budget: 25000,
    designCount: 15,
    imageUrl: trendingImg3,
    title: "Moderne ungdomsværelse",
    description: "Rent, minimalistisk design med moderne møbler og funktionel indretning",
    roomLabel: "Soveværelse",
    styleLabel: "Moderne",
    roomEmoji: "🛏️",
    styleEmoji: "⬛",
  },
];

export default function TrendingPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const handleCopyDesign = (item: typeof trendingItems[number]) => {
    navigate(`/design?roomType=${encodeURIComponent(item.roomType)}&style=${encodeURIComponent(item.style)}&budget=${item.budget}`);
  };

  return (
    <div className="min-h-screen bg-background" data-testid="page-trending">
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/90 backdrop-blur-lg">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-6 h-16">
          <Link href="/">
            <span className="text-lg font-semibold tracking-tight cursor-pointer" data-testid="link-logo">Nordic Homebuild</span>
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
              <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer" data-testid="link-pricing">Pris</span>
            </Link>
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

      <main className="mx-auto max-w-6xl px-6 py-12">
        <div className="mb-4">
          <Link href="/">
            <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer inline-flex items-center gap-1" data-testid="link-back">
              <ArrowLeft className="w-3.5 h-3.5" />
              Tilbage
            </span>
          </Link>
        </div>

        <div className="text-center mb-12">
          <Badge variant="secondary" className="mb-4 bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-0" data-testid="badge-trending">
            <Flame className="w-3.5 h-3.5 mr-1" />
            Trending lige nu
          </Badge>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-3" data-testid="text-title">Populære designs i dag</h1>
          <p className="text-muted-foreground text-lg" data-testid="text-subtitle">Se hvad andre skaber lige nu — og få samme look</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="grid-trending">
          {trendingItems.map((item) => (
            <motion.div
              key={`${item.roomType}-${item.style}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: item.rank * 0.08 }}
            >
              <div className="bg-card rounded-2xl overflow-hidden border border-border/60 hover:border-border hover:shadow-lg transition-all duration-300 group" data-testid={`card-trending-${item.rank}`}>
                <div className="relative h-56 overflow-hidden bg-muted">
                  <img
                    src={item.imageUrl}
                    alt={item.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    data-testid={`img-trending-${item.rank}`}
                  />
                  <div className="absolute top-3 left-3">
                    <div className="w-8 h-8 rounded-full bg-foreground text-background flex items-center justify-center text-sm font-bold" data-testid={`rank-${item.rank}`}>
                      {item.rank}
                    </div>
                  </div>
                  <div className="absolute top-3 right-3">
                    <div className="flex items-center gap-1.5 bg-green-600/90 backdrop-blur-sm text-white text-xs font-medium px-2.5 py-1 rounded-full">
                      <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                      {item.designCount} designs
                    </div>
                  </div>
                </div>

                <div className="p-5">
                  <div className="flex items-center gap-2 mb-3 text-sm text-muted-foreground">
                    <span>{item.roomEmoji} {item.roomLabel}</span>
                    <span className="text-border">·</span>
                    <span>{item.styleEmoji} {item.styleLabel}</span>
                  </div>

                  <h3 className="text-lg font-semibold mb-1.5" data-testid={`title-trending-${item.rank}`}>
                    {item.title}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4 line-clamp-2" data-testid={`desc-trending-${item.rank}`}>
                    {item.description}
                  </p>

                  <Button
                    className="w-full"
                    onClick={() => handleCopyDesign(item)}
                    data-testid={`button-copy-${item.rank}`}
                  >
                    Prøv samme design
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>

                  <div className="flex items-center gap-4 mt-4 pt-4 border-t border-border/60 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Eye className="w-3.5 h-3.5" />
                      {item.designCount * 13 + 42} set
                    </span>
                    <span className="flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5" />
                      {item.designCount} genereret
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </main>
    </div>
  );
}
