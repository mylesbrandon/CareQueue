import {
  WORKSPACES,
  generateDraftPlan,
  getEligibleNurseOptions,
  normalizeAssignmentStatus,
  validTimestamp,
  validateWorkspaceInputs
} from "./carequeue-data.js";

const clone = (value) => JSON.parse(JSON.stringify(value));

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function requireState(state) {
  if (!state || !["draft", "reviewed", "published"].includes(state.stage) || !state.plan) throw new Error("Invalid workflow state.");
}

function requireEditable(state) {
  requireState(state);
  if (state.stage === "published") throw new Error("Published runs are read-only. Start a new run to continue.");
}

/** Base counts represent work before this browser session. Commitments add load exactly once. */
export function getWorkflowInputs(state, { cases, nurses }) {
  validateWorkspaceInputs({ workspaceId: state.workspaceId, cases, nurses });
  const commitments = state.committedAssignments || [];
  const caseIds = new Set();
  const loads = new Map();
  commitments.forEach((assignment) => {
    if (caseIds.has(assignment.caseId)) throw new Error("Duplicate committed assignment.");
    caseIds.add(assignment.caseId);
    loads.set(assignment.nurseId, (loads.get(assignment.nurseId) || 0) + 1);
  });
  return {
    cases: cases.map((item) => item.workspace === state.workspaceId && caseIds.has(item.caseId)
      ? { ...item, assignmentStatus: "assigned" } : { ...item }),
    nurses: nurses.map((nurse) => nurse.workspace === state.workspaceId
      ? { ...nurse, currentlyAssignedCount: nurse.currentlyAssignedCount + (loads.get(nurse.nurseId) || 0) }
      : { ...nurse })
  };
}

// Sorted records avoid considering a harmless input-array reorder a stale review.
function sourceSignature(state, inputs) {
  const scoped = validateWorkspaceInputs({ workspaceId: state.workspaceId, ...inputs });
  const byId = (key) => (left, right) => left[key] < right[key] ? -1 : left[key] > right[key] ? 1 : 0;
  return JSON.stringify({
    cases: scoped.cases.slice().sort(byId("caseId")),
    nurses: scoped.nurses.slice().sort(byId("nurseId")),
    commitments: (state.committedAssignments || []).slice().sort(byId("caseId"))
  });
}

function buildPlan(state, inputs, stage = state.stage) {
  const effective = getWorkflowInputs(state, inputs);
  return generateDraftPlan({
    workspaceId: state.workspaceId,
    ...effective,
    lastRunAt: state.plan.lastRunAt,
    stage,
    assignments: state.plan.assignments,
    manualHolds: state.plan.manualHolds
  });
}

function activity(state, message, at) {
  return [{ message, at }, ...state.recentChanges];
}

function newRun({ workspaceId, cases, nurses, at, committedAssignments = [], runSequence = 1, publishedSnapshot = null }) {
  const timestamp = validTimestamp(at);
  const identity = { workspaceId, committedAssignments: clone(committedAssignments) };
  const effective = getWorkflowInputs(identity, { cases, nurses });
  return {
    ...identity,
    schemaVersion: 1,
    runId: `${workspaceId}-${timestamp}-${runSequence}`,
    runSequence,
    stage: "draft",
    revision: 1,
    reviewedRevision: null,
    reviewedAt: null,
    reviewedSourceSignature: null,
    publishedAt: null,
    publishedSnapshot,
    plan: generateDraftPlan({ workspaceId, ...effective, lastRunAt: timestamp }),
    overrideLog: [],
    recentChanges: [{ message: "Generated draft using the current demo eligibility rules.", at: timestamp }]
  };
}

export function createWorkflow({ workspaceId, cases, nurses, at = new Date().toISOString() }) {
  return newRun({ workspaceId, cases, nurses, at });
}

