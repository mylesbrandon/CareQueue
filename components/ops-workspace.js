"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { DataTable } from "./data-table";
import { Modal } from "./modal";
import { useDemo } from "./demo-provider";
import { WORKSPACES, buildCaseDrawerModel, getEligibleNurseOptions } from "../lib/carequeue-data";
import { createWorkflow, applyOverride, reviewWorkflow, publishWorkflow, startNextRun, getWorkflowInputs } from "../lib/carequeue-workflow";

export function OpsWorkspace({ workspaceId }) {
  const { session, saveWorkflow } = useDemo();
  const source = session.workspaces[workspaceId];
  const initial = useMemo(() => source.workflow || createWorkflow({ workspaceId, cases: source.cases, nurses: source.nurses }), [workspaceId, source.cases, source.nurses, source.workflow]);
  const draftState = source.workflow || initial;
  const workspace = WORKSPACES[workspaceId];
  const [assignmentSearch, setAssignmentSearch] = useState("");
  const [assignmentSort, setAssignmentSort] = useState("assigned");
  const [overflowSearch, setOverflowSearch] = useState("");
  const [selectedCase, setSelectedCase] = useState(null);
  const [override, setOverride] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [expandedGroups, setExpandedGroups] = useState(() => getDefaultExpandedGroups(draftState.plan.assignmentGroups));
  const deferredAssignmentSearch = useDeferredValue(assignmentSearch);
  const deferredOverflowSearch = useDeferredValue(overflowSearch);
  const assignmentGroups = filterAndSortAssignmentGroups(draftState.plan.assignmentGroups, deferredAssignmentSearch, assignmentSort);
  const overflowRows = filterOverflowRows(draftState.plan.overflow, deferredOverflowSearch);
  const locked = draftState.stage === "published";
  const editingDisabled = locked || source.rosterChanged;
  const inputs = { cases: source.cases, nurses: source.nurses };

  function transition(action, message, publish = false) {
    try {
      const next = action();
      saveWorkflow(workspaceId, next, publish);
      setError("");
      setNotice(message);
      return next;
    } catch (failure) {
      setError(failure.message);
      return null;
    }
  }

  const toggleGroup = (nurseId) => setExpandedGroups((current) => {
    const next = new Set(current);
    if (next.has(nurseId)) next.delete(nurseId); else next.add(nurseId);
    return next;
  });

  const openCase = (caseItem, nurse, overflowReason) => {
    const assigned = draftState.plan.assignmentGroups.find((group) => group.assignedCases.some((item) => item.caseId === caseItem.caseId));
    const model = buildCaseDrawerModel({ workspaceId, caseItem, nurse: nurse || assigned?.nurse, overflowReason, referenceDate: draftState.plan.referenceDate, stage: draftState.stage });
    if (locked && assigned) model.assignmentStatus = "Published";
    setSelectedCase(model);
  };

  const generate = () => {
    const next = transition(() => startNextRun(draftState, inputs), "New draft generated using the current roster and remaining cases.");
    if (next) setExpandedGroups(getDefaultExpandedGroups(next.plan.assignmentGroups));
    setConfirmation(null);
  };
  const handleGenerate = () => {
    if (!locked && draftState.overrideLog.length) setConfirmation("regenerate");
    else generate();
  };
  const handleReview = () => transition(() => reviewWorkflow(draftState, inputs), "Review recorded. Publish when you have checked assignments and remaining alerts.");
  const handlePublish = () => {
    const next = transition(() => publishWorkflow(draftState, inputs), "Published snapshot saved. Assignments are locked and available in Assignment Runs.", true);
    if (next) setConfirmation(null);
  };

  const handleExport = () => {
    const rows = [["stage", "nurseName", "memberId", "client", "state", "caseType", "readmissionScore", "laceScore", "caseAge", "confidence"]];
    draftState.plan.assignmentGroups.forEach((group) => group.assignedCases.forEach((item) => rows.push([
      draftState.stage, group.nurse.nurseName, item.memberId, item.client, item.state,
      item.caseType, item.readmissionScore, item.laceScore, item.caseAgeDays, item.assignmentConfidence
    ])));
    const csv = rows.map((row) => row.map((value) => {
      const text = String(value);
      const safe = /^[=+@\-\t\r\n]/.test(text) ? `'${text}` : text;
      return `"${safe.replaceAll('"', '""')}"`;
    }).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${workspaceId}-${draftState.stage}-assignments.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const openOverride = (caseItem, nurse, action) => {
    const effective = getWorkflowInputs(draftState, inputs);
    const options = action === "remove" ? [] : getEligibleNurseOptions({
      workspaceId, caseItem, nurses: effective.nurses, assignments: draftState.plan.assignments,
      excludeNurseId: nurse?.nurseId
    });
    setOverride({ caseItem, nurse, action, options });
    setError("");
  };
  const commitOverride = (nurseId, reason) => {
    const next = transition(() => applyOverride(draftState, { caseId: override.caseItem.caseId, nurseId, reason }, inputs), "Override saved with its reason. Review the updated draft before publishing.");
    if (next) {
      setOverride(null);
      if (nurseId) setExpandedGroups((current) => new Set([...current, nurseId]));
    }
  };
  const assignmentColumns = createAssignmentColumns({ onOpenCase: openCase, onReassign: (item, nurse) => openOverride(item, nurse, "assign"), onRemove: (item, nurse) => openOverride(item, nurse, "remove"), disabled: editingDisabled });
  const overflowColumns = createOverflowColumns({ onOpenCase: openCase, onAssign: (item) => openOverride(item, null, "assign"), disabled: editingDisabled });
  const agingColumns = createAgingColumns({ onOpenCase: openCase });
  const exceptionColumns = createExceptionColumns({ onOpenCase: openCase });
  const metrics = draftState.plan.metrics;
  const overflowSummary = draftState.plan.overflowSummary;
  return (
    <section className="workspace-shell">
      <header className="workspace-command-bar">
        <div>
          <div className="workspace-eyebrow">{workspace.label}</div>
          <h1 className="workspace-title">{workspace.label}</h1>
          <div className="workspace-meta">
            <span className={`stage-pill ${draftState.stage}`}>{draftState.stage}</span>
            <span>Last run {draftState.plan.lastRunAtLabel || formatRunTime(draftState.plan.lastRunAt)}</span>
          </div>
        </div>
        <div className="command-actions">
          <button className="primary-action" onClick={handleGenerate}>{locked ? "Start next run" : "Generate assignments"}</button>
          <button className="secondary-action" onClick={handleReview} disabled={editingDisabled || draftState.stage === "reviewed"}>Review draft</button>
          <button className="secondary-action" onClick={() => setConfirmation("publish")} disabled={editingDisabled || draftState.stage !== "reviewed"}>Publish assignments</button>
          <button className="ghost-action" onClick={handleExport}>Export</button>
        </div>
      </header>

      {source.rosterChanged ? <div className="notice warning" role="status">Roster changed. Generate a new draft to apply the latest eligibility rules. Published snapshots remain saved.</div> : null}
      {error ? <div className="notice error" role="alert">{error}</div> : null}
      {notice ? <div className="notice" role="status">{notice}</div> : null}
      <div className="workflow-guide">1. Generate → 2. Inspect and override → 3. Review → 4. Publish · {locked ? "Published snapshot is locked." : "Publishing requires a reviewed draft."}</div>
      <section className="kpi-grid">
        <KpiCard label="Open Cases" value={metrics.openCases} />
        <KpiCard label="High-Risk Open" value={metrics.highRiskOpen} tone="danger" />
        <KpiCard label="Capacity Today" value={metrics.capacityToday} />
        <KpiCard label="Oldest Case" value={`${metrics.oldestCaseAge}d`} tone="warning" />
        <KpiCard label="Oldest High-Risk Case" value={`${metrics.oldestHighRiskAge}d`} tone="danger" />
        <KpiCard label="Average Case Age" value={`${metrics.averageCaseAge}d`} />
        <KpiCard label="Unassigned High-Risk" value={metrics.unassignedHighRisk} tone="danger" />
        <KpiCard label="Assignable Right Now" value={metrics.assignableRightNow} />
      </section>

      {workspaceId === "specialty" && draftState.plan.subtypeMetrics ? (
        <section className="subtype-strip">
          {draftState.plan.subtypeMetrics.casesByType.map((item) => (
            <div key={item.caseType} className="subtype-card">
              <div className="subtype-header">
                <CaseTypeBadge caseType={item.caseType} />
                <span>{item.openCount} open</span>
              </div>
              <div className="subtype-meta">Oldest {item.oldestAge}d</div>
              <div className="subtype-meta">Unassigned {item.unassignedCount}</div>
            </div>
          ))}
          <div className="subtype-card">
            <div className="subtype-header">
              <span className="capability-badge peds-only">Peds-only</span>
              <span>{draftState.plan.subtypeMetrics.capacityByNurseType.pedsOnly} capacity</span>
            </div>
            <div className="subtype-meta">Full-scope {draftState.plan.subtypeMetrics.capacityByNurseType.fullScope}</div>
          </div>
        </section>
      ) : null}

      <section className="alert-strip" aria-label="Assignment alerts">
        {draftState.plan.alerts.length ? draftState.plan.alerts.map((alert) => <div key={alert.id} className={`notice ${alert.severity === "danger" ? "error" : "warning"}`}><strong>{alert.title}</strong><div>{alert.message}</div></div>) : <div className="notice">No unresolved overflow or aging alerts.</div>}
      </section>
      <section className="workflow-grid">
        <div className="workflow-main">
          <div className="panel">
            <div className="panel-header split">
              <div>
                <div className="panel-label">Recommended Assignments</div>
                <h2>{locked ? "Published" : "Draft"} assignments by nurse</h2>
              </div>
              <div className="panel-controls">
                <input
                  className="table-input"
                  type="search"
                  value={assignmentSearch}
                  onChange={(event) => setAssignmentSearch(event.target.value)}
                  aria-label="Search assignments" placeholder="Search nurse, member, client, state"
                />
                <select aria-label="Sort assignment groups" className="table-select" value={assignmentSort} onChange={(event) => setAssignmentSort(event.target.value)}>
                  <option value="assigned">Assigned count</option>
                  <option value="nurse">Nurse A-Z</option>
                  <option value="capacity">Remaining capacity</option>
                </select>
              </div>
            </div>

            <div className="group-stack">
              {assignmentGroups.length ? assignmentGroups.map((group) => {
                const open = expandedGroups.has(group.nurse.nurseId);
                const remainingCapacity = Math.max(
                  0,
                  group.nurse.dailyCapacity - group.nurse.currentlyAssignedCount - group.assignedCases.length
                );

                return (
                  <section key={group.nurse.nurseId} className="assignment-group">
                    <button type="button" className="group-summary" aria-expanded={open} onClick={() => toggleGroup(group.nurse.nurseId)}>
                      <div>
                        <div className="group-title-row">
                          <h3>{group.nurse.nurseName}</h3>
                          {workspaceId === "specialty" ? (
                            <span className={`capability-badge ${group.nurse.capabilities.length === 1 ? "peds-only" : "full-scope"}`}>
                              {group.nurse.capabilities.length === 1 ? "Peds-only" : "Full-scope"}
                            </span>
                          ) : null}
                        </div>
                        <div className="group-meta">{group.nurse.team} / {group.nurse.manager}</div>
                        <div className="group-meta">States {group.nurse.licensedStates.join(", ")} | Clients {group.nurse.coveredClients.join(", ")}</div>
                      </div>
                      <div className="group-stats">
                        <span>{group.assignedCases.length} assigned</span>
                        <span>{remainingCapacity} open</span>
                      </div>
                    </button>

                    {open ? (
                      <DataTable
                        data={group.assignedCases}
                        columns={assignmentColumns}
                        getRowId={(row) => row.caseId}
                        emptyMessage="No drafted assignments in this nurse group."
                        className="assignment-table-scroll"
                        tableClassName="assignment-table"
                      />
                    ) : null}
                  </section>
                );
              }) : (
                <div className="empty-note empty-panel">No nurse groups match the current search.</div>
              )}
            </div>
          </div>
        </div>

        <aside className="workflow-side">
          <div className="panel sticky-panel">
            <div className="panel-header">
              <h2>Unassigned</h2>
            </div>
            <div className="overflow-kpis">
              <SummaryRow label="High-risk unassigned" value={overflowSummary.highRiskUnassigned} tone="danger" />
              <SummaryRow label="Oldest unassigned" value={`${overflowSummary.oldestUnassigned}d`} tone="warning" />
              <SummaryRow label="No eligible nurse" value={overflowSummary.noEligibleNurse} tone="danger" />
              <SummaryRow label="No available capacity" value={overflowSummary.noCapacity} tone="warning" />
            </div>
            <input
              className="table-input full-width"
              type="search"
              value={overflowSearch}
              onChange={(event) => setOverflowSearch(event.target.value)}
              aria-label="Search overflow" placeholder="Search overflow by member, client, state"
            />
            <DataTable
              data={overflowRows}
              columns={overflowColumns}
              getRowId={(row) => row.caseId}
              emptyMessage="No open overflow cases."
              maxHeight="compact"
            />
          </div>
        </aside>
      </section>

      <section className="support-grid">
        <div className="panel">
          <div className="panel-header">
            <div className="panel-label">Overrides & Recent Changes</div>
            <h2>Review activity</h2>
          </div>
          <div className="activity-columns">
            <div>
              <h3 className="subpanel-title">Override log</h3>
              <ul className="activity-list">
                {draftState.overrideLog.length ? draftState.overrideLog.map((item, index) => (
                  <li key={`${item.at}-${index}`}>{item.message}<span>{formatRunTime(item.at)}</span></li>
                )) : <li>No overrides yet.</li>}
              </ul>
            </div>
            <div>
              <h3 className="subpanel-title">Recent changes</h3>
              <ul className="activity-list">
                {draftState.recentChanges.map((item, index) => (
                  <li key={`${item.at}-${index}`}>{item.message}<span>{formatRunTime(item.at)}</span></li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2>Case-age Watchlist</h2>
          </div>
          <DataTable
            data={draftState.plan.agingWatchlist}
            columns={agingColumns}
            getRowId={(row) => row.caseId}
            emptyMessage="No cases on the age watchlist."
            maxHeight="compact"
          />
          <div className="exceptions-section">
            <div className="exceptions-header">
              <h3 className="subpanel-title">Assignment exceptions</h3>
              <p className="subpanel-copy">Cases still blocked after the current draft run and likely to need manager review.</p>
            </div>
            <DataTable
              data={draftState.plan.exceptions.slice(0, 5)}
              columns={exceptionColumns}
              getRowId={(row) => row.caseId}
              emptyMessage="No current assignment exceptions."
              maxHeight="compact"
            />
          </div>
        </div>
      </section>

      {selectedCase ? <CaseDetailDrawer caseModel={selectedCase} onClose={() => setSelectedCase(null)} /> : null}
      {override ? <OverrideDialog override={override} error={error} onClose={() => setOverride(null)} onSave={commitOverride} /> : null}
      {confirmation ? <Modal title={confirmation === "publish" ? "Publish reviewed assignments" : "Regenerate draft"} onClose={() => setConfirmation(null)}>
        <p>{confirmation === "publish" ? `Publish ${draftState.plan.assignmentGroups.reduce((total, group) => total + group.assignedCases.length, 0)} assignments? ${draftState.plan.overflow.length} cases remain unassigned, including ${metrics.unassignedHighRisk} high-risk cases. The saved snapshot will be locked.` : "This will replace the current draft and its manual overrides with a new assignment run."}</p>
        <button className="primary-action" onClick={confirmation === "publish" ? handlePublish : generate}>{confirmation === "publish" ? "Confirm publish" : "Regenerate draft"}</button>
      </Modal> : null}
    </section>
  );
}

function KpiCard({ label, value, tone = "default" }) {
  return (
    <div className={`kpi-card ${tone}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
    </div>
  );
}

function SummaryRow({ label, value, tone = "default" }) {
  return (
    <div className="summary-row">
      <span>{label}</span>
      <span className={`summary-value ${tone}`}>{value}</span>
    </div>
  );
}

function CaseTypeBadge({ caseType }) {
  return <span className={`case-badge ${String(caseType || "").toLowerCase()}`}>{caseType}</span>;
}

function CaseDetailDrawer({ caseModel, onClose }) {
  if (!caseModel) return null;

  return (
    <Modal title={`Case ${caseModel.memberId}`} onClose={onClose}>
      <section>
        <dl className="drawer-grid">
          <DrawerItem label="Client" value={caseModel.client} />
          <DrawerItem label="State" value={caseModel.state} />
          <DrawerItem label="Case type" value={caseModel.caseType} />
          <DrawerItem label="Risk score" value={caseModel.readmissionScore} />
          <DrawerItem label="LACE" value={caseModel.laceScore} />
          <DrawerItem label="Case age" value={`${caseModel.caseAgeDays}d`} />
          <DrawerItem label="Status" value={caseModel.assignmentStatus} />
        </dl>
        <div className="drawer-block">
          <div className="drawer-label">Reason text</div>
          <p>{caseModel.reasonText}</p>
        </div>
        <div className="drawer-block">
          <div className="drawer-label">Why this case was prioritized</div>
          <p>{caseModel.prioritySummary || "No priority reasons available."}</p>
        </div>
        <div className="drawer-block">
          <div className="drawer-label">Why this nurse is eligible</div>
          <p>{caseModel.nurseEligibilitySummary}</p>
        </div>
      </section>
    </Modal>
  );
}

function DrawerItem({ label, value }) {
  return (
    <div>
      <dt className="drawer-label">{label}</dt>
      <dd className="drawer-value">{value}</dd>
    </div>
  );
}

function createAssignmentColumns({ onOpenCase, onReassign, onRemove, disabled }) {
  return [
    {
      accessorKey: "memberId",
      header: "Member",
      cell: ({ row }) => (
        <button className="link-button" onClick={() => onOpenCase(row.original, row.original._nurse)}>
          {row.original.memberId}
        </button>
      )
    },
    {
      accessorKey: "client",
      header: "Client"
    },
    {
      accessorKey: "state",
      header: "State"
    },
    {
      accessorKey: "caseType",
      header: "Type",
      cell: ({ row }) => <CaseTypeBadge caseType={row.original.caseType} />
    },
    {
      accessorKey: "readmissionScore",
      header: "Readmit"
    },
    {
      accessorKey: "laceScore",
      header: "LACE"
    },
    {
      accessorKey: "caseAgeDays",
      header: "Age",
      cell: ({ row }) => `${row.original.caseAgeDays}d`
    },
    {
      id: "reasonTags",
      header: "Reason tags",
      accessorFn: (row) => row.priorityReasons.concat(row.eligibilityReasons).join(" "),
      cell: ({ row }) => (
        <div className="badge-row">
          {row.original.priorityReasons.map((reason) => <span key={reason} className="mini-badge">{reason}</span>)}
          {row.original.eligibilityReasons.slice(0, 2).map((reason) => <span key={reason} className="mini-badge neutral">{reason}</span>)}
        </div>
      )
    },
    {
      id: "explanation",
      header: "Explanation",
      accessorFn: (row) => `${row.assignmentConfidence} ${row.assignmentExplanation}`,
      cell: ({ row }) => (
        <div className="explanation-cell">
          <div className="confidence-row">{row.original.assignmentConfidence}</div>
          <div>{row.original.assignmentExplanation}</div>
        </div>
      )
    },
    {
      id: "actions",
      header: "Actions",
      enableSorting: false,
      cell: ({ row }) => (
        <div className="action-row">
          <button className="row-action" disabled={disabled} onClick={() => onReassign(row.original, row.original._nurse)}>Reassign</button>
          <button className="row-action" disabled={disabled} onClick={() => onRemove(row.original, row.original._nurse)}>Remove</button>
          <button className="row-action inspect" onClick={() => onOpenCase(row.original, row.original._nurse)}>Inspect</button>
        </div>
      )
    }
  ];
}

function createOverflowColumns({ onOpenCase, onAssign, disabled }) {
  return [
    { id: "assign", header: "Action", enableSorting: false, cell: ({ row }) => <button className="row-action" disabled={disabled} onClick={() => onAssign(row.original)}>Assign</button> },
    {
      accessorKey: "memberId",
      header: "Member",
      cell: ({ row }) => (
        <button className="link-button" onClick={() => onOpenCase(row.original, null, row.original.blockerReason)}>
          {row.original.memberId}
        </button>
      )
    },
    {
      accessorKey: "client",
      header: "Client"
    },
    {
      accessorKey: "state",
      header: "State"
    },
    {
      accessorKey: "readmissionScore",
      header: "Score"
    },
    {
      accessorKey: "caseAgeDays",
      header: "Age",
      cell: ({ row }) => `${row.original.caseAgeDays}d`
    },
    {
      accessorKey: "blockerReason",
      header: "Blocker",
      cell: ({ row }) => <span className={`status-badge ${row.original.blockerTone}`}>{row.original.blockerReason}</span>
    }
  ];
}

function createAgingColumns({ onOpenCase }) {
  return [
    {
      accessorKey: "memberId",
      header: "Member",
      cell: ({ row }) => (
        <button className="link-button" onClick={() => onOpenCase(row.original, null, row.original.reason)}>
          {row.original.memberId}
        </button>
      )
    },
    {
      accessorKey: "client",
      header: "Client"
    },
    {
      accessorKey: "caseType",
      header: "Type",
      cell: ({ row }) => <CaseTypeBadge caseType={row.original.caseType} />
    },
    {
      accessorKey: "caseAgeDays",
      header: "Age",
      cell: ({ row }) => `${row.original.caseAgeDays}d`
    },
    {
      accessorKey: "status",
      header: "Status"
    },
    {
      accessorKey: "reason",
      header: "Reason"
    }
  ];
}

function createExceptionColumns({ onOpenCase }) {
  return [
    {
      accessorKey: "memberId",
      header: "Member",
      cell: ({ row }) => (
        <button className="link-button" onClick={() => onOpenCase(row.original, null, row.original.blockerReason)}>
          {row.original.memberId}
        </button>
      )
    },
    {
      accessorKey: "client",
      header: "Client"
    },
    {
      accessorKey: "caseType",
      header: "Type",
      cell: ({ row }) => <CaseTypeBadge caseType={row.original.caseType} />
    },
    {
      accessorKey: "caseAgeDays",
      header: "Age",
      cell: ({ row }) => `${row.original.caseAgeDays}d`
    },
    {
      accessorKey: "readmissionScore",
      header: "Score"
    },
    {
      accessorKey: "blockerReason",
      header: "Blocker",
      cell: ({ row }) => <span className={`status-badge ${row.original.blockerTone}`}>{row.original.blockerReason}</span>
    }
  ];
}

function getDefaultExpandedGroups(groups) {
  return new Set(groups.slice(0, 2).map((group) => group.nurse.nurseId));
}

function filterAndSortAssignmentGroups(groups, search, sort) {
  const normalizedSearch = search.trim().toLowerCase();
  const filtered = !normalizedSearch
    ? groups
    : groups.filter((group) => {
        const haystack = [
          group.nurse.nurseName,
          group.nurse.team,
          group.nurse.manager,
          group.nurse.coveredClients.join(" "),
          group.assignedCases.map((item) => `${item.memberId} ${item.client} ${item.state}`).join(" ")
        ].join(" ").toLowerCase();
        return haystack.includes(normalizedSearch);
      });

  return filtered.slice().sort((left, right) => {
    if (sort === "nurse") return left.nurse.nurseName.localeCompare(right.nurse.nurseName);
    if (sort === "capacity") {
      const leftRemaining = left.nurse.dailyCapacity - left.nurse.currentlyAssignedCount - left.assignedCases.length;
      const rightRemaining = right.nurse.dailyCapacity - right.nurse.currentlyAssignedCount - right.assignedCases.length;
      return rightRemaining - leftRemaining;
    }
    return right.assignedCases.length - left.assignedCases.length;
  });
}

function filterOverflowRows(rows, search) {
  const normalizedSearch = search.trim().toLowerCase();
  if (!normalizedSearch) return rows;
  return rows.filter((item) => `${item.memberId} ${item.client} ${item.state} ${item.blockerReason}`.toLowerCase().includes(normalizedSearch));
}

function formatRunTime(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function OverrideDialog({ override, error, onClose, onSave }) {
  const [nurseId, setNurseId] = useState(override.options[0]?.nurseId || "");
  const [reason, setReason] = useState("");
  const removing = override.action === "remove";
  return <Modal title={`${removing ? "Remove" : "Assign"} ${override.caseItem.memberId}`} onClose={onClose}>
    <form className="override-form" onSubmit={(event) => { event.preventDefault(); onSave(removing ? null : nurseId, reason); }}>
      <p>{removing ? "Return this case to overflow for further review." : "Choose an eligible nurse. Current assignments and existing workload count toward capacity."}</p>
      {!removing ? <label>Eligible nurse
        <select className="table-select" value={nurseId} onChange={(event) => setNurseId(event.target.value)} required>
          {override.options.length ? override.options.map((nurse) => <option key={nurse.nurseId} value={nurse.nurseId}>{nurse.nurseName} · {nurse.team}</option>) : <option value="">No eligible nurse with capacity</option>}
        </select>
      </label> : null}
      {!removing && !override.options.length ? <p className="notice warning">No eligible nurse is available. Update the roster or free capacity, then generate a new draft.</p> : null}
      <label>Override reason<textarea required maxLength={500} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain the operational reason for this change" /></label>
      {error ? <p className="notice error" role="alert">{error}</p> : null}
      <button className="primary-action" disabled={!reason.trim() || (!removing && !nurseId)}>Save override</button>
    </form>
  </Modal>;
}
