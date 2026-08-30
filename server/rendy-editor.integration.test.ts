/**
 * Real FFmpeg regression test for Rendy Edit's clean-cut render.
 * Run with: npx tsx server/rendy-editor.integration.test.ts
 *
 * Uses only generated local media: no database, network, or paid services.
 */

import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  buildCleanEditRenderArgs,
  RENDY_CANDIDATE_THUMBNAIL_FILTER,
} from "./rendy-editor";
import { runFfmpegQueued } from "./showcase";

function run(binary: string, args: string[]): string {
  const result = spawnSync(binary, args, {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(
      `${binary} failed (${result.status}):\n${result.stderr.slice(-4000)}`,
    );
  }
  return result.stdout;
}

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(`✗ ${message}`);
  console.log(`✓ ${message}`);
}

function audioRms(filePath: string, start: number, duration: number): number {
  const result = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      start.toFixed(6),
      "-t",
      duration.toFixed(6),
      "-i",
      filePath,
      "-map",
      "0:a:0",
      "-ac",
      "1",
      "-ar",
      "48000",
      "-f",
      "f32le",
      "pipe:1",
    ],
    { maxBuffer: 4 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    throw new Error(`Audio decode failed: ${result.stderr.toString().slice(-2000)}`);
  }
  const pcm = result.stdout;
  let squareSum = 0;
  let samples = 0;
  for (let offset = 0; offset + 4 <= pcm.length; offset += 4) {
    const sample = pcm.readFloatLE(offset);
    squareSum += sample * sample;
    samples++;
  }
  return samples ? Math.sqrt(squareSum / samples) : 0;
}

const tempDir = mkdtempSync(path.join(os.tmpdir(), "rendy-edit-integration-"));

try {
  const firstClip = path.join(tempDir, "first.mp4");
  const secondClip = path.join(tempDir, "second.mp4");
  const soundtrack = path.join(tempDir, "soundtrack.mp4");
  const portraitThumbnail = path.join(tempDir, "portrait-thumbnail.jpg");
  const output = path.join(tempDir, "output.mp4");

  run("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=green:s=180x320",
    "-frames:v",
    "1",
    "-vf",
    RENDY_CANDIDATE_THUMBNAIL_FILTER,
    portraitThumbnail,
  ]);
  const portraitProbe = JSON.parse(
    run("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "stream=width,height",
      "-of",
      "json",
      portraitThumbnail,
    ]),
  ) as { streams?: Array<{ width?: number; height?: number }> };
  assert(
    portraitProbe.streams?.[0]?.width === 180 &&
      portraitProbe.streams?.[0]?.height === 320,
    "real thumbnail generation preserves a portrait frame without cropping",
  );

  run("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=red:s=320x180:r=30:d=0.700",
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-pix_fmt",
    "yuv420p",
    firstClip,
  ]);
  run("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=blue:s=320x180:r=30:d=0.650",
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-pix_fmt",
    "yuv420p",
    secondClip,
  ]);
  run("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=black:s=320x180:r=30:d=0.450",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=48000:duration=0.450",
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    soundtrack,
  ]);

  const plan = {
    clips: [
      {
        shotId: "one",
        candidateId: "one",
        sourceUrl: "",
        sourceVideoId: "one",
        start: 0,
        end: 0.7,
      },
      {
        shotId: "two",
        candidateId: "two",
        sourceUrl: "",
        sourceVideoId: "two",
        start: 0,
        end: 0.65,
      },
    ],
    transitions: [{ type: "cut" as const, duration: 0, confidence: 1 }],
    totalDuration: 1.35,
  };
  const nonMillisecondAudioDuration = 0.43737;
  const expectedLoopSamples = Math.round(nonMillisecondAudioDuration * 48_000);
  const args = buildCleanEditRenderArgs(
    [firstClip, secondClip],
    soundtrack,
    true,
    nonMillisecondAudioDuration,
    output,
    plan,
  );
  const filter = args[args.indexOf("-filter_complex") + 1];
  assert(
    filter.includes(
      `atrim=start_sample=0:end_sample=${expectedLoopSamples}`,
    ) && filter.includes(`aloop=loop=-1:size=${expectedLoopSamples}`),
    "fractional source duration uses one identical sample count for trim and loop",
  );

  run("ffmpeg", args);
  const probe = JSON.parse(
    run("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration:stream=codec_type,duration",
      "-of",
      "json",
      output,
    ]),
  ) as {
    format?: { duration?: string };
    streams?: Array<{ codec_type?: string; duration?: string }>;
  };
  const videoDuration = Number(
    probe.streams?.find((stream) => stream.codec_type === "video")?.duration,
  );
  const audioDuration = Number(
    probe.streams?.find((stream) => stream.codec_type === "audio")?.duration,
  );
  assert(
    Number.isFinite(videoDuration) &&
      Number.isFinite(audioDuration) &&
      Math.abs(videoDuration - audioDuration) <= 0.04,
    "real output keeps audio and video durations aligned",
  );

  const beforeFadeRms = audioRms(output, 0.9, 0.08);
  const loopBoundaryRms = audioRms(
    output,
    nonMillisecondAudioDuration - 0.015,
    0.03,
  );
  const finalRms = audioRms(output, 1.317, 0.045);
  assert(
    beforeFadeRms > 0.01 && loopBoundaryRms > beforeFadeRms * 0.55,
    "sample-loop boundary remains audible without a silence gap",
  );
  assert(
    finalRms < beforeFadeRms * 0.35,
    "real soundtrack is strongly faded by the final frames",
  );

  const progressOutput = path.join(tempDir, "progress-output.mp4");
  const progressEvents: Array<{ outTimeSeconds: number; state: string }> = [];
  await runFfmpegQueued(
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=black:s=320x180:r=30:d=1",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-pix_fmt",
      "yuv420p",
      progressOutput,
    ],
    (progress) => progressEvents.push(progress),
  );
  assert(
    progressEvents.some((event) => event.outTimeSeconds > 0) &&
      progressEvents.at(-1)?.state === "end",
    "shared FFmpeg queue reports real processed media time through completion",
  );
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}