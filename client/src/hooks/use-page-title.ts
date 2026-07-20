import { useEffect } from "react";

const DEFAULT_TITLE =
  "Forma Estates — AI BoligVisualisering & 3D Plantegninger til Ejendomsmæglere";
const DEFAULT_DESCRIPTION =
  "Forma Estates bruger AI til at skabe fotorealistiske boligvisualiseringer, 3D plantegninger og marketingvideoer. Øg salgsprisen med op til 15% — book gratis demo.";

export function usePageTitle(title?: string, description?: string) {
  useEffect(() => {
    if (title) document.title = `${title} | Forma Estates`;
    const meta = document.querySelector('meta[name="description"]');
    if (description && meta) meta.setAttribute("content", description);
    return () => {
      document.title = DEFAULT_TITLE;
      if (meta) meta.setAttribute("content", DEFAULT_DESCRIPTION);
    };
  }, [title, description]);
}
