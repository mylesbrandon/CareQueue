"use client";

import { useDeferredValue, useMemo, useState, useTransition } from "react";
import { DataTable } from "./data-table";
import {
  WORKSPACES,
  buildCaseDrawerModel,
  generateDraftPlan,
  getEligibleNurseOptions
} from "../lib/carequeue-data";

export function OpsWorkspace({ workspaceId, initialCases, initialNurses }) {
  const workspace = WORKSPACES[workspaceId];
  const initialDraftState = useMemo(
    () => createDraftState(workspaceId, initialCases, initialNurses),
    [workspaceId, initialCases, initialNurses]
  );
  const [cases, setCases] = useState(initialCases);
  const [nurses, setNurses] = useState(initialNurses);
  const [isPending, startTransition] = useTransition();
  const [assignmentSearch, setAssignmentSearch] = useState("");
  const [assignmentSort, setAssignmentSort] = useState("assigned");
  const [overflowSearch, setOverflowSearch] = useState("");
  const [selectedCase, setSelectedCase] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState(() => getDefaultExpandedGroups(initialDraftState.plan.assignmentGroups));
  const [draftState, setDraftState] = useState(initialDraftState);

  const deferredAssignmentSearch = useDeferredValue(assignmentSearch);
  const deferredOverflowSearch = useDeferredValue(overflowSearch);
  const assignmentGroups = useMemo(() => {
    return filterAndSortAssignmentGroups(draftState.plan.assignmentGroups, deferredAssignmentSearch, assignmentSort);
  }, [draftState.plan.assignmentGroups, deferredAssignmentSearch, assignmentSort]);
  const overflowRows = useMemo(() => {
    return filterOverflowRows(draftState.plan.overflow, deferredOverflowSearch);
  }, [draftState.plan.overflow, deferredOverflowSearch]);

  const toggleGroup = (nurseId) => {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(nurseId)) next.delete(nurseId);
      else next.add(nurseId);
      return next;
    });
  };

  const openCase = (caseItem, nurse, overflowReason) => {
    setSelectedCase(buildCaseDrawerModel({ workspaceId, caseItem, nurse, overflowReason }));
  };

  const regenerateDraft = (nextCases = cases, nextNurses = nurses, reason = "Draft regenerated from current morning data.") => {
    const timestamp = new Date().toISOString();
    const nextDraft = createDraftState(workspaceId, nextCases, nextNurses, timestamp);

    setDraftState((current) => ({
      ...nextDraft,
      stage: "draft",
      recentChanges: [{ message: reason, at: timestamp }].concat(current.recentChanges).slice(0, 8),
      overrideLog: []
    }));
    setExpandedGroups(getDefaultExpandedGroups(nextDraft.plan.assignmentGroups));
  };

  const handleGenerate = () => {
    startTransition(() => {
      regenerateDraft(cases, nurses, "Generated a new draft assignment run.");
    });
  };

  const handleRefresh = () => {
    startTransition(() => {
      const freshCases = initialCases.map((item) => ({ ...item }));
      const freshNurses = initialNurses.map((item) => ({ ...item }));
      setCases(freshCases);
      setNurses(freshNurses);
      regenerateDraft(freshCases, freshNurses, "Refreshed data and rebuilt the draft.");
    });
  };

  const handleReview = () => {
    const timestamp = new Date().toISOString();
    setDraftState((current) => ({
      ...current,
      stage: "review",
      recentChanges: [{ message: "Moved draft into review.", at: timestamp }].concat(current.recentChanges).slice(0, 8)
    }));
  };

  const handlePublish = () => {
    const timestamp = new Date().toISOString();
    setDraftState((current) => ({
      ...current,
      stage: "published",
      publishedAt: timestamp,
      recentChanges: [{ message: "Published assignments for the day.", at: timestamp }].concat(current.recentChanges).slice(0, 8)
    }));
  };

  const handleExport = () => {
    const rows = [["nurseName", "memberId", "client", "state", "caseType", "readmissionScore", "laceScore", "caseAge", "confidence"]];

    draftState.plan.assignmentGroups.forEach((group) => {
      group.assignedCases.forEach((caseItem) => {
        rows.push([
          group.nurse.nurseName,
          caseItem.memberId,
          caseItem.client,
          caseItem.state,
          caseItem.caseType,
          caseItem.readmissionScore,
          caseItem.laceScore,
          caseItem.caseAgeDays,
          caseItem.assignmentConfidence
        ]);
      });
    });

    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${workspaceId}-assignments.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleRemove = (caseItem, nurse) => {
    const timestamp = new Date().toISOString();
    setDraftState((current) => {
      const nextPlan = removeCaseFromPlan(current.plan, caseItem.caseId);
      return {
        ...current,
        plan: nextPlan,
        stage: "review",
        recentChanges: [{ message: `Removed ${caseItem.memberId} from ${nurse.nurseName}.`, at: timestamp }].concat(current.recentChanges).slice(0, 8),
        overrideLog: [{ message: `Removed ${caseItem.memberId} from ${nurse.nurseName}`, at: timestamp }].concat(current.overrideLog).slice(0, 12)
      };
    });
  };

  const handleReassign = (caseItem, nurse) => {
    const options = getEligibleNurseOptions({
      workspaceId,
      caseItem,
      nurses,
      assignments: flattenAssignments(draftState.plan.assignmentGroups),
      excludeNurseId: nurse.nurseId
    });

    if (!options.length) {
      return;
    }

    const nextNurse = options[0];
    const timestamp = new Date().toISOString();

    setDraftState((current) => {
      const nextPlan = reassignCaseInPlan(current.plan, caseItem, nurse, nextNurse, workspace);
      return {
        ...current,
        plan: nextPlan,
        stage: "review",
        recentChanges: [{ message: `Reassigned ${caseItem.memberId} to ${nextNurse.nurseName}.`, at: timestamp }].concat(current.recentChanges).slice(0, 8),
        overrideLog: [{ message: `Reassigned ${caseItem.memberId} from ${nurse.nurseName} to ${nextNurse.nurseName}`, at: timestamp }].concat(current.overrideLog).slice(0, 12)
      };
    });
    setExpandedGroups((current) => {
      const next = new Set(current);
      next.add(nextNurse.nurseId);
      return next;
    });
  };

  const assignmentColumns = createAssignmentColumns({
    onOpenCase: openCase,
    onReassign: handleReassign,
    onRemove: handleRemove
  });
  const overflowColumns = createOverflowColumns({ onOpenCase: openCase });
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
          <button className="primary-action" onClick={handleGenerate} disabled={isPending}>Generate assignments</button>
          <button className="secondary-action" onClick={handleReview}>Review draft</button>
          <button className="secondary-action" onClick={handlePublish}>Publish assignments</button>
          <button className="ghost-action" onClick={handleExport}>Export</button>
          <button className="ghost-action" onClick={handleRefresh}>Refresh data</button>
        </div>
      </header>

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

      <section className="workflow-grid">
        <div className="workflow-main">
          <div className="panel">
            <div className="panel-header split">
              <div>
                <div className="panel-label">Recommended Assignments</div>
                <h2>Draft assignments by nurse</h2>
              </div>
              <div className="panel-controls">
                <input
                  className="table-input"
                  type="search"
                  value={assignmentSearch}
                  onChange={(event) => setAssignmentSearch(event.target.value)}
                  placeholder="Search nurse, member, client, state"
                />
                <select className="table-select" value={assignmentSort} onChange={(event) => setAssignmentSort(event.target.value)}>
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
                    <button type="button" className="group-summary" onClick={() => toggleGroup(group.nurse.nurseId)}>
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
              placeholder="Search overflow by member, client, state"
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

      <CaseDetailDrawer caseModel={selectedCase} onClose={() => setSelectedCase(null)} />
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
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="case-drawer" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <div className="panel-label">Case Detail</div>
            <h2>{caseModel.memberId}</h2>
          </div>
          <button className="ghost-action" onClick={onClose}>Close</button>
        </div>
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
      </aside>
    </div>
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

function createAssignmentColumns({ onOpenCase, onReassign, onRemove }) {
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
          <button className="row-action" onClick={() => onReassign(row.original, row.original._nurse)}>Reassign</button>
          <button className="row-action" onClick={() => onRemove(row.original, row.original._nurse)}>Remove</button>
          <button className="row-action inspect" onClick={() => onOpenCase(row.original, row.original._nurse)}>Inspect</button>
        </div>
      )
    }
  ];
}

