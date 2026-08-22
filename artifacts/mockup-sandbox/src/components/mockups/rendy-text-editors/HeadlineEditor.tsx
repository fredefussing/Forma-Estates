import './_group.css';
import { useState, useRef, useCallback, useEffect } from 'react';
import { Check, Film, GripHorizontal, Minus, Plus, RotateCcw, Type, X } from 'lucide-react';

// ── Inlined typography presets ────────────────────────────────────────────────
const PRESETS = [
  { id: 'cormorant-regular',     label: 'Cormorant',      family: '"Cormorant Garamond"', weight: 400, style: 'normal' as const,  transform: 'none' as const,      tracking: 0.02 },
  { id: 'cormorant-semibold',    label: 'Cormorant Semi', family: '"Cormorant Garamond"', weight: 600, style: 'normal' as const,  transform: 'none' as const,      tracking: 0.02 },
  { id: 'cormorant-italic',      label: 'Cormorant Kursiv',family: '"Cormorant Garamond"',weight: 400, style: 'italic' as const,  transform: 'none' as const,      tracking: 0.02 },
  { id: 'cormorant-semibold-sc', label: 'Corm. Kapitæler',family: '"Cormorant Garamond"', weight: 600, style: 'normal' as const,  transform: 'uppercase' as const, tracking: 0.06 },
  { id: 'inter-regular',         label: 'Inter',          family: '"Inter"',              weight: 400, style: 'normal' as const,  transform: 'none' as const,      tracking: 0 },
  { id: 'inter-bold',            label: 'Inter Fed',      family: '"Inter"',              weight: 700, style: 'normal' as const,  transform: 'none' as const,      tracking: 0 },
  { id: 'inter-regular-wide',    label: 'Inter Wide',     family: '"Inter"',              weight: 400, style: 'normal' as const,  transform: 'none' as const,      tracking: 0.08 },
  { id: 'inter-bold-wide',       label: 'Inter Fed Wide', family: '"Inter"',              weight: 700, style: 'normal' as const,  transform: 'none' as const,      tracking: 0.06 },
  { id: 'inter-light-caps',      label: 'Inter Let Caps', family: '"Inter"',              weight: 300, style: 'normal' as const,  transform: 'uppercase' as const, tracking: 0.12 },
  { id: 'cormorant-display',     label: 'Cormorant Disp', family: '"Cormorant Garamond"', weight: 400, style: 'normal' as const,  transform: 'none' as const,      tracking: 0.04 },
];

const SIZE_MIN = 0.03;
const SIZE_MAX = 0.18;
const POS_MIN  = 0.05;
const POS_MAX_X = 0.95;
const POS_MAX_Y = 0.92;

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

interface HL {
  enabled: boolean; text: string; fontId: string;
  size: number; x: number; y: number; start: number; end: number;
}
const DEFAULT: HL = { enabled: false, text: '', fontId: 'cormorant-regular', size: 0.09, x: 0.5, y: 0.2, start: 0, end: 4 };

