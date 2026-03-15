import { useState, useRef, useCallback } from "react";

interface BeforeAfterSliderProps {
  beforeSrc: string;
  afterSrc: string;
}

export function BeforeAfterSlider({ beforeSrc, afterSrc }: BeforeAfterSliderProps) {
  const [sliderPos, setSliderPos] = useState(50);
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
  };

  return (
    <div className="rounded-xl overflow-hidden border border-border/60">
      <div
        ref={containerRef}
        className="relative w-full select-none touch-none cursor-col-resize overflow-hidden bg-muted/30"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        data-testid="before-after-slider"
      >
        {/* Invisible sizer — drives the container height from the image's natural dimensions */}
        <img
          src={afterSrc}
          alt=""
          className="w-full h-auto block invisible"
          style={{ maxHeight: "75vh" }}
          draggable={false}
        />

        {/* After image — fills the container using contain so the full room is visible */}
        <img
          src={afterSrc}
          alt="After redesign"
          className="absolute inset-0 w-full h-full object-contain"
          draggable={false}
        />

        {/* Before clip — reveals the original from the left */}
        <div
          className="absolute top-0 left-0 bottom-0 overflow-hidden"
          style={{ width: `${sliderPos}%` }}
        >
          <img
            src={beforeSrc}
            alt="Before redesign"
            className="absolute top-0 left-0 h-full object-contain"
            style={{
              width: containerRef.current ? `${containerRef.current.offsetWidth}px` : "100vw",
              maxWidth: "none",
            }}
            draggable={false}
          />
        </div>

        {/* Divider line */}
        <div
          className="absolute top-0 bottom-0 w-px bg-white/90 z-10"
          style={{ left: `${sliderPos}%`, transform: "translateX(-50%)" }}
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
    </div>
  );
}
