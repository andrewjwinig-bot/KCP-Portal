import { NextResponse } from "next/server";
import { budgetUser } from "@/lib/financials/budgets/currentUser";
import { canSeePayroll } from "@/lib/financials/budgets/contributors";
import { getPayrollBudget, savePayrollBudget } from "@/lib/financials/budgets/payrollBudgetStore";
import { sanitizePayrollDoc, withRollSqft } from "@/lib/financials/budgets/payrollBudget";
import { rollSqft } from "@/lib/financials/budgets/payrollFlowLoad";
import { allocatePayroll } from "@/lib/financials/budgets/payrollBudget";
import { payrollFlowCheck, payrollTargetsOf } from "@/lib/financials/budgets/payrollFlow";
import { getMapping } from "@/lib/financials/operating-statements/mappingStore";
import { accountMatchesMask } from "@/lib/financials/operating-statements/mask";
import { EXPENSE_ROLES } from "@/lib/financials/operating-statements/types";
import { bookForProperty } from "@/lib/financials/budgets/books";
import { payrollContextFrom } from "@/lib/financials/budgets/payrollContext";
import { listBudgets } from "@/lib/financials/budgets/storage";
import { USERS } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// THE LIK PAYROLL BUDGET (`lib/financials/budgets/payrollBudget.ts`) —
// per-employee pay, benefits and allocation. Drew's and Alison's alone
// (`canSeePayroll`), refused to everyone else on BOTH verbs.
//   GET ?year=      → the doc (seeded from the year before when never saved),
//                     plus each building's budget context for Test a Raise
//   PUT { doc }     → save the whole doc

/** Where every allocation lands in the property budgets — the draft's own rule. */
async function flowOf(doc: Parameters<typeof allocatePayroll>[0]) {
  const targets = payrollTargetsOf(doc);
  const codes = [...new Set(targets.map((t) => t.code).filter((c): c is string => !!c))];
  const maps = Object.fromEntries(await Promise.all(codes.map(async (c) => [c, await getMapping(c).catch(() => null)] as const)));
  const rows = payrollFlowCheck(targets, (c) => (maps[c] as any) ?? null, (c) => !!bookForProperty(c), accountMatchesMask, new Set<string>(EXPENSE_ROLES));
  // Keyed by property|account, so the page re-reads the live amounts itself
  // as the doc is edited; only WHERE each lands comes from the server.
  return Object.fromEntries(rows.map((r) => [`${r.code ?? ""}|${r.gl}`, { line: r.line, problem: r.problem ?? null }]));
}

const yearOf = (v: unknown) => {
  const y = Number(v);
  return Number.isInteger(y) && y >= 2020 && y <= 2100 ? y : null;
};

export async function GET(req: Request) {
  const user = await budgetUser();
  if (!canSeePayroll(user)) return NextResponse.json({ error: "The payroll budget is restricted." }, { status: 403 });
  const year = yearOf(new URL(req.url).searchParams.get("year")) ?? new Date().getFullYear() + 1;
  const [{ doc, seeded }, workbooks, sqft] = await Promise.all([getPayrollBudget(year), listBudgets().catch(() => []), rollSqft()]);
  const withSqft = withRollSqft(doc, sqft);
  return NextResponse.json({ doc: withSqft, seeded, context: payrollContextFrom(workbooks, year), landing: await flowOf(withSqft) });
}

export async function PUT(req: Request) {
  const user = await budgetUser();
  if (!canSeePayroll(user)) return NextResponse.json({ error: "The payroll budget is restricted." }, { status: 403 });
  const body = await req.json().catch(() => null);
  const year = yearOf(body?.doc?.year);
  if (!year) return NextResponse.json({ error: "year is required" }, { status: 400 });
  const doc = sanitizePayrollDoc(body.doc, year);
  if (!doc) return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
  doc.updatedBy = USERS[user!]?.label ?? String(user);
  doc.updatedAt = new Date().toISOString();
  await savePayrollBudget(doc);
  return NextResponse.json({ ok: true, doc: withRollSqft(doc, await rollSqft()) });
}
