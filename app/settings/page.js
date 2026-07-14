"use client";

import { useMemo, useState } from "react";

const DEFAULT_SETTINGS = {
  adultHighRisk: 75,
  adultMediumRisk: 55,
  adultAgeThreshold: 2,
  specialtyHighRisk: 75,
  specialtyMediumRisk: 55,
  specialtyAgeThreshold: 2,
  specialtyPriorityMode: "peds-first",
  specialtyFallbackMode: "full-scope-first",
  publishMode: "manual",
  requireReviewBeforePublish: true,
  lockAssignmentsAfterPublish: true,
  requireOverrideReason: true,
  caseFeedSource: "Daily adult discharge file",
  specialtyFeedSource: "Daily specialty discharge file",
  nurseRosterSource: "Teams roster export",
  exportDestination: "Shared operations drive",
  refreshCadence: "Every 15 minutes"
};

const INITIAL_LAST_SAVED = "2026-04-16T08:06:00-05:00";

export default function SettingsPage() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [savedSettings, setSavedSettings] = useState(DEFAULT_SETTINGS);
  const [lastSavedAt, setLastSavedAt] = useState(INITIAL_LAST_SAVED);

  const isDirty = JSON.stringify(settings) !== JSON.stringify(savedSettings);

  const summaryCards = useMemo(() => ([
    {
      label: "Adult high-risk threshold",
      value: settings.adultHighRisk,
      detail: `Medium risk starts at ${settings.adultMediumRisk}`
    },
    {
      label: "Specialty aging threshold",
      value: `${settings.specialtyAgeThreshold}d`,
      detail: settings.specialtyPriorityMode === "peds-first" ? "Peds prioritized first" : "Subtype priority balanced"
    },
    {
      label: "Publish mode",
      value: settings.publishMode === "manual" ? "Manual review" : "Locked draft",
      detail: settings.requireReviewBeforePublish ? "Review required before publish" : "Direct publish allowed"
    },
    {
      label: "Refresh cadence",
      value: settings.refreshCadence,
      detail: `Last saved ${formatTimestamp(lastSavedAt)}`
    }
  ]), [lastSavedAt, settings]);

  const statusRows = useMemo(() => ([
    {
      label: "Adult case feed",
      detail: settings.caseFeedSource,
      tone: "green",
      value: "Connected"
    },
    {
      label: "Specialty case feed",
      detail: settings.specialtyFeedSource,
      tone: "green",
      value: "Connected"
    },
    {
      label: "Nurse roster sync",
      detail: settings.nurseRosterSource,
      tone: "blue",
      value: "Synced 6:10 AM"
    },
    {
      label: "Override audit",
      detail: settings.requireOverrideReason ? "Reason required on manual changes" : "No reason required",
      tone: settings.requireOverrideReason ? "orange" : "gray",
      value: settings.requireOverrideReason ? "Enabled" : "Relaxed"
    }
  ]), [settings]);

  const handleSave = () => {
    setSavedSettings(settings);
    setLastSavedAt(new Date().toISOString());
  };

  const handleReset = () => {
    setSettings(savedSettings);
  };

  return (
    <section className="page-shell">
      <header className="page-header">
        <div>
          <div className="workspace-eyebrow">Settings</div>
          <h1 className="workspace-title">System controls</h1>
          <div className="workspace-meta">
            <span>{isDirty ? "Unsaved changes" : "All settings saved"}</span>
            <span>Last saved {formatTimestamp(lastSavedAt)}</span>
          </div>
        </div>
        <div className="panel-controls">
          <button className="ghost-action" onClick={handleReset} disabled={!isDirty}>Reset changes</button>
          <button className="primary-action" onClick={handleSave} disabled={!isDirty}>Save settings</button>
        </div>
      </header>

      <section className="history-summary-grid">
        {summaryCards.map((card) => (
          <div key={card.label} className="kpi-card settings-summary-card">
            <div className="kpi-label">{card.label}</div>
            <div className="kpi-value settings-summary-value">{card.value}</div>
            <div className="settings-card-detail">{card.detail}</div>
          </div>
        ))}
      </section>

      <section className="settings-layout">
        <div className="settings-stack">
          <div className="panel page-panel">
            <div className="panel-header">
              <div className="panel-label">Assignment thresholds</div>
              <h2>Adult and specialty priority rules</h2>
            </div>
            <div className="settings-section">
              <div className="settings-section-title">Adult workflow</div>
              <div className="settings-field-grid">
                <SettingField
                  label="High-risk threshold"
                  help="Cases at or above this score are treated as high priority."
                  input={<input className="table-input" type="number" value={settings.adultHighRisk} onChange={(event) => updateNumberSetting(setSettings, "adultHighRisk", event.target.value)} />}
                />
                <SettingField
                  label="Medium-risk threshold"
                  help="Used for the secondary priority band."
                  input={<input className="table-input" type="number" value={settings.adultMediumRisk} onChange={(event) => updateNumberSetting(setSettings, "adultMediumRisk", event.target.value)} />}
                />
                <SettingField
                  label="Aging threshold (days)"
                  help="Cases at or above this age are treated as aging risk."
                  input={<input className="table-input" type="number" value={settings.adultAgeThreshold} onChange={(event) => updateNumberSetting(setSettings, "adultAgeThreshold", event.target.value)} />}
                />
              </div>
            </div>

            <div className="settings-divider" />

            <div className="settings-section">
              <div className="settings-section-title">Ped / Newborn / NICU workflow</div>
              <div className="settings-field-grid">
                <SettingField
                  label="High-risk threshold"
                  help="Applied inside the specialty assignment engine."
                  input={<input className="table-input" type="number" value={settings.specialtyHighRisk} onChange={(event) => updateNumberSetting(setSettings, "specialtyHighRisk", event.target.value)} />}
                />
                <SettingField
                  label="Medium-risk threshold"
                  help="Used when specialty cases are below high-risk but still elevated."
                  input={<input className="table-input" type="number" value={settings.specialtyMediumRisk} onChange={(event) => updateNumberSetting(setSettings, "specialtyMediumRisk", event.target.value)} />}
                />
                <SettingField
                  label="Aging threshold (days)"
                  help="Older specialty cases get aging priority at this point."
                  input={<input className="table-input" type="number" value={settings.specialtyAgeThreshold} onChange={(event) => updateNumberSetting(setSettings, "specialtyAgeThreshold", event.target.value)} />}
                />
              </div>
            </div>
          </div>

          <div className="panel page-panel">
            <div className="panel-header">
              <div className="panel-label">Specialty routing</div>
              <h2>Subtype handling and nurse capability rules</h2>
            </div>
            <div className="settings-field-grid two-up">
              <SettingField
                label="Subtype priority mode"
                help="Controls how peds, newborn, and NICU are ordered when risk bands are similar."
                input={(
                  <select className="table-select" value={settings.specialtyPriorityMode} onChange={(event) => updateSetting(setSettings, "specialtyPriorityMode", event.target.value)}>
                    <option value="peds-first">Peds first</option>
                    <option value="balanced">Balanced by risk and age</option>
                  </select>
                )}
              />
              <SettingField
                label="Fallback nurse selection"
                help="Controls which eligible specialty nurse type is preferred first."
                input={(
                  <select className="table-select" value={settings.specialtyFallbackMode} onChange={(event) => updateSetting(setSettings, "specialtyFallbackMode", event.target.value)}>
                    <option value="full-scope-first">Prefer full-scope first</option>
                    <option value="capacity-first">Prefer highest remaining capacity</option>
                  </select>
                )}
              />
            </div>
          </div>

          <div className="panel page-panel">
            <div className="panel-header">
              <div className="panel-label">Publishing and audit</div>
              <h2>Review guardrails</h2>
            </div>
            <div className="settings-toggle-stack">
              <ToggleRow
                label="Publish mode"
                detail="Keep morning assignments in draft until someone reviews and publishes."
                control={(
                  <select className="table-select settings-inline-select" value={settings.publishMode} onChange={(event) => updateSetting(setSettings, "publishMode", event.target.value)}>
                    <option value="manual">Manual publish</option>
                    <option value="locked-draft">Locked draft only</option>
                  </select>
                )}
              />
              <ToggleRow
                label="Require review before publish"
                detail="Prevents direct publishing from the first draft generation pass."
                control={<input type="checkbox" checked={settings.requireReviewBeforePublish} onChange={() => toggleSetting(setSettings, "requireReviewBeforePublish")} />}
              />
              <ToggleRow
                label="Lock assignments after publish"
                detail="Prevents further edits without reopening the run."
                control={<input type="checkbox" checked={settings.lockAssignmentsAfterPublish} onChange={() => toggleSetting(setSettings, "lockAssignmentsAfterPublish")} />}
              />
              <ToggleRow
                label="Require override reason"
                detail="Prompts for justification any time a user removes or reassigns a case."
                control={<input type="checkbox" checked={settings.requireOverrideReason} onChange={() => toggleSetting(setSettings, "requireOverrideReason")} />}
              />
            </div>
          </div>

          <div className="panel page-panel">
            <div className="panel-header">
              <div className="panel-label">Data connections</div>
              <h2>Morning input and export paths</h2>
            </div>
            <div className="settings-field-grid">
              <SettingField
                label="Adult case feed source"
                help="Displayed to operators when feeds are reviewed or refreshed."
                input={<input className="table-input" value={settings.caseFeedSource} onChange={(event) => updateSetting(setSettings, "caseFeedSource", event.target.value)} />}
              />
              <SettingField
                label="Specialty case feed source"
                help="Separate source for peds, newborn, and NICU workflow."
                input={<input className="table-input" value={settings.specialtyFeedSource} onChange={(event) => updateSetting(setSettings, "specialtyFeedSource", event.target.value)} />}
              />
              <SettingField
                label="Nurse roster source"
                help="Used by the Teams & Nurses page."
                input={<input className="table-input" value={settings.nurseRosterSource} onChange={(event) => updateSetting(setSettings, "nurseRosterSource", event.target.value)} />}
              />
              <SettingField
                label="Export destination"
                help="Where published assignments are sent after the run is finalized."
                input={<input className="table-input" value={settings.exportDestination} onChange={(event) => updateSetting(setSettings, "exportDestination", event.target.value)} />}
              />
              <SettingField
                label="Refresh cadence"
                help="Shown in sync status and refresh controls."
                input={(
                  <select className="table-select" value={settings.refreshCadence} onChange={(event) => updateSetting(setSettings, "refreshCadence", event.target.value)}>
                    <option value="Every 15 minutes">Every 15 minutes</option>
                    <option value="Every 30 minutes">Every 30 minutes</option>
                    <option value="Hourly">Hourly</option>
                    <option value="Manual refresh only">Manual refresh only</option>
                  </select>
                )}
              />
            </div>
          </div>
        </div>

        <aside className="settings-side">
          <div className="panel page-panel sticky-panel">
            <div className="panel-header">
              <div className="panel-label">Environment status</div>
              <h2>Connection and control state</h2>
            </div>
            <div className="settings-status-list">
              {statusRows.map((row) => (
                <div key={row.label} className="settings-status-row">
                  <div>
                    <div className="settings-status-title">{row.label}</div>
                    <div className="settings-status-detail">{row.detail}</div>
                  </div>
                  <span className={`settings-status-pill ${row.tone}`}>{row.value}</span>
                </div>
              ))}
            </div>

            <div className="settings-divider" />

            <div className="settings-side-section">
              <div className="settings-side-title">Current guardrails</div>
              <div className="settings-compact-list">
                <div className="summary-row">
                  <span>Adult aging trigger</span>
                  <span className="summary-value">{settings.adultAgeThreshold}d</span>
                </div>
                <div className="summary-row">
                  <span>Specialty subtype priority</span>
                  <span className="summary-value">{settings.specialtyPriorityMode === "peds-first" ? "Peds first" : "Balanced"}</span>
                </div>
                <div className="summary-row">
                  <span>Override audit</span>
                  <span className={`summary-value ${settings.requireOverrideReason ? "warning" : ""}`}>{settings.requireOverrideReason ? "Required" : "Optional"}</span>
                </div>
                <div className="summary-row">
                  <span>Assignment lock</span>
                  <span className={`summary-value ${settings.lockAssignmentsAfterPublish ? "danger" : ""}`}>{settings.lockAssignmentsAfterPublish ? "Enabled" : "Disabled"}</span>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </section>
    </section>
  );
}

function SettingField({ label, help, input }) {
  return (
    <label className="settings-field">
      <span className="settings-field-label">{label}</span>
      {input}
      <span className="settings-field-help">{help}</span>
    </label>
  );
}

function ToggleRow({ label, detail, control }) {
  return (
    <div className="settings-toggle-row">
      <div>
        <div className="settings-toggle-label">{label}</div>
        <div className="settings-toggle-detail">{detail}</div>
      </div>
      <div className="settings-toggle-control">{control}</div>
    </div>
  );
}

function updateSetting(setter, key, value) {
  setter((current) => ({ ...current, [key]: value }));
}

function updateNumberSetting(setter, key, value) {
  setter((current) => ({ ...current, [key]: Number(value) || 0 }));
}

function toggleSetting(setter, key) {
  setter((current) => ({ ...current, [key]: !current[key] }));
}

function formatTimestamp(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}
