"use client";

import { useState } from "react";
import { WORKSPACES } from "../../lib/carequeue-data";
import { useDemo } from "../../components/demo-provider";
import { Modal } from "../../components/modal";

export default function SettingsPage() {
  const { resetDemo } = useDemo();
  const [confirmReset, setConfirmReset] = useState(false);
  const [reset, setReset] = useState(false);
  return <section className="page-shell">
    <header className="page-header"><div><div className="workspace-eyebrow">Settings</div><h1 className="workspace-title">Rules and demo data</h1></div></header>
    <p className="notice">These are the rules enforced by the assignment engine. Edit nurse eligibility on Teams & Nurses. Priority thresholds are defined in code for reproducible demonstrations.</p>
    <section className="history-summary-grid">
      {Object.values(WORKSPACES).map((workspace) => <div className="panel page-panel" key={workspace.id}>
        <h2>{workspace.label}</h2>
        <dl className="rule-list"><dt>High-risk threshold</dt><dd>{workspace.highRiskThreshold}</dd><dt>Elevated-risk threshold</dt><dd>{workspace.mediumRiskThreshold}</dd><dt>Aging alert</dt><dd>At least {workspace.ageThresholdDays} calendar days</dd><dt>Supported cases</dt><dd>{workspace.caseTypes.join(", ")}</dd></dl>
      </div>)}
    </section>
    <div className="panel page-panel"><h2>Assignment guardrails</h2>
      <ul className="rule-copy"><li>Only active nurses in the matching workspace, client panel, case capability, and state coverage are eligible.</li><li>Existing workload plus planned assignments cannot exceed daily capacity.</li><li>Manual changes require a reason and use the same eligibility rules.</li><li>Review is required before publishing. Every edit requires a fresh review.</li><li>Published snapshots are locked. Subsequent runs preserve published assignments and account for their capacity.</li></ul>
    </div>
    <div className="panel page-panel"><h2>Demo environment</h2><p>Cases and nurses are synthetic. Records, roster edits, and published runs are stored in this browser. There is no backend, authentication, live roster sync, or clinical system integration. State coverage and risk thresholds are illustrative application rules.</p>
      <p>Reset starts a fresh scenario and deletes this browser’s roster edits, overrides, and published history.</p>
      <button className="secondary-action" onClick={() => setConfirmReset(true)}>Reset demo data</button>
      {reset ? <p role="status">Demo data reset.</p> : null}
    </div>
    {confirmReset ? <Modal title="Reset this demo?" onClose={() => setConfirmReset(false)}><p>This deletes all CareQueue history and changes stored in this browser. Download any assignments you want to keep first.</p><button className="primary-action" onClick={() => { resetDemo(); setConfirmReset(false); setReset(true); }}>Confirm reset</button></Modal> : null}
  </section>;
}
