import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, ArrowLeft, Flame, Eye, Sparkles, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";
import { formatDKK } from "@shared/budgetUtils";

interface TrendingItem {
  rank: number;
  roomType: string;
  style: string;
  budget: number;
  designCount: number;
  imageUrl: string;
}

const roomLabels: Record<string, string> = {
  "living room": "Stue",
  "bedroom": "Soveværelse",
  "kitchen": "Køkken",
  "bathroom": "Badeværelse",
  "dining room": "Spisestue",
  "home office": "Hjemmekontor",
  "kids room": "Børneværelse",
  "studio": "Studio",
  "game room": "Spillerum",
  "home gym": "Træningsrum",
  "laundry room": "Vaskerum",
  "conference room": "Mødelokale",
  "spa room": "Spa",
  "outdoor": "Udendørs",
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
  badboy: "Badboy",
};

const styleEmojis: Record<string, string> = {
  scandinavian: "❄️",
  modern: "⬛",
  luxury: "💎",
  industrial: "🔩",
  coastal: "🌊",
  transitional: "🔄",
  farmhouse: "🌿",
  badboy: "🖤",
};

const roomEmojis: Record<string, string> = {
  "living room": "🛋️",
  "bedroom": "🛏️",
  "kitchen": "🍳",
  "bathroom": "🛁",
  "dining room": "🍽️",
  "home office": "💼",
  "kids room": "🧸",
  "studio": "🎨",
  "game room": "🎮",
  "home gym": "💪",
  "outdoor": "🌳",
};

const trendingDescriptions: Record<string, Record<string, string>> = {
  scandinavian: {
    "living room": "Hvide vægge, egetræ og hyggelige tekstiler skaber det perfekte hjem",
    "bedroom": "Lyst og luftigt soveværelse med naturlige materialer og bløde tekstiler",
    "kitchen": "Funktionelt køkken med lyse overflader og skandinavisk enkelhed",
    default: "Lyst, minimalistisk og hyggeligt skandinavisk design",
  },
  modern: {
    "living room": "Rene linjer, neutral palette og funktionelt moderne design",
    "bedroom": "Minimalistisk sovehimmel med ro og elegance",
    "kitchen": "Strakst køkken med moderne materialer og smarte løsninger",
    default: "Rent, stramme linjer og funktionelt moderne design",
  },
  luxury: {
    "living room": "Designer-møbler, marmor og gennemført elegance",
    "bedroom": "Eksklusivt soveværelse med premium materialer og raffinement",
    default: "Eksklusivt og sofistikeret luksusdesign",
  },
  industrial: {
    "living room": "Rå mursten, metal og åbne rum med urban karakter",
    default: "Råt, åbent og urbant industrielt design",
  },
  badboy: {
    "bedroom": "Mørke vægge, læder og chrome i en maskulin oase",
    "living room": "Mørk, eksklusiv lounge med attitude og kant",
    default: "Mørk, maskulin og eksklusiv stil med attitude",
  },
  coastal: { default: "Afslappet kyststil med lyse farver og naturlige materialer" },
  transitional: { default: "Klassisk møder moderne i en harmonisk blanding" },
  farmhouse: { default: "Rustikt og varmt landlig design med karakter" },
};

const trendingTitles: Record<string, Record<string, string>> = {
  scandinavian: {
    "living room": "Lys & luftig stue",
    "bedroom": "Nordisk drømmeværelse",
    "kitchen": "Skandinavisk køkken",
    default: "Skandinavisk harmoni",
  },
  modern: {
    "living room": "Moderne loungestue",
    "bedroom": "Minimalistisk sovehimmel",
    "kitchen": "Moderne drømmekøkken",
    default: "Moderne elegance",
  },
  luxury: {
    "living room": "Eksklusiv lounge",
    "bedroom": "Luksus suite",
    default: "Luksus oase",
  },
  industrial: {
    "living room": "Urban loft-stue",
    default: "Industriel karakter",
  },
  badboy: {
    "bedroom": "Mørk maskulin suite",
    "living room": "Badboy lounge",
    default: "Dark luxury",
  },
  coastal: { default: "Kyst-retreat" },
  transitional: { default: "Klassisk moderne" },
  farmhouse: { default: "Landlig hygge" },
};

function getDescription(style: string, roomType: string): string {
  const styleDescs = trendingDescriptions[style];
  if (!styleDescs) return "Et populært design med stil og karakter";
  return styleDescs[roomType] || styleDescs.default || "Et populært design med stil og karakter";
}

function getTitle(style: string, roomType: string): string {
  const styleTitles = trendingTitles[style];
  if (!styleTitles) return `${styleLabels[style] || style} ${roomLabels[roomType] || roomType}`;
  return styleTitles[roomType] || styleTitles.default || `${styleLabels[style]} design`;
}

export default function TrendingPage() {
  const [, navigate] = useLocation();

  const { data: trending = [], isLoading } = useQuery<TrendingItem[]>({
    queryKey: ["/api/trending"],
  });

  const handleCopyDesign = (item: TrendingItem) => {
    navigate(`/design?roomType=${encodeURIComponent(item.roomType)}&style=${encodeURIComponent(item.style)}&budget=${item.budget}`);
  };

  return (
    <div className="min-h-screen bg-background" data-testid="page-trending">
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
              <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer" data-testid="link-pricing">Pris</span>
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

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-card rounded-2xl overflow-hidden border border-border/60 animate-pulse">
                <div className="h-56 bg-muted" />
                <div className="p-6 space-y-3">
                  <div className="h-4 bg-muted rounded w-1/3" />
                  <div className="h-6 bg-muted rounded w-2/3" />
                  <div className="h-4 bg-muted rounded w-full" />
                  <div className="h-10 bg-muted rounded w-full mt-4" />
                </div>
              </div>
            ))}
          </div>
        ) : trending.length === 0 ? (
          <div className="text-center py-20">
            <TrendingUp className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Ingen trending designs endnu</h2>
            <p className="text-muted-foreground mb-6">Vær den første til at skabe et design!</p>
            <Link href="/design">
              <Button data-testid="button-create-first">
                <Sparkles className="w-4 h-4 mr-2" />
                Opret dit design
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="grid-trending">
            {trending.map((item) => (
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
                      alt={getTitle(item.style, item.roomType)}
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
                      <span>{roomEmojis[item.roomType] || "🏠"} {roomLabels[item.roomType] || item.roomType}</span>
                      <span className="text-border">·</span>
                      <span>{styleEmojis[item.style] || "✨"} {styleLabels[item.style] || item.style}</span>
                    </div>

                    <h3 className="text-lg font-semibold mb-1.5" data-testid={`title-trending-${item.rank}`}>
                      {getTitle(item.style, item.roomType)}
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4 line-clamp-2" data-testid={`desc-trending-${item.rank}`}>
                      {getDescription(item.style, item.roomType)}
                    </p>

                    <div className="text-xl font-bold mb-4" data-testid={`price-trending-${item.rank}`}>
                      {formatDKK(item.budget)}
                    </div>

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
                        {Math.floor(item.designCount * 13 + Math.random() * 50)} set
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
        )}
      </main>
    </div>
  );
}
