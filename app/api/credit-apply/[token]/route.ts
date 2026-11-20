// A tenant's "apply my credit" link — PUBLIC (token-gated; middleware.ts).
// GET never applies anything: email security scanners open links, so a credit
// is applied only by the confirm page's POST.

import { NextRequest, NextResponse } from "next/server";
import { applyView, confirmApply, type ApplyView } from "@/lib/statements/reminderBatchStore";
import { creditApplySecret, verifyCreditApplyToken } from "@/lib/statements/creditApplyLink";
import { openAfterCredit } from "@/lib/statements/monthlyReminder";
import { itemCreditPlan } from "@/lib/statements/reminderBatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** What the page needs — never the email addresses on file. */
function shape(v: ApplyView) {
  if (v.state === "invalid") return { state: "invalid" as const };
  if (v.state === "closed") return { state: "closed" as const, tenantName: v.tenantName, deadline: v.deadline };
  const { item, batch, request } = v;
  const plan = request?.plan ?? itemCreditPlan(item)!;
  return {
    state: v.state, deadline: v.deadline, nextYM: batch.nextYM,
    tenantName: item.tenantName, propertyName: item.propertyName, propertyCode: item.propertyCode, suite: item.suite,
    plan, balanceAfter: Math.max(0, item.acct.net), stillOpen: openAfterCredit(item.acct, plan), charges: item.monthlyCharges,
    requestedAt: request?.requestedAt ?? null, confirmationSent: !!request?.tenantConfirmedAt,
  };
}

async function payload(token: string) {
  const secret = creditApplySecret();
  return secret ? verifyCreditApplyToken(token, secret) : null;
}

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const p = await payload(params.token);
  if (!p) return NextResponse.json({ state: "invalid" }, { status: 404 });
  return NextResponse.json(shape(await applyView(p.u, p.m)));
}

export async function POST(_req: NextRequest, { params }: { params: { token: string } }) {
  const p = await payload(params.token);
  if (!p) return NextResponse.json({ state: "invalid" }, { status: 404 });
  return NextResponse.json(shape(await confirmApply(p.u, p.m)));
}
