import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import {
  AudioLines, Check, Download, FolderDown, Loader2, Mic, Pause, RotateCcw,
  Trash2, Upload, X,
} from "lucide-react";
import { RendyCaptionStyleEditor } from "@/components/rendy-caption-style-editor";
import { DEFAULT_CAPTION_STYLE, type CaptionStyleSettings } from "@shared/rendy-text";

export interface VoiceSegment {
  id: string;
  start: number;
  end: number;
  text: string;
  hidden?: boolean;
}

export interface VoiceProject {
  id: string | number;
  status: "processing" | "review" | "exporting" | "ready" | "failed";
  language: string;
  segments: VoiceSegment[];
  subtitlesEnabled: boolean;
  captionStyle?: CaptionStyleSettings;
  sourceUrl?: string;
  sourceInputUrl?: string;
  audioUrl?: string;
  outputUrl?: string;
  error?: string;
}

function BrowserPortal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return <>{children}</>;
  return createPortal(children, document.body);
}

interface Props {
  sourceVideoUrl: string;
  sourceVideoId: string;
  listingId: string;
  duration?: number;
  videoElementId: string;
  onOutputReady: (url: string) => void;
  /** Reports work that must finish before a parent can safely save and close. */
  onBusyChange?: (busy: boolean) => void;
  /** Loads/polls an existing project even while the compact editor is closed. */
  preloadProject?: boolean;
  /** Opens the editor directly as a focused full-screen workspace. */
  immersive?: boolean;
  onRequestClose?: () => void;
}

const ACCEPTED_AUDIO = "audio/mpeg,audio/mp4,audio/wav,audio/ogg,audio/webm,audio/aac,.mp3,.m4a,.wav,.ogg,.webm,.aac";
const ACCEPTED_EXTENSIONS = /\.(mp3|m4a|wav|ogg|webm|aac)$/i;
const ACCEPTED_MIME_TYPES = new Set([
  "audio/aac",
  "audio/mp3",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/wave",
  "audio/webm",
  "audio/x-m4a",
  "audio/x-wav",
]);
const MAX_AUDIO_BYTES = 50 * 1024 * 1024;

type SaveFileHandle = {
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
};

type SavePickerWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: Array<{ description: string; accept: Record<string, string[]> }>;
  }) => Promise<SaveFileHandle>;
};

