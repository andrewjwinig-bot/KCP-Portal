import { NextResponse } from "next/server";
import { getGl, getTransactions, assembledTransactions } from "@/lib/financials/operating-statements/statementStore";
import { accountMatchesMask } from "@/lib/financials/operating-statements/mask";
import { buildTenantDirectory, canonicalUnitRef } from "@/lib/financials/operating-statements/tenants";
import { identifyTx } from "@/lib/financials/operating-statements/txUnits";
import { rentCheck, basisForLine, type RentCheckUnit, type RentCheckBasis } from "@/lib/financials/operating-statements/rentCheck";
import { getJSON } from "@/lib/storage";
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
  // WHICH rent-roll column to expect. Sent by the caller, but resolved here
  // from the line's own label + mask when it isn't, so the answer cannot
  // differ between the page and the API.
  const label = url.searchParams.get("label") ?? "";
  const sent = url.searchParams.get("basis");
  const basis: RentCheckBasis =
    (sent === "cam" || sent === "ret" || sent === "other" || sent === "base")
      ? sent
      : (basisForLine(label, mask ?? "") ?? "base");

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
        opexMonth: u.opexMonth || 0,
        reTaxMonth: u.reTaxMonth || 0,
        otherMonth: u.otherMonth || 0,
        leaseFrom: u.leaseFrom,
        leaseTo: u.leaseTo,
      });
    }
  }

  // Open A/R is deliberately NOT read here. It is a tenant's whole account
  // balance, every charge type and unaged, so beside one line's figures it can
  // only mislead. Collections lives on Monthly Statements, which ages it and
  // splits it by charge. Dropping it also drops a scan of every statement
  // import from every open of this modal.
  const result = rentCheck({ year, period, scope, units, billedByUnit, unplacedBilled, basis });
  return NextResponse.json({ ...result, basis, properties: [...codes].sort() });
}
