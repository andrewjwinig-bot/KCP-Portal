import { NextResponse } from "next/server";
import { budgetUser } from "@/lib/financials/budgets/currentUser";
import { canSeePayroll } from "@/lib/financials/budgets/contributors";
import { getPayrollBudget, savePayrollBudget } from "@/lib/financials/budgets/payrollBudgetStore";
import { sanitizePayrollDoc } from "@/lib/financials/budgets/payrollBudget";
import { USERS } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// THE LIK PAYROLL BUDGET (`lib/financials/budgets/payrollBudget.ts`) —
// per-employee pay, benefits and allocation. Drew's and Alison's alone
// (`canSeePayroll`), refused to everyone else on BOTH verbs.
//   GET ?year=      → the doc (seeded from the year before when never saved)
//   PUT { doc }     → save the whole doc

const yearOf = (v: unknown) => {
  const y = Number(v);
  return Number.isInteger(y) && y >= 2020 && y <= 2100 ? y : null;
};

export async function GET(req: Request) {
  const user = await budgetUser();
  if (!canSeePayroll(user)) return NextResponse.json({ error: "The payroll budget is restricted." }, { status: 403 });
  const year = yearOf(new URL(req.url).searchParams.get("year")) ?? new Date().getFullYear() + 1;
  const { doc, seeded } = await getPayrollBudget(year);
  return NextResponse.json({ doc, seeded });
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
  return NextResponse.json({ ok: true, doc });
}
