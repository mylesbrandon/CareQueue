"use client";

import { useEffect, useMemo, useState } from "react";
import { DataTable } from "../../components/data-table";
import { useDemo } from "../../components/demo-provider";

export default function TeamsPage() {
  const { session, updateNurse } = useDemo();
  const adultNurses = session.workspaces.adult.nurses;
  const specialtyNurses = session.workspaces.specialty.nurses;
  const [search, setSearch] = useState("");

  const normalizedSearch = search.trim().toLowerCase();
  const adultRows = useMemo(() => filterNurses(adultNurses, normalizedSearch), [adultNurses, normalizedSearch]);
  const specialtyRows = useMemo(() => filterNurses(specialtyNurses, normalizedSearch), [specialtyNurses, normalizedSearch]);

  const adultColumns = createTeamColumns("adult", updateNurse);
  const specialtyColumns = createTeamColumns("specialty", updateNurse);

  return (
    <section className="page-shell">
      <header className="page-header">
        <div>
          <div className="workspace-eyebrow">Teams & Nurses</div>
          <h1 className="workspace-title">Eligibility configuration</h1>
        </div>
        <div className="panel-controls">
          <input
            className="table-input"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search nurses" placeholder="Search nurse, manager, client, state"
          />

        </div>
      </header>

      <p className="notice">Roster changes save in this browser. Generate a new draft to apply changes; existing published snapshots stay locked. Separate multiple values with semicolons.</p>
      <div className="panel page-panel">
        <div className="panel-header">
          <div className="panel-label">Adult roster</div>
          <h2>Adult teams</h2>
        </div>
        <DataTable
          data={adultRows}
          columns={adultColumns}
          getRowId={(row) => row.nurseId}
          emptyMessage="No adult nurses match the current search."
        />
      </div>

      <div className="panel page-panel">
        <div className="panel-header">
          <div className="panel-label">Ped / Newborn / NICU roster</div>
          <h2>Specialty teams</h2>
        </div>
        <DataTable
          data={specialtyRows}
          columns={specialtyColumns}
          getRowId={(row) => row.nurseId}
          emptyMessage="No specialty nurses match the current search."
        />
      </div>
    </section>
  );
}

function createTeamColumns(workspaceId, onUpdate) {
  return [
    {
      accessorKey: "nurseName",
      header: "Nurse"
    },
    {
      id: "managerTeam",
      header: "Manager / Team",
      accessorFn: (row) => `${row.manager} ${row.team}`,
      cell: ({ row }) => `${row.original.manager} / ${row.original.team}`
    },
    {
      accessorFn: (row) => row.coveredClients.join("; "),
      id: "coveredClients",
      header: "Clients covered",
      cell: ({ row }) => (
        <RosterInput
          label={`Clients for ${row.original.nurseName}`}
          value={row.original.coveredClients.join("; ")}
          onCommit={(value) => onUpdate(
            workspaceId,
            row.original.nurseId,
            "coveredClients",
            value.split(";").map((item) => item.trim()).filter(Boolean)
          )}
        />
      )
    },
    {
      accessorFn: (row) => row.licensedStates.join("; "),
      id: "licensedStates",
      header: "States licensed",
      cell: ({ row }) => (
        <RosterInput
          label={`Licenses for ${row.original.nurseName}`}
          value={row.original.licensedStates.join("; ")}
          onCommit={(value) => onUpdate(
            workspaceId,
            row.original.nurseId,
            "licensedStates",
            value.split(";").map((item) => item.trim().toUpperCase()).filter(Boolean)
          )}
        />
      )
    },
    {
      accessorFn: (row) => row.capabilities.join("; "),
      id: "capabilities",
      header: "Capability",
      cell: ({ row }) => (
        <RosterInput
          label={`Capabilities for ${row.original.nurseName}`}
          value={row.original.capabilities.join("; ")}
          onCommit={(value) => onUpdate(
            workspaceId,
            row.original.nurseId,
            "capabilities",
            value.split(";").map((item) => item.trim()).filter(Boolean)
          )}
        />
      )
    },
    {
      accessorKey: "dailyCapacity",
      header: "Today's capacity",
      cell: ({ row }) => (
        <input
          className="table-input compact-input"
          type="number" min="0" step="1" max="1000"
          aria-label={`Capacity for ${row.original.nurseName}`}
          value={row.original.dailyCapacity}
          onChange={(event) => onUpdate(workspaceId, row.original.nurseId, "dailyCapacity", Math.min(1000, Math.max(0, Math.trunc(Number(event.target.value) || 0))))}
        />
      )
    },
    {
      accessorKey: "active",
      header: "Active",
      cell: ({ row }) => (
        <button
          className={`status-toggle ${row.original.active ? "active" : ""}`}
          aria-label={`Active status for ${row.original.nurseName}`} aria-pressed={row.original.active}
          onClick={() => onUpdate(workspaceId, row.original.nurseId, "active", !row.original.active)}
        >
          {row.original.active ? "Active" : "Inactive"}
        </button>
      )
    }
  ];
}

function filterNurses(nurses, search) {
  if (!search) return nurses;
  return nurses.filter((nurse) => {
    return `${nurse.nurseName} ${nurse.manager} ${nurse.team} ${nurse.coveredClients.join(" ")} ${nurse.licensedStates.join(" ")} ${nurse.capabilities.join(" ")}`
      .toLowerCase()
      .includes(search);
  });
}

function RosterInput({ label, value, onCommit }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return <input className="table-input" aria-label={label} value={text}
    onChange={(event) => setText(event.target.value)}
    onBlur={() => { if (text !== value) onCommit(text); }}
    onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />;
}
