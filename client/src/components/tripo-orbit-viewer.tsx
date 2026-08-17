import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export interface TripoOrbitViewerHandle {
  resetCamera: () => void;
}

interface TripoOrbitViewerProps {
  modelUrl: string;
  colorRGB?: [number, number, number];
  onReady?: () => void;
  onError?: (message: string) => void;
  className?: string;
  style?: React.CSSProperties;
}

interface ViewerState {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  scene: THREE.Scene;
  model: THREE.Object3D | null;
  animId: number;
  initialPos: THREE.Vector3;
  initialTarget: THREE.Vector3;
  pendingColor: [number, number, number] | null;
  // Saved per-mesh original material colors so "Original" swatch restores PBR colors
  originalColors: Map<string, THREE.Color[]>;
}

function applyColorToModel(
  model: THREE.Object3D,
  rgb: [number, number, number],
  originalColors?: Map<string, THREE.Color[]>,
) {
  // [1,1,1] means "Original" — restore saved PBR colors instead of tinting white
  if (rgb[0] === 1 && rgb[1] === 1 && rgb[2] === 1 && originalColors && originalColors.size > 0) {
    model.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const orig = originalColors.get(mesh.uuid);
      if (!orig) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m: any, i: number) => {
        if (m && m.color && orig[i]) m.color.copy(orig[i]);
      });
    });
    return;
  }
  const tint = new THREE.Color(rgb[0], rgb[1], rgb[2]);
  model.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((m: any) => {
      if (m && m.color) m.color.set(tint);
    });
  });
}

