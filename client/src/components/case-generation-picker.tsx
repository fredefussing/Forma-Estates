import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, Box, Check, CirclePlay, Film, Home, Image as ImageIcon, Lock, PenTool, Sparkles, Video, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useQuotaData } from "@/components/quota-widget";
import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type CaseGenerationFeature = "image" | "design-agent" | "floorplan" | "transform" | "morph" | "showcase" | "tour";

export interface CaseGenerationPickerProps {
  caseId: number;
  caseAddress: string;
  onSelect: (feature: CaseGenerationFeature) => void;
  onUpgrade: () => void;
  layout?: "panel" | "dialog";
  onClose?: () => void;
}

type QuotaKey = "ai" | "floorPlan" | "transformVideo" | "showcase";
type QuotaItem = { limit: number | null; used: number };

const TOOLS: {
  id: CaseGenerationFeature;
  quotaKey?: QuotaKey;
  titleKey: string;
  descriptionKey: string;
  icon: typeof ImageIcon;
  color: string;
  wash: string;
}[] = [
  { id: "image", quotaKey: "ai", titleKey: "aiVisual", descriptionKey: "aiVisualDescription", icon: ImageIcon, color: "#B97852", wash: "#F8EEE7" },
  { id: "design-agent", quotaKey: "ai", titleKey: "designAgent", descriptionKey: "designAgentDescription", icon: PenTool, color: "#617F78", wash: "#EAF1EE" },
  { id: "floorplan", quotaKey: "floorPlan", titleKey: "floorplan", descriptionKey: "floorplanDescription", icon: Box, color: "#64768D", wash: "#EDF0F4" },
  { id: "transform", quotaKey: "transformVideo", titleKey: "transformation", descriptionKey: "transformationDescription", icon: Film, color: "#A56F65", wash: "#F5ECEA" },
  { id: "morph", quotaKey: "transformVideo", titleKey: "morph", descriptionKey: "morphDescription", icon: CirclePlay, color: "#8E7184", wash: "#F2EDF1" },
  { id: "showcase", quotaKey: "showcase", titleKey: "showcase", descriptionKey: "showcaseDescription", icon: Film, color: "#A08756", wash: "#F4F0E5" },
  { id: "tour", titleKey: "aiShowcase", descriptionKey: "tourDescription", icon: Home, color: "#687C70", wash: "#EDF2EE" },
];

