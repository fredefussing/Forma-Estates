import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Boxes, Loader2, RotateCcw, AlertCircle, Palette, Maximize2, X, ChevronDown, Home, Check } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";

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

function buildModelViewerHtml(modelUrl: string): string {
  const swatchesJson = JSON.stringify(SWATCHES);
  return `<!DOCTYPE html>
<html lang="da">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Forma Estates · 3D Plantegning</title>
<script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/3.5.0/model-viewer.min.js"></script>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0F1D2F; overflow: hidden; font-family: system-ui, sans-serif; }
  model-viewer {
    width: 100vw; height: 100vh; background: #0F1D2F;
    --progress-bar-color: #C8956C;
    --progress-mask: transparent;
  }
  #logo {
    position: fixed; top: 16px; left: 20px;
    color: rgba(255,255,255,0.4); font-size: 11px; font-weight: 600;
    letter-spacing: 0.12em; text-transform: uppercase; pointer-events: none;
  }
  #hint {
    position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
    background: rgba(15,29,47,0.85); color: rgba(255,255,255,0.7);
    padding: 7px 16px; border-radius: 999px; font-size: 12px;
    pointer-events: none; border: 1px solid rgba(200,149,108,0.3);
    white-space: nowrap; transition: opacity 0.5s ease;
  }
  #hint.hide { opacity: 0; }
  #color-panel {
    position: fixed; top: 12px; right: 12px;
    background: rgba(15,29,47,0.88); border: 1px solid rgba(200,149,108,0.3);
    border-radius: 14px; padding: 10px 12px;
    display: flex; flex-direction: column; gap: 8px;
    backdrop-filter: blur(8px);
  }
  #color-panel-label {
    color: rgba(200,149,108,0.9); font-size: 10px; font-weight: 700;
    letter-spacing: 0.12em; text-transform: uppercase;
  }
  #swatches {
    display: grid; grid-template-columns: repeat(4, 24px); gap: 5px;
  }
  .swatch {
    width: 24px; height: 24px; border-radius: 50%; cursor: pointer;
    border: 2px solid transparent;
    transition: transform 0.15s ease, border-color 0.15s ease;
    box-shadow: 0 1px 4px rgba(0,0,0,0.4);
  }
  .swatch:hover { transform: scale(1.18); }
  .swatch.active { border-color: #C8956C; transform: scale(1.18); }
  #active-name {
    color: rgba(255,255,255,0.55); font-size: 10px; text-align: center; min-height: 12px;
  }
</style>
</head>
<body>
<div id="logo">Forma Estates</div>
<model-viewer
  id="mv"
  src="${modelUrl}"
  camera-controls
  auto-rotate
  auto-rotate-delay="1500"
  rotation-per-second="20deg"
  environment-image="neutral"
  shadow-intensity="1.5"
  shadow-softness="1"
  exposure="1"
  alt="3D Plantegning">
</model-viewer>
<div id="color-panel">
  <div id="color-panel-label">Farver</div>
  <div id="swatches"></div>
  <div id="active-name">Original</div>
</div>
<div id="hint">Klik og træk for at rotere &middot; Scroll for at zoome</div>
<script>
  const SWATCHES = ${swatchesJson};
  const mv = document.getElementById('mv');
  const swatchesEl = document.getElementById('swatches');
  const activeName = document.getElementById('active-name');
  let materialsReady = false;
  let pendingApply = null;
  SWATCHES.forEach((s, i) => {
    const el = document.createElement('div');
    el.className = 'swatch' + (i === 0 ? ' active' : '');
    el.style.background = s.hex;
    el.title = s.label;
    el.addEventListener('click', () => {
      document.querySelectorAll('.swatch').forEach(x => x.classList.remove('active'));
      el.classList.add('active');
      activeName.textContent = s.label;
      applyColor(s.r, s.g, s.b);
    });
    swatchesEl.appendChild(el);
  });
  function applyColor(r, g, b) {
    if (!materialsReady) { pendingApply = [r, g, b]; return; }
    try {
      mv.model.materials.forEach(mat => {
        mat.pbrMetallicRoughness.setBaseColorFactor([r, g, b, 1.0]);
      });
    } catch(e) { console.warn('Color apply failed:', e); }
  }
  mv.addEventListener('load', () => {
    materialsReady = true;
    if (pendingApply) { applyColor(pendingApply[0], pendingApply[1], pendingApply[2]); pendingApply = null; }
  });
  const hint = document.getElementById('hint');
  mv.addEventListener('camera-change', () => {
    clearTimeout(window._ht);
    hint.classList.remove('hide');
    window._ht = setTimeout(() => hint.classList.add('hide'), 2500);
  });
  setTimeout(() => hint.classList.add('hide'), 4500);
</script>
</body>
</html>`;
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
  const blobUrlRef = useRef<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const taskIdRef = useRef<string | null>(null);
  const saveDdRef = useRef<HTMLDivElement>(null);
  const activeCases = cases.filter(c => c.status !== "sold");

  useEffect(() => {
    return () => {
      stopPolling();
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, []);

  useEffect(() => {
    if (!showSaveDrop) return;
    const onDown = (e: MouseEvent) => {
      if (saveDdRef.current && !saveDdRef.current.contains(e.target as Node)) setShowSaveDrop(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [showSaveDrop]);

  // Close fullscreen on Escape
  useEffect(() => {
    if (!showFullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShowFullscreen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showFullscreen]);

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  async function generate() {
    setStatus("submitting");
    setErrorMsg(null);
    setProgress(0);
    setModelUrl(null);
    setRenderedImageUrl(null);
    setTripoSaveCaseId(null);
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
            const html = buildModelViewerHtml(d.modelUrl);
            if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
            blobUrlRef.current = URL.createObjectURL(new Blob([html], { type: "text/html" }));
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
      const r = await fetch(`/api/bolig/cases/${caseId}/images`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          imageUrl: renderedImageUrl || resultUrl,
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

  function reset() {
    stopPolling();
    if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null; }
    taskIdRef.current = null;
    setStatus("idle");
    setProgress(0);
    setErrorMsg(null);
    setModelUrl(null);
    setRenderedImageUrl(null);
    setTripoSaveCaseId(null);
    setShowSaveDrop(false);
  }

  if (status === "idle") {
    return (
      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "#E8E4DE", background: "#FAF7F2" }}>
        {/* Header */}
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

          {/* Steps */}
          <div className="mt-4 flex items-center gap-2 text-xs">
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
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9B9690" strokeWidth="2" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/><path d="M22 4L12 14.01l-3-3"/></svg>
              <span style={{ color: "#9B9690", fontWeight: 500 }}>Rotér & udforsk</span>
            </div>
          </div>

          {/* CTA + time */}
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

        {/* Eksempel */}
        <div style={{ borderTop: "1px solid #E8E4DE" }}>
          <div className="px-4 py-2 flex items-center gap-2">
            <span className="text-[10px] font-bold tracking-wider uppercase" style={{ color: "#9B9690" }}>Eksempel på resultat</span>
          </div>
          <div className="relative mx-4 mb-4 rounded-xl overflow-hidden" style={{ height: 180 }}>
            <img
              src="/bolig-images/example-3d-floorplan.png"
              alt="Eksempel på 3D plantegning der omdannes til interaktiv model"
              className="w-full h-full object-cover"
            />
            {/* Overlay badges */}
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
            {/* Bottom caption */}
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

  // ── Ready state ─────────────────────────────────────────────────────────────
  return (
    <>
      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "#E8E4DE" }}>
        <div className="relative">
          <iframe
            src={blobUrlRef.current!}
            title="Interaktiv 3D plantegning"
            className="w-full block"
            style={{ height: 480, border: "none" }}
            sandbox="allow-scripts allow-same-origin"
            data-testid="iframe-tripo3d-viewer"
          />
          {/* Fullscreen button overlay */}
          <button
            onClick={() => setShowFullscreen(true)}
            className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-90"
            style={{ background: "rgba(15,29,47,0.75)", color: "rgba(255,255,255,0.85)", backdropFilter: "blur(4px)" }}
            data-testid="button-tripo3d-fullscreen"
            title="Åbn i fuld skærm"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            Fuld skærm
          </button>
        </div>

        <div className="p-3 bg-[#F8F6F3] flex items-center justify-between gap-2" style={{ borderTop: "1px solid #E8E4DE" }}>
          <span className="flex items-center gap-1.5 text-xs" style={{ color: "#6B6B6B" }}>
            <Palette className="w-3 h-3" style={{ color: "#C8956C" }} />
            Rotér · zoom · skift farve
          </span>

          <div className="flex items-center gap-2">
            {/* Save to case */}
            {activeCases.length > 0 && (
              <div className="relative" ref={saveDdRef}>
                <button
                  onClick={() => setShowSaveDrop(v => !v)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all hover:opacity-80"
                  style={{ borderColor: tripoSaveCaseId ? "#C8956C" : "#D9D5CF", color: tripoSaveCaseId ? "#C8956C" : "#1A1A1A", background: "#fff" }}
                  data-testid="button-tripo3d-save"
                >
                  {tripoSaveCaseId ? <Check className="w-3 h-3" /> : <Home className="w-3 h-3" />}
                  {tripoSaveCaseId ? "Gemt" : "Gem"}
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

            {/* Reset */}
            <button onClick={reset} className="flex items-center gap-1 text-xs transition-opacity hover:opacity-70" style={{ color: "#9B9690" }} data-testid="button-tripo3d-reset">
              <RotateCcw className="w-3 h-3" /> Genstart
            </button>
          </div>
        </div>
      </div>

      {/* ── Fullscreen overlay ─────────────────────────────────────────────── */}
      {showFullscreen && createPortal(
        <div
          className="fixed inset-0 flex flex-col"
          style={{ zIndex: 9999, background: "#0F1D2F" }}
          data-testid="modal-tripo3d-fullscreen"
        >
          {/* Header bar */}
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
          {/* Full-size iframe */}
          <iframe
            src={blobUrlRef.current!}
            title="Interaktiv 3D plantegning — fuld skærm"
            className="flex-1 w-full"
            style={{ border: "none" }}
            sandbox="allow-scripts allow-same-origin"
          />
        </div>,
        document.body
      )}
    </>
  );
}
