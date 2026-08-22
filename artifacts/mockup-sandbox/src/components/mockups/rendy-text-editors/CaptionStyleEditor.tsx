import './_group.css';
import { useState } from 'react';

// ── Inlined presets ───────────────────────────────────────────────────────────
const PRESETS = [
  { id: 'cormorant-regular',     label: 'Cormorant',       family: '"Cormorant Garamond"', weight: 400, style: 'normal' as const,  transform: 'none' as const,      tracking: 0.02 },
  { id: 'cormorant-semibold',    label: 'Corm. Semi',      family: '"Cormorant Garamond"', weight: 600, style: 'normal' as const,  transform: 'none' as const,      tracking: 0.02 },
  { id: 'cormorant-italic',      label: 'Corm. Kursiv',    family: '"Cormorant Garamond"', weight: 400, style: 'italic' as const,  transform: 'none' as const,      tracking: 0.02 },
  { id: 'cormorant-semibold-sc', label: 'Corm. Kaps',      family: '"Cormorant Garamond"', weight: 600, style: 'normal' as const,  transform: 'uppercase' as const, tracking: 0.06 },
  { id: 'inter-regular',         label: 'Inter',           family: '"Inter"',              weight: 400, style: 'normal' as const,  transform: 'none' as const,      tracking: 0 },
  { id: 'inter-bold',            label: 'Inter Fed',       family: '"Inter"',              weight: 700, style: 'normal' as const,  transform: 'none' as const,      tracking: 0 },
  { id: 'inter-regular-wide',    label: 'Inter Wide',      family: '"Inter"',              weight: 400, style: 'normal' as const,  transform: 'none' as const,      tracking: 0.08 },
  { id: 'inter-bold-wide',       label: 'Inter Fed W',     family: '"Inter"',              weight: 700, style: 'normal' as const,  transform: 'none' as const,      tracking: 0.06 },
  { id: 'inter-light-caps',      label: 'Inter Let Kaps',  family: '"Inter"',              weight: 300, style: 'normal' as const,  transform: 'uppercase' as const, tracking: 0.12 },
  { id: 'cormorant-display',     label: 'Corm. Display',   family: '"Cormorant Garamond"', weight: 400, style: 'normal' as const,  transform: 'none' as const,      tracking: 0.04 },
];

type Contrast = 'shadow' | 'box' | 'outline';
type Position = 'high' | 'center' | 'low';

interface CS { fontId: string; size: number; contrast: Contrast; position: Position; }
const DEFAULT: CS = { fontId: 'inter-regular', size: 0.048, contrast: 'box', position: 'low' };

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

function posStyle(pos: Position): React.CSSProperties {
  if (pos === 'high')   return { top: '8%', bottom: 'auto', transform: 'none' };
  if (pos === 'center') return { top: '50%', bottom: 'auto', transform: 'translateY(-50%)' };
  return { bottom: '6%', top: 'auto', transform: 'none' };
}

function captionTextStyle(cs: CS): React.CSSProperties {
  const p = PRESETS.find(x => x.id === cs.fontId) ?? PRESETS[4];
  const base: React.CSSProperties = {
    fontFamily: p.family, fontWeight: p.weight, fontStyle: p.style,
    textTransform: p.transform, letterSpacing: `${p.tracking}em`,
    fontSize: `${cs.size * 100}cqh`, color: '#ffffff',
    padding: '0.1em 0.4em', borderRadius: '2px',
    display: 'inline-block', maxWidth: '90cqw',
    textAlign: 'center', lineHeight: 1.3,
    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
  };
  if (cs.contrast === 'shadow')  base.textShadow = '0 1px 4px rgba(0,0,0,0.9),0 0 10px rgba(0,0,0,0.7)';
  else if (cs.contrast === 'box') base.background = 'rgba(0,0,0,0.55)';
  else base.textShadow = '-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000';
  return base;
}

// Sample caption sentences cycling every 3s
const SAMPLES = [
  'Nyistandsat og klar til indflytning',
  'Lyst køkken med plads til familien',
  'Udsigt over den fredfyldte have',
  'Moderne badeværelse i naturmaterialer',
];

