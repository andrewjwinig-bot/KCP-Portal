// The tenant CAM/RET statement now lives inside the portal shell, which carries
// the tenant-facing sidebar (CAM/RET, Floorplan, Lease Terms, Statements,
// Service Requests, Reservations). Redirect any legacy /statement/[token] link
// into the portal — the CAM/RET statement is the portal's default view — so
// links shared before the portal launch keep working. The statement body itself
// still lives in ./StatementView (rendered by the portal's CAM tab and reused by
// the /api/statement/[token]/pdf export).

import { redirect } from "next/navigation";

export default function TenantStatementRedirect({ params }: { params: { token: string } }) {
  redirect(`/portal/${params.token}`);
}
