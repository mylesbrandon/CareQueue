import test from "node:test";
import assert from "node:assert/strict";
import { getEligibleNurseOptions, getWorkspaceDemoData } from "../lib/carequeue-data.js";
import { AT, caseRow, nurseRow, draft, assignmentIds, assertAccounting } from "./fixtures.js";

// Each scenario exercises public production code with synthetic data only.
test("eligibility: a licensed, active nurse with client coverage receives an Adult case", () => {
  assert.deepEqual(draft().assignments.map(({ caseId, nurseId }) => ({ caseId, nurseId })), [{ caseId: "case-1", nurseId: "nurse-1" }]);
});

test("eligibility: inactive nurses are excluded from automatic assignment", () => {
  const plan = draft({ nurses: [nurseRow({ active: false })] });
  assert.equal(plan.assignments.length, 0);
  assert.equal(plan.overflow.length, 1);
});

test("eligibility: client coverage cannot be borrowed from a different nurse", () => {
  const plan = draft({ nurses: [nurseRow({ nurseId: "client-only", licensedStates: ["CA"] }), nurseRow({ nurseId: "license-only", coveredClients: ["Other Client"] })] });
  assert.equal(plan.assignments.length, 0);
  assert.equal(plan.overflow[0].reasonCode, "state-mismatch");
});

test("eligibility: absent client coverage produces an actionable client blocker", () => {
  const plan = draft({ nurses: [nurseRow({ coveredClients: ["Other Client"] })] });
  assert.equal(plan.overflow[0].reasonCode, "client-mismatch");
});

test("eligibility: client coverage is an exact client match", () => {
  assert.equal(draft({ cases: [caseRow({ client: "Example" })] }).assignments.length, 0);
});

test("eligibility: an incompatible capability blocks assignment", () => {
  const plan = draft({ workspaceId: "specialty", cases: [caseRow({ workspace: "specialty", caseType: "NICU" })], nurses: [nurseRow({ workspace: "specialty", capabilities: ["Peds"] })] });
  assert.equal(plan.overflow[0].reasonCode, "capability-mismatch");
});

test("eligibility: a missing state license produces a state blocker", () => {
  assert.equal(draft({ cases: [caseRow({ state: "CA" })] }).overflow[0].reasonCode, "state-mismatch");
});

test("eligibility: explicit California license permits California cases", () => {
  assert.equal(draft({ cases: [caseRow({ state: "CA" })], nurses: [nurseRow({ licensedStates: ["CA"] })] }).assignments.length, 1);
});

test("eligibility: demo NLC policy permits a Texas case", () => {
  assert.equal(draft({ nurses: [nurseRow({ licensedStates: ["NLC"] })] }).assignments.length, 1);
});

test("eligibility: demo NLC policy does not permit a California case", () => {
  assert.equal(draft({ cases: [caseRow({ state: "CA" })], nurses: [nurseRow({ licensedStates: ["NLC"] })] }).overflow[0].reasonCode, "state-mismatch");
});

test("eligibility: explicit state license supplements demo NLC coverage", () => {
  assert.equal(draft({ cases: [caseRow({ state: "CA" })], nurses: [nurseRow({ licensedStates: ["NLC", "CA"] })] }).assignments.length, 1);
});

test("eligibility: Peds-only nurse receives a pediatric case", () => {
  const plan = draft({ workspaceId: "specialty", cases: [caseRow({ workspace: "specialty", caseType: "Peds" })], nurses: [nurseRow({ workspace: "specialty", capabilities: ["Peds"] })] });
  assert.equal(plan.assignments.length, 1);
});

test("eligibility: Peds-only nurse cannot receive a Newborn case", () => {
  const plan = draft({ workspaceId: "specialty", cases: [caseRow({ workspace: "specialty", caseType: "Newborn" })], nurses: [nurseRow({ workspace: "specialty", capabilities: ["Peds"] })] });
  assert.equal(plan.overflow[0].reasonCode, "capability-mismatch");
});

test("eligibility: Peds-only nurse cannot receive a NICU case", () => {
  const plan = draft({ workspaceId: "specialty", cases: [caseRow({ workspace: "specialty", caseType: "NICU" })], nurses: [nurseRow({ workspace: "specialty", capabilities: ["Peds"] })] });
  assert.equal(plan.overflow[0].reasonCode, "capability-mismatch");
});

