export interface WallRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Bygger en selvstændig HTML-fil med en Three.js dukkehus-scene: gulvet er
// plantegningen som tekstur, og væggene er ægte lodrette BoxGeometry rejst op
// fra de fundne rektangler. CDN-import af three (esm.sh) holder den uafhængig
// af app-bundlen og gør filen download-bar.
export function buildDollhouseHtml(
  floorBase64: string,
  floorMime: string,
  rects: WallRect[],
  gridW: number,
  gridH: number,
): string {
  const rectsJson = JSON.stringify(rects);
  return `<!DOCTYPE html>
<html lang="da">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Forma Estates · Dollhouse</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #ECEAE5; overflow: hidden; font-family: system-ui, sans-serif; }
  canvas { display: block; }
  #topbar {
    position: fixed; top: 0; left: 0; right: 0; height: 48px;
    display: flex; align-items: center; gap: 14px; padding: 0 16px;
    background: rgba(15,29,47,0.92); z-index: 10;
  }
  #topbar .brand {
    color: rgba(255,255,255,0.5); font-size: 11px; font-weight: 700;
    letter-spacing: 0.14em; text-transform: uppercase; margin-right: auto;
  }
  .tabs { display: flex; background: rgba(255,255,255,0.08); border-radius: 999px; padding: 3px; }
  .tab {
    border: 0; background: transparent; color: rgba(255,255,255,0.7);
    font-size: 13px; font-weight: 600; padding: 5px 16px; border-radius: 999px;
    cursor: pointer; transition: all 0.2s;
  }
  .tab.active { background: #C8956C; color: #fff; }
  .cut { display: flex; align-items: center; gap: 8px; color: rgba(255,255,255,0.65); font-size: 12px; }
  .cut input { accent-color: #C8956C; width: 110px; cursor: pointer; }
  #hint {
    position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
    background: rgba(15,29,47,0.85); color: rgba(255,255,255,0.78);
    padding: 7px 16px; border-radius: 999px; font-size: 12px;
    pointer-events: none; transition: opacity 0.6s ease;
    border: 1px solid rgba(200,149,108,0.3);
  }
  #hint.hide { opacity: 0; }
  #loading {
    position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
    background: #ECEAE5; color: #6B6B6B; font-size: 14px; flex-direction: column; gap: 12px; z-index: 5;
  }
  .spinner {
    width: 30px; height: 30px; border: 2px solid rgba(200,149,108,0.3);
    border-top-color: #C8956C; border-radius: 50%; animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
</head>
<body>
<div id="loading"><div class="spinner"></div>Bygger dukkehus…</div>
<div id="topbar">
  <span class="brand">Forma Estates</span>
  <div class="tabs">
    <button class="tab active" id="tab3d">3D</button>
    <button class="tab" id="tab2d">2D</button>
  </div>
  <label class="cut">Skær vægge<input id="cut" type="range" min="0" max="100" value="100"></label>
</div>
<div id="hint">Klik og træk for at rotere · Scroll for at zoome</div>
<script type="module">
import * as THREE from 'https://esm.sh/three@0.166.1';
import { OrbitControls } from 'https://esm.sh/three@0.166.1/examples/jsm/controls/OrbitControls.js';
import { mergeGeometries } from 'https://esm.sh/three@0.166.1/examples/jsm/utils/BufferGeometryUtils.js';

const FLOOR_B64 = '${floorBase64}';
const FLOOR_MIME = '${floorMime}';
const RECTS = ${rectsJson};
const GRID_W = ${gridW};
const GRID_H = ${gridH};

const WORLD = 10;
const maxDim = Math.max(GRID_W, GRID_H);
const cell = WORLD / maxDim;
const planeW = GRID_W * cell;
const planeD = GRID_H * cell;
const wallHeight = WORLD * 0.16;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xECEAE5);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.05, 1000);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.localClippingEnabled = true;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = WORLD * 0.4;
controls.maxDistance = WORLD * 2.4;
controls.maxPolarAngle = Math.PI / 2.1;
controls.target.set(0, 0, 0);

// Lys: blødt ambient + retningsbestemt med skygger for dybde.
scene.add(new THREE.AmbientLight(0xffffff, 0.65));
const key = new THREE.DirectionalLight(0xffffff, 0.95);
key.position.set(WORLD * 0.5, WORLD * 1.1, WORLD * 0.35);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
const sc = key.shadow.camera;
sc.left = -WORLD; sc.right = WORLD; sc.top = WORLD; sc.bottom = -WORLD;
sc.near = 0.1; sc.far = WORLD * 4;
scene.add(key);
const fill = new THREE.DirectionalLight(0xdfe9ff, 0.3);
fill.position.set(-WORLD * 0.4, WORLD * 0.6, -WORLD * 0.3);
scene.add(fill);

// Klip-plan så man kan skære toppen af væggene og kigge ind.
const clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), wallHeight);

function b64ToDataUrl(b64, mime) { return 'data:' + mime + ';base64,' + b64; }

const loader = new THREE.TextureLoader();
const floorTex = loader.load(b64ToDataUrl(FLOOR_B64, FLOOR_MIME), () => {
  document.getElementById('loading').style.display = 'none';
});
floorTex.colorSpace = THREE.SRGBColorSpace;
floorTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

// Gulv: selve plantegningen som tekstur, lige under væggenes bund.
const floorGeo = new THREE.PlaneGeometry(planeW, planeD);
const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.95, metalness: 0.0 });
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.01;
floor.receiveShadow = true;
scene.add(floor);

// Vægge: ægte lodrette BoxGeometry pr. rektangel, flettet til én mesh.
const geos = [];
for (let i = 0; i < RECTS.length; i++) {
  const r = RECTS[i];
  const bw = r.w * cell;
  const bd = r.h * cell;
  const cx = (r.x + r.w / 2) * cell - planeW / 2;
  const cz = (r.y + r.h / 2) * cell - planeD / 2;
  const g = new THREE.BoxGeometry(bw, wallHeight, bd);
  g.translate(cx, wallHeight / 2, cz);
  geos.push(g);
}
if (geos.length) {
  const merged = mergeGeometries(geos, false);
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0xf5f5f5, roughness: 0.85, metalness: 0.0,
    clippingPlanes: [clipPlane], clipShadows: true,
  });
  const walls = new THREE.Mesh(merged, wallMat);
  walls.castShadow = true;
  walls.receiveShadow = true;
  scene.add(walls);
}

// Kamera-positioner for 3D (skrå) og 2D (top-down) med blød overgang.
const view3d = { pos: new THREE.Vector3(WORLD * 0.55, WORLD * 0.9, WORLD * 0.75), rotate: true };
const view2d = { pos: new THREE.Vector3(0, WORLD * 1.5, 0.001), rotate: false };
let target = view3d;
camera.position.copy(view3d.pos);

const tab3d = document.getElementById('tab3d');
const tab2d = document.getElementById('tab2d');
function setView(v, el) {
  target = v;
  controls.maxPolarAngle = v === view2d ? Math.PI : Math.PI / 2.1;
  controls.enableRotate = v.rotate;
  tab3d.classList.toggle('active', el === tab3d);
  tab2d.classList.toggle('active', el === tab2d);
}
tab3d.addEventListener('click', () => setView(view3d, tab3d));
tab2d.addEventListener('click', () => setView(view2d, tab2d));

document.getElementById('cut').addEventListener('input', (e) => {
  const t = parseFloat(e.target.value) / 100;
  clipPlane.constant = wallHeight * t;
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

let hintHidden = false;
function hideHint() { if (!hintHidden) { hintHidden = true; document.getElementById('hint').classList.add('hide'); } }
controls.addEventListener('start', hideHint);
setTimeout(hideHint, 5000);

(function animate() {
  requestAnimationFrame(animate);
  camera.position.lerp(target.pos, 0.08);
  controls.update();
  renderer.render(scene, camera);
})();
</script>
</body>
</html>`;
}