export function RendyVoiceoverEditor({
  sourceVideoUrl,
  sourceVideoId,
  listingId,
  duration,
  videoElementId,
  onOutputReady,
  onBusyChange,
  preloadProject = false,
  immersive = false,
  onRequestClose,
}: Props) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [project, setProject] = useState<VoiceProject | null>(null);
  const [captionStyle, setCaptionStyle] = useState<CaptionStyleSettings>(DEFAULT_CAPTION_STYLE);
  const [audio, setAudio] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [recording, setRecording] = useState(false);
  const [finalizingRecording, setFinalizingRecording] = useState(false);
  const [recordedSeconds, setRecordedSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [savingOutput, setSavingOutput] = useState(false);
  const [message, setMessage] = useState("");
  const [replacementSourceUrl, setReplacementSourceUrl] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioUrlRef = useRef("");
  const recordingVideoRef = useRef<HTMLVideoElement | null>(null);
  const recordingVideoLoopRef = useRef<boolean | null>(null);
  const recordingVideoMutedRef = useRef<boolean | null>(null);
  const videoEndedHandlerRef = useRef<(() => void) | null>(null);
  const [outputVideoState, setOutputVideoState] = useState<"loading" | "ready" | "error">("loading");
  const [outputRetryAttempt, setOutputRetryAttempt] = useState(0);
  const outputVideoRef = useRef<HTMLVideoElement | null>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const preFocusRef = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const outputReadyRef = useRef(onOutputReady);
  outputReadyRef.current = onOutputReady;
  const setWorkBusy = useCallback(
    (nextBusy: boolean) => {
      // Notify a containing editor synchronously so its save-and-close action
      // cannot win a click race against a voice-over export.
      onBusyChange?.(nextBusy);
      setBusy(nextBusy);
    },
    [onBusyChange],
  );
  const voiceWorkActive =
    busy ||
    recording ||
    finalizingRecording ||
    project?.status === "processing" ||
    project?.status === "exporting";

  useEffect(() => {
    onBusyChange?.(voiceWorkActive);
  }, [onBusyChange, voiceWorkActive]);

  useEffect(
    () => () => {
      onBusyChange?.(false);
    },
    [onBusyChange],
  );

  const alignedVideo = useCallback(
    () => document.getElementById(videoElementId) as HTMLVideoElement | null,
    [videoElementId],
  );

  const stopTracks = useCallback(() => {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  }, []);

  const pauseAlignedVideo = useCallback(() => {
    const video = recordingVideoRef.current ?? alignedVideo();
    if (video) {
      video.pause();
      if (videoEndedHandlerRef.current) {
        video.removeEventListener("ended", videoEndedHandlerRef.current);
      }
      if (recordingVideoLoopRef.current != null) {
        video.loop = recordingVideoLoopRef.current;
      }
      if (recordingVideoMutedRef.current != null) {
        video.muted = recordingVideoMutedRef.current;
      }
    }
    recordingVideoRef.current = null;
    recordingVideoLoopRef.current = null;
    recordingVideoMutedRef.current = null;
    videoEndedHandlerRef.current = null;
  }, [alignedVideo]);

  const clearPoll = useCallback(() => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    pollTimer.current = null;
  }, []);

  const clearLocalAudio = useCallback(() => {
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = "";
    setAudioUrl("");
    setAudio(null);
    setRecordedSeconds(0);
  }, []);
  audioUrlRef.current = audioUrl;

  const api = useCallback(async (path: string, init: RequestInit = {}) => {
    const token = await user?.getIdToken();
    const headers = new Headers(init.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(path, { ...init, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) {
      const technical = data.error || data.message;
      if (technical) console.warn("Voice-over request failed:", technical);
      throw new Error(t("dashboard.showcase.voiceover.failed"));
    }
    return data;
  }, [t, user]);

  const chooseAudio = (file: File | null) => {
    if (!file) return;
    const validType =
      ACCEPTED_MIME_TYPES.has(file.type.toLowerCase()) ||
      ACCEPTED_EXTENSIONS.test(file.name);
    if (!validType) {
      setMessage(t("dashboard.voiceoverErrors.invalidType"));
      return;
    }
    if (file.size > MAX_AUDIO_BYTES) {
      setMessage(t("dashboard.voiceoverErrors.fileTooLarge"));
      return;
    }
    clearLocalAudio();
    const nextAudioUrl = URL.createObjectURL(file);
    audioUrlRef.current = nextAudioUrl;
    setAudio(file);
    setAudioUrl(nextAudioUrl);
    setMessage("");
  };

  // Helper: apply project + sync captionStyle from it if present
  const applyProject = useCallback((proj: VoiceProject | null) => {
    setProject(proj);
    if (proj?.captionStyle) setCaptionStyle(proj.captionStyle);
    if (proj?.status === "ready" && proj.outputUrl) {
      // Publish the new URL before clearing the shared busy state. The parent
      // can therefore never re-enable save with the previous output selected.
      outputReadyRef.current(proj.outputUrl);
    }
  }, []);

  const loadProject = useCallback(async () => {
    if (!listingId || !sourceVideoId) return;
    setWorkBusy(true);
    try {
      const data = await api(
        `/api/bolig/rendy/voice-projects/by-video?listingId=${encodeURIComponent(listingId)}&videoId=${encodeURIComponent(sourceVideoId)}`,
      );
      const loadedProject: VoiceProject | null = data.project || null;
      applyProject(loadedProject);
      if (
        loadedProject?.status !== "processing" &&
        loadedProject?.status !== "exporting"
      ) {
        setWorkBusy(false);
      }
      setMessage("");
    } catch {
      setWorkBusy(false);
      setMessage(t("dashboard.showcase.voiceover.failed"));
    }
  }, [api, applyProject, listingId, setWorkBusy, sourceVideoId, t]);

  // Voice preparation and export are asynchronous. Poll promptly while a job
  // is new, then back off gently so completed text/video appears quickly
  // without creating constant background traffic on longer jobs.
  const poll = useCallback(async (id: string | number, delay = 600) => {
    clearPoll();
    try {
      const data = await api(`/api/bolig/rendy/voice-projects/${id}`);
      applyProject(data.project);
      if (data.project.status === "processing" || data.project.status === "exporting") {
        pollTimer.current = setTimeout(
          () => void poll(id, Math.min(Math.round(delay * 1.25), 3000)),
          delay,
        );
      } else {
        pollTimer.current = null;
        setWorkBusy(false);
      }
    } catch {
      pollTimer.current = null;
      setWorkBusy(false);
      setMessage(t("dashboard.showcase.voiceover.failed"));
    }
  }, [api, applyProject, clearPoll, setWorkBusy, t]);

  const editorOpen = open || immersive;
  const shouldLoadProject = editorOpen || preloadProject;

  useEffect(() => {
    if (shouldLoadProject) void loadProject();
    return () => {
      clearPoll();
      pauseAlignedVideo();
    };
  }, [clearPoll, loadProject, pauseAlignedVideo, shouldLoadProject]);

  useEffect(() => {
    if (
      shouldLoadProject &&
      project &&
      (project.status === "processing" || project.status === "exporting") &&
      !pollTimer.current
    ) {
      void poll(project.id);
    }
  }, [poll, project, shouldLoadProject]);

  useEffect(() => () => {
    clearPoll();
    pauseAlignedVideo();
    stopTracks();
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
  }, [clearPoll, pauseAlignedVideo, stopTracks]);

  const stopRecording = useCallback(() => {
    const activeRecorder = recorder.current;
    pauseAlignedVideo();
    setRecording(false);
    if (activeRecorder && activeRecorder.state !== "inactive") {
      // Do not end mic tracks yet. Browsers deliver the final audio chunk after
      // stop(), and stopping tracks early can make an end-of-video recording
      // look like it vanished.
      setFinalizingRecording(true);
      activeRecorder.stop();
    } else {
      stopTracks();
      setFinalizingRecording(false);
    }
  }, [pauseAlignedVideo, stopTracks]);

  useEffect(() => {
    if (!editorOpen) {
      // Restore focus to the element that was active before the dialog opened.
      // Fall back to the opener button when no prior element was recorded
      // (e.g. immersive mode) or when the previously-focused element is no
      // longer in the document.
      const target = preFocusRef.current;
      if (target && document.contains(target)) {
        target.focus();
      } else if (!immersive) {
        openerRef.current?.focus();
      }
      preFocusRef.current = null;
      return;
    }
    // Record which element was focused before we trap focus inside the dialog.
    preFocusRef.current = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const first = dialog?.querySelector<HTMLElement>(
      "button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), video[controls]",
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
        stopRecording();
        clearPoll();
        setOpen(false);
        onRequestClose?.();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), video[controls], [tabindex]:not([tabindex='-1'])",
      ));
      if (!focusable.length) return;
      const index = focusable.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey && (index <= 0 || index === -1)) {
        event.preventDefault();
        focusable[focusable.length - 1].focus();
      } else if (!event.shiftKey && (index === -1 || index === focusable.length - 1)) {
        event.preventDefault();
        focusable[0].focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [clearPoll, editorOpen, immersive, onRequestClose, stopRecording]);

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setMessage(t("dashboard.voiceoverErrors.micUnavailable"));
      return;
    }
    try {
      // Ask first: the aligned video must not move while the browser permission prompt is open.
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const video = alignedVideo();
      if (video) {
        recordingVideoRef.current = video;
        recordingVideoLoopRef.current = video.loop;
        recordingVideoMutedRef.current = video.muted;
        video.loop = false;
        video.muted = true;
        video.currentTime = 0;
        const handleEnded = () => stopRecording();
        videoEndedHandlerRef.current = handleEnded;
        video.addEventListener("ended", handleEnded, { once: true });
      }
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "";
      const activeRecorder = new MediaRecorder(
        stream.current,
        mimeType ? { mimeType } : undefined,
      );
      recorder.current = activeRecorder;
      chunks.current = [];
      activeRecorder.ondataavailable = (event) => {
        if (event.data.size) chunks.current.push(event.data);
      };
      activeRecorder.onstop = () => {
        const blob = new Blob(chunks.current, { type: activeRecorder.mimeType || "audio/webm" });
        if (blob.size) {
          chooseAudio(new File([blob], "narration.webm", { type: blob.type }));
        } else {
          setMessage(t("dashboard.voiceoverErrors.emptyRecording"));
        }
        recorder.current = null;
        stopTracks();
        setFinalizingRecording(false);
      };
      activeRecorder.onerror = () => {
        pauseAlignedVideo();
        stopTracks();
        recorder.current = null;
        setRecording(false);
        setFinalizingRecording(false);
        setMessage(t("dashboard.showcase.voiceover.micError"));
      };
      activeRecorder.start();
      setRecordedSeconds(0);
      setRecording(true);
      setFinalizingRecording(false);
      // Start the microphone recorder first, then play the video. This keeps
      // the narration from losing its opening syllable and makes its end
      // reliably land at the end of the source video.
      if (video) {
        void video.play().catch(() => {
          setMessage(t("dashboard.showcase.voiceover.micError"));
          stopRecording();
        });
      }
    } catch {
      pauseAlignedVideo();
      stopTracks();
      setRecording(false);
      setFinalizingRecording(false);
      setMessage(t("dashboard.showcase.voiceover.micError"));
    }
  };

  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => {
      setRecordedSeconds((seconds) => {
        const video = recordingVideoRef.current ?? alignedVideo();
        // The metadata duration can be shorter than the actual delivered
        // video. Use playback time only for the counter; the video's real
        // `ended` event is the sole automatic stop signal.
        if (video && Number.isFinite(video.currentTime)) {
          return Math.max(seconds, Math.floor(video.currentTime));
        }
        return seconds + 1;
      });
    }, 250);
    return () => clearInterval(timer);
  }, [alignedVideo, recording]);

  const upload = async () => {
    if (!audio) return;
    clearPoll();
    setWorkBusy(true);
    setMessage("");
    try {
      const formData = new FormData();
      formData.append("audio", audio);
      formData.append("sourceVideoUrl", replacementSourceUrl ?? sourceVideoUrl);
      formData.append("sourceVideoId", sourceVideoId);
      formData.append("listingId", listingId);
      formData.append("language", i18n.language.split("-")[0]);
      formData.append("duration", String(duration || 0));
      const data = await api("/api/bolig/rendy/voice-projects", {
        method: "POST",
        body: formData,
      });
      applyProject(data.project);
      setReplacementSourceUrl(null);
      clearLocalAudio();
      void poll(data.project.id);
    } catch {
      setWorkBusy(false);
      setMessage(t("dashboard.showcase.voiceover.failed"));
    }
  };

  const reset = () => {
    stopRecording();
    clearPoll();
    clearLocalAudio();
    setReplacementSourceUrl(project?.sourceInputUrl ?? sourceVideoUrl);
    applyProject(null);
    setCaptionStyle(DEFAULT_CAPTION_STYLE);
    setMessage("");
  };

  const saveCaptions = async (segments: VoiceSegment[], subtitlesEnabled: boolean) => {
    if (!project) return;
    const data = await api(`/api/bolig/rendy/voice-projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ segments, subtitlesEnabled, captionStyle }),
    });
    applyProject(data.project);
  };

  const exportProject = async () => {
    if (!project) return;
    clearPoll();
    setWorkBusy(true);
    try {
      await saveCaptions(project.segments, project.subtitlesEnabled);
      const data = await api(`/api/bolig/rendy/voice-projects/${project.id}/export`, {
        method: "POST",
      });
      applyProject(data.project);
      void poll(project.id);
    } catch {
      setWorkBusy(false);
      setMessage(t("dashboard.showcase.voiceover.failed"));
    }
  };

  const retry = async () => {
    if (!project) return;
    clearPoll();
    setWorkBusy(true);
    try {
      const data = await api(`/api/bolig/rendy/voice-projects/${project.id}/retry`, {
        method: "POST",
      });
      applyProject(data.project);
      void poll(project.id);
    } catch {
      setWorkBusy(false);
      setMessage(t("dashboard.showcase.voiceover.failed"));
    }
  };

  const updateSegment = (index: number, update: Partial<VoiceSegment>) => {
    if (!project) return;
    setProject({
      ...project,
      segments: project.segments.map((segment, i) =>
        i === index ? { ...segment, ...update } : segment,
      ),
    });
  };

  const outputFilename = `forma-showcase-${sourceVideoId.slice(0, 16) || "video"}-fortaelling.mp4`;

  const downloadOutput = useCallback(() => {
    if (!project?.outputUrl) return;
    const anchor = document.createElement("a");
    anchor.href = project.outputUrl;
    anchor.download = outputFilename;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }, [outputFilename, project?.outputUrl]);

  const saveOutputToFolder = async () => {
    if (!project?.outputUrl || savingOutput) return;
    setSavingOutput(true);
    setMessage("");
    try {
      const showSaveFilePicker = (window as SavePickerWindow).showSaveFilePicker;
      if (!showSaveFilePicker) {
        // No File System Access API — use the anchor-download fallback directly.
        try {
          downloadOutput();
        } catch {
          setMessage(t("dashboard.common.kunneIkkeGemmeTilMappen"));
        }
        return;
      }
      // Open the picker as part of this click so browsers keep the user gesture
      // and let the user choose the exact folder and filename.
      const handle = await showSaveFilePicker({
        suggestedName: outputFilename,
        types: [{ description: "MP4 video", accept: { "video/mp4": [".mp4"] } }],
      });
      const response = await fetch(project.outputUrl);
      if (!response.ok) throw new Error(`Could not fetch finished video (${response.status})`);
      const writable = await handle.createWritable();
      try {
        await writable.write(await response.blob());
      } finally {
        await writable.close();
      }
    } catch (error: unknown) {
      // Cancelling the native picker is an expected user choice, not an error.
      if (error instanceof DOMException && error.name === "AbortError") return;
      // Picker save failed — attempt the anchor-download fallback and report
      // the appropriate status to the user.
      let fallbackSucceeded = false;
      try {
        downloadOutput();
        fallbackSucceeded = true;
      } catch {
        /* fallback itself threw */
      }
      setMessage(
        fallbackSucceeded
          ? t("dashboard.showcase.voiceover.saveFallback")
          : t("dashboard.common.kunneIkkeGemmeTilMappen"),
      );
    } finally {
      setSavingOutput(false);
    }
  };

  const status = project?.status;
  const outputUrl = project?.outputUrl;

  // Reset video load state whenever the output URL changes (new export).
  useEffect(() => {
    if (outputUrl) {
      setOutputVideoState("loading");
      setOutputRetryAttempt(0);
    }
  }, [outputUrl]);

  // Explicitly reload the media resource on retry. Bumping the key remounts the
  // <video>, but we also call load() as a belt-and-braces guarantee the browser
  // re-fetches the same URL after a transient failure.
  const retryOutputVideo = useCallback(() => {
    setOutputVideoState("loading");
    setOutputRetryAttempt((attempt) => attempt + 1);
    outputVideoRef.current?.load();
  }, []);

  return (
    <div className="mt-2">
      {!open && !immersive ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          ref={openerRef}
          className="w-full h-11 rounded-xl text-xs font-semibold border border-[#C8956C] text-[#6F4E38] bg-[#FFFDFC] inline-flex items-center justify-center gap-1.5 transition-[transform,background-color,box-shadow] hover:-translate-y-px hover:bg-[#FFF6EF] hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-[#C8956C]/40"
          data-testid="button-add-voiceover"
        >
          <AudioLines className="w-3.5 h-3.5" />
          {t("dashboard.showcase.voiceover.add")}
        </button>
      ) : (
        <BrowserPortal>
        <section
          className={`${(immersive || open) ? "fixed inset-0 z-[80] overflow-y-auto bg-[#152536]/[.94] p-2 sm:p-6" : ""}`}
          aria-label={t("dashboard.showcase.voiceover.title")}
           aria-labelledby="showcase-voiceover-heading"
           aria-modal="true"
           role="dialog"
           ref={dialogRef}
           tabIndex={-1}
        >
          <div className={(immersive || open) ? "mx-auto max-w-6xl rounded-[22px] border border-[#E9DED2] bg-[#F6F1EA] p-4 shadow-2xl sm:rounded-[28px] sm:p-6 space-y-3" : "rounded-xl border border-[#DCC9B9] bg-[#FFFDFC] p-3 space-y-3"}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#A36F4E]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#C8956C]" />
                Voice-over
              </div>
             <h3 id="showcase-voiceover-heading" className="text-sm font-semibold text-[#0F1D2F]">
                {t("dashboard.showcase.voiceover.title")}
              </h3>
              <p className="text-[11px] text-[#6C6964]">
                {t("dashboard.showcase.voiceover.soundNote")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => { stopRecording(); setOpen(false); onRequestClose?.(); }}
               aria-label={t("dashboard.showcase.voiceover.close")}
               className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[#17283A] transition-colors hover:bg-[#F0E7DD] focus:outline-none focus:ring-2 focus:ring-[#C8956C]/40"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {!project && (
            <>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={recording ? stopRecording : startRecording}
                  disabled={busy || finalizingRecording}
                   className="flex-1 h-11 rounded-xl bg-[#0F1D2F] text-white text-xs font-semibold inline-flex justify-center items-center gap-1.5 disabled:opacity-50"
                  data-testid="button-record-voiceover"
                >
                  {finalizingRecording ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : recording ? <Pause className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                  {finalizingRecording
                    ? t("dashboard.showcase.voiceover.savingRecording")
                    : recording
                    ? `${t("dashboard.showcase.voiceover.stop")} ${recordedSeconds}s`
                    : t("dashboard.showcase.voiceover.record")}
                </button>
                 <label className="flex-1 h-11 rounded-xl border border-[#D9D5CF] text-[#0F1D2F] text-xs font-semibold inline-flex justify-center items-center gap-1.5 cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  {t("dashboard.showcase.voiceover.upload")}
                  <input
                    className="sr-only"
                    type="file"
                    accept={ACCEPTED_AUDIO}
                    onChange={(event) => {
                      chooseAudio(event.target.files?.[0] || null);
                      event.currentTarget.value = "";
                    }}
                    data-testid="input-voiceover-upload"
                  />
                </label>
              </div>
              <p className="text-[10px] text-[#77736D]">{t("dashboard.showcase.voiceover.recordHint")}</p>
              {finalizingRecording && (
                <p className="text-[10px] text-[#855F45]" role="status" aria-live="polite">
                  {t("dashboard.showcase.voiceover.recordingEnding")}
                </p>
              )}
              {audioUrl && (
                <div className="flex items-center gap-2 rounded-lg bg-[#F4EEE8] p-2">
                  <audio src={audioUrl} controls className="min-w-0 flex-1 h-8" />
                  <button
                    type="button"
                    onClick={clearLocalAudio}
                    aria-label={t("dashboard.showcase.voiceover.removeAudio")}
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-[#EDE3D9] focus:outline-none focus:ring-2 focus:ring-[#C8956C]/40"
                  >
                    <Trash2 className="w-4 h-4 text-[#855F45]" />
                  </button>
                </div>
              )}
              <p className="text-[10px] leading-relaxed text-[#6C6964]">{t("dashboard.showcase.voiceover.cleaningNote")}</p>
              <button
                type="button"
                onClick={upload}
                disabled={!audio || busy}
                 className="w-full h-11 rounded-xl bg-[#C8956C] text-white text-xs font-semibold disabled:opacity-45"
                data-testid="button-upload-voiceover"
              >
                {busy ? t("dashboard.showcase.voiceover.preparing") : t("dashboard.showcase.voiceover.continue")}
              </button>
            </>
          )}

          {project && (status === "processing" || status === "exporting") && (
            <div className="rounded-lg bg-[#F4EEE8] p-3 text-xs text-[#4D4943] flex items-center gap-2" role="status" aria-live="polite">
              <Loader2 className="w-4 h-4 animate-spin" />
              {status === "exporting" ? t("dashboard.showcase.voiceover.exporting") : t("dashboard.showcase.voiceover.processing")}
            </div>
          )}

          {project && status === "failed" && (
            <div className="space-y-2">
              <p className="text-xs text-[#A34D43]" role="alert">{t("dashboard.showcase.voiceover.failed")}</p>
              <button type="button" onClick={retry} disabled={busy} className="h-8 px-3 rounded-lg border text-xs font-semibold">
                <RotateCcw className="w-3 h-3 inline mr-1" />{t("dashboard.showcase.voiceover.retry")}
              </button>
            </div>
          )}

          {project && status === "review" && (
            <div className="space-y-2">
              <p className="text-[11px] text-[#6C6964]">{t("dashboard.showcase.voiceover.reviewHint")}</p>
              {project.segments.map((segment, index) => (
                <div key={segment.id} className={`flex gap-2 items-start ${segment.hidden ? "opacity-50" : ""}`}>
                  <span className="font-mono text-[10px] pt-2 text-[#855F45] w-10">
                    {Math.floor(segment.start / 60)}:{String(Math.floor(segment.start % 60)).padStart(2, "0")}
                  </span>
                  <textarea
                    value={segment.text}
                    onChange={(event) => updateSegment(index, { text: event.target.value })}
                    maxLength={240}
                    className="flex-1 min-h-8 rounded border border-[#E1DAD2] p-1.5 text-xs resize-y"
                    aria-label={t("dashboard.showcase.voiceover.captionLabel", { time: segment.start })}
                    data-testid={`input-caption-${index}`}
                  />
                  <button type="button" onClick={() => updateSegment(index, { hidden: !segment.hidden })} className="text-[10px] pt-2 underline">
                    {segment.hidden ? t("dashboard.showcase.voiceover.show") : t("dashboard.showcase.voiceover.hide")}
                  </button>
                </div>
              ))}
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={project.subtitlesEnabled} onChange={(event) => setProject({ ...project, subtitlesEnabled: event.target.checked })} />
                {t("dashboard.showcase.voiceover.subtitles")}
              </label>
              {/* Caption style editor — shown when subtitles are enabled */}
              {project.subtitlesEnabled && (
                <RendyCaptionStyleEditor
                  previewVideoUrl={project.sourceUrl ?? sourceVideoUrl}
                  sampleText={project.segments.find((s) => !s.hidden)?.text ?? t("dashboard.showcase.captionStyle.sampleText")}
                  value={captionStyle}
                  onChange={setCaptionStyle}
                />
              )}
              <div className="flex gap-2">
                <button type="button" onClick={reset} className="flex-1 h-9 rounded-lg border text-xs font-semibold">
                  <RotateCcw className="w-3 h-3 inline mr-1" />{t("dashboard.showcase.voiceover.replace")}
                </button>
                <button type="button" onClick={exportProject} disabled={busy} className="flex-1 h-9 rounded-lg bg-[#C8956C] text-white text-xs font-semibold" data-testid="button-export-voiceover">
                  {busy ? t("dashboard.showcase.voiceover.exporting") : t("dashboard.showcase.voiceover.export")}
                </button>
              </div>
            </div>
          )}

          {project && status === "ready" && project.outputUrl && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#385B49]" role="status" aria-live="polite">
                <Check className="w-4 h-4" />{t("dashboard.showcase.voiceover.ready")}
              </div>

              {/* Output video with explicit loading / ready / error states */}
              <div className="relative w-full rounded-lg overflow-hidden bg-black">
                {outputVideoState === "loading" && (
                  <div
                    className="absolute inset-0 flex items-center justify-center bg-black/60"
                    role="status"
                    aria-live="polite"
                    aria-label={t("dashboard.common.indlaeser2")}
                  >
                    <Loader2 className="w-6 h-6 text-white animate-spin" />
                  </div>
                )}
                {outputVideoState === "error" && (
                  <div
                    className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 p-4"
                    role="alert"
                    aria-live="assertive"
                  >
                    <p className="text-xs text-white/90 text-center">
                      {t("dashboard.common.forbindelsesfejlProevIgen")}
                    </p>
                    <button
                      type="button"
                      onClick={retryOutputVideo}
                      className="h-8 px-3 rounded-lg border border-white/40 text-xs text-white font-semibold inline-flex items-center gap-1.5 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/40"
                    >
                      <RotateCcw className="w-3 h-3" />
                      {t("dashboard.common.proevIgen")}
                    </button>
                  </div>
                )}
                <video
                  key={`${project.outputUrl}#${outputRetryAttempt}`}
                  ref={outputVideoRef}
                  src={project.outputUrl}
                  controls
                  playsInline
                  preload="metadata"
                  className="w-full"
                  data-testid="video-voiceover-final"
                  onLoadedMetadata={() => setOutputVideoState("ready")}
                  onCanPlay={() => setOutputVideoState("ready")}
                  onError={() => setOutputVideoState("error")}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={reset} className="col-span-2 h-11 rounded-xl border bg-[#FFFDFC] text-xs font-semibold transition-colors hover:bg-[#F0E7DD]">
                  <RotateCcw className="w-3 h-3 inline mr-1" />{t("dashboard.showcase.voiceover.replace")}
                </button>
                <button
                  type="button"
                  onClick={saveOutputToFolder}
                  disabled={savingOutput}
                  className="h-11 rounded-xl bg-[#C8956C] text-white text-xs font-semibold inline-flex justify-center items-center gap-1.5 disabled:opacity-50"
                  data-testid="button-save-voiceover"
                >
                  {savingOutput ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FolderDown className="w-3.5 h-3.5" />}
                  {savingOutput ? t("dashboard.showcase.voiceover.saving") : t("dashboard.showcase.voiceover.saveToFolder")}
                </button>
                <button type="button" onClick={downloadOutput} className="h-11 rounded-xl bg-[#0F1D2F] text-white text-xs font-semibold inline-flex justify-center items-center gap-1.5" data-testid="link-download-voiceover">
                  <Download className="w-3.5 h-3.5" />{t("dashboard.showcase.voiceover.download")}
                </button>
              </div>
            </div>
          )}
          {message && <p className="text-[11px] text-[#A34D43]" role="alert" aria-live="assertive">{message}</p>}
          </div>
        </section>
        </BrowserPortal>
      )}
    </div>
  );
}