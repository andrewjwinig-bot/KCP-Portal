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
import { nnnTrend, typicalAdminFee, type NnnYear, type Pools } from "./nnnQuote";

export type QuoteSuite = { unitRef: string; suite: string; sqft: number; vacant: boolean; tenant: string };
export type QuoteProperty = { code: string; name: string };

export type NnnQuoteData = {
  code: string; name: string; budgetYear: number;
  /** Gross centre (9000): tenants pay no NNN — nothing to quote. */
  gross: boolean;
  gla: number;
  pools: Pools | null;
  adminPct: number;
  suites: QuoteSuite[];
  trend: NnnYear[];
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

export async function loadNnnQuote(code: string, budgetYear: number): Promise<NnnQuoteData> {
  const key = `${code}-${budgetYear}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 15 * 60_000) return hit.data;

  const gross = isAllGross(code);
  const [roll, draft] = await Promise.all([
    resolveCurrentRentroll().catch(() => null),
    gross ? Promise.resolve(null) : buildBudgetDraft(code, budgetYear, 3).catch(() => null),
  ]);

  const prop = (roll?.properties ?? []).find((p) => p.propertyCode.toUpperCase() === code.toUpperCase());
  const suites: QuoteSuite[] = (prop?.units ?? [])
    .filter((u) => !u.amenity && (u.sqft ?? 0) > 0)
    .map((u) => ({ unitRef: u.unitRef, suite: u.unitRef.slice(code.length + 1) || u.unitRef, sqft: u.sqft ?? 0, vacant: !!u.isVacant, tenant: u.isVacant ? "Vacant" : u.occupantName }));

  // The budget's own GLA and pools — the draft's "NNN / SF" tile.
  const pools = draft?.reimbursementEstimate?.pools ?? null;
  const gla = (draft?.tenantRevenue ?? []).filter((t) => !t.recoveryOnly).reduce((a, t) => a + (t.sqft || 0), 0)
    || (prop?.totalSqft ?? 0);

  // Past years' actual pools: each reconciled year (live — the recon's FINAL),
  // and the frozen years before it.
  const years: { year: number; kind: "actual" | "budget"; pools: Partial<Pools> }[] = [];
  const fixture = RETAIL_RECON_FIXTURES[code];
  for (const y of Object.keys(fixture?.byYear ?? {}).map(Number)) {
    const r = await loadRetailRecon(code, y).catch(() => null);
    if (r) years.push({ year: y, kind: "actual", pools: { cam: r.pool.camLines.reduce((s, l) => s + l.amount, 0), ins: r.pool.insAmount, ret: r.pool.retAmount } });
  }
  const hist = RETAIL_EXPENSE_HISTORY[code];
  if (hist) {
    const ys = new Set<string>([...Object.values(hist.lines).flatMap((m) => Object.keys(m)), ...Object.keys(hist.ins), ...Object.keys(hist.ret)]);
    for (const y of ys) {
      if (years.some((x) => x.year === Number(y))) continue;
      const cam = Object.values(hist.lines).reduce((s, m) => s + (m[y] ?? 0), 0);
      years.push({ year: Number(y), kind: "actual", pools: { cam, ins: hist.ins[y], ret: hist.ret[y] } });
    }
  }
  if (pools) years.push({ year: budgetYear, kind: "budget", pools });

  const adminPct = typicalAdminFee(
    Object.entries(RETAIL_CONFIG_SEED).filter(([ref]) => ref.toUpperCase().startsWith(`${code.toUpperCase()}-`)).map(([, e]) => e.adminFeePct),
  );

  const data: NnnQuoteData = { code, name: nameOf(code), budgetYear, gross, gla, pools, adminPct, suites, trend: nnnTrend(years, gla) };
  if (pools || gross) cache.set(key, { at: Date.now(), data });
  return data;
}
