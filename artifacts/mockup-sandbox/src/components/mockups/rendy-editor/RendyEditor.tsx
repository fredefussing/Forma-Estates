import { useEffect, useLayoutEffect, useRef, useState, type DragEvent } from 'react';
import {
  ArrowLeft, Check, CheckCircle2, ChevronLeft, ChevronRight, Circle,
  Clock3, Film, GripVertical, LoaderCircle, Maximize2, Mic2, Pause,
  Play, Plus, RotateCcw, Save, Sparkles, Trash2, Undo2, Upload, Volume2,
  ZoomIn, ZoomOut,
} from 'lucide-react';

type Stage = 'delivery' | 'editor' | 'analyzing' | 'saved' | 'voiceover';
type VoiceoverMode = 'ready' | 'recording' | 'recorded' | 'uploaded';

type Clip = {
  id: string;
  image: string;
  video: string;
  title: string;
  duration: string;
  seconds: number;
  time: string;
  speed: number;
  source: string;
};

type Output = {
  id: string;
  title: string;
  preset: string;
  poster: string;
  previewVideo: string;
  duration: string;
  usedIds: string[];
};

const clipsSeed: Clip[] = [
  { id: '01', image: 'rendy-clip-01.jpg', video: 'rendy-clip-01.webm', title: 'Garden path', duration: '2.4s', seconds: 2.4, time: '00:12', speed: 1, source: 'Premiere' },
  { id: '02', image: 'rendy-clip-02.jpg', video: 'rendy-clip-02.webm', title: 'Entry landing', duration: '1.9s', seconds: 1.9, time: '00:15', speed: 1, source: 'Premiere' },
  { id: '03', image: 'rendy-clip-03.jpg', video: 'rendy-clip-03.webm', title: 'Living room', duration: '2.1s', seconds: 2.1, time: '00:04', speed: 1, source: 'Riviera' },
  { id: '04', image: 'rendy-clip-04.jpg', video: 'rendy-clip-04.webm', title: 'Dining room', duration: '2.2s', seconds: 2.2, time: '00:04', speed: 1, source: 'Premiere' },
  { id: '05', image: 'rendy-clip-05.jpg', video: 'rendy-clip-05.webm', title: 'Kitchen', duration: '2.2s', seconds: 2.2, time: '00:06', speed: 1, source: 'Premiere' },
  { id: '06', image: 'rendy-clip-06.jpg', video: 'rendy-clip-06.webm', title: 'Bedroom', duration: '2.0s', seconds: 2.0, time: '00:09', speed: 1, source: 'Premiere' },
  { id: '07', image: 'rendy-clip-07.jpg', video: 'rendy-clip-07.webm', title: 'Bathroom', duration: '2.3s', seconds: 2.3, time: '00:17', speed: 1, source: 'Premiere' },
  { id: '08', image: 'rendy-clip-08.jpg', video: 'rendy-clip-08.webm', title: 'Pantry', duration: '2.2s', seconds: 2.2, time: '00:20', speed: 1, source: 'Premiere' },
  { id: '09', image: 'rendy-clip-09.jpg', video: 'rendy-clip-09.webm', title: 'Hallway', duration: '2.2s', seconds: 2.2, time: '00:23', speed: 1, source: 'Premiere' },
  { id: '10', image: 'rendy-clip-10.jpg', video: 'rendy-clip-10.webm', title: 'Staircase', duration: '2.4s', seconds: 2.4, time: '00:34', speed: 1, source: 'Premiere' },
  { id: '11', image: 'rendy-clip-11.jpg', video: 'rendy-clip-11.webm', title: 'Sunroom', duration: '1.8s', seconds: 1.8, time: '00:00', speed: 1, source: 'Premiere' },
  { id: '12', image: 'rendy-clip-12.jpg', video: 'rendy-clip-12.webm', title: 'Home office', duration: '2.3s', seconds: 2.25, time: '00:18', speed: 1, source: 'Riviera' },
];

const outputs: Output[] = [
  { id: 'rendy-01', title: 'Global', preset: 'Original Rendy delivery', poster: 'rendy-output-01.jpg', previewVideo: 'rendy-output-01.webm', duration: '00:08.6', usedIds: ['03', '10', '12', '09'] },
  { id: 'rendy-02', title: 'Tea Cup', preset: 'Original Rendy delivery', poster: 'rendy-output-02.jpg', previewVideo: 'rendy-output-02.webm', duration: '00:19.7', usedIds: ['06', '04', '03', '10', '09', '07', '02', '01', '12'] },
  { id: 'rendy-03', title: 'Summer in Ibiza', preset: 'Original Rendy delivery', poster: 'rendy-output-03.jpg', previewVideo: 'rendy-output-03.webm', duration: '00:13.8', usedIds: ['07', '08', '12', '11', '02', '10', '06'] },
  { id: 'rendy-04', title: 'Riviera', preset: 'Original Rendy delivery', poster: 'rendy-output-04.jpg', previewVideo: 'rendy-output-04.webm', duration: '00:30.7', usedIds: ['01', '03', '04', '10', '11', '06', '12', '07', '05', '09'] },
  { id: 'rendy-05', title: 'Beety', preset: 'Original Rendy delivery', poster: 'rendy-output-05.jpg', previewVideo: 'rendy-output-05.webm', duration: '00:20.3', usedIds: ['12', '07', '10', '09', '04', '05', '03', '02'] },
  { id: 'rendy-06', title: 'Premiere', preset: 'Original Rendy delivery', poster: 'rendy-output-06.jpg', previewVideo: 'rendy-output-06.webm', duration: '00:40.0', usedIds: ['11', '04', '05', '06', '01', '02', '07', '08', '09', '10', '03'] },
];

const asset = (file: string, kind: 'images' | 'videos') => `/__mockup/${kind}/rendy-editor/${file}`;

function formatDuration(seconds: number) {
  return `${seconds.toFixed(1)}s`;
}

function formatRecording(seconds: number) {
  return `00:${String(seconds).padStart(2, '0')}`;
}

type FrameSignature = { luma: number; contrast: number };

function waitForMediaEvent(video: HTMLVideoElement, event: 'loadedmetadata' | 'seeked') {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener(event, done);
      video.removeEventListener('error', failed);
    };
    const done = () => { cleanup(); resolve(); };
    const failed = () => { cleanup(); reject(new Error(`Could not read video ${event}`)); };
    video.addEventListener(event, done, { once: true });
    video.addEventListener('error', failed, { once: true });
  });
}

async function readFrameSignature(src: string, edge: 'entry' | 'exit'): Promise<FrameSignature> {
  const video = document.createElement('video');
  video.muted = true;
  video.preload = 'auto';
  video.playsInline = true;
  video.src = src;
  await waitForMediaEvent(video, 'loadedmetadata');

  const targetTime = edge === 'entry'
    ? Math.min(0.28, Math.max(0.08, video.duration * 0.15))
    : Math.max(0.08, video.duration - 0.28);
  video.currentTime = targetTime;
  await waitForMediaEvent(video, 'seeked');

  const canvas = document.createElement('canvas');
  canvas.width = 40;
  canvas.height = 72;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas analysis is unavailable');
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;

  let lumaTotal = 0;
  let lumaSquaredTotal = 0;
  const count = pixels.length / 4;
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const luma = 0.2126 * pixels[offset] + 0.7152 * pixels[offset + 1] + 0.0722 * pixels[offset + 2];
    lumaTotal += luma;
    lumaSquaredTotal += luma * luma;
  }

  const luma = lumaTotal / count;
  const contrast = Math.sqrt(Math.max(0, lumaSquaredTotal / count - luma * luma));
  video.pause();
  video.removeAttribute('src');
  video.load();
  return { luma, contrast };
}

async function analyzeTransitionPlan(clips: Clip[], onProgress: (completed: number, total: number) => void) {
  const edgeSignatures: Array<{ entry: FrameSignature; exit: FrameSignature } | null> = [];
  const total = clips.length * 2;
  let completed = 0;

  for (const clip of clips) {
    try {
      const [entry, exit] = await Promise.all([
        readFrameSignature(asset(clip.video, 'videos'), 'entry'),
        readFrameSignature(asset(clip.video, 'videos'), 'exit'),
      ]);
      edgeSignatures.push({ entry, exit });
    } catch {
      edgeSignatures.push(null);
    } finally {
      completed += 2;
      onProgress(completed, total);
    }
  }

  return clips.map((_, index) => {
    if (index === 0 || !edgeSignatures[index - 1] || !edgeSignatures[index]) return 460;
    const previous = edgeSignatures[index - 1]!;
    const next = edgeSignatures[index]!;
    const visualGap = Math.abs(previous.exit.luma - next.entry.luma) + Math.abs(previous.exit.contrast - next.entry.contrast) * 0.45;
    return Math.round(Math.min(620, Math.max(420, 420 + visualGap * 1.35)));
  });
}

type SmoothVideoPreviewProps = {
  src: string;
  poster: string;
  speed?: number;
  isPlaying: boolean;
  loop?: boolean;
  onEnded?: () => void;
  onNearEnd?: () => void;
  onTransitionComplete?: () => void;
  transitionMs?: number;
  preloadSources?: string[];
};

