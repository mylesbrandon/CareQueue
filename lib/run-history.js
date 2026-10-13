import { WORKSPACES } from "./carequeue-data.js";

export function summarizeRun(entry) {
  const { workflow } = entry;
  const plan = workflow.plan;
  const assignedCount = plan.assignmentGroups.reduce((sum, group) => sum + group.assignedCases.length, 0);
  const highRiskAssigned = Math.max(0, plan.metrics.highRiskOpen - plan.metrics.unassignedHighRisk);
  return {
    id: entry.id,
    workspace: WORKSPACES[entry.workspaceId].label,
    timestamp: workflow.publishedAt,
    publishedAssignments: assignedCount,
    highRiskCoverage: plan.metrics.highRiskOpen ? Math.round(highRiskAssigned / plan.metrics.highRiskOpen * 100) : null,
    overflowCount: plan.overflow.length,
    overrideCount: workflow.overrideLog.length,
    averageCaseAge: plan.metrics.averageCaseAge,
    beforeAfter: `High-risk unassigned ${plan.metrics.highRiskOpen} → ${plan.metrics.unassignedHighRisk}`,
    entry
  };
}
