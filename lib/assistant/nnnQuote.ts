// The assistant's NNN quote (owner, 11/2026: "make sure users can ask the AI
// these questions too like what are the estimated NNNs for x suite at x
// property"). The SAME data and math as the NNN Quote page — `loadNnnQuote`
// for the centre, `quoteNnn` for the suite — so an answer in chat and the page
// never disagree. Pure: the loaded centre and the question in, the quote out.

import { quoteNnn, type NnnYear } from "@/lib/leasing/nnnQuote";
import type { NnnQuoteData, QuoteSuite } from "@/lib/leasing/nnnQuoteLoad";

export type NnnAskInput = { suite?: string; base_rent_psf?: number; admin_pct?: number; sqft?: number };

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** A suite by its number ("104", "9510-104", "Suite 104") or its tenant's name. */
export function findSuite(suites: QuoteSuite[], code: string, q: string): QuoteSuite | null {
  const raw = q.trim();
  if (!raw) return null;
  const n = norm(raw.replace(/^suite\s*/i, ""));
  return suites.find((s) => norm(s.suite) === n || norm(s.unitRef) === n)
    ?? suites.find((s) => !s.vacant && norm(s.tenant).includes(n) && n.length >= 3)
    ?? null;
}

export function answerNnnQuote(d: NnnQuoteData, input: NnnAskInput) {
  if (d.gross) return { property: `${d.code} · ${d.name}`, gross: true, note: `${d.name} is leased gross: tenants pay no CAM, insurance or tax estimates, so there is nothing to quote beyond base rent.` };
  const vacancies = d.suites.filter((s) => s.vacant).map((s) => ({ suite: s.suite, sqft: s.sqft, pot: d.pots.office ? s.pot : undefined }));
  const suite = input.suite ? findSuite(d.suites, d.code, input.suite) : null;
  if (input.suite && !suite) return { error: `No suite "${input.suite}" at ${d.code} · ${d.name}.`, vacancies };
  const pot = suite?.pot === "office" && d.pots.office ? d.pots.office : d.pots.retail;
  if (!pot.pools) return { error: `The ${d.budgetYear} budget draft for ${d.name} could not be built, so there are no pools to quote from.` };

  const trend = (t: NnnYear[]) => t.filter((y) => !y.partial).map((y) => ({ year: y.year, basis: y.kind, nnnPerSf: y.total, cam: y.cam, ins: y.ins, ret: y.ret }));
  const mixedNote = d.pots.office ? ` ${d.name} has separate retail and office recovery pools; this is the ${suite?.pot === "office" ? "office" : "retail"} pool.` : "";

  // No suite: the centre's NNN per SF, and the vacancies to quote.
  if (!suite) {
    const nnnPsf = Math.round(((pot.pools.cam + pot.pools.ins + pot.pools.ret) / pot.gla) * 100) / 100;
    return {
      property: `${d.code} · ${d.name}`, budgetYear: d.budgetYear, gla: pot.gla,
      nnnPerSfBeforeAdmin: nnnPsf, typicalAdminPct: pot.adminPct,
      perSf: { cam: Math.round((pot.pools.cam / pot.gla) * 100) / 100, ins: Math.round((pot.pools.ins / pot.gla) * 100) / 100, ret: Math.round((pot.pools.ret / pot.gla) * 100) / 100 },
      vacancies, trend: trend(pot.trend),
      note: `Estimated NNN per SF from the ${d.budgetYear} budget's recoverable expenses ÷ GLA, before the CAM admin fee.${mixedNote} Name a suite for its charges.`,
      link: "/financials/budgets/nnn-quote",
    };
  }

  const sqft = input.sqft && input.sqft > 0 ? input.sqft : suite.sqft;
  const rent = input.base_rent_psf != null ? input.base_rent_psf : !suite.vacant && suite.baseRentPsf != null ? suite.baseRentPsf : 0;
  const admin = input.admin_pct != null ? input.admin_pct : !suite.vacant && suite.adminPct != null ? suite.adminPct : pot.adminPct;
  const q = quoteNnn(pot.pools, pot.gla, sqft, rent, admin);
  if (!q) return { error: "Nothing to quote (no square footage)." };
  return {
    property: `${d.code} · ${d.name}`, suite: suite.suite, tenant: suite.vacant ? "Vacant" : suite.tenant, sqft, budgetYear: d.budgetYear,
    baseRentPsf: rent, baseRentSource: input.base_rent_psf != null ? "as asked" : !suite.vacant && suite.baseRentPsf != null ? "the tenant's current rent (rent roll)" : "none given — base rent left at $0; ask for the rent to quote",
    adminPct: admin, adminSource: input.admin_pct != null ? "as asked" : !suite.vacant && suite.adminPct != null ? "the tenant's lease (unit page CAM config)" : "the centre's typical lease",
    sharePct: Math.round(q.sharePct * 100) / 100,
    lines: q.lines.map((l) => ({ charge: l.label, perSfYear: l.psf, monthly: l.monthly, annual: l.annual })),
    nnn: { perSfYear: q.nnnPsf, monthly: q.nnnMonthly, annual: q.nnnAnnual },
    allIn: { perSfYear: q.allInPsf, monthly: q.allInMonthly, annual: q.allInAnnual },
    trend: trend(pot.trend),
    note: `Estimates: the suite's pro-rata share of the ${d.budgetYear} budget's recoverable CAM, insurance and real estate taxes, plus the CAM admin fee — the same figures as the NNN Quote page, which can print it as a PDF for the tenant.${mixedNote} A new lease's own terms (cap, exclusions, stipulated share) are not applied.`,
    link: "/financials/budgets/nnn-quote",
  };
}
