export const TRIPO_BG =
  "radial-gradient(ellipse 120% 90% at 50% 38%, #464646 0%, #2b2b2b 55%, #171717 100%)";

// Kamera starter i klassisk isometrisk dollhouse-vinkel (55° fra top).
// Azimuth bruger -Infinity/Infinity for ubegrænset 360° vandret rotation.
// Polar begrænses til 5–88° så brugeren hverken ser direkte ned eller under modellen.
export const TRIPO_MV_PROPS: Record<string, string> = {
  "camera-controls": "",
  "camera-orbit": "0deg 55deg 110%",
  "min-camera-orbit": "-Infinity 5deg 30%",
  "max-camera-orbit": "Infinity 88deg 350%",
  "min-field-of-view": "10deg",
  "max-field-of-view": "50deg",
  "interpolation-decay": "80",
  "interaction-prompt": "none",
  "environment-image": "neutral",
  "tone-mapping": "aces-filmic",
  "exposure": "1.1",
  "shadow-intensity": "1.5",
  "shadow-softness": "0.6",
};

export const TRIPO_MV_ATTRS = Object.entries(TRIPO_MV_PROPS)
  .map(([k, v]) => (v === "" ? k : `${k}="${v}"`))
  .join(" ");
