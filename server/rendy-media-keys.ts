type VoiceProjectMediaRow = {
  source_url?: unknown;
  audio_url?: unknown;
  output_url?: unknown;
  source_input_url?: unknown;
  raw_audio_key?: unknown;
};

type RendyJobMediaRow = {
  videos?: unknown;
};

function keyFromUploadsUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  let pathname = value.trim();
  try {
    if (/^https?:\/\//i.test(pathname)) pathname = new URL(pathname).pathname;
  } catch {
    return null;
  }
  if (!pathname.startsWith("/uploads/")) return null;
  const key = decodeURIComponent(pathname.slice("/uploads/".length));
  return key && !key.includes("..") ? key : null;
}

function addRawR2Key(keys: Set<string>, value: unknown): void {
  if (typeof value !== "string") return;
  const key = value.trim();
  if (key && !key.includes("..")) keys.add(key);
}

/**
 * Rendy voice-over media is referenced across its durable project record and
 * the JSON delivery record for the original showcase job. Keep every local
 * R2 key that either record can need for playback, retry, or restart recovery.
 */
export function collectRendyMediaKeys(
  projects: VoiceProjectMediaRow[],
  jobs: RendyJobMediaRow[],
): Set<string> {
  const keys = new Set<string>();
  const addUrl = (value: unknown) => {
    const key = keyFromUploadsUrl(value);
    if (key) keys.add(key);
  };

  for (const project of projects) {
    addUrl(project.source_url);
    addUrl(project.audio_url);
    addUrl(project.output_url);
    addUrl(project.source_input_url);
    addRawR2Key(keys, project.raw_audio_key);
  }

  for (const job of jobs) {
    if (!Array.isArray(job.videos)) continue;
    for (const video of job.videos) {
      if (video && typeof video === "object") addUrl((video as { url?: unknown }).url);
    }
  }

  return keys;
}