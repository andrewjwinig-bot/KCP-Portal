import "server-only";
// The data behind the NNN Quote page (`nnnQuote.ts` is the math): each
// centre's vacant suites (rent roll), the budget year's recoverable pools and
// GLA (the budget draft — the SAME figures as its "NNN / SF" tile), the past
// years' actual pools (the CAM reconciliations and their expense history), and
// the admin fee the centre's leases typically carry.

import { buildBudgetDraft } from "@/lib/financials/budgets/draft";
import { resolveCurrentRentroll } from "@/lib/rentroll/current";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import { SHOPPING_CENTER_CODES } from "@/lib/properties/portfolioGroups";
import { isAllGross } from "@/lib/financials/budgets/grossProperties";
import { RETAIL_RECON_FIXTURES } from "@/lib/cam/retail/registry";
import { loadRetailRecon } from "@/lib/cam/retail/loadResult";
import { RETAIL_EXPENSE_HISTORY } from "@/lib/cam/retail/expenseHistory";
import { RETAIL_CONFIG_SEED } from "@/lib/cam/retailConfigSeed";
import { getOrEmptyCamConfig } from "@/lib/cam/configStorage";
import { nnnTrend, typicalAdminFee, type NnnYear, type Pools } from "./nnnQuote";

export type Pot = "retail" | "office";
export type QuoteSuite = {
  unitRef: string; suite: string; sqft: number; vacant: boolean; tenant: string;
  /** Which recovery pot the suite pays into — "office" only at a mixed centre (7010). */
  pot: Pot;
  /** A current tenant's base rent today, $/SF/yr (the rent roll) — the quote's starting rent. */
  baseRentPsf: number | null;
  /** A current tenant's own CAM admin fee % (the unit page's CAM config). */
  adminPct: number | null;
};
export type QuoteProperty = { code: string; name: string };
export type PotQuote = { gla: number; pools: Pools | null; adminPct: number; trend: NnnYear[] };

export type NnnQuoteData = {
  code: string; name: string; budgetYear: number;
  /** Street, city, state zip — for the quote PDF. */
  address: string;
  /** Gross centre (9000): tenants pay no NNN — nothing to quote. */
  gross: boolean;
  /** Retail is the whole centre unless it is mixed; office only at 7010. */
  pots: { retail: PotQuote; office?: PotQuote };
  suites: QuoteSuite[];
};

const nameOf = (code: string) => PROPERTY_DEFS.find((p) => p.id === code)?.name ?? code;

