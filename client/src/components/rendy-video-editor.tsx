import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { RendyVoiceoverEditor } from "@/components/rendy-voiceover-editor";
import { RendyHeadlineEditor } from "@/components/rendy-headline-editor";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Film,
  Loader2,
  Minus,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  X,
} from "lucide-react";
import { DEFAULT_HEADLINE_SETTINGS, type HeadlineSettings } from "@shared/rendy-text";

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
  status: "preparing" | "draft" | "analyzing" | "rendering" | "ready" | "failed";
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
  const at = candidate
    ? Math.max(candidate.safeStart, candidate.safeStart + (candidate.safeEnd - candidate.safeStart) / 2)
    : 0;

  useEffect(() => {
    setImageFailed(false);
  }, [candidate?.id, candidate?.thumbnailUrl]);

  if (!candidate) {
    return <div className={`${className} bg-[#EDE8E3]`} aria-hidden="true" />;
  }

  if (candidate.thumbnailUrl && !imageFailed) {
    return (
      <img
        src={candidate.thumbnailUrl}
        alt=""
        className={`${className} object-cover bg-[#EDE8E3]`}
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
      className={`${className} pointer-events-none object-cover bg-[#EDE8E3]`}
      onLoadedMetadata={(event) => {
        const video = event.currentTarget;
        if (Number.isFinite(at) && Math.abs(video.currentTime - at) > 0.05) {
          video.currentTime = at;
        }
      }}
    />
  );
}

const POLLING_STATUSES: EditProject["status"][] = ["preparing", "analyzing", "rendering"];

// ── Component ─────────────────────────────────────────────────────────────────

