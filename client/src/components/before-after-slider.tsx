import { useState, useRef, useCallback } from "react";
import { Card } from "@/components/ui/card";

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

  return (
    <Card className="overflow-visible">
      <div
        ref={containerRef}
        className="relative w-full select-none touch-none cursor-col-resize overflow-hidden rounded-md"
        style={{ aspectRatio: "16/10" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        data-testid="before-after-slider"
      >
        <img
          src={afterSrc}
          alt="After redesign"
          className="absolute inset-0 w-full h-full object-cover"
          draggable={false}
        />

        <div
          className="absolute top-0 left-0 bottom-0 overflow-hidden"
          style={{ width: `${sliderPos}%` }}
        >
          <img
            src={beforeSrc}
            alt="Before redesign"
            className="absolute top-0 left-0 h-full object-cover"
            style={{
              width: containerRef.current ? `${containerRef.current.offsetWidth}px` : "100vw",
              maxWidth: "none",
            }}
            draggable={false}
          />
        </div>

        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white z-10"
          style={{ left: `${sliderPos}%`, transform: "translateX(-50%)", boxShadow: "0 0 8px rgba(0,0,0,0.3)" }}
        >
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white flex items-center justify-center" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.2)" }}>
            <div className="flex items-center gap-0.5 text-muted-foreground">
              <svg width="6" height="12" viewBox="0 0 6 12" fill="none"><path d="M5 1L1 6L5 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <svg width="6" height="12" viewBox="0 0 6 12" fill="none"><path d="M1 1L5 6L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
          </div>
        </div>

        <div
          className="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-black/60 text-white text-xs font-medium backdrop-blur-sm z-10 pointer-events-none transition-opacity"
          style={{ opacity: sliderPos > 15 ? 1 : 0 }}
        >
          Før
        </div>
        <div
          className="absolute top-3 right-3 px-2.5 py-1 rounded-md bg-black/60 text-white text-xs font-medium backdrop-blur-sm z-10 pointer-events-none transition-opacity"
          style={{ opacity: sliderPos < 85 ? 1 : 0 }}
        >
          Efter
        </div>
      </div>
    </Card>
  );
}
