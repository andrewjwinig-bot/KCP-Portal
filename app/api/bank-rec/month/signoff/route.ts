import { NextRequest, NextResponse } from "next/server";
import { runFor, saveRun } from "@/lib/bank-rec/store";
import { budgetUser } from "@/lib/financials/budgets/currentUser";
import { USERS } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { period, signedOff: boolean } — sign the month off (it is then the
// record, and a later import cannot change it) or reopen it.
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const period = String(b?.period ?? "");
  const run = /^\d{4}-\d{2}$/.test(period) ? await runFor(period) : null;
  if (!run) return NextResponse.json({ error: "Run the month first." }, { status: 404 });
  const user = await budgetUser();
  run.signedOff = b?.signedOff ? { by: user ? USERS[user]?.label ?? user : null, at: new Date().toISOString() } : null;
  await saveRun(run);
  return NextResponse.json({ ok: true, run });
}
