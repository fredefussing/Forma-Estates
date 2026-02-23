import { useState, useCallback, useRef, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useTransformationJob } from "@/hooks/use-transformation-job";
import { Upload, Sparkles, Loader2, RotateCcw, X, ChevronRight, Home, Bed, UtensilsCrossed, Bath, Briefcase, Dumbbell, Baby, Gamepad2, Palmtree, Sofa, ArrowRight, Check } from "lucide-react";
import { roomTypes, designStyles, type RoomType, type DesignStyle, type Design } from "@shared/schema";
import { type BudgetTier } from "@shared/styleVocabulary";
import { getTierLabel, formatDKK } from "@shared/budgetUtils";
import { styleVocabulary } from "@shared/styleVocabulary";
import { BeforeAfterSlider } from "@/components/before-after-slider";
import { DesignCard } from "@/components/design-card";
import { BudgetSlider } from "@/components/budget-slider";
import { SpecialRequest } from "@/components/special-request";
import { QuoteRequest } from "@/components/quote-request";
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
  "badboy": "Badboy",
};

const styleDescriptions: Record<DesignStyle, string> = {
  "scandinavian": "Lyst, minimalistisk og hyggeligt",
  "modern": "Rent, stramme linjer og funktionelt",
  "luxury": "Eksklusivt og sofistikeret",
  "industrial": "Råt, åbent og urbant",
  "coastal": "Afslappet med maritime toner",
  "transitional": "Klassisk møder moderne",
  "farmhouse": "Rustikt og varmt",
  "badboy": "Mørk, maskulin og eksklusiv",
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

  const stepLabels = ["Upload billede", "Vælg stil & budget", "Resultat"];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/90 backdrop-blur-lg">
        <div className="mx-auto max-w-5xl flex items-center justify-between px-6 h-16">
          <a href="/" className="flex items-center gap-2.5" data-testid="link-home">
            <span className="text-lg font-semibold tracking-tight">Nordic Sketch</span>
          </a>
          <div className="flex items-center gap-6">
            <a href="/#om-os" className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden sm:inline" data-testid="link-about">Om os</a>
            <p className="text-xs tracking-widest uppercase text-muted-foreground hidden md:block">AI-drevet interiørdesign</p>
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
                    Transformer dit rum med AI
                  </h1>
                  <p className="text-muted-foreground text-[15px] leading-relaxed max-w-sm mx-auto">
                    Upload et foto af dit rum, vælg rumtype, stil og budget, og se en realistisk redesign på sekunder.
                  </p>
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
                      <p className="text-xs text-muted-foreground/60 mt-4">JPG, PNG eller WebP. Maks 10 MB.</p>
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
                  <div className="rounded-xl overflow-hidden border border-border/60">
                    <img
                      src={previewUrl}
                      alt="Uploaded room"
                      className="w-full object-cover max-h-[420px]"
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
                        return (
                          <button
                            key={s}
                            onClick={() => setStyle(s)}
                            className={`flex flex-col px-3.5 py-3 rounded-lg text-left transition-all duration-200 border ${
                              isSelected
                                ? "border-foreground bg-foreground text-background"
                                : "border-border/60 bg-transparent hover:border-foreground/30"
                            }`}
                            data-testid={`button-style-${s}`}
                          >
                            <span className={`text-sm font-medium ${isSelected ? "" : "text-foreground"}`}>{styleLabels[s]}</span>
                            <span className={`text-xs mt-0.5 ${isSelected ? "text-background/70" : "text-muted-foreground"}`}>{styleDescriptions[s]}</span>
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

                  <Button
                    className="w-full h-12 text-sm font-medium tracking-wide"
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
                    <h3 className="text-base font-medium mb-1" data-testid="text-generating">AI designer dit rum...</h3>
                    <p className="text-sm text-muted-foreground mb-8">
                      Dette tager normalt 15-45 sekunder
                    </p>
                    <div className="w-56 mb-8">
                      <Progress value={job.progress} className="h-1.5" data-testid="progress-bar" />
                      <p className="text-xs text-muted-foreground text-center mt-2 tabular-nums">{Math.round(job.progress)}%</p>
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

                    <QuoteRequest
                      designId={activeDesign.id}
                      generatedImageUrl={activeDesign.resultImageUrl!}
                      roomType={activeDesign.roomType}
                      style={activeDesign.style}
                      budget={activeDesign.budget}
                    />

                    <SpecialRequest
                      designId={activeDesign.id}
                      originalImageUrl={activeDesign.originalImageUrl}
                    />
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
    </div>
  );
}
