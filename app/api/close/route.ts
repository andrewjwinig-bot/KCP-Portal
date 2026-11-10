import { NextResponse } from "next/server";
import { buildMonthClose, defaultCloseMonth, setSignOff } from "@/lib/close/monthClose";
import { budgetUser } from "@/lib/financials/budgets/currentUser";
import { USERS } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

// GET ?month=YYYY-MM — the month-end close checklist (lib/close/monthClose.ts).
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("month");
  const month = q && MONTH_RE.test(q) ? q : defaultCloseMonth();
  try {
    return NextResponse.json(await buildMonthClose(month));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't build the close" }, { status: 500 });
  }
}

// POST { month, signedOff: boolean, flagsOpen?: number } — sign the month off,
// or reopen it. Refused while anything on the checklist is still open: the
// server re-reads every line rather than trusting the page. Flags to
// Investigate is the page's own count (its sweep is too slow to repeat here).
export async function POST(req: Request) {
  const b = await req.json().catch(() => null) as { month?: string; signedOff?: boolean; flagsOpen?: number } | null;
  if (!b?.month || !MONTH_RE.test(b.month)) return NextResponse.json({ error: "Pick a month" }, { status: 400 });
  const user = await budgetUser();
  if (b.signedOff) {
    const close = await buildMonthClose(b.month);
    if (close.left > 0 || (b.flagsOpen ?? 0) > 0) {
      return NextResponse.json({ error: `${close.left + (b.flagsOpen ?? 0)} items are still open` }, { status: 409 });
    }
    const label = user ? USERS[user]?.label ?? user : null;
    const name = label ? label.charAt(0) + label.slice(1).toLowerCase() : null;
    await setSignOff(b.month, { by: name, at: new Date().toISOString() });
  } else {
    await setSignOff(b.month, null);
  }
  return NextResponse.json(await buildMonthClose(b.month));
}
