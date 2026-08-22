import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { RendyVoiceoverEditor } from "@/components/rendy-voiceover-editor";
import { RendyHeadlineEditor } from "@/components/rendy-headline-editor";
import {
  Check,
  Film,
  Loader2,
  Minus,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  X,
} from "lucide-react";
import {
  DEFAULT_HEADLINE_SETTINGS,
  type HeadlineSettings,
} from "@shared/rendy-text";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Candidate {
  id: string;
  sourceVideoId: string;
  sourceUrl: string;
  duration: number;
  safeStart: number;
  safeEnd: number;
  width: number;
  height: number;
  qualityScore: number;
  thumbnailUrl?: string;
}

interface Shot {
  id: string;
  label: string;
  duration: number;
  selectedCandidateId: string;
  candidates: Candidate[];
}

interface Manifest {
  shots: Shot[];
  sourceMembership: Record<string, string[]>;
}

interface TimelineItem {
  shotId: string;
  candidateId: string;
}

interface EditProject {
  id: string;
  listingId: string;
  sourceVideoId: string;
  status:
    "preparing" | "draft" | "analyzing" | "rendering" | "ready" | "failed";
  manifest: Manifest | null;
  timeline: TimelineItem[];
  headline?: HeadlineSettings;
  outputUrl?: string;
  /** Clean assembled Edit export (no headline burned in). Used as the headline
   *  preview base in the ready state so the preview is never contaminated by a
   *  previously burned-in headline. Falls back to sourceVideoUrl when absent. */
  cleanOutputUrl?: string;
  error?: string;
}

interface SourceGroup {
  id: string;
  label: string;
  isSoundSource: boolean;
  entries: Array<{ shot: Shot; candidate: Candidate }>;
}

interface Props {
  listingId: string;
  sourceVideoId: string;
  /** URL of the clean Rendy source delivery — used for HeadlineEditor preview
   *  so the preview is never contaminated by previously burned headline text. */
  sourceVideoUrl: string;
  onOutputReady: (url: string) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDuration(seconds: number): string {
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m === 0) return `${rem}s`;
  return `${m}:${String(rem).padStart(2, "0")}`;
}

function totalDuration(items: TimelineItem[], shots: Shot[]): number {
  const shotMap = new Map(shots.map((sh) => [sh.id, sh]));
  return items.reduce((acc, item) => {
    const shot = shotMap.get(item.shotId);
    if (!shot) return acc;
    const cand = shot.candidates.find((c) => c.id === item.candidateId);
    return acc + (cand ? cand.duration : shot.duration);
  }, 0);
}