export function HeadlineEditor() {
  const [open, setOpen] = useState(true);
  const [hl, setHl] = useState<HL>({ ...DEFAULT, enabled: true, text: 'Lys og elegant bolig' });
  const previewRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const set = useCallback((p: Partial<HL>) => setHl(prev => ({ ...prev, ...p })), []);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragging.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);
  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current || !previewRef.current) return;
    const r = previewRef.current.getBoundingClientRect();
    set({ x: clamp((e.clientX - r.left) / r.width, POS_MIN, POS_MAX_X), y: clamp((e.clientY - r.top) / r.height, POS_MIN, POS_MAX_Y) });
  }, [set]);
  const onPointerUp = useCallback(() => { dragging.current = false; }, []);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 0.05 : 0.01;
    if (e.key === 'ArrowLeft')  { set({ x: clamp(hl.x - step, POS_MIN, POS_MAX_X) }); e.preventDefault(); }
    if (e.key === 'ArrowRight') { set({ x: clamp(hl.x + step, POS_MIN, POS_MAX_X) }); e.preventDefault(); }
    if (e.key === 'ArrowUp')    { set({ y: clamp(hl.y - step, POS_MIN, POS_MAX_Y) }); e.preventDefault(); }
    if (e.key === 'ArrowDown')  { set({ y: clamp(hl.y + step, POS_MIN, POS_MAX_Y) }); e.preventDefault(); }
  }, [hl.x, hl.y, set]);

  const preset = PRESETS.find(p => p.id === hl.fontId) ?? PRESETS[0];
  const fontStyle: React.CSSProperties = {
    fontFamily: preset.family, fontWeight: preset.weight,
    fontStyle: preset.style, textTransform: preset.transform,
    letterSpacing: `${preset.tracking}em`,
  };
  const applyDisabled = hl.enabled && hl.text.trim().length === 0;

  return (
    <div className="min-h-screen bg-[#FDFAF7] flex items-start justify-center p-6">
      <div className="w-full max-w-sm space-y-3">
        {/* Section label */}
        <p className="text-xs font-semibold text-[#6C6964] uppercase tracking-widest">Rendy Edit — Overskrift</p>

        {/* Trigger button (closed state) */}
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="w-full h-8 rounded-full text-xs font-semibold border border-[#C8956C] text-[#855F45] bg-[#FFFDFC] inline-flex items-center justify-center gap-1.5 hover:bg-[#FDF5EE] transition-colors"
          >
            <Type className="w-3.5 h-3.5" />
            Tilføj overskrift
          </button>
        )}

        {/* Open panel */}
        {open && (
          <section className="rounded-xl border border-[#DCC9B9] bg-[#FFFDFC] p-3 space-y-3">
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-[#0F1D2F]">Overskrift</h3>
                <p className="text-[11px] text-[#6C6964]">Tekst brændes ind efter eksport</p>
              </div>
              <button type="button" onClick={() => setOpen(false)}><X className="w-4 h-4" /></button>
            </div>

            {/* Enable toggle */}
            <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
              <input type="checkbox" checked={hl.enabled} onChange={e => set({ enabled: e.target.checked })} className="accent-[#C8956C]" />
              <span className="font-medium text-[#0F1D2F]">Vis overskrift på videoen</span>
            </label>

            {hl.enabled && (<>
              {/* Text input */}
              <div>
                <label className="block text-[11px] font-semibold text-[#0F1D2F] mb-1">Tekst</label>
                <input
                  type="text" value={hl.text} onChange={e => set({ text: e.target.value })}
                  maxLength={120} placeholder="Fx: Lys og elegant villa…"
                  className="w-full rounded-lg border border-[#E1DAD2] px-2.5 py-1.5 text-sm focus:outline-none focus:border-[#C8956C] bg-white"
                />
              </div>

              {/* Font tiles */}
              <div>
                <p className="text-[11px] font-semibold text-[#0F1D2F] mb-1.5">Skrifttype</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {PRESETS.map(p => {
                    const active = hl.fontId === p.id;
                    return (
                      <button
                        key={p.id} type="button" onClick={() => set({ fontId: p.id })}
                        aria-pressed={active}
                        className={`relative rounded-lg border px-2 py-2.5 text-center transition-all ${active ? 'border-[#C8956C] bg-[#FDF5EE]' : 'border-[#E1DAD2] bg-white hover:border-[#C8956C]/50'}`}
                      >
                        {active && <Check className="w-3 h-3 text-[#C8956C] absolute top-1 right-1" />}
                        <span className="block text-base leading-tight text-[#0F1D2F]"
                          style={{ fontFamily: p.family, fontWeight: p.weight, fontStyle: p.style, textTransform: p.transform, letterSpacing: `${p.tracking}em` }}>
                          Aa
                        </span>
                        <span className="block text-[9px] text-[#77736D] mt-0.5 truncate">{p.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Size control */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-[#0F1D2F] w-16 flex-shrink-0">Størrelse</span>
                <button type="button" onClick={() => set({ size: clamp(hl.size - 0.005, SIZE_MIN, SIZE_MAX) })}
                  className="w-6 h-6 rounded border border-[#E1DAD2] flex items-center justify-center flex-shrink-0 hover:bg-gray-50">
                  <Minus className="w-3 h-3" />
                </button>
                <input type="range" min={SIZE_MIN} max={SIZE_MAX} step={0.005} value={hl.size}
                  onChange={e => set({ size: clamp(parseFloat(e.target.value), SIZE_MIN, SIZE_MAX) })}
                  className="flex-1 accent-[#C8956C]" />
                <button type="button" onClick={() => set({ size: clamp(hl.size + 0.005, SIZE_MIN, SIZE_MAX) })}
                  className="w-6 h-6 rounded border border-[#E1DAD2] flex items-center justify-center flex-shrink-0 hover:bg-gray-50">
                  <Plus className="w-3 h-3" />
                </button>
                <span className="text-[10px] text-[#77736D] w-10 text-right flex-shrink-0">{Math.round(hl.size * 100)}%</span>
              </div>

              {/* Start + End */}
              <div className="grid grid-cols-2 gap-2">
                {[{ label: 'Starter (sek)', key: 'start' as const, min: 0, max: hl.end - 0.5 },
                  { label: 'Slutter (sek)', key: 'end'   as const, min: hl.start + 0.5, max: 999 }].map(f => (
                  <div key={f.key}>
                    <label className="block text-[11px] font-semibold text-[#0F1D2F] mb-1">{f.label}</label>
                    <div className="flex items-center gap-1">
                      <input type="number" min={f.min} max={f.max} step={0.5} value={hl[f.key]}
                        onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) set({ [f.key]: Math.max(f.min, Math.min(f.max, v)) }); }}
                        className="w-full rounded border border-[#E1DAD2] px-2 py-1 text-xs focus:outline-none focus:border-[#C8956C]" />
                      <span className="text-[10px] text-[#77736D] flex-shrink-0">s</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Video preview with draggable overlay */}
              <div>
                <p className="text-[11px] font-semibold text-[#0F1D2F] mb-1">
                  Position <span className="font-normal text-[#77736D]">— træk teksten på videoen</span>
                </p>
                <div
                  ref={previewRef}
                  className="relative w-full rounded-lg overflow-hidden select-none"
                  style={{ aspectRatio: '9/16', containerType: 'size', maxHeight: 360, background: 'linear-gradient(160deg,#1a2a3a 0%,#0d1c28 40%,#1a3040 100%)' }}
                  onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}
                >
                  {/* Simulated room scene */}
                  <div className="absolute inset-0 opacity-20"
                    style={{ background: 'radial-gradient(ellipse at 60% 40%,rgba(200,149,108,0.4),transparent 70%)' }} />
                  <div className="absolute bottom-0 left-0 right-0 h-1/3 opacity-10"
                    style={{ background: 'linear-gradient(to top,rgba(255,255,255,0.3),transparent)' }} />

                  {/* Draggable text overlay */}
                  {hl.text.trim() && (
                    <div className="absolute inset-0 pointer-events-none">
                      <div className="absolute"
                        style={{ left: `${hl.x * 100}%`, top: `${hl.y * 100}%`, transform: 'translate(-50%,-50%)', pointerEvents: 'auto' }}>
                        <div role="button" tabIndex={0}
                          className="group cursor-grab active:cursor-grabbing touch-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C8956C] rounded"
                          onPointerDown={onPointerDown} onKeyDown={onKeyDown}>
                          <p className="text-white text-center"
                            style={{ ...fontStyle, fontSize: `${hl.size * 100}cqh`, textShadow: '0 1px 6px rgba(0,0,0,0.75)', whiteSpace: 'pre-wrap', maxWidth: '80cqw', lineHeight: 1.15 }}>
                            {hl.text}
                          </p>
                          <div className="absolute -top-5 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
                            <GripHorizontal className="w-4 h-4 text-white drop-shadow" />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-[#77736D] mt-0.5 text-right">x: {Math.round(hl.x * 100)}% · y: {Math.round(hl.y * 100)}%</p>
              </div>

              {/* Reset */}
              <button type="button" onClick={() => setHl({ ...DEFAULT, enabled: true })}
                className="inline-flex items-center gap-1.5 text-[11px] text-[#77736D] underline">
                <RotateCcw className="w-3 h-3" /> Nulstil
              </button>
            </>)}

            {/* Apply */}
            <button type="button" disabled={applyDisabled}
              className="w-full h-9 rounded-lg bg-[#C8956C] text-white text-xs font-semibold inline-flex justify-center items-center gap-1.5 disabled:opacity-50">
              <Film className="w-3.5 h-3.5" />
              Anvend overskrift på video
            </button>
          </section>
        )}
      </div>
    </div>
  );
}
