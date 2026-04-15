import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import before1Src from "@assets/Skærmbillede_2026-04-06_kl._17.11.58_1776257774704.png";
import after1Src from "@assets/Skærmbillede_2026-04-06_kl._17.12.09_1776257781035.png";
import before2Src from "@assets/Skærmbillede_2026-04-06_kl._17.12.40_1776257791039.png";
import after2Src from "@assets/Skærmbillede_2026-04-06_kl._17.12.49_1776257791040.png";
import before3Src from "@assets/Skærmbillede_2026-04-15_kl._14.57.45_1776257869209.png";
import after3Src from "@assets/Skærmbillede_2026-04-15_kl._14.58.07_1776257891533.png";

const SLIDES = [
  { before: before1Src, after: after1Src, label: "Spisestue", style: "Scandinavian Warm" },
  { before: before2Src, after: after2Src, label: "Stue", style: "Fra tungt til luftigt" },
  { before: before3Src, after: after3Src, label: "Stue", style: "Premium upgrade" },
];

export function HeroSlider() {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrent((prev) => (prev + 1) % SLIDES.length);
    }, 7000);
    return () => clearInterval(interval);
  }, []);

  const slide = SLIDES[current];

  return (
    <div className="w-full" data-testid="hero-slider">
      <AnimatePresence mode="wait">
        <motion.div
          key={current}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.55, ease: "easeOut" }}
          className="flex gap-4 sm:gap-6 items-start justify-center"
        >
          {/* FØR — hidden on mobile */}
          <div
            className="hidden sm:block flex-1 max-w-[50%]"
            style={{
              background: "white",
              padding: "10px",
              borderRadius: "16px",
              boxShadow: "0 30px 60px rgba(0,0,0,0.12), 0 10px 20px rgba(0,0,0,0.08)",
              transform: "rotate(-1deg)",
              transition: "transform 0.3s ease",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.transform = "rotate(0deg) scale(1.02)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.transform = "rotate(-1deg)"; }}
            data-testid="hero-before-img"
          >
            <div className="relative" style={{ borderRadius: "8px", overflow: "hidden", aspectRatio: "3/2" }}>
              <img
                src={slide.before}
                alt="Før redesign"
                className="w-full h-full object-cover object-center"
                draggable={false}
              />
              <div
                style={{
                  position: "absolute",
                  top: "14px",
                  left: "14px",
                  padding: "8px 16px",
                  background: "rgba(26,26,26,0.85)",
                  backdropFilter: "blur(4px)",
                  color: "white",
                  fontSize: "10px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "2px",
                  borderRadius: "6px",
                }}
              >
                Før
              </div>
            </div>
          </div>

          {/* EFTER */}
          <div
            className="flex-1 sm:max-w-[50%]"
            style={{
              background: "white",
              padding: "10px",
              borderRadius: "16px",
              boxShadow: "0 30px 60px rgba(0,0,0,0.12), 0 10px 20px rgba(0,0,0,0.08)",
              transform: "rotate(1deg)",
              transition: "transform 0.3s ease",
              zIndex: 2,
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.transform = "rotate(0deg) scale(1.02)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.transform = "rotate(1deg)"; }}
            data-testid="hero-after-img"
          >
            <div className="relative" style={{ borderRadius: "8px", overflow: "hidden", aspectRatio: "3/2" }}>
              <img
                src={slide.after}
                alt="Efter redesign"
                className="w-full h-full object-cover object-center"
                draggable={false}
              />
              <div
                style={{
                  position: "absolute",
                  top: "14px",
                  right: "14px",
                  padding: "8px 16px",
                  background: "rgba(26,26,26,0.85)",
                  backdropFilter: "blur(4px)",
                  color: "white",
                  fontSize: "10px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "2px",
                  borderRadius: "6px",
                }}
              >
                Efter
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Label + gold dots */}
      <div className="flex flex-col items-center gap-3 pt-5 pb-1">
        <p className="text-[13px] font-medium" style={{ color: "#5C5C5C" }}>
          {slide.label} <span style={{ color: "#8B8B8B" }}>→</span> {slide.style}
        </p>
        <div className="flex items-center gap-2">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className="rounded-full transition-all duration-300"
              style={{
                width: i === current ? 22 : 8,
                height: 8,
                background: i === current ? "#C4A77D" : "rgba(196,167,125,0.3)",
                border: "none",
                cursor: "pointer",
              }}
              data-testid={`hero-dot-${i}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
