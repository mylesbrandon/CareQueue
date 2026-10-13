"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { getWorkspaceDemoData, validateWorkspaceInputs } from "../lib/carequeue-data";

const STORAGE_KEY = "carequeue-demo-v1";
const DemoContext = createContext(null);

function createSession() {
  return {
    version: 1,
    workspaces: Object.fromEntries(["adult", "specialty"].map((id) => [id, {
      ...getWorkspaceDemoData(id), workflow: null, rosterChanged: false
    }])),
    history: []
  };
}

function readSession(raw) {
  const value = JSON.parse(raw);
  if (value?.version !== 1 || !Array.isArray(value.history)) throw new Error("Unsupported saved demo");
  for (const id of ["adult", "specialty"]) {
    const workspace = value.workspaces?.[id];
    if (!Array.isArray(workspace?.cases) || !Array.isArray(workspace?.nurses)) throw new Error("Incomplete saved demo");
    validateWorkspaceInputs({ workspaceId: id, cases: workspace.cases, nurses: workspace.nurses });
    if (workspace.workflow && (!workspace.workflow.plan || !Array.isArray(workspace.workflow.plan.assignmentGroups))) {
      throw new Error("Incomplete saved workflow");
    }
  }
  const workflows = [...Object.values(value.workspaces).map((workspace) => workspace.workflow).filter(Boolean), ...value.history.map((entry) => entry.workflow)];
  for (const workflow of workflows) {
    if (!["draft", "reviewed", "published"].includes(workflow?.stage) || !Array.isArray(workflow.overrideLog) || !Array.isArray(workflow.recentChanges) || !Array.isArray(workflow.committedAssignments) || !Array.isArray(workflow.plan?.assignments) || !Array.isArray(workflow.plan?.alerts) || !Array.isArray(workflow.plan?.manualHolds) || !Array.isArray(workflow.plan?.overflow) || !Array.isArray(workflow.plan?.agingWatchlist) || !workflow.plan?.metrics || !workflow.plan?.overflowSummary) throw new Error("Invalid saved workflow");
    for (const group of workflow.plan.assignmentGroups) {
      if (!group.nurse || !Array.isArray(group.assignedCases)) throw new Error("Invalid saved assignment group");
    }
  }
  return value;
}

export function DemoProvider({ children }) {
  const [session, setSession] = useState(null);
  const [storageMessage, setStorageMessage] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      setSession(saved ? readSession(saved) : createSession());
    } catch {
      setSession(createSession());
      setStorageMessage("Saved data could not be loaded. A fresh demo is available; changes may only last for this tab.");
    }
    const sync = (event) => {
      if (event.key !== STORAGE_KEY) return;
      try {
        setSession(event.newValue ? readSession(event.newValue) : createSession());
        setStorageMessage("Demo updated from another tab.");
      } catch {
        setStorageMessage("Another tab saved unreadable data. Your current session is still available.");
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  // Persist a complete transition so history and its published run stay together.
  function save(next) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setStorageMessage("");
    } catch {
      setStorageMessage("Browser storage is unavailable or full. Changes remain in this tab but will not survive a reload. Export assignments to keep a copy.");
    }
    setSession(next);
  }

  function saveWorkflow(workspaceId, workflow, publish = false) {
    const next = {
      ...session,
      workspaces: {
        ...session.workspaces,
        [workspaceId]: { ...session.workspaces[workspaceId], workflow, rosterChanged: false }
      },
      history: publish ? [{
        id: workflow.runId,
        workspaceId,
        workflow: structuredClone(workflow)
      }, ...session.history] : session.history
    };
    save(next);
  }

  function updateNurse(workspaceId, nurseId, field, value) {
    const workspace = session.workspaces[workspaceId];
    const nurses = workspace.nurses.map((nurse) => nurse.nurseId === nurseId ? { ...nurse, [field]: value } : nurse);
    try {
      validateWorkspaceInputs({ workspaceId, cases: workspace.cases, nurses });
    } catch (error) {
      setStorageMessage(`Roster change was not saved: ${error.message}`);
      return;
    }
    save({ ...session, workspaces: { ...session.workspaces, [workspaceId]: {
      ...workspace, rosterChanged: true, nurses
    } } });
  }

  if (!session) return <div className="empty-note" role="status">Loading synthetic workspace…</div>;

  return (
    <DemoContext.Provider value={{ session, saveWorkflow, updateNurse, resetDemo: () => save(createSession()) }}>
      <div className="demo-banner"><strong>Portfolio demo</strong><span>Synthetic cases · Saved in this browser · No clinical data connections</span></div>
      {storageMessage ? <div className="notice warning" role="status">{storageMessage}</div> : null}
      {children}
    </DemoContext.Provider>
  );
}

export function useDemo() {
  return useContext(DemoContext);
}
