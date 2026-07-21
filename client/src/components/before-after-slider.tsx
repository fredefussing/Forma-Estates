import { useState, useRef, useCallback } from "react";
import { Maximize2, X, ChevronLeft, ChevronRight } from "lucide-react";

interface BeforeAfterSliderProps {
  beforeSrc: string;
  afterSrc: string;
  className?: string;
  beforeImage?: string;
  afterImage?: string;
}

export function BeforeAfterSlider({ beforeSrc, afterSrc, className, beforeImage, afterImage }: BeforeAfterSliderProps) {
  const before = beforeSrc || beforeImage || "";
  const after = afterSrc || afterImage || "";

  const [sliderPos, setSliderPos] = useState(50);
  const [lightbox, setLightbox] = useState<"before" | "after" | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const updatePosition = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPos(pct);
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    isDragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updatePosition(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    updatePosition(e.clientX);
  };

  const handlePointerUp = () => {
    isDragging.current = false;
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setSliderPos((p) => Math.max(0, p - 2));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setSliderPos((p) => Math.min(100, p + 2));
    }
    if (e.key === "Escape") setLightbox(null);
  };

  return (
    <>
      <div className={`rounded-xl overflow-hidden border border-border/60 ${className || ""}`}>
        <div
          ref={containerRef}
          className="relative w-full select-none touch-none cursor-col-resize overflow-hidden bg-muted/30"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          data-testid="before-after-slider"
        >
          <img
            src={after}
            alt=""
            className="w-full h-auto block invisible"
            style={{ maxHeight: "75vh" }}
            draggable={false}
          />

          <img
            src={after}
            alt="After redesign"
            className="absolute inset-0 w-full h-full object-contain"
            draggable={false}
          />

          {/* Before image clipped to the left of the slider — clipPath keeps it
              perfectly aligned with the after image (no width measurement needed
              on first render) and adds no color/shadow distortion. */}
          <img
            src={before}
            alt="Before redesign"
            className="absolute inset-0 w-full h-full object-contain"
            style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
            draggable={false}
          />

          <div
            className="absolute top-0 bottom-0 z-10"
            style={{ left: `${sliderPos}%`, transform: "translateX(-50%)", width: 2, background: "white", boxShadow: "0 0 8px rgba(255,255,255,0.55)" }}
          >
            <div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white flex items-center justify-center shadow-lg focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
              role="slider"
              aria-label="Før og efter sammenligning"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(sliderPos)}
              tabIndex={0}
              onKeyDown={handleKeyDown}
              data-testid="slider-handle"
            >
              <div className="flex items-center gap-0.5 text-neutral-500">
                <svg width="5" height="10" viewBox="0 0 5 10" fill="none"><path d="M4 1L1 5L4 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                <svg width="5" height="10" viewBox="0 0 5 10" fill="none"><path d="M1 1L4 5L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
            </div>
          </div>

          <div
            className="absolute bottom-4 left-4 px-3 py-1.5 rounded-full bg-black/50 text-white text-[11px] font-medium tracking-wide uppercase backdrop-blur-md z-10 pointer-events-none transition-opacity"
            style={{ opacity: sliderPos > 15 ? 1 : 0 }}
          >
            Før
          </div>
          <div
            className="absolute bottom-4 right-4 px-3 py-1.5 rounded-full bg-black/50 text-white text-[11px] font-medium tracking-wide uppercase backdrop-blur-md z-10 pointer-events-none transition-opacity"
            style={{ opacity: sliderPos < 85 ? 1 : 0 }}
          >
            Efter
          </div>
        </div>

        <div className="flex border-t border-border/40">
          <button
            className="flex-1 flex items-center justify-center gap-2 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
            onClick={() => setLightbox("before")}
            data-testid="button-open-before"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            Se originalbillede
          </button>
          <div className="w-px bg-border/40" />
          <button
            className="flex-1 flex items-center justify-center gap-2 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
            onClick={() => setLightbox("after")}
            data-testid="button-open-after"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            Se AI-design
          </button>
        </div>
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-[100] bg-black/92 flex items-center justify-center"
          onClick={() => setLightbox(null)}
          data-testid="lightbox-overlay"
        >
          <button
            className="absolute top-5 right-5 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors text-white"
            onClick={() => setLightbox(null)}
            data-testid="button-close-lightbox"
          >
            <X className="w-5 h-5" />
          </button>

          <button
            className="absolute left-5 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors text-white"
            onClick={(e) => { e.stopPropagation(); setLightbox("before"); }}
            data-testid="button-lightbox-before"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <button
            className="absolute right-5 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors text-white"
            onClick={(e) => { e.stopPropagation(); setLightbox("after"); }}
            data-testid="button-lightbox-after"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          <div className="px-20 max-w-[95vw] max-h-[95vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <img
              src={lightbox === "before" ? before : after}
              alt={lightbox === "before" ? "Originalbillede" : "AI-design"}
              className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
              data-testid="img-lightbox"
            />
            <p className="mt-4 text-white/60 text-sm font-medium uppercase tracking-widest">
              {lightbox === "before" ? "Originalbillede" : "AI-design"}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
