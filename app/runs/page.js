"use client";

import { useState } from "react";
import { DataTable } from "../../components/data-table";
import { useDemo } from "../../components/demo-provider";
import { Modal } from "../../components/modal";
import { summarizeRun } from "../../lib/run-history";

export default function AssignmentRunsPage() {
  const { session } = useDemo();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const rows = session.history.map(summarizeRun);
  const filtered = rows.filter((row) => `${row.workspace} ${row.timestamp} ${row.beforeAfter}`.toLowerCase().includes(search.toLowerCase().trim()));
  const columns = [
    { accessorKey: "timestamp", header: "Published", cell: ({ row }) => <button className="link-button" onClick={() => setSelected(row.original.entry)}>{new Date(row.original.timestamp).toLocaleString()}</button> },
    { accessorKey: "workspace", header: "Workspace" },
    { accessorKey: "publishedAssignments", header: "Assignments" },
    { accessorKey: "highRiskCoverage", header: "High-risk coverage", cell: ({ row }) => row.original.highRiskCoverage === null ? "No high-risk cases" : `${row.original.highRiskCoverage}%` },
    { accessorKey: "overflowCount", header: "Overflow" },
    { accessorKey: "overrideCount", header: "Overrides" },
    { accessorKey: "beforeAfter", header: "Before / after" }
  ];
  return <section className="page-shell">
    <header className="page-header"><div><div className="workspace-eyebrow">Assignment Runs</div><h1 className="workspace-title">Published runs and audit history</h1></div>
      <input className="table-input" type="search" aria-label="Search run history" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search workspace or date" />
    </header>
    <section className="history-summary-grid">
      {[ ["Published runs", rows.length], ["Published assignments", rows.reduce((sum, row) => sum + row.publishedAssignments, 0)], ["Recorded overrides", rows.reduce((sum, row) => sum + row.overrideCount, 0)] ].map(([label, value]) => <div className="kpi-card" key={label}><div className="kpi-label">{label}</div><div className="kpi-value">{value}</div></div>)}
    </section>
    <div className="panel page-panel"><h2>Saved snapshots</h2><p>Each record captures the assignments, remaining overflow, and override reasons at publication. Select a timestamp to inspect its audit trail.</p>
      <DataTable data={filtered} columns={columns} getRowId={(row) => row.id} emptyMessage={rows.length ? "No runs match your search." : "No published runs yet. Review and publish an Adult or Specialty draft to create the first snapshot."} />
    </div>
    {selected ? <Modal title="Published run audit" onClose={() => setSelected(null)}><div className="run-detail">
      <p>{summarizeRun(selected).workspace} · {new Date(selected.workflow.publishedAt).toLocaleString()}</p>
      <p>{summarizeRun(selected).publishedAssignments} published assignments · {selected.workflow.plan.overflow.length} unassigned</p>
      <h3>Manual overrides</h3><ul className="activity-list">{selected.workflow.overrideLog.length ? selected.workflow.overrideLog.map((item, index) => <li key={index}>{item.message}<span>{item.reason} · {new Date(item.at).toLocaleString()}</span></li>) : <li>No overrides in this run.</li>}</ul>
      <h3>Assignments</h3><ul className="activity-list">{selected.workflow.plan.assignmentGroups.map((group) => <li key={group.nurse.nurseId}>{group.nurse.nurseName}<span>{group.assignedCases.map((item) => item.memberId).join(", ")}</span></li>)}</ul>
    </div></Modal> : null}
  </section>;
}
