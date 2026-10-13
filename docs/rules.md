# Assignment and workflow rules

These are the implemented demonstration rules. They describe software behavior, not clinical policy or legal verification of a nurse's license.

## Eligibility

A case can be routed only when it belongs to the current workspace and is open. Already assigned cases are excluded from new recommendations.

A candidate nurse must satisfy every condition:

| Gate | Requirement |
| --- | --- |
| Workspace | Nurse and case belong to the same workspace. |
| Active status | The nurse is active. |
| Client coverage | The case client is in the nurse's covered-client list. |
| Capability | The nurse supports the exact case type: Adult, Peds, Newborn, or NICU. |
| State | The case state is explicitly listed or covered by the demo's `NLC` expansion. |
| Capacity | `dailyCapacity − currentlyAssignedCount − assignmentsInThisRun > 0`. |

The `NLC` token expands to a fixed illustrative jurisdiction list in source. It does not check expiration, disciplinary restrictions, residency, compact privileges, or an external license registry. A Peds-only nurse cannot receive Newborn or NICU cases merely because they share the specialty workspace.

## Priority

Both workspaces use a high-risk threshold of **75**, an elevated-risk threshold of **55**, and an aging threshold of **2 days**. Cases are considered in this order:

1. High-risk cases at least 2 days old.
2. Other high-risk cases.
3. Elevated-risk cases at least 2 days old.
4. Other cases at least 4 days old.
5. Remaining open cases.

Within a band, specialty cases prioritize Peds over Newborn/NICU. Subsequent tie-breaks use higher readmission score, greater age, higher LACE score, earlier creation date, and case ID. This subtype preference is a demo policy, not a recommendation that pediatric cases should clinically outrank newborn or NICU cases.

The selected nurse has the greatest remaining capacity, then the lower existing assigned count, then a stable name/ID tie-break. The selection is repeatable for the same inputs and reference date.

Case age is the UTC calendar-day difference between the creation date and supplied run timestamp, clamped to zero for a future date. Tests supply a fixed timestamp so the aging boundary does not drift with the machine's clock or time zone. Invalid dates, duplicate IDs, and malformed capacity values are rejected before routing.

## Manual overrides

An override either reassigns an open case to a selected eligible nurse or removes its recommendation and returns it to overflow. A nonempty reason is required. Reassignment uses the same eligibility gates as automatic generation and counts the complete current plan when checking capacity.

An override records the case, previous and new nurse where applicable, reason, and timestamp. It updates the plan's metrics and alerts and returns the run to draft so the change receives a new review. Published runs reject overrides.

## Review and publish

| Action | Result |
| --- | --- |
| Generate | Build a draft from the current cases and roster. |
| Review | Validate the plan and mark it reviewed. |
| Change a reviewed plan | Invalidate review; require a new review before publication. |
| Publish a reviewed plan | Revalidate, capture a snapshot, and lock the run. |
| Publish a draft or edit a published run | Reject the action. |

Review and publication must preserve unique assignment per case, workspace isolation, eligible nurse selection, and nurse capacity. Each candidate case belongs to either the recommendation list or overflow. A later run respects already published commitments.

## Aging and overflow

Overflow explains why a candidate cannot currently be placed. Reasons distinguish missing client coverage, missing case-type capability, state mismatch, exhausted capacity, and a manual removal.

The aging watchlist contains open cases at or above the aging threshold, including drafted cases, with high-risk cases ordered first. Alerts distinguish unresolved overflow, unresolved high-risk cases, and unresolved cases at least 2 days old. Alerts are visible inside the application; there is no background scheduler, email, SMS, or push delivery.

Dashboard values are computed from the current plan. Run history and trend summaries describe locally published snapshots; they do not establish an improvement in patient outcomes or clinical performance.
