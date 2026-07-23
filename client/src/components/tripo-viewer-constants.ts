export const TRIPO_BG =
  "radial-gradient(ellipse 120% 90% at 50% 38%, #464646 0%, #2b2b2b 55%, #171717 100%)";

export const TRIPO_MV_PROPS: Record<string, string> = {
  "camera-controls": "",
  "camera-orbit": "0deg 30deg 105%",
  "min-camera-orbit": "auto 0deg 4%",
  "max-camera-orbit": "auto 180deg 350%",
  "min-field-of-view": "10deg",
  "max-field-of-view": "45deg",
  "interpolation-decay": "120",
  "interaction-prompt": "none",
  "environment-image": "neutral",
  "tone-mapping": "neutral",
  "exposure": "0.95",
  "shadow-intensity": "1",
  "shadow-softness": "0.9",
};

export const TRIPO_MV_ATTRS = Object.entries(TRIPO_MV_PROPS)
  .map(([k, v]) => (v === "" ? k : `${k}="${v}"`))
  .join(" ");
