import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const stats = [
  { icon: "🔥", value: "12", label: "designs i dag" },
  { icon: "⭐", value: "4.8", label: "stjerner" },
  { icon: "💰", value: "8.7k", label: "kr sparet" },
];

export function RotatingStats() {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % stats.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const current = stats[currentIndex];

  return (
    <div
      className="fixed bottom-6 right-6 z-[100] md:bottom-8 md:right-8"
      data-testid="rotating-stats"
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={currentIndex}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.4 }}
          className="flex items-center gap-2 rounded-xl bg-white/95 px-4 py-3 text-sm shadow-lg backdrop-blur-sm md:px-5 md:py-3"
        >
          <span className="text-base">{current.icon}</span>
          <span className="font-bold text-gray-900">{current.value}</span>
          <span className="text-gray-500">{current.label}</span>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
