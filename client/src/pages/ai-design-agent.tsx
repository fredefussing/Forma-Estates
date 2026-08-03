import { useState, useRef, useCallback, useEffect } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { BeforeAfterSlider } from "@/components/before-after-slider";
import { apiRequest } from "@/lib/queryClient";
import { User, Upload, Sparkles, X, RotateCcw, Download, ArrowRight, Globe, ChevronLeft, Sun, Sunrise, Sunset, Cloud, Moon, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { auth } from "@/lib/firebase";
import { useTranslation } from "react-i18next";

function useWatermarkPreference() {
  const [watermark, setWatermarkState] = useState<boolean>(() =>
    localStorage.getItem("fe-watermark") !== "false"
  );
  const setWatermark = (v: boolean) => {
    localStorage.setItem("fe-watermark", v ? "true" : "false");
    setWatermarkState(v);
    window.dispatchEvent(new CustomEvent("fe-watermark-change", { detail: v }));
  };
  useEffect(() => {
    const handler = (e: Event) => setWatermarkState((e as CustomEvent<boolean>).detail);
    window.addEventListener("fe-watermark-change", handler);
    return () => window.removeEventListener("fe-watermark-change", handler);
  }, []);
  return { watermark, setWatermark };
}

// Satellite time phrases go to the AI model — keep in English
const SATELLITE_TIME_PHRASES = [
  "time of the day is sunrise",
  "time of the day is mid-morning",
  "time of the day is midday",
  "time of the day is early sundown",
  "time of the day is blue hour at dusk",
] as const;

const SATELLITE_PROMPT_BASE =
  `Using image @1 as the exact reference layout, transform this satellite map screenshot into a photorealistic aerial drone photograph of the same location.\n` +
  `Remove all map interface elements completely: text labels, place names, road names, pins, watermarks, icons, and any UI overlay. None should remain.\n` +
  `Preserve the site layout exactly. Every road, building, or area stays in its original position, shape, and scale. Do not invent, move, or remove any structure.\n` +
  `Re-render the scene with photoreal detail and golden-hour lighting: warm low-angle sun, long soft shadows, real material textures on roofs, asphalt, grass, and water, natural depth and atmospheric haze toward the horizon.\n\n` +
  `{TIME}\n\n` +
  `The result should look like a professional drone photograph of this exact place. High resolution, sharp, cinematic.`;

function buildSatellitePrompt(phrase: string) {
  return SATELLITE_PROMPT_BASE.replace("{TIME}", phrase);
}

type GenerationStatus = "idle" | "uploading" | "processing" | "completed" | "failed";

export default function AIDesignAgentPage() {
  const { t } = useTranslation();
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
  const [mode, setMode] = useState<"normal" | "satellite">("normal");
  const [satelliteTimeIdx, setSatelliteTimeIdx] = useState(3);
  const [imageLocked, setImageLocked] = useState(false);
  const [lockedOriginalUrl, setLockedOriginalUrl] = useState<string | null>(null);
  const [freeUsesRemaining, setFreeUsesRemaining] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollAttemptsRef = useRef(0);

  // Translated satellite time labels (phrases stay in English for the AI)
  const satelliteTimes = t("aiAgent.satelliteTimes", { returnObjects: true }) as Array<{ label: string; emoji: string }>;
  const examplePrompts = t("aiAgent.examplePrompts", { returnObjects: true }) as string[];

  const handleFileChange = (f: File) => {
    if (!f.type.startsWith("image/")) {
      toast({ title: t("aiAgent.errors.imageOnly"), description: t("aiAgent.errors.imageOnlyDesc"), variant: "destructive" });
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      toast({ title: t("aiAgent.errors.tooLarge"), description: t("aiAgent.errors.tooLargeDesc"), variant: "destructive" });
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
    setMode("normal");
    setSatelliteTimeIdx(3);
    setImageLocked(false);
    setLockedOriginalUrl(null);
    setFreeUsesRemaining(null);
    pollAttemptsRef.current = 0;
  };

  const handleAdjust = () => {
    if (pollRef.current) clearTimeout(pollRef.current);
    setStatus("idle");
    setResultUrl(null);
    setErrorMsg(null);
    pollAttemptsRef.current = 0;
  };

  const enterSatelliteMode = () => {
    const idx = 3;
    setSatelliteTimeIdx(idx);
    setPrompt(buildSatellitePrompt(SATELLITE_TIME_PHRASES[idx]));
    setMode("satellite");
  };

  const selectSatelliteTime = (idx: number) => {
    setSatelliteTimeIdx(idx);
    setPrompt(buildSatellitePrompt(SATELLITE_TIME_PHRASES[idx]));
  };

  const pollStatus = useCallback(async (id: number) => {
    pollAttemptsRef.current++;
    if (pollAttemptsRef.current > 40) {
      setStatus("failed");
      setErrorMsg(t("aiAgent.errors.timeout"));
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
        setErrorMsg(data.error || t("aiAgent.errors.generationFailed"));
      } else {
        pollRef.current = setTimeout(() => pollStatus(id), 3000);
      }
    } catch {
      pollRef.current = setTimeout(() => pollStatus(id), 5000);
    }
  }, [t]);

  const handleGenerate = async () => {
    if (!file || !prompt.trim()) return;
    if (!user) {
      toast({ title: t("aiAgent.errors.loginRequired"), description: t("aiAgent.errors.loginRequiredDesc"), variant: "destructive" });
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
      if (imageLocked && lockedOriginalUrl) {
        formData.append("existingOriginalUrl", lockedOriginalUrl);
      } else {
        formData.append("image", file);
      }
      formData.append("prompt", prompt.trim());

      const response = await fetch("/api/agent-designs", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.requiresCredits) {
          toast({ title: t("aiAgent.errors.noCredits"), description: t("aiAgent.errors.noCreditsDesc"), variant: "destructive" });
        } else {
          toast({ title: t("aiAgent.errors.error"), description: data.error || t("aiAgent.errors.generic"), variant: "destructive" });
        }
        setStatus("idle");
        return;
      }

      if (!imageLocked && data.originalImageUrl) {
        setImageLocked(true);
        setLockedOriginalUrl(data.originalImageUrl);
      }
      if (typeof data.freeUsesRemaining === "number") {
        setFreeUsesRemaining(data.freeUsesRemaining);
      }

      setDesignId(data.id);
      setStatus("processing");
      setProgress(10);
      pollRef.current = setTimeout(() => pollStatus(data.id), 4000);
    } catch (err: any) {
      setStatus("failed");
      setErrorMsg(err.message || t("aiAgent.errors.generic"));
    }
  };

  const { watermark } = useWatermarkPreference();
  const [showWmConfirm, setShowWmConfirm] = useState(false);

  const doDownload = async () => {
    if (!resultUrl) return;
    try {
      let proxyUrl = resultUrl.startsWith("http")
        ? `/api/proxy-image?url=${encodeURIComponent(resultUrl)}&format=jpg`
        : resultUrl;
      const fetchInit: RequestInit = {};
      if (!watermark && resultUrl.startsWith("http")) {
        proxyUrl += "&plain=1";
        const token = await auth.currentUser?.getIdToken().catch(() => undefined);
        if (token) fetchInit.headers = { Authorization: `Bearer ${token}` };
      }
      const r = await fetch(proxyUrl, fetchInit);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "forma-estates-ai-design.jpg";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      window.open(resultUrl, "_blank");
    }
  };

  const handleDownload = () => {
    if (!watermark) { setShowWmConfirm(true); return; }
    doDownload();
  };

  const isGenerating = status === "uploading" || status === "processing";
  const canGenerate = (!!file || (imageLocked && !!lockedOriginalUrl)) && !!prompt.trim() && !isGenerating;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/90 backdrop-blur-lg">
        <div className="mx-auto max-w-5xl flex items-center justify-between px-6 h-16">
          <Link href="/">
            <span className="text-lg font-semibold tracking-tight cursor-pointer" data-testid="link-home">Forma Estates</span>
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/pris">
              <span className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden sm:inline cursor-pointer" data-testid="link-pricing">{t("aiAgent.nav.pricing")}</span>
            </Link>
            {user && (
              <Link href="/mine-designs">
                <span className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden sm:inline cursor-pointer" data-testid="link-my-designs">{t("aiAgent.nav.myDesigns")}</span>
              </Link>
            )}
            <Link href={user ? "/min-konto" : "/login"}>
              <span className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1 cursor-pointer" data-testid="link-account">
                <User className="w-3.5 h-3.5" />
                {user ? t("aiAgent.nav.myAccount") : t("aiAgent.nav.login")}
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
            <h1 className="text-3xl font-semibold tracking-tight mb-2">{t("aiAgent.hero.title")}</h1>
            <p className="text-muted-foreground text-base leading-relaxed">{t("aiAgent.hero.subtitle")}</p>
          </div>

          <AnimatePresence mode="wait">
            {status === "completed" && resultUrl && originalUrl ? (
              <motion.div key="result" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-medium">{t("aiAgent.result.title")}</h2>
                    <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">"{prompt}"</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {freeUsesRemaining !== null && (
                      <span className="text-xs text-muted-foreground hidden sm:inline">
                        {freeUsesRemaining > 0
                          ? t("aiAgent.result.freeRemaining", { count: freeUsesRemaining })
                          : t("aiAgent.result.freeExhausted")}
                      </span>
                    )}
                    <Button variant="outline" size="sm" onClick={handleAdjust} className="h-9 gap-1.5" data-testid="button-adjust">
                      <Sparkles className="w-3.5 h-3.5" /> {t("aiAgent.result.adjust")}
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleReset} className="h-9 gap-1.5" data-testid="button-new-design">
                      <RotateCcw className="w-3.5 h-3.5" /> {t("aiAgent.result.newImage")}
                    </Button>
                  </div>
                </div>

                <BeforeAfterSlider beforeSrc={originalUrl} afterSrc={resultUrl} />

                {showWmConfirm && (
                  <div className="fixed inset-0 bg-black/40 z-[9999] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-[340px] shadow-2xl">
                      <p className="text-sm font-semibold mb-1">{t("aiAgent.noWatermark.title")}</p>
                      <p className="text-sm text-muted-foreground mb-5 leading-relaxed">{t("aiAgent.noWatermark.body")}</p>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => { setShowWmConfirm(false); doDownload(); }} className="flex-1 h-10 rounded-xl text-sm font-semibold text-white hover:opacity-90" style={{ background: "#0F1D2F" }}>
                          {t("aiAgent.noWatermark.confirm")}
                        </button>
                        <button type="button" onClick={() => setShowWmConfirm(false)} className="flex-1 h-10 rounded-xl text-sm font-semibold border text-foreground hover:bg-slate-50">
                          {t("aiAgent.noWatermark.cancel")}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-4 flex flex-col gap-2">
                  <div className="flex flex-wrap gap-3 items-center">
                    <Button onClick={handleDownload} variant="outline" className="gap-2" data-testid="button-download">
                      <Download className="w-4 h-4" /> {t("aiAgent.result.download")}
                    </Button>
                    <Link href="/design">
                      <Button variant="outline" className="gap-2" data-testid="button-try-styled">
                        {t("aiAgent.result.tryStyled")}
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        const wm = !watermark;
                        localStorage.setItem("fe-watermark", wm ? "true" : "false");
                        window.dispatchEvent(new CustomEvent("fe-watermark-change", { detail: wm }));
                      }}
                      className="inline-flex items-center gap-1.5 text-xs rounded-full px-2.5 py-1 transition-all"
                      style={watermark
                        ? { background: "rgba(15,29,47,0.07)", color: "#4B5563", border: "1px solid rgba(15,29,47,0.13)" }
                        : { background: "rgba(200,149,108,0.12)", color: "#9B6A40", border: "1px solid rgba(200,149,108,0.45)" }
                      }
                    >
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${watermark ? "bg-slate-500" : "bg-[#C8956C]"}`} />
                      {t("aiAgent.watermark.label")} <strong>{watermark ? t("aiAgent.watermark.on") : t("aiAgent.watermark.off")}</strong>
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground" data-testid="text-ai-label-notice">
                    {watermark ? t("aiAgent.result.aiLabelOn") : t("aiAgent.result.aiLabelOff")}
                  </p>
                </div>
              </motion.div>
            ) : isGenerating ? (
              <motion.div key="generating" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
                <div className="border border-border/60 rounded-xl flex flex-col items-center justify-center py-28 bg-card/30">
                  <div className="relative mb-8">
                    <div className="w-14 h-14 rounded-full border-[3px] border-muted border-t-foreground animate-spin" />
                  </div>
                  <h3 className="text-base font-medium mb-1" data-testid="text-generating">{t("aiAgent.generating.title")}</h3>
                  <p className="text-sm text-muted-foreground mb-8">{t("aiAgent.generating.subtitle")}</p>
                  <div className="w-56 mb-8">
                    <Progress value={progress} className="h-1.5" data-testid="progress-bar" />
                    <p className="text-xs text-muted-foreground text-center mt-2 tabular-nums">{Math.round(progress)}%</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={handleReset} className="text-xs text-muted-foreground" data-testid="button-cancel">
                    {t("aiAgent.generating.cancel")}
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
                    <p className="text-sm font-medium mb-1">
                      {mode === "satellite" ? t("aiAgent.upload.satelliteClick") : t("aiAgent.upload.click")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {mode === "satellite" ? t("aiAgent.upload.satelliteNote") : t("aiAgent.upload.dragDrop")}
                    </p>
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
                      <p className="text-xs tracking-widest uppercase text-muted-foreground font-medium">{t("aiAgent.image.label")}</p>
                      {imageLocked ? (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" data-testid="text-image-locked">
                          <Lock className="w-3 h-3" /> {t("aiAgent.image.locked")}
                        </span>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => { setFile(null); setPreviewUrl(null); }} className="text-xs h-7 px-2 text-muted-foreground" data-testid="button-change-image">
                          <X className="w-3.5 h-3.5 mr-1" /> {t("aiAgent.image.change")}
                        </Button>
                      )}
                    </div>
                    <div className="rounded-xl overflow-hidden border border-border/60 bg-muted/30 flex items-center justify-center">
                      <img src={previewUrl} alt="Uploaded room" className="w-full h-auto max-h-[360px] object-contain block" data-testid="img-preview" />
                    </div>
                    {imageLocked && freeUsesRemaining !== null && (
                      <div className="mt-2 flex items-center gap-1.5">
                        <div className="flex gap-0.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <div
                              key={i}
                              className={`h-1 w-5 rounded-full ${i < (5 - freeUsesRemaining) ? "bg-foreground/40" : "bg-foreground/10"}`}
                            />
                          ))}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {freeUsesRemaining > 0
                            ? t("aiAgent.image.freeRemaining", { count: freeUsesRemaining })
                            : t("aiAgent.image.freeUsed")}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Prompt field */}
                {mode === "normal" && (
                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs tracking-widest uppercase text-muted-foreground font-medium">
                        {t("aiAgent.prompt.label")}
                      </label>
                    </div>
                    <Textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder={t("aiAgent.prompt.placeholder")}
                      className="min-h-[120px] resize-none text-sm leading-relaxed"
                      maxLength={1000}
                      data-testid="input-prompt"
                    />
                    <p className="text-xs text-muted-foreground text-right mt-1.5">{prompt.length}/1000</p>
                  </div>
                )}

                {/* Satellite mode */}
                {mode === "satellite" && (
                  <div className="mb-6">
                    <div className="flex items-center gap-2 mb-4">
                      <button
                        type="button"
                        onClick={() => { setMode("normal"); setPrompt(""); }}
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" /> {t("aiAgent.satellite.back")}
                      </button>
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: "rgba(15,29,47,0.07)", color: "#0F1D2F" }}>
                        <Globe className="w-3 h-3" /> {t("aiAgent.satellite.label")}
                      </span>
                    </div>
                    <p className="text-xs tracking-widest uppercase text-muted-foreground font-medium mb-3">{t("aiAgent.satellite.timeOfDay")}</p>
                    <div className="grid grid-cols-1 gap-2">
                      {satelliteTimes.map((st, idx) => (
                        <button
                          key={st.label}
                          type="button"
                          onClick={() => selectSatelliteTime(idx)}
                          className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium transition-all text-left ${
                            satelliteTimeIdx === idx
                              ? "border-foreground/60 bg-foreground/5 text-foreground"
                              : "border-border/50 bg-transparent text-foreground/60 hover:border-foreground/30 hover:text-foreground"
                          }`}
                          data-testid={`button-satellite-time-${idx}`}
                        >
                          <span className="text-base leading-none">{st.emoji}</span>
                          {st.label}
                          {satelliteTimeIdx === idx && (
                            <span className="ml-auto w-1.5 h-1.5 rounded-full bg-foreground" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Prompt library */}
                {mode === "normal" && (
                  <div className="mb-8">
                    <p className="text-xs tracking-widest uppercase text-muted-foreground font-medium mb-3">{t("aiAgent.library.title")}</p>
                    <p className="text-xs text-muted-foreground mb-2">{t("aiAgent.library.note")}</p>
                    <div className="flex flex-wrap gap-2">
                      {examplePrompts.map((ex) => (
                        <button
                          key={ex}
                          onClick={() => setPrompt(ex)}
                          className="text-xs px-3 py-1.5 rounded-full border border-border/60 bg-transparent text-foreground/60 hover:border-foreground/30 hover:text-foreground transition-all duration-200"
                          data-testid={`button-example-${ex.slice(0, 20).replace(/\s/g, "-")}`}
                        >
                          {ex}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={enterSatelliteMode}
                        className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-border/60 bg-transparent text-foreground/60 hover:border-foreground/30 hover:text-foreground transition-all duration-200"
                        data-testid="button-satellite-mode"
                      >
                        <Globe className="w-3 h-3" />
                        {t("aiAgent.library.satellite")}
                      </button>
                    </div>
                  </div>
                )}

                {/* Error */}
                {status === "failed" && errorMsg && (
                  <div className="mb-5 px-4 py-3 rounded-lg bg-destructive/8 border border-destructive/20 text-sm text-destructive" data-testid="text-error">
                    {errorMsg}
                  </div>
                )}

                {/* Credits info */}
                {user && !loading && (
                  <p className="text-xs text-muted-foreground mb-4" data-testid="text-credits">
                    {creditsRemaining === 999999
                      ? t("aiAgent.credits.unlimited")
                      : creditsRemaining === 1
                        ? t("aiAgent.credits.remaining", { count: creditsRemaining })
                        : t("aiAgent.credits.remainingPlural", { count: creditsRemaining })}
                  </p>
                )}

                <Button
                  onClick={handleGenerate}
                  disabled={!canGenerate}
                  className="w-full h-12 text-base font-medium gap-2"
                  data-testid="button-generate"
                >
                  <Sparkles className="w-4 h-4" />
                  {t("aiAgent.generate.button")}
                </Button>

                {!user && !loading && (
                  <p className="text-center text-sm text-muted-foreground mt-4">
                    <Link href="/opret">
                      <span className="text-foreground underline underline-offset-2 cursor-pointer">{t("aiAgent.loginPrompt.createAccount")}</span>
                    </Link>
                    {" "}{t("aiAgent.loginPrompt.or")}{" "}
                    <Link href="/login">
                      <span className="text-foreground underline underline-offset-2 cursor-pointer">{t("aiAgent.loginPrompt.login")}</span>
                    </Link>
                    {" "}{t("aiAgent.loginPrompt.suffix")}
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
