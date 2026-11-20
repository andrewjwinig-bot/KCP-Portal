import { NextRequest, NextResponse } from "next/server";
import { checkTenantAccess } from "@/lib/cam/tenantLink/access";
import { publishedPeriodsForUnit } from "@/lib/statements/store";
import { instructionsFor } from "@/lib/statements/payment";
import { asOfLabel, periodLabel, statementCharges, summarize } from "@/lib/statements/summary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Public — the tenant's own monthly statements behind the signed link, newest
 *  first. Only published periods are served, and only this token's one unit. */
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const access = await checkTenantAccess(params.token, req);
  if (!access.ok) {
    return NextResponse.json({ error: access.error, ...(access.pinRequired ? { pinRequired: true } : {}) }, { status: access.status });
  }
  const { payload } = access;

  const found = await publishedPeriodsForUnit(payload.u);
  const payment = await instructionsFor(payload.p);

  return NextResponse.json({
    ok: true,
    payment,
    statements: found.map(({ period, statement, asOf }) => ({
      period,
      periodLabel: periodLabel(period),
      // The statement lists OPEN charges only — anything settled before this
      // date has already dropped off, so the date has to travel with it.
      asOf,
      asOfLabel: asOfLabel(asOf),
      unitRef: statement.unitRef,
      tenantName: statement.tenantName,
      suite: statement.suite,
      // A statement whose charges don't reconcile to Skyline is held back from
      // the tenant's balance headline — staff see the flag on the admin page.
      underReview: !statement.tiesOut,
      charges: statementCharges(statement),
      summary: summarize(statement, period),
    })),
  });
}