export function RendyVideoEditor({ listingId, sourceVideoId, sourceVideoUrl, onOutputReady }: Props) {
  const { user } = useAuth();

  const [open, setOpen] = useState(false);
  const [project, setProject] = useState<EditProject | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [pickerOpen, setPickerOpen] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  // Headline state — always reset to proj.headline ?? DEFAULT on every project load/poll
  const [headline, setHeadline] = useState<HeadlineSettings>(DEFAULT_HEADLINE_SETTINGS);

  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onOutputReadyRef = useRef(onOutputReady);
  onOutputReadyRef.current = onOutputReady;

  // ── Apply project helper — always syncs headline to proj value or DEFAULT ──
  const applyProject = useCallback((proj: EditProject) => {
    setProject(proj);
    setTimeline(proj.timeline ?? []);
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
        throw new Error(data.error || data.message || "Anmodningen mislykkedes");
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
        setMessage(err instanceof Error ? err.message : "Fejl under opdatering");
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
      setMessage(err instanceof Error ? err.message : "Kunne ikke oprette projekt");
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
    if (project?.status === "ready" && project.outputUrl) {
      onOutputReadyRef.current(project.outputUrl);
    }
  }, [project?.status, project?.outputUrl]);

  useEffect(() => {
    if (open && project && POLLING_STATUSES.includes(project.status) && !pollTimer.current) {
      void poll(project.id);
    }
  }, [open, poll, project]);

  // ── Timeline mutations ──────────────────────────────────────────────────────
  const shots: Shot[] = project?.manifest?.shots ?? [];
  const timelineCandidateIds = new Set(timeline.map((t) => t.candidateId));

  function addShot(shot: Shot) {
    const cand =
      shot.candidates.find((c) => !timelineCandidateIds.has(c.id)) ?? shot.candidates[0];
    if (!cand) return;
    setTimeline((prev) => [...prev, { shotId: shot.id, candidateId: cand.id }]);
    setPickerOpen(null);
  }

  function removeItem(index: number) {
    setTimeline((prev) => prev.filter((_, i) => i !== index));
    setPickerOpen(null);
  }

  function moveItem(index: number, dir: -1 | 1) {
    const next = index + dir;
    if (next < 0 || next >= timeline.length) return;
    setTimeline((prev) => {
      const arr = [...prev];
      [arr[index], arr[next]] = [arr[next], arr[index]];
      return arr;
    });
    setPickerOpen(null);
  }

  function selectCandidate(index: number, candidateId: string) {
    setTimeline((prev) =>
      prev.map((item, i) => (i === index ? { ...item, candidateId } : item)),
    );
    setPickerOpen(null);
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
      setMessage(err instanceof Error ? err.message : "Kunne ikke anvende overskrift");
    }
  }, [api, applyProject, clearPoll, headline, poll, project]);

  const retry = useCallback(async () => {
    if (!project) return;
    clearPoll();
    setBusy(true);
    setMessage("");
    try {
      const data = await api(`/api/bolig/rendy/edit-projects/${project.id}/retry`, {
        method: "POST",
      });
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
    const updated = await patchTimeline();
    if (updated) setPickerOpen(null);
  }, [patchTimeline, project]);

  const status = project?.status;

  // ── Shot library helpers ──────────────────────────────────────────────────
  function shotInTimeline(shot: Shot): boolean {
    return shot.candidates.some((c) => timelineCandidateIds.has(c.id));
  }

  function activeCandidateIdForShot(shot: Shot): string | null {
    for (const item of timeline) {
      if (item.shotId === shot.id) return item.candidateId;
    }
    return null;
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  if (!open) {
    return (
      <div className="mt-2">
        <button
          type="button"
          onClick={openEditor}
          className="w-full h-8 rounded-full text-xs font-semibold border border-[#C8956C] text-[#855F45] bg-[#FFFDFC] inline-flex items-center justify-center gap-1.5"
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
    selectedIndex != null && selectedIndex >= 0 && selectedIndex < timeline.length
      ? selectedIndex
      : 0;
  const previewItem = timeline[previewIndex];
  const previewShot = previewItem
    ? shots.find((shot) => shot.id === previewItem.shotId)
    : null;
  const previewCandidate = previewItem
    ? previewShot?.candidates.find((candidate) => candidate.id === previewItem.candidateId)
    : null;

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-[#0F1D2F]/95 p-3 sm:p-6">
      <section
        className="mx-auto min-h-[calc(100dvh-1.5rem)] max-w-7xl rounded-[24px] border border-white/10 bg-[#F8F5F0] p-4 shadow-2xl space-y-4 sm:min-h-[calc(100dvh-3rem)] sm:p-6"
        aria-label="Videoredigering"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#A36F4E]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#C8956C]" />
              Forma videostudie
            </div>
            <h3 className="text-xl font-semibold tracking-tight text-[#0F1D2F] sm:text-2xl">Redigér video</h3>
            <p className="text-[11px] text-[#6C6964]">
              Sæt klip sammen, tilføj overskrift og generer en ny video
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              clearPoll();
              setOpen(false);
            }}
            aria-label="Luk"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#DCC9B9] bg-white text-[#0F1D2F] transition-colors hover:bg-[#F4EEE8]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {shots.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto border-y border-[#E4D8CC] py-2 text-[10px] text-[#77736D]">
            <span className="shrink-0 font-semibold uppercase tracking-[0.14em] text-[#A36F4E]">Rækkefølge</span>
            {timeline.map((item, index) => {
              const shot = shots.find((entry) => entry.id === item.shotId);
              const candidate = shot?.candidates.find((entry) => entry.id === item.candidateId);
              return (
                <div key={`${item.shotId}-context-${index}`} className="flex shrink-0 items-center gap-1.5 rounded-full bg-[#EEE5DC] px-2 py-1 text-[#4D4943]">
                  <span className="font-mono text-[9px] text-[#A36F4E]">{String(index + 1).padStart(2, "0")}</span>
                  <ClipThumbnail candidate={candidate} className="h-4 w-6 shrink-0 rounded" />
                  <span className="max-w-[100px] truncate">{shot?.label ?? "Klip"}</span>
                </div>
              );
            })}
            {timeline.length === 0 && <span>Tilføj klip fra biblioteket for at starte sekvensen</span>}
          </div>
        )}

        {/* Loading / preparing */}
        {busy && (!status || status === "preparing" || status === "analyzing") && (
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
          <div className="space-y-2">
            <div
              className="flex items-center gap-2 text-xs font-semibold text-[#385B49]"
              role="status"
              aria-live="polite"
            >
              <Check className="w-4 h-4" />
              Video klar
            </div>
            <video
              id={`rendy-edited-video-${project.id}`}
              src={project.outputUrl}
              controls
              playsInline
              className="w-full rounded-lg bg-black"
              data-testid="video-edit-final"
            />
            <RendyVoiceoverEditor
              sourceVideoUrl={project.outputUrl}
              sourceVideoId={`edit:${project.id}`}
              listingId={listingId}
              videoElementId={`rendy-edited-video-${project.id}`}
              onOutputReady={onOutputReady}
            />
            {/* Headline editor in ready state:
                - Preview base is the clean assembled Edit export (cleanOutputUrl)
                  so the preview is never contaminated by a previously burned
                  headline; falls back to the raw source if not yet available.
                - Apply = applyHeadline re-burns text directly onto the existing
                  clean export via a dedicated endpoint. It never rebuilds the
                  timeline or PATCHes it for headline-only changes. */}
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
              className="w-full h-8 rounded-lg border border-[#DCC9B9] text-xs font-semibold inline-flex items-center justify-center gap-1.5"
              data-testid="button-edit-video-again"
            >
              <RotateCcw className="w-3 h-3" />
              Redigér igen
            </button>
          </div>
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
                      <h4 className="text-sm font-semibold text-[#0F1D2F]">Din tidslinje</h4>
                      <p className="text-[11px] text-[#77736D]">
                        Tryk på et klip for at se det. Brug pilene til at ændre rækkefølgen.
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

                  <ol className="space-y-2.5">
                    {timeline.map((item, index) => {
                      const shot = shots.find((candidateShot) => candidateShot.id === item.shotId);
                      if (!shot) return null;
                      const candidate = shot.candidates.find((entry) => entry.id === item.candidateId);
                      const isPicker = pickerOpen === index;
                      const isSelected = previewIndex === index;

                      return (
                        <li
                          key={`${item.shotId}-${index}`}
                          aria-current={isSelected ? "step" : undefined}
                          onClick={() => setSelectedIndex(index)}
                          className={`rounded-xl border p-3 transition-all ${
                            isSelected
                              ? "border-[#C8956C] bg-[#FFF9F4] shadow-sm"
                              : "border-[#E1DAD2] bg-white hover:border-[#C8956C]/60"
                          }`}
                        >
                          <div className="grid gap-3 sm:grid-cols-[112px_minmax(0,1fr)]">
                            <ClipThumbnail
                              candidate={candidate}
                              className="aspect-video w-full rounded-lg"
                            />
                            <div className="min-w-0">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#A36F4E]">
                                    Klip {String(index + 1).padStart(2, "0")} i rækkefølgen
                                  </p>
                                  <p className="mt-0.5 truncate text-sm font-semibold text-[#0F1D2F]">
                                    {shot.label}
                                  </p>
                                  <p className="text-[11px] text-[#77736D]">
                                    {candidate ? fmtDuration(candidate.duration) : "Ukendt længde"}
                                    {shot.candidates.length > 1
                                      ? ` · ${shot.candidates.length} varianter`
                                      : ""}
                                  </p>
                                </div>
                                {isSelected && (
                                  <span className="shrink-0 rounded-full bg-[#E7C6A9] px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-[#855F45]">
                                    Vises nu
                                  </span>
                                )}
                              </div>
                              <div className="mt-3 grid grid-cols-4 gap-2">
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    moveItem(index, -1);
                                  }}
                                  disabled={index === 0}
                                  aria-label={`Flyt ${shot.label} tidligere`}
                                  className="h-9 rounded-lg border border-[#E1DAD2] bg-white text-[#4D4943] inline-flex items-center justify-center disabled:opacity-30"
                                >
                                  <ChevronUp className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    moveItem(index, 1);
                                  }}
                                  disabled={index === timeline.length - 1}
                                  aria-label={`Flyt ${shot.label} senere`}
                                  className="h-9 rounded-lg border border-[#E1DAD2] bg-white text-[#4D4943] inline-flex items-center justify-center disabled:opacity-30"
                                >
                                  <ChevronDown className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setPickerOpen(isPicker ? null : index);
                                  }}
                                  className="h-9 rounded-lg border border-[#DCC9B9] bg-white px-2 text-[11px] font-semibold text-[#0F1D2F]"
                                >
                                  Skift
                                </button>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    removeItem(index);
                                  }}
                                  aria-label={`Fjern ${shot.label}`}
                                  className="h-9 rounded-lg border border-[#E8D4D0] bg-white text-[#A34D43] inline-flex items-center justify-center"
                                >
                                  <Minus className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          </div>

                          {isPicker && (
                            <div
                              className="mt-3 border-t border-[#E8E0D8] pt-3"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <p className="mb-2 text-[11px] font-semibold text-[#0F1D2F]">
                                Vælg en anden version af {shot.label}
                              </p>
                              <div className="flex gap-2 overflow-x-auto pb-1">
                                {shot.candidates.map((candidateOption, candidateIndex) => {
                                  const isActive = candidateOption.id === item.candidateId;
                                  const inUseElsewhere =
                                    !isActive && timelineCandidateIds.has(candidateOption.id);
                                  return (
                                    <button
                                      key={candidateOption.id}
                                      type="button"
                                      onClick={() =>
                                        !inUseElsewhere &&
                                        selectCandidate(index, candidateOption.id)
                                      }
                                      disabled={inUseElsewhere}
                                      className={`w-36 shrink-0 overflow-hidden rounded-xl border text-left disabled:opacity-40 ${
                                        isActive
                                          ? "border-[#C8956C] bg-[#FDF5EE]"
                                          : "border-[#E1DAD2] bg-white"
                                      }`}
                                    >
                                      <ClipThumbnail
                                        candidate={candidateOption}
                                        className="aspect-video w-full"
                                      />
                                      <span className="block px-2.5 py-2 text-[10px] font-semibold text-[#4D4943]">
                                        Version {candidateIndex + 1} · {fmtDuration(candidateOption.duration)}
                                        {isActive ? " · Valgt" : ""}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
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

                <div className="rounded-2xl border border-[#E1DAD2] bg-white p-3 shadow-sm">
                  <div className="mb-3">
                    <h4 className="text-sm font-semibold text-[#0F1D2F]">Klipbibliotek</h4>
                    <p className="text-[11px] text-[#77736D]">
                      Se motivet, før du føjer et klip til videoen.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:max-h-[68vh] xl:grid-cols-1 xl:overflow-y-auto xl:pr-1">
                    {shots.map((shot) => {
                      const inTimeline = shotInTimeline(shot);
                      const activeCandidateId = activeCandidateIdForShot(shot);
                      const activeCandidate = activeCandidateId
                        ? shot.candidates.find((candidate) => candidate.id === activeCandidateId)
                        : null;
                      const libraryCandidate = activeCandidate ?? shot.candidates[0];
                      return (
                        <article
                          key={shot.id}
                          className="overflow-hidden rounded-xl border border-[#E1DAD2] bg-[#FFFDFC]"
                        >
                          <ClipThumbnail
                            candidate={libraryCandidate}
                            className="aspect-video w-full"
                          />
                          <div className="flex items-center gap-3 p-3">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-semibold text-[#0F1D2F]">
                                {shot.label}
                              </p>
                              <p className="text-[10px] text-[#77736D]">
                                {fmtDuration(shot.duration)}
                                {shot.candidates.length > 1
                                  ? ` · ${shot.candidates.length} varianter`
                                  : ""}
                              </p>
                            </div>
                            {inTimeline ? (
                              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#EAF2ED] px-2 py-1 text-[9px] font-semibold text-[#385B49]">
                                <Check className="h-3 w-3" />
                                Tilføjet
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => addShot(shot)}
                                aria-label={`Tilsæt ${shot.label}`}
                                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-[#C8956C] px-3 text-[10px] font-semibold text-[#855F45]"
                              >
                                <Plus className="h-3.5 w-3.5" />
                                Tilføj
                              </button>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              </aside>
            </div>

            <div className="sticky bottom-0 z-10 -mx-4 flex gap-2 border-t border-[#E1DAD2] bg-[#F8F5F0]/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
              <button
                type="button"
                onClick={patchTimeline}
                disabled={saving || busy}
                className="flex-1 h-9 rounded-lg border border-[#DCC9B9] text-[#0F1D2F] text-xs font-semibold inline-flex justify-center items-center gap-1.5 disabled:opacity-50"
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
                className="flex-1 h-9 rounded-lg bg-[#C8956C] text-white text-xs font-semibold inline-flex justify-center items-center gap-1.5 disabled:opacity-50"
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
          <p className="text-[11px] text-[#A34D43]" role="alert" aria-live="assertive">
            {message}
          </p>
        )}
      </section>
    </div>
  );
}
