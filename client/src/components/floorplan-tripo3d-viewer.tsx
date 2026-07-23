import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Boxes, Loader2, RotateCcw, AlertCircle, Palette, Maximize2, X, ChevronDown, Home, Check, ExternalLink } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": any;
    }
  }
}

type Status = "idle" | "submitting" | "polling" | "ready" | "error";

interface SavableCase {
  id: number;
  address: string;
  status: string;
}

interface ColorSwatch {
  label: string;
  hex: string;
  r: number; g: number; b: number;
}

const SWATCHES: ColorSwatch[] = [
  { label: "Original", hex: "#FFFFFF", r: 1.00, g: 1.00, b: 1.00 },
  { label: "Champagne", hex: "#F5E5CC", r: 0.96, g: 0.90, b: 0.80 },
  { label: "Sand", hex: "#DDD0B0", r: 0.87, g: 0.82, b: 0.69 },
  { label: "Grå", hex: "#C0C0C0", r: 0.75, g: 0.75, b: 0.75 },
  { label: "Blågrå", hex: "#A1B7C7", r: 0.63, g: 0.72, b: 0.78 },
  { label: "Terrakotta", hex: "#D17A5C", r: 0.82, g: 0.48, b: 0.36 },
  { label: "Skovgrøn", hex: "#426B52", r: 0.26, g: 0.42, b: 0.32 },
  { label: "Navy", hex: "#1C2E45", r: 0.11, g: 0.18, b: 0.27 },
];

function ensureModelViewerScript() {
  if (typeof document === "undefined") return;
  if (document.querySelector("script[data-mv-loaded]")) return;
  const s = document.createElement("script");
  s.type = "module";
  s.src = "https://ajax.googleapis.com/ajax/libs/model-viewer/3.5.0/model-viewer.min.js";
  s.setAttribute("data-mv-loaded", "");
  document.head.appendChild(s);
}

function ColorPanel({
  swatchIdx,
  onSelect,
  materialsReady,
}: {
  swatchIdx: number;
  onSelect: (idx: number) => void;
  materialsReady: boolean;
}) {
  return (
    <div
      style={{
        background: "rgba(15,29,47,0.88)",
        border: "1px solid rgba(200,149,108,0.3)",
        borderRadius: 14,
        padding: "10px 12px",
        backdropFilter: "blur(8px)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        minWidth: 120,
      }}
    >
      <span style={{ color: "rgba(200,149,108,0.9)", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>
        Farver
      </span>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 24px)", gap: 5 }}>
        {SWATCHES.map((s, i) => (
          <button
            key={s.hex}
            title={s.label}
            onClick={() => onSelect(i)}
            disabled={!materialsReady}
            style={{
              width: 24, height: 24,
              borderRadius: "50%",
              background: s.hex,
              border: i === swatchIdx ? "2px solid #C8956C" : "2px solid transparent",
              transform: i === swatchIdx ? "scale(1.18)" : "scale(1)",
              transition: "transform 0.15s ease, border-color 0.15s ease",
              boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
              cursor: materialsReady ? "pointer" : "wait",
              padding: 0,
            }}
          />
        ))}
      </div>
      <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 10, textAlign: "center", minHeight: 12 }}>
        {SWATCHES[swatchIdx]?.label ?? ""}
      </span>
    </div>
  );
}

