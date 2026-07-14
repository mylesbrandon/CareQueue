import { OpsWorkspace } from "../components/ops-workspace";
import { getWorkspaceDemoData, WORKSPACES } from "../lib/carequeue-data";

export default function AdultOpsPage() {
  const { cases, nurses } = getWorkspaceDemoData(WORKSPACES.adult.id);

  return <OpsWorkspace workspaceId={WORKSPACES.adult.id} initialCases={cases} initialNurses={nurses} />;
}
