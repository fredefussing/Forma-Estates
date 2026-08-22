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

  return (
    <div className="mt-2">
      <section
        className="rounded-xl border border-[#DCC9B9] bg-[#FFFDFC] p-3 space-y-3"
        aria-label="Videoredigering"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-[#0F1D2F]">Redigér video</h3>
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
          >
            <X className="w-4 h-4" />
          </button>
        </div>

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

        {/* Draft / editing UI — headline editor available here too, before first export */}
        {(status === "draft" || (!status && !busy)) && shots.length > 0 && (
          <>
            {/* Keep the text tool visible at the top of Edit instead of hiding it
                below a potentially long timeline and clip library. */}
            <RendyHeadlineEditor
              sourceVideoUrl={sourceVideoUrl}
              value={headline}
              onChange={setHeadline}
              onApply={startRender}
              applyBusy={busy}
            />

            {/* Timeline */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-semibold text-[#0F1D2F]">
                  Din tidslinje
                </span>
                {timeline.length > 0 && (
                  <span className="text-[10px] text-[#77736D]">
                    {fmtDuration(totalSec)} total
                  </span>
                )}
              </div>

              {timeline.length === 0 && (
                <p className="text-[11px] text-[#77736D] py-2">
                  Tilsæt klip fra biblioteket nedenfor.
                </p>
              )}

              <ol className="space-y-1.5">
                {timeline.map((item, index) => {
                  const shot = shots.find((sh) => sh.id === item.shotId);
                  if (!shot) return null;
                  const cand = shot.candidates.find((c) => c.id === item.candidateId);
                  const isPicker = pickerOpen === index;

                  return (
                    <li
                      key={`${item.shotId}-${index}`}
                      className="rounded-lg border border-[#E1DAD2] bg-white p-2 space-y-1.5"
                    >
                      <div className="flex items-center gap-2">
                        {cand?.thumbnailUrl ? (
                          <img
                            src={cand.thumbnailUrl}
                            alt=""
                            className="w-12 h-8 rounded object-cover flex-shrink-0 bg-[#EDE8E3]"
                          />
                        ) : (
                          <div className="w-12 h-8 rounded bg-[#EDE8E3] flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-semibold text-[#0F1D2F] truncate">
                            {shot.label}
                          </p>
                          {cand && (
                            <p className="text-[10px] text-[#77736D]">
                              {fmtDuration(cand.duration)}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => moveItem(index, -1)}
                            disabled={index === 0}
                            aria-label="Flyt op"
                            className="w-6 h-6 rounded flex items-center justify-center border border-[#E1DAD2] disabled:opacity-30"
                          >
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveItem(index, 1)}
                            disabled={index === timeline.length - 1}
                            aria-label="Flyt ned"
                            className="w-6 h-6 rounded flex items-center justify-center border border-[#E1DAD2] disabled:opacity-30"
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setPickerOpen(isPicker ? null : index)}
                            aria-label="Skift klip"
                            className="h-6 px-1.5 rounded border border-[#E1DAD2] text-[10px] font-semibold"
                          >
                            Skift
                          </button>
                          <button
                            type="button"
                            onClick={() => removeItem(index)}
                            aria-label="Fjern klip"
                            className="w-6 h-6 rounded flex items-center justify-center border border-[#E1DAD2] text-[#A34D43]"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {isPicker && (
                        <div className="space-y-1">
                          <p className="text-[10px] text-[#77736D]">Vælg alternativt klip:</p>
                          <div className="flex flex-wrap gap-1.5">
                            {shot.candidates.map((c) => {
                              const isActive = c.id === item.candidateId;
                              const inUseElsewhere =
                                !isActive && timelineCandidateIds.has(c.id);
                              return (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() =>
                                    !inUseElsewhere && selectCandidate(index, c.id)
                                  }
                                  disabled={inUseElsewhere}
                                  className={`rounded border px-2 py-1 text-[10px] font-semibold inline-flex flex-col items-center gap-0.5 disabled:opacity-40 ${
                                    isActive
                                      ? "border-[#C8956C] bg-[#FDF5EE] text-[#855F45]"
                                      : "border-[#E1DAD2] text-[#4D4943]"
                                  }`}
                                >
                                  {c.thumbnailUrl && (
                                    <img
                                      src={c.thumbnailUrl}
                                      alt=""
                                      className="w-14 h-9 rounded object-cover bg-[#EDE8E3]"
                                    />
                                  )}
                                  <span>{fmtDuration(c.duration)}</span>
                                  {isActive && <span className="text-[9px]">Valgt</span>}
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

            {/* Shot library */}
            <div>
              <p className="text-[11px] font-semibold text-[#0F1D2F] mb-1.5">Bibliotek</p>
              <div className="space-y-1">
                {shots.map((shot) => {
                  const inTimeline = shotInTimeline(shot);
                  const activeCandId = activeCandidateIdForShot(shot);
                  const activeCand = activeCandId
                    ? shot.candidates.find((c) => c.id === activeCandId)
                    : null;
                  return (
                    <div
                      key={shot.id}
                      className="flex items-center gap-2 rounded-lg border border-[#E1DAD2] bg-white p-2"
                    >
                      {(activeCand ?? shot.candidates[0])?.thumbnailUrl ? (
                        <img
                          src={(activeCand ?? shot.candidates[0])!.thumbnailUrl}
                          alt=""
                          className="w-12 h-8 rounded object-cover flex-shrink-0 bg-[#EDE8E3]"
                        />
                      ) : (
                        <div className="w-12 h-8 rounded bg-[#EDE8E3] flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-semibold text-[#0F1D2F] truncate">
                          {shot.label}
                        </p>
                        <p className="text-[10px] text-[#77736D]">
                          {fmtDuration(shot.duration)}
                          {shot.candidates.length > 1 &&
                            ` · ${shot.candidates.length} varianter`}
                        </p>
                      </div>
                      {inTimeline ? (
                        <span className="text-[10px] text-[#385B49] font-semibold flex items-center gap-0.5 flex-shrink-0">
                          <Check className="w-3 h-3" />
                          I din video
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => addShot(shot)}
                          aria-label={`Tilsæt ${shot.label}`}
                          className="w-7 h-7 rounded-full border border-[#C8956C] text-[#855F45] flex items-center justify-center flex-shrink-0"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
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
          </>
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
