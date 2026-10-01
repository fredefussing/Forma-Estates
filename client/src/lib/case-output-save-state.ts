export interface SaveAttemptIdentity {
  version: number;
  identity: string;
}

export interface OutputDeliveryTracker {
  attempt: SaveAttemptIdentity;
  caseId: number;
  requiredOutputKeys: string[];
  acknowledgedOutputKeys: string[];
}

export function makeSaveAttempt(version: number, identity: string): SaveAttemptIdentity {
  return Object.freeze({ version, identity });
}

export function isCurrentSaveAttempt(
  current: SaveAttemptIdentity | null | undefined,
  expected: SaveAttemptIdentity,
): boolean {
  return !!current && current.version === expected.version && current.identity === expected.identity;
}

export function beginOutputDelivery(
  attempt: SaveAttemptIdentity,
  caseId: number,
  outputKeys: string[],
): OutputDeliveryTracker {
  return {
    attempt,
    caseId,
    requiredOutputKeys: Array.from(new Set(outputKeys)),
    acknowledgedOutputKeys: [],
  };
}

export function acknowledgeOutputDelivery(
  tracker: OutputDeliveryTracker,
  current: SaveAttemptIdentity | null | undefined,
  expected: SaveAttemptIdentity,
  outputKey: string,
): OutputDeliveryTracker {
  if (
    !isCurrentSaveAttempt(current, expected) ||
    !isCurrentSaveAttempt(tracker.attempt, expected) ||
    !tracker.requiredOutputKeys.includes(outputKey)
  ) return tracker;
  if (tracker.acknowledgedOutputKeys.includes(outputKey)) return tracker;
  return {
    ...tracker,
    acknowledgedOutputKeys: [...tracker.acknowledgedOutputKeys, outputKey],
  };
}

export function acknowledgedDeliveryCaseId(
  tracker: OutputDeliveryTracker,
  current: SaveAttemptIdentity | null | undefined,
  expected: SaveAttemptIdentity,
): number | null {
  if (
    !isCurrentSaveAttempt(current, expected) ||
    !isCurrentSaveAttempt(tracker.attempt, expected) ||
    tracker.requiredOutputKeys.length === 0 ||
    !tracker.requiredOutputKeys.every((key) => tracker.acknowledgedOutputKeys.includes(key))
  ) return null;
  return tracker.caseId;
}