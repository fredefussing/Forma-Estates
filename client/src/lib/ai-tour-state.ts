export interface TourCaseTarget {
  id: number;
  address: string;
}

export function snapshotTourTarget<T extends TourCaseTarget>(
  target: T | null | undefined,
): T | null {
  return target ? Object.freeze({ ...target }) as T : null;
}

export function bindTourProjectTarget<T extends TourCaseTarget>(
  targets: Map<number, T | null>,
  propertyId: number,
  target: T | null | undefined,
): void {
  targets.set(propertyId, snapshotTourTarget(target));
}

export function resolveTourProjectTarget<T extends TourCaseTarget>(
  targets: Map<number, T | null>,
  propertyId: number,
  currentTarget: T | null | undefined,
): T | null {
  return snapshotTourTarget(targets.has(propertyId) ? targets.get(propertyId) : currentTarget);
}

export function reservePendingTourPlan<T extends TourCaseTarget>(
  pending: Map<number, T | null>,
  propertyId: number,
  target: T | null | undefined,
): boolean {
  if (pending.has(propertyId)) return false;
  pending.set(propertyId, snapshotTourTarget(target));
  return true;
}