test("eligibility: full-scope specialty nurse receives both Newborn and NICU cases", () => {
  const plan = draft({ workspaceId: "specialty", cases: [caseRow({ workspace: "specialty", caseType: "Newborn" }), caseRow({ caseId: "case-2", workspace: "specialty", caseType: "NICU" })], nurses: [nurseRow({ workspace: "specialty", capabilities: ["Peds", "Newborn", "NICU"] })] });
  assert.equal(plan.assignments.length, 2);
  assert.equal(plan.overflow.length, 0);
});

test("eligibility options: inactive nurses cannot be selected as a manual destination", () => {
  const options = getEligibleNurseOptions({ workspaceId: "adult", caseItem: caseRow(), nurses: [nurseRow({ active: false })], assignments: [] });
  assert.deepEqual(options, []);
});

test("eligibility options: current nurse can be excluded from reassignment choices", () => {
  assert.deepEqual(getEligibleNurseOptions({ workspaceId: "adult", caseItem: caseRow(), nurses: [nurseRow()], assignments: [], excludeNurseId: "nurse-1" }), []);
});

test("eligibility options: current case is not counted twice when checking capacity", () => {
  const options = getEligibleNurseOptions({ workspaceId: "adult", caseItem: caseRow(), nurses: [nurseRow({ dailyCapacity: 1 })], assignments: [{ caseId: "case-1", nurseId: "nurse-1" }] });
  assert.equal(options.length, 1);
});

test("eligibility options: other draft assignments consume remaining capacity", () => {
  const options = getEligibleNurseOptions({ workspaceId: "adult", caseItem: caseRow(), nurses: [nurseRow({ dailyCapacity: 1 })], assignments: [{ caseId: "other-case", nurseId: "nurse-1" }] });
  assert.deepEqual(options, []);
});

test("capacity: existing workload is subtracted before allocating new cases", () => {
  const cases = [caseRow(), caseRow({ caseId: "case-2" }), caseRow({ caseId: "case-3" })];
  const nurses = [nurseRow({ dailyCapacity: 3, currentlyAssignedCount: 2 })];
  const plan = draft({ cases, nurses });
  assert.equal(plan.assignments.length, 1);
  assert.equal(plan.overflow.length, 2);
  assertAccounting(plan, cases, nurses);
});

test("capacity: exactly full nurse produces capacity overflow", () => {
  assert.equal(draft({ nurses: [nurseRow({ currentlyAssignedCount: 3 })] }).overflow[0].reasonCode, "capacity-full");
});

test("capacity: already overloaded nurse receives no new assignments", () => {
  const plan = draft({ nurses: [nurseRow({ currentlyAssignedCount: 5 })] });
  assert.equal(plan.assignments.length, 0);
  assert.equal(plan.metrics.capacityToday, 0);
});

test("capacity: zero-capacity nurse produces capacity overflow", () => {
  assert.equal(draft({ nurses: [nurseRow({ dailyCapacity: 0 })] }).overflow[0].reasonCode, "capacity-full");
});

test("capacity: filling the last slot moves the next case to overflow", () => {
  const plan = draft({ cases: [caseRow({ readmissionScore: 90 }), caseRow({ caseId: "case-2", readmissionScore: 80 })], nurses: [nurseRow({ dailyCapacity: 1 })] });
  assert.deepEqual(assignmentIds(plan), ["case-1"]);
  assert.equal(plan.overflow[0].caseId, "case-2");
  assert.equal(plan.overflow[0].reasonCode, "capacity-full");
});

test("capacity: prefers the nurse with more remaining capacity", () => {
  const plan = draft({ nurses: [nurseRow({ nurseId: "small", dailyCapacity: 1 }), nurseRow({ nurseId: "large", dailyCapacity: 4 })] });
  assert.equal(plan.assignments[0].nurseId, "large");
});

test("capacity: remaining capacity, rather than nominal capacity, controls selection", () => {
  const plan = draft({ nurses: [nurseRow({ nurseId: "busy", dailyCapacity: 10, currentlyAssignedCount: 9 }), nurseRow({ nurseId: "available", dailyCapacity: 3 })] });
  assert.equal(plan.assignments[0].nurseId, "available");
});

test("capacity: equally available nurses are balanced as draft loads change", () => {
  const cases = Array.from({ length: 4 }, (_, i) => caseRow({ caseId: `case-${i}` }));
  const nurses = [nurseRow({ nurseId: "a", nurseName: "Alex", dailyCapacity: 2 }), nurseRow({ nurseId: "b", nurseName: "Blair", dailyCapacity: 2 })];
  const plan = draft({ cases, nurses });
  assert.equal(plan.assignments.filter(({ nurseId }) => nurseId === "a").length, 2);
  assert.equal(plan.assignments.filter(({ nurseId }) => nurseId === "b").length, 2);
  assertAccounting(plan, cases, nurses);
});

