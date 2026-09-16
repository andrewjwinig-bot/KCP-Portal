import { NextResponse } from "next/server";
import { getGl, getTransactions, assembledTransactions } from "@/lib/financials/operating-statements/statementStore";
import { accountMatchesMask } from "@/lib/financials/operating-statements/mask";
import { buildTenantDirectory, canonicalUnitRef } from "@/lib/financials/operating-statements/tenants";
import { identifyTx } from "@/lib/financials/operating-statements/txUnits";
import { rentCheck, type RentCheckUnit } from "@/lib/financials/operating-statements/rentCheck";
import { getJSON } from "@/lib/storage";
import { allRuns } from "@/lib/statements/store";
import { summarize } from "@/lib/statements/summary";
import type { RentRollData } from "@/lib/rentroll/parseRentRollExcel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET — the rent-roll check behind a rental income line: contract rent per
// suite against the rental income actually posted, plus that suite's open A/R.
// Same GL window as the transactions drill-down (same key/mask/period/scope/
// sign), and the SAME unit resolution (`identifyTx`), so a suite shown as
// billed there is never shown as missing here.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  const property = url.searchParams.get("property");
  const year = Number(url.searchParams.get("year"));
  const mask = url.searchParams.get("mask");
  const period = Number(url.searchParams.get("period")) || 12;
  const scope = url.searchParams.get("scope") === "month" ? "month" : "ytd";
  const sign = url.searchParams.get("sign") === "-1" ? -1 : 1;
  const versionId = url.searchParams.get("version");

  if (!key || !year || !mask) {
    return NextResponse.json({ error: "key, year and mask are required" }, { status: 400 });
  }

  const rentroll = (await getJSON("rentroll", "current")) as RentRollData | null;
  if (!rentroll) {
    return NextResponse.json({ rows: [], totals: null, noRentRoll: true });
  }

  const byAccount = versionId
    ? await (async () => { const v = await getGl(versionId); return v ? getTransactions(v.id) : {}; })()
    : await assembledTransactions(key, year);
  const accounts = Object.keys(byAccount).filter((a) => accountMatchesMask(mask, a));
  const dir = await buildTenantDirectory();

  // Bill the window, suite by suite. A charge that resolves to no suite is
  // totalled separately — dropping it would make the billed column short and
  // read as a collection problem it isn't.
  const billedByUnit: Record<string, number> = {};
  let unplacedBilled = 0;
  for (const account of accounts) {
    for (const t of byAccount[account]) {
      if (scope === "month" ? t.month !== period : t.month > period) continue;
      const amount = t.amount * sign;
      const id = identifyTx(dir, account, t);
      // Only a suite the ACCOUNT or the charge text names is evidence; a
      // name-matched payer is a convenience and must not drive a variance.
      if (id.unit && id.via !== "payer") billedByUnit[canonicalUnitRef(id.unit)] = (billedByUnit[canonicalUnitRef(id.unit)] ?? 0) + amount;
      else unplacedBilled += amount;
    }
  }

  // Which properties this line covers: the ones its own charges landed in,
  // plus the statement's property when the rent roll carries it (so a suite
  // that was never billed at all still appears — the finding that matters).
  const codes = new Set<string>();
  for (const ref of Object.keys(billedByUnit)) codes.add(ref.split("-")[0]);
  if (property) {
    const p = property.toUpperCase();
    if (rentroll.properties.some((rp) => rp.propertyCode.toUpperCase() === p)) codes.add(p);
  }

  const units: RentCheckUnit[] = [];
  for (const p of rentroll.properties) {
    if (!codes.has(p.propertyCode.toUpperCase())) continue;
    for (const u of p.units) {
      // In-house amenity space (training room, conference centre) is occupied
      // for SF accounting but is not a rent-paying tenant.
      if (u.amenity) continue;
      units.push({
        unitRef: canonicalUnitRef(u.unitRef),
        tenant: u.isVacant ? null : (u.occupantName || "").trim() || null,
        isVacant: u.isVacant,
        sqft: u.sqft || null,
        baseRent: u.baseRent || 0,
        leaseFrom: u.leaseFrom,
        leaseTo: u.leaseTo,
      });
    }
  }

  // Open A/R from the newest statement import that covers any suite in scope.
  // Newest-first so a stale month can't mask a paid-down balance; null when no
  // import covers these suites, which the engine reports as "not loaded"
  // rather than as "nothing owed".
  let arByUnit: Record<string, { totalDue: number; pastDue: number }> | undefined;
  let arPeriod: string | null = null;
  let arAsOf: string | null = null;
  for (const run of await allRuns()) {
    const hits = run.statements.filter((s) => codes.has(canonicalUnitRef(s.unitRef).split("-")[0]));
    if (!hits.length) continue;
    arByUnit = {};
    for (const s of hits) {
      const sum = summarize(s, run.period);
      arByUnit[canonicalUnitRef(s.unitRef)] = { totalDue: sum.totalDue, pastDue: sum.pastDueAmount };
    }
    arPeriod = run.period;
    arAsOf = hits.map((s) => s.importedAt).filter(Boolean).sort().pop() ?? null;
    break;
  }

  const result = rentCheck({ year, period, scope, units, billedByUnit, arByUnit, unplacedBilled });
  return NextResponse.json({ ...result, arPeriod, arAsOf, properties: [...codes].sort() });
}
