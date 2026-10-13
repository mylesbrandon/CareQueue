import assert from "node:assert/strict";
import { generateDraftPlan } from "../lib/carequeue-data.js";

export const AT = "2026-04-12T12:00:00.000Z";

export function caseRow(overrides = {}) {
  return {
    caseId: "case-1",
    memberId: "synthetic-member-1",
    workspace: "adult",
    caseType: "Adult",
    client: "Example Client",
    state: "TX",
    readmissionScore: 80,
    laceScore: 11,
    reasonText: "Synthetic workflow fixture",
    assignmentStatus: "unassigned",
    caseCreatedDate: "2026-04-12",
    ...overrides
  };
}

export function nurseRow(overrides = {}) {
  return {
    nurseId: "nurse-1",
    nurseName: "Alex Example",
    workspace: "adult",
    team: "Example Team",
    manager: "Example Manager",
    coveredClients: ["Example Client"],
    licensedStates: ["TX"],
    capabilities: ["Adult"],
    dailyCapacity: 3,
    currentlyAssignedCount: 0,
    active: true,
    ...overrides
  };
}

export function draft(overrides = {}) {
  return generateDraftPlan({
    workspaceId: "adult",
    cases: [caseRow()],
    nurses: [nurseRow()],
    lastRunAt: AT,
    ...overrides
  });
}

export function assignmentIds(plan) {
  return plan.assignments.map(({ caseId }) => caseId);
}

export function assertAccounting(plan, cases, nurses) {
  const candidates = cases.filter((item) => item.workspace === plan.workspaceId && item.assignmentStatus.trim().toLowerCase() !== "assigned");
  const assigned = assignmentIds(plan);
  const overflow = plan.overflow.map(({ caseId }) => caseId);
  assert.equal(new Set([...assigned, ...overflow]).size, candidates.length, "every open case appears once");
  assert.deepEqual([...assigned, ...overflow].sort(), candidates.map(({ caseId }) => caseId).sort());
  for (const nurse of nurses.filter((item) => item.workspace === plan.workspaceId)) {
    const count = plan.assignments.filter(({ nurseId }) => nurseId === nurse.nurseId).length;
    assert.ok(count <= Math.max(0, nurse.dailyCapacity - nurse.currentlyAssignedCount), `${nurse.nurseId} capacity respected`);
  }
}
