import { useState, useRef, useCallback, useEffect } from "react";
import before1Src from "@assets/hero-before1.png";
import after1Src from "@assets/hero-after1.png";
import before2Src from "@assets/hero-before2.png";
import after2Src from "@assets/hero-after2.png";
import before3Src from "@assets/hero-before3.png";
import after3Src from "@assets/hero-after3.png";

const SLIDES = [
  { before: before1Src, after: after1Src, label: "Spisestue → Scandinavian Warm" },
  { before: before2Src, after: after2Src, label: "Stue → Fra tungt til luftigt" },
  { before: before3Src, after: after3Src, label: "Stue → Premium upgrade" },
];

const AUTO_ROTATE_MS = 5000;

export function HeroSlider() {
  const [slideIndex, setSlideIndex] = useState(0);
  const [sliderPos, setSliderPos] = useState(60);
  const [userInteracting, setUserInteracting] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const autoRotateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const slide = SLIDES[slideIndex];

  const resetTimer = useCallback(() => {
    if (autoRotateTimer.current) clearTimeout(autoRotateTimer.current);
    autoRotateTimer.current = setTimeout(() => {
      setSlideIndex((i) => (i + 1) % SLIDES.length);
      setSliderPos(60);
      setUserInteracting(false);
    }, AUTO_ROTATE_MS);
  }, []);

  useEffect(() => {
    if (!userInteracting) {
      resetTimer();
    }
    return () => {
      if (autoRotateTimer.current) clearTimeout(autoRotateTimer.current);
    };
  }, [slideIndex, userInteracting, resetTimer]);

  const goToSlide = (i: number) => {
    setSlideIndex(i);
    setSliderPos(60);
    setUserInteracting(false);
  };

  const updatePosition = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const pct = Math.max(2, Math.min(98, (x / rect.width) * 100));
    setSliderPos(pct);
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    isDragging.current = true;
    setUserInteracting(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updatePosition(e.clientX);
    if (autoRotateTimer.current) clearTimeout(autoRotateTimer.current);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    updatePosition(e.clientX);
  };

  const handlePointerUp = () => {
    isDragging.current = false;
    resetTimer();
  };

  return (
    <div className="relative w-full h-full select-none" data-testid="hero-slider">
      <div
        ref={containerRef}
        className="absolute inset-0 touch-none cursor-col-resize overflow-hidden"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {SLIDES.map((s, i) => (
          <div
            key={i}
            className="absolute inset-0 transition-opacity duration-500"
            style={{ opacity: i === slideIndex ? 1 : 0, pointerEvents: i === slideIndex ? "auto" : "none" }}
          >
            <img
              src={s.after}
              alt="After redesign"
              className="absolute inset-0 w-full h-full object-cover"
              draggable={false}
            />
            <div
              className="absolute top-0 left-0 bottom-0 overflow-hidden"
              style={{ width: `${sliderPos}%` }}
            >
              <img
                src={s.before}
                alt="Before redesign"
                className="absolute top-0 left-0 h-full object-cover"
                style={{ width: containerRef.current ? `${containerRef.current.offsetWidth}px` : "100vw", maxWidth: "none" }}
                draggable={false}
              />
            </div>
          </div>
        ))}

        <div
          className="absolute top-0 bottom-0 z-20"
          style={{ left: `${sliderPos}%`, transform: "translateX(-50%)" }}
        >
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] bg-white/80" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-[#C4A77D] shadow-xl flex items-center justify-center">
            <div className="flex items-center gap-0.5 text-white">
              <svg width="6" height="11" viewBox="0 0 6 11" fill="none"><path d="M5 1L1 5.5L5 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <svg width="6" height="11" viewBox="0 0 6 11" fill="none"><path d="M1 1L5 5.5L1 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
          </div>
        </div>

        <div
          className="absolute bottom-[5.5rem] left-4 px-3 py-1 rounded-full bg-black/55 text-white text-[11px] font-medium tracking-widest uppercase backdrop-blur-sm z-20 pointer-events-none transition-opacity duration-300"
          style={{ opacity: sliderPos > 12 ? 1 : 0 }}
        >
          Før
        </div>
        <div
          className="absolute bottom-[5.5rem] right-4 px-3 py-1 rounded-full bg-black/55 text-white text-[11px] font-medium tracking-widest uppercase backdrop-blur-sm z-20 pointer-events-none transition-opacity duration-300"
          style={{ opacity: sliderPos < 88 ? 1 : 0 }}
        >
          Efter
        </div>

        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 px-3 py-1 rounded-full bg-black/45 text-white/80 text-[11px] backdrop-blur-sm pointer-events-none">
          {slide.label}
        </div>
      </div>

      <div className="absolute bottom-[1.8rem] left-1/2 -translate-x-1/2 flex gap-2 z-30">
        {SLIDES.map((_, i) => (
          <button
            key={i}
            onClick={(e) => { e.stopPropagation(); goToSlide(i); }}
            className={`rounded-full transition-all duration-300 ${i === slideIndex ? "w-6 h-2 bg-white" : "w-2 h-2 bg-white/40 hover:bg-white/70"}`}
            aria-label={`Slide ${i + 1}`}
            data-testid={`hero-slide-dot-${i}`}
          />
        ))}
      </div>
    </div>
  );
}