function ClipThumbnail({
  candidate,
  className,
}: {
  candidate?: Candidate | null;
  className: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const aspectRatio =
    candidate && candidate.width > 0 && candidate.height > 0
      ? `${candidate.width} / ${candidate.height}`
      : undefined;
  const at = candidate
    ? Math.max(
        candidate.safeStart,
        candidate.safeStart + (candidate.safeEnd - candidate.safeStart) / 2,
      )
    : 0;

  useEffect(() => {
    setImageFailed(false);
  }, [candidate?.id, candidate?.thumbnailUrl]);

  if (!candidate) {
    return <div className={`${className} bg-[#EDE8E3]`} aria-hidden="true" />;
  }

  // Existing manifests can contain the legacy 320×180 center-cropped asset.
  // New v2 thumbnails preserve the complete frame; old projects fall back to
  // the source video so portrait rooms are never silently cropped.
  const thumbnailPreservesFullFrame =
    candidate.thumbnailUrl?.includes("rendy-edit-thumb-v2-") ||
    !candidate.thumbnailUrl?.includes("rendy-edit-thumb-");

  if (candidate.thumbnailUrl && thumbnailPreservesFullFrame && !imageFailed) {
    return (
      <img
        src={candidate.thumbnailUrl}
        alt=""
        className={`${className} object-contain bg-[#EDE8E3]`}
        style={aspectRatio ? { aspectRatio } : undefined}
        onError={() => setImageFailed(true)}
      />
    );
  }

  return (
    <video
      src={`${candidate.sourceUrl}#t=${at.toFixed(3)}`}
      muted
      playsInline
      preload="metadata"
      tabIndex={-1}
      aria-hidden="true"
      className={`${className} pointer-events-none object-contain bg-[#EDE8E3]`}
      style={aspectRatio ? { aspectRatio } : undefined}
      onLoadedMetadata={(event) => {
        const video = event.currentTarget;
        if (Number.isFinite(at) && Math.abs(video.currentTime - at) > 0.05) {
          video.currentTime = at;
        }
      }}
    />
  );
}

function groupLibraryBySource(
  manifest: Manifest | null | undefined,
  selectedSourceVideoId: string,
): SourceGroup[] {
  if (!manifest) return [];
  const sourceIds = Array.from(
    new Set([
      ...Object.keys(manifest.sourceMembership ?? {}),
      ...manifest.shots.flatMap((shot) =>
        shot.candidates.map((candidate) => candidate.sourceVideoId),
      ),
    ]),
  );
  return sourceIds
    .map((sourceId, index) => {
      const knownShotIds = manifest.sourceMembership?.[sourceId];
      const sourceShots = knownShotIds
        ? knownShotIds
            .map((shotId) => manifest.shots.find((shot) => shot.id === shotId))
            .filter((shot): shot is Shot => !!shot)
        : manifest.shots;
      return {
        id: sourceId,
        label: `Video ${index + 1}`,
        isSoundSource: sourceId === selectedSourceVideoId,
        entries: sourceShots.flatMap((shot) => {
          const candidate = shot.candidates.find(
            (entry) => entry.sourceVideoId === sourceId,
          );
          return candidate ? [{ shot, candidate }] : [];
        }),
      };
    })
    .filter((group) => group.entries.length > 0);
}

const POLLING_STATUSES: EditProject["status"][] = [
  "preparing",
  "analyzing",
  "rendering",
];

// ── Component ─────────────────────────────────────────────────────────────────

export function RendyVideoEditor({
  listingId,
  sourceVideoId,
  sourceVideoUrl,
  onOutputReady,
}: Props) {
  const { user } = useAuth();

  const [open, setOpen] = useState(false);
  const [project, setProject] = useState<EditProject | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [pendingOutputUrl, setPendingOutputUrl] = useState<string | null>(null);
  const [voiceoverBusy, setVoiceoverBusy] = useState(false);
  // Headline state — always reset to proj.headline ?? DEFAULT on every project load/poll
  const [headline, setHeadline] = useState<HeadlineSettings>(
    DEFAULT_HEADLINE_SETTINGS,
  );

  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);

  // ── Apply project helper — always syncs headline to proj value or DEFAULT ──
  const applyProject = useCallback((proj: EditProject) => {
    const isReady = proj.status === "ready" && !!proj.outputUrl;
    setProject(proj);
    setTimeline(proj.timeline ?? []);
    setPendingOutputUrl(isReady ? proj.outputUrl! : null);
    // A ready edit mounts the voice-over workspace. Keep finish disabled until
    // it has checked whether an earlier voice job is still in flight.
    setVoiceoverBusy(isReady);
    // Always reset — prevents stale local edits surviving across render cycles
    setHeadline(proj.headline ?? DEFAULT_HEADLINE_SETTINGS);
  }, []);

  // ── Auth fetch ──────────────────────────────────────────────────────────────
  const api = useCallback(
    async (path: string, init: RequestInit = {}) => {
      const token = await user?.getIdToken();
      const headers = new Headers(init.headers);
      if (token) headers.set("Authorization", `Bearer ${token}`);
      if (!(init.body instanceof FormData)) {
        headers.set("Content-Type", "application/json");
      }
      const res = await fetch(path, { ...init, headers });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        const technical = data.error || data.message;
        if (technical) console.warn("Rendy video editor:", technical);
        throw new Error(
          data.error || data.message || "Anmodningen mislykkedes",
        );
      }
      return data;
    },
    [user],
  );

  // ── Polling ─────────────────────────────────────────────────────────────────
  const clearPoll = useCallback(() => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    pollTimer.current = null;
  }, []);

  const poll = useCallback(
    async (id: string, delay = 1500) => {
      clearPoll();
      try {
        const data = await api(`/api/bolig/rendy/edit-projects/${id}`);
        const proj: EditProject = data.project;
        applyProject(proj);
        if (POLLING_STATUSES.includes(proj.status)) {
          pollTimer.current = setTimeout(
            () => void poll(id, Math.min(delay * 1.4, 8000)),
            delay,
          );
        } else {
          pollTimer.current = null;
          setBusy(false);
        }
      } catch (err: unknown) {
        pollTimer.current = null;
        setBusy(false);
        setMessage(
          err instanceof Error ? err.message : "Fejl under opdatering",
        );
      }
    },
    [api, applyProject, clearPoll],
  );

  // ── Open: create or find existing project ──────────────────────────────────
  const openEditor = useCallback(async () => {
    setOpen(true);
    setMessage("");
    setBusy(true);
    try {
      const data = await api("/api/bolig/rendy/edit-projects", {
        method: "POST",
        body: JSON.stringify({ listingId, sourceVideoId }),
      });
      const proj: EditProject = data.project;
      applyProject(proj);
      if (POLLING_STATUSES.includes(proj.status)) {
        void poll(proj.id);
      } else {
        setBusy(false);
      }
    } catch (err: unknown) {
      setBusy(false);
      setMessage(
        err instanceof Error ? err.message : "Kunne ikke oprette projekt",
      );
    }
  }, [api, applyProject, listingId, poll, sourceVideoId]);

  // ── Effects ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) {
      clearPoll();
    }
    return () => clearPoll();
  }, [clearPoll, open]);

  useEffect(() => {
    if (
      open &&
      project &&
      POLLING_STATUSES.includes(project.status) &&
      !pollTimer.current
    ) {
      void poll(project.id);
    }
  }, [open, poll, project]);

  // ── Timeline mutations ──────────────────────────────────────────────────────
  const shots: Shot[] = project?.manifest?.shots ?? [];

  function useCandidate(shot: Shot, candidate: Candidate) {
    const existingIndex = timeline.findIndex((item) => item.shotId === shot.id);
    if (existingIndex >= 0) {
      setTimeline((previous) =>
        previous.map((item, index) =>
          index === existingIndex
            ? { ...item, candidateId: candidate.id }
            : item,
        ),
      );
      setSelectedIndex(existingIndex);
      return;
    }
    setTimeline((previous) => [
      ...previous,
      { shotId: shot.id, candidateId: candidate.id },
    ]);
    setSelectedIndex(timeline.length);
  }

  function removeItem(index: number) {
    setTimeline((previous) =>
      previous.filter((_, itemIndex) => itemIndex !== index),
    );
    setSelectedIndex((previous) => {
      if (previous == null) return null;
      if (previous === index) return null;
      return previous > index ? previous - 1 : previous;
    });
  }

  function moveItemTo(index: number, targetIndex: number) {
    if (
      targetIndex < 0 ||
      targetIndex >= timeline.length ||
      targetIndex === index
    )
      return;
    setTimeline((previous) => {
      const next = [...previous];
      const [item] = next.splice(index, 1);
      next.splice(targetIndex, 0, item);
      return next;
    });
    setSelectedIndex(targetIndex);
  }

  // ── Server actions ──────────────────────────────────────────────────────────
  const patchTimeline = useCallback(async (): Promise<EditProject | null> => {
    if (!project) return null;
    setSaving(true);
    setMessage("");
    try {
      const data = await api(`/api/bolig/rendy/edit-projects/${project.id}`, {
        method: "PATCH",
        body: JSON.stringify({ timeline, headline }),
      });
      const proj: EditProject = data.project;
      applyProject(proj);
      return proj;
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Kunne ikke gemme");
      return null;
    } finally {
      setSaving(false);
    }
  }, [api, applyProject, headline, project, timeline]);

  const startRender = useCallback(async () => {
    if (!project) return;
    clearPoll();
    setBusy(true);
    setMessage("");
    const patched = await patchTimeline();
    if (!patched) {
      setBusy(false);
      return;
    }
    const id = patched.id;
    try {
      const data = await api(`/api/bolig/rendy/edit-projects/${id}/render`, {
        method: "POST",
      });
      const proj: EditProject = data.project;
      applyProject(proj);
      void poll(proj.id);
    } catch (err: unknown) {
      setBusy(false);
      setMessage(err instanceof Error ? err.message : "Rendering mislykkedes");
    }
  }, [api, applyProject, clearPoll, patchTimeline, poll, project]);

  // ── Direct ready-state headline apply ──────────────────────────────────────
  // Ready headline-only changes must NOT rebuild the timeline. This POSTs just
  // the headline to a dedicated endpoint that re-burns text onto the existing
  // clean Edit export, producing a new immutable output URL.
  const applyHeadline = useCallback(async () => {
    if (!project) return;
    clearPoll();
    setBusy(true);
    setMessage("");
    try {
      const data = await api(
        `/api/bolig/rendy/edit-projects/${project.id}/apply-headline`,
        {
          method: "POST",
          body: JSON.stringify({ headline }),
        },
      );
      const proj: EditProject = data.project;
      applyProject(proj);
      if (POLLING_STATUSES.includes(proj.status)) {
        void poll(proj.id);
      } else {
        setBusy(false);
      }
    } catch (err: unknown) {
      setBusy(false);
      setMessage(
        err instanceof Error ? err.message : "Kunne ikke anvende overskrift",
      );
    }
  }, [api, applyProject, clearPoll, headline, poll, project]);

  const retry = useCallback(async () => {
    if (!project) return;
    clearPoll();
    setBusy(true);
    setMessage("");
    try {
      const data = await api(
        `/api/bolig/rendy/edit-projects/${project.id}/retry`,
        {
          method: "POST",
        },
      );
      const proj: EditProject = data.project;
      applyProject(proj);
      void poll(proj.id);
    } catch (err: unknown) {
      setBusy(false);
      setMessage(err instanceof Error ? err.message : "Prøv igen mislykkedes");
    }
  }, [api, applyProject, clearPoll, poll, project]);

  // Reopen draft editing from a finished/failed project (patches headline too)
  const editTimeline = useCallback(async () => {
    if (!project) return;
    setMessage("");
    await patchTimeline();
  }, [patchTimeline, project]);

  const finishEditing = useCallback(() => {
    if (!pendingOutputUrl) return;
    clearPoll();
    onOutputReady(pendingOutputUrl);
    setOpen(false);
  }, [clearPoll, onOutputReady, pendingOutputUrl]);

  useEffect(() => {
    if (!open) {
      openerRef.current?.focus();
      return;
    }
    const dialog = dialogRef.current;
    const first = dialog?.querySelector<HTMLElement>(
      "button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea:not([disabled]), video[controls]",
    );
    first?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      const openDialogs = Array.from(
        document.querySelectorAll<HTMLElement>(
          '[role="dialog"][aria-modal="true"]',
        ),
      );
      if (openDialogs.at(-1) !== dialog) return;
      if (event.key === "Escape") {
        event.preventDefault();
        clearPoll();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        "button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea:not([disabled]), video[controls], [tabindex]:not([tabindex='-1'])",
      ));
      if (!focusable.length) return;
      const current = document.activeElement;
      const index = focusable.indexOf(current as HTMLElement);
      if (event.shiftKey && (index <= 0 || index === -1)) {
        event.preventDefault();
        focusable[focusable.length - 1].focus();
      } else if (!event.shiftKey && index === focusable.length - 1) {
        event.preventDefault();
        focusable[0].focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [clearPoll, open]);

  const status = project?.status;
  const sourceGroups = groupLibraryBySource(project?.manifest, sourceVideoId);
  const readyOutputUrl = pendingOutputUrl ?? project?.outputUrl;

  // ── Render ──────────────────────────────────────────────────────────────────
  if (!open) {
    return (
      <div className="mt-2">
        <button
          type="button"
          onClick={openEditor}
          ref={openerRef}
          className="w-full h-9 rounded-xl text-xs font-semibold border border-[#C8956C] text-[#6F4E38] bg-[#FFFDFC] inline-flex items-center justify-center gap-1.5 transition-[transform,background-color,box-shadow] hover:-translate-y-px hover:bg-[#FFF6EF] hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-[#C8956C]/40"
          data-testid="button-open-video-editor"
        >
          <Film className="w-3.5 h-3.5" />
          Redigér video
        </button>
      </div>
    );
  }

  const totalSec = totalDuration(timeline, shots);
  const previewIndex =
    selectedIndex != null &&
    selectedIndex >= 0 &&
    selectedIndex < timeline.length
      ? selectedIndex
      : 0;
  const previewItem = timeline[previewIndex];
  const previewShot = previewItem
    ? shots.find((shot) => shot.id === previewItem.shotId)
    : null;
  const previewCandidate = previewItem
    ? previewShot?.candidates.find(
        (candidate) => candidate.id === previewItem.candidateId,
      )
    : null;

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-[#152536]/[.94] p-2 sm:p-6" role="presentation">
      <section
        className="mx-auto min-h-[calc(100dvh-1rem)] max-w-7xl rounded-[22px] border border-[#E9DED2] bg-[#F6F1EA] p-4 shadow-2xl space-y-4 sm:min-h-[calc(100dvh-3rem)] sm:rounded-[28px] sm:p-6"
        aria-label="Videoredigering"
        aria-labelledby="rendy-video-editor-heading"
        aria-modal="true"
        role="dialog"
        ref={dialogRef}
        tabIndex={-1}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#A36F4E]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#C8956C]" />
              Forma videostudie
            </div>
            <h3 id="rendy-video-editor-heading" className="text-xl font-semibold tracking-tight text-[#0F1D2F] sm:text-2xl">
              Redigér video
            </h3>
              <p className="max-w-xl text-[11px] leading-relaxed text-[#6C6964]">
               Byg videoen i den rækkefølge, den skal ses. Musikken fra den
               oprindelige video fortsætter hele vejen.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              clearPoll();
              setOpen(false);
            }}
            aria-label="Luk"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#DCC9B9] bg-[#FFFDFC] text-[#0F1D2F] transition-[transform,background-color] hover:scale-105 hover:bg-[#F0E7DD] focus:outline-none focus:ring-2 focus:ring-[#C8956C]/40"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {shots.length > 0 && (
          <div className="border-y border-[#E4D8CC] py-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#A36F4E]">
                  Din rækkefølge
                </p>
                <p className="text-[10px] leading-relaxed text-[#77736D]">
                  Fra venstre mod højre er præcis den rækkefølge, dine klip
                  afspilles i.
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-[#F4EEE8] px-2.5 py-1 text-[10px] font-semibold text-[#855F45]">
                {timeline.length} klip
              </span>
            </div>
            <div
              className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2"
              aria-label="Videoens rækkefølge"
            >
              {timeline.map((item, index) => {
                const shot = shots.find((entry) => entry.id === item.shotId);
                const candidate = shot?.candidates.find(
                  (entry) => entry.id === item.candidateId,
                );
                return (
                  <button
                    key={`${item.shotId}-context-${index}`}
                    type="button"
                    onClick={() => setSelectedIndex(index)}
                    aria-label={`Åbn klip ${index + 1}: ${shot?.label ?? "Klip"}`}
                    className={`relative w-32 shrink-0 snap-start overflow-hidden rounded-xl border text-left transition-[transform,border-color,box-shadow] hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[#C8956C]/40 ${
                      previewIndex === index
                        ? "border-[#B87852] bg-[#FFF9F4] shadow-[0_7px_18px_rgba(114,71,43,.16)]"
                        : "border-[#E1DAD2] bg-[#FFFDFC] hover:border-[#C8956C]"
                    }`}
                  >
                    <div className="flex h-24 items-center justify-center bg-[#EDE8E3]">
                      <ClipThumbnail
                        candidate={candidate}
                        className="mx-auto h-24 w-auto max-w-full"
                      />
                    </div>
                    <span className="absolute left-2 top-2 grid h-7 min-w-7 place-items-center rounded-md bg-[#0F1D2F]/90 px-1.5 font-mono text-[10px] font-semibold text-white">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="block truncate px-2 py-1.5 text-[10px] font-semibold text-[#4D4943]">
                      {shot?.label ?? "Klip"}
                    </span>
                  </button>
                );
              })}
              {timeline.length === 0 && (
                <span className="rounded-xl border border-dashed border-[#DCC9B9] px-4 py-5 text-xs text-[#77736D]">
                  Brug plus-knapperne under hver video for at begynde.
                </span>
              )}
            </div>
          </div>
        )}

        {/* Loading / preparing */}
        {busy &&
          (!status || status === "preparing" || status === "analyzing") && (
            <div
              className="rounded-lg bg-[#F4EEE8] p-3 text-xs text-[#4D4943] flex items-center gap-2"
              role="status"
              aria-live="polite"
            >
              <Loader2 className="w-4 h-4 animate-spin" />
              {!status || status === "preparing"
                ? "Forbereder projekt…"
                : "Analyserer video…"}
            </div>
          )}

        {/* Rendering */}
        {status === "rendering" && (
          <div
            className="rounded-lg bg-[#F4EEE8] p-3 text-xs text-[#4D4943] flex items-center gap-2"
            role="status"
            aria-live="polite"
          >
            <Loader2 className="w-4 h-4 animate-spin" />
            Genererer video…
          </div>
        )}

        {/* Failed */}
        {status === "failed" && (
          <div className="space-y-2">
            {project?.error ? (
              <p className="text-[11px] text-[#A34D43]" role="alert">
                {project.error}
              </p>
            ) : (
              <p className="text-[11px] text-[#A34D43]" role="alert">
                Generering mislykkedes.
              </p>
            )}
            <button
              type="button"
              onClick={retry}
              disabled={busy}
              className="h-8 px-3 rounded-lg border border-[#DCC9B9] text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <RotateCcw className="w-3 h-3" />
              Prøv igen
            </button>
            {shots.length > 0 && (
              <button
                type="button"
                onClick={editTimeline}
                disabled={saving || busy}
                className="ml-2 h-8 px-3 rounded-lg border border-[#DCC9B9] text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                data-testid="button-edit-failed-timeline"
              >
                <Pencil className="w-3 h-3" />
                Tilpas tidslinje
              </button>
            )}
          </div>
        )}

        {/* Ready — show output, voiceover, AND headline editor.
            HeadlineEditor.onApply = startRender so user can add/change/remove
            headline by building a new immutable video from the clean source. */}
        {status === "ready" && project?.outputUrl && (
          <>
          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-3">
              <div
                className="flex items-center gap-2 text-xs font-semibold text-[#385B49]"
                role="status"
                aria-live="polite"
              >
                <Check className="w-4 h-4" />
                Video klar
              </div>
              <div className="flex min-h-48 items-center justify-center rounded-2xl bg-[#0A1422] p-3 sm:min-h-56 sm:p-4">
                <video
                  id={`rendy-edited-video-${project.id}`}
                  src={readyOutputUrl}
                  controls
                  playsInline
                  className="mx-auto max-h-[30vh] w-auto max-w-[420px] rounded-xl bg-black object-contain"
                  data-testid="video-edit-final"
                />
              </div>
              <p className="text-center text-[10px] text-[#77736D]">
                Afspilleren er gjort kompakt, så redigeringsværktøjerne altid er
                synlige.
              </p>
            </div>
            <aside className="space-y-3 rounded-2xl border border-[#E1DAD2] bg-white p-4 shadow-sm">
              <div className="rounded-xl bg-[#EAF2ED] px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#385B49]">
                  Sammenhængende lyd
                </p>
                <p className="mt-1 text-[11px] text-[#4D5E54]">
                  Musikken kommer fra den oprindelige video og følger resultatet.
                </p>
              </div>
              <RendyVoiceoverEditor
                sourceVideoUrl={project.outputUrl}
                sourceVideoId={`edit:${project.id}`}
                listingId={listingId}
                videoElementId={`rendy-edited-video-${project.id}`}
                onOutputReady={setPendingOutputUrl}
                onBusyChange={setVoiceoverBusy}
                preloadProject
              />
              <RendyHeadlineEditor
                sourceVideoUrl={project.cleanOutputUrl ?? sourceVideoUrl}
                value={headline}
                onChange={setHeadline}
                onApply={applyHeadline}
                applyBusy={busy}
              />
              <button
                type="button"
                onClick={editTimeline}
                disabled={saving || busy}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-[#C8956C] text-xs font-semibold text-[#855F45]"
                data-testid="button-edit-video-again"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Redigér klip og rækkefølge
              </button>
            </aside>
          </div>
          <button
            type="button"
            onClick={finishEditing}
            disabled={busy || voiceoverBusy || !readyOutputUrl}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0F1D2F] px-4 text-sm font-semibold text-white shadow-md transition-colors hover:bg-[#1A3048] focus:outline-none focus:ring-2 focus:ring-[#C8956C]/50 disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="button-save-and-finish-video"
          >
            <Check className="h-4 w-4" />
            Gem og afslut
          </button>
          </>
        )}

        {/* Draft / editing UI — a focused visual workspace for clip decisions. */}
        {(status === "draft" || (!status && !busy)) && shots.length > 0 && (
          <div className="space-y-5">
            <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
              <main className="min-w-0 space-y-5">
                <div className="overflow-hidden rounded-2xl bg-[#0A1422] shadow-lg">
                  <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 text-white">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#D9AF8D]">
                        Aktivt klip
                      </p>
                      <p className="mt-0.5 text-sm font-semibold">
                        {previewShot
                          ? `${String(previewIndex + 1).padStart(2, "0")} · ${previewShot.label}`
                          : "Vælg et klip i tidslinjen"}
                      </p>
                    </div>
                    {previewCandidate && (
                      <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] text-white/75">
                        {fmtDuration(previewCandidate.duration)}
                      </span>
                    )}
                  </div>
                  {previewCandidate ? (
                    <video
                      key={previewCandidate.id}
                      src={`${previewCandidate.sourceUrl}#t=${previewCandidate.safeStart.toFixed(3)},${previewCandidate.safeEnd.toFixed(3)}`}
                      controls
                      playsInline
                      muted
                      className="mx-auto max-h-[52vh] w-full bg-black object-contain"
                      data-testid="video-active-clip-preview"
                    />
                  ) : (
                    <div className="grid min-h-56 place-items-center px-6 text-center text-sm text-white/60">
                      Tilsæt et klip fra biblioteket for at se det her.
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-[#E1DAD2] bg-white p-3 shadow-sm sm:p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-[#0F1D2F]">
                        Din tidslinje
                      </h4>
                      <p className="text-[11px] leading-relaxed text-[#77736D]">
                        Tryk på et klip for at se det. Brug bibliotekets plus og
                        minus til at vælge dine klip.
                      </p>
                    </div>
                    <span className="rounded-full bg-[#F4EEE8] px-2.5 py-1 text-[10px] font-semibold text-[#855F45]">
                      {timeline.length} klip · {fmtDuration(totalSec)}
                    </span>
                  </div>

                  {timeline.length === 0 && (
                    <p className="rounded-xl border border-dashed border-[#DCC9B9] px-4 py-8 text-center text-xs text-[#77736D]">
                      Tilsæt klip fra biblioteket for at begynde.
                    </p>
                  )}

                  <ol
                    className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-2"
                    aria-label="Klip i videoens rækkefølge"
                  >
                    {timeline.map((item, index) => {
                      const shot = shots.find(
                        (candidateShot) => candidateShot.id === item.shotId,
                      );
                      if (!shot) return null;
                      const candidate = shot.candidates.find(
                        (entry) => entry.id === item.candidateId,
                      );
                      const isSelected = previewIndex === index;
                      const sourceGroup = sourceGroups.find(
                        (group) => group.id === candidate?.sourceVideoId,
                      );

                      return (
                        <li
                          key={`${item.shotId}-${index}`}
                          aria-current={isSelected ? "step" : undefined}
                          onClick={() => setSelectedIndex(index)}
                           onKeyDown={(event) => {
                             if ((event.target as HTMLElement).closest("select, button, input, textarea")) return;
                             if (event.key === "Enter" || event.key === " ") {
                               event.preventDefault();
                               setSelectedIndex(index);
                             }
                           }}
                           tabIndex={0}
                           aria-label={`Vælg klip ${index + 1}: ${shot.label}`}
                           className={`w-[164px] shrink-0 snap-start rounded-xl border p-2 transition-[transform,border-color,box-shadow] sm:w-[176px] ${
                            isSelected
                              ? "border-[#C8956C] bg-[#FFF9F4] shadow-sm"
                               : "border-[#E1DAD2] bg-[#FFFDFC] hover:-translate-y-0.5 hover:border-[#C8956C]/60"
                          }`}
                        >
                          <div className="space-y-2">
                                <div className="flex h-28 items-center justify-center rounded-lg bg-[#EDE8E3]">
                              <ClipThumbnail
                                candidate={candidate}
                                className="mx-auto h-28 w-auto max-w-full rounded-lg"
                              />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#A36F4E]">
                                    Plads {String(index + 1).padStart(2, "0")}
                                  </p>
                                  <p className="mt-0.5 truncate text-sm font-semibold text-[#0F1D2F]">
                                    {shot.label}
                                  </p>
                                  <p className="text-[11px] text-[#77736D]">
                                    {candidate
                                      ? fmtDuration(candidate.duration)
                                      : "Ukendt længde"}
                                    {sourceGroup
                                      ? ` · ${sourceGroup.label}`
                                      : ""}
                                  </p>
                                </div>
                                {isSelected && (
                                  <span className="shrink-0 rounded-full bg-[#E7C6A9] px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-[#855F45]">
                                    Vises nu
                                  </span>
                                )}
                              </div>
                              <div className="mt-3 flex flex-wrap items-center gap-2">
                                 <label className="flex min-h-11 min-w-[130px] flex-1 items-center justify-between gap-2 rounded-xl border border-[#E1DAD2] bg-white px-3 text-[11px] font-semibold text-[#4D4943]" onClick={(event) => event.stopPropagation()}>
                                   <span>Flyt til plads</span>
                                   <select
                                     value={index}
                                     onChange={(event) => moveItemTo(index, Number(event.target.value))}
                                     aria-label={`Flyt ${shot.label} til plads`}
                                     className="min-h-9 rounded-lg border border-[#DCC9B9] bg-[#F4EEE8] px-2 font-mono text-[11px] text-[#855F45] focus:outline-none focus:ring-2 focus:ring-[#C8956C]/40"
                                   >
                                     {timeline.map((_, position) => (
                                       <option key={position} value={position}>Plads {String(position + 1).padStart(2, "0")}</option>
                                     ))}
                                   </select>
                                 </label>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    removeItem(index);
                                  }}
                                  aria-label={`Fjern ${shot.label}`}
                                   className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-[#E8D4D0] bg-[#FFFDFC] px-3.5 text-[11px] font-semibold text-[#A34D43] transition-colors hover:bg-[#FBF0EE] focus:outline-none focus:ring-2 focus:ring-[#A34D43]/30"
                                >
                                  <Minus className="h-4 w-4" />
                                  Fjern
                                </button>
                              </div>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              </main>

              <aside className="space-y-4 xl:sticky xl:top-0">
                <div className="rounded-2xl border border-[#DCC9B9] bg-[#FFFDFC] p-3 shadow-sm">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#A36F4E]">
                    Tekst på videoen
                  </p>
                  <RendyHeadlineEditor
                    sourceVideoUrl={sourceVideoUrl}
                    value={headline}
                    onChange={setHeadline}
                    onApply={startRender}
                    applyBusy={busy}
                  />
                </div>

                <div className="rounded-2xl border border-[#E1DAD2] bg-[#FFFDFC] p-3 shadow-sm">
                  <div className="mb-3">
                    <h4 className="text-sm font-semibold text-[#0F1D2F]">
                      Klipbibliotek
                    </h4>
                    <p className="text-[11px] text-[#77736D]">
                      Se motivet, før du føjer et klip til videoen.
                    </p>
                  </div>
                  <div className="space-y-4 xl:max-h-[68vh] xl:overflow-y-auto xl:pr-1">
                    {sourceGroups.map((group) => (
                      <section
                        key={group.id}
                        className={`rounded-xl border p-2.5 ${
                          group.isSoundSource
                            ? "border-[#9CB9A8] bg-[#F3F8F5]"
                            : "border-[#E1DAD2] bg-[#FAF8F5]"
                        }`}
                      >
                        <div className="mb-2.5 flex items-start justify-between gap-3 px-1">
                          <div>
                            <h5 className="text-xs font-semibold text-[#0F1D2F]">
                              {group.label}
                            </h5>
                            <p className="text-[10px] text-[#77736D]">
                              {group.entries.length} tilgængelige klip
                            </p>
                          </div>
                          {group.isSoundSource && (
                            <span className="rounded-full bg-[#DDECE2] px-2 py-1 text-[9px] font-semibold text-[#385B49]">
                              Fast musikspor
                            </span>
                          )}
                        </div>
                        <div className="flex gap-2 overflow-x-auto pb-1">
                          {group.entries.map(({ shot, candidate }) => {
                            const timelineIndex = timeline.findIndex(
                              (item) => item.shotId === shot.id,
                            );
                            const activeItem =
                              timelineIndex >= 0
                                ? timeline[timelineIndex]
                                : null;
                            const isActiveCandidate =
                              activeItem?.candidateId === candidate.id;
                            return (
                              <article
                                key={`${group.id}-${shot.id}-${candidate.id}`}
                            className={`w-[160px] shrink-0 overflow-hidden rounded-xl border bg-[#FFFDFC] transition-[transform,border-color,box-shadow] hover:-translate-y-0.5 ${
                                  isActiveCandidate
                                    ? "border-[#C8956C] ring-1 ring-[#C8956C]/20"
                                    : "border-[#E1DAD2]"
                                }`}
                              >
                                <div className="flex h-28 items-center justify-center bg-[#EDE8E3]">
                                  <ClipThumbnail
                                    candidate={candidate}
                                    className="mx-auto h-28 w-auto max-w-full"
                                  />
                                </div>
                                <div className="flex items-center gap-2.5 p-2.5">
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-[11px] font-semibold text-[#0F1D2F]">
                                      {shot.label}
                                    </p>
                                    <p className="text-[10px] text-[#77736D]">
                                      {fmtDuration(candidate.duration)}
                                      {activeItem && !isActiveCandidate
                                        ? " · anden version valgt"
                                        : ""}
                                    </p>
                                  </div>
                                  {isActiveCandidate ? (
                                    <button
                                      type="button"
                                      onClick={() => removeItem(timelineIndex)}
                                      aria-label={`Fjern ${shot.label}`}
                                       className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-[#E8D4D0] px-3 text-[10px] font-semibold text-[#A34D43]"
                                    >
                                      <Minus className="h-3.5 w-3.5" />
                                      Fjern
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        useCandidate(shot, candidate)
                                      }
                                      aria-label={`Tilsæt ${shot.label} fra ${group.label}`}
                                       className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-[#C8956C] px-3 text-[10px] font-semibold text-[#855F45]"
                                    >
                                      <Plus className="h-3.5 w-3.5" />
                                      {activeItem ? "Brug" : "Tilføj"}
                                    </button>
                                  )}
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      </section>
                    ))}
                  </div>
                </div>
              </aside>
            </div>

            <div className="sticky bottom-0 z-10 -mx-4 flex flex-col gap-2 border-t border-[#E1DAD2] bg-[#F6F1EA]/95 px-4 py-3 backdrop-blur sm:mx-0 sm:flex-row sm:rounded-xl sm:border">
              <button
                type="button"
                onClick={patchTimeline}
                disabled={saving || busy}
                className="flex-1 h-10 rounded-xl border border-[#DCC9B9] bg-[#FFFDFC] text-[#0F1D2F] text-xs font-semibold inline-flex justify-center items-center gap-1.5 transition-colors hover:bg-[#F0E7DD] disabled:opacity-50"
                data-testid="button-save-timeline"
              >
                {saving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                Gem ændringer
              </button>
              <button
                type="button"
                onClick={startRender}
                disabled={busy || saving || timeline.length === 0}
                className="flex-1 h-10 rounded-xl bg-[#17283A] text-white text-xs font-semibold inline-flex justify-center items-center gap-1.5 shadow-sm transition-[transform,background-color] hover:-translate-y-px hover:bg-[#263C52] disabled:opacity-50"
                data-testid="button-render-video"
              >
                {busy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Film className="w-3.5 h-3.5" />
                )}
                Generer video
              </button>
            </div>
          </div>
        )}

        {/* Error message */}
        {message && (
          <p
            className="text-[11px] text-[#A34D43]"
            role="alert"
            aria-live="assertive"
          >
            {message}
          </p>
        )}
      </section>
    </div>
  );
}