function SmoothVideoPreview({
  src,
  poster,
  speed = 1,
  isPlaying,
  loop = false,
  onEnded,
  onNearEnd,
  onTransitionComplete,
  transitionMs = 460,
  preloadSources = [],
}: SmoothVideoPreviewProps) {
  type Source = { key: string; src: string; poster: string; speed: number };
  type PendingTransition = { token: number; incomingSlot: 0 | 1 };

  const source = { key: `${src}|${poster}|${speed}`, src, poster, speed };
  const slotZeroRef = useRef<HTMLVideoElement>(null);
  const slotOneRef = useRef<HTMLVideoElement>(null);
  const activeSlotRef = useRef<0 | 1>(0);
  const isPlayingRef = useRef(isPlaying);
  const requestTokenRef = useRef(0);
  const transitionTimerRef = useRef<number | undefined>(undefined);
  const nearEndSourceKeyRef = useRef<string | null>(null);
  const initialLayers: [Source, Source] = [source, source];
  const layersRef = useRef<[Source, Source]>(initialLayers);
  const [activeSlot, setActiveSlot] = useState<0 | 1>(0);
  const [layers, setLayers] = useState<[Source, Source]>(initialLayers);
  const [pending, setPending] = useState<PendingTransition | null>(null);
  const [transition, setTransition] = useState<PendingTransition | null>(null);

  isPlayingRef.current = isPlaying;

  const videoForSlot = (slot: 0 | 1) => (slot === 0 ? slotZeroRef.current : slotOneRef.current);

  useEffect(() => {
    activeSlotRef.current = activeSlot;
    nearEndSourceKeyRef.current = null;
  }, [activeSlot]);

  useEffect(() => {
    const warmups = preloadSources
      .filter((candidate) => candidate && candidate !== src)
      .map((candidate) => {
        const video = document.createElement('video');
        video.muted = true;
        video.preload = 'auto';
        video.src = candidate;
        video.load();
        return video;
      });

    return () => {
      warmups.forEach((video) => {
        video.pause();
        video.removeAttribute('src');
        video.load();
      });
    };
  }, [preloadSources.join('|'), src]);

  useLayoutEffect(() => {
    const currentActive = layersRef.current[activeSlotRef.current];
    if (currentActive.key === source.key) {
      requestTokenRef.current += 1;
      if (transitionTimerRef.current) window.clearTimeout(transitionTimerRef.current);
      setPending(null);
      setTransition(null);
      return;
    }

    requestTokenRef.current += 1;
    if (transitionTimerRef.current) window.clearTimeout(transitionTimerRef.current);
    setTransition(null);

    const incomingSlot = activeSlotRef.current === 0 ? 1 : 0;
    const abandoned = videoForSlot(incomingSlot);
    abandoned?.pause();
    if (abandoned) abandoned.currentTime = 0;

    const nextLayers = [...layersRef.current] as [Source, Source];
    nextLayers[incomingSlot] = source;
    layersRef.current = nextLayers;
    setLayers(nextLayers);
    setPending({ token: requestTokenRef.current, incomingSlot });
  }, [source.key]);

  useEffect(() => {
    if (!pending) return;
    const incoming = videoForSlot(pending.incomingSlot);
    if (!incoming) return;

    let cancelled = false;
    let started = false;
    const beginTransition = async () => {
      if (started || cancelled || requestTokenRef.current !== pending.token) return;
      started = true;
      const incomingSource = layersRef.current[pending.incomingSlot];
      incoming.playbackRate = incomingSource.speed;
      if (isPlayingRef.current) {
        await incoming.play().catch(() => undefined);
        if ('requestVideoFrameCallback' in incoming) {
          await new Promise<void>((resolve) => {
            let settled = false;
            const finish = () => {
              if (settled) return;
              settled = true;
              window.clearTimeout(fallbackTimer);
              resolve();
            };
            const fallbackTimer = window.setTimeout(finish, 160);
            incoming.requestVideoFrameCallback(finish);
          });
        }
      }
      if (cancelled || requestTokenRef.current !== pending.token) return;

      setTransition(pending);
      transitionTimerRef.current = window.setTimeout(() => {
        if (cancelled || requestTokenRef.current !== pending.token) return;
        const outgoingSlot = activeSlotRef.current;
        const outgoing = videoForSlot(outgoingSlot);
        outgoing?.pause();
        if (outgoing) outgoing.currentTime = 0;
        activeSlotRef.current = pending.incomingSlot;
        setActiveSlot(pending.incomingSlot);
        setPending(null);
        setTransition(null);
        onTransitionComplete?.();
      }, transitionMs);
    };

    incoming.addEventListener('canplay', beginTransition, { once: true });
    incoming.load();
    if (incoming.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) void beginTransition();

    return () => {
      cancelled = true;
      incoming.removeEventListener('canplay', beginTransition);
      if (transitionTimerRef.current) window.clearTimeout(transitionTimerRef.current);
    };
  }, [pending, transitionMs]);

  useEffect(() => {
    const active = videoForSlot(activeSlot);
    const incoming = transition ? videoForSlot(transition.incomingSlot) : null;
    if (isPlaying) {
      if (active) void active.play().catch(() => undefined);
      if (incoming) void incoming.play().catch(() => undefined);
    } else {
      active?.pause();
      incoming?.pause();
    }
  }, [activeSlot, isPlaying, transition]);

  useEffect(() => () => {
    if (transitionTimerRef.current) window.clearTimeout(transitionTimerRef.current);
  }, []);

  const renderVideoLayer = (slot: 0 | 1) => {
    const layerSource = layers[slot];
    const isActive = slot === activeSlot;
    const isIncoming = transition?.incomingSlot === slot;
    return (
      <video
        ref={slot === 0 ? slotZeroRef : slotOneRef}
        className={`${isActive ? 'is-active' : ''} ${isIncoming ? 'is-incoming' : ''}`}
        style={{ zIndex: isIncoming ? 2 : isActive ? 1 : 0 }}
        src={layerSource.src}
        poster={layerSource.poster}
        autoPlay={isPlaying && isActive}
        muted
        playsInline
        loop={loop}
        preload="auto"
        onLoadedMetadata={(event) => {
          event.currentTarget.playbackRate = layerSource.speed;
          event.currentTarget.muted = true;
          event.currentTarget.defaultMuted = true;
        }}
        onCanPlay={(event) => {
          const video = event.currentTarget;
          video.muted = true;
          video.defaultMuted = true;
          if (isActive && isPlayingRef.current) void video.play().catch(() => undefined);
        }}
        onTimeUpdate={(event) => {
          if (!isActive || !onNearEnd || loop || pending || transition) return;
          const video = event.currentTarget;
          if (!Number.isFinite(video.duration) || video.duration <= 0) return;
          const leadTime = Math.max(0.7, transitionMs / 1000 + 0.24);
          const remaining = video.duration - video.currentTime;
          if (remaining > leadTime || remaining < 0.04 || nearEndSourceKeyRef.current === layerSource.key) return;
          nearEndSourceKeyRef.current = layerSource.key;
          onNearEnd();
        }}
        onEnded={isActive ? onEnded : undefined}
      />
    );
  };

  return (
    <div className={`preview-video-stack ${transition ? 'is-transitioning' : ''}`} style={{ ['--transition-ms' as string]: `${transitionMs}ms` }}>
      {renderVideoLayer(0)}
      {renderVideoLayer(1)}
    </div>
  );
}

