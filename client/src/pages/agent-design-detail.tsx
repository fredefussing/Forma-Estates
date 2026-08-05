import { useEffect, useState } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { BeforeAfterSlider } from "@/components/before-after-slider";
import { AIBadge } from "@/components/ai-badge";
import { Flame, ArrowLeft, Loader2, Download, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AgentDesign } from "@shared/schema";
import { auth } from "@/lib/firebase";

function useWatermarkPreference() {
  const [watermark, setWatermarkState] = useState<boolean>(() =>
    localStorage.getItem("fe-watermark") !== "false"
  );
  const setWatermark = (v: boolean) => {
    localStorage.setItem("fe-watermark", v ? "true" : "false");
    setWatermarkState(v);
    window.dispatchEvent(new CustomEvent("fe-watermark-change", { detail: v }));
  };
  useEffect(() => {
    const handler = (e: Event) => setWatermarkState((e as CustomEvent<boolean>).detail);
    window.addEventListener("fe-watermark-change", handler);
    return () => window.removeEventListener("fe-watermark-change", handler);
  }, []);
  return { watermark, setWatermark };
}

function WatermarkToggle() {
  const { watermark, setWatermark } = useWatermarkPreference();
  return (
    <button
      type="button"
      onClick={() => setWatermark(!watermark)}
      className="inline-flex items-center gap-1.5 text-xs rounded-full px-2.5 py-1 transition-all"
      style={watermark
        ? { background: "rgba(15,29,47,0.07)", color: "#4B5563", border: "1px solid rgba(15,29,47,0.13)" }
        : { background: "rgba(200,149,108,0.12)", color: "#9B6A40", border: "1px solid rgba(200,149,108,0.45)" }
      }
    >
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${watermark ? "bg-slate-500" : "bg-[#C8956C]"}`} />
      Brændemærke: <strong>{watermark ? "TIL" : "FRA"}</strong>
    </button>
  );
}

function NoWatermarkConfirmDialog({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-[9999] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-[340px] shadow-2xl">
        <p className="text-sm font-semibold mb-1">Download uden brændemærke</p>
        <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
          Du er ved at downloade <strong>uden</strong> "AI-redigeret"-mærket.<br />
          Er du sikker på dette?
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={onConfirm} className="flex-1 h-10 rounded-xl text-sm font-semibold text-white hover:opacity-90" style={{ background: "#0F1D2F" }}>
            Ja, download
          </button>
          <button type="button" onClick={onCancel} className="flex-1 h-10 rounded-xl text-sm font-semibold border text-foreground hover:bg-slate-50">
            Annuller
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AgentDesignDetailPage() {
  const [match, params] = useRoute("/agent-design/:id");
  const { user, loading: authLoading, isAdmin } = useAuth();
  const [design, setDesign] = useState<AgentDesign | null>(null);
  const [loading, setLoading] = useState(true);
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!match) return;
    const fetchDesign = async () => {
      try {
        const res = await fetch(`/api/agent-designs/${params!.id}`);
        if (res.ok) {
          setDesign(await res.json());
        } else {
          setLocation("/mine-designs");
        }
      } catch {
        setLocation("/mine-designs");
      } finally {
        setLoading(false);
      }
    };
    fetchDesign();
  }, [match, params]);

  const { watermark } = useWatermarkPreference();
  const [showWmConfirm, setShowWmConfirm] = useState(false);

  const doDownload = async () => {
    if (!design?.resultImageUrl) return;
    let fetchUrl = design.resultImageUrl.startsWith("http")
      ? `/api/proxy-image?url=${encodeURIComponent(design.resultImageUrl)}&format=jpg`
      : design.resultImageUrl;
    const fetchInit: RequestInit = {};
    // plain=1 (uden synligt vandmærke) — KUN for admin, jf. EU AI Act Art. 50
    if (isAdmin && !watermark && design.resultImageUrl.startsWith("http")) {
      fetchUrl += "&plain=1";
      const token = await auth.currentUser?.getIdToken().catch(() => undefined);
      if (token) fetchInit.headers = { Authorization: `Bearer ${token}` };
    }
    try {
      const res = await fetch(fetchUrl, fetchInit);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = `forma-estates-ai-design-${design.id}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objUrl);
    } catch {
      window.open(design.resultImageUrl, "_blank");
    }
  };

  const handleDownload = () => {
    // Kun admin kan vælge at downloade uden synligt brændemærke
    if (isAdmin && !watermark) { setShowWmConfirm(true); return; }
    doDownload();
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-[#f5f5f0] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!design) return null;

  return (
    <div className="min-h-screen bg-[#f5f5f0]">
      <header className="bg-white shadow-sm">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-6 h-16">
          <Link href="/">
            <span className="text-lg font-semibold tracking-tight cursor-pointer text-[#1a1a1a]" data-testid="link-logo">Forma Estates</span>
          </Link>
          <nav className="flex items-center gap-6">
            <Link href="/">
              <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer" data-testid="link-home">Forside</span>
            </Link>
            <Link href="/trending">
              <span className="text-sm text-orange-500 hover:text-orange-600 transition-colors cursor-pointer inline-flex items-center gap-1 font-medium" data-testid="link-trending">
                <Flame className="w-3.5 h-3.5" />
                Trending
              </span>
            </Link>
            <Link href="/pris">
              <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer" data-testid="link-pricing">Pris</span>
            </Link>
            {user && (
              <Link href="/min-konto">
                <span className="text-sm text-foreground font-medium cursor-pointer" data-testid="link-account">Min konto</span>
              </Link>
            )}
          </nav>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <Link href="/mine-designs">
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground cursor-pointer transition-colors" data-testid="link-back">
              <ArrowLeft className="w-3.5 h-3.5" />
              Mine designs
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-purple-600 text-white px-3 py-1.5 rounded-full">
              <Wand2 className="w-3 h-3" />
              AI Design Agent
            </span>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-6">
          {design.originalImageUrl && design.resultImageUrl ? (
            <BeforeAfterSlider
              beforeSrc={design.originalImageUrl}
              afterSrc={design.resultImageUrl}
              className="w-full"
            />
          ) : (
            <img
              src={design.resultImageUrl || ""}
              alt="AI Design Agent resultat"
              className="w-full object-cover"
              data-testid="img-result"
            />
          )}
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm mb-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-2">Prompt</p>
          <p className="text-sm text-foreground leading-relaxed" data-testid="text-prompt">
            {design.agentPrompt || "—"}
          </p>
        </div>

        {/* KUN admin ser bekræftelsesdialog — EU AI Act kræver tvungen mærkning for alle andre */}
        {isAdmin && showWmConfirm && (
          <NoWatermarkConfirmDialog
            onConfirm={() => { setShowWmConfirm(false); doDownload(); }}
            onCancel={() => setShowWmConfirm(false)}
          />
        )}
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground" data-testid="text-date">
            {new Date(design.createdAt).toLocaleDateString("da-DK", {
              day: "numeric", month: "long", year: "numeric",
              hour: "2-digit", minute: "2-digit",
            })}
          </p>
          {design.resultImageUrl && (
            <div className="flex flex-col items-end gap-1.5">
              <Button variant="outline" size="sm" onClick={handleDownload} data-testid="button-download">
                <Download className="w-3.5 h-3.5 mr-1.5" />
                Download
              </Button>
              {/* Brændemærke-toggle: KUN synlig for admin — EU AI Act Art. 50 */}
              {isAdmin && <WatermarkToggle />}
              <AIBadge createdAt={design.createdAt?.toString()} action="modified" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
