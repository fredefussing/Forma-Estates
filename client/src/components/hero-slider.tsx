import { useState, useEffect } from "react";
import before1Src from "@assets/Skærmbillede_2026-04-06_kl._17.11.58_1776257774704.png";
import after1Src from "@assets/Skærmbillede_2026-04-06_kl._17.12.09_1776257781035.png";
import before2Src from "@assets/Skærmbillede_2026-04-06_kl._17.12.40_1776257791039.png";
import after2Src from "@assets/Skærmbillede_2026-04-06_kl._17.12.49_1776257791040.png";
import before3Src from "@assets/Skærmbillede_2026-04-15_kl._14.57.45_1776257869209.png";
import after3Src from "@assets/Skærmbillede_2026-04-15_kl._14.58.07_1776257891533.png";

const SLIDES = [
  { before: before1Src, after: after1Src, label: "Spisestue → Scandinavian Warm" },
  { before: before2Src, after: after2Src, label: "Stue → Fra tungt til luftigt" },
  { before: before3Src, after: after3Src, label: "Stue → Premium upgrade" },
];

export function HeroSlider() {
  const [current, setCurrent] = useState(0);
  const [opacity, setOpacity] = useState(1);

  useEffect(() => {
    const interval = setInterval(() => {
      setOpacity(0);
      setTimeout(() => {
        setCurrent((prev) => (prev + 1) % SLIDES.length);
        setOpacity(1);
      }, 500);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const slide = SLIDES[current];

  return (
    <div className="w-full" data-testid="hero-slider">
      <div
        className="flex gap-3 sm:gap-4"
        style={{ opacity, transition: "opacity 0.5s ease-out" }}
      >
        {/* FØR — skjult på mobil */}
        <div className="relative flex-1 rounded-xl overflow-hidden hidden sm:block" data-testid="hero-before-img">
          <div className="aspect-[4/3] w-full">
            <img
              src={slide.before}
              alt="Før redesign"
              className="w-full h-full object-cover object-center"
              draggable={false}
            />
          </div>
          <div className="absolute top-3 left-3 px-3 py-1.5 rounded bg-black/70 text-white text-[11px] font-semibold tracking-[0.1em] uppercase">
            Før
          </div>
        </div>

        {/* EFTER */}
        <div className="relative flex-1 rounded-xl overflow-hidden" data-testid="hero-after-img">
          <div className="aspect-[4/3] w-full">
            <img
              src={slide.after}
              alt="Efter redesign"
              className="w-full h-full object-cover object-center"
              draggable={false}
            />
          </div>
          <div className="absolute top-3 right-3 px-3 py-1.5 rounded bg-black/70 text-white text-[11px] font-semibold tracking-[0.1em] uppercase">
            Efter
          </div>
        </div>
      </div>

      <div
        className="flex flex-col items-center gap-2.5 pt-3 pb-1"
        style={{ opacity, transition: "opacity 0.5s ease-out" }}
      >
        <p className="text-[13px] text-[#6B7280] font-medium">{slide.label}</p>
        <div className="flex items-center gap-2">
          {SLIDES.map((_, i) => (
            <div
              key={i}
              className="rounded-full transition-all duration-300"
              style={{
                width: i === current ? 20 : 8,
                height: 8,
                background: i === current ? "#1A1A1A" : "rgba(26,26,26,0.18)",
              }}
              data-testid={`hero-dot-${i}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