function createOverflowColumns({ onOpenCase }) {
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

function createDraftState(workspaceId, cases, nurses, timestamp = new Date().toISOString()) {
  const plan = generateDraftPlan({ workspaceId, cases, nurses, lastRunAt: timestamp });
  const assignmentGroups = plan.assignmentGroups.map((group) => ({
    ...group,
    assignedCases: group.assignedCases.map((caseItem) => ({
      ...caseItem,
      _nurse: group.nurse
    }))
  }));

  return {
    stage: "draft",
    publishedAt: null,
    plan: {
      ...plan,
      assignmentGroups
    },
    recentChanges: [{ message: "Loaded current draft assignments.", at: timestamp }],
    overrideLog: []
  };
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

function flattenAssignments(groups) {
  return groups.flatMap((group) => group.assignedCases.map((caseItem) => ({
    caseId: caseItem.caseId,
    nurseId: group.nurse.nurseId
  })));
}

function removeCaseFromPlan(plan, caseId) {
  const nextGroups = [];
  let removedCase = null;

  plan.assignmentGroups.forEach((group) => {
    const remainingCases = group.assignedCases.filter((item) => {
      if (item.caseId === caseId) {
        removedCase = item;
        return false;
      }
      return true;
    });

    if (remainingCases.length) {
      nextGroups.push({ ...group, assignedCases: remainingCases });
    }
  });

  if (!removedCase) return plan;

  const nextOverflow = [{ ...removedCase, blockerReason: "Removed during review", blockerTone: "warning" }]
    .concat(plan.overflow.filter((item) => item.caseId !== caseId));

  return rebuildPlanFromOverrides(plan, nextGroups, nextOverflow);
}

function reassignCaseInPlan(plan, caseItem, currentNurse, nextNurse, workspace) {
  const removed = removeCaseFromPlan(plan, caseItem.caseId);
  const nurseGroupExists = removed.assignmentGroups.some((group) => group.nurse.nurseId === nextNurse.nurseId);
  const reassignedCase = {
    ...caseItem,
    _nurse: nextNurse,
    assignmentConfidence: "Manual override",
    assignmentExplanation: `Assigned because ${caseItem.priorityReasons.concat(["Eligible by client", "Eligible by state license", "Capacity available"]).join(", ").toLowerCase()}.`
  };

  const nextGroups = removed.assignmentGroups.map((group) => {
    if (group.nurse.nurseId !== nextNurse.nurseId) return group;
    return {
      ...group,
      assignedCases: group.assignedCases.concat(reassignedCase).sort((left, right) => right.readmissionScore - left.readmissionScore)
    };
  });

  if (!nurseGroupExists) {
    nextGroups.push({
      nurse: nextNurse,
      assignedCases: [reassignedCase]
    });
  }

  return rebuildPlanFromOverrides(removed, nextGroups, removed.overflow.filter((item) => item.caseId !== caseItem.caseId), workspace);
}

function rebuildPlanFromOverrides(plan, assignmentGroups, overflowRows) {
  const highRiskUnassigned = overflowRows.filter((item) => item.readmissionScore >= 75).length;
  const oldestUnassigned = overflowRows.length ? Math.max(...overflowRows.map((item) => item.caseAgeDays)) : 0;

  return {
    ...plan,
    assignmentGroups: assignmentGroups.sort((left, right) => right.assignedCases.length - left.assignedCases.length),
    overflow: overflowRows,
    overflowSummary: {
      ...plan.overflowSummary,
      highRiskUnassigned,
      oldestUnassigned,
      noEligibleNurse: overflowRows.filter((item) => item.blockerReason.includes("eligible") || item.blockerReason.includes("team")).length,
      noCapacity: overflowRows.filter((item) => item.blockerReason.includes("capacity")).length
    },
    metrics: {
      ...plan.metrics,
      unassignedHighRisk: highRiskUnassigned
    },
    exceptions: overflowRows.slice(0, 12),
    agingWatchlist: plan.agingWatchlist.map((item) => {
      const matchingOverflow = overflowRows.find((overflow) => overflow.caseId === item.caseId);
      if (matchingOverflow) {
        return { ...item, status: "Open", reason: matchingOverflow.blockerReason || item.reason };
      }
      if (assignmentGroups.some((group) => group.assignedCases.some((assignedCase) => assignedCase.caseId === item.caseId))) {
        return { ...item, status: "Draft assigned" };
      }
      return item;
    })
  };
}

function formatRunTime(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}
