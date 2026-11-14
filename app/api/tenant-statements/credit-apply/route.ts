import { NextRequest, NextResponse } from "next/server";
import { getRun } from "@/lib/statements/store";
import { planCreditApplication } from "@/lib/statements/openCredits";
import { deleteCreditApplication, saveCreditApplication } from "@/lib/statements/creditApplicationStore";
import { budgetUser } from "@/lib/financials/budgets/currentUser";
import { USERS } from "@/lib/users";
import { logAudit, auditIp } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// POST { period, unitRef, charges?: number[], preview?: true } — apply the
// tenant's open credit to those charges (every open one, oldest first, when
// omitted). Figures are recomputed from the stored statement; a preview saves
// nothing. Behind /tenant-statements by the middleware (and read-only users
// cannot POST at all).
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const period = String(b?.period ?? ""), unitRef = String(b?.unitRef ?? "").trim();
  const run = period ? await getRun(period) : null;
  const st = run?.statements.find((s) => s.unitRef.toUpperCase() === unitRef.toUpperCase()) ?? null;
  if (!st) return NextResponse.json({ error: "No statement for that tenant and month." }, { status: 404 });
  const chosen = Array.isArray(b?.charges) ? b.charges.map(Number).filter((n: number) => Number.isInteger(n) && n >= 0) : null;
  const plan = planCreditApplication(st, period, chosen);
  if (b?.preview) {
    // Every open charge, with its index into the stored statement — what the
    // apply dialog offers. Indexes are the STORED order, so the dialog never
    // has to guess them from the display order.
    const open = st.charges.map((c, idx) => ({ idx, dateISO: c.dateISO, description: c.description, amount: c.amount }))
      .filter((c) => c.amount > 0.005);
    return NextResponse.json({ ok: true, plan, open });
  }
  if (plan.applied < 0.005) return NextResponse.json({ error: "Nothing to apply — no open charges selected, or no credit." }, { status: 400 });
  const user = await budgetUser();
  const by = user ? USERS[user]?.label ?? user : null;
  await saveCreditApplication({ period, unitRef: st.unitRef, lines: plan.lines, applied: plan.applied, creditAtApply: plan.credit, by, at: new Date().toISOString() });
  await logAudit({ event: "tenant-statements.credit-apply", user: by, ip: auditIp(req), detail: `${period} · ${st.unitRef} · $${plan.applied.toFixed(2)}` });
  return NextResponse.json({ ok: true, plan });
}

// DELETE { period, unitRef } — undo a recorded application.
export async function DELETE(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const period = String(b?.period ?? ""), unitRef = String(b?.unitRef ?? "").trim();
  if (!period || !unitRef) return NextResponse.json({ error: "period and unitRef are required" }, { status: 400 });
  await deleteCreditApplication(period, unitRef);
  return NextResponse.json({ ok: true });
}
