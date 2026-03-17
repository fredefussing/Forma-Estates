import { useState, useRef, useCallback } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { BeforeAfterSlider } from "@/components/before-after-slider";
import { apiRequest } from "@/lib/queryClient";
import { User, Upload, Sparkles, X, RotateCcw, Download, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const EXAMPLE_PROMPTS = [
  "Mørkt moderne køkken med vinkøleskab og marmorbordplade",
  "Lyst og luftigt soveværelse med planter og naturlige materialer",
  "Industrial stue med rå mursten og lædersofa",
  "Skandinavisk badeværelse med trædetaljer og minimalistisk design",
  "Boheme stue med farverige tekstiler, hængelamper og grønne planter",
];

type GenerationStatus = "idle" | "uploading" | "processing" | "completed" | "failed";

export default function AIDesignAgentPage() {
  const { user, loading, creditsRemaining } = useAuth();
  const { toast } = useToast();

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState<GenerationStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [designId, setDesignId] = useState<number | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollAttemptsRef = useRef(0);

  const handleFileChange = (f: File) => {
    if (!f.type.startsWith("image/")) {
      toast({ title: "Kun billeder", description: "Upload venligst et billedfil (JPG, PNG, WEBP)", variant: "destructive" });
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      toast({ title: "Filen er for stor", description: "Max 10 MB", variant: "destructive" });
      return;
    }
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setStatus("idle");
    setResultUrl(null);
    setErrorMsg(null);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFileChange(dropped);
  }, []);

  const handleReset = () => {
    if (pollRef.current) clearTimeout(pollRef.current);
    setFile(null);
    setPreviewUrl(null);
    setPrompt("");
    setStatus("idle");
    setProgress(0);
    setResultUrl(null);
    setErrorMsg(null);
    setDesignId(null);
    setOriginalUrl(null);
    pollAttemptsRef.current = 0;
  };

  const pollStatus = useCallback(async (id: number) => {
    pollAttemptsRef.current++;
    if (pollAttemptsRef.current > 40) {
      setStatus("failed");
      setErrorMsg("Generering tog for lang tid. Prøv igen.");
      return;
    }
    setProgress(Math.min(90, pollAttemptsRef.current * 2.5));

    try {
      const data = await apiRequest("GET", `/api/agent-designs/${id}/status`).then(r => r.json());
      if (data.status === "completed" && data.resultUrl) {
        setStatus("completed");
        setResultUrl(data.resultUrl);
        setProgress(100);
      } else if (data.status === "failed") {
        setStatus("failed");
        setErrorMsg("AI generering mislykkedes. Prøv igen med et andet billede eller beskrivelse.");
      } else {
        pollRef.current = setTimeout(() => pollStatus(id), 3000);
      }
    } catch {
      pollRef.current = setTimeout(() => pollStatus(id), 5000);
    }
  }, []);

  const handleGenerate = async () => {
    if (!file || !prompt.trim()) return;
    if (!user) {
      toast({ title: "Log ind", description: "Du skal logge ind for at generere designs", variant: "destructive" });
      return;
    }

    if (pollRef.current) clearTimeout(pollRef.current);
    pollAttemptsRef.current = 0;
    setStatus("uploading");
    setProgress(5);
    setResultUrl(null);
    setErrorMsg(null);
    setOriginalUrl(previewUrl);

    try {
      let token = "";
      if (user?.getIdToken) {
        token = await user.getIdToken();
      }

      const formData = new FormData();
      formData.append("image", file);
      formData.append("prompt", prompt.trim());

      const response = await fetch("/api/agent-designs", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.requiresCredits) {
          toast({ title: "Ikke nok billeder", description: "Køb en pakke for at fortsætte", variant: "destructive" });
        } else {
          toast({ title: "Fejl", description: data.error || "Noget gik galt", variant: "destructive" });
        }
        setStatus("idle");
        return;
      }

      setDesignId(data.id);
      setStatus("processing");
      setProgress(10);
      pollRef.current = setTimeout(() => pollStatus(data.id), 4000);
    } catch (err: any) {
      setStatus("failed");
      setErrorMsg(err.message || "Noget gik galt");
    }
  };

  const handleDownload = async () => {
    if (!resultUrl) return;
    try {
      const r = await fetch(resultUrl);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "nordic-ai-design.jpg";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      window.open(resultUrl, "_blank");
    }
  };

  const isGenerating = status === "uploading" || status === "processing";
  const canGenerate = !!file && !!prompt.trim() && !isGenerating;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/90 backdrop-blur-lg">
        <div className="mx-auto max-w-5xl flex items-center justify-between px-6 h-16">
          <Link href="/">
            <span className="text-lg font-semibold tracking-tight cursor-pointer" data-testid="link-home">Nordic Homebuild</span>
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/pris">
              <span className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden sm:inline cursor-pointer" data-testid="link-pricing">Pris</span>
            </Link>
            <Link href={user ? "/min-konto" : "/login"}>
              <span className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1 cursor-pointer" data-testid="link-account">
                <User className="w-3.5 h-3.5" />
                {user ? "Min konto" : "Log ind"}
              </span>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: "easeOut" }}>
          <div className="mb-10">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-foreground/5 border border-border/50 text-xs font-medium text-muted-foreground mb-4">
              <Sparkles className="w-3.5 h-3.5" />
              AI Design Agent
            </div>
            <h1 className="text-3xl font-semibold tracking-tight mb-2">Beskriv dit drømmerum</h1>
            <p className="text-muted-foreground text-base leading-relaxed">
              Upload et billede af dit rum og skriv præcis hvad du vil have ændret — ingen begrænsninger.
            </p>
          </div>

          <AnimatePresence mode="wait">
            {status === "completed" && resultUrl && originalUrl ? (
              <motion.div key="result" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-medium">Dit AI-genererede design</h2>
                    <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">"{prompt}"</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleReset} className="h-9 gap-1.5" data-testid="button-new-design">
                    <RotateCcw className="w-3.5 h-3.5" /> Nyt design
                  </Button>
                </div>

                <BeforeAfterSlider beforeSrc={originalUrl} afterSrc={resultUrl} />

                <div className="mt-4 flex gap-3">
                  <Button onClick={handleDownload} variant="outline" className="gap-2" data-testid="button-download">
                    <Download className="w-4 h-4" /> Download billede
                  </Button>
                  <Link href="/design">
                    <Button variant="outline" className="gap-2" data-testid="button-try-styled">
                      Prøv med stilvalg
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </Link>
                </div>
              </motion.div>
            ) : isGenerating ? (
              <motion.div key="generating" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
                <div className="border border-border/60 rounded-xl flex flex-col items-center justify-center py-28 bg-card/30">
                  <div className="relative mb-8">
                    <div className="w-14 h-14 rounded-full border-[3px] border-muted border-t-foreground animate-spin" />
                  </div>
                  <h3 className="text-base font-medium mb-1" data-testid="text-generating">AI designer dit rum...</h3>
                  <p className="text-sm text-muted-foreground mb-8">Dette tager normalt 15–45 sekunder</p>
                  <div className="w-56 mb-8">
                    <Progress value={progress} className="h-1.5" data-testid="progress-bar" />
                    <p className="text-xs text-muted-foreground text-center mt-2 tabular-nums">{Math.round(progress)}%</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={handleReset} className="text-xs text-muted-foreground" data-testid="button-cancel">
                    Annuller
                  </Button>
                </div>
              </motion.div>
            ) : (
              <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
                {/* Upload area */}
                {!previewUrl ? (
                  <div
                    className="border-2 border-dashed border-border/60 rounded-xl p-10 flex flex-col items-center justify-center cursor-pointer hover:border-foreground/30 hover:bg-muted/20 transition-all duration-200 mb-6"
                    onClick={() => fileInputRef.current?.click()}
                    onDrop={handleDrop}
                    onDragOver={(e) => e.preventDefault()}
                    data-testid="upload-area"
                  >
                    <div className="w-14 h-14 rounded-2xl bg-foreground/5 border border-border/60 flex items-center justify-center mb-4">
                      <Upload className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium mb-1">Klik for at uploade et billede</p>
                    <p className="text-xs text-muted-foreground">eller træk og slip her · JPG, PNG, WEBP · max 10 MB</p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => { if (e.target.files?.[0]) handleFileChange(e.target.files[0]); }}
                      data-testid="input-file"
                    />
                  </div>
                ) : (
                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs tracking-widest uppercase text-muted-foreground font-medium">Dit billede</p>
                      <Button variant="ghost" size="sm" onClick={() => { setFile(null); setPreviewUrl(null); }} className="text-xs h-7 px-2 text-muted-foreground" data-testid="button-change-image">
                        <X className="w-3.5 h-3.5 mr-1" /> Skift
                      </Button>
                    </div>
                    <div className="rounded-xl overflow-hidden border border-border/60 bg-muted/30 flex items-center justify-center">
                      <img src={previewUrl} alt="Uploaded room" className="w-full h-auto max-h-[360px] object-contain block" data-testid="img-preview" />
                    </div>
                  </div>
                )}

                {/* Prompt field */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs tracking-widest uppercase text-muted-foreground font-medium">
                      Beskriv hvad du vil have
                    </label>
                  </div>
                  <Textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="F.eks. Mørkt moderne køkken med vinkøleskab og marmorbordplade..."
                    className="min-h-[120px] resize-none text-sm leading-relaxed"
                    maxLength={1000}
                    data-testid="input-prompt"
                  />
                  <p className="text-xs text-muted-foreground text-right mt-1.5">{prompt.length}/1000</p>
                </div>

                {/* Example prompts */}
                <div className="mb-8">
                  <p className="text-xs tracking-widest uppercase text-muted-foreground font-medium mb-3">Eksempler</p>
                  <div className="flex flex-wrap gap-2">
                    {EXAMPLE_PROMPTS.map((ex) => (
                      <button
                        key={ex}
                        onClick={() => setPrompt(ex)}
                        className="text-xs px-3 py-1.5 rounded-full border border-border/60 bg-transparent text-foreground/60 hover:border-foreground/30 hover:text-foreground transition-all duration-200"
                        data-testid={`button-example-${ex.slice(0, 20).replace(/\s/g, "-")}`}
                      >
                        {ex}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Error */}
                {status === "failed" && errorMsg && (
                  <div className="mb-5 px-4 py-3 rounded-lg bg-destructive/8 border border-destructive/20 text-sm text-destructive" data-testid="text-error">
                    {errorMsg}
                  </div>
                )}

                {/* Credits info */}
                {user && !loading && (
                  <p className="text-xs text-muted-foreground mb-4" data-testid="text-credits">
                    {creditsRemaining === 999999 ? "∞ billeder (admin)" : `${creditsRemaining} billede${creditsRemaining !== 1 ? "r" : ""} tilbage`}
                  </p>
                )}

                <Button
                  onClick={handleGenerate}
                  disabled={!canGenerate}
                  className="w-full h-12 text-base font-medium gap-2"
                  data-testid="button-generate"
                >
                  <Sparkles className="w-4 h-4" />
                  Generer design
                </Button>

                {!user && !loading && (
                  <p className="text-center text-sm text-muted-foreground mt-4">
                    <Link href="/opret">
                      <span className="text-foreground underline underline-offset-2 cursor-pointer">Opret konto</span>
                    </Link>
                    {" "}eller{" "}
                    <Link href="/login">
                      <span className="text-foreground underline underline-offset-2 cursor-pointer">log ind</span>
                    </Link>
                    {" "}for at generere designs
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </main>
    </div>
  );
}
