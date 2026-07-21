import { useState, useRef, useCallback, useEffect, useMemo, type MouseEvent as ReactMouseEvent, type CSSProperties } from "react";
import { CrmView } from "@/components/crm-view";
import { EnterpriseCalculator } from "@/components/enterprise-calculator";
import { BeforeAfterSlider } from "@/components/before-after-slider";
import { BOLIG_ROOM_LABELS, BOLIG_STYLE_LABELS } from "@shared/boligPrompts";
import formaEstatesLogo from "@assets/forma-estates-logo.png";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { signOut, sendPasswordResetEmail, updateProfile, deleteUser } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { PaywallBanner, PaywallAction, PaywallPage } from "@/components/paywall-gate";
import { Floorplan3DViewer } from "@/components/floorplan-3d-viewer";
import { FloorplanDollhouseViewer } from "@/components/floorplan-dollhouse-viewer";
import { QuotaWidget, useQuotaData, QuotaGate } from "@/components/quota-widget";
import {
  Upload, X, ChevronLeft, ChevronRight, Download, Search, Home,
  LayoutDashboard, FolderOpen, Users, Settings, CreditCard, Plus,
  ArrowUpRight, Check, LogOut, Trash2, ArrowRight, TrendingUp,
  CheckCircle2, BarChart3, ImageIcon, PackageCheck, PartyPopper,
  PenTool, Sparkles, RotateCcw, ChevronDown, Mail, Copy, CheckCheck,
  Shield, UserPlus, Crown, Clock, Building2, Coins, Lock,
  User as UserIcon, Palette, SlidersHorizontal, Bell, KeyRound, Activity,
  FileText, FileImage, Box, Boxes, Video, ArrowLeft, Film, GripVertical, MapPin, Music, Play,
  Share2, Sun, Leaf, Snowflake, Flower2, CalendarDays,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
type Section = "dashboard" | "upload" | "showcase-video" | "historik" | "sager" | "solgte" | "sag-detail" | "ai-design-agent" | "3d-plantegning" | "transformering-video" | "ai-boligfremvisning" | "team" | "indstillinger" | "pris" | "fakturering" | "crm";
type Modal = "newSag" | null;
type Stage = "upload" | "config" | "loading" | "result";

interface BillingInvoice {
  invoiceNumber: string;
  date: string;
  period: string;
  description: string;
  type: "subscription" | "package";
  amountTotal: number;
  amountExclVat: number;
  vatAmount: number;
  vatRate: number;
  currency: string;
  status: string;
  sessionId: string | null;
  stripeInvoiceUrl: string | null;
}
interface BillingSubscriptionInfo {
  active: boolean;
  tier: string;
  tierName: string;
  startDate: string | null;
  nextBillingDate: string | null;
  amount: number | null;
  currency: string;
  cancelAtPeriodEnd: boolean;
  cancelAt: string | null;
  stripeSubscriptionId: string | null;
  paused: boolean;
}
interface BillingOverview {
  subscription: BillingSubscriptionInfo | null;
  invoices: BillingInvoice[];
  customer: { email: string; name: string | null };
}

interface ApiCase {
  id: number;
  userId: number;
  address: string;
  caseNo: string | null;
  notes: string | null;
  status: string;
  marketDateISO: string;
  soldDateISO: string | null;
  createdAt: string;
  updatedAt: string | null;
  imageCount: number;
  latestImageUrl: string | null;
}

interface ApiCaseImage {
  id: number;
  caseId: number;
  style: string;
  room: string;
  tier: string | null;
  promptUsed: string | null;
  src: string;
  beforeSrc: string | null;
  daysAfterMarket: number;
  createdAt: string;
}

// ── Media type helper ─────────────────────────────────────────────────────────
function isVideoUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);
}

// ── Download helper ───────────────────────────────────────────────────────────
function slugifyForFilename(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/æ/g, "ae").replace(/ø/g, "o").replace(/å/g, "a")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
function buildImageFilename(opts: { address?: string | null; room?: string | null; style?: string | null; ext?: string }): string {
  const date = new Date().toISOString().slice(0, 10);
  const parts = [opts.address, opts.room, opts.style].map(slugifyForFilename).filter(Boolean);
  const stem = parts.length > 0 ? parts.join("-") : "visualisering";
  const ext = (opts.ext || "jpg").replace(/^\./, "");
  return `${stem}-${date}.${ext}`;
}
async function fetchImageAsDataUrl(url: string): Promise<{ dataUrl: string; w: number; h: number; mime: string } | null> {
  try {
    // External images (Collov CDN m.fl.) cannot be fetched directly from the
    // browser in production (no CORS headers) — route them through our own
    // proxy. plain=1 + auth token skips the burned-in watermark so the PDF's
    // own vector watermark doesn't get doubled (and FØR stays unbranded).
    let fetchUrl = url;
    let init: RequestInit = { mode: "cors", credentials: "omit" };
    if (url.startsWith("http") && !url.startsWith(window.location.origin)) {
      const token = await auth.currentUser?.getIdToken().catch(() => undefined);
      fetchUrl = `/api/proxy-image?url=${encodeURIComponent(url)}&plain=1`;
      init = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
    }
    const res = await fetch(fetchUrl, init);
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl: string = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as string);
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
    const dims: { w: number; h: number } = await new Promise((resolve) => {
      const im = new Image();
      im.onload = () => resolve({ w: im.naturalWidth, h: im.naturalHeight });
      im.onerror = () => resolve({ w: 1600, h: 1067 });
      im.src = dataUrl;
    });
    return { dataUrl, w: dims.w, h: dims.h, mime: blob.type || "image/jpeg" };
  } catch {
    return null;
  }
}
async function downloadCasePdf(opts: {
  url: string;
  beforeUrl?: string | null;
  address?: string | null;
  room?: string | null;
  style?: string | null;
  mode?: "presentation" | "images-only";
}): Promise<{ ok: boolean; error?: string }> {
  if (!opts.url) return { ok: false, error: "Intet billede" };
  const mode = opts.mode ?? "presentation";
  try {
    const { jsPDF } = await import("jspdf");
    const after = await fetchImageAsDataUrl(opts.url);
    if (!after) return { ok: false, error: "Kunne ikke hente billede" };
    const before = opts.beforeUrl ? await fetchImageAsDataUrl(opts.beforeUrl) : null;

    // Images-only mode: a single PDF page that is exactly the after-image at
    // its original aspect ratio — no margins, no text, no branding. The page
    // size matches the image so it crops cleanly for social media or reuse.
    if (mode === "images-only") {
      const mmPerPx = 25.4 / 150; // assume 150 DPI for sane page dimensions
      const pageW = Math.max(50, after.w * mmPerPx);
      const pageH = Math.max(50, after.h * mmPerPx);
      const pdfImg = new jsPDF({
        orientation: pageW >= pageH ? "landscape" : "portrait",
        unit: "mm",
        format: [pageW, pageH],
      });
      pdfImg.addImage(after.dataUrl, "JPEG", 0, 0, pageW, pageH, undefined, "FAST");
      // Watermark for images-only mode
      const drawWatermarkImg = (imgX: number, imgY: number, imgW: number, imgH: number) => {
        const label = "AI-redigeret";
        const fs = Math.max(6.5, imgH * 0.032);
        const approxW = fs * 5.6;
        const boxH = fs * 1.55;
        const padX = 1.8;
        const padBottom = imgH * 0.022;
        const bx = imgX + imgW - approxW - padX - 1;
        const by = imgY + imgH - boxH - padBottom;
        pdfImg.saveGraphicsState();
        (pdfImg as any).setGState(new (pdfImg as any).GState({ opacity: 0.55 }));
        pdfImg.setFillColor(0, 0, 0);
        pdfImg.roundedRect(bx, by, approxW + 2, boxH, 0.8, 0.8, "F");
        pdfImg.restoreGraphicsState();
        pdfImg.setFont("helvetica", "bold");
        pdfImg.setFontSize(fs);
        pdfImg.setTextColor(255, 255, 255);
        pdfImg.text(label, imgX + imgW - padX - 0.5, by + boxH - fs * 0.38, { align: "right" });
      };
      drawWatermarkImg(0, 0, pageW, pageH);
      const filenameImg = buildImageFilename({ address: opts.address, room: opts.room, style: opts.style, ext: "pdf" });
      pdfImg.save(filenameImg);
      return { ok: true };
    }

    const roomLabel = opts.room ? (BOLIG_ROOM_LABELS[opts.room] || opts.room) : "";
    const styleLabel = opts.style ? (BOLIG_STYLE_LABELS[opts.style] || opts.style) : "";
    const dateStr = new Date().toLocaleDateString("da-DK", { day: "2-digit", month: "long", year: "numeric" });

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 16;
    const navy = [15, 29, 47] as const;
    const muted = [107, 107, 107] as const;
    const accent = [200, 149, 108] as const;

    const drawWatermark = (imgX: number, imgY: number, imgW: number, imgH: number) => {
      const label = "AI-redigeret";
      const fs = 6.5;
      const approxW = 19;
      const boxH = 4.2;
      const padX = 1.4;
      const bx = imgX + imgW - approxW - padX;
      const by = imgY + imgH - boxH - 1.8;
      pdf.saveGraphicsState();
      (pdf as any).setGState(new (pdf as any).GState({ opacity: 0.45 }));
      pdf.setFillColor(0, 0, 0);
      pdf.roundedRect(bx, by, approxW, boxH, 0.8, 0.8, "F");
      pdf.restoreGraphicsState();
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(fs);
      pdf.setTextColor(255, 255, 255);
      pdf.text(label, imgX + imgW - padX - 0.5, by + boxH - 1.1, { align: "right" });
      pdf.setTextColor(navy[0], navy[1], navy[2]);
    };

    const drawFooter = () => {
      pdf.setDrawColor(217, 213, 207);
      pdf.setLineWidth(0.2);
      pdf.line(margin, pageH - 14, pageW - margin, pageH - 14);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7.5);
      pdf.setTextColor(muted[0], muted[1], muted[2]);
      pdf.text(
        "Billederne er AI-genererede visualiseringer og skal ses som inspiration. Det endelige resultat kan variere.",
        margin, pageH - 9, { maxWidth: pageW - margin * 2 }
      );
      const pageNo = (pdf as any).internal.getCurrentPageInfo?.().pageNumber;
      pdf.text(pageNo ? `Forma Estates · Side ${pageNo}` : "Forma Estates", pageW - margin, pageH - 5, { align: "right" });
    };

    // ── Page 1: Cover ────────────────────────────────────────────────────────
    pdf.setFillColor(15, 29, 47);
    pdf.rect(0, 0, pageW, 6, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.setTextColor(accent[0], accent[1], accent[2]);
    pdf.text("AI BOLIGPOTENTIALE", margin, 22);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(28);
    pdf.setTextColor(navy[0], navy[1], navy[2]);
    pdf.text("AI-visualisering", margin, 42, { maxWidth: pageW - margin * 2 });
    pdf.text("af boligens potentiale", margin, 54, { maxWidth: pageW - margin * 2 });
    pdf.setDrawColor(accent[0], accent[1], accent[2]);
    pdf.setLineWidth(0.8);
    pdf.line(margin, 62, margin + 40, 62);
    if (opts.address) {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(14);
      pdf.setTextColor(navy[0], navy[1], navy[2]);
      pdf.text(opts.address, margin, 76, { maxWidth: pageW - margin * 2 });
    }
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(muted[0], muted[1], muted[2]);
    let metaY = opts.address ? 84 : 76;
    if (roomLabel || styleLabel) {
      pdf.text([roomLabel, styleLabel].filter(Boolean).join(" · "), margin, metaY);
      metaY += 6;
    }
    pdf.text(dateStr, margin, metaY);
    // Hero thumbnail on cover
    const heroMaxW = pageW - margin * 2;
    const heroMaxH = pageH - metaY - 30;
    const heroRatio = after.w / after.h;
    let heroW = heroMaxW, heroH = heroMaxW / heroRatio;
    if (heroH > heroMaxH) { heroH = heroMaxH; heroW = heroMaxH * heroRatio; }
    const heroX = (pageW - heroW) / 2;
    const heroY = metaY + 8;
    pdf.addImage(after.dataUrl, "JPEG", heroX, heroY, heroW, heroH, undefined, "FAST");
    drawWatermark(heroX, heroY, heroW, heroH);
    drawFooter();

    // ── Page 2: Før / Efter (or large single) ────────────────────────────────
    pdf.addPage();
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(16);
    pdf.setTextColor(navy[0], navy[1], navy[2]);
    pdf.text("Visualisering" + (roomLabel ? ` af ${roomLabel.toLowerCase()}` : "") + (styleLabel ? ` i ${styleLabel.toLowerCase()}` : ""), margin, 22, { maxWidth: pageW - margin * 2 });
    pdf.setDrawColor(accent[0], accent[1], accent[2]);
    pdf.setLineWidth(0.6);
    pdf.line(margin, 26, margin + 30, 26);
    const imgTop = 36;
    const imgBottom = pageH - 22;
    if (before) {
      const half = (pageW - margin * 2 - 6) / 2;
      const drawHalf = (img: { dataUrl: string; w: number; h: number }, x: number, label: string, addWatermark: boolean) => {
        const r = img.w / img.h;
        let w = half, h = half / r;
        const maxH = imgBottom - imgTop - 8;
        if (h > maxH) { h = maxH; w = maxH * r; }
        const ox = x + (half - w) / 2;
        pdf.addImage(img.dataUrl, "JPEG", ox, imgTop, w, h, undefined, "FAST");
        if (addWatermark) drawWatermark(ox, imgTop, w, h);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(9);
        pdf.setTextColor(accent[0], accent[1], accent[2]);
        pdf.text(label, x + half / 2, imgTop + h + 6, { align: "center" });
      };
      drawHalf(before, margin, "FØR", false);
      drawHalf(after, margin + half + 6, "EFTER", true);
    } else {
      const maxW = pageW - margin * 2;
      const maxH = imgBottom - imgTop;
      const r = after.w / after.h;
      let w = maxW, h = maxW / r;
      if (h > maxH) { h = maxH; w = maxH * r; }
      const singleX = (pageW - w) / 2;
      pdf.addImage(after.dataUrl, "JPEG", singleX, imgTop, w, h, undefined, "FAST");
      drawWatermark(singleX, imgTop, w, h);
    }
    drawFooter();

    const filename = buildImageFilename({ address: opts.address, room: opts.room, style: opts.style, ext: "pdf" });
    pdf.save(filename);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Ukendt fejl" };
  }
}
function triggerBlobDownload(blob: Blob, filename: string) {
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objUrl; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(objUrl);
}
async function downloadImageFile(
  url: string,
  opts: { address?: string | null; room?: string | null; style?: string | null; format?: "jpg" | "png" } = {}
): Promise<void> {
  if (!url) return;
  const format = opts.format ?? "jpg";
  const filename = buildImageFilename({ address: opts.address, room: opts.room, style: opts.style, ext: format });
  // Server proxy handles both fetching (CORS) and format conversion (JPG/PNG).
  const fetchUrl = url.startsWith("http")
    ? `/api/proxy-image?url=${encodeURIComponent(url)}&format=${format}`
    : url;
  try {
    const res = await fetch(fetchUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    triggerBlobDownload(blob, filename);
  } catch {
    // Last-resort fallback — should rarely happen.
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.target = "_blank"; a.rel = "noopener noreferrer";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }
}

// ── Download buttons (JPG / PNG / PDF billeder / PDF præsentation) ───────────
type DownloadMenuVariant = "icon-dark" | "pill-outline" | "pill-light" | "primary";
type DownloadKind = "jpg" | "png" | "pdf-images" | "pdf-presentation";
function DownloadMenu(props: {
  url: string;
  beforeUrl?: string | null;
  address?: string | null;
  room?: string | null;
  style?: string | null;
  variant: DownloadMenuVariant;
  testIdPrefix: string;
  stopPropagation?: boolean;
}) {
  const { url, beforeUrl, address, room, style, variant, testIdPrefix, stopPropagation } = props;
  const [busy, setBusy] = useState<DownloadKind | null>(null);

  const run = (kind: DownloadKind) => async (e: ReactMouseEvent) => {
    if (stopPropagation) e.stopPropagation();
    if (busy) return;
    setBusy(kind);
    try {
      if (kind === "jpg" || kind === "png") {
        await downloadImageFile(url, { address, room, style, format: kind });
      } else {
        const mode = kind === "pdf-images" ? "images-only" : "presentation";
        const r = await downloadCasePdf({ url, beforeUrl, address, room, style, mode });
        if (!r.ok) alert("PDF'en kunne ikke genereres. Prøv igen.");
      }
    } finally {
      setBusy(null);
    }
  };

  const items: { kind: DownloadKind; label: string; short: string; Icon: typeof Download; tone: "neutral" | "accent" }[] = [
    { kind: "jpg",              label: "JPG",                 short: "JPG", Icon: ImageIcon, tone: "neutral" },
    { kind: "png",              label: "PNG",                 short: "PNG", Icon: ImageIcon, tone: "neutral" },
    { kind: "pdf-images",       label: "PDF (kun billeder)",  short: "PDF", Icon: FileImage, tone: "neutral" },
    { kind: "pdf-presentation", label: "PDF præsentation",    short: "PDF+", Icon: FileText, tone: "accent" },
  ];

  if (variant === "icon-dark") {
    return (
      <div className="flex gap-1">
        {items.map((it) => {
          const isPresentation = it.tone === "accent";
          const loading = busy === it.kind;
          return (
            <button
              key={it.kind}
              type="button"
              onClick={run(it.kind)}
              disabled={busy !== null}
              title={it.label}
              data-testid={`${testIdPrefix}-${it.kind}`}
              className="h-7 px-2 rounded-full flex items-center gap-1 text-[10px] font-bold disabled:opacity-50"
              style={{
                background: isPresentation ? "rgba(200,149,108,0.95)" : "rgba(0,0,0,0.55)",
                color: "#fff",
              }}
            >
              <it.Icon className="w-3 h-3" />
              <span>{loading ? "…" : it.short}</span>
            </button>
          );
        })}
      </div>
    );
  }

  const sizeCls =
    variant === "primary"        ? "h-11 px-4 text-sm" :
    variant === "pill-outline"   ? "h-11 px-4 text-sm" :
                                   "h-8 px-3 text-xs";
  const baseCls = `${sizeCls} rounded-full font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50`;
  const styleFor = (it: typeof items[number]): { cls: string; style: CSSProperties } => {
    const isPresentation = it.tone === "accent";
    if (variant === "primary") {
      return isPresentation
        ? { cls: `${baseCls} text-white hover:opacity-90`, style: { background: "#C8956C" } }
        : { cls: `${baseCls} text-white hover:opacity-90`, style: { background: "#0F1D2F" } };
    }
    if (variant === "pill-outline") {
      return isPresentation
        ? { cls: `${baseCls} text-white hover:opacity-90`,             style: { background: "#C8956C" } }
        : { cls: `${baseCls} border-2 border-[#D9D5CF] hover:border-[#C8956C]`, style: { color: "#0F1D2F" } };
    }
    // pill-light (lightbox over dark background)
    return isPresentation
      ? { cls: `${baseCls} text-white hover:opacity-90`,                                style: { background: "#C8956C" } }
      : { cls: `${baseCls} hover:bg-white/10`,                                          style: { color: "#C8956C", border: "1px solid rgba(200,149,108,0.4)" } };
  };
  const iconSize = variant === "pill-light" ? "w-3.5 h-3.5" : "w-4 h-4";

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it) => {
        const s = styleFor(it);
        const loading = busy === it.kind;
        return (
          <button
            key={it.kind}
            type="button"
            onClick={run(it.kind)}
            disabled={busy !== null}
            data-testid={`${testIdPrefix}-${it.kind}`}
            className={s.cls}
            style={s.style}
          >
            <it.Icon className={iconSize} />
            <span>{loading ? "Henter..." : it.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Del-knap: opret offentligt før/efter-link og kopiér til udklipsholder ────
function ShareButton(props: {
  caseImageId: number;
  variant: "icon-dark" | "pill-light";
  testId: string;
  stopPropagation?: boolean;
}) {
  const [state, setState] = useState<"idle" | "busy" | "copied" | "error">("idle");

  const share = async (e: ReactMouseEvent) => {
    if (props.stopPropagation) e.stopPropagation();
    if (state === "busy") return;
    setState("busy");
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/bolig/share", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ generatedImageId: props.caseImageId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.url) throw new Error(json.message || "Kunne ikke oprette link");
      const abs = json.url.startsWith("http") ? json.url : `${window.location.origin}${json.url}`;
      try {
        await navigator.clipboard.writeText(abs);
      } catch {
        window.prompt("Kopiér linket:", abs);
      }
      setState("copied");
      setTimeout(() => setState("idle"), 2500);
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 2500);
    }
  };

  const label = state === "copied" ? "Link kopieret!" : state === "error" ? "Fejl — prøv igen" : "Del";
  if (props.variant === "icon-dark") {
    return (
      <button
        type="button"
        onClick={share}
        disabled={state === "busy"}
        title="Del før/efter-link"
        data-testid={props.testId}
        className="h-7 px-2 rounded-full flex items-center gap-1 text-[10px] font-bold text-white disabled:opacity-50"
        style={{ background: state === "copied" ? "rgba(45,106,79,0.95)" : "rgba(15,29,47,0.85)" }}
      >
        {state === "copied" ? <CheckCheck className="w-3 h-3" /> : <Share2 className="w-3 h-3" />}
        <span>{state === "busy" ? "…" : state === "copied" ? "Kopieret" : "Del"}</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={share}
      disabled={state === "busy"}
      data-testid={props.testId}
      className="h-8 px-3 rounded-full font-semibold text-xs flex items-center gap-1.5 hover:bg-white/10 transition-colors disabled:opacity-50"
      style={
        state === "copied"
          ? { color: "#7BC49A", border: "1px solid rgba(123,196,154,0.5)" }
          : { color: "#C8956C", border: "1px solid rgba(200,149,108,0.4)" }
      }
    >
      {state === "copied" ? <CheckCheck className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
      <span>{state === "busy" ? "Opretter…" : label}</span>
    </button>
  );
}

// ── Sælgerrapport-PDF: hele sagen som præsentation til sælgermødet ───────────
async function downloadSellerReportPdf(opts: {
  address: string;
  caseNo?: string | null;
  marketDateISO: string;
  liveDays: number;
  images: ApiCaseImage[];
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const stills = opts.images.filter((i) => !isVideoUrl(i.src) && !i.style?.startsWith("showcase-video-")).slice(0, 10);
    if (stills.length === 0) return { ok: false, error: "Sagen har ingen billeder til rapporten" };
    const { jsPDF } = await import("jspdf");

    const fetched: { img: ApiCaseImage; after: NonNullable<Awaited<ReturnType<typeof fetchImageAsDataUrl>>>; before: Awaited<ReturnType<typeof fetchImageAsDataUrl>> }[] = [];
    for (const img of stills) {
      const after = await fetchImageAsDataUrl(img.src);
      if (!after) continue;
      const before = img.beforeSrc ? await fetchImageAsDataUrl(img.beforeSrc) : null;
      fetched.push({ img, after, before });
    }
    if (fetched.length === 0) return { ok: false, error: "Billederne kunne ikke hentes" };

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 16;
    const navy = [15, 29, 47] as const;
    const muted = [107, 107, 107] as const;
    const accent = [200, 149, 108] as const;
    const dateStr = new Date().toLocaleDateString("da-DK", { day: "2-digit", month: "long", year: "numeric" });
    const marketDateStr = new Date(opts.marketDateISO).toLocaleDateString("da-DK", { day: "2-digit", month: "long", year: "numeric" });

    const drawWatermark = (imgX: number, imgY: number, imgW: number, imgH: number) => {
      const label = "AI-redigeret";
      const fs = 6.5;
      const approxW = 19;
      const boxH = 4.2;
      const padX = 1.4;
      const bx = imgX + imgW - approxW - padX;
      const by = imgY + imgH - boxH - 1.8;
      pdf.saveGraphicsState();
      (pdf as any).setGState(new (pdf as any).GState({ opacity: 0.45 }));
      pdf.setFillColor(0, 0, 0);
      pdf.roundedRect(bx, by, approxW, boxH, 0.8, 0.8, "F");
      pdf.restoreGraphicsState();
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(fs);
      pdf.setTextColor(255, 255, 255);
      pdf.text(label, imgX + imgW - padX - 0.5, by + boxH - 1.1, { align: "right" });
      pdf.setTextColor(navy[0], navy[1], navy[2]);
    };

    const drawFooter = () => {
      pdf.setDrawColor(217, 213, 207);
      pdf.setLineWidth(0.2);
      pdf.line(margin, pageH - 14, pageW - margin, pageH - 14);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7.5);
      pdf.setTextColor(muted[0], muted[1], muted[2]);
      pdf.text(
        "Billederne er AI-genererede visualiseringer og skal ses som inspiration. Det endelige resultat kan variere.",
        margin, pageH - 9, { maxWidth: pageW - margin * 2 }
      );
      const pageNo = (pdf as any).internal.getCurrentPageInfo?.().pageNumber;
      pdf.text(pageNo ? `Forma Estates · Side ${pageNo}` : "Forma Estates", pageW - margin, pageH - 5, { align: "right" });
    };

    // ── Forside ──────────────────────────────────────────────────────────────
    pdf.setFillColor(navy[0], navy[1], navy[2]);
    pdf.rect(0, 0, pageW, 6, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.setTextColor(accent[0], accent[1], accent[2]);
    pdf.text("SÆLGERRAPPORT · AI BOLIGPOTENTIALE", margin, 22);
    pdf.setFontSize(28);
    pdf.setTextColor(navy[0], navy[1], navy[2]);
    pdf.text("Boligens fulde", margin, 42);
    pdf.text("potentiale — visualiseret", margin, 54, { maxWidth: pageW - margin * 2 });
    pdf.setDrawColor(accent[0], accent[1], accent[2]);
    pdf.setLineWidth(0.8);
    pdf.line(margin, 62, margin + 40, 62);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(14);
    pdf.text(opts.address, margin, 74, { maxWidth: pageW - margin * 2 });
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(muted[0], muted[1], muted[2]);
    let metaY = 82;
    if (opts.caseNo) { pdf.text(`Sagsnr. ${opts.caseNo}`, margin, metaY); metaY += 6; }
    pdf.text(`På markedet siden ${marketDateStr} (${opts.liveDays} dage)`, margin, metaY); metaY += 6;
    pdf.text(`${fetched.length} AI-visualisering${fetched.length !== 1 ? "er" : ""} · Udarbejdet ${dateStr}`, margin, metaY); metaY += 4;

    const hero = fetched[0].after;
    const heroMaxW = pageW - margin * 2;
    const heroMaxH = pageH - metaY - 34;
    const heroRatio = hero.w / hero.h;
    let heroW = heroMaxW, heroH = heroMaxW / heroRatio;
    if (heroH > heroMaxH) { heroH = heroMaxH; heroW = heroMaxH * heroRatio; }
    const heroX = (pageW - heroW) / 2;
    const heroY = metaY + 8;
    pdf.addImage(hero.dataUrl, "JPEG", heroX, heroY, heroW, heroH, undefined, "FAST");
    drawWatermark(heroX, heroY, heroW, heroH);
    drawFooter();

    // ── Én side pr. visualisering ────────────────────────────────────────────
    for (const { img, after, before } of fetched) {
      pdf.addPage();
      const roomLabel = BOLIG_ROOM_LABELS[img.room] || img.room;
      const styleLabel = BOLIG_STYLE_LABELS[img.style] || img.style;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(16);
      pdf.setTextColor(navy[0], navy[1], navy[2]);
      pdf.text(`${roomLabel} — ${styleLabel}`, margin, 22, { maxWidth: pageW - margin * 2 });
      pdf.setDrawColor(accent[0], accent[1], accent[2]);
      pdf.setLineWidth(0.6);
      pdf.line(margin, 26, margin + 30, 26);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.setTextColor(muted[0], muted[1], muted[2]);
      pdf.text(`Genereret dag ${img.daysAfterMarket} på markedet`, margin, 32);
      const imgTop = 38;
      const imgBottom = pageH - 22;
      if (before) {
        const half = (pageW - margin * 2 - 6) / 2;
        const drawHalf = (im: { dataUrl: string; w: number; h: number }, x: number, label: string, addWatermark: boolean) => {
          const r = im.w / im.h;
          let w = half, h = half / r;
          const maxH = imgBottom - imgTop - 8;
          if (h > maxH) { h = maxH; w = maxH * r; }
          const ox = x + (half - w) / 2;
          pdf.addImage(im.dataUrl, "JPEG", ox, imgTop, w, h, undefined, "FAST");
          if (addWatermark) drawWatermark(ox, imgTop, w, h);
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(9);
          pdf.setTextColor(accent[0], accent[1], accent[2]);
          pdf.text(label, x + half / 2, imgTop + h + 6, { align: "center" });
        };
        drawHalf(before, margin, "FØR", false);
        drawHalf(after, margin + half + 6, "EFTER", true);
      } else {
        const maxW = pageW - margin * 2;
        const maxH = imgBottom - imgTop;
        const r = after.w / after.h;
        let w = maxW, h = maxW / r;
        if (h > maxH) { h = maxH; w = maxH * r; }
        const singleX = (pageW - w) / 2;
        pdf.addImage(after.dataUrl, "JPEG", singleX, imgTop, w, h, undefined, "FAST");
        drawWatermark(singleX, imgTop, w, h);
      }
      drawFooter();
    }

    // ── Afslutning ───────────────────────────────────────────────────────────
    pdf.addPage();
    pdf.setFillColor(navy[0], navy[1], navy[2]);
    pdf.rect(0, 0, pageW, 6, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.setTextColor(accent[0], accent[1], accent[2]);
    pdf.text("NÆSTE SKRIDT", margin, 26);
    pdf.setFontSize(20);
    pdf.setTextColor(navy[0], navy[1], navy[2]);
    pdf.text("Klar til at vise potentialet frem?", margin, 38, { maxWidth: pageW - margin * 2 });
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10.5);
    pdf.setTextColor(muted[0], muted[1], muted[2]);
    const bullets = [
      "Brug visualiseringerne i boligannoncen og på sociale medier for at fange flere købere.",
      "Vis før/efter-billederne til fremvisninger, så køberne ser boligens muligheder.",
      "Opdater billederne løbende — fx med en sæsonopfriskning, hvis boligen har ligget længe.",
    ];
    let by = 50;
    for (const b of bullets) {
      pdf.setFillColor(accent[0], accent[1], accent[2]);
      pdf.circle(margin + 1.2, by - 1.2, 1.2, "F");
      pdf.text(b, margin + 6, by, { maxWidth: pageW - margin * 2 - 6 });
      by += 14;
    }
    drawFooter();

    const filename = buildImageFilename({ address: opts.address, room: "saelgerrapport", ext: "pdf" });
    pdf.save(filename);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Ukendt fejl" };
  }
}

// ── Constants ─────────────────────────────────────────────────────────────────
const SEASONS = [
  { value: "spring", label: "Forår",   Icon: Flower2 },
  { value: "summer", label: "Sommer",  Icon: Sun },
  { value: "autumn", label: "Efterår", Icon: Leaf },
  { value: "winter", label: "Vinter",  Icon: Snowflake },
] as const;

const ROOM_TYPES = [
  { value: "living room",      label: "Stue" },
  { value: "bedroom",          label: "Soveværelse" },
  { value: "kitchen",          label: "Køkken" },
  { value: "bathroom",         label: "Badeværelse" },
  { value: "dining room",      label: "Spisestue" },
  { value: "home office",      label: "Hjemmekontor" },
  { value: "kids room",        label: "Børneværelse" },
  { value: "studio",           label: "Studio" },
  { value: "game room",        label: "Spillerum" },
  { value: "gym",              label: "Træningsrum" },
  { value: "laundry room",     label: "Vaskerum" },
  { value: "meeting room",     label: "Mødelokale" },
  { value: "spa",              label: "Spa" },
  { value: "outdoor",          label: "Udendørs" },
  { value: "open plan living", label: "Åben stue/spisestue" },
  { value: "entryway",         label: "Entré" },
];

const STYLES = [
  { value: "scandinavian", label: "Skandinavisk" },
  { value: "modern",       label: "Moderne" },
  { value: "luxury",       label: "Luksus" },
  { value: "industrial",   label: "Industriel" },
  { value: "coastal",      label: "Kyst" },
  { value: "bohemian",     label: "Bohemisk" },
  { value: "japandi",      label: "Japandi" },
  { value: "minimalist",   label: "Minimalistisk" },
  { value: "farmhouse",    label: "Landlig" },
];

const BUDGET_TIERS = [
  { value: "tier1", label: "Tier 1 — Budget",   sub: "IKEA / JYSK niveau" },
  { value: "tier2", label: "Tier 2 — Standard", sub: "Mellemklasse" },
  { value: "tier3", label: "Tier 3 — Premium",  sub: "Designermøbler" },
];

const DEFAULT_THUMB = "/bolig-images/living-scandi-before.jpg";

function CaseThumb({ src, alt, className }: { src: string | null; alt?: string; className?: string }) {
  const url = src ?? DEFAULT_THUMB;
  if (url.endsWith(".mp4") || url.includes(".mp4?")) {
    return <video src={url} className={className} muted playsInline autoPlay loop style={{ objectFit: "cover" }} />;
  }
  return <img src={url} alt={alt ?? ""} className={className} onError={(e) => { (e.currentTarget as HTMLImageElement).src = DEFAULT_THUMB; }} />;
}

function timeAgo(dateStr: string | Date): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return "lige nu";
  if (diff < 3600) return `${Math.floor(diff / 60)} min siden`;
  if (diff < 7200) return "1 time siden";
  if (diff < 86400) return `${Math.floor(diff / 3600)} timer siden`;
  if (diff < 172800) return "i går";
  return `${Math.floor(diff / 86400)} dage siden`;
}

function liveDaysFromISO(iso: string, now: number): number {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 86_400_000));
}


// ── Case Detail Panel ─────────────────────────────────────────────────────────
function CaseDetailPanel({
  caseData,
  onBack,
  onDeleted,
  onStatusChanged,
}: {
  caseData: ApiCase;
  onBack: () => void;
  onDeleted: () => void;
  onStatusChanged: (newStatus: string) => void;
}) {
  const queryClient = useQueryClient();
  const [now, setNow] = useState(Date.now());
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [roomType, setRoomType] = useState("living room");
  const [style, setStyle] = useState("scandinavian");
  const [tier, setTier] = useState("tier2");
  const [isDragging, setIsDragging] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [promptUsed, setPromptUsed] = useState<string | null>(null);
  const [processingTime, setProcessingTime] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ title: string; desc: string; confirmLabel: string; onConfirm: () => void; variant?: "danger" | "success" } | null>(null);
  const [activityLightbox, setActivityLightbox] = useState<string | null>(null);
  const [lightboxImg, setLightboxImg] = useState<ApiCaseImage | null>(null);
  const [lbPos, setLbPos] = useState(50);
  const lbRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [genStep, setGenStep] = useState<0|1|2|3>(0);
  const [includePlants, setIncludePlants] = useState(false);
  const [editingMarketDate, setEditingMarketDate] = useState(false);
  const [marketDateDraft, setMarketDateDraft] = useState("");
  const [sellerPdfBusy, setSellerPdfBusy] = useState(false);
  const [seasonBusy, setSeasonBusy] = useState<string | null>(null);
  const [seasonSourceId, setSeasonSourceId] = useState<number | null>(null);
  const [seasonError, setSeasonError] = useState<string | null>(null);
  const [seasonDone, setSeasonDone] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const liveDays = liveDaysFromISO(caseData.marketDateISO, now);

  const { data: images = [], refetch: refetchImages } = useQuery<ApiCaseImage[]>({
    queryKey: ["/api/bolig/cases", caseData.id, "images", auth.currentUser?.uid],
    queryFn: async () => {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/bolig/cases/${caseData.id}/images`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Could not load images");
      return res.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/bolig/cases/${caseData.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Kunne ikke slette sagen");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bolig/cases"] });
      onDeleted();
    },
  });

  const statusMutation = useMutation({
    mutationFn: async (newStatus: "active" | "sold") => {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/bolig/cases/${caseData.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Kunne ikke opdatere status");
      return res.json() as Promise<ApiCase>;
    },
    onSuccess: (updatedCase) => {
      queryClient.setQueryData(["/api/bolig/cases"], (old: ApiCase[] | undefined) =>
        old ? old.map((c) => (c.id === updatedCase.id ? { ...c, ...updatedCase } : c)) : old
      );
      queryClient.invalidateQueries({ queryKey: ["/api/bolig/cases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bolig/stats"] });
      onStatusChanged(updatedCase.status);
    },
  });

  const deleteImageMutation = useMutation({
    mutationFn: async (imageId: number) => {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/bolig/generated-images/${imageId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Kunne ikke slette billedet");
    },
    onSuccess: () => {
      refetchImages();
      queryClient.invalidateQueries({ queryKey: ["/api/bolig/cases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bolig/stats"] });
      setConfirmDialog(null);
    },
  });

  const marketDateMutation = useMutation({
    mutationFn: async (marketDateISO: string) => {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/bolig/cases/${caseData.id}/market-date`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ marketDateISO }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || "Kunne ikke opdatere datoen");
      return json as ApiCase;
    },
    onSuccess: (updatedCase) => {
      queryClient.setQueryData(["/api/bolig/cases"], (old: ApiCase[] | undefined) =>
        old ? old.map((c) => (c.id === updatedCase.id ? { ...c, ...updatedCase } : c)) : old
      );
      queryClient.invalidateQueries({ queryKey: ["/api/bolig/cases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bolig/stats"] });
      setEditingMarketDate(false);
    },
  });

  // Sæsonopfriskning: kun stillbilleder kan bruges som kilde
  const seasonSources = useMemo(
    () => images.filter((i) => !isVideoUrl(i.src) && !i.style?.startsWith("showcase-video-")),
    [images]
  );

  const runSeasonRefresh = async (season: string) => {
    const srcId = seasonSourceId ?? seasonSources[0]?.id;
    if (!srcId || seasonBusy) return;
    setSeasonBusy(season);
    setSeasonError(null);
    setSeasonDone(false);
    try {
      const token = await auth.currentUser?.getIdToken();
      const fd = new FormData();
      fd.append("sourceCaseImageId", String(srcId));
      fd.append("season", season);
      fd.append("caseId", String(caseData.id));
      const res = await fetch("/api/bolig/generate", {
        method: "POST",
        body: fd,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Sæsonopdateringen mislykkedes. Prøv igen.");
      await refetchImages();
      queryClient.invalidateQueries({ queryKey: ["/api/bolig/cases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bolig/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bolig/activity"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bolig/recent-images"] });
      window.dispatchEvent(new Event("quota:refresh"));
      setSeasonDone(true);
      setTimeout(() => setSeasonDone(false), 5000);
    } catch (err: any) {
      setSeasonError(err.message || "Noget gik galt. Prøv igen.");
    } finally {
      setSeasonBusy(null);
    }
  };

  const handleFile = (file: File) => {
    if (!file.type.startsWith("image/")) { setError("Kun billedfiler er tilladt (JPG, PNG)."); return; }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setError(null);
    setResultUrl(null);
  };

  const handleGenerate = async () => {
    if (!imageFile) return;
    setIsGenerating(true);
    setError(null);
    const startTime = Date.now();
    try {
      const token = await auth.currentUser?.getIdToken();
      const fd = new FormData();
      fd.append("image", imageFile);
      fd.append("style", style);
      fd.append("room", roomType);
      fd.append("tier", tier);
      fd.append("caseId", String(caseData.id));
      const res = await fetch("/api/bolig/generate", {
        method: "POST",
        body: fd,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Generering mislykkedes.");
      setResultUrl(data.image_url);
      setPromptUsed(data.prompt_used ?? null);
      setProcessingTime(data.processing_time || Math.round((Date.now() - startTime) / 1000));
      // Auto-saved — immediately refresh gallery and all live-tracking sections
      await refetchImages();
      queryClient.invalidateQueries({ queryKey: ["/api/bolig/cases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bolig/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bolig/activity"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bolig/most-used"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bolig/recent-images"] });
      window.dispatchEvent(new Event("quota:refresh"));
      setGenStep(3);
    } catch (err: any) {
      setError(err.message || "Noget gik galt. Prøv igen.");
    } finally {
      setIsGenerating(false);
    }
  };

  const updateLbPos = useCallback((clientX: number) => {
    if (!lbRef.current) return;
    const rect = lbRef.current.getBoundingClientRect();
    setLbPos(Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)));
  }, []);

  const tierLabel = (t: string) => t === "tier1" ? "Budget" : t === "tier3" ? "Premium" : "Standard";

  return (
    <motion.div key="case-detail" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>

      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div className="flex items-start gap-4 min-w-0">
          <button
            onClick={onBack}
            className="mt-1.5 flex items-center gap-1.5 text-sm hover:opacity-70 transition-opacity flex-shrink-0"
            style={{ color: "#6B6B6B" }}
            data-testid="bolig-case-back"
          >
            <ChevronLeft className="w-4 h-4" /> Tilbage
          </button>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold truncate mb-1" style={{ color: "#0F1D2F", letterSpacing: "-0.02em" }}>{caseData.address}</h1>
            {caseData.caseNo && <p className="text-xs mb-1.5" style={{ color: "#6B6B6B" }}>Sagsnr. {caseData.caseNo}</p>}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full" style={{ background: caseData.status === "active" ? "rgba(45,106,79,0.1)" : "rgba(200,149,108,0.1)", color: caseData.status === "active" ? "#2D6A4F" : "#C8956C" }}>
                {caseData.status === "active" ? "Aktiv — I salg" : "Afsluttet"}
              </span>
              {editingMarketDate ? (
                <span className="inline-flex items-center gap-1.5">
                  <input
                    type="date"
                    value={marketDateDraft}
                    max={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setMarketDateDraft(e.target.value)}
                    className="text-[11px] border rounded-full px-2 py-0.5 outline-none"
                    style={{ borderColor: "#C8956C", color: "#1A1A1A", background: "#fff" }}
                    data-testid="bolig-market-date-input"
                  />
                  <button
                    onClick={() => marketDateDraft && marketDateMutation.mutate(marketDateDraft)}
                    disabled={marketDateMutation.isPending || !marketDateDraft}
                    className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full text-white disabled:opacity-60"
                    style={{ background: "#0F1D2F" }}
                    data-testid="bolig-market-date-save"
                  >
                    {marketDateMutation.isPending ? "..." : "Gem"}
                  </button>
                  <button
                    onClick={() => setEditingMarketDate(false)}
                    className="text-[11px] px-2 py-0.5 rounded-full border border-[#D9D5CF]"
                    style={{ color: "#6B6B6B" }}
                    data-testid="bolig-market-date-cancel"
                  >
                    Annuller
                  </button>
                  {marketDateMutation.isError && (
                    <span className="text-[11px]" style={{ color: "#DC2626" }}>{(marketDateMutation.error as Error)?.message}</span>
                  )}
                </span>
              ) : (
                <button
                  onClick={() => { setMarketDateDraft(caseData.marketDateISO.slice(0, 10)); setEditingMarketDate(true); }}
                  className="text-[11px] px-2.5 py-0.5 rounded-full border border-[#D9D5CF] inline-flex items-center gap-1 hover:border-[#C8956C] transition-colors"
                  style={{ color: "#6B6B6B" }}
                  title="Ret dato for salgsopstart"
                  data-testid="bolig-market-date-edit"
                >
                  <CalendarDays className="w-3 h-3" /> {liveDays} dage på markedet
                </button>
              )}
              {images.length > 0 && (
                <span className="text-[11px] px-2.5 py-0.5 rounded-full border border-[#D9D5CF]" style={{ color: "#6B6B6B" }}>
                  {images.length} visual{images.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            {caseData.notes && <p className="text-xs mt-1.5 max-w-xl" style={{ color: "#6B6B6B" }}>{caseData.notes}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {seasonSources.length > 0 && (
            <button
              onClick={async () => {
                if (sellerPdfBusy) return;
                setSellerPdfBusy(true);
                try {
                  const r = await downloadSellerReportPdf({
                    address: caseData.address,
                    caseNo: caseData.caseNo,
                    marketDateISO: caseData.marketDateISO,
                    liveDays,
                    images,
                  });
                  if (!r.ok) alert(r.error || "Sælgerrapporten kunne ikke genereres. Prøv igen.");
                } finally {
                  setSellerPdfBusy(false);
                }
              }}
              disabled={sellerPdfBusy}
              className="inline-flex items-center gap-2 h-9 px-4 rounded-full text-sm font-medium border transition-colors disabled:opacity-60"
              style={{ borderColor: "rgba(15,29,47,0.25)", color: "#0F1D2F", background: "rgba(15,29,47,0.04)" }}
              title="Download en samlet PDF med alle visualiseringer til sælgermødet"
              data-testid="bolig-seller-report-btn"
            >
              <FileText className="w-3.5 h-3.5" />
              {sellerPdfBusy ? "Genererer..." : "Sælgerrapport"}
            </button>
          )}
          {caseData.status === "active" ? (
            <button
              onClick={() => setConfirmDialog({
                title: "Marker solgt",
                desc: "Du sætter sagen som solgt. Den flyttes til Solgte sager.",
                confirmLabel: "Marker solgt",
                variant: "success",
                onConfirm: () => { statusMutation.mutate("sold"); setConfirmDialog(null); },
              })}
              disabled={statusMutation.isPending}
              className="inline-flex items-center gap-2 h-9 px-4 rounded-full text-sm font-medium border transition-colors disabled:opacity-60"
              style={{ borderColor: "rgba(45,106,79,0.3)", color: "#2D6A4F", background: "rgba(45,106,79,0.06)" }}
              data-testid="bolig-case-mark-sold-btn"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {statusMutation.isPending ? "..." : "Marker solgt"}
            </button>
          ) : (
            <button
              onClick={() => statusMutation.mutate("active")}
              disabled={statusMutation.isPending}
              className="inline-flex items-center gap-2 h-9 px-4 rounded-full text-sm font-medium border transition-colors disabled:opacity-60"
              style={{ borderColor: "rgba(200,149,108,0.4)", color: "#C8956C", background: "rgba(200,149,108,0.08)" }}
              data-testid="bolig-case-reactivate-btn"
            >
              <TrendingUp className="w-3.5 h-3.5" />
              {statusMutation.isPending ? "..." : "Genaktiver"}
            </button>
          )}
          <button
            onClick={() => setConfirmDialog({
              title: "Slet sag",
              desc: `Du sletter nu sagen "${caseData.address}" og alle dens billeder permanent.`,
              confirmLabel: "Slet sag",
              onConfirm: () => deleteMutation.mutate(),
            })}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-full text-sm font-medium border border-red-200 hover:border-red-400 hover:bg-red-50 transition-colors"
            style={{ color: "#DC2626" }}
            data-testid="bolig-case-delete-btn"
          >
            <Trash2 className="w-3.5 h-3.5" /> Slet sag
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* GALLERY VIEW (genStep === 0) */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {genStep === 0 && (
        <div className="grid lg:grid-cols-[60%_40%] gap-6 items-start">

          {/* LEFT: HISTORY GALLERY */}
          <div>
            {images.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed flex flex-col items-center justify-center text-center py-20 px-8" style={{ borderColor: "#D9D5CF", background: "#FAFAF9" }}>
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: "#F0EDE7" }}>
                  <Search className="w-7 h-7" style={{ color: "#C8956C" }} />
                </div>
                <p className="font-semibold mb-2" style={{ color: "#0F1D2F" }}>Ingen genererede billeder endnu</p>
                <p className="text-sm max-w-xs mb-6" style={{ color: "#6B6B6B" }}>Upload et rumfoto og generer dit første AI-potentialebillede</p>
                <button
                  onClick={() => setGenStep(1)}
                  className="h-10 px-6 rounded-full font-semibold text-white text-sm flex items-center gap-2 transition-all hover:-translate-y-0.5"
                  style={{ background: "#0F1D2F" }}
                  data-testid="bolig-gallery-empty-generate"
                >
                  <TrendingUp className="w-4 h-4" /> Generer første billede
                </button>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <p className="text-[10px] font-bold tracking-[0.12em] uppercase" style={{ color: "#9B9690" }}>Genererede billeder</p>
                  <div className="flex-1 h-px" style={{ background: "#E8E4DE" }} />
                  <span className="text-xs" style={{ color: "#9B9690" }}>{images.length} billede{images.length !== 1 ? "r" : ""}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {images.map((img) => (
                    <div
                      key={img.id}
                      className="rounded-xl overflow-hidden border border-[#E8E4DE] bg-white group cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => { setLightboxImg(img); setLbPos(50); }}
                      data-testid={`bolig-history-img-${img.id}`}
                    >
                      <div className="relative aspect-[4/3] overflow-hidden">
                        {isVideoUrl(img.src) ? (
                          <>
                            <video src={img.src} className="w-full h-full object-cover bg-black" muted playsInline preload="metadata" />
                            <div className="absolute top-2 left-2 flex items-center gap-1 text-[10px] font-semibold text-white px-2 py-0.5 rounded-full" style={{ background: "rgba(15,29,47,0.7)" }}>
                              <Video className="w-3 h-3" /> Video
                            </div>
                          </>
                        ) : (
                          <img src={img.src} alt={img.room} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                        )}
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: "rgba(15,29,47,0.4)" }}>
                          <span className="text-white text-[11px] font-semibold px-3 py-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)" }}>
                            {isVideoUrl(img.src) ? "Afspil video" : img.beforeSrc ? "Vis Før / Efter" : "Åbn"}
                          </span>
                        </div>
                        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {img.style?.startsWith("showcase-video-") ? (
                            <>
                              <button
                                type="button"
                                onClick={async (e) => { e.stopPropagation(); const ts = new Date().toISOString().slice(0,10); await downloadFromUrl(img.src, `postklar-${img.style}-${ts}.mp4`); }}
                                title="Download postklar (9:16)"
                                data-testid={`bolig-gallery-download-${img.id}-postklar`}
                                className="h-7 px-2 rounded-full flex items-center gap-1 text-[10px] font-bold text-white"
                                style={{ background: "rgba(15,29,47,0.85)" }}
                              >
                                <Download className="w-3 h-3" /> Postklar
                              </button>
                              {(() => {
                                const origUrl = img.beforeSrc ?? img.src.replace(/\.mp4$/, "-clean.mp4");
                                return (
                                  <button
                                    type="button"
                                    onClick={async (e) => { e.stopPropagation(); const ts = new Date().toISOString().slice(0,10); await downloadFromUrl(origUrl, `original-${img.style}-${ts}.mp4`); }}
                                    title="Download original format"
                                    data-testid={`bolig-gallery-download-${img.id}-original`}
                                    className="h-7 px-2 rounded-full flex items-center gap-1 text-[10px] font-bold"
                                    style={{ background: "rgba(255,255,255,0.88)", color: "#1A1A1A" }}
                                  >
                                    <Download className="w-3 h-3" /> Original
                                  </button>
                                );
                              })()}
                            </>
                          ) : (
                          <>
                          {!isVideoUrl(img.src) && (
                            <ShareButton caseImageId={img.id} variant="icon-dark" testId={`bolig-share-${img.id}`} stopPropagation />
                          )}
                          <DownloadMenu
                            url={img.src}
                            beforeUrl={img.beforeSrc}
                            address={caseData.address}
                            room={img.room}
                            style={img.style}
                            variant="icon-dark"
                            testIdPrefix={`bolig-gallery-download-${img.id}`}
                            stopPropagation
                          />
                          </>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); setConfirmDialog({ title: "Slet billede", desc: "Vil du slette dette billede? Det kan ikke fortrydes.", confirmLabel: "Slet billede", onConfirm: () => deleteImageMutation.mutate(img.id) }); }}
                            className="w-7 h-7 rounded-full flex items-center justify-center"
                            style={{ background: "rgba(220,38,38,0.85)" }}
                            data-testid={`bolig-delete-image-btn-${img.id}`}
                          >
                            <Trash2 className="w-3 h-3 text-white" />
                          </button>
                        </div>
                      </div>
                      <div className="p-3">
                        <p className="text-sm font-semibold mb-1" style={{ color: "#0F1D2F" }}>{img.room}</p>
                        <div className="flex gap-1.5 flex-wrap">
                          <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: "rgba(200,149,108,0.13)", color: "#B07848" }}>{img.style}</span>
                          {img.tier && <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: "rgba(45,106,79,0.08)", color: "#2D6A4F" }}>{tierLabel(img.tier)}</span>}
                          <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: "#F0EDE7", color: "#9B9690" }}>Dag {img.daysAfterMarket}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: QUICK GENERATE + SEASON REFRESH */}
          <div className="flex flex-col gap-6">

          {caseData.status === "active" && liveDays >= 30 && seasonSources.length > 0 && (
            <div className="rounded-2xl border p-6" style={{ background: "#fff", borderColor: "rgba(200,149,108,0.55)", boxShadow: "0 2px 16px rgba(200,149,108,0.1)" }} data-testid="bolig-season-refresh-card">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-[10px] font-bold tracking-[0.12em] uppercase" style={{ color: "#B07848" }}>Sæsonopfriskning</p>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(200,149,108,0.13)", color: "#B07848" }}>{liveDays} dage på markedet</span>
              </div>
              <p className="text-sm mb-4" style={{ color: "#6B6B6B" }}>
                Boligen har ligget over en måned på markedet. Giv annoncen nyt liv med en sæsonopdatering — samme rum og møbler, ny stemning.
              </p>

              {seasonSources.length > 1 && (
                <div className="mb-4">
                  <p className="text-[11px] font-semibold mb-1.5" style={{ color: "#9B9690" }}>Vælg billede</p>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {seasonSources.map((src) => {
                      const selected = (seasonSourceId ?? seasonSources[0].id) === src.id;
                      return (
                        <button
                          key={src.id}
                          onClick={() => !seasonBusy && setSeasonSourceId(src.id)}
                          className="flex-shrink-0 rounded-lg overflow-hidden transition-all"
                          style={{ width: 64, height: 48, border: selected ? "2px solid #C8956C" : "2px solid transparent", opacity: selected ? 1 : 0.6 }}
                          data-testid={`bolig-season-source-${src.id}`}
                        >
                          <img src={src.src} alt={src.room} className="w-full h-full object-cover" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                {SEASONS.map((s) => {
                  const busy = seasonBusy === s.value;
                  return (
                    <button
                      key={s.value}
                      onClick={() => runSeasonRefresh(s.value)}
                      disabled={seasonBusy !== null}
                      className="h-10 rounded-full text-sm font-semibold flex items-center justify-center gap-1.5 border transition-colors disabled:opacity-60"
                      style={{ borderColor: "rgba(200,149,108,0.4)", color: "#B07848", background: busy ? "rgba(200,149,108,0.13)" : "#fff" }}
                      data-testid={`bolig-season-btn-${s.value}`}
                    >
                      {busy ? (
                        <span className="w-3.5 h-3.5 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "#C8956C", borderTopColor: "transparent" }} />
                      ) : (
                        <s.Icon className="w-3.5 h-3.5" />
                      )}
                      {s.label}
                    </button>
                  );
                })}
              </div>

              {seasonBusy && (
                <p className="text-xs mt-3 text-center" style={{ color: "#9B9690" }}>AI'en arbejder — ca. 30–60 sekunder. Billedet gemmes i galleriet.</p>
              )}
              {seasonDone && (
                <p className="text-xs mt-3 text-center font-semibold flex items-center justify-center gap-1" style={{ color: "#2D6A4F" }} data-testid="bolig-season-done">
                  <Check className="w-3.5 h-3.5" /> Sæsonbilledet er gemt i galleriet
                </p>
              )}
              {seasonError && (
                <p className="text-xs mt-3 text-center" style={{ color: "#DC2626" }} data-testid="bolig-season-error">{seasonError}</p>
              )}
            </div>
          )}

          <div className="rounded-2xl border border-[#E8E4DE] p-6 flex flex-col gap-5" style={{ background: "#fff" }}>
            <div>
              <p className="text-[10px] font-bold tracking-[0.12em] uppercase mb-1" style={{ color: "#9B9690" }}>Generer nyt billede</p>
              <p className="text-sm" style={{ color: "#6B6B6B" }}>Upload et rumfoto og lad AI'en vise boligens fulde potentiale</p>
            </div>
            <div className="flex flex-col gap-2 text-sm" style={{ color: "#1A1A1A" }}>
              {[
                { n: "1", label: "Upload et rumfoto" },
                { n: "2", label: "Vælg rum, stil & budget" },
                { n: "3", label: "Se AI-visualisering" },
              ].map((s) => (
                <div key={s.n} className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold flex-shrink-0" style={{ background: "#F0EDE7", color: "#C8956C" }}>{s.n}</span>
                  <span className="text-sm" style={{ color: "#6B6B6B" }}>{s.label}</span>
                </div>
              ))}
            </div>
            <button
              onClick={() => setGenStep(1)}
              className="w-full h-12 rounded-full font-semibold text-white text-sm flex items-center justify-center gap-2 transition-all hover:-translate-y-0.5"
              style={{ background: "#0F1D2F", boxShadow: "0 4px 20px rgba(15,29,47,0.2)" }}
              data-testid="bolig-case-start-generate"
            >
              <TrendingUp className="w-4 h-4" /> Generer potentialebillede
            </button>
            {images.length > 0 && (
              <p className="text-center text-xs" style={{ color: "#9B9690" }}>{images.length} tidligere visual{images.length !== 1 ? "s" : ""} i galleriet</p>
            )}
          </div>

          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* GENERATE FLOW (genStep 1 / 2 / 3) */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {genStep > 0 && (
        <div>
          {/* Step indicator */}
          <div className="flex items-center justify-center gap-2 mb-8">
            {([
              { n: 1, label: "Upload billede" },
              { n: 2, label: "Vælg stil & budget" },
              { n: 3, label: "Resultat" },
            ] as const).map(({ n, label }, idx) => (
              <div key={n} className="flex items-center gap-2">
                {idx > 0 && (
                  <div className="w-10 sm:w-16 h-px" style={{ background: genStep > idx ? "#0F1D2F" : "#D9D5CF" }} />
                )}
                <div className="flex flex-col items-center gap-1">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold transition-all"
                    style={{
                      background: genStep >= n ? "#0F1D2F" : "#F0EDE7",
                      color: genStep >= n ? "#fff" : "#9B9690",
                    }}
                  >
                    {genStep > n ? <Check className="w-3 h-3" /> : n}
                  </div>
                  <span className="text-xs hidden sm:inline" style={{ color: genStep >= n ? "#0F1D2F" : "#9B9690" }}>{label}</span>
                </div>
              </div>
            ))}
          </div>

          <AnimatePresence mode="wait">

            {/* STEP 1 — UPLOAD */}
            {genStep === 1 && (
              <motion.div key="gen-step1" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.28, ease: "easeOut" }}>
                <div className="max-w-xl mx-auto text-center pt-4 pb-10">
                  <h2 className="text-3xl sm:text-4xl font-semibold mb-4" style={{ color: "#0F1D2F", letterSpacing: "-0.02em", lineHeight: 1.1 }}>
                    Upload et rumfoto
                  </h2>
                  <p className="text-[15px] mb-2 max-w-sm mx-auto" style={{ color: "#6B6B6B", lineHeight: 1.7 }}>
                    Tag et foto af rummet — AI'en viser boligens fulde potentiale
                  </p>
                  <div className="flex items-center justify-center gap-4 text-[13px] mb-8">
                    <span className="flex items-center gap-1.5 font-semibold" style={{ color: "#0F1D2F" }}><Check className="w-3.5 h-3.5" style={{ color: "#2D6A4F" }} /> Klar på 30–60 sek</span>
                    <span className="flex items-center gap-1.5" style={{ color: "#6B6B6B" }}><Check className="w-3.5 h-3.5" style={{ color: "#2D6A4F" }} /> Ingen design-erfaring nødvendig</span>
                  </div>

                  {/* Upload box */}
                  <div
                    className="rounded-2xl border transition-all duration-200 cursor-pointer py-16 px-8 flex flex-col items-center"
                    style={{
                      borderColor: isDragging ? "#C8956C" : "#D9D5CF",
                      background: isDragging ? "rgba(200,149,108,0.04)" : "#fff",
                      boxShadow: isDragging ? "0 8px 32px rgba(200,149,108,0.12)" : "0 2px 16px rgba(15,29,47,0.06)",
                    }}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) { handleFile(f); setGenStep(2); } }}
                    onClick={() => fileInputRef.current?.click()}
                    data-testid="bolig-case-upload-zone"
                  >
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) { handleFile(f); setGenStep(2); } }} />
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style={{ background: "rgba(15,29,47,0.04)" }}>
                      <Upload className="w-5 h-5" style={{ color: "#6B6B6B" }} />
                    </div>
                    <p className="text-[15px] font-medium mb-1.5" style={{ color: "#0F1D2F" }}>Klik eller træk et billede hertil</p>
                    <p className="text-sm mb-1" style={{ color: "#6B6B6B" }}>JPG, PNG eller HEIC</p>
                    <p className="text-xs" style={{ color: "#9B9690" }}>Max 10 MB</p>
                  </div>

                  {error && <div className="mt-4 text-sm text-red-600 bg-red-50 p-3 rounded-xl">{error}</div>}

                  {/* Step guide */}
                  <div className="flex items-center justify-center gap-3 mt-8 text-xs" style={{ color: "#9B9690" }}>
                    {["Upload foto", "Vælg stil", "Se resultat"].map((lbl, i) => (
                      <div key={lbl} className="flex items-center gap-3">
                        {i > 0 && <ArrowRight className="w-3 h-3 flex-shrink-0" />}
                        <div className="flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded-full border border-[#D9D5CF] flex items-center justify-center text-[10px] font-semibold">{i + 1}</span>
                          <span className="hidden sm:inline">{lbl}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Example images */}
                  <p className="text-xs mt-8 mb-3" style={{ color: "#6B6B6B" }}>Eller prøv med et eksempelbillede:</p>
                  <div className="flex gap-3 justify-center">
                    {[
                      { src: "/bolig-images/living-scandi-before.jpg", label: "Stue" },
                      { src: "/bolig-images/kitchen-before.jpg", label: "Køkken" },
                      { src: "/bolig-images/living-modern-before.jpg", label: "Stue 2" },
                    ].map((ex) => (
                      <button key={ex.src}
                        onClick={async () => { const r = await fetch(ex.src); const blob = await r.blob(); handleFile(new File([blob], `${ex.label}.jpg`, { type: "image/jpeg" })); setGenStep(2); }}
                        className="relative rounded-xl overflow-hidden border-2 border-[#D9D5CF] hover:border-[#C8956C] transition-all"
                        data-testid={`bolig-example-${ex.label}`}
                      >
                        <img src={ex.src} alt={ex.label} className="w-24 h-16 object-cover" />
                        <div className="absolute inset-0 bg-black/20 flex items-end p-1.5">
                          <span className="text-[10px] text-white font-medium">{ex.label}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex justify-center">
                  <button onClick={() => { setGenStep(0); setError(null); }} className="text-sm hover:opacity-70 transition-opacity" style={{ color: "#9B9690" }}>
                    ← Annuller og gå tilbage
                  </button>
                </div>
              </motion.div>
            )}

            {/* STEP 2 — CONFIGURE */}
            {genStep === 2 && (
              <motion.div key="gen-step2" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.28, ease: "easeOut" }}>
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

                  {/* LEFT col-span-5: image preview */}
                  <div className="lg:col-span-5">
                    <p className="text-xs font-medium tracking-widest uppercase mb-2" style={{ color: "#9B9690" }}>Dit billede</p>
                    <div className="flex items-center gap-2 mb-3">
                      <button
                        onClick={() => { setImageFile(null); setImagePreview(null); setGenStep(1); }}
                        className="h-7 px-2 rounded-lg text-xs hover:opacity-70 transition-opacity border border-[#D9D5CF]"
                        style={{ color: "#6B6B6B" }}
                      >
                        Skift foto
                      </button>
                    </div>
                    {imagePreview && (
                      <img src={imagePreview} alt="Preview" className="rounded-xl border border-[#E8E4DE] w-full object-contain" style={{ maxHeight: "420px" }} />
                    )}
                  </div>

                  {/* RIGHT col-span-7: settings */}
                  <div className="lg:col-span-7 space-y-6">

                    {/* ① RUMTYPE */}
                    <div>
                      <p className="text-xs font-medium tracking-widest uppercase mb-4" style={{ color: "#9B9690" }}>Rumtype</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {ROOM_TYPES.map((r) => (
                          <button
                            key={r.value}
                            onClick={() => setRoomType(r.value)}
                            className="px-3.5 py-2.5 rounded-lg border text-left transition-all"
                            style={{
                              borderColor: roomType === r.value ? "#0F1D2F" : "#D9D5CF",
                              background: roomType === r.value ? "#0F1D2F" : "#fff",
                              color: roomType === r.value ? "#fff" : "rgba(26,26,26,0.7)",
                            }}
                            data-testid={`bolig-room-${r.value}`}
                          >
                            <span className="text-[13px] font-medium truncate block">{r.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="h-px" style={{ background: "#E8E4DE" }} />

                    {/* ② STIL */}
                    <div>
                      <p className="text-xs font-medium tracking-widest uppercase mb-4" style={{ color: "#9B9690" }}>Stil</p>
                      <div className="grid grid-cols-2 gap-2">
                        {STYLES.map((s) => (
                          <button
                            key={s.value}
                            onClick={() => setStyle(s.value)}
                            className="px-3.5 py-3 rounded-lg border text-left transition-all flex flex-col"
                            style={{
                              borderColor: style === s.value ? "#C8956C" : "#D9D5CF",
                              background: style === s.value ? "rgba(200,149,108,0.08)" : "#fff",
                              color: "#1A1A1A",
                            }}
                            data-testid={`bolig-style-${s.value}`}
                          >
                            <span className="text-sm font-medium">{s.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="h-px" style={{ background: "#E8E4DE" }} />

                    {/* ③ BUDGET */}
                    <div>
                      <p className="text-xs font-medium tracking-widest uppercase mb-4" style={{ color: "#9B9690" }}>Budget</p>
                      <div className="flex flex-col gap-2">
                        {BUDGET_TIERS.map((t) => (
                          <button
                            key={t.value}
                            onClick={() => setTier(t.value)}
                            className="flex items-center justify-between px-4 py-3 rounded-lg border transition-all"
                            style={{
                              borderColor: tier === t.value ? "#0F1D2F" : "#D9D5CF",
                              background: tier === t.value ? "#0F1D2F" : "#fff",
                              color: tier === t.value ? "#fff" : "#1A1A1A",
                            }}
                            data-testid={`bolig-tier-${t.value}`}
                          >
                            <span className="text-sm font-medium">{t.label}</span>
                            <span className="text-xs" style={{ opacity: 0.6 }}>{t.sub}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="h-px" style={{ background: "#E8E4DE" }} />

                    {/* ④ INKLUDER PLANTER */}
                    <div
                      className="flex items-center justify-between px-4 py-3 rounded-lg border border-[#E8E4DE] cursor-pointer select-none"
                      style={{ background: "#FAFAF9" }}
                      onClick={() => setIncludePlants(!includePlants)}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg">🌿</span>
                        <div>
                          <p className="text-sm font-medium" style={{ color: "#0F1D2F" }}>Inkluder planter</p>
                          <p className="text-xs" style={{ color: "#9B9690" }}>Tilføj grønne planter til rummet</p>
                        </div>
                      </div>
                      <div
                        className="relative h-6 w-11 rounded-full transition-all flex-shrink-0"
                        style={{ background: includePlants ? "#0F1D2F" : "#D9D5CF" }}
                      >
                        <div
                          className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all"
                          style={{ left: includePlants ? "calc(100% - 1.375rem)" : "2px" }}
                        />
                      </div>
                    </div>

                    {error && (
                      <div className="text-sm text-red-600 p-3 rounded-xl bg-red-50" data-testid="bolig-case-error">{error}</div>
                    )}

                    {/* ⑥ GENERATE BUTTON */}
                    <QuotaGate feature="ai">
                    <button
                      onClick={handleGenerate}
                      disabled={isGenerating}
                      className="w-full h-12 rounded-full font-medium text-white text-sm tracking-wide flex items-center justify-center gap-2 transition-all hover:-translate-y-0.5 disabled:opacity-60 disabled:translate-y-0"
                      style={{ background: "#0F1D2F", boxShadow: "0 4px 20px rgba(15,29,47,0.25)" }}
                      data-testid="bolig-case-generate-btn"
                    >
                      {isGenerating ? (
                        <>
                          <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin inline-block" />
                          Genererer visualisering...
                        </>
                      ) : (
                        <>
                          <TrendingUp className="w-4 h-4" />
                          Se dit rums potentiale →
                        </>
                      )}
                    </button>
                    </QuotaGate>
                  </div>
                </div>

                {isGenerating && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mt-12 flex flex-col items-center justify-center text-center"
                  >
                    <div className="relative w-16 h-16 mb-6">
                      <div className="absolute inset-0 rounded-full border-4" style={{ borderColor: "#F0EDE7" }} />
                      <div className="absolute inset-0 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: "#C8956C", borderTopColor: "transparent" }} />
                    </div>
                    <p className="text-lg font-semibold mb-1" style={{ color: "#0F1D2F" }}>Genererer visualisering...</p>
                    <p className="text-sm" style={{ color: "#6B6B6B" }}>AI'en arbejder. Ca. 30–60 sekunder.</p>
                    <div className="flex gap-8 mt-6">
                      {["Analyserer rum", "Anvender stil", "Renderer"].map((step, i) => (
                        <div key={i} className="flex flex-col items-center gap-2">
                          <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: "#C8956C", animationDelay: `${i * 0.3}s` }} />
                          <span className="text-xs" style={{ color: "#9B9690" }}>{step}</span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}

                {!isGenerating && (
                  <div className="flex justify-center mt-6">
                    <button onClick={() => { setGenStep(1); setError(null); }} className="text-sm hover:opacity-70 transition-opacity" style={{ color: "#9B9690" }}>
                      ← Skift billede
                    </button>
                  </div>
                )}
              </motion.div>
            )}

            {/* STEP 3 — RESULT */}
            {genStep === 3 && resultUrl && (
              <motion.div key="gen-step3" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35, ease: "easeOut" }}>
                <div className="mb-5">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold mb-3" style={{ background: "rgba(45,106,79,0.1)", color: "#2D6A4F" }}>
                    <Check className="w-3 h-3" /> Gemt i galleri{processingTime ? ` · ${processingTime} sek` : ""}
                  </span>
                  <h2 className="text-2xl font-semibold" style={{ color: "#0F1D2F", letterSpacing: "-0.02em" }}>Forvandlingen er klar!</h2>
                  <p className="text-sm mt-1" style={{ color: "#6B6B6B" }}>Træk slideren for at sammenligne før og efter</p>
                </div>
                <div>
                  <BeforeAfterSlider beforeSrc={imagePreview!} afterSrc={resultUrl} />
                  <div className="flex flex-wrap gap-3 mt-5">
                    <button
                      onClick={() => { setResultUrl(null); setImageFile(null); setImagePreview(null); setGenStep(0); }}
                      className="h-11 px-6 rounded-full font-semibold text-white text-sm flex items-center gap-2 transition-all hover:-translate-y-0.5"
                      style={{ background: "#0F1D2F" }}
                      data-testid="bolig-case-back-to-gallery-btn"
                    >
                      <Check className="w-3.5 h-3.5" /> Se i galleri
                    </button>
                    <button onClick={() => { setResultUrl(null); setGenStep(2); }} className="h-11 px-6 rounded-full font-semibold border-2 border-[#D9D5CF] hover:border-[#C8956C] text-sm transition-colors" style={{ color: "#0F1D2F" }}>
                      Generer igen
                    </button>
                    <button onClick={() => { setImageFile(null); setImagePreview(null); setResultUrl(null); setGenStep(1); }} className="h-11 px-6 rounded-full font-semibold border-2 border-[#D9D5CF] hover:border-[#C8956C] text-sm transition-colors" style={{ color: "#6B6B6B" }}>
                      Nyt billede
                    </button>
                    <DownloadMenu
                      url={resultUrl}
                      beforeUrl={imagePreview}
                      address={caseData.address}
                      room={roomType}
                      style={style}
                      variant="pill-outline"
                      testIdPrefix="bolig-case-result-download"
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ── Lightbox modal ── */}
      <AnimatePresence>
        {lightboxImg && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.85)" }}
            onClick={() => setLightboxImg(null)}
            data-testid="bolig-lightbox-overlay"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.18 }}
              className="relative w-full max-w-3xl rounded-2xl overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
              data-testid="bolig-lightbox-modal"
            >
              {isVideoUrl(lightboxImg.src) ? (
                <video
                  src={lightboxImg.src}
                  controls
                  autoPlay
                  loop
                  className="w-full h-auto bg-black"
                  style={{ maxHeight: "70vh" }}
                  data-testid="bolig-lightbox-video"
                />
              ) : lightboxImg.beforeSrc ? (
                <div
                  ref={lbRef}
                  className="relative select-none touch-none cursor-col-resize"
                  onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); updateLbPos(e.clientX); }}
                  onPointerMove={(e) => { if (e.buttons > 0) updateLbPos(e.clientX); }}
                  onPointerUp={() => {}}
                >
                  {/* invisible spacer — sets natural image height */}
                  <img src={lightboxImg.src} alt="" className="w-full h-auto block invisible" style={{ maxHeight: "70vh" }} draggable={false} />
                  {/* after layer */}
                  <img src={lightboxImg.src} alt="Efter" className="absolute inset-0 w-full h-full object-contain" draggable={false} />
                  {/* before layer — clipped to lbPos% */}
                  <div className="absolute top-0 left-0 bottom-0 overflow-hidden" style={{ width: `${lbPos}%` }}>
                    <img
                      src={lightboxImg.beforeSrc}
                      alt="Før"
                      className="absolute top-0 left-0 h-full object-contain"
                      style={{ width: lbRef.current ? `${lbRef.current.offsetWidth}px` : "800px", maxWidth: "none" }}
                      draggable={false}
                    />
                  </div>
                  {/* handle */}
                  <div className="absolute top-0 bottom-0 w-px bg-white/90 z-10" style={{ left: `${lbPos}%`, transform: "translateX(-50%)" }}>
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white shadow-lg flex items-center justify-center">
                      <ChevronLeft className="w-3 h-3" style={{ color: "#0F1D2F" }} />
                      <ChevronRight className="w-3 h-3" style={{ color: "#0F1D2F" }} />
                    </div>
                  </div>
                  <span className="absolute bottom-3 left-3 bg-black/50 text-white text-xs px-2.5 py-1 rounded-full font-medium z-10 pointer-events-none" style={{ opacity: lbPos > 15 ? 1 : 0 }}>Før</span>
                  <span className="absolute bottom-3 right-3 text-white text-xs px-2.5 py-1 rounded-full font-medium z-10 pointer-events-none" style={{ background: "#C8956C", opacity: lbPos < 85 ? 1 : 0 }}>Efter</span>
                </div>
              ) : (
                <img src={lightboxImg.src} alt={lightboxImg.room} className="w-full h-auto" style={{ maxHeight: "70vh", objectFit: "contain" }} />
              )}
              <div className="flex items-center justify-between px-5 py-3" style={{ background: "#0F1D2F" }}>
                <div className="flex gap-2 min-w-0">
                  <span className="text-[11px] font-semibold text-white truncate">{lightboxImg.room}</span>
                  <span className="text-[11px] text-white/60">·</span>
                  <span className="text-[11px] text-white/70 truncate">{lightboxImg.style}</span>
                  {lightboxImg.tier && <><span className="text-[11px] text-white/60">·</span><span className="text-[11px] text-white/70">{tierLabel(lightboxImg.tier)}</span></>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {lightboxImg.style?.startsWith("showcase-video-") ? (
                    <>
                      <button
                        type="button"
                        onClick={async () => { const ts = new Date().toISOString().slice(0,10); await downloadFromUrl(lightboxImg.src, `postklar-${lightboxImg.style}-${ts}.mp4`); }}
                        className="h-8 px-3 rounded-full font-semibold text-xs text-white flex items-center gap-1.5 hover:opacity-80 transition-opacity"
                        style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.25)" }}
                        data-testid="bolig-lightbox-download-postklar"
                      >
                        <Download className="w-3 h-3" /> Postklar ↓
                      </button>
                      {(() => {
                        const origUrl = lightboxImg.beforeSrc ?? lightboxImg.src.replace(/\.mp4$/, "-clean.mp4");
                        return (
                          <button
                            type="button"
                            onClick={async () => { const ts = new Date().toISOString().slice(0,10); await downloadFromUrl(origUrl, `original-${lightboxImg.style}-${ts}.mp4`); }}
                            className="h-8 px-3 rounded-full font-semibold text-xs flex items-center gap-1.5 hover:opacity-80 transition-opacity"
                            style={{ background: "rgba(255,255,255,0.88)", color: "#1A1A1A" }}
                            data-testid="bolig-lightbox-download-original"
                          >
                            <Download className="w-3 h-3" /> Original ↓
                          </button>
                        );
                      })()}
                    </>
                  ) : (
                    <>
                    {!isVideoUrl(lightboxImg.src) && (
                      <ShareButton caseImageId={lightboxImg.id} variant="pill-light" testId="bolig-lightbox-share" stopPropagation />
                    )}
                    <DownloadMenu
                      url={lightboxImg.src}
                      beforeUrl={lightboxImg.beforeSrc}
                      address={caseData.address}
                      room={lightboxImg.room}
                      style={lightboxImg.style}
                      variant="pill-light"
                      testIdPrefix="bolig-lightbox-download"
                      stopPropagation
                    />
                    </>
                  )}
                  <button onClick={() => setLightboxImg(null)} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors" style={{ color: "#fff" }} data-testid="bolig-lightbox-close">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Unified confirm dialog ── */}
      <AnimatePresence>
        {confirmDialog && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.45)" }}
            onClick={() => setConfirmDialog(null)}
            data-testid="bolig-confirm-overlay"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6"
              onClick={(e) => e.stopPropagation()}
              data-testid="bolig-confirm-modal"
            >
              {confirmDialog.variant === "success" ? (
                <div className="w-11 h-11 rounded-full flex items-center justify-center mb-4" style={{ background: "rgba(45,106,79,0.1)" }}>
                  <PartyPopper className="w-5 h-5" style={{ color: "#2D6A4F" }} />
                </div>
              ) : (
                <div className="w-11 h-11 rounded-full flex items-center justify-center mb-4" style={{ background: "rgba(220,38,38,0.08)" }}>
                  <Trash2 className="w-5 h-5" style={{ color: "#DC2626" }} />
                </div>
              )}
              <h3 className="text-base font-semibold mb-1.5" style={{ color: "#1A1A1A" }}>{confirmDialog.title}</h3>
              <p className="text-sm mb-5" style={{ color: "#6B6B6B" }}>{confirmDialog.desc}</p>
              <div className="flex gap-2.5">
                <button
                  onClick={() => setConfirmDialog(null)}
                  className="flex-1 h-10 rounded-full text-sm font-medium border border-[#D9D5CF] hover:bg-[#F0EDE7] transition-colors"
                  style={{ color: "#6B6B6B" }}
                  data-testid="bolig-confirm-cancel"
                >
                  Annuller
                </button>
                <button
                  onClick={confirmDialog.onConfirm}
                  disabled={deleteMutation.isPending || deleteImageMutation.isPending || statusMutation.isPending}
                  className="flex-1 h-10 rounded-full text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-70"
                  style={{ background: confirmDialog.variant === "success" ? "#2D6A4F" : "#DC2626" }}
                  data-testid="bolig-confirm-action"
                >
                  {(deleteMutation.isPending || deleteImageMutation.isPending || statusMutation.isPending) ? "Arbejder..." : confirmDialog.confirmLabel}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Activity image lightbox ── */}
      <AnimatePresence>
        {activityLightbox && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.85)" }}
            onClick={() => setActivityLightbox(null)}
            data-testid="bolig-activity-lightbox"
          >
            <img
              src={activityLightbox}
              alt="Genereret billede"
              className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              onClick={() => setActivityLightbox(null)}
              className="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.15)" }}
              data-testid="bolig-activity-lightbox-close"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Standalone Upload Flow (for "Upload Billede" section) ─────────────────────
// ── History (all generated visualizations across cases + standalone) ─────────
interface ApiGeneration {
  id: number;
  caseId: number | null;
  isQuickGeneration: boolean | null;
  src: string;
  beforeSrc: string | null;
  room: string;
  style: string;
  tier: string | null;
  promptUsed: string | null;
  createdAt: string;
  generationTimeMs: number | null;
}

function HistoryView({
  cases,
  onOpenCase,
  showToast,
}: {
  cases: ApiCase[];
  onOpenCase: (id: number) => void;
  showToast: (msg: string) => void;
}) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"all" | "case" | "quick">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [lightbox, setLightbox] = useState<ApiGeneration | null>(null);
  const [regen, setRegen] = useState<ApiGeneration | null>(null);
  const [regenStyle, setRegenStyle] = useState("scandinavian");
  const [regenTier, setRegenTier] = useState("tier2");
  const [regenSaveCaseId, setRegenSaveCaseId] = useState<number | null>(null);
  const [regenBusy, setRegenBusy] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);
  const [regenResult, setRegenResult] = useState<{ url: string; id: number | null } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ApiGeneration | null>(null);

  const { data: items = [], isLoading } = useQuery<ApiGeneration[]>({
    queryKey: ["/api/generations/all"],
    queryFn: async () => {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/generations/all", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Kunne ikke hente historik");
      return res.json();
    },
  });

  const caseById = useMemo(() => {
    const m = new Map<number, ApiCase>();
    cases.forEach((c) => m.set(c.id, c));
    return m;
  }, [cases]);

  const filtered = useMemo(() => {
    let result = items;
    if (filter === "case") result = result.filter((it) => it.caseId !== null);
    if (filter === "quick") result = result.filter((it) => it.caseId === null);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((it) => {
        const c = it.caseId ? caseById.get(it.caseId) : null;
        const addr = (c?.address ?? "").toLowerCase();
        const date = new Date(it.createdAt).toLocaleDateString("da-DK").toLowerCase();
        const room = (it.room ?? "").toLowerCase();
        return addr.includes(q) || date.includes(q) || room.includes(q);
      });
    }
    return result;
  }, [items, filter, searchQuery, caseById]);

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/bolig/generated-images/${id}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Kunne ikke slette billede");
    },
    onSuccess: () => {
      showToast("Billede slettet");
      queryClient.invalidateQueries({ queryKey: ["/api/generations/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bolig/cases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bolig/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bolig/recent-images"] });
    },
  });

  const openRegen = (item: ApiGeneration) => {
    setRegen(item);
    setRegenStyle(item.style && STYLES.find((s) => s.value === item.style) ? item.style : "scandinavian");
    setRegenTier(item.tier && BUDGET_TIERS.find((b) => b.value === item.tier) ? item.tier : "tier2");
    setRegenSaveCaseId(item.caseId ?? null);
    setRegenError(null);
    setRegenResult(null);
  };

  const runRegen = async () => {
    if (!regen) return;
    if (!regen.beforeSrc) {
      setRegenError("Det oprindelige rumfoto findes ikke længere, så vi kan ikke regenerere.");
      return;
    }
    setRegenBusy(true);
    setRegenError(null);
    try {
      const origRes = await fetch(regen.beforeSrc);
      if (!origRes.ok) throw new Error("Kunne ikke hente originalbilledet");
      const blob = await origRes.blob();
      const file = new File([blob], "original.jpg", { type: blob.type || "image/jpeg" });

      const token = await auth.currentUser?.getIdToken();
      const fd = new FormData();
      fd.append("image", file);
      fd.append("style", regenStyle);
      fd.append("room", regen.room);
      fd.append("tier", regenTier);
      if (regenSaveCaseId) {
        fd.append("caseId", String(regenSaveCaseId));
        fd.append("isQuick", "false");
      } else {
        fd.append("isQuick", "true");
      }
      const res = await fetch("/api/bolig/generate", {
        method: "POST",
        body: fd,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Regenerering mislykkedes");
      setRegenResult({ url: data.image_url, id: data.generation_id ?? null });
      window.dispatchEvent(new Event("quota:refresh"));
      queryClient.invalidateQueries({ queryKey: ["/api/generations/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bolig/cases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bolig/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bolig/recent-images"] });
      if (regenSaveCaseId) {
        queryClient.invalidateQueries({ queryKey: ["/api/bolig/cases", regenSaveCaseId, "images"] });
      }
    } catch (err: any) {
      setRegenError(err?.message || "Noget gik galt");
    } finally {
      setRegenBusy(false);
    }
  };

  const closeRegen = () => {
    setRegen(null);
    setRegenResult(null);
    setRegenError(null);
    setRegenBusy(false);
  };

  const filterTabs: { id: typeof filter; label: string; count: number }[] = [
    { id: "all", label: "Alle", count: items.length },
    { id: "case", label: "Tilknyttet sag", count: items.filter((i) => i.caseId !== null).length },
    { id: "quick", label: "Hurtig upload", count: items.filter((i) => i.caseId === null).length },
  ];

  const styleLabel = (v: string) => STYLES.find((s) => s.value === v)?.label || v;
  const roomLabel = (v: string) => ROOM_TYPES.find((r) => r.value === v)?.label || v;
  const tierLabel = (v: string | null) => BUDGET_TIERS.find((b) => b.value === v)?.label.replace(/^Tier \d — /, "") || v || "";

  return (
    <motion.div key="historik-view" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: "#0F1D2F", letterSpacing: "-0.02em" }}>Historik</h1>
        <p className="text-sm mt-1" style={{ color: "#6B6B6B" }}>Alle dine AI-visualiseringer — både fra sager og hurtige uploads.</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "#9B9690" }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Søg på adresse, dato eller rum..."
            className="w-full h-9 pl-9 pr-3 rounded-full border text-xs outline-none transition-all"
            style={{ borderColor: searchQuery ? "#C8956C" : "#D9D5CF", background: "#fff", color: "#1A1A1A" }}
            data-testid="bolig-history-search"
          />
        </div>
        <div className="flex flex-wrap gap-2" data-testid="bolig-history-filters">
          {filterTabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setFilter(t.id)}
              className="h-9 px-4 rounded-full text-xs font-semibold border-2 transition-all"
              style={{
                background: filter === t.id ? "#0F1D2F" : "#fff",
                borderColor: filter === t.id ? "#0F1D2F" : "#D9D5CF",
                color: filter === t.id ? "#fff" : "#1A1A1A",
              }}
              data-testid={`bolig-history-filter-${t.id}`}
            >
              {t.label} <span className="opacity-60 ml-1">({t.count})</span>
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-xl overflow-hidden border border-[#E8E4DE] animate-pulse bg-white">
              <div className="h-40 bg-[#E8E4DE]" />
              <div className="p-4 space-y-2">
                <div className="h-3 bg-[#E8E4DE] rounded w-3/4" />
                <div className="h-2.5 bg-[#E8E4DE] rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5" style={{ background: "#F0EDE7" }}>
            <Clock className="w-7 h-7" style={{ color: "#C8956C" }} />
          </div>
          <h2 className="text-lg font-bold mb-2" style={{ color: "#0F1D2F" }}>Ingen visualiseringer endnu</h2>
          <p className="text-sm" style={{ color: "#6B6B6B" }}>Generér dit første billede for at se det her.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" data-testid="bolig-history-grid">
          {filtered.map((it) => {
            const c = it.caseId ? caseById.get(it.caseId) : null;
            return (
              <div
                key={it.id}
                className="rounded-xl overflow-hidden border border-[#E8E4DE] bg-white group transition-all hover:-translate-y-0.5 hover:shadow-md"
                data-testid={`bolig-history-card-${it.id}`}
              >
                <div
                  className="relative aspect-[4/3] overflow-hidden cursor-pointer"
                  onClick={() => setLightbox(it)}
                >
                  {isVideoUrl(it.src) ? (
                    <video src={it.src} className="w-full h-full object-cover bg-black" muted playsInline preload="metadata" />
                  ) : (
                    <img src={it.src} alt={it.room} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                  )}
                  <span
                    className="absolute top-2 left-2 text-[10px] font-semibold text-white px-2 py-0.5 rounded-full"
                    style={{ background: it.caseId ? "rgba(45,106,79,0.85)" : "rgba(200,149,108,0.95)" }}
                  >
                    {it.caseId ? "Sag" : "Hurtig"}
                  </span>
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <DownloadMenu
                      url={it.src}
                      beforeUrl={it.beforeSrc}
                      address={c?.address ?? null}
                      room={it.room}
                      style={it.style}
                      variant="icon-dark"
                      testIdPrefix={`bolig-history-download-${it.id}`}
                      stopPropagation
                    />
                  </div>
                </div>
                <div className="p-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-semibold truncate" style={{ color: "#0F1D2F" }}>{roomLabel(it.room)}</p>
                    <span className="text-[10px]" style={{ color: "#9B9690" }}>{timeAgo(it.createdAt)}</span>
                  </div>
                  {c ? (
                    <button
                      onClick={() => onOpenCase(c.id)}
                      className="text-[11px] truncate hover:underline block mb-2"
                      style={{ color: "#6B6B6B" }}
                      data-testid={`bolig-history-case-link-${it.id}`}
                    >
                      {c.address}
                    </button>
                  ) : (
                    <p className="text-[11px] mb-2" style={{ color: "#9B9690" }}>Ikke tilknyttet en sag</p>
                  )}
                  <div className="flex gap-1.5 flex-wrap mb-3">
                    <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: "rgba(200,149,108,0.13)", color: "#B07848" }}>{styleLabel(it.style)}</span>
                    {it.tier && it.tier !== "0" && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: "rgba(45,106,79,0.08)", color: "#2D6A4F" }}>{tierLabel(it.tier)}</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => openRegen(it)}
                      disabled={!it.beforeSrc}
                      title={it.beforeSrc ? "Generer igen med en anden stil" : "Originalbillede ikke tilgængeligt"}
                      className="flex-1 h-8 rounded-full text-[11px] font-semibold border-2 flex items-center justify-center gap-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{ borderColor: "#D9D5CF", color: "#0F1D2F" }}
                      data-testid={`bolig-history-regen-${it.id}`}
                    >
                      <RotateCcw className="w-3 h-3" /> Anden stil
                    </button>
                    <button
                      onClick={() => setConfirmDelete(it)}
                      className="h-8 w-8 rounded-full flex items-center justify-center transition-colors hover:bg-red-50"
                      style={{ color: "#DC2626", border: "2px solid rgba(220,38,38,0.25)" }}
                      data-testid={`bolig-history-delete-${it.id}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Lightbox */}
      <AnimatePresence>
        {lightbox && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(15,29,47,0.85)" }}
            onClick={() => setLightbox(null)}
            data-testid="bolig-history-lightbox"
          >
            <div className="relative max-w-5xl w-full" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => setLightbox(null)}
                className="absolute -top-12 right-0 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"
                data-testid="bolig-history-lightbox-close"
              >
                <X className="w-5 h-5" />
              </button>
              {lightbox.beforeSrc && !isVideoUrl(lightbox.src) ? (
                <BeforeAfterSlider beforeSrc={lightbox.beforeSrc} afterSrc={lightbox.src} />
              ) : isVideoUrl(lightbox.src) ? (
                <video src={lightbox.src} controls autoPlay className="w-full rounded-2xl" />
              ) : (
                <img src={lightbox.src} alt={lightbox.room} className="w-full rounded-2xl" />
              )}
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <DownloadMenu
                  url={lightbox.src}
                  beforeUrl={lightbox.beforeSrc}
                  address={lightbox.caseId ? caseById.get(lightbox.caseId)?.address ?? null : null}
                  room={lightbox.room}
                  style={lightbox.style}
                  variant="pill-light"
                  testIdPrefix={`bolig-history-lightbox-download-${lightbox.id}`}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Regenerate modal */}
      <AnimatePresence>
        {regen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(15,29,47,0.7)" }}
            onClick={closeRegen}
            data-testid="bolig-history-regen-modal"
          >
            <div
              className="bg-white rounded-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold" style={{ color: "#0F1D2F" }}>Generer igen</h3>
                  <p className="text-xs mt-0.5" style={{ color: "#6B6B6B" }}>Brug samme rum­foto med en ny stil eller budget.</p>
                </div>
                <button onClick={closeRegen} className="w-8 h-8 rounded-full hover:bg-[#F5F3EF] flex items-center justify-center" data-testid="bolig-history-regen-close">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {regenResult ? (
                <div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium mb-3" style={{ background: "rgba(200,149,108,0.12)", color: "#C8956C" }}>
                    <Check className="w-3 h-3" /> Ny visualisering klar
                  </div>
                  {regen.beforeSrc ? (
                    <BeforeAfterSlider beforeSrc={regen.beforeSrc} afterSrc={regenResult.url} />
                  ) : (
                    <img src={regenResult.url} alt="Resultat" className="w-full rounded-xl" />
                  )}
                  <div className="flex flex-wrap gap-2 mt-4">
                    <DownloadMenu
                      url={regenResult.url}
                      beforeUrl={regen.beforeSrc}
                      room={regen.room}
                      style={regenStyle}
                      variant="pill-outline"
                      testIdPrefix="bolig-history-regen-result-download"
                    />
                    <button
                      onClick={closeRegen}
                      className="h-11 px-5 rounded-full font-semibold text-sm text-white hover:opacity-90"
                      style={{ background: "#0F1D2F" }}
                      data-testid="bolig-history-regen-done"
                    >
                      Færdig
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="rounded-xl overflow-hidden border border-[#E8E4DE] mb-4">
                    {regen.beforeSrc ? (
                      <img src={regen.beforeSrc} alt="Original" className="w-full max-h-48 object-cover" />
                    ) : (
                      <div className="p-6 text-center text-sm" style={{ color: "#9B9690" }}>Originalbillede ikke tilgængeligt</div>
                    )}
                  </div>

                  <div className="mb-4">
                    <label className="block text-xs font-bold tracking-wider uppercase mb-2" style={{ color: "#6B6B6B" }}>Ny designstil</label>
                    <div className="grid grid-cols-2 gap-2">
                      {STYLES.map((s) => (
                        <button
                          key={s.value}
                          onClick={() => setRegenStyle(s.value)}
                          className="h-10 px-3 rounded-xl text-sm font-medium border-2 transition-all text-left"
                          style={{
                            background: regenStyle === s.value ? "#C8956C" : "#fff",
                            borderColor: regenStyle === s.value ? "#C8956C" : "#D9D5CF",
                            color: regenStyle === s.value ? "#fff" : "#1A1A1A",
                          }}
                          data-testid={`bolig-history-regen-style-${s.value}`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mb-4">
                    <label className="block text-xs font-bold tracking-wider uppercase mb-2" style={{ color: "#6B6B6B" }}>Budget</label>
                    <div className="flex flex-col gap-2">
                      {BUDGET_TIERS.map((t) => (
                        <button
                          key={t.value}
                          onClick={() => setRegenTier(t.value)}
                          className="flex items-center justify-between px-4 py-2 rounded-xl border-2 text-sm transition-all"
                          style={{
                            background: regenTier === t.value ? "#0F1D2F" : "#fff",
                            borderColor: regenTier === t.value ? "#0F1D2F" : "#D9D5CF",
                            color: regenTier === t.value ? "#fff" : "#1A1A1A",
                          }}
                          data-testid={`bolig-history-regen-tier-${t.value}`}
                        >
                          <span className="font-medium">{t.label}</span>
                          <span className="text-xs opacity-60">{t.sub}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {cases.filter((c) => c.status !== "sold").length > 0 && (
                    <div className="mb-4">
                      <label className="block text-xs font-bold tracking-wider uppercase mb-2" style={{ color: "#6B6B6B" }}>Gem til sag (valgfrit)</label>
                      <select
                        value={regenSaveCaseId ?? ""}
                        onChange={(e) => setRegenSaveCaseId(e.target.value ? parseInt(e.target.value) : null)}
                        className="w-full h-10 px-3 rounded-xl border-2 text-sm"
                        style={{ borderColor: "#D9D5CF", color: "#1A1A1A", background: "#fff" }}
                        data-testid="bolig-history-regen-case-select"
                      >
                        <option value="">— Hurtig (ingen sag) —</option>
                        {cases.filter((c) => c.status !== "sold").map((c) => (
                          <option key={c.id} value={c.id}>{c.address}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {regenError && (
                    <div className="text-sm text-red-600 p-3 rounded-xl bg-red-50 mb-3" data-testid="bolig-history-regen-error">{regenError}</div>
                  )}

                  <button
                    onClick={runRegen}
                    disabled={regenBusy || !regen.beforeSrc}
                    className="w-full h-12 rounded-full font-semibold text-sm text-white inline-flex items-center justify-center gap-2 disabled:opacity-50"
                    style={{ background: "#C8956C" }}
                    data-testid="bolig-history-regen-submit"
                  >
                    {regenBusy ? (
                      <><RotateCcw className="w-4 h-4 animate-spin" /> Genererer... (30-60 sek)</>
                    ) : (
                      <><Sparkles className="w-4 h-4" /> Generer ny visualisering</>
                    )}
                  </button>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete confirm */}
      <AnimatePresence>
        {confirmDelete && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(15,29,47,0.7)" }}
            onClick={() => setConfirmDelete(null)}
          >
            <div className="bg-white rounded-2xl max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-base font-bold mb-2" style={{ color: "#0F1D2F" }}>Slet visualisering</h3>
              <p className="text-sm mb-5" style={{ color: "#6B6B6B" }}>Dette kan ikke fortrydes.</p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setConfirmDelete(null)}
                  className="h-9 px-4 rounded-full text-sm font-medium border border-[#D9D5CF]"
                  style={{ color: "#1A1A1A" }}
                  data-testid="bolig-history-delete-cancel"
                >
                  Annuller
                </button>
                <button
                  onClick={() => {
                    if (confirmDelete) deleteMutation.mutate(confirmDelete.id);
                    setConfirmDelete(null);
                  }}
                  className="h-9 px-4 rounded-full text-sm font-semibold text-white"
                  style={{ background: "#DC2626" }}
                  data-testid="bolig-history-delete-confirm"
                >
                  Slet
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function UploadFlow({ onBack }: { onBack: () => void }) {
  const queryClient = useQueryClient();
  const [stage, setStage] = useState<Stage>("upload");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [roomType, setRoomType] = useState("living room");
  const [style, setStyle] = useState("scandinavian");
  const [tier, setTier] = useState("tier2");
  const [isDragging, setIsDragging] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [processingTime, setProcessingTime] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    if (!file.type.startsWith("image/")) { setError("Kun billedfiler er tilladt (JPG, PNG)."); return; }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setStage("config");
    setError(null);
  };

  const onDrop = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); };
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) handleFile(f); };

  const handleGenerate = async () => {
    if (!imageFile) return;
    setStage("loading"); setError(null);
    const startTime = Date.now();
    try {
      const token = await auth.currentUser?.getIdToken();
      const fd = new FormData();
      fd.append("image", imageFile);
      fd.append("style", style);
      fd.append("room", roomType);
      fd.append("tier", tier);
      fd.append("isQuick", "true");
      const res = await fetch("/api/bolig/generate", {
        method: "POST",
        body: fd,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Generering mislykkedes.");
      setResultUrl(data.image_url);
      setProcessingTime(data.processing_time || Math.round((Date.now() - startTime) / 1000));
      queryClient.invalidateQueries({ queryKey: ["/api/bolig/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bolig/cases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bolig/activity"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bolig/most-used"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bolig/recent-images"] });
      window.dispatchEvent(new Event("quota:refresh"));
      setStage("result");
    } catch (err: any) {
      setError(err.message || "Noget gik galt. Prøv igen.");
      setStage("config");
    }
  };

  const reset = () => { setStage("upload"); setImageFile(null); setImagePreview(null); setResultUrl(null); setError(null); setProcessingTime(null); };

  return (
    <div>
      <div className="flex items-center gap-3 mb-8">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm hover:opacity-70 transition-opacity" style={{ color: "#6B6B6B" }} data-testid="bolig-upload-back">
          <ChevronLeft className="w-4 h-4" /> Tilbage til Dashboard
        </button>
      </div>

      <AnimatePresence mode="wait">
        {stage === "upload" && (
          <motion.div key="upload" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
            <h1 className="text-2xl font-bold mb-1" style={{ color: "#0F1D2F", letterSpacing: "-0.02em" }}>Upload et rumfoto</h1>
            <p className="text-sm mb-8" style={{ color: "#6B6B6B" }}>Vælg et foto af rummet du vil visualisere</p>
            <div
              className="rounded-2xl border-2 border-dashed transition-all duration-300 flex flex-col items-center justify-center p-16 cursor-pointer group hover:bg-[#C8956C]/[0.02]"
              style={{ borderColor: isDragging ? "#C8956C" : "#D9D5CF", background: isDragging ? "rgba(200,149,108,0.04)" : "#fff" }}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              data-testid="bolig-upload-zone"
            >
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5 transition-transform group-hover:scale-110 group-hover:bg-[#C8956C]/10" style={{ background: "#F0EDE7" }}>
                <Upload className="w-6 h-6" style={{ color: "#C8956C" }} />
              </div>
              <p className="font-semibold mb-1 text-base" style={{ color: "#0F1D2F" }}>Klik eller træk et billede hertil</p>
              <p className="text-sm" style={{ color: "#6B6B6B" }}>JPG, PNG eller HEIC · Max 10 MB</p>
            </div>
            {error && <div className="mt-4 text-sm text-red-600 text-center">{error}</div>}
            <p className="text-xs mt-8 mb-3" style={{ color: "#6B6B6B" }}>Eller prøv med et eksempelbillede:</p>
            <div className="flex gap-3 flex-wrap">
              {[{ src: "/bolig-images/living-scandi-before.jpg", label: "Stue" }, { src: "/bolig-images/kitchen-before.jpg", label: "Køkken" }, { src: "/bolig-images/living-modern-before.jpg", label: "Stue 2" }].map((ex) => (
                <button key={ex.src} onClick={async () => { const res = await fetch(ex.src); const blob = await res.blob(); handleFile(new File([blob], `${ex.label}.jpg`, { type: "image/jpeg" })); }}
                  className="relative rounded-xl overflow-hidden border-2 border-[#D9D5CF] hover:border-[#C8956C] transition-all">
                  <img src={ex.src} alt={ex.label} className="w-24 h-16 object-cover" />
                  <div className="absolute inset-0 bg-black/20 flex items-end p-1.5"><span className="text-[10px] text-white font-medium">{ex.label}</span></div>
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {stage === "config" && (
          <motion.div key="config" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
            <div className="grid lg:grid-cols-[1fr_400px] gap-8 items-start">
              <div>
                <div className="relative rounded-2xl overflow-hidden border border-[#E8E4DE] shadow-sm bg-[#F8F6F3]" style={{ aspectRatio: "4/3" }}>
                  <img src={imagePreview!} alt="Preview" className="w-full h-full object-contain" />
                  <button onClick={reset} className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/90 flex items-center justify-center text-[#0F1D2F] shadow-sm hover:bg-white transition-transform hover:scale-105"><X className="w-4 h-4" /></button>
                </div>
                <p className="text-xs mt-3 text-center" style={{ color: "#9B9690" }}>{imageFile?.name}</p>
              </div>
              <div className="space-y-8 rounded-2xl border border-[#E8E4DE] bg-white p-6 shadow-sm">
                <div>
                  <h2 className="text-xl font-bold mb-1.5" style={{ color: "#0F1D2F" }}>Konfigurer visualisering</h2>
                  <p className="text-sm" style={{ color: "#6B6B6B" }}>Vælg rumtype og designstil</p>
                </div>
                <div className="space-y-6">
                  <div>
                    <label className="block text-[11px] font-bold tracking-wider uppercase mb-3" style={{ color: "#9B9690" }}>Rumtype</label>
                    <div className="grid grid-cols-2 gap-2">
                      {ROOM_TYPES.map((r) => (
                        <button key={r.value} onClick={() => setRoomType(r.value)}
                          className="h-10 px-3.5 rounded-xl text-xs font-semibold border transition-all hover:border-[#0F1D2F] text-left truncate"
                          style={{ background: roomType === r.value ? "#0F1D2F" : "#F8F6F3", borderColor: roomType === r.value ? "#0F1D2F" : "transparent", color: roomType === r.value ? "#fff" : "#1A1A1A" }}>
                          {r.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold tracking-wider uppercase mb-3" style={{ color: "#9B9690" }}>Designstil</label>
                    <div className="grid grid-cols-2 gap-2">
                      {STYLES.map((s) => (
                        <button key={s.value} onClick={() => setStyle(s.value)}
                          className="h-10 px-3.5 rounded-xl text-xs font-semibold border transition-all hover:border-[#C8956C] text-left truncate"
                          style={{ background: style === s.value ? "#C8956C" : "#F8F6F3", borderColor: style === s.value ? "#C8956C" : "transparent", color: style === s.value ? "#fff" : "#1A1A1A" }}>
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold tracking-wider uppercase mb-3" style={{ color: "#9B9690" }}>Budget niveau</label>
                    <div className="flex flex-col gap-2">
                      {BUDGET_TIERS.map((t) => (
                        <button key={t.value} onClick={() => setTier(t.value)}
                          className="flex items-center justify-between px-4 py-3 rounded-xl border transition-all hover:border-[#0F1D2F]"
                          style={{ background: tier === t.value ? "#0F1D2F" : "#F8F6F3", borderColor: tier === t.value ? "#0F1D2F" : "transparent", color: tier === t.value ? "#fff" : "#1A1A1A" }}>
                          <span className="text-sm font-semibold">{t.label}</span>
                          <span className="text-xs" style={{ opacity: tier === t.value ? 0.8 : 0.6 }}>{t.sub}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                {error && <div className="text-sm text-[#B91C1C] p-3 rounded-xl bg-[#FEF2F2] font-medium">{error}</div>}
                <QuotaGate feature="ai">
                  <button onClick={handleGenerate} className="w-full rounded-full font-semibold text-white transition-all hover:-translate-y-0.5 active:translate-y-0" style={{ background: "#0F1D2F", height: "52px", boxShadow: "0 4px 14px rgba(15,29,47,0.15)" }}>
                    Generer visualisering →
                  </button>
                </QuotaGate>
              </div>
            </div>
          </motion.div>
        )}

        {stage === "loading" && (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}
            className="flex flex-col items-center justify-center py-24 text-center">
            <div className="relative w-20 h-20 mb-8">
              <div className="absolute inset-0 rounded-full border-4 border-[#F0EDE7]" />
              <div className="absolute inset-0 rounded-full border-4 border-[#C8956C] border-t-transparent animate-spin" />
            </div>
            <h2 className="text-2xl font-bold mb-2" style={{ color: "#0F1D2F" }}>Genererer visualisering...</h2>
            <p className="text-base" style={{ color: "#6B6B6B" }}>AI'en arbejder på dit rum. Ca. 30–60 sekunder.</p>
            <div className="mt-8 flex gap-8">
              {["Analyserer rum", "Anvender stil", "Renderer"].map((step, i) => (
                <div key={i} className="flex flex-col items-center gap-2">
                  <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: "#C8956C", animationDelay: `${i * 0.3}s` }} />
                  <div className="text-xs" style={{ color: "#6B6B6B" }}>{step}</div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {stage === "result" && resultUrl && (
          <motion.div key="result" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
            <div className="mb-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium mb-3" style={{ background: "rgba(200,149,108,0.12)", color: "#C8956C" }}>
                <Check className="w-3 h-3" /> Visualisering klar{processingTime ? ` · ${processingTime} sek` : ""}
              </div>
              <h2 className="text-2xl font-bold" style={{ color: "#0F1D2F", letterSpacing: "-0.02em" }}>Forvandlingen er klar!</h2>
              <p className="text-sm mt-1" style={{ color: "#6B6B6B" }}>Træk slideren for at sammenligne før og efter</p>
            </div>
            <div className="max-w-4xl">
              <BeforeAfterSlider beforeSrc={imagePreview!} afterSrc={resultUrl} />
              <div className="flex flex-wrap gap-3 mt-5">
                <DownloadMenu
                  url={resultUrl}
                  beforeUrl={imagePreview}
                  room={roomType}
                  style={style}
                  variant="primary"
                  testIdPrefix="bolig-upload-result-download"
                />
                <button onClick={() => { setStage("config"); setResultUrl(null); }} className="h-11 px-6 rounded-full font-semibold border-2 border-[#D9D5CF] hover:border-[#C8956C] transition-colors" style={{ color: "#0F1D2F" }}>Prøv anden stil</button>
                <button onClick={reset} className="h-11 px-6 rounded-full font-semibold border-2 border-[#D9D5CF] hover:border-[#C8956C] transition-colors" style={{ color: "#6B6B6B" }}>Nyt billede</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── 3D Plantegning Flow (fal.ai nano-banana-2/edit — 2D plan → 3D dollhouse) ─
function Floorplan3DFlow({ cases }: { cases: ApiCase[] }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isOwner = user?.email === "fredefussing@gmail.com";
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [showDollhouse, setShowDollhouse] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [saveCaseId, setSaveCaseId] = useState<number | null>(null);
  const [showCaseDropdown, setShowCaseDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const activeCases = cases.filter((c) => c.status !== "sold");
  const hasUnsaved = !!resultUrl && saveCaseId === null;
  useUnsavedExitGuard(hasUnsaved);

  useEffect(() => {
    if (!showCaseDropdown) return;
    const onDown = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowCaseDropdown(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [showCaseDropdown]);

  const confirmDiscardOr = (action: () => void) => {
    if (hasUnsaved && !window.confirm("Er du sikker på du ikke vil gemme denne 3D plantegning?")) return;
    action();
  };

  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (resetTimerRef.current) clearTimeout(resetTimerRef.current); }, []);
  const handleFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Vælg venligst en billedfil");
      return;
    }
    if (resetTimerRef.current) { clearTimeout(resetTimerRef.current); resetTimerRef.current = null; }
    setImageFile(file);
    setResultUrl(null);
    setOriginalUrl(null);
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleGenerate = async () => {
    if (!imageFile) return;
    if (resetTimerRef.current) { clearTimeout(resetTimerRef.current); resetTimerRef.current = null; }
    setIsGenerating(true);
    setError(null);
    setResultUrl(null);
    setOriginalUrl(null);
    setShowDollhouse(false);
    try {
      const token = await auth.currentUser?.getIdToken();
      const fd = new FormData();
      fd.append("image", imageFile);
      const res = await fetch("/api/bolig/floorplan-3d", {
        method: "POST",
        body: fd,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({ message: "Generering mislykkedes" }));
        throw new Error(j.message || "Generering mislykkedes");
      }
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Generering mislykkedes");
      setResultUrl(data.image_url);
      setOriginalUrl(data.source_url ?? null);
    } catch (err: any) {
      setError(err.message || "Noget gik galt");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-1" style={{ color: "#0F1D2F", letterSpacing: "-0.02em" }}>3D plantegning</h1>
        <p className="text-sm" style={{ color: "#6B6B6B" }}>Upload en 2D plantegning — AI bygger et møbleret 3D dukkehus set fra oven, baseret på rumlayoutet.</p>
      </div>

      {/* Eksempel */}
      <div className="rounded-2xl border border-[#E8E4DE] bg-white p-5 mb-6">
        <p className="text-[11px] font-bold tracking-[0.12em] uppercase mb-3" style={{ color: "#C8956C" }}>Se eksempel</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[11px] font-medium mb-1.5" style={{ color: "#9B9690" }}>Input — 2D plantegning</p>
            <img src="/bolig-images/floorplan-2d.jpg" alt="2D plantegning eksempel" className="w-full rounded-xl object-contain bg-[#F8F6F3]" style={{ aspectRatio: "5/4" }} />
          </div>
          <div>
            <p className="text-[11px] font-medium mb-1.5" style={{ color: "#9B9690" }}>Output — 3D dukkehus</p>
            <img src="/bolig-images/floorplan-3d.jpg" alt="3D plantegning eksempel" className="w-full rounded-xl object-contain bg-[#F8F6F3]" style={{ aspectRatio: "5/4" }} />
          </div>
        </div>
      </div>

        <div className="rounded-2xl border border-[#E8E4DE] bg-white p-6 md:p-8 space-y-6 shadow-sm">
          <div>
            <label className="text-xs font-semibold tracking-wider uppercase mb-3 block" style={{ color: "#0F1D2F" }}>Plantegning (2D)</label>
            {!imagePreview ? (
              <label
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) handleFile(f);
                }}
                className="block cursor-pointer rounded-2xl border-2 border-dashed p-12 text-center transition-all duration-300 group hover:bg-[#C8956C]/[0.02]"
                style={{ borderColor: isDragging ? "#C8956C" : "#D9D5CF", background: isDragging ? "rgba(200,149,108,0.04)" : "#F8F6F3" }}
                data-testid="dropzone-floorplan-image"
              >
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                  data-testid="input-floorplan-image"
                />
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5 transition-transform group-hover:scale-110 group-hover:bg-[#C8956C]/10" style={{ background: "#F0EDE7" }}>
                  <Upload className="w-6 h-6" style={{ color: "#C8956C" }} />
                </div>
                <p className="text-base font-semibold mb-1" style={{ color: "#0F1D2F" }}>Træk plantegning hertil eller klik for at vælge</p>
                <p className="text-sm" style={{ color: "#6B6B6B" }}>JPG, PNG · maks 10 MB</p>
              </label>
            ) : (
              <div className="relative rounded-2xl overflow-hidden border border-[#E8E4DE] shadow-sm">
                <img src={imagePreview} alt="Plantegning" className="w-full max-h-[400px] object-contain bg-[#F8F6F3]" data-testid="img-floorplan-preview" />
                <button
                  onClick={() => confirmDiscardOr(() => { setImageFile(null); setImagePreview(null); setResultUrl(null); setSaveCaseId(null); })}
                  className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/95 flex items-center justify-center shadow-md hover:bg-white transition-transform hover:scale-105"
                  data-testid="button-clear-floorplan-image"
                >
                  <X className="w-4 h-4" style={{ color: "#0F1D2F" }} />
                </button>
              </div>
            )}
          </div>

        <QuotaGate feature="floorPlan">
          <button
            onClick={handleGenerate}
            disabled={!imageFile || isGenerating}
            className="w-full h-12 rounded-full font-semibold text-sm text-white inline-flex items-center justify-center gap-2 transition-opacity disabled:opacity-50"
            style={{ background: "#C8956C" }}
            data-testid="button-generate-floorplan"
          >
            {isGenerating ? (
              <>
                <RotateCcw className="w-4 h-4 animate-spin" />
                Genererer 3D plantegning... (kan tage 30-90 sek)
              </>
            ) : (
              <>
                <Box className="w-4 h-4" />
                Generér 3D plantegning
              </>
            )}
          </button>
        </QuotaGate>

        {error && (
          <div className="p-3 rounded-lg text-sm" style={{ background: "rgba(220,38,38,0.08)", color: "#B91C1C" }} data-testid="text-floorplan-error">
            {error}
          </div>
        )}

        {resultUrl && (
          <>
            <div className="rounded-xl overflow-hidden border border-[#E8E4DE]">
              {imagePreview ? (
                <div data-testid="slider-floorplan-compare">
                  <BeforeAfterSlider beforeSrc={imagePreview} afterSrc={resultUrl} />
                </div>
              ) : (
                <img src={resultUrl} alt="3D plantegning" className="w-full block" data-testid="img-floorplan-result" />
              )}
              <div className="p-3 bg-[#F8F6F3] flex items-center gap-2 text-xs" style={{ color: "#6B6B6B" }}>
                <Sparkles className="w-3 h-3" style={{ color: "#C8956C" }} />
                {imagePreview ? "Træk slideren for at sammenligne 2D og 3D" : "AI-genereret 3D render"}
              </div>
            </div>

            {isOwner && <Floorplan3DViewer resultUrl={resultUrl} />}

            {isOwner && originalUrl && !showDollhouse && (
              <div
                className="rounded-2xl border overflow-hidden"
                style={{ borderColor: "#E8E4DE", background: "#FAF7F2" }}
              >
                <div className="p-5 flex flex-col items-center text-center gap-4">
                  <div className="flex items-center gap-2">
                    <Boxes className="w-4 h-4" style={{ color: "#C8956C" }} />
                    <span className="text-sm font-semibold" style={{ color: "#0F1D2F" }}>Dukkehus med rigtige vægge</span>
                    <span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full" style={{ background: "#F0EDE7", color: "#C8956C" }}>Beta</span>
                  </div>
                  <p className="text-sm max-w-sm" style={{ color: "#6B6B6B" }}>
                    Byg et Funda-agtigt dukkehus med <strong>rigtige lodrette vægge</strong> rejst op fra plantegningen — drej, zoom og skær vægge væk.
                  </p>
                  <button
                    onClick={() => setShowDollhouse(true)}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-opacity hover:opacity-85"
                    style={{ background: "#C8956C", color: "white" }}
                    data-testid="button-show-dollhouse"
                  >
                    <Boxes className="w-4 h-4" />
                    Byg dukkehus
                  </button>
                </div>
              </div>
            )}
            {isOwner && originalUrl && showDollhouse && <FloorplanDollhouseViewer planUrl={originalUrl} />}

            <div className="flex flex-wrap gap-3">
              <DownloadMenu
                url={resultUrl}
                style="3d-floorplan"
                variant="primary"
                testIdPrefix="floorplan-download"
              />

              {activeCases.length > 0 && (
                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setShowCaseDropdown((v) => !v)}
                    className="h-11 px-5 rounded-full font-semibold text-sm flex items-center gap-2 border transition-all hover:opacity-80"
                    style={{ borderColor: "#D9D5CF", color: "#1A1A1A", background: "#fff" }}
                    data-testid="button-floorplan-save-case"
                  >
                    <ImageIcon className="w-4 h-4" />
                    {saveCaseId ? "Gemt til mappe" : "Gem til mappe"}
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                  {showCaseDropdown && (
                    <div className="absolute left-0 top-full mt-1 w-56 rounded-xl shadow-xl border border-[#E8E4DE] bg-white z-20 py-1">
                      {activeCases.map((c) => (
                        <button
                          key={c.id}
                          onClick={async () => {
                            setShowCaseDropdown(false);
                            setSaveCaseId(c.id);
                            try {
                              const token = await user?.getIdToken();
                              const r = await fetch(`/api/bolig/cases/${c.id}/images`, {
                                method: "POST",
                                headers: {
                                  "Content-Type": "application/json",
                                  ...(token ? { Authorization: `Bearer ${token}` } : {}),
                                },
                                body: JSON.stringify({
                                  imageUrl: resultUrl,
                                  originalImageUrl: originalUrl,
                                  roomType: "floorplan",
                                  style: "3d-floorplan",
                                  budgetTier: "tier2",
                                  promptText: "3D plantegning genereret af AI",
                                  isDesignAgent: true,
                                }),
                              });
                              if (!r.ok) {
                                setSaveCaseId(null);
                                const msg = await r.text().catch(() => "");
                                alert(`Kunne ikke gemme til mappen. ${msg}`);
                                return;
                              }
                              queryClient.invalidateQueries({ queryKey: ["/api/bolig/cases", c.id, "images"] });
                              queryClient.invalidateQueries({ queryKey: ["/api/bolig/cases"] });
                              queryClient.invalidateQueries({ queryKey: ["/api/bolig/recent-images"] });
                              queryClient.invalidateQueries({ queryKey: ["/api/bolig/stats"] });
                              if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
                              resetTimerRef.current = setTimeout(() => {
                                resetTimerRef.current = null;
                                setImageFile(null); setImagePreview(null); setOriginalUrl(null);
                                setShowDollhouse(false); setResultUrl(null); setError(null); setSaveCaseId(null);
                              }, 1500);
                            } catch (err) {
                              setSaveCaseId(null);
                              alert("Kunne ikke gemme til mappen. Prøv igen.");
                            }
                          }}
                          className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-[#F5F3EF] transition-colors text-left"
                          style={{ color: "#1A1A1A" }}
                          data-testid={`button-floorplan-save-case-${c.id}`}
                        >
                          <Home className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#9B9690" }} />
                          <span className="truncate">{c.address}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Transformeringsvideo Flow (fal.ai luma dream machine — før → efter) ──────
function useUnsavedExitGuard(hasUnsaved: boolean) {
  useEffect(() => {
    if (!hasUnsaved) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsaved]);
}

async function downloadFromUrl(url: string, filename: string) {
  try {
    const r = await fetch(url);
    const blob = await r.blob();
    const a = document.createElement("a");
    const objectUrl = URL.createObjectURL(blob);
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

interface WalkthroughImg { id: string; file: File; url: string; }
const MOOD_LABELS_WT: Record<string, string> = { calm: "Rolig", uplifting: "Opløftende", modern: "Moderne", tension: "Spændt" };
const ALL_MOODS_WT = ["calm", "uplifting", "modern", "tension"] as const;

function TransformVideoFlow({ cases }: { cases: ApiCase[] }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [videoMode, setVideoMode] = useState<"cinematic" | "morph">("cinematic");

  // ── Morph mode state ────────────────────────────────────────────────────────
  const [beforeFile, setBeforeFile] = useState<File | null>(null);
  const [beforePreview, setBeforePreview] = useState<string | null>(null);
  const [afterFile, setAfterFile] = useState<File | null>(null);
  const [afterPreview, setAfterPreview] = useState<string | null>(null);
  const [morphVideoUrl, setMorphVideoUrl] = useState<string | null>(null);
  const [morphGenerating, setMorphGenerating] = useState(false);
  const [morphProgressStep, setMorphProgressStep] = useState<0|1|2|3>(0);
  const [morphError, setMorphError] = useState<string | null>(null);
  const [dragSide, setDragSide] = useState<"before" | "after" | null>(null);
  const [morphSaveCaseId, setMorphSaveCaseId] = useState<number | null>(null);
  const [morphShowCaseDropdown, setMorphShowCaseDropdown] = useState(false);
  const [morphDownloading, setMorphDownloading] = useState(false);
  const [showTransformEksempel, setShowTransformEksempel] = useState(false);
  const morphDropdownRef = useRef<HTMLDivElement>(null);

  // ── Cinematic walkthrough state ─────────────────────────────────────────────
  const [wtImages, setWtImages] = useState<WalkthroughImg[]>([]);
  const [wtAddress, setWtAddress] = useState("");
  const [wtVideoUrls, setWtVideoUrls] = useState<Record<string, string> | null>(null);
  const [wtCleanVideoUrls, setWtCleanVideoUrls] = useState<Record<string, string> | null>(null);
  const [wtGenerating, setWtGenerating] = useState(false);
  const [wtProgressMsg, setWtProgressMsg] = useState("");
  const [wtError, setWtError] = useState<string | null>(null);
  const [wtDragOver, setWtDragOver] = useState(false);
  const [wtDragIndex, setWtDragIndex] = useState<number | null>(null);
  const [wtSaveCaseId, setWtSaveCaseId] = useState<number | null>(null);
  const [wtShowCaseDropdown, setWtShowCaseDropdown] = useState(false);
  const [wtDownloading, setWtDownloading] = useState(false);
  const wtDropdownRef = useRef<HTMLDivElement>(null);
  const wtEsRef = useRef<EventSource | null>(null);

  const activeCases = cases.filter((c) => c.status !== "sold");

  const morphHasUnsaved = !!morphVideoUrl && morphSaveCaseId === null;
  const wtHasUnsaved = wtVideoUrls !== null && Object.keys(wtVideoUrls).length > 0 && wtSaveCaseId === null;
  useUnsavedExitGuard(morphHasUnsaved || wtHasUnsaved);

  useEffect(() => {
    if (!morphShowCaseDropdown) return;
    const onDown = (e: MouseEvent) => {
      if (morphDropdownRef.current && !morphDropdownRef.current.contains(e.target as Node)) setMorphShowCaseDropdown(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [morphShowCaseDropdown]);

  useEffect(() => {
    if (!wtShowCaseDropdown) return;
    const onDown = (e: MouseEvent) => {
      if (wtDropdownRef.current && !wtDropdownRef.current.contains(e.target as Node)) setWtShowCaseDropdown(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [wtShowCaseDropdown]);

  // ── Morph handlers ──────────────────────────────────────────────────────────
  const morphResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wtResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (morphResetTimerRef.current) clearTimeout(morphResetTimerRef.current); if (wtResetTimerRef.current) clearTimeout(wtResetTimerRef.current); }, []);
  const handleFile = (side: "before" | "after", file: File) => {
    if (!file.type.startsWith("image/")) { setMorphError("Vælg venligst en billedfil"); return; }
    if (morphResetTimerRef.current) { clearTimeout(morphResetTimerRef.current); morphResetTimerRef.current = null; }
    setMorphError(null);
    setMorphVideoUrl(null);
    setMorphSaveCaseId(null);
    const url = URL.createObjectURL(file);
    if (side === "before") {
      setBeforeFile(file);
      setBeforePreview(url);
    } else {
      setAfterFile(file);
      setAfterPreview(url);
    }
  };

  // ── Morph: generate ─────────────────────────────────────────────────────────
  const handleMorphGenerate = async () => {
    if (!beforeFile || !afterFile) return;
    if (morphResetTimerRef.current) { clearTimeout(morphResetTimerRef.current); morphResetTimerRef.current = null; }
    setMorphGenerating(true);
    setMorphProgressStep(1);
    setMorphError(null);
    setMorphVideoUrl(null);
    setMorphSaveCaseId(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      const fd = new FormData();
      fd.append("beforeImage", beforeFile);
      fd.append("afterImage", afterFile);
      fd.append("mode", "morph");
      const res = await fetch("/api/bolig/transform-video", {
        method: "POST",
        body: fd,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const ctype = res.headers.get("content-type") || "";
      if (!ctype.includes("application/json")) throw new Error(`Serverfejl (${res.status}). Prøv igen.`);
      const data = await res.json();
      if (!res.ok || !data.success || !data.request_id) throw new Error(data.message || "Indsendelse mislykkedes");
      const requestId = data.request_id as string;
      setMorphProgressStep(2);
      const maxAttempts = 80;
      let finalUrl: string | null = null;
      for (let i = 0; i < maxAttempts; i++) {
        if (i === 15) setMorphProgressStep(3);
        await new Promise((r) => setTimeout(r, 6000));
        const sres = await fetch(`/api/bolig/transform-video/status/${requestId}`);
        const sctype = sres.headers.get("content-type") || "";
        if (!sctype.includes("application/json")) continue;
        const sdata = await sres.json();
        if (sdata.status === "COMPLETED" && sdata.video_url) { finalUrl = sdata.video_url; break; }
        if (sdata.status === "FAILED") throw new Error(sdata.message || "Generering mislykkedes");
      }
      if (!finalUrl) throw new Error("Generering tog for lang tid. Prøv igen.");
      setMorphVideoUrl(finalUrl);
    } catch (err: any) {
      setMorphError(err.message || "Noget gik galt");
    } finally {
      setMorphGenerating(false);
      setMorphProgressStep(0);
    }
  };

  const handleMorphReset = () => {
    if (morphHasUnsaved && !window.confirm("Er du sikker på du ikke vil gemme denne video?")) return;
    setBeforeFile(null); setBeforePreview(null);
    setAfterFile(null); setAfterPreview(null);
    setMorphVideoUrl(null);
    setMorphSaveCaseId(null);
    setMorphError(null);
  };

  const morphSaveToCase = async (c: ApiCase) => {
    if (!morphVideoUrl) return;
    setMorphShowCaseDropdown(false);
    setMorphSaveCaseId(c.id);
    try {
      const token = await user?.getIdToken();
      const r = await fetch(`/api/bolig/cases/${c.id}/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ imageUrl: morphVideoUrl, originalImageUrl: null, roomType: "transform-video", style: "transform-video", budgetTier: "tier2", promptText: "Forvandlingsvideo (før → efter)", isDesignAgent: true }),
      });
      if (!r.ok) { setMorphSaveCaseId(null); alert(`Kunne ikke gemme til mappen.`); return; }
      queryClient.invalidateQueries({ queryKey: ["/api/bolig/cases", c.id, "images"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bolig/cases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bolig/recent-images"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bolig/stats"] });
      if (morphResetTimerRef.current) clearTimeout(morphResetTimerRef.current);
      morphResetTimerRef.current = setTimeout(() => {
        morphResetTimerRef.current = null;
        setBeforeFile(null); setBeforePreview(null);
        setAfterFile(null); setAfterPreview(null);
        setMorphVideoUrl(null); setMorphSaveCaseId(null); setMorphError(null);
      }, 1500);
    } catch { setMorphSaveCaseId(null); alert("Kunne ikke gemme til mappen. Prøv igen."); }
  };

  const handleMorphDownload = async () => {
    if (!morphVideoUrl || morphDownloading) return;
    setMorphDownloading(true);
    try { await downloadFromUrl(morphVideoUrl, `forvandlingsvideo-${new Date().toISOString().slice(0, 10)}.mp4`); }
    finally { setMorphDownloading(false); }
  };

  // ── Cinematic walkthrough handlers ──────────────────────────────────────────
  const wtAddFiles = (files: FileList | File[]) => {
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (arr.length === 0) { setWtError("Vælg venligst billedfiler"); return; }
    if (wtResetTimerRef.current) { clearTimeout(wtResetTimerRef.current); wtResetTimerRef.current = null; }
    setWtError(null); setWtVideoUrls(null); setWtCleanVideoUrls(null); setWtSaveCaseId(null);
    const next = arr.map((file) => ({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, file, url: URL.createObjectURL(file) }));
    setWtImages((prev) => [...prev, ...next].slice(0, 20));
  };

  const wtRemoveImage = (id: string) => {
    setWtImages((prev) => prev.filter((i) => i.id !== id));
    setWtVideoUrls(null); setWtCleanVideoUrls(null); setWtSaveCaseId(null);
  };

  const wtMoveImage = (from: number, to: number) => {
    if (from === to || to < 0 || to >= wtImages.length) return;
    setWtImages((prev) => { const copy = [...prev]; const [moved] = copy.splice(from, 1); copy.splice(to, 0, moved); return copy; });
    setWtVideoUrls(null); setWtCleanVideoUrls(null); setWtSaveCaseId(null);
  };

  const handleWtGenerate = async () => {
    if (wtImages.length < 2) { setWtError("Upload mindst 2 billeder"); return; }
    if (wtResetTimerRef.current) { clearTimeout(wtResetTimerRef.current); wtResetTimerRef.current = null; }
    setWtGenerating(true); setWtError(null); setWtVideoUrls(null); setWtCleanVideoUrls(null); setWtSaveCaseId(null); setWtProgressMsg("Forbereder…");
    if (wtEsRef.current) { wtEsRef.current.close(); wtEsRef.current = null; }
    try {
      const token = await auth.currentUser?.getIdToken();
      const fd = new FormData();
      wtImages.forEach((img) => fd.append("images", img.file));
      if (wtAddress.trim()) fd.append("address", wtAddress.trim());
      const res = await fetch("/api/bolig/walkthrough-video", { method: "POST", body: fd, headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const ctype = res.headers.get("content-type") || "";
      if (!ctype.includes("application/json")) throw new Error(`Serverfejl (${res.status}). Prøv igen.`);
      const data = await res.json();
      if (!res.ok || !data.success || !data.job_id) throw new Error(data.message || "Indsendelse mislykkedes");
      const jobId = data.job_id as string;
      await new Promise<void>((resolve, reject) => {
        const TIMEOUT_MS = 60 * 60 * 1000;
        const MAX_RETRIES = 12;
        let retries = 0; let settled = false; let deadlineTimer: ReturnType<typeof setTimeout>;
        const resetDeadline = () => {
          clearTimeout(deadlineTimer);
          deadlineTimer = setTimeout(() => { wtEsRef.current?.close(); wtEsRef.current = null; if (!settled) { settled = true; reject(new Error("Generering tog for lang tid. Prøv igen.")); } }, TIMEOUT_MS);
        };
        const connect = () => {
          const es = new EventSource(`/api/bolig/walkthrough-video/progress/${jobId}`);
          wtEsRef.current = es;
          es.onmessage = (e) => {
            retries = 0;
            try {
              const p = JSON.parse(e.data) as { stage: string; message?: string; videoUrls?: Record<string, string>; cleanVideoUrls?: Record<string, string> };
              if (p.message) setWtProgressMsg(p.message);
              if (p.stage === "complete" && p.videoUrls) {
                clearTimeout(deadlineTimer); es.close(); wtEsRef.current = null;
                if (!settled) { settled = true; setWtVideoUrls(p.videoUrls); if (p.cleanVideoUrls) setWtCleanVideoUrls(p.cleanVideoUrls); resolve(); }
              } else if (p.stage === "failed") {
                clearTimeout(deadlineTimer); es.close(); wtEsRef.current = null;
                if (!settled) { settled = true; reject(new Error(p.message || "Generering mislykkedes")); }
              }
            } catch {}
          };
          es.onerror = () => {
            es.close(); wtEsRef.current = null;
            if (settled) return;
            if (retries >= MAX_RETRIES) { clearTimeout(deadlineTimer); settled = true; reject(new Error("Forbindelsesfejl. Prøv igen.")); return; }
            retries++;
            setWtProgressMsg(`Genforbinder… (forsøg ${retries}/${MAX_RETRIES})`);
            setTimeout(connect, Math.min(2000 * retries, 10000));
          };
        };
        resetDeadline(); connect();
      });
    } catch (err: any) { setWtError(err.message || "Noget gik galt"); }
    finally { setWtGenerating(false); setWtProgressMsg(""); }
  };

  const handleWtReset = () => {
    if (wtHasUnsaved && !window.confirm("Er du sikker på du ikke vil gemme videoerne?")) return;
    setWtImages([]); setWtVideoUrls(null); setWtCleanVideoUrls(null); setWtSaveCaseId(null); setWtError(null);
  };

  const wtSaveToCase = async (c: ApiCase) => {
    if (!wtVideoUrls) return;
    setWtShowCaseDropdown(false); setWtSaveCaseId(c.id);
    try {
      const token = await user?.getIdToken();
      const headers = { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
      for (const mood of ALL_MOODS_WT.filter((m) => wtVideoUrls[m])) {
        const r = await fetch(`/api/bolig/cases/${c.id}/images`, { method: "POST", headers, body: JSON.stringify({ imageUrl: wtVideoUrls[mood], originalImageUrl: wtCleanVideoUrls?.[mood] ?? null, roomType: "walkthrough-video", style: `walkthrough-video-${mood}`, budgetTier: "tier2", promptText: `Cinematisk walkthrough — ${MOOD_LABELS_WT[mood]} stemning`, isDesignAgent: true }) });
        if (!r.ok) { setWtSaveCaseId(null); alert(`Kunne ikke gemme video til mappen.`); return; }
      }
      queryClient.invalidateQueries({ queryKey: ["/api/bolig/cases", c.id, "images"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bolig/cases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bolig/recent-images"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bolig/stats"] });
      if (wtResetTimerRef.current) clearTimeout(wtResetTimerRef.current);
      wtResetTimerRef.current = setTimeout(() => {
        wtResetTimerRef.current = null;
        setWtImages([]); setWtAddress(""); setWtVideoUrls(null); setWtCleanVideoUrls(null);
        setWtSaveCaseId(null); setWtError(null);
      }, 1500);
    } catch { setWtSaveCaseId(null); alert("Kunne ikke gemme til mappen. Prøv igen."); }
  };

  const handleWtDownload = async (url: string, mood: string) => {
    setWtDownloading(true);
    try { await downloadFromUrl(url, `walkthrough-${mood}-${new Date().toISOString().slice(0, 10)}.mp4`); }
    finally { setWtDownloading(false); }
  };

  const renderMorphDrop = (side: "before" | "after", preview: string | null, label: string) => (
    <div>
      <label className="text-xs font-semibold tracking-wider uppercase mb-2 block" style={{ color: "#0F1D2F" }}>{label}</label>
      {!preview ? (
        <label
          onDragOver={(e) => { e.preventDefault(); setDragSide(side); }}
          onDragLeave={() => setDragSide(null)}
          onDrop={(e) => { e.preventDefault(); setDragSide(null); const f = e.dataTransfer.files?.[0]; if (f) handleFile(side, f); }}
          className="block cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors"
          style={{ borderColor: dragSide === side ? "#C8956C" : "#D9D5CF", background: dragSide === side ? "rgba(200,149,108,0.05)" : "#F8F6F3" }}
          data-testid={`dropzone-video-${side}`}
        >
          <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(side, f); }} data-testid={`input-video-${side}`} />
          <Upload className="w-7 h-7 mx-auto mb-2" style={{ color: "#C8956C" }} />
          <p className="text-sm font-medium mb-1" style={{ color: "#0F1D2F" }}>Træk billede hertil</p>
          <p className="text-xs" style={{ color: "#6B6B6B" }}>JPG, PNG</p>
        </label>
      ) : (
        <div className="relative rounded-xl overflow-hidden border border-[#E8E4DE] bg-[#F8F6F3]">
          <img src={preview} alt={label} className="w-full h-64 object-contain" data-testid={`img-video-${side}-preview`} />
          <button onClick={() => { if (side === "before") { setBeforeFile(null); setBeforePreview(null); } else { setAfterFile(null); setAfterPreview(null); } setMorphVideoUrl(null); setMorphSaveCaseId(null); }} className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/95 flex items-center justify-center shadow-sm hover:bg-white" data-testid={`button-clear-video-${side}`}>
            <X className="w-4 h-4" style={{ color: "#0F1D2F" }} />
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1" style={{ color: "#0F1D2F", letterSpacing: "-0.02em" }}>Transformering video</h1>
        <p className="text-sm" style={{ color: "#6B6B6B" }}>
          {videoMode === "cinematic" ? "Upload 5–20 billeder af boligen — AI laver et klip per rum og syr det hele til én professionel walkthrough." : "Upload et før-billede og et efter-billede — AI skaber en flydende overgang imellem dem."}
        </p>
      </div>

      {/* Mode picker */}
      <div className="rounded-2xl border border-[#E8E4DE] bg-white p-6 md:p-8 mb-8 shadow-sm">
        <div className="text-[11px] font-bold uppercase tracking-wider mb-4 block" style={{ color: "#9B9690" }}>Videostil</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <button type="button" onClick={() => setVideoMode("cinematic")} disabled={morphGenerating || wtGenerating} className="text-left rounded-xl border p-4 transition-all disabled:opacity-50 hover:-translate-y-0.5" style={{ borderColor: videoMode === "cinematic" ? "#0F1D2F" : "#E8E4DE", background: videoMode === "cinematic" ? "#0F1D2F" : "white", color: videoMode === "cinematic" ? "white" : "#0F1D2F", boxShadow: videoMode === "cinematic" ? "0 4px 14px rgba(15,29,47,0.1)" : "none" }} data-testid="button-video-mode-cinematic">
            <div className="text-sm font-semibold mb-1">Cinematisk gennemgang</div>
            <div className="text-xs leading-relaxed" style={{ color: videoMode === "cinematic" ? "rgba(255,255,255,0.7)" : "#6B6B6B" }}>Upload 5–20 billeder · AI genererer klip per rum · professionel ejendomsmæglervideo</div>
          </button>
          <button type="button" onClick={() => setVideoMode("morph")} disabled={morphGenerating || wtGenerating} className="text-left rounded-xl border p-4 transition-all disabled:opacity-50 hover:-translate-y-0.5" style={{ borderColor: videoMode === "morph" ? "#0F1D2F" : "#E8E4DE", background: videoMode === "morph" ? "#0F1D2F" : "white", color: videoMode === "morph" ? "white" : "#0F1D2F", boxShadow: videoMode === "morph" ? "0 4px 14px rgba(15,29,47,0.1)" : "none" }} data-testid="button-video-mode-morph">
            <div className="text-sm font-semibold mb-1">Forvandling</div>
            <div className="text-xs leading-relaxed" style={{ color: videoMode === "morph" ? "rgba(255,255,255,0.7)" : "#6B6B6B" }}>1 før + 1 efter · statisk kamera · rummet ombygger sig på stedet</div>
          </button>
        </div>
        {videoMode === "morph" && (
          <button type="button" onClick={(e) => { e.stopPropagation(); setShowTransformEksempel(true); }} className="inline-flex items-center gap-1.5 text-xs font-semibold mt-4 px-3 py-1.5 rounded-full transition-all hover:bg-[#C8956C]/10" style={{ color: "#C8956C", background: "rgba(200,149,108,0.05)" }} data-testid="button-transform-eksempel">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none"/></svg>
            Se eksempel
          </button>
        )}
      </div>

      {/* ── Cinematisk Walkthrough UI ── */}
      {videoMode === "cinematic" && (
        <div className="rounded-2xl border border-[#E8E4DE] bg-white p-6 md:p-8 space-y-8 shadow-sm">
          {/* Image upload grid */}
          <div>
            <label className="text-[11px] font-bold tracking-wider uppercase mb-3 block" style={{ color: "#9B9690" }}>Billeder til walkthrough</label>
            <label
              onDragOver={(e) => { e.preventDefault(); setWtDragOver(true); }}
              onDragLeave={() => setWtDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setWtDragOver(false); wtAddFiles(e.dataTransfer.files); }}
              className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-12 text-center cursor-pointer transition-all duration-300 group hover:bg-[#C8956C]/[0.02]"
              style={{ borderColor: wtDragOver ? "#C8956C" : "#D9D5CF", background: wtDragOver ? "rgba(200,149,108,0.04)" : "#F8F6F3" }}
              data-testid="dropzone-walkthrough"
            >
              <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { if (e.target.files) wtAddFiles(e.target.files); }} data-testid="input-walkthrough-images" />
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5 transition-transform group-hover:scale-110 group-hover:bg-[#C8956C]/10" style={{ background: "#F0EDE7" }}>
                <Upload className="w-6 h-6" style={{ color: "#C8956C" }} />
              </div>
              <p className="text-base font-semibold mb-1" style={{ color: "#0F1D2F" }}>Træk billeder hertil eller klik for at vælge</p>
              <p className="text-sm" style={{ color: "#6B6B6B" }}>2–20 billeder · JPG, PNG · ét AI-klip per billede</p>
            </label>
          </div>

          {wtImages.length > 0 && (
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: "#9B9690" }}>{wtImages.length} billede{wtImages.length !== 1 ? "r" : ""} valgt — træk for at ændre rækkefølge</div>
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
                {wtImages.map((img, idx) => (
                  <div key={img.id} className="relative group rounded-xl overflow-hidden border border-[#E8E4DE] shadow-sm" data-testid={`img-walkthrough-${idx}`}>
                    <img src={img.url} alt={`Billede ${idx + 1}`} className="w-full object-cover" style={{ aspectRatio: "1/1" }} />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />
                    <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center text-[10px] font-bold text-white backdrop-blur-sm">{idx + 1}</div>
                    <button onClick={() => wtRemoveImage(img.id)} className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110" data-testid={`button-remove-walkthrough-${idx}`}>
                      <X className="w-3 h-3" style={{ color: "#0F1D2F" }} />
                    </button>
                    <div className="absolute bottom-2 inset-x-2 flex justify-between gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {idx > 0 ? <button onClick={() => wtMoveImage(idx, idx - 1)} className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center text-[10px] hover:bg-white font-bold transition-transform hover:scale-110 shadow-sm">←</button> : <div />}
                      {idx < wtImages.length - 1 && <button onClick={() => wtMoveImage(idx, idx + 1)} className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center text-[10px] hover:bg-white font-bold transition-transform hover:scale-110 shadow-sm">→</button>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider mb-3 block" style={{ color: "#9B9690" }}>Adresse (valgfri)</label>
            <input type="text" value={wtAddress} onChange={(e) => setWtAddress(e.target.value)} placeholder="fx Strandvejen 42, 2900 Hellerup" className="w-full h-12 px-4 rounded-xl border bg-[#F8F6F3] text-sm outline-none transition-all focus:border-[#C8956C] focus:bg-white" style={{ borderColor: "transparent", color: "#0F1D2F" }} data-testid="input-walkthrough-address" maxLength={80} />
          </div>

          <QuotaGate feature="showcase">
            <button onClick={handleWtGenerate} disabled={wtImages.length < 2 || wtGenerating} className="w-full h-12 rounded-full font-semibold text-sm text-white inline-flex items-center justify-center gap-2 transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:translate-y-0" style={{ background: "#C8956C", boxShadow: "0 4px 14px rgba(200,149,108,0.25)" }} data-testid="button-generate-walkthrough">
              {wtGenerating ? (<><RotateCcw className="w-4 h-4 animate-spin" />{wtProgressMsg || "Genererer…"}</>) : (<><Video className="w-4 h-4" />Generér cinematisk walkthrough</>)}
            </button>
          </QuotaGate>

          {wtGenerating && (
            <div className="rounded-xl border border-[#E8E4DE] bg-[#F8F6F3] p-4 text-center">
              <p className="text-sm font-medium mb-1" style={{ color: "#0F1D2F" }}>{wtProgressMsg || "Genererer…"}</p>
              <p className="text-[11px]" style={{ color: "#9B9690" }}>Ca. 5–15 min for {wtImages.length} billeder · Luk ikke vinduet</p>
            </div>
          )}

          {wtError && <div className="p-3 rounded-lg text-sm" style={{ background: "rgba(220,38,38,0.08)", color: "#B91C1C" }} data-testid="text-walkthrough-error">{wtError}</div>}

          {wtVideoUrls && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {ALL_MOODS_WT.filter((m) => wtVideoUrls[m]).map((mood) => (
                  <div key={mood} className="rounded-xl overflow-hidden border border-[#E8E4DE]">
                    <video src={wtVideoUrls[mood]} controls autoPlay={mood === "calm"} muted loop className="w-full block bg-black" style={{ aspectRatio: "9/16" }} data-testid={`video-walkthrough-${mood}`} />
                    <div className="p-3 bg-[#F8F6F3] flex items-center justify-between">
                      <span className="text-xs font-semibold" style={{ color: "#0F1D2F" }}>{MOOD_LABELS_WT[mood]}</span>
                      <button onClick={() => handleWtDownload(wtVideoUrls[mood], mood)} disabled={wtDownloading} className="text-xs font-medium flex items-center gap-1 disabled:opacity-50" style={{ color: "#C8956C" }} data-testid={`button-download-walkthrough-${mood}`}>
                        <Download className="w-3 h-3" />{wtDownloading ? "…" : "MP4"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-3">
                {activeCases.length > 0 && (
                  <div className="relative" ref={wtDropdownRef}>
                    <button onClick={() => setWtShowCaseDropdown((v) => !v)} className="h-11 px-5 rounded-full font-semibold text-sm flex items-center gap-2 border transition-all hover:opacity-80" style={{ borderColor: "#D9D5CF", color: "#1A1A1A", background: "#fff" }} data-testid="button-walkthrough-save-case">
                      <Video className="w-4 h-4" />{wtSaveCaseId ? "Gemt til mappe" : "Gem til mappe"}<ChevronDown className="w-3.5 h-3.5" />
                    </button>
                    {wtShowCaseDropdown && (
                      <div className="absolute left-0 top-full mt-1 w-56 rounded-xl shadow-xl border border-[#E8E4DE] bg-white z-20 py-1">
                        {activeCases.map((c) => (
                          <button key={c.id} onClick={() => wtSaveToCase(c)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-[#F5F3EF] transition-colors text-left" style={{ color: "#1A1A1A" }} data-testid={`button-walkthrough-save-case-${c.id}`}>
                            <Home className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#9B9690" }} /><span className="truncate">{c.address}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <button onClick={handleWtReset} className="h-11 px-5 rounded-full font-semibold text-sm flex items-center gap-2 border transition-all hover:opacity-80" style={{ borderColor: "#D9D5CF", color: "#1A1A1A", background: "#fff" }} data-testid="button-walkthrough-reset">
                  <RotateCcw className="w-4 h-4" /> Prøv igen
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Morph (Forvandling) UI ── */}
      {videoMode === "morph" && (
        <>
          <div className="rounded-2xl border border-[#E8E4DE] bg-white p-5 mb-6">
            <p className="text-[11px] font-bold tracking-[0.12em] uppercase mb-3" style={{ color: "#C8956C" }}>Se eksempel</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div><p className="text-[11px] font-medium mb-1.5" style={{ color: "#9B9690" }}>Før-billede</p><img src="/bolig-images/living-scandi-before.jpg" alt="Før eksempel" className="w-full h-auto rounded-xl" style={{ aspectRatio: "1/1" }} /></div>
              <div><p className="text-[11px] font-medium mb-1.5" style={{ color: "#9B9690" }}>Efter-billede</p><img src="/bolig-images/living-scandi-after.jpg" alt="Efter eksempel" className="w-full h-auto rounded-xl" style={{ aspectRatio: "1/1" }} /></div>
            </div>
            <p className="text-[11px] font-medium mb-1.5" style={{ color: "#9B9690" }}>Eksempel video</p>
            <video src="/eksempel-transformering.mp4" autoPlay muted loop playsInline className="w-full h-auto rounded-xl" style={{ aspectRatio: "1764/1172", background: "#0F1D2F" }} />
          </div>

          <div className="rounded-2xl border border-[#E8E4DE] bg-white p-6 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {renderMorphDrop("before", beforePreview, "Før-billede")}
              {renderMorphDrop("after", afterPreview, "Efter-billede")}
            </div>

            <QuotaGate feature="transformVideo">
              <button onClick={handleMorphGenerate} disabled={!beforeFile || !afterFile || morphGenerating} className="w-full h-12 rounded-full font-semibold text-sm text-white inline-flex items-center justify-center gap-2 transition-opacity disabled:opacity-50" style={{ background: "#C8956C" }} data-testid="button-generate-video">
                {morphGenerating ? (<><RotateCcw className="w-4 h-4 animate-spin" />{morphProgressStep === 1 ? "Sender billeder..." : morphProgressStep === 3 ? "Færdiggør video..." : "Bygger video..."}</>) : (<><Video className="w-4 h-4" />Generér forvandlingsvideo</>)}
              </button>
            </QuotaGate>

            {morphGenerating && (
              <div className="rounded-xl border border-[#E8E4DE] bg-[#F8F6F3] p-4">
                <div className="flex items-center justify-between mb-3">
                  {[{ step: 1, label: "Analyserer billeder" }, { step: 2, label: "Bygger video" }, { step: 3, label: "Færdiggør" }].map(({ step, label }, i) => (
                    <div key={step} className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 transition-all" style={{ background: morphProgressStep >= step ? "#C8956C" : "#E8E4DE", color: morphProgressStep >= step ? "#fff" : "#9B9690" }}>
                        {morphProgressStep > step ? "✓" : step}
                      </div>
                      <span className="text-xs" style={{ color: morphProgressStep >= step ? "#0F1D2F" : "#9B9690" }}>{label}</span>
                      {i < 2 && <div className="w-8 h-px mx-1 flex-shrink-0" style={{ background: morphProgressStep > step ? "#C8956C" : "#E8E4DE" }} />}
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-center" style={{ color: "#9B9690" }}>Ca. 1–3 minutter · Luk ikke vinduet</p>
              </div>
            )}

            {morphError && <div className="p-3 rounded-lg text-sm" style={{ background: "rgba(220,38,38,0.08)", color: "#B91C1C" }} data-testid="text-video-error">{morphError}</div>}

            {morphVideoUrl && (
              <>
                <div className="rounded-xl overflow-hidden border border-[#E8E4DE]">
                  <video src={morphVideoUrl} controls autoPlay loop className="w-full block bg-black" data-testid="video-result" />
                  <div className="p-3 bg-[#F8F6F3] flex items-center gap-2 text-xs" style={{ color: "#6B6B6B" }}><Sparkles className="w-3 h-3" style={{ color: "#C8956C" }} />AI-genereret forvandlingsvideo</div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button onClick={handleMorphDownload} disabled={morphDownloading} className="h-11 px-5 rounded-full font-semibold text-sm text-white inline-flex items-center gap-2 disabled:opacity-50" style={{ background: "#0F1D2F" }} data-testid="button-download-video">
                    <Download className="w-4 h-4" />{morphDownloading ? "Henter…" : "Download MP4"}
                  </button>
                  {activeCases.length > 0 && (
                    <div className="relative" ref={morphDropdownRef}>
                      <button onClick={() => setMorphShowCaseDropdown((v) => !v)} className="h-11 px-5 rounded-full font-semibold text-sm flex items-center gap-2 border transition-all hover:opacity-80" style={{ borderColor: "#D9D5CF", color: "#1A1A1A", background: "#fff" }} data-testid="button-video-save-case">
                        <Video className="w-4 h-4" />{morphSaveCaseId ? "Gemt til mappe" : "Gem til mappe"}<ChevronDown className="w-3.5 h-3.5" />
                      </button>
                      {morphShowCaseDropdown && (
                        <div className="absolute left-0 top-full mt-1 w-56 rounded-xl shadow-xl border border-[#E8E4DE] bg-white z-20 py-1">
                          {activeCases.map((c) => (
                            <button key={c.id} onClick={() => morphSaveToCase(c)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-[#F5F3EF] transition-colors text-left" style={{ color: "#1A1A1A" }} data-testid={`button-video-save-case-${c.id}`}>
                              <Home className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#9B9690" }} />
                              <span className="truncate">{c.address}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <button onClick={handleMorphReset} className="h-11 px-5 rounded-full font-semibold text-sm flex items-center gap-2 border transition-all hover:opacity-80" style={{ borderColor: "#D9D5CF", color: "#1A1A1A", background: "#fff" }} data-testid="button-video-reset">
                    <RotateCcw className="w-4 h-4" /> Prøv igen
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {showTransformEksempel && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.72)" }}
          onClick={() => setShowTransformEksempel(false)}
          data-testid="modal-transform-eksempel"
        >
          <div
            className="relative w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl"
            style={{ background: "#0F1D2F" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-white">Forvandling — eksempel</div>
                <div className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.5)" }}>AI-genereret transformation fra original til nyt interiør</div>
              </div>
              <button
                onClick={() => setShowTransformEksempel(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center transition-opacity hover:opacity-70"
                style={{ background: "rgba(255,255,255,0.1)", color: "white" }}
                data-testid="button-close-eksempel"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <video
              src="/eksempel-transformering.mp4"
              autoPlay
              muted
              loop
              controls
              className="w-full block"
              style={{ maxHeight: "60vh" }}
              data-testid="video-eksempel"
            />
            <div className="px-4 py-3 flex items-center gap-2 text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              Dette er et eksempel på hvad Forvandling kan producere. Resultater varierer efter billedkvalitet og stil.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Bolig Showcase Video Flow (powered by Rendy.io) ───────────────────────────
interface ShowcaseImg {
  id: string;
  file: File;
  url: string;
  presetKey: string;
  vfxKey: string | null;
  cropBox: { x: number; y: number; w: number; h: number } | null;
}

const BASE = "https://tcsffqhaqxggamwqimka.supabase.co/storage/v1/object/public";
const VFX_TRANSITIONS = [
  { key: "construction",      name: "Construction",       sampleVideoUrl: `${BASE}/assets/presets/video/1773231257553-or6bek.mp4` },
  { key: "renovate",          name: "Renovate",           sampleVideoUrl: `${BASE}/assets/presets/video/1778643690924-ag42oc.mp4` },
  { key: "lens-flare",        name: "Lens Flare",         sampleVideoUrl: `${BASE}/assets/presets/video/1773093349980-3mwrdk.mp4` },
  { key: "implosion",         name: "Implosion",          sampleVideoUrl: `${BASE}/assets/presets/video/1773231376986-jk4x5.mp4` },
  { key: "house-drop",        name: "House Drop",         sampleVideoUrl: `${BASE}/assets/presets/video/1782302974133-pdjr65.mp4` },
  { key: "fix-landscape",     name: "Fix Landscape",      sampleVideoUrl: `${BASE}/assets/presets/video/1773088735685-yju28w.mp4` },
  { key: "day-to-twilight",   name: "Day To Twilight",    sampleVideoUrl: `${BASE}/assets/presets/video/1773231349807-9wkdc.mp4` },
  { key: "sketch",            name: "Sketch",             sampleVideoUrl: `${BASE}/assets/presets/video/1773231276395-hs8j2w.mp4` },
  { key: "sunrise",           name: "Sunrise",            sampleVideoUrl: `${BASE}/assets/presets/video/1781521963146-4o5r7m.mp4` },
  { key: "lighting-strike",   name: "Lighting Strike",    sampleVideoUrl: `${BASE}/assets/presets/video/1780601989678-4wz0p.mp4` },
  { key: "money-rain",        name: "Money Rain",         sampleVideoUrl: `${BASE}/assets/presets/video/1773231390714-b8agpp.mp4` },
  { key: "helicopter-reveal", name: "Helicopter Reveal",  sampleVideoUrl: `${BASE}/assets/presets/video/1773231319219-rxr1uj.mp4` },
  { key: "snow-removal",      name: "Snow Removal",       sampleVideoUrl: `${BASE}/assets/presets/video/1773231240994-nkvhsu.mp4` },
  { key: "shadows",           name: "Shadows",            sampleVideoUrl: `${BASE}/assets/presets/video/1769730534229-iek4m.mp4` },
  { key: "car-drive",         name: "Car Drive",          sampleVideoUrl: `${BASE}/assets/presets/video/1781034542659-nrykc.mp4` },
  { key: "fireworks",         name: "Fireworks",          sampleVideoUrl: `${BASE}/assets/presets/video/1772387944096-u4n7ss.mp4` },
  { key: "day-to-night",      name: "Day to Night",       sampleVideoUrl: `${BASE}/assets/presets/video/1768136123246-lzhqhd.mp4` },
  { key: "build",             name: "Build",              sampleVideoUrl: `${BASE}/assets/presets/video/1768136134495-mj3zf.mp4` },
  { key: "3d-text-just-sold",    name: "3D Tekst: Just Sold",   sampleVideoUrl: `${BASE}/assets/presets/video/1782301716806-guceci.mp4` },
  { key: "3d-text-open-house",   name: "3D Tekst: Open House",  sampleVideoUrl: `${BASE}/assets/presets/video/1782302001187-6a022i.mp4` },
  { key: "3d-text-just-listed",  name: "3D Tekst: Just Listed", sampleVideoUrl: `${BASE}/assets/presets/video/1782301341756-ox8aft.mp4` },
  { key: "helicopter-drop-off",  name: "Helicopter Drop Off",   sampleVideoUrl: `${BASE}/assets/presets/video/1782302625157-mscc9h.mp4` },
];
const VFX_ACTORS = [
  { key: "family", name: "Family", sampleVideoUrl: `${BASE}/actors/previews/family.mp4` },
  { key: "man",    name: "Man",    sampleVideoUrl: `${BASE}/actors/previews/man.mp4` },
  { key: "woman",  name: "Woman",  sampleVideoUrl: `${BASE}/actors/previews/woman.mp4` },
  { key: "kids",   name: "Kids",   sampleVideoUrl: `${BASE}/actors/previews/kids.mp4` },
  { key: "couple", name: "Couple", sampleVideoUrl: `${BASE}/actors/previews/couple.mp4` },
];
const VFX_STAGING = [
  { key: "2d-3d-floorplan",  name: "2D > 3D Floor Plan",  sampleVideoUrl: `${BASE}/assets/presets/video/1775532692161-16w0je.mp4` },
  { key: "3d-miniature",     name: "3D Miniature",         sampleVideoUrl: `${BASE}/assets/presets/video/1775531632403-7j6qs.mp4` },
  { key: "starry-night",     name: "Starry Night",         sampleVideoUrl: `${BASE}/assets/presets/video/1778520552694-1l8qh5.mp4` },
  { key: "watercolor",       name: "Watercolor",           sampleVideoUrl: `${BASE}/assets/presets/video/1769732315811-t40lj.mp4` },
  { key: "light-dance",      name: "Light Dance",          sampleVideoUrl: `${BASE}/assets/presets/video/1773093250947-y0w04c.mp4` },
  { key: "balloons",         name: "Balloons",             sampleVideoUrl: `${BASE}/assets/presets/video/1773231334887-23v81m.mp4` },
  { key: "timelapse",        name: "Timelapse",            sampleVideoUrl: `${BASE}/assets/presets/video/1773231362851-1tx3vl.mp4` },
  { key: "electricity",      name: "Electricity",          sampleVideoUrl: `${BASE}/assets/presets/video/1773231295451-zf7bb.mp4` },
  { key: "glass-house",      name: "Glass House",          sampleVideoUrl: `${BASE}/assets/presets/video/1769200308900-4z6w09.mp4` },
  { key: "magazine",         name: "Magazine",             sampleVideoUrl: `${BASE}/assets/presets/video/1771961816109-ub00zs.mp4` },
  { key: "add-pool",         name: "Add Pool",             sampleVideoUrl: `${BASE}/assets/presets/video/1772391417442-vo4hk.mp4` },
  { key: "open-door",        name: "Open Door",            sampleVideoUrl: `${BASE}/assets/presets/video/1773089176614-gyo9ae.mp4` },
  { key: "concept-board",    name: "Concept Board",        sampleVideoUrl: `${BASE}/assets/presets/video/1773087324382-8ekhmt.mp4` },
  { key: "move-that-bus",    name: "Move that bus!",       sampleVideoUrl: `${BASE}/assets/presets/video/1772390400888-t7qtmh.mp4` },
  { key: "just-listed-sign", name: "Just Listed Sign",     sampleVideoUrl: `${BASE}/assets/presets/video/1772390537995-0uwkqo.mp4` },
  { key: "draw-lot-line",    name: "Draw Lot Line",        sampleVideoUrl: `${BASE}/assets/presets/video/1771024170103-kvqoqq.mp4` },
  { key: "sketch-artist",    name: "Sketch Artist",        sampleVideoUrl: `${BASE}/assets/presets/video/1775532088810-zq90b7.mp4` },
  { key: "earth-zoom",       name: "Earth Zoom",           sampleVideoUrl: `${BASE}/assets/presets/video/1773231403159-i4e019.mp4` },
];

const CAMERA_PRESETS: { key: string; name: string; icon: string; animName: string; videoSrc: string }[] = [
  { key: "SLIDER_LEFT",    name: "Slide Left",      icon: "M19 12H5M12 5l-7 7 7 7",                                                                                                                                                                                                        animName: "cam-slide-left", videoSrc: "/cam-previews/slider-left.mp4" },
  { key: "SLIDER_RIGHT",   name: "Slide Right",     icon: "M5 12h14M12 5l7 7-7 7",                                                                                                                                                                                                         animName: "cam-slide-right", videoSrc: "/cam-previews/slider-right.mp4" },
  { key: "PARALLAX_LEFT",  name: "Parallax Left",   icon: "M2.5 12C2.5 6.75 6.75 2.5 12 2.5a9.5 9.5 0 0 1 6.6 2.66M21.5 12c0 5.25-4.25 9.5-9.5 9.5a9.5 9.5 0 0 1-6.6-2.66M2 8l.5 4.5 4-2M22 16l-.5-4.5-4 2",                                                                          animName: "cam-orbit-left", videoSrc: "/cam-previews/parallax-left.mp4" },
  { key: "PARALLAX_RIGHT", name: "Parallax Right",  icon: "M21.5 12C21.5 6.75 17.25 2.5 12 2.5a9.5 9.5 0 0 0-6.6 2.66M2.5 12c0 5.25 4.25 9.5 9.5 9.5a9.5 9.5 0 0 0 6.6-2.66M22 8l-.5 4.5-4-2M2 16l.5-4.5 4 2",                                                                         animName: "cam-orbit-right", videoSrc: "/cam-previews/parallax-right.mp4" },
  { key: "PUSH-IN",        name: "Push-In",         icon: "M5 12h14M12 5l7 7-7 7",                                                                                                                                                                                                         animName: "cam-push-in", videoSrc: "/cam-previews/push-in.mp4" },
  { key: "CRANE-DOWN",     name: "Crane Down",      icon: "M12 5v14M5 12l7 7 7-7",                                                                                                                                                                                                         animName: "cam-crane-down", videoSrc: "/cam-previews/crane-down.mp4" },
  { key: "CRANE-UP",       name: "Crane Up",        icon: "M12 19V5M5 12l7-7 7 7",                                                                                                                                                                                                         animName: "cam-crane-up", videoSrc: "/cam-previews/crane-up.mp4" },
  { key: "PEDESTAL-DOWN",  name: "Pedestal Down",   icon: "M12 5v14M5 16l7 7 7-7",                                                                                                                                                                                                         animName: "cam-pedestal-down", videoSrc: "/cam-previews/pedestal-down.mp4" },
  { key: "PEDESTAL-UP",    name: "Pedestal Up",     icon: "M12 19V5M5 8l7-7 7 7",                                                                                                                                                                                                          animName: "cam-pedestal-up", videoSrc: "/cam-previews/pedestal-up.mp4" },
  { key: "PULL-OUT",       name: "Pull-Out",        icon: "M19 12H5M12 5l-7 7 7 7M3 3l18 18",                                                                                                                                                                                              animName: "cam-pull-out", videoSrc: "/cam-previews/pull-out.mp4" },
  { key: "STATIC",         name: "Static",          icon: "M8 6h8M8 10h8M8 14h8M8 18h8",                                                                                                                                                                                                  animName: "cam-static", videoSrc: "/cam-previews/static.mp4" },
];

const CAM_PREVIEW_CSS = `
@keyframes cam-slide-left    { 0%{transform:perspective(600px) translateX(6%)} 100%{transform:perspective(600px) translateX(-6%)} }
@keyframes cam-slide-right   { 0%{transform:perspective(600px) translateX(-6%)} 100%{transform:perspective(600px) translateX(6%)} }
@keyframes cam-push-in       { 0%{transform:perspective(600px) translateZ(0)} 100%{transform:perspective(600px) translateZ(70px)} }
@keyframes cam-pull-out      { 0%{transform:perspective(600px) translateZ(70px)} 100%{transform:perspective(600px) translateZ(0)} }
@keyframes cam-orbit-left    { 0%{transform:perspective(600px) rotateY(9deg) translateX(3%) scale(1.06)} 100%{transform:perspective(600px) rotateY(-9deg) translateX(-3%) scale(1.06)} }
@keyframes cam-orbit-right   { 0%{transform:perspective(600px) rotateY(-9deg) translateX(-3%) scale(1.06)} 100%{transform:perspective(600px) rotateY(9deg) translateX(3%) scale(1.06)} }
@keyframes cam-crane-down    { 0%{transform:perspective(600px) rotateX(-5deg) translateY(-5%) scale(1.04)} 100%{transform:perspective(600px) rotateX(5deg) translateY(5%) scale(1.04)} }
@keyframes cam-crane-up      { 0%{transform:perspective(600px) rotateX(5deg) translateY(5%) scale(1.04)} 100%{transform:perspective(600px) rotateX(-5deg) translateY(-5%) scale(1.04)} }
@keyframes cam-pedestal-down { 0%{transform:perspective(600px) translateY(-6%)} 100%{transform:perspective(600px) translateY(6%)} }
@keyframes cam-pedestal-up   { 0%{transform:perspective(600px) translateY(6%)} 100%{transform:perspective(600px) translateY(-6%)} }
@keyframes cam-static        { 0%,100%{transform:scale(1)} }
.cam-preview-scene { width:145%; height:145%; transition:none; animation-timing-function:ease-in-out; animation-iteration-count:infinite; animation-direction:alternate; animation-duration:6s; }
`;

async function cropImageToFile(file: File, cropBox: { x: number; y: number; w: number; h: number }): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const sw = img.naturalWidth;
      const sh = img.naturalHeight;
      const cx = Math.round(cropBox.x * sw);
      const cy = Math.round(cropBox.y * sh);
      const cw = Math.max(1, Math.round(cropBox.w * sw));
      const ch = Math.max(1, Math.round(cropBox.h * sh));
      const canvas = document.createElement("canvas");
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, cx, cy, cw, ch, 0, 0, cw, ch);
      canvas.toBlob((blob) => {
        resolve(new File([blob!], file.name, { type: "image/jpeg" }));
      }, "image/jpeg", 0.92);
    };
    img.src = objectUrl;
  });
}

interface RendyPreset {
  key: string;
  name: string | null;
  description: string | null;
  sampleVideoUrl: string | null;
  iconUrl: string | null;
  order: number;
}

interface RendyVideo {
  id: string;
  url: string | null;
  templateId: string;
  status: "rendering" | "success" | "error" | null;
  progress: number;
  clips: string[];
}

function ShowcaseVideoFlow({ cases }: { cases: ApiCase[] }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [images, setImages] = useState<ShowcaseImg[]>([]);
  const [address, setAddress] = useState("");
  const [ratio, setRatio] = useState<"portrait" | "landscape">("portrait");
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [resultVideos, setResultVideos] = useState<RendyVideo[]>([]);
  const [renderingVideos, setRenderingVideos] = useState<RendyVideo[]>([]);
  const [listingId, setListingId] = useState<string | null>(null);
  const [exportJobId, setExportJobId] = useState<string | null>(null);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  // Panel state: which image is selected, which panel tab
  const [openPanelId, setOpenPanelId] = useState<string | null>(null);
  const [panelTab, setPanelTab] = useState<"camera" | "vfx">("camera");
  const [vfxSubTab, setVfxSubTab] = useState<"transitions" | "actors" | "staging">("transitions");
  // Crop modal
  const [cropModalImg, setCropModalImg] = useState<ShowcaseImg | null>(null);
  const [cropDraft, setCropDraft] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [cropK, setCropK] = useState<number | null>(null);
  const cropDragRef = useRef<{ mode: "move" | "nw" | "ne" | "sw" | "se"; px: number; py: number; orig: { x: number; y: number; w: number; h: number } } | null>(null);
  const cropImgRef = useRef<HTMLImageElement | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const [showcaseSaveCaseId, setShowcaseSaveCaseId] = useState<number | null>(null);
  const [showcaseShowCaseDropdown, setShowcaseShowCaseDropdown] = useState(false);
  const showcaseDropdownRef = useRef<HTMLDivElement>(null);
  const showcaseResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (showcaseResetTimerRef.current) clearTimeout(showcaseResetTimerRef.current); }, []);

  // Example video: only play while actually visible. The flow is always-mounted
  // (CSS-hidden by the parent), so an unconditional autoPlay would download and
  // loop the video from dashboard mount even when this tab is never opened.
  const exampleVideoRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const el = exampleVideoRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) el.play().catch(() => {});
      else el.pause();
    }, { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (showcaseDropdownRef.current && !showcaseDropdownRef.current.contains(e.target as Node))
        setShowcaseShowCaseDropdown(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const showcaseSaveToCase = async (c: ApiCase) => {
    if (!resultVideos.length) return;
    setShowcaseShowCaseDropdown(false);
    setShowcaseSaveCaseId(c.id);
    try {
      const token = await user?.getIdToken();
      const headers = { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
      for (const [idx, video] of resultVideos.entries()) {
        if (!video.url) continue;
        const r = await fetch(`/api/bolig/cases/${c.id}/images`, {
          method: "POST", headers,
          body: JSON.stringify({
            imageUrl: video.url,
            originalImageUrl: video.url,
            roomType: "showcase-video",
            style: `showcase-video-${idx + 1}`,
            budgetTier: "tier2",
            promptText: `Bolig showcase video ${idx + 1}${address ? ` — ${address}` : ""}`,
            isDesignAgent: true,
          }),
        });
        if (!r.ok) { setShowcaseSaveCaseId(null); alert("Kunne ikke gemme video til mappen."); return; }
      }
      queryClient.invalidateQueries({ queryKey: ["/api/bolig/cases", c.id, "images"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bolig/cases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bolig/recent-images"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bolig/stats"] });
      if (showcaseResetTimerRef.current) clearTimeout(showcaseResetTimerRef.current);
      showcaseResetTimerRef.current = setTimeout(() => {
        showcaseResetTimerRef.current = null;
        setImages([]); setResultVideos([]); setListingId(null); setExportUrl(null);
        setExportJobId(null); setError(null); setProgressPct(0); setProgressMsg("");
        setShowcaseSaveCaseId(null); setShowcaseShowCaseDropdown(false);
      }, 1500);
    } catch { setShowcaseSaveCaseId(null); alert("Kunne ikke gemme til mappen. Prøv igen."); }
  };

  const effectsAdded = images.filter((i) => (i.presetKey && i.presetKey !== "DEFAULT") || i.vfxKey).length;

  const { data: presetsData } = useQuery<{ success: boolean; presets: RendyPreset[] }>({
    queryKey: ["/api/bolig/rendy/presets"],
  });
  const presets = presetsData?.presets ?? [];

  const addFiles = (files: FileList | File[]) => {
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (arr.length === 0) { setError("Vælg venligst billedfiler"); return; }
    if (showcaseResetTimerRef.current) { clearTimeout(showcaseResetTimerRef.current); showcaseResetTimerRef.current = null; }
    setError(null);
    setResultVideos([]);
    setListingId(null);
    setExportUrl(null);
    const next = arr.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      url: URL.createObjectURL(file),
      presetKey: "DEFAULT",
      vfxKey: null,
      cropBox: null,
    }));
    setImages((prev) => [...prev, ...next].slice(0, 20));
  };

  const removeImage = (id: string) => {
    setImages((prev) => prev.filter((i) => i.id !== id));
    if (openPanelId === id) setOpenPanelId(null);
    setResultVideos([]);
    setListingId(null);
  };

  const moveImage = (from: number, to: number) => {
    if (from === to || to < 0 || to >= images.length) return;
    setImages((prev) => {
      const copy = [...prev];
      const [moved] = copy.splice(from, 1);
      copy.splice(to, 0, moved);
      return copy;
    });
  };

  // Rendy accepts exactly ONE preset per image (camera movement OR VFX),
  // so selecting one clears the other.
  const setPresetForImage = (id: string, key: string) => {
    setImages((prev) => prev.map((img) => img.id === id ? { ...img, presetKey: key, vfxKey: key !== "DEFAULT" ? null : img.vfxKey } : img));
    setOpenPanelId(null);
  };

  const setVfxForImage = (id: string, key: string | null) => {
    setImages((prev) => prev.map((img) => img.id === id ? { ...img, vfxKey: key, presetKey: key ? "DEFAULT" : img.presetKey } : img));
    setOpenPanelId(null);
  };

  // ── Rendy-style crop: a pre-made frame locked to the output format (9:16 / 16:9).
  //    The user drags the frame to position it, or resizes it via corner handles —
  //    the frame always keeps the video's aspect ratio. Coordinates are normalized 0-1.
  const cropAspect = ratio === "portrait" ? 9 / 16 : 16 / 9; // output pixel aspect (w/h)

  const getCropNorm = (e: { clientX: number; clientY: number }, imgEl: HTMLImageElement): { px: number; py: number } => {
    const rect = imgEl.getBoundingClientRect();
    return {
      px: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      py: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  };

  const initCropFrame = (el: HTMLImageElement) => {
    if (!el.naturalWidth || !el.naturalHeight) return;
    // In normalized coords the frame must satisfy h = k·w to match the output aspect
    const k = el.naturalWidth / (cropAspect * el.naturalHeight);
    setCropK(k);
    const existing = cropModalImg?.cropBox;
    if (existing) {
      const boxAspect = (existing.w * el.naturalWidth) / (existing.h * el.naturalHeight);
      if (Math.abs(boxAspect - cropAspect) / cropAspect < 0.02) { setCropDraft(existing); return; }
    }
    // Default: the largest possible frame, centered
    if (k <= 1) setCropDraft({ x: 0, y: (1 - k) / 2, w: 1, h: k });
    else setCropDraft({ x: (1 - 1 / k) / 2, y: 0, w: 1 / k, h: 1 });
  };

  useEffect(() => {
    if (!cropModalImg) { setCropK(null); return; }
    const el = cropImgRef.current;
    if (el && el.complete && el.naturalWidth) initCropFrame(el);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cropModalImg?.id]);

  const startCropDrag = (e: React.PointerEvent, mode: "move" | "nw" | "ne" | "sw" | "se") => {
    if (!cropImgRef.current || !cropDraft) return;
    e.preventDefault();
    e.stopPropagation();
    const pt = getCropNorm(e, cropImgRef.current);
    cropDragRef.current = { mode, px: pt.px, py: pt.py, orig: cropDraft };
  };

  const CROP_MIN_W = 0.12;
  const handleCropPointerMove = (e: React.PointerEvent) => {
    const drag = cropDragRef.current;
    if (!drag || !cropImgRef.current || !cropK) return;
    e.preventDefault();
    const pt = getCropNorm(e, cropImgRef.current);
    const dx = pt.px - drag.px;
    const dy = pt.py - drag.py;
    const o = drag.orig;
    const k = cropK;
    if (drag.mode === "move") {
      const x = Math.max(0, Math.min(1 - o.w, o.x + dx));
      const y = Math.max(0, Math.min(1 - o.h, o.y + dy));
      setCropDraft({ ...o, x, y });
      return;
    }
    let w: number;
    if (drag.mode === "se") {
      const maxW = Math.min(1 - o.x, (1 - o.y) / k);
      w = Math.min(maxW, Math.max(CROP_MIN_W, Math.max(o.w + dx, (o.h + dy) / k)));
      setCropDraft({ x: o.x, y: o.y, w, h: k * w });
    } else if (drag.mode === "ne") {
      const x1 = o.x, y2 = o.y + o.h;
      const maxW = Math.min(1 - x1, y2 / k);
      w = Math.min(maxW, Math.max(CROP_MIN_W, Math.max(o.w + dx, (o.h - dy) / k)));
      setCropDraft({ x: x1, y: y2 - k * w, w, h: k * w });
    } else if (drag.mode === "sw") {
      const x2 = o.x + o.w, y1 = o.y;
      const maxW = Math.min(x2, (1 - y1) / k);
      w = Math.min(maxW, Math.max(CROP_MIN_W, Math.max(o.w - dx, (o.h + dy) / k)));
      setCropDraft({ x: x2 - w, y: y1, w, h: k * w });
    } else {
      const x2 = o.x + o.w, y2 = o.y + o.h;
      const maxW = Math.min(x2, y2 / k);
      w = Math.min(maxW, Math.max(CROP_MIN_W, Math.max(o.w - dx, (o.h - dy) / k)));
      setCropDraft({ x: x2 - w, y: y2 - k * w, w, h: k * w });
    }
  };

  const endCropDrag = () => { cropDragRef.current = null; };

  const applyCrop = () => {
    if (!cropModalImg || !cropDraft) return;
    setImages((prev) => prev.map((img) => img.id === cropModalImg.id ? { ...img, cropBox: cropDraft } : img));
    setCropModalImg(null);
    setCropDraft(null);
    setCropK(null);
  };

  const handleGenerate = async () => {
    if (images.length < 1) { setError("Upload mindst 1 billede"); return; }
    if (showcaseResetTimerRef.current) { clearTimeout(showcaseResetTimerRef.current); showcaseResetTimerRef.current = null; }
    setIsGenerating(true);
    setOpenPanelId(null);
    setError(null);
    setResultVideos([]);
    setListingId(null);
    setExportUrl(null);
    setExportJobId(null);
    setProgressPct(0);
    setProgressMsg("Forbereder upload…");
    if (esRef.current) { esRef.current.close(); esRef.current = null; }
    try {
      const token = await auth.currentUser?.getIdToken();
      const fd = new FormData();
      for (const img of images) {
        const file = img.cropBox ? await cropImageToFile(img.file, img.cropBox) : img.file;
        fd.append("images", file);
      }
      fd.append("address", address.trim());
      fd.append("ratio", ratio);
      fd.append("presetKeys", JSON.stringify(images.map((img) => img.presetKey || "DEFAULT")));
      fd.append("vfxKeys", JSON.stringify(images.map((img) => img.vfxKey || null)));
      const res = await fetch("/api/bolig/showcase-video", {
        method: "POST",
        body: fd,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const ctype = res.headers.get("content-type") || "";
      if (!ctype.includes("application/json")) throw new Error(`Serverfejl (${res.status}). Prøv igen.`);
      const data = await res.json();
      if (!res.ok || !data.success || !data.job_id) throw new Error(data.message || "Indsendelse mislykkedes");
      const jobId = data.job_id as string;

      await new Promise<void>((resolve, reject) => {
        const TIMEOUT_MS = 45 * 60 * 1000;
        const MAX_RETRIES = 12;
        let retries = 0;
        let settled = false;
        let deadlineTimer: ReturnType<typeof setTimeout>;
        const resetDeadline = () => {
          clearTimeout(deadlineTimer);
          deadlineTimer = setTimeout(() => {
            esRef.current?.close(); esRef.current = null;
            if (!settled) { settled = true; reject(new Error("Generering tog for lang tid. Prøv igen.")); }
          }, TIMEOUT_MS);
        };
        const connect = () => {
          const es = new EventSource(`/api/bolig/showcase-video/progress/${jobId}`);
          esRef.current = es;
          es.onmessage = (e) => {
            retries = 0;
            try {
              const p = JSON.parse(e.data) as { stage: string; progress?: number; message?: string; videos?: any[]; listingId?: string };
              if (p.message) setProgressMsg(p.message);
              if (typeof p.progress === "number") setProgressPct(Math.round(p.progress));
              if (p.videos && Array.isArray(p.videos)) setRenderingVideos((p.videos as RendyVideo[]).map((v) => (typeof v.progress === "number" ? { ...v, progress: Math.round(v.progress) } : v)));
              if (p.stage === "complete" && p.videos) {
                clearTimeout(deadlineTimer); es.close(); esRef.current = null;
                if (!settled) {
                  settled = true;
                  setResultVideos(p.videos as RendyVideo[]);
                  setRenderingVideos([]);
                  if (p.listingId) setListingId(p.listingId);
                  resolve();
                }
              } else if (p.stage === "failed") {
                clearTimeout(deadlineTimer); es.close(); esRef.current = null;
                if (!settled) { settled = true; reject(new Error(p.message || "Generering mislykkedes")); }
              } else { resetDeadline(); }
            } catch { /* ignore */ }
          };
          es.onerror = () => {
            es.close(); esRef.current = null;
            if (settled) return;
            retries++;
            if (retries >= MAX_RETRIES) { settled = true; reject(new Error("Mistede forbindelsen til serveren.")); return; }
            setTimeout(connect, 2000 * retries);
          };
          resetDeadline();
        };
        connect();
      });
    } catch (e: any) {
      setError(e.message || "Noget gik galt");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExport = async () => {
    if (!listingId) return;
    setIsExporting(true);
    setExportUrl(null);
    try {
      const res = await fetch(`/api/bolig/showcase-video/${listingId}/export`, { method: "POST" });
      const data = await res.json();
      if (data.downloadUrl) { setExportUrl(data.downloadUrl); setIsExporting(false); return; }
      const ej = data.jobId as string;
      setExportJobId(ej);
      while (true) {
        await new Promise((r) => setTimeout(r, 2000));
        const sr = await fetch(`/api/bolig/rendy/export/${ej}`);
        const sd = await sr.json();
        if (sd.status === "ready" && sd.downloadUrl) { setExportUrl(sd.downloadUrl); break; }
        if (sd.status === "error") throw new Error(sd.error || "Export fejlede");
      }
    } catch (e: any) {
      setError(e.message || "Export fejlede");
    } finally {
      setIsExporting(false);
    }
  };

  const handleReset = () => {
    if (resultVideos.length > 0 && !window.confirm("Nulstil showcase og miste de genererede videoer?")) return;
    setImages([]);
    setResultVideos([]);
    setListingId(null);
    setExportUrl(null);
    setExportJobId(null);
    setError(null);
    setProgressPct(0);
    setProgressMsg("");
    setShowcaseSaveCaseId(null);
    setShowcaseShowCaseDropdown(false);
  };

  const handleDownload = async (url: string, name: string) => {
    setDownloading(name);
    try { await downloadFromUrl(url, name); } finally { setDownloading(null); }
  };

  const vfxSubList = vfxSubTab === "transitions" ? VFX_TRANSITIONS : vfxSubTab === "actors" ? VFX_ACTORS : VFX_STAGING;
  const panelImg = images.find((i) => i.id === openPanelId) ?? null;

  return (
    <div style={{ paddingLeft: "3.5%" }}>
      {/* ── Crop Modal ── */}
      {cropModalImg && (
        <div
          className="fixed inset-0 z-50 flex flex-col"
          style={{ background: "rgba(0,0,0,0.88)" }}
          onPointerMove={handleCropPointerMove}
          onPointerUp={endCropDrag}
          onPointerLeave={endCropDrag}
        >
          <div className="flex items-center justify-between px-6 py-4 shrink-0">
            <button
              type="button"
              onClick={() => {
                if (cropModalImg) {
                  setImages((prev) => prev.map((i) => i.id === cropModalImg.id ? { ...i, cropBox: null } : i));
                }
                setCropModalImg(null); setCropDraft(null); setCropK(null); cropDragRef.current = null;
              }}
              className="h-9 px-4 rounded-full text-sm font-semibold border border-white/20 text-white/80 hover:text-white hover:border-white/40 transition-all"
              data-testid="button-crop-remove"
            >
              Fjern afskæring
            </button>
            <div className="flex items-center gap-2.5">
              <span className="text-white font-semibold text-sm">Afskær billede</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(200,149,108,0.2)", color: "#C8956C" }}>
                {ratio === "portrait" ? "9:16 · Lodret" : "16:9 · Vandret"}
              </span>
            </div>
            <button
              type="button"
              onClick={applyCrop}
              disabled={!cropDraft}
              className="h-9 px-4 rounded-full text-sm font-semibold text-white transition-all disabled:opacity-40"
              style={{ background: "#C8956C" }}
              data-testid="button-crop-save"
            >
              Gem afskæring
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center p-6 select-none">
            <div className="relative inline-block touch-none">
              <img
                ref={cropImgRef}
                src={cropModalImg.url}
                alt="Afskær"
                className="max-h-[70vh] max-w-full rounded-lg block"
                draggable={false}
                onLoad={(e) => initCropFrame(e.currentTarget)}
              />
              {cropDraft && (
                <div
                  className="absolute cursor-move"
                  onPointerDown={(e) => startCropDrag(e, "move")}
                  style={{
                    left: `${cropDraft.x * 100}%`,
                    top: `${cropDraft.y * 100}%`,
                    width: `${cropDraft.w * 100}%`,
                    height: `${cropDraft.h * 100}%`,
                    boxShadow: "0 0 0 9999px rgba(0,0,0,0.6)",
                    border: "2px solid #C8956C",
                    boxSizing: "border-box",
                    borderRadius: 4,
                  }}
                  data-testid="crop-frame"
                >
                  {/* Rule-of-thirds guides */}
                  <div className="absolute inset-y-0 pointer-events-none" style={{ left: "33.33%", width: 1, background: "rgba(255,255,255,0.25)" }} />
                  <div className="absolute inset-y-0 pointer-events-none" style={{ left: "66.66%", width: 1, background: "rgba(255,255,255,0.25)" }} />
                  <div className="absolute inset-x-0 pointer-events-none" style={{ top: "33.33%", height: 1, background: "rgba(255,255,255,0.25)" }} />
                  <div className="absolute inset-x-0 pointer-events-none" style={{ top: "66.66%", height: 1, background: "rgba(255,255,255,0.25)" }} />
                  {/* Corner resize handles */}
                  {([["nw", "top-0 left-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize"], ["ne", "top-0 right-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize"], ["sw", "bottom-0 left-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize"], ["se", "bottom-0 right-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize"]] as const).map(([corner, cls]) => (
                    <div
                      key={corner}
                      onPointerDown={(e) => startCropDrag(e, corner)}
                      className={`absolute w-3.5 h-3.5 rounded-full transform ${cls}`}
                      style={{ background: "#C8956C", border: "2px solid #fff", boxShadow: "0 1px 4px rgba(0,0,0,0.4)" }}
                      data-testid={`crop-handle-${corner}`}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
          <p className="text-center pb-5 shrink-0 text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>
            Flyt rammen for at vælge hvad der kommer med i videoen — træk i hjørnerne for at ændre størrelsen
          </p>
        </div>
      )}

      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold" style={{ color: "#0F1D2F", letterSpacing: "-0.02em" }}>Bolig Showcase</h1>
        </div>
        <p className="text-sm" style={{ color: "#6B6B6B" }}>Upload op til 20 boligbilleder. Vælg kamerabevægelse eller VFX-effekt per billede — eller lad Rendy vælge automatisk. Baggrundsmusik vælges automatisk til videoen.</p>
      </div>

      {/* Eksempel */}
      <div className="rounded-2xl border border-[#E8E4DE] bg-white p-5 mb-8 shadow-sm max-w-4xl">
        <p className="text-[11px] font-bold tracking-[0.12em] uppercase mb-3" style={{ color: "#C8956C" }}>Se eksempel</p>
        <div className="rounded-xl overflow-hidden border border-[#E8E4DE] flex justify-center" style={{ background: "#0F1D2F" }}>
          <video
            ref={exampleVideoRef}
            src="/videos/eksempel-bolig-showcase.mp4"
            poster="/bolig-images/showcase-eksempel-poster.jpg"
            preload="none"
            muted
            loop
            playsInline
            className="h-auto"
            style={{ aspectRatio: "9/16", maxHeight: 480 }}
            data-testid="showcase-example-video"
          />
        </div>
      </div>

      <div className="rounded-2xl border border-[#E8E4DE] bg-white overflow-hidden">

        {/* ── Top bar: Address + Format ── */}
        <div className="px-5 pt-5 pb-4 border-b border-[#F0EDE9] flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex-1 min-w-0">
            <span className="text-[11px] font-semibold uppercase tracking-wider block mb-1.5" style={{ color: "#9B9690" }}>Boligadresse</span>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: "#C8956C" }} />
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                disabled={isGenerating}
                placeholder="F.eks. Strandvejen 12, 2900 Hellerup"
                maxLength={120}
                className="w-full h-9 rounded-lg border pl-8 pr-3 text-sm outline-none disabled:opacity-50"
                style={{ borderColor: "#E8E4DE", background: "#F8F6F3", color: "#0F1D2F" }}
                data-testid="input-showcase-address"
              />
            </div>
          </div>
          <div className="shrink-0">
            <span className="text-[11px] font-semibold uppercase tracking-wider block mb-1.5" style={{ color: "#9B9690" }}>Video Format</span>
            <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: "#E8E4DE" }}>
              {(["portrait", "landscape"] as const).map((r) => {
                const active = ratio === r;
                return (
                  <button key={r} type="button"
                    onClick={() => {
                      if (isGenerating || ratio === r) return;
                      setRatio(r);
                      // Crops are locked to the output aspect — clear them when the format changes
                      setImages((prev) => prev.map((img) => img.cropBox ? { ...img, cropBox: null } : img));
                    }}
                    disabled={isGenerating}
                    className="flex items-center gap-2 px-4 h-9 text-sm font-semibold transition-all disabled:opacity-50"
                    style={{
                      background: active ? "#0F1D2F" : "#fff",
                      color: active ? "#fff" : "#6B6B6B",
                      borderRight: r === "portrait" ? "1px solid #E8E4DE" : undefined,
                    }}
                    data-testid={`button-ratio-${r}`}
                  >
                    {r === "portrait" ? (
                      <svg width="10" height="14" viewBox="0 0 10 14" fill="none"><rect x="0.5" y="0.5" width="9" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.2" fill={active ? "currentColor" : "none"} opacity={active ? 0.25 : 1} /><rect x="0.5" y="0.5" width="9" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.2" fill="none" /></svg>
                    ) : (
                      <svg width="14" height="10" viewBox="0 0 14 10" fill="none"><rect x="0.5" y="0.5" width="13" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2" fill={active ? "currentColor" : "none"} opacity={active ? 0.25 : 1} /><rect x="0.5" y="0.5" width="13" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2" fill="none" /></svg>
                    )}
                    {r === "portrait" ? "Lodret" : "Landskab"}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Upload zone (when no images) ── */}
        {images.length === 0 && (
          <label
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setIsDragOver(false); if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files); }}
            className="block cursor-pointer p-12 text-center transition-colors m-5 rounded-xl border-2 border-dashed"
            style={{ borderColor: isDragOver ? "#C8956C" : "#D9D5CF", background: isDragOver ? "rgba(200,149,108,0.04)" : "#F8F6F3" }}
            data-testid="dropzone-showcase"
          >
            <input type="file" accept="image/*" multiple className="hidden"
              onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.currentTarget.value = ""; }}
              data-testid="input-showcase-images"
            />
            <Upload className="w-8 h-8 mx-auto mb-3" style={{ color: "#C8956C" }} />
            <p className="text-sm font-medium mb-1" style={{ color: "#0F1D2F" }}>Træk billeder hertil eller klik for at vælge</p>
            <p className="text-xs" style={{ color: "#9B9690" }}>Op til 20 billeder · JPG, PNG, WebP</p>
          </label>
        )}

        {/* ── Thumbnails grid (row-grouped so panel appears directly under image) ── */}
        {images.length > 0 && (() => {
          const COLS = ratio === "portrait" ? 5 : 3;
          const totalRows = Math.ceil(images.length / COLS);

          const renderThumb = (img: ShowcaseImg, idx: number) => {
            const vidProgress = renderingVideos[idx]?.progress ?? null;
            const hasCamera = img.presetKey && img.presetKey !== "DEFAULT";
            const hasVfx = !!img.vfxKey;
            const hasCrop = !!img.cropBox;
            const cameraLabel = hasCamera ? (presets.find((p) => p.key === img.presetKey)?.name || img.presetKey) : null;
            const vfxLabel = hasVfx ? ([...VFX_TRANSITIONS, ...VFX_ACTORS, ...VFX_STAGING].find((v) => v.key === img.vfxKey)?.name || img.vfxKey) : null;
            const isSelected = openPanelId === img.id;
            const panelOpen = openPanelId !== null;

            return (
              <div
                key={img.id}
                draggable={!isGenerating}
                onDragStart={() => setDragIndex(idx)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (dragIndex !== null) moveImage(dragIndex, idx); setDragIndex(null); }}
                onDragEnd={() => setDragIndex(null)}
                className="relative rounded-xl overflow-hidden group cursor-move"
                style={{
                  border: isSelected ? "2px solid #C8956C" : dragIndex === idx ? "2px solid #C8956C" : "2px solid transparent",
                  background: "#F0EDE9",
                  transition: "filter 0.2s, opacity 0.2s, transform 0.2s",
                  filter: panelOpen && !isSelected ? "blur(2px) brightness(0.75)" : "none",
                  transform: isSelected ? "scale(1.02)" : "scale(1)",
                }}
                data-testid={`thumb-showcase-${idx}`}
              >
                <div className={`relative w-full overflow-hidden ${ratio === "portrait" ? "aspect-[9/16]" : "aspect-video"}`}>
                  {img.cropBox ? (
                    <img
                      src={img.url}
                      alt={`Billede ${idx + 1}`}
                      className="absolute block max-w-none"
                      style={{
                        width: `${(100 / img.cropBox.w)}%`,
                        height: `${(100 / img.cropBox.h)}%`,
                        left: `${(-img.cropBox.x / img.cropBox.w) * 100}%`,
                        top: `${(-img.cropBox.y / img.cropBox.h) * 100}%`,
                      }}
                    />
                  ) : (
                    <img src={img.url} alt={`Billede ${idx + 1}`} className="w-full h-full object-cover block" />
                  )}

                  {/* Number badge (Rendy-style solid dark badge) */}
                  <div className="absolute top-2 left-2 w-6 h-6 rounded-lg text-white text-[11px] font-bold flex items-center justify-center shadow-md" style={{ background: "#0F1D2F" }}>
                    {idx + 1}
                  </div>

                  {/* Mini preview badges (camera / VFX / crop) */}
                  <div className="absolute top-2 right-2 flex flex-col gap-1 items-end max-w-[72px]">
                    {hasCamera && (() => {
                      const cp = CAMERA_PRESETS.find((p) => p.key === img.presetKey);
                      return (
                        <div className="rounded-lg overflow-hidden shadow-md" style={{ background: "#0F1D2F", width: 64 }}>
                          <div className="flex items-center justify-center" style={{ height: 36, background: "#1A2D42" }}>
                            {cp ? (
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C8956C" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <path d={cp.icon} />
                              </svg>
                            ) : (
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C8956C" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                            )}
                          </div>
                          <div className="px-1.5 py-1 text-center">
                            <span className="text-[8px] font-bold leading-none block truncate" style={{ color: "#C8956C" }}>{cameraLabel}</span>
                          </div>
                        </div>
                      );
                    })()}
                    {hasVfx && (
                      <div className="rounded-lg overflow-hidden shadow-md" style={{ background: "#2D1B69", width: 64 }}>
                        <div className="flex items-center justify-center" style={{ height: 36, background: "#3D2580" }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#A78BFA" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L9.5 9.5H2l6.2 4.5-2.4 7.5L12 17l6.2 4.5-2.4-7.5L22 9.5h-7.5L12 2z"/></svg>
                        </div>
                        <div className="px-1.5 py-1 text-center">
                          <span className="text-[8px] font-bold leading-none block truncate" style={{ color: "#A78BFA" }}>{vfxLabel}</span>
                        </div>
                      </div>
                    )}
                    {hasCrop && (
                      <div className="rounded-lg shadow-md px-1.5 py-1 flex items-center gap-1" style={{ background: "#1D3A6B" }}>
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#93C5FD" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 2 6 18 22 18"/><polyline points="2 6 18 6 18 22"/></svg>
                        <span className="text-[8px] font-bold" style={{ color: "#93C5FD" }}>Afskåret</span>
                      </div>
                    )}
                  </div>

                  {/* Progress overlay during generation */}
                  {isGenerating && vidProgress !== null && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ background: "rgba(15,29,47,0.65)" }}>
                      <span className="text-white font-bold text-lg leading-none">{Math.round(vidProgress)}%</span>
                      <div className="w-3/4 mt-2 h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.25)" }}>
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${vidProgress}%`, background: "#C8956C" }} />
                      </div>
                    </div>
                  )}
                  {isGenerating && vidProgress === null && (
                    <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(15,29,47,0.45)" }}>
                      <RotateCcw className="w-5 h-5 text-white animate-spin opacity-80" />
                    </div>
                  )}

                  {/* 3-icon hover toolbar */}
                  {!isGenerating && (
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                      <div className="flex items-center gap-1 px-3 h-9 rounded-2xl shadow-xl" style={{ background: "#fff" }}>
                        {/* Crop */}
                        <div className="relative group/crop">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setCropModalImg(img); setCropDraft(null); setCropK(null); cropDragRef.current = null; }}
                            className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors hover:bg-[#F0EDE9]"
                            style={{ color: hasCrop ? "#1D6BC8" : "#0F1D2F" }}
                            data-testid={`button-crop-${idx}`}
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 2 6 18 22 18"/><polyline points="2 6 18 6 18 22"/></svg>
                          </button>
                          <span className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-black/80 text-white text-[9px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap opacity-0 group-hover/crop:opacity-100 transition-opacity pointer-events-none">Afskær</span>
                        </div>

                        <div className="w-px h-5 bg-[#E8E4DE]" />

                        {/* VFX */}
                        <div className="relative group/vfx">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isSelected && panelTab === "vfx") { setOpenPanelId(null); }
                              else { setOpenPanelId(img.id); setPanelTab("vfx"); }
                            }}
                            className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors hover:bg-[#F0EDE9]"
                            style={{ color: hasVfx || (isSelected && panelTab === "vfx") ? "#7C3AED" : "#0F1D2F" }}
                            data-testid={`button-vfx-${idx}`}
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L9.5 9.5H2l6.2 4.5-2.4 7.5L12 17l6.2 4.5-2.4-7.5L22 9.5h-7.5L12 2z"/></svg>
                          </button>
                          <span className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-black/80 text-white text-[9px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap opacity-0 group-hover/vfx:opacity-100 transition-opacity pointer-events-none">VFX</span>
                        </div>

                        <div className="w-px h-5 bg-[#E8E4DE]" />

                        {/* Camera */}
                        <div className="relative group/cam">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isSelected && panelTab === "camera") { setOpenPanelId(null); }
                              else { setOpenPanelId(img.id); setPanelTab("camera"); }
                            }}
                            className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors hover:bg-[#F0EDE9]"
                            style={{ color: hasCamera || (isSelected && panelTab === "camera") ? "#C8956C" : "#0F1D2F" }}
                            data-testid={`button-camera-${idx}`}
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                          </button>
                          <span className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-black/80 text-white text-[9px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap opacity-0 group-hover/cam:opacity-100 transition-opacity pointer-events-none">Kamera</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Remove button */}
                  {!isGenerating && !hasCamera && !hasVfx && !hasCrop && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeImage(img.id); }}
                      className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      data-testid={`button-showcase-remove-${idx}`}
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                  )}
                </div>
              </div>
            );
          };

          return (
            <div className="px-4 pt-4 space-y-2">
              {Array.from({ length: totalRows }, (_, rowIdx) => {
                const start = rowIdx * COLS;
                const rowImgs = images.slice(start, Math.min(start + COLS, images.length));
                const isLastRow = rowIdx === totalRows - 1;

                return (
                  <div key={rowIdx}>
                    <div style={{ display: "grid", gridTemplateColumns: `repeat(${COLS}, 1fr)`, gap: 8 }}>
                      {rowImgs.map((img, relIdx) => renderThumb(img, start + relIdx))}
                      {isLastRow && images.length < 20 && !isGenerating && (
                        <label
                          className={`rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-colors ${ratio === "portrait" ? "aspect-[9/16]" : "aspect-video"}`}
                          style={{ borderColor: "#D9D5CF", background: "#F8F6F3" }}
                          data-testid="add-more-images"
                        >
                          <input type="file" accept="image/*" multiple className="hidden"
                            onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.currentTarget.value = ""; }}
                          />
                          <Upload className="w-5 h-5 mb-1" style={{ color: "#C8956C" }} />
                          <span className="text-[10px] font-semibold" style={{ color: "#9B9690" }}>Tilføj</span>
                        </label>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* ── Fixed bottom panel for VFX / Camera selection ── */}
        {panelImg && !isGenerating && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-40"
              style={{ background: "rgba(0,0,0,0.25)" }}
              onClick={() => setOpenPanelId(null)}
            />
            {/* Panel */}
            <div
              className="fixed bottom-0 left-0 md:left-56 right-0 z-50 rounded-t-2xl shadow-2xl border-t overflow-hidden"
              style={{ borderColor: "#E8E4DE", background: "#fff" }}
            >
              {panelTab === "camera" ? (
                <>
                  <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: "#F0EDE9", background: "#F8F6F3" }}>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: "#0F1D2F" }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                      </div>
                      <span className="text-sm font-semibold" style={{ color: "#0F1D2F" }}>Kamerabevægelse</span>
                      <span className="text-xs" style={{ color: "#9B9690" }}>— Billede {images.indexOf(panelImg) + 1}</span>
                    </div>
                    <button type="button" onClick={() => setOpenPanelId(null)} className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-[#E8E4DE] transition-colors">
                      <X className="w-3.5 h-3.5" style={{ color: "#6B6B6B" }} />
                    </button>
                  </div>
                  <div className="flex gap-3 px-4 py-4 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                    <style dangerouslySetInnerHTML={{ __html: CAM_PREVIEW_CSS }} />
                    <button type="button" onClick={() => setPresetForImage(panelImg.id, "DEFAULT")}
                      className="flex-shrink-0 flex flex-col items-center gap-2 p-2.5 rounded-xl border-2 transition-all"
                      style={{ width: 200, borderColor: panelImg.presetKey === "DEFAULT" ? "#C8956C" : "#E8E4DE", background: panelImg.presetKey === "DEFAULT" ? "#FDF8F4" : "#F8F6F3" }}
                      data-testid="cam-preset-auto-bottom">
                      <div className="w-full rounded-lg overflow-hidden relative bg-black" style={{ aspectRatio: "16/9" }}>
                        <img src={panelImg.url} alt="" aria-hidden className="cam-preview-scene object-cover" style={{ animationName: "cam-push-in", position: "absolute", left: "-15%", top: "-15%" }} />
                        <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
                          <span style={{ fontSize:11, fontWeight:700, color:"#fff", background:"rgba(15,29,47,0.7)", borderRadius:6, padding:"3px 10px", letterSpacing:"0.06em" }}>AUTO</span>
                        </div>
                      </div>
                      <span className="text-sm font-semibold" style={{ color: panelImg.presetKey === "DEFAULT" ? "#C8956C" : "#0F1D2F" }}>Auto</span>
                    </button>
                    {CAMERA_PRESETS.map((p) => {
                      const isSelected = panelImg.presetKey === p.key;
                      return (
                        <button key={p.key} type="button" onClick={() => setPresetForImage(panelImg.id, p.key)}
                          className="flex-shrink-0 flex flex-col items-center gap-2 p-2.5 rounded-xl border-2 transition-all"
                          style={{ width: 200, borderColor: isSelected ? "#C8956C" : "#E8E4DE", background: isSelected ? "#FDF8F4" : "#F8F6F3" }}
                          data-testid={`cam-preset-bottom-${p.key}`}>
                          <div className="w-full rounded-lg overflow-hidden relative bg-black" style={{ aspectRatio: "16/9" }}>
                            <video src={p.videoSrc} autoPlay muted loop playsInline aria-hidden className="w-full h-full object-cover" data-testid={`video-cam-example-${p.key}`} />
                            <div style={{ position:"absolute", bottom:6, right:6 }}>
                              <div style={{ background:"rgba(15,29,47,0.65)", borderRadius:"50%", width:28, height:28, display:"flex", alignItems:"center", justifyContent:"center" }}>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <path d={p.icon} />
                                </svg>
                              </div>
                            </div>
                          </div>
                          <span className="text-sm font-semibold text-center leading-tight" style={{ color: isSelected ? "#C8956C" : "#0F1D2F" }}>{p.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <>
                  <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: "#F0EDE9", background: "#F8F6F3" }}>
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: "#7C3AED" }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M12 2L9.5 9.5H2l6.2 4.5-2.4 7.5L12 17l6.2 4.5-2.4-7.5L22 9.5h-7.5L12 2z"/></svg>
                      </div>
                      <span className="text-sm font-semibold" style={{ color: "#0F1D2F" }}>VFX Effekter</span>
                      <span className="text-xs" style={{ color: "#9B9690" }}>— Billede {images.indexOf(panelImg) + 1}</span>
                      <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: "#E8E4DE" }}>
                        {(["transitions","actors","staging"] as const).map((tab) => (
                          <button key={tab} type="button" onClick={() => setVfxSubTab(tab)}
                            className="px-3 h-7 text-xs font-semibold transition-all"
                            style={{ background: vfxSubTab === tab ? "#7C3AED" : "#fff", color: vfxSubTab === tab ? "#fff" : "#6B6B6B" }}>
                            {tab === "transitions" ? "Transitions" : tab === "actors" ? "Actors" : "Staging"}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button type="button" onClick={() => setOpenPanelId(null)} className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-[#E8E4DE] transition-colors">
                      <X className="w-3.5 h-3.5" style={{ color: "#6B6B6B" }} />
                    </button>
                  </div>
                  <div className="flex gap-3 px-4 py-4 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                    <button type="button" onClick={() => setVfxForImage(panelImg.id, null)}
                      className="flex-shrink-0 flex flex-col items-center gap-2 p-2.5 rounded-xl border-2 transition-all"
                      style={{ width: 200, borderColor: !panelImg.vfxKey ? "#7C3AED" : "#E8E4DE", background: !panelImg.vfxKey ? "#F5F0FD" : "#F8F6F3" }}
                      data-testid="vfx-none-bottom">
                      <div className="w-full rounded-lg flex items-center justify-center" style={{ aspectRatio: "16/9", background: !panelImg.vfxKey ? "#EDE8FA" : "#F0EDE9" }}>
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={!panelImg.vfxKey ? "#7C3AED" : "#9B9690"} strokeWidth="1.5"><path d="M12 2L9.5 9.5H2l6.2 4.5-2.4 7.5L12 17l6.2 4.5-2.4-7.5L22 9.5h-7.5L12 2z"/></svg>
                      </div>
                      <span className="text-sm font-semibold" style={{ color: !panelImg.vfxKey ? "#7C3AED" : "#0F1D2F" }}>Ingen</span>
                    </button>
                    {vfxSubList.map((v) => {
                      const isSelected = panelImg.vfxKey === v.key;
                      return (
                        <button key={v.key} type="button" onClick={() => setVfxForImage(panelImg.id, v.key)}
                          className="flex-shrink-0 flex flex-col items-center gap-2 p-2.5 rounded-xl border-2 transition-all"
                          style={{ width: 200, borderColor: isSelected ? "#7C3AED" : "#E8E4DE", background: isSelected ? "#F5F0FD" : "#F8F6F3" }}
                          data-testid={`vfx-bottom-${v.key}`}>
                          <div className="w-full rounded-lg overflow-hidden" style={{ aspectRatio: "16/9", background: isSelected ? "#EDE8FA" : "#F0EDE9" }}>
                            {v.sampleVideoUrl ? (
                              <video src={v.sampleVideoUrl} autoPlay muted loop playsInline className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={isSelected ? "#7C3AED" : "#9B9690"} strokeWidth="1.5"><path d="M12 2L9.5 9.5H2l6.2 4.5-2.4 7.5L12 17l6.2 4.5-2.4-7.5L22 9.5h-7.5L12 2z"/></svg>
                              </div>
                            )}
                          </div>
                          <span className="text-sm font-semibold text-center leading-tight" style={{ color: isSelected ? "#7C3AED" : "#0F1D2F" }}>{v.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {/* Error */}
        {error && (
          <div className="mx-5 mb-4 mt-3 p-3 rounded-lg text-sm" style={{ background: "rgba(220,38,38,0.08)", color: "#B91C1C" }} data-testid="text-showcase-error">
            {error}
          </div>
        )}

        {/* ── Progress bar (during generation) ── */}
        {isGenerating && (
          <div className="mx-5 mb-4 space-y-1.5">
            <div className="flex justify-between text-xs" style={{ color: "#6B6B6B" }}>
              <span>{progressMsg || "Genererer videoer…"}</span>
              <span className="font-semibold tabular-nums">{progressPct}%</span>
            </div>
            <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "#E8E4DE" }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%`, background: "#C8956C" }}
              />
            </div>
          </div>
        )}

        {/* ── Bottom status bar (Rendy-style) ── */}
        {images.length > 0 && (
          <div className="px-5 pb-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-t border-[#F0EDE9] pt-4">
            <div className="flex items-center gap-5">
              <div>
                <div className="flex items-center gap-2">
                  <ImageIcon className="w-4 h-4" style={{ color: "#0F1D2F" }} />
                  <span className="text-sm font-semibold" style={{ color: "#0F1D2F" }} data-testid="text-showcase-image-count">{images.length}/20 billeder valgt</span>
                </div>
                <div className="mt-1.5 h-1 w-40 rounded-full overflow-hidden" style={{ background: "#E8E4DE" }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${(images.length / 20) * 100}%`, background: "#0F1D2F" }} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4" style={{ color: effectsAdded > 0 ? "#C8956C" : "#9B9690" }} />
                <span className="text-sm font-semibold" style={{ color: effectsAdded > 0 ? "#C8956C" : "#9B9690" }}>
                  {effectsAdded}/{images.length} effekter valgt
                </span>
              </div>
              <div className="hidden md:flex items-center gap-1.5">
                <Music className="w-3.5 h-3.5" style={{ color: "#9B9690" }} />
                <span className="text-xs" style={{ color: "#9B9690" }}>Musik vælges automatisk</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { setImages([]); setResultVideos([]); setError(null); }}
                disabled={isGenerating}
                className="h-10 px-4 rounded-full text-sm font-semibold border transition-all disabled:opacity-40"
                style={{ borderColor: "#D9D5CF", color: "#6B6B6B", background: "#fff" }}
                data-testid="button-showcase-clear-all"
              >
                Annuller
              </button>
              <QuotaGate feature="showcase">
                <button
                  onClick={handleGenerate}
                  disabled={images.length < 1 || isGenerating}
                  className="h-10 px-5 rounded-full font-semibold text-sm text-white inline-flex items-center gap-2 transition-opacity disabled:opacity-50"
                  style={{ background: "#0F1D2F" }}
                  data-testid="button-generate-showcase"
                >
                  {isGenerating ? (
                    <><RotateCcw className="w-4 h-4 animate-spin" />Genererer…</>
                  ) : (
                    <><Film className="w-4 h-4" />Generér listing</>
                  )}
                </button>
              </QuotaGate>
            </div>
          </div>
        )}

        {/* ── No images yet: show generate button placeholder ── */}
        {images.length === 0 && (
          <div className="px-5 pb-5" />
        )}
      </div>

      {/* ── Results ── */}
      {resultVideos.length > 0 && (
        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" style={{ color: "#C8956C" }} />
              <span className="text-sm font-semibold" style={{ color: "#0F1D2F" }}>{resultVideos.length} video{resultVideos.length === 1 ? "" : "er"} genereret</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {cases.length > 0 && (
                <div className="relative" ref={showcaseDropdownRef}>
                  <button
                    onClick={() => setShowcaseShowCaseDropdown((v) => !v)}
                    className="h-9 px-4 rounded-full text-sm font-semibold border inline-flex items-center gap-1.5 transition-opacity hover:opacity-80"
                    style={{ borderColor: showcaseSaveCaseId ? "#C8956C" : "#0F1D2F", color: showcaseSaveCaseId ? "#C8956C" : "#0F1D2F", background: "#fff" }}
                    data-testid="button-showcase-save-case"
                  >
                    <Video className="w-3.5 h-3.5" />
                    {showcaseSaveCaseId ? "Gemt til mappe" : "Gem til mappe"}
                    <ChevronDown className="w-3 h-3" />
                  </button>
                  {showcaseShowCaseDropdown && (
                    <div className="absolute left-0 top-full mt-1 w-56 rounded-xl shadow-xl border border-[#E8E4DE] bg-white z-20 py-1">
                      {cases.map((c) => (
                        <button key={c.id} onClick={() => showcaseSaveToCase(c)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-[#F5F3EF] transition-colors text-left" style={{ color: "#1A1A1A" }} data-testid={`button-showcase-save-case-${c.id}`}>
                          <Home className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#9B9690" }} /><span className="truncate">{c.address}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {listingId && (
                <button
                  onClick={handleExport}
                  disabled={isExporting}
                  className="h-9 px-4 rounded-full text-sm font-semibold border inline-flex items-center gap-1.5 transition-opacity disabled:opacity-50"
                  style={{ borderColor: "#0F1D2F", color: "#0F1D2F", background: "#fff" }}
                  data-testid="button-export-zip"
                >
                  {isExporting ? <RotateCcw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  {isExporting ? "Pakker…" : "Download alle (.zip)"}
                </button>
              )}
              {exportUrl && (
                <a
                  href={exportUrl}
                  download
                  className="h-9 px-4 rounded-full text-sm font-semibold inline-flex items-center gap-1.5 text-white"
                  style={{ background: "#C8956C" }}
                  data-testid="link-download-zip"
                >
                  <Download className="w-3.5 h-3.5" /> Hent zip
                </a>
              )}
              <button
                onClick={handleReset}
                className="h-9 px-4 rounded-full font-semibold text-sm flex items-center gap-2 border transition-all hover:opacity-80"
                style={{ borderColor: "#D9D5CF", color: "#1A1A1A", background: "#fff" }}
                data-testid="button-showcase-reset"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Ny showcase
              </button>
            </div>
          </div>

          <div className={`grid gap-4 ${ratio === "portrait" ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2"}`}>
            {resultVideos.map((video, idx) => (
              <div key={video.id} className="rounded-xl overflow-hidden border border-[#E8E4DE] bg-[#F8F6F3]" data-testid={`card-rendy-video-${idx}`}>
                <div className="bg-[#0F1D2F] px-3 py-2 flex items-center justify-between">
                  <span className="text-white text-[11px] font-semibold">Video {idx + 1}</span>
                  <span className="text-[10px] font-mono" style={{ color: "#9B9690" }}>#{video.id.slice(0, 6)}</span>
                </div>
                {video.url ? (
                  <video
                    src={video.url}
                    controls
                    loop
                    muted
                    playsInline
                    className={`w-full object-contain bg-black ${ratio === "portrait" ? "aspect-[9/16]" : "aspect-video"}`}
                    data-testid={`video-rendy-${idx}`}
                  />
                ) : (
                  <div className={`w-full flex items-center justify-center ${ratio === "portrait" ? "aspect-[9/16]" : "aspect-video"}`} style={{ background: "#1A1A2E", color: "#fff" }}>
                    <span className="text-xs">Video ikke klar</span>
                  </div>
                )}
                {video.url && (
                  <div className="p-2">
                    <button
                      onClick={() => { const ts = new Date().toISOString().slice(0, 10); handleDownload(video.url!, `rendy-video-${idx + 1}-${ts}.mp4`); }}
                      disabled={!!downloading}
                      className="w-full h-8 rounded-full text-xs font-semibold text-white inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                      style={{ background: "#0F1D2F" }}
                      data-testid={`button-download-video-${idx}`}
                    >
                      <Download className="w-3 h-3" /> Download
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── AI Design Agent Flow ───────────────────────────────────────────────────────
// ── AI Boligfremvisning (property tours) ─────────────────────────────────────
interface AiTourProperty {
  id: number;
  name: string;
  floorplanUrl: string;
  threedPlanUrl: string | null;
  style: string | null;
  tier: string | null;
  status: string;
  createdAt: string;
}

interface AiTourRoom {
  id: number;
  propertyId: number;
  name: string;
  posX: string | number;
  posY: string | number;
  width: string | number;
  height: string | number;
  color: string;
  included: boolean;
  style: string | null;
  roomPhotoUrl: string | null;
  roomPhotoUrl2: string | null;
  afterImageUrl: string | null;
  afterImageUrl2: string | null;
  panoramaUrl: string | null;
  videoUrl: string | null;
  analysisData: any | null;
}

// Tier presets surfaced in the picker. Internally maps to the existing Bolig
// prompt tiers (tier1/tier2/tier3) on the server. "premium" is exposed in the
// UI but stored as "luxury" so it aligns with BOLIG_STYLE_LABELS.
const TOUR_TIER_OPTIONS: Array<{ key: "budget" | "standard" | "premium"; label: string; sub: string }> = [
  { key: "budget",   label: "Budget",   sub: "Hurtigt overblik" },
  { key: "standard", label: "Standard", sub: "Balanceret stil" },
  { key: "premium",  label: "Premium",  sub: "Højest detalje" },
];

const ROOM_COLORS = ["#C8956C", "#7A8F6F", "#6F8FA8", "#A87B6F", "#8B7AA8", "#A89E6F"];
const ROOM_NAME_SUGGESTIONS = ["Stue", "Køkken", "Soveværelse", "Badeværelse", "Entré", "Spisestue", "Børneværelse", "Kontor"];

function PropertyTourFlow() {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"list" | "create" | "detail" | "final">("list");
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: properties = [], isLoading } = useQuery<AiTourProperty[]>({
    queryKey: ["/api/ai-boligfremvisning/properties"],
    queryFn: async () => {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/ai-boligfremvisning/properties", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
  });

  const resetCreate = () => {
    setName("");
    setFile(null);
    setPreview(null);
    setError(null);
  };

  const handleFile = (f: File) => {
    if (!f.type.startsWith("image/")) { setError("Vælg venligst en billedfil"); return; }
    setFile(f);
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(f);
  };

  const handleCreate = async () => {
    if (!name.trim() || !file) return;
    setSubmitting(true);
    setError(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      const fd = new FormData();
      fd.append("name", name.trim());
      fd.append("floorplan", file);
      const res = await fetch("/api/ai-boligfremvisning/properties", {
        method: "POST",
        body: fd,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Kunne ikke oprette projekt");
      queryClient.invalidateQueries({ queryKey: ["/api/ai-boligfremvisning/properties"] });
      resetCreate();
      // Jump straight into the new project so the user can start marking
      // rooms immediately — they shouldn't have to bounce back to the list
      // and re-click the card they just created.
      if (data?.id) {
        setCurrentId(data.id);
        setMode("detail");
      } else {
        setMode("list");
      }
    } catch (err: any) {
      setError(err.message || "Noget gik galt");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Slet dette projekt?")) return;
    const token = await auth.currentUser?.getIdToken();
    await fetch(`/api/ai-boligfremvisning/properties/${id}`, {
      method: "DELETE",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    queryClient.invalidateQueries({ queryKey: ["/api/ai-boligfremvisning/properties"] });
  };

  if (mode === "detail" && currentId !== null) {
    return (
      <PropertyTourDetail
        propertyId={currentId}
        onBack={() => { setCurrentId(null); setMode("list"); }}
        onFinish={() => setMode("final")}
      />
    );
  }

  if (mode === "final" && currentId !== null) {
    return (
      <PropertyTourFinal
        propertyId={currentId}
        onBack={() => setMode("detail")}
        onClose={() => { setCurrentId(null); setMode("list"); }}
      />
    );
  }

  if (mode === "create") {
    return (
      <div className="max-w-5xl">
        <div className="mb-8">
          <button
            onClick={() => { resetCreate(); setMode("list"); }}
            className="text-xs font-semibold tracking-wider uppercase mb-3 inline-flex items-center gap-1"
            style={{ color: "#6B6B6B" }}
            data-testid="button-back-to-tour-list"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Tilbage
          </button>
          <h1 className="text-2xl font-bold mb-1" style={{ color: "#0F1D2F", letterSpacing: "-0.02em" }}>Nyt boligfremvisnings-projekt</h1>
          <p className="text-sm" style={{ color: "#6B6B6B" }}>Giv projektet et navn og upload plantegningen. Næste skridt bliver at markere rummene.</p>
        </div>

      <div className="rounded-2xl border border-[#E8E4DE] bg-white p-6 md:p-8 space-y-6 shadow-sm">
        <div>
          <label className="text-[11px] font-bold tracking-wider uppercase mb-3 block" style={{ color: "#9B9690" }}>Projektnavn</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="f.eks. Strandvejen 12"
            className="w-full h-12 px-4 rounded-xl border bg-[#F8F6F3] text-sm outline-none transition-all focus:border-[#C8956C] focus:bg-white"
            style={{ borderColor: "transparent", color: "#0F1D2F" }}
            data-testid="input-tour-name"
          />
        </div>

        <div>
          <label className="text-[11px] font-bold tracking-wider uppercase mb-3 block" style={{ color: "#9B9690" }}>Plantegning</label>
          {!preview ? (
            <label
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                const f = e.dataTransfer.files?.[0];
                if (f) handleFile(f);
              }}
              className="block cursor-pointer rounded-2xl border-2 border-dashed p-12 text-center transition-all duration-300 group hover:bg-[#C8956C]/[0.02]"
              style={{ borderColor: isDragging ? "#C8956C" : "#D9D5CF", background: isDragging ? "rgba(200,149,108,0.04)" : "#F8F6F3" }}
              data-testid="dropzone-tour-floorplan"
            >
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                data-testid="input-tour-floorplan"
              />
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5 transition-transform group-hover:scale-110 group-hover:bg-[#C8956C]/10" style={{ background: "#F0EDE7" }}>
                <Upload className="w-6 h-6" style={{ color: "#C8956C" }} />
              </div>
              <p className="text-base font-semibold mb-1" style={{ color: "#0F1D2F" }}>Træk plantegning hertil eller klik for at vælge</p>
              <p className="text-sm" style={{ color: "#6B6B6B" }}>JPG, PNG · maks 10 MB</p>
            </label>
          ) : (
            <div className="relative rounded-2xl overflow-hidden border border-[#E8E4DE] shadow-sm">
              <img src={preview} alt="Plantegning" className="w-full max-h-[400px] object-contain bg-[#F8F6F3]" data-testid="img-tour-floorplan-preview" />
              <button
                onClick={() => { setFile(null); setPreview(null); }}
                className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/95 flex items-center justify-center shadow-md hover:bg-white transition-transform hover:scale-105"
                data-testid="button-clear-tour-floorplan"
              >
                <X className="w-4 h-4" style={{ color: "#0F1D2F" }} />
              </button>
            </div>
          )}
        </div>

        <button
          onClick={handleCreate}
          disabled={!name.trim() || !file || submitting}
          className="w-full h-12 rounded-full font-semibold text-sm text-white inline-flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-50"
          style={{ background: "#C8956C" }}
          data-testid="button-create-tour-project"
        >
          {submitting ? (<><RotateCcw className="w-4 h-4 animate-spin" /> Opretter...</>) : (<>Opret projekt</>)}
        </button>

        {error && (
          <div className="p-3 rounded-xl text-sm font-medium" style={{ background: "#FEF2F2", color: "#B91C1C" }} data-testid="text-tour-error">
            {error}
          </div>
        )}
      </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold mb-1" style={{ color: "#0F1D2F", letterSpacing: "-0.02em" }} data-testid="heading-ai-boligfremvisning">AI boligfremvisning</h1>
          <p className="text-sm" style={{ color: "#6B6B6B" }}>Upload en plantegning, markér rum, vælg stil, og lad AI generere en komplet visuel boligfremvisning.</p>
        </div>
        <button
          onClick={() => setMode("create")}
          className="h-11 px-6 rounded-full font-semibold text-sm text-white inline-flex items-center gap-2 flex-shrink-0 transition-transform hover:-translate-y-0.5 shadow-sm"
          style={{ background: "#C8956C" }}
          data-testid="button-new-tour-project"
        >
          <Upload className="w-4 h-4" /> Nyt projekt
        </button>
      </div>

      {isLoading ? (
        <div className="text-sm font-medium animate-pulse" style={{ color: "#9B9690" }}>Indlæser projekter...</div>
      ) : properties.length === 0 ? (
        <div className="rounded-3xl border border-dashed p-16 text-center" style={{ borderColor: "#D9D5CF", background: "#F8F6F3" }}>
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: "white", boxShadow: "0 4px 14px rgba(15,29,47,0.05)" }}>
            <Home className="w-8 h-8" style={{ color: "#C8956C" }} />
          </div>
          <p className="text-base font-semibold mb-2" style={{ color: "#0F1D2F" }}>Ingen projekter endnu</p>
          <p className="text-sm max-w-sm mx-auto mb-6 leading-relaxed" style={{ color: "#6B6B6B" }}>Start dit første boligfremvisnings-projekt ved at uploade en plantegning. Det tager kun få minutter at opsætte.</p>
          <button
            onClick={() => setMode("create")}
            className="h-11 px-6 rounded-full font-semibold text-sm text-white inline-flex items-center gap-2 transition-transform hover:-translate-y-0.5 shadow-sm"
            style={{ background: "#0F1D2F" }}
            data-testid="button-empty-new-tour-project"
          >
            <Upload className="w-4 h-4" /> Opret dit første projekt
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {properties.map((p) => (
            <div
              key={p.id}
              onClick={() => { setCurrentId(p.id); setMode("detail"); }}
              className="group rounded-2xl border border-[#E8E4DE] bg-white overflow-hidden flex flex-col cursor-pointer transition-all hover:-translate-y-1 hover:shadow-lg"
              data-testid={`card-tour-project-${p.id}`}
            >
              <div className="aspect-[4/3] bg-[#F8F6F3] overflow-hidden relative p-4">
                <img src={p.floorplanUrl} alt={p.name} className="w-full h-full object-contain mix-blend-multiply group-hover:scale-105 transition-transform duration-500" />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors" />
              </div>
              <div className="p-5 flex-1 flex flex-col gap-3 border-t" style={{ borderColor: "#E8E4DE" }}>
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-sm font-semibold truncate group-hover:text-[#C8956C] transition-colors" style={{ color: "#0F1D2F" }} data-testid={`text-tour-name-${p.id}`}>{p.name}</h3>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}
                    className="w-7 h-7 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-[#FEF2F2] hover:text-[#B91C1C] transition-all flex-shrink-0 -mr-1 -mt-1"
                    data-testid={`button-delete-tour-${p.id}`}
                    aria-label="Slet projekt"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex items-center mt-auto">
                  <span
                    className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md"
                    style={{ background: p.status === "mapping" ? "#F5F3EF" : "rgba(200,149,108,0.08)", color: p.status === "mapping" ? "#6B6B6B" : "#C8956C" }}
                    data-testid={`text-tour-status-${p.id}`}
                  >
                    {p.status === "mapping" && <div className="w-1.5 h-1.5 rounded-full bg-[#9B9690]" />}
                    {p.status !== "mapping" && <div className="w-1.5 h-1.5 rounded-full bg-[#C8956C]" />}
                    {p.status === "mapping" ? "Klar til rum" : p.status}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Detail/mapping view for a single tour project. Lets the user draw rectangles
// on top of the floor plan to mark rooms, name them, and persist the layout.
// Coordinates are stored as percentages (0–100) of the floor plan image so they
// stay correct regardless of how the image is later rendered.
interface DraftRoom {
  id: number;        // negative = new (server will assign id on save), positive = DB id
  name: string;
  posX: number;
  posY: number;
  width: number;
  height: number;
  color: string;
  included: boolean;              // checkbox: include this room in the tour
  roomPhotoUrl?: string | null;   // before-photo for this room (server-side path)
  roomPhotoUrl2?: string | null;  // Strategy B — optional 2nd angle for true 360°
  afterImageUrl?: string | null;  // Collov-generated after-image (CDN URL)
  afterImageUrl2?: string | null; // Strategy B — after-image for the 2nd angle
  panoramaUrl?: string | null;    // stitched equirectangular panorama URL
  generating?: boolean;           // local-only flag while a generate request is in flight
}

// Global styles offered to the user. Keys match Collov / BOLIG_STYLE_LABELS;
// labels are the Danish text shown in the picker.
const TOUR_STYLE_OPTIONS: Array<{ key: string; label: string }> = [
  { key: "scandinavian", label: "Skandinavisk" },
  { key: "modern",       label: "Moderne" },
  { key: "luxury",       label: "Luksus" },
  { key: "industrial",   label: "Industriel" },
  { key: "coastal",      label: "Kyst" },
  { key: "bohemian",     label: "Bohemisk" },
  { key: "japandi",      label: "Japandi" },
  { key: "minimalist",   label: "Minimalistisk" },
  { key: "farmhouse",    label: "Landlig" },
];

function PropertyTourDetail({ propertyId, onBack, onFinish }: { propertyId: number; onBack: () => void; onFinish: () => void }) {
  const queryClient = useQueryClient();
  const overlayRef = useRef<HTMLDivElement>(null);
  const [rooms, setRooms] = useState<DraftRoom[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [drag, setDrag] = useState<{ startX: number; startY: number; curX: number; curY: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const nextLocalIdRef = useRef(-1);
  // After mouseup we stash the just-drawn rectangle here and show the room-
  // type picker. The rectangle is *not* added to `rooms` until the user
  // chooses a name (or cancels, which discards it).
  const [pendingRoom, setPendingRoom] = useState<
    { posX: number; posY: number; width: number; height: number; color: string } | null
  >(null);
  const [pendingCustomName, setPendingCustomName] = useState("");

  const { data: property, isLoading } = useQuery<AiTourProperty & { rooms: AiTourRoom[] }>({
    queryKey: ["/api/ai-boligfremvisning/properties", propertyId],
    queryFn: async () => {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/ai-boligfremvisning/properties/${propertyId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    // Poll while the 3D plan is being generated in the background so the
    // marking surface auto-swaps to the 3D render the moment it's ready —
    // user marks rooms on the prettier 3D image instead of the flat 2D.
    refetchInterval: (q) => (q.state.data?.threedPlanUrl ? false : 4000),
  });

  const [styleKey, setStyleKey] = useState<string | null>(null);
  const [tierKey, setTierKey] = useState<"budget" | "standard" | "premium">("standard");
  const [batchRunning, setBatchRunning] = useState(false);
  // Tracks whether we've already kicked off the auto 3D-plan generation for
  // this property in this session (component mount). Prevents double-firing
  // on React StrictMode remounts and on every refetch.
  const auto3DRef = useRef<Set<number>>(new Set());
  const [regenerating3D, setRegenerating3D] = useState(false);

  const handleRegenerate3D = async () => {
    if (!property || regenerating3D) return;
    setRegenerating3D(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      await fetch(`/api/ai-boligfremvisning/properties/${property.id}/generate-3d-plan`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      queryClient.invalidateQueries({ queryKey: ["/api/ai-boligfremvisning/properties", propertyId] });
    } catch (e) {
      console.error("[ai-tour] regenerate 3D plan failed", e);
    } finally {
      setRegenerating3D(false);
    }
  };

  // Hydrate local draft state from server payload exactly once per load.
  // (Photo / after-image updates after this point are applied in-place from
  // each endpoint response so we don't blow away unsaved layout edits.)
  useEffect(() => {
    if (!property) return;
    setRooms(property.rooms.map((r) => ({
      id: r.id,
      name: r.name,
      posX: Number(r.posX),
      posY: Number(r.posY),
      width: Number(r.width),
      height: Number(r.height),
      color: r.color,
      included: !!r.included,
      roomPhotoUrl: r.roomPhotoUrl ?? null,
      roomPhotoUrl2: (r as any).roomPhotoUrl2 ?? null,
      afterImageUrl: r.afterImageUrl ?? null,
      afterImageUrl2: (r as any).afterImageUrl2 ?? null,
      panoramaUrl: r.panoramaUrl ?? null,
    })));
    setStyleKey(property.style ?? null);
    const t = property.tier === "luxury" ? "premium" : (property.tier as any);
    if (t === "budget" || t === "standard" || t === "premium") setTierKey(t);
  }, [property?.id]);

  // Auto-trigger 3D plantegning generation in the background as soon as the
  // user lands on a project that doesn't yet have one. The user explicitly
  // asked for "så lidt klikkeri som muligt" — they upload the floor plan and
  // by the time they're done marking rooms the 3D render is ready in the
  // final view. Uses the same fal pipeline as the standalone /3d-plantegning
  // feature; nothing else in that flow is touched.
  useEffect(() => {
    if (!property) return;
    if (property.threedPlanUrl) return;
    if (auto3DRef.current.has(property.id)) return;
    auto3DRef.current.add(property.id);
    (async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        await fetch(`/api/ai-boligfremvisning/properties/${property.id}/generate-3d-plan`, {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        queryClient.invalidateQueries({ queryKey: ["/api/ai-boligfremvisning/properties", propertyId] });
      } catch (e) {
        console.error("[ai-tour] auto 3D plan failed", e);
      }
    })();
  }, [property?.id, property?.threedPlanUrl, propertyId, queryClient]);

  // Strategy B — auto-trigger floor-plan analysis (GPT-4o-mini vision) in the
  // background as soon as the user lands. Silent, idempotent, non-blocking.
  // The result is used by /generate-after and /generate-panorama as APPENDED
  // architectural context (windows/doors/exterior walls) — the existing
  // prompts in shared/boligPrompts.ts stay completely untouched.
  const autoAnalyzeRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (!property) return;
    if ((property as any).floorplanAnalysis) return;
    if (autoAnalyzeRef.current.has(property.id)) return;
    autoAnalyzeRef.current.add(property.id);
    (async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        await fetch(`/api/ai-boligfremvisning/properties/${property.id}/analyze-floorplan`, {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        queryClient.invalidateQueries({ queryKey: ["/api/ai-boligfremvisning/properties", propertyId] });
      } catch (e) {
        // Non-fatal — we fall back to coordinate heuristics only.
        console.warn("[ai-tour] auto analyze-floorplan failed", e);
      }
    })();
  }, [property?.id, (property as any)?.floorplanAnalysis, propertyId, queryClient]);

  const authHeader = async (): Promise<Record<string, string>> => {
    const token = await auth.currentUser?.getIdToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const patchProperty = async (body: Record<string, any>) => {
    try {
      const headers = await authHeader();
      await fetch(`/api/ai-boligfremvisning/properties/${propertyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/ai-boligfremvisning/properties", propertyId] });
    } catch (err) {
      console.error(err);
    }
  };

  const handleStyleChange = (key: string) => { setStyleKey(key); patchProperty({ style: key }); };
  const handleTierChange = (key: "budget" | "standard" | "premium") => { setTierKey(key); patchProperty({ tier: key }); };

  // Batch-generate after-images for every included room that has a before-photo
  // and doesn't yet have an after-image. Calls the existing per-room
  // /generate-after endpoint in parallel — each request handles its own
  // Collov polling server-side, so we just await Promise.allSettled here.
  const handleBatchGenerate = async () => {
    if (!styleKey) { alert("Vælg en stil først."); return; }
    const targets = rooms.filter((r) => r.id > 0 && r.included && r.roomPhotoUrl && !r.afterImageUrl);
    if (targets.length === 0) { alert("Ingen rum klar til generering. Vælg rum og upload billeder først."); return; }
    setBatchRunning(true);
    setRooms((rs) => rs.map((r) => (targets.some((t) => t.id === r.id) ? { ...r, generating: true } : r)));
    try {
      const headers = await authHeader();
      await Promise.allSettled(targets.map(async (room) => {
        try {
          const res = await fetch(`/api/ai-boligfremvisning/properties/${propertyId}/rooms/${room.id}/generate-after`, {
            method: "POST",
            headers,
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
          setRooms((rs) => rs.map((r) => (r.id === room.id ? { ...r, afterImageUrl: data.afterImageUrl, generating: false } : r)));
        } catch (e: any) {
          console.error(`[ai-tour] batch generate failed for room ${room.id}`, e);
          setRooms((rs) => rs.map((r) => (r.id === room.id ? { ...r, generating: false } : r)));
        }
      }));
    } finally {
      setBatchRunning(false);
      queryClient.invalidateQueries({ queryKey: ["/api/ai-boligfremvisning/properties", propertyId] });
    }
  };

  const handlePhotoUpload = async (roomId: number, file: File, angle: 1 | 2 = 1) => {
    if (roomId < 0) {
      alert("Gem rummene først, før du uploader billeder.");
      return;
    }
    const fd = new FormData();
    fd.append("photo", file);
    try {
      const headers = await authHeader();
      const res = await fetch(`/api/ai-boligfremvisning/properties/${propertyId}/rooms/${roomId}/photo?angle=${angle}`, {
        method: "POST",
        headers,
        body: fd,
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      setRooms((rs) => rs.map((r) => (r.id === roomId
        ? { ...r, roomPhotoUrl: updated.roomPhotoUrl ?? r.roomPhotoUrl, roomPhotoUrl2: updated.roomPhotoUrl2 ?? r.roomPhotoUrl2 }
        : r)));
    } catch (err) {
      console.error(err);
      alert("Kunne ikke uploade billede");
    }
  };

  const handleGenerate = async (roomId: number) => {
    if (roomId < 0) { alert("Gem rummene først."); return; }
    if (!styleKey) { alert("Vælg en stil først."); return; }
    setRooms((rs) => rs.map((r) => (r.id === roomId ? { ...r, generating: true } : r)));
    try {
      const headers = await authHeader();
      const res = await fetch(`/api/ai-boligfremvisning/properties/${propertyId}/rooms/${roomId}/generate-after`, {
        method: "POST",
        headers,
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.message || `HTTP ${res.status}`);
      }
      const updated = await res.json();
      setRooms((rs) => rs.map((r) => (r.id === roomId ? { ...r, afterImageUrl: updated.afterImageUrl, generating: false } : r)));
    } catch (err: any) {
      console.error(err);
      alert("Generering fejlede: " + (err.message || ""));
      setRooms((rs) => rs.map((r) => (r.id === roomId ? { ...r, generating: false } : r)));
    }
  };

  const getPct = (clientX: number, clientY: number) => {
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100)),
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-room-rect]")) return; // clicking an existing room — don't start drawing
    const { x, y } = getPct(e.clientX, e.clientY);
    setDrag({ startX: x, startY: y, curX: x, curY: y });
    setSelectedId(null);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!drag) return;
    const { x, y } = getPct(e.clientX, e.clientY);
    setDrag({ ...drag, curX: x, curY: y });
  };

  const handleMouseUp = () => {
    if (!drag) return;
    const x = Math.min(drag.startX, drag.curX);
    const y = Math.min(drag.startY, drag.curY);
    const w = Math.abs(drag.curX - drag.startX);
    const h = Math.abs(drag.curY - drag.startY);
    setDrag(null);
    if (w < 2 || h < 2) return; // ignore stray clicks
    // Don't commit a room yet — first show the room-type picker so the user
    // chooses which rum det er (i stedet for at vi auto-vælger "Stue").
    const idx = rooms.length;
    setPendingRoom({
      posX: x,
      posY: y,
      width: w,
      height: h,
      color: ROOM_COLORS[idx % ROOM_COLORS.length],
    });
  };

  // Commit a pending rectangle into the rooms list under the chosen name.
  // Called from the room-type picker popover.
  const commitPendingRoom = (name: string) => {
    if (!pendingRoom) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const localId = nextLocalIdRef.current--;
    const newRoom: DraftRoom = {
      id: localId,
      name: trimmed,
      posX: pendingRoom.posX,
      posY: pendingRoom.posY,
      width: pendingRoom.width,
      height: pendingRoom.height,
      color: pendingRoom.color,
      // New rooms default to included so the user doesn't have to tick a
      // checkbox immediately after drawing each one — explicit opt-out is
      // cheaper than explicit opt-in here.
      included: true,
    };
    // Build the next rooms list explicitly so we can pass it straight to
    // handleSave — relying on setRooms + setTimeout caused a stale-closure
    // bug where the save POSTed the OLD rooms list and the server returned
    // {rooms:[]}, wiping the new room from local state.
    const nextRooms = [...rooms, newRoom];
    setRooms(nextRooms);
    setSelectedId(localId);
    setPendingRoom(null);
    setSaved(false);
    // Auto-persist with the explicit snapshot so the user doesn't have to
    // click "Gem rum" before uploading a photo for the new room.
    void handleSave(nextRooms);
  };

  const updateRoom = (id: number, patch: Partial<DraftRoom>) => {
    setRooms((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setSaved(false);
  };

  const removeRoom = (id: number) => {
    setRooms((rs) => rs.filter((r) => r.id !== id));
    if (selectedId === id) setSelectedId(null);
    setSaved(false);
  };

  const handleSave = async (snapshot?: DraftRoom[]) => {
    setSaving(true);
    try {
      const source = snapshot ?? rooms;
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/ai-boligfremvisning/properties/${propertyId}/rooms`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          rooms: source.map((r) => ({
            // Send positive ids so the server preserves photo/after-image; new
            // rooms (negative local id) are omitted so the server inserts them.
            ...(r.id > 0 ? { id: r.id } : {}),
            name: r.name,
            posX: r.posX,
            posY: r.posY,
            width: r.width,
            height: r.height,
            color: r.color,
            included: r.included,
          })),
        }),
      });
      if (!res.ok) throw new Error("Kunne ikke gemme");
      const body = await res.json();
      // Re-key local state from server response so newly-inserted rooms pick
      // up their real DB ids (needed before they can accept photo uploads).
      if (Array.isArray(body.rooms)) {
        setRooms(body.rooms.map((r: AiTourRoom) => ({
          id: r.id,
          name: r.name,
          posX: Number(r.posX),
          posY: Number(r.posY),
          width: Number(r.width),
          height: Number(r.height),
          color: r.color,
          included: !!r.included,
          roomPhotoUrl: r.roomPhotoUrl ?? null,
          roomPhotoUrl2: (r as any).roomPhotoUrl2 ?? null,
          afterImageUrl: r.afterImageUrl ?? null,
          afterImageUrl2: (r as any).afterImageUrl2 ?? null,
          panoramaUrl: r.panoramaUrl ?? null,
        })));
      }
      queryClient.invalidateQueries({ queryKey: ["/api/ai-boligfremvisning/properties", propertyId] });
      setSaved(true);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const drawPreview = drag
    ? {
        x: Math.min(drag.startX, drag.curX),
        y: Math.min(drag.startY, drag.curY),
        w: Math.abs(drag.curX - drag.startX),
        h: Math.abs(drag.curY - drag.startY),
      }
    : null;

  return (
    <div className="max-w-6xl">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <button
            onClick={onBack}
            className="text-[11px] font-bold tracking-wider uppercase mb-3 inline-flex items-center gap-1.5 hover:text-[#0F1D2F] transition-colors"
            style={{ color: "#9B9690" }}
            data-testid="button-back-to-tour-list-from-detail"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Tilbage til projekter
          </button>
          <h1 className="text-2xl font-bold mb-2" style={{ color: "#0F1D2F", letterSpacing: "-0.02em" }} data-testid="heading-tour-detail">
            {property?.name || "Indlæser..."}
          </h1>
          <p className="text-sm leading-relaxed max-w-2xl" style={{ color: "#6B6B6B" }}>Træk på plantegningen for at markere rum. Klik et rum for at omdøbe det. Når rummene er markeret, kan du uploade billeder og vælge stil.</p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="h-11 px-6 rounded-full font-semibold text-sm inline-flex items-center gap-2 disabled:opacity-50 transition-all hover:bg-[#F8F6F3]"
            style={{ borderColor: "#C8956C", color: "#C8956C", background: "white", borderWidth: "1.5px" }}
            data-testid="button-save-tour-rooms"
          >
            {saving ? (<><RotateCcw className="w-4 h-4 animate-spin" /> Gemmer...</>) : saved ? (<>Gemt</>) : (<>Gem rum ({rooms.length})</>)}
          </button>
          {/* Færdig: only meaningful once every *included* room has an after-
              image, so the rundvisning has something to show in each hotspot. */}
          <button
            onClick={onFinish}
            disabled={(() => {
              const included = rooms.filter((r) => r.included);
              return included.length === 0 || included.some((r) => !r.afterImageUrl);
            })()}
            className="h-11 px-6 rounded-full font-semibold text-sm text-white inline-flex items-center gap-2 disabled:opacity-40 transition-transform hover:-translate-y-0.5 shadow-sm"
            style={{ background: "#0F1D2F" }}
            data-testid="button-tour-finish"
          >
            Færdig — vis 3D rundvisning <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {isLoading || !property ? (
        <div className="text-sm font-medium animate-pulse" style={{ color: "#9B9690" }}>Indlæser plantegning...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 flex flex-col">
            <div className="relative rounded-2xl overflow-hidden border bg-[#F8F6F3] select-none shadow-sm flex-1 min-h-[500px]" style={{ borderColor: "#E8E4DE" }}>
              <img
                src={property.floorplanUrl}
                alt={property.name}
                className="w-full h-full object-contain pointer-events-none"
                draggable={false}
                data-testid="img-tour-floorplan-detail"
              />
              <div
                ref={overlayRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={() => setDrag(null)}
                className="absolute inset-0 cursor-crosshair"
                data-testid="overlay-tour-rooms"
              >
                {rooms.map((r) => {
                  const isSelected = r.id === selectedId;
                  return (
                    <div
                      key={r.id}
                      data-room-rect
                      data-testid={`rect-tour-room-${r.id}`}
                      onMouseDown={(e) => { e.stopPropagation(); setSelectedId(r.id); }}
                      style={{
                        position: "absolute",
                        left: `${r.posX}%`,
                        top: `${r.posY}%`,
                        width: `${r.width}%`,
                        height: `${r.height}%`,
                        background: `${r.color}33`,
                        border: `2px solid ${r.color}`,
                        boxShadow: isSelected ? `0 0 0 2px white, 0 0 0 4px ${r.color}` : undefined,
                        cursor: "pointer",
                      }}
                      className="flex items-center justify-center transition-all hover:bg-opacity-40"
                    >
                      <span
                        className="text-xs font-bold px-2.5 py-1 rounded-md shadow-sm"
                        style={{ background: r.color, color: "white" }}
                      >
                        {r.name}
                      </span>
                    </div>
                  );
                })}
                {drawPreview && drawPreview.w > 0 && drawPreview.h > 0 && (
                  <div
                    style={{
                      position: "absolute",
                      left: `${drawPreview.x}%`,
                      top: `${drawPreview.y}%`,
                      width: `${drawPreview.w}%`,
                      height: `${drawPreview.h}%`,
                      background: "rgba(200,149,108,0.2)",
                      border: "2px dashed #C8956C",
                      pointerEvents: "none",
                    }}
                  />
                )}

                {/* Just-drawn-but-not-yet-named rectangle stays dashed until
                    the user picks a navn. The picker itself is rendered as a
                    centered modal (see below) so it never gets clipped by the
                    floor-plan container's overflow-hidden rounding. */}
                {pendingRoom && (
                  <div
                    style={{
                      position: "absolute",
                      left: `${pendingRoom.posX}%`,
                      top: `${pendingRoom.posY}%`,
                      width: `${pendingRoom.width}%`,
                      height: `${pendingRoom.height}%`,
                      background: `${pendingRoom.color}33`,
                      border: `2px dashed ${pendingRoom.color}`,
                      pointerEvents: "none",
                    }}
                  />
                )}
              </div>
            </div>
            <div className="mt-4 flex items-start gap-3 bg-[#F8F6F3] p-4 rounded-xl border border-[#E8E4DE]">
              <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm flex-shrink-0">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#C8956C" }}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: "#0F1D2F" }}>Tip til markering</p>
                <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "#6B6B6B" }}>
                  Træk for at tegne et rektangel rundt om et rum. Brug rumlisten til højre for at omdøbe eller slette.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <div className="rounded-2xl border border-[#E8E4DE] bg-white p-6 shadow-sm">
              {/* 3D plantegning status pill — auto-generated in the background as
                  soon as the user opens the project. */}
              <div
                className="mb-6 p-4 rounded-xl border flex flex-col gap-3"
                style={{
                  background: property.threedPlanUrl ? "#F0F5EE" : "#FFF7ED",
                  borderColor: property.threedPlanUrl ? "#A8C4A2" : "#FBD38D",
                }}
                data-testid="status-3d-plan"
              >
                <div className="flex items-center gap-2" style={{ color: "#0F1D2F" }}>
                  {property.threedPlanUrl ? (
                    <><div className="w-6 h-6 rounded-full bg-[#A8C4A2]/20 flex items-center justify-center text-[#A8C4A2]"><Check className="w-3.5 h-3.5" /></div> <span className="text-sm font-semibold">3D plantegning klar</span></>
                  ) : (
                    <><div className="w-6 h-6 rounded-full bg-[#FBD38D]/20 flex items-center justify-center text-[#E6A23C]"><RotateCcw className="w-3.5 h-3.5 animate-spin" /></div> <span className="text-sm font-semibold">Genererer 3D plan…</span></>
                  )}
                </div>
                {property.threedPlanUrl && (
                  <button
                    onClick={handleRegenerate3D}
                    disabled={regenerating3D}
                    className="w-full h-9 rounded-lg text-xs font-semibold border transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed hover:bg-white/50"
                    style={{ background: "white", color: "#0F1D2F", borderColor: "#A8C4A2" }}
                    data-testid="button-regenerate-3d-plan"
                  >
                    <RotateCcw className={`w-3.5 h-3.5 ${regenerating3D ? "animate-spin" : ""}`} />
                    {regenerating3D ? "Genererer ny 3D plan…" : "Regenerér 3D plan"}
                  </button>
                )}
              </div>

              {/* Global style picker — applies to every room when generating after-images */}
              <h3 className="text-[11px] font-bold tracking-wider uppercase mb-3" style={{ color: "#9B9690" }}>Stil til hele boligen</h3>
              <div className="grid grid-cols-2 gap-2 mb-6">
                {TOUR_STYLE_OPTIONS.map((opt) => {
                  const active = styleKey === opt.key;
                  return (
                    <button
                      key={opt.key}
                      onClick={() => handleStyleChange(opt.key)}
                      className="h-10 rounded-lg text-xs font-semibold border transition-all"
                      style={{
                        background: active ? "#C8956C" : "white",
                        color: active ? "white" : "#0F1D2F",
                        borderColor: active ? "#C8956C" : "#E8E4DE",
                      }}
                      data-testid={`button-tour-style-${opt.key}`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              {/* Kvalitets-/budget-vælger. Maps internt til Bolig-prompt tier1/2/3. */}
              <h3 className="text-[11px] font-bold tracking-wider uppercase mb-3" style={{ color: "#9B9690" }}>Kvalitet</h3>
              <div className="grid grid-cols-3 gap-2 mb-6">
                {TOUR_TIER_OPTIONS.map((opt) => {
                  const active = tierKey === opt.key;
                  return (
                    <button
                      key={opt.key}
                      onClick={() => handleTierChange(opt.key)}
                      className="h-16 rounded-xl text-xs font-semibold border transition-all flex flex-col items-center justify-center px-1"
                      style={{
                        background: active ? "#0F1D2F" : "white",
                        color: active ? "white" : "#0F1D2F",
                        borderColor: active ? "#0F1D2F" : "#E8E4DE",
                        boxShadow: active ? "0 4px 14px rgba(15,29,47,0.15)" : "none"
                      }}
                      data-testid={`button-tour-tier-${opt.key}`}
                    >
                      <span className="mb-0.5">{opt.label}</span>
                      <span className="text-[9px] font-normal" style={{ color: active ? "rgba(255,255,255,0.7)" : "#9B9690" }}>{opt.sub}</span>
                    </button>
                  );
                })}
              </div>

              {/* Batch generate — primary action so the user doesn't need to
                  click Generér on every single room individually. */}
              {(() => {
                const included = rooms.filter((r) => r.included);
                const ready = included.filter((r) => r.id > 0 && r.roomPhotoUrl && !r.afterImageUrl);
                const totalIncluded = included.length;
                const withAfter = included.filter((r) => r.afterImageUrl).length;
                const allDone = totalIncluded > 0 && withAfter === totalIncluded;
                return (
                  <div>
                    <button
                      onClick={handleBatchGenerate}
                      disabled={batchRunning || !styleKey || ready.length === 0}
                      className="w-full h-12 rounded-full font-semibold text-sm text-white inline-flex items-center justify-center gap-2 disabled:opacity-50 transition-transform hover:-translate-y-0.5 shadow-sm"
                      style={{ background: "#C8956C" }}
                      data-testid="button-tour-batch-generate"
                    >
                      {batchRunning ? (
                        <><RotateCcw className="w-4 h-4 animate-spin" /> Genererer {ready.length} rum…</>
                      ) : allDone ? (
                        <><Check className="w-4 h-4" /> Alle valgte rum klar ({withAfter}/{totalIncluded})</>
                      ) : (
                        <><Sparkles className="w-4 h-4" /> Generér alle valgte rum ({ready.length})</>
                      )}
                    </button>
                    {totalIncluded > 0 && (
                      <p className="text-xs mt-3 text-center" style={{ color: "#6B6B6B" }}>
                        {withAfter} af {totalIncluded} valgte rum har efter-billede
                      </p>
                    )}
                  </div>
                );
              })()}
            </div>

            <div className="rounded-2xl border border-[#E8E4DE] bg-[#F8F6F3] p-6 shadow-inner-sm min-h-[300px]">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[11px] font-bold tracking-wider uppercase" style={{ color: "#0F1D2F" }}>Rum ({rooms.length})</h3>
                {rooms.length > 0 && (
                  <span className="text-xs font-medium" style={{ color: "#6B6B6B" }}>Marker af for at inkludere</span>
                )}
              </div>
              
              {rooms.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#D9D5CF] bg-white p-8 text-center flex flex-col items-center justify-center h-[200px]">
                  <div className="w-12 h-12 rounded-full bg-[#F8F6F3] flex items-center justify-center mb-3">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#C8956C" }}><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><line x1="3" x2="21" y1="9" y2="9"/><line x1="9" x2="9" y1="21" y2="9"/></svg>
                  </div>
                  <p className="text-sm font-semibold mb-1" style={{ color: "#0F1D2F" }}>Ingen rum markeret</p>
                  <p className="text-xs max-w-[200px]" style={{ color: "#6B6B6B" }}>Træk på plantegningen for at markere et rum.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {rooms.map((r) => {
                    const isSelected = r.id === selectedId;
                    const isPersisted = r.id > 0;
                    const canGenerate = isPersisted && !!r.roomPhotoUrl && !!styleKey && !r.generating;
                    return (
                      <div
                        key={r.id}
                        onClick={() => setSelectedId(r.id)}
                        className="rounded-xl border bg-white p-4 cursor-pointer transition-all hover:shadow-sm"
                        style={{ borderColor: isSelected ? r.color : "#E8E4DE", boxShadow: isSelected ? `0 0 0 1px ${r.color}` : "none" }}
                        data-testid={`row-tour-room-${r.id}`}
                      >
                        <div className="flex items-center gap-3 mb-3">
                          {/* Include-in-tour checkbox. Hides upload + generate UI
                              below when unchecked so the user only sees the rum
                              de faktisk vil bruge. */}
                          <div className="relative flex items-center justify-center">
                            <input
                              type="checkbox"
                              checked={r.included}
                              onChange={(e) => { e.stopPropagation(); updateRoom(r.id, { included: e.target.checked }); }}
                              onClick={(e) => e.stopPropagation()}
                              className="w-5 h-5 accent-[#C8956C] cursor-pointer rounded border-[#D9D5CF]"
                              aria-label="Inkludér rum i rundvisning"
                              data-testid={`checkbox-tour-include-${r.id}`}
                            />
                          </div>
                          <span className="w-3.5 h-3.5 rounded-full flex-shrink-0 shadow-sm" style={{ background: r.color }} />
                          <input
                            type="text"
                            value={r.name}
                            onChange={(e) => updateRoom(r.id, { name: e.target.value })}
                            className="flex-1 text-sm font-bold outline-none bg-transparent min-w-0 transition-colors focus:text-[#C8956C]"
                            style={{ color: r.included ? "#0F1D2F" : "#9B9690", textDecoration: r.included ? "none" : "line-through" }}
                            onClick={(e) => e.stopPropagation()}
                            data-testid={`input-tour-room-name-${r.id}`}
                          />
                          <button
                            onClick={(e) => { e.stopPropagation(); removeRoom(r.id); }}
                            className="p-1.5 rounded-md hover:bg-[#FEF2F2] flex-shrink-0 transition-colors group/del"
                            data-testid={`button-delete-tour-room-${r.id}`}
                            aria-label="Slet rum"
                          >
                            <X className="w-3.5 h-3.5 group-hover/del:text-[#B91C1C]" style={{ color: "#9B9690" }} />
                          </button>
                        </div>
                        <div className="flex items-center gap-1.5 mb-4 pl-8">
                          {ROOM_COLORS.map((c) => (
                            <button
                              key={c}
                              onClick={(e) => { e.stopPropagation(); updateRoom(r.id, { color: c }); }}
                              className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110"
                              style={{ background: c, borderColor: r.color === c ? "#0F1D2F" : "transparent" }}
                              aria-label={`Farve ${c}`}
                              data-testid={`button-tour-room-color-${r.id}-${c.slice(1)}`}
                            />
                          ))}
                        </div>

                        {/* Before-photo upload + after-image preview. Only shown
                            for included rooms — others stay collapsed so the
                            sidebar reflects "kun ☑️ rum viser upload-zone". */}
                        {!r.included ? (
                          <div className="pl-8">
                            <p className="text-[11px] bg-[#F8F6F3] p-2 rounded-lg" style={{ color: "#9B9690" }}>Sæt kryds for at inkludere og uploade billede.</p>
                          </div>
                        ) : (
                        <div className="space-y-4 pl-8" onClick={(e) => e.stopPropagation()}>
                          {/* Strategy B — 2 angle slots. Vinkel 1 is required;
                              Vinkel 2 unlocks a real stitched 360° panorama. */}
                          <div className="grid grid-cols-2 gap-3">
                            {[1, 2].map((angle) => {
                              const url = angle === 1 ? r.roomPhotoUrl : r.roomPhotoUrl2;
                              const label = angle === 1 ? "Vinkel 1" : "Vinkel 2 (360°)";
                              return (
                                <div key={angle} className="flex flex-col h-full">
                                  <div className="text-[10px] font-bold tracking-wider uppercase mb-1.5" style={{ color: angle === 2 ? "#C8956C" : "#9B9690" }}>
                                    {label}
                                  </div>
                                  <div className="flex-1 flex flex-col justify-end">
                                    {url ? (
                                      <div className="relative group/img rounded-lg overflow-hidden border shadow-sm h-[90px]" style={{ borderColor: "#E8E4DE" }}>
                                        <img src={url} alt={label} className="w-full h-full object-cover" data-testid={`img-tour-before-${angle}-${r.id}`} />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                                          <label className="text-[10px] font-semibold text-white px-2 py-1 rounded bg-black/60 cursor-pointer hover:bg-black/80">
                                            Skift
                                            <input
                                              type="file"
                                              accept="image/*"
                                              className="hidden"
                                              onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(r.id, f, angle as 1 | 2); }}
                                            />
                                          </label>
                                        </div>
                                      </div>
                                    ) : (
                                      <label
                                        className={`flex flex-col items-center justify-center h-[90px] rounded-lg border-2 border-dashed transition-colors ${isPersisted ? "cursor-pointer hover:bg-[#F8F6F3]" : "opacity-40 cursor-not-allowed"}`}
                                        style={{ borderColor: angle === 2 ? "rgba(200,149,108,0.3)" : "#D9D5CF" }}
                                      >
                                        <Upload className="w-4 h-4 mb-1" style={{ color: angle === 2 ? "#C8956C" : "#9B9690" }} />
                                        <span className="text-[11px] font-medium" style={{ color: angle === 2 ? "#C8956C" : "#6B6B6B" }}>
                                          {angle === 2 ? "Valgfri" : "Upload"}
                                        </span>
                                        <input
                                          type="file"
                                          accept="image/*"
                                          className="hidden"
                                          disabled={!isPersisted}
                                          onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(r.id, f, angle as 1 | 2); }}
                                          data-testid={`input-tour-before-${angle}-${r.id}`}
                                        />
                                      </label>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <p className="text-[11px] leading-relaxed bg-[#F8F6F3] p-2.5 rounded-lg" style={{ color: "#6B6B6B" }}>
                            <span className="font-semibold text-[#0F1D2F]">Tip:</span> Tag vinkel 2 fra den modsatte ende af rummet for et ægte 360° resultat.
                          </p>
                          
                          <div className="pt-2 border-t" style={{ borderColor: "#F0EDE7" }}>
                            <div className="text-[10px] font-bold tracking-wider uppercase mb-2 flex items-center justify-between" style={{ color: "#9B9690" }}>
                              <span>Efter</span>
                              {r.afterImageUrl && <span className="text-[#A8C4A2] flex items-center gap-1"><Check className="w-3 h-3" /> Færdig</span>}
                            </div>
                            {r.afterImageUrl ? (
                              <div className="relative rounded-lg overflow-hidden border shadow-sm h-[120px]" style={{ borderColor: "#E8E4DE" }}>
                                <img src={r.afterImageUrl} alt="Efter" className="w-full h-full object-cover" data-testid={`img-tour-after-${r.id}`} />
                                <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/60 to-transparent">
                                  <button
                                    onClick={() => handleGenerate(r.id)}
                                    disabled={!canGenerate}
                                    className="w-full h-8 rounded-md text-[11px] font-semibold text-white bg-white/20 backdrop-blur-md hover:bg-white/30 transition-colors disabled:opacity-40"
                                    data-testid={`button-tour-generate-${r.id}`}
                                  >
                                    {r.generating ? "Genererer..." : "Generér ny version"}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-col gap-2">
                                <div className="flex items-center justify-center h-[90px] rounded-lg border border-dashed bg-[#F8F6F3]" style={{ borderColor: "#D9D5CF", color: "#9B9690" }}>
                                  {r.generating ? (
                                    <div className="flex flex-col items-center gap-2">
                                      <RotateCcw className="w-5 h-5 animate-spin" style={{ color: "#C8956C" }} />
                                      <span className="text-[11px]">Bygger design...</span>
                                    </div>
                                  ) : (
                                    <div className="text-[11px]">Venter på generering</div>
                                  )}
                                </div>
                                <button
                                  onClick={() => handleGenerate(r.id)}
                                  disabled={!canGenerate}
                                  className="w-full h-10 rounded-lg text-xs font-semibold text-white disabled:opacity-40 transition-colors hover:opacity-90"
                                  style={{ background: "#0F1D2F" }}
                                  data-testid={`button-tour-generate-${r.id}`}
                                >
                                  {r.generating ? "Genererer..." : "Generér dette rum"}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                        )}

                        {r.included && !isPersisted && (
                          <p className="text-[11px] mt-3 bg-[#FFF7ED] p-2 rounded-lg text-[#C8956C] font-medium border border-[#FBD38D]">
                            Gem rummet for at uploade billede.
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <GuidedTourSection
        propertyId={propertyId}
        property={property}
        rooms={property?.rooms ?? []}
        invalidate={() => queryClient.invalidateQueries({ queryKey: ["/api/ai-boligfremvisning/properties", propertyId] })}
      />

      {/* Centered modal picker for the just-drawn rum. Rendered at the root
          of PropertyTourDetail (outside the floor-plan's overflow-hidden box)
          so it can never get clipped, regardless of where on the plan the
          rectangle was drawn — fixed the issue hvor pickeren gik ud over
          rammen. */}
      {pendingRoom && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
          style={{ background: "rgba(15,29,47,0.6)" }}
          onClick={() => { setPendingRoom(null); setPendingCustomName(""); }}
          data-testid="modal-pending-room"
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-white border shadow-2xl p-6 md:p-8"
            style={{ borderColor: "#E8E4DE" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-xl font-bold mb-1" style={{ color: "#0F1D2F", letterSpacing: "-0.01em" }}>Hvilket rum er det?</div>
            <p className="text-sm mb-6" style={{ color: "#6B6B6B" }}>Vælg et forslag eller skriv dit eget navn.</p>
            <div className="grid grid-cols-2 gap-2.5 mb-5">
              {ROOM_NAME_SUGGESTIONS.map((n) => (
                <button
                  key={n}
                  onClick={() => commitPendingRoom(n)}
                  className="h-11 rounded-xl text-sm font-semibold border transition-all hover:-translate-y-0.5"
                  style={{ borderColor: "#E8E4DE", color: "#0F1D2F", background: "white", boxShadow: "0 2px 8px rgba(15,29,47,0.04)" }}
                  data-testid={`button-pick-room-${n.toLowerCase()}`}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="relative mt-2 pt-5 border-t" style={{ borderColor: "#F0EDE7" }}>
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-white px-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: "#9B9690" }}>Eller</div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={pendingCustomName}
                  onChange={(e) => setPendingCustomName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && pendingCustomName.trim()) {
                      commitPendingRoom(pendingCustomName);
                      setPendingCustomName("");
                    }
                  }}
                  autoFocus
                  placeholder="Skriv andet navn…"
                  className="flex-1 h-12 px-4 rounded-xl border bg-[#F8F6F3] text-sm outline-none transition-colors focus:border-[#C8956C] focus:bg-white"
                  style={{ borderColor: "transparent", color: "#0F1D2F" }}
                  data-testid="input-pending-room-custom"
                />
                <button
                  onClick={() => { if (pendingCustomName.trim()) { commitPendingRoom(pendingCustomName); setPendingCustomName(""); } }}
                  disabled={!pendingCustomName.trim()}
                  className="h-12 px-5 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition-transform hover:-translate-y-0.5"
                  style={{ background: "#C8956C" }}
                  data-testid="button-pending-room-add"
                >
                  Tilføj
                </button>
              </div>
            </div>
            <button
              onClick={() => { setPendingRoom(null); setPendingCustomName(""); }}
              className="mt-4 w-full h-10 text-sm font-medium rounded-xl hover:bg-[#F8F6F3] transition-colors"
              style={{ color: "#6B6B6B" }}
              data-testid="button-pending-room-cancel"
            >
              Annuller
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// PropertyTourFinal — "AI boligfremvisning" final view.
//   - Shows the auto-generated 3D dollhouse render of the floor plan with
//     clickable hotspots overlaid using each room's saved bounding rectangle
//     (from the 2D plan — coordinates are stored as % so they line up on the
//     3D image with acceptable accuracy).
//   - Only rooms with `included=true` AND an after-image become hotspots.
//   - Clicking a hotspot opens a fullscreen viewer that zooms into the
//     after-image with a slow Ken Burns animation + mouse-driven parallax —
//     gives a 3D feel without the cost / complexity of a real 360° panorama.
// ============================================================================
function PropertyTourFinal({
  propertyId,
  onBack,
  onClose,
}: {
  propertyId: number;
  onBack: () => void;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [generating3D, setGenerating3D] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewerRoomId, setViewerRoomId] = useState<number | null>(null);

  const { data: property } = useQuery<AiTourProperty & { rooms: AiTourRoom[] }>({
    queryKey: ["/api/ai-boligfremvisning/properties", propertyId],
    queryFn: async () => {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/ai-boligfremvisning/properties/${propertyId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    // Poll while the 3D plan is being generated in the background so the user
    // doesn't have to refresh manually.
    refetchInterval: (q) => (q.state.data?.threedPlanUrl ? false : 5000),
  });

  const rooms: AiTourRoom[] = property?.rooms ?? [];
  const tourRooms = rooms.filter((r) => r.included && r.afterImageUrl);
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["/api/ai-boligfremvisning/properties", propertyId] });

  // Manual re-trigger in case the auto-generation from the detail view failed
  // (e.g. user closed the tab before it finished). Same endpoint either way.
  const generate3D = async () => {
    setGenerating3D(true);
    setError(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/ai-boligfremvisning/properties/${propertyId}/generate-3d-plan`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Kunne ikke generere 3D plan");
      invalidate();
    } catch (e: any) {
      setError(e.message || "Fejl ved 3D generering");
    } finally {
      setGenerating3D(false);
    }
  };

  const viewerRoom = tourRooms.find((r) => r.id === viewerRoomId) || null;

  // Strategy B — auto-generate stitched 360° panoramas for rooms that have
  // both after-images. Runs in the background once per session per room so the
  // panorama is ready by the time the user clicks the hotspot. Single-angle
  // rooms simply fall back to the Ken Burns viewer; no panorama is forced.
  const autoPanoRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    tourRooms.forEach((r) => {
      if (r.panoramaUrl) return;
      // Auto-fire as soon as we have AT LEAST the first after-image. The
      // server-side panorama pipeline now tops up to 4 anchors via synthetic
      // Collov rotations when the user only uploaded 1 vinkel, so we no
      // longer need to wait for vinkel 2 before kicking off generation.
      if (!r.afterImageUrl) return;
      if (autoPanoRef.current.has(r.id)) return;
      autoPanoRef.current.add(r.id);
      (async () => {
        try {
          const token = await auth.currentUser?.getIdToken();
          await fetch(`/api/ai-boligfremvisning/properties/${propertyId}/rooms/${r.id}/generate-panorama`, {
            method: "POST",
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          invalidate();
        } catch (e) {
          console.warn("[ai-tour] auto panorama failed", e);
        }
      })();
    });
  }, [tourRooms.map((r) => `${r.id}:${r.panoramaUrl ? 1 : 0}:${r.afterImageUrl ? 1 : 0}`).join(",")]);

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-medium"
          style={{ color: "#6B6B6B" }}
          data-testid="button-tour-final-back"
        >
          <ArrowLeft className="w-4 h-4" /> Tilbage til rum
        </button>
        <button
          onClick={onClose}
          className="inline-flex items-center gap-2 text-sm font-medium"
          style={{ color: "#6B6B6B" }}
          data-testid="button-tour-final-close"
        >
          Til projektliste
        </button>
      </div>

      <h1 className="text-3xl font-bold mb-2" style={{ color: "#0F1D2F", letterSpacing: "-0.02em" }}>
        {property?.name || "Indlæser..."} — 3D rundvisning
      </h1>
      <p className="text-sm mb-8" style={{ color: "#6B6B6B" }}>
        Klik på et rum i 3D plantegningen for at zoome ind på det færdige design.
      </p>

      {error && (
        <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: "#FEF2F2", color: "#B91C1C" }}>
          {error}
        </div>
      )}

      {/* 3D plantegning med interaktive hotspots */}
      <section className="mb-10">
        <div
          className="relative rounded-2xl overflow-hidden border bg-white"
          style={{ borderColor: "#E5E5E5", aspectRatio: "16/9" }}
        >
          {property?.threedPlanUrl ? (
            <>
              <img
                src={property.threedPlanUrl}
                alt="3D plantegning"
                className="w-full h-full object-contain"
                data-testid="img-tour-3d-plan"
              />
              {/* Hotspots overlaid using the original 2D plan room rectangles.
                  The 3D render preserves the floor plan geometry (nano-banana
                  edit pipeline), so the % coords stay roughly correct. */}
              <div className="absolute inset-0">
                {tourRooms.map((r) => {
                  const cx = Number(r.posX) + Number(r.width) / 2;
                  const cy = Number(r.posY) + Number(r.height) / 2;
                  return (
                    <button
                      key={r.id}
                      onClick={() => setViewerRoomId(r.id)}
                      className="absolute -translate-x-1/2 -translate-y-1/2 group"
                      style={{ left: `${cx}%`, top: `${cy}%` }}
                      data-testid={`hotspot-tour-room-${r.id}`}
                      aria-label={`Vis ${r.name}`}
                    >
                      <span
                        className="relative flex items-center justify-center w-10 h-10 rounded-full shadow-lg ring-2 ring-white transition-transform group-hover:scale-110"
                        style={{ background: r.color }}
                      >
                        <span className="absolute inset-0 rounded-full animate-ping opacity-60" style={{ background: r.color }} />
                        <ChevronRight className="w-4 h-4 text-white relative" />
                      </span>
                      <span
                        className="absolute left-1/2 -translate-x-1/2 mt-2 px-2 py-0.5 rounded text-[11px] font-semibold whitespace-nowrap shadow"
                        style={{ background: "white", color: "#0F1D2F" }}
                      >
                        {r.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-4 p-8 text-center">
              <RotateCcw className="w-6 h-6 animate-spin" style={{ color: "#C8956C" }} />
              <p className="text-sm" style={{ color: "#6B6B6B" }}>
                3D plantegningen genereres… (ca. 30–60 sekunder)
              </p>
              <button
                onClick={generate3D}
                disabled={generating3D}
                className="h-9 px-4 rounded-full font-semibold text-xs inline-flex items-center gap-2 disabled:opacity-50 border"
                style={{ borderColor: "#C8956C", color: "#C8956C", background: "white" }}
                data-testid="button-generate-3d-plan"
              >
                {generating3D ? "Genererer..." : "Prøv igen"}
              </button>
            </div>
          )}
        </div>
        {tourRooms.length === 0 && property?.threedPlanUrl && (
          <p className="mt-3 text-xs text-center" style={{ color: "#9B9690" }}>
            Ingen rum med efter-billede endnu — gå tilbage og generér rummene.
          </p>
        )}
      </section>

      <GuidedTourSection propertyId={propertyId} property={property} rooms={rooms} invalidate={invalidate} />

      <AnimatePresence>
        {viewerRoom && (
          <motion.div
            key={viewerRoom.id}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-0 z-50"
            data-testid="tour-viewer-transition"
          >
            {viewerRoom.panoramaUrl ? (
              <Panorama360Viewer
                panoramaUrl={viewerRoom.panoramaUrl}
                title={viewerRoom.name}
                anchors={(viewerRoom as any).panoramaAnchors as { real?: number; synthetic?: number } | null | undefined}
                onClose={() => setViewerRoomId(null)}
              />
            ) : (
              <ParallaxKenBurnsViewer
                imageUrl={viewerRoom.afterImageUrl!}
                title={viewerRoom.name}
                onClose={() => setViewerRoomId(null)}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Guidet AI-rundvisning ─────────────────────────────────────────────────────
// Interaktiv rundvisning: ét Kling-videoklip pr. rum afspilles i en 16:9 player
// med klikbare rum-piller + auto-fortsæt til næste rum. Den samlede sammen-
// klippede film kan afspilles og downloades når serveren er færdig.
const TOUR_ROOM_PRIO = ["entr", "hall", "gang", "stue", "opholds", "køkken", "alrum", "spise", "kontor", "værelse", "soveværelse", "badeværelse", "bad", "bryggers", "kælder", "terrasse", "have"];

function GuidedTourSection({
  propertyId,
  property,
  rooms,
  invalidate,
}: {
  propertyId: number;
  property: (AiTourProperty & { rooms: AiTourRoom[] }) | undefined;
  rooms: AiTourRoom[];
  invalidate: () => void;
}) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ stage: string; currentClip: number; totalClips: number; message: string } | null>(null);
  const [tourError, setTourError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [activeRoomId, setActiveRoomId] = useState<number | null>(null);
  const [showFullFilm, setShowFullFilm] = useState(false);

  const orderOf = (name: string) => {
    const n = (name || "").toLowerCase();
    const idx = TOUR_ROOM_PRIO.findIndex((p) => n.includes(p));
    return idx >= 0 ? idx : 99;
  };
  const clipRooms = rooms
    .filter((r) => r.included && r.videoUrl)
    .sort((a, b) => orderOf(a.name) - orderOf(b.name));
  const eligibleCount = rooms.filter((r) => r.included && (r.afterImageUrl || r.roomPhotoUrl)).length;

  const tourVideoUrl = (property as any)?.tourVideoUrl as string | null | undefined;
  const generating = !!jobId || (property as any)?.tourStatus === "generating";
  const activeRoom = clipRooms.find((r) => r.id === activeRoomId) || clipRooms[0] || null;

  const startTour = async () => {
    setStarting(true);
    setTourError(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/ai-boligfremvisning/properties/${propertyId}/generate-tour`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Kunne ikke starte rundvisningen");
      setJobId(data.jobId);
      setProgress({ stage: "preparing", currentClip: 0, totalClips: data.totalClips || eligibleCount, message: "Starter op…" });
    } catch (e: any) {
      setTourError(e.message || "Fejl ved start af rundvisning");
    } finally {
      setStarting(false);
    }
  };

  // Poll jobstatus hvert 4. sekund mens der genereres. Vi invaliderer projektet
  // på hvert tick så færdige rum-klip dukker op løbende i viseren. Hvis jobbet
  // forsvinder på serveren (fx genstart/deploy) stopper vi efter 5 fejl i træk
  // i stedet for at polle for evigt.
  useEffect(() => {
    if (!jobId) return;
    let misses = 0;
    const t = setInterval(async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        const res = await fetch(`/api/ai-boligfremvisning/tour-status/${jobId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) {
          misses++;
          if (misses >= 5) {
            setJobId(null);
            setProgress(null);
            setTourError("Forbindelsen til genereringen blev afbrudt (serveren genstartede muligvis). Allerede færdige klip er gemt — prøv igen for resten.");
            invalidate();
          }
          return;
        }
        misses = 0;
        const data = await res.json();
        if (data.progress) setProgress(data.progress);
        invalidate();
        if (data.status === "completed") {
          setJobId(null);
          setProgress(null);
          invalidate();
        } else if (data.status === "failed") {
          setJobId(null);
          setProgress(null);
          setTourError(data.error || data.progress?.message || "Genereringen mislykkedes — din kvota er refunderet");
        }
      } catch { /* netværkshik — prøv igen næste tick */ }
    }, 4000);
    return () => clearInterval(t);
  }, [jobId]);

  const advanceToNext = () => {
    if (showFullFilm || !activeRoom) return;
    const idx = clipRooms.findIndex((r) => r.id === activeRoom.id);
    if (idx >= 0 && idx < clipRooms.length - 1) setActiveRoomId(clipRooms[idx + 1].id);
  };

  const pct = progress && progress.totalClips > 0
    ? Math.round((progress.currentClip / progress.totalClips) * 100)
    : 0;

  return (
    <section className="mb-10">
      <div className="rounded-2xl border bg-white overflow-hidden shadow-sm" style={{ borderColor: "#E8E4DE" }}>
        <div className="p-6 md:p-8 pb-5 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <span className="flex items-center justify-center w-9 h-9 rounded-xl" style={{ background: "rgba(200,149,108,0.12)" }}>
                <Film className="w-4.5 h-4.5" style={{ color: "#C8956C" }} />
              </span>
              <h2 className="text-xl font-bold" style={{ color: "#0F1D2F", letterSpacing: "-0.02em" }}>
                Guidet AI-rundvisning
              </h2>
            </div>
            <p className="text-sm max-w-xl" style={{ color: "#6B6B6B" }}>
              AI'en fører køberen gennem boligen rum for rum med rolige, filmiske kamerabevægelser — som en ejendomsmægler der viser rundt.
            </p>
          </div>
          {clipRooms.length === 0 && !generating && (
            <button
              onClick={startTour}
              disabled={starting || eligibleCount === 0}
              className="h-11 px-6 rounded-full font-semibold text-sm inline-flex items-center gap-2 text-white disabled:opacity-50 shrink-0"
              style={{ background: "#C8956C" }}
              data-testid="button-generate-tour"
            >
              <Sparkles className="w-4 h-4" />
              {starting ? "Starter…" : `Generér rundvisning (${eligibleCount} rum)`}
            </button>
          )}
        </div>

        {tourError && (
          <div className="mx-6 md:mx-8 mb-5 p-3 rounded-lg text-sm" style={{ background: "#FEF2F2", color: "#B91C1C" }} data-testid="text-tour-error">
            {tourError}
          </div>
        )}

        {generating && (
          <div className="mx-6 md:mx-8 mb-6 p-5 rounded-xl" style={{ background: "#F8F6F3" }} data-testid="status-tour-progress">
            <div className="flex items-center gap-3 mb-3">
              <RotateCcw className="w-4 h-4 animate-spin shrink-0" style={{ color: "#C8956C" }} />
              <p className="text-sm font-medium" style={{ color: "#0F1D2F" }}>
                {progress?.message || "Genererer rundvisning…"}
              </p>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: "#E8E4DE" }}>
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ background: "#C8956C", width: `${Math.max(pct, 4)}%` }}
              />
            </div>
            <p className="mt-2 text-xs" style={{ color: "#9B9690" }}>
              Hvert rum tager 1–3 minutter. Du kan lukke siden — genereringen fortsætter på serveren.
            </p>
          </div>
        )}

        {eligibleCount === 0 && clipRooms.length === 0 && !generating && (
          <p className="px-6 md:px-8 pb-6 text-sm" style={{ color: "#9B9690" }}>
            Upload rum-fotos og generér design for mindst ét rum først — derefter kan rundvisningen laves.
          </p>
        )}

        {clipRooms.length > 0 && (
          <div className="px-6 md:px-8 pb-6 md:pb-8">
            <div className="relative rounded-xl overflow-hidden bg-black" style={{ aspectRatio: "16/9" }}>
              {showFullFilm && tourVideoUrl ? (
                <video
                  key="full-film"
                  src={tourVideoUrl}
                  className="w-full h-full object-contain"
                  controls
                  autoPlay
                  playsInline
                  data-testid="video-tour-full"
                />
              ) : activeRoom ? (
                <video
                  key={activeRoom.id}
                  src={activeRoom.videoUrl!}
                  className="w-full h-full object-contain"
                  controls
                  autoPlay
                  muted
                  playsInline
                  onEnded={advanceToNext}
                  data-testid="video-tour-room"
                />
              ) : null}
              <div className="absolute top-3 left-3 px-3 py-1 rounded-full text-xs font-semibold text-white pointer-events-none" style={{ background: "rgba(15,29,47,0.75)" }}>
                {showFullFilm ? "Samlet rundvisning" : activeRoom?.name}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {clipRooms.map((r, i) => {
                const active = !showFullFilm && activeRoom?.id === r.id;
                return (
                  <button
                    key={r.id}
                    onClick={() => { setShowFullFilm(false); setActiveRoomId(r.id); }}
                    className="h-9 px-4 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 transition-all border"
                    style={{
                      background: active ? "#C8956C" : "white",
                      color: active ? "white" : "#0F1D2F",
                      borderColor: active ? "#C8956C" : "#E8E4DE",
                    }}
                    data-testid={`button-tour-room-${r.id}`}
                  >
                    <span className="opacity-60">{i + 1}</span> {r.name}
                  </button>
                );
              })}
              {tourVideoUrl && (
                <button
                  onClick={() => setShowFullFilm(true)}
                  className="h-9 px-4 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 transition-all border"
                  style={{
                    background: showFullFilm ? "#0F1D2F" : "white",
                    color: showFullFilm ? "white" : "#0F1D2F",
                    borderColor: "#0F1D2F",
                  }}
                  data-testid="button-tour-full-film"
                >
                  <Play className="w-3.5 h-3.5" /> Hele filmen
                </button>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              {tourVideoUrl && (
                <a
                  href={tourVideoUrl}
                  download
                  className="h-10 px-5 rounded-full font-semibold text-xs inline-flex items-center gap-2 text-white"
                  style={{ background: "#0F1D2F" }}
                  data-testid="link-download-tour"
                >
                  <Download className="w-3.5 h-3.5" /> Download samlet film
                </a>
              )}
              {!generating && (
                <button
                  onClick={startTour}
                  disabled={starting}
                  className="h-10 px-5 rounded-full font-semibold text-xs inline-flex items-center gap-2 border disabled:opacity-50"
                  style={{ borderColor: "#C8956C", color: "#C8956C", background: "white" }}
                  data-testid="button-regenerate-tour"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  {starting ? "Starter…" : "Generér igen"}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// Pannellum-powered true 360° equirectangular viewer. Loaded lazily from CDN
// the first time a panorama is opened to avoid bundling cost — most sags
// won't have a panorama at all (Strategy B requires 2-angle uploads). Falls
// back to the Ken Burns viewer when Pannellum fails to load.
const PANNELLUM_CSS = "https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.css";
const PANNELLUM_JS = "https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.js";

function loadPannellum(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));
  const w = window as any;
  if (w.pannellum) return Promise.resolve(w.pannellum);
  if (w.__pannellumPromise) return w.__pannellumPromise;
  w.__pannellumPromise = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${PANNELLUM_CSS}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = PANNELLUM_CSS;
      document.head.appendChild(link);
    }
    const script = document.createElement("script");
    script.src = PANNELLUM_JS;
    script.async = true;
    script.onload = () => resolve(w.pannellum);
    script.onerror = () => reject(new Error("Pannellum failed to load"));
    document.head.appendChild(script);
  });
  return w.__pannellumPromise;
}

function Panorama360Viewer({ panoramaUrl, title, anchors, onClose }: { panoramaUrl: string; title: string; anchors?: { real?: number; synthetic?: number } | null; onClose: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadPannellum()
      .then((pannellum) => {
        if (cancelled || !containerRef.current) return;
        viewerRef.current = pannellum.viewer(containerRef.current, {
          type: "equirectangular",
          panorama: panoramaUrl,
          autoLoad: true,
          autoRotate: -2,
          showZoomCtrl: true,
          showFullscreenCtrl: true,
          compass: false,
          hfov: 100,
        });
      })
      .catch((e) => setError(e.message));
    return () => {
      cancelled = true;
      try { viewerRef.current?.destroy?.(); } catch {}
    };
  }, [panoramaUrl]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "#000" }} data-testid="modal-panorama-viewer">
      <div className="flex items-center justify-between px-6 py-4 gap-3" style={{ background: "rgba(0,0,0,0.6)" }}>
        <div className="flex items-center gap-3 min-w-0">
          <h3 className="text-white font-semibold truncate" data-testid="text-panorama-title">{title} — 360°</h3>
          {anchors && typeof anchors.real === "number" && (
            <span
              className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wide"
              style={{ background: "rgba(200, 149, 108, 0.18)", color: "#E8C9A8", border: "1px solid rgba(200, 149, 108, 0.4)" }}
              data-testid="badge-panorama-quality"
              title={`${anchors.real} reel${(anchors.real ?? 0) === 1 ? "" : "le"} vinkel${(anchors.real ?? 0) === 1 ? "" : "er"}${anchors.synthetic ? ` + ${anchors.synthetic} AI-genereret${anchors.synthetic === 1 ? "" : "e"} mellemvinkler` : ""}`}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#C8956C" }} />
              Premium 360°
              <span className="text-white/60 font-normal">
                · {anchors.real} reel{(anchors.real ?? 0) === 1 ? "" : "le"}{anchors.synthetic ? ` + ${anchors.synthetic} AI` : ""}
              </span>
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-white/80 hover:text-white text-sm font-medium px-4 py-1.5 rounded-full border border-white/30 shrink-0"
          data-testid="button-close-panorama"
        >
          Luk
        </button>
      </div>
      <div ref={containerRef} className="flex-1 w-full" />
      {error && (
        <div className="absolute inset-0 flex items-center justify-center text-white p-8 text-center">
          <p>Kunne ikke indlæse 360° visning: {error}</p>
        </div>
      )}
    </div>
  );
}

// Fullscreen "zoom + Ken Burns + mouse parallax" viewer. Replaces the previous
// Pannellum 360° flow per the project spec — the user explicitly didn't want
// a real panorama. The image starts slightly zoomed in and slowly drifts
// (Ken Burns); the mouse position adds a small parallax offset so the still
// image feels three-dimensional.
function ParallaxKenBurnsViewer({
  imageUrl,
  title,
  onClose,
}: {
  imageUrl: string;
  title: string;
  onClose: () => void;
}) {
  const [parallax, setParallax] = useState({ x: 0, y: 0 });
  const surfaceRef = useRef<HTMLDivElement>(null);

  // Close on ESC for kbd users.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = surfaceRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // Normalised -1..1 from centre, then clamped to a gentle ±20px shift.
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    setParallax({ x: -nx * 20, y: -ny * 20 });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.92)" }}
      onClick={onClose}
      data-testid="modal-parallax-viewer"
    >
      <div
        ref={surfaceRef}
        className="relative w-full h-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onMouseMove={handleMove}
        onMouseLeave={() => setParallax({ x: 0, y: 0 })}
      >
        {/* Ken Burns layer — slow drift via CSS keyframes injected once. */}
        <img
          src={imageUrl}
          alt={title}
          className="absolute inset-0 w-full h-full object-cover ken-burns"
          style={{
            transform: `translate(${parallax.x}px, ${parallax.y}px) scale(1.15)`,
            transition: "transform 280ms cubic-bezier(0.22, 1, 0.36, 1)",
            willChange: "transform",
          }}
          data-testid="img-parallax-after"
        />
        {/* Vignette so the floating chrome stays legible. */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%)" }}
        />
        <div className="absolute top-4 left-6 right-6 flex items-center justify-between pointer-events-none">
          <span className="text-white text-lg font-semibold drop-shadow" data-testid="text-parallax-title">{title}</span>
          <button
            onClick={onClose}
            className="pointer-events-auto h-10 w-10 rounded-full bg-white/90 hover:bg-white inline-flex items-center justify-center shadow-lg"
            data-testid="button-close-parallax"
            aria-label="Luk"
          >
            <X className="w-5 h-5" style={{ color: "#0F1D2F" }} />
          </button>
        </div>
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 text-white/70 text-xs pointer-events-none">
          Bevæg musen for at se rummet i 3D
        </div>
      </div>
      {/* Ken Burns keyframes — defined inline so we don't have to touch the
          global stylesheet. Kept short so multiple viewers don't fight. */}
      <style>{`
        @keyframes kenBurns {
          0%   { transform-origin: 50% 50%; }
          50%  { transform-origin: 30% 70%; }
          100% { transform-origin: 70% 30%; }
        }
        .ken-burns { animation: kenBurns 18s ease-in-out infinite alternate; }
      `}</style>
    </div>
  );
}

type AgentPromptItem = { title: string; text: string };
type AgentPromptCategory = { id: string; label: string; blurb: string; items: AgentPromptItem[] };

const AGENT_PROMPT_CATEGORIES: AgentPromptCategory[] = [
  {
    id: "tid",
    label: "Tidspunkt på døgnet",
    blurb: "Skift lyset og stemningen alt efter tid på dagen — kun belysningen ændres.",
    items: [
      { title: "Morgen", text: "Skift tidspunktet til tidlig morgen. Blødt gyldent morgenlys gennem vinduerne. Friskt og lyst. Behold alle møbler og indretning uændret. Bevar den oprindelige kameravinkel, perspektiv og zoom præcist. Skift ikke synsvinkel." },
      { title: "Middag", text: "Skift tidspunktet til lys middag. Stærkt naturligt dagslys fylder rummet. Klar og energisk stemning. Behold alle møbler og indretning uændret. Bevar den oprindelige kameravinkel, perspektiv og zoom præcist. Skift ikke synsvinkel." },
      { title: "Eftermiddag", text: "Skift tidspunktet til varm eftermiddag. Blødt varmt dagslys i en lavere vinkel. Afslappet stemning. Behold alle møbler og indretning uændret. Bevar den oprindelige kameravinkel, perspektiv og zoom præcist. Skift ikke synsvinkel." },
      { title: "Aften", text: "Skift tidspunktet til aften. Varmt, stemningsfuldt lys fra de eksisterende lamper. Blødt skær fra vinduerne der viser tusmørke. Hyggelig stemning. Behold alle møbler og indretning uændret. Bevar den oprindelige kameravinkel, perspektiv og zoom præcist. Skift ikke synsvinkel." },
      { title: "Solnedgang", text: "Skift tidspunktet til gylden time ved solnedgang. Varmt orange og lyserødt lys strømmer gennem vinduerne. Magisk stemning. Behold alle møbler og indretning uændret. Bevar den oprindelige kameravinkel, perspektiv og zoom præcist. Skift ikke synsvinkel." },
      { title: "Nat", text: "Skift tidspunktet til nat. Mørkt udenfor vinduerne med svage bylys eller stjerner. Interiøret varmt oplyst med lamper og stearinlys. Hyggelig natstemning. Behold alle møbler og indretning uændret. Bevar den oprindelige kameravinkel, perspektiv og zoom præcist. Skift ikke synsvinkel." },
      { title: "Skumring", text: "Skift tidspunktet til skumring — den blå time. Dybt blåviolet lys udenfor, varme indendørs lys der gløder. Rolig stemning. Behold alle møbler og indretning uændret. Bevar den oprindelige kameravinkel, perspektiv og zoom præcist. Skift ikke synsvinkel." },
    ],
  },
  {
    id: "aarstid",
    label: "Årstid",
    blurb: "Vis boligen i forskellige årstider — farvetemperatur og lys tilpasses.",
    items: [
      { title: "Forår", text: "Skift årstiden til forår. Friskt, mildt dagslys med et let grønligt skær. Fornyende og lys stemning. Varmere farvetemperatur. Behold alle møbler og indretning uændret. Bevar den oprindelige kameravinkel, perspektiv og zoom præcist. Skift ikke synsvinkel." },
      { title: "Sommer", text: "Skift årstiden til sommer. Lyst, varmt dagslys — stærkere og mere gyldent. Varm og levende stemning. Behold alle møbler og indretning uændret. Bevar den oprindelige kameravinkel, perspektiv og zoom præcist. Skift ikke synsvinkel." },
      { title: "Sensommer", text: "Skift årstiden til sensommer. Varmt gyldent lys med en blødere, falmende kvalitet. Afslappet sensommerfølelse. Behold alle møbler og indretning uændret. Bevar den oprindelige kameravinkel, perspektiv og zoom præcist. Skift ikke synsvinkel." },
      { title: "Efterår", text: "Skift årstiden til efterår. Varmt gyldenorange lys i en lavere vinkel. Rigere, varmere farvetoner. Hyggelig stemning. Behold alle møbler og indretning uændret. Bevar den oprindelige kameravinkel, perspektiv og zoom præcist. Skift ikke synsvinkel." },
      { title: "Vinter", text: "Skift årstiden til vinter. Køligere, blødere dagslys med et let blågråt skær. Sprød og ren stemning. Behold alle møbler og indretning uændret. Bevar den oprindelige kameravinkel, perspektiv og zoom præcist. Skift ikke synsvinkel." },
      { title: "Vinter med sne", text: "Skift årstiden til vinter med sne. Lyst, hvidt, diffust lys der reflekteres ind i rummet. Køligt hvidt dagslys. Sprød vinterstemning. Behold alle møbler og indretning uændret. Bevar den oprindelige kameravinkel, perspektiv og zoom præcist. Skift ikke synsvinkel." },
    ],
  },
  {
    id: "aendringer",
    label: "Stemning & ændringer",
    blurb: "Små styling-greb der løfter rummet — belysning, planter, hygge og farver.",
    items: [
      { title: "Tøm lokalet", text: "Fjern alle fritstående møbler og indretning. Vis det tomme rum med kun de oprindelige gulve, vægge, vinduer og døre. Tilføj ikke noget nyt. Bevar den oprindelige kameravinkel, perspektiv og zoom præcist. Skift ikke synsvinkel." },
      { title: "Tilføj ild i pejs", text: "Hvis der er en pejs i rummet, så tilføj en varm glødende ild i den. Varmt flakkende pejselys der skaber en hyggelig stemning. Behold alle møbler og indretning uændret. Bevar den oprindelige kameravinkel, perspektiv og zoom præcist. Skift ikke synsvinkel." },
      { title: "Opgrader belysning", text: "Tilføj moderne bordlamper og en gulvlampe. Varmt, lagdelt lys. Behold alle møbler på de samme positioner. Skift kun belysningen. Bevar den oprindelige kameravinkel, perspektiv og zoom præcist. Skift ikke synsvinkel." },
      { title: "Tilføj planter", text: "Tilføj 2-3 potteplanter: én gulvplante i et hjørne, én på et bord og én lille hængeplante. Behold alle møbler og indretning uændret. Bevar den oprindelige kameravinkel, perspektiv og zoom præcist. Skift ikke synsvinkel." },
      { title: "Gør hyggelig", text: "Tilføj bløde plaider på sofaen, tændte stearinlys på bordet og varme puder. Hyggelig stemning. Behold alle møbler uændret. Bevar den oprindelige kameravinkel, perspektiv og zoom præcist. Skift ikke synsvinkel." },
      { title: "Lyst og luftigt", text: "Maksimer det naturlige lys, tilføj transparente gardiner, rene overflader og en frisk neutral farvepalet. Behold alle møbler uændret. Bevar den oprindelige kameravinkel, perspektiv og zoom præcist. Skift ikke synsvinkel." },
      { title: "Mørkere væg", text: "Mal én væg i dyb skovgrøn eller koksgrå som accentvæg. Behold alle møbler og indretning uændret. Bevar den oprindelige kameravinkel, perspektiv og zoom præcist. Skift ikke synsvinkel." },
      { title: "Skift vægfarve", text: "Skift vægfarven til en varm råhvid. Behold alle møbler og indretning uændret. Bevar den oprindelige kameravinkel, perspektiv og zoom præcist. Skift ikke synsvinkel." },
      { title: "Nyt gulv", text: "Udskift gulvet med brede planker i lyst egetræ. Behold alle møbler og vægge uændret. Bevar den oprindelige kameravinkel, perspektiv og zoom præcist. Skift ikke synsvinkel." },
      { title: "Ryd op", text: "Gør rent og ryd op: fjern rod, red sengene, ryst puderne og organiser tingene. Behold alle møbler uændret. Bevar den oprindelige kameravinkel, perspektiv og zoom præcist. Skift ikke synsvinkel." },
      { title: "Tilføj dekoration", text: "Tilføj smagfuld dekoration: en plante, bøger, et stearinlys, en plaid og kunst på væggen. Behold alle møbler uændret. Bevar den oprindelige kameravinkel, perspektiv og zoom præcist. Skift ikke synsvinkel." },
      { title: "Fjern møbler", text: "Fjern alle fritstående møbler. Behold dekoration, planter og stylingelementer. Vis det som et bevidst stylet, tomt rum. Behold vægge og gulve uændret. Bevar den oprindelige kameravinkel, perspektiv og zoom præcist. Skift ikke synsvinkel." },
    ],
  },
  {
    id: "udsigter",
    label: "Udsigter",
    blurb: "Vis en attraktiv udsigt uden for vinduet — interiøret forbliver det samme.",
    items: [
      { title: "Sommerhave", text: "Vis en smuk grøn sommerhave udenfor vinduet. Frodige træer, velplejet græsplæne. Behold alle indvendige elementer uændret. Bevar den oprindelige kameravinkel, perspektiv og zoom præcist. Skift ikke synsvinkel." },
      { title: "Byudsigt", text: "Vis en bysilhuet udenfor vinduet. Urbant landskab med arkitektur. Behold alle indvendige elementer uændret. Bevar den oprindelige kameravinkel, perspektiv og zoom præcist. Skift ikke synsvinkel." },
      { title: "Søudsigt", text: "Vis en rolig sø- eller havudsigt udenfor vinduet. Blåt vand, rolig stemning. Behold alle indvendige elementer uændret. Bevar den oprindelige kameravinkel, perspektiv og zoom præcist. Skift ikke synsvinkel." },
      { title: "Skovudsigt", text: "Vis en tæt grøn skov udenfor vinduet. Høje træer, fredfyldt stemning. Behold alle indvendige elementer uændret. Bevar den oprindelige kameravinkel, perspektiv og zoom præcist. Skift ikke synsvinkel." },
      { title: "Gårdhave", text: "Vis en charmerende københavnsk gårdhave udenfor vinduet. Brosten, grønne planter, klassisk dansk arkitektur. Behold alle indvendige elementer uændret. Bevar den oprindelige kameravinkel, perspektiv og zoom præcist. Skift ikke synsvinkel." },
    ],
  },
  {
    id: "kombinationer",
    label: "Stemningsfulde kombinationer",
    blurb: "Færdige kombinationer af tid, årstid og lys til den helt rigtige stemning.",
    items: [
      { title: "Sensommeraften", text: "Sensommeraften omkring kl. 20. Varmt gyldent lys der langsomt falmer. Blødt orange-lyserødt skær gennem vinduerne. Varme indendørs lys er tændt, hyggelig kontrast til det falmende dagslys. Afslappet sensommerstemning. Behold alle møbler uændret. Bevar den oprindelige kameravinkel, perspektiv og zoom præcist. Skift ikke synsvinkel." },
      { title: "Tidlig vinteraften", text: "Tidlig vinteraften omkring kl. 17. Mørkeblå himmel udenfor, de første aftenstjerner synlige. Interiøret varmt oplyst med eksisterende lamper og stearinlys. Nordisk hyggestemning. Behold alle møbler uændret. Bevar den oprindelige kameravinkel, perspektiv og zoom præcist. Skift ikke synsvinkel." },
      { title: "Forårsmorgen", text: "Frisk forårsmorgen omkring kl. 7. Blødt friskt lys med en grøn-gylden kvalitet. Lys og fornyende stemning. Mildt naturligt lys. Behold alle møbler uændret. Bevar den oprindelige kameravinkel, perspektiv og zoom præcist. Skift ikke synsvinkel." },
      { title: "Efterårssolnedgang", text: "Efterårssolnedgang omkring kl. 18. Dybt orange, rødt og gyldent lys strømmer gennem vinduerne. Rige varme farvetoner. Varm og stemningsfuld. Behold alle møbler uændret. Bevar den oprindelige kameravinkel, perspektiv og zoom præcist. Skift ikke synsvinkel." },
      { title: "Vintermorgen med sne", text: "Vintermorgen omkring kl. 9. Lyst hvidt diffust dagslys. Køligt og sprødt. Varm hyggelig indendørs belysning. Behold alle møbler uændret. Bevar den oprindelige kameravinkel, perspektiv og zoom præcist. Skift ikke synsvinkel." },
      { title: "Sommernat", text: "Sommernat omkring kl. 23. Dyb blå tusmørkehimmel der stadig holder på lyset. Lun luftfornemmelse. Interiøret blødt oplyst med varmt stemningslys. Fredfyldt sommernat. Behold alle møbler uændret. Bevar den oprindelige kameravinkel, perspektiv og zoom præcist. Skift ikke synsvinkel." },
      { title: "Regnvejrsdag", text: "Hyggelig regnvejrsdag. Blødt gråt diffust lys. Dæmpet og rolig stemning. Varm indendørs belysning der skaber en lun, beskyttet følelse. Behold alle møbler uændret. Bevar den oprindelige kameravinkel, perspektiv og zoom præcist. Skift ikke synsvinkel." },
      { title: "Diset eftermiddag", text: "Diset eftermiddag. Blødt diffust lys med en grå-blå kvalitet. Dæmpede farver. Drømmende og rolig stemning. Behold alle møbler uændret. Bevar den oprindelige kameravinkel, perspektiv og zoom præcist. Skift ikke synsvinkel." },
    ],
  },
  {
    id: "have",
    label: "Haveforvandling",
    blurb: "Vis hvordan en tom eller vild have kan blive et præsentabelt uderum.",
    items: [
      { title: "Anlagt græsplæne", text: "Forvandl dette udeareal til en velplejet have med en velholdt grøn græsplæne, enkle bedplanter og en ren grus- eller stensti. Pæn og præsentabel familiehave. Skandinavisk enkelhed. Fotorealistisk gengivelse i 4K-kvalitet. Bevar den oprindelige kameravinkel, perspektiv og zoom præcist. Skift ikke synsvinkel." },
      { title: "Terrasse med fliser", text: "Tilføj et enkelt sten- eller træterrasseområde med havemøbler. Ren, moderne terrasse med potteplanter og blød udendørsbelysning. Funktionel og indbydende. Fotorealistisk gengivelse i 4K-kvalitet. Bevar den oprindelige kameravinkel, perspektiv og zoom præcist. Skift ikke synsvinkel." },
      { title: "Nem vedligeholdt have", text: "Forvandl denne have til et udeareal med lav vedligeholdelse med dekorativ grus, tørketålende planter, et trædæk og rene linjer. Moderne og praktisk. Fotorealistisk gengivelse i 4K-kvalitet. Bevar den oprindelige kameravinkel, perspektiv og zoom præcist. Skift ikke synsvinkel." },
      { title: "Børnevenlig have", text: "Forvandl denne have til et familievenligt udeareal med en flad græsplæne, en enkel legezone, højbede og en lille terrasse med havemøbler. Sikker og indbydende. Fotorealistisk gengivelse i 4K-kvalitet. Bevar den oprindelige kameravinkel, perspektiv og zoom præcist. Skift ikke synsvinkel." },
      { title: "Aftenhave med belysning", text: "Forvandl denne have til en aftenstemning. Blød udendørsbelysning langs stierne, varmt lys fra husets vinduer, hyggelig stemning. Velplejet have synlig i det varme skær. Fotorealistisk gengivelse i 4K-kvalitet. Bevar den oprindelige kameravinkel, perspektiv og zoom præcist. Skift ikke synsvinkel." },
    ],
  },
  {
    id: "altan",
    label: "Altan & terrasse",
    blurb: "Forvandl tomme altaner og terrasser til indbydende uderum.",
    items: [
      { title: "Møbleret altan", text: "Forvandl denne tomme altan til et møbleret udeareal. Lille bistrobord med to stole, potteplanter, udendørstæppe og lyskæder. Hyggelig og indbydende byaltan. Fotorealistisk gengivelse i 4K-kvalitet. Bevar den oprindelige kameravinkel, perspektiv og zoom præcist. Skift ikke synsvinkel." },
      { title: "Stor terrasse med lounge", text: "Forvandl denne terrasse til et moderne udendørs loungeområde. Kvalitetsudendørssofa, sofabord, store plantekasser og stemningsbelysning. Komfortabelt og stilfuldt opholdsområde. Fotorealistisk gengivelse i 4K-kvalitet. Bevar den oprindelige kameravinkel, perspektiv og zoom præcist. Skift ikke synsvinkel." },
      { title: "Altan med planter", text: "Forvandl denne altan til en grøn oase. Flere potteplanter i forskellige størrelser, en lille siddeplads med puder, urtekasser på rækværket. Frisk og levende. Fotorealistisk gengivelse i 4K-kvalitet. Bevar den oprindelige kameravinkel, perspektiv og zoom præcist. Skift ikke synsvinkel." },
      { title: "Morgenterrasse", text: "Forvandl denne terrasse til en morgenmadssituation. Bord dækket til morgenmad, morgenlys, potteplanter og komfortable udendørsstole. Frisk og indbydende start på dagen. Fotorealistisk gengivelse i 4K-kvalitet. Bevar den oprindelige kameravinkel, perspektiv og zoom præcist. Skift ikke synsvinkel." },
      { title: "Aftenterrasse", text: "Forvandl denne terrasse til et aftenopholdsområde. Varm stemningsbelysning, stearinlys, komfortable siddepladser og hyggelige tæpper. Stemningsfuld og indbydende. Fotorealistisk gengivelse i 4K-kvalitet. Bevar den oprindelige kameravinkel, perspektiv og zoom præcist. Skift ikke synsvinkel." },
    ],
  },
  {
    id: "facade",
    label: "Facade & indkørsel",
    blurb: "Løft førstehåndsindtrykket — facade, indkørsel og indgangsparti.",
    items: [
      { title: "Velholdt facade", text: "Forvandl denne facade til en velholdt, nymalet facade. Rene linjer, en moderne hoveddør, husnummer, postkasse og en indbydende indgang. Frisk og attraktivt førstehåndsindtryk. Fotorealistisk gengivelse i 4K-kvalitet. Bevar den oprindelige kameravinkel, perspektiv og zoom præcist. Skift ikke synsvinkel." },
      { title: "Indkørsel med parkering", text: "Forvandl denne indkørsel til et rent, organiseret parkeringsområde. Frisk grus eller belægningssten, tydelig parkeringsplads, trimmede kanter. Praktisk og præsentabel. Fotorealistisk gengivelse i 4K-kvalitet. Bevar den oprindelige kameravinkel, perspektiv og zoom præcist. Skift ikke synsvinkel." },
      { title: "Indgangsparti med lys", text: "Forvandl denne indgang til et indbydende indgangsparti. Moderne udendørsbelysning, en ren sti til døren, potteplanter ved indgangen og rent dørbeslag. Varm og indbydende. Fotorealistisk gengivelse i 4K-kvalitet. Bevar den oprindelige kameravinkel, perspektiv og zoom præcist. Skift ikke synsvinkel." },
      { title: "Eftermiddagsfacade", text: "Forvandl denne facadeudsigt til en varm eftermiddagsstemning. Gyldent lys på facaden, velplejet have synlig, indbydende indgang. Attraktiv og hjemlig. Fotorealistisk gengivelse i 4K-kvalitet. Bevar den oprindelige kameravinkel, perspektiv og zoom præcist. Skift ikke synsvinkel." },
      { title: "Aftenfacade med belysning", text: "Forvandl denne facade til en aftenscene. Varm udendørsbelysning der oplyser facaden og indgangen, blødt skær fra vinduerne, indbydende stemning. Tryg og attraktiv. Fotorealistisk gengivelse i 4K-kvalitet. Bevar den oprindelige kameravinkel, perspektiv og zoom præcist. Skift ikke synsvinkel." },
    ],
  },
  {
    id: "udvidelser",
    label: "Udvidelser & tilbygninger",
    blurb: "Vis mulige udvidelser — udestue, carport, overdækning og opbevaring.",
    items: [
      { title: "Udestue / orangeri", text: "Forvandl dette udeareal til at inkludere en udestue eller et orangeri i glas bygget til huset. Lyst rum med planter og siddepladser. Anvendeligt året rundt. Fotorealistisk gengivelse i 4K-kvalitet. Bevar den oprindelige kameravinkel, perspektiv og zoom præcist. Skift ikke synsvinkel." },
      { title: "Overdækket terrasse", text: "Forvandl dette terrasseområde til en overdækket terrasse med en tagkonstruktion. Beskyttet udendørs siddeplads, anvendelig i let regn. Praktisk og komfortabel. Fotorealistisk gengivelse i 4K-kvalitet. Bevar den oprindelige kameravinkel, perspektiv og zoom præcist. Skift ikke synsvinkel." },
      { title: "Carport", text: "Forvandl dette parkeringsområde til en moderne carport med en ren tagkonstruktion. Praktisk ly til bilen der komplementerer husets design. Fotorealistisk gengivelse i 4K-kvalitet. Bevar den oprindelige kameravinkel, perspektiv og zoom præcist. Skift ikke synsvinkel." },
      { title: "Cykelparkering", text: "Forvandl dette udeareal til at inkludere en praktisk cykelparkering. Overdækket cykelopbevaring, rent design, funktionelt. En dansk livsstilsnødvendighed. Fotorealistisk gengivelse i 4K-kvalitet. Bevar den oprindelige kameravinkel, perspektiv og zoom præcist. Skift ikke synsvinkel." },
      { title: "Skur / redskabsrum", text: "Forvandl dette udeareal til at inkludere et lille haveskur eller redskabsrum. Rent moderne design, praktisk opbevaring. Organiseret og ryddelig have. Fotorealistisk gengivelse i 4K-kvalitet. Bevar den oprindelige kameravinkel, perspektiv og zoom præcist. Skift ikke synsvinkel." },
    ],
  },
];

const AGENT_SAVED_KEY = "forma_agent_prompts_v1";
function getAgentSavedPrompts(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(AGENT_SAVED_KEY) || "{}"); } catch { return {}; }
}
function recordAgentPrompt(text: string) {
  const trimmed = text.trim();
  if (trimmed.length < 10) return;
  const saved = getAgentSavedPrompts();
  saved[trimmed] = (saved[trimmed] || 0) + 1;
  localStorage.setItem(AGENT_SAVED_KEY, JSON.stringify(saved));
}

function AIDesignAgentFlow({ onBack, cases }: { onBack: () => void; cases: ApiCase[] }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [promptText, setPromptText] = useState("");
  const [savedPromptSuggestions, setSavedPromptSuggestions] = useState<Array<{ text: string; count: number }>>([]);

  useEffect(() => {
    const saved = getAgentSavedPrompts();
    const list = Object.entries(saved)
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([text, count]) => ({ text, count }));
    setSavedPromptSuggestions(list);
  }, []);
  const quotaData = useQuotaData();
  const [activeCat, setActiveCat] = useState(AGENT_PROMPT_CATEGORIES[0].id);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [stage, setStage] = useState<"idle" | "loading" | "result">("idle");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveCaseId, setSaveCaseId] = useState<number | null>(null);
  const [showCaseDropdown, setShowCaseDropdown] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (resetTimerRef.current) clearTimeout(resetTimerRef.current); }, []);
  const handleFile = (file: File) => {
    if (!file.type.startsWith("image/")) { setError("Kun billedfiler er tilladt (JPG, PNG)."); return; }
    if (resetTimerRef.current) { clearTimeout(resetTimerRef.current); resetTimerRef.current = null; }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setError(null);
    setResultUrl(null);
    setOriginalUrl(null);
    setStage("idle");
  };

  const onDrop = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); };
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) handleFile(f); };

  const handleGenerate = async () => {
    if (!imageFile || !promptText.trim()) return;
    if (resetTimerRef.current) { clearTimeout(resetTimerRef.current); resetTimerRef.current = null; }
    setStage("loading"); setError(null);
    try {
      const token = await user?.getIdToken();
      const fd = new FormData();
      fd.append("image", imageFile);
      fd.append("isDesignAgent", "true");
      fd.append("promptText", promptText.trim());
      const res = await fetch("/api/bolig/generate", {
        method: "POST",
        body: fd,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Generering mislykkedes.");
      setResultUrl(data.image_url);
      setOriginalUrl(data.original_url ?? null);
      setStage("result");
      recordAgentPrompt(promptText);
      setSavedPromptSuggestions((prev) => {
        const saved = getAgentSavedPrompts();
        return Object.entries(saved)
          .filter(([, count]) => count >= 2)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([text, count]) => ({ text, count }));
      });
      queryClient.invalidateQueries({ queryKey: ["/api/bolig/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bolig/activity"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bolig/recent-images"] });
    } catch (err: any) {
      setError(err.message || "Noget gik galt. Prøv igen.");
      setStage("idle");
    }
  };

  const activeCases = cases.filter((c) => c.status !== "sold");
  const hasUnsaved = !!resultUrl && saveCaseId === null;
  useUnsavedExitGuard(hasUnsaved);

  const confirmDiscard = () =>
    !hasUnsaved || window.confirm("Er du sikker på du ikke vil gemme dette design?");

  const handleReset = () => {
    if (!confirmDiscard()) return;
    setStage("idle"); setResultUrl(null); setError(null); setSaveCaseId(null);
  };

  const handleBack = () => { if (confirmDiscard()) onBack(); };

  const activeCategory = AGENT_PROMPT_CATEGORIES.find((c) => c.id === activeCat) ?? AGENT_PROMPT_CATEGORIES[0];
  const handlePickPrompt = (item: AgentPromptItem) => {
    setPromptText((prev) => {
      const next = prev.trim() ? `${prev.trim()}\n\n${item.text}` : item.text;
      return next.slice(0, 6000);
    });
    setJustAdded(item.title);
    window.setTimeout(() => setJustAdded((t) => (t === item.title ? null : t)), 1600);
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-8">
        <button onClick={handleBack} className="flex items-center gap-1.5 text-sm hover:opacity-70 transition-opacity" style={{ color: "#6B6B6B" }} data-testid="bolig-agent-back">
          <ChevronLeft className="w-4 h-4" /> Tilbage til Dashboard
        </button>
      </div>

      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-1" style={{ color: "#0F1D2F", letterSpacing: "-0.02em" }}>AI Design Agent</h1>
        <p className="text-sm" style={{ color: "#6B6B6B" }}>Beskriv præcis hvad du vil ændre — AI'en følger dine instruktioner</p>
      </div>

      {/* Eksempel */}
      <div className="rounded-2xl border border-[#E8E4DE] bg-white p-5 mb-6">
        <p className="text-[11px] font-bold tracking-[0.12em] uppercase mb-3" style={{ color: "#C8956C" }}>Se eksempel</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[11px] font-medium mb-1.5" style={{ color: "#9B9690" }}>Original</p>
            <img src="/bolig-images/ai-agent-before.jpg" alt="Før AI Design Agent" className="w-full h-auto rounded-xl" style={{ aspectRatio: "1264/843" }} />
          </div>
          <div>
            <p className="text-[11px] font-medium mb-1.5" style={{ color: "#9B9690" }}>Efter AI-prompt</p>
            <img src="/bolig-images/ai-agent-after.jpg" alt="Efter AI Design Agent" className="w-full h-auto rounded-xl" style={{ aspectRatio: "1264/843" }} />
          </div>
        </div>
      </div>

      {/* Info card */}
      <div className="rounded-2xl p-5 mb-6 border border-[#E8E4DE]" style={{ background: "#F5F3EF" }}>
        <div className="flex gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "#0F1D2F" }}>
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold mb-1" style={{ color: "#0F1D2F" }}>Lav dine egne ændringer</p>
            <p className="text-sm mb-3" style={{ color: "#6B6B6B" }}>Upload et billede og beskriv præcis hvad du vil ændre — fjern møbler, skift farver, tilføj detaljer, eller giv rummet helt nyt liv.</p>
            <p className="text-xs font-semibold mb-1.5" style={{ color: "#9B9690" }}>Perfekt til:</p>
            <ul className="text-sm space-y-1" style={{ color: "#6B6B6B" }}>
              <li className="flex items-start gap-2"><span style={{ color: "#C8956C", fontWeight: 600 }}>·</span> At fjerne eller tilføje elementer i et allerede genereret billede</li>
              <li className="flex items-start gap-2"><span style={{ color: "#C8956C", fontWeight: 600 }}>·</span> At redesigne dit eget boligfoto efter dine egne instruktioner</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_380px] gap-6 lg:gap-8 items-start max-w-6xl">
        {/* Left column: form + result */}
        <div className="grid gap-6 min-w-0">
        {/* Upload zone */}
        <div>
          <p className="text-xs font-bold tracking-[0.08em] uppercase mb-3" style={{ color: "#9B9690" }}>Upload billede</p>
          {imagePreview ? (
            <div className="relative rounded-2xl overflow-hidden border border-[#D9D5CF]">
              <img src={imagePreview} alt="Preview" className="w-full h-56 object-cover" />
              <button
                onClick={() => { setImageFile(null); setImagePreview(null); setResultUrl(null); setStage("idle"); }}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-black/70 transition-colors"
                data-testid="bolig-agent-remove-img"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div
              className="rounded-2xl border-2 border-dashed transition-all duration-200 flex flex-col items-center justify-center p-12 cursor-pointer"
              style={{ borderColor: isDragging ? "#C8956C" : "#D9D5CF", background: isDragging ? "rgba(200,149,108,0.04)" : "#fff" }}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              data-testid="bolig-agent-upload-zone"
            >
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4" style={{ background: "#F0EDE7" }}>
                <Upload className="w-5 h-5" style={{ color: "#C8956C" }} />
              </div>
              <p className="font-semibold text-sm mb-1" style={{ color: "#0F1D2F" }}>Træk et billede hertil</p>
              <p className="text-xs" style={{ color: "#6B6B6B" }}>eller klik for at vælge · JPG, PNG — Max 10 MB</p>
            </div>
          )}
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </div>

        {/* Instructions */}
        <div>
          <p className="text-xs font-bold tracking-[0.08em] uppercase mb-3" style={{ color: "#9B9690" }}>Dine instruktioner</p>
          <textarea
            value={promptText}
            onChange={(e) => setPromptText(e.target.value.slice(0, 6000))}
            placeholder={"Beskriv præcis hvad du vil ændre...\n\nEksempler:\n\"Fjern den røde sofa og tilføj en grå\"\n\"Skift gulvet til mørkt træ\"\n\"Tilføj en stor plante i hjørnet\"\n\"Lav hele rummet om til japansk stil\""}
            rows={7}
            className="w-full px-4 py-3 rounded-2xl border text-sm resize-none outline-none transition-all"
            style={{ borderColor: "#D9D5CF", background: "#fff", color: "#1A1A1A", lineHeight: 1.6 }}
            onFocus={(e) => (e.target.style.borderColor = "#C8956C")}
            onBlur={(e) => (e.target.style.borderColor = "#D9D5CF")}
            data-testid="bolig-agent-prompt"
          />
          <p className="text-[11px] mt-1.5 text-right" style={{ color: "#9B9690" }}>{promptText.length}/6000 tegn</p>
        </div>

        {/* Saved prompt suggestions — only shown if user has 2+ uses of same prompt */}
        {savedPromptSuggestions.length > 0 && (
          <div>
            <p className="text-[11px] font-bold tracking-[0.08em] uppercase mb-2" style={{ color: "#9B9690" }}>Dine tidligere prompts</p>
            <div className="flex flex-wrap gap-2">
              {savedPromptSuggestions.map(({ text }) => (
                <button
                  key={text}
                  onClick={() => setPromptText(text)}
                  title={text}
                  className="h-8 px-3 rounded-full border text-xs font-medium transition-all hover:opacity-80 truncate max-w-[220px]"
                  style={{ borderColor: "#D9D5CF", background: "#F8F6F3", color: "#0F1D2F" }}
                  data-testid="bolig-agent-saved-prompt"
                >
                  {text.length > 40 ? text.slice(0, 40) + "…" : text}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Generate button */}
        <div>
          <QuotaGate feature="ai">
            <button
              onClick={handleGenerate}
              disabled={!imageFile || !promptText.trim() || stage === "loading"}
              className="h-12 px-8 rounded-full font-semibold text-white text-sm flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "#0F1D2F" }}
              data-testid="bolig-agent-generate"
            >
              {stage === "loading" ? (
                <>
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Genererer billede...
                </>
              ) : (
                <><Sparkles className="w-4 h-4" /> Generer nyt billede</>
              )}
            </button>
          </QuotaGate>
        </div>

        {/* Result */}
        {stage === "result" && resultUrl && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            <p className="text-xs font-bold tracking-[0.08em] uppercase mb-3" style={{ color: "#9B9690" }}>Resultat</p>
            <div className="rounded-2xl overflow-hidden border border-[#E8E4DE]">
              {imagePreview ? (
                <BeforeAfterSlider beforeSrc={imagePreview} afterSrc={resultUrl} />
              ) : (
                <img src={resultUrl} alt="Genereret" className="w-full h-auto" />
              )}
            </div>
            <div className="flex flex-wrap gap-3 mt-4">
              <DownloadMenu
                url={resultUrl}
                beforeUrl={imagePreview}
                style="ai-agent"
                variant="primary"
                testIdPrefix="bolig-agent-download"
              />

              {/* Gem til sag dropdown */}
              {activeCases.length > 0 && (
                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setShowCaseDropdown((v) => !v)}
                    className="h-10 px-5 rounded-full font-semibold text-sm flex items-center gap-2 border transition-all hover:opacity-80"
                    style={{ borderColor: "#D9D5CF", color: "#1A1A1A", background: "#fff" }}
                    data-testid="bolig-agent-save-sag"
                  >
                    <ImageIcon className="w-4 h-4" />
                    {saveCaseId ? `Gemt til sag` : "Gem til sag"}
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                  {showCaseDropdown && (
                    <div className="absolute left-0 top-full mt-1 w-56 rounded-xl shadow-xl border border-[#E8E4DE] bg-white z-20 py-1">
                      {activeCases.map((c) => (
                        <button
                          key={c.id}
                          onClick={async () => {
                            setShowCaseDropdown(false);
                            setSaveCaseId(c.id);
                            try {
                              const token = await user?.getIdToken();
                              const r = await fetch(`/api/bolig/cases/${c.id}/images`, {
                                method: "POST",
                                headers: {
                                  "Content-Type": "application/json",
                                  ...(token ? { Authorization: `Bearer ${token}` } : {}),
                                },
                                body: JSON.stringify({
                                  imageUrl: resultUrl,
                                  originalImageUrl: originalUrl,
                                  roomType: "other",
                                  style: "ai-agent",
                                  budgetTier: "tier2",
                                  promptText,
                                  isDesignAgent: true,
                                }),
                              });
                              if (!r.ok) {
                                setSaveCaseId(null);
                                const msg = await r.text().catch(() => "");
                                alert(`Kunne ikke gemme til sag. ${msg}`);
                                return;
                              }
                              queryClient.invalidateQueries({ queryKey: ["/api/bolig/cases", c.id, "images"] });
                              queryClient.invalidateQueries({ queryKey: ["/api/bolig/cases"] });
                              queryClient.invalidateQueries({ queryKey: ["/api/bolig/recent-images"] });
                              queryClient.invalidateQueries({ queryKey: ["/api/bolig/stats"] });
                              if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
                              resetTimerRef.current = setTimeout(() => {
                                resetTimerRef.current = null;
                                setImageFile(null); setImagePreview(null); setPromptText("");
                                setStage("idle"); setResultUrl(null); setOriginalUrl(null); setError(null); setSaveCaseId(null);
                              }, 1500);
                            } catch {
                              setSaveCaseId(null);
                              alert("Kunne ikke gemme til sag. Prøv igen.");
                            }
                          }}
                          className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-[#F5F3EF] transition-colors text-left"
                          style={{ color: "#1A1A1A" }}
                          data-testid={`bolig-agent-save-case-${c.id}`}
                        >
                          <Home className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#9B9690" }} />
                          <span className="truncate">{c.address}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={handleReset}
                className="h-10 px-5 rounded-full font-semibold text-sm flex items-center gap-2 border transition-all hover:opacity-80"
                style={{ borderColor: "#D9D5CF", color: "#1A1A1A", background: "#fff" }}
                data-testid="bolig-agent-retry"
              >
                <RotateCcw className="w-4 h-4" /> Prøv igen
              </button>
            </div>
          </motion.div>
        )}
        </div>

        {/* Right column: prompt library */}
        <div className="lg:sticky lg:top-6">
          <div className="rounded-2xl border border-[#E8E4DE] overflow-hidden shadow-sm" style={{ background: "#fff" }}>
            <div className="px-5 py-4 border-b border-[#E8E4DE]" style={{ background: "#F5F3EF" }}>
              <div className="flex items-center gap-2.5 mb-1.5">
                <div className="w-6 h-6 rounded-md bg-[#0F1D2F] flex items-center justify-center">
                  <Sparkles className="w-3 h-3 text-white" />
                </div>
                <h3 className="text-sm font-bold tracking-[0.04em] uppercase" style={{ color: "#0F1D2F" }}>Promptbibliotek</h3>
              </div>
              <p className="text-xs" style={{ color: "#6B6B6B" }}>Klik på en prompt for at indsætte den i feltet.</p>
            </div>

            <div className="p-5">
              <div className="flex flex-wrap gap-2 mb-4">
                {AGENT_PROMPT_CATEGORIES.map((cat) => {
                  const active = cat.id === activeCat;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setActiveCat(cat.id)}
                      className="px-3.5 py-1.5 rounded-full text-xs font-medium border transition-all hover:-translate-y-px"
                      style={active
                        ? { background: "#0F1D2F", color: "#fff", borderColor: "#0F1D2F", boxShadow: "0 2px 8px rgba(15,29,47,0.15)" }
                        : { background: "#fff", color: "#6B6B6B", borderColor: "#D9D5CF" }}
                      data-testid={`bolig-agent-cat-${cat.id}`}
                    >
                      {cat.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs italic mb-4" style={{ color: "#9B9690" }}>{activeCategory.blurb}</p>

              <div className="space-y-3 overflow-y-auto pr-2 custom-scrollbar" style={{ maxHeight: "calc(100vh - 340px)" }}>
                {activeCategory.items.map((item) => (
                  <button
                    key={item.title}
                    onClick={() => handlePickPrompt(item)}
                    className="w-full text-left p-4 rounded-xl border transition-all group hover:shadow-md hover:-translate-y-0.5 relative overflow-hidden"
                    style={{ background: "#F8F6F3", borderColor: "#E8E4DE" }}
                    data-testid={`bolig-agent-prompt-${item.title}`}
                  >
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-300" style={{ background: "linear-gradient(120deg, transparent, rgba(200,149,108,0.03), transparent)" }} />
                    <div className="flex items-center justify-between gap-3 mb-2 relative z-10">
                      <span className="text-sm font-semibold" style={{ color: "#0F1D2F" }}>{item.title}</span>
                      {justAdded === item.title ? (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-[#C8956C]/10 flex-shrink-0" style={{ color: "#C8956C" }}>
                          <Check className="w-3 h-3" /> Tilføjet
                        </span>
                      ) : (
                        <div className="w-6 h-6 rounded-full border border-[#D9D5CF] flex items-center justify-center group-hover:border-[#C8956C] group-hover:bg-[#C8956C] transition-colors flex-shrink-0">
                          <Plus className="w-3 h-3 text-[#9B9690] group-hover:text-white transition-colors" />
                        </div>
                      )}
                    </div>
                    <p className="text-xs leading-relaxed line-clamp-3 relative z-10" style={{ color: "#6B6B6B" }}>{item.text}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Ny Sag Modal ──────────────────────────────────────────────────────────────
function NewSagModal({ onClose, onCreated, isPending }: { onClose: () => void; onCreated: (address: string, caseNo: string, notes: string) => void; isPending?: boolean }) {
  const [address, setAddress] = useState("");
  const [caseNo, setCaseNo] = useState("");
  const [notes, setNotes] = useState("");

  const handleCreate = () => {
    if (!address.trim()) return;
    onCreated(address.trim(), caseNo.trim(), notes.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.45)" }} onClick={onClose} data-testid="bolig-new-sag-overlay">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.18 }}
        className="bg-white rounded-2xl w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()} data-testid="bolig-new-sag-modal">
        <div className="flex items-center justify-between p-6 pb-0">
          <h3 className="text-lg font-semibold" style={{ color: "#1A1A1A" }}>Opret ny sag</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#F0EDE7] transition-colors" style={{ color: "#6B6B6B" }} data-testid="bolig-new-sag-close"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "#1A1A1A" }}>Boligadresse *</label>
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="fx Elm Street 42, 4000 Roskilde"
              className="w-full px-4 py-3 rounded-xl border text-sm outline-none transition-colors focus:border-[#C8956C]" style={{ borderColor: "#E8E4DE" }} data-testid="bolig-new-sag-address" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "#1A1A1A" }}>Sagsnummer (valgfrit)</label>
            <input value={caseNo} onChange={(e) => setCaseNo(e.target.value)} placeholder="fx 2024-001"
              className="w-full px-4 py-3 rounded-xl border text-sm outline-none transition-colors focus:border-[#C8956C]" style={{ borderColor: "#E8E4DE" }} data-testid="bolig-new-sag-caseno" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "#1A1A1A" }}>Bemærkninger</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Noter om boligen..." rows={3}
              className="w-full px-4 py-3 rounded-xl border text-sm outline-none resize-none transition-colors focus:border-[#C8956C]" style={{ borderColor: "#E8E4DE", fontFamily: "inherit" }} data-testid="bolig-new-sag-notes" />
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 pb-6">
          <button onClick={onClose} className="h-10 px-5 rounded-full text-sm font-medium border border-[#D9D5CF] hover:bg-[#F0EDE7] transition-colors" style={{ color: "#6B6B6B" }} data-testid="bolig-new-sag-cancel">Annuller</button>
          <button onClick={handleCreate} disabled={!address.trim() || isPending} className="h-10 px-5 rounded-full text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-60" style={{ background: "#C8956C" }} data-testid="bolig-new-sag-submit">
            {isPending ? "Opretter..." : "Opret sag"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  return (
    <motion.div initial={{ x: 100, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 100, opacity: 0 }} transition={{ duration: 0.25 }}
      onAnimationComplete={() => setTimeout(onDone, 2500)}
      className="fixed bottom-8 right-8 z-[200] px-6 py-4 rounded-xl text-sm font-medium shadow-xl"
      style={{ background: "#0F1D2F", color: "#F5F3EF" }} data-testid="bolig-toast">
      <div className="flex items-center gap-2"><Check className="w-4 h-4" style={{ color: "#C8956C" }} />{message}</div>
    </motion.div>
  );
}

// ── Team Case Modal (admin-only) ───────────────────────────────────────────────
function TeamCaseModal({ caseInfo, user, onClose }: {
  caseInfo: { id: number; address: string; ownerName: string; status: string };
  user: import("firebase/auth").User;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(0);

  const { data: imgs = [], isLoading } = useQuery<Array<{
    id: number; src: string; beforeSrc: string | null; room: string; style: string; tier: string; createdAt: string;
  }>>({
    queryKey: ["/api/bolig/team/cases", caseInfo.id, "images"],
    queryFn: async () => {
      const token = await user.getIdToken();
      const r = await fetch(`/api/bolig/team/cases/${caseInfo.id}/images`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error("Kunne ikke hente billeder");
      return r.json();
    },
  });

  useEffect(() => { setIdx(0); }, [caseInfo.id]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setIdx((i) => Math.min(i + 1, imgs.length - 1));
      if (e.key === "ArrowLeft") setIdx((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, imgs.length]);

  const current = imgs[idx] ?? null;
  const isSold = caseInfo.status === "sold";

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-start justify-center p-4 overflow-y-auto"
      style={{ background: "rgba(15,29,47,0.72)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      data-testid="team-case-modal-overlay">

      <motion.div initial={{ scale: 0.96, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0, y: 10 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-4" onClick={(e) => e.stopPropagation()}
        data-testid="team-case-modal">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[#F0EDE7]">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold truncate" style={{ color: "#0F1D2F" }}>{caseInfo.address}</h2>
              {isSold && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: "rgba(45,106,79,0.12)", color: "#2D6A4F" }}>SOLGT</span>}
            </div>
            <p className="text-xs mt-0.5" style={{ color: "#9B9690" }}>{caseInfo.ownerName} · {imgs.length} billede{imgs.length !== 1 ? "r" : ""}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-[#F0EDE7] flex-shrink-0 transition-colors" data-testid="team-case-modal-close">
            <X className="w-4 h-4" style={{ color: "#6B6B6B" }} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <div className="w-6 h-6 rounded-full border-2 border-[#C8956C]/30 border-t-[#C8956C] animate-spin" />
            </div>
          ) : imgs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-2">
              <ImageIcon className="w-8 h-8" style={{ color: "#D9D5CF" }} />
              <p className="text-sm" style={{ color: "#9B9690" }}>Ingen billeder genereret endnu</p>
            </div>
          ) : (
            <>
              {/* Main image / slider */}
              <div className="mb-4">
                {current?.beforeSrc ? (
                  <BeforeAfterSlider beforeSrc={current.beforeSrc} afterSrc={current.src} />
                ) : (
                  <div className="rounded-xl overflow-hidden border border-[#E8E4DE]">
                    <img src={current?.src} alt={caseInfo.address} className="w-full object-contain max-h-[60vh]" style={{ background: "#F5F3EF" }} onError={(e) => { (e.currentTarget as HTMLImageElement).src = DEFAULT_THUMB; }} />
                  </div>
                )}
                <div className="flex items-center justify-between mt-2.5">
                  <p className="text-xs" style={{ color: "#9B9690" }}>
                    {current?.room} · {current?.style}
                    {current?.createdAt ? ` · ${new Date(current.createdAt).toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" })}` : ""}
                  </p>
                  <p className="text-xs font-medium" style={{ color: "#6B6B6B" }}>{idx + 1} / {imgs.length}</p>
                </div>
              </div>

              {/* Prev / Next */}
              {imgs.length > 1 && (
                <div className="flex items-center gap-3 mb-4">
                  <button onClick={() => setIdx((i) => Math.max(i - 1, 0))} disabled={idx === 0}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border text-sm font-medium transition-all hover:bg-[#F5F3EF] disabled:opacity-30"
                    style={{ borderColor: "#D9D5CF", color: "#1A1A1A" }} data-testid="team-case-prev">
                    <ChevronLeft className="w-4 h-4" /> Forrige
                  </button>
                  <button onClick={() => setIdx((i) => Math.min(i + 1, imgs.length - 1))} disabled={idx === imgs.length - 1}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border text-sm font-medium transition-all hover:bg-[#F5F3EF] disabled:opacity-30"
                    style={{ borderColor: "#D9D5CF", color: "#1A1A1A" }} data-testid="team-case-next">
                    Næste <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Thumbnail strip */}
              {imgs.length > 1 && (
                <div className="flex gap-2 flex-wrap">
                  {imgs.map((img, i) => (
                    <button key={img.id} onClick={() => setIdx(i)}
                      className="w-14 h-14 rounded-lg overflow-hidden border-2 transition-all flex-shrink-0"
                      style={{ borderColor: i === idx ? "#C8956C" : "#E8E4DE" }}
                      data-testid={`team-case-thumb-${img.id}`}>
                      <img src={img.src} alt="" className="w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).src = DEFAULT_THUMB; }} />
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Team View ─────────────────────────────────────────────────────────────────
interface TeamApiResponse {
  noTeam?: boolean;
  team?: { id: number; name: string; code: string; ownerUserId: number; creditsRemaining: number; creditsUsedThisMonth: number; createdAt: string };
  ownerIsAdmin?: boolean;
  ownerSubscriptionTier?: string | null;
  isUnlimited?: boolean;
  teamTotalUsed?: number;
  role?: string;
  isAdmin?: boolean;
  ownerEmail?: string;
  ownerDisplayName?: string | null;
  myUserId?: number;
  members?: Array<{ id: number; teamId: number; userId: number; role: string; joinedAt: string; email: string; creditsRemaining: number; displayName?: string | null }>;
  stats?: { memberCount: number; visualsThisMonth: number; activeCases: number };
  performance?: Array<{ userId: number; name: string; email: string; visuals: number; activeCases: number; avgTimeMs: number | null }>;
  activeCases?: Array<{ id: number; address: string; caseNo: string | null; status: string; ownerEmail: string; ownerName: string; latestImageUrl: string | null; imageCount: number }>;
  soldCases?: Array<{ id: number; address: string; caseNo: string | null; soldDateISO: string | null; ownerName: string; latestImageUrl: string | null; imageCount: number }>;
  error?: string;
}

function TeamView({ user }: { user: import("firebase/auth").User }) {
  const qc = useQueryClient();
  const [createName, setCreateName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [allocateModal, setAllocateModal] = useState(false);
  const [allocateUserId, setAllocateUserId] = useState<number | null>(null);
  const [allocateAmount, setAllocateAmount] = useState("10");
  const [localToast, setLocalToast] = useState<string | null>(null);
  const [teamCaseModal, setTeamCaseModal] = useState<{ id: number; address: string; ownerName: string; status: string } | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);

  const showToast = (msg: string) => { setLocalToast(msg); setTimeout(() => setLocalToast(null), 3500); };

  const { data: mineData } = useQuery<{ hasTeam: boolean; teamName: string | null; ownedTeams: { id: number; name: string; code: string }[] }>({
    queryKey: ["/api/teams/mine"],
    queryFn: async () => {
      const token = await user.getIdToken();
      const r = await fetch("/api/teams/mine", { headers: { Authorization: `Bearer ${token}` } });
      return r.json();
    },
    refetchOnWindowFocus: false,
  });

  const ownedTeams = mineData?.ownedTeams ?? [];

  const { data, isLoading } = useQuery<TeamApiResponse>({
    queryKey: ["/api/team", selectedTeamId],
    queryFn: async () => {
      const token = await user.getIdToken();
      const url = selectedTeamId ? `/api/team?teamId=${selectedTeamId}` : "/api/team";
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      return r.json();
    },
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });

  const createTeamMutation = useMutation({
    mutationFn: async (name: string) => {
      const token = await user.getIdToken();
      const r = await fetch("/api/team", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error);
      return json;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/team"] }); showToast("Team oprettet!"); },
    onError: (e: Error) => showToast(e.message),
  });

  const joinByCodeMutation = useMutation({
    mutationFn: async (code: string) => {
      const token = await user.getIdToken();
      const r = await fetch("/api/teams/join", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error);
      return json;
    },
    onSuccess: (d) => { qc.invalidateQueries({ queryKey: ["/api/team"] }); showToast(`Du er nu med i ${d.teamName}!`); },
    onError: (e: Error) => showToast(e.message),
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (memberId: number) => {
      const token = await user.getIdToken();
      const r = await fetch(`/api/team/members/${memberId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error);
      return json;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/team"] }); showToast("Medlem fjernet"); },
    onError: (e: Error) => showToast(e.message),
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ memberId, role }: { memberId: number; role: string }) => {
      const token = await user.getIdToken();
      const r = await fetch(`/api/team/member/${memberId}/role`, { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ role }) });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error);
      return json;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/team"] }); showToast("Rolle opdateret!"); },
    onError: (e: Error) => showToast(e.message),
  });

  const allocateMutation = useMutation({
    mutationFn: async ({ userId, amount }: { userId: number; amount: number }) => {
      const token = await user.getIdToken();
      const r = await fetch("/api/team/credits/allocate", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ userId, amount }) });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error);
      return json;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/team"] }); setAllocateModal(false); showToast("Credits tildelt!"); },
    onError: (e: Error) => showToast(e.message),
  });

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
    showToast("Link kopieret!");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="relative w-10 h-10">
          <div className="absolute inset-0 rounded-full border-4 border-[#F0EDE7]" />
          <div className="absolute inset-0 rounded-full border-4 border-[#C8956C] border-t-transparent animate-spin" />
        </div>
      </div>
    );
  }

  // ── No Team: Create or Join ────────────────────────────────────────────────
  if (data?.noTeam) {
    return (
      <motion.div key="no-team" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
        <div className="max-w-lg mx-auto py-16">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5" style={{ background: "#F0EDE7" }}>
            <Users className="w-7 h-7" style={{ color: "#C8956C" }} />
          </div>
          <h1 className="text-2xl font-bold mb-2 text-center" style={{ color: "#0F1D2F", letterSpacing: "-0.02em" }}>Team</h1>
          <p className="text-sm mb-5 text-center" style={{ color: "#6B6B6B" }}>Opret et nyt team, eller tilslut dig et eksisterende med en invite-kode.</p>

          {/* Subscription info box */}
          <div className="rounded-xl p-4 mb-6 flex gap-3 items-start" style={{ background: "rgba(200,149,108,0.08)", border: "1px solid rgba(200,149,108,0.25)" }}>
            <Lock className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "#C8956C" }} />
            <div>
              <p className="text-sm font-semibold mb-0.5" style={{ color: "#0F1D2F" }}>Team-funktioner kræver abonnement</p>
              <p className="text-xs leading-relaxed" style={{ color: "#6B6B6B" }}>
                Du kan oprette et team nu og invitere kolleger. Team-funktionerne (delte sager, statistik og credits) låses op, når teamets ejer har et aktivt abonnement.
              </p>
            </div>
          </div>

          {/* Create team */}
          <div className="bg-white rounded-2xl border border-[#E8E4DE] p-6 mb-4">
            <div className="flex items-center gap-2 mb-4">
              <Crown className="w-4 h-4" style={{ color: "#C8956C" }} />
              <h2 className="text-sm font-semibold" style={{ color: "#0F1D2F" }}>Opret nyt team</h2>
            </div>
            <input
              type="text"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createName.trim().length >= 2 && createTeamMutation.mutate(createName.trim())}
              placeholder="F.eks. Nybolig Bagsværd"
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#D9D5CF] text-sm focus:outline-none focus:ring-2 focus:ring-[#C8956C]/30 mb-3"
              style={{ color: "#1A1A1A" }}
              data-testid="team-create-name-input"
            />
            <button
              onClick={() => createName.trim().length >= 2 && createTeamMutation.mutate(createName.trim())}
              disabled={createName.trim().length < 2 || createTeamMutation.isPending}
              className="w-full py-2.5 rounded-xl font-semibold text-sm text-white transition-all hover:opacity-90 disabled:opacity-40"
              style={{ background: "#C8956C" }}
              data-testid="team-create-submit">
              {createTeamMutation.isPending ? "Opretter…" : "Opret team"}
            </button>
          </div>

          {/* Join with code */}
          <div className="bg-white rounded-2xl border border-[#E8E4DE] p-6">
            <div className="flex items-center gap-2 mb-4">
              <UserPlus className="w-4 h-4" style={{ color: "#6B6B6B" }} />
              <h2 className="text-sm font-semibold" style={{ color: "#0F1D2F" }}>Tilslut med invite-kode</h2>
            </div>
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && joinCode.length >= 4 && joinByCodeMutation.mutate(joinCode.trim())}
              placeholder="F.eks. NYBBAG26"
              maxLength={8}
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#D9D5CF] text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-[#C8956C]/30 mb-3"
              style={{ color: "#1A1A1A" }}
              data-testid="team-join-code-input"
            />
            <button
              onClick={() => joinCode.trim().length >= 4 && joinByCodeMutation.mutate(joinCode.trim())}
              disabled={joinCode.trim().length < 4 || joinByCodeMutation.isPending}
              className="w-full py-2.5 rounded-xl font-semibold text-sm border transition-all hover:bg-[#F5F3EF] disabled:opacity-40"
              style={{ borderColor: "#D9D5CF", color: "#1A1A1A" }}
              data-testid="team-join-submit">
              {joinByCodeMutation.isPending ? "Tilslutter…" : "Tilslut team"}
            </button>
          </div>
        </div>
        {localToast && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#0F1D2F] text-white text-sm px-4 py-2.5 rounded-xl shadow-lg z-50 font-medium">{localToast}</div>
        )}
      </motion.div>
    );
  }

  if (!data?.team) return null;

  const { team, isAdmin, ownerEmail, ownerDisplayName, ownerIsAdmin = false, ownerSubscriptionTier = null, members = [], stats, performance = [], activeCases = [], soldCases = [], myUserId, isUnlimited = false, teamTotalUsed = 0 } = data;
  const ownerHasSub = ownerIsAdmin || !!ownerSubscriptionTier;
  const inviteLink = `${window.location.origin}/join/${team.code}`;

  // ── Member View ────────────────────────────────────────────────────────────
  if (!isAdmin) {
    const myPerf = performance.find((p) => p.userId === myUserId) ?? { visuals: 0, activeCases: 0, avgTimeMs: null };
    return (
      <motion.div key="member-view" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#0F1D2F", letterSpacing: "-0.02em" }}>Du er med i {team.name}</h1>
          <p className="text-sm mt-1" style={{ color: "#6B6B6B" }}>Ejer: {ownerDisplayName || ownerEmail}</p>
        </div>

        {/* Subscription lock banner for member view */}
        {!ownerHasSub && (
          <div className="rounded-xl p-4 flex gap-3 items-start" style={{ background: "rgba(200,149,108,0.08)", border: "1px solid rgba(200,149,108,0.3)" }}>
            <Lock className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "#C8956C" }} />
            <div>
              <p className="text-sm font-semibold mb-0.5" style={{ color: "#0F1D2F" }}>Team-funktioner er låste</p>
              <p className="text-xs leading-relaxed" style={{ color: "#6B6B6B" }}>
                Teamets ejer <strong>{ownerDisplayName || ownerEmail}</strong> har endnu ikke et aktivt abonnement. Bed ejeren om at opgradere for at låse op for delte sager og statistik.
              </p>
            </div>
          </div>
        )}
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: <ImageIcon className="w-5 h-5" />, value: myPerf.visuals, label: "Visuals md." },
            { icon: <Building2 className="w-5 h-5" />, value: myPerf.activeCases, label: "Aktive sager" },
            { icon: <Clock className="w-5 h-5" />, value: myPerf.avgTimeMs ? `${Math.round(myPerf.avgTimeMs / 1000)}s` : "–", label: "Gns. tid" },
          ].map((s, i) => (
            <div key={i} className="bg-white rounded-2xl border border-[#E8E4DE] p-3 sm:p-5 overflow-hidden">
              <div className="mb-1.5" style={{ color: "#C8956C" }}>{s.icon}</div>
              <div className="text-xl sm:text-2xl font-bold mb-0.5" style={{ color: "#0F1D2F" }}>{s.value}</div>
              <div className="text-xs leading-tight" style={{ color: "#9B9690" }}>{s.label}</div>
            </div>
          ))}
        </div>
        {activeCases.length > 0 && (
          <div className="bg-white rounded-2xl border border-[#E8E4DE] p-5">
            <p className="text-xs font-semibold mb-3" style={{ color: "#6B6B6B" }}>TEAMETS AKTIVE SAGER ({stats?.activeCases ?? 0})</p>
            <div className="space-y-2">
              {activeCases.slice(0, 5).map((c) => (
                <div key={c.id} className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0"><CaseThumb src={c.latestImageUrl} className="w-full h-full object-cover" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: "#1A1A1A" }}>{c.address}</p>
                    <p className="text-xs" style={{ color: "#9B9690" }}>{c.ownerName}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {localToast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#0F1D2F] text-white text-sm px-4 py-2.5 rounded-xl shadow-lg z-50 font-medium">{localToast}</div>}
      </motion.div>
    );
  }

  // ── Admin View ─────────────────────────────────────────────────────────────
  const totalMembers = (members.length + 1); // members + owner
  const atLimit = totalMembers >= 15;

  return (
    <motion.div key="admin-view" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="space-y-5">

      {/* Subscription lock banner — shown when owner has no active plan */}
      {!ownerHasSub && (
        <div className="rounded-xl p-4 flex gap-3 items-start" style={{ background: "rgba(200,149,108,0.08)", border: "1px solid rgba(200,149,108,0.3)" }}>
          <Lock className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "#C8956C" }} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold mb-0.5" style={{ color: "#0F1D2F" }}>Team-funktioner er låste — opgrader for at låse op</p>
            <p className="text-xs leading-relaxed mb-2" style={{ color: "#6B6B6B" }}>
              Du kan invitere kolleger nu via invite-koden herunder. Når du køber et abonnement låses alle team-funktioner op for dig og alle der bruger dit invite-link — delte sager, statistik og credit-styring.
            </p>
            <button
              onClick={() => window.location.href = "/pris"}
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition-all hover:opacity-90"
              style={{ background: "#C8956C" }}
              data-testid="team-upgrade-cta">
              Se abonnementer <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Header + Invite link */}
      <div className="bg-white rounded-2xl border border-[#E8E4DE] p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <Crown className="w-4 h-4 flex-shrink-0" style={{ color: "#C8956C" }} />
              <h1 className="text-xl font-bold truncate" style={{ color: "#0F1D2F", letterSpacing: "-0.02em" }}>{team.name}</h1>
            </div>
            <p className="text-xs" style={{ color: "#9B9690" }}>Ejer: {ownerDisplayName || ownerEmail}</p>
          </div>
          {/* Team switcher — only shown when owner has multiple teams */}
          {ownedTeams.length > 1 && (
            <select
              value={selectedTeamId ?? team.id}
              onChange={(e) => setSelectedTeamId(Number(e.target.value))}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-[#D9D5CF] bg-white focus:outline-none focus:ring-2 focus:ring-[#C8956C]/30 flex-shrink-0"
              style={{ color: "#1A1A1A" }}
              data-testid="team-switcher">
              {ownedTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
        </div>

        {/* Invite code block */}
        <div className="mt-4 rounded-xl p-4" style={{ background: atLimit ? "#FFF7ED" : "#F5F3EF", border: atLimit ? "1px solid #FED7AA" : "none" }}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold" style={{ color: "#6B6B6B" }}>INVITE-KODE — Del med kollega</p>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: atLimit ? "rgba(239,68,68,0.1)" : "rgba(200,149,108,0.15)", color: atLimit ? "#DC2626" : "#C8956C" }} data-testid="team-member-count">
              {totalMembers}/15 medlemmer
            </span>
          </div>
          {atLimit ? (
            <p className="text-xs mb-3 leading-relaxed" style={{ color: "#DC2626" }}>
              Teamet har nået grænsen på 15 medlemmer.<br />
              Kontakt os på <strong>support@formaestates.dk</strong> for at hæve grænsen.
            </p>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl font-bold tracking-[0.15em]" style={{ color: "#0F1D2F", fontFamily: "monospace" }}>{team.code}</span>
              </div>
              <div className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-[#E8E4DE] mb-3">
                <span className="text-xs flex-1 truncate" style={{ color: "#6B6B6B", fontFamily: "monospace" }}>{inviteLink}</span>
              </div>
              <button
                onClick={() => copyToClipboard(inviteLink)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90"
                style={{ background: copied ? "#2D6A4F" : "#C8956C" }}
                data-testid="team-copy-invite-link">
                {copied ? <><CheckCheck className="w-4 h-4" /> Kopieret!</> : <><Copy className="w-4 h-4" /> Kopier invite-link</>}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: <Users className="w-5 h-5" />, value: stats?.memberCount ?? 0, label: "Medlemmer" },
          { icon: <ImageIcon className="w-5 h-5" />, value: stats?.visualsThisMonth ?? 0, label: "Visuals md." },
          { icon: <Building2 className="w-5 h-5" />, value: stats?.activeCases ?? 0, label: "Aktive sager" },
        ].map((s, i) => (
          <div key={i} className="bg-white rounded-2xl border border-[#E8E4DE] p-3 sm:p-5 overflow-hidden">
            <div className="mb-1.5" style={{ color: "#C8956C" }}>{s.icon}</div>
            <div className="text-xl sm:text-2xl font-bold mb-0.5" style={{ color: "#0F1D2F" }}>{s.value}</div>
            <div className="text-xs leading-tight" style={{ color: "#9B9690" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Performance — stacked list, no horizontal scroll */}
      <div className="bg-white rounded-2xl border border-[#E8E4DE] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#F0EDE7] flex items-center gap-2">
          <BarChart3 className="w-4 h-4" style={{ color: "#C8956C" }} />
          <h2 className="text-sm font-semibold" style={{ color: "#0F1D2F" }}>TEAM PERFORMANCE</h2>
        </div>
        {performance.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm" style={{ color: "#9B9690" }}>Ingen data endnu</p>
        ) : (
          <div className="divide-y divide-[#F0EDE7]">
            {performance.map((p) => (
              <div key={p.userId} className="px-5 py-3.5 flex items-center justify-between gap-3 min-w-0" data-testid={`team-perf-row-${p.userId}`}>
                <span className="text-sm font-medium truncate flex-1 min-w-0" style={{ color: "#1A1A1A" }}>{p.name}</span>
                <div className="flex items-center gap-4 flex-shrink-0">
                  <div className="text-center">
                    <div className="text-sm font-semibold" style={{ color: "#0F1D2F" }}>{p.visuals}</div>
                    <div className="text-[10px]" style={{ color: "#9B9690" }}>visualiseringer</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-semibold" style={{ color: "#0F1D2F" }}>{p.activeCases}</div>
                    <div className="text-[10px]" style={{ color: "#9B9690" }}>sager</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-semibold" style={{ color: "#6B6B6B" }}>{p.avgTimeMs ? `${Math.round(p.avgTimeMs / 1000)}s` : "–"}</div>
                    <div className="text-[10px]" style={{ color: "#9B9690" }}>gns. tid</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Active cases */}
      {activeCases.length > 0 && (
        <div className="bg-white rounded-2xl border border-[#E8E4DE] p-5">
          <div className="flex items-center gap-2 mb-4">
            <Building2 className="w-4 h-4" style={{ color: "#C8956C" }} />
            <h2 className="text-sm font-semibold" style={{ color: "#0F1D2F" }}>AKTIVE SAGER — HELE TEAMET</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {activeCases.map((c) => (
              <button key={c.id} onClick={() => setTeamCaseModal({ id: c.id, address: c.address, ownerName: c.ownerName, status: c.status })}
                className="rounded-xl overflow-hidden border border-[#E8E4DE] text-left w-full transition-all hover:shadow-md hover:border-[#C8956C]/40 focus:outline-none focus:ring-2 focus:ring-[#C8956C]/40"
                data-testid={`team-case-card-${c.id}`}>
                <div className="h-24 overflow-hidden"><CaseThumb src={c.latestImageUrl} alt={c.address} className="w-full h-full object-cover" /></div>
                <div className="p-2.5">
                  <p className="text-xs font-semibold truncate mb-0.5" style={{ color: "#1A1A1A" }}>{c.address}</p>
                  <p className="text-[11px]" style={{ color: "#9B9690" }}>{c.ownerName}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Sold cases */}
      {soldCases.length > 0 && (
        <div className="bg-white rounded-2xl border border-[#E8E4DE] p-5">
          <div className="flex items-center gap-2 mb-4">
            <CheckCheck className="w-4 h-4" style={{ color: "#2D6A4F" }} />
            <h2 className="text-sm font-semibold" style={{ color: "#0F1D2F" }}>SOLGTE SAGER — HELE TEAMET</h2>
            <span className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(45,106,79,0.12)", color: "#2D6A4F" }}>{soldCases.length}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {soldCases.map((c) => (
              <button key={c.id} onClick={() => setTeamCaseModal({ id: c.id, address: c.address, ownerName: c.ownerName, status: "sold" })}
                className="rounded-xl overflow-hidden border border-[#E8E4DE] text-left w-full transition-all hover:shadow-md hover:border-[#2D6A4F]/40 focus:outline-none focus:ring-2 focus:ring-[#2D6A4F]/40"
                data-testid={`team-sold-card-${c.id}`}>
                <div className="h-24 overflow-hidden relative">
                  <CaseThumb src={c.latestImageUrl} alt={c.address} className="w-full h-full object-cover" />
                  <span className="absolute top-1.5 left-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(45,106,79,0.9)", color: "#fff" }}>SOLGT</span>
                </div>
                <div className="p-2.5">
                  <p className="text-xs font-semibold truncate mb-0.5" style={{ color: "#1A1A1A" }}>{c.address}</p>
                  <p className="text-[11px]" style={{ color: "#9B9690" }}>{c.ownerName}{c.soldDateISO ? ` · ${new Date(c.soldDateISO).toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" })}` : ""}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Credits */}
      <div className="bg-white rounded-2xl border border-[#E8E4DE] p-5">
        <div className="flex items-center gap-2 mb-3">
          <Coins className="w-4 h-4" style={{ color: "#C8956C" }} />
          <h2 className="text-sm font-semibold" style={{ color: "#0F1D2F" }}>CREDITS & FORBRUG</h2>
        </div>
        <div className="flex flex-wrap gap-6 mb-4">
          <div data-testid="team-credits-remaining">
            {isUnlimited ? (
              <>
                <span className="text-2xl font-bold" style={{ color: "#C8956C" }}>Uendelig</span>
                <span className="text-sm ml-1.5" style={{ color: "#6B6B6B" }}>billeder</span>
              </>
            ) : (
              <>
                <span className="text-2xl font-bold" style={{ color: "#0F1D2F" }}>{team.creditsRemaining}</span>
                <span className="text-sm ml-1.5" style={{ color: "#6B6B6B" }}>tilbage</span>
              </>
            )}
          </div>
          <div data-testid="team-credits-month"><span className="text-2xl font-bold" style={{ color: "#0F1D2F" }}>{stats?.visualsThisMonth ?? 0}</span><span className="text-sm ml-1.5" style={{ color: "#6B6B6B" }}>brugt denne md.</span></div>
          <div data-testid="team-credits-total"><span className="text-2xl font-bold" style={{ color: "#0F1D2F" }}>{teamTotalUsed}</span><span className="text-sm ml-1.5" style={{ color: "#6B6B6B" }}>brugt i alt</span></div>
        </div>
        <div className="flex flex-wrap gap-3">
          <a href="/pris" target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
            style={{ background: "#C8956C" }} data-testid="team-credits-buy">
            <CreditCard className="w-4 h-4" /> Køb credits
          </a>
          <button onClick={() => setAllocateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all hover:bg-[#F5F3EF]"
            style={{ borderColor: "#D9D5CF", color: "#1A1A1A" }} data-testid="team-credits-allocate">
            <ArrowUpRight className="w-4 h-4" /> Tildel til medlem
          </button>
        </div>
      </div>

      {/* Members list */}
      <div className="bg-white rounded-2xl border border-[#E8E4DE] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#F0EDE7] flex items-center gap-2">
          <Users className="w-4 h-4" style={{ color: "#C8956C" }} />
          <h2 className="text-sm font-semibold" style={{ color: "#0F1D2F" }}>TEAM MEDLEMMER</h2>
        </div>
        {/* Owner */}
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-[#F0EDE7]">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ background: "#0F1D2F" }}>{(ownerDisplayName || ownerEmail)?.[0]?.toUpperCase() ?? "A"}</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate" style={{ color: "#1A1A1A" }}>{ownerDisplayName || ownerEmail?.split("@")[0]}</p>
            <p className="text-xs truncate" style={{ color: "#9B9690" }}>{ownerEmail}</p>
          </div>
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: "rgba(200,149,108,0.15)", color: "#C8956C" }}>
            <Crown className="w-3 h-3" /> Ejer
          </span>
        </div>
        {members.map((m) => {
          const perf = performance.find((p) => p.userId === m.userId);
          const isMe = m.userId === myUserId;
          const memberName = m.displayName || m.email?.split("@")[0] || "?";
          const iAmOwner = user.email?.toLowerCase() === data?.ownerEmail?.toLowerCase();
          const iAmAdmin = data?.role === "admin" && !iAmOwner;
          const isAdmin = m.role === "admin";
          return (
            <div key={m.id} className="flex items-center gap-3 px-5 py-3.5 border-b border-[#F0EDE7] last:border-0" data-testid={`team-member-row-${m.id}`}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ background: "#F0EDE7", color: "#C8956C" }}>{memberName[0]?.toUpperCase() ?? "?"}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: "#1A1A1A" }}>
                  {memberName}
                  {isAdmin && <span className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(200,149,108,0.15)", color: "#C8956C" }}>Admin</span>}
                </p>
                <p className="text-xs truncate" style={{ color: "#9B9690" }}>{m.email} · {perf?.visuals ?? 0} visuals</p>
              </div>
              {/* Ejer: ser "Gør/Fjern admin" + "Fjern" for alle andre */}
              {!isMe && iAmOwner && (
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => updateRoleMutation.mutate({ memberId: m.id, role: isAdmin ? "user" : "admin" })}
                    disabled={updateRoleMutation.isPending}
                    className="text-xs px-2.5 py-1 rounded-lg border transition-all hover:bg-[#F5F3EF] disabled:opacity-40"
                    style={{ borderColor: "#D9D5CF", color: "#6B6B6B" }}
                    data-testid={`team-toggle-admin-${m.id}`}>
                    {isAdmin ? "Fjern admin" : "Gør admin"}
                  </button>
                  <button onClick={() => removeMemberMutation.mutate(m.id)} disabled={removeMemberMutation.isPending}
                    className="text-xs px-2.5 py-1 rounded-lg border transition-all hover:bg-red-50 hover:border-red-200 hover:text-red-600 disabled:opacity-40"
                    style={{ borderColor: "#D9D5CF", color: "#9B9690" }} data-testid={`team-remove-member-${m.id}`}>
                    Fjern
                  </button>
                </div>
              )}
              {/* Team-admin: kan kun fjerne normale brugere (ikke andre admins eller ejeren) */}
              {!isMe && iAmAdmin && !isAdmin && (
                <button onClick={() => removeMemberMutation.mutate(m.id)} disabled={removeMemberMutation.isPending}
                  className="text-xs px-2.5 py-1 rounded-lg border transition-all hover:bg-red-50 hover:border-red-200 hover:text-red-600 disabled:opacity-40 flex-shrink-0"
                  style={{ borderColor: "#D9D5CF", color: "#9B9690" }} data-testid={`team-remove-member-${m.id}`}>
                  Fjern
                </button>
              )}
              {/* Normale brugere ser ingenting */}
            </div>
          );
        })}
        {members.length === 0 && (
          <div className="px-5 py-6 text-sm text-center" style={{ color: "#9B9690" }}>Del invite-koden ovenfor for at tilføje kollegaer.</div>
        )}
      </div>

      {/* Allocate Credits Modal */}
      <AnimatePresence>
        {allocateModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(15,29,47,0.5)" }}
            onClick={(e) => { if (e.target === e.currentTarget) setAllocateModal(false); }}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold" style={{ color: "#0F1D2F" }}>Tildel credits til medlem</h3>
                <button onClick={() => setAllocateModal(false)} className="p-1 rounded-lg hover:bg-[#F0EDE7]"><X className="w-4 h-4" style={{ color: "#6B6B6B" }} /></button>
              </div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "#6B6B6B" }}>VÆLG MEDLEM</label>
              <select value={allocateUserId ?? ""} onChange={(e) => setAllocateUserId(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#D9D5CF] text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-[#C8956C]/30" data-testid="team-allocate-member-select">
                <option value="">Vælg et medlem…</option>
                {members.map((m) => <option key={m.id} value={m.userId}>{m.email?.split("@")[0] ?? m.userId}</option>)}
              </select>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "#6B6B6B" }}>ANTAL CREDITS</label>
              <input type="number" min="1" max={team.creditsRemaining} value={allocateAmount} onChange={(e) => setAllocateAmount(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#D9D5CF] text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-[#C8956C]/30" data-testid="team-allocate-amount-input" />
              <button onClick={() => allocateUserId && allocateMutation.mutate({ userId: allocateUserId, amount: parseInt(allocateAmount) })}
                disabled={!allocateUserId || !allocateAmount || allocateMutation.isPending}
                className="w-full py-2.5 rounded-xl font-semibold text-sm text-white transition-all hover:opacity-90 disabled:opacity-40" style={{ background: "#C8956C" }} data-testid="team-allocate-submit">
                {allocateMutation.isPending ? "Tildeler…" : "Tildel credits"}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Team Case Modal */}
      <AnimatePresence>
        {teamCaseModal && (
          <TeamCaseModal caseInfo={teamCaseModal} user={user} onClose={() => setTeamCaseModal(null)} />
        )}
      </AnimatePresence>

      {localToast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#0F1D2F] text-white text-sm px-4 py-2.5 rounded-xl shadow-lg z-50 font-medium">{localToast}</div>}
    </motion.div>
  );
}

// ── Settings View ─────────────────────────────────────────────────────────────
type TeamActivityItem = {
  type: "generation" | "case";
  userName: string;
  userEmail: string;
  roomType?: string;
  style?: string;
  tier?: string;
  address?: string;
  caseId?: number | null;
  imageUrl?: string;
  createdAt: string;
};

const SETTINGS_TABS = [
  { id: "profil",          label: "Profil",          icon: UserIcon },
  { id: "udseende",        label: "Udseende",        icon: Palette },
  { id: "standardvalg",    label: "Standardvalg",    icon: SlidersHorizontal },
  { id: "notifikationer",  label: "Notifikationer",  icon: Bell },
  { id: "konto",           label: "Konto",           icon: KeyRound },
] as const;
type SettingsTab = typeof SETTINGS_TABS[number]["id"];

const TIER_LABELS: Record<string, string> = { tier1: "Budget", tier2: "Standard", tier3: "Luksus" };

const ACCENT_COLORS: Record<string, string> = {
  bronze: "#C8956C",
  blue:   "#3B82F6",
  green:  "#2D6A4F",
  orange: "#F97316",
  purple: "#8B5CF6",
  navy:   "#0F1D2F",
};

function loadJSON<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) as T : fallback; } catch { return fallback; }
}
function saveJSON(key: string, value: unknown) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }

// Live brand-color override: replaces inline #0F1D2F backgrounds with the
// user's chosen accent color, and adjusts contrast text color.
function applyBoligBrand() {
  if (typeof document === "undefined") return;
  const accent = loadJSON<string>("bolig-accent", "navy");
  const textMode = loadJSON<"light" | "dark">("bolig-text-mode", "light");
  const accentColor = ACCENT_COLORS[accent] ?? "#0F1D2F";
  const bg = textMode === "light" ? accentColor : `${accentColor}26`;
  const fg = textMode === "light" ? "#FFFFFF" : accentColor;
  const selectors = [
    '[style*="background: #0F1D2F"]',
    '[style*="background:#0F1D2F"]',
    '[style*="background-color: #0F1D2F"]',
    '[style*="background-color:#0F1D2F"]',
    '[style*="background: rgb(15, 29, 47)"]',
    '[style*="background-color: rgb(15, 29, 47)"]',
  ].join(",");
  const selectorsChildren = selectors.split(",").map((s) => `${s} *`).join(",");
  const css = `
    ${selectors} { background-color: ${bg} !important; color: ${fg} !important; }
    ${selectorsChildren} { color: ${fg} !important; }
  `;
  let el = document.getElementById("bolig-brand-style") as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = "bolig-brand-style";
    document.head.appendChild(el);
  }
  el.textContent = css;
}

function SettingsView({ user, displayName, isAdmin, showToast }: {
  user: import("firebase/auth").User;
  displayName: string;
  isAdmin: boolean;
  showToast: (msg: string) => void;
}) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<SettingsTab>("profil");

  // ── Profil ──
  const [nameInput, setNameInput] = useState(displayName);
  const [savingName, setSavingName] = useState(false);
  const handleSaveName = async () => {
    if (!nameInput.trim() || nameInput.trim() === displayName) return;
    setSavingName(true);
    try {
      await updateProfile(user, { displayName: nameInput.trim() });
      const token = await user.getIdToken(true);
      await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } });
      showToast("Navn opdateret");
    } catch (err: any) {
      showToast(`Fejl: ${err.message ?? "Kunne ikke gemme"}`);
    } finally {
      setSavingName(false);
    }
  };

  // ── Udseende ──
  const [theme, setTheme] = useState<string>(() => loadJSON("bolig-theme", "lys"));
  const [accent, setAccent] = useState<string>(() => loadJSON("bolig-accent", "navy"));
  const [textMode, setTextMode] = useState<"light" | "dark">(() => loadJSON("bolig-text-mode", "light"));
  const handleAccent = (v: string) => { setAccent(v); saveJSON("bolig-accent", v); applyBoligBrand(); };
  const handleTextMode = (v: "light" | "dark") => { setTextMode(v); saveJSON("bolig-text-mode", v); applyBoligBrand(); };

  // ── Standardvalg ──
  const [defaults, setDefaults] = useState(() =>
    loadJSON("bolig-defaults", { room: "living room", style: "scandinavian", format: "4:3", remember: true, lastUpload: true })
  );

  // ── Notifikationer ──
  const [notif, setNotif] = useState(() =>
    loadJSON("bolig-notif", { generation: true, invite: true, weekly: false })
  );

  // ── Konto ──
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const handlePasswordReset = async () => {
    if (!user.email) return;
    try {
      await sendPasswordResetEmail(auth, user.email);
      showToast("Vi har sendt et link til at skifte password");
    } catch (err: any) {
      showToast(`Fejl: ${err.message ?? "Kunne ikke sende email"}`);
    }
  };
  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== "SLET") return;
    setDeletingAccount(true);
    try {
      const token = await user.getIdToken();
      const r = await fetch("/api/user/account", { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error((await r.json()).message ?? "Fejl");
      if (auth.currentUser) await deleteUser(auth.currentUser);
      queryClient.clear();
      await signOut(auth);
    } catch (err: any) {
      setDeletingAccount(false);
      showToast(`Fejl: ${err.message ?? "Kunne ikke slette konto"}`);
    }
  };

  // ── Live team activity ──
  const { data: teamActivity = [] } = useQuery<TeamActivityItem[]>({
    queryKey: ["/api/bolig/team-activity"],
    queryFn: async () => {
      const token = await user.getIdToken();
      const r = await fetch("/api/bolig/team-activity", { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) return [];
      return r.json();
    },
    refetchInterval: 5000,
  });

  const sectionBox = "rounded-2xl border p-6 bg-white";
  const sectionStyle = { borderColor: "#E8E4DE" } as const;
  const labelClass = "block text-sm font-medium mb-1.5";
  const inputClass = "w-full px-3.5 py-2.5 rounded-lg text-sm outline-none transition-colors";
  const inputStyle = { background: "#F5F3EF", border: "1px solid #D9D5CF", color: "#1A1A1A" } as const;
  const primaryBtn = "inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-50";

  return (
    <motion.div key="indstillinger-view" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
      className="max-w-5xl mx-auto pb-8" data-testid="bolig-settings-view">

      <div className="flex items-center gap-3 mb-6">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: "#F0EDE7" }}>
          <Settings className="w-5 h-5" style={{ color: "#C8956C" }} />
        </div>
        <div>
          <h2 className="text-2xl font-bold" style={{ color: "#0F1D2F" }}>Indstillinger</h2>
          <p className="text-sm" style={{ color: "#6B6B6B" }}>Tilpas din konto og se live team-aktivitet.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 mb-6 p-1 rounded-xl border" style={{ background: "#F5F3EF", borderColor: "#E8E4DE" }}>
        {SETTINGS_TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all flex-1 min-w-[120px] justify-center"
              style={{ background: active ? "#fff" : "transparent", color: active ? "#0F1D2F" : "#6B6B6B", boxShadow: active ? "0 1px 2px rgba(15,29,47,0.06)" : "none" }}
              data-testid={`bolig-settings-tab-${t.id}`}
            >
              <Icon className="w-4 h-4" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className={sectionBox} style={sectionStyle}>
        {tab === "profil" && (
          <div className="space-y-5 max-w-md" data-testid="bolig-settings-profil">
            <div>
              <label className={labelClass} style={{ color: "#0F1D2F" }}>Navn</label>
              <input value={nameInput} onChange={(e) => setNameInput(e.target.value)} className={inputClass} style={inputStyle} data-testid="bolig-settings-name-input" />
            </div>
            <div>
              <label className={labelClass} style={{ color: "#0F1D2F" }}>Email</label>
              <input value={user.email ?? ""} readOnly className={inputClass} style={{ ...inputStyle, color: "#6B6B6B", cursor: "not-allowed" }} data-testid="bolig-settings-email-input" />
              <p className="text-xs mt-1.5" style={{ color: "#6B6B6B" }}>Email ændres via support.</p>
            </div>
            <div>
              <label className={labelClass} style={{ color: "#0F1D2F" }}>Profilbillede</label>
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-full flex items-center justify-center text-base font-semibold text-white" style={{ background: "#C8956C" }}>
                  {(displayName || user.email || "?").substring(0, 2).toUpperCase()}
                </div>
                <button type="button" className="px-3.5 py-2 rounded-lg text-sm font-medium border transition-colors hover:bg-[#F5F3EF]" style={{ borderColor: "#D9D5CF", color: "#6B6B6B", cursor: "not-allowed" }} title="Snart tilgængelig">Skift billede</button>
              </div>
            </div>
            <button onClick={handleSaveName} disabled={savingName || !nameInput.trim() || nameInput.trim() === displayName} className={primaryBtn} style={{ background: "#C8956C" }} data-testid="bolig-settings-save-profil">
              {savingName ? "Gemmer..." : "Gem"}
            </button>
          </div>
        )}

        {tab === "udseende" && (
          <div className="space-y-6" data-testid="bolig-settings-udseende">
            <div>
              <label className={labelClass} style={{ color: "#0F1D2F" }}>Tema</label>
              <div className="flex gap-2 flex-wrap">
                {[{ v: "lys", l: "Lys" }, { v: "mørk", l: "Mørk" }, { v: "auto", l: "Auto" }].map((o) => (
                  <button key={o.v} onClick={() => { setTheme(o.v); saveJSON("bolig-theme", o.v); }}
                    className="px-4 py-2 rounded-lg text-sm font-medium border transition-all"
                    style={{ background: theme === o.v ? "#C8956C" : "#fff", color: theme === o.v ? "#fff" : "#0F1D2F", borderColor: theme === o.v ? "#C8956C" : "#D9D5CF" }}
                    data-testid={`bolig-settings-theme-${o.v}`}
                  >{o.l}</button>
                ))}
              </div>
              <p className="text-xs mt-2" style={{ color: "#6B6B6B" }}>Mørk og auto kommer snart — valg gemmes lokalt.</p>
            </div>
            <div>
              <label className={labelClass} style={{ color: "#0F1D2F" }}>Accentfarve</label>
              <div className="flex gap-2 flex-wrap">
                {[{ v: "navy", c: "#0F1D2F", l: "Navy" }, { v: "bronze", c: "#C8956C", l: "Bronze" }, { v: "blue", c: "#3B82F6", l: "Blå" }, { v: "green", c: "#2D6A4F", l: "Grøn" }, { v: "orange", c: "#F97316", l: "Orange" }, { v: "purple", c: "#8B5CF6", l: "Lilla" }].map((o) => (
                  <button key={o.v} onClick={() => handleAccent(o.v)}
                    className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium border transition-all"
                    style={{ background: accent === o.v ? "#F5F3EF" : "#fff", borderColor: accent === o.v ? o.c : "#D9D5CF", color: "#1A1A1A" }}
                    data-testid={`bolig-settings-accent-${o.v}`}
                  >
                    <span className="w-4 h-4 rounded-full" style={{ background: o.c }} />
                    {o.l}
                  </button>
                ))}
              </div>
              <p className="text-xs mt-2" style={{ color: "#6B6B6B" }}>Skifter brand-farven (header, knapper, aktive states) live.</p>
            </div>
            <div>
              <label className={labelClass} style={{ color: "#1A1A1A" }}>Tekstfarve på brand-elementer</label>
              <div className="flex gap-2 flex-wrap">
                {([{ v: "light", l: "Lys tekst på mørk baggrund" }, { v: "dark", l: "Mørk tekst på lys baggrund" }] as const).map((o) => (
                  <button key={o.v} onClick={() => handleTextMode(o.v)}
                    className="px-4 py-2 rounded-lg text-sm font-medium border transition-all"
                    style={{ background: textMode === o.v ? (ACCENT_COLORS[accent] ?? "#0F1D2F") : "#fff", color: textMode === o.v ? "#fff" : "#1A1A1A", borderColor: textMode === o.v ? (ACCENT_COLORS[accent] ?? "#0F1D2F") : "#D9D5CF" }}
                    data-testid={`bolig-settings-textmode-${o.v}`}
                  >{o.l}</button>
                ))}
              </div>
              <p className="text-xs mt-2" style={{ color: "#6B6B6B" }}>Vælg om brand-elementer skal vise lys eller mørk tekst.</p>
            </div>
          </div>
        )}

        {tab === "standardvalg" && (
          <div className="space-y-5 max-w-md" data-testid="bolig-settings-standardvalg">
            <div>
              <label className={labelClass} style={{ color: "#0F1D2F" }}>Forvalgt rum</label>
              <select value={defaults.room} onChange={(e) => { const v = { ...defaults, room: e.target.value }; setDefaults(v); saveJSON("bolig-defaults", v); }} className={inputClass} style={inputStyle} data-testid="bolig-settings-default-room">
                {Object.entries(BOLIG_ROOM_LABELS).slice(0, 16).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass} style={{ color: "#0F1D2F" }}>Forvalgt stil</label>
              <select value={defaults.style} onChange={(e) => { const v = { ...defaults, style: e.target.value }; setDefaults(v); saveJSON("bolig-defaults", v); }} className={inputClass} style={inputStyle} data-testid="bolig-settings-default-style">
                {Object.entries(BOLIG_STYLE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass} style={{ color: "#0F1D2F" }}>Forvalgt format</label>
              <select value={defaults.format} onChange={(e) => { const v = { ...defaults, format: e.target.value }; setDefaults(v); saveJSON("bolig-defaults", v); }} className={inputClass} style={inputStyle} data-testid="bolig-settings-default-format">
                {["4:3", "16:9", "1:1", "3:2"].map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div className="space-y-2 pt-2">
              {([["remember", "Husk seneste valg"], ["lastUpload", "Start med sidste uploadede billede"]] as const).map(([k, l]) => (
                <label key={k} className="flex items-center gap-2.5 cursor-pointer">
                  <input type="checkbox" checked={(defaults as any)[k]} onChange={(e) => { const v = { ...defaults, [k]: e.target.checked }; setDefaults(v); saveJSON("bolig-defaults", v); }}
                    className="w-4 h-4 rounded accent-[#C8956C]" data-testid={`bolig-settings-default-${k}`} />
                  <span className="text-sm" style={{ color: "#0F1D2F" }}>{l}</span>
                </label>
              ))}
            </div>
            <p className="text-xs" style={{ color: "#6B6B6B" }}>Gemmes automatisk lokalt.</p>
          </div>
        )}

        {tab === "notifikationer" && (
          <div className="space-y-3 max-w-md" data-testid="bolig-settings-notifikationer">
            {([["generation", "Email ved ny generering"], ["invite", "Email ved team-invite"], ["weekly", "Email ved ugentlig opsummering"]] as const).map(([k, l]) => (
              <label key={k} className="flex items-center gap-2.5 cursor-pointer p-3 rounded-lg border transition-colors hover:bg-[#F5F3EF]" style={{ borderColor: "#E8E4DE" }}>
                <input type="checkbox" checked={(notif as any)[k]} onChange={(e) => { const v = { ...notif, [k]: e.target.checked }; setNotif(v); saveJSON("bolig-notif", v); }}
                  className="w-4 h-4 rounded accent-[#C8956C]" data-testid={`bolig-settings-notif-${k}`} />
                <span className="text-sm" style={{ color: "#0F1D2F" }}>{l}</span>
              </label>
            ))}
            <p className="text-xs pt-1" style={{ color: "#6B6B6B" }}>Email-udsendelse kommer snart — valg gemmes lokalt.</p>
          </div>
        )}

        {tab === "konto" && (
          <div className="space-y-3 max-w-md" data-testid="bolig-settings-konto">
            <button onClick={handlePasswordReset} className="flex items-center justify-between w-full p-4 rounded-lg border transition-colors hover:bg-[#F5F3EF]" style={{ borderColor: "#E8E4DE" }} data-testid="bolig-settings-reset-password">
              <div className="text-left">
                <div className="text-sm font-semibold" style={{ color: "#0F1D2F" }}>Skift password</div>
                <div className="text-xs mt-0.5" style={{ color: "#6B6B6B" }}>Vi sender et link til {user.email}</div>
              </div>
              <ArrowRight className="w-4 h-4" style={{ color: "#6B6B6B" }} />
            </button>
            <button onClick={() => setDeleteOpen(true)} className="flex items-center justify-between w-full p-4 rounded-lg border transition-colors hover:bg-red-50" style={{ borderColor: "#FCA5A5" }} data-testid="bolig-settings-delete-account">
              <div className="text-left">
                <div className="text-sm font-semibold" style={{ color: "#B91C1C" }}>Slet min konto</div>
                <div className="text-xs mt-0.5" style={{ color: "#6B6B6B" }}>Permanent — kan ikke fortrydes</div>
              </div>
              <Trash2 className="w-4 h-4" style={{ color: "#B91C1C" }} />
            </button>
            <p className="text-xs pt-1" style={{ color: "#6B6B6B" }}>Alle brugere kan slette deres egen konto. Kun ejer og admin kan slette andres konto fra Team-sektionen.</p>
          </div>
        )}
      </div>

      {/* Live activity feed */}
      <div className={`${sectionBox} mt-6`} style={sectionStyle}>
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "#F0EDE7" }}>
            <Activity className="w-4.5 h-4.5" style={{ color: "#C8956C" }} />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold" style={{ color: "#0F1D2F" }}>Live team-aktivitet</div>
            <div className="text-xs" style={{ color: "#6B6B6B" }}>Opdateres hvert 5. sekund</div>
          </div>
          <span className="flex items-center gap-1.5 text-xs" style={{ color: "#2D6A4F" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            Live
          </span>
        </div>

        {teamActivity.length === 0 ? (
          <div className="text-center py-8 text-sm" style={{ color: "#6B6B6B" }} data-testid="bolig-team-activity-empty">
            Ingen aktivitet endnu. Når dit team begynder at oprette sager og generere billeder, vises det her live.
          </div>
        ) : (
          <ul className="space-y-1.5" data-testid="bolig-team-activity-list">
            {teamActivity.map((a, i) => {
              const room = a.roomType ? (BOLIG_ROOM_LABELS[a.roomType] ?? a.roomType) : "";
              const style = a.style ? (BOLIG_STYLE_LABELS[a.style] ?? a.style) : "";
              const tier = a.tier ? (TIER_LABELS[a.tier] ?? a.tier) : "";
              const desc = a.type === "generation"
                ? `genererede ${[room, style, tier].filter(Boolean).join(", ")}`
                : `oprettede sag "${a.address}"`;
              return (
                <li key={`${a.createdAt}-${i}`} className="flex items-start gap-3 py-2 px-3 rounded-lg hover:bg-[#F5F3EF] transition-colors" data-testid={`bolig-team-activity-item-${i}`}>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-semibold text-white flex-shrink-0 mt-0.5" style={{ background: a.type === "generation" ? "#C8956C" : "#0F1D2F" }}>
                    {a.userName.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm" style={{ color: "#1A1A1A" }}>
                      <span className="font-semibold">{a.userName}</span> {desc}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: "#6B6B6B" }}>{timeAgo(a.createdAt)}</div>
                  </div>
                  {a.type === "generation" && a.imageUrl && !isVideoUrl(a.imageUrl) && (
                    <img src={a.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                  )}
                  {a.type === "generation" && a.imageUrl && isVideoUrl(a.imageUrl) && (
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 border border-[#E8E4DE]" style={{ background: "#F0EDE7" }}>
                      <Video className="w-4 h-4" style={{ color: "#C8956C" }} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Delete account confirm */}
      <AnimatePresence>
        {deleteOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(15,29,47,0.55)" }}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" data-testid="bolig-delete-account-modal">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-red-100">
                  <Trash2 className="w-5 h-5 text-red-600" />
                </div>
                <h3 className="text-lg font-bold" style={{ color: "#0F1D2F" }}>Slet min konto?</h3>
              </div>
              <p className="text-sm mb-4" style={{ color: "#6B6B6B" }}>
                Dette sletter permanent din konto, alle dine sager og alt indhold. Handlingen kan <span className="font-semibold">ikke fortrydes</span>.
              </p>
              <div className="mb-4">
                <label className="block text-xs font-semibold mb-1.5" style={{ color: "#0F1D2F" }}>
                  Skriv <span className="font-bold text-red-600">SLET</span> for at bekræfte
                </label>
                <input
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="SLET"
                  className="w-full px-3.5 py-2.5 rounded-lg text-sm outline-none border"
                  style={{ background: "#FEF2F2", borderColor: "#FCA5A5", color: "#1A1A1A" }}
                  data-testid="bolig-delete-account-confirm-input"
                  disabled={deletingAccount}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => { setDeleteOpen(false); setDeleteConfirmText(""); }}
                  className="px-4 py-2 rounded-lg text-sm font-medium border transition-colors hover:bg-[#F5F3EF]"
                  style={{ borderColor: "#D9D5CF", color: "#0F1D2F" }}
                  data-testid="bolig-delete-account-cancel"
                  disabled={deletingAccount}
                >
                  Annuller
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleteConfirmText !== "SLET" || deletingAccount}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-40"
                  style={{ background: "#B91C1C" }}
                  data-testid="bolig-delete-account-submit"
                >
                  {deletingAccount ? "Sletter..." : "Slet konto permanent"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function BoligpotentialeDashboard() {
  const { user, loading: authLoading, isAdmin, creditsRemaining, subscriptionStatus, subscriptionTier } = useAuth();
  const quotaData = useQuotaData();
  const lockedTV = !isAdmin && quotaData != null && quotaData.quota.transformVideo.limit === 0;
  const lockedSV = !isAdmin && quotaData != null && quotaData.quota.showcase.limit === 0;
  const SUPER_ADMIN_EMAILS_DASH = ["fredefussing@gmail.com", "nikolajthomsen0102@gmail.com"];
  const isSubscribed = SUPER_ADMIN_EMAILS_DASH.includes((user?.email ?? "").toLowerCase()) || isAdmin || subscriptionStatus === "active";
  const isOwner = user?.email?.toLowerCase() === "fredefussing@gmail.com";
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [section, setSection] = useState<Section>("dashboard");
  const [modal, setModal] = useState<Modal>(null);
  const [planCheckoutLoading, setPlanCheckoutLoading] = useState<string | null>(null);

  const DASH_PLAN_PRICE_IDS: Record<string, string> = {
    Start:    "price_1Tl2kVKDpJP0jg0e2UqApR5B",
    Pro:      "price_1Tl2nYKDpJP0jg0eMbTJQ2jx",
    Business: "price_1Tl2pZKDpJP0jg0etHHBwE52",
  };

  const startPlanCheckout = async (planName: string) => {
    const priceId = DASH_PLAN_PRICE_IDS[planName];
    if (!priceId) return;
    setPlanCheckoutLoading(planName);
    try {
      const res = await fetch("/api/create-subscription-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId, customerEmail: user?.email ?? "" }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else showToast("Checkout fejlede. Prøv igen.");
    } catch {
      showToast("Checkout fejlede. Prøv igen.");
    } finally {
      setPlanCheckoutLoading(null);
    }
  };
  const [toast, setToast] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState<number | null>(null);
  const [prevSection, setPrevSection] = useState<Section>("dashboard");
  const [now, setNow] = useState(Date.now());
  const [pendingCase, setPendingCase] = useState<ApiCase | null>(null);
  const [activityLightbox, setActivityLightbox] = useState<{ src: string; beforeSrc: string | null } | null>(null);
  const [invoiceModal, setInvoiceModal] = useState<BillingInvoice | null>(null);
  const [cancelConfirming, setCancelConfirming] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => { applyBoligBrand(); }, []);

  const openCase = (id: number) => {
    setSelectedCaseId(id);
    setPrevSection(section);
    setSection("sag-detail");
  };

  const closeCase = () => {
    setSection(prevSection);
    setSelectedCaseId(null);
    setPendingCase(null);
  };

  useEffect(() => {
    if (!authLoading && !user) {
      setLocation("/login?redirect=/boligpotentiale/dashboard");
    }
  }, [user, authLoading, setLocation]);

  const showToast = (msg: string) => setToast(msg);

  const handleSignOut = async () => {
    queryClient.clear();
    await signOut(auth);
    setLocation("/boligpotentiale");
  };

  const displayName = user?.displayName || user?.email?.split("@")[0] || "Mægler";
  const initials = displayName.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);

  // ── Stats query ────────────────────────────────────────────────────────────
  const { data: stats } = useQuery<{ todayImages: number; totalImages: number; activeCases: number; soldCases: number; totalCases: number; avgDaysOnMarket: number }>({
    queryKey: ["/api/bolig/stats", user?.uid],
    queryFn: async () => {
      const token = await user!.getIdToken();
      const res = await fetch("/api/bolig/stats", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed to load stats");
      return res.json();
    },
    enabled: !!user,
  });

  // ── Cases query ───────────────────────────────────────────────────────────
  const { data: cases = [], isLoading: casesLoading } = useQuery<ApiCase[]>({
    queryKey: ["/api/bolig/cases", user?.uid],
    queryFn: async () => {
      const token = await user!.getIdToken();
      const res = await fetch("/api/bolig/cases", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load cases");
      return res.json();
    },
    enabled: !!user,
  });

  // ── Activity query ─────────────────────────────────────────────────────────
  const { data: activity = [], refetch: refetchActivity } = useQuery<Array<{ type: "generation" | "case"; imageUrl?: string; beforeImageUrl?: string; roomType?: string; style?: string; tier?: string; address?: string; caseId?: number | null; createdAt: string; isDesignAgent?: boolean; promptText?: string }>>({
    queryKey: ["/api/bolig/activity", user?.uid],
    queryFn: async () => {
      if (!user) return [];
      const token = await user.getIdToken();
      if (!token) return [];
      const res = await fetch("/api/bolig/activity", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user,
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: 60_000,
  });

  // ── Most-used query ────────────────────────────────────────────────────────
  const { data: mostUsed, refetch: refetchMostUsed } = useQuery<{ styles: Array<{ key: string; count: number }>; rooms: Array<{ key: string; count: number }>; tiers: Array<{ key: string; count: number }> }>({
    queryKey: ["/api/bolig/most-used", user?.uid],
    queryFn: async () => {
      if (!user) return { styles: [], rooms: [], tiers: [] };
      const token = await user.getIdToken();
      if (!token) return { styles: [], rooms: [], tiers: [] };
      const res = await fetch("/api/bolig/most-used", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return { styles: [], rooms: [], tiers: [] };
      return res.json();
    },
    enabled: !!user,
    staleTime: 0,
    refetchOnMount: "always",
  });

  // ── Force-refetch activity + most-used when returning to dashboard ─────────
  useEffect(() => {
    if (section === "dashboard" && user) {
      refetchActivity();
      refetchMostUsed();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, user]);

  // ── Auto-join pending team code from localStorage (set by join page) ────────
  useEffect(() => {
    if (!user) return;
    const pendingCode = localStorage.getItem("pendingTeamCode");
    if (!pendingCode) return;
    localStorage.removeItem("pendingTeamCode");
    user.getIdToken().then((token) => {
      fetch("/api/teams/join", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ code: pendingCode }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (d.success) {
            setToast(`Du er nu med i ${d.teamName}!`);
            queryClient.invalidateQueries({ queryKey: ["/api/team"] });
          }
        })
        .catch(() => {});
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // ── Recent images query ────────────────────────────────────────────────────
  const { data: recentImages = [] } = useQuery<Array<{ id: number; imageUrl: string; roomType: string; style: string; budgetTier: string; caseId?: number | null }>>({
    queryKey: ["/api/bolig/recent-images", user?.uid],
    queryFn: async () => {
      if (!user) return [];
      const token = await user.getIdToken();
      const res = await fetch("/api/bolig/recent-images", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user,
    staleTime: 0,
    refetchOnMount: "always",
  });

  // ── Billing overview query ─────────────────────────────────────────────────
  const { data: billingOverview, isLoading: billingOverviewLoading, refetch: refetchBilling } = useQuery<BillingOverview>({
    queryKey: ["/api/billing/overview", user?.uid],
    queryFn: async () => {
      if (!user) throw new Error("Ikke logget ind");
      const token = await user.getIdToken();
      const res = await fetch("/api/billing/overview", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Fejl ved hentning af faktureringsdata");
      return res.json();
    },
    enabled: !!user && section === "fakturering",
    staleTime: 60_000,
  });

  // ── Cancel subscription mutation ───────────────────────────────────────────
  const cancelSubscriptionMutation = useMutation({
    mutationFn: async (subscriptionId: string) => {
      const token = await user!.getIdToken();
      const res = await fetch("/api/billing/cancel", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Ukendt fejl" }));
        throw new Error(err.error || "Fejl ved opsigelse");
      }
      return res.json();
    },
    onSuccess: () => {
      setCancelConfirming(false);
      refetchBilling();
      setToast("Abonnement opsagt — du bevarer adgang til udløbsdatoen.");
    },
    onError: (err: Error) => {
      setToast(`Fejl: ${err.message}`);
      setCancelConfirming(false);
    },
  });

  const reactivateSubscriptionMutation = useMutation({
    mutationFn: async (subscriptionId: string) => {
      const token = await user!.getIdToken();
      const res = await fetch("/api/billing/reactivate", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Ukendt fejl" }));
        throw new Error(err.error || "Fejl ved genaktivering");
      }
      return res.json();
    },
    onSuccess: () => { refetchBilling(); setToast("Abonnement genaktiveret — opsigelsen er fortrudt."); },
    onError: (err: Error) => { setToast(`Fejl: ${err.message}`); },
  });

  const pauseSubscriptionMutation = useMutation({
    mutationFn: async (subscriptionId: string) => {
      const token = await user!.getIdToken();
      const res = await fetch("/api/billing/pause", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Ukendt fejl" }));
        throw new Error(err.error || "Fejl ved pausering");
      }
      return res.json();
    },
    onSuccess: () => { refetchBilling(); setToast("Abonnement sat på pause — ingen opkrævning i pauseperioden."); },
    onError: (err: Error) => { setToast(`Fejl: ${err.message}`); },
  });

  const resumeSubscriptionMutation = useMutation({
    mutationFn: async (subscriptionId: string) => {
      const token = await user!.getIdToken();
      const res = await fetch("/api/billing/resume", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Ukendt fejl" }));
        throw new Error(err.error || "Fejl ved genoptagelse");
      }
      return res.json();
    },
    onSuccess: () => { refetchBilling(); setToast("Abonnement genoptaget — fakturering fortsætter normalt."); },
    onError: (err: Error) => { setToast(`Fejl: ${err.message}`); },
  });

  // ── Create case mutation ───────────────────────────────────────────────────
  const createCaseMutation = useMutation({
    mutationFn: async ({ address, caseNo, notes }: { address: string; caseNo: string; notes: string }) => {
      const token = await auth.currentUser?.getIdToken();
      const isoToday = new Date().toISOString().slice(0, 10);
      const res = await fetch("/api/bolig/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ address, caseNo: caseNo || null, notes: notes || null, marketDateISO: isoToday }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Kunne ikke oprette sag" }));
        throw new Error(err.message ?? "Kunne ikke oprette sag");
      }
      return res.json() as Promise<ApiCase>;
    },
    onSuccess: (newCase) => {
      setPendingCase(newCase);
      queryClient.setQueryData(["/api/bolig/cases"], (old: ApiCase[] | undefined) => {
        const updated = old ? [newCase, ...old] : [newCase];
        return updated;
      });
      setModal(null);
      setPrevSection(section);
      setSelectedCaseId(newCase.id);
      setSection("sag-detail");
      showToast(`Sag oprettet: ${newCase.address}`);
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/bolig/cases"] });
      }, 100);
    },
    onError: (err: any) => {
      showToast(`Fejl: ${err.message ?? "Kunne ikke oprette sag. Prøv igen."}`);
    },
  });

  const handleNewCase = (address: string, caseNo: string, notes: string) => {
    createCaseMutation.mutate({ address, caseNo, notes });
  };

  // Filter cases by search
  const filteredCases = search.trim()
    ? cases.filter((c) => {
        const q = search.toLowerCase().trim();
        return c.address.toLowerCase().includes(q) || (c.caseNo ?? "").toLowerCase().includes(q);
      })
    : cases;

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#F5F3EF" }}>
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 rounded-full border-4 border-[#F0EDE7]" />
          <div className="absolute inset-0 rounded-full border-4 border-[#C8956C] border-t-transparent animate-spin" />
        </div>
      </div>
    );
  }
  if (!user) return null;

  const soldCount = cases.filter((c) => c.status === "sold").length;

  const NAV = [
    { id: "dashboard" as Section, label: "Dashboard", icon: <LayoutDashboard className="w-[18px] h-[18px]" /> },
    { id: "sager" as Section, label: "Alle sager", icon: <FolderOpen className="w-[18px] h-[18px]" /> },
    { id: "solgte" as Section, label: "Solgte sager", icon: <PackageCheck className="w-[18px] h-[18px]" />, badge: soldCount > 0 ? soldCount : null },
    { id: "ai-design-agent" as Section, label: "AI Design Agent", icon: <PenTool className="w-[18px] h-[18px]" /> },
    { id: "3d-plantegning" as Section, label: "3D plantegning", icon: <Box className="w-[18px] h-[18px]" /> },
    { id: "transformering-video" as Section, label: "Transformering video", icon: <Video className="w-[18px] h-[18px]" />, locked: lockedTV },
    ...(isOwner ? [{ id: "ai-boligfremvisning" as Section, label: "AI boligfremvisning", icon: <Home className="w-[18px] h-[18px]" /> }] : []),
    { id: "showcase-video" as Section, label: "Bolig showcase", icon: <Film className="w-[18px] h-[18px]" />, locked: lockedSV },
    { id: "historik" as Section, label: "Historik", icon: <Clock className="w-[18px] h-[18px]" /> },
    { id: "team" as Section, label: "Team", icon: <Users className="w-[18px] h-[18px]" /> },
    ...(isAdmin ? [{ id: "crm" as Section, label: "CRM", icon: <Shield className="w-[18px] h-[18px]" /> }] : []),
  ];

  const NAV_BOTTOM = [
    { id: "indstillinger" as Section, label: "Indstillinger", icon: <Settings className="w-[18px] h-[18px]" /> },
    { id: "pris" as Section, label: "Pris", icon: <Coins className="w-[18px] h-[18px]" /> },
    { id: "fakturering" as Section, label: "Fakturering", icon: <CreditCard className="w-[18px] h-[18px]" /> },
  ];

  const SidebarContent = () => (
    <>
      <PaywallAction allowFreeTrial>
        <button
          onClick={() => { setModal("newSag"); setSidebarOpen(false); }}
          className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl font-semibold text-sm text-white mb-5 transition-all hover:opacity-90 active:scale-95"
          style={{ background: "#C8956C" }}
          data-testid="bolig-sidebar-new-sag"
        >
          <Plus className="w-4 h-4" /> Ny sag
        </button>
      </PaywallAction>

      <nav className="space-y-0.5 flex-1 overflow-y-auto min-h-0" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.1) transparent" }}>
        {NAV.map((item) => {
          const isActive = section === item.id || (section === "sag-detail" && item.id === "sager");
          const isLocked = "locked" in item && item.locked;
          return (
            <button key={item.id}
              onClick={() => {
                if (isLocked) return;
                setSection(item.id); setSidebarOpen(false);
              }}
              className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium transition-all"
              style={{
                background: isActive ? "rgba(200,149,108,0.18)" : "transparent",
                color: isLocked ? "rgba(245,243,239,0.3)" : isActive ? "#C8956C" : "rgba(245,243,239,0.7)",
                cursor: isLocked ? "default" : "pointer",
              }}
              data-testid={`bolig-nav-${item.id}`}
              title={isLocked ? "Denne funktion er ikke inkluderet i din pakke" : undefined}
            >
              {item.icon}
              <span className="md:inline flex-1">{item.label}</span>
              {isLocked && <Lock className="w-3.5 h-3.5 opacity-50" />}
              {"badge" in item && item.badge != null && !isLocked && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(45,106,79,0.25)", color: "#86efac" }}>{item.badge}</span>
              )}
            </button>
          );
        })}

        <div className="my-3" style={{ height: "1px", background: "rgba(245,243,239,0.1)" }} />

        {NAV_BOTTOM.map((item) => (
          <button key={item.id}
            onClick={() => { setSection(item.id); setSidebarOpen(false); }}
            className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium transition-all"
            style={{ background: section === item.id ? "rgba(200,149,108,0.18)" : "transparent", color: section === item.id ? "#C8956C" : "rgba(245,243,239,0.7)" }}
            data-testid={`bolig-nav-${item.id}`}
          >
            {item.icon} <span className="md:inline">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="mt-auto pt-4" style={{ borderTop: "1px solid rgba(245,243,239,0.1)" }}>
        <Link href="/boligpotentiale">
          <button
            className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium transition-all hover:bg-white/5"
            style={{ color: "rgba(245,243,239,0.55)" }}
            data-testid="bolig-nav-forside"
          >
            <Home className="w-[18px] h-[18px]" />
            <span className="md:inline">Forside</span>
            <ArrowUpRight className="w-3.5 h-3.5 ml-auto opacity-60" />
          </button>
        </Link>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex flex-col font-sans" style={{ background: "#F5F3EF", color: "#1A1A1A" }}>

      {/* ── TOPBAR ── */}
      <header className="fixed top-0 left-0 right-0 z-40 h-20 md:h-32 flex items-center px-4 md:px-6 gap-3 md:gap-5 border-b" style={{ background: "#0F1D2F", borderColor: "rgba(245,243,239,0.1)" }}>
        <button className="md:hidden flex flex-col gap-[5px] mr-1" onClick={() => setSidebarOpen((o) => !o)} data-testid="bolig-topbar-hamburger">
          <span className="w-5 h-[2px] rounded bg-[#F5F3EF]" />
          <span className="w-5 h-[2px] rounded bg-[#F5F3EF]" />
          <span className="w-5 h-[2px] rounded bg-[#F5F3EF]" />
        </button>

        <Link href="/">
          <img
            src={formaEstatesLogo}
            alt="Forma Estates – tilbage til forsiden"
            title="Tilbage til forsiden"
            className="h-14 md:h-24 w-auto select-none cursor-pointer"
            style={{ filter: "brightness(0) invert(1)", minWidth: "fit-content" }}
            data-testid="bolig-topbar-logo"
          />
        </Link>

        <div className="flex-1 max-w-xs hidden sm:block">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 z-10" style={{ color: "rgba(245,243,239,0.45)" }} />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setSearchOpen(true); }}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const first = filteredCases[0];
                  if (first) {
                    setPrevSection(section);
                    setSelectedCaseId(first.id);
                    setSection("sag-detail");
                    setSearch("");
                    setSearchOpen(false);
                    (e.target as HTMLInputElement).blur();
                  }
                } else if (e.key === "Escape") {
                  setSearchOpen(false);
                  (e.target as HTMLInputElement).blur();
                }
              }}
              type="text"
              placeholder="Søg i sager..."
              className="w-full pl-9 pr-4 py-2.5 rounded-lg text-sm outline-none"
              style={{ background: "rgba(245,243,239,0.1)", border: "1px solid rgba(245,243,239,0.2)", color: "#F5F3EF", caretColor: "#C8956C" }}
              data-testid="bolig-topbar-search"
            />
            <AnimatePresence>
              {searchOpen && search.trim() && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.12 }}
                  className="absolute left-0 right-0 top-full mt-1 rounded-xl shadow-xl border overflow-hidden z-50 max-h-80 overflow-y-auto"
                  style={{ background: "#fff", borderColor: "#E8E4DE" }}
                  data-testid="bolig-search-dropdown"
                >
                  {filteredCases.length === 0 ? (
                    <div className="px-4 py-3 text-sm" style={{ color: "#6B6B6B" }} data-testid="bolig-search-no-results">
                      Ingen sager fundet
                    </div>
                  ) : (
                    filteredCases.slice(0, 8).map((c) => (
                      <button
                        key={c.id}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setPrevSection(section);
                          setSelectedCaseId(c.id);
                          setSection("sag-detail");
                          setSearch("");
                          setSearchOpen(false);
                        }}
                        className="w-full text-left px-4 py-2.5 transition-colors hover:bg-[#F5F3EF] border-b last:border-b-0"
                        style={{ borderColor: "#F0EDE7" }}
                        data-testid={`bolig-search-result-${c.id}`}
                      >
                        <div className="text-sm font-medium truncate" style={{ color: "#1A1A1A" }}>{c.address}</div>
                        {c.caseNo && (
                          <div className="text-xs truncate" style={{ color: "#6B6B6B" }}>Sag #{c.caseNo}</div>
                        )}
                      </button>
                    ))
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-3 relative">
          {isOwner && (
            <>
              <span className="hidden sm:inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(200,149,108,0.25)", color: "#C8956C" }}>Ejer</span>
              <button
                onClick={() => setSection("crm")}
                className="hidden sm:flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-semibold transition-all hover:opacity-90"
                style={{ background: section === "crm" ? "#C8956C" : "rgba(200,149,108,0.18)", color: section === "crm" ? "#fff" : "#C8956C" }}
                data-testid="bolig-topbar-crm"
              >
                <Shield className="w-3.5 h-3.5" /> CRM
              </button>
            </>
          )}
          <span className="text-sm hidden sm:block truncate max-w-[130px]" style={{ color: "rgba(245,243,239,0.8)" }} data-testid="bolig-topbar-username">{displayName}</span>
          <button
            onClick={() => setProfileOpen((o) => !o)}
            className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold text-white flex-shrink-0 transition-opacity hover:opacity-80"
            style={{ background: "#C8956C" }}
            data-testid="bolig-topbar-avatar"
          >{initials}</button>

          <AnimatePresence>
            {profileOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)} />
                <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}
                  className="absolute right-0 top-11 z-50 w-52 rounded-xl shadow-xl border overflow-hidden"
                  style={{ background: "#fff", borderColor: "#E8E4DE" }}>
                  <div className="px-4 py-3 border-b border-[#E8E4DE]">
                    <div className="text-sm font-semibold truncate" style={{ color: "#1A1A1A" }}>{displayName}</div>
                    <div className="text-xs truncate" style={{ color: "#6B6B6B" }}>{user.email}</div>
                    {creditsRemaining !== null && (
                      <div className="text-xs mt-1" style={{ color: "#C8956C" }}>{creditsRemaining} kreditter tilbage</div>
                    )}
                  </div>
                  <button onClick={handleSignOut} className="w-full flex items-center gap-2.5 px-4 py-3 text-sm transition-colors hover:bg-[#F0EDE7]" style={{ color: "#1A1A1A" }} data-testid="bolig-signout">
                    <LogOut className="w-4 h-4" style={{ color: "#6B6B6B" }} /> Log ud
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </header>

      <div className="pt-20 md:pt-32 md:pl-56">
        <PaywallBanner />
      </div>

      <div className="flex flex-1 -mt-20 md:-mt-32 pt-20 md:pt-32">
        {/* ── DESKTOP SIDEBAR ── */}
        <aside className="hidden md:flex flex-col w-56 flex-shrink-0 fixed left-0 top-32 bottom-0 px-4 py-5" style={{ background: "#0F1D2F" }} data-testid="bolig-sidebar">
          <SidebarContent />
        </aside>

        {/* ── MOBILE SIDEBAR OVERLAY ── */}
        <AnimatePresence>
          {sidebarOpen && (
            <>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
                className="fixed inset-0 z-30 md:hidden" style={{ background: "rgba(0,0,0,0.4)" }} onClick={() => setSidebarOpen(false)} />
              <motion.aside initial={{ x: -240 }} animate={{ x: 0 }} exit={{ x: -240 }} transition={{ duration: 0.22, ease: "easeOut" }}
                className="fixed top-0 left-0 bottom-0 z-40 w-60 flex flex-col px-4 py-5 md:hidden" style={{ background: "#0F1D2F" }}>
                <Link href="/" onClick={() => setSidebarOpen(false)}>
                  <img
                    src={formaEstatesLogo}
                    alt="Forma Estates – tilbage til forsiden"
                    title="Tilbage til forsiden"
                    className="h-32 w-auto mb-4 mt-2 cursor-pointer"
                    style={{ filter: "brightness(0) invert(1)" }}
                    data-testid="bolig-sidebar-logo"
                  />
                </Link>
                <SidebarContent />
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* ── MAIN CONTENT ── */}
        <main className="flex-1 md:ml-56 p-6 md:p-8 min-h-[calc(100vh-64px)]" data-testid="bolig-main">

          {/* Dashboard overview */}
          {section === "dashboard" && (
            <motion.div key="dashboard-view" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
              <div className="mb-8">
                <h1 className="text-2xl font-bold" style={{ color: "#0F1D2F", letterSpacing: "-0.02em" }}>Godmorgen, {displayName.split(" ")[0]}</h1>
                <p className="text-sm mt-1" style={{ color: "#6B6B6B" }}>Her får du et hurtigt overblik over dine sager og visualiseringer.</p>
              </div>

              {/* Statistik — 6 kort */}
              <div className="mb-6" data-testid="bolig-stats">
                <h2 className="text-xs font-bold tracking-[0.1em] uppercase mb-3" style={{ color: "#9B9690" }}>Overblik</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    { value: stats ? String(stats.todayImages) : "—", label: "I dag" },
                    { value: stats ? String(stats.totalImages) : "—", label: "Visuals i alt" },
                    { value: stats ? String(stats.activeCases) : String(cases.filter((c) => c.status === "active").length), label: "Aktive sager" },
                    { value: stats ? String(stats.soldCases) : String(soldCount), label: "Solgte sager" },
                    { value: stats ? String(stats.totalCases) : String(cases.length), label: "Sager i alt" },
                    { value: stats ? (stats.avgDaysOnMarket > 0 ? `${stats.avgDaysOnMarket}d` : "—") : "—", label: "Dage på marked" },
                  ].map((s, i) => (
                    <div key={i} className="rounded-xl p-4 border border-[#E8E4DE] hover:shadow-sm transition-shadow overflow-hidden" style={{ background: "#fff" }} data-testid={`bolig-stat-${i}`}>
                      <div className="text-2xl font-bold mb-1" style={{ color: "#0F1D2F", lineHeight: 1, letterSpacing: "-0.02em" }}>{s.value}</div>
                      <div className="text-xs leading-tight" style={{ color: "#9B9690" }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Månedlig kvota */}
              <div className="mb-6">
                <QuotaWidget />
              </div>

              {/* Aktive Sager */}
              <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm border border-[#E8E4DE]" data-testid="bolig-active-cases">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-base font-semibold" style={{ color: "#1A1A1A" }}>Aktive Sager</h2>
                  <button onClick={() => setSection("sager")} className="text-xs font-medium flex items-center gap-1 hover:opacity-70 transition-opacity" style={{ color: "#C8956C" }} data-testid="bolig-see-all-cases">
                    Se alle <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>
                {casesLoading ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="rounded-xl overflow-hidden border border-[#E8E4DE] animate-pulse" style={{ background: "#F5F3EF" }}>
                        <div className="h-36 bg-[#E8E4DE]" />
                        <div className="p-3 space-y-2"><div className="h-3 bg-[#E8E4DE] rounded w-3/4" /><div className="h-2.5 bg-[#E8E4DE] rounded w-1/2" /></div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {cases.filter((c) => c.status === "active").slice(0, 3).map((c) => {
                      const days = liveDaysFromISO(c.marketDateISO, now);
                      return (
                        <div key={c.id} onClick={() => openCase(c.id)} className="rounded-xl overflow-hidden border border-[#E8E4DE] cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md" style={{ background: "#F5F3EF" }} data-testid={`bolig-case-card-${c.id}`}>
                          <div className="relative h-36">
                            <CaseThumb src={c.latestImageUrl} alt={c.address} className="w-full h-full object-cover" />
                            <span className="absolute top-2 right-2 text-[11px] font-medium text-white px-2 py-0.5 rounded-full" style={{ background: "rgba(0,0,0,0.55)" }}>{c.imageCount} {c.imageCount === 1 ? "visualisering" : "visualiseringer"}</span>
                          </div>
                          <div className="p-3">
                            <h3 className="text-sm font-semibold truncate mb-0.5" style={{ color: "#1A1A1A" }}>{c.address}</h3>
                            <p className="text-xs mb-2" style={{ color: "#6B6B6B" }}>{days} dage på markedet</p>
                            <span className="inline-block text-[11px] font-semibold px-2.5 py-0.5 rounded-full" style={{ background: "rgba(45,106,79,0.1)", color: "#2D6A4F" }}>Aktiv</span>
                          </div>
                        </div>
                      );
                    })}
                    <PaywallAction allowFreeTrial>
                      <button onClick={() => setModal("newSag")} className="rounded-xl border-2 border-dashed flex flex-col items-center justify-center min-h-[180px] gap-2 transition-all hover:border-[#C8956C] hover:bg-[rgba(200,149,108,0.04)] w-full h-full" style={{ borderColor: "#D9D5CF" }} data-testid="bolig-add-case">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "#F0EDE7" }}><Plus className="w-5 h-5" style={{ color: "#C8956C" }} /></div>
                        <span className="text-xs font-medium" style={{ color: "#C8956C" }}>Opret ny sag</span>
                      </button>
                    </PaywallAction>
                  </div>
                )}
              </div>

              {/* Solgte Sager — mini preview */}
              {soldCount > 0 && (
                <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm border border-[#E8E4DE]" data-testid="bolig-sold-cases-preview">
                  <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-semibold" style={{ color: "#1A1A1A" }}>Solgte sager</h2>
                      <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full" style={{ background: "rgba(45,106,79,0.1)", color: "#2D6A4F" }}>{soldCount}</span>
                    </div>
                    <button onClick={() => setSection("solgte")} className="text-xs font-medium flex items-center gap-1 hover:opacity-70 transition-opacity" style={{ color: "#C8956C" }} data-testid="bolig-see-sold-cases">
                      Se alle <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {cases.filter((c) => c.status === "sold").slice(0, 3).map((c) => (
                      <div key={c.id} onClick={() => openCase(c.id)} className="rounded-xl overflow-hidden border border-[#E8E4DE] cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md opacity-85 hover:opacity-100" style={{ background: "#F5F3EF" }} data-testid={`bolig-sold-card-${c.id}`}>
                        <div className="relative h-36">
                          <CaseThumb src={c.latestImageUrl} alt={c.address} className="w-full h-full object-cover grayscale-[20%]" />
                          <span className="absolute top-2 right-2 text-[11px] font-medium text-white px-2 py-0.5 rounded-full" style={{ background: "rgba(45,106,79,0.75)" }}>Solgt</span>
                        </div>
                        <div className="p-3">
                          <h3 className="text-sm font-semibold truncate mb-0.5" style={{ color: "#1A1A1A" }}>{c.address}</h3>
                          <p className="text-xs" style={{ color: "#9B9690" }}>{c.soldDateISO ? `Solgt ${c.soldDateISO}` : "Solgt"}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* AI-funktioner — klikbare kort */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6" data-testid="bolig-feature-cards">
                {[
                  {
                    eyebrow: "AI Design Agent",
                    title: "Beskriv din vision",
                    desc: "Fortæl AI'en hvad du ønsker — den omsætter det til et færdigt design.",
                    icon: <PenTool className="w-5 h-5" style={{ color: "#C8956C" }} />,
                    section: "ai-design-agent" as Section,
                    testId: "bolig-feature-ai-agent",
                  },
                  {
                    eyebrow: "Bolig Showcase",
                    title: "Vis potentialet",
                    desc: "Præsentér boligens fulde potentiale med professionelle visualiseringer.",
                    icon: <Film className="w-5 h-5" style={{ color: "#C8956C" }} />,
                    section: "showcase-video" as Section,
                    testId: "bolig-feature-showcase",
                  },
                ].map((f) => (
                  <button
                    key={f.eyebrow}
                    onClick={() => setSection(f.section)}
                    className="group text-left bg-white rounded-2xl p-6 shadow-sm border border-[#E8E4DE] hover:-translate-y-0.5 hover:shadow-md transition-all duration-200"
                    data-testid={f.testId}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(200,149,108,0.1)" }}>
                        {f.icon}
                      </div>
                      <span className="text-[10px] font-bold tracking-[0.12em] uppercase" style={{ color: "#C8956C" }}>{f.eyebrow}</span>
                    </div>
                    <h3 className="text-base font-semibold mb-1.5" style={{ color: "#0F1D2F" }}>{f.title}</h3>
                    <p className="text-sm leading-relaxed mb-4" style={{ color: "#6B6B6B" }}>{f.desc}</p>
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold transition-all group-hover:gap-2.5" style={{ color: "#0F1D2F" }}>
                      Se mere <ArrowUpRight className="w-3.5 h-3.5" style={{ color: "#C8956C" }} />
                    </span>
                  </button>
                ))}
              </div>

              {/* Hurtig-handlinger + Seneste aktivitet */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4" data-testid="bolig-bottom-row">

                {/* Venstre: Hurtig-handlinger + Genbrug seneste */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#E8E4DE]" data-testid="bolig-quick-actions">
                  <h2 className="text-base font-semibold mb-4" style={{ color: "#1A1A1A" }}>Hurtige handlinger</h2>
                  <div className="flex flex-wrap gap-3 mb-6">
                    <button onClick={() => setSection("upload")} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm text-white transition-all hover:opacity-90" style={{ background: "#C8956C" }} data-testid="bolig-quick-upload">
                      <Upload className="w-4 h-4" /> Upload billede
                    </button>
                    <button onClick={() => setModal("newSag")} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm border transition-all hover:bg-[#F0EDE7]" style={{ color: "#1A1A1A", borderColor: "#D9D5CF" }} data-testid="bolig-quick-new-sag">
                      <Plus className="w-4 h-4" /> Ny sag
                    </button>
                  </div>
                  {recentImages.length > 0 && (
                    <>
                      <h3 className="text-xs font-bold tracking-[0.08em] uppercase mb-3" style={{ color: "#9B9690" }}>Genbrug seneste valg</h3>
                      <div className="space-y-2">
                        {recentImages.map((img) => (
                          <div key={img.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-[#F5F3EF] transition-colors" data-testid={`bolig-reuse-${img.id}`}>
                            <img src={img.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0 border border-[#E8E4DE]" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate" style={{ color: "#1A1A1A" }}>{BOLIG_ROOM_LABELS[img.roomType] ?? img.roomType}</p>
                              <p className="text-[11px]" style={{ color: "#9B9690" }}>{BOLIG_STYLE_LABELS[img.style] ?? img.style} · {img.budgetTier.replace("tier", "T")}</p>
                            </div>
                            {img.caseId && (
                              <button
                                onClick={() => openCase(img.caseId!)}
                                className="flex-shrink-0 text-[11px] font-medium px-3 py-1 rounded-full border transition-colors hover:bg-[#F0EDE7]"
                                style={{ color: "#C8956C", borderColor: "rgba(200,149,108,0.35)" }}
                                data-testid={`bolig-reuse-btn-${img.id}`}
                              >
                                Genbrug
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Højre: Seneste aktivitet + Mest brugte */}
                <div className="flex flex-col gap-4">
                  <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#E8E4DE]" data-testid="bolig-activity">
                    <h2 className="text-base font-semibold mb-4" style={{ color: "#1A1A1A" }}>Seneste aktivitet</h2>
                    {activity.length === 0 ? (
                      <p className="text-sm" style={{ color: "#9B9690" }}>Ingen aktivitet endnu.</p>
                    ) : (
                      <div className="space-y-1">
                        {activity.map((item, i) => (
                          item.type === "generation" && item.isDesignAgent ? (
                            <button
                              key={i}
                              onClick={() => setSection("ai-design-agent")}
                              className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-[#F5F3EF] transition-colors text-left"
                              data-testid={`bolig-activity-item-${i}`}
                            >
                              <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 border border-[#E8E4DE]" style={{ background: "#F0EDE7" }}>
                                <PenTool className="w-4 h-4" style={{ color: "#C8956C" }} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium leading-snug truncate" style={{ color: "#1A1A1A" }}>
                                  Design Agent{item.promptText ? `: "${item.promptText.slice(0, 30)}${item.promptText.length > 30 ? "…" : ""}"` : ""}
                                </p>
                                <p className="text-[11px] mt-0.5" style={{ color: "#9B9690" }}>{timeAgo(item.createdAt)}</p>
                              </div>
                              <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#D9D5CF" }} />
                            </button>
                          ) : item.type === "generation" ? (
                            <button
                              key={i}
                              onClick={() => item.imageUrl && setActivityLightbox({ src: item.imageUrl, beforeSrc: item.beforeImageUrl && item.beforeImageUrl !== item.imageUrl ? item.beforeImageUrl : null })}
                              className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-[#F5F3EF] transition-colors text-left"
                              data-testid={`bolig-activity-item-${i}`}
                            >
                              {isVideoUrl(item.imageUrl) ? (
                                <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 border border-[#E8E4DE]" style={{ background: "#F0EDE7" }}>
                                  <Video className="w-4 h-4" style={{ color: "#C8956C" }} />
                                </div>
                              ) : (
                                <img src={item.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0 border border-[#E8E4DE]" />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium leading-snug" style={{ color: "#1A1A1A" }}>
                                  {BOLIG_ROOM_LABELS[item.roomType ?? ""] ?? item.roomType}
                                  {" · "}{BOLIG_STYLE_LABELS[item.style ?? ""] ?? item.style}
                                  {" · "}{item.tier?.replace("tier", "T")}
                                </p>
                                <p className="text-[11px] mt-0.5" style={{ color: "#9B9690" }}>{timeAgo(item.createdAt)}</p>
                              </div>
                              {item.caseId && (
                                <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#D9D5CF" }} />
                              )}
                            </button>
                          ) : (
                            <div key={i} className="flex items-center gap-3 px-2 py-2">
                              <div className="w-10 h-10 flex-shrink-0 rounded-lg flex items-center justify-center border border-[#E8E4DE]" style={{ background: "#F5F3EF" }}>
                                <Home className="w-4 h-4" style={{ color: "#9B9690" }} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium truncate" style={{ color: "#1A1A1A" }}>Sag "{item.address}" oprettet</p>
                                <p className="text-[11px] mt-0.5" style={{ color: "#9B9690" }}>{timeAgo(item.createdAt)}</p>
                              </div>
                            </div>
                          )
                        ))}
                      </div>
                    )}
                  </div>

                </div>
              </div>

              {/* Dine mest brugte valg — fuld bredde under begge kolonner */}
              <div className="rounded-2xl p-6 border border-[#E8E4DE] mt-4" style={{ background: "#F5F3EF" }} data-testid="bolig-most-used">
                <h2 className="text-xs font-bold tracking-[0.1em] uppercase mb-5" style={{ color: "#9B9690" }}>Dine standardvalg</h2>
                {!mostUsed ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="space-y-3">
                        <div className="h-2.5 w-12 rounded-full bg-[#E8E4DE] animate-pulse" />
                        {[0, 1, 2].map((j) => (
                          <div key={j} className="space-y-1.5">
                            <div className="h-2 w-20 rounded-full bg-[#E8E4DE] animate-pulse" />
                            <div className="flex gap-0.5">{Array.from({ length: 10 }).map((_, s) => <div key={s} className="h-1.5 flex-1 rounded-full bg-[#E8E4DE] animate-pulse" />)}</div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                ) : mostUsed.styles.length === 0 && mostUsed.rooms.length === 0 && mostUsed.tiers.length === 0 ? (
                  <p className="text-sm" style={{ color: "#9B9690" }}>Generer dit første billede for at se statistik her.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    {[
                      { title: "Stil", items: mostUsed.styles, labelFn: (k: string) => BOLIG_STYLE_LABELS[k] ?? k },
                      { title: "Rum", items: mostUsed.rooms, labelFn: (k: string) => BOLIG_ROOM_LABELS[k] ?? k },
                      { title: "Budget", items: mostUsed.tiers, labelFn: (k: string) => k.replace("tier", "T") },
                    ].map((col) => {
                      const max = col.items[0]?.count ?? 1;
                      return (
                        <div key={col.title}>
                          <p className="text-[11px] font-bold tracking-[0.06em] uppercase mb-3" style={{ color: "#9B9690" }}>{col.title}</p>
                          <div className="space-y-2.5">
                            {col.items.map((item) => (
                              <div key={item.key}>
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs truncate" style={{ color: "#1A1A1A" }}>{col.labelFn(item.key)}</span>
                                  <span className="text-xs font-semibold ml-2 flex-shrink-0" style={{ color: "#9B9690" }}>{item.count}</span>
                                </div>
                                <div className="flex gap-0.5">
                                  {Array.from({ length: 10 }).map((_, seg) => (
                                    <div key={seg} className="h-1.5 flex-1 rounded-full" style={{ background: seg < Math.round((item.count / max) * 10) ? "#C8956C" : "#D9D5CF" }} />
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* ── Generation flows: kept mounted so in-progress & completed generations
                survive switching functions. Only the active one is visible. ── */}
          <div className={section === "ai-design-agent" ? "" : "hidden"} aria-hidden={section !== "ai-design-agent"}>
            <PaywallPage allowFreeTrial>
              <AIDesignAgentFlow onBack={() => setSection("dashboard")} cases={cases} />
            </PaywallPage>
          </div>

          <div className={section === "3d-plantegning" ? "" : "hidden"} aria-hidden={section !== "3d-plantegning"}>
            <PaywallPage>
              <Floorplan3DFlow cases={cases} />
            </PaywallPage>
          </div>

          <div className={section === "transformering-video" ? "" : "hidden"} aria-hidden={section !== "transformering-video"}>
            <PaywallPage>
              <TransformVideoFlow cases={cases} />
            </PaywallPage>
          </div>

          {/* AI boligfremvisning section — owner only */}
          {section === "ai-boligfremvisning" && isOwner && (
            <motion.div key="ai-boligfremvisning-view" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
              <PropertyTourFlow />
            </motion.div>
          )}

          <div className={section === "upload" ? "" : "hidden"} aria-hidden={section !== "upload"}>
            <UploadFlow onBack={() => setSection("dashboard")} />
          </div>

          <div className={`-mx-6 md:-mx-8 ${section === "showcase-video" ? "" : "hidden"}`} aria-hidden={section !== "showcase-video"}>
            <PaywallPage>
              <ShowcaseVideoFlow cases={cases} />
            </PaywallPage>
          </div>

          {section === "historik" && (
            <HistoryView
              cases={cases}
              onOpenCase={(id) => openCase(id)}
              showToast={showToast}
            />
          )}

          {/* Alle Sager */}
          {section === "sager" && (
            <motion.div key="sager-view" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h1 className="text-2xl font-bold" style={{ color: "#0F1D2F", letterSpacing: "-0.02em" }}>Alle sager</h1>
                  <p className="text-sm mt-1" style={{ color: "#6B6B6B" }}>{filteredCases.length} sag{filteredCases.length !== 1 ? "er" : ""} i alt</p>
                </div>
                <button onClick={() => setModal("newSag")} className="inline-flex items-center gap-2 h-10 px-5 rounded-full font-semibold text-sm text-white" style={{ background: "#C8956C" }} data-testid="bolig-sager-new">
                  <Plus className="w-4 h-4" /> Ny sag
                </button>
              </div>

              {casesLoading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="rounded-xl overflow-hidden border border-[#E8E4DE] animate-pulse bg-white">
                      <div className="h-40 bg-[#E8E4DE]" />
                      <div className="p-4 space-y-2">
                        <div className="h-3 bg-[#E8E4DE] rounded w-3/4" />
                        <div className="h-2.5 bg-[#E8E4DE] rounded w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  {/* Aktive */}
                  <div className="mb-8">
                    <h3 className="text-xs font-bold tracking-[0.1em] uppercase mb-3" style={{ color: "#9B9690" }}>
                      Aktive — {filteredCases.filter((c) => c.status === "active").length}
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                      {filteredCases.filter((c) => c.status === "active").map((c) => {
                        const days = liveDaysFromISO(c.marketDateISO, now);
                        return (
                          <div key={c.id} onClick={() => openCase(c.id)} className="rounded-xl overflow-hidden border border-[#E8E4DE] cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md bg-white" data-testid={`bolig-case-card-${c.id}`}>
                            <div className="relative h-40">
                              <CaseThumb src={c.latestImageUrl} alt={c.address} className="w-full h-full object-cover" />
                              <span className="absolute top-2 right-2 text-[11px] font-medium text-white px-2 py-0.5 rounded-full" style={{ background: "rgba(0,0,0,0.55)" }}>{c.imageCount} {c.imageCount === 1 ? "visualisering" : "visualiseringer"}</span>
                            </div>
                            <div className="p-4">
                              <h3 className="text-sm font-semibold truncate mb-0.5" style={{ color: "#1A1A1A" }}>{c.address}</h3>
                              <p className="text-xs mb-2" style={{ color: days > 14 ? "#C8956C" : "#6B6B6B" }}>{days} dage på markedet</p>
                              <span className="inline-block text-[11px] font-semibold px-2.5 py-0.5 rounded-full" style={{ background: "rgba(45,106,79,0.1)", color: "#2D6A4F" }}>Aktiv</span>
                            </div>
                          </div>
                        );
                      })}
                      <PaywallAction allowFreeTrial>
                        <button onClick={() => setModal("newSag")} className="rounded-xl border-2 border-dashed flex flex-col items-center justify-center min-h-[200px] gap-2 transition-all hover:border-[#C8956C] hover:bg-[rgba(200,149,108,0.04)] w-full h-full" style={{ borderColor: "#D9D5CF" }} data-testid="bolig-sager-add">
                          <Plus className="w-6 h-6" style={{ color: "#C8956C" }} />
                          <span className="text-xs font-medium" style={{ color: "#C8956C" }}>Opret ny sag</span>
                        </button>
                      </PaywallAction>
                    </div>
                  </div>

                  {/* Solgte */}
                  {filteredCases.filter((c) => c.status === "sold").length > 0 && (
                    <div>
                      <h3 className="text-xs font-bold tracking-[0.1em] uppercase mb-3" style={{ color: "#9B9690" }}>
                        Solgte — {filteredCases.filter((c) => c.status === "sold").length}
                      </h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                        {filteredCases.filter((c) => c.status === "sold").map((c) => (
                          <div key={c.id} onClick={() => openCase(c.id)} className="rounded-xl overflow-hidden border border-[#E8E4DE] cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md bg-white opacity-80 hover:opacity-100" data-testid={`bolig-sold-card-${c.id}`}>
                            <div className="relative h-40">
                              <CaseThumb src={c.latestImageUrl} alt={c.address} className="w-full h-full object-cover grayscale-[25%]" />
                              <span className="absolute top-2 right-2 text-[11px] font-medium text-white px-2 py-0.5 rounded-full" style={{ background: "rgba(45,106,79,0.75)" }}>Solgt</span>
                            </div>
                            <div className="p-4">
                              <h3 className="text-sm font-semibold truncate mb-0.5" style={{ color: "#1A1A1A" }}>{c.address}</h3>
                              <p className="text-xs mb-2" style={{ color: "#9B9690" }}>{c.soldDateISO ? `Solgt ${c.soldDateISO}` : "Solgt"}</p>
                              <span className="inline-block text-[11px] font-semibold px-2.5 py-0.5 rounded-full" style={{ background: "rgba(45,106,79,0.1)", color: "#2D6A4F" }}>Solgt</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </motion.div>
          )}

          {/* Sag Detail */}
          {section === "sag-detail" && selectedCaseId !== null && (() => {
            const c = cases.find((x) => x.id === selectedCaseId)
              ?? (pendingCase?.id === selectedCaseId ? pendingCase : null);
            return c ? (
              <CaseDetailPanel
                caseData={c}
                onBack={closeCase}
                onDeleted={() => {
                  showToast("Sag slettet");
                  closeCase();
                }}
                onStatusChanged={(newStatus) => {
                  if (newStatus === "sold") {
                    showToast("Sag markeret som solgt");
                    closeCase();
                  } else {
                    showToast("Sag genaktiveret");
                  }
                }}
              />
            ) : (
              <div className="flex flex-col items-center justify-center py-24">
                <div className="relative w-10 h-10 mb-4">
                  <div className="absolute inset-0 rounded-full border-4 border-[#F0EDE7]" />
                  <div className="absolute inset-0 rounded-full border-4 border-[#C8956C] border-t-transparent animate-spin" />
                </div>
                <p className="text-sm" style={{ color: "#6B6B6B" }}>Indlæser sag...</p>
              </div>
            );
          })()}

          {/* Solgte Sager — dedikeret sektion */}
          {section === "solgte" && (
            <motion.div key="solgte-view" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
              <div className="mb-8 flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold" style={{ color: "#0F1D2F", letterSpacing: "-0.02em" }}>Solgte sager</h1>
                  <p className="text-sm mt-1" style={{ color: "#6B6B6B" }}>Alle afsluttede handler med AI-visuals.</p>
                </div>
                <span className="text-sm font-semibold px-3 py-1 rounded-full" style={{ background: "rgba(45,106,79,0.1)", color: "#2D6A4F" }}>{soldCount} solgt</span>
              </div>
              {casesLoading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="rounded-xl overflow-hidden border border-[#E8E4DE] animate-pulse" style={{ background: "#F5F3EF" }}>
                      <div className="h-40 bg-[#E8E4DE]" />
                      <div className="p-4 space-y-2"><div className="h-3 bg-[#E8E4DE] rounded w-3/4" /><div className="h-2.5 bg-[#E8E4DE] rounded w-1/2" /></div>
                    </div>
                  ))}
                </div>
              ) : soldCount === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5" style={{ background: "#F0EDE7" }}>
                    <PackageCheck className="w-7 h-7" style={{ color: "#C8956C" }} />
                  </div>
                  <h2 className="text-lg font-bold mb-2" style={{ color: "#0F1D2F" }}>Ingen solgte sager endnu</h2>
                  <p className="text-sm" style={{ color: "#6B6B6B" }}>Marker en aktiv sag som solgt for at se den her.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {cases.filter((c) => c.status === "sold").map((c) => (
                    <div key={c.id} onClick={() => openCase(c.id)} className="rounded-xl overflow-hidden border border-[#E8E4DE] cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md bg-white" data-testid={`bolig-solgt-card-${c.id}`}>
                      <div className="relative h-40">
                        <CaseThumb src={c.latestImageUrl} alt={c.address} className="w-full h-full object-cover grayscale-[20%]" />
                        <span className="absolute top-2 right-2 text-[11px] font-medium text-white px-2 py-0.5 rounded-full" style={{ background: "rgba(45,106,79,0.75)" }}>Solgt</span>
                      </div>
                      <div className="p-4">
                        <h3 className="text-sm font-semibold truncate mb-0.5" style={{ color: "#1A1A1A" }}>{c.address}</h3>
                        <p className="text-xs mb-2" style={{ color: "#9B9690" }}>{c.soldDateISO ? `Solgt ${c.soldDateISO}` : "Solgt"}</p>
                        <div className="flex items-center justify-between">
                          <span className="inline-block text-[11px] font-semibold px-2.5 py-0.5 rounded-full" style={{ background: "rgba(45,106,79,0.1)", color: "#2D6A4F" }}>Solgt</span>
                          <span className="text-[11px]" style={{ color: "#9B9690" }}>{c.imageCount} {c.imageCount === 1 ? "visualisering" : "visualiseringer"}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* Team section */}
          {section === "team" && (
            <TeamView user={user} />
          )}

          {/* CRM — both admins */}
          {section === "crm" && isAdmin && (
            <motion.div key="crm-view" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="h-full flex flex-col overflow-hidden">
              <CrmView isOwner={isAdmin} />
            </motion.div>
          )}

          {/* Settings view */}
          {section === "indstillinger" && (
            <SettingsView user={user} displayName={displayName} isAdmin={isAdmin} showToast={showToast} />
          )}

          {section === "pris" && (
            <motion.div key="pris-view" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
              <div className="mb-8">
                <h2 className="text-2xl font-bold mb-2" style={{ color: "#0F1D2F" }}>Pris</h2>
                <p className="text-sm" style={{ color: "#6B6B6B" }}>Vælg den plan der passer til dit behov.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5" data-testid="settings-pricing-grid">
                {[
                  {
                    name: "Start",
                    price: "2.999",
                    period: "kr./ måned",
                    desc: "Til dig der vil i gang med professionelle AI-visualiseringer.",
                    features: ["10 AI Visualiseringer / md.", "2 3D Plantegninger / md.", "2 Transformering Videoer / md.", "1 Bolig Showcase / md.", "HD 1080p · JPG + PNG", "Logo branding (til/fra)", "Standard support"],
                    cta: "Vælg Start",
                    highlight: false,
                    custom: false,
                  },
                  {
                    name: "Pro",
                    price: "5.999",
                    period: "kr./ måned",
                    desc: "Til aktive mæglere med løbende behov for professionelle visualiseringer.",
                    features: ["25 AI Visualiseringer / md.", "5 3D Plantegninger / md.", "5 Transformering Videoer / md.", "3 Bolig Showcase / md.", "4K · JPG + PNG + PDF", "Fuld branding-kontrol", "Prioriteret support"],
                    cta: "Vælg Pro",
                    highlight: true,
                    custom: false,
                  },
                  {
                    name: "Business",
                    price: "11.999",
                    period: "kr./ måned",
                    desc: "Til bureauer og mæglerkæder med høj volumen.",
                    features: ["60 AI Visualiseringer / md.", "12 3D Plantegninger / md.", "12 Transformering Videoer / md.", "8 Bolig Showcase / md.", "4K · JPG + PNG + PDF", "Fuld branding-kontrol", "Dedikeret support"],
                    cta: "Vælg Business",
                    highlight: false,
                    custom: false,
                  },
                ].map((plan) => (
                  <div
                    key={plan.name}
                    className="p-7 rounded-2xl border flex flex-col relative"
                    style={{
                      background: plan.highlight ? "#0F1D2F" : "#FFFFFF",
                      borderColor: plan.highlight ? "#0F1D2F" : "#E5E2DC",
                    }}
                    data-testid={`settings-pricing-${plan.name.toLowerCase()}`}
                  >
                    {plan.highlight && (
                      <div className="text-[10px] font-bold mb-3 px-2.5 py-1 rounded-full self-start tracking-wider" style={{ background: "#C8956C", color: "#fff" }}>
                        MEST POPULÆR
                      </div>
                    )}
                    <div className="font-bold text-base mb-1" style={{ color: plan.highlight ? "#C8956C" : "#6B6B6B" }}>{plan.name}</div>
                    <div className="flex items-end gap-1 mb-3">
                      <span className="text-4xl font-bold" style={{ color: plan.highlight ? "#fff" : "#0F1D2F" }}>{plan.price}</span>
                      <span className="text-sm mb-1" style={{ color: plan.highlight ? "rgba(255,255,255,0.6)" : "#6B6B6B" }}>
                        {plan.custom ? plan.period : `kr.${plan.period.replace(/^kr\./, "")}`}
                      </span>
                    </div>
                    <p className="text-sm mb-6 leading-relaxed" style={{ color: plan.highlight ? "rgba(255,255,255,0.7)" : "#6B6B6B" }}>{plan.desc}</p>
                    <ul className="space-y-2.5 mb-7 flex-1">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-center gap-2 text-sm" style={{ color: plan.highlight ? "#fff" : "#0F1D2F" }}>
                          <Check className="w-4 h-4 flex-shrink-0" style={{ color: "#C8956C" }} />
                          {f}
                        </li>
                      ))}
                    </ul>
                    <button
                      onClick={() => {
                        if (plan.custom) {
                          window.location.href = "mailto:kontakt@formaestates.com?subject=Enterprise%20plan%20foresp%C3%B8rgsel";
                        } else {
                          startPlanCheckout(plan.name);
                        }
                      }}
                      disabled={planCheckoutLoading === plan.name}
                      className="w-full h-11 rounded-full font-semibold text-sm transition-all hover:opacity-90 hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-wait"
                      style={{
                        background: plan.highlight ? "#C8956C" : "#0F1D2F",
                        color: "#fff",
                      }}
                      data-testid={`settings-pricing-cta-${plan.name.toLowerCase()}`}
                    >
                      {planCheckoutLoading === plan.name ? "Åbner Stripe…" : plan.cta}
                    </button>
                  </div>
                ))}
              </div>

              {/* Bridge → Enterprise */}
              <div className="relative mt-12 mb-8 flex items-center gap-4">
                <div className="flex-1 h-px" style={{ background: "#E5E2DC" }} />
                <div className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold uppercase tracking-widest whitespace-nowrap"
                  style={{ border: "1px solid #E5E2DC", background: "#F8F6F3", color: "#6B6B6B" }}>
                  Enterprise — byg din plan
                </div>
                <div className="flex-1 h-px" style={{ background: "#E5E2DC" }} />
              </div>
              <EnterpriseCalculator />
            </motion.div>
          )}

          {section === "fakturering" && (
            <motion.div key="fakturering-view" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
              <div className="mb-8">
                <h2 className="text-2xl font-bold mb-1" style={{ color: "#0F1D2F" }}>Fakturering</h2>
                <p className="text-sm" style={{ color: "#6B6B6B" }}>Oversigt over dit abonnement og betalingshistorik.</p>
              </div>

              {billingOverviewLoading ? (
                <div className="flex items-center gap-3 py-16 text-sm" style={{ color: "#6B6B6B" }}>
                  <div className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                  Henter faktureringsdata…
                </div>
              ) : (
                <>
                  {/* ── Abonnements-kort ── */}
                  {(billingOverview?.subscription || subscriptionStatus === "active") && (
                    <div className="rounded-2xl border mb-6 overflow-hidden" style={{ borderColor: "#E5E2DC", background: "#FFFFFF" }} data-testid="billing-current-plan">
                      <div className="px-6 py-5 border-b" style={{ borderColor: "#E5E2DC", background: "#F8F6F1" }}>
                        <div className="flex items-center justify-between flex-wrap gap-3">
                          <div>
                            <p className="text-xs font-semibold tracking-wider uppercase mb-1" style={{ color: "#C8956C" }}>Nuværende abonnement</p>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="text-xl font-bold" style={{ color: "#0F1D2F" }}>
                                {billingOverview?.subscription?.tierName
                                  ?? (subscriptionTier && ({ start: "Start Plan", pro: "Pro Plan", business: "Business Plan", custom: "Tilpasset pakke" } as Record<string, string>)[subscriptionTier])
                                  ?? "Aktiv plan"}
                              </h3>
                              <span
                                className="px-2 py-0.5 rounded-full text-xs font-semibold"
                                style={{
                                  background: billingOverview?.subscription?.cancelAtPeriodEnd ? "#FEF3C7" : "#DCFCE7",
                                  color: billingOverview?.subscription?.cancelAtPeriodEnd ? "#92400E" : "#166534",
                                }}
                              >
                                {billingOverview?.subscription?.cancelAtPeriodEnd ? "Opsiges" : "Aktiv ✓"}
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={() => setSection("pris")}
                            className="px-4 py-2 rounded-full text-sm font-semibold hover:opacity-90 transition-opacity"
                            style={{ background: "#0F1D2F", color: "#fff" }}
                            data-testid="billing-upgrade-button"
                          >
                            Skift plan
                          </button>
                        </div>
                      </div>

                      <div className="px-6 py-5">
                        {billingOverview?.subscription ? (
                          <>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4 mb-5">
                              {billingOverview.subscription.startDate && (
                                <div>
                                  <p className="text-xs mb-1" style={{ color: "#6B6B6B" }}>Startdato</p>
                                  <p className="text-sm font-semibold" style={{ color: "#0F1D2F" }}>
                                    {new Date(billingOverview.subscription.startDate).toLocaleDateString("da-DK", { day: "numeric", month: "long", year: "numeric" })}
                                  </p>
                                </div>
                              )}
                              {billingOverview.subscription.nextBillingDate && !billingOverview.subscription.cancelAtPeriodEnd && (
                                <div>
                                  <p className="text-xs mb-1" style={{ color: "#6B6B6B" }}>Næste betaling</p>
                                  <p className="text-sm font-semibold" style={{ color: "#0F1D2F" }}>
                                    {new Date(billingOverview.subscription.nextBillingDate).toLocaleDateString("da-DK", { day: "numeric", month: "long", year: "numeric" })}
                                  </p>
                                </div>
                              )}
                              {billingOverview.subscription.cancelAtPeriodEnd && billingOverview.subscription.nextBillingDate && (
                                <div>
                                  <p className="text-xs mb-1" style={{ color: "#92400E" }}>Adgang til og med</p>
                                  <p className="text-sm font-semibold" style={{ color: "#92400E" }}>
                                    {new Date(billingOverview.subscription.nextBillingDate).toLocaleDateString("da-DK", { day: "numeric", month: "long", year: "numeric" })}
                                  </p>
                                </div>
                              )}
                              {billingOverview.subscription.amount != null && (
                                <div>
                                  <p className="text-xs mb-1" style={{ color: "#6B6B6B" }}>Månedligt beløb</p>
                                  <p className="text-sm font-semibold" style={{ color: "#0F1D2F" }}>
                                    {billingOverview.subscription.amount.toLocaleString("da-DK")} kr. inkl. moms
                                  </p>
                                </div>
                              )}
                              {billingOverview.subscription.nextBillingDate && (
                                <div>
                                  <p className="text-xs mb-1" style={{ color: "#6B6B6B" }}>Betalingsdag</p>
                                  <p className="text-sm font-semibold" style={{ color: "#0F1D2F" }}>
                                    {new Date(billingOverview.subscription.nextBillingDate).getDate()}. hver måned
                                  </p>
                                </div>
                              )}
                            </div>

                            {/* Abonnementsstyring: pause / genoptag / opsig / genaktiver */}
                            {billingOverview.subscription.stripeSubscriptionId && (
                              <div className="pt-4 border-t flex flex-col gap-3" style={{ borderColor: "#E5E2DC" }}>

                                {/* Pauset tilstand */}
                                {billingOverview.subscription.paused && (
                                  <div className="flex items-center justify-between flex-wrap gap-3">
                                    <p className="text-sm" style={{ color: "#92400E" }}>⏸ Abonnement på pause — ingen opkrævning indtil du genoptager.</p>
                                    <button
                                      onClick={() => resumeSubscriptionMutation.mutate(billingOverview.subscription!.stripeSubscriptionId!)}
                                      disabled={resumeSubscriptionMutation.isPending}
                                      className="px-4 py-2 rounded-full text-sm font-semibold disabled:opacity-60 hover:opacity-90 transition-opacity"
                                      style={{ background: "#166534", color: "#fff" }}
                                      data-testid="billing-resume-button"
                                    >
                                      {resumeSubscriptionMutation.isPending ? "Genoptager…" : "Genoptag abonnement"}
                                    </button>
                                  </div>
                                )}

                                {/* Opsagt tilstand — vis genaktiver */}
                                {billingOverview.subscription.cancelAtPeriodEnd && (
                                  <div className="flex items-center justify-between flex-wrap gap-3">
                                    <p className="text-sm" style={{ color: "#92400E" }}>
                                      ⚠ Opsiges den{" "}
                                      <span className="font-semibold">
                                        {billingOverview.subscription.nextBillingDate
                                          ? new Date(billingOverview.subscription.nextBillingDate).toLocaleDateString("da-DK", { day: "numeric", month: "long", year: "numeric" })
                                          : "—"}
                                      </span>
                                    </p>
                                    <button
                                      onClick={() => reactivateSubscriptionMutation.mutate(billingOverview.subscription!.stripeSubscriptionId!)}
                                      disabled={reactivateSubscriptionMutation.isPending}
                                      className="px-4 py-2 rounded-full text-sm font-semibold disabled:opacity-60 hover:opacity-90 transition-opacity"
                                      style={{ background: "#0F1D2F", color: "#fff" }}
                                      data-testid="billing-reactivate-button"
                                    >
                                      {reactivateSubscriptionMutation.isPending ? "Genaktiverer…" : "Fortryd opsigelse"}
                                    </button>
                                  </div>
                                )}

                                {/* Aktiv tilstand — vis pause + opsig */}
                                {!billingOverview.subscription.paused && !billingOverview.subscription.cancelAtPeriodEnd && (
                                  <div className="flex items-center gap-4 flex-wrap">
                                    {!cancelConfirming ? (
                                      <>
                                        <button
                                          onClick={() => pauseSubscriptionMutation.mutate(billingOverview.subscription!.stripeSubscriptionId!)}
                                          disabled={pauseSubscriptionMutation.isPending}
                                          className="text-sm underline underline-offset-2 hover:opacity-70 transition-opacity disabled:opacity-40"
                                          style={{ color: "#6B6B6B" }}
                                          data-testid="billing-pause-button"
                                        >
                                          {pauseSubscriptionMutation.isPending ? "Sætter på pause…" : "Sæt på pause"}
                                        </button>
                                        <span style={{ color: "#D1CEC9" }}>|</span>
                                        <button
                                          onClick={() => setCancelConfirming(true)}
                                          className="text-sm underline underline-offset-2 hover:opacity-70 transition-opacity"
                                          style={{ color: "#DC2626" }}
                                          data-testid="billing-cancel-button"
                                        >
                                          Opsig abonnement
                                        </button>
                                      </>
                                    ) : (
                                      <div className="flex items-start gap-4 flex-wrap">
                                        <p className="text-sm" style={{ color: "#0F1D2F" }}>
                                          Er du sikker? Du bevarer adgang til{" "}
                                          <span className="font-semibold">
                                            {billingOverview.subscription.nextBillingDate
                                              ? new Date(billingOverview.subscription.nextBillingDate).toLocaleDateString("da-DK", { day: "numeric", month: "long", year: "numeric" })
                                              : "udløbsdatoen"}
                                          </span>.
                                        </p>
                                        <div className="flex items-center gap-2">
                                          <button
                                            onClick={() => cancelSubscriptionMutation.mutate(billingOverview.subscription!.stripeSubscriptionId!)}
                                            disabled={cancelSubscriptionMutation.isPending}
                                            className="px-3 py-1.5 rounded-full text-xs font-semibold disabled:opacity-60 transition-opacity hover:opacity-80"
                                            style={{ background: "#DC2626", color: "#fff" }}
                                            data-testid="billing-cancel-confirm"
                                          >
                                            {cancelSubscriptionMutation.isPending ? "Opsiger…" : "Opsig alligevel"}
                                          </button>
                                          <button
                                            onClick={() => setCancelConfirming(false)}
                                            className="px-3 py-1.5 rounded-full text-xs font-semibold hover:opacity-80 transition-opacity"
                                            style={{ background: "#F0EDE8", color: "#0F1D2F" }}
                                          >
                                            Fortryd
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="py-6 text-center">
                            <p className="text-sm mb-3" style={{ color: "#6B6B6B" }}>
                              Dit abonnement administreres manuelt eller er endnu ikke tilknyttet et betalingssystem.
                            </p>
                            <p className="text-xs" style={{ color: "#9CA3AF" }}>
                              Kontakt os på <span className="font-semibold">kontakt@formaestates.com</span> for at opsige eller ændre dit abonnement.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {subscriptionStatus !== "active" && !billingOverviewLoading && (
                    <div className="rounded-2xl border p-8 mb-6 text-center" style={{ borderColor: "#E5E2DC", background: "#F8F6F1" }}>
                      <p className="text-sm mb-4" style={{ color: "#6B6B6B" }}>Du har ikke et aktivt abonnement.</p>
                      <button
                        onClick={() => setSection("pris")}
                        className="px-5 py-2 rounded-full text-sm font-semibold hover:opacity-90 transition-opacity"
                        style={{ background: "#C8956C", color: "#fff" }}
                      >
                        Se abonnementer
                      </button>
                    </div>
                  )}

                  {/* ── Betalingshistorik ── */}
                  <div>
                    <h3 className="text-lg font-bold mb-4" style={{ color: "#0F1D2F" }}>Betalingshistorik</h3>
                    {!billingOverview?.invoices?.length ? (
                      <div className="rounded-2xl border p-8 text-center" style={{ background: "#F8F6F1", borderColor: "#E5E2DC" }} data-testid="billing-history-empty">
                        <p className="text-sm" style={{ color: "#6B6B6B" }}>Ingen betalinger registreret endnu.</p>
                      </div>
                    ) : (
                      <div className="rounded-2xl border overflow-hidden" style={{ background: "#FFFFFF", borderColor: "#E5E2DC" }}>
                        {/* Tabeloverskrift — kun desktop */}
                        <div className="hidden md:grid gap-4 px-5 py-3 border-b text-[11px] font-semibold tracking-widest uppercase" style={{ gridTemplateColumns: "1fr 130px 110px 140px 130px", borderColor: "#E5E2DC", color: "#6B6B6B", background: "#F8F6F1" }}>
                          <span>Beskrivelse</span>
                          <span className="text-right">Ekskl. moms</span>
                          <span className="text-right">Moms 25%</span>
                          <span className="text-right">I alt inkl. moms</span>
                          <span className="text-right">Kvittering</span>
                        </div>
                        {billingOverview.invoices.map((inv) => (
                          <div key={inv.invoiceNumber} className="border-b last:border-b-0 px-5 py-4" style={{ borderColor: "#E5E2DC" }} data-testid={`billing-invoice-${inv.invoiceNumber}`}>
                            <div className="flex items-center gap-4 flex-wrap md:flex-nowrap">
                              {/* Beskrivelse */}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold" style={{ color: "#0F1D2F" }}>{inv.description}</p>
                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                  <span className="text-xs" style={{ color: "#6B6B6B" }}>
                                    {new Date(inv.date).toLocaleDateString("da-DK", { day: "numeric", month: "long", year: "numeric" })}
                                  </span>
                                  <span className="text-xs" style={{ color: "#D1CFC9" }}>·</span>
                                  <span className="text-xs font-mono" style={{ color: "#6B6B6B" }}>{inv.invoiceNumber}</span>
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: "#DCFCE7", color: "#166534" }}>BETALT</span>
                                </div>
                              </div>
                              {/* Beløbskolonner — desktop */}
                              <div className="hidden md:contents text-sm text-right">
                                <span className="w-[130px] shrink-0" style={{ color: "#0F1D2F" }}>
                                  {inv.amountExclVat.toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr.
                                </span>
                                <span className="w-[110px] shrink-0" style={{ color: "#0F1D2F" }}>
                                  {inv.vatAmount.toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr.
                                </span>
                                <span className="w-[140px] shrink-0 font-bold" style={{ color: "#0F1D2F" }}>
                                  {inv.amountTotal.toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr.
                                </span>
                              </div>
                              {/* Beløb — mobil */}
                              <span className="md:hidden text-sm font-bold" style={{ color: "#0F1D2F" }}>
                                {inv.amountTotal.toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr.
                              </span>
                              {/* Se kvittering */}
                              <button
                                onClick={() => setInvoiceModal(inv)}
                                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold hover:opacity-80 transition-opacity"
                                style={{ background: "#F0EDE8", color: "#0F1D2F" }}
                                data-testid={`billing-receipt-${inv.invoiceNumber}`}
                              >
                                <FileText className="w-3.5 h-3.5" /> Se kvittering
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </motion.div>
          )}
        </main>
      </div>

      {/* ── INVOICE MODAL ── */}
      {invoiceModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.55)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setInvoiceModal(null); }}
        >
          <div className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden" style={{ background: "#FFFFFF", maxHeight: "92vh", overflowY: "auto" }}>
            {/* ── Invoice header ── */}
            <div className="flex items-start justify-between px-7 pt-7 pb-5">
              <div>
                <p className="text-base font-bold tracking-tight" style={{ color: "#0F1D2F", letterSpacing: "-0.02em" }}>FORMA ESTATES</p>
                <p className="text-xs mt-0.5" style={{ color: "#6B6B6B" }}>kontakt@formaestates.com</p>
                <p className="text-xs" style={{ color: "#6B6B6B" }}>formaestates.com</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold tracking-widest uppercase mb-1" style={{ color: "#C8956C" }}>FAKTURA</p>
                <p className="text-sm font-bold" style={{ color: "#0F1D2F" }}>{invoiceModal.invoiceNumber}</p>
                <p className="text-xs mt-0.5" style={{ color: "#6B6B6B" }}>
                  Fakturadato: {new Date(invoiceModal.date).toLocaleDateString("da-DK", { day: "numeric", month: "long", year: "numeric" })}
                </p>
                <p className="text-xs" style={{ color: "#6B6B6B" }}>
                  Forfaldsdato: {new Date(invoiceModal.date).toLocaleDateString("da-DK", { day: "numeric", month: "long", year: "numeric" })}
                </p>
              </div>
            </div>

            <div className="px-7">
              {/* ── Fra / Til ── */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 py-4 border-t border-b" style={{ borderColor: "#E5E2DC" }}>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "#6B6B6B" }}>Fra</p>
                  <p className="text-sm font-semibold" style={{ color: "#0F1D2F" }}>Forma Estates ApS</p>
                  <p className="text-xs mt-0.5" style={{ color: "#6B6B6B" }}>CVR: 46551796</p>
                  <p className="text-xs break-all" style={{ color: "#6B6B6B" }}>kontakt@formaestates.com</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "#6B6B6B" }}>Til</p>
                  <p className="text-sm font-semibold" style={{ color: "#0F1D2F" }}>
                    {billingOverview?.customer?.name ?? billingOverview?.customer?.email ?? "Kunde"}
                  </p>
                  {billingOverview?.customer?.name && (
                    <p className="text-xs mt-0.5" style={{ color: "#6B6B6B" }}>{billingOverview.customer.email}</p>
                  )}
                </div>
              </div>

              {/* ── Linjepost ── */}
              <div className="mt-5 mb-5">
                <div className="grid grid-cols-[1fr_auto] gap-4 pb-2 border-b text-[10px] font-semibold uppercase tracking-widest" style={{ borderColor: "#E5E2DC", color: "#6B6B6B" }}>
                  <span>Ydelse</span>
                  <span className="text-right">Beløb ekskl. moms</span>
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-4 py-3 border-b text-sm" style={{ borderColor: "#E5E2DC" }}>
                  <div>
                    <p className="font-medium" style={{ color: "#0F1D2F" }}>{invoiceModal.description}</p>
                    <p className="text-xs mt-0.5 capitalize" style={{ color: "#6B6B6B" }}>{invoiceModal.period}</p>
                  </div>
                  <span className="font-medium text-right" style={{ color: "#0F1D2F" }}>
                    {invoiceModal.amountExclVat.toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr.
                  </span>
                </div>
              </div>

              {/* ── Totaler ── */}
              <div className="space-y-2 mb-5">
                <div className="flex justify-between text-sm" style={{ color: "#6B6B6B" }}>
                  <span>Subtotal ekskl. moms</span>
                  <span>{invoiceModal.amountExclVat.toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr.</span>
                </div>
                <div className="flex justify-between text-sm" style={{ color: "#6B6B6B" }}>
                  <span>Moms ({invoiceModal.vatRate}%)</span>
                  <span>{invoiceModal.vatAmount.toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr.</span>
                </div>
                <div className="flex justify-between text-base font-bold pt-3 border-t" style={{ borderColor: "#E5E2DC", color: "#0F1D2F" }}>
                  <span>I alt inkl. moms</span>
                  <span>{invoiceModal.amountTotal.toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr.</span>
                </div>
              </div>

              {/* ── Betalt-stempel ── */}
              <div className="rounded-xl px-4 py-3 mb-6 flex items-center gap-2" style={{ background: "#DCFCE7" }}>
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: "#166534" }} />
                <p className="text-sm font-semibold" style={{ color: "#166534" }}>
                  Betalt den {new Date(invoiceModal.date).toLocaleDateString("da-DK", { day: "numeric", month: "long", year: "numeric" })}
                </p>
              </div>
            </div>

            {/* ── Handlinger ── */}
            <div className="flex items-center justify-between gap-3 px-7 pb-7 flex-wrap">
              {invoiceModal.stripeInvoiceUrl ? (
                <a
                  href={invoiceModal.stripeInvoiceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold hover:opacity-90 transition-opacity"
                  style={{ background: "#0F1D2F", color: "#fff" }}
                  data-testid="invoice-download-pdf"
                >
                  <Download className="w-4 h-4" /> Download PDF
                </a>
              ) : (
                <span className="text-xs" style={{ color: "#6B6B6B" }}>
                  PDF-faktura genereres af Stripe ved næste fornyelses-betaling
                </span>
              )}
              <button
                onClick={() => setInvoiceModal(null)}
                className="px-4 py-2 rounded-full text-sm font-semibold hover:opacity-80 transition-opacity"
                style={{ background: "#F0EDE8", color: "#0F1D2F" }}
                data-testid="invoice-modal-close"
              >
                Luk
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODALS ── */}
      <AnimatePresence>
        {modal === "newSag" && (
          <NewSagModal
            onClose={() => setModal(null)}
            onCreated={handleNewCase}
            isPending={createCaseMutation.isPending}
          />
        )}
      </AnimatePresence>

      {/* ── ACTIVITY LIGHTBOX ── */}
      <AnimatePresence>
        {activityLightbox && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.85)" }}
            onClick={() => setActivityLightbox(null)}
            data-testid="dashboard-activity-lightbox"
          >
            {activityLightbox.beforeSrc && !isVideoUrl(activityLightbox.src) ? (
              <div className="w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
                <BeforeAfterSlider beforeSrc={activityLightbox.beforeSrc} afterSrc={activityLightbox.src} />
              </div>
            ) : (
              <img
                src={activityLightbox.src}
                alt="Genereret billede"
                className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              />
            )}
            <button
              onClick={() => setActivityLightbox(null)}
              className="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.15)" }}
              data-testid="dashboard-activity-lightbox-close"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── TOAST ── */}
      <AnimatePresence>
        {toast && <Toast message={toast} onDone={() => setToast(null)} />}
      </AnimatePresence>
    </div>
  );
}