/** Explicit target + reason; null target is a manual hold and leaves the case visible in overflow. */
export function applyOverride(state, { caseId, nurseId, reason, at = new Date().toISOString() }, inputs) {
  requireEditable(state);
  const timestamp = validTimestamp(at);
  if (typeof reason !== "string" || !reason.trim()) throw new Error("A nonempty override reason is required.");
  if (nurseId !== null && (typeof nurseId !== "string" || !nurseId.trim())) throw new Error("Choose an eligible nurse or an explicit manual hold.");
  const effective = getWorkflowInputs(state, inputs);
  // Validate every existing assignment first; a stale roster must never silently bypass eligibility.
  buildPlan(state, inputs);
  const caseItem = effective.cases.find((item) => item.caseId === caseId && item.workspace === state.workspaceId);
  if (!caseItem || normalizeAssignmentStatus(caseItem.assignmentStatus) !== "unassigned") throw new Error("Case is missing, outside this workspace, or already committed.");
  const current = state.plan.assignments.find((assignment) => assignment.caseId === caseId);
  if (nurseId === current?.nurseId) throw new Error("This case is already assigned to the selected nurse.");
  if (nurseId === null && state.plan.manualHolds.some((hold) => hold.caseId === caseId)) throw new Error("This case is already on manual hold.");
  let nextNurse = null;
  if (nurseId !== null) {
    nextNurse = getEligibleNurseOptions({ workspaceId: state.workspaceId, caseItem, nurses: effective.nurses, assignments: state.plan.assignments })
      .find((nurse) => nurse.nurseId === nurseId);
    if (!nextNurse) throw new Error("Selected nurse is not eligible or has no remaining capacity.");
  }
  const assignments = state.plan.assignments.filter((assignment) => assignment.caseId !== caseId);
  const manualHolds = state.plan.manualHolds.filter((hold) => hold.caseId !== caseId);
  if (nurseId === null) manualHolds.push({ caseId, reason: reason.trim() });
  else assignments.push({ caseId, nurseId, source: "manual", overrideReason: reason.trim() });
  const plan = generateDraftPlan({ workspaceId: state.workspaceId, ...effective, lastRunAt: state.plan.lastRunAt, stage: "draft", assignments, manualHolds });
  const fromNurse = effective.nurses.find((nurse) => nurse.nurseId === current?.nurseId);
  const message = nurseId === null
    ? `${caseItem.memberId} placed on manual hold${fromNurse ? ` from ${fromNurse.nurseName}` : ""}. Reason: ${reason.trim()}`
    : `${caseItem.memberId} ${fromNurse ? `reassigned from ${fromNurse.nurseName}` : "assigned from overflow"} to ${nextNurse.nurseName}. Reason: ${reason.trim()}`;
  return {
    ...state,
    stage: "draft",
    revision: state.revision + 1,
    reviewedRevision: null,
    reviewedAt: null,
    reviewedSourceSignature: null,
    plan,
    overrideLog: [...state.overrideLog, { caseId, fromNurseId: current?.nurseId || null, toNurseId: nurseId, action: nurseId === null ? "hold" : current ? "reassign" : "assign", reason: reason.trim(), at: timestamp, message }],
    recentChanges: activity(state, message, timestamp)
  };
}

export function reviewWorkflow(state, { cases, nurses, at = new Date().toISOString() }) {
  requireEditable(state);
  const timestamp = validTimestamp(at);
  const inputs = { cases, nurses };
  const plan = buildPlan(state, inputs, "reviewed");
  return {
    ...state,
    stage: "reviewed",
    reviewedRevision: state.revision,
    reviewedAt: timestamp,
    reviewedSourceSignature: sourceSignature(state, inputs),
    plan,
    recentChanges: activity(state, `Reviewed ${plan.assignments.length} proposed assignments and acknowledged ${plan.overflow.length} overflow cases.`, timestamp)
  };
}

export function publishWorkflow(state, { cases, nurses, at = new Date().toISOString() }) {
  requireEditable(state);
  if (state.stage !== "reviewed" || state.reviewedRevision !== state.revision) throw new Error("Review the current draft before publishing.");
  const timestamp = validTimestamp(at);
  const inputs = { cases, nurses };
  if (state.reviewedSourceSignature !== sourceSignature(state, inputs)) throw new Error("Case data or nurse roster changed since review. Review again before publishing.");
  const plan = buildPlan(state, inputs, "published");
  const snapshot = deepFreeze(clone({
    id: state.runId,
    workspaceId: state.workspaceId,
    workspace: WORKSPACES[state.workspaceId].label,
    timestamp,
    publishedAt: timestamp,
    reviewedAt: state.reviewedAt,
    revision: state.revision,
    assignments: plan.assignments,
    overrideLog: state.overrideLog,
    draftAssignments: plan.assignments.length,
    publishedAssignments: plan.assignments.length,
    highRiskCoverage: `${plan.metrics.highRiskCoverage}%`,
    overflowCount: plan.overflow.length,
    overrideCount: state.overrideLog.length,
    beforeAfter: `High-risk unassigned ${plan.metrics.highRiskOpen} → ${plan.metrics.unassignedHighRisk}`,
    plan
  }));
  const committedAssignments = state.committedAssignments.concat(plan.assignments.map((assignment) => ({
    caseId: assignment.caseId, nurseId: assignment.nurseId, publishedAt: timestamp, runId: state.runId
  })));
  return {
    ...state,
    stage: "published",
    plan: deepFreeze(clone(plan)),
    publishedAt: timestamp,
    publishedSnapshot: snapshot,
    committedAssignments,
    recentChanges: activity(state, `Published ${plan.assignments.length} assignments. This run is now read-only.`, timestamp)
  };
}

export function startNextRun(state, { cases, nurses, at = new Date().toISOString() }) {
  requireState(state);
  return newRun({
    workspaceId: state.workspaceId,
    cases,
    nurses,
    at,
    committedAssignments: state.committedAssignments,
    runSequence: state.runSequence + 1,
    publishedSnapshot: state.publishedSnapshot
  });
}
