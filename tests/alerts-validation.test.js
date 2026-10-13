import test from "node:test";
import assert from "node:assert/strict";
import { caseRow, nurseRow, draft } from "./fixtures.js";

function findAlert(plan, type) {
  return plan.alerts.find((alert) => alert.type === type);
}

test("alerts: fresh assigned draft has no overflow or aging alert", () => {
  assert.deepEqual(draft().alerts, []);
});

test("alerts: an unresolved case produces an overflow alert with its case ID", () => {
  const alert = findAlert(draft({ nurses: [] }), "overflow");
  assert.equal(alert.count, 1);
  assert.deepEqual(alert.caseIds, ["case-1"]);
});

test("alerts: a high-risk overflow case also produces a high-risk alert", () => {
  const alert = findAlert(draft({ cases: [caseRow({ readmissionScore: 75 })], nurses: [] }), "high-risk-overflow");
  assert.equal(alert.count, 1);
  assert.ok(alert.message.length > 0);
});

test("alerts: risk immediately below 75 does not produce high-risk alert", () => {
  assert.equal(findAlert(draft({ cases: [caseRow({ readmissionScore: 74 })], nurses: [] }), "high-risk-overflow"), undefined);
});

test("alerts: one-day overflow has no aging alert", () => {
  assert.equal(findAlert(draft({ cases: [caseRow({ caseCreatedDate: "2026-04-11" })], nurses: [] }), "aging"), undefined);
});

test("alerts: exactly two-day overflow triggers the aging boundary", () => {
  const alert = findAlert(draft({ cases: [caseRow({ caseCreatedDate: "2026-04-10" })], nurses: [] }), "aging");
  assert.equal(alert.count, 1);
  assert.deepEqual(alert.caseIds, ["case-1"]);
});

test("alerts: an aged case with a draft owner is watched without unresolved aging alert", () => {
  const plan = draft({ cases: [caseRow({ caseCreatedDate: "2026-04-09" })] });
  assert.equal(findAlert(plan, "aging"), undefined);
  assert.equal(plan.agingWatchlist[0].caseId, "case-1");
  assert.equal(plan.agingWatchlist[0].status, "Draft assigned");
});

test("alerts: already assigned old cases do not enter the aging watchlist", () => {
  const plan = draft({ cases: [caseRow({ assignmentStatus: "assigned", caseCreatedDate: "2026-04-01" })] });
  assert.equal(plan.agingWatchlist.length, 0);
  assert.deepEqual(plan.alerts, []);
});

test("alerts: fresh cases are omitted from the aging watchlist", () => {
  assert.equal(draft({ nurses: [] }).agingWatchlist.length, 0);
});

test("alerts: age derives from the supplied run timestamp rather than the system clock", () => {
  const cases = [caseRow({ caseCreatedDate: "2026-04-10" })];
  assert.equal(draft({ cases, nurses: [], lastRunAt: "2026-04-11T23:59:59.000Z" }).overflow[0].caseAgeDays, 1);
  assert.equal(draft({ cases, nurses: [], lastRunAt: "2026-04-12T00:00:00.000Z" }).overflow[0].caseAgeDays, 2);
});

test("alerts: UTC day age is stable across offset representations of the same instant", () => {
  const cases = [caseRow({ caseCreatedDate: "2026-04-10" })];
  const utc = draft({ cases, nurses: [], lastRunAt: "2026-04-12T01:00:00.000Z" });
  const offset = draft({ cases, nurses: [], lastRunAt: "2026-04-11T20:00:00-05:00" });
  assert.equal(utc.overflow[0].caseAgeDays, offset.overflow[0].caseAgeDays);
  assert.deepEqual(utc.alerts, offset.alerts);
});

test("alerts: future-created synthetic cases have zero age", () => {
  assert.equal(draft({ cases: [caseRow({ caseCreatedDate: "2026-04-13" })], nurses: [] }).overflow[0].caseAgeDays, 0);
});

test("alerts: all overflow remains counted when the exception preview is truncated", () => {
  const cases = Array.from({ length: 30 }, (_, i) => caseRow({ caseId: `case-${i}`, caseCreatedDate: "2026-04-01" }));
  const plan = draft({ cases, nurses: [] });
  assert.equal(plan.overflow.length, 30);
  assert.equal(findAlert(plan, "overflow").count, 30);
  assert.equal(findAlert(plan, "aging").count, 30);
  assert.equal(new Set(findAlert(plan, "aging").caseIds).size, 30);
});

test("validation: unknown workspace is rejected clearly", () => {
  assert.throws(() => draft({ workspaceId: "unknown" }), /workspace/i);
});

test("validation: duplicate case IDs cannot silently overwrite assignment lookup", () => {
  assert.throws(() => draft({ cases: [caseRow(), caseRow()] }), /duplicate|unique/i);
});

test("validation: duplicate nurse IDs cannot merge capacity", () => {
  assert.throws(() => draft({ nurses: [nurseRow(), nurseRow()] }), /duplicate|unique/i);
});

test("validation: invalid creation dates fail before creating aging metrics", () => {
  assert.throws(() => draft({ cases: [caseRow({ caseCreatedDate: "not-a-date" })] }), /date/i);
});

test("validation: invalid run timestamp is rejected", () => {
  assert.throws(() => draft({ lastRunAt: "not-a-date" }), /date|time/i);
});

test("validation: fractional capacity cannot create a phantom slot", () => {
  assert.throws(() => draft({ nurses: [nurseRow({ dailyCapacity: 1.5 })] }), /capacity/i);
});

test("validation: negative existing workload cannot inflate free slots", () => {
  assert.throws(() => draft({ nurses: [nurseRow({ currentlyAssignedCount: -1 })] }), /count|load|assigned/i);
});

test("validation: non-finite risk scores cannot bypass prioritization", () => {
  assert.throws(() => draft({ cases: [caseRow({ readmissionScore: NaN })] }), /score|risk/i);
});

test("validation: risk beyond the documented 0-100 range is rejected", () => {
  assert.throws(() => draft({ cases: [caseRow({ readmissionScore: 101 })] }), /score|risk/i);
});

test("validation: unknown assignment statuses cannot be interpreted as open cases", () => {
  assert.throws(() => draft({ cases: [caseRow({ assignmentStatus: "closed" })] }), /status/i);
});

test("validation: a case type belonging to another workspace is rejected", () => {
  assert.throws(() => draft({ cases: [caseRow({ caseType: "NICU" })] }), /type|workspace/i);
});