export function CaseGenerationPicker({
  caseId,
  caseAddress,
  onSelect,
  onUpgrade,
  layout = "panel",
  onClose,
}: CaseGenerationPickerProps) {
  const { t } = useTranslation();
  const { isAdmin: authAdmin, subscriptionStatus, user } = useAuth();
  const quotaData = useQuotaData();
  const canAccessTour = user?.email?.toLowerCase() === "fredefussing@gmail.com";
  const [dialogOpen, setDialogOpen] = useState(layout === "dialog");
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (quotaData) {
      setTimedOut(false);
      return;
    }
    const timer = window.setTimeout(() => setTimedOut(true), 4000);
    return () => window.clearTimeout(timer);
  }, [quotaData]);

  const admin = authAdmin || !!quotaData?.isAdmin;
  const activeSubscription = admin || subscriptionStatus === "active";
  const visibleTools = useMemo(() => TOOLS.filter((tool) => tool.id !== "tour" || canAccessTour), [canAccessTour]);

  const access = useMemo(() => {
    return visibleTools.reduce<Record<string, { allowed: boolean; remaining: number | null; locked: boolean; reason: "loading" | "unavailable" | "subscription" | "quota" | null }>>((acc, tool) => {
      if (admin || tool.id === "tour") {
        acc[tool.id] = { allowed: true, remaining: null, locked: false, reason: null };
        return acc;
      }
      if (!quotaData) {
        acc[tool.id] = {
          allowed: false,
          remaining: null,
          locked: true,
          reason: timedOut ? "unavailable" : "loading",
        };
        return acc;
      }
      const trial = !!quotaData.quota.isFreeTrial && !admin;
      const trialTool = tool.quotaKey === "ai";
      if (!activeSubscription && !(trial && trialTool)) {
        acc[tool.id] = { allowed: false, remaining: 0, locked: true, reason: "subscription" };
        return acc;
      }
      const quota = quotaData.quota[tool.quotaKey!] as QuotaItem;
      const remaining = quota.limit === null ? null : Math.max(0, quota.limit - quota.used);
      const allowed = remaining === null || quota.used < quota.limit!;
      acc[tool.id] = {
        allowed,
        remaining,
        locked: !allowed,
        reason: allowed ? null : "quota",
      };
      return acc;
    }, {});
  }, [activeSubscription, admin, quotaData, timedOut, visibleTools]);

  const closeDialog = () => {
    setDialogOpen(false);
    onClose?.();
  };

  const handleTool = (feature: CaseGenerationFeature) => {
    const state = access[feature];
    if (state?.allowed) {
      onSelect(feature);
      if (layout === "dialog") closeDialog();
      return;
    }
    if (state?.reason !== "loading") onUpgrade();
  };

  const toolCards = (mode: "shortcut" | "chooser") => (
    <div className={mode === "shortcut" ? "grid grid-cols-2 gap-2 sm:grid-cols-3" : "grid grid-cols-1 gap-2 sm:grid-cols-2"}>
      {visibleTools.map((tool) => {
        const Icon = tool.icon;
        const state = access[tool.id];
        const loading = state?.reason === "loading";
        const locked = !state?.allowed;
        const isTour = tool.id === "tour";
        const title = isTour
          ? t("dashboard.nav.aiShowcase")
          : t(`dashboard.caseGenerationPicker.${tool.titleKey}`);
        const description = isTour
          ? t("dashboard.tour.uploadEnPlantegningMarkeR")
          : t(`dashboard.caseGenerationPicker.${tool.descriptionKey}`);
        return (
          <div
            key={tool.id}
            className={`group relative min-w-0 overflow-hidden rounded-2xl border transition-all duration-200 ${isTour ? (mode === "shortcut" ? "col-span-2 sm:col-span-3" : "sm:col-span-2") : ""} ${
              locked ? "border-[#E9E4DD] bg-[#FBF9F6]" : "border-[#E9E4DD] bg-white hover:-translate-y-0.5 hover:border-[#D8C8B9] hover:shadow-[0_8px_24px_rgba(15,29,47,0.08)]"
            }`}
            data-testid={`case-tool-card-${tool.id}-${mode}`}
          >
            <button
              type="button"
              onClick={() => handleTool(tool.id)}
              disabled={loading}
              aria-label={title}
              aria-describedby={`case-tool-status-${caseId}-${tool.id}-${mode}`}
              className={`flex min-h-[112px] w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C8956C] disabled:cursor-wait ${isTour ? "min-h-[94px] flex-row items-center gap-3 p-4" : "flex-col items-start p-3.5"}`}
              data-testid={`case-tool-select-${tool.id}-${mode}`}
            >
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${isTour ? "" : "mb-3"}`} style={{ background: tool.wash, color: tool.color }}>
                {loading ? <span className="h-4 w-4 animate-pulse rounded-full bg-current opacity-40" /> : locked ? <Lock className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex w-full items-start justify-between gap-2">
                  <span className="min-w-0 whitespace-normal break-words text-[13px] font-semibold leading-snug text-[#17283A]">{title}</span>
                  {!locked && <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#A49A8E] transition-transform group-hover:translate-x-0.5" />}
                </span>
                <span className="mt-1 block line-clamp-2 text-[11px] leading-relaxed text-[#817A72]">{description}</span>
              </span>
            </button>
            <div id={`case-tool-status-${caseId}-${tool.id}-${mode}`} className="flex min-h-[30px] items-center justify-between gap-1 border-t border-[#F0ECE6] px-3 py-1.5">
              <span className={`text-[10px] font-medium ${locked ? "text-[#8F7664]" : "text-[#65786C]"}`}>
                {loading
                  ? t("dashboard.caseGenerationPicker.checking")
                  : state?.remaining === null
                      ? t(`dashboard.caseGenerationPicker.${isTour ? "ownerAccess" : "unlimited"}`)
                    : state?.allowed
                      ? t("dashboard.caseGenerationPicker.remaining", { count: state?.remaining ?? 0 })
                      : state?.reason === "subscription"
                        ? t("dashboard.caseGenerationPicker.subscriptionRequired")
                        : state?.reason === "unavailable"
                          ? t("dashboard.caseGenerationPicker.accessUnavailable")
                          : t("dashboard.caseGenerationPicker.noCredits")}
              </span>
              {locked && !loading && (
                <button
                  type="button"
                  onClick={onUpgrade}
                  className="shrink-0 rounded-md px-1.5 py-1 text-[10px] font-semibold text-[#9A6646] hover:bg-[#F8EEE7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8956C]"
                  data-testid={`case-tool-upgrade-${tool.id}-${mode}`}
                >
                  {t("dashboard.caseGenerationPicker.upgrade")}
                </button>
              )}
              {!locked && <Check className="h-3 w-3 shrink-0 text-[#688275]" aria-hidden="true" />}
            </div>
            {locked && !loading && (
              <p className="sr-only">{t(`dashboard.caseGenerationPicker.${state?.reason === "subscription" ? "subscriptionExplanation" : state?.reason === "unavailable" ? "accessUnavailableExplanation" : "quotaExplanation"}`)}</p>
            )}
          </div>
        );
      })}
    </div>
  );

  const chooser = (
    <Dialog open={dialogOpen} onOpenChange={(open) => open ? setDialogOpen(true) : closeDialog()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto rounded-[26px] border-[#E8E4DE] bg-[#FBF9F6] p-0 sm:max-w-3xl [&>button.absolute]:hidden" data-testid="case-generation-dialog">
        <div className="p-5 sm:p-7">
          <DialogClose
            aria-label={t("dashboard.caseGenerationPicker.close")}
            className="absolute right-4 top-4 z-10 rounded-full p-2 text-[#746D64] transition-colors hover:bg-[#F0ECE6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8956C]"
            data-testid="case-generation-close"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">{t("dashboard.caseGenerationPicker.close")}</span>
          </DialogClose>
          <DialogHeader className="mb-5 pr-8 text-left">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#F2E7DE] text-[#B97852]"><Sparkles className="h-4 w-4" /></span>
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#A0785D]">{t("dashboard.caseGenerationPicker.chooserEyebrow")}</span>
            </div>
            <DialogTitle className="font-serif text-2xl font-semibold tracking-tight text-[#17283A] sm:text-[28px]">
              {t("dashboard.caseGenerationPicker.chooserTitle")}
            </DialogTitle>
            <DialogDescription className="max-w-xl text-sm leading-relaxed text-[#766F67]">
              {t("dashboard.caseGenerationPicker.chooserDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="mb-4 flex items-start gap-3 rounded-2xl border border-[#E9E1D7] bg-white px-4 py-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#F4F0E9] text-[#8D755F]"><ImageIcon className="h-4 w-4" /></span>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9A8D7E]">{t("dashboard.caseGenerationPicker.linkedCase")}</p>
              <p className="mt-0.5 truncate text-sm font-semibold text-[#17283A]">{caseAddress}</p>
              <p className="mt-0.5 text-xs text-[#827A71]">{t("dashboard.caseGenerationPicker.caseSaveNotice")}</p>
            </div>
          </div>
          {toolCards("chooser")}
          <div className="mt-4 flex items-start gap-2 rounded-xl bg-[#F2EEE7] px-3.5 py-3 text-xs leading-relaxed text-[#6F685F]">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#9D7659]" />
            <span>{t("dashboard.caseGenerationPicker.lockedHelp")}</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );

  if (layout === "dialog") {
    return (
      <>
        {chooser}
      </>
    );
  }

  return (
    <section className="rounded-[24px] border border-[#E8E4DE] bg-white p-4 shadow-[0_10px_34px_rgba(15,29,47,0.045)] sm:p-5" data-testid="case-generation-picker" data-case-id={caseId}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.17em] text-[#A0785D]">
            <Sparkles className="h-3.5 w-3.5" /> {t("dashboard.caseGenerationPicker.eyebrow")}
          </p>
          <h3 className="truncate text-base font-semibold tracking-tight text-[#17283A]">{t("dashboard.caseGenerationPicker.title")}</h3>
          <p className="mt-1 truncate text-xs text-[#817A72]">{t("dashboard.caseGenerationPicker.caseContext", { address: caseAddress })}</p>
        </div>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-[#0F1D2F] px-5 text-sm font-semibold text-[#F8F5EF] shadow-[0_5px_16px_rgba(15,29,47,0.16)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8956C] focus-visible:ring-offset-2"
          data-testid="case-generation-open-chooser"
        >
          <Sparkles className="h-4 w-4 text-[#D3A47D]" />
          {t("dashboard.caseGenerationPicker.generate")}
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
      <div className="my-4 h-px bg-[#F0ECE6]" />
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-[#484B4B]">{t("dashboard.caseGenerationPicker.shortcuts")}</p>
        <p className="text-[10px] text-[#9B938A]">{t("dashboard.caseGenerationPicker.shortcutHint")}</p>
      </div>
      {toolCards("shortcut")}
      {chooser}
    </section>
  );
}

export default CaseGenerationPicker;