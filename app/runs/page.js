"use client";

import { useMemo, useState } from "react";
import { DataTable } from "../../components/data-table";
import { getDemoRunHistory } from "../../lib/carequeue-data";

export default function AssignmentRunsPage() {
  const [search, setSearch] = useState("");
  const rows = getDemoRunHistory();
  const normalizedSearch = search.trim().toLowerCase();
  const filteredRows = useMemo(() => {
    if (!normalizedSearch) return rows;
    return rows.filter((row) => {
      return `${row.workspace} ${row.beforeAfter} ${row.timestamp}`.toLowerCase().includes(normalizedSearch);
    });
  }, [rows, normalizedSearch]);

  const columns = [
    {
      accessorKey: "timestamp",
      header: "Run time",
      cell: ({ row }) => formatTimestamp(row.original.timestamp)
    },
    {
      accessorKey: "workspace",
      header: "Workspace"
    },
    {
      accessorKey: "draftAssignments",
      header: "Draft"
    },
    {
      accessorKey: "publishedAssignments",
      header: "Published"
    },
    {
      accessorKey: "highRiskCoverage",
      header: "High-risk coverage"
    },
    {
      accessorKey: "overflowCount",
      header: "Overflow"
    },
    {
      accessorKey: "overrideCount",
      header: "Overrides"
    },
    {
      accessorKey: "beforeAfter",
      header: "Before / after"
    }
  ];

  const averageCoverage = Math.round(
    rows.reduce((sum, row) => sum + Number.parseInt(row.highRiskCoverage, 10), 0) / rows.length
  );
  const totalPublished = rows.reduce((sum, row) => sum + row.publishedAssignments, 0);
  const totalOverrides = rows.reduce((sum, row) => sum + row.overrideCount, 0);
  const latestRun = rows[0];

  return (
    <section className="page-shell">
      <header className="page-header">
        <div>
          <div className="workspace-eyebrow">Assignment Runs</div>
          <h1 className="workspace-title">Drafts, publishes, and overrides</h1>
        </div>
        <div className="panel-controls">
          <input
            className="table-input"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search workspace or run summary"
          />
        </div>
      </header>

      <section className="history-summary-grid">
        <SummaryCard label="Run count" value={rows.length} />
        <SummaryCard label="Average coverage" value={`${averageCoverage}%`} />
        <SummaryCard label="Published assignments" value={totalPublished} />
        <SummaryCard label="Overrides" value={totalOverrides} />
      </section>

      <div className="panel page-panel">
        <div className="panel-header">
          <div className="panel-label">Latest run</div>
          <h2>{latestRun.workspace} at {formatTimestamp(latestRun.timestamp)}</h2>
        </div>
        <div className="run-summary-copy">
          <span>{latestRun.draftAssignments} drafted</span>
          <span>{latestRun.publishedAssignments} published</span>
          <span>{latestRun.overflowCount} overflow</span>
          <span>{latestRun.overrideCount} overrides</span>
        </div>
      </div>

      <div className="panel page-panel">
        <div className="panel-header">
          <div className="panel-label">Run history</div>
          <h2>Recent assignment runs</h2>
        </div>
        <DataTable
          data={filteredRows}
          columns={columns}
          getRowId={(row) => row.id}
          emptyMessage="No assignment runs match the current search."
        />
      </div>
    </section>
  );
}

function SummaryCard({ label, value }) {
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
    </div>
  );
}

function formatTimestamp(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}
