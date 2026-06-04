import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useTransformationJob } from "@/hooks/use-transformation-job";
import { Upload, Sparkles, Loader2, RotateCcw, X, ChevronRight, Home, Bed, UtensilsCrossed, Bath, Briefcase, Dumbbell, Baby, Gamepad2, Palmtree, Sofa, ArrowRight, Check, User, Lock, Zap, Crown, TrendingUp, BarChart3, BadgeCheck } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { useAuth } from "@/hooks/use-auth";
import { roomTypes, designStyles, freeStyles, type RoomType, type DesignStyle, type Design } from "@shared/schema";
import { type BudgetTier } from "@shared/styleVocabulary";
import { getTierLabel, formatDKK } from "@shared/budgetUtils";
import { styleVocabulary } from "@shared/styleVocabulary";
import { BeforeAfterSlider } from "@/components/before-after-slider";
import { DesignCard } from "@/components/design-card";
import { BudgetSlider } from "@/components/budget-slider";
import { FurnitureDetector } from "@/components/furniture-detector";
import { ShopThisStyle } from "@/components/shop-this-style";
import { ProductMatches } from "@/components/product-matches";
import { motion, AnimatePresence } from "framer-motion";

const ROOM_TYPE_TO_SEARCH: Record<string, string> = {
  "living room": "living_room", "bedroom": "bedroom", "kitchen": "kitchen",
  "bathroom": "bathroom", "dining room": "dining_room", "home office": "office",
  "kids room": "living_room", "gym": "living_room", "game room": "living_room",
  "outdoor": "outdoor",
};

