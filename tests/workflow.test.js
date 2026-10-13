import test from "node:test";
import assert from "node:assert/strict";
import {
  createWorkflow,
  applyOverride,
  reviewWorkflow,
  publishWorkflow,
  startNextRun
} from "../lib/carequeue-workflow.js";
import { AT, caseRow, nurseRow, assignmentIds } from "./fixtures.js";

const LATER = "2026-04-12T12:05:00.000Z";
const REASON = "Supervisor balanced coverage after synthetic handoff review.";

function scenario(overrides = {}) {
  const inputs = {
    cases: [caseRow()],
    nurses: [nurseRow({ nurseName: "Alex Example" }), nurseRow({ nurseId: "nurse-2", nurseName: "Blair Example" })],
    ...overrides
  };
  return { inputs, state: createWorkflow({ workspaceId: "adult", ...inputs, at: AT }) };
}

function change(state, inputs, overrides = {}) {
  return applyOverride(state, { caseId: "case-1", nurseId: "nurse-2", reason: REASON, at: LATER, ...overrides }, inputs);
}

function publishedScenario(overrides = {}) {
  const { state, inputs } = scenario(overrides);
  const reviewed = reviewWorkflow(state, { ...inputs, at: LATER });
  return { inputs, state, reviewed, published: publishWorkflow(reviewed, { ...inputs, at: LATER }) };
}

test("workflow: initialization creates a draft with no override history", () => {
  const { state } = scenario();
  assert.equal(state.stage, "draft");
  assert.equal(state.plan.stage, "draft");
  assert.deepEqual(state.overrideLog, []);
  assert.equal(state.plan.assignments.length, 1);
});

test("override: eligible reassignment moves a case without duplicating it", () => {
  const { state, inputs } = scenario();
  const updated = change(state, inputs);
  assert.equal(updated.plan.assignments.length, 1);
  assert.equal(updated.plan.assignments[0].nurseId, "nurse-2");
  assert.equal(updated.overrideLog.length, 1);
  assert.ok(updated.revision > state.revision);
});

test("override: reassignment records the supplied reason and time in audit history", () => {
  const { state, inputs } = scenario();
  const updated = change(state, inputs);
  const entry = updated.overrideLog[0];
  assert.equal(entry.reason, REASON);
  assert.ok(JSON.stringify(entry).includes(LATER));
  assert.ok(JSON.stringify(entry).includes("nurse-1"));
  assert.ok(JSON.stringify(entry).includes("nurse-2"));
});

test("override: moving a case to overflow requires and preserves its reason", () => {
  const { state, inputs } = scenario();
  const updated = change(state, inputs, { nurseId: null });
  assert.equal(updated.plan.assignments.length, 0);
  assert.equal(updated.plan.overflow.length, 1);
  assert.equal(updated.plan.overflow[0].caseId, "case-1");
  assert.equal(updated.overrideLog[0].reason, REASON);
});

test("override: manually held overflow can be assigned to an eligible nurse", () => {
  const { state, inputs } = scenario();
  const held = change(state, inputs, { nurseId: null });
  const restored = change(held, inputs);
  assert.equal(restored.plan.assignments[0].nurseId, "nurse-2");
  assert.equal(restored.plan.overflow.length, 0);
  assert.equal(restored.overrideLog.length, 2);
});

test("override: a blank reason is rejected without altering the prior draft", () => {
  const { state, inputs } = scenario();
  const before = structuredClone(state);
  assert.throws(() => change(state, inputs, { reason: "   " }), /reason/i);
  assert.deepEqual(state, before);
});

test("override: a nonexistent case cannot be introduced into a draft", () => {
  const { state, inputs } = scenario();
  assert.throws(() => change(state, inputs, { caseId: "missing-case" }), /case/i);
});

test("override: a nonexistent nurse cannot receive a case", () => {
  const { state, inputs } = scenario();
  assert.throws(() => change(state, inputs, { nurseId: "missing-nurse" }), /nurse/i);
});

