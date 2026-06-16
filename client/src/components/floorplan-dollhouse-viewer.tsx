import { useState, useRef } from "react";
import { Boxes, Download, Loader2, RotateCcw, AlertCircle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { buildDollhouseHtml } from "@/lib/dollhouse-html";

type ViewerStatus = "idle" | "loading" | "ready" | "error";

export function FloorplanDollhouseViewer({ planUrl }: { planUrl: string }) {
  const { user } = useAuth();
  const [status, setStatus] = useState<ViewerStatus>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const htmlRef = useRef<string | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  async function generate() {
    setStatus("loading");
    setErrorMsg(null);
    try {
      const token = await user?.getIdToken();
      const res = await fetch("/api/bolig/floorplan-dollhouse", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ planUrl }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message || "Dollhouse-generering fejlede");
      }
      const { floorBase64, floorMime, rects, gridW, gridH } = await res.json();
      const html = buildDollhouseHtml(floorBase64, floorMime, rects, gridW, gridH);
      htmlRef.current = html;
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = URL.createObjectURL(new Blob([html], { type: "text/html" }));
      setStatus("ready");
    } catch (err: any) {
      setErrorMsg(err.message ?? "Ukendt fejl");
      setStatus("error");
    }
  }

  function download() {
    if (!htmlRef.current) return;
    const blob = new Blob([htmlRef.current], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "forma-dollhouse.html";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  return (
    <div
      className="rounded-2xl border overflow-hidden"
      style={{ borderColor: "#E8E4DE", background: "#FAF7F2" }}
      data-testid="floorplan-dollhouse-viewer"
    >
      <div className="px-4 py-3 flex items-center justify-between border-b" style={{ borderColor: "#E8E4DE" }}>
        <div className="flex items-center gap-2">
          <Boxes className="w-4 h-4" style={{ color: "#C8956C" }} />
          <span className="text-sm font-semibold" style={{ color: "#0F1D2F" }}>
            Dukkehus med rigtige vægge
          </span>
          <span
            className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full"
            style={{ background: "#F0EDE7", color: "#C8956C" }}
          >
            Beta
          </span>
        </div>
        {status === "ready" && (
          <button
            onClick={download}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80"
            style={{ background: "#0F1D2F", color: "white" }}
            data-testid="button-download-dollhouse-html"
          >
            <Download className="w-3.5 h-3.5" />
            Download HTML
          </button>
        )}
      </div>

      <div className="p-4">
        {status === "idle" && (
          <div className="flex flex-col items-center text-center py-6 gap-4">
            <p className="text-sm max-w-sm" style={{ color: "#6B6B6B" }}>
              Byg et Funda-agtigt dukkehus med <strong>rigtige lodrette vægge</strong> rejst op fra plantegningen — drej, zoom og skær vægge væk for at kigge ind.
            </p>
            <button
              onClick={generate}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-opacity hover:opacity-85"
              style={{ background: "#C8956C", color: "white" }}
              data-testid="button-generate-dollhouse"
            >
              <Boxes className="w-4 h-4" />
              Byg dukkehus
            </button>
          </div>
        )}

        {status === "loading" && (
          <div className="flex flex-col items-center text-center py-8 gap-3">
            <Loader2 className="w-7 h-7 animate-spin" style={{ color: "#C8956C" }} />
            <p className="text-sm" style={{ color: "#6B6B6B" }}>
              Finder vægge og bygger 3D-model…
            </p>
          </div>
        )}

        {status === "error" && (
          <div className="flex flex-col items-center text-center py-6 gap-3">
            <AlertCircle className="w-6 h-6" style={{ color: "#B91C1C" }} />
            <p className="text-sm" style={{ color: "#B91C1C" }}>{errorMsg}</p>
            <button
              onClick={generate}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold border transition-colors hover:bg-[#F0EDE7]"
              style={{ borderColor: "#E8E4DE", color: "#0F1D2F" }}
              data-testid="button-retry-dollhouse"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Prøv igen
            </button>
          </div>
        )}

        {status === "ready" && blobUrlRef.current && (
          <div className="flex flex-col gap-3">
            <div
              className="rounded-xl overflow-hidden border"
              style={{ borderColor: "#E8E4DE", aspectRatio: "16/9" }}
            >
              <iframe
                src={blobUrlRef.current}
                className="w-full h-full border-0"
                title="Dukkehus 3D plantegning"
                data-testid="iframe-dollhouse-viewer"
                allow="accelerometer"
              />
            </div>
            <p className="text-xs text-center" style={{ color: "#9B9690" }}>
              Skift mellem 3D og 2D · Træk i "Skær vægge" for at kigge ind ovenfra
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
