import crypto from "crypto";

export function localizedBoligCaseVideoFilename(
  userId: number,
  caseId: number,
  originalUrl: string,
): string {
  const identity = `${userId}\0${caseId}\0${originalUrl}`;
  const digest = crypto.createHash("sha256").update(identity).digest("hex");
  return `case-video-${digest}.mp4`;
}