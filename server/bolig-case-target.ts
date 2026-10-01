import type { BoligCase } from "@shared/schema";

export type BoligCaseTargetResult =
  | { kind: "unassigned" }
  | { kind: "invalid" }
  | { kind: "not-found" }
  | { kind: "forbidden" }
  | { kind: "valid"; caseId: number };

export async function resolveBoligCaseTarget(
  rawCaseId: unknown,
  userId: number,
  getCase: (caseId: number) => Promise<BoligCase | undefined>,
): Promise<BoligCaseTargetResult> {
  if (rawCaseId === undefined || rawCaseId === null) return { kind: "unassigned" };

  let caseId: number;
  if (typeof rawCaseId === "number") {
    caseId = rawCaseId;
  } else if (typeof rawCaseId === "string" && /^\d+$/.test(rawCaseId)) {
    caseId = Number(rawCaseId);
  } else {
    return { kind: "invalid" };
  }
  if (!Number.isSafeInteger(caseId) || caseId <= 0) return { kind: "invalid" };

  const targetCase = await getCase(caseId);
  if (!targetCase) return { kind: "not-found" };
  if (targetCase.userId !== userId) return { kind: "forbidden" };
  return { kind: "valid", caseId };
}