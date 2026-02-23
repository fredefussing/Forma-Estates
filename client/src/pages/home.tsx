import { useState, useCallback, useRef, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useTransformationJob } from "@/hooks/use-transformation-job";
import { Upload, Sparkles, Loader2, RotateCcw, X, ChevronRight, Home, Bed, UtensilsCrossed, Bath, Briefcase, Dumbbell, Baby, Gamepad2, Palmtree, Sofa } from "lucide-react";
import { roomTypes, designStyles, type RoomType, type DesignStyle, type Design } from "@shared/schema";
import { type BudgetTier } from "@shared/styleVocabulary";
import { getTierLabel, formatDKK } from "@shared/budgetUtils";
import { styleVocabulary } from "@shared/styleVocabulary";
import { BeforeAfterSlider } from "@/components/before-after-slider";
import { DesignCard } from "@/components/design-card";
import { BudgetSlider } from "@/components/budget-slider";
import { motion, AnimatePresence } from "framer-motion";

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
  "transitional": "Overgangs",
  "farmhouse": "Landlig",
  "mid-century": "Midtårhundrede",
};

const styleDescriptions: Record<DesignStyle, string> = {
  "scandinavian": "Lyst, minimalistisk og hyggeligt",
  "modern": "Rent, stramme linjer og funktionelt",
  "luxury": "Eksklusivt og sofistikeret",
  "industrial": "Råt, åbent og urbant",
  "coastal": "Afslappet med maritime toner",
  "transitional": "Klassisk møder moderne",
  "farmhouse": "Rustikt og varmt",
  "mid-century": "Retro elegance fra 50-60'erne",
};