export function quoteProperties(scope?: Set<string> | null): QuoteProperty[] {
  return [...SHOPPING_CENTER_CODES]
    .filter((c) => PROPERTY_DEFS.some((p) => p.id === c) && (!scope || scope.has(c)))
    .map((code) => ({ code, name: nameOf(code) }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

// A property's draft is several seconds of work; quote after quote reads the
// same one, so it is kept 15 minutes per server instance.
const cache = new Map<string, { at: number; data: NnnQuoteData }>();

type YearPools = { year: number; kind: NnnYear["kind"]; pools: Partial<Pools> };

/** Reconciled years (live — the recon's FINAL) and the frozen years before them. */
async function actualYears(reconCode: string, historyCode: string | null): Promise<YearPools[]> {
  const years: YearPools[] = [];
  for (const y of Object.keys(RETAIL_RECON_FIXTURES[reconCode]?.byYear ?? {}).map(Number)) {
    const r = await loadRetailRecon(reconCode, y).catch(() => null);
    if (r) years.push({ year: y, kind: "actual", pools: { cam: r.pool.camLines.reduce((s, l) => s + l.amount, 0), ins: r.pool.insAmount, ret: r.pool.retAmount } });
  }
  const hist = historyCode ? RETAIL_EXPENSE_HISTORY[historyCode] : undefined;
  if (hist) {
    const ys = new Set<string>([...Object.values(hist.lines).flatMap((m) => Object.keys(m)), ...Object.keys(hist.ins), ...Object.keys(hist.ret)]);
    for (const y of ys) {
      if (years.some((x) => x.year === Number(y))) continue;
      const cam = Object.values(hist.lines).reduce((s, m) => s + (m[y] ?? 0), 0);
      years.push({ year: Number(y), kind: "actual", pools: { cam, ins: hist.ins[y], ret: hist.ret[y] } });
    }
  }
  return years;
}

/** A mixed centre's office suites by number (the vacant ones have no recon row). */
const OFFICE_SUITES: Record<string, RegExp> = { "7010": /^2\d\d[A-Z]?$/ };

const canon = (ref: string) => ref.trim().toUpperCase().replace(/-CU$/, "");

export async function loadNnnQuote(code: string, budgetYear: number): Promise<NnnQuoteData> {
  const key = `${code}-${budgetYear}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 15 * 60_000) return hit.data;

  const gross = isAllGross(code);
  const [roll, draft] = await Promise.all([
    resolveCurrentRentroll().catch(() => null),
    gross ? Promise.resolve(null) : buildBudgetDraft(code, budgetYear, 3).catch(() => null),
  ]);

  // A MIXED centre (7010): its office suites are the tenants of the office
  // reconciliation and recover from the office pot (the budget's split).
  const officeCode = RETAIL_RECON_FIXTURES[code]?.mixedOfficeCode;
  let officeUnits = new Set<string>();
  if (officeCode && RETAIL_RECON_FIXTURES[officeCode]) {
    const ys = Object.keys(RETAIL_RECON_FIXTURES[officeCode].byYear ?? {}).map(Number);
    const y = ys.length ? Math.max(...ys) : null;
    const r = y != null ? await loadRetailRecon(officeCode, y).catch(() => null) : null;
    officeUnits = new Set((r?.result.tenants ?? []).map((t) => canon(t.unitRef)));
  }
  // A vacant office suite has no recon row, so the floor decides too:
  // Parkwood's second-floor office suites are 201–218.
  const officeFloor = OFFICE_SUITES[code];
  const potOf = (ref: string): Pot => {
    if (!officeCode) return "retail";
    const suite = canon(ref).slice(code.length + 1);
    return officeUnits.has(canon(ref)) || (!!officeFloor && officeFloor.test(suite)) ? "office" : "retail";
  };

  const prop = (roll?.properties ?? []).find((p) => p.propertyCode.toUpperCase() === code.toUpperCase());
  const units = (prop?.units ?? []).filter((u) => !u.amenity && (u.sqft ?? 0) > 0);
  // A current tenant's own admin fee — the unit page's CAM config (saved,
  // else the workbook seed).
  const configs = await Promise.all(units.map((u) => (u.isVacant ? Promise.resolve(null) : getOrEmptyCamConfig(u.unitRef).catch(() => null))));
  const suites: QuoteSuite[] = units.map((u, i) => {
    const rentPsf = !u.isVacant && u.sqft > 0 ? (u.annualRentPerSqft || (u.annualRent || u.baseRent * 12) / u.sqft) : 0;
    const fee = configs[i]?.cam?.adminFeePct;
    return {
      unitRef: u.unitRef, suite: u.unitRef.slice(code.length + 1) || u.unitRef, sqft: u.sqft ?? 0, vacant: !!u.isVacant,
      tenant: u.isVacant ? "Vacant" : u.occupantName, pot: potOf(u.unitRef),
      baseRentPsf: rentPsf > 0 ? Math.round(rentPsf * 100) / 100 : null,
      adminPct: u.isVacant ? null : (fee ?? 0),
    };
  });

  // The budget's own GLA and pools — the draft's "NNN / SF" tile — split by
  // pot at a mixed centre.
  const est = draft?.reimbursementEstimate;
  const glaOf = (pot: Pot | null) => (draft?.tenantRevenue ?? [])
    .filter((t) => !t.recoveryOnly && (pot == null || potOf(t.unitRef) === pot))
    .reduce((a, t) => a + (t.sqft || 0), 0);
  const basisYear = draft?.basisYear ?? budgetYear - 1;
  const typical = (pot: Pot | null) => typicalAdminFee(
    Object.entries(RETAIL_CONFIG_SEED)
      .filter(([ref]) => ref.toUpperCase().startsWith(`${code.toUpperCase()}-`) && (pot == null || potOf(ref) === pot))
      .map(([, e]) => e.adminFeePct),
  );
  const potQuote = async (pools: Pools | null, basis: Pools | undefined, gla: number, reconCode: string, historyCode: string | null, admin: number): Promise<PotQuote> => {
    const years = await actualYears(reconCode, historyCode);
    // This year on its reprojection — actual to date + budget for the rest —
    // unless a reconciliation already closed it.
    if (basis && !years.some((y) => y.year === basisYear)) years.push({ year: basisYear, kind: "reprojection", pools: basis });
    if (pools) years.push({ year: budgetYear, kind: "budget", pools });
    return { gla, pools, adminPct: admin, trend: nnnTrend(years, gla) };
  };

  let pots: NnnQuoteData["pots"];
  if (officeCode && est?.poolParts) {
    const fix = (c: string) => RETAIL_RECON_FIXTURES[c]?.gla ?? 0;
    pots = {
      retail: await potQuote(est.poolParts.retail.pools, est.poolParts.retail.basis, glaOf("retail") || fix(code), code, null, typical("retail")),
      office: await potQuote(est.poolParts.office.pools, est.poolParts.office.basis, glaOf("office") || fix(officeCode), officeCode, null, typical("office")),
    };
  } else {
    pots = { retail: await potQuote(est?.pools ?? null, est?.basisPools, glaOf(null) || (prop?.totalSqft ?? 0), code, code, typical(null)) };
  }

  const def = PROPERTY_DEFS.find((p) => p.id === code);
  const address = def ? [def.address, [def.city, [def.state, def.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ")].filter(Boolean).join(", ") : "";
  const data: NnnQuoteData = { code, name: nameOf(code), address, budgetYear, gross, pots, suites };
  if (pots.retail.pools || gross) cache.set(key, { at: Date.now(), data });
  return data;
}
