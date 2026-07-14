"use client";

import { useMemo, useState } from "react";
import { DataTable } from "../../components/data-table";
import { getWorkspaceDemoData, WORKSPACES } from "../../lib/carequeue-data";

const adultDemo = getWorkspaceDemoData(WORKSPACES.adult.id).nurses;
const specialtyDemo = getWorkspaceDemoData(WORKSPACES.specialty.id).nurses;

export default function TeamsPage() {
  const [adultNurses, setAdultNurses] = useState(adultDemo);
  const [specialtyNurses, setSpecialtyNurses] = useState(specialtyDemo);
  const [search, setSearch] = useState("");

  const normalizedSearch = search.trim().toLowerCase();
  const adultRows = useMemo(() => filterNurses(adultNurses, normalizedSearch), [adultNurses, normalizedSearch]);
  const specialtyRows = useMemo(() => filterNurses(specialtyNurses, normalizedSearch), [specialtyNurses, normalizedSearch]);

  const updateNurse = (workspaceId, nurseId, field, value) => {
    const setter = workspaceId === "adult" ? setAdultNurses : setSpecialtyNurses;
    setter((current) => current.map((nurse) => nurse.nurseId === nurseId ? { ...nurse, [field]: value } : nurse));
  };

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
            placeholder="Search nurse, manager, client, state"
          />
          <button className="ghost-action">Sync roster</button>
        </div>
      </header>

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
        <input
          className="table-input"
          value={row.original.coveredClients.join("; ")}
          onChange={(event) => onUpdate(
            workspaceId,
            row.original.nurseId,
            "coveredClients",
            event.target.value.split(";").map((item) => item.trim()).filter(Boolean)
          )}
        />
      )
    },
    {
      accessorFn: (row) => row.licensedStates.join("; "),
      id: "licensedStates",
      header: "States licensed",
      cell: ({ row }) => (
        <input
          className="table-input"
          value={row.original.licensedStates.join("; ")}
          onChange={(event) => onUpdate(
            workspaceId,
            row.original.nurseId,
            "licensedStates",
            event.target.value.split(";").map((item) => item.trim()).filter(Boolean)
          )}
        />
      )
    },
    {
      accessorFn: (row) => row.capabilities.join("; "),
      id: "capabilities",
      header: "Capability",
      cell: ({ row }) => (
        <input
          className="table-input"
          value={row.original.capabilities.join("; ")}
          onChange={(event) => onUpdate(
            workspaceId,
            row.original.nurseId,
            "capabilities",
            event.target.value.split(";").map((item) => item.trim()).filter(Boolean)
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
          type="number"
          value={row.original.dailyCapacity}
          onChange={(event) => onUpdate(workspaceId, row.original.nurseId, "dailyCapacity", Number(event.target.value) || 0)}
        />
      )
    },
    {
      accessorKey: "active",
      header: "Active",
      cell: ({ row }) => (
        <button
          className={`status-toggle ${row.original.active ? "active" : ""}`}
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
