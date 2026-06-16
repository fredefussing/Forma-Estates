import { useState, useRef } from "react";
import { Box, Download, Loader2, RotateCcw, AlertCircle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

function buildInteractiveHtml(imageBase64: string, depthBase64: string, imageMime: string): string {
  return `<!DOCTYPE html>
<html lang="da">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Forma Estates · 3D Plantegning</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0F1D2F; overflow: hidden; font-family: system-ui, sans-serif; }
  canvas { display: block; width: 100vw !important; height: 100vh !important; }
  #hint {
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
    background: rgba(15,29,47,0.85); color: rgba(255,255,255,0.75);
    padding: 8px 18px; border-radius: 999px; font-size: 13px;
    letter-spacing: 0.02em; pointer-events: none;
    border: 1px solid rgba(200,149,108,0.3);
    transition: opacity 0.6s ease;
  }
  #hint.hide { opacity: 0; }
  #logo {
    position: fixed; top: 18px; left: 22px;
    color: rgba(255,255,255,0.45); font-size: 12px; font-weight: 600;
    letter-spacing: 0.12em; text-transform: uppercase; pointer-events: none;
  }
  #loading {
    position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
    background: #0F1D2F; color: rgba(255,255,255,0.6); font-size: 14px; flex-direction: column; gap: 12px;
  }
  .spinner {
    width: 32px; height: 32px; border: 2px solid rgba(200,149,108,0.3);
    border-top-color: #C8956C; border-radius: 50%; animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
</head>
<body>
<div id="loading"><div class="spinner"></div>Indlæser 3D…</div>
<div id="logo">Forma Estates</div>
<div id="hint">Klik og træk for at rotere · Scroll for at zoome</div>
<script type="module">
import * as THREE from 'https://esm.sh/three@0.166.1';
import { OrbitControls } from 'https://esm.sh/three@0.166.1/examples/jsm/controls/OrbitControls.js';

const IMAGE_B64 = '${imageBase64}';
const DEPTH_B64 = '${depthBase64}';
const IMAGE_MIME = '${imageMime}';

function b64ToDataUrl(b64, mime) { return 'data:' + mime + ';base64,' + b64; }

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0F1D2F);

const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.01, 100);
camera.position.set(0, 2.6, 1.5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

// Diorama-opsætning: planet lægges fladt og kameraet kigger ned ovenfra.
// Polar-vinklen begrænses, så man aldrig kan rotere ned til den flade "ark"-
// kant, hvor displacement-teknikken bryder sammen — kun den pæne 3D-skråvinkel.
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 1.3;
controls.maxDistance = 4.5;
controls.minPolarAngle = 0.0;
controls.maxPolarAngle = 0.95;
controls.enablePan = false;
controls.target.set(0, 0, 0);
controls.autoRotate = true;
controls.autoRotateSpeed = 0.5;

controls.addEventListener('start', () => { controls.autoRotate = false; hideHint(); });

const ambient = new THREE.AmbientLight(0xffffff, 1.0);
scene.add(ambient);
const key = new THREE.DirectionalLight(0xfff5ee, 0.85);
key.position.set(2, 5, 2);
scene.add(key);
const fill = new THREE.DirectionalLight(0xd0e8ff, 0.35);
fill.position.set(-2, 3, -1);
scene.add(fill);

const manager = new THREE.LoadingManager();
const loader = new THREE.TextureLoader(manager);
const imgTex = loader.load(b64ToDataUrl(IMAGE_B64, IMAGE_MIME));
const depthTex = loader.load(b64ToDataUrl(DEPTH_B64, 'image/png'));
imgTex.colorSpace = THREE.SRGBColorSpace;
imgTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

// Byg geometrien først når billedet er hentet, så vi kender det rigtige
// størrelsesforhold og undgår at strække plantegningen.
manager.onLoad = () => {
  const iw = imgTex.image.width || 4;
  const ih = imgTex.image.height || 3;
  const aspect = iw / ih;
  const planeH = 2.4;
  const planeW = planeH * aspect;
  // Klamp segment-antallet, så et ekstremt portræt-format ikke sprænger
  // vertex-budgettet på svage GPU'er.
  const segX = Math.min(480, Math.round(360 * Math.max(1, aspect)));
  const segY = Math.min(480, Math.max(1, Math.round(segX / aspect)));
  const geo = new THREE.PlaneGeometry(planeW, planeH, segX, segY);
  const mat = new THREE.MeshStandardMaterial({
    map: imgTex,
    displacementMap: depthTex,
    displacementScale: 0.16,
    displacementBias: -0.04,
    roughness: 0.9,
    metalness: 0.0,
  });
  const plane = new THREE.Mesh(geo, mat);
  plane.rotation.x = -Math.PI / 2;
  scene.add(plane);
  document.getElementById('loading').style.display = 'none';
};

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

let hintHidden = false;
function hideHint() {
  if (hintHidden) return;
  hintHidden = true;
  document.getElementById('hint').classList.add('hide');
}
setTimeout(hideHint, 5000);

(function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
})();
</script>
</body>
</html>`;
}

type ViewerStatus = "idle" | "loading" | "ready" | "error";

export function Floorplan3DViewer({ resultUrl }: { resultUrl: string }) {
  const { user } = useAuth();
  const [status, setStatus] = useState<ViewerStatus>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const htmlRef = useRef<string | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  async function generate() {
    setStatus("loading");
    setErrorMsg(null);
    try {
      const token = await user?.getIdToken();
      const res = await fetch("/api/bolig/depth-map", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ imageUrl: resultUrl }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message || "Depth-generering fejlede");
      }
      const { depthBase64, imageBase64 } = await res.json();
      const mime = resultUrl.toLowerCase().includes(".png") ? "image/png" : "image/jpeg";
      const html = buildInteractiveHtml(imageBase64, depthBase64, mime);
      htmlRef.current = html;
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = URL.createObjectURL(new Blob([html], { type: "text/html" }));
      setStatus("ready");
    } catch (err: any) {
      setErrorMsg(err.message ?? "Ukendt fejl");
      setStatus("error");
    }
  }

  function download() {
    if (!htmlRef.current) return;
    const blob = new Blob([htmlRef.current], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "forma-3d-plantegning.html";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  return (
    <div
      className="rounded-2xl border overflow-hidden"
      style={{ borderColor: "#E8E4DE", background: "#FAF7F2" }}
      data-testid="floorplan-3d-viewer"
    >
      <div className="px-4 py-3 flex items-center justify-between border-b" style={{ borderColor: "#E8E4DE" }}>
        <div className="flex items-center gap-2">
          <Box className="w-4 h-4" style={{ color: "#C8956C" }} />
          <span className="text-sm font-semibold" style={{ color: "#0F1D2F" }}>
            Interaktiv 3D-visning
          </span>
          <span
            className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full"
            style={{ background: "#F0EDE7", color: "#C8956C" }}
          >
            Ny
          </span>
        </div>
        {status === "ready" && (
          <button
            onClick={download}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80"
            style={{ background: "#0F1D2F", color: "white" }}
            data-testid="button-download-3d-html"
          >
            <Download className="w-3.5 h-3.5" />
            Download HTML
          </button>
        )}
      </div>

      <div className="p-4">
        {status === "idle" && (
          <div className="flex flex-col items-center text-center py-6 gap-4">
            <p className="text-sm max-w-xs" style={{ color: "#6B6B6B" }}>
              Lad AI beregne dybde i billedet og skab en interaktiv 3D-oplevelse — kunden kan selv klikke og rotere plantegningen.
            </p>
            <button
              onClick={generate}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-opacity hover:opacity-85"
              style={{ background: "#C8956C", color: "white" }}
              data-testid="button-generate-3d-viewer"
            >
              <Box className="w-4 h-4" />
              Generer interaktiv 3D
            </button>
          </div>
        )}

        {status === "loading" && (
          <div className="flex flex-col items-center text-center py-8 gap-3">
            <Loader2 className="w-7 h-7 animate-spin" style={{ color: "#C8956C" }} />
            <p className="text-sm" style={{ color: "#6B6B6B" }}>
              Beregner dybde og bygger 3D-scene… (kan tage 30–60 sek)
            </p>
          </div>
        )}

        {status === "error" && (
          <div className="flex flex-col items-center text-center py-6 gap-3">
            <AlertCircle className="w-6 h-6" style={{ color: "#B91C1C" }} />
            <p className="text-sm" style={{ color: "#B91C1C" }}>{errorMsg}</p>
            <button
              onClick={generate}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold border transition-colors hover:bg-[#F0EDE7]"
              style={{ borderColor: "#E8E4DE", color: "#0F1D2F" }}
              data-testid="button-retry-3d-viewer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Prøv igen
            </button>
          </div>
        )}

        {status === "ready" && blobUrlRef.current && (
          <div className="flex flex-col gap-3">
            <div
              className="rounded-xl overflow-hidden border"
              style={{ borderColor: "#E8E4DE", aspectRatio: "16/9" }}
            >
              <iframe
                src={blobUrlRef.current}
                className="w-full h-full border-0"
                title="Interaktiv 3D plantegning"
                data-testid="iframe-3d-viewer"
                allow="accelerometer"
              />
            </div>
            <p className="text-xs text-center" style={{ color: "#9B9690" }}>
              Klik og træk for at rotere · Scroll for at zoome · Starter med automatisk rotation
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
