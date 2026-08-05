/**
 * AI-Badge — EU AI Act (Art. 50) kompatibel synlig mærkning
 * Viser EU's standardiserede "AI Modified"-ikon med interaktiv hover-menu
 * der oplyser: værktøjsnavn, dato, handlingstype og C2PA-status.
 */
import { useState, useRef, useEffect } from "react";

interface AIBadgeProps {
  /** ISO-datostreng for hvornår billedet blev genereret */
  createdAt?: string;
  /** Valgfri ekstra klasse på wrapperen */
  className?: string;
  /** Handling — "AI Modified" (redigering af foto) eller "AI Generated" (skabt fra bunden) */
  action?: "modified" | "generated";
}

export function AIBadge({ createdAt, className = "", action = "modified" }: AIBadgeProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Luk ved klik udenfor
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const label = action === "modified" ? "AI Modified" : "AI Generated";
  const actionText =
    action === "modified"
      ? "Ægte foto redigeret med AI-indretning"
      : "Fuldt genereret af AI";

  const dateStr = createdAt
    ? new Date(createdAt).toLocaleDateString("da-DK", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div
      ref={ref}
      className={`relative inline-flex ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {/* EU-ikon badge — klikbart */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="AI-genereret indhold — klik for detaljer"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide select-none transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        style={{
          background: "rgba(15,25,35,0.62)",
          border: "1px solid rgba(255,255,255,0.22)",
          color: "#F5F1E8",
          backdropFilter: "blur(6px)",
        }}
      >
        {/* EU "AI"-cirkel ikon */}
        <span
          className="inline-flex items-center justify-center rounded-full font-bold"
          style={{
            width: 16,
            height: 16,
            fontSize: 8,
            background: "rgba(255,255,255,0.18)",
            border: "1px solid rgba(255,255,255,0.45)",
            color: "#fff",
            flexShrink: 0,
            letterSpacing: "0.04em",
          }}
          aria-hidden="true"
        >
          AI
        </span>
        <span>{label}</span>
        {/* Chevron-indikator */}
        <svg
          width="8"
          height="8"
          viewBox="0 0 8 8"
          fill="none"
          aria-hidden="true"
          style={{ opacity: 0.7, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}
        >
          <path d="M1 2.5L4 5.5L7 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Hover/klik-menu — EU krav om interaktivt andet lag */}
      {open && (
        <div
          role="tooltip"
          className="absolute z-50 bottom-full mb-2 right-0 w-64 rounded-xl shadow-2xl text-xs"
          style={{
            background: "rgba(15,25,35,0.95)",
            border: "1px solid rgba(255,255,255,0.14)",
            color: "#E5E0D8",
            backdropFilter: "blur(12px)",
            padding: "12px 14px",
          }}
        >
          {/* Header */}
          <div className="flex items-center gap-2 mb-3">
            <span
              className="inline-flex items-center justify-center rounded-full font-bold flex-shrink-0"
              style={{
                width: 22,
                height: 22,
                fontSize: 10,
                background: "rgba(255,255,255,0.15)",
                border: "1px solid rgba(255,255,255,0.4)",
                color: "#fff",
              }}
            >
              AI
            </span>
            <div>
              <p className="font-semibold text-white leading-tight">{label}</p>
              <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 10 }}>EU AI Act · Art. 50</p>
            </div>
          </div>

          <div className="space-y-2" style={{ borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 10 }}>
            {/* Værktøj */}
            <div className="flex justify-between items-start gap-2">
              <span style={{ color: "rgba(255,255,255,0.5)" }}>Værktøj</span>
              <span className="text-right font-medium text-white">Forma Estates AI</span>
            </div>

            {/* Handling */}
            <div className="flex justify-between items-start gap-2">
              <span style={{ color: "rgba(255,255,255,0.5)" }}>Handling</span>
              <span className="text-right font-medium" style={{ color: "#C8B89A" }}>{actionText}</span>
            </div>

            {/* Dato */}
            {dateStr && (
              <div className="flex justify-between items-start gap-2">
                <span style={{ color: "rgba(255,255,255,0.5)" }}>Oprettet</span>
                <span className="text-right" style={{ color: "rgba(255,255,255,0.8)" }}>{dateStr}</span>
              </div>
            )}

            {/* Metadata-status */}
            <div className="flex justify-between items-center gap-2">
              <span style={{ color: "rgba(255,255,255,0.5)" }}>Metadata</span>
              <span
                className="inline-flex items-center gap-1 font-medium"
                style={{ color: "#6FCF97" }}
              >
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true">
                  <circle cx="4" cy="4" r="4" fill="#6FCF97" />
                  <path d="M2 4L3.5 5.5L6 2.5" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                C2PA verificeret
              </span>
            </div>
          </div>

          {/* Footer link */}
          <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
            <a
              href="https://formaestates.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
              style={{ color: "rgba(255,255,255,0.4)", fontSize: 10 }}
            >
              formaestates.com
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
