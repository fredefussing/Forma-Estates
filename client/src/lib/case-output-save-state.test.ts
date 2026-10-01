import {
  acknowledgeOutputDelivery,
  acknowledgedDeliveryCaseId,
  beginOutputDelivery,
  isCurrentSaveAttempt,
  makeSaveAttempt,
} from "./case-output-save-state";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(`✗ ${message}`);
  console.log(`✓ ${message}`);
}

const firstAttempt = makeSaveAttempt(1, "floorplan-url-a");
let currentAttempt = firstAttempt;
let single = beginOutputDelivery(firstAttempt, 14, ["floorplan-url-a"]);
assert(acknowledgedDeliveryCaseId(single, currentAttempt, firstAttempt) === null, "a failed or pending save is not acknowledged");
single = acknowledgeOutputDelivery(single, currentAttempt, firstAttempt, "floorplan-url-a");
assert(acknowledgedDeliveryCaseId(single, currentAttempt, firstAttempt) === 14, "a successful save acknowledges the assigned case");

const nextAttempt = makeSaveAttempt(2, "floorplan-url-b");
currentAttempt = nextAttempt;
const staleResult = acknowledgeOutputDelivery(single, currentAttempt, firstAttempt, "floorplan-url-a");
assert(acknowledgedDeliveryCaseId(staleResult, currentAttempt, firstAttempt) === null, "a stale callback cannot mark a newer result saved");
assert(isCurrentSaveAttempt(currentAttempt, nextAttempt), "the newest result identity remains current");

let batch = beginOutputDelivery(nextAttempt, 21, ["clip-a", "clip-b", "clip-c"]);
batch = acknowledgeOutputDelivery(batch, currentAttempt, nextAttempt, "clip-a");
batch = acknowledgeOutputDelivery(batch, currentAttempt, nextAttempt, "clip-c");
assert(acknowledgedDeliveryCaseId(batch, currentAttempt, nextAttempt) === null, "partial showcase delivery remains unsaved");
batch = acknowledgeOutputDelivery(batch, currentAttempt, nextAttempt, "clip-b");
assert(acknowledgedDeliveryCaseId(batch, currentAttempt, nextAttempt) === 21, "showcase is acknowledged only after every output is saved");