export const TripoOrbitViewer = forwardRef<TripoOrbitViewerHandle, TripoOrbitViewerProps>(
  ({ modelUrl, colorRGB, onReady, onError, className, style }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const stateRef = useRef<ViewerState | null>(null);
    const colorRGBRef = useRef<[number, number, number] | undefined>(colorRGB);

    useImperativeHandle(ref, () => ({
      resetCamera() {
        const s = stateRef.current;
        if (!s) return;
        s.camera.position.copy(s.initialPos);
        s.controls.target.copy(s.initialTarget);
        s.controls.update();
      },
    }));

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const w = container.clientWidth || 600;
      const h = container.clientHeight || 480;
      const dpr = Math.max(window.devicePixelRatio || 1, 2);

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        precision: "highp",
        powerPreference: "high-performance",
      });
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.domElement.style.display = "block";
      container.appendChild(renderer.domElement);

      const scene = new THREE.Scene();

      // PMREM environment — required for correct PBR metallic/roughness rendering.
      // Without this, metallic surfaces render pitch-black or flat grey regardless of albedo.
      // RoomEnvironment is a lightweight built-in neutral studio environment (no HDR download needed).
      const pmrem = new THREE.PMREMGenerator(renderer);
      pmrem.compileEquirectangularShader();
      scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      pmrem.dispose();

      const camera = new THREE.PerspectiveCamera(38, w / h, 0.01, 1000);
      camera.position.set(3, 2.5, 3);

      const hemi = new THREE.HemisphereLight(0xffffff, 0x222233, 1.2);
      scene.add(hemi);

      const key = new THREE.DirectionalLight(0xffffff, 2.8);
      key.position.set(3, 5, 4);
      key.castShadow = true;
      key.shadow.mapSize.width = 2048;
      key.shadow.mapSize.height = 2048;
      key.shadow.camera.near = 0.1;
      key.shadow.camera.far = 200;
      key.shadow.bias = -0.0005;
      scene.add(key);

      const fill = new THREE.DirectionalLight(0xffffff, 0.9);
      fill.position.set(-3, 2, -2);
      scene.add(fill);

      const rim = new THREE.DirectionalLight(0xb8d4f0, 0.4);
      rim.position.set(0, 0, -5);
      scene.add(rim);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.enablePan = true;
      controls.panSpeed = 0.8;
      controls.rotateSpeed = 0.8;
      controls.zoomSpeed = 1.0;
      controls.minDistance = 0.3;
      controls.maxDistance = 500;
      // Prevent gimbal-lock singularity at the poles — without these limits,
      // horizontal drags reverse direction when looking straight down/up,
      // making continuous 360° rotation feel broken.
      controls.minPolarAngle = Math.PI * 0.02; // ~4° from top
      controls.maxPolarAngle = Math.PI * 0.98; // ~4° from bottom

      const dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.6/");

      const loader = new GLTFLoader();
      loader.setDRACOLoader(dracoLoader);

      const state: ViewerState = {
        renderer,
        camera,
        controls,
        scene,
        model: null,
        animId: 0,
        initialPos: camera.position.clone(),
        initialTarget: controls.target.clone(),
        pendingColor: null,
        originalColors: new Map(),
      };
      stateRef.current = state;

      loader.load(
        modelUrl,
        (gltf) => {
          const model = gltf.scene;
          model.traverse((child) => {
            const mesh = child as THREE.Mesh;
            if (mesh.isMesh) {
              mesh.castShadow = true;
              mesh.receiveShadow = true;
            }
          });
          scene.add(model);

          // Save original PBR material colors BEFORE any tinting, so the
          // "Original" swatch can restore them even after other swatches are applied.
          const origMap = new Map<string, THREE.Color[]>();
          model.traverse((child) => {
            const mesh = child as THREE.Mesh;
            if (!mesh.isMesh) return;
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            origMap.set(
              mesh.uuid,
              mats.map((m: any) => m?.color?.clone() ?? new THREE.Color(1, 1, 1)),
            );
          });
          state.originalColors = origMap;

          const box = new THREE.Box3().setFromObject(model);
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);

          model.position.sub(center);

          camera.near = maxDim * 0.005;
          camera.far = maxDim * 300;
          camera.updateProjectionMatrix();

          const dist = maxDim * 1.8;
          camera.position.set(dist * 0.75, dist * 0.55, dist * 0.75);
          controls.target.set(0, 0, 0);
          controls.minDistance = maxDim * 0.15;
          controls.maxDistance = maxDim * 20;
          controls.update();

          state.model = model;
          state.initialPos = camera.position.clone();
          state.initialTarget = controls.target.clone();

          // Only apply a pending tint if a non-original color was queued.
          // [1,1,1] (Original) is handled by applyColorToModel as a restore,
          // but the model just loaded with its native colors so it's a no-op.
          const pending = state.pendingColor ?? colorRGBRef.current;
          if (pending) applyColorToModel(model, pending, state.originalColors);
          state.pendingColor = null;

          onReady?.();
        },
        undefined,
        (err) => {
          console.error("GLTFLoader error:", err);
          onError?.("Kunne ikke indlæse 3D modellen — prøv igen");
        }
      );

      function animate() {
        state.animId = requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
      }
      animate();

      const ro = new ResizeObserver(() => {
        const nw = container.clientWidth;
        const nh = container.clientHeight;
        if (!nw || !nh) return;
        camera.aspect = nw / nh;
        camera.updateProjectionMatrix();
        renderer.setSize(nw, nh);
      });
      ro.observe(container);

      return () => {
        cancelAnimationFrame(state.animId);
        ro.disconnect();
        controls.dispose();
        renderer.dispose();
        renderer.domElement.parentNode?.removeChild(renderer.domElement);
        stateRef.current = null;
      };
    }, [modelUrl]);

    useEffect(() => {
      colorRGBRef.current = colorRGB;
      const s = stateRef.current;
      if (!s || !colorRGB) return;
      if (!s.model) {
        s.pendingColor = colorRGB;
        return;
      }
      applyColorToModel(s.model, colorRGB, s.originalColors);
      s.renderer.render(s.scene, s.camera);
    }, [colorRGB]);

    return (
      <div
        ref={containerRef}
        className={className}
        style={{
          background:
            "radial-gradient(ellipse 120% 90% at 50% 38%, #464646 0%, #2b2b2b 55%, #171717 100%)",
          ...style,
        }}
      />
    );
  }
);

TripoOrbitViewer.displayName = "TripoOrbitViewer";