export default function HomePage() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [roomType, setRoomType] = useState<RoomType | "">("");
  const [style, setStyle] = useState<DesignStyle | "">("");
  const [budget, setBudget] = useState<number>(25000);
  const [tier, setTier] = useState<BudgetTier>("standard");
  const [activeDesign, setActiveDesign] = useState<Design | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [pollingDesignId, setPollingDesignId] = useState<number | null>(null);

  const { data: designs = [] } = useQuery<Design[]>({
    queryKey: ["/api/designs"],
  });

  const job = useTransformationJob(pollingDesignId);

  useEffect(() => {
    if (job.status === "completed" && job.resultUrl && activeDesign) {
      setActiveDesign({ ...activeDesign, status: "completed", resultImageUrl: job.resultUrl });
      queryClient.invalidateQueries({ queryKey: ["/api/designs"] });
    }
    if (job.status === "failed" && activeDesign) {
      setActiveDesign({ ...activeDesign, status: "failed" });
      queryClient.invalidateQueries({ queryKey: ["/api/designs"] });
      toast({
        title: "Generering mislykkedes",
        description: job.error || "Prøv igen med et andet billede eller stil.",
        variant: "destructive",
      });
    }
  }, [job.status, job.resultUrl, job.error]);

  const generateMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const res = await fetch("/api/designs", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(err || "Failed to generate design");
      }
      return res.json() as Promise<Design>;
    },
    onSuccess: (design) => {
      queryClient.invalidateQueries({ queryKey: ["/api/designs"] });
      setActiveDesign(design);
      setPollingDesignId(design.id);
    },
    onError: (error: Error) => {
      toast({
        title: "Fejl",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Forkert filtype", description: "Upload venligst et billede (JPG, PNG, WebP).", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "Filen er for stor", description: "Maks 10 MB.", variant: "destructive" });
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

  const handleGenerate = () => {
    if (!selectedFile || !roomType || !style) return;
    const formData = new FormData();
    formData.append("image", selectedFile);
    formData.append("roomType", roomType);
    formData.append("style", style);
    formData.append("budget", budget.toString());
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

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto max-w-6xl flex items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary">
              <Home className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-lg tracking-tight">Hus AI</span>
          </div>
          <p className="text-sm text-muted-foreground hidden sm:block">AI-drevet interiørdesign</p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex items-center gap-2 mb-8">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-medium transition-colors ${step >= s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                {s}
              </div>
              <span className={`text-sm hidden sm:inline ${step >= s ? "text-foreground" : "text-muted-foreground"}`}>
                {s === 1 ? "Upload billede" : s === 2 ? "Vælg stil & budget" : "Resultat"}
              </span>
              {s < 3 && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div key="step1" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.2 }}>
              <div className="text-center mb-8">
                <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">
                  Transformer dit rum med AI
                </h1>
                <p className="text-muted-foreground text-base max-w-lg mx-auto">
                  Upload et foto af dit rum, vælg rumtype, stil og budget, og se en realistisk redesign på sekunder.
                </p>
              </div>
              <Card
                className="max-w-2xl mx-auto cursor-pointer group"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                data-testid="upload-area"
              >
                <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                    <Upload className="w-7 h-7 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold mb-1">Upload dit rum</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Træk og slip eller klik for at vælge et billede
                  </p>
                  <p className="text-xs text-muted-foreground">JPG, PNG eller WebP. Maks 10 MB.</p>
                </div>
              </Card>
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
            <motion.div key="step2" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.2 }}>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-lg font-semibold">Dit billede</h2>
                    <Button variant="ghost" size="sm" onClick={handleReset} data-testid="button-change-image">
                      <X className="w-4 h-4 mr-1" /> Skift
                    </Button>
                  </div>
                  <Card className="overflow-visible">
                    <img
                      src={previewUrl}
                      alt="Uploaded room"
                      className="w-full rounded-md object-cover max-h-[400px]"
                      data-testid="img-preview"
                    />
                  </Card>
                </div>

                <div className="space-y-6">
                  <div>
                    <h2 className="text-lg font-semibold mb-3">Rumtype</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {roomTypes.map((rt) => {
                        const IconComp = roomTypeIcons[rt] || Home;
                        return (
                          <button
                            key={rt}
                            onClick={() => setRoomType(rt)}
                            className={`flex items-center gap-2 px-3 py-2.5 rounded-md text-sm text-left transition-colors border ${
                              roomType === rt
                                ? "border-primary bg-primary/10 text-foreground"
                                : "border-border bg-card text-muted-foreground hover:bg-accent"
                            }`}
                            data-testid={`button-roomtype-${rt.replace(/\s+/g, "-")}`}
                          >
                            <IconComp className="w-4 h-4 flex-shrink-0" />
                            <span className="truncate">{roomTypeLabels[rt]}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <h2 className="text-lg font-semibold mb-3">Stil</h2>
                    <div className="grid grid-cols-2 gap-2">
                      {designStyles.map((s) => (
                        <button
                          key={s}
                          onClick={() => setStyle(s)}
                          className={`flex flex-col px-3 py-2.5 rounded-md text-left transition-colors border ${
                            style === s
                              ? "border-primary bg-primary/10"
                              : "border-border bg-card hover:bg-accent"
                          }`}
                          data-testid={`button-style-${s}`}
                        >
                          <span className="text-sm font-medium">{styleLabels[s]}</span>
                          <span className="text-xs text-muted-foreground mt-0.5">{styleDescriptions[s]}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {style && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} transition={{ duration: 0.2 }}>
                      <BudgetSlider style={style as DesignStyle} onChange={handleBudgetChange} />
                    </motion.div>
                  )}

                  <Button
                    className="w-full"
                    size="lg"
                    disabled={!roomType || !style || generateMutation.isPending}
                    onClick={handleGenerate}
                    data-testid="button-generate"
                  >
                    {generateMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4 mr-2" />
                    )}
                    Generer design
                  </Button>
                </div>
              </div>
            </motion.div>
          )}

          {step === 3 && activeDesign && (
            <motion.div key="step3" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.2 }}>
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">
                      {roomTypeLabels[activeDesign.roomType as RoomType] || activeDesign.roomType}
                      {" "}
                      <span className="text-muted-foreground font-normal">
                        {styleLabels[activeDesign.style as DesignStyle] || activeDesign.style}
                      </span>
                    </h2>
                    {activeDesign.budget && activeDesign.tier && (
                      <p className="text-sm text-muted-foreground" data-testid="text-budget-info">
                        Budget: {formatDKK(activeDesign.budget)} ({getTierLabel(activeDesign.tier as BudgetTier)})
                      </p>
                    )}
                  </div>
                </div>
                <Button variant="outline" onClick={handleReset} data-testid="button-new-design">
                  <RotateCcw className="w-4 h-4 mr-2" /> Nyt design
                </Button>
              </div>

              {isGenerating ? (
                <Card className="flex flex-col items-center justify-center py-24">
                  <div className="relative mb-6">
                    <div className="w-16 h-16 rounded-full border-4 border-muted border-t-primary animate-spin" />
                  </div>
                  <h3 className="text-lg font-semibold mb-1" data-testid="text-generating">AI designer dit rum...</h3>
                  <p className="text-sm text-muted-foreground mb-6">
                    Dette tager normalt 15-45 sekunder
                  </p>
                  <div className="w-64 mb-6">
                    <Progress value={job.progress} className="h-2" data-testid="progress-bar" />
                    <p className="text-xs text-muted-foreground text-center mt-2">{Math.round(job.progress)}%</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={handleReset} data-testid="button-cancel">
                    Annuller
                  </Button>
                </Card>
              ) : activeDesign.status === "completed" && activeDesign.resultImageUrl ? (
                <div className="space-y-6">
                  <BeforeAfterSlider
                    beforeSrc={activeDesign.originalImageUrl}
                    afterSrc={activeDesign.resultImageUrl}
                  />
                  {activeTierConfig && (
                    <Card className="p-4" data-testid="result-tier-info">
                      <h3 className="font-semibold mb-2">Anbefaling til dit budget</h3>
                      <p className="text-sm text-muted-foreground mb-3">{activeTierConfig.description}</p>
                      <div className="flex flex-wrap gap-2">
                        {activeTierConfig.exampleRetailers.map((r) => (
                          <Badge key={r} variant="secondary" data-testid={`badge-result-retailer-${r}`}>
                            {r}
                          </Badge>
                        ))}
                      </div>
                    </Card>
                  )}
                </div>
              ) : activeDesign.status === "failed" ? (
                <Card className="flex flex-col items-center justify-center py-16">
                  <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
                    <X className="w-6 h-6 text-destructive" />
                  </div>
                  <h3 className="text-lg font-semibold mb-1">Noget gik galt</h3>
                  <p className="text-sm text-muted-foreground mb-2">
                    {job.error || "Prøv igen med et nyt billede."}
                  </p>
                  <p className="text-xs text-muted-foreground mb-4">
                    Tip: Prøv et billede med bedre belysning eller vælg en anden stil
                  </p>
                  <Button onClick={handleReset} data-testid="button-try-again">Prøv igen</Button>
                </Card>
              ) : null}
            </motion.div>
          )}
        </AnimatePresence>

        {designs.filter((d) => d.status === "completed").length > 0 && (
          <section className="mt-16">
            <h2 className="text-xl font-semibold mb-4">Tidligere designs</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
    </div>
  );
}