export function FloorplanTripo3DViewer({
  resultUrl,
  cases = [],
}: {
  resultUrl: string;
  cases?: SavableCase[];
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const [renderedImageUrl, setRenderedImageUrl] = useState<string | null>(null);
  const [tripoSaveCaseId, setTripoSaveCaseId] = useState<number | null>(null);
  const [showSaveDrop, setShowSaveDrop] = useState(false);
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [swatchIdx, setSwatchIdx] = useState(0);
  const [materialsReady, setMaterialsReady] = useState(false);
  const [fsMaterialsReady, setFsMaterialsReady] = useState(false);

  const mvRef = useRef<any>(null);
  const mvFsRef = useRef<any>(null);
  const pendingColorRef = useRef<[number, number, number] | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const taskIdRef = useRef<string | null>(null);
  const saveDdRef = useRef<HTMLDivElement>(null);

  const activeCases = cases.filter(c => c.status !== "sold");

  useEffect(() => {
    ensureModelViewerScript();
  }, []);

  useEffect(() => {
    return () => { stopPolling(); };
  }, []);

  useEffect(() => {
    if (!showSaveDrop) return;
    const onDown = (e: MouseEvent) => {
      if (saveDdRef.current && !saveDdRef.current.contains(e.target as Node)) setShowSaveDrop(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [showSaveDrop]);

  useEffect(() => {
    if (!showFullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShowFullscreen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showFullscreen]);

  useEffect(() => {
    if (status !== "ready" || !mvRef.current) return;
    const mv = mvRef.current;
    const onLoad = () => {
      setMaterialsReady(true);
      if (pendingColorRef.current) {
        const [r, g, b] = pendingColorRef.current;
        pendingColorRef.current = null;
        applyColorToMv(mv, r, g, b);
      }
    };
    mv.addEventListener("load", onLoad);
    return () => mv.removeEventListener("load", onLoad);
  }, [status]);

  useEffect(() => {
    if (!showFullscreen || !mvFsRef.current) return;
    const mv = mvFsRef.current;
    const onLoad = () => {
      setFsMaterialsReady(true);
      const s = SWATCHES[swatchIdx];
      if (s) applyColorToMv(mv, s.r, s.g, s.b);
    };
    mv.addEventListener("load", onLoad);
    return () => mv.removeEventListener("load", onLoad);
  }, [showFullscreen, swatchIdx]);

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  function applyColorToMv(mv: any, r: number, g: number, b: number) {
    try {
      if (mv?.model?.materials) {
        mv.model.materials.forEach((mat: any) => {
          mat.pbrMetallicRoughness.setBaseColorFactor([r, g, b, 1.0]);
        });
      }
    } catch (e) {
      console.warn("Color apply failed:", e);
    }
  }

  function selectSwatch(idx: number) {
    setSwatchIdx(idx);
    const s = SWATCHES[idx];
    if (!s) return;
    if (materialsReady && mvRef.current) {
      applyColorToMv(mvRef.current, s.r, s.g, s.b);
    } else {
      pendingColorRef.current = [s.r, s.g, s.b];
    }
    if (fsMaterialsReady && mvFsRef.current) {
      applyColorToMv(mvFsRef.current, s.r, s.g, s.b);
    }
  }

  async function generate() {
    setStatus("submitting");
    setErrorMsg(null);
    setProgress(0);
    setModelUrl(null);
    setRenderedImageUrl(null);
    setTripoSaveCaseId(null);
    setSwatchIdx(0);
    setMaterialsReady(false);
    setFsMaterialsReady(false);
    try {
      const token = await user?.getIdToken();
      const res = await fetch("/api/bolig/tripo3d", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ imageUrl: resultUrl }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as any).message || "Kunne ikke starte 3D generering");
      }
      const { taskId } = await res.json();
      taskIdRef.current = taskId;
      setStatus("polling");

      pollRef.current = setInterval(async () => {
        try {
          const token2 = await user?.getIdToken();
          const pollRes = await fetch(`/api/bolig/tripo3d-status/${taskId}`, {
            headers: token2 ? { Authorization: `Bearer ${token2}` } : {},
          });
          if (!pollRes.ok) throw new Error("Poll fejlede");
          const d = await pollRes.json();
          setProgress(d.progress ?? 0);

          if (d.status === "success" && d.modelUrl) {
            stopPolling();
            setModelUrl(d.modelUrl);
            setRenderedImageUrl(d.renderedImageUrl ?? null);
            setStatus("ready");
          } else if (d.status === "failed" || d.status === "cancelled") {
            stopPolling();
            throw new Error("3D generering mislykkedes — prøv igen");
          }
        } catch (e: any) {
          stopPolling();
          setErrorMsg(e.message || "Generering mislykkedes");
          setStatus("error");
        }
      }, 4000);
    } catch (err: any) {
      setErrorMsg(err.message || "Noget gik galt");
      setStatus("error");
    }
  }

  async function saveToCase(caseId: number) {
    setShowSaveDrop(false);
    setTripoSaveCaseId(caseId);
    try {
      const token = await user?.getIdToken();
      // Localize the preview image so it doesn't expire
      const previewSrc = renderedImageUrl || resultUrl;
      let localPreviewUrl = previewSrc;
      try {
        const localRes = await fetch("/api/bolig/localize-image", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ url: previewSrc }),
        });
        if (localRes.ok) {
          const { localUrl } = await localRes.json();
          if (localUrl) localPreviewUrl = localUrl;
        }
      } catch {
        // fall back to remote url
      }
      const r = await fetch(`/api/bolig/cases/${caseId}/images`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          imageUrl: localPreviewUrl,
          originalImageUrl: modelUrl,
          roomType: "floorplan",
          style: "3d-interactive",
          budgetTier: "tier2",
          promptText: "Interaktiv 3D model genereret af Tripo3D AI",
          isDesignAgent: true,
        }),
      });
      if (!r.ok) {
        setTripoSaveCaseId(null);
        const msg = await r.text().catch(() => "");
        alert(`Kunne ikke gemme til mappen. ${msg}`);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["/api/bolig/cases", caseId, "images"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bolig/cases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bolig/recent-images"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bolig/stats"] });
    } catch {
      setTripoSaveCaseId(null);
      alert("Kunne ikke gemme til mappen. Prøv igen.");
    }
  }

  function openInNewTab() {
    if (!modelUrl) return;
    const html = `<!DOCTYPE html>
<html lang="da">
<head>
  <meta charset="utf-8"/>
  <title>Forma Estates · 3D Plantegning</title>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/3.5.0/model-viewer.min.js"></script>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#0F1D2F;height:100vh;display:flex;flex-direction:column;font-family:system-ui,sans-serif}
    header{background:#0A1520;padding:12px 20px;display:flex;align-items:center;gap:10px;border-bottom:1px solid rgba(200,149,108,0.2)}
    header span{color:rgba(255,255,255,0.8);font-size:13px;font-weight:600;letter-spacing:0.06em}
    model-viewer{flex:1;width:100%;background:#0F1D2F}
    .hint{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(15,29,47,0.82);color:rgba(255,255,255,0.65);padding:7px 16px;border-radius:999px;font-size:12px;border:1px solid rgba(200,149,108,0.25);pointer-events:none}
  </style>
</head>
<body>
  <header><span>FORMA ESTATES · Interaktiv 3D Plantegning</span></header>
  <model-viewer src="${modelUrl}" camera-controls auto-rotate auto-rotate-delay="1500" rotation-per-second="20deg" environment-image="neutral" shadow-intensity="1.5" shadow-softness="1" exposure="1" alt="3D Plantegning"></model-viewer>
  <div class="hint">Klik og træk for at rotere &nbsp;·&nbsp; Scroll for at zoome</div>
</body>
</html>`;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  }

  function reset() {
    stopPolling();
    taskIdRef.current = null;
    pendingColorRef.current = null;
    setStatus("idle");
    setProgress(0);
    setErrorMsg(null);
    setModelUrl(null);
    setRenderedImageUrl(null);
    setTripoSaveCaseId(null);
    setShowSaveDrop(false);
    setSwatchIdx(0);
    setMaterialsReady(false);
    setFsMaterialsReady(false);
  }

  if (status === "idle") {
    return (
      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "#E8E4DE", background: "#FAF7F2" }}>
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: "#F0EDE7" }}>
              <Boxes className="w-5 h-5" style={{ color: "#C8956C" }} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-bold" style={{ color: "#0F1D2F" }}>Byg en 360° rotérbar 3D model</span>
                <span className="text-[9px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded-full" style={{ background: "#F0EDE7", color: "#C8956C" }}>NY</span>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: "#6B6B6B" }}>
                AI'en omdanner dit 3D plantegningsbillede til en model du kan dreje, zoome og udforske frit — og skifte farver på væggene med ét klik.
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2 text-xs flex-wrap">
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg" style={{ background: "#EEF7EE" }}>
              <div className="w-3.5 h-3.5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#22A447" }}>
                <svg width="7" height="7" viewBox="0 0 8 8" fill="none"><path d="M1.5 4l2 2 3-3" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <span style={{ color: "#22A447", fontWeight: 600 }}>3D billede klar</span>
            </div>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#C8C4BE" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg" style={{ background: "#F0EDE7" }}>
              <Boxes className="w-3 h-3 flex-shrink-0" style={{ color: "#C8956C" }} />
              <span style={{ color: "#C8956C", fontWeight: 600 }}>AI bygger 3D model</span>
            </div>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#C8C4BE" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg" style={{ background: "#F5F3EF" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9B9690" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 3"/></svg>
              <span style={{ color: "#9B9690", fontWeight: 500 }}>Rotér & udforsk</span>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={generate}
              className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-opacity hover:opacity-85"
              style={{ background: "#C8956C", color: "white" }}
              data-testid="button-generate-tripo3d"
            >
              <Boxes className="w-4 h-4" />
              Byg interaktiv 3D model
            </button>
            <span className="text-xs" style={{ color: "#9B9690" }}>⏱ ca. 3 minutter</span>
          </div>
        </div>

        <div style={{ borderTop: "1px solid #E8E4DE" }}>
          <div className="px-4 py-2">
            <span className="text-[10px] font-bold tracking-wider uppercase" style={{ color: "#9B9690" }}>Eksempel på resultat</span>
          </div>
          <div className="relative mx-4 mb-4 rounded-xl overflow-hidden" style={{ height: 180 }}>
            <img
              src="/bolig-images/example-3d-floorplan.png"
              alt="Eksempel på 3D plantegning der omdannes til interaktiv model"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 flex items-center justify-center gap-3">
              <div className="px-3 py-1.5 rounded-full text-xs font-bold shadow-lg" style={{ background: "rgba(15,29,47,0.82)", color: "rgba(255,255,255,0.9)" }}>
                3D plantegning
              </div>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(200,149,108,0.9)" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
              <div className="px-3 py-1.5 rounded-full text-xs font-bold shadow-lg flex items-center gap-1.5" style={{ background: "rgba(200,149,108,0.92)", color: "white" }}>
                <Boxes className="w-3 h-3" />
                360° rotérbar model
              </div>
            </div>
            <div className="absolute bottom-0 inset-x-0 px-3 py-2 flex items-center gap-3" style={{ background: "linear-gradient(transparent, rgba(15,29,47,0.75))" }}>
              {SWATCHES.slice(0, 6).map(s => (
                <div key={s.hex} title={s.label} className="w-4 h-4 rounded-full border border-white/40 flex-shrink-0" style={{ background: s.hex }} />
              ))}
              <span className="text-xs" style={{ color: "rgba(255,255,255,0.75)" }}>Skift farve på modellen med ét klik</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (status === "submitting") {
    return (
      <div className="rounded-2xl border p-8 flex flex-col items-center gap-3" style={{ borderColor: "#E8E4DE", background: "#FAF7F2" }}>
        <Loader2 className="w-7 h-7 animate-spin" style={{ color: "#C8956C" }} />
        <p className="text-sm font-medium" style={{ color: "#0F1D2F" }}>Starter 3D generering…</p>
      </div>
    );
  }

  if (status === "polling") {
    return (
      <div className="rounded-2xl border p-8 flex flex-col items-center gap-4" style={{ borderColor: "#E8E4DE", background: "#FAF7F2" }}>
        <Loader2 className="w-7 h-7 animate-spin" style={{ color: "#C8956C" }} />
        <div className="text-center">
          <p className="text-sm font-medium mb-0.5" style={{ color: "#0F1D2F" }}>Bygger 3D model med rigtige vægge…</p>
          <p className="text-xs" style={{ color: "#9B9690" }}>Kan tage 1–3 minutter</p>
        </div>
        <div className="w-full max-w-xs">
          <div className="w-full rounded-full overflow-hidden mb-1.5" style={{ height: 6, background: "#E8E4DE" }}>
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${progress}%`, background: "#C8956C" }} />
          </div>
          <p className="text-xs text-center" style={{ color: "#9B9690" }}>{progress}% færdig</p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="rounded-2xl border p-6 flex flex-col items-center gap-3" style={{ borderColor: "#E8E4DE", background: "#FAF7F2" }}>
        <AlertCircle className="w-5 h-5" style={{ color: "#B91C1C" }} />
        <p className="text-sm text-center" style={{ color: "#B91C1C" }}>{errorMsg}</p>
        <button onClick={reset} className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold transition-opacity hover:opacity-80" style={{ background: "#C8956C", color: "white" }}>
          <RotateCcw className="w-3 h-3" /> Prøv igen
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "#E8E4DE" }}>
        <div className="relative" style={{ height: 480, background: "#0F1D2F" }}>
          <model-viewer
            ref={mvRef}
            src={modelUrl}
            camera-controls
            auto-rotate
            auto-rotate-delay="1500"
            rotation-per-second="20deg"
            environment-image="neutral"
            shadow-intensity="1.5"
            shadow-softness="1"
            exposure="1"
            alt="3D Plantegning"
            style={{ width: "100%", height: "100%", background: "#0F1D2F" }}
            data-testid="model-viewer-tripo3d"
          />

          {/* Color panel */}
          <div style={{ position: "absolute", top: 12, right: 12 }}>
            <ColorPanel swatchIdx={swatchIdx} onSelect={selectSwatch} materialsReady={materialsReady} />
          </div>

          {/* Fullscreen button */}
          <button
            onClick={() => setShowFullscreen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-90"
            style={{ position: "absolute", top: 12, left: 12, background: "rgba(15,29,47,0.75)", color: "rgba(255,255,255,0.85)", backdropFilter: "blur(4px)" }}
            data-testid="button-tripo3d-fullscreen"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            Fuld skærm
          </button>

          {/* Hint */}
          {!materialsReady && (
            <div
              style={{
                position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)",
                background: "rgba(15,29,47,0.85)", color: "rgba(255,255,255,0.6)",
                padding: "6px 14px", borderRadius: 999, fontSize: 11,
                border: "1px solid rgba(200,149,108,0.25)", whiteSpace: "nowrap",
              }}
            >
              <Loader2 className="w-3 h-3 animate-spin inline mr-1.5" />
              Indlæser 3D model…
            </div>
          )}
          {materialsReady && (
            <div
              style={{
                position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)",
                background: "rgba(15,29,47,0.8)", color: "rgba(255,255,255,0.6)",
                padding: "6px 14px", borderRadius: 999, fontSize: 11,
                border: "1px solid rgba(200,149,108,0.25)", whiteSpace: "nowrap",
              }}
            >
              Klik og træk for at rotere · Scroll for at zoome
            </div>
          )}
        </div>

        <div className="p-3 flex items-center justify-between gap-2" style={{ background: "#F8F6F3", borderTop: "1px solid #E8E4DE" }}>
          <span className="flex items-center gap-1.5 text-xs" style={{ color: "#6B6B6B" }}>
            <Palette className="w-3 h-3" style={{ color: "#C8956C" }} />
            Rotér · zoom · skift farve
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={openInNewTab}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all hover:opacity-80"
              style={{ borderColor: "#D9D5CF", color: "#1A1A1A", background: "#fff" }}
              data-testid="button-tripo3d-open-tab"
              title="Åbn 3D model i ny fane"
            >
              <ExternalLink className="w-3 h-3" />
              Åbn i ny fane
            </button>
            {activeCases.length > 0 && (
              <div className="relative" ref={saveDdRef}>
                <button
                  onClick={() => setShowSaveDrop(v => !v)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all hover:opacity-80"
                  style={{ borderColor: tripoSaveCaseId ? "#C8956C" : "#D9D5CF", color: tripoSaveCaseId ? "#C8956C" : "#1A1A1A", background: "#fff" }}
                  data-testid="button-tripo3d-save"
                >
                  {tripoSaveCaseId ? <Check className="w-3 h-3" /> : <Home className="w-3 h-3" />}
                  {tripoSaveCaseId ? "Gemt" : "Gem til mappe"}
                  {!tripoSaveCaseId && <ChevronDown className="w-3 h-3" />}
                </button>
                {showSaveDrop && (
                  <div className="absolute right-0 bottom-full mb-1 w-52 rounded-xl shadow-xl border border-[#E8E4DE] bg-white z-20 py-1">
                    {activeCases.map(c => (
                      <button
                        key={c.id}
                        onClick={() => saveToCase(c.id)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-[#F5F3EF] transition-colors text-left"
                        style={{ color: "#1A1A1A" }}
                        data-testid={`button-tripo3d-save-case-${c.id}`}
                      >
                        <Home className="w-3 h-3 flex-shrink-0" style={{ color: "#9B9690" }} />
                        <span className="truncate">{c.address}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button onClick={reset} className="flex items-center gap-1 text-xs transition-opacity hover:opacity-70" style={{ color: "#9B9690" }} data-testid="button-tripo3d-reset">
              <RotateCcw className="w-3 h-3" /> Genstart
            </button>
          </div>
        </div>
      </div>

      {showFullscreen && createPortal(
        <div
          className="fixed inset-0 flex flex-col"
          style={{ zIndex: 9999, background: "#0F1D2F" }}
          data-testid="modal-tripo3d-fullscreen"
        >
          <div className="flex items-center justify-between px-5 py-3 flex-shrink-0" style={{ background: "#0A1520", borderBottom: "1px solid rgba(200,149,108,0.2)" }}>
            <span className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.8)", letterSpacing: "0.06em" }}>
              FORMA ESTATES · Interaktiv 3D Plantegning
            </span>
            <button
              onClick={() => setShowFullscreen(false)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
              style={{ background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)" }}
              data-testid="button-tripo3d-fullscreen-close"
            >
              <X className="w-3.5 h-3.5" />
              Luk (Esc)
            </button>
          </div>

          <div className="relative flex-1">
            <model-viewer
              ref={mvFsRef}
              src={modelUrl}
              camera-controls
              auto-rotate
              auto-rotate-delay="1500"
              rotation-per-second="20deg"
              environment-image="neutral"
              shadow-intensity="1.5"
              shadow-softness="1"
              exposure="1"
              alt="3D Plantegning — fuld skærm"
              style={{ width: "100%", height: "100%", background: "#0F1D2F" }}
            />
            <div style={{ position: "absolute", top: 12, right: 12 }}>
              <ColorPanel swatchIdx={swatchIdx} onSelect={selectSwatch} materialsReady={fsMaterialsReady} />
            </div>
            {!fsMaterialsReady && (
              <div style={{ position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)", background: "rgba(15,29,47,0.85)", color: "rgba(255,255,255,0.6)", padding: "6px 14px", borderRadius: 999, fontSize: 11, border: "1px solid rgba(200,149,108,0.25)", whiteSpace: "nowrap" }}>
                <Loader2 className="w-3 h-3 animate-spin inline mr-1.5" />
                Indlæser 3D model…
              </div>
            )}
            {fsMaterialsReady && (
              <div style={{ position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)", background: "rgba(15,29,47,0.8)", color: "rgba(255,255,255,0.6)", padding: "6px 14px", borderRadius: 999, fontSize: 11, border: "1px solid rgba(200,149,108,0.25)", whiteSpace: "nowrap" }}>
                Klik og træk for at rotere · Scroll for at zoome
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
