import { useState, useRef, useEffect } from "react";
import { Boxes, Loader2, RotateCcw, AlertCircle, Palette } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

type Status = "idle" | "submitting" | "polling" | "ready" | "error";

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

  /* ── Farve-panel ─────────────────────────────────────── */
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
    display: flex; align-items: center; gap: 5px;
  }
  #swatches {
    display: grid; grid-template-columns: repeat(4, 24px); gap: 5px;
  }
  .swatch {
    width: 24px; height: 24px; border-radius: 50%; cursor: pointer;
    border: 2px solid transparent;
    transition: transform 0.15s ease, border-color 0.15s ease;
    box-shadow: 0 1px 4px rgba(0,0,0,0.4);
    position: relative;
  }
  .swatch:hover { transform: scale(1.18); }
  .swatch.active { border-color: #C8956C; transform: scale(1.18); }
  .swatch[data-label="Original"] { background: white; }
  #active-name {
    color: rgba(255,255,255,0.55); font-size: 10px; text-align: center;
    min-height: 12px; transition: color 0.2s;
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
  <div id="color-panel-label">
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="13.5" cy="6.5" r="0.5" fill="currentColor"/><circle cx="17.5" cy="10.5" r="0.5" fill="currentColor"/><circle cx="8.5" cy="7.5" r="0.5" fill="currentColor"/><circle cx="6.5" cy="12.5" r="0.5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>
    Farver
  </div>
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
  let activeSwatch = null;

  // Build swatch buttons
  SWATCHES.forEach((s, i) => {
    const el = document.createElement('div');
    el.className = 'swatch' + (i === 0 ? ' active' : '');
    el.style.background = s.hex;
    el.title = s.label;
    el.dataset.label = s.label;
    el.addEventListener('click', () => {
      document.querySelectorAll('.swatch').forEach(x => x.classList.remove('active'));
      el.classList.add('active');
      activeName.textContent = s.label;
      applyColor(s.r, s.g, s.b);
    });
    if (i === 0) activeSwatch = el;
    swatchesEl.appendChild(el);
  });

  function applyColor(r, g, b) {
    if (!materialsReady) { pendingApply = [r, g, b]; return; }
    try {
      const materials = mv.model.materials;
      materials.forEach(mat => {
        mat.pbrMetallicRoughness.setBaseColorFactor([r, g, b, 1.0]);
      });
    } catch(e) { console.warn('Color apply failed:', e); }
  }

  mv.addEventListener('load', () => {
    materialsReady = true;
    if (pendingApply) {
      applyColor(pendingApply[0], pendingApply[1], pendingApply[2]);
      pendingApply = null;
    }
  });

  // Hint auto-hide
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

export function FloorplanTripo3DViewer({ resultUrl }: { resultUrl: string }) {
  const { user } = useAuth();
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const taskIdRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      stopPolling();
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, []);

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  async function generate() {
    setStatus("submitting");
    setErrorMsg(null);
    setProgress(0);
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
          const pollRes = await fetch(`/api/bolig/tripo3d-status/${taskId}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          if (!pollRes.ok) throw new Error("Poll fejlede");
          const d = await pollRes.json();
          setProgress(d.progress ?? 0);

          if (d.status === "success" && d.modelUrl) {
            stopPolling();
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

  function reset() {
    stopPolling();
    if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null; }
    taskIdRef.current = null;
    setStatus("idle");
    setProgress(0);
    setErrorMsg(null);
  }

  if (status === "idle") {
    return (
      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "#E8E4DE", background: "#FAF7F2" }}>
        <div className="p-6 flex flex-col items-center text-center gap-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "#F0EDE7" }}>
            <Boxes className="w-6 h-6" style={{ color: "#C8956C" }} />
          </div>
          <div>
            <div className="flex items-center justify-center gap-2 mb-1">
              <span className="text-sm font-semibold" style={{ color: "#0F1D2F" }}>Interaktiv 3D-visning</span>
              <span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full" style={{ background: "#F0EDE7", color: "#C8956C" }}>Ny</span>
            </div>
            <p className="text-sm max-w-xs" style={{ color: "#6B6B6B" }}>
              Gør 3D plantegningen interaktiv — rotér, zoom og udforsk modellen fra alle vinkler. Skift farver med ét klik.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-center">
            {[
              { hex: "#FFFFFF", label: "Hvid" },
              { hex: "#F5E5CC", label: "Champagne" },
              { hex: "#C0C0C0", label: "Grå" },
              { hex: "#A1B7C7", label: "Blågrå" },
              { hex: "#D17A5C", label: "Terrakotta" },
              { hex: "#426B52", label: "Grøn" },
            ].map(s => (
              <div
                key={s.hex}
                title={s.label}
                className="w-5 h-5 rounded-full border-2"
                style={{ background: s.hex, borderColor: "#E8E4DE" }}
              />
            ))}
            <span className="text-xs ml-1" style={{ color: "#9B9690" }}>8 farver inkl.</span>
          </div>
          <button
            onClick={generate}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-opacity hover:opacity-85"
            style={{ background: "#C8956C", color: "white" }}
            data-testid="button-generate-tripo3d"
          >
            <Boxes className="w-4 h-4" />
            Generer interaktiv 3D
          </button>
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
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${progress}%`, background: "#C8956C" }}
            />
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
        <button
          onClick={reset}
          className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold transition-opacity hover:opacity-80"
          style={{ background: "#C8956C", color: "white" }}
        >
          <RotateCcw className="w-3 h-3" /> Prøv igen
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "#E8E4DE" }}>
      <iframe
        src={blobUrlRef.current!}
        title="Interaktiv 3D plantegning"
        className="w-full block"
        style={{ height: 520, border: "none" }}
        sandbox="allow-scripts allow-same-origin"
        data-testid="iframe-tripo3d-viewer"
      />
      <div className="p-3 bg-[#F8F6F3] flex items-center justify-between gap-2 text-xs" style={{ color: "#6B6B6B" }}>
        <span className="flex items-center gap-1.5">
          <Palette className="w-3 h-3" style={{ color: "#C8956C" }} />
          Rotér · zoom · skift farve
        </span>
        <button
          onClick={reset}
          className="flex items-center gap-1 transition-opacity hover:opacity-70"
          style={{ color: "#9B9690" }}
          data-testid="button-tripo3d-reset"
        >
          <RotateCcw className="w-3 h-3" /> Genstart
        </button>
      </div>
    </div>
  );
}