test("override: selecting the current nurse is rejected as a no-op", () => {
  const { state, inputs } = scenario();
  assert.throws(() => change(state, inputs, { nurseId: "nurse-1" }), /already|same|change/i);
});

test("override: inactive destinations remain blocked", () => {
  const { state, inputs } = scenario({ nurses: [nurseRow(), nurseRow({ nurseId: "nurse-2", active: false })] });
  assert.throws(() => change(state, inputs), /active|eligible/i);
});

test("override: a missing license cannot be bypassed manually", () => {
  const { state, inputs } = scenario({ nurses: [nurseRow(), nurseRow({ nurseId: "nurse-2", licensedStates: ["CA"] })] });
  assert.throws(() => change(state, inputs), /license|eligible/i);
});

test("override: uncovered client cannot be bypassed manually", () => {
  const { state, inputs } = scenario({ nurses: [nurseRow(), nurseRow({ nurseId: "nurse-2", coveredClients: ["Other Client"] })] });
  assert.throws(() => change(state, inputs), /client|eligible/i);
});

test("override: full nurse cannot exceed daily capacity", () => {
  const { state, inputs } = scenario({ nurses: [nurseRow(), nurseRow({ nurseId: "nurse-2", dailyCapacity: 1, currentlyAssignedCount: 1 })] });
  assert.throws(() => change(state, inputs), /capacity|eligible/i);
});

test("override: another workspace cannot receive a manual reassignment", () => {
  const { state, inputs } = scenario({ nurses: [nurseRow(), nurseRow({ nurseId: "nurse-2", workspace: "specialty", capabilities: ["Peds"] })] });
  assert.throws(() => change(state, inputs), /workspace|eligible/i);
});

test("override: previously assigned case cannot be added to the draft", () => {
  const { state, inputs } = scenario({ cases: [caseRow(), caseRow({ caseId: "already-owned", assignmentStatus: "assigned" })] });
  assert.throws(() => change(state, inputs, { caseId: "already-owned" }), /assigned|open|case/i);
});

test("override: changes preserve input objects and the prior workflow state", () => {
  const { state, inputs } = scenario();
  const before = structuredClone({ state, inputs });
  change(state, inputs);
  assert.deepEqual({ state, inputs }, before);
});

test("review: reviewing a valid draft captures its current revision", () => {
  const { state, inputs } = scenario();
  const reviewed = reviewWorkflow(state, { ...inputs, at: LATER });
  assert.equal(reviewed.stage, "reviewed");
  assert.equal(reviewed.plan.stage, "reviewed");
  assert.equal(reviewed.reviewedRevision, reviewed.revision);
});

test("review: modifying a reviewed plan resets it to draft and invalidates approval", () => {
  const { state, inputs } = scenario();
  const reviewed = reviewWorkflow(state, { ...inputs, at: LATER });
  const updated = change(reviewed, inputs);
  assert.equal(updated.stage, "draft");
  assert.notEqual(updated.reviewedRevision, updated.revision);
  assert.throws(() => publishWorkflow(updated, { ...inputs, at: LATER }), /review/i);
});

test("publish: an unreviewed draft cannot be published", () => {
  const { state, inputs } = scenario();
  assert.throws(() => publishWorkflow(state, { ...inputs, at: LATER }), /review/i);
});

test("publish: reviewed plan becomes published with an immutable snapshot", () => {
  const { published } = publishedScenario();
  assert.equal(published.stage, "published");
  assert.equal(published.plan.stage, "published");
  assert.equal(published.publishedAt, LATER);
  assert.ok(Object.isFrozen(published.publishedSnapshot));
});

test("publish: the original cases and nurse loads are never mutated", () => {
  const { state, inputs } = scenario();
  const before = structuredClone(inputs);
  publishWorkflow(reviewWorkflow(state, { ...inputs, at: LATER }), { ...inputs, at: LATER });
  assert.deepEqual(inputs, before);
});

