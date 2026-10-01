import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { auth } from "@/lib/firebase";

export interface LaunchCase {
  id: number;
  address: string;
}

export interface CaseOutput {
  imageUrl: string;
  originalImageUrl?: string | null;
  roomType?: string;
  style?: string;
  budgetTier?: string;
  promptText?: string | null;
  isDesignAgent?: boolean;
  generatedImageId?: number | null;
  language?: string;
  onSaved?: (result: CaseOutputSaveResult) => void;
}

export interface SaveNotice {
  key: string;
  address: string;
  status: "saving" | "saved" | "error";
  message?: string;
}

export interface CaseOutputSaveResult {
  saved: boolean;
  generatedImageId: number | null;
}

export function useCaseOutputAutosave() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [notices, setNotices] = useState<SaveNotice[]>([]);
  const tasks = useRef(new Map<string, () => Promise<CaseOutputSaveResult>>());
  const activeTasks = useRef(new Map<string, Promise<CaseOutputSaveResult>>());
  const done = useRef(new Map<string, number | null>());

  const executeTask = useCallback((key: string, task: () => Promise<CaseOutputSaveResult>) => {
    const active = activeTasks.current.get(key);
    if (active) return active;
    const pending = task().finally(() => activeTasks.current.delete(key));
    activeTasks.current.set(key, pending);
    return pending;
  }, []);

  const save = useCallback(async (target: LaunchCase | null | undefined, output: CaseOutput): Promise<CaseOutputSaveResult> => {
    if (!target || !output.imageUrl) return { saved: false, generatedImageId: null };
    // Take a value snapshot here; later launches cannot retarget this output.
    const capturedTarget = Object.freeze({ id: target.id, address: target.address });
    const capturedOutput = Object.freeze({ ...output });
    const key = `${capturedTarget.id}:${capturedOutput.generatedImageId ?? capturedOutput.imageUrl}`;
    if (done.current.has(key)) {
      return { saved: true, generatedImageId: done.current.get(key) ?? capturedOutput.generatedImageId ?? null };
    }
    const existingTask = tasks.current.get(key);
    if (existingTask) return executeTask(key, existingTask);

    const persist = async (): Promise<CaseOutputSaveResult> => {
      setNotices((current) => {
        const next = current.filter((notice) => notice.key !== key);
        return [...next, { key, address: capturedTarget.address, status: "saving" }];
      });
      try {
        const token = await auth.currentUser?.getIdToken();
        const generatedImageId = capturedOutput.generatedImageId;
        const response = await fetch(
          generatedImageId != null
            ? `/api/bolig/generated-images/${generatedImageId}/case`
            : `/api/bolig/cases/${capturedTarget.id}/images`,
          {
            method: generatedImageId != null ? "PATCH" : "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify(
              generatedImageId != null
                ? { caseId: capturedTarget.id }
                : {
                    imageUrl: capturedOutput.imageUrl,
                    originalImageUrl: capturedOutput.originalImageUrl ?? null,
                    roomType: capturedOutput.roomType ?? "other",
                    style: capturedOutput.style ?? "ai-agent",
                    budgetTier: capturedOutput.budgetTier ?? "tier2",
                    promptText: capturedOutput.promptText ?? null,
                    isDesignAgent: capturedOutput.isDesignAgent ?? true,
                    ...(capturedOutput.language ? { language: capturedOutput.language } : {}),
                  },
            ),
          },
        );
        if (!response.ok) {
          const detail = await response.text().catch(() => "");
          throw new Error(detail || `HTTP ${response.status}`);
        }
        const responseData = await response.json().catch(() => null) as { id?: number | string } | null;
        const responseId = responseData?.id != null && Number.isFinite(Number(responseData.id))
          ? Number(responseData.id)
          : capturedOutput.generatedImageId ?? null;
        done.current.set(key, responseId);
        tasks.current.delete(key);
        queryClient.invalidateQueries({ queryKey: ["/api/bolig/cases"] });
        queryClient.invalidateQueries({ queryKey: ["/api/bolig/cases", capturedTarget.id, "images"] });
        queryClient.invalidateQueries({ queryKey: ["/api/bolig/activity"] });
        queryClient.invalidateQueries({ queryKey: ["/api/bolig/stats"] });
        queryClient.invalidateQueries({ queryKey: ["/api/bolig/recent-images"] });
        queryClient.invalidateQueries({ queryKey: ["/api/bolig/quota"] });
        window.dispatchEvent(new Event("quota:refresh"));
        setNotices((current) => current.map((notice) =>
          notice.key === key ? { ...notice, status: "saved" } : notice,
        ));
        const result = { saved: true, generatedImageId: responseId };
        capturedOutput.onSaved?.(result);
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : t("dashboard.common.ukendtFejl");
        setNotices((current) => current.map((notice) =>
          notice.key === key ? { ...notice, status: "error", message } : notice,
        ));
        return { saved: false, generatedImageId: null };
      }
    };
    tasks.current.set(key, persist);
    return executeTask(key, persist);
  }, [executeTask, queryClient, t]);

  const retry = useCallback((key: string) => {
    const task = tasks.current.get(key);
    if (task) void executeTask(key, task);
  }, [executeTask]);

  return { save, notices, retry };
}

export function CaseOutputAutosaveNotices({
  notices,
  retry,
}: {
  notices: SaveNotice[];
  retry: (key: string) => void;
}) {
  const { t } = useTranslation();
  if (!notices.length) return null;
  return (
    <div className="mt-3 space-y-2" aria-live="polite">
      {notices.map((notice) => (
        <div
          key={notice.key}
          className={`rounded-xl border px-3 py-2 text-xs ${notice.status === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}
          role={notice.status === "error" ? "alert" : "status"}
        >
          {notice.status === "saving" && t("dashboard.caseGenerationPicker.autosaveSaving", { address: notice.address })}
          {notice.status === "saved" && t("dashboard.caseGenerationPicker.autosaveSaved", { address: notice.address })}
          {notice.status === "error" && (
            <span className="flex flex-wrap items-center justify-between gap-2">
              <span>{t("dashboard.caseGenerationPicker.autosaveError", { address: notice.address, message: notice.message })}</span>
              <button type="button" onClick={() => retry(notice.key)} className="font-bold underline">
                {t("dashboard.caseGenerationPicker.retrySave")}
              </button>
            </span>
          )}
        </div>
      ))}
    </div>
  );
}