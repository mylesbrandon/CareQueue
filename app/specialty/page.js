import { OpsWorkspace } from "../../components/ops-workspace";
import { getWorkspaceDemoData, WORKSPACES } from "../../lib/carequeue-data";

export default function SpecialtyOpsPage() {
  const { cases, nurses } = getWorkspaceDemoData(WORKSPACES.specialty.id);

  return <OpsWorkspace workspaceId={WORKSPACES.specialty.id} initialCases={cases} initialNurses={nurses} />;
}