test("publish: an already published workflow cannot be published twice", () => {
  const { published, inputs } = publishedScenario();
  assert.throws(() => publishWorkflow(published, { ...inputs, at: LATER }), /published/i);
});

test("publish: published assignments cannot be manually edited", () => {
  const { published, inputs } = publishedScenario();
  assert.throws(() => change(published, inputs), /published|read.only/i);
});

test("publish: deactivation after review blocks stale assignments", () => {
  const { state, inputs } = scenario();
  const reviewed = reviewWorkflow(state, { ...inputs, at: LATER });
  const changedInputs = { ...inputs, nurses: inputs.nurses.map((item) => item.nurseId === "nurse-1" ? { ...item, active: false } : item) };
  assert.throws(() => publishWorkflow(reviewed, { ...changedInputs, at: LATER }), /eligible|active|changed|stale|invalid/i);
});

test("publish: increased existing workload after review cannot overbook a nurse", () => {
  const { state, inputs } = scenario();
  const reviewed = reviewWorkflow(state, { ...inputs, at: LATER });
  const changedInputs = { ...inputs, nurses: inputs.nurses.map((item) => item.nurseId === "nurse-1" ? { ...item, currentlyAssignedCount: item.dailyCapacity } : item) };
  assert.throws(() => publishWorkflow(reviewed, { ...changedInputs, at: LATER }), /capacity|eligible|changed|stale|invalid/i);
});

test("publish: manual overflow is preserved while other assignments are committed", () => {
  const { state, inputs } = scenario({ cases: [caseRow(), caseRow({ caseId: "case-2" })] });
  const held = change(state, inputs, { nurseId: null });
  const published = publishWorkflow(reviewWorkflow(held, { ...inputs, at: LATER }), { ...inputs, at: LATER });
  assert.equal(published.plan.assignments.length, 1);
  assert.equal(published.plan.overflow.length, 1);
  assert.equal(published.plan.overflow[0].caseId, "case-1");
});

test("next run: published cases never reappear in draft assignments or overflow", () => {
  const { published, inputs } = publishedScenario();
  const next = startNextRun(published, { ...inputs, at: LATER });
  assert.equal(next.stage, "draft");
  assert.equal(next.plan.assignments.length, 0);
  assert.equal(next.plan.overflow.length, 0);
  assert.equal(next.plan.metrics.openCases, 0);
});

test("next run: newly arriving cases respect capacity consumed by published assignments", () => {
  const { published, inputs } = publishedScenario({ nurses: [nurseRow({ dailyCapacity: 1 })] });
  const nextInputs = { ...inputs, cases: [...inputs.cases, caseRow({ caseId: "new-arrival" })] };
  const next = startNextRun(published, { ...nextInputs, at: LATER });
  assert.deepEqual(assignmentIds(next.plan), []);
  assert.equal(next.plan.overflow[0].caseId, "new-arrival");
  assert.equal(next.plan.overflow[0].reasonCode, "capacity-full");
});

test("next run: rebuilding an unpublished draft does not consume its provisional capacity", () => {
  const { state, inputs } = scenario({ nurses: [nurseRow({ dailyCapacity: 1 })] });
  const next = startNextRun(state, { ...inputs, at: LATER });
  assert.deepEqual(assignmentIds(next.plan), ["case-1"]);
  assert.equal(next.plan.overflow.length, 0);
});

test("next run: committed load is counted once across repeated subsequent runs", () => {
  const { published, inputs } = publishedScenario({ nurses: [nurseRow({ dailyCapacity: 2 })] });
  const nextInputs = { ...inputs, cases: [...inputs.cases, caseRow({ caseId: "new-arrival" })] };
  const next = startNextRun(published, { ...nextInputs, at: LATER });
  const repeated = startNextRun(next, { ...nextInputs, at: LATER });
  assert.deepEqual(assignmentIds(next.plan), ["new-arrival"]);
  assert.deepEqual(assignmentIds(repeated.plan), ["new-arrival"]);
  assert.equal(repeated.plan.metrics.capacityToday, 1);
});
