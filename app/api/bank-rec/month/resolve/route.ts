import { NextRequest, NextResponse } from "next/server";
import { setResolution } from "@/lib/bank-rec/store";
import { runMonth } from "@/lib/bank-rec/month";
import { budgetUser } from "@/lib/financials/budgets/currentUser";
import { USERS } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// POST { period, id, note } — clear an open item by hand (a voided check, a
// year-end entry reversed in Skyline), with the reason; { period, id, clear: true }
// puts it back. The month re-runs so the item leaves (or returns to) the list
// and stops (or resumes) carrying forward.
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const period = String(b?.period ?? ""), id = String(b?.id ?? "").replace(/~\d+$/, "");
  if (!/^\d{4}-\d{2}$/.test(period) || !id) return NextResponse.json({ error: "period and id are required" }, { status: 400 });
  const user = await budgetUser();
  const by = user ? USERS[user]?.label ?? user : null;
  if (b?.clear) await setResolution({ id, clear: true });
  else {
    const note = String(b?.note ?? "").trim();
    if (!note) return NextResponse.json({ error: "Say why it is cleared." }, { status: 400 });
    await setResolution({ id, note: note.slice(0, 500), by, at: new Date().toISOString() });
  }
  const run = await runMonth(period, by);
  return NextResponse.json({ ok: true, run });
}