const roomTypeLabels: Record<RoomType, string> = {
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

const roomTypeIcons: Partial<Record<RoomType, typeof Home>> = {
  "living room": Sofa,
  "bedroom": Bed,
  "kitchen": UtensilsCrossed,
  "bathroom": Bath,
  "home office": Briefcase,
  "home gym": Dumbbell,
  "kids room": Baby,
  "game room": Gamepad2,
  "outdoor": Palmtree,
};

const styleLabels: Record<DesignStyle, string> = {
  "scandinavian": "Skandinavisk",
  "modern": "Moderne",
  "luxury": "Luksus",
  "industrial": "Industriel",
  "coastal": "Kyst",
  "bohemian": "Bohemisk",
  "japandi": "Japandi",
  "minimalist": "Minimalistisk",
  "farmhouse": "Landlig",
};

const styleDescriptions: Record<DesignStyle, string> = {
  "scandinavian": "Lyst, minimalistisk og hyggeligt",
  "modern": "Rent, stramme linjer og funktionelt",
  "luxury": "Eksklusivt og sofistikeret",
  "industrial": "Råt, åbent og urbant",
  "coastal": "Afslappet med maritime toner",
  "bohemian": "Farverigt, lagdelt og frithængende",
  "japandi": "Japansk ro møder nordisk enkelhed",
  "minimalist": "Rent, stille og med kun det nødvendige",
  "farmhouse": "Rustikt, varmt og med landlig charme",
};

const valueMultipliers: Partial<Record<RoomType, number>> = {
  "kitchen": 0.75,
  "bathroom": 0.65,
  "bedroom": 0.40,
  "living room": 0.35,
  "open living and dining room": 0.35,
  "dining room": 0.35,
  "home office": 0.25,
  "conference room": 0.25,
};

function getValueMultiplier(room: RoomType | ""): number {
  if (!room) return 0.30;
  return valueMultipliers[room] ?? 0.30;
}

function calcValueRange(budget: number, room: RoomType | "") {
  const mult = getValueMultiplier(room);
  const min = Math.round((budget * mult) / 1000) * 1000;
  const max = Math.round((min * 1.2) / 1000) * 1000;
  const roi = Math.round((min / budget) * 100);
  return { min, max, roi };
}

const styleValueReasons: Record<DesignStyle, [string, string, string]> = {
  "scandinavian": [
    "Lys og åbenhed øger salgsappel markant",
    "Minimalistisk æstetik er efterspurgt hos 73% af danske boligkøbere",
    "Naturlige materialer og hvidmaling forbliver tidløst og universelt",
  ],
  "modern": [
    "Rene linjer og moderne finish appellerer til et bredt publikum",
    "Funktionelt layout maksimerer rummets opfattede størrelse",
    "Neutral palet er nem at style op til fremvisning",
  ],
  "luxury": [
    "Eksklusivt udtryk øger den opfattede ejendomsværdi",
    "Tiltrækker købestærke købere i premium-segmentet",
    "Unikke materialer og detaljer skaber 'wow-effekt' ved fremvisning",
  ],
  "industrial": [
    "Råt og urbant udtryk er meget eftertragtet i byboliger",
    "Åbne løsninger og betonlook øger rummets karakter",
    "Differentierer boligen markant fra traditionelle lejligheder",
  ],
  "coastal": [
    "Afslappet havstil øger attraktivitet for fritidsboligkøbere",
    "Lyse, naturlige toner er tidløse og bredt appellerende",
    "Maritime detaljer skaber en unik, eftertragtet atmosfære",
  ],
  "bohemian": [
    "Farverigt og lagdelt udtryk skaber stærk personlig appel",
    "Unikke tekstiler og detaljer differentierer boligen markant",
    "Bohemisk stil tiltrækker kreative og livsstilsbevidste købere",
  ],
  "japandi": [
    "Japansk ro og nordisk enkelhed er meget efterspurgt",
    "Naturmaterialer og neutralt udtryk appellerer bredt",
    "Tidløst og roligt miljø øger rummets opfattede kvalitet",
  ],
  "minimalist": [
    "Rent og uklodset rum opfattes som større og mere værdifuldt",
    "Minimalistisk udtryk er tidløst og bredt appellerende",
    "Intet overflødig — hvert element understreger rummets styrker",
  ],
  "farmhouse": [
    "Rustikt og varmt miljø skaber stærk emotionel appel hos køber",
    "Hyggefaktoren er en af de vigtigste salgsdrivere i Danmark",
    "Naturmaterialer signalerer kvalitet og holdbarhed",
  ],
};

const subscriptionPackages = [
  {
    name: "Basic",
    key: "basic",
    price: 49,
    images: 10,
    icon: Sparkles,
    features: ["10 AI-billeder", "Alle 8 stilarter", "Alle budget-niveauer"],
    productUrl: "https://ej8jeq-rs.myshopify.com/products/fa-10-ai-genererede-billeder-af-dit-rum",
    popular: false,
  },
  {
    name: "Pro",
    key: "pro",
    price: 99,
    images: 25,
    icon: Zap,
    features: ["25 AI-billeder", "Alle 8 stilarter", "Alle budget-niveauer", "Hurtigere generering"],
    productUrl: "https://ej8jeq-rs.myshopify.com/products/fa-25-ai-genererede-billeder-af-dit-rum",
    popular: true,
  },
  {
    name: "Unlimited",
    key: "unlimited",
    price: 149,
    images: 60,
    icon: Crown,
    features: ["60 AI-billeder", "Alle 8 stilarter", "Alle budget-niveauer", "Prioriteret support"],
    productUrl: "https://ej8jeq-rs.myshopify.com/products/fa-60-ai-genererede-billeder-vores-bedste-tilbud",
    popular: false,
  },
];

export default function HomePage() {
  const { user, creditsRemaining, isAdmin, subscriptionStatus, refreshCredits } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);

  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const initialRoomType = (urlParams.get("roomType") as RoomType) || "";
  const initialStyle = (urlParams.get("style") as DesignStyle) || "";
  const initialBudget = urlParams.get("budget") ? parseInt(urlParams.get("budget")!, 10) : 25000;

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [roomType, setRoomType] = useState<RoomType | "">(initialRoomType);
  const [style, setStyle] = useState<DesignStyle | "">(initialStyle);
  const [budget, setBudget] = useState<number>(initialBudget);
  const [tier, setTier] = useState<BudgetTier>(initialBudget >= 40000 ? "luxury" : initialBudget >= 15000 ? "standard" : "budget");
  const [activeDesign, setActiveDesign] = useState<Design | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [pollingDesignId, setPollingDesignId] = useState<number | null>(null);
  const [showValueModal, setShowValueModal] = useState(false);
  const [popupBudget, setPopupBudget] = useState<number>(initialBudget);
  const [includePlants, setIncludePlants] = useState(true);

  const { data: designs = [] } = useQuery<Design[]>({
    queryKey: ["/api/designs", "my"],
    queryFn: async () => {
      if (!user) return [];
      const token = await user.getIdToken();
      const res = await fetch("/api/designs/my", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user,
  });

  const job = useTransformationJob(pollingDesignId);

  useEffect(() => {
    if (job.status === "completed" && job.resultUrl && activeDesign) {
      setActiveDesign({ ...activeDesign, status: "completed", resultImageUrl: job.resultUrl });
      queryClient.invalidateQueries({ queryKey: ["/api/designs", "my"] });
    }
    if (job.status === "failed" && activeDesign) {
      setActiveDesign({ ...activeDesign, status: "failed" });
      queryClient.invalidateQueries({ queryKey: ["/api/designs", "my"] });
      console.error("[Generering fejlede]", { designId: activeDesign.id, error: job.error });
      toast({
        title: "Generering mislykkedes",
        description: job.error || "Prøv igen med et andet billede eller stil.",
        variant: "destructive",
      });
    }
  }, [job.status, job.resultUrl, job.error]);

  const generateMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const headers: Record<string, string> = {};
      if (user) {
        try {
          const token = await user.getIdToken();
          headers["Authorization"] = `Bearer ${token}`;
        } catch {}
      }
      const res = await fetch("/api/designs", {
        method: "POST",
        body: formData,
        headers,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        if (res.status === 403 && data?.creditsRemaining === 0) {
          throw new Error("NO_CREDITS");
        }
        if (res.status === 401) {
          throw new Error("NOT_LOGGED_IN");
        }
        throw new Error(data?.message || "Failed to generate design");
      }
      return res.json() as Promise<Design>;
    },
    onSuccess: (design) => {
      queryClient.invalidateQueries({ queryKey: ["/api/designs", "my"] });
      setActiveDesign(design);
      setPollingDesignId(design.id);
      refreshCredits();
    },
    onError: (error: Error) => {
      if (error.message === "NO_CREDITS") {
        toast({
          title: "Ingen billeder tilbage",
          description: "Du har brugt alle dine billeder. Køb flere for at fortsætte.",
          variant: "destructive",
        });
        return;
      }
      if (error.message === "NOT_LOGGED_IN") {
        toast({
          title: "Log ind først",
          description: "Du skal logge ind eller oprette en konto for at generere designs.",
          variant: "destructive",
        });
        return;
      }
      if (error.message.includes("abonnement") || error.message.includes("subscription")) {
        setShowSubscriptionModal(true);
        return;
      }
      let title = "Fejl";
      let description = error.message;
      if (error.message.includes("API nøgle") || error.message.includes("api_key")) {
        title = "Konfigurationsfejl";
        description = "API nøgle ikke konfigureret. Kontakt support.";
      } else if (error.message.includes("AI generering")) {
        title = "AI fejl";
        description = "AI generering midlertidigt utilgængelig. Prøv igen senere.";
      }
      console.error("[Design fejl]", error.message);
      toast({ title, description, variant: "destructive" });
    },
  });

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Forkert filtype", description: "Upload venligst et billede (JPG, PNG, WebP).", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Billedet er for stort", description: "Billedet er for stort. Maks 5 MB.", variant: "destructive" });
      return;
    }
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setStep(2);
    setActiveDesign(null);
    setPollingDesignId(null);
    job.reset();
  }, [toast, job]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setStep(2);
    setActiveDesign(null);
    setPollingDesignId(null);
    job.reset();
  }, [job]);

  const handleOpenValueModal = () => {
    if (!selectedFile || !roomType || !style) return;
    setPopupBudget(budget);
    setShowValueModal(true);
  };

  const handleConfirmValue = () => {
    setBudget(popupBudget);
    setTier(popupBudget >= 40000 ? "luxury" : popupBudget >= 15000 ? "standard" : "budget");
    handleGenerateWithBudget(popupBudget);
  };

  const handleGenerateWithBudget = (finalBudget: number) => {
    if (!selectedFile || !roomType || !style) return;
    setShowValueModal(false);
    const formData = new FormData();
    formData.append("image", selectedFile);
    formData.append("roomType", roomType);
    formData.append("style", style);
    formData.append("budget", finalBudget.toString());
    formData.append("includePlants", includePlants.toString());
    generateMutation.mutate(formData);
    setStep(3);
  };

  const handleGenerate = () => {
    if (!selectedFile || !roomType || !style) return;
    setShowValueModal(false);
    const formData = new FormData();
    formData.append("image", selectedFile);
    formData.append("roomType", roomType);
    formData.append("style", style);
    formData.append("budget", budget.toString());
    formData.append("includePlants", includePlants.toString());
    generateMutation.mutate(formData);
    setStep(3);
  };

  const handleReset = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setRoomType("");
    setStyle("");
    setBudget(25000);
    setTier("standard");
    setActiveDesign(null);
    setPollingDesignId(null);
    job.reset();
    setStep(1);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleBudgetChange = (newBudget: number, newTier: BudgetTier) => {
    setBudget(newBudget);
    setTier(newTier);
  };

  const isGenerating = generateMutation.isPending || job.status === "pending" || job.status === "processing";

  const activeTierConfig = style && tier ? styleVocabulary[style]?.[tier] : null;

  const stepLabels = ["Upload billede", "Vælg stil & budget", "Resultat"];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/90 backdrop-blur-lg">
        <div className="mx-auto max-w-5xl flex items-center justify-between px-6 h-16">
          <Link href="/">
            <span className="flex items-center gap-2.5 cursor-pointer" data-testid="link-home">
              <span className="text-lg font-semibold tracking-tight">Forma Estates</span>
            </span>
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/pris">
              <span className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden sm:inline cursor-pointer" data-testid="link-pricing">Pris</span>
            </Link>
            <a href="/#om-os" className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden sm:inline" data-testid="link-about">Om os</a>
            {user && (
              <Link href="/mine-designs">
                <span className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden sm:inline cursor-pointer" data-testid="link-my-designs">Mine designs</span>
              </Link>
            )}
            <Link href={user ? "/min-konto" : "/login"}>
              <span className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1 cursor-pointer" data-testid="link-account">
                <User className="w-3.5 h-3.5" />
                {user ? "Min konto" : "Log ind"}
              </span>
            </Link>
            {isAdmin && (
              <span className="text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded bg-red-600 text-white" data-testid="badge-admin">ADMIN</span>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6">
        {step > 1 && (
          <div className="flex items-center justify-center gap-0 py-6 mb-2">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center">
                <div className="flex items-center gap-2.5">
                  <div className={`flex items-center justify-center w-7 h-7 rounded-full text-[11px] font-medium transition-all duration-300 ${
                    step > s
                      ? "bg-foreground text-background"
                      : step === s
                      ? "bg-foreground text-background"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {step > s ? <Check className="w-3 h-3" /> : s}
                  </div>
                  <span className={`text-xs hidden sm:inline transition-colors duration-300 ${
                    step >= s ? "text-foreground font-medium" : "text-muted-foreground"
                  }`}>
                    {stepLabels[s - 1]}
                  </span>
                </div>
                {s < 3 && (
                  <div className={`w-10 sm:w-16 h-px mx-2.5 transition-colors duration-300 ${
                    step > s ? "bg-foreground" : "bg-border"
                  }`} />
                )}
              </div>
            ))}
          </div>
        )}

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div key="step1" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.3, ease: "easeOut" }}>
              <div className="max-w-xl mx-auto pt-16 sm:pt-24 pb-16">
                <div className="text-center mb-14">
                  <h1 className="text-4xl sm:text-[3.25rem] font-semibold tracking-tight mb-5 leading-[1.1]">
                    Se dit nye rum på under 60 sekunder med AI
                  </h1>
                  <p className="text-muted-foreground text-[15px] leading-relaxed max-w-sm mx-auto mb-3">
                    Upload et billede af dit rum og få et realistisk redesign med møbler, belysning og indretning – tilpasset din stil og dit budget.
                  </p>
                  <div className="flex flex-col items-center gap-1.5 mt-1">
                    <span className="flex items-center gap-2 text-[13px] font-semibold text-foreground/75">
                      <span className="text-emerald-500">✓</span>
                      Få tilbud på møblerne fra dit design
                    </span>
                    <span className="flex items-center gap-2 text-[13px] text-muted-foreground/70">
                      <span className="text-emerald-500">✓</span>
                      Overvejer du renovering? Vi guider dig til de rette håndværkere
                    </span>
                  </div>
                </div>

                <div
                  className="relative cursor-pointer group"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                  data-testid="upload-area"
                >
                  <div className="rounded-2xl border border-border/70 bg-card/40 transition-all duration-300 group-hover:border-foreground/20 group-hover:bg-card/70 group-hover:shadow-lg">
                    <div className="flex flex-col items-center justify-center py-16 sm:py-20 px-8 text-center">
                      <div className="w-12 h-12 rounded-xl bg-foreground/[0.04] flex items-center justify-center mb-6 group-hover:bg-foreground/[0.07] transition-colors">
                        <Upload className="w-5 h-5 text-foreground/50" />
                      </div>
                      <p className="text-[15px] font-medium mb-1">Upload dit rum</p>
                      <p className="text-sm text-muted-foreground">
                        Træk og slip eller klik for at vælge et billede
                      </p>
                      <p className="text-xs text-muted-foreground/60 mt-4">JPG, PNG eller WebP. Maks 5 MB.</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-8 mt-14 text-muted-foreground/50">
                  <div className="flex items-center gap-6">
                    {[
                      { num: "1", label: "Upload foto" },
                      { num: "2", label: "Vælg stil" },
                      { num: "3", label: "Se resultat" },
                    ].map((item, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full border border-current flex items-center justify-center text-[10px]">{item.num}</span>
                        <span className="text-xs hidden sm:inline">{item.label}</span>
                        {i < 2 && <ArrowRight className="w-3 h-3 ml-1 hidden sm:block" />}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileSelect}
                className="hidden"
                data-testid="input-file"
              />
            </motion.div>
          )}

          {step === 2 && previewUrl && (
            <motion.div key="step2" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.3, ease: "easeOut" }}>
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pb-16">
                <div className="lg:col-span-5">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-xs tracking-widest uppercase text-muted-foreground font-medium">Dit billede</p>
                    <Button variant="ghost" size="sm" onClick={handleReset} className="text-xs h-7 px-2 text-muted-foreground" data-testid="button-change-image">
                      <X className="w-3.5 h-3.5 mr-1" /> Skift
                    </Button>
                  </div>
                  <div className="rounded-xl overflow-hidden border border-border/60 bg-muted/30 flex items-center justify-center">
                    <img
                      src={previewUrl}
                      alt="Uploaded room"
                      className="w-full h-auto max-h-[420px] object-contain block"
                      data-testid="img-preview"
                    />
                  </div>
                </div>

                <div className="lg:col-span-7 space-y-8">
                  <div>
                    <p className="text-xs tracking-widest uppercase text-muted-foreground font-medium mb-4">Rumtype</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {roomTypes.map((rt) => {
                        const IconComp = roomTypeIcons[rt] || Home;
                        const isSelected = roomType === rt;
                        return (
                          <button
                            key={rt}
                            onClick={() => setRoomType(rt)}
                            className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-sm text-left transition-all duration-200 border ${
                              isSelected
                                ? "border-foreground bg-foreground text-background"
                                : "border-border/60 bg-transparent text-foreground/70 hover:border-foreground/30 hover:text-foreground"
                            }`}
                            data-testid={`button-roomtype-${rt.replace(/\s+/g, "-")}`}
                          >
                            <IconComp className="w-4 h-4 flex-shrink-0 opacity-70" />
                            <span className="truncate font-medium text-[13px]">{roomTypeLabels[rt]}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <Separator className="bg-border/40" />

                  <div>
                    <p className="text-xs tracking-widest uppercase text-muted-foreground font-medium mb-4">Stil</p>
                    <div className="grid grid-cols-2 gap-2">
                      {designStyles.map((s) => {
                        const isSelected = style === s;
                        const isFree = (freeStyles as readonly string[]).includes(s);
                        const hasAccess = isFree || isAdmin || subscriptionStatus === "active";
                        const isLocked = !hasAccess;
                        return (
                          <button
                            key={s}
                            onClick={() => {
                              if (isLocked) {
                                setShowSubscriptionModal(true);
                              } else {
                                setStyle(s);
                              }
                            }}
                            className={`relative flex flex-col px-3.5 py-3 rounded-lg text-left transition-all duration-200 border ${
                              isLocked
                                ? "border-border/40 bg-muted/30 cursor-not-allowed"
                                : isSelected
                                  ? "border-foreground bg-foreground text-background"
                                  : "border-border/60 bg-transparent hover:border-foreground/30"
                            }`}
                            data-testid={`button-style-${s}`}
                          >
                            <div className="flex items-center justify-between w-full">
                              <span className={`text-sm font-medium ${isLocked ? "text-muted-foreground" : isSelected ? "" : "text-foreground"}`}>{styleLabels[s]}</span>
                              {isLocked && <Lock className="w-3.5 h-3.5 text-muted-foreground/60" />}
                              {isFree && !isSelected && <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">GRATIS</span>}
                            </div>
                            <span className={`text-xs mt-0.5 ${isLocked ? "text-muted-foreground/50" : isSelected ? "text-background/70" : "text-muted-foreground"}`}>{styleDescriptions[s]}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {style && (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
                      <Separator className="bg-border/40" />
                      <div className="pt-6">
                        <BudgetSlider style={style as DesignStyle} onChange={handleBudgetChange} />
                      </div>
                    </motion.div>
                  )}

                  <div className="flex items-center justify-between py-3 px-4 rounded-lg border border-border/60 bg-card/40">
                    <div className="flex items-center gap-2.5">
                      <span className="text-lg">🌿</span>
                      <div>
                        <p className="text-sm font-medium leading-tight">Inkluder planter</p>
                        <p className="text-xs text-muted-foreground">Tilføjer grønne planter til redesignet</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setIncludePlants(v => !v)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none ${includePlants ? "bg-foreground" : "bg-muted"}`}
                      data-testid="toggle-include-plants"
                      aria-pressed={includePlants}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${includePlants ? "translate-x-6" : "translate-x-1"}`}
                      />
                    </button>
                  </div>

                  {user && creditsRemaining !== null && (
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-2" data-testid="text-credits-info">
                      <span>{isAdmin ? "∞ billeder (admin)" : `${creditsRemaining} ${creditsRemaining === 1 ? "billede" : "billeder"} tilbage`}</span>
                      {!isAdmin && creditsRemaining === 0 && (
                        <Link href="/pris">
                          <span className="text-foreground underline cursor-pointer font-medium" data-testid="link-buy-more">Køb flere</span>
                        </Link>
                      )}
                    </div>
                  )}

                  <Button
                    className="w-full h-12 text-sm font-medium tracking-wide"
                    size="lg"
                    disabled={!roomType || !style || generateMutation.isPending || (!isAdmin && user !== null && creditsRemaining === 0)}
                    onClick={handleOpenValueModal}
                    data-testid="button-generate"
                  >
                    {generateMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <TrendingUp className="w-4 h-4 mr-2" />
                    )}
                    {!isAdmin && user && creditsRemaining === 0 ? "Køb billeder for at generere" : "Se dit rums potentiale →"}
                  </Button>
                </div>
              </div>
            </motion.div>
          )}

          {step === 3 && activeDesign && (
            <motion.div key="step3" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.3, ease: "easeOut" }}>
              <div className="pb-16">
                <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight">
                      {roomTypeLabels[activeDesign.roomType as RoomType] || activeDesign.roomType}
                      <span className="text-muted-foreground font-normal mx-2">/</span>
                      <span className="text-muted-foreground font-normal">
                        {styleLabels[activeDesign.style as DesignStyle] || activeDesign.style}
                      </span>
                    </h2>
                    {activeDesign.budget && activeDesign.tier && (
                      <p className="text-sm text-muted-foreground mt-0.5" data-testid="text-budget-info">
                        {formatDKK(activeDesign.budget)} · {getTierLabel(activeDesign.tier as BudgetTier)}
                      </p>
                    )}
                  </div>
                  <Button variant="outline" size="sm" onClick={handleReset} className="h-9" data-testid="button-new-design">
                    <RotateCcw className="w-3.5 h-3.5 mr-2" /> Nyt design
                  </Button>
                </div>

                {isGenerating ? (
                  <div className="border border-border/60 rounded-xl flex flex-col items-center justify-center py-28 bg-card/30">
                    <div className="relative mb-8">
                      <div className="w-14 h-14 rounded-full border-[3px] border-muted border-t-foreground animate-spin" />
                    </div>

                    {job.elapsed > 180 ? (
                      <>
                        <h3 className="text-base font-medium mb-1 text-destructive" data-testid="text-generating">Generering fejlede</h3>
                        <p className="text-sm text-muted-foreground mb-8 text-center max-w-xs">
                          Noget gik galt. Prøv igen med et andet billede.
                        </p>
                      </>
                    ) : job.elapsed > 90 ? (
                      <>
                        <h3 className="text-base font-medium mb-1" data-testid="text-generating">Tager lidt længere tid end normalt...</h3>
                        <p className="text-sm text-muted-foreground mb-8 text-center max-w-xs">
                          AI'en arbejder stadig. Hold siden åben.
                        </p>
                      </>
                    ) : (
                      <>
                        <h3 className="text-base font-medium mb-1" data-testid="text-generating">AI designer dit rum...</h3>
                        <p className="text-sm text-muted-foreground mb-8">
                          Dette tager normalt 30–90 sekunder
                        </p>
                      </>
                    )}

                    <div className="flex flex-col items-center gap-2 mb-8">
                      <p className="text-sm font-medium tabular-nums" data-testid="text-status-message">
                        {job.statusMessage || "Starter generering..."}
                      </p>
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-foreground/60 animate-bounce [animation-delay:0ms]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-foreground/60 animate-bounce [animation-delay:150ms]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-foreground/60 animate-bounce [animation-delay:300ms]" />
                      </div>
                      {job.elapsed > 0 && (
                        <p className="text-xs text-muted-foreground tabular-nums" data-testid="text-elapsed">
                          {job.elapsed} sek
                        </p>
                      )}
                    </div>

                    <Button variant="ghost" size="sm" onClick={handleReset} className="text-xs text-muted-foreground" data-testid="button-cancel">
                      Annuller
                    </Button>
                  </div>
                ) : activeDesign.status === "completed" && activeDesign.resultImageUrl ? (
                  <div className="space-y-6">
                    <BeforeAfterSlider
                      beforeSrc={activeDesign.originalImageUrl}
                      afterSrc={activeDesign.resultImageUrl}
                    />

                    <ProductMatches designId={activeDesign.id} />

                    <FurnitureDetector imageUrl={activeDesign.resultImageUrl!} autoRun designStyle={activeDesign.style ?? undefined} />

                    <ShopThisStyle
                      style={activeDesign.style || "scandinavian"}
                      roomType={ROOM_TYPE_TO_SEARCH[activeDesign.roomType] || "living_room"}
                      budget={activeDesign.tier === "luxury" ? "luxury" : activeDesign.tier === "budget" ? "budget" : "standard"}
                    />

                    {activeDesign.budget && activeDesign.roomType && (() => {
                      const { min, max, roi } = calcValueRange(activeDesign.budget, activeDesign.roomType as RoomType);
                      const reasons = styleValueReasons[activeDesign.style as DesignStyle] ?? ["Øger rummets appel", "Moderniserer indretningen", "Skaber bedre helhedsindtryk"];
                      return (
                        <div className="border border-emerald-200 dark:border-emerald-800/50 rounded-xl p-5 bg-emerald-50/40 dark:bg-emerald-950/20" data-testid="result-value-report">
                          <div className="flex items-center gap-2 mb-4">
                            <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                            <p className="text-xs tracking-widest uppercase text-emerald-700 dark:text-emerald-400 font-medium">Potentiel værdistigning</p>
                          </div>
                          <div className="grid grid-cols-2 gap-3 mb-4">
                            <div className="rounded-lg bg-white/70 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/40 p-3">
                              <p className="text-[10px] tracking-wider uppercase text-emerald-600/70 dark:text-emerald-500/70 mb-1">Stigning</p>
                              <p className="text-base font-semibold tabular-nums text-emerald-700 dark:text-emerald-300" data-testid="text-result-value-range">{formatDKK(min)} – {formatDKK(max)}</p>
                            </div>
                            <div className="rounded-lg bg-white/70 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/40 p-3">
                              <p className="text-[10px] tracking-wider uppercase text-emerald-600/70 dark:text-emerald-500/70 mb-1">ROI</p>
                              <p className="text-base font-semibold tabular-nums text-emerald-700 dark:text-emerald-300" data-testid="text-result-roi">{roi}%</p>
                            </div>
                          </div>
                          <ul className="space-y-1.5">
                            {reasons.map((r, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm text-emerald-800/80 dark:text-emerald-300/80">
                                <BadgeCheck className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-500" />
                                <span>{r}</span>
                              </li>
                            ))}
                          </ul>
                          <p className="text-[10px] text-emerald-600/50 dark:text-emerald-600/40 mt-3 leading-relaxed">
                            *Baseret på danske mæglerrapporter 2023–2024.
                          </p>
                        </div>
                      );
                    })()}

                    {activeTierConfig && (
                      <div className="border border-border/60 rounded-xl p-5 bg-card/30" data-testid="result-tier-info">
                        <p className="text-xs tracking-widest uppercase text-muted-foreground font-medium mb-3">Anbefaling til dit budget</p>
                        <p className="text-sm text-foreground/80 mb-4 leading-relaxed">{activeTierConfig.description}</p>
                        <div className="flex flex-wrap gap-2">
                          {activeTierConfig.exampleRetailers.map((r) => (
                            <span key={r} className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-foreground/5 text-foreground/70 border border-border/40" data-testid={`badge-result-retailer-${r}`}>
                              {r}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                  </div>
                ) : activeDesign.status === "failed" ? (
                  <div className="border border-border/60 rounded-xl flex flex-col items-center justify-center py-20 bg-card/30">
                    <div className="w-12 h-12 rounded-full bg-destructive/8 flex items-center justify-center mb-5">
                      <X className="w-5 h-5 text-destructive" />
                    </div>
                    <h3 className="text-base font-medium mb-1.5">Noget gik galt</h3>
                    <p className="text-sm text-muted-foreground mb-1.5">
                      {job.error || "Prøv igen med et nyt billede."}
                    </p>
                    <p className="text-xs text-muted-foreground/70 mb-6">
                      Tip: Prøv et billede med bedre belysning eller vælg en anden stil
                    </p>
                    <Button onClick={handleReset} size="sm" data-testid="button-try-again">Prøv igen</Button>
                  </div>
                ) : null}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {designs.filter((d) => d.status === "completed").length > 0 && (
          <section className="pb-16">
            <Separator className="mb-12 bg-border/40" />
            <p className="text-xs tracking-widest uppercase text-muted-foreground font-medium mb-6">Tidligere designs</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {designs.filter((d) => d.status === "completed").map((d) => (
                <DesignCard
                  key={d.id}
                  design={d}
                  onView={() => {
                    setActiveDesign(d);
                    setPreviewUrl(d.originalImageUrl);
                    setRoomType(d.roomType as RoomType);
                    setStyle(d.style as DesignStyle);
                    if (d.budget) setBudget(d.budget);
                    if (d.tier) setTier(d.tier as BudgetTier);
                    setStep(3);
                    setPollingDesignId(null);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                />
              ))}
            </div>
          </section>
        )}
      </main>

      <Dialog open={showValueModal} onOpenChange={setShowValueModal}>
        <DialogContent className="sm:max-w-[480px] p-0 overflow-hidden" data-testid="modal-value">
          <div className="p-6 pb-4 border-b border-border/40">
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold tracking-tight flex items-center gap-2">
                <span className="text-xl">💰</span> Dit rums potentiale
              </DialogTitle>
            </DialogHeader>
            {roomType && style && (
              <p className="text-sm text-muted-foreground mt-1.5">
                Baseret på dit <span className="font-medium text-foreground">{roomTypeLabels[roomType as RoomType]}</span> i <span className="font-medium text-foreground">{styleLabels[style as DesignStyle]}</span> stil
              </p>
            )}
          </div>

          <div className="p-6 space-y-6">
            <div className="space-y-3">
              <div className="flex items-baseline justify-between">
                <p className="text-xs tracking-widest uppercase text-muted-foreground font-medium">📊 Investering</p>
                <p className="text-lg font-semibold tabular-nums" data-testid="text-popup-budget">{formatDKK(popupBudget)}</p>
              </div>
              <Slider
                min={5000}
                max={100000}
                step={1000}
                value={[popupBudget]}
                onValueChange={([v]) => setPopupBudget(v)}
                className="w-full"
                data-testid="slider-popup-budget"
              />
              <div className="flex justify-between text-[11px] text-muted-foreground/60">
                <span>5.000 kr</span>
                <span>100.000 kr</span>
              </div>
            </div>

            {(() => {
              const { min, max, roi } = calcValueRange(popupBudget, roomType);
              return (
                <div className="rounded-xl border border-border/60 bg-card/40 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground flex items-center gap-1.5"><span>📈</span> Potentiel værdistigning</span>
                    <span className="text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400" data-testid="text-popup-value-range">
                      {formatDKK(min)} – {formatDKK(max)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground flex items-center gap-1.5"><span>✅</span> ROI</span>
                    <span className="text-sm font-semibold tabular-nums" data-testid="text-popup-roi">{roi}%</span>
                  </div>
                </div>
              );
            })()}

            <p className="text-[11px] text-muted-foreground/60 leading-relaxed">
              *Baseret på danske mæglerrapporter 2023–2024. Værdistigning afhænger af område, kvalitet og tidspunkt for salg.
            </p>

            <div className="flex flex-col gap-2.5 pt-1">
              <Button
                className="w-full h-11 text-sm font-medium"
                onClick={handleConfirmValue}
                disabled={generateMutation.isPending}
                data-testid="button-popup-generate"
              >
                {generateMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                Se dit nye rum
              </Button>
              <Button
                variant="ghost"
                className="w-full h-9 text-sm text-muted-foreground"
                onClick={() => setShowValueModal(false)}
                data-testid="button-popup-back"
              >
                Ændr valg
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showSubscriptionModal} onOpenChange={setShowSubscriptionModal}>
        <DialogContent className="sm:max-w-[600px] p-0 overflow-hidden" data-testid="modal-subscription">
          <div className="p-6 pb-2">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold tracking-tight" data-testid="text-modal-title">Lås op for alle stilarter</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground mt-2" data-testid="text-modal-subtitle">
              Skandinavisk og Moderne er gratis. Køb en pakke for at bruge alle 8 stilarter.
            </p>
          </div>

          <div className="px-6 pb-6 space-y-3">
            {subscriptionPackages.map((pkg) => {
              const Icon = pkg.icon;
              return (
                <div
                  key={pkg.key}
                  className={`relative flex items-center justify-between rounded-xl border p-4 transition-all ${
                    pkg.popular
                      ? "border-foreground bg-foreground/[0.03] shadow-sm"
                      : "border-border/60 hover:border-border"
                  }`}
                  data-testid={`card-modal-package-${pkg.key}`}
                >
                  {pkg.popular && (
                    <div className="absolute -top-2.5 left-4">
                      <Badge className="bg-foreground text-background text-[10px] px-2 py-0.5" data-testid="badge-modal-popular">Mest populær</Badge>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                      pkg.popular ? "bg-foreground text-background" : "bg-muted"
                    }`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-semibold" data-testid={`text-modal-name-${pkg.key}`}>{pkg.name}</span>
                        <span className="text-xs text-muted-foreground">{pkg.images} billeder</span>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                        {pkg.features.map((f) => (
                          <span key={f} className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <Check className="w-3 h-3 text-emerald-500" />
                            {f}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-4">
                    <div className="text-right">
                      <span className="text-lg font-bold" data-testid={`text-modal-price-${pkg.key}`}>{pkg.price}</span>
                      <span className="text-xs text-muted-foreground ml-0.5">kr</span>
                    </div>
                    <Button
                      size="sm"
                      variant={pkg.popular ? "default" : "outline"}
                      className="h-8 px-4 text-xs font-medium rounded-full"
                      onClick={() => {
                        if (!user) {
                          window.location.href = "/login?redirect=/design";
                          return;
                        }
                        window.open(pkg.productUrl, "_blank", "noopener,noreferrer");
                        setShowSubscriptionModal(false);
                      }}
                      data-testid={`button-modal-buy-${pkg.key}`}
                    >
                      Vælg
                      <ArrowRight className="w-3 h-3 ml-1" />
                    </Button>
                  </div>
                </div>
              );
            })}

            <div className="text-center pt-2">
              <Link href="/pris">
                <span className="text-xs text-muted-foreground hover:text-foreground underline cursor-pointer" data-testid="link-modal-pricing">
                  Se alle detaljer på prissiden
                </span>
              </Link>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
