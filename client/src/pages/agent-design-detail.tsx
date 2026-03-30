import { useEffect, useState } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { BeforeAfterSlider } from "@/components/before-after-slider";
import { Flame, ArrowLeft, Loader2, Download, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AgentDesign } from "@shared/schema";

export default function AgentDesignDetailPage() {
  const [match, params] = useRoute("/agent-design/:id");
  const { user, loading: authLoading } = useAuth();
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

  const handleDownload = () => {
    if (!design?.resultImageUrl) return;
    const a = document.createElement("a");
    a.href = design.resultImageUrl;
    a.download = `nordic-homebuild-agent-${design.id}.jpg`;
    a.click();
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
            <span className="text-lg font-semibold tracking-tight cursor-pointer text-[#1a1a1a]" data-testid="link-logo">Nordic Homebuild</span>
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
              beforeImage={design.originalImageUrl}
              afterImage={design.resultImageUrl}
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

        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground" data-testid="text-date">
            {new Date(design.createdAt).toLocaleDateString("da-DK", {
              day: "numeric", month: "long", year: "numeric",
              hour: "2-digit", minute: "2-digit",
            })}
          </p>
          {design.resultImageUrl && (
            <Button variant="outline" size="sm" onClick={handleDownload} data-testid="button-download">
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Download
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
