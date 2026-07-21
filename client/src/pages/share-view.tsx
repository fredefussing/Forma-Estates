import { useEffect, useState } from "react";
import { Link, useRoute } from "wouter";
import { ArrowRight } from "lucide-react";
import { BeforeAfterSlider } from "@/components/before-after-slider";
import { BOLIG_ROOM_LABELS, BOLIG_STYLE_LABELS } from "@shared/boligPrompts";
import formaEstatesLogo from "@assets/forma-estates-logo.png";

const C = {
  navy: "#0F1923",
  gold: "#C9A96E",
  warm: "#FAF6EC",
  champagne: "#E8DFD0",
  muted: "#6B6B6B",
};
const SERIF = "'Playfair Display', Georgia, serif";
const SANS = "'Inter', system-ui, -apple-system, sans-serif";

interface ShareData {
  beforeUrl: string | null;
  afterUrl: string | null;
  room: string;
  style: string;
  agentName: string | null;
  createdAt: string | null;
}

export default function ShareView() {
  const [, params] = useRoute("/s/:token");
  const token = params?.token || "";
  const [data, setData] = useState<ShareData | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "notfound" | "error">("loading");
  const [beforeFailed, setBeforeFailed] = useState(false);

  // Hvis før-billedet ikke længere findes (fx slettet ved server-deploy), så
  // fald pænt tilbage til kun at vise efter-billedet i stedet for en tom skyder.
  useEffect(() => {
    setBeforeFailed(false);
    if (!data?.beforeUrl) return;
    const im = new Image();
    im.onerror = () => setBeforeFailed(true);
    im.src = data.beforeUrl;
  }, [data?.beforeUrl]);

  useEffect(() => {
    if (!token) { setStatus("notfound"); return; }
    let cancelled = false;
    fetch(`/api/share/${encodeURIComponent(token)}`)
      .then(async (r) => {
        if (cancelled) return;
        if (r.status === 404) { setStatus("notfound"); return; }
        if (!r.ok) { setStatus("error"); return; }
        const json = (await r.json()) as ShareData;
        if (cancelled) return;
        setData(json);
        setStatus("ok");
      })
      .catch(() => { if (!cancelled) setStatus("error"); });
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    document.title = "Før/efter AI-visualisering | Forma Estates";
  }, []);

  const roomLabel = data ? (BOLIG_ROOM_LABELS as Record<string, string>)[data.room] ?? data.room : "";
  const styleLabel = data ? (BOLIG_STYLE_LABELS as Record<string, string>)[data.style] ?? data.style : "";

  return (
    <div style={{ minHeight: "100vh", background: C.warm, fontFamily: SANS, display: "flex", flexDirection: "column" }}>
      <header style={{ background: C.navy, padding: "14px 20px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link href="/" data-testid="link-share-home">
            <img src={formaEstatesLogo} alt="Forma Estates" style={{ height: 34, cursor: "pointer" }} />
          </Link>
          <Link href="/opret" data-testid="link-share-signup-top">
            <span style={{ color: C.gold, fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600, cursor: "pointer" }}>
              Prøv gratis
            </span>
          </Link>
        </div>
      </header>

      <main style={{ flex: 1, maxWidth: 960, width: "100%", margin: "0 auto", padding: "clamp(24px, 5vw, 56px) 16px" }}>
        {status === "loading" && (
          <div style={{ textAlign: "center", padding: "80px 0", color: C.muted }} data-testid="share-loading">
            Indlæser…
          </div>
        )}

        {(status === "notfound" || status === "error") && (
          <div style={{ textAlign: "center", padding: "60px 16px" }} data-testid="share-notfound">
            <div style={{ color: C.gold, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 600 }}>Forma Estates</div>
            <h1 style={{ fontFamily: SERIF, color: C.navy, fontSize: "clamp(24px, 4vw, 32px)", margin: "12px 0 10px", fontWeight: 500 }}>
              {status === "notfound" ? "Linket findes ikke længere" : "Noget gik galt"}
            </h1>
            <p style={{ color: C.muted, fontSize: 15, margin: "0 0 28px" }}>
              {status === "notfound"
                ? "Delingen er muligvis blevet fjernet af afsenderen."
                : "Prøv at genindlæse siden om et øjeblik."}
            </p>
            <Link href="/" data-testid="link-share-frontpage">
              <span style={{ background: C.navy, color: "#fff", padding: "13px 26px", borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: "pointer", display: "inline-block" }}>
                Gå til forsiden
              </span>
            </Link>
          </div>
        )}

        {status === "ok" && data && (
          <>
            <div style={{ textAlign: "center", marginBottom: "clamp(20px, 4vw, 36px)" }}>
              <div style={{ color: C.gold, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 600 }} data-testid="text-share-kicker">
                {data.agentName ? `Delt af ${data.agentName}` : "AI-visualisering"}
              </div>
              <h1 style={{ fontFamily: SERIF, color: C.navy, fontSize: "clamp(26px, 5vw, 40px)", margin: "10px 0 8px", fontWeight: 500 }} data-testid="text-share-title">
                Se boligens potentiale
              </h1>
              <p style={{ color: C.muted, fontSize: 15, margin: 0 }} data-testid="text-share-meta">
                {roomLabel}{styleLabel ? ` · ${styleLabel} stil` : ""} — træk i skyderen for at sammenligne
              </p>
            </div>

            {data.beforeUrl && data.afterUrl && !beforeFailed ? (
              <BeforeAfterSlider beforeSrc={data.beforeUrl} afterSrc={data.afterUrl} className="bg-white shadow-lg" />
            ) : (
              <div style={{ borderRadius: 12, overflow: "hidden", border: `1px solid ${C.champagne}`, background: "#fff" }}>
                <img src={data.afterUrl || data.beforeUrl || ""} alt="AI-visualisering" style={{ width: "100%", display: "block" }} data-testid="img-share-single" />
              </div>
            )}

            <div style={{ background: C.navy, borderRadius: 14, padding: "clamp(28px, 5vw, 44px) clamp(20px, 4vw, 40px)", textAlign: "center", marginTop: "clamp(28px, 5vw, 48px)" }} data-testid="share-cta">
              <h2 style={{ fontFamily: SERIF, color: "#fff", fontSize: "clamp(20px, 3.5vw, 28px)", margin: "0 0 10px", fontWeight: 500 }}>
                Vil du se dit eget rum forvandlet?
              </h2>
              <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 14, lineHeight: 1.6, margin: "0 auto 24px", maxWidth: 480 }}>
                Upload et foto og få en fotorealistisk AI-visualisering på under et minut. Gratis at prøve — ingen betalingskort.
              </p>
              <Link href="/opret" data-testid="link-share-signup">
                <span style={{ background: C.gold, color: C.navy, padding: "14px 28px", borderRadius: 8, fontWeight: 700, fontSize: 15, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8 }}>
                  Prøv Forma Estates gratis <ArrowRight size={16} />
                </span>
              </Link>
            </div>
          </>
        )}
      </main>

      <footer style={{ textAlign: "center", padding: "20px 16px", color: "#999", fontSize: 11 }}>
        © Forma Estates · Danskudviklet i Danmark
      </footer>
    </div>
  );
}