export function RendyEditor() {
  const [stage, setStage] = useState<Stage>('delivery');
  const [selectedOutputId, setSelectedOutputId] = useState(outputs[0].id);
  const [preparationProgress, setPreparationProgress] = useState(0);
  const [preparationStep, setPreparationStep] = useState('Reading the six Rendy outputs');
  const [preparationDone, setPreparationDone] = useState(false);
  const [timelineIds, setTimelineIds] = useState(outputs[0].usedIds);
  const [selectedId, setSelectedId] = useState('01');
  const [dragged, setDragged] = useState<string | null>(null);
  const [deleted, setDeleted] = useState<{ id: string; index: number } | null>(null);
  const [zoom, setZoom] = useState(100);
  const [savedIndex, setSavedIndex] = useState(0);
  const [transitionTargetIndex, setTransitionTargetIndex] = useState<number | null>(null);
  const [sequenceRunId, setSequenceRunId] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [saveNotice, setSaveNotice] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [transitionPlan, setTransitionPlan] = useState<number[]>([]);
  const [voiceoverMode, setVoiceoverMode] = useState<VoiceoverMode>('ready');
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [voiceoverUrl, setVoiceoverUrl] = useState<string | null>(null);
  const [voiceoverName, setVoiceoverName] = useState<string | null>(null);
  const [voiceoverError, setVoiceoverError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const outputPreviewRefs = useRef<Record<string, HTMLVideoElement | null>>({});

  const selectedOutput = outputs.find((output) => output.id === selectedOutputId) ?? outputs[0];
  const library = clipsSeed;
  const timeline = timelineIds.map((id) => library.find((clip) => clip.id === id)).filter(Boolean) as Clip[];
  const selected = library.find((clip) => clip.id === selectedId) ?? timeline[0] ?? library[0];
  const renderedSequenceIndex = transitionTargetIndex ?? savedIndex;
  const previewClip = stage === 'delivery'
    ? undefined
    : stage === 'editor'
      ? library.find((clip) => clip.id === selectedId) ?? timeline[0]
      : timeline[renderedSequenceIndex] ?? timeline[0];
  const durationSeconds = timeline.reduce((total, clip) => total + clip.seconds / clip.speed, 0);
  const duration = formatDuration(durationSeconds);
  const cardWidth = Math.round(110 * zoom / 100);
  const sequencePreviewSources = timeline.map((clip) => asset(clip.video, 'videos'));

  useEffect(() => {
    let progress = 0;
    let timer: number | undefined;
    const steps = [
      'Reading the six Rendy outputs',
      'Finding unique shots across the delivery',
      'Selecting the best available take',
      'Preparing the edit room',
    ];
    timer = window.setInterval(() => {
      progress = Math.min(100, progress + 7);
      setPreparationProgress(progress);
      setPreparationStep(steps[Math.min(steps.length - 1, Math.floor(progress / 26))]);
      if (progress >= 100) {
        if (timer) window.clearInterval(timer);
        window.setTimeout(() => setPreparationDone(true), 180);
      }
    }, 180);
    return () => { if (timer) window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (voiceoverMode !== 'recording') return;
    const timer = window.setInterval(() => setRecordingSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [voiceoverMode]);

  useEffect(() => {
    if (stage !== 'analyzing') return;
    let cancelled = false;
    const savedTimeline = [...timeline];
    setAnalysisProgress(0);
    setSaveNotice(false);

    void analyzeTransitionPlan(savedTimeline, (completed, total) => {
      if (!cancelled) setAnalysisProgress(Math.round((completed / total) * 100));
    }).then((plan) => {
      if (cancelled) return;
      setTransitionPlan(plan);
      setSavedIndex(0);
      setTransitionTargetIndex(null);
      setSequenceRunId((current) => current + 1);
      setIsPlaying(true);
      setStage('saved');
      setSaveNotice(true);
      window.setTimeout(() => setSaveNotice(false), 5200);
    });

    return () => { cancelled = true; };
  }, [stage]);

  useEffect(() => {
    if (stage !== 'delivery') return;
    const video = outputPreviewRefs.current[selectedOutputId];
    if (!video) return;

    let cancelled = false;
    const startPreview = () => {
      if (cancelled) return;
      video.muted = true;
      video.defaultMuted = true;
      video.currentTime = 0;
      void video.play().catch(() => undefined);
    };

    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) startPreview();
    else video.addEventListener('canplay', startPreview, { once: true });

    return () => {
      cancelled = true;
      video.removeEventListener('canplay', startPreview);
    };
  }, [selectedOutputId, stage]);

  function chooseOutput(output: Output) {
    setSelectedOutputId(output.id);
    setTimelineIds(output.usedIds);
    setSelectedId(output.usedIds[0]);
    setStage('delivery');
    setSavedIndex(0);
    setTransitionTargetIndex(null);
    setIsPlaying(true);
    setSaveNotice(false);
    setTransitionPlan([]);
  }

  function openEditor() {
    if (!preparationDone) return;
    setStage('editor');
    setSavedIndex(0);
    setSelectedId(timelineIds[0] ?? library[0].id);
    setIsPlaying(true);
  }

  function reorder(targetId: string) {
    if (!dragged || dragged === targetId) return;
    const from = timelineIds.indexOf(dragged);
    const to = timelineIds.indexOf(targetId);
    if (from < 0 || to < 0) return;
    const next = [...timelineIds];
    next.splice(to, 0, next.splice(from, 1)[0]);
    setTimelineIds(next);
    setDragged(null);
    setStage('editor');
    setSavedIndex(0);
  }

  function removeClip(id: string) {
    const index = timelineIds.indexOf(id);
    if (index < 0) return;
    const next = timelineIds.filter((clipId) => clipId !== id);
    setDeleted({ id, index });
    setTimelineIds(next);
    setSelectedId(next[0] ?? '');
    setStage('editor');
    setSavedIndex(0);
  }

  function undoDelete() {
    if (!deleted) return;
    const next = [...timelineIds];
    next.splice(deleted.index, 0, deleted.id);
    setTimelineIds(next);
    setSelectedId(deleted.id);
    setDeleted(null);
  }

  function addClip(id: string) {
    if (timelineIds.includes(id)) return;
    setTimelineIds((current) => [...current, id]);
    setSelectedId(id);
    setStage('editor');
    setSavedIndex(0);
  }

  function saveSequence() {
    if (!timeline.length) return;
    setSavedIndex(0);
    setTransitionTargetIndex(null);
    setIsPlaying(false);
    setDeleted(null);
    setStage('analyzing');
  }

  function nextSequence() {
    if (!timeline.length) return;
    requestSequenceIndex((savedIndex + 1) % timeline.length);
  }

  function requestSequenceIndex(index: number) {
    if (!timeline.length || transitionTargetIndex !== null || index < 0 || index >= timeline.length || index === savedIndex) return;
    setTransitionTargetIndex(index);
  }

  function advanceSavedSequence() {
    if (savedIndex < timeline.length - 1) requestSequenceIndex(savedIndex + 1);
  }

  function completeSequenceTransition() {
    if (transitionTargetIndex === null) return;
    setSavedIndex(transitionTargetIndex);
    setTransitionTargetIndex(null);
  }

  function restartSequence() {
    setSavedIndex(0);
    setTransitionTargetIndex(null);
    setSequenceRunId((current) => current + 1);
    setIsPlaying(true);
  }

  function handleSequenceEnded() {
    if (transitionTargetIndex === null && savedIndex >= timeline.length - 1) setIsPlaying(false);
  }

  function startVoiceover() {
    setStage('voiceover');
    setVoiceoverMode('ready');
    setRecordingSeconds(0);
    setVoiceoverError(null);
    setSavedIndex(0);
    setTransitionTargetIndex(null);
    setIsPlaying(true);
  }

  function attachAudio(file: File, mode: 'recorded' | 'uploaded') {
    if (!file.type.startsWith('audio/')) {
      setVoiceoverError('Choose an audio file to attach it to this edited video.');
      return;
    }
    if (voiceoverUrl) URL.revokeObjectURL(voiceoverUrl);
    setVoiceoverUrl(URL.createObjectURL(file));
    setVoiceoverName(file.name);
    setVoiceoverMode(mode);
    setVoiceoverError(null);
  }

  async function toggleRecording() {
    if (voiceoverMode === 'recording') {
      recorderRef.current?.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setVoiceoverError('This browser cannot record audio. Upload an audio file instead.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        recorderRef.current = null;
        const audio = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        if (!audio.size) {
          setVoiceoverMode('ready');
          setVoiceoverError('No audio was captured. Please try recording again.');
          return;
        }
        attachAudio(new File([audio], 'recorded-voice-over.webm', { type: audio.type }), 'recorded');
      };
      setRecordingSeconds(0);
      setVoiceoverMode('recording');
      setVoiceoverError(null);
      recorder.start();
    } catch {
      setVoiceoverError('Microphone access was not granted. You can upload an audio file instead.');
    }
  }

  function onAudioUpload(file?: File) {
    if (file) attachAudio(file, 'uploaded');
  }

  const onDrop = (event: DragEvent<HTMLButtonElement>, id: string) => {
    event.preventDefault();
    reorder(id);
  };

  const previewSrc = stage === 'delivery' ? asset(selectedOutput.previewVideo, 'videos') : asset(previewClip?.video ?? 'rendy-clip-01.webm', 'videos');
  const previewPoster = stage === 'delivery'
    ? asset(selectedOutput.poster, 'videos')
    : asset(previewClip?.image ?? 'rendy-clip-01.jpg', 'videos');
  const previewLabel = stage === 'delivery'
    ? 'Original Rendy delivery'
    : stage === 'editor'
      ? 'Edit preview'
      : stage === 'saved'
        ? 'New edited video'
        : 'Voice-over source';

  return (
    <main className="rendy-editor">
      <style>{`
        .rendy-editor { --canvas:#121513; --surface:#1d211e; --surface-2:#272c28; --surface-3:#303630; --line:#3b433c; --soft:#a8aea5; --cream:#f1ede2; --accent:#d7c17f; --green:#9fc694; --danger:#d88173; min-height:100dvh; background:radial-gradient(circle at 34% -18%,#3a463c 0,transparent 42%),var(--canvas); color:var(--cream); font-family:Outfit,ui-sans-serif,system-ui,sans-serif; letter-spacing:.005em; padding:16px; }
        .rendy-editor * { box-sizing:border-box; } .rendy-editor button { font:inherit; }
        .topbar { max-width:1510px; height:58px; padding:0 10px 0 18px; margin:0 auto 14px; display:flex; align-items:center; justify-content:space-between; border:1px solid var(--line); border-radius:12px; background:rgba(29,33,30,.95); }
        .identity,.top-actions,.studio-meta,.preview-controls,.film-toolbar,.clip-meta,.delivery-meta,.progress-row,.flow-step,.voice-actions { display:flex; align-items:center; }
        .identity { gap:15px; }.monogram { display:grid; place-items:center; width:27px; height:27px; border:1px solid var(--accent); color:var(--accent); border-radius:50%; font-family:Georgia,serif; font-size:17px; }.identity strong { font-size:13px; letter-spacing:.06em; }.identity span,.crumb,.muted { color:var(--soft); font-size:11px; }.crumb { margin-left:12px; padding-left:14px; border-left:1px solid var(--line); }.top-actions { gap:9px; }
        .minimal,.save,.primary-action,.secondary-action,.icon-button,.output-card,.library-card,.clip,.add,.voice-button { border:0; cursor:pointer; transition:transform .18s ease,background .18s ease,border-color .18s ease,color .18s ease,opacity .18s ease; }.minimal { color:var(--soft); background:transparent; padding:9px 12px; font-size:11px; }.minimal:hover { color:var(--cream); background:var(--surface-3); }.save,.primary-action { display:flex; align-items:center; justify-content:center; gap:8px; padding:10px 14px; color:#20221c; background:var(--accent); font-size:11px; font-weight:700; border-radius:7px; }.save:hover,.primary-action:hover { transform:translateY(-1px); background:#e5d495; }.save:disabled,.primary-action:disabled { cursor:not-allowed; opacity:.45; transform:none; }
        .studio { max-width:1510px; margin:auto; min-height:calc(100dvh - 104px); border:1px solid var(--line); border-radius:14px; overflow:hidden; background:var(--surface); box-shadow:0 24px 70px rgba(0,0,0,.24); }.studio-head { min-height:67px; padding:14px 26px; display:flex; align-items:center; justify-content:space-between; gap:14px; border-bottom:1px solid var(--line); }.studio-meta { gap:13px; }.tag { color:var(--accent); font-size:10px; font-weight:700; letter-spacing:.16em; text-transform:uppercase; }.studio-meta h1 { margin:0; font-size:16px; font-weight:550; }.dot { width:4px; height:4px; background:var(--soft); border-radius:50%; }.format { color:var(--soft); font-size:10px; letter-spacing:.11em; white-space:nowrap; }
        .delivery { padding:30px 32px 38px; }.delivery-intro { max-width:750px; margin-bottom:26px; }.eyebrow { display:flex; align-items:center; gap:8px; margin-bottom:10px; color:var(--green); font-size:10px; font-weight:700; letter-spacing:.14em; text-transform:uppercase; }.delivery-intro h2 { margin:0 0 9px; font-family:Georgia,serif; font-size:32px; font-weight:400; letter-spacing:-.025em; }.delivery-intro p { max-width:680px; margin:0; color:var(--soft); font-size:13px; line-height:1.65; }
        .prep-card { display:flex; align-items:center; gap:19px; margin-bottom:27px; padding:17px 19px; border:1px solid #465246; border-radius:10px; background:linear-gradient(100deg,rgba(64,78,63,.72),rgba(39,48,40,.72)); }.prep-icon { display:grid; place-items:center; flex:none; width:39px; height:39px; border-radius:50%; color:var(--accent); background:rgba(215,193,127,.12); }.prep-icon.ready { color:var(--green); background:rgba(159,198,148,.12); }.prep-copy { flex:1; min-width:0; }.prep-copy strong { display:block; font-size:12px; font-weight:600; }.prep-copy span { display:block; margin-top:4px; color:#bac3b8; font-size:10px; }.progress-row { gap:13px; margin-top:10px; }.progress-track { height:5px; flex:1; overflow:hidden; border-radius:10px; background:#1e261f; }.progress-track > span { display:block; height:100%; border-radius:inherit; background:var(--accent); transition:width .2s ease; }.progress-number { min-width:32px; color:var(--accent); font-size:10px; text-align:right; font-variant-numeric:tabular-nums; }.prep-ready { display:flex; align-items:center; gap:7px; flex:none; padding:8px 10px; border:1px solid #60735f; border-radius:6px; color:var(--green); font-size:10px; }
        .outputs-head { display:flex; align-items:end; justify-content:space-between; gap:15px; margin-bottom:13px; }.outputs-head h3 { margin:0; font-size:13px; font-weight:600; }.outputs-head span { color:var(--soft); font-size:10px; }.output-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; }.output-card { position:relative; overflow:hidden; padding:0; text-align:left; border:1px solid var(--line); border-radius:9px; color:var(--cream); background:var(--surface-2); }.output-card:hover { border-color:#73806e; transform:translateY(-2px); }.output-card.active { border-color:var(--accent); box-shadow:0 0 0 1px rgba(215,193,127,.18); }.output-thumb { position:relative; aspect-ratio:9/16; overflow:hidden; background:#0b0e0c; }.output-thumb video { width:100%; height:100%; display:block; object-fit:cover; opacity:.83; }.output-card.active .output-thumb video { opacity:1; }.output-index { position:absolute; top:9px; left:9px; padding:4px 6px; border-radius:4px; background:rgba(8,10,9,.75); color:var(--cream); font-size:9px; font-variant-numeric:tabular-nums; }.output-check { position:absolute; top:9px; right:9px; display:grid; place-items:center; width:22px; height:22px; border-radius:50%; color:#1c211c; background:var(--accent); }.output-copy { padding:11px 12px 12px; }.output-copy strong { display:block; font-size:12px; font-weight:550; }.output-copy span { display:block; margin-top:4px; color:var(--soft); font-size:10px; }.delivery-meta { justify-content:space-between; margin-top:10px; padding-top:10px; border-top:1px solid #3d433e; color:var(--soft); font-size:9px; }.delivery-meta b { color:var(--cream); font-weight:500; }.delivery-footer { display:flex; align-items:center; justify-content:space-between; gap:15px; margin-top:24px; padding-top:19px; border-top:1px solid var(--line); }.delivery-footer p { margin:0; color:var(--soft); font-size:10px; line-height:1.5; }.delivery-footer p strong { color:var(--cream); font-weight:550; }
        .back-link { display:flex; align-items:center; gap:7px; padding:0; color:var(--soft); border:0; background:transparent; font-size:10px; cursor:pointer; }.back-link:hover { color:var(--cream); }.editor-layout { display:grid; grid-template-columns:minmax(0,1fr) 287px; }.monitor-area { padding:22px 28px 0; border-right:1px solid var(--line); min-width:0; }.monitor-label { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; color:var(--soft); font-size:10px; letter-spacing:.12em; text-transform:uppercase; }.live { color:var(--green); }.live:before { content:''; display:inline-block; width:6px; height:6px; border-radius:50%; margin-right:7px; background:var(--green); box-shadow:0 0 0 3px rgba(159,198,148,.12); }.monitor { max-width:860px; margin:auto; aspect-ratio:16/8.8; position:relative; overflow:hidden; background:#090b0a; border-radius:8px; box-shadow:0 20px 35px rgba(0,0,0,.25); }.preview-video-stack { position:absolute; inset:0; }.preview-video-stack video { position:absolute; inset:0; width:100%; height:100%; display:block; object-fit:contain; opacity:0; transition:opacity var(--transition-ms,.46s) ease-in-out; }.preview-video-stack video.is-active { opacity:1; }.preview-video-stack.is-transitioning video.is-incoming { opacity:1; }.monitor:after { content:''; position:absolute; inset:0; pointer-events:none; background:linear-gradient(180deg,transparent 64%,rgba(0,0,0,.62)); }.monitor-copy { position:absolute; z-index:1; left:19px; right:19px; bottom:16px; display:flex; justify-content:space-between; align-items:flex-end; }.monitor-copy strong { display:block; font-size:13px; font-weight:550; }.monitor-copy span { color:#d4d1c7; font-size:10px; margin-top:3px; }.play-button { position:absolute; z-index:2; left:50%; top:50%; transform:translate(-50%,-50%); display:grid; place-items:center; width:44px; height:44px; border:1px solid rgba(255,255,255,.5); background:rgba(20,21,20,.32); color:#fff; backdrop-filter:blur(4px); border-radius:50%; cursor:pointer; opacity:0; transition:opacity .2s ease,transform .2s ease; }.monitor:hover .play-button { opacity:1; }.play-button:hover { transform:translate(-50%,-50%) scale(1.06); }.preview-controls { justify-content:center; gap:13px; height:62px; }.control { display:grid; place-items:center; width:30px; height:30px; border:0; border-radius:50%; background:transparent; color:var(--soft); cursor:pointer; }.control:hover { color:var(--cream); background:var(--surface-2); }.control.primary { width:37px; height:37px; color:#25271f; background:var(--accent); }.timecode { min-width:102px; font-size:11px; color:var(--soft); font-variant-numeric:tabular-nums; text-align:center; }
        .inspector { padding:23px 20px; }.inspector h2 { margin:0 0 5px; font-family:Georgia,serif; font-weight:400; font-size:21px; }.inspector > p { margin:0 0 21px; color:var(--soft); font-size:11px; line-height:1.55; }.inspector-section { border-top:1px solid var(--line); padding:17px 0; }.inspector-section h3 { margin:0 0 12px; color:var(--soft); font-size:9px; text-transform:uppercase; letter-spacing:.15em; }.stat { display:flex; justify-content:space-between; padding:6px 0; color:var(--soft); font-size:11px; }.stat b { color:var(--cream); font-weight:500; }.selected-card { display:flex; gap:10px; padding:9px; border:1px solid #4b5149; background:#252925; border-radius:7px; }.selected-card img { width:42px; height:70px; object-fit:cover; border-radius:4px; }.selected-card p { margin:0; color:var(--soft); font-size:10px; }.selected-card strong { display:block; margin:3px 0 4px; color:var(--cream); font-size:11px; font-weight:550; }
        .sequence { border-top:1px solid var(--line); grid-column:1/-1; padding:17px 24px 20px; background:#191d1a; }.film-toolbar { justify-content:space-between; margin-bottom:13px; }.film-toolbar strong { font-size:11px; font-weight:600; }.film-toolbar span { color:var(--soft); font-size:10px; }.film-toolbar > div { display:flex; align-items:center; gap:14px; }.undo { display:flex; align-items:center; gap:6px; background:transparent; border:0; padding:3px; color:var(--soft); font-size:10px; cursor:pointer; }.undo:hover { color:var(--cream); }.strip { display:flex; gap:8px; overflow-x:auto; padding:2px 1px 10px; scrollbar-color:#555a54 transparent; }.clip { flex:0 0 var(--clip-width); position:relative; padding:4px; text-align:left; border:1px solid transparent; border-radius:6px; color:var(--cream); background:#252925; cursor:grab; }.clip:hover { transform:translateY(-2px); border-color:#5f685e; }.clip.is-selected { border-color:var(--accent); box-shadow:0 0 0 1px rgba(215,193,127,.17); }.clip.dragging { opacity:.36; }.clip video { width:100%; aspect-ratio:9/16; height:auto; display:block; object-fit:cover; background:#101111; border-radius:3px; pointer-events:none; }.number { position:absolute; top:8px; left:8px; padding:2px 4px; background:rgba(11,12,12,.75); font-size:8px; font-variant-numeric:tabular-nums; }.trash { position:absolute; top:7px; right:7px; display:grid; place-items:center; width:20px; height:20px; opacity:0; border:0; border-radius:4px; background:rgba(20,21,20,.86); color:#e6b1a8; cursor:pointer; transition:opacity .15s; }.clip:hover .trash { opacity:1; }.clip-meta { justify-content:space-between; gap:4px; padding:7px 2px 2px; }.clip-meta strong { overflow:hidden; font-size:9px; white-space:nowrap; text-overflow:ellipsis; font-weight:500; }.clip-meta span { flex:none; color:var(--soft); font-size:8px; }.add { flex:0 0 var(--clip-width); min-height:180px; display:grid; place-content:center; gap:6px; border:1px dashed #596158; border-radius:6px; color:var(--soft); background:transparent; font-size:9px; }.add:hover { color:var(--accent); border-color:var(--accent); background:#262920; }
        .library { grid-column:1/-1; padding:22px 24px 25px; border-top:1px solid var(--line); }.library-head { display:flex; align-items:end; justify-content:space-between; gap:15px; margin-bottom:13px; }.library-head h3 { margin:0; font-size:12px; font-weight:600; }.library-head p { margin:4px 0 0; color:var(--soft); font-size:10px; }.library-head > span { color:var(--green); font-size:10px; }.library-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:9px; }.library-card { position:relative; display:flex; gap:9px; align-items:center; padding:7px; text-align:left; border:1px solid var(--line); border-radius:7px; color:var(--cream); background:#252925; }.library-card:hover { border-color:#687664; }.library-card.in-cut { border-color:#59674f; background:#293128; }.library-card img { width:40px; height:62px; flex:none; object-fit:cover; border-radius:4px; }.library-copy { min-width:0; flex:1; }.library-copy strong { display:block; overflow:hidden; font-size:10px; font-weight:550; white-space:nowrap; text-overflow:ellipsis; }.library-copy span { display:block; margin-top:4px; color:var(--soft); font-size:8px; }.library-action { display:grid; place-items:center; flex:none; width:25px; height:25px; border:1px solid #596158; border-radius:5px; color:var(--accent); background:transparent; cursor:pointer; }.library-action:hover { background:#3b4338; }.used-badge { position:absolute; top:5px; right:5px; display:flex; align-items:center; gap:3px; color:var(--green); font-size:8px; }
        .result-layout { display:grid; grid-template-columns:minmax(0,1fr) 310px; }.result-panel { padding:23px 25px 28px; border-right:1px solid var(--line); }.result-panel h2 { margin:0 0 7px; font-family:Georgia,serif; font-weight:400; font-size:24px; }.result-panel > p { max-width:600px; margin:0 0 20px; color:var(--soft); font-size:11px; line-height:1.6; }.result-card { max-width:860px; margin:auto; padding:12px; border:1px solid #4c5949; border-radius:10px; background:#252b25; }.result-card .monitor { width:100%; }.result-side { padding:27px 21px; }.result-side h3 { margin:0 0 8px; font-size:13px; font-weight:600; }.result-side > p { margin:0 0 20px; color:var(--soft); font-size:11px; line-height:1.55; }.result-stat { display:flex; justify-content:space-between; padding:10px 0; border-top:1px solid var(--line); color:var(--soft); font-size:10px; }.result-stat b { color:var(--cream); font-weight:500; }.voice-button { display:flex; align-items:center; justify-content:center; gap:8px; width:100%; margin-top:15px; padding:11px 13px; border-radius:7px; color:#20221c; background:var(--accent); font-size:11px; font-weight:700; }.voice-button:hover { background:#e5d495; transform:translateY(-1px); }.secondary-action { display:flex; align-items:center; justify-content:center; gap:7px; width:100%; margin-top:9px; padding:10px; border:1px solid var(--line); border-radius:7px; color:var(--soft); background:transparent; font-size:10px; }.secondary-action:hover { color:var(--cream); background:var(--surface-2); }.saved-pill { display:inline-flex; align-items:center; gap:6px; margin-bottom:11px; padding:5px 8px; border:1px solid #52624e; border-radius:20px; color:var(--green); background:rgba(159,198,148,.08); font-size:9px; }
        .voice-layout { display:grid; grid-template-columns:minmax(0,1fr) 330px; }.voice-panel { padding:23px 25px 28px; border-right:1px solid var(--line); }.voice-panel h2 { margin:0 0 7px; font-family:Georgia,serif; font-weight:400; font-size:25px; }.voice-panel > p { max-width:600px; margin:0 0 20px; color:var(--soft); font-size:11px; line-height:1.6; }.voice-source { max-width:860px; margin:auto; padding:12px; border:1px solid #4c5949; border-radius:10px; background:#252b25; }.voice-side { padding:27px 21px; }.voice-side h3 { margin:0 0 7px; font-size:13px; font-weight:600; }.voice-side > p { margin:0 0 18px; color:var(--soft); font-size:11px; line-height:1.55; }.voice-actions { flex-direction:column; align-items:stretch; gap:8px; }.voice-record { display:flex; align-items:center; justify-content:center; gap:8px; width:100%; padding:11px; border:1px solid #596158; border-radius:7px; color:var(--cream); background:var(--surface-2); font-size:10px; cursor:pointer; }.voice-record:hover { border-color:var(--accent); }.voice-record.recording { color:#ffd5cf; border-color:#975e57; background:rgba(151,94,87,.18); }.voice-upload { display:flex; align-items:center; justify-content:center; gap:7px; width:100%; padding:10px; border:1px dashed #596158; border-radius:7px; color:var(--soft); background:transparent; font-size:10px; cursor:pointer; }.voice-upload:hover { color:var(--cream); border-color:var(--accent); }.voice-status { margin-top:16px; padding:11px; border-radius:7px; color:var(--green); background:rgba(159,198,148,.08); font-size:10px; line-height:1.5; }.voice-status strong { display:block; margin-bottom:3px; color:var(--cream); font-weight:550; }.flow-step { gap:8px; margin:14px 0; color:var(--soft); font-size:10px; }.flow-step.done { color:var(--green); }.flow-step.active { color:var(--cream); }.flow-line { width:1px; height:15px; margin-left:9px; background:var(--line); }
        .save-note { position:fixed; z-index:5; bottom:24px; left:50%; transform:translateX(-50%); display:flex; align-items:center; gap:9px; padding:10px 13px; border:1px solid #555d51; border-radius:8px; background:#293029; color:var(--cream); box-shadow:0 12px 28px rgba(0,0,0,.3); font-size:11px; animation:rise .24s ease both; }.save-note button { border:0; background:none; color:var(--accent); cursor:pointer; font-size:11px; } @keyframes rise { from { opacity:0; transform:translate(-50%,10px) } to { opacity:1; transform:translate(-50%,0) } }
        @media (max-width:980px) { .output-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }.library-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }.editor-layout,.result-layout,.voice-layout { grid-template-columns:1fr; }.monitor-area,.result-panel,.voice-panel { border-right:0; }.inspector,.result-side,.voice-side { border-top:1px solid var(--line); }.inspector { display:block; }.library { grid-column:auto; } }
        @media (max-width:650px) { .rendy-editor { padding:0; }.topbar { border-radius:0; border-left:0; border-right:0; margin:0; }.crumb,.minimal,.format { display:none; }.studio { border:0; border-radius:0; min-height:calc(100dvh - 58px); }.studio-head { padding:13px 17px; }.delivery { padding:23px 16px 30px; }.delivery-intro h2 { font-size:27px; }.prep-card { align-items:flex-start; gap:12px; padding:14px; }.prep-ready { display:none; }.delivery-footer { align-items:flex-start; flex-direction:column; }.delivery-footer .primary-action { width:100%; }.output-grid { grid-template-columns:1fr; }.monitor-area { padding:17px 15px 0; }.monitor { border-radius:5px; }.inspector { display:none; }.sequence,.library { padding:16px 15px; }.library-grid { grid-template-columns:1fr; }.library-card { min-height:61px; }.film-toolbar { align-items:flex-start; gap:10px; }.film-toolbar > div { gap:7px; }.film-toolbar > div:first-child { flex-direction:column; align-items:flex-start; }.result-panel,.voice-panel { padding:20px 15px 24px; }.result-side,.voice-side { padding:21px 15px 25px; }.identity { gap:9px; }.identity strong { font-size:11px; }.topbar { padding-left:13px; }.top-actions .save { padding:9px 11px; } }
        /* Forma Estates treatment: a warm editorial workroom around a cinematic monitor. */
        .rendy-editor {
          --canvas:#eee9df; --surface:#f8f5ef; --surface-2:#f0ebe2; --surface-3:#e7e0d5;
          --line:#d6cec1; --soft:#756f66; --cream:#211f1b; --accent:#b08a4a; --green:#6b8068; --danger:#a9675d;
          background:radial-gradient(circle at 80% -15%,#fffaf0 0,transparent 42%),var(--canvas);
          color:var(--cream); font-family:"Plus Jakarta Sans",ui-sans-serif,system-ui,sans-serif; padding:24px;
        }
        .rendy-editor .topbar {
          height:64px; border:1px solid var(--line); border-radius:0; background:rgba(248,245,239,.92);
          box-shadow:0 8px 28px rgba(55,45,32,.06); padding:0 14px 0 22px;
        }
        .rendy-editor .identity { gap:14px; }.rendy-editor .monogram {
          width:30px; height:30px; border-radius:50%; border-color:var(--accent); color:var(--accent);
          font-family:Georgia,serif; font-size:18px;
        }
        .rendy-editor .identity strong { color:#29251f; font-size:12px; letter-spacing:.13em; }
        .rendy-editor .identity span,.rendy-editor .crumb,.rendy-editor .muted { color:var(--soft); }
        .rendy-editor .crumb { border-color:var(--line); }.rendy-editor .minimal { color:var(--soft); }
        .rendy-editor .minimal:hover { color:var(--cream); background:var(--surface-3); }
        .rendy-editor .save,.rendy-editor .primary-action {
          border-radius:0; background:var(--accent); color:#fffaf0; padding:11px 17px; letter-spacing:.06em;
          text-transform:uppercase; font-size:10px; box-shadow:0 5px 14px rgba(176,138,74,.18);
        }
        .rendy-editor .save:hover,.rendy-editor .primary-action:hover { background:#967238; }
        .rendy-editor .studio {
          border:1px solid var(--line); border-radius:0; background:var(--surface);
          box-shadow:0 22px 60px rgba(55,45,32,.10);
        }
        .rendy-editor .studio-head { min-height:74px; padding:15px 30px; border-color:var(--line); }
        .rendy-editor .studio-meta { gap:14px; }.rendy-editor .tag { color:var(--accent); letter-spacing:.2em; }
        .rendy-editor .studio-meta h1 { color:#2b2721; font-family:Georgia,serif; font-size:18px; font-weight:400; }
        .rendy-editor .dot { background:#aaa196; }.rendy-editor .format { letter-spacing:.14em; }
        .rendy-editor .delivery { padding:46px 48px 52px; }
        .rendy-editor .delivery-intro { margin-bottom:32px; }.rendy-editor .eyebrow { color:var(--accent); letter-spacing:.2em; }
        .rendy-editor .delivery-intro h2,.rendy-editor .inspector h2,.rendy-editor .voice-panel h2 {
          color:#24211d; font-family:Georgia,"Times New Roman",serif; font-weight:400; letter-spacing:-.035em;
        }
        .rendy-editor .delivery-intro h2 { font-size:40px; }.rendy-editor .delivery-intro p,
        .rendy-editor .inspector > p,.rendy-editor .voice-panel > p { color:var(--soft); }
        .rendy-editor .prep-card {
          border:1px solid #d1c3a8; border-radius:0; background:#eee7d8; padding:17px 20px;
        }.rendy-editor .prep-icon { border-radius:50%; background:rgba(176,138,74,.13); color:var(--accent); }
        .rendy-editor .prep-ready { border-color:#b9c6b5; border-radius:0; color:var(--green); }
        .rendy-editor .progress-track { background:#d5cec1; }.rendy-editor .progress-track > span { background:var(--accent); }
        .rendy-editor .output-card { border-color:var(--line); border-radius:0; background:#f4f0e9; color:var(--cream); }
        .rendy-editor .output-card:hover { border-color:var(--accent); transform:translateY(-3px); }
        .rendy-editor .output-card.active { border-color:var(--accent); box-shadow:0 0 0 1px rgba(176,138,74,.24); }
        .rendy-editor .output-thumb { background:#171513; }.rendy-editor .output-index { border-radius:0; background:rgba(23,21,19,.78); }
        .rendy-editor .output-copy { padding:13px 14px 14px; }.rendy-editor .output-copy strong { font-family:Georgia,serif; font-size:14px; font-weight:400; }
        .rendy-editor .delivery-meta { border-color:var(--line); }.rendy-editor .delivery-footer { border-color:var(--line); }
        .rendy-editor .delivery-footer p { color:var(--soft); }.rendy-editor .delivery-footer p strong { color:var(--cream); }
        .rendy-editor .editor-layout,.rendy-editor .result-layout,.rendy-editor .voice-layout { background:var(--surface); }
        .rendy-editor .monitor-area,.rendy-editor .result-panel,.rendy-editor .voice-panel { border-color:var(--line); }
        .rendy-editor .monitor-label { color:var(--soft); }.rendy-editor .live { color:var(--green); }
        .rendy-editor .monitor { max-width:420px; aspect-ratio:9/16; border-radius:0; box-shadow:0 20px 38px rgba(30,25,20,.20); }
        .rendy-editor .monitor-copy strong { color:#fffaf0; font-family:Georgia,serif; font-size:15px; font-weight:400; }
        .rendy-editor .preview-controls { height:68px; }.rendy-editor .control { color:var(--soft); }
        .rendy-editor .control:hover { color:var(--cream); background:var(--surface-2); }
        .rendy-editor .control.primary { color:#fffaf0; background:var(--accent); }
        .rendy-editor .inspector { background:#f4f0e9; }.rendy-editor .inspector-section,
        .rendy-editor .sequence,.rendy-editor .library { border-color:var(--line); }
        .rendy-editor .stat,.rendy-editor .film-toolbar span,.rendy-editor .library-head p { color:var(--soft); }
        .rendy-editor .stat b,.rendy-editor .film-toolbar strong,.rendy-editor .library-head h3 { color:var(--cream); }
        .rendy-editor .selected-card,.rendy-editor .clip,.rendy-editor .library-card { border-color:var(--line); background:#eae4da; color:var(--cream); border-radius:0; }
        .rendy-editor .selected-card strong,.rendy-editor .clip-meta strong,.rendy-editor .library-copy strong { color:var(--cream); }
        .rendy-editor .clip.is-selected,.rendy-editor .library-card.in-cut { border-color:var(--accent); box-shadow:none; background:#f1eadc; }
        .rendy-editor .trash { border-radius:0; background:rgba(35,29,23,.88); }.rendy-editor .add { border-color:#bcb1a1; border-radius:0; }
        .rendy-editor .add:hover { color:var(--accent); border-color:var(--accent); background:#f1eadc; }
        .rendy-editor .library-action { border-color:#bcb1a1; border-radius:0; color:var(--accent); }
        .rendy-editor .library-action:hover { background:#ded4c4; }.rendy-editor .library-head > span { color:var(--green); }
        .rendy-editor .voice-source { border-color:#c8bda9; border-radius:0; background:#ece6dc; }
        .rendy-editor .voice-side { background:#f4f0e9; border-color:var(--line); }.rendy-editor .voice-record { border-color:#bcb1a1; border-radius:0; background:#eae4da; color:var(--cream); }
        .rendy-editor .voice-record:hover,.rendy-editor .voice-upload:hover { border-color:var(--accent); }.rendy-editor .voice-upload { border-color:#bcb1a1; border-radius:0; color:var(--soft); }
        .rendy-editor .voice-status { border-radius:0; color:var(--green); background:#e8eee5; }.rendy-editor .voice-status strong { color:var(--cream); }
        .rendy-editor .flow-step { color:var(--soft); }.rendy-editor .flow-step.done { color:var(--green); }.rendy-editor .flow-step.active { color:var(--cream); }
        .rendy-editor .flow-line { background:var(--line); }.rendy-editor .save-note { border-color:#c7b99f; border-radius:0; background:#f8f5ef; color:var(--cream); box-shadow:0 12px 28px rgba(55,45,32,.16); }
        .rendy-editor .save-note button { color:var(--accent); }
        @media (max-width:650px) {
          .rendy-editor { padding:0; }.rendy-editor .delivery { padding:30px 18px 34px; }
          .rendy-editor .delivery-intro h2 { font-size:32px; }.rendy-editor .studio-head { padding:14px 18px; }
          .rendy-editor .topbar { background:var(--surface); }.rendy-editor .output-card { display:block; }
        }
      `}</style>

      <header className="topbar">
        <div className="identity">
          <span className="monogram">F</span><strong>FORMA ESTATES</strong>
          <span className="crumb">Alder House / Rendy finishing room</span>
        </div>
        <div className="top-actions">
          {stage === 'delivery' && <span className="muted">Demo workspace · no live changes</span>}
          {stage === 'editor' && <button className="minimal" onClick={() => setStage('delivery')}><ArrowLeft size={13} /> Back to delivery</button>}
          {stage === 'saved' && <button className="minimal" onClick={() => setStage('editor')}><ArrowLeft size={13} /> Back to edit</button>}
          {stage === 'voiceover' && <button className="minimal" onClick={() => setStage('saved')}><ArrowLeft size={13} /> Back to video</button>}
          {stage === 'editor' && <button className="save" onClick={saveSequence} disabled={!timeline.length}><Save size={14} /> Save edit</button>}
        </div>
      </header>

      <section className="studio">
        <header className="studio-head">
          <div className="studio-meta"><span className="tag">{stage === 'delivery' ? 'Rendy delivery' : stage === 'voiceover' ? 'Voice-over' : stage === 'analyzing' ? 'Visual edit analysis' : stage === 'saved' ? 'Finished edit' : 'Edit video'}</span><i className="dot" /><h1>Example property · Showcase</h1></div>
          <span className="format">9:16 &nbsp; / &nbsp; 1080 × 1920 &nbsp; / &nbsp; 30 FPS</span>
        </header>

        {stage === 'delivery' && (
          <section className="delivery">
            <div className="delivery-intro">
              <div className="eyebrow"><Sparkles size={13} /> Rendy delivery received</div>
              <h2>Your showcase is ready to review.</h2>
              <p>These are the six original Rendy deliveries supplied for this demo. Forma prepares one clean shot library across all of them while you review each direction.</p>
            </div>

            <div className="prep-card">
              <div className={`prep-icon ${preparationDone ? 'ready' : ''}`}>{preparationDone ? <CheckCircle2 size={20} /> : <LoaderCircle size={20} className="spin" />}</div>
              <div className="prep-copy">
                <strong>{preparationDone ? 'Edit room ready' : 'Preparing your edit room'}</strong>
                <span>{preparationDone ? 'All selected shots are ready to use. No new Rendy generation was started.' : `${preparationStep} · this happens in the background while you review.`}</span>
                <div className="progress-row"><div className="progress-track"><span style={{ width: `${preparationProgress}%` }} /></div><span className="progress-number">{preparationProgress}%</span></div>
              </div>
              {preparationDone && <div className="prep-ready"><CheckCircle2 size={13} /> Ready to edit</div>}
            </div>

            <div className="outputs-head"><div><h3>Six original Rendy outputs</h3><span>Choose the starting video for your edit.</span></div><span>{preparationDone ? `${library.length} complete shots found` : 'Preparing shot library…'}</span></div>
            <div className="output-grid">
              {outputs.map((output, index) => (
                <button key={output.id} className={`output-card ${output.id === selectedOutputId ? 'active' : ''}`} onClick={() => chooseOutput(output)}>
                  <div className="output-thumb"><video key={`${output.id}-${output.id === selectedOutputId ? 'active' : 'idle'}`} ref={(element) => { outputPreviewRefs.current[output.id] = element; }} src={asset(output.previewVideo, 'videos')} poster={asset(output.poster, 'videos')} muted loop autoPlay={output.id === selectedOutputId} playsInline preload={output.id === selectedOutputId ? 'auto' : 'metadata'} onCanPlay={(event) => { if (output.id === selectedOutputId) { event.currentTarget.muted = true; void event.currentTarget.play().catch(() => undefined); } }} /><span className="output-index">OUTPUT {String(index + 1).padStart(2, '0')}</span>{output.id === selectedOutputId && <span className="output-check"><Check size={13} /></span>}</div>
                  <div className="output-copy"><strong>{output.title}</strong><span>{output.preset}</span><div className="delivery-meta"><span>{output.duration}</span><b>{output.usedIds.length} shots</b></div></div>
                </button>
              ))}
            </div>
            <div className="delivery-footer">
              <p><strong>{selectedOutput.title}</strong> is selected as your starting cut.<br />You can change every shot after the edit room opens.</p>
              <button className="primary-action" onClick={openEditor} disabled={!preparationDone}><Film size={14} /> {preparationDone ? 'Edit this video' : 'Edit room preparing…'}</button>
            </div>
          </section>
        )}

        {(stage === 'editor') && (
          <div className="editor-layout">
            <section className="monitor-area">
              <div className="monitor-label"><span className="live">{previewLabel}</span><span>{selected?.time ?? '00:00'}</span></div>
              <div className="monitor">
                <SmoothVideoPreview src={previewSrc} poster={previewPoster} speed={previewClip?.speed} isPlaying={isPlaying} loop />
                <button className="play-button" aria-label={isPlaying ? 'Pause preview' : 'Play preview'} onClick={() => setIsPlaying(!isPlaying)}>{isPlaying ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</button>
                <div className="monitor-copy"><div><strong>{selected?.title ?? 'Select a shot'}</strong><span>Preview the selected moment before arranging it.</span></div><Maximize2 size={14} /></div>
              </div>
              <div className="preview-controls"><button className="control" onClick={() => setSelectedId(timeline[Math.max(0, timeline.findIndex((clip) => clip.id === selectedId) - 1)]?.id ?? selectedId)} aria-label="Previous clip"><ChevronLeft size={18} /></button><button className="control primary" onClick={() => setIsPlaying(!isPlaying)} aria-label={isPlaying ? 'Pause preview' : 'Play preview'}>{isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}</button><button className="control" onClick={() => setSelectedId(timeline[Math.min(timeline.length - 1, timeline.findIndex((clip) => clip.id === selectedId) + 1)]?.id ?? selectedId)} aria-label="Next clip"><ChevronRight size={18} /></button><span className="timecode">{selected?.time ?? '00:00'} <span className="muted">/</span> {duration}</span><button className="control" aria-label="Audio is enabled"><Volume2 size={16} /></button></div>
            </section>
            <aside className="inspector">
              <h2>Finishing room</h2><p>Start from the selected Rendy cut, then make the final sequence your own.</p>
              <div className="inspector-section"><h3>Delivery</h3><div className="stat"><span>Starting video</span><b>Output {selectedOutputId.slice(-2)}</b></div><div className="stat"><span>Unique shots</span><b>{library.length} found</b></div><div className="stat"><span>In this edit</span><b>{timeline.length} shots</b></div><div className="stat"><span>Sequence length</span><b>{duration}</b></div></div>
              <div className="inspector-section"><h3>Filmstrip scale</h3><div className="zoom"><button aria-label="Zoom out" onClick={() => setZoom(Math.max(65, zoom - 10))}><ZoomOut size={13} /></button><input aria-label="Filmstrip zoom" type="range" min="65" max="150" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /><button aria-label="Zoom in" onClick={() => setZoom(Math.min(150, zoom + 10))}><ZoomIn size={13} /></button></div></div>
              {selected && <div className="inspector-section"><h3>Selected moment</h3><div className="selected-card"><img src={asset(selected.image, 'videos')} alt="" /><div><p>{selected.time} · {selected.duration}</p><strong>{selected.title}</strong><p>{selected.source} · best take</p></div></div></div>}
            </aside>
            <section className="sequence">
              <div className="film-toolbar"><div><strong>Your edit</strong><span><GripVertical size={12} /> Drag to reposition</span></div><div>{deleted && <button className="undo" onClick={undoDelete}><Undo2 size={13} /> Restore removed shot</button>}<span>{timeline.length} shots · {duration}</span></div></div>
              <div className="strip">
                {timeline.map((clip, index) => <button key={clip.id} className={`clip ${selectedId === clip.id ? 'is-selected' : ''} ${dragged === clip.id ? 'dragging' : ''}`} style={{ ['--clip-width' as string]: `${cardWidth}px` }} draggable onDragStart={() => setDragged(clip.id)} onDragEnd={() => setDragged(null)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => onDrop(event, clip.id)} onClick={() => { setSelectedId(clip.id); setIsPlaying(true); }}>
                  <span className="number">{String(index + 1).padStart(2, '0')}</span><video src={asset(clip.video, 'videos')} poster={asset(clip.image, 'videos')} autoPlay muted loop playsInline preload="metadata" onLoadedMetadata={(event) => { event.currentTarget.playbackRate = clip.speed; }} /><span className="clip-meta"><strong>{clip.title}</strong><span>{clip.duration}</span></span><span role="button" className="trash" aria-label={`Remove ${clip.title}`} onClick={(event) => { event.stopPropagation(); removeClip(clip.id); }}><Trash2 size={12} /></span>
                </button>)}
              </div>
            </section>
            <section className="library">
              <div className="library-head"><div><h3>All unique shots from six outputs</h3><p>One best take per shot is shown here. Nothing is generated again.</p></div><span><CheckCircle2 size={12} /> Library ready</span></div>
              <div className="library-grid">{library.map((clip) => {
                const inCut = timelineIds.includes(clip.id);
                return <button key={clip.id} className={`library-card ${inCut ? 'in-cut' : ''}`} onClick={() => { setSelectedId(clip.id); if (!inCut) addClip(clip.id); }}>
                  <img src={asset(clip.image, 'videos')} alt="" /><div className="library-copy"><strong>{clip.title}</strong><span>{clip.source} · {clip.duration}</span></div>{inCut ? <span className="used-badge"><Check size={11} /> In edit</span> : <span className="library-action" aria-label={`Add ${clip.title}`}><Plus size={13} /></span>}
                </button>;
              })}</div>
            </section>
          </div>
        )}

        {stage === 'analyzing' && (
          <section className="delivery">
            <div className="delivery-intro">
              <div className="eyebrow"><Sparkles size={13} /> Visual edit analysis</div>
              <h2>Checking every cut before playback.</h2>
              <p>The test editor reads the start and end frame of each selected clip, then sets the crossfade length per cut. This prevents a new clip from appearing before it has a decoded frame.</p>
            </div>
            <div className="prep-card">
              <div className="prep-icon"><LoaderCircle size={20} className="spin" /></div>
              <div className="prep-copy">
                <strong>Analysing {timeline.length} selected shots</strong>
                <span>Comparing brightness and contrast at each cut boundary, then warming the full sequence for clean playback.</span>
                <div className="progress-row"><div className="progress-track"><span style={{ width: `${analysisProgress}%` }} /></div><span className="progress-number">{analysisProgress}%</span></div>
              </div>
            </div>
          </section>
        )}

        {stage === 'saved' && (
          <div className="result-layout">
            <section className="result-panel">
              <span className="saved-pill"><CheckCircle2 size={13} /> Edit saved locally in demo</span>
              <h2>Your new video is ready.</h2>
              <p>This is the edited sequence that will continue into the voice-over step. The original Rendy delivery remains unchanged.</p>
              <div className="result-card">
                <div className="monitor">
                <SmoothVideoPreview
                  key={`saved-preview-${sequenceRunId}`}
                  src={previewSrc}
                  poster={previewPoster}
                  speed={previewClip?.speed}
                  isPlaying={isPlaying}
                  onNearEnd={advanceSavedSequence}
                  onEnded={handleSequenceEnded}
                  onTransitionComplete={completeSequenceTransition}
                  transitionMs={transitionPlan[renderedSequenceIndex] ?? 460}
                  preloadSources={sequencePreviewSources}
                />
                  <button className="play-button" aria-label={isPlaying ? 'Pause preview' : 'Play preview'} onClick={() => setIsPlaying(!isPlaying)}>{isPlaying ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</button>
                  <div className="monitor-copy"><div><strong>Alder House · Final edit</strong><span>Saved sequence · {timeline.length} shots</span></div><Maximize2 size={14} /></div>
                </div>
                <div className="preview-controls"><button className="control" onClick={() => requestSequenceIndex(Math.max(0, savedIndex - 1))} aria-label="Previous clip"><ChevronLeft size={18} /></button><button className="control primary" onClick={() => setIsPlaying(!isPlaying)} aria-label={isPlaying ? 'Pause preview' : 'Play preview'}>{isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}</button><button className="control" onClick={nextSequence} aria-label="Next clip"><ChevronRight size={18} /></button><span className="timecode">SHOT {String(savedIndex + 1).padStart(2, '0')} <span className="muted">/</span> {timeline.length}</span><button className="control" aria-label="Audio is enabled"><Volume2 size={16} /></button></div>
              </div>
            </section>
            <aside className="result-side">
              <h3>Next: voice-over</h3><p>Use this edited video as the exact source for narration, captions and final delivery.</p>
              <div className="result-stat"><span>Shots</span><b>{timeline.length}</b></div><div className="result-stat"><span>Length</span><b>{duration}</b></div><div className="result-stat"><span>Original delivery</span><b>Preserved</b></div>
              <button className="voice-button" onClick={startVoiceover}><Mic2 size={14} /> Create voice-over</button>
              <button className="secondary-action" onClick={restartSequence}><RotateCcw size={13} /> Restart preview</button>
              <button className="secondary-action" onClick={() => setStage('editor')}><RotateCcw size={13} /> Continue editing</button>
            </aside>
          </div>
        )}

        {stage === 'voiceover' && (
          <div className="voice-layout">
            <section className="voice-panel">
              <span className="saved-pill"><CheckCircle2 size={13} /> Edited video selected</span>
              <h2>Give the edit a voice.</h2>
              <p>The new edited video is now the source for voice-over. Record or upload narration here, then continue to captions and final delivery.</p>
              <div className="voice-source">
                <div className="monitor">
                <SmoothVideoPreview
                  src={previewSrc}
                  poster={previewPoster}
                  speed={previewClip?.speed}
                  isPlaying={isPlaying}
                  onNearEnd={advanceSavedSequence}
                  onEnded={handleSequenceEnded}
                  onTransitionComplete={completeSequenceTransition}
                  transitionMs={transitionPlan[renderedSequenceIndex] ?? 460}
                  preloadSources={sequencePreviewSources}
                />
                  <button className="play-button" aria-label={isPlaying ? 'Pause preview' : 'Play preview'} onClick={() => setIsPlaying(!isPlaying)}>{isPlaying ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</button>
                  <div className="monitor-copy"><div><strong>Alder House · Edited source</strong><span>Ready for voice-over</span></div><Maximize2 size={14} /></div>
                </div>
                <div className="preview-controls"><button className="control" onClick={() => requestSequenceIndex(Math.max(0, savedIndex - 1))} aria-label="Previous clip"><ChevronLeft size={18} /></button><button className="control primary" onClick={() => setIsPlaying(!isPlaying)} aria-label={isPlaying ? 'Pause preview' : 'Play preview'}>{isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}</button><button className="control" onClick={nextSequence} aria-label="Next clip"><ChevronRight size={18} /></button><span className="timecode">{duration} <span className="muted">·</span> muted preview</span><button className="control" aria-label="Audio is muted"><Volume2 size={16} /></button></div>
              </div>
            </section>
            <aside className="voice-side">
              <h3>Voice-over project</h3><p>This project is connected to the saved edit, not the original Rendy delivery.</p>
              <div className="flow-step done"><CheckCircle2 size={14} /> Rendy videos received</div><div className="flow-line" /><div className="flow-step done"><CheckCircle2 size={14} /> Edit saved · {timeline.length} shots</div><div className="flow-line" /><div className="flow-step active"><Circle size={14} /> Add narration</div>
              <div className="voice-actions">
                <button className={`voice-record ${voiceoverMode === 'recording' ? 'recording' : ''}`} onClick={toggleRecording}>{voiceoverMode === 'recording' ? <><LoaderCircle size={14} className="spin" /> Recording {formatRecording(recordingSeconds)} · Stop</> : voiceoverMode === 'recorded' ? <><Check size={14} /> Voice-over recorded</> : voiceoverMode === 'uploaded' ? <><Check size={14} /> Voice-over uploaded</> : <><Mic2 size={14} /> Record voice-over</>}</button>
                <input ref={audioInputRef} hidden type="file" accept="audio/*" onChange={(event) => onAudioUpload(event.currentTarget.files?.[0])} />
                <button className="voice-upload" onClick={() => audioInputRef.current?.click()}><Upload size={13} /> Upload audio instead</button>
              </div>
              {voiceoverMode === 'ready' && <div className="voice-status"><strong>Ready for narration</strong>When you add audio, captions can be created from this exact edited video.</div>}
              {voiceoverMode === 'recording' && <div className="voice-status"><strong>Recording locally</strong>Speak while the edited video plays, then stop to attach the recorded file to this demo project.</div>}
              {(voiceoverMode === 'recorded' || voiceoverMode === 'uploaded') && <div className="voice-status"><strong>Audio attached locally</strong>{voiceoverName ?? 'Voice-over'} is attached to this edited video. The live build will mix and store the final delivery.</div>}
              {voiceoverUrl && <audio controls src={voiceoverUrl} style={{ width: '100%', marginTop: 12 }} />}
              {voiceoverError && <div className="voice-status" style={{ color: '#ffd5cf', background: 'rgba(151,94,87,.14)' }}><strong>Audio was not attached</strong>{voiceoverError}</div>}
            </aside>
          </div>
        )}
      </section>
      {saveNotice && stage === 'saved' && <div className="save-note"><Check size={14} color="#d7c17f" /> Saved locally · your new edited video is ready <button onClick={startVoiceover}>Voice-over</button></div>}
    </main>
  );
}