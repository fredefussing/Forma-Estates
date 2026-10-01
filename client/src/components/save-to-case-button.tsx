import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, LoaderCircle, Save } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";

export interface SaveToCase {
  id: number;
  address: string;
  status: string;
}

export interface SaveToCaseButtonProps {
  cases: SaveToCase[];
  mediaUrl: string;
  originalUrl?: string | null;
  generatedImageId?: number | null;
  assignedCaseId?: number | null;
  promptText?: string;
  roomType?: string;
  style?: string;
  budgetTier?: string;
  isDesignAgent?: boolean;
  onSaved?: (caseId: number) => void;
  testIdPrefix?: string;
  className?: string;
}

interface SaveToCaseButtonState {
  mediaUrl: string;
  generatedImageId: number | null;
  assignedCaseId: number | null;
  version: number;
  selectedCaseId: string;
  savedCaseId: number | null;
  savedCaseIds: number[];
  persistedImageId: number | null;
  isSaving: boolean;
  error: string;
}

export function SaveToCaseButton({
  cases,
  mediaUrl,
  originalUrl,
  generatedImageId,
  assignedCaseId,
  promptText,
  roomType = "other",
  style = "ai-agent",
  budgetTier = "tier2",
  isDesignAgent = true,
  onSaved,
  testIdPrefix = "save-to-case",
  className = "",
}: SaveToCaseButtonProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const identity = {
    mediaUrl,
    generatedImageId: generatedImageId ?? null,
    assignedCaseId: assignedCaseId ?? null,
  };
  const identityVersion = useRef(0);
  const lastIdentity = useRef(identity);
  const [state, setState] = useState<SaveToCaseButtonState>(() => ({
    ...identity,
    version: 0,
    selectedCaseId: "",
    savedCaseId: identity.assignedCaseId,
    savedCaseIds: identity.assignedCaseId == null ? [] : [identity.assignedCaseId],
    persistedImageId: identity.generatedImageId,
    isSaving: false,
    error: "",
  }));
  const submitting = useRef<number | null>(null);

  // Reset image-specific UI state during the render for the new result. A
  // version also ensures that a previous result's in-flight request is stale.
  if (
    lastIdentity.current.mediaUrl !== identity.mediaUrl ||
    lastIdentity.current.generatedImageId !== identity.generatedImageId ||
    lastIdentity.current.assignedCaseId !== identity.assignedCaseId
  ) {
    const version = identityVersion.current + 1;
    identityVersion.current = version;
    lastIdentity.current = identity;
    setState({
      ...identity,
      version,
      selectedCaseId: "",
      savedCaseId: identity.assignedCaseId,
      savedCaseIds: identity.assignedCaseId == null ? [] : [identity.assignedCaseId],
      persistedImageId: identity.generatedImageId,
      isSaving: false,
      error: "",
    });
  }

  if (cases.length === 0) return null;

  const saveToCase = async () => {
    const requestVersion = identityVersion.current;
    const caseId = Number(state.selectedCaseId);
    if (submitting.current === requestVersion || !state.selectedCaseId || !Number.isFinite(caseId) || state.savedCaseIds.includes(caseId)) return;
    const imageId = state.persistedImageId;
    const previousSavedCaseId = state.savedCaseId;
    submitting.current = requestVersion;
    setState((current) =>
      current.version === requestVersion ? { ...current, isSaving: true, error: "" } : current,
    );

    try {
      if (!user) throw new Error("Not authenticated");
      const token = await user.getIdToken();
      // An unassigned generated row can be attached once. Further saves are
      // copies in other cases, not moves that remove it from the first case.
      const movingPersistedImage =
        imageId != null &&
        previousSavedCaseId === null &&
        identity.assignedCaseId === null;
      const response = await fetch(
        movingPersistedImage
          ? `/api/bolig/generated-images/${imageId}/case`
          : `/api/bolig/cases/${caseId}/images`,
        {
          method: movingPersistedImage ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(
            movingPersistedImage
              ? { caseId }
              : {
                  imageUrl: mediaUrl,
                  originalImageUrl: originalUrl ?? null,
                  roomType,
                  style,
                  budgetTier,
                  promptText: promptText ?? null,
                  isDesignAgent,
                },
          ),
        },
      );

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(detail);
      }

      const result: { id?: number | string } | null = await response.json().catch(() => null);
      const newlyPersistedId = result?.id;
      queryClient.invalidateQueries({ queryKey: ["/api/bolig/cases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bolig/cases", caseId, "images"] });
      if (previousSavedCaseId != null && previousSavedCaseId !== caseId) {
        queryClient.invalidateQueries({ queryKey: ["/api/bolig/cases", previousSavedCaseId, "images"] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/bolig/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bolig/activity"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bolig/recent-images"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bolig/quota"] });
      window.dispatchEvent(new Event("quota:refresh"));
      if (identityVersion.current === requestVersion) {
        setState((current) =>
          current.version === requestVersion
            ? {
                ...current,
                savedCaseId: caseId,
                savedCaseIds: [...current.savedCaseIds, caseId],
                persistedImageId:
                  !movingPersistedImage &&
                  newlyPersistedId != null &&
                  Number.isFinite(Number(newlyPersistedId))
                    ? Number(newlyPersistedId)
                    : current.persistedImageId,
              }
            : current,
        );
        onSaved?.(caseId);
      }
    } catch (error) {
      if (identityVersion.current === requestVersion) {
        setState((current) =>
          current.version === requestVersion
            ? {
                ...current,
                error: error instanceof Error && error.message
                  ? `${t("dashboard.agentX.kunneIkkeGemmeTilSag")} (${error.message})`
                  : t("dashboard.agentX.kunneIkkeGemmeTilSag"),
              }
            : current,
        );
      }
    } finally {
      if (submitting.current === requestVersion) submitting.current = null;
      if (identityVersion.current === requestVersion) {
        setState((current) =>
          current.version === requestVersion ? { ...current, isSaving: false } : current,
        );
      }
    }
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`.trim()}>
      <label className="sr-only" htmlFor={`${testIdPrefix}-case-select`}>
        {t("dashboard.caseView.vaelgSag")}
      </label>
      <select
        id={`${testIdPrefix}-case-select`}
        value={state.selectedCaseId}
        onChange={(event) => {
          setState((current) => ({
            ...current,
            selectedCaseId: event.target.value,
            error: "",
          }));
        }}
        disabled={state.isSaving}
        className="h-10 min-w-0 max-w-full rounded-full border border-[#D9D5CF] bg-white px-3 text-sm text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#C8956C]"
        data-testid={`${testIdPrefix}-case-select`}
      >
        <option value="">{t("dashboard.caseView.vaelgSag")}</option>
        {cases.map((caseItem) => (
          <option key={caseItem.id} value={caseItem.id}>
            {caseItem.address}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={saveToCase}
        disabled={!state.selectedCaseId || state.isSaving || state.savedCaseIds.includes(Number(state.selectedCaseId))}
        aria-busy={state.isSaving}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-[#D9D5CF] bg-white px-4 text-sm font-semibold text-[#1A1A1A] transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
        data-testid={`${testIdPrefix}-button`}
      >
        {state.isSaving ? (
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : state.savedCaseIds.includes(Number(state.selectedCaseId)) && state.selectedCaseId ? (
          <Check className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Save className="h-4 w-4" aria-hidden="true" />
        )}
        {state.savedCaseIds.includes(Number(state.selectedCaseId)) && state.selectedCaseId
          ? t("dashboard.agentX.gemtTilSag")
          : t("dashboard.agentX.gemTilSag")}
      </button>
      {state.error && (
        <p
          className="basis-full text-sm text-red-700"
          role="alert"
          data-testid={`${testIdPrefix}-error`}
        >
          {state.error}
        </p>
      )}
    </div>
  );
}

export default SaveToCaseButton;