test("capacity: equal remaining slots prefer lower existing load", () => {
  const plan = draft({ nurses: [nurseRow({ nurseId: "busy", dailyCapacity: 4, currentlyAssignedCount: 2 }), nurseRow({ nurseId: "free", dailyCapacity: 2 })] });
  assert.equal(plan.assignments[0].nurseId, "free");
});

test("capacity: inactive capacity does not inflate workspace metrics", () => {
  assert.equal(draft({ nurses: [nurseRow({ active: false, dailyCapacity: 50 }), nurseRow({ nurseId: "active", dailyCapacity: 2 })] }).metrics.capacityToday, 2);
});

test("priority: aged high-risk cases precede newer high-risk cases", () => {
  const plan = draft({ cases: [caseRow({ caseId: "new", readmissionScore: 99 }), caseRow({ caseId: "aged", readmissionScore: 75, caseCreatedDate: "2026-04-10" })], nurses: [nurseRow({ dailyCapacity: 1 })] });
  assert.deepEqual(assignmentIds(plan), ["aged"]);
});

test("priority: newer high-risk case precedes aged medium-risk case", () => {
  const plan = draft({ cases: [caseRow({ caseId: "medium", readmissionScore: 74, caseCreatedDate: "2026-04-09" }), caseRow({ caseId: "high", readmissionScore: 75 })], nurses: [nurseRow({ dailyCapacity: 1 })] });
  assert.deepEqual(assignmentIds(plan), ["high"]);
});

test("priority: aged medium-risk case precedes old low-risk case", () => {
  const plan = draft({ cases: [caseRow({ caseId: "low", readmissionScore: 40, caseCreatedDate: "2026-04-05" }), caseRow({ caseId: "medium", readmissionScore: 55, caseCreatedDate: "2026-04-10" })], nurses: [nurseRow({ dailyCapacity: 1 })] });
  assert.deepEqual(assignmentIds(plan), ["medium"]);
});

test("priority: four-day low-risk case precedes a fresh elevated-risk case", () => {
  const plan = draft({ cases: [caseRow({ caseId: "fresh", readmissionScore: 74 }), caseRow({ caseId: "old", readmissionScore: 20, caseCreatedDate: "2026-04-08" })], nurses: [nurseRow({ dailyCapacity: 1 })] });
  assert.deepEqual(assignmentIds(plan), ["old"]);
});

test("priority: risk score breaks ties within the same priority band", () => {
  const plan = draft({ cases: [caseRow({ caseId: "lower", readmissionScore: 80 }), caseRow({ caseId: "higher", readmissionScore: 90 })], nurses: [nurseRow({ dailyCapacity: 1 })] });
  assert.deepEqual(assignmentIds(plan), ["higher"]);
});

test("priority: older age breaks ties at the same risk score", () => {
  const plan = draft({ cases: [caseRow({ caseId: "younger", caseCreatedDate: "2026-04-10" }), caseRow({ caseId: "older", caseCreatedDate: "2026-04-09" })], nurses: [nurseRow({ dailyCapacity: 1 })] });
  assert.deepEqual(assignmentIds(plan), ["older"]);
});

test("priority: LACE score breaks ties at the same risk and age", () => {
  const plan = draft({ cases: [caseRow({ caseId: "low-lace", laceScore: 10 }), caseRow({ caseId: "high-lace", laceScore: 15 })], nurses: [nurseRow({ dailyCapacity: 1 })] });
  assert.deepEqual(assignmentIds(plan), ["high-lace"]);
});

test("priority: specialty Peds preference applies within a priority band", () => {
  const plan = draft({ workspaceId: "specialty", cases: [caseRow({ workspace: "specialty", caseId: "nicu", caseType: "NICU", readmissionScore: 99 }), caseRow({ workspace: "specialty", caseId: "peds", caseType: "Peds", readmissionScore: 75 })], nurses: [nurseRow({ workspace: "specialty", capabilities: ["Peds", "NICU"], dailyCapacity: 1 })] });
  assert.deepEqual(assignmentIds(plan), ["peds"]);
});