export function CaptionStyleEditor() {
  const [cs, setCs] = useState<CS>(DEFAULT);
  const [sampleIdx, setSampleIdx] = useState(0);
  const set = (p: Partial<CS>) => setCs(prev => ({ ...prev, ...p }));

  // Cycle sample text on click for fun
  const nextSample = () => setSampleIdx(i => (i + 1) % SAMPLES.length);
  const sample = SAMPLES[sampleIdx];

  return (
    <div className="min-h-screen bg-[#FDFAF7] flex items-start justify-center p-6">
      <div className="w-full max-w-sm space-y-3">
        <p className="text-xs font-semibold text-[#6C6964] uppercase tracking-widest">Rendy Voiceover — Undertekststil</p>

        <div className="space-y-3 rounded-xl border border-[#DCC9B9] bg-[#FFFDFC] p-3">
          <p className="text-[11px] font-semibold text-[#0F1D2F]">Undertekststil</p>

          {/* Live preview */}
          <div
            className="relative w-full rounded-lg overflow-hidden cursor-pointer"
            style={{ aspectRatio: '9/16', containerType: 'size', maxHeight: 280,
              background: 'linear-gradient(160deg,#1a2a3a 0%,#0d1c28 40%,#1a3040 100%)' }}
            onClick={nextSample}
            title="Klik for at skifte eksempeltekst"
          >
            {/* Simulated room ambiance */}
            <div className="absolute inset-0 opacity-20"
              style={{ background: 'radial-gradient(ellipse at 40% 60%,rgba(200,149,108,0.5),transparent 65%)' }} />
            <div className="absolute bottom-0 left-0 right-0 h-1/4 opacity-15"
              style={{ background: 'linear-gradient(to top,rgba(255,255,255,0.2),transparent)' }} />

            {/* Caption overlay */}
            <div className="absolute left-0 right-0 flex justify-center px-3"
              style={{ ...posStyle(cs.position), pointerEvents: 'none' }}>
              <span style={captionTextStyle(cs)}>{sample}</span>
            </div>

            {/* Hint */}
            <div className="absolute top-2 right-2 text-[9px] text-white/40 select-none">klik for ny tekst</div>
          </div>

          {/* Font selector */}
          <div>
            <p className="text-[10px] text-[#77736D] mb-1">Skrifttype</p>
            <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-0.5 px-0.5">
              {PRESETS.map(p => {
                const active = cs.fontId === p.id;
                return (
                  <button key={p.id} type="button" onClick={() => set({ fontId: p.id })} aria-pressed={active}
                    className={`flex-shrink-0 rounded border px-2 py-1 text-center transition-all ${active ? 'border-[#C8956C] bg-[#FDF5EE]' : 'border-[#E1DAD2] bg-white hover:border-[#C8956C]/50'}`}>
                    <span className="block text-sm leading-tight text-[#0F1D2F]"
                      style={{ fontFamily: p.family, fontWeight: p.weight, fontStyle: p.style, textTransform: p.transform }}>
                      Aa
                    </span>
                    <span className="block text-[9px] text-[#77736D] mt-0.5">{p.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Size */}
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-[#77736D] w-12 flex-shrink-0">Størrelse</label>
            <input type="range" min={0.03} max={0.10} step={0.005} value={cs.size}
              onChange={e => set({ size: clamp(parseFloat(e.target.value), 0.03, 0.10) })}
              className="flex-1 accent-[#C8956C]" />
            <span className="text-[10px] text-[#77736D] w-8 text-right flex-shrink-0">{Math.round(cs.size * 100)}%</span>
          </div>

          {/* Contrast */}
          <div>
            <p className="text-[10px] text-[#77736D] mb-1">Kontrast</p>
            <div className="flex gap-1.5 flex-wrap">
              {(['shadow','box','outline'] as Contrast[]).map(v => (
                <button key={v} type="button" onClick={() => set({ contrast: v })} aria-pressed={cs.contrast === v}
                  className={`h-6 px-2 rounded text-[10px] font-semibold border transition-all ${cs.contrast === v ? 'border-[#C8956C] bg-[#FDF5EE] text-[#855F45]' : 'border-[#E1DAD2] text-[#4D4943]'}`}>
                  {{ shadow: 'Skygge', box: 'Boks', outline: 'Kontur' }[v]}
                </button>
              ))}
            </div>
          </div>

          {/* Position */}
          <div>
            <p className="text-[10px] text-[#77736D] mb-1">Placering</p>
            <div className="flex gap-1.5 flex-wrap">
              {(['high','center','low'] as Position[]).map(v => (
                <button key={v} type="button" onClick={() => set({ position: v })} aria-pressed={cs.position === v}
                  className={`h-6 px-2 rounded text-[10px] font-semibold border transition-all ${cs.position === v ? 'border-[#C8956C] bg-[#FDF5EE] text-[#855F45]' : 'border-[#E1DAD2] text-[#4D4943]'}`}>
                  {{ high: '↑ Øverst', center: '↔ Midt', low: '↓ Nederst' }[v]}
                </button>
              ))}
            </div>
          </div>

          {/* Reset */}
          <button type="button" onClick={() => setCs(DEFAULT)}
            className="text-[10px] text-[#77736D] underline">Nulstil til standard</button>
        </div>
      </div>
    </div>
  );
}
