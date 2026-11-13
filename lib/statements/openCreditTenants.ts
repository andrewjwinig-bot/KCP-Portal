// Every tenant carrying a credit, read the way Receipt Reconciliation reads an
// account: the Credit Balance report where it covers the property, else the
// newest laser statement. ONE read for the Open Credits page and for Bank
// Balances' tenant-credit reserve, so the two cannot disagree.

import "server-only";
import { currentAging } from "./agingStore";
import { allRuns } from "./store";
import { laserDate } from "./currentAccount";
import { laserCreditTenants, type OpenCreditTenant } from "./aging";

export async function openCreditTenants(): Promise<{ tenants: OpenCreditTenant[]; coverage: Record<string, string>; laserPeriod: string | null; laserAsOf: string | null }> {
  const [aging, runs] = await Promise.all([currentAging(), allRuns().catch(() => [])]);
  const run = runs[0] ?? null;
  const laser = run ? laserCreditTenants(run.statements, aging.coverage, (st) => laserDate(st, run.updatedAt)) : [];
  const laserAsOf = laser.map((t) => t.asOf).sort().pop() ?? null;
  return { tenants: [...aging.tenants, ...laser], coverage: aging.coverage, laserPeriod: laser.length ? run!.period : null, laserAsOf };
}
