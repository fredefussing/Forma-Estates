import {
  bindTourProjectTarget,
  reservePendingTourPlan,
  resolveTourProjectTarget,
  snapshotTourTarget,
} from "./ai-tour-state";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(`✗ ${message}`);
  console.log(`✓ ${message}`);
}

const caseA = { id: 1, address: "Case A" };
const caseB = { id: 2, address: "Case B" };

const pendingPlans = new Map<number, typeof caseA | null>();
assert(reservePendingTourPlan(pendingPlans, 7, caseA), "the first plan start reserves the property");
assert(!reservePendingTourPlan(pendingPlans, 7, caseB), "reopening while the plan is pending cannot reserve a second start");
assert(pendingPlans.get(7)?.id === caseA.id, "the pending plan retains its original target");
pendingPlans.delete(7);
assert(reservePendingTourPlan(pendingPlans, 7, caseB), "clearing a completed or failed reservation allows a later start");
assert(pendingPlans.get(7)?.id === caseB.id, "the later plan captures the newly selected case");

const projectTargets = new Map<number, typeof caseA | null>();
bindTourProjectTarget(projectTargets, 7, caseA);
const inFlightJobTarget = resolveTourProjectTarget(projectTargets, 7, caseA);
bindTourProjectTarget(projectTargets, 7, caseB);
const nextJobTarget = resolveTourProjectTarget(projectTargets, 7, caseB);
assert(inFlightJobTarget?.id === caseA.id, "an in-flight job keeps its captured case A target");
assert(nextJobTarget?.id === caseB.id, "explicit project rebind routes the next job to case B");
assert(snapshotTourTarget(caseA) !== caseA, "job targets are immutable value snapshots");