test("priority: high-risk NICU precedes low-risk Peds", () => {
  const plan = draft({ workspaceId: "specialty", cases: [caseRow({ workspace: "specialty", caseId: "peds", caseType: "Peds", readmissionScore: 30 }), caseRow({ workspace: "specialty", caseId: "nicu", caseType: "NICU", readmissionScore: 90 })], nurses: [nurseRow({ workspace: "specialty", capabilities: ["Peds", "NICU"], dailyCapacity: 1 })] });
  assert.deepEqual(assignmentIds(plan), ["nicu"]);
});

test("determinism: identical case priorities use case ID regardless of input order", () => {
  const cases = [caseRow({ caseId: "b" }), caseRow({ caseId: "a" })];
  const nurses = [nurseRow({ dailyCapacity: 1 })];
  assert.deepEqual(assignmentIds(draft({ cases, nurses })), ["a"]);
  assert.deepEqual(assignmentIds(draft({ cases: cases.toReversed(), nurses })), ["a"]);
});

test("determinism: identical nurse names use nurse ID regardless of roster order", () => {
  const nurses = [nurseRow({ nurseId: "b" }), nurseRow({ nurseId: "a" })];
  assert.equal(draft({ nurses }).assignments[0].nurseId, "a");
  assert.equal(draft({ nurses: nurses.toReversed() }).assignments[0].nurseId, "a");
});

test("isolation: a matching nurse in another workspace cannot receive an Adult case", () => {
  assert.equal(draft({ nurses: [nurseRow({ workspace: "specialty" })] }).assignments.length, 0);
});

test("isolation: other-workspace cases do not enter assignments, overflow, aging, or metrics", () => {
  const plan = draft({ cases: [caseRow(), caseRow({ caseId: "foreign", workspace: "specialty", caseType: "NICU", caseCreatedDate: "2026-01-01" })] });
  assert.deepEqual(assignmentIds(plan), ["case-1"]);
  assert.equal(plan.metrics.openCases, 1);
  assert.ok(plan.agingWatchlist.every(({ workspace }) => workspace === "adult"));
  assert.ok(plan.overflow.every(({ workspace }) => workspace === "adult"));
});

test("isolation: other-workspace capacity does not inflate availability", () => {
  const plan = draft({ nurses: [nurseRow(), nurseRow({ nurseId: "foreign", workspace: "specialty", dailyCapacity: 100 })] });
  assert.equal(plan.metrics.capacityToday, 3);
});

test("status: already assigned cases are excluded from the assignment queue", () => {
  const plan = draft({ cases: [caseRow({ assignmentStatus: "assigned" })] });
  assert.equal(plan.assignments.length, 0);
  assert.equal(plan.overflow.length, 0);
  assert.equal(plan.metrics.openCases, 0);
});

test("status: assigned status is normalized for whitespace and casing", () => {
  assert.equal(draft({ cases: [caseRow({ assignmentStatus: " ASSIGNED " })] }).assignments.length, 0);
});

test("empty queue: plan contains zero counts and no phantom assignment", () => {
  const plan = draft({ cases: [] });
  assert.equal(plan.assignments.length, 0);
  assert.equal(plan.overflow.length, 0);
  assert.equal(plan.metrics.averageCaseAge, 0);
  assert.equal(plan.metrics.oldestCaseAge, 0);
});

test("empty roster: each open case remains visible in overflow", () => {
  const cases = [caseRow(), caseRow({ caseId: "case-2" })];
  const plan = draft({ cases, nurses: [] });
  assert.equal(plan.overflow.length, 2);
  assertAccounting(plan, cases, []);
});

test("purity: generating a draft does not mutate input cases or nurses", () => {
  const cases = [caseRow()];
  const nurses = [nurseRow()];
  const before = structuredClone({ cases, nurses });
  draft({ cases, nurses });
  assert.deepEqual({ cases, nurses }, before);
});

test("synthetic Adult dataset: every open case is assigned or has overflow without exceeding capacity", () => {
  const { cases, nurses } = getWorkspaceDemoData("adult");
  const plan = draft({ cases, nurses, lastRunAt: AT });
  assertAccounting(plan, cases, nurses);
  assert.equal(cases.length, 200);
});

test("synthetic specialty dataset: assignment capability and capacity invariants hold", () => {
  const { cases, nurses } = getWorkspaceDemoData("specialty");
  const plan = draft({ workspaceId: "specialty", cases, nurses });
  assertAccounting(plan, cases, nurses);
  for (const assignment of plan.assignments) {
    const nurse = nurses.find(({ nurseId }) => nurseId === assignment.nurseId);
    const item = cases.find(({ caseId }) => caseId === assignment.caseId);
    assert.ok(nurse.capabilities.includes(item.caseType));
  }
  assert.equal(cases.length, 60);
});
